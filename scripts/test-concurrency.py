"""Exercise real PostgreSQL contention on an explicitly local fixture database.

Usage: python3 scripts/test-concurrency.py postgresql://postgres@127.0.0.1:55432/slotty_test
The fixture uses database-admin time setup only; no runtime clock/grant/RNG endpoint exists.
"""

import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlsplit
import uuid


db_url = sys.argv[1] if len(sys.argv) == 2 else ""
target = urlsplit(db_url)
if target.hostname not in {"127.0.0.1", "localhost", "::1"} or not target.path.lstrip("/").startswith("slotty_test"):
    raise SystemExit("Use an isolated loopback database named slotty_test*; hosted URLs are refused.")
psql = os.environ.get("PSQL") or shutil.which("psql")
if not psql:
    candidate = Path("/opt/homebrew/opt/postgresql@17/bin/psql")
    psql = str(candidate) if candidate.exists() else None
if not psql:
    raise SystemExit("Install PostgreSQL client tools or set PSQL to their executable.")


def sql(query):
    result = subprocess.run(
        [psql, db_url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def mutate(user, operation, key, payload):
    return json.loads(sql(
        "select public.app_mutate(" + ",".join([
            literal(user) + "::uuid", literal(operation), literal(key) + "::uuid",
            literal(json.dumps(payload)) + "::jsonb",
        ]) + ");"
    ))


def together(calls):
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(call) for call in calls]
        values, failures = [], []
        for future in futures:
            try:
                values.append(future.result())
            except RuntimeError as error:
                failures.append(str(error))
        return values, failures


user_a, user_b = str(uuid.uuid4()), str(uuid.uuid4())
try:
    sql("insert into auth.users(id,email,aud,role,raw_user_meta_data) values " + ",".join(
        "(" + literal(user) + "::uuid," + literal(user + "@concurrency-fixture.invalid")
        + ",'authenticated','authenticated','{}'::jsonb)" for user in [user_a, user_b]
    ) + ";")
    task = sql("select id from public.task_definitions where user_id=" + literal(user_a) + "::uuid and kind='run';")
    starts, conflicts = together([
        lambda: mutate(user_a, "session.start", str(uuid.uuid4()), {"taskId": task}),
        lambda: mutate(user_a, "session.start", str(uuid.uuid4()), {"taskId": task}),
    ])
    assert len(starts) == 1 and len(conflicts) == 1, (starts, conflicts)
    session = starts[0]["activity"]
    session_id = session["id"]
    # Test-only administrator setup simulates elapsed time without adding production bypasses.
    sql("begin; update public.activity_sessions set active_since=clock_timestamp()-interval '30 minutes',"
        "started_at=clock_timestamp()-interval '30 minutes' where id=" + literal(session_id) + "::uuid; "
        "update public.session_intervals set start_at=clock_timestamp()-interval '30 minutes' "
        "where session_id=" + literal(session_id) + "::uuid; commit;")
    completion_key = str(uuid.uuid4())
    complete_payload = {"id": session_id, "revision": session["revision"], "action": "complete"}
    completions, errors = together([
        lambda: mutate(user_a, "session.control", completion_key, complete_payload),
        lambda: mutate(user_a, "session.control", completion_key, complete_payload),
    ])
    assert not errors and len(completions) == 2 and completions[0] == completions[1], (completions, errors)
    assert completions[0]["completion"]["tokenAward"] == 1
    assert sql('select balance from public."tokenBalance" where user_id=' + literal(user_a) + '::uuid;') == "1"
    assert sql("select count(*) from public.token_entries where user_id=" + literal(user_a) + "::uuid and completion_id is not null;") == "1"

    rolls, overspends = together([
        lambda: mutate(user_a, "roll", str(uuid.uuid4()), {"allocations": [1, 0, 0, 0], "winSample": 0, "slotSample": 0}),
        lambda: mutate(user_a, "roll", str(uuid.uuid4()), {"allocations": [1, 0, 0, 0], "winSample": 999999, "slotSample": None}),
    ])
    assert len(rolls) == 1 and len(overspends) == 1, (rolls, overspends)
    assert sql('select balance from public."tokenBalance" where user_id=' + literal(user_a) + '::uuid;') == "0"
    assert sql("select count(*) from public.token_entries where user_id=" + literal(user_a) + "::uuid and roll_id is not null;") == "1"
    assert sql("select count(*) from public.rolls where user_id=" + literal(user_a) + "::uuid;") == "1"
    # Direct browser roles cannot execute trusted mutation functions or see another account.
    visible = sql("begin; set local role authenticated; select set_config('request.jwt.claim.sub',"
                  + literal(user_b) + ",true); select count(*) from public.rolls; rollback;")
    assert visible.splitlines()[-1] == "0", visible
    assert sql("select has_function_privilege('authenticated','public.app_mutate(uuid,text,uuid,jsonb)','execute');") == "f"
    print("PASS: simultaneous starts, duplicate completion, concurrent spend, wallet/ledger integrity and account isolation")
finally:
    sql("delete from auth.users where id in(" + literal(user_a) + "::uuid," + literal(user_b) + "::uuid);")
