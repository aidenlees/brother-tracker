-- Comment authors (CLAUDE.md security rules 4 and 7). A comment shows who wrote it, so
-- whoever can read a comment can read its author's profile (a first name and a role).
-- Nothing else widens: a viewer still never reads an unlinked student, a student never
-- reads another student, and the right lasts only while the comment does.
begin;
\ir _helpers.psql
select plan(12);
select tests.make_world();

select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 1,
  '{"practiced": true, "focus": "bow distribution"}');
select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');

select tests.authenticate_as('student');
select set_eq('select id from public.profiles', array[tests.id('student')],
  'before anyone comments, a student reads only their own profile');
reset role;

select tests.authenticate_as('admin');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Try the shift slower first.')$$,
  tests.id('mine')), 'the admin comments on the student''s entry');
reset role;
select tests.authenticate_as('viewer');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Lovely tone tonight.')$$,
  tests.id('mine')), 'the linked viewer comments on it too');
reset role;
select tests.authenticate_as('student2');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Skipped today.')$$,
  tests.id('theirs')), 'another student comments on their own entry');
reset role;

select tests.authenticate_as('student');
select set_eq('select id from public.profiles',
  array[tests.id('student'), tests.id('admin'), tests.id('viewer')],
  'a student reads the profiles of who commented on their entries, and no other student''s');
select is(tests.rows_affected(format($$
  update public.profiles set display_name = 'Max' where id = %L
$$, tests.id('admin'))), 0, 'reading a commenter''s profile is not a right to change it');
reset role;

select tests.authenticate_as('viewer');
select set_eq('select id from public.profiles',
  array[tests.id('viewer'), tests.id('student'), tests.id('admin')],
  'a viewer reads the admin who commented on their linked student''s entry');
reset role;

select tests.authenticate_as('viewer2');
select set_eq('select id from public.profiles', array[tests.id('viewer2')],
  'an unlinked viewer still reads only their own profile');
reset role;

select tests.authenticate_as('student2');
select set_eq('select id from public.profiles', array[tests.id('student2')],
  'a student reads nobody who commented only on someone else''s entries');
reset role;

select tests.authenticate_as('admin');
select is(tests.rows_affected($$delete from public.comments where author_id = auth.uid()$$),
  1, 'the admin deletes their comment');
reset role;
select tests.authenticate_as('student');
select set_eq('select id from public.profiles', array[tests.id('student'), tests.id('viewer')],
  '... and the student no longer reads the admin''s profile');
reset role;

select tests.as_anon();
select throws_ok('select id from public.profiles', '42501', null, 'anon reads no profiles');
reset role;

select * from finish();
rollback;
