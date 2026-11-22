-- =====================================================================
-- next/supabase/02-security.sql  (2026-11-19)
-- ความปลอดภัย ขั้นที่ 1 ของการปรับทั้งระบบ
--   1) ลบสิทธิ์ทดสอบเก่า uat_anon_all (คนที่ไม่ได้ล็อกอินอ่าน/แก้/ลบได้ 11 ตาราง)
--      ทุกตารางมี staff_all ของพนักงานอยู่แล้ว พนักงานจึงใช้งานได้เหมือนเดิม
--      หน้าลูกค้า (portal) ใช้ฟังก์ชัน portal_open ไม่ได้อ่านตารางตรง จึงไม่กระทบ
--   2) ฟังก์ชัน trigger เรียกตรงจากภายนอกไม่ได้ (trigger ยังทำงานปกติ)
--   3) ล็อก search_path ของฟังก์ชันที่ยังไม่ได้ล็อก
-- รันซ้ำได้ ไม่แตะข้อมูลเคส
-- =====================================================================
begin;

-- 1) ลบ uat_anon_all
do $$
declare t text;
begin
  foreach t in array array['customers','line_customer_requests','machine_documents',
    'machine_warranties','machines','notifications','quotations','service_cases',
    'service_reports','system_settings','technicians']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists uat_anon_all on public.%I', t);
    end if;
  end loop;
end $$;

-- 2) ฟังก์ชัน trigger ทุกตัวใน public: ปิดการเรียกตรง
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 3) search_path
alter function public.case_stages()          set search_path = public, pg_catalog;
alter function public.case_track_new_token() set search_path = public, pg_catalog;
alter function public.qc_audit_log_lock()    set search_path = public, pg_catalog;
alter function public.touch_updated_at()     set search_path = public, pg_catalog;

commit;

-- ตรวจผล: ทุกแถวต้องเป็น 0
select
  (select count(*) from pg_policies where policyname = 'uat_anon_all') as uat_left,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))) as trig_open,
  (select count(*) from public.service_cases) as cases_should_be_15;

-- ถ้าต้องย้อนกลับ (ไม่แนะนำ): สร้าง policy เดิมคืนทีละตาราง เช่น
-- create policy uat_anon_all on public.customers for all to anon, authenticated using (true) with check (true);
