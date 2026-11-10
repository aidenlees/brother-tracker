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

Two invariants outrank everything: **only a student creates or edits their own entries** (enforced in the database; the admin may only clear one, see rule 3), and **logging stays fast**. If a change trades either away, stop and ask.

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
supabase test db         # pgTAP RLS tests (and the Zod/SQL parity checks): must pass before any merge
pnpm env:local           # write .env.local (URL + publishable key only) from the running local stack
pnpm gen:types           # regenerate src/lib/database.types.ts after a migration
pnpm gen:parity          # rewrite supabase/tests/database/13_field_parity.sql from the field fixtures (Vitest fails when it is stale)
pnpm gen:icons           # app icons in public/ from public/favicon.svg (commit the results)
pnpm test                # Vitest
pnpm seed                # upsert seed/trackers.json -> trackers, seed/math_sessions.json -> plan_templates (idempotent, no people); --remote for the cloud project
pnpm e2e:fixtures        # LOCAL ONLY (refuses --remote): the fake students' assignments, entries and retries around today, and placeholder book pages if none; after db reset + seed
pnpm plan:math           # rebuild seed/math_sessions.json: every page in order, 6 days a week, ~45 min a day (scripts/plan-math-build.ts; tests check it isn't stale)
pnpm book:pages          # render the plan's printed pages from the book PDF in seed/ (gitignored) and upload them to the private book-pages bucket; --remote for the cloud (needs Python 3 + pypdfium2 + Pillow)
pnpm e2e                 # Playwright, one worker: `chromium` on the dev server, `pwa` on a production build (vite preview); screenshots land in test-results/screens/
pnpm e2e --grep @pace    # the student-speed timing test: math log under 2 min, violin check-in about 10 s (also runs in pnpm e2e)
pnpm e2e --project=pwa   # installed-app tests only: manifest, service worker, offline reload
pnpm typecheck && pnpm lint   # lint = ESLint + Prettier check + check:tokens (no hard-coded colours/fonts/sizes/radii)
pnpm build && pnpm check:secrets   # fails on service_role, sb_secret_ or a JWT in src/ or dist/
supabase db push         # apply migrations to the linked cloud project
# Nightly backup: .github/workflows/backup.yml (Actions -> Backup -> Run workflow runs it now); how to restore is at the top of that file

# Before e2e on a fresh stack: supabase db reset && pnpm seed && pnpm e2e:fixtures && pnpm env:local
```

## Repo layout

```
src/
  app/            routes: today/, log/, session/, week/, overview/, struggles/, retries/, plan/, tasks/, builder/, people/, export/, settings/ (nav.ts maps each to its roles)
  components/     shared UI (shadcn in components/ui)
  theme/          tokens.css: colours, type, radius, spacing, both themes (the only place the look is defined)
  trackers/       field registry (fields/, one file per type), entry checks (entry.ts mirrors entries_validate), plan and followup rules, the last 7 days (week.ts), metrics
  lib/            supabase client, auth (offline-safe), query cache, offline outbox (drafts, ops, photos, sync), date utils
supabase/
  migrations/     timestamped SQL; never edit an applied migration, add a new one
  functions/      admin-users, digest-email, push-reminders, calendar-sync, keep-alive
  tests/          pgTAP
  seed.sql        LOCAL ONLY: fake users (student@example.test, admin@…, viewer@…, student2@…)
seed/
  trackers.json        launch tracker definitions
  math_sessions.json   the math plan (plan template source, built by `pnpm plan:math`), with each session's problem numbers (read once from the book, which stays out of the repo)
