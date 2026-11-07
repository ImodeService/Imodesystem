-- I-MODE System — Service
-- 22-group-chat.sql — staff group chats (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- 2026-11-08 the owner asked for groups in the chat (rules agreed in the project thread):
--   1. any staff member can create a group: a name + members (one by one, or everyone)
--   2. the creator (and admins) add / remove members and rename the group; any member can leave
--   3. only MEMBERS read the messages — an admin who is not a member cannot (like personal chat);
--      customers never see anything
--   4. text + up to 4 photos, @name and @ทุกคน (= every member) tags
-- js/141 (the 💬 button in the Service app) is the page side. Personal chat is 15-direct-chat.sql,
-- case chat is 14-case-chat.sql; neither is touched.
--
-- TABLES
--   chat_groups         id, name, created_by (set by the server), created_at, updated_at
--   chat_group_members  group_id + user_id, added_by, added_at, last_read_at (unread count)
--   group_messages      id, group_id, body, photos, sender_id / sender_name / created_at (server)
--
-- WHO MAY DO WHAT (RLS)
--   groups   see: members, the creator, admins · create: staff · rename: creator, admins
--            delete: creator, admins
--   members  see: members of that group, admins · add: creator, admins (active staff only)
--            remove: creator, admins, or yourself (leave) · last_read_at: only your own row
--   messages read / send: members only · delete: the sender, their own message · edit: nobody
--   anon / Customer accounts: nothing
--
-- SAFE TO RE-RUN: create ... if not exists, policies dropped before being recreated.
-- Touches no existing table and no existing row.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_staff() / public.is_admin() missing — run Service supabase/01-schema.sql first';
  end if;
end $$;

-- ------------------------------------------------------------------ tables ---
create table if not exists public.chat_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chat_groups_name_len check (char_length(btrim(name)) between 1 and 80)
);

create table if not exists public.chat_group_members (
  group_id      uuid not null references public.chat_groups(id) on delete cascade,
  user_id       uuid not null,
  added_by      uuid default auth.uid(),
  added_at      timestamptz not null default now(),
  last_read_at  timestamptz,
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user_idx on public.chat_group_members (user_id);

create table if not exists public.group_messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.chat_groups(id) on delete cascade,
  body         text not null default '',
  photos       jsonb not null default '[]'::jsonb,
  sender_id    uuid default auth.uid(),
  sender_name  text not null default '',
  created_at   timestamptz not null default now(),
  constraint group_messages_body_len   check (char_length(body) <= 4000),
  constraint group_messages_photos_arr check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  constraint group_messages_not_empty  check (char_length(btrim(body)) > 0 or jsonb_array_length(photos) > 0)
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at);

-- ----------------------------------------------------------------- helpers ---
-- security definer so the policies below can ask "am I a member" without recursing into RLS
create or replace function public.chat_is_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_group_members m where m.group_id = g and m.user_id = auth.uid())
$$;
create or replace function public.chat_can_manage(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.chat_groups x where x.id = g and x.created_by = auth.uid())
$$;
revoke all on function public.chat_is_member(uuid)  from public, anon;
revoke all on function public.chat_can_manage(uuid) from public, anon;
grant execute on function public.chat_is_member(uuid)  to authenticated;
grant execute on function public.chat_can_manage(uuid) to authenticated;

-- ---------------------------------------------------------------- triggers ---
-- a new group: the server sets who created it, and the creator becomes its first member
create or replace function public.chat_groups_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;      -- the creator never changes
    new.created_at := old.created_at;
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists chat_groups_stamp on public.chat_groups;
create trigger chat_groups_stamp before insert or update on public.chat_groups
  for each row execute function public.chat_groups_stamp();

create or replace function public.chat_groups_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_group_members (group_id, user_id, added_by, last_read_at)
  values (new.id, new.created_by, new.created_by, now())
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists chat_groups_add_creator on public.chat_groups;
create trigger chat_groups_add_creator after insert on public.chat_groups
  for each row execute function public.chat_groups_add_creator();

