-- Deny by default.
--
-- Supabase grants every new table, sequence and function in `public` to anon,
-- authenticated and service_role unless a project opts out. This project still has
-- those defaults (Supabase's April 2026 Data API change has not reached it). Turn
-- them off so each table states its own grants (core_schema) and nothing becomes
-- reachable by accident. The result is the same locally and in the cloud.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- Postgres itself grants EXECUTE on every new function to PUBLIC. That built-in
-- default can only be revoked globally (without IN SCHEMA).
alter default privileges for role postgres
  revoke execute on functions from public;

-- Cloud only: the automatic-RLS event trigger function is SECURITY DEFINER in public
-- and was callable by anon and authenticated (security advisors 0028 and 0029).
-- Revoking EXECUTE does not stop the event trigger from firing.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
