begin;
create function pg_temp.test_reward_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL test reward: %',label;end if;end;$$;
do $$
declare a uuid:=gen_random_uuid(); sid uuid; r jsonb; retry jsonb; k uuid; duration bigint; expected bigint; task_id uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@example.invalid','{}');
 -- Ordinary sessions remain 30 minutes even if test mode is later enabled.
 r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid());sid:=(r->'activity'->>'id')::uuid;
 r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid(),p_test_mode=>true);
 perform pg_temp.test_reward_assert((r->'activity'->>'rewardIntervalMs')::bigint=1800000,'existing normal session retains rate');
 perform public.studbot_command(a,'cancel',sid,p_key=>gen_random_uuid());
 for duration,expected in select * from(values(14999::bigint,0::bigint),(15000,1),(29999,1),(30000,2),(45000,3)) t(ms,tokens) loop
  r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid(),p_test_mode=>true);sid:=(r->'activity'->>'id')::uuid;
  perform pg_temp.test_reward_assert((r->'activity'->>'rewardIntervalMs')::bigint=15000,'new test session has accelerated rate');
  r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid(),p_test_mode=>false);
  perform pg_temp.test_reward_assert((r->'activity'->>'rewardIntervalMs')::bigint=15000,'resuming preserves captured test rate');
  update public.activity_sessions set accumulated_ms=duration,eligible_ms=duration where id=sid;
  k:=gen_random_uuid(); r:=public.studbot_command(a,'complete',sid,p_key=>k);
  retry:=public.studbot_command(a,'complete',sid,p_key=>k);
  perform pg_temp.test_reward_assert(r=retry,'retry cannot duplicate accelerated credit');
  perform pg_temp.test_reward_assert((r->'completion'->>'tokenAward')::bigint=expected,'rounding at '||duration);
  perform pg_temp.test_reward_assert((r->'completion'->>'rewardIntervalMs')::bigint=15000,'history records the test rate');
 end loop;
 -- Returning to normal configuration affects the next fresh session only.
 r:=public.studbot_command(a,'start',p_window_id=>gen_random_uuid());sid:=(r->'activity'->>'id')::uuid;
 perform pg_temp.test_reward_assert((r->'activity'->>'rewardIntervalMs')::bigint=1800000,'normal default restored');
 perform public.studbot_command(a,'cancel',sid,p_key=>gen_random_uuid());
 select id into task_id from public.task_definitions where user_id=a and kind='run';
 r:=public.app_mutate(a,'session.start',gen_random_uuid(),jsonb_build_object('taskId',task_id));sid:=(r->'activity'->>'id')::uuid;
 perform public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',0,'action','pause'));
 update public.activity_sessions set accumulated_ms=15000,eligible_ms=15000 where id=sid;
 r:=public.app_mutate(a,'session.control',gen_random_uuid(),jsonb_build_object('id',sid,'revision',1,'action','complete'));
 perform pg_temp.test_reward_assert((r->'completion'->>'tokenAward')::bigint=0,'run rewards remain 30 minutes');
end;$$;
rollback;