scripts/               seed, plan-math, book-pages, env:local, e2e-fixtures (LOCAL ONLY), backup (the nightly upload and prune), check-tokens, check-secrets, theme-colors
e2e/                   Playwright specs; supabase.ts talks to the local stack only
.github/workflows/     ci.yml, deploy.yml, backup.yml
```

---

## People and roles

| Role | Entries / followups / attachments | Trackers, templates, assignments, plan items | Profiles, viewer links | Comments |
|---|---|---|---|---|
| `student` | create; update/delete **own** (7-day window) | read **own** assignments and plan items | read own profile, and commenters' | read on own entries; reply on own |
| `admin` | read all; clear (delete) an entry | create, update, archive | create, update | create |
| `viewer` | read for **linked** students | read for linked students | read own profile, linked students', and commenters' | create on linked students' entries |

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
2. **Helpers** (`security definer`, `stable`, `search_path` pinned; policies use them and trust nothing from the client) live in the `private` schema, which the Data API doesn't expose. No `security definer` function in an exposed schema may be executable by `anon` or `authenticated` (pgTAP enforces this).
   - `private.role()` returns the caller's role from `profiles`.
   - `private.is_admin()` is true for the admin.
   - `private.can_see(student uuid)` is true when `auth.uid() = student`, the caller is admin, or a `viewer_links` row exists for the pair.
3. **`entries`, `followups`, `attachments`:**
   - Insert only when `owner_id = auth.uid()`, `role() = 'student'`, and the referenced assignment's `student_id = auth.uid()`.
   - Update and delete: the same, plus `created_at > now() - interval '7 days'`.
     - Exception: a followup's `status` can still change after 7 days (review sessions close old followups); its label and due date stay locked.
   - The admin may also delete (clear) an entry, at any age, as an admin write (MFA once enrolled): for a log made by mistake. Never insert or update. Its followups, attachment rows and comments go with it (on delete cascade); `audit_log` keeps them. Attachment photos stay in the private bucket for now (no launch tracker has a photo field).
   - Select: `can_see(owner_id)`.
4. **`profiles`, `viewer_links`:** write by admin only. Nobody can change their own role, even the admin through the client: role changes go through `admin-users` or SQL.
   - Read a profile when it's your own, `can_see(id)`, or its owner commented on an entry you can see (`private.wrote_visible_comment`), so a comment shows who wrote it.
5. **`trackers`, `tracker_versions`, `plan_templates`:**
   - Write by admin only.
   - Read: all signed-in users for `trackers` and `tracker_versions`; admin only for `plan_templates`.
6. **`assignments`, `plan_items`:** write by admin only; read with `can_see(student_id)`.
7. **`comments`:**
   - Insert when `can_see(entry owner)` and the caller is admin, a viewer, or the entry's own student.
   - Authors edit and delete only their own comments.
   - Comments go straight to the server (no outbox): if posting fails, what was typed stays in the box.
8. **Audit:** an `audit_log` trigger on every table above records actor, action, before and after.
9. **Storage:** every bucket is private, and signed URLs last 10 minutes or less.
   - `attachments`: paths `{owner_id}/{entry_id}/{uuid}.jpg`. Policies mirror rule 3.
   - `book-pages`: the printed book's pages, `{tracker slug}/{3-digit page}.webp`. Read by whoever can see a student actively assigned that tracker; written by the admin only. The book and its images never enter the repo or the public site.
   - `backups`: the nightly copy of the database, `{YYYY-MM-DD}.tar.gz`. No policies: only the service key (the backup workflow) and the dashboard reach it.
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
                  data jsonb, did text, struggled text, minutes int,   -- did/struggled/minutes copied from data; a struggled list as "p. 31 #4, p. 32 #6"
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

**Weekly metrics** are worked out in the app by one TypeScript module from each tracker's `metrics` list, per student and tracker, so a new tracker needs no new code or SQL. Weeks start Sunday in `America/New_York`.

### Field types (registry in `src/trackers/fields/`)

`number`, `counter`, `tally_group`, `checkbox`, `checklist`, `select`, `multi_select`, `short_text`, `long_text`, `duration`, `rating_1_5`, `page_range`, `yes_no`, `photo`, `plan_checklist`.

- A definition looks like `{ key, type, label, required, help?, placeholder?, options?, showIf?, optionsFrom? }`.
- `plan_checklist` offers one checkbox per item its plan item lists (`optionsFrom: "plan.problems"`); it's hidden, and its value dropped, on a plan item with no list.
- Each type implements: renderer, Zod schema, empty value, summary formatter, SQL check. Both checks receive the entry's plan item (in SQL as `field -> 'plan'`).
- **Adding a field type** = one new file in the registry + one SQL check. No other code changes.

### Metric types

`sum`, `avg`, `count_where`, `ratio`, `streak`, `days_per_week`.
- A metric with a zero denominator, or nothing to count, returns null. Show it as blank, never as 0 or NaN.
- The engine is `src/trackers/metrics/`. Rules are data in two small forms: `where` names a field that must be true, or several joined by "or" ("completed or read"); a ratio's terms add and subtract `count(x)` (how many items the list x holds, "plan." for the plan item) and whole numbers. A rule it can't read gives a blank, and a test reads every seeded rule.
- A week's ratio pools its sessions (all problems solved on my own over all problems). A streak in a past week is the run as it stood on its Saturday.
- New trackers start with the default fields `did` and `struggled`; the admin can remove them.

---

## Launch trackers

The exact definitions are in `seed/trackers.json`. If this section and that file disagree, the file wins; flag the mismatch.

### `singapore-math` (cadence: plan)

**Plan**
- Template from `seed/math_sessions.json`, built by `pnpm plan:math`: 54 sessions, Sunday to Friday (Saturday is the rest day), first date 2026-11-08, through 2027-01-08.
  - Every printed page from 5 to 309 once, in order. A day never crosses a chapter or splits a problem, and a chapter's worked examples go with its first problems, so **every day has problems**.
  - Each day is 30–60 minutes of estimated work, aiming at 45, so retries fit within an hour (`src/trackers/estimate.ts`: a worked-example page 4 min, a lettered part 1.5 + 1 for its question, a problem alone on its page 9, one sharing a page 5).
  - Mixed checks after chapters 5, 10 and 16: about 45 minutes of earlier problems to redo, named one by one.
- `details` carries `session`, `week`, `topic`, `assignment`, `page_start`, `page_end`, `kind`, `reading_only` and `problems`, plus `pdf_offset` on items that have pages.
- `problems`: one label per problem or lettered part on the session's pages, named by the page it's printed on (`p. 31 #4`, `p. 15 #2(e)`); mixed checks list the problems they name.
- Pages are printed pages. Today states them plainly ("Pages 32–35") with no images, and "See the pages" opens the session's page, which shows them as a grid that opens each full size; the log page shows only the topic.
- A session can be logged early, from Today's "Next" line or its page: the entry is dated the day it was done, so its retries are due two days after the work. Not before the plan's first day: entries are dated from the assignment's start to today (security rule 3), so the app doesn't offer it then.

