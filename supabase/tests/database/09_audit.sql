-- audit_log (CLAUDE.md security rule 8): every change to the tables in rules 3-7 is
-- recorded with its actor, before and after. Only the admin reads it; nobody writes it.
begin;
\ir _helpers.psql
select plan(9);
select tests.make_world();

select tests.authenticate_as('student');
insert into public.entries (assignment_id, field_version, date, data)
values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}');
update public.entries set data = '{"practiced": true, "focus": "scales"}' where owner_id = auth.uid();
delete from public.entries where owner_id = auth.uid();
reset role;

select is((
  select array_agg(action order by id) from public.audit_log
  where table_name = 'entries' and actor = tests.id('student')
), array['insert', 'update', 'delete'], 'every change to an entry is logged with its actor');
select ok((
  select before is null and after -> 'data' ->> 'practiced' = 'false' from public.audit_log
  where table_name = 'entries' and action = 'insert' and actor = tests.id('student')
), 'an insert logs the new row');
select ok((
  select before -> 'data' ->> 'practiced' = 'false' and after -> 'data' ->> 'practiced' = 'true'
  from public.audit_log
  where table_name = 'entries' and action = 'update' and actor = tests.id('student')
), 'an update logs the row before and after');
select ok((
  select before is not null and after is null from public.audit_log
  where table_name = 'entries' and action = 'delete' and actor = tests.id('student')
), 'a delete logs the removed row');

select tests.authenticate_as('student');
select is((select count(*)::int from public.audit_log), 0, 'a student cannot read the audit log');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from public.audit_log), 0, 'a viewer cannot read the audit log');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.audit_log), tests.count_all('audit_log'),
  'the admin reads the whole audit log');
select throws_ok($$insert into public.audit_log (table_name, action) values ('entries', 'delete')$$,
  '42501', null, 'nobody writes to the audit log directly');
reset role;

select is((
  select array_agg(c.relname::text order by c.relname)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and t.tgname = 'audit'
), array['assignments', 'attachments', 'comments', 'entries', 'followups', 'plan_items',
         'plan_templates', 'profiles', 'tracker_versions', 'trackers', 'viewer_links'],
  'every table in security rules 3-7 has the audit trigger');

select * from finish();
rollback;
