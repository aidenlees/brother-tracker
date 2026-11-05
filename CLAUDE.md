# CLAUDE.md — Brother Tracker

A private web app where students log practice against trackers, and the admin and linked viewers follow along and comment. Today that's one student (Singapore Math + violin), one admin, one parent viewer. **Build it for many**: any number of students, viewers and trackers, all added as data.

This repo is **public**. Nothing secret, personal or copyrighted is ever committed. Security comes from Auth + RLS, not from hidden code.

## Design philosophy

Four rules decide every call. When two conflict, the earlier one wins.

1. **Practical.**
   - Every screen answers one question.
   - Logging math takes under 2 minutes; a daily check-in, about 10 seconds.
   - Works offline, never loses an entry, and supports backfill and 7-day edits.
   - Everything exports.
2. **Minimal.**
   - A field stays only if it feeds a metric, a retry or a conversation.
   - Defaults over options: add a setting only when a second person needs a different value.
   - No points, badges, confetti or mascots.
3. **Aesthetic.**
   - Calm and adult ("studio notebook").
   - Polish goes where hands touch.
   - One design system, defined once in tokens.
4. **Modifiable.** Anything that might change is **data, not code**:
   - trackers (fields, metrics, cadence)
   - people (roles, viewer links)
   - plans (templates with a start-date shift)
   - assignments (which person gets which tracker)
   - the look (design tokens)
   - connectors (each runs only when its secrets exist)

   The test: *could the admin make this change from the admin screens a year from now, without code?* If not, redesign it.

Two invariants outrank everything: **only a student writes their own entries** (enforced in the database), and **logging stays fast**. If a change trades either away, stop and ask.

---

## Stack

- **Front end:** Vite + React 19 + TypeScript (strict), Tailwind CSS, shadcn/ui, Recharts, dnd-kit, TanStack Query, React Router, Zod. Installable PWA (vite-plugin-pwa).
- **Backend:** Supabase. Postgres with RLS, Auth (email + password only, sign-up disabled), Storage, Edge Functions (Deno), pg_cron.
- **Hosting:** GitHub Pages via GitHub Actions on push to `main`. SPA fallback via `404.html`; Vite `base` is `/brother-tracker/`.
- **Tests:** Vitest for unit tests, Playwright for end-to-end and screenshots, pgTAP (`supabase test db`) for RLS.
- **Package manager:** pnpm.

## Commands

Keep this section accurate as scripts are added.

```bash
# The Supabase CLI is a pinned devDependency: run `supabase …` below as `pnpm supabase …`
pnpm install
pnpm dev                 # http://localhost:5173/brother-tracker/
supabase start           # local Postgres + Auth + Storage (Docker)
supabase db reset        # all migrations + local seed (includes fake test users)
supabase test db         # pgTAP RLS tests: must pass before any merge
pnpm test                # Vitest
pnpm e2e                 # Playwright (dev server + local Supabase)
pnpm typecheck && pnpm lint   # lint = ESLint + Prettier check + check:tokens (no hard-coded colours/fonts/radii)
pnpm build && pnpm check:secrets   # fails on service_role, sb_secret_ or a JWT in src/ or dist/
pnpm seed                # upsert seed/trackers.json -> trackers, seed/math_sessions.json -> plan_templates (idempotent, no people); --remote for the cloud project
supabase db push         # apply migrations to the linked cloud project
```

## Repo layout

```
src/
  app/            routes: today/, log/, overview/, struggles/, retries/, plan/, builder/, people/, export/, settings/
  components/     shared UI (shadcn in components/ui)
  theme/          tokens.css: colours, type, radius, spacing, both themes (the only place the look is defined)
  trackers/       field registry, renderers, metric engine, Zod schema builder
  lib/            supabase client, auth, offline outbox, date utils
supabase/
  migrations/     timestamped SQL; never edit an applied migration, add a new one
  functions/      admin-users, digest-email, push-reminders, calendar-sync, keep-alive
  tests/          pgTAP
  seed.sql        LOCAL ONLY: fake users (student@example.test, admin@…, viewer@…, student2@…)
seed/
  trackers.json        launch tracker definitions
  math_sessions.json   80-session math plan (plan template source)
.github/workflows/     ci.yml, deploy.yml, backup.yml
```

---

## People and roles

| Role | Entries / followups / attachments | Trackers, templates, assignments, plan items | Profiles, viewer links | Comments |
|---|---|---|---|---|
| `student` | create; update/delete **own** (7-day window) | read **own** assignments and plan items | read own profile | read on own entries; reply on own |
| `admin` | read all | create, update, archive | create, update | create |
| `viewer` | read for **linked** students | read for linked students | read own profile | create on linked students' entries |

