-- LOCAL ONLY. Fake accounts for development and end-to-end tests.
--
-- `supabase db reset` runs this after the migrations. `supabase db push` never sends
-- it to the cloud project, and nothing here is real: every address is @example.test and
-- the password below exists nowhere else.
--
--   student@example.test    student, linked to the viewer
--   student2@example.test   student, linked to nobody
--   admin@example.test      admin, no MFA factor
--   viewer@example.test     viewer, linked to student only
--
-- Password for all four: local-dev-password
--
-- Trackers and plan templates come from `pnpm seed`, not from here.

do $$
declare
  v_account record;
  v_id uuid;
begin
  for v_account in
    select * from (values
      ('student@example.test', 'student', 'Sam'),
      ('student2@example.test', 'student', 'Riley'),
      ('admin@example.test', 'admin', 'Alex'),
      ('viewer@example.test', 'viewer', 'Jordan')
    ) as a (email, role, display_name)
  loop
    v_id := gen_random_uuid();

    -- Supabase Auth expects the token columns to be '' rather than null.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_account.email, extensions.crypt('local-dev-password', extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, provider, identity_data,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
            jsonb_build_object('sub', v_id::text, 'email', v_account.email, 'email_verified', true),
            now(), now(), now());

    insert into public.profiles (id, role, display_name)
    values (v_id, v_account.role, v_account.display_name);
  end loop;

  insert into public.viewer_links (viewer_id, student_id)
  select v.id, s.id
  from auth.users v, auth.users s
  where v.email = 'viewer@example.test' and s.email = 'student@example.test';
end $$;
