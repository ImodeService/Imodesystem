-- I-MODE System — QC & R&D module
-- 02-qc-core.sql — QC phase 1 "QC Core" (run once in the Supabase SQL Editor)
--
-- RUN ONLY THIS FILE. It contains everything 01-qc-records.sql did (that file was never run on
-- the live project), so a project that has neither gets the whole QC module from this one.
-- Running it on a project that already ran 01 is also fine. SAFE TO RE-RUN.
--
-- WHAT IT ADDS
-- ------------
-- 1. public.qc_records            one row per QC document (as in 01) + the job fields of phase 1:
--                                  assigned inspector, planned date, priority, location, PO /
--                                  project / supplier, received date, accessories.
-- 2. public.machines (Service's)   a machine is ONE row for its whole life (user, 2026-10-27:
--                                  "อยากให้มันควบคู่ไปกับ service ... หลังส่งเครื่องให้ลูกค้าแล้ว
--                                  service จะเข้ามาดูแลต่อ"). QC registers a new machine here and
--                                  Service takes it over after hand-over. New columns only, in the
--                                  table's own camelCase style:
--                                    "imodeSn"    IMD-M-YY-NNNN, unique, made by the server
--                                    "factorySn"  the maker's serial number
--                                    "lifecycle"  'qc' (in QC) | 'ready' (QC passed, waiting to go)
--                                                 | 'delivered' (handed over; Service owns it)
--                                                 | null (every machine Service already had)
--                                    "poNo" "projectNo" "supplier" "receivedAt"
--                                  Nothing existing is changed or removed. Service's own saves send
--                                  only the fields they know, so they never wipe these.
-- 3. public.qc_evidence            photos, clips and test files of a QC, as files in Storage
--                                  (bucket qc-evidence, private) instead of base64 in the row.
--                                  `kind` names the seven required photos.
-- 4. public.qc_intake(...)         one server call that registers a new machine, gives it the next
--                                  IMODE S/N and opens its QC job, all or nothing.
--    public.qc_handover(...)       hands a machine whose QC passed to its customer (lifecycle
--                                  'delivered'), so it appears in Service.
--
-- WHO MAY DO WHAT (RLS) — same as 01: signed-in staff read / add / edit; admins delete; anon none.
-- Narrowing to the QC & R&D line (Admin / Head / Technician) is phase 2.
--
-- AFTER RUNNING: the last query lists what exists; every row should say ok.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_staff() / public.is_admin() missing — run Service supabase/01-schema.sql first';
  end if;
  if to_regclass('public.machines') is null then
    raise exception 'public.machines missing — run Service supabase/00-tables.sql first';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. qc_records (from 01-qc-records.sql, unchanged) + phase-1 job fields
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_records (
  id                text primary key,
  qc_no             text not null,
  type              text not null default 'Pre-Delivery QC',
  qc_date           date,
  status            text not null default 'Draft',
  customer_id       text,
  machine_id        text,
  case_id           text,
  inspector         text default '',
  reviewer          text default '',
  target_company    text default '',
  checklist         jsonb not null default '[]'::jsonb,
  findings          text default '',
  corrective_action text default '',
  note              text default '',
  media             jsonb not null default '[]'::jsonb,
  source            text default 'qc-module',   -- 'service-local' = imported from a browser
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  constraint qc_records_type_chk check (type in
    ('Incoming Inspection','Pre-Delivery QC','Post-Service QC','Installation Acceptance','PM Verification')),
  constraint qc_records_status_chk check (status in ('Draft','In Progress','Pass','Conditional','Fail'))
);

alter table public.qc_records add column if not exists assigned_to        text default '';   -- inspector the job is given to
alter table public.qc_records add column if not exists planned_date       date;
alter table public.qc_records add column if not exists priority           text not null default 'normal';
alter table public.qc_records add column if not exists location           text default '';
alter table public.qc_records add column if not exists po_no              text default '';
alter table public.qc_records add column if not exists project_no         text default '';
alter table public.qc_records add column if not exists supplier           text default '';
alter table public.qc_records add column if not exists received_date      date;
alter table public.qc_records add column if not exists accessories        text default '';   -- received
alter table public.qc_records add column if not exists accessories_missing text default '';  -- still to come
alter table public.qc_records add column if not exists accessories_status text not null default 'complete';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qc_records_priority_chk') then
    alter table public.qc_records add constraint qc_records_priority_chk check (priority in ('normal','urgent','critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qc_records_accessories_chk') then
    alter table public.qc_records add constraint qc_records_accessories_chk
      check (accessories_status in ('complete','outstanding','partial','delivered'));
  end if;
end $$;

create unique index if not exists qc_records_qc_no_key on public.qc_records (qc_no);
create index if not exists qc_records_case_idx    on public.qc_records (case_id);
create index if not exists qc_records_machine_idx on public.qc_records (machine_id);
create index if not exists qc_records_date_idx    on public.qc_records (qc_date desc);

-- who and when, set by the server so the page cannot fake it
create or replace function public.qc_records_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists qc_records_touch on public.qc_records;
create trigger qc_records_touch before insert or update on public.qc_records
  for each row execute function public.qc_records_touch();

alter table public.qc_records enable row level security;

drop policy if exists qc_records_staff_read   on public.qc_records;
drop policy if exists qc_records_staff_insert on public.qc_records;
drop policy if exists qc_records_staff_update on public.qc_records;
drop policy if exists qc_records_admin_delete on public.qc_records;

create policy qc_records_staff_read on public.qc_records
  for select to authenticated using (public.is_staff());
create policy qc_records_staff_insert on public.qc_records
  for insert to authenticated with check (public.is_staff());
create policy qc_records_staff_update on public.qc_records
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy qc_records_admin_delete on public.qc_records
  for delete to authenticated using (public.is_admin());

revoke all on public.qc_records from anon;
grant select, insert, update, delete on public.qc_records to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. machines: the QC columns
-- ---------------------------------------------------------------------------------------------
alter table public.machines add column if not exists "imodeSn"    text;
alter table public.machines add column if not exists "factorySn"  text;
alter table public.machines add column if not exists "lifecycle"  text;
alter table public.machines add column if not exists "poNo"       text;
alter table public.machines add column if not exists "projectNo"  text;
alter table public.machines add column if not exists "supplier"   text;
alter table public.machines add column if not exists "receivedAt" date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'machines_lifecycle_chk') then
    alter table public.machines add constraint machines_lifecycle_chk
      check ("lifecycle" is null or "lifecycle" in ('qc','ready','delivered'));
  end if;
end $$;

create unique index if not exists machines_imode_sn_key on public.machines ("imodeSn") where "imodeSn" is not null;
create index if not exists machines_lifecycle_idx on public.machines ("lifecycle") where "lifecycle" is not null;

-- An IMODE S/N, once given, changes only by an admin (phase 2 adds the Head QC approval + log).
-- Service's saves never send the column, and a save that sends the same value passes.
create or replace function public.machines_keep_imode_sn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old."imodeSn" is not null and new."imodeSn" is distinct from old."imodeSn" and not public.is_admin() then
    raise exception 'IMODE S/N % เปลี่ยนได้เฉพาะผู้ดูแลระบบ', old."imodeSn" using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists machines_keep_imode_sn on public.machines;
create trigger machines_keep_imode_sn before update of "imodeSn" on public.machines
  for each row execute function public.machines_keep_imode_sn();

-- running number per year for IMD-M-YY-NNNN
create table if not exists public.qc_counters (
  name text primary key,          -- 'imode_sn:26'
  n    integer not null default 0
);
alter table public.qc_counters enable row level security;   -- no policies: only the functions below touch it
revoke all on public.qc_counters from anon, authenticated;

create or replace function public.qc_next_imode_sn()
returns text language plpgsql security definer set search_path = public as $$
declare
  yy  text := to_char(now() at time zone 'Asia/Bangkok', 'YY');
  k   text := 'imode_sn:' || yy;
  n   integer;
  floor_n integer;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  -- never hand out a number below one already used this year (e.g. typed by hand)
  select coalesce(max((regexp_match("imodeSn", '^IMD-M-' || yy || '-(\d+)$'))[1]::int), 0)
    into floor_n from public.machines where "imodeSn" like 'IMD-M-' || yy || '-%';
  insert into public.qc_counters as c (name, n) values (k, floor_n + 1)
    on conflict (name) do update set n = greatest(c.n, floor_n) + 1
    returning c.n into n;
  return 'IMD-M-' || yy || '-' || lpad(n::text, 4, '0');
end $$;

-- QC document number QC-YYYYMM-NNN, made on the server for jobs opened by qc_intake()
create or replace function public.qc_next_no()
returns text language plpgsql security definer set search_path = public as $$
declare
  ym text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  n  integer;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('qc_no:' || ym));
  select coalesce(max((regexp_match(qc_no, '^QC-' || ym || '-(\d+)'))[1]::int), 0) + 1
    into n from public.qc_records where qc_no like 'QC-' || ym || '-%';
  return 'QC-' || ym || '-' || lpad(n::text, 3, '0');
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. evidence files
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_evidence (
  id          uuid primary key default gen_random_uuid(),
  qc_id       text not null references public.qc_records(id) on delete cascade,
  machine_id  text,
  kind        text not null default 'extra',
  check_id    text,                 -- checklist item the file belongs to, if any
  path        text not null,        -- object path in bucket qc-evidence
  name        text default '',
  mime        text default '',
  size        bigint default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint qc_evidence_kind_chk check (kind in
    ('front','back','left','right','factoryPlate','imodePlate','accessories','extra','test'))
);
create index if not exists qc_evidence_qc_idx on public.qc_evidence (qc_id);
create unique index if not exists qc_evidence_path_key on public.qc_evidence (path);