**Login**
- Email + password. Accounts are created by the admin, never by sign-up.
- **The app sends no auth email.** Build no sign-up, magic-link, OTP or "forgot password" flows. The login screen says "Forgot it? Ask your admin to reset it."
- Sessions persist (refresh tokens), so a student logs in once per device.
- The admin role supports TOTP MFA (enroll + challenge in Settings).

**Adding people**
- **First setup:** the admin creates accounts in the Supabase dashboard and runs one SQL snippet with `profiles`, `viewer_links` and `assign_tracker` calls. It lives in the plan doc, not in this repo.
- **After Phase 4:** the People page does all of this. It calls the `admin-users` Edge Function (service key; verifies the caller is admin) to create or disable an account and set a temporary password, then sets role, links and assignments.

## Security rules (non-negotiable)

1. **RLS on every table**, enabled in the migration that creates it. Automatic RLS is also on in the project, but never rely on it.
2. **Helpers** (`security definer`, `stable`, `search_path` pinned; policies use them and trust nothing from the client):
   - `public.role()` returns the caller's role from `profiles`.
   - `public.is_admin()` is true for the admin.
   - `public.can_see(student uuid)` is true when `auth.uid() = student`, the caller is admin, or a `viewer_links` row exists for the pair.
3. **`entries`, `followups`, `attachments`:**
   - Insert only when `owner_id = auth.uid()`, `role() = 'student'`, and the referenced assignment's `student_id = auth.uid()`.
   - Update and delete: the same, plus `created_at > now() - interval '7 days'`.
     - Exception: a followup's `status` can still change after 7 days (review sessions close old followups); its label and due date stay locked.
   - Select: `can_see(owner_id)`.
4. **`profiles`, `viewer_links`:** write by admin only. Nobody can change their own role, even the admin through the client: role changes go through `admin-users` or SQL.
5. **`trackers`, `tracker_versions`, `plan_templates`:**
   - Write by admin only.
   - Read: all signed-in users for `trackers` and `tracker_versions`; admin only for `plan_templates`.
6. **`assignments`, `plan_items`:** write by admin only; read with `can_see(student_id)`.
7. **`comments`:**
   - Insert when `can_see(entry owner)` and the caller is admin, a viewer, or the entry's own student.
   - Authors edit and delete only their own comments.
8. **Audit:** an `audit_log` trigger on every table above records actor, action, before and after.
9. **Storage:** bucket `attachments` is private, with paths `{owner_id}/{entry_id}/{uuid}.jpg`. Policies mirror rule 3. Signed URLs last 10 minutes or less.
10. **Keys:** only the publishable key (`sb_publishable_…`, the `anon` role) ships to the client; never the legacy anon JWT. The service key lives only in Edge Function and Actions secrets. CI fails on `service_role` or JWT-looking strings in `src/` or `dist/`.
11. **Every policy change ships with pgTAP tests proving the refusals, written first.** Each of these must fail:
    - an admin insert
    - a viewer insert
    - a viewer reading an unlinked student
    - a student writing to another student's assignment
    - an edit after 7 days
    - a student changing their own role
12. **Minimal personal data:** a first-name display name only. No analytics or third-party scripts.

---

## Data model

**Adding a tracker, a person or a plan must never require a migration.**

```sql
profiles         (id uuid pk -> auth.users, role text check in ('student','admin','viewer'),
                  display_name text, active bool default true, created_at)
viewer_links     (viewer_id uuid -> profiles, student_id uuid -> profiles, pk (viewer_id, student_id))
trackers         (id uuid pk, slug text unique, name, icon, color, fields jsonb, field_version int,
                  metrics jsonb, cadence jsonb, followups jsonb, pacing_flags jsonb,
                  display text, sort int, archived bool default false, created_at)
tracker_versions (tracker_id, field_version, fields jsonb, created_at, pk (tracker_id, field_version))
plan_templates   (id uuid pk, tracker_id, name, items jsonb, first_date date)   -- items carry their original dates
assignments      (id uuid pk, tracker_id, student_id, plan_template_id null, start_date date,
                  active bool default true, settings jsonb, created_at, unique (tracker_id, student_id))
plan_items       (id uuid pk, assignment_id, date date, title text, details jsonb, sort int)
entries          (id uuid pk, assignment_id, plan_item_id null, field_version int, date date,
                  data jsonb, did text, struggled text, minutes int,
                  owner_id uuid default auth.uid(), created_at, updated_at,
                  unique (assignment_id, date, plan_item_id))
followups        (id uuid pk, entry_id, assignment_id, label, due_date, status check in ('open','done','dropped'), owner_id, created_at)
attachments      (id uuid pk, entry_id, storage_path, kind, owner_id, created_at)
comments         (id uuid pk, entry_id, author_id, body, created_at, edited_at)
audit_log        (id bigserial pk, table_name, row_id, actor, action, before jsonb, after jsonb, at)
push_subscriptions (id, user_id, endpoint, keys jsonb, remind_at time)
```

