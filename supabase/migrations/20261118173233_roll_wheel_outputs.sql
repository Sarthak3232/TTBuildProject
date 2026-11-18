-- Keep the cryptographic win/drawer decision from authenticated_app_sessions.
-- A separate, persisted uniform ticket determines only the three displayed reels.
create function private.roll_wheels(p_won boolean, p_threshold integer, p_ticket integer)
returns text[] language plpgsql immutable strict set search_path = '' as $$
declare
  symbols constant text[] := array['jacqueminot', 'garnet', 'tongs', 'hammer'];
  first_index integer := p_ticket / 15;
  pair_index integer := p_ticket % 15;
begin
  if p_ticket < 0 or p_ticket >= 60 then
    raise exception 'Wheel ticket must be between 0 and 59' using errcode = '22023';
  end if;
  if p_won then
    -- 60 is divisible by 4: each winning symbol gets exactly 15 tickets.
    return array_fill(symbols[first_index + 1], array[3]);
  elsif p_threshold >= 500000 then
    -- At >=50%, every loss has matching first two reels and a different third.
    -- Each of the 12 possible patterns gets exactly five tickets.
    return array[symbols[first_index + 1], symbols[first_index + 1],
      symbols[(first_index + 1 + p_ticket % 3) % 4 + 1]];
  else
    -- All 60 nonwinning combinations are equally likely. Skip the one pair
    -- of second/third symbols that would make an accidental three-of-a-kind.
    if pair_index >= first_index * 5 then
      pair_index := pair_index + 1;
    end if;
    return array[symbols[first_index + 1], symbols[pair_index / 4 + 1], symbols[pair_index % 4 + 1]];
  end if;
end;
$$;
revoke all on function private.roll_wheels(boolean, integer, integer) from public, anon, authenticated;
grant execute on function private.roll_wheels(boolean, integer, integer) to service_role;

-- PostgreSQL evaluates a volatile DEFAULT once per existing/new row. This adds
-- stable entropy to old rolls without updating their outcome or disabling the
-- immutable-history trigger. New rolls store their ticket in the same transaction
-- as the result, debit and idempotency snapshot. No Math.random/SQL random().
alter table public.rolls
  add column wheel_ticket smallint not null default private.uniform_roll_ticket(60)
    check (wheel_ticket between 0 and 59);
alter table public.rolls
  add column wheels text[] generated always as
    (private.roll_wheels(won, threshold, wheel_ticket)) stored not null;

create or replace function private.roll_json(r public.rolls)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'allocations', r.allocations, 'cost', r.cost,
    'threshold', r.threshold, 'won', r.won, 'slot', r.slot,
    'policyVersion', r.policy_version, 'deliveryState', r.delivery_state,
    'createdAt', r.created_at, 'balance', r.resulting_balance, 'wheels', r.wheels);
$$;

-- Old retry snapshots must return the same wheels as GET/history, too. Only add
-- display metadata; preserve the original result, charge and recorded balance.
update public.idempotency_records as requests
set response_snapshot = jsonb_set(requests.response_snapshot, '{roll,wheels}', to_jsonb(rolls.wheels))
from public.rolls as rolls
where requests.operation = 'roll' and requests.user_id = rolls.user_id
  and requests.resource_id = rolls.id and requests.response_snapshot ? 'roll';