alter table public.qc_evidence enable row level security;
drop policy if exists qc_evidence_staff_read   on public.qc_evidence;
drop policy if exists qc_evidence_staff_insert on public.qc_evidence;
drop policy if exists qc_evidence_owner_delete on public.qc_evidence;
create policy qc_evidence_staff_read on public.qc_evidence
  for select to authenticated using (public.is_staff());
create policy qc_evidence_staff_insert on public.qc_evidence
  for insert to authenticated with check (public.is_staff() and created_by = auth.uid());
-- remove: whoever added it, or an admin. Files stay on the QC history otherwise.
create policy qc_evidence_owner_delete on public.qc_evidence
  for delete to authenticated using (public.is_staff() and (created_by = auth.uid() or public.is_admin()));
revoke all on public.qc_evidence from anon;
grant select, insert, delete on public.qc_evidence to authenticated;

-- private bucket; files are read through short-lived signed links
insert into storage.buckets (id, name, public, file_size_limit)
  values ('qc-evidence', 'qc-evidence', false, 20971520)   -- 20 MB a file
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists qc_evidence_files_read   on storage.objects;
drop policy if exists qc_evidence_files_insert on storage.objects;
drop policy if exists qc_evidence_files_delete on storage.objects;
create policy qc_evidence_files_read on storage.objects
  for select to authenticated using (bucket_id = 'qc-evidence' and public.is_staff());