**`public.assign_tracker(student uuid, tracker_slug text, start date)`** (admin only)
- Creates the assignment.
- If the tracker has a plan template, copies its items into `plan_items`, shifting every date by `start - template.first_date`.
- Idempotent: re-running does nothing.
- The People page and the first-setup SQL both use it.

**Validation**
- `entries.data` is validated in the browser by a Zod schema built from the tracker's fields.
- It's validated again in the database by a trigger that checks it against `tracker_versions.fields` for the entry's `field_version`.

**Weekly metrics** come from SQL views, per student and tracker. Weeks start Sunday in `America/New_York`.

### Field types (registry in `src/trackers/fields/`)

`number`, `counter`, `tally_group`, `checkbox`, `checklist`, `select`, `multi_select`, `short_text`, `long_text`, `duration`, `rating_1_5`, `page_range`, `yes_no`, `photo`.

- A definition looks like `{ key, type, label, required, help?, placeholder?, options?, showIf? }`.
- Each type implements: renderer, Zod schema, empty value, summary formatter, SQL check.
- **Adding a field type** = one new file in the registry + one SQL check. No other code changes.

### Metric types

`sum`, `avg`, `count_where`, `ratio`, `streak`, `days_per_week`.
- A metric with a zero denominator, or nothing to count, returns null. Show it as blank, never as 0 or NaN.
- New trackers start with the default fields `did` and `struggled`; the admin can remove them.

---

## Launch trackers

The exact definitions are in `seed/trackers.json`. If this section and that file disagree, the file wins; flag the mismatch.

### `singapore-math` (cadence: plan)

**Plan**
- Template from `seed/math_sessions.json`: 80 sessions, Sun/Tue/Thu/Sat, first date 2026-11-01. Three Thursdays are already moved to Wednesday.
- `details` carries `week`, `topic`, `assignment`, `page_start`, `page_end`, `kind` and `reading_only`.
- Pages are printed pages. Show "PDF +2" beside them.

**Fields**
- `checklist`: attempted, checked, explained, retry_planned
- `outcomes` tally: I / H / S / U, with keyboard shortcuts `i h s u`
- `minutes`
- `key_idea`
- `did`, `struggled` (both required)
- `reflection`, with a prompt rotating by session
- `notebook` photo (optional)

**Metrics**
- `independent_rate = I / (I+H+S+U)`: null on reading-only days and when the total is 0
- checklist complete
- minutes per week
- ideas explained per week

**Followups:** from any H, S or U problem; label like `p. 31 #4`; due in 2 days. Review sessions list everything still open.

**Pacing flags** (admin only, never shown to students):
- "Slow down": in a week, H+S+U > I
- "Trim repetition": 3 sessions in a row at ≥ 0.8 with `explained` checked
- "Behind plan": 2 or more missed sessions

### `violin` (cadence: daily, `display: inline_on_today_card`)

- `practiced` (yes/no), plus `focus` (short text, required when yes).
- Metrics: days per week, streak, recent focus items.

---

## Screens

| Screen | Who | Notes |
|---|---|---|
| Today | student | One card per active assignment: today's plan item, due followups, streak. Inline trackers are logged on the card. |
| Log session | student | One step per screen; autosaves to IndexedDB; works offline; tally keys `i h s u`, Backspace undoes |
| My week | student | Streaks and "solved on my own". Never a grade; no pacing flags. |
| Overview | admin, viewer | Person picker (viewer: linked students only); per tracker: week vs last, trend, minutes, streaks; pacing flags for admin only |
| Struggles | admin, viewer | Every `struggled`, newest first, filterable, with inline comments |
| Retry queue | admin | Open followups, overdue first |
| Plan editor | admin | Drag sessions; "insert catch-up day" shifts later items |
| Tracker builder | admin | Template or blank → drag fields → live preview of the student's log flow → metrics + cadence → publish. Editing bumps `field_version`. |
| People | admin | Add or disable accounts (via `admin-users`), set roles, link viewers to students, assign trackers with a start date |
| Export | admin | CSV / .xlsx per tracker and person; math uses the original sheet's columns |
| Settings | all | Theme, reminder time; MFA for admin |

Navigation shows only the screens a role can use.

## Design rules ("studio notebook")

