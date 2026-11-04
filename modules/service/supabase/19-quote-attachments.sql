-- 2026-11-03 แผน Service ข้อ 3: ไฟล์แนบใบเสนอราคา (รูปเครื่อง / เอกสาร)
-- Adds ONE nullable column. Existing rows and existing columns are not touched.
-- Each element: {name, type, size, data (shrunk image / PDF as data URL), by, at}
-- Safe to run twice.
alter table public.quotations
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- check
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'quotations' and column_name = 'attachments';
