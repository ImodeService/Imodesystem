-- I-MODE System — QC & R&D module
-- 02a-rename-old-qc-records.sql — run ONCE, BEFORE 02-qc-core.sql, in the Supabase SQL Editor.
--
-- WHY THIS EXISTS
-- ---------------
-- Service's supabase/05-v70-operational-tables.sql had already made public.qc_records with three
-- columns (id, data jsonb, updated_at). 02-qc-core.sql (and 01) say "create table if not exists",
-- so they skipped creating the real table and then failed on the first column the old one lacks:
--     ERROR: 42703: column "qc_no" does not exist
--
-- WHAT THIS DOES
-- --------------
-- Renames the old table to public.qc_records_old so 02-qc-core.sql can create the real one.
-- Nothing is deleted. It only acts when the table really is the old three-column shape AND holds
-- no rows; if it has rows it stops with an error and changes nothing. If the table is already the
-- new shape, or does not exist, it does nothing. SAFE TO RE-RUN.
--
-- AFTER IT: run 02-qc-core.sql (only that one; it contains everything 01 had).

begin;

do $$
declare
  has_data  boolean;
  has_qc_no boolean;
  n         bigint;
begin
  if to_regclass('public.qc_records') is null then
    raise notice 'public.qc_records does not exist — nothing to rename';
    return;
  end if;

  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'qc_records' and column_name = 'data'),
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'qc_records' and column_name = 'qc_no')
    into has_data, has_qc_no;

  if has_qc_no then
    raise notice 'public.qc_records already has qc_no — it is the new table, nothing to rename';
    return;
  end if;

  if not has_data then
    raise exception 'public.qc_records has neither qc_no nor data — unknown shape, stopping without changes';
  end if;

  execute 'select count(*) from public.qc_records' into n;
  if n > 0 then
    raise exception 'old public.qc_records holds % row(s) — stopping without changes; tell Claude', n;
  end if;

  if to_regclass('public.qc_records_old') is not null then
    raise exception 'public.qc_records_old already exists — stopping without changes';
  end if;

  alter table public.qc_records rename to qc_records_old;
  raise notice 'renamed old public.qc_records (0 rows) to public.qc_records_old';
end $$;

commit;
