-- =====================================================================
-- next/supabase/04-notifications.sql  (2026-11-22)
-- แจ้งเตือนที่ใช้งานได้จริง: แจ้งรายคน เด้งขึ้นทันที (realtime) กดแล้วเปิดเคส
--   ตาราง app_notifications (1 แถว = 1 คน 1 เรื่อง) · อ่านแล้ว/ยังไม่อ่าน แยกรายคน
--   ระบบสร้างให้เองจากเหตุการณ์ (trigger) ไม่มีใครเขียนแจ้งเตือนปลอมได้:
--     1) เปิดเคสใหม่        → แอดมิน/หัวหน้า (คนที่มีสิทธิ์ service.edit) + ช่างที่ถูกมอบหมาย
--     2) มอบหมายช่างเพิ่ม    → ช่างคนที่ถูกเพิ่ม
--     3) ย้ายขั้นเคส         → ช่างในเคส + คนเปิดเคส (ย้ายไป Hold แจ้งแอดมินด้วย)
--     4) ข้อความใหม่ในแชทเคส → ช่างในเคส + คนเปิดเคส + คนที่เคยคุยในเคสนั้น
--   คนที่ทำเรื่องนั้นเองไม่ได้รับแจ้งเตือนของตัวเอง
-- ไม่แก้/ลบข้อมูลเดิม รันซ้ำได้ · ต้องรัน 01-foundation ก่อน
-- =====================================================================
begin;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,              -- new_case | assigned | stage | hold | message
  title text not null,
  body text,
  case_id text,
  actor_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists app_notifications_user_idx on public.app_notifications (user_id, created_at desc);
create index if not exists app_notifications_unread_idx on public.app_notifications (user_id) where read_at is null;

alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from anon, authenticated;
grant select, delete on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;
drop policy if exists app_notifications_own_read on public.app_notifications;
create policy app_notifications_own_read on public.app_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists app_notifications_own_update on public.app_notifications;
create policy app_notifications_own_update on public.app_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists app_notifications_own_delete on public.app_notifications;
create policy app_notifications_own_delete on public.app_notifications for delete to authenticated using (user_id = auth.uid());
-- ไม่มี policy insert: แถวใหม่มาจาก trigger ด้านล่างเท่านั้น

-- เด้งขึ้นทันที: ส่งแถวใหม่ผ่าน realtime (เห็นเฉพาะของตัวเองตาม RLS)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_notifications') then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;

-- ---------- ใครควรได้รับ ----------
-- แอดมิน/หัวหน้า: บัญชีที่ใช้งานอยู่ และ role (หรือ role เสริม) มีสิทธิ์ service.edit
create or replace function public.notif_admins()
returns uuid[] language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(array_agg(distinct p.id), '{}')
    from public.profiles p
   where coalesce(p.is_active, true)
     and exists (select 1 from public.app_role_perms r
                  where (r.role = p.role or r.role = any(coalesce(p.extra_roles, '{}')))
                    and r.perm in ('*', 'service.*', 'service.edit'));
$$;

-- ช่างในเคส: assignee เก็บรหัสช่างคั่นด้วย , → บัญชีที่ผูก technician_id นั้น
create or replace function public.notif_techs(p_assignee text)
returns uuid[] language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(array_agg(distinct p.id), '{}')
    from public.profiles p
   where coalesce(p.is_active, true) and p.technician_id is not null
     and p.technician_id = any(string_to_array(replace(coalesce(p_assignee, ''), ' ', ''), ','));
$$;

-- คนเปิดเคส (บันทึกไว้ใน stage_log ข้อแรก)
create or replace function public.notif_opener(p_log jsonb)
returns uuid[] language sql immutable set search_path = public, pg_catalog as $$
  select case when jsonb_typeof(p_log) = 'array' and (p_log->0->>'by') ~ '^[0-9a-f-]{36}$'
              then array[(p_log->0->>'by')::uuid] else '{}'::uuid[] end;
$$;

create or replace function public.notif_stage_name(s text)
returns text language sql immutable as $$
  select case s when 'received' then 'รับเรื่อง' when 'inspect' then 'ตรวจเช็ค' when 'quote' then 'ใบเสนอราคา'
    when 'hold' then 'Hold รอลูกค้าตัดสินใจ' when 'transport' then 'ขนส่ง / รับเครื่อง' when 'repair' then 'กำลังซ่อม'
    when 'return' then 'ส่งคืน' when 'closed' then 'ปิดเคส' else coalesce(s, '-') end;
$$;

