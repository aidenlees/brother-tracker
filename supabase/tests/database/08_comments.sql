-- comments (CLAUDE.md security rule 7): admin, linked viewers and the entry's own
-- student may comment; authors edit and delete only their own.
begin;
\ir _helpers.psql
select plan(14);
select tests.make_world();

select tests.add_entry('mine', 'student', 'test-daily', tests.today() - 1,
  '{"practiced": true, "focus": "bow distribution"}');
select tests.add_entry('theirs', 'student2', 'test-daily', tests.today() - 1, '{"practiced": false}');

select tests.authenticate_as('viewer');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Lovely tone tonight.')$$,
  tests.id('mine')), 'a linked viewer can comment on the student''s entry');
select throws_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Hello')$$,
  tests.id('theirs')), '42501', null, 'a viewer cannot comment on an unlinked student''s entry');
reset role;

select tests.authenticate_as('admin');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Try the shift slower first.')$$,
  tests.id('mine')), 'the admin can comment');
reset role;

select tests.authenticate_as('student');
select lives_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Thanks, will do.')$$,
  tests.id('mine')), 'a student can reply on their own entry');
select throws_ok(format($$insert into public.comments (entry_id, body) values (%L, 'Hi')$$,
  tests.id('theirs')), '42501', null, 'a student cannot comment on someone else''s entry');
select throws_ok(format($$
  insert into public.comments (entry_id, body, author_id) values (%L, 'Signed: the admin', %L)
$$, tests.id('mine'), tests.id('admin')), '42501', null, 'a comment cannot claim another author');
select is((select count(*)::int from public.comments), 3,
  'a student reads every comment on their own entries');
select is(tests.rows_affected($$update public.comments set body = 'Edited' where body = 'Lovely tone tonight.'$$),
  0, 'a student cannot edit someone else''s comment');
select is(tests.rows_affected($$update public.comments set body = 'Thanks! Will do.' where author_id = auth.uid()$$),
  1, 'an author can edit their own comment');
select ok((select edited_at is not null from public.comments where author_id = auth.uid()),
  '... and the edit is time-stamped');
select is(tests.rows_affected($$delete from public.comments where body = 'Try the shift slower first.'$$),
  0, 'a student cannot delete someone else''s comment');
select is(tests.rows_affected($$delete from public.comments where author_id = auth.uid()$$),
  1, 'an author can delete their own comment');
reset role;

select tests.authenticate_as('viewer2');
select is((select count(*)::int from public.comments), 0, 'an unlinked viewer reads no comments');
reset role;

select tests.authenticate_as('viewer');
select throws_ok($$update public.comments set author_id = auth.uid()$$, '42501', null,
  'a comment''s author cannot be changed');
reset role;

select * from finish();
rollback;
