-- The nightly backup (CLAUDE.md security rule 9, the backup connector): a private bucket
-- for one dated copy of the database a night, `{YYYY-MM-DD}.tar.gz` (the New York date),
-- kept 30 days. `.github/workflows/backup.yml` writes and prunes it with the service key.
--
-- No policies on purpose: no signed-in user, the admin included, can list, read or write
-- it through the API. The service key (Actions secret) and the dashboard reach it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/gzip'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
