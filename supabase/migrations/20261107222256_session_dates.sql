-- Moves several plan items to new dates in one transaction: the plan editor's
-- "Move later" (a catch-up day) and "Move earlier" shift a session and every one after
-- it, and a half-shifted plan would be worse than none. The editor works out the dates
-- (keeping the plan's weekday rhythm); this only applies them, atomically.
--
-- SECURITY INVOKER: it runs as the caller, so the plan_items policies decide (rule 6):
-- the admin moves sessions; for anyone else no row qualifies and nothing changes.

create function public.set_session_dates(moves jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if jsonb_typeof(moves) is distinct from 'array'
     or exists (
       select 1 from jsonb_array_elements(moves) m
       where jsonb_typeof(m) <> 'object' or (m ->> 'id') is null or (m ->> 'date') is null
     ) then
    raise exception 'moves must be a list of {"id": …, "date": …}'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.plan_items p
  set date = (m ->> 'date')::date
  from jsonb_array_elements(moves) m
  where p.id = (m ->> 'id')::uuid;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.set_session_dates(jsonb) is
  'Sets the dates of several plan items at once, as the caller (RLS: admin only). Returns the rows changed.';

revoke all on function public.set_session_dates(jsonb) from public, anon;
grant execute on function public.set_session_dates(jsonb) to authenticated;
