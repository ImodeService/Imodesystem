-- I-MODE Plus Service & Maintenance — V6.8 Service focus
-- 03-users.sql — the four UAT accounts.
--
-- Run this THIRD, after 01-schema.sql (and 02-rls.sql if you are enabling RLS).
--
-- THE ACCOUNTS
-- ------------
--   admin_test                            Admin / Coordinator   (no record link)
--   technician_test1                      Technician            -> technicians.id = 'T001'
--   technician_test2                      Technician            -> technicians.id = 'T002'
--   customer_test1                        Customer              -> customers.id   = 'CUST-0001'
--                                                                 (บริษัท ลูกค้าตัวอย่าง 1 จำกัด)
--
-- Emails follow the application's convention: a username with no '@' becomes
-- <username>@imode.local. That domain cannot receive mail, so password reset will not work
-- for these accounts. Use real addresses for anyone who needs to reset their own password.
--
-- Passwords are NOT in this file. Choose a strong password for each account yourself (never
-- the username) and keep it out of the repository.

-- ===========================================================================
-- METHOD A — Dashboard (recommended, always works)
-- ===========================================================================
-- Authentication -> Users -> Add user, four times.
--
--   * TICK "Auto Confirm User". Without it Supabase refuses the sign-in with
--     "Email not confirmed", and @imode.local can never receive the confirmation mail.
--   * Paste the matching block into the "User Metadata" box. The trigger from
--     01-schema.sql then fills in public.profiles for you.
--
-- Email: admin_test@imode.local          Password: (set your own)
-- {
--   "username": "admin_test",
--   "full_name": "ผู้ดูแลระบบ UAT",
--   "role": "Admin / Coordinator",
--   "team": "Admin"
-- }
--
-- Email: technician_test1@imode.local    Password: (set your own)
-- {
--   "username": "technician_test1",
--   "full_name": "สมชาย ใจดี",
--   "role": "Technician",
--   "team": "Technical",
--   "technician_id": "T001"
-- }
--
-- Email: technician_test2@imode.local    Password: (set your own)
-- {
--   "username": "technician_test2",
--   "full_name": "ณัฐพล ช่างดี",
--   "role": "Technician",
--   "team": "Technical",
--   "technician_id": "T002"
-- }
--
-- Email: customer_test1@imode.local      Password: (set your own)
-- {
--   "username": "customer_test1",
--   "full_name": "บริษัท ลูกค้าตัวอย่าง 1 จำกัด",
--   "role": "Customer",
--   "customer_id": "CUST-0001"
-- }
--
-- After creating all four, jump to "CHECKS" at the bottom.


-- ===========================================================================
-- METHOD B — create all four in one go (faster; writes into auth.users directly)
-- ===========================================================================
-- Supabase does not officially support inserting into auth.users, and the column set has
-- changed between versions. This block adapts to what your project actually has, but if it
-- errors, do not fight it: delete any half-created user under Authentication -> Users and
-- use METHOD A instead.
--
-- Safe to run again: an email that already exists is skipped.
--
-- REQUIRES 01-schema.sql to have run first (it creates public.profiles and the trigger
-- that fills it in). Without it these users are created but linked to nothing.

-- pgcrypto gives us crypt()/gen_salt() for the bcrypt hash. Kept as its own statement so a
-- privilege error here is obvious instead of being buried inside the block below.
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  acct     record;
  new_id   uuid;
  has_provider_id boolean;
begin
  -- pgcrypto lives in `extensions` on most Supabase projects but in `public` on some, so
  -- put both on the search_path and call crypt() unqualified rather than guessing.
  perform set_config('search_path', 'public, extensions', true);

  if to_regprocedure('crypt(text, text)') is null then
    raise exception 'pgcrypto not reachable. Run: create extension if not exists pgcrypto with schema extensions;';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing — run 01-schema.sql before this file.';
  end if;

  select exists (
    select 1 from information_schema.columns
     where table_schema='auth' and table_name='identities' and column_name='provider_id'
  ) into has_provider_id;

  for acct in
    select * from (values
      ('admin_test',       'CHANGE_ME',        'ผู้ดูแลระบบ UAT',                              'Admin / Coordinator', 'Admin',     null::text, null::text),
      ('technician_test1', 'CHANGE_ME',        'สมชาย ใจดี',                                   'Technician',          'Technical', 'T001',     null::text),
      ('technician_test2', 'CHANGE_ME',        'ณัฐพล ช่างดี',                                 'Technician',          'Technical', 'T002',     null::text),
      ('customer_test1',   'CHANGE_ME',        'บริษัท ลูกค้าตัวอย่าง 1 จำกัด',        'Customer',            '',          null::text, 'CUST-0001')
    ) as t(username, password, full_name, role, team, technician_id, customer_id)
  loop
    if acct.password = 'CHANGE_ME' or acct.password = acct.username then
      raise exception 'set a real password for % before running this block', acct.username;
    end if;

    if exists (select 1 from auth.users where email = acct.username || '@imode.local') then
      raise notice 'skip %: already exists', acct.username;
      continue;
    end if;

    new_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_id,
      'authenticated',
      'authenticated',
      acct.username || '@imode.local',
      crypt(acct.password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'username',      acct.username,
        'full_name',     acct.full_name,
        'role',          acct.role,
        'team',          acct.team,
        'technician_id', acct.technician_id,
        'customer_id',   acct.customer_id
      )),
      '', '', '', ''
    );

    -- an identity row is what makes email/password sign-in work
    if has_provider_id then
      insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                   last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), new_id,
              jsonb_build_object('sub', new_id::text, 'email', acct.username || '@imode.local'),
              'email', acct.username || '@imode.local', now(), now(), now());
    else
      insert into auth.identities (id, user_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), new_id,
              jsonb_build_object('sub', new_id::text, 'email', acct.username || '@imode.local'),
              'email', now(), now(), now());
    end if;

    raise notice 'created %', acct.username;
  end loop;
