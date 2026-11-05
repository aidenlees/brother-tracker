-- Every table in CLAUDE.md's data model.
--
-- RLS is enabled in the same statement block that creates each table (security
-- rule 1). Policies arrive in a later migration, so until then every client query
-- is refused. anon is granted nothing. authenticated gets only the operations and
-- columns a client may ever use; RLS then decides which rows. Columns left out of
-- the client grants (role, created_at, owner changes, the mirrored entry columns)
-- can only be written by SQL, triggers or the service role.

-- People ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'admin', 'viewer')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per account. First-name display name only (security rule 12). '
  'role is set by SQL or the admin-users function, never by a client.';
alter table public.profiles enable row level security;
grant select, update (display_name, active) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create table public.viewer_links (
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (viewer_id, student_id)
);
create index viewer_links_student_id_idx on public.viewer_links (student_id);
alter table public.viewer_links enable row level security;
grant select, insert (viewer_id, student_id), delete on public.viewer_links to authenticated;
grant select, insert, update, delete on public.viewer_links to service_role;

-- Trackers and plans -----------------------------------------------------------

create table public.trackers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text not null default 'circle' check (icon ~ '^[a-z0-9-]+$'),
  color text not null check (color ~ '^[a-z]+(-[a-z]+)*$'),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array'),
  field_version int not null default 1 check (field_version >= 1),
  metrics jsonb not null default '[]' check (jsonb_typeof(metrics) = 'array'),
  cadence jsonb not null check (jsonb_typeof(cadence) = 'object' and cadence ? 'type'),
  followups jsonb check (jsonb_typeof(followups) = 'object'),
  pacing_flags jsonb not null default '[]' check (jsonb_typeof(pacing_flags) = 'array'),
  display text check (display ~ '^[a-z_]+$'),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
comment on column public.trackers.color is
  'Names one of the six tracker accents in src/theme/tokens.css.';
comment on column public.trackers.field_version is
  'Managed by the trackers_version trigger: bumped whenever fields change.';
alter table public.trackers enable row level security;
grant select,
  insert (id, slug, name, icon, color, fields, metrics, cadence, followups, pacing_flags, display, sort, archived),
  update (slug, name, icon, color, fields, metrics, cadence, followups, pacing_flags, display, sort, archived)
  on public.trackers to authenticated;
grant select, insert, update, delete on public.trackers to service_role;

create table public.tracker_versions (
  tracker_id uuid not null references public.trackers (id) on delete cascade,
  field_version int not null,
  fields jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tracker_id, field_version)
);
comment on table public.tracker_versions is
  'Snapshot of a tracker''s fields at each version, so old entries keep rendering. Written by trigger only.';
alter table public.tracker_versions enable row level security;
grant select on public.tracker_versions to authenticated;
grant select, insert, update, delete on public.tracker_versions to service_role;

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  first_date date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  unique (tracker_id, name)
);
comment on column public.plan_templates.items is
  'Array of {date, title, sort, details}, with the template''s original dates. assign_tracker shifts them.';
alter table public.plan_templates enable row level security;
grant select,
  insert (id, tracker_id, name, first_date, items),
  update (name, first_date, items),
  delete
  on public.plan_templates to authenticated;
grant select, insert, update, delete on public.plan_templates to service_role;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers (id),
  student_id uuid not null references public.profiles (id) on delete cascade,
  plan_template_id uuid references public.plan_templates (id) on delete set null,
  start_date date not null,
  active boolean not null default true,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  unique (tracker_id, student_id)
);
comment on table public.assignments is
  'Which student gets which tracker. Deactivate rather than delete: deleting cascades to entries.';
create index assignments_student_id_idx on public.assignments (student_id);
create index assignments_plan_template_id_idx on public.assignments (plan_template_id);
alter table public.assignments enable row level security;
grant select,
  insert (id, tracker_id, student_id, plan_template_id, start_date, active, settings),
  update (start_date, active, settings)
  on public.assignments to authenticated;
grant select, insert, update, delete on public.assignments to service_role;

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index plan_items_assignment_id_date_idx on public.plan_items (assignment_id, date);
alter table public.plan_items enable row level security;
grant select,
  insert (id, assignment_id, date, title, details, sort),
  update (date, title, details, sort),
  delete
  on public.plan_items to authenticated;
grant select, insert, update, delete on public.plan_items to service_role;

-- Logging -----------------------------------------------------------------------

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  plan_item_id uuid references public.plan_items (id),
  field_version int not null check (field_version >= 1),
  date date not null,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  did text,
  struggled text,
  minutes int check (minutes between 0 and 1440),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Daily trackers have no plan item; nulls must not count as distinct.
  constraint entries_one_per_slot unique nulls not distinct (assignment_id, date, plan_item_id)
);
comment on column public.entries.data is
  'The source of truth, checked against tracker_versions.fields by entries_validate.';
comment on column public.entries.did is
  'Copied from data by entries_validate (as are struggled and minutes). Never written by clients.';
create index entries_owner_id_date_idx on public.entries (owner_id, date);
create index entries_plan_item_id_idx on public.entries (plan_item_id);
alter table public.entries enable row level security;
grant select,
  insert (id, assignment_id, plan_item_id, field_version, date, data, owner_id),
  update (plan_item_id, field_version, date, data),
  delete
  on public.entries to authenticated;
grant select, insert, update, delete on public.entries to service_role;

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index followups_entry_id_idx on public.followups (entry_id);
create index followups_assignment_id_idx on public.followups (assignment_id);
create index followups_owner_id_status_due_idx on public.followups (owner_id, status, due_date);
alter table public.followups enable row level security;
grant select,
  insert (id, entry_id, assignment_id, label, due_date, status, owner_id),
  update (label, due_date, status),
  delete
  on public.followups to authenticated;
grant select, insert, update, delete on public.followups to service_role;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  storage_path text not null unique,
  kind text not null default 'photo' check (kind in ('photo')),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Security rule 9: {owner_id}/{entry_id}/{uuid}.jpg
  constraint attachments_path_matches_owner_and_entry check (
    storage_path ~ ('^' || owner_id::text || '/' || entry_id::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  )
);
create index attachments_entry_id_idx on public.attachments (entry_id);
create index attachments_owner_id_idx on public.attachments (owner_id);
alter table public.attachments enable row level security;
grant select, insert (id, entry_id, storage_path, kind, owner_id), delete
  on public.attachments to authenticated;
grant select, insert, update, delete on public.attachments to service_role;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_entry_id_idx on public.comments (entry_id);
create index comments_author_id_idx on public.comments (author_id);
alter table public.comments enable row level security;
grant select, insert (id, entry_id, author_id, body), update (body), delete
  on public.comments to authenticated;
grant select, insert, update, delete on public.comments to service_role;

-- Bookkeeping -------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  actor uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
comment on table public.audit_log is
  'Written only by the audit trigger (security rule 8). actor is null for SQL run as postgres or the service role.';
create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_at_idx on public.audit_log (at);
alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
grant select, delete on public.audit_log to service_role;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  keys jsonb not null check (jsonb_typeof(keys) = 'object'),
  remind_at time,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
grant select,
  insert (id, user_id, endpoint, keys, remind_at),
  update (keys, remind_at),
  delete
  on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
