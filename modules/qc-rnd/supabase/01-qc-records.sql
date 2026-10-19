-- I-MODE System — QC & R&D module
-- 01-qc-records.sql — the table behind modules/qc-rnd (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- Until 2026-10-16 QC records lived only in the browser that wrote them (Service js/03
-- saveLocal(), localStorage key imode_v66_qc_records). Nobody else could see them and
-- clearing the browser lost them. QC moved out of Service into its own module and its
-- records now live here, one row per QC document.
--
-- The row mirrors the object Service used (id, qcNo, type, ...), in snake_case. `checklist`
-- and `media` stay jsonb arrays in the same shape, so the two-page Thai QC document prints
-- exactly as before:
--   checklist: [{ "id", "labelTh", "labelEn", "result": "Pending|Pass|Fail|N/A", "remark" }]
--   media:     [{ "name", "type", "size", "data": "data:image/jpeg;base64,..." }]
-- customer_id / machine_id / case_id point at customers / machines / service_cases by id
-- (text, no foreign key, the same as every other Service table).
--
-- WHO MAY DO WHAT (RLS)
-- ---------------------
--   read, add, edit : signed-in staff (public.is_staff(), from Service 01-schema.sql)
--   delete          : admins only (public.is_admin())
--   anon            : nothing
-- Narrowing writes to the QC & R&D line of the org chart (Admin / Supervisor / Technician
-- QC,R&D) waits for the Accounts module, which will own departments and levels.
--
-- SAFE TO RE-RUN: create ... if not exists, and policies are dropped before being recreated.
-- Touches no existing table.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_staff() / public.is_admin() missing — run Service supabase/01-schema.sql first';
  end if;
end $$;

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

commit;

-- Verify: one row, rls_on = true, 4 policies
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = 'qc_records') as policies
  from pg_class c where c.relname = 'qc_records';
