-- Run against a migrated database as postgres. All fixtures are rolled back.
-- These are database checks, not application/auth integration or token-crediting code.
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  task_a uuid := gen_random_uuid();
  task_b uuid := gen_random_uuid();
  session_a uuid := gen_random_uuid();
  session_b uuid := gen_random_uuid();
  completion_a uuid := gen_random_uuid();
  completion_b uuid := gen_random_uuid();
  goal_a uuid := gen_random_uuid();
  goal_b uuid := gen_random_uuid();
  affected integer;
  table_name text;
  snapshot jsonb := '{"kind":"custom","name":"Schema fixture","minimum_ms":1800000}';
begin
  foreach table_name in array array[
    'profiles', 'tokenBalance', 'task_definitions', 'activity_sessions', 'session_intervals',
    'completions', 'token_entries', 'idempotency_records', 'goal_schedules', 'goal_occurrences'
  ] loop
    assert exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ), 'Expected table with RLS: ' || table_name;
  end loop;

  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or (has_function_privilege('authenticated', p.oid, 'EXECUTE') and not (
          n.nspname = 'private' and p.proname in (
            'my_app_mutate', 'my_app_snapshot', 'my_app_history', 'my_app_calendar',
            'my_ingest_route_points', 'my_read_session_route')
        )))
  ), 'Browser roles can execute a privileged database helper';

  insert into auth.users(id, email, aud, role, raw_user_meta_data) values
    (user_a, user_a::text || '@schema-fixture.invalid', 'authenticated', 'authenticated',
      '{"display_name":"Schema A","timezone":"UTC","balance":999,"role":"admin"}'),
    (user_b, user_b::text || '@schema-fixture.invalid', 'authenticated', 'authenticated',
      '{"display_name":"Schema B","timezone":"invalid/timezone"}');
  assert (select balance = 0 from public."tokenBalance" where user_id = user_a),
    'Signup must create a zero balance regardless of metadata';
  assert (select count(*) = 3 from public.task_definitions where user_id = user_a),
    'Signup must seed study/run/walk definitions';
  assert (select timezone = 'UTC' from public.profiles where user_id = user_b),
    'Invalid signup timezone metadata must use the safe default';

  insert into public.task_definitions(id, user_id, kind, name, minimum_ms) values
    (task_a, user_a, 'custom', 'Schema fixture', 1800000),
    (task_b, user_b, 'custom', 'Schema fixture', 1800000);
  begin
    insert into public.task_definitions(user_id, kind, name)
      values (user_a, 'custom', 'Missing minimum');
    raise exception 'Missing custom minimum was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.task_definitions(user_id, kind, name, minimum_ms)
      values (user_a, 'custom', 'Short minimum', 1799999);
    raise exception 'Below-30-minute minimum was accepted';
  exception when check_violation then null; end;

  insert into public.activity_sessions(id, user_id, task_id, task_snapshot, state,
    accumulated_ms, eligible_ms) values
    (session_a, user_a, task_a, snapshot, 'completed', 1800000, 1800000),
    (session_b, user_b, task_b, snapshot, 'completed', 1800000, 1800000);
  begin
    insert into public.activity_sessions(user_id, task_id, task_snapshot)
      values (user_a, task_b, snapshot);
    raise exception 'Cross-owner session/task link was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.activity_sessions(user_id, task_id, task_snapshot)
      values (user_a, task_a, '{"kind":"study"}');
    raise exception 'Custom task disguised as study was accepted';
  exception when check_violation then null; end;

  insert into public.activity_sessions(user_id, task_id, task_snapshot)
    values (user_a, task_a, snapshot);
  begin
    insert into public.activity_sessions(user_id, task_id, task_snapshot, state)
      values (user_a, task_a, snapshot, 'paused');
    raise exception 'Second unfinished session was accepted';
  exception when unique_violation then null; end;

  insert into public.session_intervals(user_id, session_id, sequence, kind, start_at, end_at,
    eligibility) values
    (user_a, session_a, 0, 'timer', '2026-11-01T10:00:00Z', '2026-11-01T10:30:00Z', true),
    (user_b, session_b, 0, 'timer', '2026-11-01T10:00:00Z', '2026-11-01T10:30:00Z', true);
  begin
    insert into public.session_intervals(user_id, session_id, sequence, kind, start_at, end_at)
      values (user_a, session_a, 1, 'timer', '2026-11-01T10:15:00Z', '2026-11-01T10:45:00Z');
    raise exception 'Overlapping session intervals were accepted';
  exception when exclusion_violation then null; end;

  begin
    insert into public.completions(user_id, session_id, task_snapshot, eligible_ms, token_award)
      values (user_a, session_a, snapshot, 1799999, 0);
    raise exception 'Custom completion below selected minimum was accepted';
  exception when check_violation then null; end;
  insert into public.completions(id, user_id, session_id, task_snapshot, eligible_ms, token_award)
    values (completion_a, user_a, session_a, snapshot, 1800000, 1),
      (completion_b, user_b, session_b, snapshot, 1800000, 1);
  begin
    insert into public.completions(user_id, session_id, task_snapshot, eligible_ms, token_award)
      values (user_a, session_a, snapshot, 1800000, 1);
    raise exception 'Duplicate completion was accepted';
  exception when unique_violation then null; end;
  insert into public.token_entries(user_id, completion_id, delta, resulting_balance)
    values (user_a, completion_a, 1, 1), (user_b, completion_b, 1, 1);
  begin
    insert into public.token_entries(user_id, completion_id, delta, resulting_balance)
      values (user_a, completion_a, 1, 1);
    raise exception 'Duplicate earning entry was accepted';
  exception when unique_violation then null; end;
  begin
    update public.completions set description = 'Rewrite history' where id = completion_a;
    raise exception 'Historical completion update was accepted';
  exception when check_violation then null; end;

  insert into public.goal_schedules(id, user_id, task_id, target_ms, repeat_kind, weekdays,
    timezone, effective_from) values
    (goal_a, user_a, task_a, 1800000, 'weekdays', array[1,3,5]::smallint[], 'UTC', '2026-11-01'),
    (goal_b, user_b, task_b, 1800000, 'daily', null, 'UTC', '2026-11-01');
  begin
    insert into public.goal_schedules(user_id, task_id, target_ms, repeat_kind, weekdays,
      timezone, effective_from)
      values (user_a, task_a, 1800000, 'weekdays', array[1,1]::smallint[], 'UTC', '2026-11-01');
    raise exception 'Duplicate weekdays were accepted';
  exception when check_violation then null; end;
  begin
    insert into public.goal_schedules(user_id, task_id, target_ms, repeat_kind, weekdays,
      timezone, effective_from)
      values (user_a, task_a, 1800000, 'weekdays', array[]::smallint[], 'UTC', '2026-11-01');
    raise exception 'Empty weekdays were accepted';
  exception when check_violation then null; end;
  insert into public.goal_occurrences(user_id, schedule_id, local_date, target_snapshot, timezone)
    values (user_a, goal_a, '2026-11-02', 1800000, 'UTC'),
      (user_b, goal_b, '2026-11-02', 1800000, 'UTC');
  begin
    insert into public.goal_occurrences(user_id, schedule_id, local_date, target_snapshot, timezone)
      values (user_a, goal_a, '2026-11-02', 1800000, 'UTC');
    raise exception 'Duplicate goal occurrence was accepted';
  exception when unique_violation then null; end;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert (select count(*) = 1 from public.profiles), 'Profiles leaked across accounts';
  assert (select count(*) = 1 from public."tokenBalance"), 'Balances leaked across accounts';
  assert (select count(*) = 4 from public.task_definitions), 'Tasks leaked across accounts';
  assert (select count(*) = 2 from public.activity_sessions), 'Sessions leaked across accounts';
  assert (select count(*) = 1 from public.session_intervals), 'Intervals leaked across accounts';
  assert (select count(*) = 1 from public.completions), 'Completions leaked across accounts';
  assert (select count(*) = 1 from public.token_entries), 'Earning entries leaked across accounts';
  assert (select count(*) = 1 from public.goal_schedules), 'Goal schedules leaked across accounts';
  assert (select count(*) = 1 from public.goal_occurrences), 'Goal occurrences leaked across accounts';
  begin
    update public."tokenBalance" set balance = 999 where user_id = user_a;
    raise exception 'Browser role changed token balance';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.completions where user_id = user_a;
    raise exception 'Browser role deleted completion history';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.idempotency_records;
    raise exception 'Browser role read private idempotency records';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.task_definitions(user_id, kind, name, minimum_ms)
      values (user_b, 'custom', 'Forged owner', 1800000);
    raise exception 'Browser role created another account task';
  exception when insufficient_privilege then null; end;
  update public.profiles set display_name = 'Own profile update' where user_id = user_a;
  get diagnostics affected = row_count;
  assert affected = 1, 'Owner could not update own display name';
  update public.task_definitions set name = 'Changed predefined' where kind = 'study';
  get diagnostics affected = row_count;
  assert affected = 0, 'Owner changed a predefined task';
  begin
    update public.goal_schedules set target_ms = 3600000 where id = goal_a;
    raise exception 'Browser role bypassed effective-dated goal mutation';
  exception when insufficient_privilege then null; end;
  assert (select target_snapshot = 1800000 from public.goal_occurrences where schedule_id = goal_a),
    'Editing a schedule changed its historical target';
  reset role;

  set local role anon;
  begin
    perform * from public.profiles;
    raise exception 'Anonymous role read private profiles';
  exception when insufficient_privilege then null; end;
  reset role;
end;
$$;
select 'PASS: schema, provisioning, ownership and core constraints; fixtures rolled back' as result;
rollback;
