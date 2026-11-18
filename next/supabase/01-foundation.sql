-- =====================================================================
-- I-MODE System (ระบบใหม่) · เฟส 2 ฐานระบบ · 01-foundation.sql
-- เพิ่มอย่างเดียว ไม่ลบ/ไม่แก้ข้อมูลเดิม รันซ้ำได้
--   1) สิทธิ์ตาม Roles (app_role_perms, app_can)
--   2) ถังขยะ (deleted_at ... + app_soft_delete / app_restore / app_trash / app_trash_purge 30 วัน)
--   3) ขั้นตอนเคสใหม่แบบลากคอลัมน์ + Hold (service_cases.stage ...)
--   4) ประวัติ I-MODE S/N (machine_sn_history)
-- ระบบเดิมไม่อ่านคอลัมน์ใหม่เหล่านี้ จึงใช้งานต่อได้ตามปกติ
-- =====================================================================

-- ---------- 1) Roles / permissions ----------
create table if not exists public.app_role_perms (
  role  text not null,
  perm  text not null,          -- เช่น 'service.view', 'qc.*', '*'
  primary key (role, perm)
);
alter table public.app_role_perms enable row level security;

insert into public.app_role_perms (role, perm) values
  ('Dev','*'), ('CEO','*'), ('Admin','*'),
  ('Service Manager','service.*'), ('Service Manager','quote.*'), ('Service Manager','calendar.*'),
  ('Service Manager','customer.*'), ('Service Manager','machine.*'), ('Service Manager','warranty.*'),
  ('Service Manager','dashboard.view'), ('Service Manager','qc.view'),
  ('Sale / Admin','service.view'), ('Sale / Admin','service.edit'), ('Sale / Admin','quote.*'),
  ('Sale / Admin','calendar.view'), ('Sale / Admin','customer.*'), ('Sale / Admin','machine.view'),
  ('Technical Lead','service.view'), ('Technical Lead','service.edit'), ('Technical Lead','calendar.*'),
  ('Technical Lead','machine.*'), ('Technical Lead','qc.*'),
  ('R&D Lead','qc.*'), ('R&D Lead','machine.*'), ('R&D Lead','demo.*'), ('R&D Lead','modify.*'),
  ('Technician','service.view'), ('Technician','calendar.view')
on conflict do nothing;

create or replace function public.app_my_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_remove(array[p.role] || coalesce(p.extra_roles, '{}'::text[]), null), '{}')
    from public.profiles p
   where p.id = auth.uid() and coalesce(p.is_active, true)
$$;

create or replace function public.app_can(p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_role_perms rp
     where rp.role = any(coalesce(public.app_my_roles(), '{}'))
       and (rp.perm = '*' or rp.perm = p_perm or rp.perm = split_part(p_perm, '.', 1) || '.*')
  )
$$;

drop policy if exists app_role_perms_read on public.app_role_perms;
create policy app_role_perms_read on public.app_role_perms for select to authenticated using (true);
drop policy if exists app_role_perms_admin on public.app_role_perms;
create policy app_role_perms_admin on public.app_role_perms for all to authenticated
  using (public.app_can('settings.roles')) with check (public.app_can('settings.roles'));

-- ---------- 2) Trash ----------
do $$
declare t text;
begin
  foreach t in array array['service_cases','quotations','qc_records','machines','customers'] loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_by uuid', t);
    execute format('alter table public.%I add column if not exists deleted_by_name text', t);
    execute format('alter table public.%I add column if not exists deleted_reason text', t);
    execute format('create index if not exists %I on public.%I (deleted_at) where deleted_at is not null', t || '_deleted_idx', t);
  end loop;
end $$;

-- which table belongs to which module (for permission names and the trash page)
create or replace function public.app_trash_module(p_table text)
returns text language sql immutable set search_path = public as $$
  select case p_table
    when 'service_cases' then 'service' when 'quotations' then 'quote'
    when 'qc_records' then 'qc' when 'machines' then 'machine' when 'customers' then 'customer'
  end
$$;

create or replace function public.app_my_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), username, '') from public.profiles where id = auth.uid()
$$;

