-- Opt-in, server-controlled reward acceleration for new Studbot test sessions.
-- Existing sessions retain their captured rate; all ordinary activities remain 30 minutes.
alter table public.activity_sessions add column reward_interval_ms bigint not null default 1800000;
alter table public.activity_sessions add constraint session_reward_interval_check
 check(reward_interval_ms in(15000,1800000) and (task_snapshot->>'kind'='study' or reward_interval_ms=1800000));
alter table public.completions add column reward_interval_ms bigint not null default 1800000;
alter table public.completions drop constraint completions_check;
alter table public.completions add constraint completion_reward_interval_check
 check(reward_interval_ms in(15000,1800000) and (task_snapshot->>'kind'='study' or reward_interval_ms=1800000));
alter table public.completions add constraint completion_award_check check(token_award=eligible_ms/reward_interval_ms);

create or replace function private.session_json(s public.activity_sessions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'taskId',s.task_id,'task',private.task_json(s.task_snapshot),'state',s.state,'revision',s.revision,'activeSince',s.active_since,'accumulatedMs',s.accumulated_ms,'eligibleMs',s.eligible_ms,'startedAt',s.started_at,'serverTime',clock_timestamp(),'rewardIntervalMs',s.reward_interval_ms)
 || case when s.task_snapshot->>'kind'='study' then jsonb_build_object('studyCreditUntil',(select credit_until from private.study_clocks where session_id=s.id)) else '{}'::jsonb end;
$$;
create or replace function private.completion_json(c public.completions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'sessionId',c.session_id,'task',private.task_json(c.task_snapshot),'description',c.description,'reflection',c.reflection,'completedAt',c.completed_at,'timezone',c.timezone,'eligibleMs',c.eligible_ms,'distanceM',c.distance_m,'tokenAward',c.token_award,'rewardIntervalMs',c.reward_interval_ms);
$$;

