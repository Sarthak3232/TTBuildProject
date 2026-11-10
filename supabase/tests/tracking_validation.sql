-- Run with psql -v ON_ERROR_STOP=1 against migrated local Supabase/Postgres.
-- All fixtures and clock adjustments are rolled back. No hosted user data is touched.
begin;
create function pg_temp.check_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'GPS assertion failed: %', label; end if; end $$;
create function pg_temp.fix(seq bigint, captured timestamptz, latitude double precision default 0, longitude double precision default 0, accuracy double precision default 5)
returns jsonb language sql as $$ select jsonb_build_object('sequence',seq,'capturedAt',captured,'lat',latitude,'lng',longitude,'accuracyM',accuracy) $$;
insert into auth.users(id,email) values
 ('90000000-0000-4000-8000-000000000001','gps-owner@example.test'),
 ('90000000-0000-4000-8000-000000000002','gps-other@example.test');
do $$
<<tracking_validation>>
declare
 owner_id uuid := '90000000-0000-4000-8000-000000000001';
 other_id uuid := '90000000-0000-4000-8000-000000000002';
 task_id uuid; session_id uuid; result jsonb; batch jsonb; measured double precision; revision bigint; old_time timestamptz;
begin
 select id into task_id from public.task_definitions where user_id=owner_id and kind='walk';
 result := public.app_mutate(owner_id,'session.start',gen_random_uuid(),jsonb_build_object('taskId',task_id));
 session_id := (result #>> '{activity,id}')::uuid;
 -- Advance only this test fixture's server-owned interval to exercise completion rewards.
 update public.activity_sessions set active_since=clock_timestamp()-interval '30 minutes', started_at=clock_timestamp()-interval '30 minutes' where id=session_id;
 update public.session_intervals set start_at=clock_timestamp()-interval '30 minutes' where session_intervals.session_id=tracking_validation.session_id;
 batch := jsonb_build_array(pg_temp.fix(0,clock_timestamp()-interval '12 seconds',0,0),pg_temp.fix(1,clock_timestamp()-interval '7 seconds',0,0.00005),pg_temp.fix(2,clock_timestamp()-interval '2 seconds',0,0.0001));
 result := public.ingest_route_points(owner_id,session_id,0,batch,false);
 perform pg_temp.check_true((result->>'accepted')::int=3,'three valid fixes accepted');
 measured := (result->>'distanceM')::double precision;
 perform pg_temp.check_true(abs(measured-11.119508)<0.01,'known equatorial distance matches');
 perform pg_temp.check_true((result #>> '{coverage,segmentCount}')::int=1,'continuous fixes share one segment');
 -- Rate limit uses database time, and retries cannot repeatedly add distance.
 begin perform public.ingest_route_points(owner_id,session_id,0,batch,false); raise exception 'rate limit not enforced'; exception when program_limit_exceeded then null; end;
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,batch,true);
 perform pg_temp.check_true((result->>'duplicates')::int=3 and (result->>'distanceM')::double precision=measured,'identical replay is idempotent');
 perform pg_temp.check_true((result #>> '{coverage,segmentCount}')::int=1,'duplicate gap replay does not create segments');
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,jsonb_build_array(pg_temp.fix(3,clock_timestamp()-interval '1 second',0,1)),false);
 perform pg_temp.check_true((result #>> '{reasons,jump}')::int=1,'impossible speed is rejected');
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,jsonb_build_array(
  pg_temp.fix(4,clock_timestamp()-interval '3 seconds'),
  pg_temp.fix(5,clock_timestamp()-interval '1 second',0,0,51),
  jsonb_build_object('sequence',6,'capturedAt','not-a-date','lat',0,'lng',0,'accuracyM',5),
  pg_temp.fix(7,clock_timestamp()-interval '1 second',91,0),
  pg_temp.fix(8,clock_timestamp()-interval '20 seconds'),
  pg_temp.fix(9,clock_timestamp()+interval '20 seconds')
 ),false);
 perform pg_temp.check_true((result->>'rejected')::int=6,'monotonic timestamp, accuracy, malformed date, bounds, stale/future fixes excluded');
 perform pg_temp.check_true((result->>'distanceM')::double precision=measured,'invalid fixes never add distance');
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,jsonb_build_array(pg_temp.fix(10,clock_timestamp()-interval '500 milliseconds',0,0.0002)),false);
 perform pg_temp.check_true((result #>> '{coverage,segmentCount}')::int=2 and (result->>'distanceM')::double precision=measured,'bad-fix gap creates a disconnected segment');
 -- Standing still does not fabricate distance or change the running timer state.
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,jsonb_build_array(pg_temp.fix(11,clock_timestamp()-interval '250 milliseconds',0,0.000201)),false);
 perform pg_temp.check_true((result->>'distanceM')::double precision=measured,'stationary jitter contributes no distance');
 perform pg_temp.check_true((select state='running' from public.activity_sessions where id=session_id),'GPS never auto-pauses server timer');
 -- Long coverage gaps are not joined, even within a running interval.
 update public.route_points set captured_at=clock_timestamp()-interval '25 seconds' where route_points.session_id=tracking_validation.session_id and sequence=11;
 update private.route_cursors set last_captured_at=clock_timestamp()-interval '25 seconds',last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,0,jsonb_build_array(pg_temp.fix(12,clock_timestamp()-interval '100 milliseconds',0,0.001)),false);
 perform pg_temp.check_true((result #>> '{coverage,segmentCount}')::int=3 and (result->>'distanceM')::double precision=measured,'outage creates gap with zero bridging distance');
 begin perform public.read_session_route(other_id,session_id); raise exception 'cross owner read allowed'; exception when no_data_found then null; end;
 begin perform public.ingest_route_points(other_id,session_id,0,'[]',false); raise exception 'cross owner write allowed'; exception when no_data_found then null; end;
 begin perform public.ingest_route_points(owner_id,session_id,0,(select jsonb_agg(pg_temp.fix(n,clock_timestamp())) from generate_series(0,100)n),false); raise exception 'oversized batch allowed'; exception when invalid_parameter_value then null; end;
 old_time := clock_timestamp()-interval '100 milliseconds';
 result := public.app_mutate(owner_id,'session.control',gen_random_uuid(),jsonb_build_object('id',session_id,'revision',0,'action','pause'));
 begin perform public.ingest_route_points(owner_id,session_id,1,'[]',false); raise exception 'paused points allowed'; exception when serialization_failure then null; end;
 result := public.app_mutate(owner_id,'session.control',gen_random_uuid(),jsonb_build_object('id',session_id,'revision',1,'action','resume'));
 begin perform public.ingest_route_points(owner_id,session_id,0,'[]',false); raise exception 'stale revision allowed'; exception when serialization_failure then null; end;
 update private.route_cursors set last_ingested_at=null where route_cursors.session_id=tracking_validation.session_id;
 result := public.ingest_route_points(owner_id,session_id,2,jsonb_build_array(pg_temp.fix(13,old_time),pg_temp.fix(14,clock_timestamp(),0,0.002)),false);
 perform pg_temp.check_true((result->>'rejected')::int=1 and (result->>'accepted')::int=1,'pre-pause delayed fix excluded after resume');
 perform pg_temp.check_true((result #>> '{coverage,segmentCount}')::int=4 and (result->>'distanceM')::double precision=measured,'manual pause/resume never bridges paused movement');
 result := public.app_mutate(owner_id,'session.control',gen_random_uuid(),jsonb_build_object('id',session_id,'revision',2,'action','complete','description','GPS QA'));
 perform pg_temp.check_true((result #>> '{completion,tokenAward}')::int=1,'shared server timer awards one token');
 perform pg_temp.check_true((result #>> '{completion,distanceM}')::double precision=measured,'completion snapshot receives authoritative distance');
 begin perform public.ingest_route_points(owner_id,session_id,3,'[]',false); raise exception 'completed points allowed'; exception when serialization_failure then null; end;
 perform pg_temp.check_true((public.read_session_route(owner_id,session_id) #>> '{coverage,pointCount}')::int=7,'saved route remains readable');
end $$ language plpgsql;
-- Browser-role writes and RPCs are denied; owner reads remain protected by RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true((select count(*)=7 from public.route_points),'owner can read saved GPS');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((select count(*)=0 from public.route_points),'other owner cannot read saved GPS');
select pg_temp.check_true(not has_function_privilege('authenticated','public.ingest_route_points(uuid,uuid,bigint,jsonb,boolean)','execute'),'browser cannot invoke privileged GPS RPC');
select pg_temp.check_true(not has_function_privilege('anon','public.read_session_route(uuid,uuid)','execute'),'anonymous cannot invoke route read RPC');
select pg_temp.check_true(not has_table_privilege('authenticated','public.route_points','insert'),'browser cannot directly insert GPS');
rollback;