create or replace function public.app_soft_delete(p_table text, p_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m text := public.app_trash_module(p_table); n int;
begin
  if m is null then raise exception 'ตารางนี้ใช้ถังขยะไม่ได้: %', p_table; end if;
  if not public.app_can(m || '.delete') then raise exception 'ไม่มีสิทธิ์ลบ (%)', m || '.delete' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ต้องใส่เหตุผลที่ลบ'; end if;
  execute format('update public.%I set deleted_at = now(), deleted_by = auth.uid(), deleted_by_name = $1, deleted_reason = $2
                   where id = $3 and deleted_at is null', p_table)
    using public.app_my_name(), trim(p_reason), p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'ไม่พบรายการ หรืออยู่ในถังขยะแล้ว'; end if;
end $$;

create or replace function public.app_restore(p_table text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare m text := public.app_trash_module(p_table); n int;
begin
  if m is null then raise exception 'ตารางนี้ใช้ถังขยะไม่ได้: %', p_table; end if;
  if not public.app_can(m || '.delete') then raise exception 'ไม่มีสิทธิ์กู้คืน (%)', m || '.delete' using errcode = '42501'; end if;
  execute format('update public.%I set deleted_at = null, deleted_by = null, deleted_by_name = null, deleted_reason = null
                   where id = $1 and deleted_at is not null', p_table) using p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'ไม่พบรายการในถังขยะ'; end if;
end $$;

-- รายการในถังขยะ เฉพาะโมดุลที่ผู้ใช้มีสิทธิ์ลบ
create or replace function public.app_trash()
returns table (tbl text, module text, id text, title text, deleted_at timestamptz,
               deleted_by_name text, deleted_reason text, purge_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'service_cases', 'service', c.id, coalesce(c.ticket,'') || ' ' || coalesce(c.customer,''), c.deleted_at, c.deleted_by_name, c.deleted_reason, null::timestamptz
      from public.service_cases c where c.deleted_at is not null
    union all
    select 'quotations', 'quote', q.id, coalesce(q.id,'') || ' ' || coalesce(q.customer,''), q.deleted_at, q.deleted_by_name, q.deleted_reason, q.deleted_at + interval '30 days'
      from public.quotations q where q.deleted_at is not null
    union all
    select 'qc_records', 'qc', r.id, coalesce(r.qc_no, r.id), r.deleted_at, r.deleted_by_name, r.deleted_reason, r.deleted_at + interval '30 days'
      from public.qc_records r where r.deleted_at is not null
    union all
    select 'machines', 'machine', m.id, coalesce(m.name,'') || ' ' || coalesce(m."imodeSn", m.serial, ''), m.deleted_at, m.deleted_by_name, m.deleted_reason, m.deleted_at + interval '30 days'
      from public.machines m where m.deleted_at is not null
    union all
    select 'customers', 'customer', cu.id, cu.name, cu.deleted_at, cu.deleted_by_name, cu.deleted_reason, cu.deleted_at + interval '30 days'
      from public.customers cu where cu.deleted_at is not null
  ) x(tbl, module, id, title, deleted_at, deleted_by_name, deleted_reason, purge_at)
  where public.app_can(x.module || '.delete')
  order by x.deleted_at desc
$$;

-- ลบถาวรของที่อยู่ในถังขยะเกิน 30 วัน (ไม่ลบเคส Service อัตโนมัติ)
-- เรียกจาก pg_cron วันละครั้ง หรือแอดมินกดเอง; คืนจำนวนที่ลบ
create or replace function public.app_trash_purge()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; n int; t text;
begin
  if auth.uid() is not null and not public.app_can('settings.trash') then
    raise exception 'ไม่มีสิทธิ์ลบถาวร' using errcode = '42501';
  end if;
  foreach t in array array['quotations','qc_records','machines','customers'] loop
    execute format('delete from public.%I where deleted_at < now() - interval ''30 days''', t);
    get diagnostics n = row_count; total := total + n;
  end loop;
  return total;
end $$;

-- ---------- 3) Case stages (board columns) + Hold ----------
alter table public.service_cases add column if not exists stage text;
alter table public.service_cases add column if not exists stage_before_hold text;
alter table public.service_cases add column if not exists hold_since timestamptz;
alter table public.service_cases add column if not exists stage_log jsonb not null default '[]'::jsonb;

create or replace function public.case_stages()
returns text[] language sql immutable as $$
  select array['received','inspect','quote','hold','transport','repair','return','closed']
$$;

-- ลากการ์ดไปคอลัมน์ไหนก็ได้ (แบบ Odoo) ยกเว้นเคสที่ปิดแล้ว; เข้า Hold จำขั้นเดิมไว้
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
      'at', now(), 'from', old, 'to', p_stage, 'by', auth.uid(), 'by_name', public.app_my_name(), 'note', coalesce(p_note, ''))
  where id = p_case;
end $$;

-- ---------- 4) I-MODE S/N history ----------
create table if not exists public.machine_sn_history (
  id bigint generated always as identity primary key,
  machine_id text not null,
  old_sn text,
  new_sn text,
  how text not null default 'edit',   -- 'auto' | 'edit' | 'clear'
  by_user uuid,
  by_name text,
  at timestamptz not null default now()
);
create index if not exists machine_sn_history_machine_idx on public.machine_sn_history (machine_id, at desc);
alter table public.machine_sn_history enable row level security;
drop policy if exists machine_sn_history_read on public.machine_sn_history;
create policy machine_sn_history_read on public.machine_sn_history for select to authenticated
  using (public.app_can('machine.view') or public.app_can('qc.view'));

create or replace function public.machine_sn_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new."imodeSn", '') is distinct from coalesce(case when tg_op = 'UPDATE' then old."imodeSn" end, '') then
    insert into public.machine_sn_history (machine_id, old_sn, new_sn, how, by_user, by_name)
    values (new.id, case when tg_op = 'UPDATE' then nullif(old."imodeSn", '') end, nullif(new."imodeSn", ''),
            coalesce(nullif(current_setting('imode.sn_how', true), ''), case when coalesce(new."imodeSn",'') = '' then 'clear' else 'edit' end),
            auth.uid(), public.app_my_name());
  end if;
  return new;
end $$;
drop trigger if exists machines_sn_log on public.machines;
create trigger machines_sn_log after insert or update of "imodeSn" on public.machines
  for each row execute function public.machine_sn_log();

-- ---------- lock down: functions callable only by signed-in users ----------
revoke all on function public.app_my_roles(), public.app_can(text), public.app_my_name(),
  public.app_soft_delete(text, text, text), public.app_restore(text, text), public.app_trash(),
  public.app_trash_purge(), public.case_move_stage(text, text, text), public.machine_sn_log()
  from public, anon;
grant execute on function public.app_my_roles(), public.app_can(text), public.app_my_name(),
  public.app_soft_delete(text, text, text), public.app_restore(text, text), public.app_trash(),
  public.app_trash_purge(), public.case_move_stage(text, text, text)
  to authenticated;
revoke all on table public.app_role_perms, public.machine_sn_history from anon;
grant select, insert, update, delete on table public.app_role_perms to authenticated;
grant select on table public.machine_sn_history to authenticated;
