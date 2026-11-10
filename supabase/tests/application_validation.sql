-- Run only against an isolated database. Every fixture and mutation rolls back.
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.seed_elapsed(owner_id uuid,session_id uuid,ms bigint) returns void language plpgsql as $$
declare stamp timestamptz:=clock_timestamp();begin
 update public.session_intervals set start_at=stamp-make_interval(secs=>ms::double precision/1000),end_at=stamp where user_id=owner_id and session_intervals.session_id=seed_elapsed.session_id;
 update public.activity_sessions set state='paused',active_since=null,accumulated_ms=ms,eligible_ms=ms where user_id=owner_id and id=session_id;
end;$$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();task_id uuid;run_id uuid;study_id uuid;sid uuid;k uuid;r jsonb;r2 jsonb;payload jsonb;before_balance bigint;after_balance bigint;g uuid;old_tz text;expected bigint;duration bigint;award bigint;history jsonb;roll_id uuid; snapshot jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@example.invalid','{"display_name":"Accounting","timezone":"America/Los_Angeles"}'),(b,b||'@example.invalid','{}');
 perform pg_temp.assert_true((select balance=0 from public."tokenBalance" where user_id=a),'new account zero balance');
 select id into run_id from public.task_definitions where user_id=a and kind='run';select id into study_id from public.task_definitions where user_id=a and kind='study';
 begin perform public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',study_id));raise exception 'FAIL: study accepted';exception when invalid_parameter_value then null;end;
 begin perform public.app_mutate(a,'task.save',gen_random_uuid(),'{"name":"Invalid","minimumMs":1799999}');raise exception 'FAIL: short custom minimum';exception when invalid_parameter_value then null;end;
 r:=public.app_mutate(a,'task.save',gen_random_uuid(),'{"name":"Crochet","minimumMs":1800000,"reflectionQuestion":"What did you make?"}');task_id:=(r->'task'->>'id')::uuid;
 k:=gen_random_uuid();payload:=jsonb_build_object('taskId',task_id);r:=public.app_mutate(a,'session.start',k,payload);sid:=(r->'activity'->>'id')::uuid;
 perform pg_temp.assert_true(r=public.app_mutate(a,'session.start',k,payload),'start retry returns original');
 begin perform public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',run_id));raise exception 'FAIL: overlapping session';exception when unique_violation then null;end;
 begin perform public.app_mutate(b,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','cancel'));raise exception 'FAIL: cross-owner control';exception when no_data_found then null;end;
 begin perform public.app_mutate(a,'session.start',k,jsonb_build_object('taskId',run_id));raise exception 'FAIL: changed idempotency input';exception when unique_violation then null;end;
 perform pg_temp.seed_elapsed(a,sid,1799000);
 begin perform public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','complete','reflection','Scarf'));raise exception 'FAIL: short completion';exception when invalid_parameter_value then null;end;
 perform pg_temp.seed_elapsed(a,sid,1800000);
 begin perform public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','complete','reflection',' '));raise exception 'FAIL: blank reflection';exception when invalid_parameter_value then null;end;
 k:=gen_random_uuid();payload:=jsonb_build_object('id',sid,'revision',0,'action','complete','reflection','Scarf');r:=public.app_mutate(a,'session.control',k,payload);
 perform pg_temp.assert_true((r->'completion'->>'tokenAward')::bigint=1,'exact custom minimum reward');
 perform pg_temp.assert_true(r=public.app_mutate(a,'session.control',k,payload),'completion retry fixed response');
 perform pg_temp.assert_true((select count(*)=1 from public.token_entries where completion_id=(r->'completion'->>'id')::uuid),'one completion credit');
 begin perform public.app_mutate(a,'session.control',gen_random_uuid(),payload);raise exception 'FAIL: duplicate completion';exception when serialization_failure then null;when unique_violation then null;end;
 begin update public.completions set reflection='altered' where session_id=sid;raise exception 'FAIL: mutable completion';exception when check_violation then null;end;
 for duration,award in select * from(values(1799000::bigint,0::bigint),(1800000,1),(3599000,1),(3600000,2))x(ms,tokens) loop
  r:=public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',run_id));sid:=(r->'activity'->>'id')::uuid;
  perform pg_temp.seed_elapsed(a,sid,duration);
  r:=public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','complete'));
  perform pg_temp.assert_true((r->'completion'->>'tokenAward')::bigint=award,'rounding at '||duration);
 end loop;
 -- Paused duration is excluded regardless of wall-clock time before completion.
 r:=public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',run_id));sid:=(r->'activity'->>'id')::uuid;perform pg_temp.seed_elapsed(a,sid,1800000);
 update public.activity_sessions set started_at=clock_timestamp()-interval '2 days' where id=sid;
 r:=public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','complete'));
 perform pg_temp.assert_true((r->'completion'->>'eligibleMs')::bigint=1800000,'paused wall time excluded');
 -- Stale revisions never change state; canceled time never creates completion/credit.
 r:=public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',run_id));sid:=(r->'activity'->>'id')::uuid;
 r:=public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','pause'));
 begin perform public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','resume'));raise exception 'FAIL: stale revision';exception when serialization_failure then null;end;
 r:=public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',1,'action','cancel'));
 perform pg_temp.assert_true(not exists(select 1 from public.completions where session_id=sid),'cancel does not earn');
 -- Secure API supplies the test-only deterministic draws here; browser role cannot invoke RPC.
 select balance into before_balance from public."tokenBalance" where user_id=a;
 k:=gen_random_uuid();payload:='{"allocations":[0,1,0,0],"winSample":0,"slotSample":0}';r:=public.app_mutate(a,'roll',k,payload);roll_id:=(r->'roll'->>'id')::uuid;
 perform pg_temp.assert_true(r->'roll'->>'slot'='2' and r->'roll'->>'deliveryState'='hardware_pending','funded win with pending hardware');
 perform pg_temp.assert_true(exists(select 1 from public.unlock_entitlements where unlock_entitlements.roll_id=(r->'roll'->>'id')::uuid),'winning entitlement persisted');
 r2:=public.app_mutate(a,'roll',k,'{"allocations":[0,1,0,0],"winSample":999999}');
 perform pg_temp.assert_true(r=r2,'retry ignores new trusted RNG and returns fixed outcome');
 r:=public.app_mutate(a,'roll',gen_random_uuid(),'{"allocations":[1,0,0,0],"winSample":999999}');
 perform pg_temp.assert_true(r->'roll'->>'won'='false' and r->'roll'->'slot'='null'::jsonb,'loss has no slot');
 select balance into after_balance from public."tokenBalance" where user_id=a;
 perform pg_temp.assert_true(after_balance=before_balance-2,'full stake debited on win and loss exactly once');
 begin perform public.app_mutate(a,'roll',gen_random_uuid(),'{"allocations":[1000000,0,0,0],"winSample":0,"slotSample":0}');raise exception 'FAIL: overspend';exception when invalid_parameter_value then null;end;
 begin update public.rolls set won=false,slot=null,delivery_state='not_applicable' where id=roll_id;raise exception 'FAIL: mutable roll';exception when check_violation then null;end;
 history:=public.app_history(a,'all',null,null,2);
 perform pg_temp.assert_true(jsonb_array_length(history->'completions')=2 and(history->>'hasMore')::boolean,'history pagination');
 snapshot:=public.app_snapshot(b);perform pg_temp.assert_true((snapshot->>'balance')::bigint=0 and(snapshot->>'completionCount')::bigint=0,'second account isolated snapshot');
 -- IANA local midnight spans 23 and 25 hours across DST.
 perform pg_temp.assert_true(extract(epoch from('2026-03-09'::timestamp at time zone 'America/Los_Angeles')-('2026-03-08'::timestamp at time zone 'America/Los_Angeles'))=82800,'spring-forward local day');
 perform pg_temp.assert_true(extract(epoch from('2026-11-02'::timestamp at time zone 'America/Los_Angeles')-('2026-11-01'::timestamp at time zone 'America/Los_Angeles'))=90000,'fall-back local day');
 r:=public.app_mutate(a,'goal.save',gen_random_uuid(),jsonb_build_object('taskId',run_id,'targetMs',1800000,'repeatKind','daily'));g:=(r->>'id')::uuid;
 snapshot:=public.app_snapshot(a);
 perform pg_temp.assert_true(jsonb_array_length(snapshot->'goals')=1,'daily occurrence created once');
 perform public.app_snapshot(a);perform pg_temp.assert_true((select count(*)=1 from public.goal_occurrences where schedule_id=g),'occurrence idempotent');
 perform public.app_mutate(a,'profile.save',gen_random_uuid(),'{"displayName":"New name","timezone":"Asia/Tokyo"}');
 perform pg_temp.assert_true((select timezone='America/Los_Angeles' from public.goal_schedules where id=g),'profile change preserves schedule timezone');
 r:=public.app_mutate(a,'goal.save',gen_random_uuid(),jsonb_build_object('id',g,'taskId',run_id,'targetMs',3600000,'repeatKind','daily'));
 perform pg_temp.assert_true((select target_snapshot=1800000 from public.goal_occurrences where schedule_id=g),'edit preserves current target snapshot');
 perform pg_temp.assert_true((select effective_from=(clock_timestamp() at time zone timezone)::date+1 and timezone='America/Los_Angeles' from public.goal_schedules where id=(r->>'id')::uuid),'edit starts tomorrow in captured timezone');
 perform pg_temp.assert_true(private.interval_milliseconds('2026-03-08 08:00:00+00','2026-03-09 07:00:00+00','2026-03-08','America/Los_Angeles')=82800000,'spring goal interval split');
 perform pg_temp.assert_true(private.interval_milliseconds('2026-11-01 07:00:00+00','2026-11-02 08:00:00+00','2026-11-01','America/Los_Angeles')=90000000,'fall goal interval split');
 perform pg_temp.assert_true(private.interval_milliseconds('2026-11-01 06:30:00+00','2026-11-01 07:30:00+00','2026-10-31','America/Los_Angeles')=1800000 and private.interval_milliseconds('2026-11-01 06:30:00+00','2026-11-01 07:30:00+00','2026-11-01','America/Los_Angeles')=1800000,'midnight splits without duplication');
 raise notice 'PASS application accounting, snapshots, retries, isolation, win/loss, pagination and DST';
end;$$ language plpgsql;
rollback;
