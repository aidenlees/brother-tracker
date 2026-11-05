-- Security helpers used by every policy (CLAUDE.md security rule 2).
--
-- SECURITY DEFINER so they can read profiles, viewer_links and MFA factors whatever
-- the caller's own RLS; STABLE; search_path pinned to '' so every name is
-- schema-qualified and cannot be hijacked. They only answer questions about the
-- caller (auth.uid()), so exposing them to signed-in users reveals nothing new.

create function public.role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;
comment on function public.role() is
  'The caller''s role, or null when they have no active profile.';

create function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.role() = 'admin', false)
$$;

create function public.can_see(student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.role()
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
comment on function public.can_see(uuid) is
  'True when the caller is that student, an admin, or a viewer linked to that student.';

create function public.admin_mfa_ok()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
$$;
comment on function public.admin_mfa_ok() is
  'False only when the caller has a verified MFA factor and this session has not passed it (aal2).';

create function public.admin_can_write()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() and public.admin_mfa_ok()
$$;
comment on function public.admin_can_write() is
  'Gate for every admin write: an active admin whose session satisfies MFA once enrolled.';

create function public.today_ny()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date
$$;
comment on function public.today_ny() is
  '"Today" for every date rule (CLAUDE.md, Dates). Never derive the day from UTC.';

revoke all on function
  public.role(), public.is_admin(), public.can_see(uuid), public.admin_mfa_ok(),
  public.admin_can_write(), public.today_ny()
  from public, anon;
grant execute on function
  public.role(), public.is_admin(), public.can_see(uuid), public.admin_mfa_ok(),
  public.admin_can_write(), public.today_ny()
  to authenticated, service_role;