- **Tokens.** Everything visual comes from `src/theme/tokens.css`, as CSS variables for both themes. Components never hard-code colours, fonts or radii.
- **Palette.**
  - Warm paper background (`#FAF7F2`-ish), ink text (`#1F2328`-ish).
  - One accent per tracker: math ink blue, violin rosin amber. New trackers pick from 6 accents that pass AA in both themes.
  - Real dark mode, not inversion.
- **Type.** Fraunces for headings, Inter for UI, tabular numerals on stats.
- **Feel.**
  - Generous space, rounded-lg cards, hairline borders; no heavy shadows or gradients.
  - A soft press on each tally, a small check mark on save.
  - No gamification.
- **Charts.** Quiet gridlines, direct labels, one highlighted series. A null is a gap. Every chart gets a text summary for screen readers.
- **Access.** AA contrast, full keyboard use, visible focus, `prefers-reduced-motion` respected.
- **Copy.** Short, second person, specific ("Your table made the pattern clear"), never generic praise.
- **Offline.** An IndexedDB outbox, with "Saved on this laptop, will sync" vs "Synced" shown in the UI.

## Connectors (Edge Functions + pg_cron). Each one is a switch: it skips quietly if its secrets are unset.

| Function | Schedule | Does | Secrets |
|---|---|---|---|
| `admin-users` | on call | Create or disable accounts and set passwords. Admin callers only. | service key (built in) |
| `digest-email` | Sun 18:00 ET | Plain-numbers summary to the admin and each viewer, covering their linked students | `SMTP_USER`, `SMTP_PASS` (Gmail app password, `smtp.gmail.com:465`) |
| `push-reminders` | every 15 min | Web Push at each student's `remind_at`, plus one 20:00 nudge if a plan item is unlogged | VAPID keys |
| `calendar-sync` | on plan_items change + nightly | Mirrors plan items to a shared Google Calendar | `GOOGLE_SA_JSON`, `CALENDAR_ID` |
| `keep-alive` | weekly | A trivial query so the free project never pauses | none |
| `backup` (Actions) | nightly | `pg_dump` to a private bucket, kept 30 days | Actions secrets |

No LLM API calls from this app.

---

## Phases

Mark the current phase when it changes.

- [ ] **1. Foundation** ← current (branch `phase-1`)
  - Builds: scaffold, full schema + helpers + RLS + audit, `assign_tracker`, pgTAP refusal tests, local fake-user seed, password login, role-based nav shell, `pnpm seed`, CI, Pages deploy.
  - *Done when:* every refusal in rule 11 is tested and failing correctly, the student's own write succeeds, and the site is live.
- [ ] **2. Student MVP**
  - Builds: Today, math log flow, violin inline check-in, followups, offline outbox, backfill for missed dates.
  - *Done when:* the student logs a real session on a laptop in under 2 minutes, unaided.
- [ ] **3. Admin side + connectors**
  - Builds: Overview, Struggles, comments, retry queue, plan editor, push, calendar, digest.
  - *Done when:* the first digest matches a hand check.
- [ ] **4. Builder, People, export**
  - Builds: tracker builder with live preview and versioning, People page + `admin-users`, CSV/xlsx export.
  - *Done when:* a third tracker is built in under 5 minutes with no code, and a second test student is added and assigned math with a shifted start date, all from the UI.
- [ ] **5. Hardening**
  - Builds: adversarial security pass, restore drill, Dependabot.

---

## How to work in this repo

- **Plan first.** For anything bigger than a bug fix, write a short checklist plan and wait for approval.
- **Security before UI.** Migration with RLS → pgTAP refusal tests → then client code.
- **Migrations.** `supabase migration new <name>`. Never edit an applied migration. Never change schema in the dashboard.
- **Look at what you build.** Playwright screenshots at 1440×900 and 390×844, light and dark, checked before calling a screen done.
- **Done means:** `pnpm typecheck && pnpm lint && pnpm test && supabase test db` are green, and e2e passes for the touched flow.
- **Commits.** Small, conventional (`feat:`, `fix:`, `test:`, `chore:`), one phase per branch, PR to `main`, CI must pass.
- **Dates.** Local `date` columns. "Today" is computed in `America/New_York`, never from a UTC timestamp.
- **Hard-coding.** Never hard-code a person, a tracker slug or a colour in components. Read them from data and tokens. The only allowed exception is the seed files.
- **Don't:**
  - commit PDFs, spreadsheets, `.env*` files, real emails, names, UUIDs or passwords (fixtures use `@example.test`)
  - weaken a policy to pass a test
  - show pacing flags or grades to students
  - add tracking scripts

## Reference: learning philosophy (behind the math tracker)

- Worked examples, then independent practice.
- Retry assisted problems about 2 days later.
- Spaced mixed review.
- One "why does this work?" explanation per week.
- When behind, extend the schedule rather than double the daily load.
