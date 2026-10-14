-- I-MODE Plus Service & Maintenance — V6.8 Service focus
-- 04-anon-uat.sql — let the application actually read and write the 11 data tables.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- 02-rls.sql grants every policy `to authenticated`. Nobody in this application is ever
-- `authenticated` in Supabase's sense:
--
--   * customers have had no accounts since the 2026-09-07 change (they scan a QR instead),
--   * staff sign in against the local UAT registry in js/09, not Supabase Auth.
--
-- So every request the app makes carries the publishable (anon) key, and with 02-rls.sql
-- applied the result is:
--
--   INSERT / UPDATE -> 42501 "new row violates row-level security policy"
--                      and cloudUpsert() swallows it: catch(e){ console.warn(e) }
--   SELECT          -> HTTP 200 with ZERO ROWS, which is indistinguishable from an
--                      empty table, so syncCloud()'s `if(!c.error && c.data.length)`
--                      guards simply never fire.
--
-- initCloud() only checks that a select does not error, so the badge says
-- "Cloud Connected" while nothing can be read or written. That green light is why this
-- went unnoticed. js/24-v69CloudHealthScript.js now reports a rejected write.
--
--
-- ⚠️  WHAT THIS FILE ACTUALLY GRANTS — READ BEFORE RUNNING
-- --------------------------------------------------------
-- It gives the `anon` role full read and write on all 11 data tables. The publishable key
-- is shipped in js/23-v69CloudConfigScript.js and that file is in a public GitHub
-- repository, so in practice this means:
--
--        ANYONE ON THE INTERNET CAN READ AND WRITE THIS DATABASE.
--
-- That is the same exposure as `disable row level security`, only written down explicitly
-- so it is visible in the dashboard and survives a re-run of 02-rls.sql (which drops and
-- recreates only its own `staff_all` / `customer_*` policies, not these).
--
-- This is acceptable ONLY as a UAT posture on a throwaway project named
-- service_Imode_test. DO NOT put real customer records, real phone numbers or signed
-- service reports in a database in this state.
--
-- To go to production instead, do not run this file. Move the staff login to Supabase Auth
-- (auth/auth-supabase.js is written and switches itself on once a URL and key are
-- configured), keep 02-rls.sql, and add one narrow anon INSERT policy for the two tables a
-- customer with no account has to write — service_cases and line_customer_requests.
--
-- TO UNDO
-- -------
--   drop policy if exists uat_anon_all on public.<table>;
--
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'service_cases', 'technicians', 'customers', 'machines', 'notifications',
    'system_settings', 'quotations', 'machine_warranties', 'machine_documents',
    'line_customer_requests', 'service_reports'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'skipped %: table does not exist — run 00-tables.sql first', t;
      continue;
    end if;

    -- RLS stays ON. A table with RLS enabled and no matching policy denies everything,
    -- which is exactly the state this file fixes; the policy below is what grants access.
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists uat_anon_all on public.%I', t);
    execute format(
      'create policy uat_anon_all on public.%I for all to anon, authenticated '
      'using (true) with check (true)', t);

    raise notice 'granted anon read/write on %', t;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verify: every one of the 11 tables must appear exactly once with cmd = ALL
-- and roles containing {anon,authenticated}.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and policyname = 'uat_anon_all'
 order by tablename;
