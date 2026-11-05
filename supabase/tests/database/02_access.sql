-- Baseline access: the table set, RLS on every table, nothing for anon, and the
-- helpers' security properties (CLAUDE.md security rules 1, 2 and 10).
begin;
\ir _helpers.psql
select plan(10);
select tests.make_world();

select tables_are('public', array[
  'profiles', 'viewer_links', 'trackers', 'tracker_versions', 'plan_templates', 'assignments',
  'plan_items', 'entries', 'followups', 'attachments', 'comments', 'audit_log', 'push_subscriptions'
], 'public has exactly the tables in the data model');

select is((
  select array_agg(c.relname::text order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
), null, 'every table in public has RLS enabled');

select is((
  select array_agg(c.relname::text order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
         or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE'))
), null, 'anon has no privileges on any public table');

select tests.as_anon();
select throws_ok('select count(*) from public.entries', '42501', null,
  'anon cannot read entries');
select throws_ok('select public.role()', '42501', null,
  'anon cannot call the role helper');
select throws_ok($$select public.assign_tracker(gen_random_uuid(), 'test-daily', current_date)$$,
  '42501', null, 'anon cannot call assign_tracker');
reset role;

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('role', 'is_admin', 'can_see', 'admin_mfa_ok', 'admin_can_write')
    and p.prosecdef and p.provolatile = 's'
    and p.proconfig @> array['search_path=""']
), 5, 'the helpers are security definer, stable, with search_path pinned');

select is((
  select array_agg(p.oid::regprocedure::text order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
), null, 'anon cannot execute any security definer function in public');

select tests.authenticate_as('noprofile');
select is(public.role(), null, 'a signed-in user without a profile has no role');
select is((select count(*)::int from public.trackers), 0, '... and reads no trackers');
reset role;

select * from finish();
rollback;
