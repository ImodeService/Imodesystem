-- I-MODE System — QC & R&D module
-- 03-qc-roles-audit.sql — บทบาทสาย QC, Audit Log, ห้ามลบข้อมูล QC   (V3.1 Phase 1)
--
-- รันหลัง 02-qc-core.sql (ต้องรัน 02a → 02 ก่อน) · รันซ้ำได้ · ไม่ลบหรือเปลี่ยนชื่อคอลัมน์เดิม
-- รันใน Supabase SQL Editor ทั้งไฟล์ครั้งเดียว (อยู่ใน begin … commit ถ้าล้ม จะไม่มีอะไรเปลี่ยน)
--
-- ทำอะไร
-- 1. qc_settings          ค่าตั้งของ QC (แก้ได้จาก SQL Editor เท่านั้น)
--                          roles_enforced = false (ค่าเริ่มต้น) → ช่วงเปลี่ยนผ่าน: พนักงานทุกคนยังทำงาน QC ได้
--                          เหมือนเดิม แต่ "อนุมัติ QC" ต้องเป็น Head QC จริงเสมอ
--                          ตั้งบทบาทให้ทีมครบแล้วค่อยเปลี่ยนเป็น true → เฉพาะสาย QC เพิ่ม/แก้งาน QC ได้
-- 2. ฟังก์ชันบทบาท       qc_my_roles(), qc_has_role(...), qc_can_work(), qc_is_head()
--                          อ่าน profiles.role และ profiles.extra_roles (ถ้ามีคอลัมน์นี้แล้ว จาก 04-multi-role-rename)
--                          ชื่อบทบาท: 'Head QC', 'Admin QC', 'QC Supervisor', 'QC Technician', 'R&D Technician',
--                                     'Purchasing', 'Stock', 'Management'
-- 3. qc_audit_log         บันทึกทุกการเพิ่ม/แก้/ลบ ของ qc_records, qc_evidence, คอลัมน์ QC ของ machines
--                          และการเปลี่ยนบทบาทใน profiles · เพิ่มได้จาก trigger เท่านั้น แก้/ลบไม่ได้
-- 4. ห้ามลบใบ QC          เอาสิทธิ์ลบของแอดมินออก (ใช้สถานะ "ยกเลิก" จาก 08 แทน)
--    หลักฐาน               ลบได้เฉพาะไฟล์ที่ตัวเองเพิ่ม และใบ QC ยังไม่ถูกส่งอนุมัติ/อนุมัติ (ทุกการลบอยู่ใน audit)
-- 5. กันตั้งบทบาท QC ให้ตัวเอง (System Admin ให้ตัวเองเป็น Head QC ไม่ได้)
-- 6. IMODE S/N แก้ได้เฉพาะ Head QC (เดิม = แอดมิน Service)
--
-- ไม่เปลี่ยน: สิทธิ์ "อ่าน" ใบ QC ยังเป็นพนักงานทุกคน (Service js/137 อ่านอยู่) — รอตัดสินใจ D5

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'qc_records' and column_name = 'qc_no') then
    raise exception 'ต้องรัน 02a-rename-old-qc-records.sql แล้ว 02-qc-core.sql ก่อน';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. settings
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_settings (
  key        text primary key,
  value      jsonb not null,
  note       text default '',
  updated_at timestamptz not null default now()
);
alter table public.qc_settings enable row level security;
drop policy if exists qc_settings_read on public.qc_settings;
create policy qc_settings_read on public.qc_settings for select to authenticated using (public.is_staff());
revoke all on public.qc_settings from anon, authenticated;
grant select on public.qc_settings to authenticated;     -- no write policy: change it in the SQL Editor

insert into public.qc_settings (key, value, note) values
  ('roles_enforced', 'false'::jsonb, 'true = เฉพาะบทบาทสาย QC เพิ่ม/แก้งาน QC ได้; false = พนักงานทุกคน (ช่วงเปลี่ยนผ่าน)')
  on conflict (key) do nothing;

