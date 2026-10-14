-- 2026-09-25 — per-account "read" state for the notification centre (js/123).
--
-- Every notification in the application is DERIVED from shared data (cases, requests,
-- quotations, settings), so every device computes the same list. What was missing is who has
-- read what: it lived nowhere, so a notice could never stop being unread. One row per
-- (account, notice key). Nothing else is stored here.
--
-- Safe to re-run. Until this has been run, js/123 keeps the read state on each device only and
-- says so once in the console — the application works either way.

create table if not exists public.notification_reads (
  id          text primary key,              -- user_key || '|' || notice_key
  user_key    text not null,                 -- the account username
  notice_key  text not null,                 -- e.g. auto_visit_<case id>
  read_at     timestamptz not null default now()
);

create index if not exists notification_reads_user_idx on public.notification_reads (user_key);

alter table public.notification_reads enable row level security;

-- Same UAT posture as 04-anon-uat.sql, and the same caveat: anyone holding the publishable key
-- can read and write this table. Replace with an authenticated policy when 10-production-rls.sql
-- goes in.
drop policy if exists uat_anon_all on public.notification_reads;
create policy uat_anon_all on public.notification_reads
  for all to anon, authenticated using (true) with check (true);

-- Realtime: a notice read on one device is marked read on the others at once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_reads'
  ) then
    alter publication supabase_realtime add table public.notification_reads;
  end if;
end $$;
