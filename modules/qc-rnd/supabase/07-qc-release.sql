-- I-MODE System — QC & R&D module
-- 07-qc-release.sql — STEP 06 ปล่อยเครื่อง (Release) ตาม flow ทีม
--
-- รันหลัง 06-qc-po-stock.sql · รันซ้ำได้ · อยู่ใน begin … commit
--
-- ทำอะไร
-- 1. qc_releases   1 รายการต่อการส่งมอบ 1 ครั้ง เลข REL-YYYY-NNNN
--    สถานะ: Planned (จัดซื้ออนุมัติแผนส่งแล้ว, บันทึกแทน) → Released (Head QC ยืนยัน)
--           → In Stock (เฉพาะเส้นทางผ่าน Stock: Stock รับเครื่อง, บันทึกแทน) → Delivered (ผู้รับลงชื่อ + รูป)
--           Head QC ยกเลิกได้ก่อนส่งมอบ → Cancelled
-- 2. RPC
--    qc_release_plan(p)                       วางแผนส่ง: เครื่องต้อง "ผ่าน QC" (Head QC อนุมัติแล้ว) ระบุลูกค้า วันที่ เส้นทาง
--                                             และชื่อคนจัดซื้อที่อนุมัติแผน (บันทึกแทน)
--    qc_release_confirm(id)                   Head QC ยืนยัน Release (ต้องไม่มี NCR ค้างของเครื่อง)
--    qc_release_stock_in(id, name, location)  เส้นทางผ่าน Stock: บันทึกว่า Stock รับเครื่องแล้ว
--    qc_release_deliver(id, receiver, date, transporter, note)
--                                             ส่งมอบ: ต้องมีรูปลายเซ็นผู้รับ ≥ 1 แล้วเครื่องผูกลูกค้า lifecycle = delivered (Service ดูแลต่อ)
--    qc_release_cancel(id, reason)            Head QC ยกเลิก
-- 3. qc_handover() ชื่อเดิม: ตอนนี้ต้องมี Release ที่ยืนยันแล้ว (Released หรือ In Stock) และจะปิด Release นั้นเป็น Delivered
--    (ไม่มีรูปลายเซ็นก็ได้ เพื่อให้ปุ่มเดิมยังทำงาน) · ปิดเงื่อนไขนี้ได้ด้วย qc_settings.release_required = false
-- 4. ใบ QC ที่มี Release ค้างอยู่ เปิดแก้ (qc_reopen) ไม่ได้ ต้องยกเลิก Release ก่อน
-- 5. machines.lifecycle ยังมี 3 ค่าเดิม (qc / ready / delivered) จึงไม่ต้องแก้ Service js/148

begin;

do $$
begin
  if to_regclass('public.qc_po') is null then raise exception 'ต้องรัน 06-qc-po-stock.sql ก่อน'; end if;
end $$;

insert into public.qc_settings (key, value, note) values
  ('release_required', 'true'::jsonb, 'true = ส่งมอบได้เฉพาะเครื่องที่ผ่าน Release (STEP 06); false = ส่งมอบตรงได้แบบเดิม')
  on conflict (key) do nothing;

create table if not exists public.qc_releases (
  id               uuid primary key default gen_random_uuid(),
  release_no       text not null unique,
  machine_id       text not null,
  qc_id            text not null references public.qc_records(id),
  customer_id      text not null,
  status           text not null default 'Planned' check (status in ('Planned', 'Released', 'In Stock', 'Delivered', 'Cancelled')),
  route            text not null check (route in ('stock', 'direct')),
  plan_date        date,
  destination      text default '',
  plan_note        text default '',
  purchaser_name   text not null,                 -- คนจัดซื้อที่อนุมัติ Delivery Plan
  plan_by          uuid default auth.uid(),
  plan_name        text default '',
  plan_at          timestamptz not null default now(),
  released_by      uuid,
  released_name    text default '',
  released_at      timestamptz,
  stock_name       text default '',
  stock_location   text default '',
  stock_at         timestamptz,
  transporter      text default '',
  receiver_name    text default '',
  delivered_on     date,
  deliver_note     text default '',
  delivered_by     uuid,
  delivered_name   text default '',
  delivered_at     timestamptz,
  cancel_reason    text default '',
  updated_at       timestamptz not null default now()
);
create index if not exists qc_releases_machine_idx on public.qc_releases (machine_id);
create unique index if not exists qc_releases_one_active on public.qc_releases (machine_id) where status in ('Planned', 'Released', 'In Stock');