create or replace function public.chat_group_members_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(auth.uid(), new.added_by);
    new.added_at := now();
  else
    -- only last_read_at may change (the column grant already limits it; this is the backstop)
    if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id
       or new.added_by is distinct from old.added_by or new.added_at is distinct from old.added_at then
      raise exception 'chat_group_members: only last_read_at may change';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists chat_group_members_stamp on public.chat_group_members;
create trigger chat_group_members_stamp before insert or update on public.chat_group_members
  for each row execute function public.chat_group_members_stamp();

create or replace function public.group_messages_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sender_id   := auth.uid();
  new.sender_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    '');
  new.created_at  := now();
  return new;
end $$;
drop trigger if exists group_messages_stamp on public.group_messages;
create trigger group_messages_stamp before insert on public.group_messages
  for each row execute function public.group_messages_stamp();

-- -------------------------------------------------------------------- RLS ---
alter table public.chat_groups        enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.group_messages     enable row level security;

drop policy if exists chat_groups_read   on public.chat_groups;
drop policy if exists chat_groups_create on public.chat_groups;
drop policy if exists chat_groups_rename on public.chat_groups;
drop policy if exists chat_groups_delete on public.chat_groups;
create policy chat_groups_read on public.chat_groups for select to authenticated
  using (public.is_staff() and (public.chat_is_member(id) or created_by = auth.uid() or public.is_admin()));
create policy chat_groups_create on public.chat_groups for insert to authenticated
  with check (public.is_staff());
create policy chat_groups_rename on public.chat_groups for update to authenticated
  using (public.is_staff() and public.chat_can_manage(id))
  with check (public.is_staff() and public.chat_can_manage(id));
create policy chat_groups_delete on public.chat_groups for delete to authenticated
  using (public.is_staff() and public.chat_can_manage(id));

drop policy if exists chat_group_members_read   on public.chat_group_members;
drop policy if exists chat_group_members_add    on public.chat_group_members;
drop policy if exists chat_group_members_remove on public.chat_group_members;
drop policy if exists chat_group_members_seen   on public.chat_group_members;
create policy chat_group_members_read on public.chat_group_members for select to authenticated
  using (public.is_staff() and (public.chat_is_member(group_id) or public.is_admin()));
create policy chat_group_members_add on public.chat_group_members for insert to authenticated
  with check (
    public.is_staff() and public.chat_can_manage(group_id)
    and exists (select 1 from public.profiles p where p.id = user_id and p.is_active and p.role <> 'Customer'));
create policy chat_group_members_remove on public.chat_group_members for delete to authenticated
  using (public.is_staff() and (user_id = auth.uid() or public.chat_can_manage(group_id)));
create policy chat_group_members_seen on public.chat_group_members for update to authenticated
  using (public.is_staff() and user_id = auth.uid())
  with check (public.is_staff() and user_id = auth.uid());

drop policy if exists group_messages_read   on public.group_messages;
drop policy if exists group_messages_send   on public.group_messages;
drop policy if exists group_messages_delete on public.group_messages;
create policy group_messages_read on public.group_messages for select to authenticated
  using (public.is_staff() and public.chat_is_member(group_id));
create policy group_messages_send on public.group_messages for insert to authenticated
  with check (public.is_staff() and public.chat_is_member(group_id));
create policy group_messages_delete on public.group_messages for delete to authenticated
  using (public.is_staff() and sender_id = auth.uid());

revoke all on public.chat_groups, public.chat_group_members, public.group_messages from anon;
revoke all on public.chat_groups, public.chat_group_members, public.group_messages from authenticated;
grant select, insert, delete on public.chat_groups to authenticated;
grant update (name) on public.chat_groups to authenticated;
grant select, insert, delete on public.chat_group_members to authenticated;
grant update (last_read_at) on public.chat_group_members to authenticated;
grant select, insert, delete on public.group_messages to authenticated;

-- live updates (skipped if Realtime is not set up or already includes them)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_messages', 'chat_group_members'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;

-- Verify: three rows, rls_on = true; policies 4 / 4 / 3
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('chat_groups', 'chat_group_members', 'group_messages')
order by c.relname;
