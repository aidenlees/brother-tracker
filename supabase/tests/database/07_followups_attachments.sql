-- followups and attachments follow the same rules as entries (CLAUDE.md security rule 3).
begin;
\ir _helpers.psql
select plan(17);
select tests.make_world();

select tests.add_entry('mine', 'student', 'test-plan', tests.today() - 1,
  '{"checklist": {"attempted": true}, "outcomes": {"I": 1, "H": 1}, "minutes": 20,
    "did": "pp. 5-6", "struggled": "p. 6 #4"}', tests.plan_item('student', 2));
select tests.add_entry('old', 'student', 'test-plan', tests.today() - 9,
  '{"checklist": {"attempted": true}, "minutes": 20, "did": "pp. 1-4", "struggled": "None"}',
  tests.plan_item('student', 1));
select tests.age_entry('old', 8);
select tests.add_entry('theirs', 'student2', 'test-plan', tests.today() - 1,
  '{"checklist": {}, "minutes": 20, "did": "pp. 5-6", "struggled": "p. 5 #2"}',
  tests.plan_item('student2', 2));

-- Followups
select tests.authenticate_as('student');
select lives_ok(format($$
  insert into public.followups (entry_id, assignment_id, label, due_date)
  values (%L, %L, 'p. 6 #4', tests.today() + 1)
$$, tests.id('mine'), tests.assignment('student', 'test-plan')),
  'a student can add a followup to their own entry');
select throws_ok(format($$
  insert into public.followups (entry_id, assignment_id, label, due_date)
  values (%L, %L, 'p. 5 #2', tests.today() + 1)
$$, tests.id('theirs'), tests.assignment('student2', 'test-plan')), '42501', null,
  'a student cannot add a followup to someone else''s entry');
select throws_ok(format($$
  insert into public.followups (entry_id, assignment_id, label, due_date)
  values (%L, %L, 'p. 6 #5', tests.today() + 1)
$$, tests.id('mine'), tests.assignment('student', 'test-daily')), '42501', null,
  'a followup must use its entry''s assignment');
select is(tests.rows_affected($$update public.followups set status = 'done' where label = 'p. 6 #4'$$),
  1, 'a student can close their own recent followup');
reset role;

insert into public.followups (entry_id, assignment_id, label, due_date, owner_id, created_at)
values (tests.id('old'), tests.assignment('student', 'test-plan'), 'p. 3 #1', tests.today() - 7,
        tests.id('student'), now() - interval '8 days');
select tests.authenticate_as('student');
select is(tests.rows_affected($$update public.followups set status = 'done' where label = 'p. 3 #1'$$),
  0, 'a followup older than 7 days is locked');
reset role;

select tests.authenticate_as('admin');
select throws_ok(format($$
  insert into public.followups (entry_id, assignment_id, label, due_date, owner_id)
  values (%L, %L, 'p. 6 #6', tests.today() + 1, %L)
$$, tests.id('mine'), tests.assignment('student', 'test-plan'), tests.id('student')), '42501', null,
  'the admin cannot add followups');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from public.followups), 2, 'a linked viewer reads the student''s followups');
select throws_ok(format($$
  insert into public.followups (entry_id, assignment_id, label, due_date)
  values (%L, %L, 'p. 6 #7', tests.today() + 1)
$$, tests.id('mine'), tests.assignment('student', 'test-plan')), '42501', null,
  'a viewer cannot add followups');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from public.followups), 0, 'an unlinked viewer reads no followups');
reset role;

-- Attachments: storage_path is {owner_id}/{entry_id}/{uuid}.jpg
select tests.authenticate_as('student');
select lives_ok(format($$
  insert into public.attachments (entry_id, storage_path) values (%L, %L)
$$, tests.id('mine'), tests.id('student') || '/' || tests.id('mine') || '/' || gen_random_uuid() || '.jpg'),
  'a student can attach a photo to their own entry');
select throws_ok(format($$
  insert into public.attachments (entry_id, storage_path) values (%L, %L)
$$, tests.id('mine'), tests.id('student2') || '/' || tests.id('mine') || '/' || gen_random_uuid() || '.jpg'),
  '23514', null, 'an attachment path must start with its owner and entry');
select throws_ok(format($$
  insert into public.attachments (entry_id, storage_path) values (%L, %L)
$$, tests.id('theirs'), tests.id('student') || '/' || tests.id('theirs') || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a student cannot attach to someone else''s entry');
select throws_ok(format($$
  update public.attachments set storage_path = storage_path where entry_id = %L
$$, tests.id('mine')), '42501', null, 'attachments cannot be edited');
reset role;

insert into public.attachments (entry_id, storage_path, owner_id, created_at)
values (tests.id('old'), tests.id('student') || '/' || tests.id('old') || '/' || gen_random_uuid() || '.jpg',
        tests.id('student'), now() - interval '8 days');
select tests.authenticate_as('student');
select is(tests.rows_affected(format($$delete from public.attachments where entry_id = %L$$, tests.id('old'))),
  0, 'an attachment older than 7 days cannot be deleted');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from public.attachments), 2, 'a linked viewer reads the student''s attachments');
select throws_ok(format($$
  insert into public.attachments (entry_id, storage_path) values (%L, %L)
$$, tests.id('mine'), tests.id('viewer') || '/' || tests.id('mine') || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a viewer cannot attach photos');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from public.attachments), 0, 'an unlinked viewer reads no attachments');
reset role;

select * from finish();
rollback;
