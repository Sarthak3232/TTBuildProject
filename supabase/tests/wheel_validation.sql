-- Exhaust every display ticket instead of relying on flaky statistical tests.
begin;
do $$
declare
  ticket integer;
  chance integer;
  symbols text[];
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  request_key uuid := gen_random_uuid();
  result jsonb;
  repeat_result jsonb;
  saved_id uuid;
begin
  foreach chance in array array[200000,499999,500000,600000] loop
    for ticket in 0..59 loop
      symbols := private.roll_wheels(true, chance, ticket);
      assert cardinality(symbols) = 3 and symbols[1] = symbols[2] and symbols[2] = symbols[3], 'Win has three matches';
      symbols := private.roll_wheels(false, chance, ticket);
      assert cardinality(symbols) = 3 and not (symbols[1] = symbols[2] and symbols[2] = symbols[3]), 'Loss never displays a win';
      if chance >= 500000 then
        assert symbols[1] = symbols[2] and symbols[2] <> symbols[3], 'At >=50%, first two match and third differs';
      end if;
      assert symbols <@ array['jacqueminot','garnet','tongs','hammer'], 'Only the four physical symbols';
    end loop;
  end loop;
  assert (select count(distinct private.roll_wheels(false,499999,t)) from generate_series(0,59) t) = 60,
    'Every low-probability nonwinning combination has exactly one ticket';
  assert (select count(*) from (select private.roll_wheels(true,200000,t), count(*) n from generate_series(0,59) t group by 1) patterns where n = 15) = 4,
    'All four winning symbols have equal probability';
  assert (select count(*) from (select private.roll_wheels(false,500000,t), count(*) n from generate_series(0,59) t group by 1) patterns where n = 5) = 12,
    'All twelve high-probability losing patterns have equal probability';
  begin
    perform private.roll_wheels(true,200000,60);
    raise exception 'Invalid wheel ticket was accepted';
  exception when invalid_parameter_value then null; end;

  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,owner_id||'@example.invalid','{}'),(other_id,other_id||'@example.invalid','{}');
  -- Isolated fixtures only. No production token-balance override is exposed.
  update public."tokenBalance" set balance=20 where user_id=owner_id;
  result := public.app_mutate(owner_id,'roll',request_key,'{"allocations":[0,6,0,0],"winSample":999999}');
  saved_id := (result #>> '{roll,id}')::uuid;
  assert result #>> '{roll,won}' = 'false', 'Wheel styling does not change the probability decision';
  assert jsonb_array_length(result #> '{roll,wheels}') = 3, 'POST includes the three persisted symbols';
  assert result #>> '{roll,wheels,0}' = result #>> '{roll,wheels,1}' and result #>> '{roll,wheels,1}' <> result #>> '{roll,wheels,2}', 'Six-token loss is above 50%';
  repeat_result := public.app_mutate(owner_id,'roll',request_key,'{"allocations":[0,6,0,0],"winSample":0,"slotSample":0}');
  assert result = repeat_result, 'Retry never changes wheels or outcome';
  assert (public.app_snapshot(owner_id) #> '{latestRoll,wheels}') = (result #> '{roll,wheels}'), 'Snapshot and POST agree';
  assert (select to_jsonb(wheels) from public.rolls where id=saved_id) = (result #> '{roll,wheels}'), 'GET reads the same saved symbols';
  assert (select balance from public."tokenBalance" where user_id=owner_id) = 14, 'One charge despite retry';
  assert not exists(select 1 from public.unlock_entitlements where roll_id=saved_id), 'Near match does not open a drawer';
  begin
    update public.rolls set wheel_ticket = (wheel_ticket + 1) % 60 where id=saved_id;
    raise exception 'Saved wheels were mutable';
  exception when check_violation then null; end;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  assert (select count(*) from public.rolls where id=saved_id and cardinality(wheels)=3) = 1, 'Owner can read stored wheels without private function grants';
  begin
    perform public.my_app_mutate('roll',gen_random_uuid(),'{"allocations":[1,0,0,0],"wheel_ticket":0}');
    raise exception 'Client-controlled wheel ticket accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  assert not exists(select 1 from public.rolls where id=saved_id), 'Other account cannot read wheels';
  reset role;
end;
$$;
rollback;
