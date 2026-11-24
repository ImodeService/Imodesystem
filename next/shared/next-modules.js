/* I-MODE System (ระบบใหม่) · รายชื่อโมดุล 16 ตัว
   perm = สิทธิ์ที่ต้องมีถึงจะเห็น (ตาราง app_role_perms ในฐานข้อมูล)
   href ว่าง = ยังไม่ได้ทำในระบบใหม่ (แสดงจาง) ; old = ลิงก์ไปของเดิมระหว่างรอ */
window.NEXT_MODULES = [
  { id: 'dashboard', name: 'Dashboard',          ab: 'DB', color: '#0F7C8C', perm: 'dashboard.view', href: 'next/dashboard/index.html' },
  { id: 'service',   name: 'Service',            ab: 'SV', color: '#3B6FB6', perm: 'service.view',   href: 'next/service/overview.html' },
  { id: 'qc',        name: 'QC',                 ab: 'QC', color: '#2E7D4F', perm: 'qc.view',        href: '', old: 'modules/qc-rnd/index.html' },
  { id: 'demo',      name: 'Demo',               ab: 'DM', color: '#6B4FA0', perm: 'demo.view',      href: '' },
  { id: 'modify',    name: 'Modify',             ab: 'MD', color: '#7A3E6E', perm: 'modify.view',    href: '' },
  { id: 'warranty',  name: 'ประกัน + PM',         ab: 'ปก', color: '#8A5A12', perm: 'warranty.view',  href: '' },
  { id: 'calendar',  name: 'ปฏิทินงาน',            ab: 'ปท', color: '#C2620A', perm: 'calendar.view',  href: 'next/calendar/index.html' },
  { id: 'quote',     name: 'ใบเสนอราคา',           ab: 'บส', color: '#5B4DB1', perm: 'quote.view',     href: 'next/quote/index.html' },
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

/* 2026-11-22: แถบเมนูซ้ายของแต่ละโมดุล (แบบ Service เดิม) · href นับจาก root ของเว็บ
   match = ส่วนของที่อยู่หน้าที่ถือว่าอยู่เมนูนั้น (ทำไฮไลท์) · หน้าที่ยังไม่ได้ทำใหม่ลิงก์ไปหน้าเดิมใน Service
   ไม่มี "หน้างานช่าง": ช่างใช้แอปมือถือเท่านั้น แอดมินไม่ต้องเห็น (เจ้าของ 2026-11-22) */
window.NEXT_SIDE = {
  // 2026-11-24: ใบเสนอราคา (หน้ารายการใหม่ · หน้ากรอกยังเป็น modules/service/quote-*.html)
  quote: [
    { ic: '🧾', label: 'ใบเสนอราคาทั้งหมด', href: 'next/quote/index.html', match: ['/next/quote/$', '/next/quote/index.html$'] },
    { ic: '🛠', label: 'Service', href: 'next/quote/index.html?t=service', match: ['?t=service$', '/quote-service.html'] },
    { ic: '📦', label: 'อะไหล่', href: 'next/quote/index.html?t=parts', match: ['?t=parts$', '/quote-parts.html'] },
    { ic: '🛡', label: 'ประกัน', href: 'next/quote/index.html?t=warranty', match: ['?t=warranty$', '/quote-warranty.html'] },
    { sep: true },
    { ic: '🔧', label: 'Service (เคสงาน)', href: 'next/service/overview.html' }
  ],
  // 2026-11-22 v2: หน้าภาพรวม + หมวดตามขั้นงาน (cnt = ตัวเลขข้างเมนู) + เมนูอื่นครบ
  // 2026-11-23: กลุ่ม "งาน" (พับได้) รวม 4 หมวด + คำขอจากลูกค้า ; ปุ่มอื่นคงไว้ (หน้าที่ยังไม่ทำใหม่เปิดหน้าเดิมแบบหน้าเดียว มีปุ่มกลับ)
  service: [
    { ic: '🏠', label: 'ภาพรวม', href: 'next/service/overview.html', match: ['/next/service/overview.html'] },
    { ic: '📋', label: 'ทั้งหมด (บอร์ด)', href: 'next/service/index.html', match: ['/next/service/$', '/next/service/case.html', '/next/service/new.html'] },
    { ic: '📨', label: 'คำขอจากลูกค้า', href: 'next/service/requests.html', match: ['/next/service/requests.html'] },
    { ic: '🗂️', label: 'งาน', children: [
      { ic: '🆕', label: 'งานใหม่', cnt: 'new', href: 'next/service/index.html?c=new', match: ['/next/service/?c=new$'] },
      { ic: '⏳', label: 'รอลูกค้า', cnt: 'wait', href: 'next/service/index.html?c=wait', match: ['/next/service/?c=wait$'] },
      { ic: '🔧', label: 'กำลังซ่อม', cnt: 'repair', href: 'next/service/index.html?c=repair', match: ['/next/service/?c=repair$'] },
      { ic: '📦', label: 'ส่งคืน', cnt: 'return', href: 'next/service/index.html?c=return', match: ['/next/service/?c=return$'] }
    ] },
    { sep: true },
    { ic: '🧾', label: 'ใบเสนอราคา', href: 'next/quote/index.html' },
    { ic: '👨‍🔧', label: 'ทีมงาน', href: 'modules/service/index.html?page=technicians' },
    { ic: '🔔', label: 'แจ้งเตือน', href: 'next/notifications/index.html', match: ['/next/notifications/'] },
    { ic: '📊', label: 'รายงาน', href: 'modules/service/index.html?page=reports' },
    { ic: '⚙️', label: 'ตั้งค่า', href: 'modules/service/index.html?page=settings' }
  ],
  // Dashboard แยกหน้าตามหมวด (match ลงท้าย $ = ต้องตรงตัว)
  dashboard: [
    { ic: '🏠', label: 'ภาพรวม', href: 'next/dashboard/index.html', match: ['/next/dashboard/$'] },
    { ic: '📋', label: 'งานบริการ', href: 'next/dashboard/cases.html', match: ['/next/dashboard/cases.html'] },
    { ic: '👥', label: 'ทีมงาน', href: 'next/dashboard/team.html', match: ['/next/dashboard/team.html'] },
    { ic: '🧾', label: 'ใบเสนอราคา', href: 'next/dashboard/quotes.html', match: ['/next/dashboard/quotes.html'] },
    { ic: '✅', label: 'QC', href: 'next/dashboard/qc.html', match: ['/next/dashboard/qc.html'] }
  ]
};

/* 2026-11-22 v2: แถบล่างบนมือถือ (เฉพาะโมดุลที่มี) */
window.NEXT_BOTTOM = {
  service: [
    { ic: '🏠', label: 'ภาพรวม', href: 'next/service/overview.html', match: ['/next/service/overview.html'] },
    { ic: '🆕', label: 'งานใหม่', href: 'next/service/index.html?c=new', match: ['/next/service/?c=new$'] },
    { ic: '⏳', label: 'รอลูกค้า', href: 'next/service/index.html?c=wait', match: ['/next/service/?c=wait$'] },
    { ic: '🔧', label: 'ซ่อม', href: 'next/service/index.html?c=repair', match: ['/next/service/?c=repair$'] },
    { ic: '📋', label: 'ทั้งหมด', href: 'next/service/index.html', match: ['/next/service/$', '/next/service/?c=return$'] }
  ]
};
