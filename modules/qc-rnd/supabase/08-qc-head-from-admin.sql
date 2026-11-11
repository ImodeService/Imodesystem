-- I-MODE System — QC & R&D module
-- 08-qc-head-from-admin.sql — run AFTER 03..07 in the Supabase SQL Editor. SAFE TO RE-RUN.
--
-- 2026-11-12 owner: "Head เอาเป็น Admin กับ role สูงๆ ภายในเว็บก็ได้"
-- Admins and senior roles act as Head QC without changing profiles.role (so their Service
-- rights stay as they are). qc_my_roles() adds 'head qc' for them; every Head QC check on the
-- server (qc_is_head / qc_has_role) and in qc.js reads qc_my_roles(), so nothing else changes.
-- Still enforced: nobody approves a QC / NCR plan they inspected, submitted or proposed.
--
-- Senior roles: public.is_admin() plus 'Dev', 'CEO', 'Service Manager', 'Admin', 'Admin / Coordinator'.
-- Turn off later (only real Head QC accounts):
--   update public.qc_settings set value = 'false' where key = 'admins_are_head';

begin;

insert into public.qc_settings (key, value, note) values
  ('admins_are_head', 'true'::jsonb, 'true = แอดมินและบทบาทสูง (Dev, CEO, Service Manager, Admin) อนุมัติแบบ Head QC ได้')
  on conflict (key) do nothing;

create or replace function public.qc_my_roles()
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  p   public.profiles;
  out text[];
begin
  select * into p from public.profiles where id = auth.uid() and is_active;
  if not found then return '{}'::text[]; end if;
  out := public.qc_roles_of(p);
  if coalesce(public.qc_setting('admins_are_head'), 'false'::jsonb) = 'true'::jsonb
     and not ('head qc' = any(out))
     and (out && array['dev', 'ceo', 'service manager', 'admin', 'admin / coordinator'] or public.is_admin()) then
    out := out || array['head qc'];
  end if;
  return out;
end $$;

revoke all on function public.qc_my_roles() from public, anon;
grant execute on function public.qc_my_roles() to authenticated;

commit;

-- check: who counts as Head QC now
select username, full_name, role
  from public.profiles p
 where p.is_active
   and (lower(coalesce(p.role, '')) in ('head qc', 'dev', 'ceo', 'service manager', 'admin', 'admin / coordinator'));
