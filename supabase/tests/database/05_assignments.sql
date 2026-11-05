-- assignments, plan_items (CLAUDE.md security rule 6) and assign_tracker.
begin;
\ir _helpers.psql
select plan(18);
select tests.make_world();

select tests.authenticate_as('student');
select is((select count(*)::int from public.assignments), 2,
  'a student reads only their own two assignments');
select is((select count(*)::int from public.plan_items), 2,
  'a student reads only their own plan items');
select throws_ok(format($$
  insert into public.assignments (tracker_id, student_id, start_date) values (%L, %L, current_date)
$$, tests.id('test-daily'), tests.id('student2')), '42501', null, 'a student cannot create assignments');
select throws_ok(format($$
  insert into public.plan_items (assignment_id, date, title) values (%L, current_date, 'Extra')
$$, tests.assignment('student', 'test-plan')), '42501', null, 'a student cannot add plan items');
select throws_ok(format($$
  select public.assign_tracker(%L, 'test-daily', current_date)
$$, tests.id('student')), '42501', null, 'a student cannot call assign_tracker');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from public.assignments), 2,
  'a viewer reads their linked student''s assignments only');
select is((select count(*)::int from public.plan_items), 2,
  'a viewer reads their linked student''s plan items only');
select throws_ok(format($$
  select public.assign_tracker(%L, 'test-daily', current_date)
$$, tests.id('student2')), '42501', null, 'a viewer cannot call assign_tracker');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from public.assignments), 0, 'an unlinked viewer reads no assignments');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.assignments), 5, 'the admin reads every assignment');
select is(tests.rows_affected(format($$
  update public.plan_items set date = date + 1 where assignment_id = %L and sort = 2
$$, tests.assignment('student', 'test-plan'))), 1, 'the admin can move a plan item');
reset role;

-- assign_tracker copies the template, shifting every date by (start - first_date).
select tests.create_user('student3', 'student');
select tests.authenticate_as('admin');
select lives_ok(format($$
  select public.assign_tracker(%L, 'test-plan', '2026-11-08')
$$, tests.id('student3')), 'the admin can assign a tracker');
select is(public.assign_tracker(tests.id('student3'), 'test-plan', '2026-11-15'),
  tests.assignment('student3', 'test-plan'), 're-running assign_tracker returns the same assignment');
select is((
  select array_agg(p.date order by p.sort) from public.plan_items p
  where p.assignment_id = tests.assignment('student3', 'test-plan')
), array['2026-11-08', '2026-11-10']::date[],
  'plan items are copied with every date shifted by one week, and not again on a re-run');
select is((
  select p.details ->> 'session' from public.plan_items p
  where p.assignment_id = tests.assignment('student3', 'test-plan') order by p.sort limit 1
), '1', 'plan items keep the template''s details');
select is((select start_date from public.assignments where id = tests.assignment('student3', 'test-plan')),
  '2026-11-08'::date, 'the start date is the first call''s');
select throws_ok(format($$
  select public.assign_tracker(%L, 'test-daily', current_date)
$$, tests.id('viewer')), '23514', null, 'only a student can be assigned a tracker');
select throws_ok(format($$
  select public.assign_tracker(%L, 'no-such-tracker', current_date)
$$, tests.id('student3')), 'P0002', null, 'assigning an unknown tracker fails');
reset role;

select * from finish();
rollback;
