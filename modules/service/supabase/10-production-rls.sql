-- I-MODE Plus Service & Maintenance
-- 10-production-rls.sql — production RLS cut-over (PREPARED FILE; DO NOT RUN YET)
--
-- DO NOT RUN THIS FILE UNTIL ALL OF THESE ARE TRUE:
--   1. The production project and backups exist.
--   2. Every staff account uses Supabase Auth and has an active public.profiles row.
--   3. settings.authConfig.provider is ready to be switched to "supabase".
--   4. The anonymous Customer Portal has been moved off syncCloud() and its current
--      .upsert() calls. See "PORTAL LIMITATION" below.
--
-- This file is intentionally stricter than 04-anon-uat.sql. It removes the policy that
-- gives the public anon key full read/write access to every data table, restores the
-- authenticated staff posture from 02-rls.sql, and leaves anonymous visitors only two
-- validated INSERT paths. It is safe to re-run after the prerequisites above are met.
--
-- PORTAL LIMITATION — WHY THERE IS NO ANON SELECT POLICY HERE
-- -----------------------------------------------------------
-- The current portal identifies a machine with QR-<machine id> (js/21) and syncCloud()
-- selects whole tables (js/03). An RLS policy cannot know which QR was scanned, and that
-- token is predictable rather than a secret. A policy such as
--
--     for select to anon using (true)
--
-- on machines, warranties, documents or cases would therefore expose every customer's
-- rows to anyone holding the public key. Calling that "the customer's own rows" would be
-- false security. Before this file is run, the portal needs an opaque random QR token and
-- a narrow RPC/Edge Function that returns only the selected machine's public snapshot.
-- Until that exists, production deliberately grants anon SELECT on no base data table.
--
-- The current portal also sends both new rows through cloudUpsert(), which uses UPSERT.
-- PostgreSQL requires UPDATE rights for that operation. Production deliberately grants
-- anon INSERT only, so the portal must use .insert() or a validated RPC before cut-over.
-- For a service report with a linked request, insert the case first and then the request;
-- the request policy verifies that case_id belongs to the same customer and machine.
--
-- THIS FILE DOES NOT CHANGE PROJECT URLS, KEYS, TABLE NAMES OR STORED BUSINESS DATA.

begin;

-- Fail before changing anything if the authentication foundation is missing. The whole
-- transaction rolls back on an exception, avoiding a half-secured project.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing — run 01-schema.sql first';
  end if;
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'public.is_staff() is missing — run 01-schema.sql first';
  end if;
  if to_regprocedure('public.is_customer()') is null then
    raise exception 'public.is_customer() is missing — run 01-schema.sql first';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing — run 01-schema.sql first';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- Profiles: a signed-in user can read/update their own non-privilege fields;
-- staff can read the directory; only admins can administer other profiles.
-- -------------------------------------------------------------------------
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select to authenticated
  using (public.is_staff());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role          is not distinct from public.my_role()
    and customer_id   is not distinct from public.my_customer_id()
    and technician_id is not distinct from public.my_technician_id()
  );

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------------------------------------------------------------
-- Auth audit: authenticated users append; admins read; nobody updates/deletes.
-- -------------------------------------------------------------------------
alter table public.auth_audit enable row level security;
revoke all on table public.auth_audit from anon;
grant insert, select on table public.auth_audit to authenticated;
grant usage, select on sequence public.auth_audit_id_seq to authenticated;

drop policy if exists auth_audit_insert on public.auth_audit;
create policy auth_audit_insert on public.auth_audit
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists auth_audit_admin_read on public.auth_audit;
create policy auth_audit_admin_read on public.auth_audit
  for select to authenticated
  using (public.is_admin());

-- -------------------------------------------------------------------------
-- Application data: remove the UAT public policy from all 15 tables and give
-- full access only to authenticated active staff profiles.
-- -------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'service_cases', 'technicians', 'customers', 'machines', 'notifications',
    'system_settings', 'quotations', 'machine_warranties', 'machine_documents',
    'line_customer_requests', 'service_reports', 'qc_records', 'petty_cash',
    'spare_parts', 'purchase_orders'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'skip %: table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists uat_anon_all on public.%I', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- Optional authenticated Customer accounts retained from 02-rls.sql.
