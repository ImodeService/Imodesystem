# I-MODE System (ระบบใหม่)

โฟลเดอร์นี้คือ **ตัวหลักของระบบใหม่** ตั้งแต่ 12 ต.ค. 2026
ระบบเดิม `G:\ImodeService-main` ยังใช้งานจริงอยู่และเก็บไว้เป็นต้นแบบ จนกว่าแต่ละโมดูลในนี้จะใช้แทนได้

## แนวคิด
- ใช้ Odoo เป็นแบบอย่างหน้าตาและการจัดโมดูล (ไม่ได้ติดตั้ง Odoo)
- หน้า Login → หน้าเลือกโมดูล (ไอคอนแบบ Odoo, โลโก้ I-MODE ตรงกลาง) → เข้าโมดูล
- บัญชีเดียวใช้ได้ทุกโมดูล สิทธิ์ตาม แผนก + ระดับ + โมดูลที่เปิดให้ (ล็อกที่ฐานข้อมูล)
- โดเมนใหม่: `imodeservice.com` (หน้าลูกค้า) และ `app.imodeservice.com` (พนักงาน)

## โครงสร้าง
| โฟลเดอร์ | ใช้ทำอะไร |
|---|---|
| `apps/launcher/` | หน้า Login + หน้าเลือกโมดูล |
| `modules/dashboard/` | แดชบอร์ดภาพรวม / แยกแผนก |
| `modules/service/` | เคสซ่อม งานช่าง ใบเสนอราคา (ย้ายจากระบบเดิม) |
| `modules/qc-installation/` | QC เครื่อง การติดตั้ง ส่งมอบ |
| `modules/inventory/` | สต๊อกอะไหล่ เบิก/คืน สั่งซื้อ |
| `modules/installation-planner/` | วางผังเครื่อง แผนติดตั้ง (ต้นทางคือ `machine-planner`) |
| `modules/meeting/` | แอพประชุม (ต้นทางคือ `G:\MEETING APP IMODE`) |
| `modules/accounts/` | บัญชีพนักงานและสิทธิ์ |
| `shared/` | ของที่ทุกโมดูลใช้ร่วม: ล็อกอิน, สี/ฟอนต์, ชิ้นส่วนหน้าจอ |
| `assets/brand/` | โลโก้ I-MODE |
| `docs/` | แผนงานและบันทึกการตัดสินใจ |

## ลำดับการทำ
1. โครงกลาง: Login, หน้าเลือกโมดูล, ระบบบัญชีและสิทธิ์
2. Service (ย้ายจากระบบเดิม)
3. Dashboard, QC & Installation, Inventory, Installation Planner
4. แอพประชุม

## อ้างอิง
- หน้าตัวอย่าง: https://claude.ai/artifact/3mAjy91mSYfeBoQwXZWTfo
- เอกสารเทียบ Odoo: https://claude.ai/code/artifact/bc7723f0-eee8-4087-9111-eafb09789eae
