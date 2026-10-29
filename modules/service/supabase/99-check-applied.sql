-- ---------------------------------------------------------------------------
-- I-MODE System
-- 99-check-applied.sql   READ ONLY — changes nothing. Paste into the Supabase SQL Editor and Run.
--
-- One row per migration. `applied` = true means what that file adds is already there; false means
-- the file still has to be run. Run it on each project you use (test and production) — they can
-- differ. Files that only add policies or replace a function (02, 03, 04-anon, 10, 05-portal) cannot
-- be told apart from here and are not listed.
-- ---------------------------------------------------------------------------
with
col(t, c) as (values
  ('service_cases', 'media'),
  ('service_cases', 'responded_at'),
  ('service_cases', 'reported'),
  ('machines',      'factoryNamePagePhoto'),
  ('machines',      'imodeSn'),
  ('customers',     'contacts'),
  ('profiles',      'extra_roles'),
  ('qc_records',    'assigned_to')
),
tbl(t) as (values
  ('qc_records'), ('petty_cash'), ('spare_parts'), ('purchase_orders'),
  ('client_errors'), ('notification_reads'), ('case_messages'),
  ('direct_messages'), ('chat_reactions'), ('qc_counters')
),
rows as (
  select 'column ' || t || '.' || c as item,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = col.t and column_name = col.c) as applied
  from col
  union all
  select 'table ' || t,
         exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = tbl.t)
  from tbl
  union all
  select 'realtime service_cases (08)',
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_cases')
  union all
  select 'function my_roles (04-multi-role-rename)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'my_roles')
)
select item, applied from rows order by applied, item;
