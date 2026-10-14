# Service (ระบบงานบริการเดิม)

คัดลอกมาจาก `G:\ImodeService-main` (branch `security-fixes`) เมื่อ 2026-10-12 เพื่อใช้เป็นจุดตั้งต้นของโมดูล Service ในระบบใหม่
ยังไม่ได้แก้โค้ดใด ๆ ไฟล์ทั้งหมดเหมือนต้นฉบับ

## เอามาอะไรบ้าง
index.html, service-case-detail.html, sw.js, js/, css/, pages/, auth/, assets/, vendor/, supabase/ (schema และ RLS), tools/ (build และ test), AGENTS.md, CLAUDE.md, .gitignore

## ไม่ได้เอามา
- Data/ และ supabase/imode-seed-*.sql (ข้อมูลลูกค้าจริง)
- production/ (repo แยก มี seed บัญชีพนักงาน)
- app/ (ไฟล์ที่ build แล้ว), docs/, tmp/, logs, .git, .claude
- Andriod_app/, machine-planner/ (คนละโปรเจกต์)

## ข้อควรรู้
- `supabase/03-users.sql` มีรหัสผ่านบัญชีทดสอบ (UAT) อยู่ ห้ามขึ้น GitHub แบบ public
- `tools/production/github.config.json` มี anon key ของ Supabase ซึ่งเปิดเผยได้โดยออกแบบ (RLS เป็นตัวป้องกัน) ห้ามใส่ service_role key
- branch `release-2026-10-10` ที่ยังไม่ merge มีงานที่ไม่อยู่ในชุดนี้ (ย้ายทีม หลายบทบาท ฯลฯ) ถ้าจะใช้ต้องดึงมาเพิ่ม
