-- ---------------------------------------------------------------------------
-- I-MODE Plus Service & Maintenance — Beta 1.0 Service focus full system
-- 06-v70-case-media.sql   (run once, in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
--
-- A customer reporting a problem from the machine QR page can attach up to four
-- photos or clips. submitPortalIssue() puts them on the case as `c.media`, and
-- they are kept in localStorage — so on the phone that reported the problem they
-- are there.
--
-- They never reached anybody else. cloudUpsertCase() in js/03 writes an explicit
-- column whitelist and `media` is not in it, and service_cases had no column to
-- put it in, so the attachments stopped at the customer's own browser. The
-- coordinator and the technician opened the case and saw no photos at all.
--
-- One column. Same shape as field_status_log, which already carries per-status
-- evidence the same way:
--
--   [{ "name": "...", "type": "image/jpeg", "size": 123456, "data": "data:..." }]
--
-- js/30 shrinks every attachment before it is stored (~420 KB per photo, ~2.5 MB
-- per clip), so a four-file case sits comfortably inside a jsonb value.
--
-- SAFE TO RE-RUN. `add column if not exists` changes nothing on a second run and
-- no existing row is touched — a case with no attachments simply keeps [].
--
-- js/42 probes for this column once per session and, if it is missing, sends the
-- case exactly as before and says so in the console. So running this is what
-- turns the feature on; not running it does not break case sync.
-- ---------------------------------------------------------------------------

alter table public.service_cases
  add column if not exists media jsonb default '[]'::jsonb;

-- The customer's own request row carries the same attachments. Kept in step so
-- the LINE / portal request list can show them too.
alter table public.line_customer_requests
  add column if not exists media jsonb default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Verify — both should return one row saying jsonb.
-- ---------------------------------------------------------------------------
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and column_name  = 'media'
   and table_name in ('service_cases','line_customer_requests')
 order by table_name;
