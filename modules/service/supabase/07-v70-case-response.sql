-- I-MODE Plus Service & Maintenance — Beta 1.0
-- 07-v70-case-response.sql   —  the "ตอบกลับแล้ว" stamp
--
-- WHAT THIS IS FOR
--   A new, unassigned case carries a 30-minute response clock (js/26). Pressing
--   ตอบกลับแล้ว stamps the moment the coordinator answered the customer, which stops the
--   clock. cloudUpsertCase() in js/03 sends an explicit column whitelist, so that stamp
--   needs a column of its own or it never leaves the device that made it.
--
-- SAFE TO RUN, AND SAFE TO RUN TWICE
--   One nullable column. No existing row is touched, no policy changes, no data moves.
--   `if not exists` makes a re-run a no-op.
--
-- IF YOU DO NOT RUN IT
--   Nothing breaks. js/48 probes for the column once per session and, when it is missing,
--   sends the case exactly as it does today — the response stamp simply stays on the
--   device where the button was pressed, so another device keeps showing the countdown.
--
-- RLS
--   Covered by the existing blanket uat_anon_all policy from 04-anon-uat.sql. Nothing to
--   add here. That policy still means anyone with the publishable key can read and write
--   this project — see the header of 04-anon-uat.sql.

alter table public.service_cases
  add column if not exists responded_at timestamptz;

comment on column public.service_cases.responded_at is
  'When the coordinator answered the customer. Set by the ตอบกลับแล้ว button; stops the 30-minute response clock.';

-- Confirm:
--   select id, ticket, status, assignee, created_at, responded_at
--     from public.service_cases
--    order by created_at desc
--    limit 20;
