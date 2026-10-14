-- I-MODE Plus Service & Maintenance — Beta 1.0
-- 08-v70-realtime.sql — status changes reach the other devices without a reload
--
-- WHAT THIS DOES
--   Adds two tables to Supabase's realtime publication, so Postgres streams every
--   INSERT / UPDATE / DELETE on them to the browsers that have subscribed. js/85 subscribes
--   and applies the row it is handed.
--
--       service_cases            the case status, the assignee, the appointment
--       line_customer_requests   what a customer just sent in
--
-- UNTIL THIS IS RUN the application behaves exactly as it did before: js/85 subscribes,
-- receives nothing, and every device still catches up on the next reload through syncCloud().
-- Nothing breaks either way — there is no error to see, which is why it is worth checking
-- with the query at the bottom after running it.
--
-- SAFE TO RE-RUN. `alter publication ... add table` raises 42710 when the table is already a
-- member, so each one is wrapped and that error is swallowed.
--
-- SECURITY, SAID OUT LOUD ONCE MORE: 04-anon-uat.sql left RLS wide open on this project, so a
-- realtime subscription with the publishable key streams these two tables to anyone who asks.
-- That is the same exposure the REST API already has, not a new one — but it is a live feed
-- rather than a query, so it is worth remembering when RLS is finally turned back on. When it
-- is, realtime honours RLS: a subscriber receives only the rows their policies let them read.

do $$
begin
  alter publication supabase_realtime add table public.service_cases;
exception
  when duplicate_object then raise notice 'service_cases is already published';
  when others then raise notice 'service_cases: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.line_customer_requests;
exception
  when duplicate_object then raise notice 'line_customer_requests is already published';
  when others then raise notice 'line_customer_requests: %', sqlerrm;
end $$;

-- A DELETE only carries the columns of the replica identity. The default is the primary key,
-- which is the id — and the id is all js/85 needs to drop the row locally. Uncomment these
-- only if a future consumer needs the whole deleted row; `full` makes every UPDATE write the
-- old row to the WAL as well, which costs write throughput.
-- alter table public.service_cases replica identity full;
-- alter table public.line_customer_requests replica identity full;

-- CHECK IT WORKED — both tables must appear:
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
