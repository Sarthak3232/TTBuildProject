-- PostgREST exposes the public invoker functions. The private functions derive
-- their owner from the signed JWT before invoking the existing transactions.

create function private.require_session_user()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Sign in to access your account' using errcode = '42501';
  end if;
  return owner_id;
end;
$$;
revoke all on function private.require_session_user() from public, anon, authenticated;

-- Rejection sampling gives every ticket the same probability, including for
-- stake sizes that do not evenly divide the 24-bit random range.
create function private.uniform_roll_ticket(ticket_count integer)
returns integer language plpgsql volatile set search_path = '' as $$
declare
  cutoff integer := 16777216 - 16777216 % ticket_count;
  entropy bytea;
  sample integer;
begin
  loop
    entropy := extensions.gen_random_bytes(3);
    sample := get_byte(entropy, 0) * 65536 + get_byte(entropy, 1) * 256 + get_byte(entropy, 2);
    if sample < cutoff then
      return sample % ticket_count;
    end if;
  end loop;
end;
$$;
revoke all on function private.uniform_roll_ticket(integer) from public, anon, authenticated;

create function private.my_app_mutate(p_operation text, p_key uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := private.require_session_user();
  allowed_fields text[];
  total integer;
  win_sample integer;
  slot_sample integer;
begin
  if p_key is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text) > 65536 then
    raise exception 'Expected a request key and a bounded JSON object' using errcode = '22023';
  end if;

  -- A signed-in user can call this via PostgREST, so validate privileged inputs
  -- here even when the Next.js route already validates the HTTP request.
  allowed_fields := case p_operation
    when 'task.save' then array['id', 'name', 'description', 'minimumMs', 'reflectionQuestion']
    when 'task.archive' then array['id']
    when 'profile.save' then array['displayName', 'timezone']
    when 'session.start' then array['taskId']
    when 'session.control' then array['id', 'action', 'revision', 'reflection', 'description']
    when 'goal.save' then array['id', 'taskId', 'targetMs', 'repeatKind', 'timezone', 'weekdays']
    when 'goal.archive' then array['id']
    when 'roll' then array['allocations']
  end;
  if allowed_fields is null or p_payload - allowed_fields <> '{}'::jsonb then
    raise exception 'Unexpected operation or request fields' using errcode = '22023';
  end if;

  case p_operation
    when 'task.save' then
      if jsonb_typeof(p_payload -> 'name') is distinct from 'string'
        or jsonb_typeof(p_payload -> 'minimumMs') is distinct from 'number'
        or coalesce(jsonb_typeof(p_payload -> 'description'), 'string') <> 'string'
        or coalesce(jsonb_typeof(p_payload -> 'reflectionQuestion'), 'null') not in ('string', 'null')
        or (p_payload ? 'id' and jsonb_typeof(p_payload -> 'id') <> 'string') then
        raise exception 'Invalid task definition' using errcode = '22023';
      end if;
    when 'profile.save' then
      if jsonb_typeof(p_payload -> 'displayName') is distinct from 'string'
        or jsonb_typeof(p_payload -> 'timezone') is distinct from 'string'
        or char_length(p_payload ->> 'timezone') > 100 then
        raise exception 'Invalid profile preferences' using errcode = '22023';
      end if;
    when 'session.control' then
      if jsonb_typeof(p_payload -> 'id') is distinct from 'string'
        or jsonb_typeof(p_payload -> 'revision') is distinct from 'number'
        or (p_payload ->> 'revision') !~ '^[0-9]+$'
        or jsonb_typeof(p_payload -> 'action') is distinct from 'string'
        or p_payload ->> 'action' not in ('pause', 'resume', 'complete', 'cancel')
        or coalesce(jsonb_typeof(p_payload -> 'reflection'), 'string') <> 'string'
        or char_length(p_payload ->> 'reflection') > 4000
        or coalesce(jsonb_typeof(p_payload -> 'description'), 'string') <> 'string'
        or char_length(p_payload ->> 'description') > 2000 then
        raise exception 'Invalid session control' using errcode = '22023';
      end if;
    when 'goal.save' then
      if jsonb_typeof(p_payload -> 'taskId') is distinct from 'string'
        or (p_payload ? 'id' and jsonb_typeof(p_payload -> 'id') <> 'string')
        or jsonb_typeof(p_payload -> 'targetMs') is distinct from 'number'
        or (p_payload ->> 'targetMs')::numeric not between 60000 and 86400000
        or jsonb_typeof(p_payload -> 'repeatKind') is distinct from 'string'
        or p_payload ->> 'repeatKind' not in ('today', 'daily', 'weekdays')
        or coalesce(jsonb_typeof(p_payload -> 'timezone'), 'string') <> 'string'
        or char_length(p_payload ->> 'timezone') > 100
        or coalesce(jsonb_typeof(p_payload -> 'weekdays'), 'array') <> 'array' then
        raise exception 'Invalid goal schedule' using errcode = '22023';
      end if;
      if p_payload ->> 'repeatKind' = 'weekdays' and (
        coalesce(jsonb_array_length(p_payload -> 'weekdays'), 0) not between 1 and 7
        or exists (
          select 1 from jsonb_array_elements(p_payload -> 'weekdays') as days(day)
          where jsonb_typeof(day) <> 'number' or day::text !~ '^[1-7]$'
        )
      ) then
        raise exception 'Choose one or more distinct weekdays' using errcode = '22023';
      end if;
    when 'roll' then
      if jsonb_typeof(p_payload -> 'allocations') is distinct from 'array' then
        raise exception 'Expected four whole-token allocations' using errcode = '22023';
      end if;
      if jsonb_array_length(p_payload -> 'allocations') <> 4 or exists (
        select 1 from jsonb_array_elements(p_payload -> 'allocations') as items(allocation)
        where case when jsonb_typeof(allocation) = 'number' and allocation::text ~ '^[0-9]{1,7}$'
          then allocation::text::integer > 1000000 else true end
      ) then
        raise exception 'Expected four whole-token allocations' using errcode = '22023';
      end if;
      select sum(allocation::integer) into total
        from jsonb_array_elements_text(p_payload -> 'allocations') as items(allocation);
      if total < 1 then
        raise exception 'Allocate at least one token' using errcode = '22023';
      end if;
      win_sample := private.uniform_roll_ticket(1000000);
      -- Keep the roll-v1 threshold in sync with the accounting RPC.
      if win_sample < round((0.60 - 0.40 * exp(-(total - 1)::numeric / 3)) * 1000000) then
        slot_sample := private.uniform_roll_ticket(total);
      end if;
      p_payload := p_payload || jsonb_build_object('winSample', win_sample, 'slotSample', slot_sample);
    else
      -- The accounting RPC checks the owner and existence for these IDs.
      null;
  end case;

  return public.app_mutate(owner_id, p_operation, p_key, p_payload);
