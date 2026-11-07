-- A plan_checklist field: one checkbox per item its plan item lists, named by the
-- field's `optionsFrom` ("plan.problems"). The math log asks "Which problems did you
-- struggle with?" with it (CLAUDE.md, "Field types").
--
--   * public.field_check_plan_checklist: a list of distinct strings, each one on the
--     entry's plan item's list.
--   * entries_validate (otherwise unchanged from 20261105041546_triggers.sql):
--       - hands each check the entry's plan item details, as field -> 'plan', so a
--         check can read lists that differ from session to session;
--       - hides a field whose optionsFrom list is missing or empty, dropping its value
--         as showIf does (reviews and reading days list no problems);
--       - fills the struggled column from a list as "p. 31 #4, p. 32 #6".
--
-- Like every field check, the new function runs only inside the validation trigger;
-- the default privileges (lockdown_defaults) leave clients without EXECUTE.

create function public.field_check_plan_checklist(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v_list jsonb;
begin
  if coalesce(field ->> 'optionsFrom', '') !~ '^plan\.[a-z][a-z0-9_]*$' then
    return 'has no list to choose from';
  end if;
  if jsonb_typeof(value) <> 'array'
     or exists (select 1 from jsonb_array_elements(value) e where jsonb_typeof(e) <> 'string') then
    return 'must be a list of items from the plan';
  end if;
  v_list := field -> 'plan' -> substr(field ->> 'optionsFrom', 6);
  if jsonb_typeof(v_list) is distinct from 'array' then
    return 'has nothing to choose from on this day';
  end if;
  if (select count(*) <> count(distinct e) from jsonb_array_elements_text(value) e) then
    return 'lists an item twice';
  end if;
  if exists (select 1 from jsonb_array_elements_text(value) e where not (v_list ? e)) then
    return 'lists an item this day doesn''t have';
  end if;
  return null;
end $$;

create or replace function public.entries_validate()
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
  v_list jsonb;
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
    if v_visible and v_field ? 'optionsFrom' then
      v_list := case when v_field ->> 'optionsFrom' like 'plan.%'
        then v_details -> substr(v_field ->> 'optionsFrom', 6) end;
      v_visible := case when jsonb_typeof(v_list) = 'array' then jsonb_array_length(v_list) > 0 else false end;
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
      into v_problem using v_value, v_field || jsonb_build_object('plan', v_details);
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
  new.struggled := case jsonb_typeof(new.data -> 'struggled')
    when 'array' then (
      select string_agg(e.item, ', ' order by e.n)
      from jsonb_array_elements_text(new.data -> 'struggled') with ordinality e(item, n)
    )
    else new.data ->> 'struggled'
  end;
  new.minutes := case
    when public.field_is_whole(new.data -> 'minutes', 0, 1440) then (new.data ->> 'minutes')::int
  end;
  return new;
end $$;
