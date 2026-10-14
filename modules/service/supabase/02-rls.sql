-- I-MODE Plus Service & Maintenance — V6.8 Service focus
-- 02-rls.sql — Row Level Security.
--
-- Run this SECOND, after 01-schema.sql.
--
-- READ THIS BEFORE RUNNING
-- ------------------------
-- This is the part that actually secures the system. A login screen alone protects
-- nothing: the anon key is shipped to every browser, so without RLS anyone can call the
-- REST API directly and read or write every table.
--
-- It is also a BREAKING change, on purpose:
--   * Before: the anon key could read and write all tables with no sign-in.
--   * After:  only a signed-in user with an active `profiles` row can touch data, and a
--             Customer can only read their own company's rows.
--
-- Consequence to plan for: the app currently syncs from Supabase at start-up without any
-- sign-in. Once this runs, a device that is not signed in gets nothing from the cloud and
-- falls back to whatever is already in its localStorage. Test that flow before you use
-- this on the production project.
--
-- Safe to run more than once. Every policy is dropped and recreated.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Staff need to see who is who (assignment lists, reports).
drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select to authenticated
  using (public.is_staff());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  -- a user may edit their own name/photo but must not promote themselves
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

-- ---------------------------------------------------------------------------
-- auth_audit — append-only for users, readable by admins
-- ---------------------------------------------------------------------------
alter table public.auth_audit enable row level security;

drop policy if exists auth_audit_insert on public.auth_audit;
create policy auth_audit_insert on public.auth_audit
  for insert to authenticated
  with check (true);

drop policy if exists auth_audit_admin_read on public.auth_audit;
create policy auth_audit_admin_read on public.auth_audit
  for select to authenticated
  using (public.is_admin());

-- No update or delete policy: nobody can rewrite the trail through the API.

-- ---------------------------------------------------------------------------
-- Application tables — staff get full access
--
-- Tables missing from the project are skipped instead of raising an error, so this
-- runs on a partially provisioned project too.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'service_cases','technicians','customers','machines','notifications',
    'system_settings','quotations','machine_warranties','machine_documents',
    'line_customer_requests','service_reports'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then
      raise notice 'skip %: table does not exist', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Customer read access — only their own company's rows
--
-- The app writes most tables in snake_case (customer_id) but pushes `machines` as the
-- raw JavaScript object, which may have produced a quoted "customerId" column instead.
-- Rather than guess, the column is detected here.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  col text;
  tables text[] := array[
    'customers','machines','service_cases','machine_warranties',
    'machine_documents','service_reports','line_customer_requests'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;

    if t = 'customers' then
      col := 'id';
    else
      select c.column_name into col
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = t
         and c.column_name in ('customer_id','customerId')
       order by case c.column_name when 'customer_id' then 1 else 2 end
       limit 1;
    end if;

    if col is null then
      raise notice 'skip customer policy on %: no customer_id / "customerId" column', t;
      continue;
    end if;

    execute format('drop policy if exists customer_read on public.%I', t);
    execute format(
      'create policy customer_read on public.%I for select to authenticated '
      'using (public.is_customer() and %I::text = public.my_customer_id())', t, col);
    raise notice 'customer_read on % uses column %', t, col;
  end loop;
end $$;

-- Customers may open a case and send a portal request for their own company,
-- but may never update or delete one.
do $$
declare
  col text;
begin
  if to_regclass('public.service_cases') is not null then
    select c.column_name into col from information_schema.columns c
     where c.table_schema='public' and c.table_name='service_cases'
       and c.column_name in ('customer_id','customerId') limit 1;
    if col is not null then
      execute format('drop policy if exists customer_insert on public.service_cases');
      execute format(
        'create policy customer_insert on public.service_cases for insert to authenticated '
        'with check (public.is_customer() and %I::text = public.my_customer_id())', col);
    end if;
  end if;

  if to_regclass('public.line_customer_requests') is not null then
    select c.column_name into col from information_schema.columns c
     where c.table_schema='public' and c.table_name='line_customer_requests'
       and c.column_name in ('customer_id','customerId') limit 1;
    if col is not null then
      execute format('drop policy if exists customer_insert on public.line_customer_requests');
      execute format(
        'create policy customer_insert on public.line_customer_requests for insert to authenticated '
        'with check (public.is_customer() and %I::text = public.my_customer_id())', col);
    end if;
  end if;
end $$;

-- Tables a Customer must never read at all: technicians, notifications,
-- system_settings, quotations. They simply have no customer policy above.

-- ---------------------------------------------------------------------------
-- OPTIONAL, stricter: only Admin / Coordinator and Service Manager may write
-- system settings. Enable once you have confirmed that no technician workflow
-- calls cloudSaveSettings(), otherwise their settings sync will fail silently.
-- ---------------------------------------------------------------------------
-- drop policy if exists staff_all on public.system_settings;
-- create policy settings_staff_read on public.system_settings
--   for select to authenticated using (public.is_staff());
-- create policy settings_admin_write on public.system_settings
--   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verify: list every policy that now exists.
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
