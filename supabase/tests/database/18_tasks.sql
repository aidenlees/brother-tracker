-- Tasks (a tracker with display task_list and no plan template): the admin assigns it and
-- adds each task as a plan item; the student ticks one off by logging an entry for it.
-- No new policy: rules 3 and 6 already decide. A task with a log can't be deleted until
-- the log is cleared (entries keep their plan item).
begin;
\ir _helpers.psql
select plan(12);
select tests.make_world();

insert into public.trackers (slug, name, icon, color, cadence, sort, display, fields)
values ('test-tasks', 'Tasks', 'list-checks', 'moss', '{"type": "plan"}', 3, 'task_list',
        '[{"key": "done", "type": "checkbox", "label": "Done", "required": true}]');

select tests.authenticate_as('admin');
select lives_ok(format($$select public.assign_tracker(%L, 'test-tasks', tests.today())$$,
  tests.id('student')), 'the admin assigns the task tracker');
select is((
  select count(*)::int from public.plan_items p join public.assignments a on a.id = p.assignment_id
  join public.trackers t on t.id = a.tracker_id where t.slug = 'test-tasks'
), 0, '... with no tasks yet: it has no plan template');
reset role;
insert into tests.world
select 'tasks', a.id from public.assignments a join public.trackers t on t.id = a.tracker_id
where t.slug = 'test-tasks' and a.student_id = tests.id('student');

select tests.authenticate_as('admin');
select lives_ok(format($$
  insert into public.plan_items (assignment_id, date, title, details)
  values (%L, tests.today(), 'Read chapter 3', '{"notes": "Bring the book."}')
$$, tests.id('tasks')), 'the admin adds a task');
reset role;
insert into tests.world
select 'task', p.id from public.plan_items p where p.assignment_id = tests.id('tasks');

select tests.authenticate_as('student');
select throws_ok(format($$
  insert into public.plan_items (assignment_id, date, title) values (%L, tests.today(), 'Nothing')
$$, tests.id('tasks')), '42501', null, 'a student cannot add a task, even to their own tasks');
select is(tests.rows_affected(format($$update public.plan_items set title = 'Done already' where id = %L$$,
  tests.id('task'))), 0, '... or change one');
select is(tests.rows_affected(format($$delete from public.plan_items where id = %L$$,
  tests.id('task'))), 0, '... or delete one');
select throws_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (%L, %L, 1, tests.today(), '{"done": "yes"}')
$$, tests.id('tasks'), tests.id('task')), '23514', null, 'ticking a task off is a true or false');
select lives_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (%L, %L, 1, tests.today(), '{"done": true}')
$$, tests.id('tasks'), tests.id('task')), 'the student ticks the task off');
reset role;

select tests.authenticate_as('viewer');
select throws_ok(format($$
  insert into public.plan_items (assignment_id, date, title) values (%L, tests.today(), 'From a viewer')
$$, tests.id('tasks')), '42501', null, 'a viewer cannot add a task');
select is((select count(*)::int from public.plan_items where id = tests.id('task')), 1,
  '... but a linked viewer sees it');
reset role;

select tests.authenticate_as('admin');
select throws_ok(format($$delete from public.plan_items where id = %L$$, tests.id('task')),
  '23503', null, 'a task the student ticked off cannot be deleted while its log exists');
delete from public.entries where plan_item_id = tests.id('task');
select is(tests.rows_affected(format($$delete from public.plan_items where id = %L$$,
  tests.id('task'))), 1, '... and can once the admin clears the log');
reset role;

select * from finish();
rollback;