**Fields** (three steps)
- `completed`: "Did you complete the problems on the pages?" (yes/no; on a day the admin marks reading only, `read`, "Did you finish the reading?")
- `struggled`: "Which problems did you struggle with?", a `plan_checklist` of the session's `problems` (none checked is an answer)
- `minutes`

**Metrics**
- `independent_rate = (problems − struggled) / problems`: null when the session lists no problems
- sessions completed per week
- minutes per week

**Followups:** each problem checked in `struggled` becomes a retry with its label, due in 2 days (`followups.from`). An edit drops the retry of a problem no longer checked; one already done is never made again. Review sessions (`kind` is `review` or `mixed_check`, set by `followups.listAllOpenWhen`) list everything still open.

**Pacing flags** (admin only, never shown to students or viewers; rules are data, `pacingFlags[].when`, judged for the week shown):
- "Slow down": in a week, more problems struggled with than solved on my own (`week_below` 0.5)
- "Trim repetition": the last 3 sessions each at ≥ 0.8 (`last_sessions_at_least`)
- "Behind plan": 2 or more past sessions with no log (`missed_sessions`)

### `violin` (cadence: daily, `display: inline_on_today_card`)

- `practiced` (yes/no), plus `focus` (short text, required when yes).
- Metrics: days per week, streak. The week's focus notes are a list on Overview, not a metric (every `short_text` answer of a tracker is).

### `tasks` (cadence: plan with no template, `display: task_list`)

- Work the admin adds when needed, for one student or several: each task is a plan item on the student's Tasks assignment (`title`, `details.notes`, and `details.series` shared by a repeating task's dates). The first task assigns the tracker (`assign_tracker`, start today).
- One field, `done` (checkbox): ticking a task off on Today logs `{done: true}` dated today, through the outbox; unticking clears that log.
- A task not done on its day stays on Today under "Still to do" until it's done or deleted. Deleting a done task clears its log first (entries keep their plan item).
- Code finds the task tracker by `display: task_list`, never by slug. Metric: tasks done per week.

