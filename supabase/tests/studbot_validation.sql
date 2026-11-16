-- Isolated fixture only. No runtime endpoint accepts timestamps or elapsed time.
begin;
create function pg_temp.study_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL study: %',label;end if;end;$$;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); w2 uuid:=gen_random_uuid();
 sid uuid; r jsonb; again jsonb; k uuid; before_balance bigint; duration bigint; expected bigint; stamp timestamptz;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@example.invalid','{}'),(b,b||'@example.invalid','{}');
 perform pg_temp.study_assert((select relrowsecurity from pg_class where oid='private.study_clocks'::regclass),'study clock has RLS enabled');
 perform pg_temp.study_assert(not has_table_privilege('authenticated','private.study_clocks','select,insert,update,delete'),'browser has no direct clock access');
 perform pg_temp.study_assert(not has_function_privilege('authenticated','public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid,boolean)','execute'),'browser cannot forge observations');
 perform pg_temp.study_assert(not has_function_privilege('anon','public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid,boolean)','execute'),'anonymous cannot call study service');
 perform pg_temp.study_assert(has_function_privilege('service_role','public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid,boolean)','execute'),'server can save verified observations');
 r:=public.studbot_command(a,'start',p_window_id=>w);sid:=(r->'activity'->>'id')::uuid;
 perform pg_temp.study_assert(r->'activity'->>'state'='paused','start waits for valid posture');
 r:=public.studbot_command(a,'observe',sid,w,1,'compatible');
 perform pg_temp.study_assert(r->'activity'->>'state'='paused','first observation does not skip reacquisition');
 update private.study_clocks set good_since=clock_timestamp()-interval '2.1 seconds' where session_id=sid;
 r:=public.studbot_command(a,'observe',sid,w,2,'compatible');
 perform pg_temp.study_assert(r->'activity'->>'state'='running','two seconds resumes');
 begin perform public.studbot_command(a,'observe',sid,w,2,'compatible');raise exception 'FAIL replay';exception when serialization_failure then null;end;
 begin perform public.studbot_command(b,'complete',sid,p_key=>gen_random_uuid());raise exception 'FAIL other account';exception when no_data_found then null;end;
 begin perform public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',1,'action','resume'));raise exception 'FAIL manual bypass';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.my_app_mutate('session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',1,'action','resume'));raise exception 'FAIL authenticated manual bypass';exception when invalid_parameter_value then null;end;
 -- Simulate a visible-but-uncertain three-second gap while the lease remains valid.
 stamp:=clock_timestamp();
 update public.session_intervals set start_at=stamp-interval '3 seconds',end_at=stamp-interval '3 seconds' where session_id=sid;
 update public.activity_sessions set active_since=stamp-interval '3 seconds',accumulated_ms=0,eligible_ms=0 where id=sid;
 update private.study_clocks set bad_since=stamp-interval '3 seconds',credit_until=stamp+interval '2 seconds' where session_id=sid;
 r:=public.studbot_command(a,'observe',sid,w,3,'unknown');
 perform pg_temp.study_assert(r->'activity'->>'state'='running','uncertainty inside grace still runs');
 perform pg_temp.study_assert((r->'activity'->>'eligibleMs')::bigint between 3000 and 3100,'first three grace seconds credited');
 perform private.settle_study(sid,stamp+interval '10 seconds');
 perform pg_temp.study_assert((select state='paused' and eligible_ms between 4998 and 5000 from public.activity_sessions where id=sid),'all five grace seconds credited then stop');
 -- Repeated reads after the camera disappears cannot increase the stored total.
 r:=public.studbot_command(a,'load');again:=public.studbot_command(a,'load');
 perform pg_temp.study_assert(r->'activity'->>'eligibleMs'=again->'activity'->>'eligibleMs','no counting while disconnected');
 perform pg_temp.study_assert((r->>'balance')::bigint=0,'no automatic token credit');
 -- Replacing a tab invalidates old in-flight observations and old close requests.
 perform public.studbot_command(a,'start',p_window_id=>w2);
 perform public.studbot_command(a,'pause',sid,w);
 perform pg_temp.study_assert((select enabled and window_id=w2 from private.study_clocks where session_id=sid),'old tab cannot pause new tab');
 begin perform public.studbot_command(a,'observe',sid,w,4,'compatible');raise exception 'FAIL old window';exception when serialization_failure then null;end;
 perform public.studbot_command(a,'pause',sid,w2);
 r:=public.studbot_command(a,'load');
 perform pg_temp.study_assert(r->'activity'->>'state'='paused' and (r->'activity'->>'eligibleMs')::bigint>=4998,'close preserves progress');
 perform public.studbot_command(a,'cancel',sid,p_key=>gen_random_uuid());
 perform pg_temp.study_assert(not exists(select 1 from public.completions where session_id=sid),'cancel creates no completion');
 for duration,expected in select * from(values(1799999::bigint,0::bigint),(1800000,1),(3599999,1),(3600000,2)) t(ms,tokens) loop
  r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid());sid:=(r->'activity'->>'id')::uuid;
  update public.activity_sessions set accumulated_ms=duration,eligible_ms=duration where id=sid;
  select balance into before_balance from public."tokenBalance" where user_id=a;
  k:=gen_random_uuid();r:=public.studbot_command(a,'complete',sid,p_key=>k);
  again:=public.studbot_command(a,'complete',sid,p_key=>k);
  perform pg_temp.study_assert(r=again,'retry returns same completed result');
  perform pg_temp.study_assert((r->'completion'->>'tokenAward')::bigint=expected,'round down per completed session at '||duration);
  perform pg_temp.study_assert((r->>'balance')::bigint=before_balance+expected,'wallet credit matches award');
  perform pg_temp.study_assert((select count(*)=1 from public.token_entries where completion_id=(r->'completion'->>'id')::uuid),'exactly one ledger entry');
  begin perform public.studbot_command(a,'complete',sid,p_key=>gen_random_uuid());raise exception 'FAIL duplicate finish';exception when unique_violation then null;end;
 end loop;
 perform pg_temp.study_assert((public.app_history(a,'all')->>'totalCount')::integer=4,'study completions appear in history');
 perform pg_temp.study_assert((public.app_snapshot(a)->>'balance')::bigint=4,'wallet total is correct');
 perform pg_temp.study_assert((public.app_snapshot(b)->>'balance')::bigint=0,'other account untouched');
end;$$;
rollback;
