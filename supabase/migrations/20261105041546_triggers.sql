-- Integrity triggers: entry validation, tracker versioning, role checks on links
-- and assignments, and timestamps. Trigger functions run whatever the caller's
-- grants; the ones that read other users' rows are SECURITY DEFINER.

-- Entries are validated against their tracker's fields --------------------------
--
-- For each field in tracker_versions.fields (for the entry's field_version):
--   * showIf: every {key: value} must match. "plan.<detail>" reads the plan item's
--     details, e.g. {"plan.reading_only": false}. A hidden field keeps no value.
--   * required: the value must be present and, for text, not blank.
--   * type: public.field_check_<type>(value, field) must return null.
-- Keys the tracker does not define are rejected. Finally did, struggled and minutes
-- are copied from data into their columns; data stays the source of truth.

create function public.entries_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tracker uuid;
  v_fields jsonb;
  v_details jsonb := '{}';
  v_field jsonb;
  v_key text;
  v_label text;
  v_value jsonb;
  v_visible boolean;
  v_condition record;
  v_problem text;
  v_known text[] := '{}';
begin
  select a.tracker_id into v_tracker
  from public.assignments a
  where a.id = new.assignment_id;
  if v_tracker is null then
    raise exception 'unknown assignment' using errcode = 'foreign_key_violation';
  end if;

  select v.fields into v_fields
  from public.tracker_versions v
  where v.tracker_id = v_tracker and v.field_version = new.field_version;
  if v_fields is null then
    raise exception 'this tracker has no field version %', new.field_version
      using errcode = 'check_violation';
  end if;

  if new.plan_item_id is not null then
    select p.details into v_details
    from public.plan_items p
    where p.id = new.plan_item_id and p.assignment_id = new.assignment_id;
    if not found then
      raise exception 'the plan item belongs to another assignment'
        using errcode = 'check_violation';
    end if;
  end if;

  for v_field in select * from jsonb_array_elements(v_fields) loop
    v_key := v_field ->> 'key';
    v_label := coalesce(v_field ->> 'label', v_key);
    v_known := v_known || v_key;

    v_visible := true;
    if jsonb_typeof(v_field -> 'showIf') = 'object' then
      for v_condition in select * from jsonb_each(v_field -> 'showIf') loop
        if v_condition.key like 'plan.%' then
          v_visible := v_visible
            and (v_details -> substr(v_condition.key, 6)) is not distinct from v_condition.value;
        else
          v_visible := v_visible
            and (new.data -> v_condition.key) is not distinct from v_condition.value;
        end if;
      end loop;
    end if;
    if not v_visible then
      new.data := new.data - v_key;
      continue;
    end if;

    v_value := new.data -> v_key;
    if v_value is null or v_value = 'null'::jsonb
       or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '') then
      if coalesce((v_field ->> 'required')::boolean, false) then
        raise exception '"%" is required', v_label using errcode = 'check_violation';
      end if;
      new.data := new.data - v_key;
      continue;
    end if;

    if coalesce(v_field ->> 'type', '') !~ '^[a-z0-9_]+$'
       or to_regprocedure(format('public.field_check_%s(jsonb, jsonb)', v_field ->> 'type')) is null then
      raise exception 'unknown field type "%"', v_field ->> 'type' using errcode = 'check_violation';
    end if;
    execute format('select public.%I($1, $2)', 'field_check_' || (v_field ->> 'type'))
      into v_problem using v_value, v_field;
    if v_problem is not null then
      raise exception '"%" %', v_label, v_problem using errcode = 'check_violation';
    end if;
  end loop;

  select string_agg(k, ', ' order by k) into v_problem
  from jsonb_object_keys(new.data) k
  where not (k = any (v_known));
  if v_problem is not null then
    raise exception 'this tracker has no field %', v_problem using errcode = 'check_violation';
  end if;

  new.did := new.data ->> 'did';
  new.struggled := new.data ->> 'struggled';
  new.minutes := case
    when public.field_is_whole(new.data -> 'minutes', 0, 1440) then (new.data ->> 'minutes')::int
  end;
  return new;
end $$;

create trigger entries_validate
  before insert or update on public.entries
  for each row execute function public.entries_validate();

-- Timestamps -----------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create function public.comments_edited_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger comments_edited_at
  before update on public.comments
  for each row execute function public.comments_edited_at();

-- Tracker versions -------------------------------------------------------------------
--
-- field_version is owned by the database: 1 on insert, +1 whenever fields change,
-- unchanged otherwise. Each version's fields are kept in tracker_versions so entries
-- logged against an older version still validate and render.

create function public.trackers_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.field_version := 1;
  elsif new.fields is distinct from old.fields then
    new.field_version := old.field_version + 1;
  else
    new.field_version := old.field_version;
  end if;
  return new;
end $$;

create trigger trackers_version
  before insert or update on public.trackers
  for each row execute function public.trackers_version();

create function public.trackers_snapshot()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.field_version <> old.field_version then
    insert into public.tracker_versions (tracker_id, field_version, fields)
    values (new.id, new.field_version, new.fields);
  end if;
  return null;
end $$;

create trigger trackers_snapshot
  after insert or update on public.trackers
  for each row execute function public.trackers_snapshot();

-- Roles in links and assignments -------------------------------------------------------

create function public.viewer_links_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select p.role from public.profiles p where p.id = new.viewer_id) is distinct from 'viewer'
     or (select p.role from public.profiles p where p.id = new.student_id) is distinct from 'student' then
    raise exception 'a viewer link must join a viewer to a student' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger viewer_links_check
  before insert or update on public.viewer_links
  for each row execute function public.viewer_links_check();

create function public.assignments_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select p.role from public.profiles p where p.id = new.student_id) is distinct from 'student' then
    raise exception 'only a student can be assigned a tracker' using errcode = 'check_violation';
  end if;
  if new.plan_template_id is not null and not exists (
    select 1 from public.plan_templates t
    where t.id = new.plan_template_id and t.tracker_id = new.tracker_id
  ) then
    raise exception 'that plan template belongs to another tracker' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger assignments_check
  before insert or update on public.assignments
  for each row execute function public.assignments_check();
