-- Storage bucket `backups`: the nightly copy of the database. Private with no policies:
-- nobody signed in, the admin included, lists, reads or writes it through the API. Only
-- the service key (the backup workflow) and the dashboard reach it.
begin;
\ir _helpers.psql
select plan(12);
select tests.make_world();

insert into storage.objects (bucket_id, name) values ('backups', '2026-11-08.tar.gz');

select ok((select not public from storage.buckets where id = 'backups'),
  'the backups bucket exists and is private');
select is((select allowed_mime_types from storage.buckets where id = 'backups'),
  array['application/gzip'], 'it takes gzip archives only');

select tests.authenticate_as('student');
select is((select count(*)::int from storage.objects where bucket_id = 'backups'),
  0, 'a student cannot see a backup');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('backups', '2026-11-09.tar.gz')$$,
  '42501', null, 'a student cannot write one');
set local storage.allow_delete_query = 'true';
select is(tests.rows_affected($$delete from storage.objects where bucket_id = 'backups'$$),
  0, 'a student cannot delete one');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from storage.objects where bucket_id = 'backups'),
  0, 'a viewer cannot see a backup');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('backups', '2026-11-09.tar.gz')$$,
  '42501', null, 'a viewer cannot write one');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from storage.objects where bucket_id = 'backups'),
  0, 'the admin cannot see a backup through the API either');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('backups', '2026-11-09.tar.gz')$$,
  '42501', null, '... or write one');
select is(tests.rows_affected($$update storage.objects set name = '2026-11-01.tar.gz' where bucket_id = 'backups'$$),
  0, '... or rename one');
set local storage.allow_delete_query = 'true';
select is(tests.rows_affected($$delete from storage.objects where bucket_id = 'backups'$$),
  0, '... or delete one');
reset role;

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'backups'),
  0, 'anonymous visitors cannot see a backup');
reset role;

select * from finish();
rollback;
