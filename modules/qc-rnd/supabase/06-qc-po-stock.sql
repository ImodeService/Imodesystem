-- I-MODE System — QC & R&D module
-- 06-qc-po-stock.sql — STEP 01 จัดซื้อเปิด PO · STEP 02 Stock รับเครื่อง · อุปกรณ์ค้างส่ง (Outstanding Accessories)
--
-- รันหลัง 05-qc-ncr.sql · รันซ้ำได้ · อยู่ใน begin … commit
--
-- ตอนนี้ฝ่ายจัดซื้อและ Stock ยังไม่ใช้ระบบ ทีม QC / Head QC จึง "บันทึกแทน":
-- ทุกแถวเก็บทั้งชื่อคนทำจริง (ข้อความ เช่น purchaser_name, stock_name) และบัญชีที่บันทึก (recorded_by / recorded_name)
-- เมื่อฝ่ายนั้นมาใช้ระบบเอง ใช้ตารางเดิมได้เลย ไม่ต้องย้ายข้อมูล
--
-- ทำอะไร
-- 1. qc_po                 Project / PO / รายการเครื่องที่สั่ง (items: [{model, name, qty}])
--    qc_po_save(p)         เพิ่มหรือแก้ PO (ยกเลิก/ปิดได้ด้วย status)
-- 2. qc_stock_receipts     Stock รับเครื่องเข้าคลัง 1 แถวต่อ 1 เครื่อง เลข RCV-YYYY-NNNN
--    qc_receive(p)         รับเครื่องครบขั้นตอนในคำสั่งเดียว: (Stock รับ) → qc_intake เดิม (เครื่อง + IMODE S/N + ใบ QC)
--                          → อุปกรณ์ค้างส่ง · qc_intake ชื่อและพารามิเตอร์เดิมยังใช้ได้
-- 3. qc_acc_items          อุปกรณ์ค้างส่งรายชิ้น ให้จัดซื้อตาม Supplier (ไม่บล็อกการตรวจ)
--    qc_acc_add(p) · qc_acc_follow(id, note, due, follow_name) · qc_acc_receive(id, note) · qc_acc_cancel(id, reason)
--    ได้รับครบทุกชิ้นของเครื่อง → ใบ QC ของเครื่องนั้นเป็นอุปกรณ์ "ส่งครบแล้ว" (accessories_status = delivered)

begin;

do $$
begin
  if to_regprocedure('public.qc_next_doc(text)') is null then raise exception 'ต้องรัน 05-qc-ncr.sql ก่อน'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. PO
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_po (
  id              uuid primary key default gen_random_uuid(),
  po_no           text not null,
  project_no      text default '',
  supplier        text default '',
  po_date         date,
  expected_date   date,
  items           jsonb not null default '[]'::jsonb,
  note            text default '',
  purchaser_name  text default '',          -- คนจัดซื้อที่เปิด PO จริง
  status          text not null default 'Open' check (status in ('Open', 'Closed', 'Cancelled')),
  recorded_by     uuid default auth.uid(),
  recorded_name   text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists qc_po_no_key on public.qc_po (lower(po_no));

-- ---------------------------------------------------------------------------------------------
-- 2. stock receipts
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_stock_receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_no     text not null unique,
  machine_id     text not null,
  qc_id          text,
  po_id          uuid references public.qc_po(id),
  po_no          text default '',
  supplier       text default '',
  received_at    timestamptz not null,
  stock_name     text not null,            -- คน Stock ที่รับจริง
  location       text default '',
  condition_note text default '',
  recorded_by    uuid default auth.uid(),
  recorded_name  text default '',
  created_at     timestamptz not null default now()
);
create unique index if not exists qc_stock_receipts_machine_key on public.qc_stock_receipts (machine_id);

