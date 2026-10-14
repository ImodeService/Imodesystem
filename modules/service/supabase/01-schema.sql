-- I-MODE Plus Service & Maintenance — V6.8 Service focus
-- 01-schema.sql — tables the login system needs.
--
-- Run this FIRST, in Supabase → SQL Editor, on your own project.
-- It only ADDS objects. It does not touch service_cases, customers, machines,
-- technicians, notifications, system_settings, quotations, machine_warranties,
-- machine_documents, line_customer_requests or service_reports.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- profiles: links a Supabase auth user to a role and to the records this app
-- already has (technicians.id like 'T001', customers.id like 'CUST-0001').
-- This is what joins the four identity sets the application has today.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  full_name     text not null default '',
  -- Must match a role name in the app's Settings → Roles, or 'Customer'.
  -- Current app roles: 'Admin / Coordinator', 'Technician', 'Sales', 'Service Manager'.
  -- Deliberately not a CHECK constraint: roles are editable inside the application.
  role          text not null default 'Technician',
  team          text default '',
  technician_id text,          -- e.g. 'T001'      → app `technicians`
  customer_id   text,          -- e.g. 'CUST-0001' → app `customers`
  photo_url     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_username_idx    on public.profiles (lower(username));
create index if not exists profiles_role_idx        on public.profiles (role);
create index if not exists profiles_customer_id_idx on public.profiles (customer_id);

comment on table  public.profiles is 'Application role and record links for each auth user.';
comment on column public.profiles.technician_id is 'Matches technicians.id in the app (T001, T002, ...).';
comment on column public.profiles.customer_id   is 'Matches customers.id in the app (CUST-0001, ...). Set for Customer accounts only.';

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a user is added in the Supabase dashboard.
-- Set role / technician_id / customer_id in the "User Metadata" box when creating
-- the user, or update the profile row afterwards.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, team, technician_id, customer_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(nullif(new.raw_user_meta_data->>'role',''), 'Technician'),
    coalesce(new.raw_user_meta_data->>'team',''),
    nullif(new.raw_user_meta_data->>'technician_id',''),
    nullif(new.raw_user_meta_data->>'customer_id','')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- auth_audit: sign-in / sign-out trail.
-- The client writes here best-effort; it is append-only for normal users.
-- ---------------------------------------------------------------------------
create table if not exists public.auth_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid references auth.users(id) on delete set null,
  username   text,
  event      text not null,
  ok         boolean,
  reason     text,
  provider   text,
  created_at timestamptz not null default now()
);

create index if not exists auth_audit_at_idx       on public.auth_audit (at desc);
create index if not exists auth_audit_username_idx on public.auth_audit (lower(username));

-- ---------------------------------------------------------------------------
-- Helper functions used by the RLS policies in 02-rls.sql.
--
-- They are SECURITY DEFINER on purpose: a policy on `profiles` that reads
-- `profiles` would recurse forever. These bypass RLS to answer one question.
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.my_customer_id()
returns text language sql stable security definer set search_path = public as $$
  select customer_id from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.my_technician_id()
returns text language sql stable security definer set search_path = public as $$
  select technician_id from public.profiles where id = auth.uid() and is_active
$$;

-- "staff" = any active profile that is not a Customer.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() is not null and public.my_role() <> 'Customer', false)
$$;

create or replace function public.is_customer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'Customer', false)
$$;

-- Roles that may change system settings and user records.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('Service Manager', 'Admin / Coordinator'), false)
$$;

revoke all on function public.my_role()          from public, anon;
revoke all on function public.my_customer_id()   from public, anon;
revoke all on function public.my_technician_id() from public, anon;
revoke all on function public.is_staff()         from public, anon;
revoke all on function public.is_customer()      from public, anon;
revoke all on function public.is_admin()         from public, anon;

grant execute on function public.my_role()          to authenticated;
grant execute on function public.my_customer_id()   to authenticated;
grant execute on function public.my_technician_id() to authenticated;
grant execute on function public.is_staff()         to authenticated;
grant execute on function public.is_customer()      to authenticated;
grant execute on function public.is_admin()         to authenticated;