create or replace function public.qc_setting(k text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.qc_settings where key = k
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. roles
-- ---------------------------------------------------------------------------------------------
-- role + extra_roles of the signed-in user, lower-cased. Works with or without profiles.extra_roles
-- (text[] or jsonb), so this file does not depend on 04-multi-role-rename.
create or replace function public.qc_roles_of(p public.profiles)
returns text[] language plpgsql stable set search_path = public as $$
declare
  j jsonb := to_jsonb(p);
  out text[] := array[lower(trim(coalesce(p.role, '')))];
begin
  if jsonb_typeof(j->'extra_roles') = 'array' then
    out := out || array(select lower(trim(x)) from jsonb_array_elements_text(j->'extra_roles') x);
  end if;
  return out;
end $$;

create or replace function public.qc_my_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select public.qc_roles_of(p) from public.profiles p where p.id = auth.uid() and p.is_active), '{}'::text[])
$$;

create or replace function public.qc_has_role(variadic r text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.qc_my_roles() && array(select lower(x) from unnest(r) x)
$$;

create or replace function public.qc_is_head()
returns boolean language sql stable security definer set search_path = public as $$
  select public.qc_has_role('Head QC')
$$;

-- may add / edit QC work (not approve)
create or replace function public.qc_can_work()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(public.qc_setting('roles_enforced'), 'false'::jsonb) = 'true'::jsonb
      then public.qc_has_role('Head QC', 'Admin QC', 'QC Supervisor', 'QC Technician', 'R&D Technician')
    else public.is_staff()
  end
$$;

create or replace function public.qc_my_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), username, '') from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. audit log
-- ---------------------------------------------------------------------------------------------
create table if not exists public.qc_audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_name text default '',
  db_user    text default current_user,
  table_name text not null,
  row_id     text,
  action     text not null,          -- INSERT / UPDATE / DELETE / or an RPC name (qc_submit, qc_decide …)
  old_data   jsonb,
  new_data   jsonb,
  note       text default ''
);
create index if not exists qc_audit_log_row_idx on public.qc_audit_log (table_name, row_id, at desc);
create index if not exists qc_audit_log_at_idx  on public.qc_audit_log (at desc);
alter table public.qc_audit_log enable row level security;
drop policy if exists qc_audit_log_read on public.qc_audit_log;
create policy qc_audit_log_read on public.qc_audit_log for select to authenticated
  using (public.qc_has_role('Head QC', 'Admin QC', 'QC Supervisor') or public.is_admin());
revoke all on public.qc_audit_log from anon, authenticated;
grant select on public.qc_audit_log to authenticated;
revoke all on sequence public.qc_audit_log_id_seq from anon, authenticated;

-- nobody edits or removes history, not even the table owner by mistake from the SQL Editor
create or replace function public.qc_audit_log_lock()
returns trigger language plpgsql as $$
begin
  raise exception 'qc_audit_log เพิ่มได้อย่างเดียว แก้หรือลบไม่ได้' using errcode = '42501';
end $$;
drop trigger if exists qc_audit_log_lock on public.qc_audit_log;
create trigger qc_audit_log_lock before update or delete on public.qc_audit_log
  for each row execute function public.qc_audit_log_lock();

-- write one entry (also called by the RPCs in 08 with their own action name)
create or replace function public.qc_log(p_table text, p_row text, p_action text, p_old jsonb, p_new jsonb, p_note text default '')
returns void language sql security definer set search_path = public as $$
  insert into public.qc_audit_log (actor, actor_name, table_name, row_id, action, old_data, new_data, note)
  values (auth.uid(), coalesce(public.qc_my_name(), ''), p_table, p_row, p_action, p_old, p_new, coalesce(p_note, ''))
