-- roll-v2: a single slot funded with >=10 tokens guarantees one winning drawer.
alter table public.rolls drop constraint rolls_threshold_check;
alter table public.rolls add constraint rolls_threshold_check check (threshold between 200000 and 600000 or threshold=1000000);
alter table public.rolls alter column policy_version set default 'roll-v2-ten-token';
create function private.roll_threshold(a integer[]) returns integer language sql immutable strict set search_path='' as $$
 select case when exists(select 1 from unnest(a) n where n>=10) then 1000000
 else round((0.60-0.40*exp(-((select sum(n) from unnest(a)n)-1)::numeric/3))*1000000)::integer end;
$$;
create function private.roll_eligible(a integer[]) returns integer[] language sql immutable strict set search_path='' as $$
 select array(select case when not exists(select 1 from unnest(a)n where n>=10) or n>=10 then n else 0 end from unnest(a) with ordinality x(n,ord) order by ord);
$$;
revoke all on function private.roll_threshold(integer[]),private.roll_eligible(integer[]) from public,anon,authenticated;
grant execute on function private.roll_threshold(integer[]),private.roll_eligible(integer[]) to service_role;

-- Patch the current bodies so existing Studbot guards and accounting checks remain.
do $migration$
declare body text; old_text text; new_text text;
begin
 body:=pg_get_functiondef('public.app_mutate(uuid,text,uuid,jsonb)'::regprocedure);
 old_text:='v_threshold:=round((0.60-0.40*exp(-(v_total-1)::numeric/3))*1000000);';
 if strpos(body,old_text)=0 then raise exception 'Unexpected accounting threshold body; migration stopped';end if;
 body:=replace(body,old_text,'v_threshold:=private.roll_threshold(v_alloc);');
 old_text:='if v_sample is null or v_sample<0 or v_sample>=v_total then';
 if strpos(body,old_text)=0 then raise exception 'Unexpected slot sample check; migration stopped';end if;
 body:=replace(body,old_text,'if v_sample is null or v_sample<0 or v_sample>=(select sum(n) from unnest(private.roll_eligible(v_alloc))n) then');
 old_text:='v_cumulative:=v_cumulative+v_alloc[v_i];';
 if strpos(body,old_text)=0 then raise exception 'Unexpected slot selection body; migration stopped';end if;
 body:=replace(body,old_text,'v_cumulative:=v_cumulative+(private.roll_eligible(v_alloc))[v_i];');
 execute body;
 body:=pg_get_functiondef('private.my_app_mutate(text,uuid,jsonb)'::regprocedure);
 old_text:='if win_sample < round((0.60 - 0.40 * exp(-(total - 1)::numeric / 3)) * 1000000) then';
 if strpos(body,old_text)=0 then raise exception 'Unexpected authenticated roll policy; migration stopped';end if;
 body:=replace(body,old_text,'if win_sample < private.roll_threshold(array(select value::integer from jsonb_array_elements_text(p_payload->''allocations''))) then');
 old_text:='slot_sample := private.uniform_roll_ticket(total);';
 if strpos(body,old_text)=0 then raise exception 'Unexpected authenticated slot sampling; migration stopped';end if;
 body:=replace(body,old_text,'select sum(n) into total from unnest(private.roll_eligible(array(select value::integer from jsonb_array_elements_text(p_payload->''allocations''))))n; slot_sample := private.uniform_roll_ticket(total);');
 execute body;
end;$migration$;

-- Audited, service-only test adjustments; no fabricated completion or activity.
alter table public.token_entries add column adjustment_key uuid unique;
alter table public.token_entries add column adjustment_reason text;
alter table public.token_entries drop constraint token_entry_source;
alter table public.token_entries add constraint token_entry_source check (
 (completion_id is not null and roll_id is null and adjustment_key is null and adjustment_reason is null and delta>=0) or
 (completion_id is null and roll_id is not null and adjustment_key is null and adjustment_reason is null and delta<0) or
 (completion_id is null and roll_id is null and adjustment_key is not null and adjustment_reason='Temporary testing credit' and delta>0)
);
create function public.grant_test_tokens(p_user_id uuid,p_key uuid,p_amount integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare wallet_balance bigint; prior public.token_entries; entry_id uuid;
begin
 if p_key is null or p_amount is null or p_amount not between 1 and 10000 then raise exception 'Invalid test credit' using errcode='22023'; end if;
 select balance into wallet_balance from public."tokenBalance" where user_id=p_user_id for update;
 if not found then raise exception 'Account unavailable' using errcode='P0002'; end if;
 select * into prior from public.token_entries where adjustment_key=p_key;
 if found then
  if prior.user_id<>p_user_id or prior.delta<>p_amount then raise exception 'Credit key conflict' using errcode='23505';end if;
  return jsonb_build_object('entryId',prior.id,'added',prior.delta,'balance',prior.resulting_balance,'replay',true);
 end if;
 update public."tokenBalance" set balance=balance+p_amount,version=version+1 where user_id=p_user_id returning balance into wallet_balance;
 insert into public.token_entries(user_id,delta,resulting_balance,adjustment_key,adjustment_reason)
 values(p_user_id,p_amount,wallet_balance,p_key,'Temporary testing credit') returning id into entry_id;
 return jsonb_build_object('entryId',entry_id,'added',p_amount,'balance',wallet_balance,'replay',false);
end;$$;
revoke all on function public.grant_test_tokens(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.grant_test_tokens(uuid,uuid,integer) to service_role;
