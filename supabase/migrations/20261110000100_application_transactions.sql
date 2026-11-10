-- Forward-only application accounting. All writes are reached through verified server auth.
alter table public.token_entries alter column completion_id drop not null;
alter table public.token_entries drop constraint token_entries_delta_check;
alter table public.token_entries add column roll_id uuid unique;
create table public.rolls (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 allocations integer[] not null,
 cost integer not null check (cost between 1 and 4000000), threshold integer not null check(threshold between 200000 and 600000),
 won boolean not null, slot smallint check(slot between 1 and 4), policy_version text not null default 'roll-v1',
 delivery_state text not null check(delivery_state in ('hardware_pending','not_applicable')),
 created_at timestamptz not null default now(), resulting_balance bigint not null check(resulting_balance>=0),
 unique(user_id,id), check ((won and slot is not null and delivery_state='hardware_pending') or (not won and slot is null and delivery_state='not_applicable'))
);
-- Array validation uses an immutable helper (subqueries cannot appear in CHECK).
create function private.valid_allocations(a integer[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(array_ndims(a)=1 and array_lower(a,1)=1 and cardinality(a)=4 and not exists(select 1 from unnest(a) v where v is null or v<0 or v>1000000),false);
$$;
alter table public.rolls add constraint rolls_allocations_check check(private.valid_allocations(allocations));
alter table public.token_entries add foreign key (user_id,roll_id) references public.rolls(user_id,id) on delete cascade;
alter table public.token_entries add constraint token_entry_source check ((completion_id is not null and roll_id is null and delta>=0) or (completion_id is null and roll_id is not null and delta<0));
create table public.unlock_entitlements (
 roll_id uuid primary key, user_id uuid not null, slot smallint not null check(slot between 1 and 4),
 state text not null default 'hardware_pending' check(state='hardware_pending'), created_at timestamptz not null default now(),
 foreign key(user_id,roll_id) references public.rolls(user_id,id) on delete cascade
);
alter table public.rolls enable row level security;
alter table public.unlock_entitlements enable row level security;
revoke all on public.rolls,public.unlock_entitlements from anon,authenticated;
grant all on public.rolls,public.unlock_entitlements to service_role;
grant select on public.rolls,public.unlock_entitlements to authenticated;
create policy rolls_read_own on public.rolls for select to authenticated using ((select auth.uid())=user_id);
create policy entitlements_read_own on public.unlock_entitlements for select to authenticated using ((select auth.uid())=user_id);
create trigger rolls_immutable before update on public.rolls for each row execute function private.prevent_history_update();
create trigger entitlements_immutable before update on public.unlock_entitlements for each row execute function private.prevent_history_update();

create function private.task_json(t jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',t->'id','kind',t->'kind','name',t->'name','description',coalesce(t->>'description',''),'minimumMs',t->'minimum_ms','reflectionQuestion',t->'reflection_question','archivedAt',t->'archived_at');
$$;
create function private.session_json(s public.activity_sessions) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'taskId',s.task_id,'task',private.task_json(s.task_snapshot),'state',s.state,'revision',s.revision,'activeSince',s.active_since,'accumulatedMs',s.accumulated_ms,'eligibleMs',s.eligible_ms,'startedAt',s.started_at,'serverTime',clock_timestamp());
$$;
create function private.completion_json(c public.completions) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'sessionId',c.session_id,'task',private.task_json(c.task_snapshot),'description',c.description,'reflection',c.reflection,'completedAt',c.completed_at,'timezone',c.timezone,'eligibleMs',c.eligible_ms,'distanceM',c.distance_m,'tokenAward',c.token_award);
$$;
create function private.roll_json(r public.rolls) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'allocations',r.allocations,'cost',r.cost,'threshold',r.threshold,'won',r.won,'slot',r.slot,'policyVersion',r.policy_version,'deliveryState',r.delivery_state,'createdAt',r.created_at,'balance',r.resulting_balance);
$$;

create function public.app_mutate(p_user_id uuid,p_operation text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz:=clock_timestamp(); v_balance bigint; v_hash text; v_prior public.idempotency_records;
 v_task public.task_definitions; v_session public.activity_sessions; v_completion public.completions; v_roll public.rolls;
 v_profile public.profiles; v_id uuid; v_result jsonb; v_action text; v_elapsed bigint; v_award bigint; v_distance double precision;
 v_alloc integer[]; v_total integer; v_threshold integer; v_sample integer; v_slot integer; v_cumulative integer:=0; v_i integer;
 v_schedule public.goal_schedules; v_day date; v_timezone text; v_effective date;
begin
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
revoke all on function public.app_mutate(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.app_mutate(uuid,text,uuid,jsonb) to service_role;
revoke all on function private.valid_allocations(integer[]),private.task_json(jsonb),private.session_json(public.activity_sessions),private.completion_json(public.completions),private.roll_json(public.rolls) from public,anon,authenticated;
grant execute on function private.valid_allocations(integer[]),private.task_json(jsonb),private.session_json(public.activity_sessions),private.completion_json(public.completions),private.roll_json(public.rolls) to service_role;