---

## Screens

| Screen | Who | Notes |
|---|---|---|
| Today | student | One card per active assignment, top to bottom: today's pages by number with "See the pages" (or the inline check-in, which can be cleared, or the day's tasks to tick off; after saving, one line for what's next, with "Done it early? Log it"; sessions logged early are listed), due followups, a line for each log someone commented on in the last 7 days ("Alex commented on Session 4 · …", opening its session page), earlier sessions to log (folded), the last 7 days with the streak in plain words. |
| Log session | student | One step per screen; autosaves to IndexedDB; works offline; Enter moves on. Math: completed, problems struggled with (checkboxes), minutes. Editing a log within 7 days offers "Clear this log" (it goes with its retries, after a confirm); a locked one says to ask the admin. |
| My week | student | Day by day, Sunday to Saturday, any week back or ahead: each session's pages and topic, each task with its notes, and each check-in, with where it stands. Never a grade; no pacing flags. |
| Session | student | One planned session: topic, date, problems, the book's pages as a grid (tap one for a full-size viewer with previous/next), and Log ("Log it early" ahead of its day). Once someone comments on its log, the conversation, with Reply. |
| Overview | admin, viewer | Person picker (viewer: linked students only). A week at a time (this one, or any week back): per tracker, each metric beside last week's, the week's notes, and pacing flags for the admin only; a tracker not yet started says when it starts. Then each log from the last 14 days, newest first, with every answer; the admin can clear one, and a log with a struggle links to it on Struggles. Still to come: an 8-week trend (early December, once there are weeks to show) |
| Struggles | admin, viewer | Person picker. Each log with a struggle, newest first: the session, each problem with where its retry stands (due, overdue, done, dropped), and its comments with a box to add one (edit or delete your own). Filter: All, or Retry still open. Reads `entries.struggled`, so any tracker with that field shows. |
| Retry queue | admin | Person picker. Each tracker's open retries: overdue, due today, coming up, soonest first; each names the log it came from and links to it on Struggles. Read only (the student marks a retry done). Names the next session that lists every open retry (`followups.listAllOpenWhen`), when there is one. |
| Tasks | admin | Add a task for one student or several: title, optional notes, a day, and a repeat (every day or chosen weekdays, up to 100 days). Each student's tasks by day, done or not, with edit and delete (one, or the rest of a series). |
| Plan editor | admin | Every session by week (tasks have their own screen), each with its estimated minutes: edit date, topic and pages (the problem checkboxes and the estimate follow), mark a day off (that day's session and every later one move a plan day later, the rest day stays free), move a session and every later one a plan day later or earlier, or reset it to the seed baseline |
| Tracker builder | admin | Template or blank → drag fields → live preview of the student's log flow → metrics + cadence → publish. Editing bumps `field_version`. |
| People | admin | Add or disable accounts (via `admin-users`), set roles, link viewers to students, assign trackers with a start date |
| Export | admin | CSV / .xlsx per tracker and person; math uses the original sheet's columns |
| Settings | all | Theme, reminder time; MFA for admin |

Navigation shows only the screens a role can use.

## Design rules ("studio notebook")

- **Tokens.** Everything visual comes from `src/theme/tokens.css`, as CSS variables for both themes. Components never hard-code colours, fonts, sizes or radii (`pnpm check:tokens`).
- **Palette.**
  - Warm paper background (`#FAF7F2`-ish), ink text (`#1F2328`-ish).
  - One accent per tracker: math ink blue, violin rosin amber. New trackers pick from 6 accents that pass AA in both themes.
  - Real dark mode, not inversion.
- **Type.** Fraunces (`font-heading`) only for the page title, a tracker's name, the question on a log step, dialog titles and the wordmark. Inter for everything else; tabular numerals on stats.
  - Six sizes, each with one job: `text-display` (page title, log question), `text-title` (tracker name), `text-lead` (a card's main line), `text-body` (answers, rows, a card's section headings), `text-small` (details under a line, labels, hints), `text-caption` (the 7-day strip). A new size goes in tokens.css and in `TYPE_SIZES` (`src/lib/utils.ts`, so `cn()` keeps it); a test checks they match.
  - Weights 400 and 500 only. Sentence case; no all-caps labels.
- **Layout.** One 42rem column for the header and the content, at every width. Spacing comes from 4/8/12/16/24/32/48 px: 24 inside a card and between its sections, 32 from a page's heading to its content, 16 between cards.
- **Feel.**
  - Generous space, rounded-lg cards, hairline borders; no heavy shadows or gradients.
  - A soft press on each tally, a small check mark on save.
  - No gamification. Consistency is shown, not rewarded: the last 7 days on every Today card (done, still to log, rest day), the streak as a plain sentence ("4 days in a row. Today makes 5."), and what's next once today is saved. Missed sessions are a to-do folded under one line, never "behind".
- **Charts.** Quiet gridlines, direct labels, one highlighted series. A null is a gap. Every chart gets a text summary for screen readers.
- **Access.** AA contrast, full keyboard use, visible focus, `prefers-reduced-motion` respected.
- **Copy.** Short, second person, specific ("Your table made the pattern clear"), never generic praise.
- **Offline.** An IndexedDB outbox, with "Saved on this laptop, will sync" vs "Synced" shown in the UI.
- **New versions.** The app looks for one when it opens, when it comes back into view and hourly; once it's downloaded, one line above the page offers Update. It never reloads by itself.

## Connectors (Edge Functions + pg_cron). Each one is a switch: it skips quietly if its secrets are unset.

Built so far: `backup`. `admin-users` comes with People (Phase 4); `digest-email`, `push-reminders` and `calendar-sync` wait until the admin asks for them (decided 2026-11-09).

| Function | Schedule | Does | Secrets |
|---|---|---|---|
| `admin-users` | on call | Create or disable accounts and set passwords. Admin callers only. | service key (built in) |
| `digest-email` | Sun 18:00 ET | Plain-numbers summary to the admin and each viewer, covering their linked students | `SMTP_USER`, `SMTP_PASS` (Gmail app password, `smtp.gmail.com:465`) |
| `push-reminders` | every 15 min | Web Push at each student's `remind_at`, plus one 20:00 nudge if a plan item is unlogged | VAPID keys |
| `calendar-sync` | on plan_items change + nightly | Mirrors plan items to a shared Google Calendar | `GOOGLE_SA_JSON`, `CALENDAR_ID` |
| `keep-alive` | weekly | A trivial query so the free project never pauses | none |
| `backup` (Actions) | nightly, 3:30 a.m. ET | Roles, schema and data (`supabase db dump`, auth users included) as one dated .tar.gz in the private `backups` bucket, kept 30 days | Actions secrets `SUPABASE_DB_URL` (session pooler), `SUPABASE_SERVICE_KEY` |

No LLM API calls from this app.

---

## Phases

Mark the current phase when it changes.

- [x] **1. Foundation** (done 2026-11-05, PR #1)
  - Builds: scaffold, full schema + helpers + RLS + audit, `assign_tracker`, pgTAP refusal tests, local fake-user seed, password login, role-based nav shell, `pnpm seed`, CI, Pages deploy.
  - *Done when:* every refusal in rule 11 is tested and failing correctly, the student's own write succeeds, and the site is live.
- [x] **2. Student MVP** (done 2026-11-07, PRs #2–#4)
  - Builds: Today, math log flow, violin inline check-in, followups, offline outbox, backfill for missed dates.
  - *Done when:* the student logs a real session on a laptop in under 2 minutes, unaided.
  - Closed on the automated student-pace test (math log 10.0 s, CI on 3c96e3a); the first real session (2026-11-08) confirms it.
- [ ] **3. Admin side + connectors** ← current (branch `phase-3`)
  - Builds: Overview (with the weekly numbers), My week, Struggles, comments, retry queue, plan editor, tasks, the nightly backup.
  - Shipped first: My week, the session page with the book's pages, and the plan editor; then the six-day plan, early logs and the day off; then clearing a log (student within 7 days, admin any time) and Overview's recent logs; then tasks the admin adds; then the nightly backup; then Overview's weekly numbers and pacing flags; then Struggles and comments; then the Retry queue.
  - *Done when:* one real week's numbers on Overview match a hand check.
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
- One "why does this work?" explanation per week: a conversation, not a log question (the math log asks only three things).
- When behind, extend the schedule rather than double the daily load.
