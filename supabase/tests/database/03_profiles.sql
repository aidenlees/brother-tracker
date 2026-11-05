-- profiles and viewer_links (CLAUDE.md security rule 4). Nobody sets or changes a
-- role through the client, not even the admin; profiles are created by SQL.
begin;
\ir _helpers.psql
select plan(13);
select tests.make_world();

select tests.authenticate_as('student');
select set_eq('select id from public.profiles', array[tests.id('student')],
  'a student reads only their own profile');
select is(tests.rows_affected(format($$
  update public.profiles set display_name = 'Max' where id = %L
$$, tests.id('student'))), 0, 'a student cannot rename themselves');
select throws_ok($$
  insert into public.profiles (id, role, display_name) values (gen_random_uuid(), 'admin', 'Eve')
$$, '42501', null, 'a student cannot create a profile');
select is((select count(*)::int from public.viewer_links), 0, 'a student reads no viewer links');
reset role;

select tests.authenticate_as('viewer');
select set_eq('select id from public.profiles', array[tests.id('viewer'), tests.id('student')],
  'a viewer reads their own profile and their linked student''s');
select throws_ok(format($$
  insert into public.viewer_links (viewer_id, student_id) values (%L, %L)
$$, tests.id('viewer'), tests.id('student2')), '42501', null,
  'a viewer cannot link themselves to another student');
reset role;

select tests.authenticate_as('former');
select is((select active from public.profiles where id = auth.uid()), false,
  'an inactive user can still see that their account is inactive');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.profiles), 6, 'the admin reads every profile');
select is(tests.rows_affected(format($$
  update public.profiles set display_name = 'Sam' where id = %L
$$, tests.id('student'))), 1, 'the admin can rename a student');
select throws_ok(format($$
  update public.profiles set role = 'admin' where id = %L
$$, tests.id('viewer')), '42501', null, 'the admin cannot change anyone''s role through the client');
select throws_ok($$
  insert into public.profiles (id, role, display_name) values (gen_random_uuid(), 'viewer', 'Eve')
$$, '42501', null, 'the admin cannot create profiles through the client');
select lives_ok(format($$
  insert into public.viewer_links (viewer_id, student_id) values (%L, %L)
$$, tests.id('viewer2'), tests.id('student2')), 'the admin can link a viewer to a student');
reset role;

select throws_ok(format($$
  insert into public.viewer_links (viewer_id, student_id) values (%L, %L)
$$, tests.id('student'), tests.id('student2')), '23514', null,
  'a link must join a viewer to a student');

select * from finish();
rollback;