create policy qc_evidence_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'qc-evidence' and public.is_staff());
create policy qc_evidence_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'qc-evidence' and public.is_staff() and (owner = auth.uid() or public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 4. intake and hand-over
-- ---------------------------------------------------------------------------------------------
-- p: { nameTh, nameEn, model, factorySn, supplier, poNo, projectNo, customerId, receivedAt,
--      type, location, accessories, accessoriesMissing, assignedTo, plannedDate, priority, note, inspector }
create or replace function public.qc_intake(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mid    text := 'M-QC-' || replace(gen_random_uuid()::text, '-', '');
  qid    text := 'QC-' || upper(replace(gen_random_uuid()::text, '-', ''));
  sn     text;
  qno    text;
  t      text := coalesce(nullif(p->>'type', ''), 'Incoming Inspection');
  miss   text := coalesce(p->>'accessoriesMissing', '');
  fsn    text := nullif(trim(coalesce(p->>'factorySn', '')), '');
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p->>'nameTh'), '') = '' or coalesce(trim(p->>'model'), '') = '' then
    raise exception 'ต้องมีชื่อเครื่องและรุ่น';
  end if;
  if t not in ('Incoming Inspection', 'Pre-Delivery QC') then
    raise exception 'การรับเครื่องเข้าใช้ได้กับ ตรวจรับเข้า หรือ ตรวจก่อนส่งมอบ เท่านั้น';
  end if;
  if fsn is not null and exists (select 1 from public.machines where "factorySn" = fsn and "model" = p->>'model') then
    raise exception 'มีเครื่องรุ่น % Factory S/N % ในระบบแล้ว', p->>'model', fsn;
  end if;

  -- the machine gets its customer only at qc_handover(): until then the customer portal must not see it
  sn  := public.qc_next_imode_sn();
  qno := public.qc_next_no();

  insert into public.machines (id, "customerId", name, "nameTh", "nameEn", model, serial, "imodeSn", "factorySn",
                               "lifecycle", "poNo", "projectNo", supplier, "receivedAt", source, "createdAt", "updatedAt")
  values (mid, null, trim(p->>'nameTh'), trim(p->>'nameTh'), coalesce(p->>'nameEn', ''), trim(p->>'model'),
          coalesce(fsn, ''), sn, fsn, 'qc', coalesce(p->>'poNo', ''), coalesce(p->>'projectNo', ''), coalesce(p->>'supplier', ''),
          nullif(p->>'receivedAt', '')::date, 'QC', now(), now());

  insert into public.qc_records (id, qc_no, type, qc_date, status, customer_id, machine_id, inspector, target_company,
                                 assigned_to, planned_date, priority, location, po_no, project_no, supplier, received_date,
                                 accessories, accessories_missing, accessories_status, note, source)
  values (qid, qno, t, coalesce(nullif(p->>'plannedDate', '')::date, (now() at time zone 'Asia/Bangkok')::date), 'Draft',
          nullif(p->>'customerId', ''), mid, coalesce(p->>'inspector', ''), coalesce(p->>'targetCompany', ''),
          coalesce(p->>'assignedTo', ''), nullif(p->>'plannedDate', '')::date,
          coalesce(nullif(p->>'priority', ''), 'normal'), coalesce(p->>'location', ''),
          coalesce(p->>'poNo', ''), coalesce(p->>'projectNo', ''), coalesce(p->>'supplier', ''), nullif(p->>'receivedAt', '')::date,
          coalesce(p->>'accessories', ''), miss, case when trim(miss) = '' then 'complete' else 'outstanding' end,
          coalesce(p->>'note', ''), 'qc-intake');

  return jsonb_build_object('machine_id', mid, 'imode_sn', sn, 'qc_id', qid, 'qc_no', qno);
