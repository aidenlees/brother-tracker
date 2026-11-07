-- public.set_session_dates: moves several plan items to new dates in one transaction
-- (the plan editor's "Move later" and "Move earlier"). It runs as the caller, so the
-- plan_items policies decide: the admin moves sessions, nobody else moves anything.
begin;
\ir _helpers.psql
select plan(9);
select tests.make_world();

select ok((select not prosecdef from pg_proc where proname = 'set_session_dates'),
  'it runs as the caller (security invoker), so RLS applies');
select ok(not has_function_privilege('anon', 'public.set_session_dates(jsonb)', 'execute'),
  'anonymous visitors cannot call it');

select tests.authenticate_as('student');
select is(public.set_session_dates(jsonb_build_array(
  jsonb_build_object('id', tests.plan_item('student', 2), 'date', tests.today() + 40)
)), 0, 'a student moves nothing');
reset role;
select isnt((select date from public.plan_items where id = tests.plan_item('student', 2)),
  tests.today() + 40, '... and the session keeps its date');

select tests.authenticate_as('viewer');
select is(public.set_session_dates(jsonb_build_array(
  jsonb_build_object('id', tests.plan_item('student', 2), 'date', tests.today() + 40)
)), 0, 'a viewer moves nothing');
reset role;

select tests.authenticate_as('admin');
select is(public.set_session_dates(jsonb_build_array(
  jsonb_build_object('id', tests.plan_item('student', 1), 'date', tests.today() + 5),
  jsonb_build_object('id', tests.plan_item('student', 2), 'date', tests.today() + 7)
)), 2, 'the admin moves several sessions at once');
select throws_ok($$select public.set_session_dates('[{"id": "00000000-0000-4000-8000-000000000001"}]')$$,
  '22023', null, 'every move needs an id and a date');
select throws_ok($$select public.set_session_dates('{"id": "x"}')$$,
  '22023', null, 'moves come as a list');
reset role;

select is(
  array[(select date from public.plan_items where id = tests.plan_item('student', 1)),
        (select date from public.plan_items where id = tests.plan_item('student', 2))],
  array[tests.today() + 5, tests.today() + 7],
  'both sessions have their new dates');

select * from finish();
rollback;