end;
$$;

create function private.my_app_snapshot()
returns jsonb language sql security definer set search_path = '' as $$
  select public.app_snapshot(private.require_session_user());
$$;

create function private.my_app_history(p_period text, p_before timestamptz, p_before_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_period is null or p_limit is null then
    raise exception 'Invalid history query' using errcode = '22023';
  end if;
  return public.app_history(private.require_session_user(), p_period, p_before, p_before_id, p_limit);
end;
$$;

create function private.my_app_calendar(p_month date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.app_calendar(private.require_session_user(), p_month);
$$;

create function private.my_ingest_route_points(p_session_id uuid, p_revision bigint, p_points jsonb, p_gap boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_revision is null or p_revision < 0 or p_revision > 9007199254740991
    or octet_length(p_points::text) > 65536 then
    raise exception 'Invalid route batch' using errcode = '22023';
  end if;
  return public.ingest_route_points(private.require_session_user(), p_session_id, p_revision, p_points, p_gap);
end;
$$;

create function private.my_read_session_route(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.read_session_route(private.require_session_user(), p_session_id);
$$;

create function public.my_app_mutate(p_operation text, p_key uuid, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.my_app_mutate(p_operation, p_key, p_payload);
$$;

create function public.my_app_snapshot()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.my_app_snapshot();
$$;

create function public.my_app_history(p_period text, p_before timestamptz, p_before_id uuid, p_limit integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.my_app_history(p_period, p_before, p_before_id, p_limit);
$$;

create function public.my_app_calendar(p_month date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.my_app_calendar(p_month);
$$;

create function public.my_ingest_route_points(p_session_id uuid, p_revision bigint, p_points jsonb, p_gap boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.my_ingest_route_points(p_session_id, p_revision, p_points, p_gap);
$$;

create function public.my_read_session_route(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.my_read_session_route(p_session_id);
$$;

revoke all on function
  private.my_app_mutate(text, uuid, jsonb), public.my_app_mutate(text, uuid, jsonb),
  private.my_app_snapshot(), public.my_app_snapshot(),
  private.my_app_history(text, timestamptz, uuid, integer), public.my_app_history(text, timestamptz, uuid, integer),
  private.my_app_calendar(date), public.my_app_calendar(date),
  private.my_ingest_route_points(uuid, bigint, jsonb, boolean), public.my_ingest_route_points(uuid, bigint, jsonb, boolean),
  private.my_read_session_route(uuid), public.my_read_session_route(uuid)
from public, anon, authenticated;

grant execute on function
  private.my_app_mutate(text, uuid, jsonb), public.my_app_mutate(text, uuid, jsonb),
  private.my_app_snapshot(), public.my_app_snapshot(),
  private.my_app_history(text, timestamptz, uuid, integer), public.my_app_history(text, timestamptz, uuid, integer),
  private.my_app_calendar(date), public.my_app_calendar(date),
  private.my_ingest_route_points(uuid, bigint, jsonb, boolean), public.my_ingest_route_points(uuid, bigint, jsonb, boolean),
  private.my_read_session_route(uuid), public.my_read_session_route(uuid)
to authenticated;

notify pgrst, 'reload schema';