end $$;

-- hand a machine whose latest QC passed to its customer; it then shows in Service
create or replace function public.qc_handover(p_machine_id text, p_customer_id text, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  last_status text;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_customer_id, '') = '' then raise exception 'ต้องเลือกลูกค้า'; end if;
  select status into last_status from public.qc_records
   where machine_id = p_machine_id order by coalesce(qc_date, created_at::date) desc, created_at desc limit 1;
  if last_status is distinct from 'Pass' then
    raise exception 'ส่งมอบได้เมื่อ QC ล่าสุดของเครื่องนี้ผ่านแล้วเท่านั้น (ผ่านแบบมีเงื่อนไขไม่นับ)';
  end if;
  update public.machines
     set "customerId" = p_customer_id, "lifecycle" = 'delivered', "updatedAt" = now(),
         note = trim(both from coalesce(note, '') || ' ส่งมอบจาก QC ' || to_char(coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYY-MM-DD'))
   where id = p_machine_id and "lifecycle" in ('qc', 'ready');
  if not found then raise exception 'ไม่พบเครื่องนี้ในขั้นตอน QC'; end if;
end $$;

-- a QC that passes moves its new machine to 'ready'; one that stops passing moves it back
create or replace function public.qc_records_machine_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.machine_id is null then return new; end if;
  update public.machines
     set "lifecycle" = case when new.status = 'Pass' then 'ready' else 'qc' end
   where id = new.machine_id and "lifecycle" in ('qc', 'ready');
  return new;
end $$;

drop trigger if exists qc_records_machine_stage on public.qc_records;
create trigger qc_records_machine_stage after insert or update of status on public.qc_records
  for each row execute function public.qc_records_machine_stage();

revoke all on function public.qc_next_imode_sn() from public, anon;
revoke all on function public.qc_next_no()       from public, anon;
revoke all on function public.qc_intake(jsonb)   from public, anon;
revoke all on function public.qc_handover(text, text, date) from public, anon;
grant execute on function public.qc_next_imode_sn() to authenticated;
grant execute on function public.qc_next_no()       to authenticated;
grant execute on function public.qc_intake(jsonb)   to authenticated;
grant execute on function public.qc_handover(text, text, date) to authenticated;

commit;

-- Check: every row should say ok
select 'qc_records table'   as item, case when to_regclass('public.qc_records')  is not null then 'ok' else 'MISSING' end as result
union all select 'qc_evidence table', case when to_regclass('public.qc_evidence') is not null then 'ok' else 'MISSING' end
union all select 'machines.imodeSn', case when exists (select 1 from information_schema.columns where table_name = 'machines' and column_name = 'imodeSn') then 'ok' else 'MISSING' end
union all select 'bucket qc-evidence', case when exists (select 1 from storage.buckets where id = 'qc-evidence') then 'ok' else 'MISSING' end
union all select 'qc_intake()', case when to_regprocedure('public.qc_intake(jsonb)') is not null then 'ok' else 'MISSING' end
union all select 'RLS on qc_records', case when (select relrowsecurity from pg_class where oid = 'public.qc_records'::regclass) then 'ok' else 'OFF' end;
