-- Owner snapshot and date-aware interval projections. Local midnight conversion uses IANA rules, including 23/25-hour DST days.
create function private.interval_milliseconds(p_start timestamptz,p_end timestamptz,p_date date,p_timezone text) returns bigint language sql stable set search_path='' as $$
 select greatest(0,floor(extract(epoch from(least(p_end,(p_date+1)::timestamp at time zone p_timezone)-greatest(p_start,p_date::timestamp at time zone p_timezone)))*1000))::bigint;
$$;
revoke all on function private.interval_milliseconds(timestamptz,timestamptz,date,text) from public,anon,authenticated;
grant execute on function private.interval_milliseconds(timestamptz,timestamptz,date,text) to service_role;
create function public.app_snapshot(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles;v_today date;v_now timestamptz:=clock_timestamp();v_balance bigint;v_activity jsonb;v_tasks jsonb;v_goals jsonb;v_roll jsonb;v_earned bigint;v_completed bigint;v_count bigint;
begin
 select balance into v_balance from public."tokenBalance" where user_id=p_user_id for share;
 if not found then raise exception 'Account not found' using errcode='P0002';end if;
 select * into strict v_profile from public.profiles where user_id=p_user_id;
 v_today:=(v_now at time zone v_profile.timezone)::date;
 insert into public.goal_occurrences(user_id,schedule_id,local_date,target_snapshot,timezone)
 select p_user_id,g.id,d::date,g.target_ms,g.timezone from public.goal_schedules g
 cross join lateral generate_series(g.effective_from::timestamp,least((v_now at time zone g.timezone)::date,coalesce((g.archived_at at time zone g.timezone)::date,'infinity'::date))::timestamp,interval '1 day')d
 where g.user_id=p_user_id and (g.repeat_kind='daily' or(g.repeat_kind='today' and g.date_once=d::date) or(g.repeat_kind='weekdays' and extract(isodow from d)::smallint=any(g.weekdays)))
 on conflict(schedule_id,local_date) do nothing;
 update public.goal_occurrences o set progress_ms=a.ms,completed_at=case when a.ms>=o.target_snapshot then coalesce(o.completed_at,a.last_completion) else null end
 from (select o2.schedule_id,o2.local_date,coalesce(sum(private.interval_milliseconds(i.start_at,i.end_at,o2.local_date,o2.timezone)),0)::bigint ms,max(c.completed_at) last_completion
  from public.goal_occurrences o2 join public.goal_schedules g on g.id=o2.schedule_id
  left join public.activity_sessions s on s.user_id=p_user_id and s.task_id=g.task_id and s.state='completed'
  left join public.session_intervals i on i.session_id=s.id and i.eligibility and i.end_at is not null and i.start_at<((o2.local_date+1)::timestamp at time zone o2.timezone) and i.end_at>(o2.local_date::timestamp at time zone o2.timezone)
  left join public.completions c on c.session_id=s.id
  where o2.user_id=p_user_id group by o2.schedule_id,o2.local_date)a
 where o.user_id=p_user_id and o.schedule_id=a.schedule_id and o.local_date=a.local_date;
 select private.session_json(s) into v_activity from public.activity_sessions s where s.user_id=p_user_id and s.state in('created','running','paused');
 select coalesce(jsonb_agg(private.task_json(to_jsonb(t)) order by t.created_at,t.id),'[]') into v_tasks from public.task_definitions t where t.user_id=p_user_id and t.archived_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'taskId',g.task_id,'taskName',t.name,'localDate',o.local_date,'targetMs',o.target_snapshot,'progressMs',coalesce(a.committed,0),'provisionalMs',coalesce(a.provisional,0),'timezone',o.timezone,'repeatKind',g.repeat_kind,'weekdays',g.weekdays,'completedAt',case when coalesce(a.committed,0)>=o.target_snapshot then a.last_completion end) order by g.created_at),'[]') into v_goals
 from public.goal_schedules g join public.task_definitions t on t.id=g.task_id join public.goal_occurrences o on o.schedule_id=g.id
 left join lateral (
  select sum(case when s.state='completed' then x.ms else 0 end)::bigint committed,sum(case when s.state in('running','paused') then x.ms else 0 end)::bigint provisional,max(c.completed_at) last_completion
  from public.activity_sessions s join public.session_intervals i on i.session_id=s.id left join public.completions c on c.session_id=s.id
  cross join lateral(select private.interval_milliseconds(i.start_at,coalesce(i.end_at,v_now),o.local_date,o.timezone) ms)x
  where s.user_id=p_user_id and s.task_id=g.task_id and s.state in('running','paused','completed') and i.eligibility and i.start_at<((o.local_date+1)::timestamp at time zone o.timezone) and coalesce(i.end_at,v_now)>(o.local_date::timestamp at time zone o.timezone)
 )a on true
 where g.user_id=p_user_id and (g.archived_at is null or(g.archived_at at time zone g.timezone)::date>=(v_now at time zone g.timezone)::date) and o.local_date=(v_now at time zone o.timezone)::date;
 select private.roll_json(r) into v_roll from public.rolls r where r.user_id=p_user_id order by r.created_at desc,r.id desc limit 1;
 select count(*),coalesce(sum(token_award),0) into v_completed,v_earned from public.completions where user_id=p_user_id and(completed_at at time zone v_profile.timezone)::date=v_today;
 select count(*) into v_count from public.completions where user_id=p_user_id;
 return jsonb_build_object('profile',jsonb_build_object('displayName',v_profile.display_name,'timezone',v_profile.timezone),'balance',v_balance,'tasks',v_tasks,'activity',v_activity,'goals',v_goals,'today',v_today,'earnedToday',v_earned,'completedToday',v_completed,'completionCount',v_count,'latestRoll',v_roll,'serverTime',v_now);
