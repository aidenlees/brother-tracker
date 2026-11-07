-- Storage bucket `book-pages`: the printed book's pages as images, one per page, named
-- {tracker slug}/{printed page, 3 digits}.webp. Private: whoever can see a student
-- assigned that tracker reads them (through signed URLs); only the admin writes.
begin;
\ir _helpers.psql
select plan(16);
select tests.make_world();

-- Pages for a tracker the students have (test-plan) and for one nobody is assigned.
insert into storage.objects (bucket_id, name) values
  ('book-pages', 'test-plan/031.webp'),
  ('book-pages', 'test-plan/032.webp'),
  ('book-pages', 'nobodys-book/001.webp');

select ok((select not public from storage.buckets where id = 'book-pages'),
  'the book-pages bucket exists and is private');
select is((select allowed_mime_types from storage.buckets where id = 'book-pages'),
  array['image/webp'], 'it takes WebP images only');

select tests.authenticate_as('student');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages' and name like 'test-plan/%'),
  2, 'a student reads the pages of a tracker they are assigned');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages' and name like 'nobodys-book/%'),
  0, 'a student cannot read the pages of a tracker they are not assigned');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('book-pages', 'test-plan/033.webp')$$,
  '42501', null, 'a student cannot upload a page');
select is(tests.rows_affected($$update storage.objects set name = name where bucket_id = 'book-pages'$$),
  0, 'a student cannot overwrite a page');
set local storage.allow_delete_query = 'true';
select is(tests.rows_affected($$delete from storage.objects where bucket_id = 'book-pages'$$),
  0, 'a student cannot delete a page');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages' and name like 'test-plan/%'),
  2, 'a viewer linked to an assigned student reads the pages');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('book-pages', 'test-plan/033.webp')$$,
  '42501', null, 'a viewer cannot upload a page');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages'),
  0, 'an unlinked viewer reads no pages');
reset role;

select tests.authenticate_as('former');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages'),
  0, 'a user without that assignment reads no pages');
reset role;

-- An assignment that is no longer active no longer opens the book.
update public.assignments set active = false
where id = tests.assignment('student2', 'test-plan');
select tests.authenticate_as('student2');
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages' and name like 'test-plan/%'),
  0, 'a student whose assignment ended reads no pages');
reset role;

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'book-pages'),
  0, 'anonymous visitors read no pages');
reset role;

select tests.authenticate_as('admin');
-- (Counting only this test's objects: a local stack may also hold the real pages.)
select is((select count(*)::int from storage.objects
           where bucket_id = 'book-pages' and (name like 'test-plan/%' or name like 'nobodys-book/%')),
  3, 'the admin reads every page');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('book-pages', 'test-plan/033.webp')$$,
  'the admin can upload a page');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('book-pages', 'test-plan/page-34.png')$$,
  '42501', null, 'a page must be named {slug}/{3-digit page}.webp');
reset role;

select * from finish();
rollback;
