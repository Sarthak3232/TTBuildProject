-- Exercise the same roles and RPCs used by PostgREST, with disposable accounts.
begin;
set local plpgsql.check_asserts = on;

do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  walk_id uuid;
  other_walk_id uuid;
  activity_id uuid;
  task_id uuid;
  request_key uuid := gen_random_uuid();
  stake jsonb := '{"allocations":[0,1,0,0]}';
  result jsonb;
  fixture_start timestamptz := clock_timestamp() - interval '30 minutes 1 second';
begin
  insert into auth.users(id, email, aud, role) values
    (owner_id, owner_id || '@session-test.invalid', 'authenticated', 'authenticated'),
    (other_id, other_id || '@session-test.invalid', 'authenticated', 'authenticated');
  select id into walk_id from public.task_definitions where user_id = owner_id and kind = 'walk';
  select id into other_walk_id from public.task_definitions where user_id = other_id and kind = 'walk';

  set local role anon;
  begin
    perform public.my_app_snapshot();
    raise exception 'Anonymous snapshot succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.my_app_mutate('roll', request_key, stake);
    raise exception 'Anonymous mutation succeeded';
  exception when insufficient_privilege then null;
  end;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.my_app_snapshot();
    raise exception 'Snapshot without a user claim succeeded';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  assert (public.my_app_snapshot() ->> 'balance')::integer = 0, 'New account sees its own balance';
  assert not exists (select 1 from public.task_definitions where user_id = other_id),
    'RLS hides the other account from table reads';
  begin
    update public."tokenBalance" set balance = 999 where user_id = owner_id;
    raise exception 'Direct balance update succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.app_mutate(other_id, 'roll', request_key, stake);
    raise exception 'Raw owner-selected RPC succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.my_app_mutate('session.start', request_key, jsonb_build_object('taskId', other_walk_id));
    raise exception 'Cross-account session start succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.my_app_mutate('roll', request_key, stake || '{"winSample":0,"slotSample":0}');
    raise exception 'User-provided randomness was accepted';
  exception when invalid_parameter_value then null;
  end;

  result := public.my_app_mutate('task.save', gen_random_uuid(), '{"name":"Reading","minimumMs":1800000}');
  task_id := (result #>> '{task,id}')::uuid;
  perform public.my_app_mutate('goal.save', gen_random_uuid(),
    jsonb_build_object('taskId', task_id, 'targetMs', 1800000, 'repeatKind', 'daily'));
  assert jsonb_array_length(public.my_app_snapshot() -> 'goals') = 1, 'Snapshot projects the saved goal';
  result := public.my_app_mutate('session.start', gen_random_uuid(), jsonb_build_object('taskId', walk_id));
  activity_id := (result #>> '{activity,id}')::uuid;
  result := public.my_ingest_route_points(activity_id, 0, jsonb_build_array(jsonb_build_object(
    'sequence', 0, 'capturedAt', clock_timestamp(), 'lat', 32, 'lng', -117, 'accuracyM', 5)), false);
  assert (result ->> 'accepted')::integer = 1, 'The owner can save a GPS point';

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  begin
    perform public.my_read_session_route(activity_id);
    raise exception 'Cross-account route read succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.my_ingest_route_points(activity_id, 0, '[]', false);
    raise exception 'Cross-account GPS write succeeded';
  exception when no_data_found then null;
  end;
  begin
    perform public.my_app_mutate('session.control', gen_random_uuid(),
      jsonb_build_object('id', activity_id, 'revision', 0, 'action', 'complete'));
    raise exception 'Cross-account completion succeeded';
  exception when no_data_found then null;
  end;

  reset role;
  update public.activity_sessions set active_since = fixture_start, started_at = fixture_start where id = activity_id;
  update public.session_intervals set start_at = fixture_start where session_intervals.session_id = activity_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  begin
    perform public.my_app_mutate('session.control', gen_random_uuid(),
      jsonb_build_object('id', activity_id, 'action', 'complete'));
    raise exception 'Missing revision was accepted';
  exception when invalid_parameter_value then null;
  end;
  result := public.my_app_mutate('session.control', gen_random_uuid(),
    jsonb_build_object('id', activity_id, 'revision', 0, 'action', 'complete'));
  assert (result #>> '{completion,tokenAward}')::integer = 1, 'Completion credits measured time';
  assert (public.my_read_session_route(activity_id) #>> '{coverage,pointCount}')::integer = 1,
    'The owner can read a saved route';
  assert (public.my_app_history('all', null, null, 25) ->> 'totalCount')::integer = 1,
    'History includes the completed activity';
  assert jsonb_array_length(public.my_app_calendar((clock_timestamp() at time zone 'UTC')::date)) = 1, 'Calendar includes the activity';

  result := public.my_app_mutate('roll', request_key, stake);
  assert (result #>> '{roll,balance}')::integer = 0, 'Roll charges the full stake';
  assert result = public.my_app_mutate('roll', request_key, stake), 'Retry returns the same result';
  assert result #>> '{roll,slot}' is null or (result #>> '{roll,slot}')::integer = 2,
    'Only the funded slot can win';
  assert (select count(*) from public.token_entries where roll_id is not null) = 1, 'One debit';
  assert (select count(*) from public.rolls) = 1, 'One roll';

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  assert (public.my_app_history('all', null, null, 25) ->> 'totalCount')::integer = 0, 'Other history is empty';
  assert (select count(*) from public.rolls) = 0, 'RLS hides the other account rolls';
  assert (select count(*) from public.token_entries) = 0, 'RLS hides the other account ledger';
  reset role;
end;
$$;

rollback;
