-- Followups: after the 7-day lock, status may still change.
--
-- CLAUDE.md security rule 3 locks followups like entries, but review sessions
-- (weeks 6, 12 and 20) close followups made weeks earlier. Agreed exception: a
-- followup older than 7 days keeps its label and due date and can't be deleted, but
-- the student can still mark it done or dropped.
--
-- RLS can't compare a row's old and new values, so the update policy no longer
-- checks age and a trigger refuses any other change to an old followup. The other
-- columns (entry, assignment, owner, created_at) are not client-writable at all.

drop policy followups_update on public.followups;

create policy followups_update on public.followups
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.role()) = 'student')
  with check (owner_id = (select auth.uid()) and (select public.role()) = 'student');

create function public.followups_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.created_at <= now() - interval '7 days'
     and current_user not in ('postgres', 'service_role')
     and (new.label, new.due_date) is distinct from (old.label, old.due_date) then
    raise exception 'after 7 days only a followup''s status can change'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger followups_lock
  before update on public.followups
  for each row execute function public.followups_lock();
