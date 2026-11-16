-- Study observations are accepted only from the authenticated Next.js bridge
-- using a server-only Supabase key. Browser roles cannot supply time or labels.
create table private.study_clocks (
 session_id uuid primary key references public.activity_sessions(id) on delete cascade,
 window_id uuid, last_sequence bigint not null default -1,
 enabled boolean not null default false,
 last_observed_at timestamptz, good_since timestamptz, bad_since timestamptz,
 credit_until timestamptz
);
alter table private.study_clocks enable row level security;
-- No browser policies: study accounting is accessed only by the privileged RPC.
revoke all on private.study_clocks from public, anon, authenticated;

create or replace function private.session_json(s public.activity_sessions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'taskId',s.task_id,'task',private.task_json(s.task_snapshot),'state',s.state,'revision',s.revision,'activeSince',s.active_since,'accumulatedMs',s.accumulated_ms,'eligibleMs',s.eligible_ms,'startedAt',s.started_at,'serverTime',clock_timestamp())
 || case when s.task_snapshot->>'kind'='study' then jsonb_build_object('studyCreditUntil',(select credit_until from private.study_clocks where session_id=s.id)) else '{}'::jsonb end;
$$;

-- Call only after taking the owner's wallet lock, then the session row lock.
create function private.settle_study(sid uuid, stamp timestamptz) returns void
language plpgsql set search_path='' as $$
declare s public.activity_sessions; c private.study_clocks; finish_at timestamptz; delta bigint;
begin
 select * into strict s from public.activity_sessions where id=sid;
 select * into strict c from private.study_clocks where session_id=sid;
 if s.state='running' then
  finish_at:=greatest(s.active_since,least(stamp,coalesce(c.credit_until,s.active_since)));
  delta:=greatest(0,floor(extract(epoch from(finish_at-s.active_since))*1000))::bigint;
  update public.session_intervals set end_at=finish_at
   where session_id=sid and sequence=(select max(sequence) from public.session_intervals where session_id=sid);
  update public.activity_sessions set accumulated_ms=accumulated_ms+delta,eligible_ms=eligible_ms+delta,
   state=case when c.credit_until is null or stamp>=c.credit_until then 'paused' else 'running' end,
   active_since=case when c.credit_until is null or stamp>=c.credit_until then null else finish_at end,
   pause_reason=case when c.credit_until is null or stamp>=c.credit_until then 'observation_gap' else null end
   where id=sid;
  if c.credit_until is null or stamp>=c.credit_until then
   update private.study_clocks set good_since=null where session_id=sid;
  end if;
 end if;
end;
$$;
revoke all on function private.settle_study(uuid,timestamptz) from public,anon,authenticated;

create function public.studbot_command(p_user_id uuid,p_action text,p_session_id uuid default null,
 p_window_id uuid default null,p_sequence bigint default null,p_observation text default null,p_key uuid default null)
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
  insert into public.activity_sessions(user_id,task_id,task_snapshot,state,pause_reason)
   values(p_user_id,task.id,to_jsonb(task),'paused','calibrating') returning * into s;
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
   award:=s.eligible_ms/1800000;
   insert into public.completions(user_id,session_id,task_snapshot,completed_at,timezone,eligible_ms,token_award)
    values(p_user_id,s.id,s.task_snapshot,stamp,profile.timezone,s.eligible_ms,award) returning * into completion;
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
revoke all on function public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.studbot_command(uuid,text,uuid,uuid,bigint,text,uuid) to service_role;

