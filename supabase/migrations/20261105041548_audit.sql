-- Audit trail (CLAUDE.md security rule 8): every insert, update and delete on the
-- tables in rules 3-7 is recorded with its actor and the row before and after.
-- The function is SECURITY DEFINER because no client may write audit_log.

create function public.audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_after, v_before);
begin
  insert into public.audit_log (table_name, row_id, actor, action, before, after)
  values (
    tg_table_name,
    coalesce(
      v_row ->> 'id',
      case tg_table_name
        when 'viewer_links' then (v_row ->> 'viewer_id') || ':' || (v_row ->> 'student_id')
        when 'tracker_versions' then (v_row ->> 'tracker_id') || ':' || (v_row ->> 'field_version')
      end
    ),
    (select auth.uid()),
    lower(tg_op),
    v_before,
    v_after
  );
  return null;
end $$;

create trigger audit after insert or update or delete on public.profiles
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.viewer_links
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.trackers
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.tracker_versions
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.plan_templates
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.assignments
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.plan_items
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.entries
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.followups
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.attachments
  for each row execute function public.audit();
create trigger audit after insert or update or delete on public.comments
  for each row execute function public.audit();
