-- Storage for the printed book's pages (CLAUDE.md security rule 9), so a session can
-- show the pages to work on.
--
-- Bucket `book-pages` is private: every read goes through a signed URL (the client asks
-- for 10 minutes or less). Objects are named {tracker slug}/{printed page}.webp, the
-- page as three digits ("singapore-math/031.webp"). `pnpm book:pages` renders them from
-- the book (which never enters the repo) and uploads them.
--
--   * Read: anyone who can see a student with an active assignment to that tracker
--     (the student, a linked viewer), and the admin.
--   * Write: the admin only (the upload script uses the service role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-pages', 'book-pages', false, 2097152, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller may read the book of the tracker with this slug.
create function private.can_read_book(slug text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.assignments a
    join public.trackers t on t.id = a.tracker_id
    where t.slug = can_read_book.slug
      and a.active
      and private.can_see(a.student_id)
  )
$$;
comment on function private.can_read_book(text) is
  'True for the admin, and for whoever can see a student actively assigned the tracker with this slug.';

revoke all on function private.can_read_book(text) from public, anon;
grant execute on function private.can_read_book(text) to authenticated;

-- "singapore-math/031.webp": a tracker slug, then a three-digit page.
create function private.book_page_slug(name text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when name ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9]{3}\.webp$' then split_part(name, '/', 1)
  end
$$;

revoke all on function private.book_page_slug(text) from public, anon;
grant execute on function private.book_page_slug(text) to authenticated;

create policy book_pages_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'book-pages'
    and private.can_read_book(private.book_page_slug(name))
  );

create policy book_pages_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'book-pages'
    and private.book_page_slug(name) is not null
    and (select private.admin_can_write())
  );

create policy book_pages_update on storage.objects
  for update to authenticated
  using (bucket_id = 'book-pages' and (select private.admin_can_write()))
  with check (
    bucket_id = 'book-pages'
    and private.book_page_slug(name) is not null
    and (select private.admin_can_write())
  );

create policy book_pages_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'book-pages' and (select private.admin_can_write()));
