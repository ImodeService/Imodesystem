-- I-MODE Plus Service & Maintenance
-- 11-client-errors.sql — best-effort browser error inbox for js/93.
--
-- PREPARED FILE: DO NOT RUN FROM AN AGENT. The project owner runs it in Supabase SQL
-- Editor after reviewing it. Run 01-schema.sql first because the admin read/delete policies
-- use public.is_admin(). Safe to run again.
--
-- Anonymous INSERT is intentional: errors can happen before sign-in and the current UAT
-- data client uses the public key. Anonymous users can never SELECT, UPDATE or DELETE rows.

create table if not exists public.client_errors (
  id         text primary key,
  at         timestamptz not null,
  url        text not null default '',
  message    text not null,
  stack      text not null default '',
  "user"     text not null default '',
  ua         text not null default '',
  created_at timestamptz not null default now(),

  constraint client_errors_id_length check (char_length(id) between 8 and 100),
  constraint client_errors_url_length check (char_length(url) <= 1500),
  constraint client_errors_message_length check (char_length(message) between 1 and 1200),
  constraint client_errors_stack_length check (char_length(stack) <= 6000),
  constraint client_errors_user_length check (char_length("user") <= 300),
  constraint client_errors_ua_length check (char_length(ua) <= 500)
);

create index if not exists client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;

revoke all on table public.client_errors from public, anon, authenticated;
grant insert on table public.client_errors to anon, authenticated;
grant select, delete on table public.client_errors to authenticated;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to anon, authenticated
  with check (true);

drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors
  for select to authenticated
  using (public.is_admin());

drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors
  for delete to authenticated
  using (public.is_admin());

-- No UPDATE policy: a received error is immutable through the Data API.

select schemaname, tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename = 'client_errors'
 order by policyname;