-- Remove the old signature so PostgREST resolves defaulted calls unambiguously.
drop function public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid);
create function public.studbot_command(p_user_id uuid,p_action text,p_session_id uuid default null,
 p_window_id uuid default null,p_sequence bigint default null,p_observation text default null,p_key uuid default null,p_test_mode boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 stamp timestamptz:=clock_timestamp(); s public.activity_sessions; c private.study_clocks;
 task public.task_definitions; profile public.profiles; completion public.completions;
 balance bigint; award bigint; result jsonb; prior public.idempotency_records; hash text;
begin
 if p_action is null or p_action not in('load','start','observe','pause','complete','cancel') then
  raise exception 'Invalid study action' using errcode='22023';
 end if;
 select b.balance into balance from public."tokenBalance" b where user_id=p_user_id for update;
 if not found then raise exception 'Account unavailable' using errcode='P0002';end if;
 stamp:=clock_timestamp(); -- Sample after the owner lock, never before a wait.
 if p_action in('complete','cancel') then
  if p_key is null or p_session_id is null then raise exception 'A session and retry key are required' using errcode='22023';end if;
  hash:=encode(extensions.digest(convert_to(p_session_id::text,'UTF8'),'sha256'),'hex');
  select * into prior from public.idempotency_records where user_id=p_user_id and operation='study.'||p_action and key=p_key;
  if found then
   if prior.request_hash<>hash then raise exception 'Retry key reused for another session' using errcode='23505';end if;
   return prior.response_snapshot;
  end if;
 end if;
 if p_session_id is not null then
  select * into s from public.activity_sessions where user_id=p_user_id and id=p_session_id for update;
  if not found or s.task_snapshot->>'kind'<>'study' then raise exception 'Study session not found' using errcode='P0002';end if;
 else
  select * into s from public.activity_sessions where user_id=p_user_id and state in('created','running','paused') for update;
  if found and s.task_snapshot->>'kind'<>'study' then
   if p_action='load' then return jsonb_build_object('activity',null,'balance',balance,'serverTime',clock_timestamp());end if;
   raise exception 'Finish or cancel your current activity before starting Studbot' using errcode='23505';
  end if;
 end if;
 if s.id is null then
  if p_action in('load','pause') then return jsonb_build_object('activity',null,'balance',balance,'serverTime',clock_timestamp());end if;
  if p_action<>'start' then raise exception 'Start a study session first' using errcode='P0002';end if;
  select * into strict task from public.task_definitions where user_id=p_user_id and kind='study' and archived_at is null;
  insert into public.activity_sessions(user_id,task_id,task_snapshot,state,pause_reason,reward_interval_ms)
   values(p_user_id,task.id,to_jsonb(task),'paused','calibrating',case when p_test_mode then 15000 else 1800000 end) returning * into s;
  insert into private.study_clocks(session_id) values(s.id);
 end if;
 if s.state not in('running','paused') then raise exception 'Study session has already ended' using errcode='23505';end if;
 select * into strict c from private.study_clocks where session_id=s.id;
 -- A delayed request from an older tab must never pause or credit a newer one.
 if p_action in('observe','pause') and p_window_id is not null and c.window_id is distinct from p_window_id then
  if p_action='pause' then return jsonb_build_object('activity',private.session_json(s),'balance',balance,'serverTime',clock_timestamp());end if;
  raise exception 'Focus window changed. Reopen focus mode.' using errcode='40001';
 end if;
 if p_action='observe' then
  if p_window_id is null or not c.enabled or p_observation is null or p_observation not in('compatible','away','unknown')
   or p_sequence is null or p_sequence<0 or p_sequence>9007199254740991 then
   raise exception 'Invalid or paused study observation' using errcode='22023';
  end if;
  if p_sequence<=c.last_sequence then
   raise exception 'Replayed study observation' using errcode='40001';
  end if;
 end if;
 perform private.settle_study(s.id,stamp);
 select * into strict s from public.activity_sessions where id=s.id;
 select * into strict c from private.study_clocks where session_id=s.id;
 if p_action='start' then
  if p_window_id is null then raise exception 'A focus window is required' using errcode='22023';end if;
  if c.window_id is distinct from p_window_id or not c.enabled then
   update private.study_clocks set window_id=p_window_id,enabled=true,last_sequence=-1,
    good_since=null,bad_since=null,last_observed_at=null,credit_until=null where session_id=s.id;
   update public.activity_sessions set state='paused',active_since=null,pause_reason='reacquiring',revision=revision+1 where id=s.id;
  end if;
 elsif p_action='observe' then
  if c.last_observed_at is null or stamp-c.last_observed_at>interval '5 seconds' then c.good_since:=null;end if;
  if p_observation='compatible' then
   c.bad_since:=null;
   c.good_since:=coalesce(c.good_since,stamp);
   if s.state='running' or stamp-c.good_since>=interval '2 seconds' then
    if s.state<>'running' then
     insert into public.session_intervals(user_id,session_id,sequence,kind,start_at,end_at,eligibility)
      select p_user_id,s.id,coalesce(max(sequence),-1)+1,'study',stamp,stamp,true from public.session_intervals where session_id=s.id;
    end if;
    update public.activity_sessions set state='running',active_since=stamp,pause_reason=null where id=s.id;
    c.credit_until:=stamp+interval '5 seconds';
   end if;
  else
   c.good_since:=null;
   c.bad_since:=coalesce(c.bad_since,stamp);
   if s.state='running' then
    c.credit_until:=c.bad_since+interval '5 seconds';
    if stamp>=c.credit_until then
     update public.activity_sessions set state='paused',active_since=null,pause_reason='away' where id=s.id;
    end if;
   end if;
  end if;
  update private.study_clocks set last_sequence=p_sequence,last_observed_at=stamp,
   good_since=c.good_since,bad_since=c.bad_since,credit_until=c.credit_until where session_id=s.id;
 elsif p_action in('pause','complete','cancel') then
  update private.study_clocks set enabled=false,window_id=null,good_since=null,bad_since=null,credit_until=null where session_id=s.id;
  if p_action='complete' then
   select * into strict profile from public.profiles where user_id=p_user_id;
   award:=s.eligible_ms/s.reward_interval_ms;
   insert into public.completions(user_id,session_id,task_snapshot,completed_at,timezone,eligible_ms,token_award,reward_interval_ms,description)
    values(p_user_id,s.id,s.task_snapshot,stamp,profile.timezone,s.eligible_ms,award,s.reward_interval_ms,
     case when s.reward_interval_ms=15000 then 'Studbot test reward: one token per 15 seconds.' else '' end) returning * into completion;
   update public."tokenBalance" set balance=public."tokenBalance".balance+award,version=version+1 where user_id=p_user_id returning public."tokenBalance".balance into balance;
   insert into public.token_entries(user_id,completion_id,delta,resulting_balance) values(p_user_id,completion.id,award,balance);
  end if;
  update public.activity_sessions set state=case p_action when 'complete' then 'completed' when 'cancel' then 'cancelled' else 'paused' end,
   active_since=null,pause_reason=case when p_action='pause' then 'manual' else null end,revision=revision+1 where id=s.id;
 end if;
 select * into strict s from public.activity_sessions where id=s.id;
 result:=jsonb_build_object('activity',private.session_json(s),'balance',balance,'serverTime',clock_timestamp(),'completion',
  case when completion.id is not null then private.completion_json(completion) else null end);
 if p_action in('complete','cancel') then
  insert into public.idempotency_records(user_id,operation,key,request_hash,resource_id,response_snapshot)
   values(p_user_id,'study.'||p_action,p_key,hash,s.id,result);
 end if;
 return result;
end;
$$;
revoke all on function public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid,boolean) to service_role;

notify pgrst,'reload schema';
