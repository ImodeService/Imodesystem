-- I-MODE System — QC & R&D module
-- 05-qc-ncr.sql — NCR (ข้อบกพร่อง) + Re-QC ตาม STEP 04 ของ flow ทีม
--
-- รันหลัง 04-qc-approval.sql · รันซ้ำได้ · อยู่ใน begin … commit
-- (ถ้ารัน 04 ซ้ำภายหลัง ให้รันไฟล์นี้ซ้ำด้วย เพราะไฟล์นี้เพิ่มเงื่อนไข "ไม่มี NCR ค้าง" ใน qc_gate)
--
-- ทำอะไร
-- 1. qc_ncr          1 ใบต่อ 1 ข้อบกพร่อง เลข NCR-YYYY-NNNN ออกจากเซิร์ฟเวอร์ ผูกใบ QC เครื่อง และข้อ Checklist (ถ้ามี)
--    สถานะ: Open (รอวิเคราะห์) → Plan Submitted (รอ Head QC อนุมัติแผน) → Plan Approved (กำลังแก้ไข)
--           → Waiting Re-QC (แก้แล้ว รอตรวจซ้ำ) → Re-QC Passed (รอ Head QC ปิด) → Closed
--           ไม่อนุมัติแผน → Open · Re-QC ไม่ผ่าน → Open (รอบ + 1) · Head QC ยกเลิกได้ → Cancelled
-- 2. qc_ncr_events   ไทม์ไลน์ของแต่ละ NCR (เพิ่มได้อย่างเดียว)
-- 3. qc_rechecks     ผล Re-QC ทุกรอบ (เพิ่มได้อย่างเดียว)
-- 4. qc_evidence     เพิ่มคอลัมน์ ncr_id, release_id และชนิดไฟล์ before / after / recheck / signature / delivery
--                    ไฟล์ของ NCR เก็บในโฟลเดอร์ 'ncr-<id>/' จึงอัปโหลดได้แม้ใบ QC ล็อกแล้ว (เฉพาะ NCR ที่ยังไม่ปิด)
-- 5. RPC (หน้าเว็บเปลี่ยนสถานะ NCR เองไม่ได้ ต้องผ่านฟังก์ชันเหล่านี้)
--    qc_ncr_open(qc_id, p)                     ช่าง/ทีม QC เปิด NCR → ใบ QC เป็น "ไม่ผ่าน"
--    qc_ncr_plan(id, root_cause, fix_route, plan)  QC/R&D วิเคราะห์สาเหตุ + เสนอแผน (ต้องมีรูป Before ≥ 1)
--    qc_ncr_plan_decide(id, approve, comment)  Head QC อนุมัติ/ไม่อนุมัติแผน (ผู้เสนอแผนอนุมัติเองไม่ได้)
--    qc_ncr_fixed(id, fixed_by_name, note)     บันทึกว่าแก้แล้ว (ภายใน หรือ Supplier) ต้องมีรูป After ≥ 1
--    qc_ncr_recheck(id, result, measured, remark)  Re-QC: Pass ต้องมีรูป After/Re-QC ≥ 1, Fail ต้องมีหมายเหตุ
--    qc_ncr_close(id, resolution)              Head QC ปิด NCR → ข้อ Checklist ที่ผูกไว้เป็น "ผ่าน"
--                                              ถ้าไม่มี NCR ค้างแล้ว ใบ QC กลับเป็น "กำลังตรวจ" ให้ส่งอนุมัติต่อ
--    qc_ncr_cancel(id, reason)                 Head QC ยกเลิก NCR (เปิดผิด / ซ้ำ)
-- 6. qc_gate เพิ่มเงื่อนไข: ต้องไม่มี NCR ที่ยังไม่ปิด
--
-- ยังไม่ทำในไฟล์นี้ (รอทีมตัดสิน): เคลม Supplier / Warranty Gate / รายการงานแก้ไขภายในที่อนุญาต (D3)
-- ตอนนี้ "แก้ไขภายใน" หรือ "Supplier" เป็นแค่ช่องเลือกในแผน และ Head QC เป็นผู้อนุมัติแผนทุกครั้ง

