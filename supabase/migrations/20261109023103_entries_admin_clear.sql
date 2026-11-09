-- The admin can clear a student's log: one made by mistake, or one that doesn't say what
-- happened (CLAUDE.md, security rule 3). Clearing is the admin's only write to entries:
-- creating and editing stay with the student (entries_insert, entries_update), so what
-- a log says is always the student's own. The student clears their own within 7 days
-- (entries_delete); the admin can clear one at any age.
--
-- The entry's retries, comments and attachment rows go with it (on delete cascade), and
-- audit_log keeps each removed row, with the admin as the actor. Like every admin write
-- it needs the MFA code once the admin has enrolled (admin_can_write).
--
-- Policies are permissive, so this adds to entries_delete rather than replacing it.

create policy entries_delete_admin on public.entries
  for delete to authenticated
  using ((select private.admin_can_write()));

comment on policy entries_delete_admin on public.entries is
  'The admin clears a student''s log (any age); the admin never creates or edits one.';
