-- I-MODE System — QC & R&D module
-- 04-qc-approval.sql — Head QC อนุมัติผล QC (V3.1 Phase 1: STEP 05 ของ flow ทีม)
--
-- รันหลัง 03-qc-roles-audit.sql · รันซ้ำได้ · อยู่ใน begin … commit
--
-- ทำอะไร
-- 1. สถานะใบ QC เพิ่ม: 'Pending Approval' (รอ Head QC), 'Returned' (ส่งกลับแก้), 'Cancelled' (ยกเลิก แทนการลบ)
--    รหัสเดิม Draft / In Progress / Pass / Fail คงเดิม ('Pass' = อนุมัติแล้ว; Service js/137 ใช้รหัสนี้)
--    'Conditional' ข้อมูลเดิมยังอยู่ แต่ตั้งค่านี้ใหม่ไม่ได้แล้ว
-- 2. หน้าเว็บ (หรือใครก็ตามที่ใช้ REST ตรง) เปลี่ยนสถานะเป็น Pass / Pending Approval / Returned / Cancelled เองไม่ได้
--    ต้องผ่านฟังก์ชันด้านล่างเท่านั้น และใบที่ส่งอนุมัติหรืออนุมัติแล้วแก้ไม่ได้ (ล็อก)
-- 3. qc_gate(qc_id)                 ตรวจด่านก่อนอนุมัติ ฝั่งฐานข้อมูล (แทน passProblems ในหน้าเว็บ)
--    qc_submit(qc_id)               ช่าง/ทีม QC ส่งให้ Head QC (ด่านต้องผ่าน)
--    qc_decide(qc_id, decision, comment)
--                                   Head QC: 'approve' → Pass / 'return' → Returned / 'reject' → Fail
--                                   ผู้อนุมัติต้องไม่ใช่ผู้ส่งหรือผู้สร้างใบนั้น · อนุมัติซ้ำพร้อมกันไม่ได้
--    qc_reopen(qc_id, reason)       Head QC เปิดใบที่อนุมัติแล้วกลับมาแก้ (revision + 1, มีเหตุผล)
--    qc_cancel(qc_id, reason)       Head QC / Admin QC ยกเลิกใบที่ยังไม่อนุมัติ
-- 4. qc_approvals                   ประวัติการตัดสินทุกครั้ง พร้อมผลด่านตอนนั้น (แก้/ลบไม่ได้)
-- 5. เครื่องเป็น 'ready' เฉพาะเมื่อ Head QC อนุมัติแล้ว (เดิม: ทันทีที่บันทึก Pass)
--    qc_handover() ชื่อและพารามิเตอร์เดิม แต่ต้องเป็นใบที่ Head QC อนุมัติแล้ว
-- 6. ใบที่เป็น Pass อยู่ก่อนรันไฟล์นี้ ถือว่าอนุมัติแล้วแบบ legacy (ไม่ต้องอนุมัติใหม่)

begin;

do $$
begin
  if to_regprocedure('public.qc_has_role(text[])') is null or to_regclass('public.qc_audit_log') is null then
    raise exception 'ต้องรัน 03-qc-roles-audit.sql ก่อน';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. columns + statuses
-- ---------------------------------------------------------------------------------------------
alter table public.qc_records add column if not exists submitted_at  timestamptz;
alter table public.qc_records add column if not exists submitted_by  uuid;
alter table public.qc_records add column if not exists approved_at   timestamptz;
alter table public.qc_records add column if not exists approved_by   uuid;
alter table public.qc_records add column if not exists approver_name text default '';
alter table public.qc_records add column if not exists revision      integer not null default 0;
alter table public.qc_records add column if not exists status_note   text default '';   -- last return / reject / cancel reason

alter table public.qc_records drop constraint if exists qc_records_status_chk;
alter table public.qc_records add constraint qc_records_status_chk check (status in
  ('Draft', 'In Progress', 'Pass', 'Conditional', 'Fail', 'Pending Approval', 'Returned', 'Cancelled'));

