"""Apply and verify migrations on an EMPTY isolated loopback PostgreSQL database.

Requires PostgreSQL 17 with contrib extensions and psql on PATH (or PSQL).
Does not create, reset, drop, or connect to a hosted database.
"""

import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlsplit


db_url = sys.argv[1] if len(sys.argv) == 2 else os.environ.get("TEST_DATABASE_URL", "")
target = urlsplit(db_url)
if target.hostname not in {"127.0.0.1", "localhost", "::1"} or not target.path.lstrip("/").startswith("slotty_test"):
    raise SystemExit("Use an empty, isolated loopback database named slotty_test*; hosted URLs are refused.")
psql = os.environ.get("PSQL") or shutil.which("psql")
if not psql:
    candidate = Path("/opt/homebrew/opt/postgresql@17/bin/psql")
    psql = str(candidate) if candidate.exists() else None
if not psql:
    raise SystemExit("Install PostgreSQL client tools or set PSQL.")
root = Path(__file__).resolve().parents[1]


def execute(path):
    print("Checking", path.relative_to(root), flush=True)
    subprocess.run([psql, db_url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(path)], check=True)


# Fail safely if this is not empty. Do not reset somebody's existing dataset.
check = subprocess.run(
    [psql, db_url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
     "select count(*) from pg_tables where schemaname in ('public','auth');"],
    check=True, text=True, capture_output=True,
)
if check.stdout.strip() != "0":
    raise SystemExit("Database is not empty. Create a fresh isolated database; this script never resets it.")

execute(root / "supabase/tests/bootstrap-local.sql")
for migration in sorted((root / "supabase/migrations").glob("*.sql")):
    execute(migration)
for fixture in sorted((root / "supabase/tests").glob("*.sql")):
    if fixture.name not in {"bootstrap-local.sql", "setup.sql"}:
        execute(fixture)
subprocess.run([sys.executable, str(root / "scripts/test-concurrency.py"), db_url], check=True)
print("PASS: fresh migration chain, SQL fixtures and concurrent transactions")
