-- Test the authenticated RPC with controlled tickets, including the exact 20% boundary.
-- The temporary sampler replacement and all fixture rows roll back together.
begin;
set local plpgsql.check_asserts=on;
create or replace function private.uniform_roll_ticket(ticket_count integer)
returns integer language plpgsql volatile set search_path='' as $$
begin
 if ticket_count=1000000 then return current_setting('slotty.test_win_ticket')::integer; end if;
 return 0;
end;$$;
do $$
declare owner_id uuid:=gen_random_uuid(); a integer[]; ticket integer; r jsonb; wins integer:=0;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(owner_id,owner_id||'@example.invalid','{}');
 update public."tokenBalance" set balance=1000 where user_id=owner_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 foreach a slice 1 in array array[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]] loop
  foreach ticket in array array[0,199999,200000,999999] loop
   perform set_config('slotty.test_win_ticket',ticket::text,true);
   r:=public.my_app_mutate('roll',gen_random_uuid(),jsonb_build_object('allocations',a));
   assert (r#>>'{roll,threshold}')::integer=200000,'Single token must use 20% threshold';
   assert (r#>>'{roll,won}')::boolean=(ticket<200000),'Authenticated roll must respect win/loss ticket boundary';
   assert (ticket<200000)=(r#>>'{roll,slot}' is not null),'Only wins select a drawer';
  end loop;
 end loop;
 for ticket in 0..99 loop
  perform set_config('slotty.test_win_ticket',(ticket*10000)::text,true);
  r:=public.my_app_mutate('roll',gen_random_uuid(),'{"allocations":[0,0,1,0]}');
  if (r#>>'{roll,won}')::boolean then wins:=wins+1;end if;
 end loop;
 assert wins=20,'100 evenly spaced tickets must yield 20 wins';
 perform set_config('slotty.test_win_ticket','999999',true);
 r:=public.my_app_mutate('roll',gen_random_uuid(),'{"allocations":[0,0,10,0]}');
 assert r#>>'{roll,won}'='true' and r#>>'{roll,slot}'='3','Ten tokens on one slot guarantees that drawer';
 raise notice 'PASS authenticated one-token 20%% boundaries, 20/100 tickets, and ten-token guarantee';
end;$$;
rollback;