end $$;


-- ===========================================================================
-- FIX-UP — run this if you created users without metadata, or to correct a link
-- ===========================================================================
update public.profiles p
   set username = 'admin_test', full_name = 'ผู้ดูแลระบบ UAT',
       role = 'Admin / Coordinator', team = 'Admin',
       technician_id = null, customer_id = null, is_active = true
  from auth.users u
 where u.id = p.id and u.email = 'admin_test@imode.local';

update public.profiles p
   set username = 'technician_test1', full_name = 'สมชาย ใจดี',
       role = 'Technician', team = 'Technical',
       technician_id = 'T001', customer_id = null, is_active = true
  from auth.users u
 where u.id = p.id and u.email = 'technician_test1@imode.local';

update public.profiles p
   set username = 'technician_test2', full_name = 'ณัฐพล ช่างดี',
       role = 'Technician', team = 'Technical',
       technician_id = 'T002', customer_id = null, is_active = true
  from auth.users u
 where u.id = p.id and u.email = 'technician_test2@imode.local';

update public.profiles p
   set username = 'customer_test1', full_name = 'บริษัท ลูกค้าตัวอย่าง 1 จำกัด',
       role = 'Customer', team = '',
       technician_id = null, customer_id = 'CUST-0001', is_active = true
  from auth.users u
 where u.id = p.id and u.email = 'customer_test1@imode.local';


-- ===========================================================================
-- CHECKS — all four must look right before you trust the login
-- ===========================================================================

-- 1. The four accounts and what they are linked to.
--    Expect exactly 4 rows, each with confirmed = true.
select p.username,
       u.email,
       p.role,
       p.team,
       p.technician_id,
       p.customer_id,
       p.is_active,
       (u.email_confirmed_at is not null) as confirmed
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.username in ('admin_test','technician_test1','technician_test2','customer_test1')
 order by p.username;

-- 2. Broken links. Must return 0 rows.
--    A Technician with no technician_id sees an empty Field Service queue; a Customer with
--    no customer_id sees an empty portal. Both fail quietly, so check here instead.
select p.username, p.role, p.technician_id, p.customer_id, 'missing record link' as problem
  from public.profiles p
 where (p.role = 'Customer'   and coalesce(p.customer_id,'')   = '')
    or (p.role = 'Technician' and coalesce(p.technician_id,'') = '');

-- 3. Unconfirmed accounts. Must return 0 rows, or the sign-in fails with
--    "Email not confirmed". Fix by ticking Auto Confirm, or run the update below.
select email, created_at from auth.users where email_confirmed_at is null;
-- update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- 4. An auth user with no profile cannot sign in — the app refuses it on purpose.
select u.email, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- 5. The linked records must actually exist in the synced data, or the links point at
--    nothing. Run this only after the data has been seeded (see export-local-to-sql.js).
select 'T001' as expected, exists(select 1 from public.technicians where id = 'T001') as found
union all
select 'T002', exists(select 1 from public.technicians where id = 'T002')
union all
select 'CUST-0001', exists(select 1 from public.customers where id = 'CUST-0001');


-- ===========================================================================
-- Housekeeping
-- ===========================================================================

-- Disable an account without deleting it (keeps the audit trail).
-- The device keeps working until its cached session expires — see offlineGraceDays.
-- update public.profiles set is_active = false where username = 'technician_test2';

-- Remove all four UAT accounts. Deleting from auth.users cascades to profiles.
-- delete from auth.users
--  where email in ('admin_test@imode.local','technician_test1@imode.local',
--                  'technician_test2@imode.local','customer_test1@imode.local');
