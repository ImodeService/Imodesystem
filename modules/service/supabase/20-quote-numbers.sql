-- I-MODE System — Service
-- 20-quote-numbers.sql — quotation numbers issued by the server (run once in the Supabase SQL Editor)
--
-- WHY (2026-11-07, quote pages split into quote-service / quote-parts / quote-warranty.html)
-- Each quotation type gets its own running number, marked as I-MODE's (owner, 2026-11-07):
--   IM- then QS = Service, QP = Parts, QW = Warranty, then YYMM (Thailand time) and a 3-digit
--   counter that restarts every month:
--     IM-QP2611001, IM-QP2611002 … IM-QS2611001 …
-- Two staff saving at the same moment must never get the same number, so the number is taken
-- from a counter row inside the database (one UPDATE, row-locked) instead of being computed in
-- each browser.
--
-- Until this file is run, js/quote-common.js falls back to computing the number in the browser
-- from the quotations it can see (the old way). The counter below starts from the highest number
-- already in public.quotations, so numbers issued by that fallback are never reused.
--
-- WHO: signed-in staff only (public.is_staff(), from Service 01-schema.sql).
-- SAFE TO RE-RUN. Adds one table and one function; touches no existing table or row.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'public.is_staff() missing — run Service supabase/01-schema.sql first';
  end if;
end $$;

create table if not exists public.quote_counters (
  prefix     text primary key,              -- e.g. IM-QP2611
  last_no    integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.quote_counters enable row level security;
-- no policies: only the function below (security definer) reads or writes it
revoke all on public.quote_counters from anon, authenticated;

create or replace function public.next_quote_no(p_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type   text := upper(coalesce(p_type, ''));
  v_prefix text;
  v_seen   integer;
  v_no     integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_type not in ('QS', 'QP', 'QW') then
    raise exception 'unknown quotation type %', p_type using errcode = '22023';
  end if;

  v_prefix := 'IM-' || v_type || to_char(now() at time zone 'Asia/Bangkok', 'YYMM');

  -- highest number already used for this prefix (also covers numbers issued by the browser fallback)
  select coalesce(max((substring(id from length(v_prefix) + 1))::integer), 0)
    into v_seen
    from public.quotations
   where id ~ ('^' || v_prefix || '[0-9]{3,}$');

  insert into public.quote_counters as c (prefix, last_no, updated_at)
       values (v_prefix, v_seen + 1, now())
  on conflict (prefix) do update
       set last_no = greatest(c.last_no, v_seen) + 1,
           updated_at = now()
  returning last_no into v_no;

  return v_prefix || lpad(v_no::text, 3, '0');
end $$;

revoke all on function public.next_quote_no(text) from public, anon;
grant execute on function public.next_quote_no(text) to authenticated;

commit;

-- check (should return a number like IM-QP2611001 when run as a signed-in staff user;
-- in the SQL editor, which runs as postgres without a staff session, it raises "not allowed")
-- select public.next_quote_no('QP');
