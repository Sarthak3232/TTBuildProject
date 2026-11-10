-- Core identity tables. Redemption and locker provisioning are intentionally deferred.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create function private.valid_timezone(value text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;
revoke all on function private.valid_timezone(text) from public;
grant execute on function private.valid_timezone(text) to authenticated, service_role;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (private.valid_timezone(timezone)),
  created_at timestamptz not null default now()
);

create table public."tokenBalance" (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  version bigint not null default 0 check (version >= 0)
);

create table public.task_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('study', 'run', 'walk', 'custom')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  minimum_ms bigint check (minimum_ms >= 0),
  reflection_question text check (
    reflection_question is null or char_length(btrim(reflection_question)) between 1 and 500
  ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint custom_minimum_required check (
    kind <> 'custom' or (minimum_ms is not null and minimum_ms >= 1800000)
  ),
  unique (user_id, id)
);
create unique index task_definitions_predefined_kind
  on public.task_definitions(user_id, kind) where kind <> 'custom';

alter table public.profiles enable row level security;
alter table public."tokenBalance" enable row level security;
alter table public.task_definitions enable row level security;

revoke all on public.profiles, public."tokenBalance", public.task_definitions
  from anon, authenticated;
grant all on public.profiles, public."tokenBalance", public.task_definitions to service_role;
grant select on public.profiles, public."tokenBalance", public.task_definitions to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant insert (id, user_id, kind, name, description, minimum_ms, reflection_question)
  on public.task_definitions to authenticated;
grant update (name, description, minimum_ms, reflection_question, archived_at)
  on public.task_definitions to authenticated;

create policy profiles_read_own on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy token_balance_read_own on public."tokenBalance" for select to authenticated
  using ((select auth.uid()) = user_id);
create policy tasks_read_own on public.task_definitions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy tasks_create_custom on public.task_definitions for insert to authenticated
  with check ((select auth.uid()) = user_id and kind = 'custom');
create policy tasks_update_custom on public.task_definitions for update to authenticated
  using ((select auth.uid()) = user_id and kind = 'custom')
  with check ((select auth.uid()) = user_id and kind = 'custom');

-- User-supplied metadata can set display preferences, never privileges or balances.
create function private.provision_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name, timezone) values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80),
    case when private.valid_timezone(new.raw_user_meta_data ->> 'timezone')
      then new.raw_user_meta_data ->> 'timezone' else 'UTC' end
  );
  insert into public."tokenBalance"(user_id) values (new.id);
  insert into public.task_definitions(user_id, kind, name) values
    (new.id, 'study', 'Studbot'), (new.id, 'run', 'Run'), (new.id, 'walk', 'Walk');
  return new;
end;
$$;
revoke all on function private.provision_new_user() from public, anon, authenticated;
create trigger provision_slotty_user after insert on auth.users
  for each row execute function private.provision_new_user();

-- Provision accounts that already exist when this migration is applied.
insert into public.profiles(user_id, display_name, timezone)
select id, left(btrim(coalesce(raw_user_meta_data ->> 'display_name', '')), 80),
  case when private.valid_timezone(raw_user_meta_data ->> 'timezone')
    then raw_user_meta_data ->> 'timezone' else 'UTC' end
from auth.users on conflict (user_id) do nothing;
insert into public."tokenBalance"(user_id)
select user_id from public.profiles on conflict (user_id) do nothing;
insert into public.task_definitions(user_id, kind, name)
select p.user_id, defaults.kind, defaults.name
from public.profiles p cross join (
  values ('study', 'Studbot'), ('run', 'Run'), ('walk', 'Walk')
) as defaults(kind, name)
on conflict (user_id, kind) where kind <> 'custom' do nothing;

comment on table public."tokenBalance" is
  'Current whole-token balance. Starts at zero. Browser roles have read-only owner access.';
