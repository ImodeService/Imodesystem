/* I-MODE System (ระบบใหม่) · รายชื่อโมดุล 16 ตัว
   perm = สิทธิ์ที่ต้องมีถึงจะเห็น (ตาราง app_role_perms ในฐานข้อมูล)
   href ว่าง = ยังไม่ได้ทำในระบบใหม่ (แสดงจาง) ; old = ลิงก์ไปของเดิมระหว่างรอ */
window.NEXT_MODULES = [
  { id: 'dashboard', name: 'Dashboard',          ab: 'DB', color: '#0F7C8C', perm: 'dashboard.view', href: '' },
  { id: 'service',   name: 'Service',            ab: 'SV', color: '#3B6FB6', perm: 'service.view',   href: 'next/service/index.html' },
  { id: 'qc',        name: 'QC',                 ab: 'QC', color: '#2E7D4F', perm: 'qc.view',        href: '', old: 'modules/qc-rnd/index.html' },
  { id: 'demo',      name: 'Demo',               ab: 'DM', color: '#6B4FA0', perm: 'demo.view',      href: '' },
  { id: 'modify',    name: 'Modify',             ab: 'MD', color: '#7A3E6E', perm: 'modify.view',    href: '' },
  { id: 'warranty',  name: 'ประกัน + PM',         ab: 'ปก', color: '#8A5A12', perm: 'warranty.view',  href: '' },
  { id: 'calendar',  name: 'ปฏิทินงาน',            ab: 'ปท', color: '#C2620A', perm: 'calendar.view',  href: '' },
  { id: 'quote',     name: 'ใบเสนอราคา',           ab: 'บส', color: '#5B4DB1', perm: 'quote.view',     href: '' },
  { id: 'docs',      name: 'เอกสารเครื่องจักร',     ab: 'อก', color: '#475569', perm: 'machine.view',   href: '' },
  { id: 'install',   name: 'ติดตั้งเครื่องจักร',     ab: 'ตต', color: '#0B5E6A', perm: 'install.view',   href: '' },
  { id: 'stock',     name: 'สต็อกอะไหล่',          ab: 'สต', color: '#9A4A1C', perm: 'stock.view',     href: '' },
  { id: 'pettycash', name: 'เงินสดย่อย',           ab: 'งส', color: '#2F6B3A', perm: 'cash.view',      href: '' },
  { id: 'customers', name: 'ลูกค้า',               ab: 'ลค', color: '#1F3A68', perm: 'customer.view',  href: '' },
  { id: 'machines',  name: 'เครื่องจักร',           ab: 'คจ', color: '#3A4A63', perm: 'machine.view',   href: '' },
  { id: 'hr',        name: 'บุคลากร',              ab: 'HR', color: '#5A6478', perm: 'hr.view',        href: '', old: 'modules/hr/index.html' },
  { id: 'settings',  name: 'ตั้งค่า',               ab: 'ตค', color: '#6B7280', perm: 'settings.view',  href: '' },
  { id: 'trash',     name: 'ถังขยะ',               ab: 'ขย', color: '#7B8794', perm: '',               href: 'next/trash/index.html' }
];
