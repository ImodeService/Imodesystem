-- I-MODE Plus Service & Maintenance — V6.8 Service focus
-- 00-tables.sql — the 11 data tables the application syncs with.
--
-- Run this FIRST, before 01-schema.sql, on an empty Supabase project.
-- Skip it if your project already has these tables.
--
-- Safe to run more than once: every statement is CREATE TABLE IF NOT EXISTS.
--
-- WHY THE TYPES LOOK LOOSE
-- ------------------------
-- This application is localStorage-first. It sends '' where a date is missing, and its
-- sync helper swallows errors:
--
--     async function cloudUpsert(table,obj){ ... catch(e){ console.warn(e) } }
--
-- So a column that is missing, misspelled, or too strict does not raise anything a user
-- would see — the row simply never arrives. Columns therefore mirror exactly what the app
-- sends, and dates that can be empty are `text` rather than `timestamptz`.
--
-- If you tighten a type later, watch the browser console for upsert warnings.
--
-- NOTE ON `machines` AND `technicians`
-- ------------------------------------
-- Every other table is written in snake_case. These two are pushed as the raw JavaScript
-- object, so `machines` needs QUOTED camelCase columns ("customerId", "nameTh", ...).
-- That is not a mistake here; it is what the current code sends.

-- ---------------------------------------------------------------------------
-- 1. service_cases  — probed by initCloud(); the connection test fails without it
-- ---------------------------------------------------------------------------
create table if not exists public.service_cases (
  id               text primary key,
  ticket           text,
  created_at       text,
  updated_at       text,
  customer_id      text,
  customer         text,
  contact          text,
  phone            text,
  email            text,
  location         text,
  branch           text,
  map_url          text,
  latitude         numeric,
  longitude        numeric,
  field_status     text,
  field_status_log jsonb default '[]'::jsonb,
  machine_id       text,
  machine          text,
  model            text,
  serial           text,
  machine_size     text,
  warranty         text,
  channel          text,
  service_type     text,
  priority         text,
  issue            text,
  note             text,
  status           text,
  assignee         text,
  appointment      text
);

-- ---------------------------------------------------------------------------
-- 2. technicians — written as the raw object; all keys are single lowercase words
-- ---------------------------------------------------------------------------
create table if not exists public.technicians (
  id     text primary key,
  name   text,
  role   text,
  team   text,
  phone  text,
  email  text,
  status text,
  skills text,
  color  text,
  photo  text          -- base64 data URL
);

-- ---------------------------------------------------------------------------
-- 3. customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id                text primary key,
  name              text,
  branch            text,
  contact           text,
  phone             text,
  email             text,
  location          text,
  address           text,
  map_url           text,
  latitude          numeric,
  longitude         numeric,
  note              text,
  line_user_id      text,
  line_display_name text,
  line_linked_at    text
);

-- ---------------------------------------------------------------------------
-- 4. machines — QUOTED camelCase, because cloudUpsert('machines', obj) sends the
--    raw JavaScript object. Do not "fix" these to snake_case: sync would break.
-- ---------------------------------------------------------------------------
create table if not exists public.machines (
  id              text primary key,
  "customerId"    text,
  name            text,
  "nameTh"        text,
  "nameEn"        text,
  model           text,
  serial          text,
  "issueYear"     text,
  "serviceStatus" text,
  size            text,
  "sizeStatus"    text,
  "serviceSize"   text,
  "sizeBasis"     text,
  warranty        text,
  "pmDue"         text,
  note            text,
  photo           text,       -- base64 data URL
  "factoryNamePagePhoto" text,
  "imodeNamePagePhoto" text,
  "createdAt"     timestamptz,
  "updatedAt"     timestamptz,
  source          text,
  "sourceOrder"   text,       -- present on rows imported from the demo customer database
  "qrToken"       text        -- added by ensureMasters(); keep it, printed QR codes use it
);

create index if not exists machines_customer_idx on public.machines ("customerId");
create index if not exists machines_qrtoken_idx  on public.machines ("qrToken");

-- ---------------------------------------------------------------------------
-- 5. notifications — the app only READS this table; nothing in the UI writes it
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         text primary key,
  icon       text,
  title      text,
  message    text,
  created_at text,
  is_read    boolean default false,
  case_id    text
);