-- The current product has no Customer login, but these policies are narrow and
-- preserve compatibility if Supabase Customer accounts are introduced later.
-- -------------------------------------------------------------------------
do $$
declare
  t text;
  col text;
  tables text[] := array[
    'customers', 'machines', 'service_cases', 'machine_warranties',
    'machine_documents', 'service_reports', 'line_customer_requests'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;

    col := null;
    if t = 'customers' then
      col := 'id';
    else
      select c.column_name into col
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = t
         and c.column_name in ('customer_id', 'customerId')
       order by case c.column_name when 'customer_id' then 1 else 2 end
       limit 1;
    end if;

    execute format('drop policy if exists customer_read on public.%I', t);
    if col is not null then
      execute format(
        'create policy customer_read on public.%I for select to authenticated '
        'using (public.is_customer() and %I::text = public.my_customer_id())', t, col);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- Anonymous portal INSERT validation.
--
-- SECURITY DEFINER is limited to a boolean relationship check. It returns no row data,
-- has a fixed search_path, and is the only way an anon insert policy can verify a machine
-- while anon SELECT remains closed.
-- -------------------------------------------------------------------------
create schema if not exists imode_private;
revoke all on schema imode_private from public;
grant usage on schema imode_private to anon, authenticated;

create or replace function imode_private.portal_machine_matches(
  p_machine_id text,
  p_customer_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.machines m
     where m.id = p_machine_id
       and m."customerId" = p_customer_id
  )
$$;

revoke all on function imode_private.portal_machine_matches(text, text) from public;
grant execute on function imode_private.portal_machine_matches(text, text)
  to anon, authenticated;

create or replace function imode_private.portal_case_matches(
  p_case_id text,
  p_machine_id text,
  p_customer_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.service_cases c
     where c.id = p_case_id
       and c.machine_id = p_machine_id
       and c.customer_id = p_customer_id
  )
$$;

revoke all on function imode_private.portal_case_matches(text, text, text) from public;
grant execute on function imode_private.portal_case_matches(text, text, text)
  to anon, authenticated;

-- submitPortalIssue() creates a brand-new case. Anonymous callers may not assign it,
-- schedule it, claim progress, or insert a non-new status.
grant insert on table public.service_cases to anon;
drop policy if exists portal_anon_insert on public.service_cases;
create policy portal_anon_insert on public.service_cases
  for insert to anon
  with check (
    imode_private.portal_machine_matches(machine_id, customer_id)
    and status = 'เคสใหม่'
    and channel = 'LINE OA'
    and coalesce(assignee, '') = ''
    and coalesce(appointment, '') = ''
    and coalesce(field_status, '') = ''
    and coalesce(field_status_log, '[]'::jsonb) = '[]'::jsonb
  );

-- submitPortalIssue(), submitPortalServiceQuoteRequest() and
-- submitPortalWarrantyRequest() create a brand-new request. An anonymous caller may not
-- start it in a processed state or point it at another customer's machine.
grant insert on table public.line_customer_requests to anon;
drop policy if exists portal_anon_insert on public.line_customer_requests;
create policy portal_anon_insert on public.line_customer_requests
  for insert to anon
  with check (
    imode_private.portal_machine_matches(machine_id, customer_id)
    and status = 'ใหม่'
    and type in ('service', 'service_quote', 'warranty_quote', 'warranty_check')
    and (
      case_id is null
      or imode_private.portal_case_matches(case_id, machine_id, customer_id)
    )
  );

-- Remove old authenticated-customer INSERT policies before recreating the same narrow
-- relationship check. Staff are covered by staff_all.
drop policy if exists customer_insert on public.service_cases;
create policy customer_insert on public.service_cases
  for insert to authenticated
  with check (
    public.is_customer()
    and customer_id = public.my_customer_id()
    and imode_private.portal_machine_matches(machine_id, customer_id)
    and status = 'เคสใหม่'
  );

drop policy if exists customer_insert on public.line_customer_requests;
create policy customer_insert on public.line_customer_requests
  for insert to authenticated
  with check (
    public.is_customer()
    and customer_id = public.my_customer_id()
    and imode_private.portal_machine_matches(machine_id, customer_id)
    and status = 'ใหม่'
    and (
      case_id is null
      or imode_private.portal_case_matches(case_id, machine_id, customer_id)
    )
  );

commit;

-- -------------------------------------------------------------------------
-- Verification — run after the transaction. Expected:
--   * no uat_anon_all rows;
--   * staff_all on every existing application table;
--   * anon appears only on portal_anon_insert for the two intake tables;
--   * anon has INSERT only on those two tables and no SELECT/UPDATE/DELETE.
-- -------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;

select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'anon'
 order by table_name, privilege_type;
