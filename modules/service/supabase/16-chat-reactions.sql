-- I-MODE System — Service
-- 16-chat-reactions.sql — emoji reactions on chat messages (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- 2026-10-21 item 13: "อยากให้กดอีโมจิได้แบบในแชทเฟส ไอจี". A reaction is a small row of its own
-- instead of a column on the message, because case_messages may not be edited by anyone
-- (14-case-chat.sql) and direct_messages may only change read_at (15-direct-chat.sql).
-- js/138 (case page chat) and js/141 (chat button in the app) read and write it.
--
-- One row per person per emoji per message:
--   message_kind  'case' = public.case_messages, 'dm' = public.direct_messages
--   message_id    the message's id
--   user_id       auth.uid() of the person who reacted     } set by the trigger below,
--   user_name     profiles.full_name of that person        } so a page cannot react as
--   created_at    server time                              } someone else
--   emoji         one of the seven offered (check constraint)
--
-- WHO MAY DO WHAT (RLS)
-- ---------------------
--   read / react : staff (public.is_staff()) who can see the message itself
--                  case chat  -> every staff member (same as case_messages)
--                  personal   -> only the two people in that conversation
--   take back    : the person who reacted, their own reaction only
--   edit         : nobody (take it back and react again)
--   anon / Customer accounts : nothing
--
-- SAFE TO RE-RUN: create ... if not exists, policies are dropped before being recreated.
-- Touches no existing table and no existing row. Needs 14-case-chat.sql and 15-direct-chat.sql.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'public.is_staff() missing — run Service supabase/01-schema.sql first';
  end if;
  if to_regclass('public.case_messages') is null or to_regclass('public.direct_messages') is null then
    raise exception 'case_messages / direct_messages missing — run 14-case-chat.sql and 15-direct-chat.sql first';
  end if;
end $$;

create table if not exists public.chat_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_kind text not null,
  message_id   uuid not null,
  user_id      uuid default auth.uid(),
  user_name    text not null default '',
  emoji        text not null,
  created_at   timestamptz not null default now(),
  constraint chat_reactions_kind  check (message_kind in ('case', 'dm')),
  constraint chat_reactions_emoji check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏', '✅')),
  constraint chat_reactions_once  unique (message_kind, message_id, user_id, emoji)
);

create index if not exists chat_reactions_msg_idx on public.chat_reactions (message_kind, message_id);

-- who and when, set by the server
create or replace function public.chat_reactions_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id   := auth.uid();
  new.user_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    '');
  new.created_at := now();
  return new;
end $$;

drop trigger if exists chat_reactions_stamp on public.chat_reactions;
create trigger chat_reactions_stamp before insert on public.chat_reactions
  for each row execute function public.chat_reactions_stamp();

-- "can this signed-in person see that message?" — the message tables' own RLS answers it,
-- because this function is NOT security definer: it runs as the caller.
create or replace function public.chat_reaction_visible(kind text, mid uuid)
returns boolean language sql stable set search_path = public as $$
  select case kind
    when 'case' then exists (select 1 from public.case_messages m where m.id = mid)
    when 'dm'   then exists (select 1 from public.direct_messages m
                              where m.id = mid and (m.sender_id = auth.uid() or m.recipient_id = auth.uid()))
    else false end
$$;

alter table public.chat_reactions enable row level security;

drop policy if exists chat_reactions_read   on public.chat_reactions;
drop policy if exists chat_reactions_add    on public.chat_reactions;
drop policy if exists chat_reactions_remove on public.chat_reactions;

create policy chat_reactions_read on public.chat_reactions
  for select to authenticated
  using (public.is_staff() and public.chat_reaction_visible(message_kind, message_id));

create policy chat_reactions_add on public.chat_reactions
  for insert to authenticated
  with check (public.is_staff() and public.chat_reaction_visible(message_kind, message_id));

create policy chat_reactions_remove on public.chat_reactions
  for delete to authenticated
  using (public.is_staff() and user_id = auth.uid());

revoke all on public.chat_reactions from anon;
revoke all on public.chat_reactions from authenticated;
grant select, insert, delete on public.chat_reactions to authenticated;
revoke all on function public.chat_reaction_visible(text, uuid) from public, anon;
grant execute on function public.chat_reaction_visible(text, uuid) to authenticated;

-- live updates (skipped if Realtime is not set up or already includes it)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reactions') then
    execute 'alter publication supabase_realtime add table public.chat_reactions';
  end if;
end $$;

commit;

-- Verify: one row, rls_on = true, policies = 3
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = 'chat_reactions') as policies
  from pg_class c where c.relname = 'chat_reactions';