-- ---------------------------------------------------------------------------------------------
-- 2. approvals history
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_approvals (
  id            bigserial primary key,
  qc_id         text not null references public.qc_records(id),
  revision      integer not null,
  decision      text not null check (decision in ('submit', 'approve', 'return', 'reject', 'reopen', 'cancel', 'legacy')),
  by_user       uuid,
  by_name       text default '',
  comment       text default '',
  gate_snapshot jsonb,
  at            timestamptz not null default now()
);
create index if not exists qc_approvals_qc_idx on public.qc_approvals (qc_id, at);
-- one approval per revision, even if two Head QC press at the same moment
create unique index if not exists qc_approvals_one_approve on public.qc_approvals (qc_id, revision)
  where decision in ('approve', 'legacy');
alter table public.qc_approvals enable row level security;
drop policy if exists qc_approvals_read on public.qc_approvals;
create policy qc_approvals_read on public.qc_approvals for select to authenticated using (public.is_staff());
revoke all on public.qc_approvals from anon, authenticated;
grant select on public.qc_approvals to authenticated;
revoke all on sequence public.qc_approvals_id_seq from anon, authenticated;

drop trigger if exists qc_approvals_lock on public.qc_approvals;
create trigger qc_approvals_lock before update or delete on public.qc_approvals
  for each row execute function public.qc_audit_log_lock();

-- Pass rows that exist before this file: approved as legacy, once
insert into public.qc_approvals (qc_id, revision, decision, by_name, comment)
select r.id, r.revision, 'legacy', '', 'ผ่านก่อนมีขั้นอนุมัติ (ก่อน 04-qc-approval.sql)'
  from public.qc_records r
 where r.status = 'Pass'
   and not exists (select 1 from public.qc_approvals a where a.qc_id = r.id and a.decision in ('approve', 'legacy'));
update public.qc_records r set approved_at = coalesce(r.approved_at, r.updated_at)
 where r.status = 'Pass' and r.approved_at is null;

-- ---------------------------------------------------------------------------------------------
-- 3. guard: what a client may do directly
-- ---------------------------------------------------------------------------------------------
-- NOT security definer on purpose: current_user is 'authenticated' for a REST call and the
-- function owner when the change comes from one of the RPCs below.
create or replace function public.qc_records_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  client boolean := current_user in ('authenticated', 'anon');
  managed text[] := array['Pass', 'Pending Approval', 'Returned', 'Cancelled', 'Conditional'];
begin
  if not client then return new; end if;

  if tg_op = 'INSERT' then
    -- old browser records brought in by "นำเข้า" keep their result, but never count as approved
    if new.status = any(managed) and coalesce(new.source, '') <> 'service-local' then
      raise exception 'สถานะ "%" ตั้งเองไม่ได้ ต้องส่งให้ Head QC อนุมัติ', new.status using errcode = '42501';
    end if;
    new.submitted_at := null; new.submitted_by := null; new.approved_at := null; new.approved_by := null;
    new.approver_name := ''; new.revision := 0;
    return new;
  end if;

  -- UPDATE
  if old.status in ('Pass', 'Pending Approval', 'Cancelled', 'Conditional') then
    raise exception 'ใบ QC % อยู่ในสถานะ "%" แก้ไขไม่ได้', old.qc_no, old.status using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status = any(managed) then
    raise exception 'สถานะ "%" ตั้งเองไม่ได้ ต้องส่งให้ Head QC อนุมัติ', new.status using errcode = '42501';
  end if;
  if new.status = 'Draft' and old.status = 'Returned' then new.status := 'Returned'; end if;   -- keep the reason visible
  -- approval columns belong to the RPCs
  new.submitted_at := old.submitted_at; new.submitted_by := old.submitted_by;
  new.approved_at := old.approved_at;   new.approved_by := old.approved_by;
  new.approver_name := old.approver_name; new.revision := old.revision; new.status_note := old.status_note;
  new.qc_no := old.qc_no;
  return new;
end $$;
drop trigger if exists qc_records_guard on public.qc_records;
create trigger qc_records_guard before insert or update on public.qc_records
  for each row execute function public.qc_records_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. gate (same rules as passProblems() in qc.js, now on the server)
