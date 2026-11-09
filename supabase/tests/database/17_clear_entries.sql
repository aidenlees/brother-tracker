-- Clearing a log (CLAUDE.md, security rule 3): the student clears their own within 7
-- days; the admin can clear any student's, at any age. Clearing is the admin's only
-- write to entries: an admin still never creates or edits one. A cleared entry takes its
-- retries and comments with it, and audit_log keeps the removed rows.
begin;
\ir _helpers.psql
select plan(16);
select tests.make_world();

select tests.add_entry('recent', 'student', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('old', 'student', 'test-daily', tests.today() - 9, '{"practiced": false}');
select tests.age_entry('old', 30);
select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 2, '{"practiced": false}');
select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');
select tests.add_entry('later', 'student2', 'test-daily', tests.today() - 2, '{"practiced": false}');
insert into public.followups (entry_id, assignment_id, label, due_date, owner_id)
values (tests.id('recent'), tests.assignment('student', 'test-daily'), 'p. 3 #1', tests.today() + 1,
        tests.id('student'));
insert into public.comments (entry_id, author_id, body)
values (tests.id('recent'), tests.id('viewer'), 'Nice work.');

-- Nobody but the student and the admin can clear one.
select tests.authenticate_as('viewer');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('recent'))),
  0, 'a linked viewer cannot clear a student''s log');
reset role;
select tests.authenticate_as('viewer2');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('recent'))),
  0, 'an unlinked viewer cannot clear a student''s log');
reset role;
select tests.authenticate_as('student2');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('recent'))),
  0, 'a student cannot clear another student''s log');
reset role;
select tests.authenticate_as('noprofile');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('recent'))),
  0, 'a user without a profile cannot clear a log');
reset role;

-- The student: their own, within 7 days.
select tests.authenticate_as('student');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('old'))),
  0, 'a student cannot clear their own log after 7 days');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('mine'))),
  1, 'a student can clear their own log within 7 days');
reset role;

-- The admin: any student's, at any age, but never an edit.
select tests.authenticate_as('admin');
select is(tests.rows_affected(format($$
  update public.entries set data = '{"practiced": true, "focus": "scales"}' where id = %L
$$, tests.id('recent'))), 0, 'the admin still cannot edit a log');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('recent'))),
  1, 'the admin can clear a student''s log');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('old'))),
  1, 'the admin can clear a log older than 7 days');
reset role;

select is(tests.count_all('entries'), 2, 'only the cleared logs are gone');
select is((select count(*)::int from public.followups where entry_id = tests.id('recent')), 0,
  'a cleared log takes its retries with it');
select is((select count(*)::int from public.comments where entry_id = tests.id('recent')), 0,
  '... and its comments');
select ok((
  select before ->> 'id' = tests.id('recent')::text and after is null from public.audit_log
  where table_name = 'entries' and action = 'delete' and actor = tests.id('admin')
    and row_id = tests.id('recent')::text
), 'audit_log keeps the cleared log, with the admin as the actor');
select ok(exists (
  select 1 from public.audit_log
  where table_name = 'followups' and action = 'delete' and actor = tests.id('admin')
), '... and its retries');

-- Once the admin has MFA, clearing needs the code, like every other admin write.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('admin'), 'Phone', 'totp', 'verified', now(), now());
select tests.authenticate_as('admin', 'aal1');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('theirs'))),
  0, 'an admin with MFA cannot clear a log without the code');
reset role;
select tests.authenticate_as('admin', 'aal2');
select is(tests.rows_affected(format($$delete from public.entries where id = %L$$, tests.id('theirs'))),
  1, '... and can with it');
reset role;

select * from finish();
rollback;
