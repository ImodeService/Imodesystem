-- I-MODE System — QC & R&D module
-- 09-qc-meeting-fixes.sql — run AFTER 02a..08 in the Supabase SQL Editor. SAFE TO RE-RUN.
--
-- 2026-11-12 QC meeting fixes (owner approved the mockup):
-- 1. qc_records gets
--      received_by  text   ผู้รับเครื่อง (who received the machine into QC)
--      delivered_by text   ผู้ส่งมอบ   (who brought the machine to QC)
--      photo_opts   jsonb  {"factoryPlate": true|false, "imodePlate": true|false}
--                          the two S/N photo switches; both off = checklist item "identity" is dropped
-- 2. qc_gate(): photos are no longer required (owner: "ไม่บังคับเลย").
--    Everything else stays: checklist complete, no Fail, N/A needs a reason, inspector, machine,
--    no open NCR (05), machine has an IMODE S/N.
-- 3. qc_pass(qc_id): status "ผ่าน" chosen in the form.
--      Head QC (incl. admins via 08) who did NOT create or inspect this QC -> passes at once
--      (logged as submit + approve in qc_approvals, same gate as qc_decide);
--      anyone else -> the QC is sent to Head QC (same as qc_submit).
--    Returns {"passed": true|false, "gate": {...}}.

begin;

do $$
begin
  if to_regprocedure('public.qc_submit(text)') is null or to_regclass('public.qc_ncr') is null then
    raise exception 'ต้องรัน 04-qc-approval.sql และ 05-qc-ncr.sql ก่อน';
  end if;
end $$;

-- 1. columns -----------------------------------------------------------------------------------
alter table public.qc_records add column if not exists received_by  text  default '';
alter table public.qc_records add column if not exists delivered_by text  default '';
alter table public.qc_records add column if not exists photo_opts   jsonb default '{}'::jsonb;

-- 2. gate without required photos -----------------------------------------------------------------
create or replace function public.qc_gate(p_qc_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.qc_records;
  probs text[] := '{}';
  n_total int; n_open int; n_fail int; na_missing text; n_ncr int;
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

  select count(*) into n_ncr from public.qc_ncr where qc_id = r.id and status not in ('Closed', 'Cancelled');
  if n_ncr > 0 then probs := probs || ('มี NCR ที่ยังไม่ปิด ' || n_ncr || ' ใบ'); end if;

  select * into m from public.machines where id = r.machine_id;
  if found and m."lifecycle" is not null and coalesce(m."imodeSn", '') = '' then
    probs := probs || 'เครื่องยังไม่มี IMODE S/N'::text;
  end if;

  return jsonb_build_object('ok', coalesce(array_length(probs, 1), 0) = 0, 'problems', to_jsonb(probs));
end $$;

-- 3. "ผ่าน" from the form ----------------------------------------------------------------------------
create or replace function public.qc_pass(p_qc_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.qc_records; g jsonb;
  nm text := coalesce(public.qc_my_name(), '');
  self boolean;
begin
  if not public.qc_can_work() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into r from public.qc_records where id = p_qc_id for update;
  if not found then raise exception 'ไม่พบใบ QC'; end if;
  if r.status not in ('Draft', 'In Progress', 'Returned') then
    raise exception 'ใบ QC % อยู่ในสถานะ "%" ตั้งผ่านไม่ได้', r.qc_no, r.status;
  end if;
  g := public.qc_gate(p_qc_id);
  if not (g->>'ok')::boolean then
    raise exception 'ยังผ่านไม่ได้: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(g->'problems') x);
  end if;

  self := auth.uid() is not distinct from r.created_by
          or (nm <> '' and lower(trim(coalesce(r.inspector, ''))) = lower(trim(nm)));

  update public.qc_records
     set status = 'Pending Approval', submitted_at = now(), submitted_by = auth.uid(), status_note = ''
   where id = p_qc_id;
  insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, gate_snapshot)
  values (p_qc_id, r.revision, 'submit', auth.uid(), nm, g);

  if public.qc_is_head() and not self then
    insert into public.qc_approvals (qc_id, revision, decision, by_user, by_name, comment, gate_snapshot)
    values (p_qc_id, r.revision, 'approve', auth.uid(), nm, 'ผ่านจากฟอร์มตรวจ', g);
    update public.qc_records
       set status = 'Pass', approved_at = now(), approved_by = auth.uid(),
           approver_name = nm, reviewer = coalesce(nullif(nm, ''), reviewer), status_note = ''
     where id = p_qc_id;
    return jsonb_build_object('passed', true, 'gate', g);
  end if;
  return jsonb_build_object('passed', false, 'gate', g);
end $$;

revoke all on function public.qc_pass(text) from public, anon;
grant execute on function public.qc_pass(text) to authenticated;
grant execute on function public.qc_gate(text) to authenticated;

commit;

-- Check: every row should say ok
select 'qc_records.received_by' as item, case when exists (select 1 from information_schema.columns where table_name = 'qc_records' and column_name = 'received_by') then 'ok' else 'MISSING' end as result
union all select 'qc_records.delivered_by', case when exists (select 1 from information_schema.columns where table_name = 'qc_records' and column_name = 'delivered_by') then 'ok' else 'MISSING' end
union all select 'qc_records.photo_opts', case when exists (select 1 from information_schema.columns where table_name = 'qc_records' and column_name = 'photo_opts') then 'ok' else 'MISSING' end
union all select 'gate keeps NCR check', case when position('qc_ncr' in pg_get_functiondef('public.qc_gate(text)'::regprocedure)) > 0 then 'ok' else 'MISSING' end
union all select 'gate: photos not required', case when position('รูปบังคับ' in pg_get_functiondef('public.qc_gate(text)'::regprocedure)) = 0 then 'ok' else 'OLD' end
union all select 'qc_pass()', case when to_regprocedure('public.qc_pass(text)') is not null then 'ok' else 'MISSING' end;