end;$$;
create function public.app_history(p_user_id uuid,p_period text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_timezone text;v_start date;v_records jsonb;v_count bigint;v_tokens bigint;v_ms bigint;v_today date;v_more boolean;
begin
 if p_limit not between 1 and 100 or p_period not in('week','month','all') or ((p_before is null)<>(p_before_id is null)) then raise exception 'Invalid history query' using errcode='22023';end if;
 select timezone into v_timezone from public.profiles where user_id=p_user_id;
 if not found then raise exception 'Account not found' using errcode='P0002';end if;
 v_today:=(clock_timestamp() at time zone v_timezone)::date;
 v_start:=case p_period when 'week' then v_today-(extract(isodow from v_today)::integer-1) when 'month' then date_trunc('month',v_today)::date else '-infinity'::date end;
 select count(*),coalesce(sum(token_award),0),coalesce(sum(eligible_ms),0) into v_count,v_tokens,v_ms from public.completions c where c.user_id=p_user_id and(c.completed_at at time zone c.timezone)::date>=v_start;
 select coalesce(jsonb_agg(private.completion_json(c) order by c.completed_at desc,c.id desc),'[]') into v_records from(select * from public.completions c where c.user_id=p_user_id and(c.completed_at at time zone c.timezone)::date>=v_start and(p_before is null or(c.completed_at,c.id)<(p_before,p_before_id)) order by c.completed_at desc,c.id desc limit p_limit)c;
 select count(*)>p_limit into v_more from(select 1 from public.completions c where c.user_id=p_user_id and(c.completed_at at time zone c.timezone)::date>=v_start and(p_before is null or(c.completed_at,c.id)<(p_before,p_before_id)) limit p_limit+1)x;
 return jsonb_build_object('completions',v_records,'totalCount',v_count,'totalTokens',v_tokens,'totalMs',v_ms,'hasMore',v_more,'serverTime',clock_timestamp());
end;$$;
create function public.app_calendar(p_user_id uuid,p_month date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('date',d,'count',n) order by d),'[]') from(select (completed_at at time zone timezone)::date d,count(*) n from public.completions where user_id=p_user_id and(completed_at at time zone timezone)::date>=date_trunc('month',p_month)::date and(completed_at at time zone timezone)::date<(date_trunc('month',p_month)+interval '1 month')::date group by 1)x;
$$;
revoke all on function public.app_snapshot(uuid),public.app_history(uuid,text,timestamptz,uuid,integer),public.app_calendar(uuid,date) from public,anon,authenticated;
grant execute on function public.app_snapshot(uuid),public.app_history(uuid,text,timestamptz,uuid,integer),public.app_calendar(uuid,date) to service_role;
