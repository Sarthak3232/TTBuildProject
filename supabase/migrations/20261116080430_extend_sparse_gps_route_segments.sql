-- Join fresh, consecutive fixes up to five minutes apart within an uninterrupted activity.
create or replace function public.ingest_route_points(
  p_user_id uuid, p_session_id uuid, p_revision bigint, p_points jsonb, p_gap boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  session public.activity_sessions;
  cursor_state private.route_cursors;
  previous public.route_points;
  existing public.route_points;
  item jsonb;
  seq bigint;
  captured timestamptz;
  latitude double precision;
  longitude double precision;
  accuracy double precision;
  now_at timestamptz := clock_timestamp();
  delta_m double precision;
  elapsed_s double precision;
  max_fix_gap_s constant integer := 300;
  reason text;
  accepted integer := 0;
  rejected integer := 0;
  duplicates integer := 0;
  reasons jsonb := '{}'::jsonb;
  saved jsonb := '[]'::jsonb;
  batch_gap boolean := coalesce(p_gap, false);
begin
  select * into session from public.activity_sessions where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if session.task_snapshot ->> 'kind' not in ('run', 'walk') then
    raise exception 'Only run/walk sessions accept GPS' using errcode = '22023';
  end if;
  if session.state <> 'running' or session.revision <> p_revision then
    raise exception 'Session is not running at this revision' using errcode = '40001';
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) > 100 then
    raise exception 'Expected at most 100 GPS fixes' using errcode = '22023';
  end if;
  insert into private.route_cursors(session_id, session_revision) values (p_session_id, session.revision)
    on conflict (session_id) do nothing;
  select * into cursor_state from private.route_cursors where session_id = p_session_id for update;
  if cursor_state.last_ingested_at is not null and now_at - cursor_state.last_ingested_at < interval '250 milliseconds' then
    raise exception 'GPS batches are arriving too quickly' using errcode = '54000';
  end if;
  cursor_state.last_ingested_at := now_at;
  cursor_state.pending_gap := cursor_state.pending_gap or cursor_state.session_revision <> session.revision
    or (batch_gap and jsonb_array_length(p_points) = 0);
  cursor_state.session_revision := session.revision;
  select * into previous from public.route_points where session_id = p_session_id order by sequence desc limit 1;
  for item in select value from jsonb_array_elements(p_points) loop
    reason := null;
    begin
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'sequence') is distinct from 'number'
        or jsonb_typeof(item -> 'lat') is distinct from 'number'
        or jsonb_typeof(item -> 'lng') is distinct from 'number'
        or jsonb_typeof(item -> 'accuracyM') is distinct from 'number'
        or jsonb_typeof(item -> 'capturedAt') is distinct from 'string'
        or (item ->> 'sequence')::numeric <> trunc((item ->> 'sequence')::numeric) then
        raise invalid_text_representation;
      end if;
      seq := (item ->> 'sequence')::bigint;
      captured := (item ->> 'capturedAt')::timestamptz;
      latitude := (item ->> 'lat')::double precision;
      longitude := (item ->> 'lng')::double precision;
      accuracy := (item ->> 'accuracyM')::double precision;
    exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range or datetime_field_overflow then
      rejected := rejected + 1;
      reasons := jsonb_set(reasons, '{malformed}', to_jsonb(coalesce((reasons ->> 'malformed')::integer, 0) + 1));
      cursor_state.pending_gap := true;
      continue;
    end;
    if seq < 0 or seq > 9007199254740991 then reason := 'sequence';
    elsif seq <= cursor_state.last_sequence then
      select * into existing from public.route_points where session_id = p_session_id and sequence = seq;
      if found and row(existing.captured_at, existing.lat, existing.lng, existing.accuracy_m)
        is not distinct from row(captured, latitude, longitude, accuracy) then
        duplicates := duplicates + 1;
        continue;
      end if;
      reason := 'sequence';
    else
      cursor_state.pending_gap := cursor_state.pending_gap or batch_gap or seq <> cursor_state.last_sequence + 1;
      batch_gap := false;
      cursor_state.last_sequence := seq;
      if not (latitude between -90 and 90 and longitude between -180 and 180) then reason := 'coordinates';
      elsif not (accuracy between 0 and 50) then reason := 'accuracy';
      elsif captured > now_at or captured < now_at - interval '15 seconds'
        or captured < session.active_since
        or (cursor_state.last_captured_at is not null and captured <= cursor_state.last_captured_at) then reason := 'timestamp';
      elsif cursor_state.point_count >= 25000 then reason := 'capacity';
      else
        elapsed_s := extract(epoch from (captured - previous.captured_at));
        if previous.session_id is not null and not cursor_state.pending_gap and elapsed_s <= max_fix_gap_s
          and private.route_distance(previous.lat, previous.lng, latitude, longitude) / elapsed_s > 12 then reason := 'jump';
        end if;
      end if;
    end if;
    if reason is not null then
      rejected := rejected + 1;
      reasons := jsonb_set(reasons, array[reason], to_jsonb(coalesce((reasons ->> reason)::integer, 0) + 1));
      cursor_state.pending_gap := true;
      continue;
    end if;
    delta_m := 0;
    if cursor_state.pending_gap or previous.session_id is null or elapsed_s > max_fix_gap_s then
      cursor_state.segment_id := cursor_state.segment_id + 1;
      cursor_state.anchor_lat := latitude;
      cursor_state.anchor_lng := longitude;
      cursor_state.anchor_accuracy_m := accuracy;
    else
      -- Keep the distance anchor until movement clears a bounded uncertainty radius.
      -- This avoids adding stationary jitter while retaining slow walking progress.
      delta_m := private.route_distance(cursor_state.anchor_lat, cursor_state.anchor_lng, latitude, longitude);
      if delta_m < greatest(3, least(10, (cursor_state.anchor_accuracy_m + accuracy) / 2)) then delta_m := 0;
      else
        cursor_state.anchor_lat := latitude;
        cursor_state.anchor_lng := longitude;
        cursor_state.anchor_accuracy_m := accuracy;
      end if;
    end if;
    insert into public.route_points(user_id, session_id, sequence, segment_id, captured_at, received_at, lat, lng, accuracy_m, distance_delta_m)
      values (p_user_id, p_session_id, seq, cursor_state.segment_id, captured, now_at, latitude, longitude, accuracy, delta_m)
      returning * into previous;
    saved := saved || jsonb_build_array(jsonb_build_object('sequence', seq, 'segmentId', cursor_state.segment_id,
      'capturedAt', captured, 'lat', latitude, 'lng', longitude, 'accuracyM', accuracy));
    accepted := accepted + 1;
    cursor_state.point_count := cursor_state.point_count + 1;
    cursor_state.last_captured_at := captured;
    cursor_state.distance_m := cursor_state.distance_m + delta_m;
    cursor_state.pending_gap := false;
  end loop;
  update private.route_cursors set
    last_sequence = cursor_state.last_sequence, last_captured_at = cursor_state.last_captured_at,
    session_revision = cursor_state.session_revision, pending_gap = cursor_state.pending_gap,
    segment_id = cursor_state.segment_id, point_count = cursor_state.point_count,
    anchor_lat = cursor_state.anchor_lat, anchor_lng = cursor_state.anchor_lng,
    anchor_accuracy_m = cursor_state.anchor_accuracy_m, distance_m = cursor_state.distance_m,
    last_ingested_at = cursor_state.last_ingested_at
    where session_id = p_session_id;
  return jsonb_build_object('accepted', accepted, 'rejected', rejected, 'duplicates', duplicates,
    'reasons', reasons, 'points', saved, 'distanceM', cursor_state.distance_m,
    'nextSequence', cursor_state.last_sequence + 1, 'serverTime', now_at,
    'coverage', jsonb_build_object('pointCount', cursor_state.point_count,
      'segmentCount', cursor_state.segment_id + 1, 'lastCapturedAt', cursor_state.last_captured_at));
end;
$$;
