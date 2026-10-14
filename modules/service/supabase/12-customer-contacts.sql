-- 12-customer-contacts.sql — 2026-09-24
-- A customer can have many contacts, each with any number of channels
-- (phone / email / LINE / WhatsApp). js/114 writes them as one jsonb array:
--   [{id, name, position, note, channels:[{id, type, value}]}]
-- Until this is run the application keeps working; the contacts simply stay on the device that
-- entered them (js/114 probes for the column once per session).
-- Safe to re-run. Covered by the same RLS policies as the rest of `customers`.

alter table public.customers add column if not exists contacts jsonb;

-- verify
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='customers' and column_name='contacts';
