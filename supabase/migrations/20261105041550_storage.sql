-- Storage for notebook photos (CLAUDE.md security rule 9).
--
-- Bucket `attachments` is private: every read goes through a signed URL (the client
-- asks for 10 minutes or less). Objects are named {owner_id}/{entry_id}/{uuid}.jpg
-- and the policies mirror rule 3: only the owning student uploads, only for one of
-- their own entries; anyone who can_see the student reads; deletes lock after 7
-- days; nothing is overwritten in place.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The owner and entry ids from a well-formed object name, else null.
create function public.attachment_path_part(name text, part int)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when name ~ ('^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
                 '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
                 '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    then split_part(name, '/', part)::uuid
  end
$$;

revoke all on function public.attachment_path_part(text, int) from public, anon;
grant execute on function public.attachment_path_part(text, int) to authenticated, service_role;

create policy attachments_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_see(public.attachment_path_part(name, 1))
  );

create policy attachments_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (select public.role()) = 'student'
    and public.attachment_path_part(name, 1) = (select auth.uid())
    and exists (
      select 1 from public.entries e
      where e.id = public.attachment_path_part(name, 2) and e.owner_id = (select auth.uid())
    )
  );

create policy attachments_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (select public.role()) = 'student'
    and public.attachment_path_part(name, 1) = (select auth.uid())
    and created_at > now() - interval '7 days'
  );
