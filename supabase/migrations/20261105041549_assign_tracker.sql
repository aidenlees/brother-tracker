-- assign_tracker (CLAUDE.md, "Data model"): gives a student a tracker.
--
--   * Creates the assignment. If the tracker has a plan template, copies its items
--     into plan_items, shifting every date by (start - template.first_date).
--   * Idempotent: if the student already has the tracker, returns that assignment
--     and changes nothing.
--   * `template` picks a plan template when a tracker has several; left out, the
--     tracker's only template is used.
--   * Callers: an admin (MFA-checked), or postgres / the service role, which is how
--     the first-setup SQL in the dashboard and the admin-users function call it.
--
-- SECURITY INVOKER: an admin's inserts still pass through RLS.

create function public.assign_tracker(
  student uuid,
  tracker_slug text,
  start date,
  template uuid default null
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_tracker uuid;
  v_assignment uuid;
  v_template public.plan_templates%rowtype;
  v_templates int;
begin
  if not (public.admin_can_write() or current_user in ('postgres', 'service_role')) then
    raise exception 'only an admin can assign trackers' using errcode = 'insufficient_privilege';
  end if;

  select t.id into v_tracker
  from public.trackers t
  where t.slug = tracker_slug and not t.archived;
  if v_tracker is null then
    raise exception 'no active tracker "%"', tracker_slug using errcode = 'no_data_found';
  end if;

  select a.id into v_assignment
  from public.assignments a
  where a.tracker_id = v_tracker and a.student_id = assign_tracker.student;
  if v_assignment is not null then
    return v_assignment;
  end if;

  if template is not null then
    select * into v_template
    from public.plan_templates p
    where p.id = template and p.tracker_id = v_tracker;
    if not found then
      raise exception 'that plan template does not belong to "%"', tracker_slug
        using errcode = 'no_data_found';
    end if;
  else
    select count(*) into v_templates from public.plan_templates p where p.tracker_id = v_tracker;
    if v_templates > 1 then
      raise exception '"%" has % plan templates; pass the one to use', tracker_slug, v_templates
        using errcode = 'invalid_parameter_value';
    end if;
    select * into v_template from public.plan_templates p where p.tracker_id = v_tracker;
  end if;

  insert into public.assignments (tracker_id, student_id, plan_template_id, start_date)
  values (v_tracker, assign_tracker.student, v_template.id, start)
  returning id into v_assignment;

  if v_template.id is not null then
    insert into public.plan_items (assignment_id, date, title, details, sort)
    select v_assignment,
           (x.item ->> 'date')::date + (start - v_template.first_date),
           x.item ->> 'title',
           coalesce(x.item -> 'details', '{}'),
           coalesce((x.item ->> 'sort')::int, x.n::int)
    from jsonb_array_elements(v_template.items) with ordinality as x (item, n);
  end if;

  return v_assignment;
end $$;

revoke all on function public.assign_tracker(uuid, text, date, uuid) from public, anon;
grant execute on function public.assign_tracker(uuid, text, date, uuid) to authenticated, service_role;