$$;
revoke all on function public.qc_log(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

create or replace function public.qc_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- updated_at/updated_by alone is not a change worth a line
  if tg_op = 'UPDATE' and (o - 'updated_at' - 'updated_by' - 'updatedAt') = (n - 'updated_at' - 'updated_by' - 'updatedAt') then
    return new;
  end if;
  perform public.qc_log(tg_table_name, coalesce(n->>'id', o->>'id'), tg_op, o, n);
  return coalesce(new, old);
end $$;

drop trigger if exists qc_records_audit on public.qc_records;
create trigger qc_records_audit after insert or update or delete on public.qc_records
  for each row execute function public.qc_audit();
drop trigger if exists qc_evidence_audit on public.qc_evidence;
create trigger qc_evidence_audit after insert or update or delete on public.qc_evidence
  for each row execute function public.qc_audit();

-- machines is Service's table and is synced often: log only the QC columns, only for QC machines
create or replace function public.qc_audit_machines()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  f text[] := array['imodeSn', 'factorySn', 'lifecycle', 'customerId', 'model', 'poNo', 'projectNo', 'supplier', 'receivedAt'];
  o jsonb; n jsonb; k text;
begin
  if tg_op = 'INSERT' then
    if new."imodeSn" is null then return new; end if;
    n := (select jsonb_object_agg(x, to_jsonb(new)->x) from unnest(f) x);
    perform public.qc_log('machines', new.id, 'INSERT', null, n);
    return new;
  end if;
  if old."imodeSn" is null and new."imodeSn" is null then return new; end if;
  o := '{}'; n := '{}';
  foreach k in array f loop
    if (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k) then
      o := o || jsonb_build_object(k, to_jsonb(old)->k);
      n := n || jsonb_build_object(k, to_jsonb(new)->k);
    end if;
  end loop;
  if n <> '{}' then perform public.qc_log('machines', new.id, 'UPDATE', o, n); end if;
  return new;
end $$;
drop trigger if exists machines_qc_audit on public.machines;
create trigger machines_qc_audit after insert or update on public.machines
  for each row execute function public.qc_audit_machines();

-- ---------------------------------------------------------------------------------------------
-- 4. no deleting QC history
-- ---------------------------------------------------------------------------------------------
drop policy if exists qc_records_admin_delete on public.qc_records;
revoke delete on public.qc_records from authenticated;

-- is the QC document still open for editing (not sent for approval, not approved, not cancelled)?
-- 08 adds the statuses; until then only Pass counts as closed.
create or replace function public.qc_is_open(p_qc_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status in ('Draft', 'In Progress', 'Fail', 'Returned')
                     from public.qc_records where id = p_qc_id), false)
$$;

drop policy if exists qc_records_staff_insert on public.qc_records;
drop policy if exists qc_records_staff_update on public.qc_records;
create policy qc_records_staff_insert on public.qc_records
  for insert to authenticated with check (public.qc_can_work());
create policy qc_records_staff_update on public.qc_records
  for update to authenticated using (public.qc_can_work()) with check (public.qc_can_work());

-- qc_intake() and other server functions write as the owner and skip RLS: check the person here too
create or replace function public.qc_records_need_worker()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.qc_can_work() then
    raise exception 'ไม่มีสิทธิ์เปิดงาน QC' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists qc_records_need_worker on public.qc_records;
create trigger qc_records_need_worker before insert on public.qc_records
  for each row execute function public.qc_records_need_worker();

drop policy if exists qc_evidence_staff_insert on public.qc_evidence;
drop policy if exists qc_evidence_owner_delete on public.qc_evidence;
create policy qc_evidence_staff_insert on public.qc_evidence
  for insert to authenticated
  with check (public.qc_can_work() and created_by = auth.uid() and public.qc_is_open(qc_id));
create policy qc_evidence_owner_delete on public.qc_evidence
  for delete to authenticated
  using (public.qc_can_work() and created_by = auth.uid() and public.qc_is_open(qc_id));