-- ---------------------------------------------------------------------------
-- 6. system_settings — one row, id = 'main', the whole settings object as jsonb
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  id         text primary key,
  data       jsonb,
  updated_at text
);

-- ---------------------------------------------------------------------------
-- 7. quotations
-- ---------------------------------------------------------------------------
create table if not exists public.quotations (
  id                     text primary key,
  case_id                text,
  case_ticket            text,
  customer_id            text,
  customer               text,
  contact                text,
  location               text,
  service                text,
  warranty_mode          text,
  warranty_months        numeric,
  distance               numeric,
  distance_source        text,
  route_duration_minutes numeric,
  pickup_mode            numeric,
  urgency                text,
  warranty               text,
  vat_on                 boolean,
  delivery               text,
  payment                text,
  purchaser_name         text,
  purchaser_date         text,
  prepared_by            text,
  prepared_date          text,
  authorized_by          text,
  authorized_date        text,
  machine_ids            jsonb default '[]'::jsonb,
  parts                  jsonb default '[]'::jsonb,
  extra_hours            numeric,
  extra_techs            numeric,
  diagnosis              numeric,
  toll                   numeric,
  other_expense          numeric,
  discount_pct           numeric,
  subtotal               numeric,
  vat                    numeric,
  grand                  numeric,
  status                 text,
  created_at             text,
  updated_at             text
);

-- ---------------------------------------------------------------------------
-- 8. machine_warranties
-- ---------------------------------------------------------------------------
create table if not exists public.machine_warranties (
  id              text primary key,
  warranty_no     text,
  customer_id     text,
  machine_id      text,
  purchase_date   text,
  install_date    text,
  start_date      text,
  end_date        text,
  months          numeric,
  coverage        text,
  exclusions      text,
  note            text,
  issued_by       text,
  attachment_name text,
  attachment_type text,
  attachment_data text,      -- base64
  created_at      text,
  updated_at      text
);

-- ---------------------------------------------------------------------------
-- 9. machine_documents
-- ---------------------------------------------------------------------------
create table if not exists public.machine_documents (
  id          text primary key,
  title       text,
  category    text,
  machine_id  text,
  customer_id text,
  version     text,
  language    text,
  doc_date    text,
  url         text,
  note        text,
  file_name   text,
  file_type   text,
  file_data   text,          -- base64
  created_at  text,
  updated_at  text
);

-- ---------------------------------------------------------------------------
-- 10. line_customer_requests
-- ---------------------------------------------------------------------------
create table if not exists public.line_customer_requests (
  id                text primary key,
  type              text,
  status            text,
  customer_id       text,
  machine_id        text,
  case_id           text,
  contact           text,
  phone             text,
  priority          text,
  months            numeric,
  message           text,
  line_user_id      text,
  line_display_name text,
  created_at        text
);

-- ---------------------------------------------------------------------------
-- 11. service_reports
-- ---------------------------------------------------------------------------
create table if not exists public.service_reports (
  id                 text primary key,
  report_no          text,
  case_id            text,
  customer_id        text,
  machine_id         text,
  tech_id            text,
  service_type       text,
  work_type          text,
  check_in_at        text,
  appointment        text,
  checklist          jsonb default '[]'::jsonb,
  diagnosis          text,
  work_performed     text,
  recommendation     text,
  parts              jsonb default '[]'::jsonb,
  before_photos      jsonb default '[]'::jsonb,
  after_photos       jsonb default '[]'::jsonb,
  videos             jsonb default '[]'::jsonb,
  status_log         jsonb default '[]'::jsonb,
  customer_accept    text,
  customer_signature text,      -- base64 data URL
  tech_signature     text,      -- base64 data URL
  next_pm            text,
  line_sent_at       text,
  line_send_status   text,
  status             text,
  created_at         text,
  updated_at         text
);

-- ---------------------------------------------------------------------------
-- Verify: every table exists and how many columns each has.
-- Expected counts: service_cases 30, technicians 10, customers 15, machines 20,
-- notifications 7, system_settings 3, quotations 39, machine_warranties 18,
-- machine_documents 15, line_customer_requests 14, service_reports 28.
-- ---------------------------------------------------------------------------
select table_name, count(*) as columns
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('service_cases','technicians','customers','machines','notifications',
                      'system_settings','quotations','machine_warranties','machine_documents',
                      'line_customer_requests','service_reports')
 group by table_name
 order by table_name;
