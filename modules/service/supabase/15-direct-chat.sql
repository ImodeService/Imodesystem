-- I-MODE System — Service
-- 15-direct-chat.sql — personal (one-to-one) chat between staff (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- 2026-10-20 the team asked for a chat button at the bottom right of the Service app that holds
-- both personal chats and the chats of each case/job (item 6). Case chats already live in
-- public.case_messages (14-case-chat.sql). This file adds the personal side. js/141 is the page.
--
-- One row per message:
--   sender_id     auth.uid() of the sender            } set by the trigger below,
--   sender_name   profiles.full_name of the sender    } so a page cannot post as someone else
--   created_at    server time                         }
--   recipient_id  profiles.id of the person it is for (must be active staff)
--   body          the text (<= 4000 characters)
--   photos        jsonb array of shrunk JPEG data URLs (max 4)
--   read_at       set by the RECIPIENT when they open the conversation
--
-- WHO MAY DO WHAT (RLS)
-- ---------------------
--   read         : only the two people in the conversation, and only staff (public.is_staff())
--   send         : staff, to another active staff account (never to a Customer account)
--   mark as read : only the recipient, and only the read_at column (column grant + trigger)
--   delete       : the sender, their own message
--   anon / Customer accounts : nothing
--   Admins do NOT get to read other people's personal chats.
--
-- SAFE TO RE-RUN: create ... if not exists, policies are dropped before being recreated.
-- Touches no existing table and no existing row.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'public.is_staff() missing — run Service supabase/01-schema.sql first';
  end if;
end $$;

create table if not exists public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid default auth.uid(),
  sender_name  text not null default '',
  recipient_id uuid not null,
  body         text not null default '',
  photos       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint direct_messages_body_len   check (char_length(body) <= 4000),
  constraint direct_messages_photos_arr check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  constraint direct_messages_not_empty  check (char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0),
  constraint direct_messages_not_self   check (sender_id is distinct from recipient_id)
);

create index if not exists direct_messages_recipient_idx on public.direct_messages (recipient_id, created_at);
create index if not exists direct_messages_sender_idx    on public.direct_messages (sender_id, created_at);

-- who and when, set by the server
create or replace function public.direct_messages_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sender_id   := auth.uid();
  new.sender_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    '');
  new.created_at  := now();
  new.read_at     := null;
  return new;
end $$;

drop trigger if exists direct_messages_stamp on public.direct_messages;
create trigger direct_messages_stamp before insert on public.direct_messages
  for each row execute function public.direct_messages_stamp();

-- an update may only set read_at (the column grant below already limits it; this is the backstop)
create or replace function public.direct_messages_read_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.body is distinct from old.body
     or new.photos is distinct from old.photos
     or new.sender_name is distinct from old.sender_name
     or new.created_at is distinct from old.created_at then
    raise exception 'direct_messages: only read_at may change';
  end if;
  return new;
end $$;

drop trigger if exists direct_messages_read_only on public.direct_messages;
create trigger direct_messages_read_only before update on public.direct_messages
  for each row execute function public.direct_messages_read_only();

alter table public.direct_messages enable row level security;

drop policy if exists direct_messages_read   on public.direct_messages;
drop policy if exists direct_messages_send   on public.direct_messages;
drop policy if exists direct_messages_seen   on public.direct_messages;
drop policy if exists direct_messages_delete on public.direct_messages;

create policy direct_messages_read on public.direct_messages
  for select to authenticated
  using (public.is_staff() and (sender_id = auth.uid() or recipient_id = auth.uid()));

create policy direct_messages_send on public.direct_messages
  for insert to authenticated
  with check (
    public.is_staff()
    and exists (select 1 from public.profiles p
                 where p.id = recipient_id and p.is_active and p.role <> 'Customer'));

create policy direct_messages_seen on public.direct_messages
  for update to authenticated
  using (public.is_staff() and recipient_id = auth.uid())
  with check (public.is_staff() and recipient_id = auth.uid());

create policy direct_messages_delete on public.direct_messages
  for delete to authenticated
  using (public.is_staff() and sender_id = auth.uid());

revoke all on public.direct_messages from anon;
revoke all on public.direct_messages from authenticated;
grant select, insert, delete on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;

-- live updates (skipped if Realtime is not set up or already includes it)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages') then
    execute 'alter publication supabase_realtime add table public.direct_messages';
  end if;
end $$;

commit;

-- Verify: one row, rls_on = true, policies = 4
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = 'direct_messages') as policies
  from pg_class c where c.relname = 'direct_messages';
