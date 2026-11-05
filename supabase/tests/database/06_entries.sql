-- Entries beyond rule 11: validation against the tracker's fields, the mirrored
-- columns, backfill bounds, columns a client may never write, and users who are
-- inactive or have no profile.
begin;
\ir _helpers.psql
select plan(31);
select tests.make_world();

select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('former-entry', 'former', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 5,
  '{"practiced": true, "focus": "long tones"}');

select tests.authenticate_as('student');

-- Daily tracker: focus is required only when practiced = yes.
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, 'a "no" check-in needs no focus');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '23505', null, 'a daily tracker takes one entry per day');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 1, '{"practiced": true}')
$$, '23514', null, 'a "yes" check-in requires focus');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 1, '{"practiced": "yes"}')
$$, '23514', null, 'a yes/no answer must be true or false');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 1, '{"practiced": false, "mood": 5}')
$$, '23514', null, 'fields the tracker does not define are rejected');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 1, '{}')
$$, '23514', null, 'a required field cannot be missing');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 1, '{"practiced": true, "focus": "  "}')
$$, '23514', null, 'a required text field cannot be blank');
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 2,
          '{"practiced": false, "focus": "left over from a yes"}')
$$, 'a value for a hidden field is accepted');
select is((
  select data from public.entries
  where assignment_id = tests.assignment('student', 'test-daily') and date = tests.today() - 2
), '{"practiced": false}'::jsonb, '... and dropped, because the field is hidden');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 99, tests.today() - 1, '{"practiced": false}')
$$, '23514', null, 'an unknown field version is rejected');

-- Backfill: on or after the assignment's start date, never in the future (New York time).
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() + 1, '{"practiced": false}')
$$, '42501', null, 'an entry cannot be dated in the future');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 31, '{"practiced": false}')
$$, '42501', null, 'an entry cannot predate its assignment');
select lives_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 30, '{"practiced": false}')
$$, 'backfilling the assignment''s start date is allowed');

-- Plan tracker: session 1 is reading-only, session 2 is practice.
select lives_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today(), %L)
$$, tests.plan_item('student', 2),
  '{"checklist": {"attempted": true, "explained": false}, "outcomes": {"I": 3, "H": 1},
    "minutes": 25, "did": "pp. 5-6", "struggled": "p. 6 #4, units"}'),
  'a complete planned session is accepted');
select is((
  select row(did, struggled, minutes)::text from public.entries
  where plan_item_id = tests.plan_item('student', 2)
), row('pp. 5-6', 'p. 6 #4, units', 25)::text,
  'did, struggled and minutes are mirrored into their columns');
select lives_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today(), %L)
$$, tests.plan_item('student', 1),
  '{"checklist": {"attempted": true}, "outcomes": {"I": 2}, "minutes": 15,
    "did": "Read pp. 1-4", "struggled": "Nothing yet"}'),
  'a reading-only session is accepted');
select is((
  select data ? 'outcomes' from public.entries where plan_item_id = tests.plan_item('student', 1)
), false, '... and its tally is dropped, because tallies are hidden on reading-only days');
select throws_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today() - 1, %L)
$$, tests.plan_item('student', 2),
  '{"checklist": {}, "outcomes": {"I": -1}, "minutes": 5, "did": "x", "struggled": "y"}'),
  '23514', null, 'a tally count cannot be negative');
select throws_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today() - 1, %L)
$$, tests.plan_item('student', 2),
  '{"checklist": {"attempted": true, "copied": true}, "minutes": 5, "did": "x", "struggled": "y"}'),
  '23514', null, 'a checklist takes only its own options');
select throws_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today() - 1, %L)
$$, tests.plan_item('student', 2),
  '{"checklist": {}, "minutes": 2000, "did": "x", "struggled": "y"}'),
  '23514', null, 'minutes must be between 0 and 1440');
select throws_ok(format($$
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data)
  values (tests.assignment('student', 'test-plan'), %L, 1, tests.today() - 1, %L)
$$, tests.plan_item('student2', 2),
  '{"checklist": {}, "minutes": 5, "did": "x", "struggled": "y"}'),
  '23514', null, 'a plan item must belong to the entry''s assignment');

-- Columns a client may never write.
select throws_ok(format($$update public.entries set created_at = now() where id = %L$$,
  tests.id('mine')), '42501', null, 'created_at cannot be changed, so the 7-day lock cannot be reset');
select throws_ok(format($$update public.entries set owner_id = %L where id = %L$$,
  tests.id('student2'), tests.id('mine')), '42501', null, 'owner_id cannot be changed');
select throws_ok(format($$update public.entries set assignment_id = %L where id = %L$$,
  tests.assignment('student', 'test-plan'), tests.id('mine')), '42501', null,
  'assignment_id cannot be changed');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data, created_at)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 3, '{"practiced": false}',
          now() + interval '1 year')
$$, '42501', null, 'created_at cannot be set on insert');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data, did)
  values (tests.assignment('student', 'test-daily'), 1, tests.today() - 3, '{"practiced": false}',
          'typed directly')
$$, '42501', null, 'the mirrored columns cannot be written directly');
select is((select count(*)::int from public.entries where owner_id <> auth.uid()), 0,
  'a student reads no one else''s entries');
reset role;

select tests.authenticate_as('former');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('former', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '42501', null, 'an inactive student cannot log');
select is((select count(*)::int from public.entries), 0,
  'an inactive student reads nothing, not even their own entries');
reset role;

select tests.authenticate_as('noprofile');
select throws_ok($$
  insert into public.entries (assignment_id, field_version, date, data)
  values (tests.assignment('student', 'test-daily'), 1, tests.today(), '{"practiced": false}')
$$, '42501', null, 'a user without a profile cannot log');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.entries), tests.count_all('entries'),
  'the admin reads every entry');
reset role;

select * from finish();
rollback;