begin;

do $$
begin
  if to_regprocedure('public.qc_decide(text,text,text)') is null then
    raise exception 'ต้องรัน 04-qc-approval.sql ก่อน';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 0. running numbers for documents: NCR-2026-0001, RCV-2026-0001, REL-2026-0001 …
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_next_doc(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  yyyy text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY');
  n integer;
begin
  insert into public.qc_counters as c (name, n) values (p_prefix || ':' || yyyy, 1)
    on conflict (name) do update set n = c.n + 1
    returning c.n into n;
  return p_prefix || '-' || yyyy || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function public.qc_next_doc(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1. tables
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_ncr (
  id                 uuid primary key default gen_random_uuid(),
  ncr_no             text not null unique,
  qc_id              text not null references public.qc_records(id),
  machine_id         text,
  item_id            text default '',          -- checklist item id (physical, electrical …) or ''
  item_label         text default '',
  severity           text not null default 'Major' check (severity in ('Critical', 'Major', 'Minor')),
  description        text not null,
  status             text not null default 'Open' check (status in
                       ('Open', 'Plan Submitted', 'Plan Approved', 'Waiting Re-QC', 'Re-QC Passed', 'Closed', 'Cancelled')),
  round              integer not null default 1,
  detected_by        uuid default auth.uid(),
  detected_name      text default '',
  detected_at        timestamptz not null default now(),
  root_cause         text default '',
  fix_route          text default '' check (fix_route in ('', 'internal', 'supplier')),
  plan               text default '',
  plan_by            uuid,
  plan_name          text default '',
  plan_at            timestamptz,
  plan_decided_by    uuid,
  plan_decided_name  text default '',
  plan_decided_at    timestamptz,
  plan_comment       text default '',
  fixed_by_name      text default '',          -- who actually fixed (internal person or supplier), as text
  fix_note           text default '',
  fixed_at           timestamptz,
  resolution         text default '',
  closed_by          uuid,
  closed_name        text default '',
  closed_at          timestamptz,
  cancel_reason      text default '',
  updated_at         timestamptz not null default now()
);
create index if not exists qc_ncr_qc_idx on public.qc_ncr (qc_id);
create index if not exists qc_ncr_machine_idx on public.qc_ncr (machine_id);
create index if not exists qc_ncr_status_idx on public.qc_ncr (status);

create table if not exists public.qc_ncr_events (
  id          bigserial primary key,
  ncr_id      uuid not null references public.qc_ncr(id),
  from_status text default '',
  to_status   text not null,
  note        text default '',
  by_user     uuid,
  by_name     text default '',
  at          timestamptz not null default now()
);
create index if not exists qc_ncr_events_idx on public.qc_ncr_events (ncr_id, at);

create table if not exists public.qc_rechecks (
  id          bigserial primary key,
  ncr_id      uuid not null references public.qc_ncr(id),
  qc_id       text not null,
  round       integer not null,
  result      text not null check (result in ('Pass', 'Fail')),
  measured    text default '',
  remark      text default '',
  inspector   uuid,
  inspector_name text default '',
  at          timestamptz not null default now(),
  unique (ncr_id, round)
);

-- evidence: NCR / release files
alter table public.qc_evidence add column if not exists ncr_id uuid;
alter table public.qc_evidence add column if not exists release_id uuid;
create index if not exists qc_evidence_ncr_idx on public.qc_evidence (ncr_id) where ncr_id is not null;
create index if not exists qc_evidence_release_idx on public.qc_evidence (release_id) where release_id is not null;
alter table public.qc_evidence drop constraint if exists qc_evidence_kind_chk;
alter table public.qc_evidence add constraint qc_evidence_kind_chk check (kind in
  ('front', 'back', 'left', 'right', 'factoryPlate', 'imodePlate', 'accessories', 'extra', 'test',
   'before', 'after', 'recheck', 'signature', 'delivery'));

-- RLS: everyone on staff reads; nobody writes directly (RPC only)
alter table public.qc_ncr enable row level security;
alter table public.qc_ncr_events enable row level security;
alter table public.qc_rechecks enable row level security;
drop policy if exists qc_ncr_read on public.qc_ncr;
drop policy if exists qc_ncr_events_read on public.qc_ncr_events;
drop policy if exists qc_rechecks_read on public.qc_rechecks;
create policy qc_ncr_read on public.qc_ncr for select to authenticated using (public.is_staff());
create policy qc_ncr_events_read on public.qc_ncr_events for select to authenticated using (public.is_staff());
create policy qc_rechecks_read on public.qc_rechecks for select to authenticated using (public.is_staff());
revoke all on public.qc_ncr, public.qc_ncr_events, public.qc_rechecks from anon, authenticated;
grant select on public.qc_ncr, public.qc_ncr_events, public.qc_rechecks to authenticated;
revoke all on sequence public.qc_ncr_events_id_seq, public.qc_rechecks_id_seq from anon, authenticated;

drop trigger if exists qc_ncr_events_lock on public.qc_ncr_events;
create trigger qc_ncr_events_lock before update or delete on public.qc_ncr_events
  for each row execute function public.qc_audit_log_lock();
drop trigger if exists qc_rechecks_lock on public.qc_rechecks;
create trigger qc_rechecks_lock before update or delete on public.qc_rechecks
  for each row execute function public.qc_audit_log_lock();
drop trigger if exists qc_ncr_audit on public.qc_ncr;
create trigger qc_ncr_audit after insert or update or delete on public.qc_ncr
  for each row execute function public.qc_audit();
drop trigger if exists qc_rechecks_audit on public.qc_rechecks;
create trigger qc_rechecks_audit after insert on public.qc_rechecks
  for each row execute function public.qc_audit();

-- ---------------------------------------------------------------------------------------------
-- 2. evidence may be added to an open NCR / an active release even when the QC itself is locked
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_ncr_is_open(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status not in ('Closed', 'Cancelled') from public.qc_ncr where id = p_id), false)
$$;

-- 07 replaces this with the release check filled in
create or replace function public.qc_release_is_open(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.qc_releases') is null then return false; end if;
  return coalesce((select status in ('Planned', 'Released', 'In Stock') from public.qc_releases where id = p_id), false);
end $$;

-- the first folder of a storage path: '<qc_id>' | 'ncr-<uuid>' | 'rel-<uuid>'
create or replace function public.qc_folder_open(p_folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_folder ~ '^ncr-[0-9a-f-]{36}$' then return public.qc_ncr_is_open(substr(p_folder, 5)::uuid); end if;
  if p_folder ~ '^rel-[0-9a-f-]{36}$' then return public.qc_release_is_open(substr(p_folder, 5)::uuid); end if;
  return public.qc_is_open(p_folder);
end $$;

create or replace function public.qc_evidence_row_open(e public.qc_evidence)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when e.ncr_id is not null then public.qc_ncr_is_open(e.ncr_id)
    when e.release_id is not null then public.qc_release_is_open(e.release_id)
    else public.qc_is_open(e.qc_id) end
$$;

drop policy if exists qc_evidence_staff_insert on public.qc_evidence;
drop policy if exists qc_evidence_owner_delete on public.qc_evidence;
create policy qc_evidence_staff_insert on public.qc_evidence
  for insert to authenticated
  with check (public.qc_can_work() and created_by = auth.uid() and public.qc_evidence_row_open(qc_evidence));
create policy qc_evidence_owner_delete on public.qc_evidence
  for delete to authenticated
  using (public.qc_can_work() and created_by = auth.uid() and public.qc_evidence_row_open(qc_evidence));

drop policy if exists qc_evidence_files_insert on storage.objects;
drop policy if exists qc_evidence_files_delete on storage.objects;
create policy qc_evidence_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qc-evidence' and public.qc_can_work() and public.qc_folder_open((storage.foldername(name))[1]));
create policy qc_evidence_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'qc-evidence' and public.qc_can_work() and owner = auth.uid()
         and public.qc_folder_open((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_ncr_event(p_id uuid, p_from text, p_to text, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into public.qc_ncr_events (ncr_id, from_status, to_status, note, by_user, by_name)
  values (p_id, coalesce(p_from, ''), p_to, coalesce(p_note, ''), auth.uid(), coalesce(public.qc_my_name(), ''))
$$;
revoke all on function public.qc_ncr_event(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.qc_ncr_evidence_count(p_id uuid, p_kinds text[])
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.qc_evidence where ncr_id = p_id and kind = any(p_kinds)
$$;

-- p: { item_id, item_label, severity, description }
create or replace function public.qc_ncr_open(p_qc_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.qc_records; nid uuid; no text;
  sev text := coalesce(nullif(p->>'severity', ''), 'Major');
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์เปิด NCR' using errcode = '42501'; end if;
  if trim(coalesce(p->>'description', '')) = '' then raise exception 'ต้องระบุข้อบกพร่อง'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status not in ('Draft', 'In Progress', 'Fail', 'Returned') then
    raise exception 'ใบ QC % สถานะ "%" เปิด NCR ไม่ได้', r.qc_no, r.status;
  end if;
  if coalesce(p->>'item_id', '') <> '' and exists (select 1 from public.qc_ncr where qc_id = p_qc_id and item_id = p->>'item_id'
       and status not in ('Closed', 'Cancelled')) then
    raise exception 'ข้อนี้มี NCR ที่ยังไม่ปิดอยู่แล้ว';
  end if;
  no := public.qc_next_doc('NCR');
  insert into public.qc_ncr (ncr_no, qc_id, machine_id, item_id, item_label, severity, description, detected_by, detected_name)
  values (no, p_qc_id, r.machine_id, coalesce(p->>'item_id', ''), coalesce(p->>'item_label', ''), sev, trim(p->>'description'),
          auth.uid(), coalesce(public.qc_my_name(), ''))
  returning id into nid;
  perform public.qc_ncr_event(nid, '', 'Open', trim(p->>'description'));
  if r.status <> 'Fail' then update public.qc_records set status = 'Fail' where id = p_qc_id; end if;
  return jsonb_build_object('id', nid, 'ncr_no', no);
end $$;

create or replace function public.qc_ncr_plan(p_id uuid, p_root_cause text, p_fix_route text, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status <> 'Open' then raise exception 'NCR % สถานะ "%" เสนอแผนไม่ได้', n.ncr_no, n.status; end if;
  if trim(coalesce(p_root_cause, '')) = '' or trim(coalesce(p_plan, '')) = '' then raise exception 'ต้องระบุสาเหตุและแผนแก้ไข'; end if;
  if coalesce(p_fix_route, '') not in ('internal', 'supplier') then raise exception 'เลือกวิธีแก้: ภายใน หรือ Supplier'; end if;
  if public.qc_ncr_evidence_count(p_id, array['before']) = 0 then raise exception 'ต้องมีรูปก่อนแก้ (Before) อย่างน้อย 1 รูป'; end if;
  update public.qc_ncr set status = 'Plan Submitted', root_cause = trim(p_root_cause), fix_route = p_fix_route, plan = trim(p_plan),
         plan_by = auth.uid(), plan_name = coalesce(public.qc_my_name(), ''), plan_at = now(),
         plan_decided_by = null, plan_decided_name = '', plan_decided_at = null, plan_comment = '', updated_at = now()
   where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, 'Plan Submitted', trim(p_plan));
end $$;

create or replace function public.qc_ncr_plan_decide(p_id uuid, p_approve boolean, p_comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr; c text := trim(coalesce(p_comment, '')); t text;
begin
  if not public.qc_is_head() then raise exception 'อนุมัติแผนแก้ไขได้เฉพาะ Head QC' using errcode = '42501'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status <> 'Plan Submitted' then raise exception 'NCR % ไม่ได้รออนุมัติแผน (สถานะ "%")', n.ncr_no, n.status; end if;
  if auth.uid() = n.plan_by then raise exception 'ผู้เสนอแผนอนุมัติแผนของตัวเองไม่ได้' using errcode = '42501'; end if;
  if not p_approve and c = '' then raise exception 'ต้องใส่เหตุผลที่ไม่อนุมัติ'; end if;
  t := case when p_approve then 'Plan Approved' else 'Open' end;
  update public.qc_ncr set status = t, plan_decided_by = auth.uid(), plan_decided_name = coalesce(public.qc_my_name(), ''),
         plan_decided_at = now(), plan_comment = c, updated_at = now()
   where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, t, case when p_approve then 'อนุมัติแผน' else 'ไม่อนุมัติแผน' end || case when c <> '' then ': ' || c else '' end);
end $$;

create or replace function public.qc_ncr_fixed(p_id uuid, p_fixed_by_name text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status <> 'Plan Approved' then raise exception 'NCR % ต้องได้รับอนุมัติแผนก่อนบันทึกการแก้ไข (สถานะ "%")', n.ncr_no, n.status; end if;
  if trim(coalesce(p_fixed_by_name, '')) = '' or trim(coalesce(p_note, '')) = '' then raise exception 'ต้องระบุผู้แก้และสิ่งที่ทำ'; end if;
  if public.qc_ncr_evidence_count(p_id, array['after']) = 0 then raise exception 'ต้องมีรูปหลังแก้ (After) อย่างน้อย 1 รูป'; end if;
  update public.qc_ncr set status = 'Waiting Re-QC', fixed_by_name = trim(p_fixed_by_name), fix_note = trim(p_note), fixed_at = now(), updated_at = now()
   where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, 'Waiting Re-QC', trim(p_fixed_by_name) || ': ' || trim(p_note));
end $$;

create or replace function public.qc_ncr_recheck(p_id uuid, p_result text, p_measured text default '', p_remark text default '')
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr; t text;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status <> 'Waiting Re-QC' then raise exception 'NCR % ยังไม่พร้อมตรวจซ้ำ (สถานะ "%")', n.ncr_no, n.status; end if;
  if p_result not in ('Pass', 'Fail') then raise exception 'ผล Re-QC ต้องเป็น Pass หรือ Fail'; end if;
  if p_result = 'Fail' and trim(coalesce(p_remark, '')) = '' then raise exception 'Re-QC ไม่ผ่าน ต้องใส่สิ่งที่พบ'; end if;
  if p_result = 'Pass' and public.qc_ncr_evidence_count(p_id, array['after', 'recheck']) = 0 then
    raise exception 'Re-QC ผ่าน ต้องมีรูปหลักฐานอย่างน้อย 1 รูป';
  end if;
  insert into public.qc_rechecks (ncr_id, qc_id, round, result, measured, remark, inspector, inspector_name)
  values (p_id, n.qc_id, n.round, p_result, coalesce(p_measured, ''), coalesce(p_remark, ''), auth.uid(), coalesce(public.qc_my_name(), ''));
  t := case when p_result = 'Pass' then 'Re-QC Passed' else 'Open' end;
  update public.qc_ncr set status = t, round = case when p_result = 'Pass' then n.round else n.round + 1 end, updated_at = now()
   where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, t, 'Re-QC รอบ ' || n.round || ': ' || case when p_result = 'Pass' then 'ผ่าน' else 'ไม่ผ่าน' end
                              || case when coalesce(p_remark, '') <> '' then ' · ' || p_remark else '' end);
end $$;

create or replace function public.qc_ncr_close(p_id uuid, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr; r public.qc_records; nm text := coalesce(public.qc_my_name(), '');
begin
  if not public.qc_is_head() then raise exception 'ปิด NCR ได้เฉพาะ Head QC' using errcode = '42501'; end if;
  if trim(coalesce(p_resolution, '')) = '' then raise exception 'ต้องสรุปผลการแก้ไข (Resolution)'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status <> 'Re-QC Passed' then raise exception 'ปิดได้เมื่อ Re-QC ผ่านแล้วเท่านั้น (สถานะ "%")', n.status; end if;
  update public.qc_ncr set status = 'Closed', resolution = trim(p_resolution), closed_by = auth.uid(), closed_name = nm, closed_at = now(), updated_at = now()
   where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, 'Closed', trim(p_resolution));

  select * into r from public.qc_records where id = n.qc_id for update;
  -- the checklist item this NCR came from now passes (Re-QC passed + Head QC closed it)
  if coalesce(n.item_id, '') <> '' and r.status in ('Draft', 'In Progress', 'Fail', 'Returned') then
    update public.qc_records
       set checklist = (select jsonb_agg(case when x->>'id' = n.item_id
                          then x || jsonb_build_object('result', 'Pass', 'checkedBy', nm, 'checkedAt', now(),
                                                       'remark', trim(both ' ' from coalesce(x->>'remark', '') || ' ผ่านหลังปิด ' || n.ncr_no))
                          else x end order by o)
                        from jsonb_array_elements(r.checklist) with ordinality t(x, o))
     where id = n.qc_id;
  end if;
  if r.status = 'Fail' and not exists (select 1 from public.qc_ncr where qc_id = n.qc_id and status not in ('Closed', 'Cancelled')) then
    update public.qc_records set status = 'In Progress' where id = n.qc_id;
  end if;
end $$;

create or replace function public.qc_ncr_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.qc_ncr; r public.qc_records;
begin
  if not public.qc_is_head() then raise exception 'ยกเลิก NCR ได้เฉพาะ Head QC' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผล'; end if;
  select * into n from public.qc_ncr where id = p_id for update;
  if not found then raise exception 'ไม่พบ NCR'; end if;
  if n.status in ('Closed', 'Cancelled') then raise exception 'NCR % สถานะ "%" ยกเลิกไม่ได้', n.ncr_no, n.status; end if;
  update public.qc_ncr set status = 'Cancelled', cancel_reason = trim(p_reason), updated_at = now() where id = p_id;
  perform public.qc_ncr_event(p_id, n.status, 'Cancelled', trim(p_reason));
  select * into r from public.qc_records where id = n.qc_id;
  if r.status = 'Fail' and not exists (select 1 from public.qc_ncr where qc_id = n.qc_id and status not in ('Closed', 'Cancelled')) then
    update public.qc_records set status = 'In Progress' where id = n.qc_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. qc_gate: same as 04 + "no open NCR"
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_gate(p_qc_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.qc_records;
  probs text[] := '{}';
  n_total int; n_open int; n_fail int; na_missing text; n_ncr int;
  need text[] := array['front', 'back', 'left', 'right', 'factoryPlate', 'imodePlate', 'accessories'];
  lack text[];
  m public.machines;
begin
  select * into r from public.qc_records where id = p_qc_id;
  if not found then return jsonb_build_object('ok', false, 'problems', jsonb_build_array('ไม่พบใบ QC')); end if;

  select count(*),
         count(*) filter (where coalesce(x->>'result', 'Pending') in ('', 'Pending')),
         count(*) filter (where x->>'result' = 'Fail'),
         string_agg(case when x->>'result' = 'N/A' and trim(coalesce(x->>'remark', '')) = '' then o::text end, ', ')
    into n_total, n_open, n_fail, na_missing
    from jsonb_array_elements(coalesce(r.checklist, '[]'::jsonb)) with ordinality t(x, o);

  if n_total = 0 then probs := probs || 'ยังไม่มีรายการ Checklist'::text; end if;
  if n_open > 0 then probs := probs || ('ยังไม่ได้ตรวจ ' || n_open || ' ข้อ'); end if;
  if n_fail > 0 then probs := probs || ('มีข้อที่ไม่ผ่าน ' || n_fail || ' ข้อ'); end if;
  if na_missing is not null then probs := probs || ('ข้อที่เลือก N/A ต้องใส่เหตุผล (ข้อ ' || na_missing || ')'); end if;
  if trim(coalesce(r.inspector, '')) = '' then probs := probs || 'ยังไม่ระบุผู้ตรวจ'::text; end if;
  if r.machine_id is null then probs := probs || 'ยังไม่ระบุเครื่อง'::text; end if;

  select count(*) into n_ncr from public.qc_ncr where qc_id = r.id and status not in ('Closed', 'Cancelled');
  if n_ncr > 0 then probs := probs || ('มี NCR ที่ยังไม่ปิด ' || n_ncr || ' ใบ'); end if;

  if r.type in ('Incoming Inspection', 'Pre-Delivery QC') then
    select array(select k from unnest(need) k
                  where not exists (select 1 from public.qc_evidence e where e.qc_id = r.id and e.kind = k))
      into lack;
    if array_length(lack, 1) > 0 then
      probs := probs || ('รูปบังคับยังไม่ครบ: ' || array_to_string(lack, ', '));
    end if;
  end if;

  select * into m from public.machines where id = r.machine_id;
  if found and m."lifecycle" is not null and coalesce(m."imodeSn", '') = '' then
    probs := probs || 'เครื่องยังไม่มี IMODE S/N'::text;
  end if;

  return jsonb_build_object('ok', coalesce(array_length(probs, 1), 0) = 0, 'problems', to_jsonb(probs));
end $$;

revoke all on function public.qc_ncr_is_open(uuid)                     from public, anon;
revoke all on function public.qc_release_is_open(uuid)                 from public, anon;
revoke all on function public.qc_folder_open(text)                     from public, anon;
revoke all on function public.qc_evidence_row_open(public.qc_evidence) from public, anon;
revoke all on function public.qc_ncr_evidence_count(uuid, text[])      from public, anon;
revoke all on function public.qc_ncr_open(text, jsonb)                 from public, anon;
revoke all on function public.qc_ncr_plan(uuid, text, text, text)      from public, anon;
revoke all on function public.qc_ncr_plan_decide(uuid, boolean, text)  from public, anon;
revoke all on function public.qc_ncr_fixed(uuid, text, text)           from public, anon;
revoke all on function public.qc_ncr_recheck(uuid, text, text, text)   from public, anon;
revoke all on function public.qc_ncr_close(uuid, text)                 from public, anon;
revoke all on function public.qc_ncr_cancel(uuid, text)                from public, anon;
grant execute on function public.qc_ncr_is_open(uuid)                     to authenticated;
grant execute on function public.qc_release_is_open(uuid)                 to authenticated;
grant execute on function public.qc_folder_open(text)                     to authenticated;
grant execute on function public.qc_evidence_row_open(public.qc_evidence) to authenticated;
grant execute on function public.qc_ncr_evidence_count(uuid, text[])      to authenticated;
grant execute on function public.qc_ncr_open(text, jsonb)                 to authenticated;
grant execute on function public.qc_ncr_plan(uuid, text, text, text)      to authenticated;
grant execute on function public.qc_ncr_plan_decide(uuid, boolean, text)  to authenticated;
grant execute on function public.qc_ncr_fixed(uuid, text, text)           to authenticated;
grant execute on function public.qc_ncr_recheck(uuid, text, text, text)   to authenticated;
grant execute on function public.qc_ncr_close(uuid, text)                 to authenticated;
grant execute on function public.qc_ncr_cancel(uuid, text)                to authenticated;

commit;

-- Check: every row should say ok
select 'qc_ncr' as item, case when to_regclass('public.qc_ncr') is not null then 'ok' else 'MISSING' end as result
union all select 'qc_rechecks', case when to_regclass('public.qc_rechecks') is not null then 'ok' else 'MISSING' end
union all select 'qc_ncr_open()', case when to_regprocedure('public.qc_ncr_open(text,jsonb)') is not null then 'ok' else 'MISSING' end
union all select 'qc_evidence.ncr_id', case when exists (select 1 from information_schema.columns where table_name = 'qc_evidence' and column_name = 'ncr_id') then 'ok' else 'MISSING' end
union all select 'gate checks NCR', case when position('qc_ncr' in pg_get_functiondef('public.qc_gate(text)'::regprocedure)) > 0 then 'ok' else 'MISSING' end;