-- files: the first folder of the path is the QC id (qc.js: '<qc_id>/<kind>-xxxx.ext')
drop policy if exists qc_evidence_files_insert on storage.objects;
drop policy if exists qc_evidence_files_delete on storage.objects;
create policy qc_evidence_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qc-evidence' and public.qc_can_work() and public.qc_is_open((storage.foldername(name))[1]));
create policy qc_evidence_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'qc-evidence' and public.qc_can_work() and owner = auth.uid()
         and public.qc_is_open((storage.foldername(name))[1]));

-- only pictures, clips and PDF in the evidence bucket
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                                  'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']
 where id = 'qc-evidence';

-- ---------------------------------------------------------------------------------------------
-- 5. QC roles cannot be self-granted
-- ---------------------------------------------------------------------------------------------
create or replace function public.qc_guard_profile_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  qc text[] := array['head qc', 'admin qc', 'qc supervisor', 'qc technician', 'r&d technician', 'purchasing', 'stock', 'management'];
  before_r text[] := case when tg_op = 'UPDATE' then array(select unnest(public.qc_roles_of(old)) intersect select unnest(qc)) else '{}' end;
  after_r  text[] := array(select unnest(public.qc_roles_of(new)) intersect select unnest(qc));
begin
  if auth.uid() is null then return new; end if;                 -- SQL Editor / service role
  if before_r @> after_r and after_r @> before_r then return new; end if;
  if not public.is_admin() then
    raise exception 'เปลี่ยนบทบาทสาย QC ได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if new.id = auth.uid() then
    raise exception 'ผู้ดูแลระบบตั้งบทบาทสาย QC ให้ตัวเองไม่ได้' using errcode = '42501';
  end if;
  perform public.qc_log('profiles', new.id::text, 'ROLE_CHANGE',
                        jsonb_build_object('qc_roles', before_r), jsonb_build_object('qc_roles', after_r));
  return new;
end $$;
drop trigger if exists profiles_qc_roles_guard on public.profiles;
create trigger profiles_qc_roles_guard before insert or update on public.profiles
  for each row execute function public.qc_guard_profile_roles();

-- ---------------------------------------------------------------------------------------------
-- 6. IMODE S/N: Head QC only (was: Service admins)
-- ---------------------------------------------------------------------------------------------
create or replace function public.machines_keep_imode_sn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old."imodeSn" is not null and new."imodeSn" is distinct from old."imodeSn"
     and auth.uid() is not null and not public.qc_is_head() then
    raise exception 'IMODE S/N % เปลี่ยนได้เฉพาะ Head QC', old."imodeSn" using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.qc_setting(text)      from public, anon;
revoke all on function public.qc_my_roles()         from public, anon;
revoke all on function public.qc_has_role(text[])   from public, anon;
revoke all on function public.qc_is_head()          from public, anon;
revoke all on function public.qc_can_work()         from public, anon;
revoke all on function public.qc_my_name()          from public, anon;
revoke all on function public.qc_is_open(text)      from public, anon;
grant execute on function public.qc_setting(text)    to authenticated;
grant execute on function public.qc_my_roles()       to authenticated;
grant execute on function public.qc_has_role(text[]) to authenticated;
grant execute on function public.qc_is_head()        to authenticated;
grant execute on function public.qc_can_work()       to authenticated;
grant execute on function public.qc_my_name()        to authenticated;
grant execute on function public.qc_is_open(text)    to authenticated;

commit;

-- Check: every row should say ok
select 'qc_settings'         as item, case when to_regclass('public.qc_settings')  is not null then 'ok' else 'MISSING' end as result
union all select 'qc_audit_log', case when to_regclass('public.qc_audit_log') is not null then 'ok' else 'MISSING' end
union all select 'qc_has_role()', case when to_regprocedure('public.qc_has_role(text[])') is not null then 'ok' else 'MISSING' end
union all select 'no delete on qc_records', case when not exists (select 1 from pg_policies where tablename = 'qc_records' and cmd = 'DELETE') then 'ok' else 'STILL THERE' end
union all select 'roles_enforced', coalesce((select value::text from public.qc_settings where key = 'roles_enforced'), 'MISSING');
