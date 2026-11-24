-- I-MODE System · 06 หน้าลูกค้า (QR): เลขงานออกจากฐานข้อมูล (2026-11-25)
-- เดิม: เลขงาน (SRV-วันที่-NNN) มาจากมือถือลูกค้า อาจซ้ำกับเคสที่แอดมินเปิดวันเดียวกัน
-- ใหม่: portal_submit ออกเลขเองแบบเดียวกับ case_create (ล็อกกันซ้ำ) + ใส่ stage 'received'
--       แล้วส่งเลขกลับไปให้หน้าลูกค้าแสดง  ส่วนอื่นเหมือนเดิมทุกบรรทัด
-- รันใน Supabase SQL Editor ได้เลย (รันซ้ำได้) · ไม่แตะข้อมูลเดิม
create or replace function public.portal_submit(p_token text, p_table text, p_row jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  mid  text;
  m    public.machines;
  cust public.customers;
  rid  text := left(coalesce(p_row->>'id', ''), 100);
  media jsonb := coalesce(p_row->'media', '[]'::jsonb);
  v_day text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMMDD');
  v_n int;
  v_ticket text;
begin
  perform imode_private.hit('submit:' || imode_private.client_ip(), 30, interval '1 hour');
  mid := imode_private.machine_for_token(p_token);
  if mid is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if length(rid) < 6 then return jsonb_build_object('ok', false, 'reason', 'bad_id'); end if;
  if rid !~ '^[A-Za-z0-9._:-]{6,100}$' then return jsonb_build_object('ok', false, 'reason', 'bad_id'); end if;
  if coalesce(p_row->>'case_id', '') <> '' and (p_row->>'case_id') !~ '^[A-Za-z0-9._:-]{1,100}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_case');
  end if;
  select * into m from public.machines where id = mid;
  select * into cust from public.customers where id = m."customerId";
  perform imode_private.hit('submit-machine:' || mid, 20, interval '1 hour');

  if jsonb_typeof(media) <> 'array' then media := '[]'::jsonb; end if;
  if jsonb_array_length(media) > 4 or length(media::text) > 8000000 then
    return jsonb_build_object('ok', false, 'reason', 'media_too_large');
  end if;

  if p_table = 'service_cases' then
    if exists (select 1 from public.service_cases where id = rid) then
      return jsonb_build_object('ok', true, 'existed', true,
        'ticket', (select ticket from public.service_cases where id = rid));
    end if;
    perform pg_advisory_xact_lock(hashtext('service_cases_ticket'));
    select coalesce(max(nullif(split_part(ticket, '-', 3), '')::int), 0) + 1 into v_n
      from public.service_cases
     where ticket like 'SRV-' || v_day || '-%' and split_part(ticket, '-', 3) ~ '^[0-9]+$';
    v_ticket := 'SRV-' || v_day || '-' || lpad(v_n::text, 3, '0');
    insert into public.service_cases (
      id, ticket, created_at, updated_at, customer_id, customer, contact, phone, email,
      location, branch, machine_id, machine, model, serial, machine_size, warranty, channel,
      service_type, priority, issue, note, status, assignee, appointment, field_status,
      field_status_log, media, stage, stage_log)
    values (
      rid, v_ticket, imode_private.t(p_row, 'created_at', 40),
      imode_private.t(p_row, 'updated_at', 40), m."customerId", coalesce(cust.name, ''),
      imode_private.t(p_row, 'contact', 200), imode_private.t(p_row, 'phone', 60),
      imode_private.t(p_row, 'email', 200), imode_private.t(p_row, 'location', 1000),
      coalesce(cust.branch, ''), m.id, coalesce(m.name, ''), coalesce(m.model, ''),
      coalesce(m.serial, ''), coalesce(m.size, ''), imode_private.t(p_row, 'warranty', 60),
      'LINE OA', imode_private.t(p_row, 'service_type', 100), imode_private.t(p_row, 'priority', 40),
      imode_private.t(p_row, 'issue', 5000), imode_private.t(p_row, 'note', 5000),
      'เคสใหม่', null, '', '', '[]'::jsonb, media, 'received',
      jsonb_build_array(jsonb_build_object('at', now(), 'from', null, 'to', 'received',
        'by', null, 'by_name', 'ลูกค้า (สแกน QR)', 'note', 'ลูกค้าแจ้งเอง')));
    return jsonb_build_object('ok', true, 'ticket', v_ticket);
  end if;

  if p_table = 'line_customer_requests' then
    if exists (select 1 from public.line_customer_requests where id = rid) then
      return jsonb_build_object('ok', true, 'existed', true);
    end if;
    if coalesce(p_row->>'type', '') not in ('service', 'service_quote', 'warranty_quote', 'warranty_check') then
      return jsonb_build_object('ok', false, 'reason', 'bad_type');
    end if;
    if coalesce(p_row->>'case_id', '') <> '' and exists (
         select 1 from public.service_cases where id = p_row->>'case_id' and machine_id is distinct from m.id) then
      return jsonb_build_object('ok', false, 'reason', 'bad_case');
    end if;
    insert into public.line_customer_requests (
      id, type, status, customer_id, machine_id, case_id, contact, phone, priority, months,
      message, line_user_id, line_display_name, created_at, media)
    values (
      rid, p_row->>'type', 'ใหม่', m."customerId", m.id, nullif(p_row->>'case_id', ''),
      imode_private.t(p_row, 'contact', 200), imode_private.t(p_row, 'phone', 60),
      imode_private.t(p_row, 'priority', 40),
      case when coalesce(p_row->>'months', '') ~ '^[0-9]{1,3}$' then (p_row->>'months')::numeric else null end,
      imode_private.t(p_row, 'message', 5000), imode_private.t(p_row, 'line_user_id', 100),
      imode_private.t(p_row, 'line_display_name', 200), imode_private.t(p_row, 'created_at', 40), media);
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'bad_table');
end $function$;
