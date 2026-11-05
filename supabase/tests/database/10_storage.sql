-- Storage bucket `attachments` (CLAUDE.md security rule 9): private, paths
-- {owner_id}/{entry_id}/{uuid}.jpg, policies mirroring rule 3.
begin;
\ir _helpers.psql
select plan(11);
select tests.make_world();

select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');

select ok((select not public from storage.buckets where id = 'attachments'),
  'the attachments bucket exists and is private');

select tests.authenticate_as('student');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$,
  tests.id('student') || '/' || tests.id('mine') || '/' || gen_random_uuid() || '.jpg'),
  'a student can upload a photo for their own entry');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$,
  tests.id('student2') || '/' || tests.id('theirs') || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a student cannot upload into another student''s folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$,
  tests.id('student') || '/' || tests.id('theirs') || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a student cannot upload for someone else''s entry');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$,
  tests.id('student') || '/' || tests.id('mine') || '/notes.txt'),
  '42501', null, 'uploads must be named {owner}/{entry}/{uuid}.jpg');
select is(tests.rows_affected($$update storage.objects set name = name where bucket_id = 'attachments'$$),
  0, 'photos cannot be overwritten in place');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 1,
  'a linked viewer can read the student''s photos');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$,
  tests.id('viewer') || '/' || tests.id('mine') || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a viewer cannot upload');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0,
  'an unlinked viewer cannot read the student''s photos');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 1,
  'the admin can read every photo');
reset role;

-- storage.protect_delete blocks direct SQL deletes unless this is set; the Storage
-- API sets it. The policy is what is under test here.
select tests.authenticate_as('student');
set local storage.allow_delete_query = 'true';
select is(tests.rows_affected($$delete from storage.objects where bucket_id = 'attachments'$$),
  1, 'a student can delete their own recent photo');
reset role;

select * from finish();
rollback;
