-- The Retry queue (CLAUDE.md screens; security rule 3). The admin reads every
-- student's open retries, a viewer their linked student's, and only the student who
-- owns a retry marks it done or drops it: the queue is read only for everyone else.
begin;
\ir _helpers.psql
select plan(11);
select tests.make_world();

select tests.add_entry('mine', 'student', 'test-plan', tests.today() - 3,
  '{"checklist": {"attempted": true}, "minutes": 20, "did": "pp. 5-6", "struggled": "p. 6 #4"}',
  tests.plan_item('student', 2));
select tests.add_entry('theirs', 'student2', 'test-plan', tests.today() - 3,
  '{"checklist": {}, "minutes": 20, "did": "pp. 5-6", "struggled": "p. 5 #2"}',
  tests.plan_item('student2', 2));
insert into public.followups (entry_id, assignment_id, label, due_date, owner_id)
values
  (tests.id('mine'), tests.assignment('student', 'test-plan'), 'p. 6 #4', tests.today() - 1,
   tests.id('student')),
  (tests.id('theirs'), tests.assignment('student2', 'test-plan'), 'p. 5 #2', tests.today() + 1,
   tests.id('student2'));

select tests.authenticate_as('admin');
select set_eq($$select label from public.followups where status = 'open'$$,
  array['p. 6 #4', 'p. 5 #2'], 'the admin reads every student''s open retries');
select is(tests.rows_affected($$update public.followups set status = 'done'$$),
  0, 'the admin cannot mark a retry done');
select is(tests.rows_affected($$update public.followups set status = 'dropped'$$),
  0, '... or drop one');
select is(tests.rows_affected($$update public.followups set due_date = due_date + 7$$),
  0, '... or move its due date');
select is(tests.rows_affected($$delete from public.followups$$),
  0, '... or delete one');
reset role;

select tests.authenticate_as('viewer');
select set_eq($$select label from public.followups where status = 'open'$$,
  array['p. 6 #4'], 'a linked viewer reads only the linked student''s open retries');
select is(tests.rows_affected($$update public.followups set status = 'done'$$),
  0, 'a viewer cannot mark a retry done');
select is(tests.rows_affected($$delete from public.followups$$),
  0, '... or delete one');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from public.followups), 0, 'an unlinked viewer reads no retries');
reset role;

select tests.authenticate_as('student2');
select is(tests.rows_affected($$update public.followups set status = 'done' where label = 'p. 6 #4'$$),
  0, 'another student cannot mark a retry done');
reset role;

select is((select count(*)::int from public.followups where status = 'open'), 2,
  'both retries are still open');

select * from finish();
rollback;
