-- Admin MFA: once an admin has a verified TOTP factor, their writes need an aal2
-- session (a password alone is not enough). Reads are unaffected.
begin;
\ir _helpers.psql
select plan(9);
select tests.make_world();
select tests.create_user('admin2', 'admin');
select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 1, '{"practiced": false}');

select tests.authenticate_as('admin');
select lives_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('before-mfa', 'Before MFA', 'moss', '{"type": "daily"}')
$$, 'an admin without MFA can write');
reset role;

-- admin enrolls TOTP; admin2 starts enrolling but never verifies.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('admin'), 'Phone', 'totp', 'verified', now(), now()),
       (gen_random_uuid(), tests.id('admin2'), 'Phone', 'totp', 'unverified', now(), now());

select tests.authenticate_as('admin', 'aal1');
select throws_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('no-code', 'No code', 'moss', '{"type": "daily"}')
$$, '42501', null, 'once enrolled, an admin without the code cannot create a tracker');
select is(tests.rows_affected($$update public.trackers set name = 'Renamed' where slug = 'before-mfa'$$),
  0, '... or edit one');
select throws_ok(format($$select public.assign_tracker(%L, 'before-mfa', current_date)$$,
  tests.id('student')), '42501', null, '... or assign one');
select throws_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Hi')$$,
  tests.id('mine')), '42501', null, '... or comment');
select is((select count(*)::int from public.trackers), 3, 'reads still work without the code');
reset role;

select tests.authenticate_as('admin', 'aal2');
select lives_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('with-code', 'With code', 'moss', '{"type": "daily"}')
$$, 'with the code (aal2) the admin can write again');
reset role;

select tests.authenticate_as('admin2', 'aal1');
select lives_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('admin2', 'Admin two', 'moss', '{"type": "daily"}')
$$, 'an unverified factor does not lock an admin out');
reset role;

select tests.authenticate_as('student', 'aal1');
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, 'the MFA rule applies only to admins');
reset role;

select * from finish();
rollback;
