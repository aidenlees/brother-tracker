-- A comment shows who wrote it (CLAUDE.md security rules 4 and 7). Until now a student
-- read only their own profile and a viewer only theirs and their linked students', so
-- neither could read the name of the admin (or a viewer) who commented on a log.
--
-- Now whoever can read a comment can read its author's profile: a first name and a role
-- (rule 12). The right is worked out on each read, so it ends when the comment is
-- deleted or its entry cleared. Nothing else widens: a viewer still never reads an
-- unlinked student, and a student never reads another student.
--
-- The check is a private helper (rule 2), so the policy doesn't run the comments and
-- entries policies once per profile row.

create function private.wrote_visible_comment(person uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comments c
    join public.entries e on e.id = c.entry_id
    where c.author_id = wrote_visible_comment.person
      and private.can_see(e.owner_id)
  )
$$;
comment on function private.wrote_visible_comment(uuid) is
  'True when this person wrote a comment on an entry the caller can see.';

revoke all on function private.wrote_visible_comment(uuid) from public, anon;
grant execute on function private.wrote_visible_comment(uuid) to authenticated;

drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.can_see(id)
    or private.wrote_visible_comment(id)
  );

comment on policy profiles_select on public.profiles is
  'Your own profile, the students you can see, and whoever commented on an entry you can see.';