-- Preserve the existing function OID so cached callers also receive this guard.
create or replace function public.app_mutate(p_user_id uuid,p_operation text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz:=clock_timestamp(); v_balance bigint; v_hash text; v_prior public.idempotency_records;
 v_task public.task_definitions; v_session public.activity_sessions; v_completion public.completions; v_roll public.rolls;
 v_profile public.profiles; v_id uuid; v_result jsonb; v_action text; v_elapsed bigint; v_award bigint; v_distance double precision;
 v_alloc integer[]; v_total integer; v_threshold integer; v_sample integer; v_slot integer; v_cumulative integer:=0; v_i integer;
 v_schedule public.goal_schedules; v_day date; v_timezone text; v_effective date;
begin
 if p_operation='session.control' and exists(select 1 from public.activity_sessions
  where id=(p_payload->>'id')::uuid and user_id=p_user_id and task_snapshot->>'kind'='study') then
  raise exception 'Use the verified Studbot controls for study sessions' using errcode='22023';
 end if;
 -- Every mutation takes the same owner wallet lock before a session/other row: no lost updates/deadlocks.
 select balance into v_balance from public."tokenBalance" where user_id=p_user_id for update;
 if not found then raise exception 'Account unavailable' using errcode='P0002'; end if;
 v_hash:=encode(extensions.digest(convert_to((p_payload-'winSample'-'slotSample')::text,'UTF8'),'sha256'),'hex');
 select * into v_prior from public.idempotency_records where user_id=p_user_id and operation=p_operation and key=p_key;
 if found then
  if v_prior.request_hash<>v_hash then raise exception 'Idempotency key was reused with different input' using errcode='23505'; end if;
  return v_prior.response_snapshot;
 end if;
 if (select count(*) from public.idempotency_records where user_id=p_user_id and created_at>v_now-interval '1 minute')>=120 then raise exception 'Too many changes. Try again in a minute.' using errcode='54000'; end if;
 select * into strict v_profile from public.profiles where user_id=p_user_id;
 if p_operation='task.save' then
  v_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
  if char_length(btrim(p_payload->>'name')) not between 1 and 120 or coalesce((p_payload->>'minimumMs')::bigint,0)<1800000 or (p_payload->>'minimumMs')::bigint>31536000000 then raise exception 'A task needs a name and a minimum of at least 30 minutes' using errcode='22023'; end if;
  insert into public.task_definitions(id,user_id,kind,name,description,minimum_ms,reflection_question) values(v_id,p_user_id,'custom',btrim(p_payload->>'name'),coalesce(p_payload->>'description',''),(p_payload->>'minimumMs')::bigint,nullif(btrim(p_payload->>'reflectionQuestion'),''))
   on conflict(id) do update set name=excluded.name,description=excluded.description,minimum_ms=excluded.minimum_ms,reflection_question=excluded.reflection_question
   where task_definitions.user_id=p_user_id and task_definitions.kind='custom' and task_definitions.archived_at is null returning * into v_task;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  v_result:=jsonb_build_object('task',private.task_json(to_jsonb(v_task))); v_id:=v_task.id;
 elsif p_operation='task.archive' then
  update public.task_definitions set archived_at=v_now where id=(p_payload->>'id')::uuid and user_id=p_user_id and kind='custom' returning * into v_task;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  v_result:=jsonb_build_object('task',private.task_json(to_jsonb(v_task))); v_id:=v_task.id;
 elsif p_operation='profile.save' then
  update public.profiles set display_name=btrim(p_payload->>'displayName'),timezone=p_payload->>'timezone' where user_id=p_user_id returning * into v_profile;
  v_result:=jsonb_build_object('displayName',v_profile.display_name,'timezone',v_profile.timezone);v_id:=p_user_id;
 elsif p_operation='session.start' then
  select * into v_task from public.task_definitions where id=(p_payload->>'taskId')::uuid and user_id=p_user_id and archived_at is null;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  if v_task.kind='study' then raise exception 'Studbot rewards are unavailable until ML verification is integrated' using errcode='22023'; end if;
  if exists(select 1 from public.activity_sessions where user_id=p_user_id and state in('created','running','paused')) then raise exception 'Finish or cancel your current activity first' using errcode='23505'; end if;
  insert into public.activity_sessions(user_id,task_id,task_snapshot,state,started_at,active_since) values(p_user_id,v_task.id,to_jsonb(v_task),'running',v_now,v_now) returning * into v_session;
  insert into public.session_intervals(user_id,session_id,sequence,kind,start_at,eligibility) values(p_user_id,v_session.id,0,'timer',v_now,true);
  v_result:=jsonb_build_object('activity',private.session_json(v_session));v_id:=v_session.id;
 elsif p_operation='session.control' then
  select * into v_session from public.activity_sessions where id=(p_payload->>'id')::uuid and user_id=p_user_id for update;
  if not found then raise exception 'Activity not found' using errcode='P0002'; end if;
  if v_session.revision<>(p_payload->>'revision')::bigint then raise exception 'Activity changed. Refresh and try again.' using errcode='40001'; end if;
  if v_session.state not in('running','paused') then raise exception 'Activity has already ended' using errcode='23505'; end if;
  v_action:=p_payload->>'action';
  if v_action not in('pause','resume','complete','cancel') then raise exception 'Invalid action' using errcode='22023'; end if;
  if (v_action='pause' and v_session.state<>'running') or (v_action='resume' and v_session.state<>'paused') then raise exception 'Invalid activity state' using errcode='23505'; end if;
  v_elapsed:=case when v_session.state='running' then greatest(0,floor(extract(epoch from(v_now-v_session.active_since))*1000))::bigint else 0 end;
  if v_session.state='running' then
   update public.session_intervals set end_at=v_now where session_id=v_session.id and end_at is null;
   v_session.accumulated_ms:=v_session.accumulated_ms+v_elapsed;v_session.eligible_ms:=v_session.eligible_ms+v_elapsed;
  end if;
  if v_action='complete' then
   if v_session.task_snapshot->>'kind'='study' then raise exception 'Study verification is unavailable' using errcode='22023';end if;
   if v_session.task_snapshot->>'kind'='custom' and v_session.eligible_ms<(v_session.task_snapshot->>'minimum_ms')::bigint then raise exception 'The task minimum duration has not been reached' using errcode='22023'; end if;
   if coalesce(btrim(v_session.task_snapshot->>'reflection_question'),'')<>'' and coalesce(btrim(p_payload->>'reflection'),'')='' then raise exception 'Answer the reflection question to complete this task' using errcode='22023'; end if;
   v_award:=v_session.eligible_ms/1800000;
   if to_regprocedure('private.tracking_summary(uuid,uuid)') is not null and v_session.task_snapshot->>'kind' in('run','walk') then
    execute 'select (private.tracking_summary($1,$2)->>''distance_m'')::double precision' into v_distance using p_user_id,v_session.id;
   end if;
   insert into public.completions(user_id,session_id,task_snapshot,description,reflection,completed_at,timezone,eligible_ms,distance_m,token_award) values(p_user_id,v_session.id,v_session.task_snapshot,coalesce(p_payload->>'description',''),nullif(btrim(p_payload->>'reflection'),''),v_now,v_profile.timezone,v_session.eligible_ms,v_distance,v_award) returning * into v_completion;
   update public."tokenBalance" set balance=balance+v_award,version=version+1 where user_id=p_user_id returning balance into v_balance;
   insert into public.token_entries(user_id,completion_id,delta,resulting_balance) values(p_user_id,v_completion.id,v_award,v_balance);
  end if;
  if v_action='resume' then
   insert into public.session_intervals(user_id,session_id,sequence,kind,start_at,eligibility) select p_user_id,v_session.id,coalesce(max(sequence),-1)+1,'timer',v_now,true from public.session_intervals where session_id=v_session.id;
  end if;
  update public.activity_sessions set state=case v_action when 'resume' then 'running' when 'pause' then 'paused' when 'complete' then 'completed' else 'cancelled' end,
   active_since=case when v_action='resume' then v_now else null end,accumulated_ms=v_session.accumulated_ms,eligible_ms=v_session.eligible_ms,revision=revision+1,pause_reason=case when v_action='pause' then 'manual' else null end where id=v_session.id returning * into v_session;
  v_result:=jsonb_build_object('activity',private.session_json(v_session),'completion',case when v_action='complete' then private.completion_json(v_completion) else null end,'balance',v_balance);v_id:=v_session.id;
 elsif p_operation='goal.save' then
  select * into v_task from public.task_definitions where id=(p_payload->>'taskId')::uuid and user_id=p_user_id and archived_at is null;
  if not found then raise exception 'Task not found' using errcode='P0002';end if;
  v_timezone:=coalesce(p_payload->>'timezone',v_profile.timezone);
  if p_payload ? 'id' then
   select * into v_schedule from public.goal_schedules where id=(p_payload->>'id')::uuid and user_id=p_user_id and archived_at is null for update;
   if not found then raise exception 'Goal not found' using errcode='P0002';end if;
   v_timezone:=coalesce(p_payload->>'timezone',v_schedule.timezone);
   perform public.app_snapshot(p_user_id);
   update public.goal_schedules set archived_at=v_now where id=v_schedule.id;
  end if;
  v_day:=(v_now at time zone v_timezone)::date;
  v_effective:=v_day+case when p_payload ? 'id' then 1 else 0 end;
  insert into public.goal_schedules(user_id,task_id,target_ms,repeat_kind,date_once,weekdays,timezone,effective_from) values(p_user_id,v_task.id,(p_payload->>'targetMs')::bigint,p_payload->>'repeatKind',case when p_payload->>'repeatKind'='today' then v_effective end,case when p_payload->>'repeatKind'='weekdays' then array(select value::smallint from jsonb_array_elements_text(p_payload->'weekdays')) end,v_timezone,v_effective) returning * into v_schedule;
  v_id:=v_schedule.id;v_result:=jsonb_build_object('id',v_id);
 elsif p_operation='goal.archive' then
  perform public.app_snapshot(p_user_id);
  update public.goal_schedules set archived_at=v_now where id=(p_payload->>'id')::uuid and user_id=p_user_id returning id into v_id;
  if not found then raise exception 'Goal not found' using errcode='P0002';end if;
  v_result:=jsonb_build_object('id',v_id);
 elsif p_operation='roll' then
  v_alloc:=array(select value::integer from jsonb_array_elements_text(p_payload->'allocations'));
  if not private.valid_allocations(v_alloc) then raise exception 'Invalid whole-token allocation' using errcode='22023';end if;
  select sum(v) into v_total from unnest(v_alloc) v;
  if v_total<1 or v_total>4000000 or v_total>v_balance then raise exception 'Insufficient tokens or invalid stake' using errcode='22023';end if;
  v_threshold:=round((0.60-0.40*exp(-(v_total-1)::numeric/3))*1000000);
  v_sample:=(p_payload->>'winSample')::integer;
  if v_sample is null or v_sample<0 or v_sample>=1000000 then raise exception 'Invalid trusted random sample' using errcode='22023';end if;
  if v_sample<v_threshold then
   v_sample:=(p_payload->>'slotSample')::integer;
   if v_sample is null or v_sample<0 or v_sample>=v_total then raise exception 'Invalid trusted weighted sample' using errcode='22023';end if;
   for v_i in 1..4 loop v_cumulative:=v_cumulative+v_alloc[v_i];if v_sample<v_cumulative then v_slot:=v_i;exit;end if;end loop;
  end if;
  update public."tokenBalance" set balance=balance-v_total,version=version+1 where user_id=p_user_id returning balance into v_balance;
  insert into public.rolls(user_id,allocations,cost,threshold,won,slot,delivery_state,resulting_balance) values(p_user_id,v_alloc,v_total,v_threshold,v_slot is not null,v_slot,case when v_slot is null then 'not_applicable' else 'hardware_pending' end,v_balance) returning * into v_roll;
  insert into public.token_entries(user_id,roll_id,delta,resulting_balance) values(p_user_id,v_roll.id,-v_total,v_balance);
  if v_slot is not null then insert into public.unlock_entitlements(roll_id,user_id,slot) values(v_roll.id,p_user_id,v_slot);end if;
  v_id:=v_roll.id;v_result:=jsonb_build_object('roll',private.roll_json(v_roll));
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into public.idempotency_records(user_id,operation,key,request_hash,resource_id,response_snapshot) values(p_user_id,p_operation,p_key,v_hash,v_id,v_result);
 return v_result;
end;$$;
notify pgrst,'reload schema';
