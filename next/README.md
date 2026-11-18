# next/ · I-MODE System ระบบใหม่ (เฟส 2 ฐานระบบ)

สร้างแยกข้างระบบเดิม ใช้ฐานข้อมูลเดียวกัน (เพิ่มอย่างเดียว) ระบบเดิมใช้งานต่อได้ตามปกติ
ทดสอบที่ GitHub Pages: `/next/trash/index.html` (ต้องเข้าสู่ระบบด้วยบัญชีพนักงานก่อน)

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `supabase/01-foundation.sql` | สิทธิ์ตาม Roles (`app_role_perms`, `app_can`), ถังขยะ (`app_soft_delete`, `app_restore`, `app_trash`, `app_trash_purge` 30 วัน ไม่ลบเคส Service), ขั้นเคสแบบลาก + Hold (`service_cases.stage`, `case_move_stage`), ประวัติ I-MODE S/N (`machine_sn_history`) |
| `shared/next.css` | ธีมสว่าง/มืด, ปุ่ม (แก้ไข=ส้ม, อนุมัติ=เขียว), skeleton shimmer |
| `shared/next-shell.js` | แถบบน + ปุ่มสลับธีม + ปุ่ม 9 จุด (รายการโปรด) + เช็คสิทธิ์ |
| `shared/next-modules.js` | รายชื่อ 16 โมดุล + ถังขยะ และสิทธิ์ที่ต้องมี |
| `trash/index.html` | หน้าถังขยะ (หน้าแรกที่ใช้ฐานใหม่) |

ใช้ของเดิมร่วม: `shared/vendor/supabase.min.js`, `shared/config.js`, `shared/auth.js`, หน้า Login/เลือกโมดุล `apps/launcher/`
สิทธิ์: Dev/CEO/Admin = ทุกอย่าง ที่เหลือดูตาราง `app_role_perms` (แก้ได้ภายหลังในหน้าตั้งค่า)
ไม่มี Head QC แล้ว: ใครมีสิทธิ์ `qc.*` แก้/อนุมัติ QC ได้
