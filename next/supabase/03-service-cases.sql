-- =====================================================================
-- next/supabase/03-service-cases.sql  (2026-11-20)
-- สำหรับหน้า "เปิดเคสใหม่" และ "รายละเอียดเคส" ในระบบใหม่
--   1) case_create(p jsonb): เปิดเคสใหม่ ออกเลข SRV-ปีเดือนวัน-ลำดับ ให้เอง (กันเลขซ้ำ)
--      ถ้าเป็นลูกค้าใหม่ สร้างลูกค้าให้ด้วย · ต้องมีสิทธิ์ service.edit
--   2) case_move_stage: ย้ายขั้นแล้วอัปเดตสถานะของระบบเดิมให้ตรงกันด้วย
--      (กำลังซ่อม → กำลังดำเนินการ, ส่งคืน → เสร็จสิ้น, ปิดเคส → ปิดเคส)
--   3) ตาราง calendar_jobs: งานในปฏิทินที่ไม่ใช่เคส + ให้ Sale / Admin แก้ปฏิทินได้
-- ไม่แก้/ลบเคสเดิม รันซ้ำได้ · ต้องรัน 01-foundation ก่อน
-- =====================================================================
begin;

create or replace function public.case_create(p jsonb)
returns public.service_cases
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_day text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMMDD');
  v_n int;
  v_cust text := nullif(trim(coalesce(p->>'customer_id', '')), '');
  v_name text := nullif(trim(coalesce(p->>'customer', '')), '');
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  r public.service_cases;
begin
  if not public.app_can('service.edit') then
    raise exception 'ไม่มีสิทธิ์เปิดเคส' using errcode = '42501';
  end if;
  if v_name is null then raise exception 'ต้องใส่ชื่อลูกค้า'; end if;
  if nullif(trim(coalesce(p->>'issue', '')), '') is null then raise exception 'ต้องใส่อาการ'; end if;

  -- ลูกค้าใหม่: สร้างในตารางลูกค้า
  if v_cust is null then
    v_cust := gen_random_uuid()::text;
    insert into public.customers (id, name, contact, phone, location)
    values (v_cust, v_name, p->>'contact', p->>'phone', p->>'location');
  end if;

  -- เลขเคสต่อวัน (ล็อกกันสองคนกดพร้อมกันได้เลขซ้ำ)
  perform pg_advisory_xact_lock(hashtext('service_cases_ticket'));
  select coalesce(max(nullif(split_part(ticket, '-', 3), '')::int), 0) + 1 into v_n
    from public.service_cases
   where ticket like 'SRV-' || v_day || '-%' and split_part(ticket, '-', 3) ~ '^[0-9]+$';

  insert into public.service_cases (
    id, ticket, created_at, updated_at, customer_id, customer, contact, phone, location, map_url,
    machine_id, machine, model, serial, service_type, priority, channel, issue, note,
    status, assignee, appointment, media, stage, stage_log)
  values (
    gen_random_uuid()::text, 'SRV-' || v_day || '-' || lpad(v_n::text, 3, '0'), v_now, v_now,
    v_cust, v_name, p->>'contact', p->>'phone', p->>'location', p->>'map_url',
    nullif(p->>'machine_id', ''), p->>'machine', p->>'model', p->>'serial',
    coalesce(nullif(p->>'service_type', ''), 'ลูกค้าส่งเครื่องเข้าบริษัท'),
    coalesce(nullif(p->>'priority', ''), 'ปกติ'), p->>'channel', p->>'issue', p->>'note',
    'เคสใหม่', nullif(p->>'assignee', ''), nullif(p->>'appointment', ''),
    coalesce(p->'media', '[]'::jsonb), 'received',
    jsonb_build_array(jsonb_build_object('at', now(), 'from', null, 'to', 'received',
      'by', auth.uid(), 'by_name', public.app_my_name(), 'note', 'เปิดเคส')))
  returning * into r;
  return r;
end $$;

revoke all on function public.case_create(jsonb) from public, anon;
grant execute on function public.case_create(jsonb) to authenticated;

create or replace function public.case_move_stage(p_case text, p_stage text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare c public.service_cases; old text;
begin
  if not public.app_can('service.edit') then raise exception 'ไม่มีสิทธิ์แก้เคส' using errcode = '42501'; end if;
  if not (p_stage = any(public.case_stages())) then raise exception 'ไม่รู้จักขั้น: %', p_stage; end if;
  select * into c from public.service_cases where id = p_case and deleted_at is null for update;
  if not found then raise exception 'ไม่พบเคส'; end if;
  old := coalesce(c.stage, 'received');
  if old = 'closed' and p_stage <> 'closed' and not public.app_can('service.reopen') then
    raise exception 'เคสปิดแล้ว เปิดใหม่ได้เฉพาะคนที่มีสิทธิ์ service.reopen';
  end if;
  if old = p_stage then return; end if;
  update public.service_cases set
    stage = p_stage,
    stage_before_hold = case when p_stage = 'hold' then old when old = 'hold' then null else stage_before_hold end,
    hold_since = case when p_stage = 'hold' then now() when old = 'hold' then null else hold_since end,
    stage_log = coalesce(stage_log, '[]'::jsonb) || jsonb_build_object(
      'at', now(), 'from', old, 'to', p_stage, 'by', auth.uid(), 'by_name', public.app_my_name(), 'note', coalesce(p_note, '')),
    status = case p_stage when 'repair' then 'กำลังดำเนินการ' when 'return' then 'เสร็จสิ้น' when 'closed' then 'ปิดเคส'
                          else case when old = 'closed' then 'กำลังดำเนินการ' else status end end,
    updated_at = to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  where id = p_case;
end $$;

-- ---------- 3) งานในปฏิทินที่ไม่ใช่เคส (เช่น ไปดูงาน รับลูกค้าที่สนามบิน) ----------
create table if not exists public.calendar_jobs (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  time_text text,                 -- เช่น 9:30-11:30 น.
  techs text[] not null default '{}',  -- รหัสช่าง (ตาราง technicians)
  customer text,
  task text not null,
  machine text,
  created_by uuid default auth.uid(),
  created_by_name text default public.app_my_name(),
  created_at timestamptz not null default now()
);
create index if not exists calendar_jobs_day_idx on public.calendar_jobs (day);
alter table public.calendar_jobs enable row level security;
revoke all on public.calendar_jobs from anon;
grant select, insert, update, delete on public.calendar_jobs to authenticated;
drop policy if exists calendar_jobs_read on public.calendar_jobs;
create policy calendar_jobs_read on public.calendar_jobs for select to authenticated using (public.app_can('calendar.view'));
drop policy if exists calendar_jobs_write on public.calendar_jobs;
create policy calendar_jobs_write on public.calendar_jobs for all to authenticated
  using (public.app_can('calendar.edit')) with check (public.app_can('calendar.edit'));

-- แอดมินที่พิมพ์แผนงานช่างทุกวัน ต้องเพิ่ม/แก้งานในปฏิทินได้
insert into public.app_role_perms (role, perm) values ('Sale / Admin', 'calendar.edit')
on conflict do nothing;

commit;

-- ตรวจผล: ต้องได้ 2 แถว และเคสยังครบ
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('case_create', 'case_move_stage');
select count(*) as cases_now from public.service_cases;
select to_regclass('public.calendar_jobs') as calendar_jobs_table;