-- ---------------------------------------------------------------------------------------------
-- 3. outstanding accessories
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_acc_items (
  id             uuid primary key default gen_random_uuid(),
  machine_id     text not null,
  qc_id          text,
  po_no          text default '',
  supplier       text default '',
  item           text not null,
  qty            integer not null default 1 check (qty > 0),
  due_date       date,
  follow_name    text default '',          -- คนจัดซื้อที่ตาม Supplier
  status         text not null default 'Open' check (status in ('Open', 'Received', 'Cancelled')),
  last_note      text default '',
  log            jsonb not null default '[]'::jsonb,   -- [{at, by, note}] history of follow-ups
  received_at    timestamptz,
  received_note  text default '',
  recorded_by    uuid default auth.uid(),
  recorded_name  text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists qc_acc_items_machine_idx on public.qc_acc_items (machine_id);
create index if not exists qc_acc_items_open_idx on public.qc_acc_items (status) where status = 'Open';

alter table public.qc_po enable row level security;
alter table public.qc_stock_receipts enable row level security;
alter table public.qc_acc_items enable row level security;
drop policy if exists qc_po_read on public.qc_po;
drop policy if exists qc_stock_receipts_read on public.qc_stock_receipts;
drop policy if exists qc_acc_items_read on public.qc_acc_items;
create policy qc_po_read on public.qc_po for select to authenticated using (public.is_staff());
create policy qc_stock_receipts_read on public.qc_stock_receipts for select to authenticated using (public.is_staff());
create policy qc_acc_items_read on public.qc_acc_items for select to authenticated using (public.is_staff());
revoke all on public.qc_po, public.qc_stock_receipts, public.qc_acc_items from anon, authenticated;
grant select on public.qc_po, public.qc_stock_receipts, public.qc_acc_items to authenticated;

drop trigger if exists qc_po_audit on public.qc_po;
create trigger qc_po_audit after insert or update or delete on public.qc_po for each row execute function public.qc_audit();
drop trigger if exists qc_stock_receipts_audit on public.qc_stock_receipts;
create trigger qc_stock_receipts_audit after insert or update or delete on public.qc_stock_receipts for each row execute function public.qc_audit();
drop trigger if exists qc_acc_items_audit on public.qc_acc_items;
create trigger qc_acc_items_audit after insert or update or delete on public.qc_acc_items for each row execute function public.qc_audit();

-- ---------------------------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------------------------
-- p: { id?, po_no, project_no, supplier, po_date, expected_date, items, note, purchaser_name, status }
create or replace function public.qc_po_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid := nullif(p->>'id', '')::uuid; no text := trim(coalesce(p->>'po_no', ''));
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์บันทึก PO' using errcode = '42501'; end if;
  if no = '' then raise exception 'ต้องมีเลขที่ PO'; end if;
  if trim(coalesce(p->>'purchaser_name', '')) = '' then raise exception 'ต้องระบุชื่อผู้จัดซื้อที่เปิด PO (บันทึกแทน)'; end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' then raise exception 'รายการเครื่องไม่ถูกต้อง'; end if;
  if exists (select 1 from public.qc_po where lower(po_no) = lower(no) and id is distinct from pid) then
    raise exception 'มี PO เลข % แล้ว', no;
  end if;
  if pid is null then
    insert into public.qc_po (po_no, project_no, supplier, po_date, expected_date, items, note, purchaser_name, recorded_by, recorded_name)
    values (no, coalesce(p->>'project_no', ''), coalesce(p->>'supplier', ''), nullif(p->>'po_date', '')::date,
            nullif(p->>'expected_date', '')::date, coalesce(p->'items', '[]'::jsonb), coalesce(p->>'note', ''),
            trim(p->>'purchaser_name'), auth.uid(), coalesce(public.qc_my_name(), ''))
    returning id into pid;
  else
    update public.qc_po
       set po_no = no, project_no = coalesce(p->>'project_no', ''), supplier = coalesce(p->>'supplier', ''),
           po_date = nullif(p->>'po_date', '')::date, expected_date = nullif(p->>'expected_date', '')::date,
           items = coalesce(p->'items', '[]'::jsonb), note = coalesce(p->>'note', ''), purchaser_name = trim(p->>'purchaser_name'),
           status = coalesce(nullif(p->>'status', ''), status), updated_at = now()
     where id = pid;
    if not found then raise exception 'ไม่พบ PO'; end if;
  end if;
  return jsonb_build_object('id', pid);
end $$;

-- p: everything qc_intake takes, plus
--    stock: { stockName, receivedAt (timestamp), location, conditionNote }   (STEP 02, recorded on behalf of Stock)
--    poId                                                                    (PO picked from qc_po; poNo/supplier/projectNo copied)
--    outstanding: [{ item, qty, dueDate, followName }]                         (accessories still to come)
create or replace function public.qc_receive(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  po public.qc_po; res jsonb; rno text; x jsonb; n int := 0;
  st jsonb := coalesce(p->'stock', '{}'::jsonb);
  q jsonb := p;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์รับเครื่อง' using errcode = '42501'; end if;
  if nullif(p->>'poId', '') is not null then
    select * into po from public.qc_po where id = (p->>'poId')::uuid;
    if not found then raise exception 'ไม่พบ PO ที่เลือก'; end if;
    if po.status <> 'Open' then raise exception 'PO % ปิดหรือยกเลิกแล้ว', po.po_no; end if;
    q := q || jsonb_build_object('poNo', po.po_no, 'projectNo', coalesce(nullif(p->>'projectNo', ''), po.project_no),
                                 'supplier', coalesce(nullif(p->>'supplier', ''), po.supplier));
  end if;
  if trim(coalesce(st->>'stockName', '')) = '' then raise exception 'ต้องระบุชื่อคน Stock ที่รับเครื่อง (บันทึกแทน)'; end if;
  if nullif(st->>'receivedAt', '') is null then raise exception 'ต้องระบุวันเวลาที่ Stock รับเครื่อง'; end if;
  if (st->>'receivedAt')::timestamptz > now() + interval '10 minutes' then raise exception 'วันเวลารับเครื่องเป็นอนาคตไม่ได้'; end if;
  q := q || jsonb_build_object('receivedAt', to_char(((st->>'receivedAt')::timestamptz) at time zone 'Asia/Bangkok', 'YYYY-MM-DD'));
  -- the old free-text field keeps a readable copy of what is outstanding
  if jsonb_typeof(p->'outstanding') = 'array' and jsonb_array_length(p->'outstanding') > 0 and coalesce(p->>'accessoriesMissing', '') = '' then
    q := q || jsonb_build_object('accessoriesMissing',
      (select string_agg((e->>'item') || ' x' || coalesce(nullif(e->>'qty', ''), '1'), ', ') from jsonb_array_elements(p->'outstanding') e));
  end if;

  res := public.qc_intake(q);

  rno := public.qc_next_doc('RCV');
  insert into public.qc_stock_receipts (receipt_no, machine_id, qc_id, po_id, po_no, supplier, received_at, stock_name, location,
                                        condition_note, recorded_by, recorded_name)
  values (rno, res->>'machine_id', res->>'qc_id', po.id, coalesce(q->>'poNo', ''), coalesce(q->>'supplier', ''),
          (st->>'receivedAt')::timestamptz, trim(st->>'stockName'), coalesce(st->>'location', ''), coalesce(st->>'conditionNote', ''),
          auth.uid(), coalesce(public.qc_my_name(), ''));

  for x in select * from jsonb_array_elements(coalesce(p->'outstanding', '[]'::jsonb)) loop
    if trim(coalesce(x->>'item', '')) = '' then continue; end if;
    insert into public.qc_acc_items (machine_id, qc_id, po_no, supplier, item, qty, due_date, follow_name, recorded_by, recorded_name)
    values (res->>'machine_id', res->>'qc_id', coalesce(q->>'poNo', ''), coalesce(q->>'supplier', ''), trim(x->>'item'),
            greatest(coalesce(nullif(x->>'qty', '')::int, 1), 1), nullif(x->>'dueDate', '')::date, coalesce(x->>'followName', ''),
            auth.uid(), coalesce(public.qc_my_name(), ''));
    n := n + 1;
  end loop;
  return res || jsonb_build_object('receipt_no', rno, 'outstanding', n);
end $$;

-- p: { machineId, item, qty, dueDate, followName }
create or replace function public.qc_acc_add(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.machines; q public.qc_records; aid uuid;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if trim(coalesce(p->>'item', '')) = '' then raise exception 'ต้องระบุชื่ออุปกรณ์'; end if;
  select * into m from public.machines where id = p->>'machineId';
  if not found or m."lifecycle" is null then raise exception 'ไม่พบเครื่องในงาน QC'; end if;
  select * into q from public.qc_records where machine_id = m.id and status <> 'Cancelled' order by created_at desc limit 1;
  insert into public.qc_acc_items (machine_id, qc_id, po_no, supplier, item, qty, due_date, follow_name, recorded_by, recorded_name)
  values (m.id, q.id, coalesce(m."poNo", ''), coalesce(m.supplier, ''), trim(p->>'item'), greatest(coalesce(nullif(p->>'qty', '')::int, 1), 1),
          nullif(p->>'dueDate', '')::date, coalesce(p->>'followName', ''), auth.uid(), coalesce(public.qc_my_name(), ''))
  returning id into aid;
  update public.qc_records set accessories_status = 'outstanding' where machine_id = m.id and status <> 'Cancelled' and accessories_status <> 'outstanding';
  return jsonb_build_object('id', aid);
end $$;

create or replace function public.qc_acc_follow(p_id uuid, p_note text, p_due date default null, p_follow_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.qc_acc_items;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if trim(coalesce(p_note, '')) = '' then raise exception 'ต้องบันทึกผลการติดตาม'; end if;
  select * into a from public.qc_acc_items where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if a.status <> 'Open' then raise exception 'รายการนี้ปิดแล้ว'; end if;
  update public.qc_acc_items
     set last_note = trim(p_note), due_date = coalesce(p_due, due_date), follow_name = coalesce(nullif(trim(p_follow_name), ''), follow_name),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', coalesce(public.qc_my_name(), ''), 'note', trim(p_note),
                                                           'due', coalesce(p_due, a.due_date))),
         updated_at = now()
   where id = p_id;
end $$;

create or replace function public.qc_acc_settle(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.qc_acc_items;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into a from public.qc_acc_items where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if a.status <> 'Open' then raise exception 'รายการนี้ปิดแล้ว'; end if;
  update public.qc_acc_items
     set status = p_status, received_at = case when p_status = 'Received' then now() end, received_note = coalesce(p_note, ''),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', coalesce(public.qc_my_name(), ''),
                                                           'note', case when p_status = 'Received' then 'ได้รับแล้ว' else 'ยกเลิก' end
                                                                   || case when coalesce(p_note, '') <> '' then ': ' || p_note else '' end)),
         updated_at = now()
   where id = p_id;
  if not exists (select 1 from public.qc_acc_items where machine_id = a.machine_id and status = 'Open') then
    update public.qc_records set accessories_status = 'delivered'
     where machine_id = a.machine_id and status <> 'Cancelled' and accessories_status in ('outstanding', 'partial');
  end if;
end $$;
revoke all on function public.qc_acc_settle(uuid, text, text) from public, anon, authenticated;

create or replace function public.qc_acc_receive(p_id uuid, p_note text default '')
returns void language sql security definer set search_path = public as $$ select public.qc_acc_settle(p_id, 'Received', p_note) $$;

create or replace function public.qc_acc_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผล'; end if;
  perform public.qc_acc_settle(p_id, 'Cancelled', trim(p_reason));
end $$;

-- the RPCs above update qc_records.accessories_status on QC documents that may already be locked (Pass):
-- that column is bookkeeping, not part of the inspected result, so the 04 guard lets the server do it
-- (the guard only stops REST clients).

revoke all on function public.qc_po_save(jsonb)                  from public, anon;
revoke all on function public.qc_receive(jsonb)                  from public, anon;
revoke all on function public.qc_acc_add(jsonb)                  from public, anon;
revoke all on function public.qc_acc_follow(uuid, text, date, text) from public, anon;
revoke all on function public.qc_acc_receive(uuid, text)         from public, anon;
revoke all on function public.qc_acc_cancel(uuid, text)          from public, anon;
grant execute on function public.qc_po_save(jsonb)                  to authenticated;
grant execute on function public.qc_receive(jsonb)                  to authenticated;
grant execute on function public.qc_acc_add(jsonb)                  to authenticated;
grant execute on function public.qc_acc_follow(uuid, text, date, text) to authenticated;
grant execute on function public.qc_acc_receive(uuid, text)         to authenticated;
grant execute on function public.qc_acc_cancel(uuid, text)          to authenticated;

commit;

select 'qc_po' as item, case when to_regclass('public.qc_po') is not null then 'ok' else 'MISSING' end as result
union all select 'qc_stock_receipts', case when to_regclass('public.qc_stock_receipts') is not null then 'ok' else 'MISSING' end
union all select 'qc_acc_items', case when to_regclass('public.qc_acc_items') is not null then 'ok' else 'MISSING' end
union all select 'qc_receive()', case when to_regprocedure('public.qc_receive(jsonb)') is not null then 'ok' else 'MISSING' end;
