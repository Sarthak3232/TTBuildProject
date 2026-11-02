-- Goal storage only; schedule expansion and progress calculation arrive with the app backend.
create function private.valid_weekdays(days smallint[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    array_ndims(days) = 1 and cardinality(days) > 0
    and array_position(days, null) is null
    and days <@ array[1,2,3,4,5,6,7]::smallint[]
    and cardinality(days) = (select count(distinct day) from unnest(days) as day),
    false
  );
$$;
revoke all on function private.valid_weekdays(smallint[]) from public;
grant execute on function private.valid_weekdays(smallint[]) to authenticated, service_role;

create table public.goal_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  task_id uuid not null,
  target_ms bigint not null check (target_ms > 0),
  repeat_kind text not null check (repeat_kind in ('today', 'daily', 'weekdays')),
  date_once date,
  weekdays smallint[],
  timezone text not null check (private.valid_timezone(timezone)),
  effective_from date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, task_id) references public.task_definitions(user_id, id),
  unique (user_id, id),
  check (
    (repeat_kind = 'today' and date_once is not null and date_once >= effective_from and weekdays is null)
    or (repeat_kind = 'daily' and date_once is null and weekdays is null)
    or (repeat_kind = 'weekdays' and date_once is null and private.valid_weekdays(weekdays))
  )
);
create index goal_schedules_task on public.goal_schedules(user_id, task_id);

create table public.goal_occurrences (
  user_id uuid not null,
  schedule_id uuid not null,
  local_date date not null,
  target_snapshot bigint not null check (target_snapshot > 0),
  progress_ms bigint not null default 0 check (progress_ms >= 0),
  completed_at timestamptz,
  timezone text not null check (private.valid_timezone(timezone)),
  primary key (schedule_id, local_date),
  foreign key (user_id, schedule_id) references public.goal_schedules(user_id, id) on delete cascade,
  check (completed_at is null or progress_ms >= target_snapshot)
);
create index goal_occurrences_owner_date on public.goal_occurrences(user_id, local_date);

create function private.preserve_goal_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.user_id, new.schedule_id, new.local_date, new.target_snapshot, new.timezone)
    is distinct from row(old.user_id, old.schedule_id, old.local_date, old.target_snapshot, old.timezone) then
    raise exception 'Historical goal identity and target/timezone snapshots are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_goal_snapshot() from public, anon, authenticated;
create trigger preserve_goal_snapshot before update on public.goal_occurrences
  for each row execute function private.preserve_goal_snapshot();

alter table public.goal_schedules enable row level security;
alter table public.goal_occurrences enable row level security;
revoke all on public.goal_schedules, public.goal_occurrences from anon, authenticated;
grant all on public.goal_schedules, public.goal_occurrences to service_role;
grant select on public.goal_schedules, public.goal_occurrences to authenticated;
grant insert (id, user_id, task_id, target_ms, repeat_kind, date_once, weekdays, timezone, effective_from)
  on public.goal_schedules to authenticated;
grant update (target_ms, repeat_kind, date_once, weekdays, timezone, effective_from, archived_at)
  on public.goal_schedules to authenticated;
create policy goal_schedules_read_own on public.goal_schedules for select to authenticated
  using ((select auth.uid()) = user_id);
create policy goal_schedules_create_own on public.goal_schedules for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy goal_schedules_update_own on public.goal_schedules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goal_occurrences_read_own on public.goal_occurrences for select to authenticated
  using ((select auth.uid()) = user_id);
