-- I-MODE System (ระบบใหม่) · 05 สีประจำ Account สำหรับปฏิทินงาน (2026-11-23)
-- เพิ่มคอลัมน์ profiles.color และฟังก์ชันตั้งสี (ต้องมีสิทธิ์ calendar.edit) · รันซ้ำได้ ไม่กระทบข้อมูลเดิม
alter table public.profiles add column if not exists color text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_color_hex') then
    alter table public.profiles add constraint profiles_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

create or replace function public.account_set_color(p_tech text, p_color text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.app_can('calendar.edit') then raise exception 'ไม่มีสิทธิ์แก้ปฏิทิน'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'รูปแบบสีไม่ถูกต้อง'; end if;
  update public.profiles set color = lower(p_color), updated_at = now() where technician_id = p_tech;
  if not found then raise exception 'ช่างคนนี้ยังไม่มีบัญชีผูกอยู่'; end if;
end $$;
revoke all on function public.account_set_color(text, text) from public, anon;
grant execute on function public.account_set_color(text, text) to authenticated;
