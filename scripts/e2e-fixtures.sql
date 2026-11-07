-- LOCAL ONLY. pnpm e2e:fixtures runs this against the local stack after
-- `supabase db reset` (fake accounts) and `pnpm seed` (trackers, plan template).
-- It refuses to run anywhere the fake @example.test accounts don't exist.
--
-- Dates follow New York "today", like the database (public.today_ny()), so the
-- end-to-end tests always find:
--
--   student@example.test
--     math    starts so that session 6 (practice) is today. Sessions 1-4 are past and
--             not logged (backfill). Session 5 (two days ago) is logged, with a retry
--             due today.
--     violin  started 10 days ago; the day 8 days back is logged and locked (logged
--             8 days ago).
--   student2@example.test
--     math    starts so that session 21 (a review session) is today. Session 20
--             (yesterday) is logged, with one retry overdue and one not due yet.
--     violin  starts in 3 days (a card before its start date).
--
-- Re-running it rebuilds the same picture: the two students' assignments (and so
-- their entries and followups) are deleted first.

do $fixtures$
declare
  v_student uuid := (select id from auth.users where email = 'student@example.test');
  v_student2 uuid := (select id from auth.users where email = 'student2@example.test');
  v_today date := public.today_ny();
  v_first date;
  v_math uuid;
  v_violin uuid;
  v_math2 uuid;
  v_version int;
  v_entry uuid;
  v_item record;

  -- The plan template's date for a session number.
  v_offset_6 int;
  v_offset_21 int;
begin
  if v_student is null or v_student2 is null then
    raise exception 'The fake local accounts are missing: run `pnpm supabase db reset` first.';
  end if;

  select t.first_date, k.field_version into v_first, v_version
  from public.plan_templates t
  join public.trackers k on k.id = t.tracker_id
  where k.slug = 'singapore-math';
  if v_first is null then
    raise exception 'No math plan template: run `pnpm seed` first.';
  end if;

  select (i ->> 'date')::date - v_first into v_offset_6
  from public.plan_templates t, jsonb_array_elements(t.items) i
  where t.first_date = v_first and (i -> 'details' ->> 'session')::int = 6;
  select (i ->> 'date')::date - v_first into v_offset_21
  from public.plan_templates t, jsonb_array_elements(t.items) i
  where t.first_date = v_first and (i -> 'details' ->> 'session')::int = 21;

  delete from public.assignments where student_id in (v_student, v_student2);

  v_math := public.assign_tracker(v_student, 'singapore-math', v_today - v_offset_6);
  v_violin := public.assign_tracker(v_student, 'violin', v_today - 10);
  v_math2 := public.assign_tracker(v_student2, 'singapore-math', v_today - v_offset_21);
  perform public.assign_tracker(v_student2, 'violin', v_today + 3);

  -- student: session 5, logged two days ago, with a retry due today.
  select id, date into v_item from public.plan_items
  where assignment_id = v_math and (details ->> 'session')::int = 5;
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data, owner_id)
  values (v_math, v_item.id, v_version, v_item.date, jsonb_build_object(
    'completed', true,
    'struggled', jsonb_build_array('p. 30 #2'),
    'minutes', 35
  ), v_student)
  returning id into v_entry;
  update public.entries set created_at = now() - interval '2 days' where id = v_entry;
  insert into public.followups (entry_id, assignment_id, label, due_date, owner_id, created_at)
  values (v_entry, v_math, 'p. 30 #2', v_today, v_student, now() - interval '2 days');

  -- student: violin practice 8 days ago, logged then, so now locked.
  insert into public.entries (assignment_id, field_version, date, data, owner_id)
  values (v_violin, (select field_version from public.trackers where slug = 'violin'),
          v_today - 8, '{"practiced": true, "focus": "long, even bows on the A string"}', v_student)
  returning id into v_entry;
  update public.entries set created_at = now() - interval '8 days' where id = v_entry;

  -- student2: session 20, yesterday, with one retry overdue and one not due yet.
  -- (Their labels are problems on session 20's pages, as the log flow would make them.)
  select id, date into v_item from public.plan_items
  where assignment_id = v_math2 and (details ->> 'session')::int = 20;
  insert into public.entries (assignment_id, plan_item_id, field_version, date, data, owner_id)
  values (v_math2, v_item.id, v_version, v_item.date, jsonb_build_object(
    'completed', true,
    'struggled', jsonb_build_array('p. 69 #11', 'p. 70 #13'),
    'minutes', 40
  ), v_student2)
  returning id into v_entry;
  update public.entries set created_at = now() - interval '1 day' where id = v_entry;
  insert into public.followups (entry_id, assignment_id, label, due_date, owner_id, created_at) values
    (v_entry, v_math2, 'p. 69 #11', v_today - 1, v_student2, now() - interval '1 day'),
    (v_entry, v_math2, 'p. 70 #13', v_today + 1, v_student2, now() - interval '1 day');
end $fixtures$;
