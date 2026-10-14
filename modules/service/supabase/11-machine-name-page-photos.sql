-- Run once on an existing Supabase database before using the two new machine photo fields.
alter table public.machines
  add column if not exists "factoryNamePagePhoto" text,
  add column if not exists "imodeNamePagePhoto" text,
  add column if not exists "createdAt" timestamptz,
  add column if not exists "updatedAt" timestamptz;