alter table public.qc_releases enable row level security;
drop policy if exists qc_releases_read on public.qc_releases;
create policy qc_releases_read on public.qc_releases for select to authenticated using (public.is_staff());
revoke all on public.qc_releases from anon, authenticated;
grant select on public.qc_releases to authenticated;
drop trigger if exists qc_releases_audit on public.qc_releases;
create trigger qc_releases_audit after insert or update or delete on public.qc_releases for each row execute function public.qc_audit();

-- evidence of a release can be added while it is not finished (05 calls this)
create or replace function public.qc_release_is_open(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select status in ('Planned', 'Released', 'In Stock') from public.qc_releases where id = p_id), false);
end $$;

-- latest QC of a machine that is approved, or null
create or replace function public.qc_machine_passed_qc(p_machine_id text)
returns public.qc_records language sql stable security definer set search_path = public as $$
  select r.* from public.qc_records r
   where r.machine_id = p_machine_id and r.status <> 'Cancelled'
   order by coalesce(r.qc_date, r.created_at::date) desc, r.created_at desc limit 1
$$;
revoke all on function public.qc_machine_passed_qc(text) from public, anon, authenticated;

-- p: { machineId, customerId, route ('stock'|'direct'), planDate, destination, note, purchaserName }
create or replace function public.qc_release_plan(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.machines; q public.qc_records; rid uuid; no text;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์วางแผนส่งมอบ' using errcode = '42501'; end if;
  select * into m from public.machines where id = p->>'machineId' for update;
  if not found then raise exception 'ไม่พบเครื่อง'; end if;
  if m."lifecycle" is distinct from 'ready' then raise exception 'วางแผนส่งได้เฉพาะเครื่องที่ผ่าน QC (Head QC อนุมัติแล้ว)'; end if;
  q := public.qc_machine_passed_qc(m.id);
  if q.status is distinct from 'Pass' or q.approved_at is null then raise exception 'QC ล่าสุดของเครื่องนี้ยังไม่ได้รับอนุมัติ'; end if;
  if coalesce(p->>'customerId', '') = '' or not exists (select 1 from public.customers where id = p->>'customerId') then raise exception 'ต้องเลือกลูกค้า'; end if;
  if coalesce(p->>'route', '') not in ('stock', 'direct') then raise exception 'เลือกเส้นทาง: ผ่าน Stock หรือ ส่งตรง'; end if;
  if trim(coalesce(p->>'purchaserName', '')) = '' then raise exception 'ต้องระบุชื่อคนจัดซื้อที่อนุมัติแผนส่ง (บันทึกแทน)'; end if;
  if exists (select 1 from public.qc_releases where machine_id = m.id and status in ('Planned', 'Released', 'In Stock')) then
    raise exception 'เครื่องนี้มีแผนส่งที่ยังไม่จบอยู่แล้ว';
  end if;
  no := public.qc_next_doc('REL');
  insert into public.qc_releases (release_no, machine_id, qc_id, customer_id, route, plan_date, destination, plan_note, purchaser_name, plan_by, plan_name)
  values (no, m.id, q.id, p->>'customerId', p->>'route', nullif(p->>'planDate', '')::date, coalesce(p->>'destination', ''),
          coalesce(p->>'note', ''), trim(p->>'purchaserName'), auth.uid(), coalesce(public.qc_my_name(), ''))
  returning id into rid;
  return jsonb_build_object('id', rid, 'release_no', no);
end $$;

create or replace function public.qc_release_confirm(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_releases; q public.qc_records;
begin
  if not public.qc_is_head() then raise exception 'ยืนยัน Release ได้เฉพาะ Head QC' using errcode = '42501'; end if;
  select * into r from public.qc_releases where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการส่งมอบ'; end if;
  if r.status <> 'Planned' then raise exception '% สถานะ "%" ยืนยันไม่ได้', r.release_no, r.status; end if;
  q := public.qc_machine_passed_qc(r.machine_id);
  if q.id is distinct from r.qc_id or q.status <> 'Pass' then raise exception 'ผล QC ของเครื่องเปลี่ยนไปแล้ว ยกเลิกแผนนี้แล้ววางใหม่'; end if;
  if exists (select 1 from public.qc_ncr where machine_id = r.machine_id and status not in ('Closed', 'Cancelled')) then
    raise exception 'เครื่องนี้มี NCR ที่ยังไม่ปิด';
  end if;
  update public.qc_releases set status = 'Released', released_by = auth.uid(), released_name = coalesce(public.qc_my_name(), ''),
         released_at = now(), updated_at = now()
   where id = p_id;
end $$;

create or replace function public.qc_release_stock_in(p_id uuid, p_stock_name text, p_location text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_releases;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if trim(coalesce(p_stock_name, '')) = '' then raise exception 'ต้องระบุชื่อคน Stock ที่รับเครื่อง (บันทึกแทน)'; end if;
  select * into r from public.qc_releases where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการส่งมอบ'; end if;
  if r.route <> 'stock' then raise exception 'รายการนี้ส่งตรง ไม่ผ่าน Stock'; end if;
  if r.status <> 'Released' then raise exception 'ต้องให้ Head QC ยืนยัน Release ก่อน (สถานะ "%")', r.status; end if;
  update public.qc_releases set status = 'In Stock', stock_name = trim(p_stock_name), stock_location = coalesce(p_location, ''),
         stock_at = now(), updated_at = now()
   where id = p_id;
end $$;

-- the actual hand-over; p_require_sign = false only for the old qc_handover button
create or replace function public.qc_release_finish(p_id uuid, p_receiver text, p_date date, p_transporter text, p_note text, p_require_sign boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_releases;
begin
  select * into r from public.qc_releases where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการส่งมอบ'; end if;
  if not ((r.route = 'direct' and r.status = 'Released') or (r.route = 'stock' and r.status = 'In Stock')) then
    raise exception '%', case when r.status = 'Planned' then 'ต้องให้ Head QC ยืนยัน Release ก่อน'
                         when r.route = 'stock' and r.status = 'Released' then 'เส้นทางผ่าน Stock: บันทึกว่า Stock รับเครื่องก่อน'
                         else r.release_no || ' สถานะ "' || r.status || '" ส่งมอบไม่ได้' end;
  end if;
  if trim(coalesce(p_receiver, '')) = '' then raise exception 'ต้องระบุชื่อผู้รับเครื่อง'; end if;
  if p_require_sign and not exists (select 1 from public.qc_evidence where release_id = p_id and kind = 'signature') then
    raise exception 'ต้องแนบรูปลายเซ็นผู้รับ (หรือใบรับเครื่องที่ลงชื่อแล้ว) อย่างน้อย 1 รูป';
  end if;
  update public.machines
     set "customerId" = r.customer_id, "lifecycle" = 'delivered', "updatedAt" = now(),
         note = trim(both from coalesce(note, '') || ' ส่งมอบจาก QC ' || r.release_no || ' ' ||
                to_char(coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYY-MM-DD'))
   where id = r.machine_id and "lifecycle" = 'ready';
  if not found then raise exception 'เครื่องไม่ได้อยู่ในสถานะผ่าน QC รอส่งมอบ'; end if;
  update public.qc_releases set status = 'Delivered', receiver_name = trim(p_receiver), delivered_on = coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date),
         transporter = coalesce(p_transporter, ''), deliver_note = coalesce(p_note, ''), delivered_by = auth.uid(),
         delivered_name = coalesce(public.qc_my_name(), ''), delivered_at = now(), updated_at = now()
   where id = p_id;
end $$;
revoke all on function public.qc_release_finish(uuid, text, date, text, text, boolean) from public, anon, authenticated;

create or replace function public.qc_release_deliver(p_id uuid, p_receiver text, p_date date default null, p_transporter text default '', p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  perform public.qc_release_finish(p_id, p_receiver, p_date, p_transporter, p_note, true);
end $$;

create or replace function public.qc_release_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.qc_releases;
begin
  if not public.qc_is_head() then raise exception 'ยกเลิกแผนส่งได้เฉพาะ Head QC' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผล'; end if;
  select * into r from public.qc_releases where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการส่งมอบ'; end if;
  if r.status in ('Delivered', 'Cancelled') then raise exception '% สถานะ "%" ยกเลิกไม่ได้', r.release_no, r.status; end if;
  update public.qc_releases set status = 'Cancelled', cancel_reason = trim(p_reason), updated_at = now() where id = p_id;
end $$;

-- old button: same name and parameters, now goes through the release
create or replace function public.qc_handover(p_machine_id text, p_customer_id text, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare last public.qc_records; r public.qc_releases;
begin
  if not public.qc_can_work() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(public.qc_setting('release_required'), 'true'::jsonb) = 'true'::jsonb then
    select * into r from public.qc_releases where machine_id = p_machine_id and status in ('Released', 'In Stock');
    if not found then raise exception 'ส่งมอบได้หลัง Head QC ยืนยัน Release แล้วเท่านั้น (STEP 06)'; end if;
    if r.customer_id is distinct from p_customer_id then raise exception 'ลูกค้าไม่ตรงกับแผนส่ง %', r.release_no; end if;
    perform public.qc_release_finish(r.id, 'ส่งมอบผ่านปุ่มเดิม', p_date, '', '', false);
    return;
  end if;
  if coalesce(p_customer_id, '') = '' then raise exception 'ต้องเลือกลูกค้า'; end if;
  last := public.qc_machine_passed_qc(p_machine_id);
  if last.status is distinct from 'Pass' or last.approved_at is null then
    raise exception 'ส่งมอบได้เมื่อ QC ล่าสุดของเครื่องนี้ได้รับอนุมัติจาก Head QC แล้วเท่านั้น';
  end if;
  update public.machines
     set "customerId" = p_customer_id, "lifecycle" = 'delivered', "updatedAt" = now(),
         note = trim(both from coalesce(note, '') || ' ส่งมอบจาก QC ' || to_char(coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYY-MM-DD'))
   where id = p_machine_id and "lifecycle" in ('qc', 'ready');
  if not found then raise exception 'ไม่พบเครื่องนี้ในขั้นตอน QC'; end if;
end $$;

-- an approved QC with a release in progress cannot be re-opened (cancel the release first)
create or replace function public.qc_records_release_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'Pass' and new.status <> 'Pass'
     and exists (select 1 from public.qc_releases where qc_id = old.id and status in ('Planned', 'Released', 'In Stock')) then
    raise exception 'ใบ QC % มีแผนส่งมอบที่ยังไม่จบ ให้ Head QC ยกเลิกแผนส่งก่อนเปิดแก้', old.qc_no;
  end if;
  return new;
end $$;
drop trigger if exists qc_records_release_lock on public.qc_records;
create trigger qc_records_release_lock before update of status on public.qc_records
  for each row execute function public.qc_records_release_lock();

revoke all on function public.qc_release_is_open(uuid)       from public, anon;
revoke all on function public.qc_release_plan(jsonb)         from public, anon;
revoke all on function public.qc_release_confirm(uuid)       from public, anon;
revoke all on function public.qc_release_stock_in(uuid, text, text) from public, anon;
revoke all on function public.qc_release_deliver(uuid, text, date, text, text) from public, anon;
revoke all on function public.qc_release_cancel(uuid, text)  from public, anon;
revoke all on function public.qc_handover(text, text, date)  from public, anon;
grant execute on function public.qc_release_is_open(uuid)       to authenticated;
grant execute on function public.qc_release_plan(jsonb)         to authenticated;
grant execute on function public.qc_release_confirm(uuid)       to authenticated;
grant execute on function public.qc_release_stock_in(uuid, text, text) to authenticated;
grant execute on function public.qc_release_deliver(uuid, text, date, text, text) to authenticated;
grant execute on function public.qc_release_cancel(uuid, text)  to authenticated;
grant execute on function public.qc_handover(text, text, date)  to authenticated;

commit;

select 'qc_releases' as item, case when to_regclass('public.qc_releases') is not null then 'ok' else 'MISSING' end as result
union all select 'qc_release_plan()', case when to_regprocedure('public.qc_release_plan(jsonb)') is not null then 'ok' else 'MISSING' end
union all select 'release_required', coalesce((select value::text from public.qc_settings where key = 'release_required'), 'MISSING');
