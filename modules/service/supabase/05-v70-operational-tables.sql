-- I-MODE Plus Service & Maintenance
-- 05-v70-operational-tables.sql
--
-- The four modules that never left the device: QC เครื่อง, เงินสดย่อย, สต๊อกอะไหล่ and
-- ใบสั่งซื้อ. They had no table at all, so a QC done on a technician's tablet was invisible
-- to the office and always would be. Everything else the application owns already syncs.
--
-- RUN THIS ONCE, in the Supabase dashboard -> SQL Editor -> New query -> Run.
-- "Success. No rows returned" is the correct answer for a CREATE/ALTER.
-- Until it is run the application keeps working exactly as before, on the device only.
--
-- WHY jsonb AND NOT ONE COLUMN PER FIELD
--
-- Every other table in this project maps each field to a column, and cloudUpsert() sends an
-- explicit whitelist. That has already cost this project twice: a field added in JavaScript
-- is dropped silently on the way out, and nobody notices until a second device is involved.
-- These four records are read and written only by this application — nothing joins them,
-- nothing reports on them in SQL — so the whole record travels as jsonb and a new field
-- needs no migration and can never be silently lost. system_settings already works this way.
--
-- SECURITY, STATED PLAINLY
--
-- These policies match 04-anon-uat.sql: anon may do everything. That is the current posture
-- of this project — RLS is effectively open and the publishable key ships in the repo — and
-- it is acceptable only because this is UAT data on service_Imode_test. Petty cash rows
-- carry amounts and supplier names; if real financial records are ever put here, these
-- policies must be narrowed at the same time as the rest.

-- ---------------------------------------------------------------- QC เครื่อง ------
create table if not exists public.qc_records (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- เงินสดย่อย ------
create table if not exists public.petty_cash (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- สต๊อกอะไหล่ ------
create table if not exists public.spare_parts (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- ใบสั่งซื้อ ------
create table if not exists public.purchase_orders (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------- access -------
-- Same shape as 04-anon-uat.sql: RLS stays ON and one permissive policy is named, so the
-- grant is visible in the dashboard and survives a re-run of 02-rls.sql, which drops and
-- recreates only its own staff_all / customer_* policies. Disabling RLS instead is what
-- silently reverted last time.
do $$
declare t text;
begin
  foreach t in array array['qc_records','petty_cash','spare_parts','purchase_orders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists uat_anon_all on public.%I', t);
    execute format(
      'create policy uat_anon_all on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant all on public.%I to anon, authenticated', t);
    raise notice 'ready: %', t;
  end loop;
end $$;

-- ------------------------------------------------------------------- verify -------
-- Should return four rows, each with rls = true and one policy.
select c.relname                                   as table_name,
       c.relrowsecurity                            as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('qc_records','petty_cash','spare_parts','purchase_orders')
 order by c.relname;