-- ---------------------------------------------------------------------------------------------
-- returns { ok: bool, problems: [text] }
create or replace function public.qc_gate(p_qc_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.qc_records;
  probs text[] := '{}';
  n_total int; n_open int; n_fail int; na_missing text;
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

-- ---------------------------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_submit(p_qc_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.qc_records; g jsonb;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์ส่งอนุมัติ' using errcode = '42501'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status not in ('Draft', 'In Progress', 'Returned') then
    raise exception 'ใบ QC % อยู่ในสถานะ "%" ส่งอนุมัติไม่ได้', r.qc_no, r.status;
  end if;
  g := public.qc_gate(p_qc_id);
  if not (g->>'ok')::boolean then
    raise exception 'ยังส่งอนุมัติไม่ได้: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(g->'problems') x);
  end if;
  update public.qc_records
     set status = 'Pending Approval', submitted_at = now(), submitted_by = auth.uid(), status_note = ''
   where id = p_qc_id;
  insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, gate_snapshot)
  values (p_qc_id, r.revision, 'submit', auth.uid(), coalesce(public.qc_my_name(), ''), g);
  return g;
end $$;

create or replace function public.qc_decide(p_qc_id text, p_decision text, p_comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.qc_records; g jsonb;
  c text := trim(coalesce(p_comment, ''));
begin
  if not public.qc_is_head() then raise exception 'อนุมัติ QC ได้เฉพาะ Head QC' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'return', 'reject') then raise exception 'การตัดสินต้องเป็น approve / return / reject'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status <> 'Pending Approval' then
    raise exception 'ใบ QC % ไม่ได้รออนุมัติ (สถานะ "%")', r.qc_no, r.status;
  end if;
  if auth.uid() = r.submitted_by or auth.uid() = r.created_by then
    raise exception 'ผู้ตรวจหรือผู้ส่งใบนี้อนุมัติเองไม่ได้ ต้องเป็น Head QC คนอื่น' using errcode = '42501';
  end if;
  if p_decision <> 'approve' and c = '' then raise exception 'ต้องใส่เหตุผล'; end if;

  g := public.qc_gate(p_qc_id);
  if p_decision = 'approve' then
    if not (g->>'ok')::boolean then
      raise exception 'อนุมัติไม่ได้ ด่านยังไม่ผ่าน: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(g->'problems') x);
    end if;
    insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, comment, gate_snapshot)
    values (p_qc_id, r.revision, 'approve', auth.uid(), coalesce(public.qc_my_name(), ''), c, g);
    update public.qc_records
       set status = 'Pass', approved_at = now(), approved_by = auth.uid(),
           approver_name = coalesce(public.qc_my_name(), ''), reviewer = coalesce(public.qc_my_name(), reviewer), status_note = c
     where id = p_qc_id;
  else
    insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, comment, gate_snapshot)
    values (p_qc_id, r.revision, p_decision, auth.uid(), coalesce(public.qc_my_name(), ''), c, g);
    update public.qc_records
       set status = case when p_decision = 'return' then 'Returned' else 'Fail' end, status_note = c
     where id = p_qc_id;
  end if;
end $$;

create or replace function public.qc_reopen(p_qc_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_records;
begin
  if not public.qc_is_head() then raise exception 'เปิดแก้ใบที่อนุมัติแล้วได้เฉพาะ Head QC' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผล'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status <> 'Pass' then raise exception 'เปิดแก้ได้เฉพาะใบที่อนุมัติแล้ว'; end if;
  if exists (select 1 from public.machines where id = r.machine_id and "lifecycle" = 'delivered') then
    raise exception 'เครื่องส่งมอบลูกค้าแล้ว ให้เปิดใบ QC ใหม่แทน';
  end if;
  insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, comment)
  values (p_qc_id, r.revision, 'reopen', auth.uid(), coalesce(public.qc_my_name(), ''), trim(p_reason));
  update public.qc_records
     set status = 'In Progress', revision = r.revision + 1, approved_at = null, approved_by = null,
         approver_name = '', submitted_at = null, submitted_by = null, status_note = trim(p_reason)
   where id = p_qc_id;
end $$;

