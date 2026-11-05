-- Move the security helpers out of the exposed Data API (CLAUDE.md security rule 2;
-- cloud advisor lint 0029).
--
-- role(), is_admin(), can_see(), admin_mfa_ok() and admin_can_write() are SECURITY
-- DEFINER. In `public`, PostgREST served each one at /rest/v1/rpc/<name>. They only
-- answer questions about the caller, but no client needs them, so they move to
-- `private`, which the Data API does not expose (supabase/config.toml, [api] schemas).
--
-- Policies keep working unchanged: a policy stores the function's OID, not its name,
-- so it follows the function into the new schema. Function bodies are stored as text,
-- so the four that call a helper by name are re-created here to call private.*.
-- Each function keeps its privileges when it moves: anon still cannot execute the
-- helpers, and authenticated still can, because policies run them as the caller.

create schema private;
comment on schema private is
  'Not exposed by the Data API. Security helpers that policies call; clients cannot reach them.';
revoke all on schema private from public;
-- authenticated needs USAGE because SECURITY INVOKER code (assign_tracker) names the
-- helpers; the schema is still unreachable over HTTP.
grant usage on schema private to authenticated, service_role;

alter function public.role() set schema private;
alter function public.is_admin() set schema private;
alter function public.can_see(uuid) set schema private;
alter function public.admin_mfa_ok() set schema private;
alter function public.admin_can_write() set schema private;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.role() = 'admin', false)
$$;

create or replace function private.can_see(student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case private.role()
    when 'admin' then true
    when 'student' then can_see.student = (select auth.uid())
    when 'viewer' then exists (
      select 1
      from public.viewer_links l
      where l.viewer_id = (select auth.uid()) and l.student_id = can_see.student
    )
    else false
  end
$$;

create or replace function private.admin_can_write()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() and private.admin_mfa_ok()
$$;

-- Same body as 20261105041549_assign_tracker.sql, with the admin check renamed.
create or replace function public.assign_tracker(
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
  if not (private.admin_can_write() or current_user in ('postgres', 'service_role')) then
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
