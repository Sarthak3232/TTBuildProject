-- The dashboard can install this event-trigger helper in public when automatic
-- RLS is enabled. It is database administration, never an application RPC.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
