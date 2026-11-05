-- trackers, tracker_versions and plan_templates (CLAUDE.md security rule 5).
begin;
\ir _helpers.psql
select plan(19);
select tests.make_world();

select tests.authenticate_as('student');
select is((select count(*)::int from public.trackers), 2, 'a student reads every tracker');
select is((select count(*)::int from public.tracker_versions), 2, 'a student reads tracker versions');
select is((select count(*)::int from public.plan_templates), 0, 'a student cannot read plan templates');
select throws_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('sneaky', 'Sneaky', 'moss', '{"type": "daily"}')
$$, '42501', null, 'a student cannot create a tracker');
select is(tests.rows_affected($$update public.trackers set name = 'Renamed'$$), 0,
  'a student cannot edit a tracker');
reset role;

select tests.authenticate_as('viewer');
select is((select count(*)::int from public.trackers), 2, 'a viewer reads every tracker');
select is((select count(*)::int from public.plan_templates), 0, 'a viewer cannot read plan templates');
select throws_ok($$
  insert into public.trackers (slug, name, color, cadence) values ('sneaky', 'Sneaky', 'moss', '{"type": "daily"}')
$$, '42501', null, 'a viewer cannot create a tracker');
reset role;

select tests.authenticate_as('former');
select is((select count(*)::int from public.trackers), 0, 'an inactive user reads no trackers');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.plan_templates), 1, 'the admin reads plan templates');
select lives_ok($$
  insert into public.trackers (slug, name, color, cadence, fields)
  values ('reading', 'Reading', 'moss', '{"type": "daily"}',
          '[{"key": "pages", "type": "number", "label": "Pages", "required": true}]')
$$, 'the admin can create a tracker');
select is((
  select array_agg(v.field_version) from public.tracker_versions v
  join public.trackers t on t.id = v.tracker_id where t.slug = 'reading'
), array[1], 'a new tracker gets version 1');
select lives_ok($$
  update public.trackers
  set fields = fields || '[{"key": "book", "type": "short_text", "label": "Book", "required": false}]'
  where slug = 'reading'
$$, 'the admin can change a tracker''s fields');
select is((select field_version from public.trackers where slug = 'reading'), 2,
  'changing fields bumps field_version');
select is((
  select count(*)::int from public.tracker_versions v
  join public.trackers t on t.id = v.tracker_id where t.slug = 'reading'
), 2, '... and keeps the old version, so old entries still render');
select lives_ok($$update public.trackers set name = 'Reading log' where slug = 'reading'$$,
  'renaming a tracker...');
select is((select field_version from public.trackers where slug = 'reading'), 2,
  '... does not bump field_version');
select throws_ok($$delete from public.trackers where slug = 'reading'$$, '42501', null,
  'trackers are archived, never deleted');
select throws_ok($$
  insert into public.tracker_versions (tracker_id, field_version, fields)
  select id, 9, '[]' from public.trackers where slug = 'reading'
$$, '42501', null, 'tracker versions are written only by the database');
reset role;

select * from finish();
rollback;
