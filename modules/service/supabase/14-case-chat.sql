-- I-MODE System — Service
-- 14-case-chat.sql — team chat inside a service case (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- 2026-10-16 the team asked for a chat panel on the case page (like Odoo's chatter): staff post
-- updates and photos on a case, messages are grouped by day, each shows the time it was sent, and
-- an open case that nobody has updated for N days raises a reminder. js/138 is the page side.
--
-- One row per message:
--   case_id      service_cases.id (text, no foreign key — the same as every other Service table)
--   body         the text
--   photos       jsonb array of shrunk JPEG data URLs (js/138 shrinks to <= 1280 px, max 4)
--   author_id    auth.uid() of the sender           } set by the trigger below,
--   author_name  profiles.full_name of the sender   } so a page cannot post as someone else
--   created_at   server time                        }
--
-- WHO MAY DO WHAT (RLS)
-- ---------------------
--   read, post   : signed-in staff only (public.is_staff(), from Service 01-schema.sql)
--   delete       : the person who posted it, or an admin (public.is_admin())
--   edit         : nobody (a chat log is not rewritten)
--   anon / Customer accounts : nothing — customers never see this chat
--
-- SAFE TO RE-RUN: create ... if not exists, policies are dropped before being recreated.
-- Touches no existing table and no existing row.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_staff() / public.is_admin() missing — run Service supabase/01-schema.sql first';
  end if;
end $$;

create table if not exists public.case_messages (
  id          uuid primary key default gen_random_uuid(),
  case_id     text not null,
  body        text not null default '',
  photos      jsonb not null default '[]'::jsonb,
  author_id   uuid default auth.uid(),
  author_name text not null default '',
  created_at  timestamptz not null default now(),
  constraint case_messages_body_len   check (char_length(body) <= 4000),
  constraint case_messages_photos_arr check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  constraint case_messages_not_empty  check (char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0)
);

create index if not exists case_messages_case_idx on public.case_messages (case_id, created_at);

-- who and when, set by the server
create or replace function public.case_messages_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id   := auth.uid();
  new.author_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    '');
  new.created_at  := now();
  return new;
end $$;

drop trigger if exists case_messages_stamp on public.case_messages;
create trigger case_messages_stamp before insert on public.case_messages
  for each row execute function public.case_messages_stamp();

alter table public.case_messages enable row level security;

drop policy if exists case_messages_staff_read   on public.case_messages;
drop policy if exists case_messages_staff_insert on public.case_messages;
drop policy if exists case_messages_owner_delete on public.case_messages;

create policy case_messages_staff_read on public.case_messages
  for select to authenticated using (public.is_staff());
create policy case_messages_staff_insert on public.case_messages
  for insert to authenticated with check (public.is_staff());
create policy case_messages_owner_delete on public.case_messages
  for delete to authenticated
  using (public.is_staff() and (author_id = auth.uid() or public.is_admin()));

revoke all on public.case_messages from anon;
revoke all on public.case_messages from authenticated;
grant select, insert, delete on public.case_messages to authenticated;

-- Last message per case, for the "update this case" reminder in the bell. security_invoker
-- makes the view obey the table's RLS (staff only).
create or replace view public.case_message_last with (security_invoker = true) as
  select case_id, max(created_at) as last_at, count(*)::int as messages
    from public.case_messages
   group by case_id;

revoke all on public.case_message_last from anon;
grant select on public.case_message_last to authenticated;

-- live updates on the case page (skipped if Realtime is not set up or already includes it)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'case_messages') then
    execute 'alter publication supabase_realtime add table public.case_messages';
  end if;
end $$;

commit;

-- Verify: one row, rls_on = true, policies = 3
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = 'case_messages') as policies
  from pg_class c where c.relname = 'case_messages';
