-- One SQL check per field type (CLAUDE.md, "Field types").
--
-- entries_validate calls public.field_check_<type>(value, field) for every visible
-- field that has a value. Each returns null when the value is valid, or a short
-- reason when it is not. `field` is the field definition from tracker_versions.fields.
--
-- Adding a field type = one registry file in src/trackers/fields/ plus one function
-- named field_check_<type> here (in a new migration). Nothing else changes.
--
-- These run only inside the SECURITY DEFINER validation trigger, so no client role
-- is granted EXECUTE on them.

create function public.field_option_keys(field jsonb)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(o ->> 'key'), '{}')
  from jsonb_array_elements(coalesce(field -> 'options', '[]')) o
$$;

create function public.field_is_whole(value jsonb, min numeric, max numeric)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  if value is null or jsonb_typeof(value) <> 'number' then
    return false;
  end if;
  return value::numeric = trunc(value::numeric)
     and (min is null or value::numeric >= min)
     and (max is null or value::numeric <= max);
end $$;

create function public.field_check_number(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) <> 'number' then
    return 'must be a number';
  elsif field ? 'min' and value::numeric < (field ->> 'min')::numeric then
    return 'is below the minimum';
  elsif field ? 'max' and value::numeric > (field ->> 'max')::numeric then
    return 'is above the maximum';
  end if;
  return null;
end $$;

create function public.field_check_counter(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case when not public.field_is_whole(value, 0, null) then 'must be a whole number, 0 or more' end
$$;

create function public.field_check_tally_group(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  e record;
begin
  if jsonb_typeof(value) <> 'object' then
    return 'must be a set of counts';
  end if;
  for e in select * from jsonb_each(value) loop
    if not (e.key = any (public.field_option_keys(field))) then
      return format('has no option "%s"', e.key);
    elsif not public.field_is_whole(e.value, 0, null) then
      return 'counts must be whole numbers, 0 or more';
    end if;
  end loop;
  return null;
end $$;

create function public.field_check_checkbox(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(value) <> 'boolean' then 'must be checked or unchecked' end
$$;

create function public.field_check_checklist(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  e record;
begin
  if jsonb_typeof(value) <> 'object' then
    return 'must be a checklist';
  end if;
  for e in select * from jsonb_each(value) loop
    if not (e.key = any (public.field_option_keys(field))) then
      return format('has no item "%s"', e.key);
    elsif jsonb_typeof(e.value) <> 'boolean' then
      return 'items must be checked or unchecked';
    end if;
  end loop;
  return null;
end $$;

create function public.field_check_select(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'string' then 'must be one of the options'
    when not ((value #>> '{}') = any (public.field_option_keys(field))) then 'must be one of the options'
  end
$$;

create function public.field_check_multi_select(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if jsonb_typeof(value) <> 'array' then
    return 'must be a list of options';
  end if;
  for v in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (public.field_option_keys(field))) then
      return 'must use only the field''s options';
    end if;
  end loop;
  if jsonb_array_length(value) <> (select count(distinct x) from jsonb_array_elements(value) x) then
    return 'lists an option twice';
  end if;
  return null;
end $$;

create function public.field_check_short_text(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'string' then 'must be text'
    when char_length(value #>> '{}') > 200 then 'must be 200 characters or fewer'
  end
$$;

create function public.field_check_long_text(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'string' then 'must be text'
    when char_length(value #>> '{}') > 5000 then 'must be 5000 characters or fewer'
  end
$$;

create function public.field_check_duration(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when not public.field_is_whole(value, 0, 1440) then 'must be whole minutes between 0 and 1440'
  end
$$;

create function public.field_check_rating_1_5(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case when not public.field_is_whole(value, 1, 5) then 'must be a rating from 1 to 5' end
$$;

create function public.field_check_page_range(value jsonb, field jsonb)
returns text
language plpgsql immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) <> 'object'
     or not public.field_is_whole(value -> 'start', 1, null)
     or not public.field_is_whole(value -> 'end', 1, null) then
    return 'must be a start and end page';
  elsif (value ->> 'end')::numeric < (value ->> 'start')::numeric then
    return 'must end on or after its first page';
  end if;
  return null;
end $$;

create function public.field_check_yes_no(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(value) <> 'boolean' then 'must be yes or no' end
$$;

-- A photo field holds the id of its row in public.attachments.
create function public.field_check_photo(value jsonb, field jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'string'
      or (value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then 'must be an uploaded photo'
  end
$$;
