-- A plan_checklist field: one checkbox per item its plan item lists (`optionsFrom`, e.g.
-- "plan.problems"). The math log asks "Which problems did you struggle with?" with it.
-- The database holds entries to the same list the browser shows: only that session's
-- items, each once; on a day that lists none the field is hidden and its value dropped.
begin;
\ir _helpers.psql
select plan(17);
select tests.make_world();

do $$
begin
  with t as (
    insert into public.trackers (slug, name, icon, color, cadence, sort, fields) values
      ('test-problems', 'Problems', 'calculator', 'ink-blue', '{"type": "plan"}', 3, $j$[
        {"key": "completed", "type": "yes_no", "label": "Completed?", "required": true},
        {"key": "struggled", "type": "plan_checklist", "label": "Struggled with",
         "required": false, "optionsFrom": "plan.problems"},
        {"key": "minutes", "type": "duration", "label": "Minutes", "required": true}
      ]$j$),
      ('test-daily-list', 'Daily list', 'music', 'rosin-amber', '{"type": "daily"}', 4, $j$[
        {"key": "pieces", "type": "plan_checklist", "label": "Pieces",
         "required": true, "optionsFrom": "plan.pieces"}
      ]$j$)
    returning slug, id
  )
  insert into tests.world select slug, id from t;
  perform public.assign_tracker(tests.id('student'), 'test-problems', tests.today() - 10);
  perform public.assign_tracker(tests.id('student'), 'test-daily-list', tests.today() - 10);

  with p as (
    insert into public.plan_items (assignment_id, date, title, details) values
      (tests.assignment('student', 'test-problems'), tests.today() - 1, 'practice-item',
       '{"session": 6, "problems": ["p. 31 #3", "p. 31 #4", "p. 32 #5(a)", "p. 32 #5(b)"]}'),
      (tests.assignment('student', 'test-problems'), tests.today() - 2, 'review-item',
       '{"session": 21, "kind": "review"}'),
      (tests.assignment('student', 'test-problems'), tests.today() - 3, 'empty-item',
       '{"session": 22, "problems": []}')
    returning title, id
  )
  insert into tests.world select title, id from p;
end $$;

select tests.authenticate_as('student');

-- On a session with a list: its own items, once each.
select lives_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today(),
          '{"completed": true, "struggled": ["p. 31 #4", "p. 32 #5(b)"], "minutes": 30}')
$$, 'problems from the session''s own list are accepted');
select is((
  select data -> 'struggled' from public.entries
  where plan_item_id = tests.id('practice-item') and date = tests.today()
), '["p. 31 #4", "p. 32 #5(b)"]'::jsonb, '... and kept as given');
select is((
  select struggled from public.entries
  where plan_item_id = tests.id('practice-item') and date = tests.today()
), 'p. 31 #4, p. 32 #5(b)', '... and listed, in order, in the struggled column');
select lives_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 1,
          '{"completed": true, "struggled": [], "minutes": 30}')
$$, 'checking none is an answer: nothing was hard');
select throws_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": ["p. 33 #7"], "minutes": 30}')
$$, '23514', null, 'a problem from another session is refused');
select throws_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": ["p. 31 #4", "p. 31 #4"], "minutes": 30}')
$$, '23514', null, 'a problem listed twice is refused');
select throws_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": "p. 31 #4", "minutes": 30}')
$$, '23514', null, 'a problem as text, not a list, is refused');
select throws_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": [4], "minutes": 30}')
$$, '23514', null, 'a problem as a number is refused');
select throws_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('practice-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": ["P. 31 #4"], "minutes": 30}')
$$, '23514', null, 'a problem must match the list exactly');

-- On a session without a list, the field is hidden and its value dropped.
select lives_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('review-item'), 1, tests.today() - 2,
          '{"completed": true, "struggled": ["p. 31 #4"], "minutes": 20}')
$$, 'a value on a session with no list is accepted');
select is((
  select data from public.entries where plan_item_id = tests.id('review-item')
), '{"completed": true, "minutes": 20}'::jsonb, '... and dropped, because the field is hidden');
select lives_ok($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-problems'), tests.id('empty-item'), 1, tests.today() - 3,
          '{"completed": true, "struggled": [], "minutes": 20}')
$$, 'an empty list hides the field too');
select is((
  select data from public.entries where plan_item_id = tests.id('empty-item')
), '{"completed": true, "minutes": 20}'::jsonb, '... and its value is dropped');

-- Without a plan item there is no list: hidden, so not even "required" applies.
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily-list'), 1, tests.today(), '{}')
$$, 'a required list with nothing to list is not asked for');

-- The check itself, as the trigger calls it.
reset role;
select isnt(
  public.field_check_plan_checklist('["p. 31 #4"]', '{"type": "plan_checklist", "plan": {"problems": ["p. 31 #4"]}}'),
  null, 'a field without optionsFrom has nothing to choose from');
select is(
  public.field_check_plan_checklist('["p. 31 #4"]',
    '{"type": "plan_checklist", "optionsFrom": "plan.problems", "plan": {"problems": ["p. 31 #4"]}}'),
  null, 'the check passes an item on the plan item''s list');
select ok(
  not has_function_privilege('authenticated', 'public.field_check_plan_checklist(jsonb, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.field_check_plan_checklist(jsonb, jsonb)', 'execute'),
  'clients cannot call the check directly');

select * from finish();
rollback;
