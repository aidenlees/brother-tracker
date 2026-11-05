-- Row-level security policies (CLAUDE.md security rules 3-7).
--
-- Every policy is scoped to `authenticated`; anon has no grants at all. Helpers are
-- wrapped in (select ...) where they don't depend on the row, so Postgres runs them
-- once per statement instead of once per row. Admin writes go through
-- admin_can_write(), which also requires MFA once the admin has enrolled.
-- Column-level grants (core_schema) already stop clients writing role, created_at,
-- owner columns and the mirrored entry columns; these policies decide the rows.

-- profiles (rule 4): read your own; viewers also read their linked students'
-- (for the person picker); the admin reads all and may edit display_name/active.

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.can_see(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.admin_can_write()))
  with check ((select public.admin_can_write()));

-- viewer_links (rule 4): admin writes; viewers see their own links.

create policy viewer_links_select on public.viewer_links
  for select to authenticated
  using (viewer_id = (select auth.uid()) or (select public.is_admin()));

create policy viewer_links_insert on public.viewer_links
  for insert to authenticated
  with check ((select public.admin_can_write()));

create policy viewer_links_delete on public.viewer_links
  for delete to authenticated
  using ((select public.admin_can_write()));

-- trackers, tracker_versions (rule 5): every active account reads; admin writes.
-- tracker_versions is written only by the trackers_snapshot trigger.

create policy trackers_select on public.trackers
  for select to authenticated
  using ((select public.role()) is not null);

create policy trackers_insert on public.trackers
  for insert to authenticated
  with check ((select public.admin_can_write()));

create policy trackers_update on public.trackers
  for update to authenticated
  using ((select public.admin_can_write()))
  with check ((select public.admin_can_write()));

create policy tracker_versions_select on public.tracker_versions
  for select to authenticated
  using ((select public.role()) is not null);

-- plan_templates (rule 5): admin only.

create policy plan_templates_select on public.plan_templates
  for select to authenticated
  using ((select public.is_admin()));

create policy plan_templates_insert on public.plan_templates
  for insert to authenticated
  with check ((select public.admin_can_write()));

create policy plan_templates_update on public.plan_templates
  for update to authenticated
  using ((select public.admin_can_write()))
  with check ((select public.admin_can_write()));

create policy plan_templates_delete on public.plan_templates
  for delete to authenticated
  using ((select public.admin_can_write()));

-- assignments, plan_items (rule 6): read with can_see(student); admin writes.

create policy assignments_select on public.assignments
  for select to authenticated
  using (public.can_see(student_id));

create policy assignments_insert on public.assignments
  for insert to authenticated
  with check ((select public.admin_can_write()));

create policy assignments_update on public.assignments
  for update to authenticated
  using ((select public.admin_can_write()))
  with check ((select public.admin_can_write()));

create policy plan_items_select on public.plan_items
  for select to authenticated
  using (exists (
    select 1 from public.assignments a
    where a.id = plan_items.assignment_id and public.can_see(a.student_id)
  ));

create policy plan_items_insert on public.plan_items
  for insert to authenticated
  with check ((select public.admin_can_write()));

create policy plan_items_update on public.plan_items
  for update to authenticated
  using ((select public.admin_can_write()))
  with check ((select public.admin_can_write()));

create policy plan_items_delete on public.plan_items
  for delete to authenticated
  using ((select public.admin_can_write()));

-- entries (rule 3): only the owning student writes, only into their own active
-- assignment, dated from the assignment's start up to today (New York). Edits and
-- deletes lock 7 days after the entry was created. Anyone who can_see the student reads.

create policy entries_select on public.entries
  for select to authenticated
  using (public.can_see(owner_id));

create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and exists (
      select 1 from public.assignments a
      where a.id = entries.assignment_id
        and a.student_id = (select auth.uid())
        and a.active
        and entries.date between a.start_date and (select public.today_ny())
    )
  );

create policy entries_update on public.entries
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
  )
  with check (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
    and exists (
      select 1 from public.assignments a
      where a.id = entries.assignment_id
        and a.student_id = (select auth.uid())
        and a.active
        and entries.date between a.start_date and (select public.today_ny())
    )
  );

create policy entries_delete on public.entries
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
    and exists (
      select 1 from public.assignments a
      where a.id = entries.assignment_id and a.student_id = (select auth.uid())
    )
  );

-- followups (rule 3): like entries, and tied to one of the student's own entries
-- with the same assignment.

create policy followups_select on public.followups
  for select to authenticated
  using (public.can_see(owner_id));

create policy followups_insert on public.followups
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and exists (
      select 1 from public.entries e
      join public.assignments a on a.id = e.assignment_id
      where e.id = followups.entry_id
        and e.owner_id = (select auth.uid())
        and e.assignment_id = followups.assignment_id
        and a.student_id = (select auth.uid())
    )
  );

create policy followups_update on public.followups
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
  )
  with check (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
  );

create policy followups_delete on public.followups
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
  );

-- attachments (rule 3): attached by the owning student to one of their own entries.
-- No updates: replace a photo by deleting and re-adding it.

create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_see(owner_id));

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and exists (
      select 1 from public.entries e
      where e.id = attachments.entry_id and e.owner_id = (select auth.uid())
    )
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.role()) = 'student'
    and created_at > now() - interval '7 days'
  );

-- comments (rule 7): anyone who can see the entry reads its comments. The admin, a
-- linked viewer, or the entry's own student may comment. Authors edit and delete
-- only their own.

create policy comments_select on public.comments
  for select to authenticated
  using (exists (
    select 1 from public.entries e
    where e.id = comments.entry_id and public.can_see(e.owner_id)
  ));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.entries e
      where e.id = comments.entry_id
        and public.can_see(e.owner_id)
        and (
          (select public.role()) = 'viewer'
          or (select public.admin_can_write())
          or e.owner_id = (select auth.uid())
        )
    )
  );

create policy comments_update on public.comments
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and (select public.role()) is not null
    and (not (select public.is_admin()) or (select public.admin_mfa_ok()))
  )
  with check (
    author_id = (select auth.uid())
    and (select public.role()) is not null
    and (not (select public.is_admin()) or (select public.admin_mfa_ok()))
  );

create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and (select public.role()) is not null
    and (not (select public.is_admin()) or (select public.admin_mfa_ok()))
  );

-- audit_log (rule 8): the admin reads; only the audit trigger writes.

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- push_subscriptions: each active account manages only its own.

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.role()) is not null)
  with check (user_id = (select auth.uid()) and (select public.role()) is not null);
