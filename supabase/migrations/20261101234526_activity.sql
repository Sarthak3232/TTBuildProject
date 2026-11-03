-- Storage and integrity only: no session-control API or crediting RPC is implemented here.
create extension if not exists btree_gist with schema extensions;

create function private.valid_task_snapshot(snapshot jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(snapshot) = 'object'
    and coalesce(snapshot ->> 'kind', '') in ('study', 'run', 'walk', 'custom')
    and case when snapshot ->> 'kind' = 'custom' then
      case when jsonb_typeof(snapshot -> 'minimum_ms') = 'number' then
        (snapshot ->> 'minimum_ms')::numeric >= 1800000
        and mod((snapshot ->> 'minimum_ms')::numeric, 1) = 0
      else false end
    else true end,
    false
  );
$$;
revoke all on function private.valid_task_snapshot(jsonb) from public;
grant execute on function private.valid_task_snapshot(jsonb) to service_role;

create table public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  task_id uuid not null,
  task_snapshot jsonb not null check (private.valid_task_snapshot(task_snapshot)),
  state text not null default 'created'
    check (state in ('created', 'running', 'paused', 'completed', 'cancelled')),
  pause_reason text,
  started_at timestamptz not null default now(),
  active_since timestamptz,
  accumulated_ms bigint not null default 0 check (accumulated_ms >= 0),
  eligible_ms bigint not null default 0 check (eligible_ms >= 0 and eligible_ms <= accumulated_ms),
  revision bigint not null default 0 check (revision >= 0),
  policy_version text not null default 'earn-v1' check (btrim(policy_version) <> ''),
  foreign key (user_id, task_id) references public.task_definitions(user_id, id),
  unique (user_id, id),
  check ((state = 'running' and active_since is not null)
    or (state <> 'running' and active_since is null))
);
create unique index one_unfinished_session_per_user on public.activity_sessions(user_id)
  where state in ('created', 'running', 'paused');
create index activity_sessions_task on public.activity_sessions(user_id, task_id);

create function private.check_session_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare definition public.task_definitions;
begin
  if tg_op = 'UPDATE' then
    if row(new.id, new.user_id, new.task_id, new.task_snapshot)
      is distinct from row(old.id, old.user_id, old.task_id, old.task_snapshot) then
      raise exception 'Session identity and task snapshot are immutable' using errcode = '23514';
    end if;
  else
    select * into definition from public.task_definitions
      where id = new.task_id and user_id = new.user_id;
    if found and (new.task_snapshot ->> 'kind' is distinct from definition.kind
      or (definition.kind = 'custom'
        and (new.task_snapshot ->> 'minimum_ms')::numeric is distinct from definition.minimum_ms)) then
      raise exception 'Session snapshot must match its task definition' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_session_snapshot() from public, anon, authenticated;
create trigger check_session_snapshot before insert or update on public.activity_sessions
  for each row execute function private.check_session_snapshot();

create table public.session_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  sequence bigint not null check (sequence >= 0),
  kind text not null check (kind in ('timer', 'study')),
  start_at timestamptz not null,
  end_at timestamptz check (end_at >= start_at),
  eligibility boolean not null default false,
  foreign key (user_id, session_id) references public.activity_sessions(user_id, id) on delete cascade,
  unique (session_id, sequence),
  exclude using gist (
    session_id extensions.gist_uuid_ops with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
);
create index session_intervals_owner on public.session_intervals(user_id, session_id);

create table public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null unique,
  task_snapshot jsonb not null check (private.valid_task_snapshot(task_snapshot)),
  description text not null default '',
  reflection text,
  completed_at timestamptz not null default now(),
  timezone text not null default 'UTC' check (private.valid_timezone(timezone)),
  eligible_ms bigint not null check (eligible_ms >= 0),
  distance_m double precision check (
    distance_m >= 0 and distance_m < 'Infinity'::double precision
  ),
  token_award bigint not null check (token_award = eligible_ms / 1800000),
  foreign key (user_id, session_id) references public.activity_sessions(user_id, id) on delete cascade,
  unique (user_id, id),
  constraint custom_completion_minimum check (
    task_snapshot ->> 'kind' <> 'custom'
    or eligible_ms >= (task_snapshot ->> 'minimum_ms')::numeric
  ),
  constraint completion_reflection_required check (
    coalesce(btrim(task_snapshot ->> 'reflection_question'), '') = ''
    or (reflection is not null and btrim(reflection) <> '')
  )
);
create index completions_owner_date on public.completions(user_id, completed_at desc, id desc);

create table public.token_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_id uuid not null unique,
  delta bigint not null check (delta >= 0),
  resulting_balance bigint not null check (resulting_balance >= 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, completion_id) references public.completions(user_id, id) on delete cascade
);
create index token_entries_owner_date on public.token_entries(user_id, created_at desc, id desc);

create function private.prevent_history_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Historical completion and earning records are immutable' using errcode = '23514';
end;
$$;
revoke all on function private.prevent_history_update() from public, anon, authenticated;
create trigger completions_immutable before update on public.completions
  for each row execute function private.prevent_history_update();
create trigger token_entries_immutable before update on public.token_entries
  for each row execute function private.prevent_history_update();

create function private.check_completion_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare captured jsonb;
begin
  select task_snapshot into captured from public.activity_sessions
    where id = new.session_id and user_id = new.user_id;
  if found and new.task_snapshot is distinct from captured then
    raise exception 'Completion snapshot must match its session' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_completion_snapshot() from public, anon, authenticated;
create trigger check_completion_snapshot before insert on public.completions
  for each row execute function private.check_completion_snapshot();

create table public.idempotency_records (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation text not null check (btrim(operation) <> ''),
  key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  resource_id uuid not null,
  response_snapshot jsonb not null check (jsonb_typeof(response_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, operation, key)
);

-- Request hashes/response snapshots are server-internal, not browser data.
alter table public.activity_sessions enable row level security;
alter table public.session_intervals enable row level security;
alter table public.completions enable row level security;
alter table public.token_entries enable row level security;
alter table public.idempotency_records enable row level security;
revoke all on public.activity_sessions, public.session_intervals, public.completions,
  public.token_entries, public.idempotency_records from anon, authenticated;
grant all on public.activity_sessions, public.session_intervals, public.completions,
  public.token_entries, public.idempotency_records to service_role;
grant select on public.activity_sessions, public.session_intervals, public.completions,
  public.token_entries to authenticated;
create policy sessions_read_own on public.activity_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy intervals_read_own on public.session_intervals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy completions_read_own on public.completions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy token_entries_read_own on public.token_entries for select to authenticated
  using ((select auth.uid()) = user_id);
