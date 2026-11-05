-- CLAUDE.md security rule 11: each of these must be refused.
--   an admin insert · a viewer insert · a viewer reading an unlinked student ·
--   a student writing to another student's assignment · an edit after 7 days ·
--   a student changing their own role
-- Plus the allowed paths they guard: the student's own write and a linked viewer's read.
begin;
\ir _helpers.psql
select plan(10);
select tests.make_world();

select tests.add_entry('recent', 'student', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('old', 'student', 'test-daily', tests.today() - 9, '{"practiced": false}');
select tests.age_entry('old', 8);
select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');

-- An admin insert.
select tests.authenticate_as('admin');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '42501', null, 'rule 11: an admin insert is refused');
reset role;

-- A viewer insert.
select tests.authenticate_as('viewer');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '42501', null, 'rule 11: a viewer insert is refused');

-- A viewer reading an unlinked student (viewer is linked to student, not student2).
select is((select count(*)::int from public.entries where owner_id = tests.id('student2')), 0,
  'rule 11: a viewer reading an unlinked student gets nothing');
select is((select count(*)::int from public.entries where owner_id = tests.id('student')), 2,
  'allowed: a linked viewer reads the student''s entries');
reset role;

select tests.authenticate_as('student');

-- A student writing to another student's assignment.
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student2', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '42501', null, 'rule 11: a student writing to another student''s assignment is refused');

-- An edit after 7 days. RLS hides the row from UPDATE and DELETE, so 0 rows change.
select is(tests.rows_affected(format($$
  update public.entries set data = '{"practiced": true, "focus": "late edit"}' where id = %L
$$, tests.id('old'))), 0, 'rule 11: an edit after 7 days is refused');
select is(tests.rows_affected(format($$
  delete from public.entries where id = %L
$$, tests.id('old'))), 0, 'rule 11: a delete after 7 days is refused');

-- A student changing their own role.
select throws_ok($$
  update public.profiles set role = 'admin' where id = auth.uid()
$$, '42501', null, 'rule 11: a student changing their own role is refused');

-- Allowed: the student's own write and edit.
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(),
          '{"practiced": true, "focus": "clean shift to 3rd position in bar 12"}')
$$, 'allowed: the student''s own insert succeeds');
select is(tests.rows_affected(format($$
  update public.entries set data = '{"practiced": true, "focus": "slow bows"}' where id = %L
$$, tests.id('recent'))), 1, 'allowed: the student''s own edit within 7 days succeeds');
reset role;

select * from finish();
rollback;
