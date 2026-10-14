-- I-MODE Plus Service & Maintenance — Beta 1.0
-- 09-v70-realtime-all.sql — every table that carries a status streams to the other devices
--
-- RUN THIS ONE. It supersedes 08-v70-realtime.sql: it publishes the same two tables and the
-- rest besides, and it is safe whether or not 08 was ever run. Running it twice is harmless.
--
-- WHY IT GREW. 08 published service_cases and line_customer_requests. The owner then reported
-- a customer signing a quotation with the office screen never noticing — "ลูกค้าเซ็นใบเสนอราคาแล้ว
-- ส่งแล้วแต่สถานะไม่อัพเดต ... อยากให้สถานะอัพเดตเรียลไทม์ทุกอันเลย". Checked against the live project
-- before changing anything: the quotation really was 'อนุมัติ' in the database with its
-- signature recorded, so the customer's side had worked. What was missing was the stream.
--
-- system_settings matters more than it looks: the customer's signature is NOT on the
-- quotation row. cloudUpsertQuotation() writes an explicit column list, so js/75 keeps the
-- approval in settings.quoteApprovals, and system_settings is the only way it travels.
-- js/85 takes just a whitelist of keys from it and never the configuration — see that file.
--
-- WITHOUT THIS the application still works exactly as it always has; every device catches up
-- on its next reload through syncCloud(). An unpublished table is silent, not an error, which
-- is why the check at the bottom is worth running.
--
-- SECURITY, unchanged and worth repeating: 04-anon-uat.sql left RLS open on this project, so a
-- realtime subscription with the publishable key streams these tables to anyone who asks. Same
-- exposure the REST API already has — but a live feed rather than a query. When RLS comes back,
-- realtime honours it: a subscriber receives only the rows their policies allow.

do $$
declare
  t text;
  wanted text[] := array[
    'service_cases',
    'line_customer_requests',
    'quotations',
    'system_settings',
    'service_reports',
    'machines',
    'customers',
    'machine_warranties',
    'machine_documents',
    'technicians',
    'notifications'
  ];
begin
  foreach t in array wanted loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'published %', t;
    exception
      when duplicate_object then raise notice '% is already published', t;
      when undefined_table  then raise notice '% does not exist — skipped', t;
      when others           then raise notice '%: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- CHECK IT WORKED — the tables above should all be listed:
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
