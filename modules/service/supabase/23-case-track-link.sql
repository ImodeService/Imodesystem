-- I-MODE System — Service
-- 23-case-track-link.sql — a private link for the customer to follow ONE case (run once in the Supabase SQL Editor)
--
-- WHY THIS EXISTS
-- ---------------
-- 2026-11-08 the owner chose option A: a case that is not tied to a machine has no QR, so the
-- customer pages (portal_open, keyed by the machine's QR token) cannot show it. Instead staff copy
-- a private link from the case page and send it on LINE; whoever holds the link sees that one case,
-- read-only, without signing in.
--
-- WHAT THE CUSTOMER SEES (case_track_open) — nothing else leaves the database
--   the case number, its status and the technician's field status, when it was opened, the
--   appointment, the status history (time + status only, never who changed it), the machine
--   name / model / serial if there is one, the customer's company name, and the quotations of the
--   case that have been sent (number, date, status, items = name + quantity + selling price,
--   subtotal / VAT / total). Never: the problem notes, internal notes, staff names, phone numbers,
--   costs, the staff chat, photos, other cases.
--
-- HOW THE LINK WORKS
--   case_track_links  case_id → token (64 random hex characters, from two gen_random_uuid()), enabled
--   staff (is_staff) call  case_track_link(case_id, action)
--     'get'     the current link, or none                     → {token, enabled} | null
--     'issue'   make one if there is none, and switch it on   → {token, enabled}
--     'renew'   a new token; the old link stops working       → {token, enabled}
--     'disable' switch the link off (the token is kept)       → {token, enabled:false}
--   anyone with the link calls  case_track_open(token)  → the snapshot above, or null when the token
--   is unknown, switched off, or the case no longer exists.
--   The table itself is closed to every client (RLS on, no policies, no grants); only these two
--   SECURITY DEFINER functions touch it.
--
-- SAFE TO RE-RUN. Adds one table and three functions; changes no existing table or row.

begin;

do $$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'public.is_staff() missing — run Service supabase/01-schema.sql first';
  end if;
  if to_regclass('public.service_cases') is null or to_regclass('public.quotations') is null then
    raise exception 'service_cases / quotations missing — run the Service schema first';
  end if;
end $$;

create table if not exists public.case_track_links (
  case_id     text primary key references public.service_cases(id) on delete cascade,
  token       text not null unique,
  enabled     boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint case_track_links_token_fmt check (token ~ '^[0-9a-f]{64}$')
);
alter table public.case_track_links enable row level security;
revoke all on public.case_track_links from public, anon, authenticated;

create or replace function public.case_track_new_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
revoke all on function public.case_track_new_token() from public, anon, authenticated;

-- staff side
create or replace function public.case_track_link(p_case_id text, p_action text default 'get')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(coalesce(p_action, 'get'));
  v_row    public.case_track_links%rowtype;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_action not in ('get', 'issue', 'renew', 'disable') then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_cases where id = p_case_id) then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  if v_action = 'issue' then
    insert into public.case_track_links (case_id, token) values (p_case_id, public.case_track_new_token())
    on conflict (case_id) do update set enabled = true, updated_at = now();
  elsif v_action = 'renew' then
    insert into public.case_track_links (case_id, token) values (p_case_id, public.case_track_new_token())
    on conflict (case_id) do update set token = excluded.token, enabled = true, updated_at = now();
  elsif v_action = 'disable' then
    update public.case_track_links set enabled = false, updated_at = now() where case_id = p_case_id;
  end if;

  select * into v_row from public.case_track_links where case_id = p_case_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object('token', v_row.token, 'enabled', v_row.enabled, 'updated_at', v_row.updated_at);
end $$;
revoke all on function public.case_track_link(text, text) from public, anon;
grant execute on function public.case_track_link(text, text) to authenticated;

-- customer side: read-only, only the fields listed in the header
create or replace function public.case_track_open(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case  public.service_cases%rowtype;
  v_draft text;
  v_log   jsonb;
  v_quotes jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select c.* into v_case
    from public.case_track_links l join public.service_cases c on c.id = l.case_id
   where l.token = p_token and l.enabled;
  if not found then
    return null;
  end if;

  -- the first quotation status in Settings is the draft one (ร่าง); drafts are not shown
  select coalesce(data -> 'quotationStatuses' ->> 0, 'ร่าง') into v_draft
    from public.system_settings where id = 'main';
  v_draft := coalesce(v_draft, 'ร่าง');

  select coalesce(jsonb_agg(jsonb_build_object('at', e ->> 'at', 'to', e ->> 'to') order by e ->> 'at'), '[]'::jsonb)
    into v_log
    from public.system_settings s,
         jsonb_array_elements(case when jsonb_typeof(s.data -> 'caseStatusLog' -> v_case.id) = 'array'
                                   then s.data -> 'caseStatusLog' -> v_case.id else '[]'::jsonb end) e
   where s.id = 'main' and coalesce(e ->> 'to', '') <> '';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'created_at', q.created_at,
           'status', q.status,
           'subtotal', q.subtotal,
           'vat', q.vat,
           'grand', q.grand,
           -- items: name + quantity, and the selling price only where the quotation stores one
           -- (the newer pages); the cost a part was bought for is never returned
           'items', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'name', p ->> 'name',
                        'qty', p -> 'qty',
                        'price', case when (p ->> 'v') = '2' then p -> 'price' end))), '[]'::jsonb)
                       from jsonb_array_elements(case when jsonb_typeof(q.parts) = 'array' then q.parts else '[]'::jsonb end) p
                      where coalesce(p ->> 'kind', '') <> 'meta' and coalesce(p ->> 'name', '') <> '')
         ) order by q.created_at desc), '[]'::jsonb)
    into v_quotes
    from public.quotations q
   where q.case_id = v_case.id
     and coalesce(q.status, '') not in ('', v_draft, 'ยกเลิก');

  return jsonb_build_object(
    'ticket',       coalesce(nullif(v_case.ticket, ''), v_case.id),
    'customer',     v_case.customer,
    'created_at',   v_case.created_at,
    'status',       v_case.status,
    'field_status', v_case.field_status,
    'service_type', v_case.service_type,
    'appointment',  v_case.appointment,
    'machine',      v_case.machine,
    'model',        v_case.model,
    'serial',       v_case.serial,
    'status_log',   v_log,
    'quotations',   v_quotes
  );
end $$;
revoke all on function public.case_track_open(text) from public;
grant execute on function public.case_track_open(text) to anon, authenticated;

commit;

-- Verify: one row, rls_on = true, policies = 0 (nobody reads the table directly)
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'case_track_links';
