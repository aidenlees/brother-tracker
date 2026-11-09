-- The admin can clear a student's log: one made by mistake, or one that doesn't say what
-- happened (CLAUDE.md, security rule 3). Clearing is the admin's only write to entries:
-- creating and editing stay with the student (entries_insert, entries_update), so what
-- a log says is always the student's own. The student clears their own within 7 days;
-- the admin can clear one at any age.
--
-- The entry's retries, comments and attachment rows go with it (on delete cascade), and
-- audit_log keeps each removed row, with the admin as the actor. Like every admin write
-- it needs the MFA code once the admin has enrolled (admin_can_write).
--
-- One delete policy holding both rules, rather than a second permissive policy: Postgres
-- runs every permissive policy on each row (advisor lint 0006).

drop policy entries_delete on public.entries;

create policy entries_delete on public.entries
  for delete to authenticated
  using (
    (
      owner_id = (select auth.uid())
      and (select private.role()) = 'student'
      and created_at > now() - interval '7 days'
      and exists (
        select 1 from public.assignments a
        where a.id = entries.assignment_id and a.student_id = (select auth.uid())
      )
    )
    or (select private.admin_can_write())
  );

comment on policy entries_delete on public.entries is
  'The student clears their own log within 7 days; the admin clears any (admin never creates or edits one).';