create or replace function public.qc_cancel(p_qc_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_records;
begin
  if not public.qc_has_role('Head QC', 'Admin QC') then raise exception 'ยกเลิกใบ QC ได้เฉพาะ Head QC / Admin QC' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผล'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status in ('Pass', 'Cancelled') then raise exception 'ใบ QC สถานะ "%" ยกเลิกไม่ได้', r.status; end if;
  insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, comment)
  values (p_qc_id, r.revision, 'cancel', auth.uid(), coalesce(public.qc_my_name(), ''), trim(p_reason));
  update public.qc_records set status = 'Cancelled', status_note = trim(p_reason) where id = p_qc_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. machine stage + hand-over follow the approval
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_records_machine_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.machine_id is null or new.status = 'Cancelled' then return new; end if;
  update public.machines
     set "lifecycle" = case when new.status = 'Pass' and new.approved_at is not null then 'ready' else 'qc' end
   where id = new.machine_id and "lifecycle" in ('qc', 'ready');
  return new;
end $$;

create or replace function public.qc_handover(p_machine_id text, p_customer_id text, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  last public.qc_records;
begin
  if not public.qc_can_work() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_customer_id, '') = '' then raise exception 'ต้องเลือกลูกค้า'; end if;
  select * into last from public.qc_records
   where machine_id = p_machine_id and status <> 'Cancelled'
   order by coalesce(qc_date, created_at::date) desc, created_at desc limit 1;
  if last.status is distinct from 'Pass' or last.approved_at is null then
    raise exception 'ส่งมอบได้เมื่อ QC ล่าสุดของเครื่องนี้ได้รับอนุมัติจาก Head QC แล้วเท่านั้น';
  end if;
  update public.machines
     set "customerId" = p_customer_id, "lifecycle" = 'delivered', "updatedAt" = now(),
         note = trim(both from coalesce(note, '') || ' ส่งมอบจาก QC ' || to_char(coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYY-MM-DD'))
   where id = p_machine_id and "lifecycle" in ('qc', 'ready');
  if not found then raise exception 'ไม่พบเครื่องนี้ในขั้นตอน QC'; end if;
end $$;

-- log the RPC decisions too (the row change itself is logged by the 03 trigger)
create or replace function public.qc_approvals_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.qc_log('qc_records', new.qc_id, 'qc_' || new.decision, null, to_jsonb(new), new.comment);
  return new;
end $$;
drop trigger if exists qc_approvals_audit on public.qc_approvals;
create trigger qc_approvals_audit after insert on public.qc_approvals
  for each row execute function public.qc_approvals_audit();

revoke all on function public.qc_gate(text)               from public, anon;
revoke all on function public.qc_submit(text)             from public, anon;
revoke all on function public.qc_decide(text, text, text) from public, anon;
revoke all on function public.qc_reopen(text, text)       from public, anon;
revoke all on function public.qc_cancel(text, text)       from public, anon;
revoke all on function public.qc_handover(text, text, date) from public, anon;
grant execute on function public.qc_gate(text)               to authenticated;
grant execute on function public.qc_submit(text)             to authenticated;
grant execute on function public.qc_decide(text, text, text) to authenticated;
grant execute on function public.qc_reopen(text, text)       to authenticated;
grant execute on function public.qc_cancel(text, text)       to authenticated;
grant execute on function public.qc_handover(text, text, date) to authenticated;

commit;

-- Check: every row should say ok
select 'qc_approvals' as item, case when to_regclass('public.qc_approvals') is not null then 'ok' else 'MISSING' end as result
union all select 'qc_submit()', case when to_regprocedure('public.qc_submit(text)') is not null then 'ok' else 'MISSING' end
union all select 'qc_decide()', case when to_regprocedure('public.qc_decide(text,text,text)') is not null then 'ok' else 'MISSING' end
union all select 'guard trigger', case when exists (select 1 from pg_trigger where tgname = 'qc_records_guard') then 'ok' else 'MISSING' end
union all select 'Pass without approval', case when exists (select 1 from public.qc_records where status = 'Pass' and approved_at is null) then 'CHECK' else 'ok' end;