-- ส่งให้หลายคน (ข้ามคนที่ทำเอง และบัญชีที่ไม่มีอยู่จริง)
create or replace function public.notif_send(p_users uuid[], p_kind text, p_title text, p_body text, p_case text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_me uuid := auth.uid(); v_name text := public.app_my_name();
begin
  insert into public.app_notifications (user_id, kind, title, body, case_id, actor_name)
  select distinct u, p_kind, p_title, left(p_body, 300), p_case, v_name
    from unnest(coalesce(p_users, '{}')) u
   where u is not null and u is distinct from v_me
     and exists (select 1 from auth.users a where a.id = u);
end $$;

-- ---------- 1-3) เคส ----------
create or replace function public.notif_case_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_head text := coalesce(new.ticket, 'เคส') || ' · ' || coalesce(new.customer, '-');
  v_added text;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_op = 'INSERT' then
    perform public.notif_send(public.notif_admins(), 'new_case', 'เคสใหม่ ' || v_head, new.issue, new.id);
    perform public.notif_send(public.notif_techs(new.assignee), 'assigned', 'คุณได้รับมอบหมายเคส ' || v_head,
      coalesce('นัดหมาย ' || replace(nullif(new.appointment, ''), 'T', ' เวลา '), new.issue), new.id);
    return new;
  end if;

  if new.assignee is distinct from old.assignee then
    select string_agg(t, ',') into v_added
      from unnest(string_to_array(replace(coalesce(new.assignee, ''), ' ', ''), ',')) t
     where t <> '' and not (t = any(string_to_array(replace(coalesce(old.assignee, ''), ' ', ''), ',')));
    if v_added is not null then
      perform public.notif_send(public.notif_techs(v_added), 'assigned', 'คุณได้รับมอบหมายเคส ' || v_head,
        coalesce('นัดหมาย ' || replace(nullif(new.appointment, ''), 'T', ' เวลา '), new.issue), new.id);
    end if;
  end if;

  if new.stage is distinct from old.stage and new.stage is not null then
    perform public.notif_send(public.notif_techs(new.assignee) || public.notif_opener(new.stage_log)
        || case when new.stage = 'hold' then public.notif_admins() else '{}'::uuid[] end,
      case when new.stage = 'hold' then 'hold' else 'stage' end,
      v_head || ' → ' || public.notif_stage_name(new.stage),
      'จาก ' || public.notif_stage_name(old.stage) || ' เป็น ' || public.notif_stage_name(new.stage), new.id);
  end if;
  return new;
exception when others then
  return new;  -- แจ้งเตือนพังต้องไม่ทำให้บันทึกเคสพัง
end $$;

drop trigger if exists notif_case_ins on public.service_cases;
create trigger notif_case_ins after insert on public.service_cases for each row execute function public.notif_case_trg();
drop trigger if exists notif_case_upd on public.service_cases;
create trigger notif_case_upd after update of assignee, stage on public.service_cases for each row execute function public.notif_case_trg();

-- ---------- 4) แชทเคส ----------
create or replace function public.notif_msg_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare c public.service_cases; v_people uuid[];
begin
  select * into c from public.service_cases where id = new.case_id;
  if not found or c.deleted_at is not null then return new; end if;
  select coalesce(array_agg(distinct m.author_id), '{}') into v_people
    from public.case_messages m where m.case_id = new.case_id and m.author_id is not null and m.id <> new.id;
  perform public.notif_send(public.notif_techs(c.assignee) || public.notif_opener(c.stage_log) || v_people,
    'message', 'ข้อความใหม่ ' || coalesce(c.ticket, 'เคส') || ' · ' || coalesce(c.customer, '-'),
    coalesce(new.author_name, '') || ': ' || coalesce(nullif(new.body, ''), '(รูป)'), c.id);
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists notif_msg_ins on public.case_messages;
create trigger notif_msg_ins after insert on public.case_messages for each row execute function public.notif_msg_trg();

-- ฟังก์ชันภายใน: ห้ามเรียกจากหน้าเว็บโดยตรง
revoke all on function public.notif_admins(), public.notif_techs(text), public.notif_send(uuid[], text, text, text, text),
  public.notif_case_trg(), public.notif_msg_trg() from public, anon, authenticated;

commit;

-- ตรวจผล: ต้องได้ตาราง 1 + trigger 3 ตัว และเคสยังครบ
select to_regclass('public.app_notifications') as notif_table;
select tgname from pg_trigger where tgname in ('notif_case_ins', 'notif_case_upd', 'notif_msg_ins') order by 1;
select count(*) as cases_now from public.service_cases;
