-- The Data API surface (CLAUDE.md security rule 2; cloud advisor lint 0029).
--
-- The security helpers run with their owner's rights, so they live in `private`, a
-- schema the Data API does not expose: policies can still call them, but no client
-- can reach them at /rest/v1/rpc/<name>. These tests fail if a helper moves back to
-- an exposed schema or if any new SECURITY DEFINER function becomes callable there.
-- The local linter doesn't flag that yet; the cloud one does.
--
-- Exposed schemas are the ones in supabase/config.toml, [api] schemas.
begin;
\ir _helpers.psql
select plan(5);

select has_schema('private', 'the private schema exists');

select is((
  select array_agg(p.proname::text order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
), array['admin_can_write', 'admin_mfa_ok', 'book_page_slug', 'can_read_book', 'can_see', 'is_admin', 'role'],
  'private holds exactly the security helpers (and the book-pages path check)');

select is((
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('role', 'is_admin', 'can_see', 'admin_mfa_ok', 'admin_can_write')
), null, 'none of the helpers is left in public');

select is((
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'graphql_public')
    and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), null, 'no SECURITY DEFINER function in an exposed schema is executable by anon or authenticated');

select is((
  select has_schema_privilege('anon', n.oid, 'USAGE')
  from pg_namespace n
  where n.nspname = 'private'
), false, 'anon cannot use the private schema');

select * from finish();
rollback;
