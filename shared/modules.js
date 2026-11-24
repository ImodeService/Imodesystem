/* Every module in the platform, in launcher order.
   2026-11-03: `hidden: true` keeps a module out of the launcher until its department starts
   using the system (owner: "เอาโมดูลที่ยังไม่ได้ทำหรือปิดไว้ลบออกไปก่อน"). Delete the flag to bring
   one back; nothing else changes. Paths are from the platform root.
   2026-11-12: owner chose to show HR again; Inventory and unfinished modules stay hidden.
   `href` stays empty until the module exists. Which modules each person sees will come
   from the Accounts module (enforced by RLS). Used by the launcher and the module shell. */
window.IMODE_MODULES = [
  { id: 'dashboard', name: 'แดชบอร์ด', group: 'report', href: 'next/dashboard/index.html',
    icon: '<rect x="8" y="24" width="8" height="16" rx="2" fill="#0b63e5"/><rect x="20" y="14" width="8" height="26" rx="2" fill="#f79009"/><rect x="32" y="8" width="8" height="32" rx="2" fill="#0c225e"/>' },
  /* 2026-11-22: ระบบใหม่ + แยกโมดุลที่เคยอยู่ใน Service ออกมา (ระหว่างทำใหม่ เปิดหน้าเดิมใน Service) */
  { id: 'service', name: 'Service', fullName: 'เคสงานบริการ', group: 'ops', href: 'next/service/overview.html',
    icon: '<path d="M30 8a10 10 0 0 0-9.6 12.8L8 33.2a4 4 0 0 0 5.7 5.7l12.4-12.4A10 10 0 0 0 39 16.6l-6 6-6.4-1.7L24.9 15l6-6A10 10 0 0 0 30 8z" fill="#0b63e5"/><circle cx="11" cy="36" r="2" fill="#fff"/><circle cx="38" cy="36" r="7" fill="#f79009"/>' },
  { id: 'calendar', name: 'ปฏิทินงาน', fullName: 'ปฏิทินและแผนงานช่าง', group: 'ops', href: 'next/calendar/index.html',
    icon: '<rect x="6" y="9" width="36" height="32" rx="5" fill="#f79009"/><rect x="6" y="9" width="36" height="9" rx="4" fill="#c25e00"/><rect x="13" y="5" width="4" height="9" rx="2" fill="#0c225e"/><rect x="31" y="5" width="4" height="9" rx="2" fill="#0c225e"/><rect x="12" y="23" width="7" height="6" rx="1.5" fill="#fff"/><rect x="22" y="23" width="7" height="6" rx="1.5" fill="#fff"/><rect x="12" y="32" width="7" height="5" rx="1.5" fill="#fff"/>' },
  { id: 'quote', name: 'ใบเสนอราคา', fullName: 'ใบเสนอราคา', group: 'ops', href: 'next/quote/index.html',
    icon: '<path d="M11 5h17l10 10v26a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#5b4db1"/><path d="M28 5v10h10" fill="#c9c2ef"/><text x="23" y="35" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">฿</text>' },
  { id: 'customers', name: 'ลูกค้า', fullName: 'รายชื่อลูกค้า', group: 'ops', href: 'next/customers/index.html',
    icon: '<circle cx="18" cy="15" r="7" fill="#0c225e"/><path d="M4 39a14 14 0 0 1 28 0z" fill="#0c225e"/><circle cx="34" cy="18" r="5.5" fill="#0b63e5"/><path d="M28 31a10 10 0 0 1 16 8H31z" fill="#0b63e5"/>' },
  { id: 'machines', name: 'เครื่องจักร', fullName: 'ทะเบียนเครื่องจักร', group: 'ops', href: 'next/machines/index.html',
    icon: '<rect x="5" y="14" width="38" height="22" rx="4" fill="#3a4a63"/><circle cx="17" cy="25" r="6" fill="#f79009"/><circle cx="17" cy="25" r="2.4" fill="#3a4a63"/><rect x="27" y="20" width="11" height="4" rx="2" fill="#fff"/><rect x="27" y="27" width="7" height="4" rx="2" fill="#fff" opacity=".7"/><rect x="9" y="36" width="6" height="5" fill="#3a4a63"/><rect x="33" y="36" width="6" height="5" fill="#3a4a63"/>' },
  { id: 'warranty', name: 'ประกัน + PM', fullName: 'ประกันเครื่องและ PM', group: 'ops', href: 'next/warranty/index.html',
    icon: '<path d="M24 5l16 6v11c0 10-7 17-16 21C15 39 8 32 8 22V11z" fill="#8a5a12"/><path d="M17 23.5l5 5 9-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'machine-docs', name: 'เอกสารเครื่องจักร', fullName: 'เอกสารเครื่องจักร', group: 'ops', href: 'modules/service/index.html?page=documents',
    icon: '<path d="M6 12a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#475569"/><rect x="13" y="20" width="22" height="4" rx="2" fill="#fff"/><rect x="13" y="28" width="14" height="4" rx="2" fill="#fff" opacity=".7"/>' },
  { id: 'spare-parts', name: 'สต๊อกอะไหล่', fullName: 'สต๊อกอะไหล่', group: 'ops', href: 'modules/service/index.html?page=spare-parts',
    icon: '<path d="M24 6l16 9v18l-16 9-16-9V15z" fill="#9a4a1c"/><path d="M8 15l16 9 16-9" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M24 24v18" stroke="#fff" stroke-width="3"/>' },
  { id: 'petty-cash', name: 'เงินสดย่อย', fullName: 'เงินสดย่อย', group: 'org', href: 'modules/service/index.html?page=petty-cash',
    icon: '<rect x="4" y="11" width="40" height="27" rx="5" fill="#2f6b3a"/><circle cx="24" cy="24.5" r="7" fill="#f79009"/><text x="24" y="29" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">฿</text>' },
  { id: 'service-old', hidden: true, name: 'Service เดิม', fullName: 'หน้างานช่าง รายงาน ตั้งค่า (ระบบเดิม)', group: 'ops', href: 'modules/service/index.html',
    icon: '<rect x="8" y="8" width="32" height="32" rx="8" fill="#8a93a3"/><path d="M30 13a7 7 0 0 0-6.7 9L14 31.3a2.8 2.8 0 0 0 4 4l9.3-9.3A7 7 0 0 0 36 19.3l-4.2 4.2-4.5-1.2-1.2-4.5 4.2-4.2A7 7 0 0 0 30 13z" fill="#fff"/>' },
  { id: 'qc', name: 'QC & R&D', fullName: 'ควบคุมคุณภาพและวิจัยพัฒนา', group: 'ops', href: 'modules/qc-rnd/index.html',
    icon: '<rect x="8" y="8" width="32" height="32" rx="7" fill="#12a06a"/><path d="M16 24.5l5.5 5.5L33 18.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'inventory', hidden: true, name: 'Inventory', fullName: 'คลังสินค้าและสต๊อก', group: 'ops', href: 'modules/inventory/index.html',
    icon: '<path d="M24 6l16 9v18l-16 9-16-9V15z" fill="#f79009"/><path d="M8 15l16 9 16-9" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M24 24v18" stroke="#fff" stroke-width="3"/><path d="M24 24l16-9v18l-16 9z" fill="#c25e00"/>' },
  { id: 'planner', hidden: true, name: 'Installation Planner', fullName: 'งานติดตั้งเครื่องจักร', group: 'ops', href: '',
    icon: '<rect x="7" y="9" width="34" height="30" rx="4" fill="#6a4fd6"/><rect x="12" y="15" width="10" height="8" rx="1.5" fill="#fff"/><rect x="26" y="15" width="10" height="18" rx="1.5" fill="#fff" opacity=".85"/><rect x="12" y="27" width="10" height="6" rx="1.5" fill="#f79009"/>' },
  /* 2026-10-21: บุคลากร is its own module (modules/hr), no longer a page inside Service */
  { id: 'hr', name: 'บุคลากร', fullName: 'ทรัพยากรบุคคล', group: 'org', href: 'modules/hr/index.html',
    icon: '<circle cx="17" cy="16" r="7" fill="#c2417a"/><path d="M4 40a13 13 0 0 1 26 0z" fill="#c2417a"/><circle cx="33" cy="18" r="5.5" fill="#f79009"/><path d="M27 31a10 10 0 0 1 17 9H31z" fill="#f79009"/>' },
  { id: 'trash', name: 'ถังขยะ', fullName: 'ของที่ลบ (กู้คืนได้ 30 วัน)', group: 'report', href: 'next/trash/index.html',
    icon: '<path d="M13 15h22l-2 25a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill="#7b8794"/><rect x="9" y="10" width="30" height="5" rx="2.5" fill="#3b4a66"/><rect x="19" y="6" width="10" height="5" rx="2" fill="#3b4a66"/><path d="M20 21v15M28 21v15" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' },
  { id: 'accounts', hidden: true, name: 'บัญชีและสิทธิ์', fullName: 'ตั้งค่าระบบและสิทธิ์', group: 'report', href: '',
    icon: '<circle cx="20" cy="16" r="8" fill="#3b4a66"/><path d="M6 40a14 14 0 0 1 22-11.5V40z" fill="#3b4a66"/><circle cx="35" cy="34" r="9" fill="#0b63e5"/><path d="M31 34l3 3 5-5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'sales', hidden: true, name: 'CRM & Sales', fullName: 'CRM และฝ่ายขาย', group: 'ops', href: '',
    icon: '<circle cx="18" cy="15" r="7" fill="#0b63e5"/><path d="M4 39a14 14 0 0 1 28 0z" fill="#0b63e5"/><circle cx="36" cy="30" r="9" fill="#12a06a"/><path d="M32 30.5l3 3 5-5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'purchase', hidden: true, name: 'จัดซื้อ', fullName: 'จัดซื้อ', group: 'ops', href: '',
    icon: '<path d="M5 9h6l4 20h22l4-14H13" fill="none" stroke="#0c225e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 15h24l-3 11H17z" fill="#f79009"/><circle cx="18" cy="37" r="3.5" fill="#0c225e"/><circle cx="33" cy="37" r="3.5" fill="#0c225e"/>' },
  { id: 'tracking', hidden: true, name: 'ติดตามเครื่องจักร', fullName: 'ติดตามเครื่องจักร', group: 'ops', href: '',
    icon: '<rect x="8" y="6" width="28" height="36" rx="4" fill="#0c225e"/><path d="M14 15h16M14 21h10M14 27h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="35" r="8" fill="#f79009"/><path d="M36 31v4l2.5 2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>' },
  { id: 'logistics', hidden: true, name: 'ขนส่ง', fullName: 'ขนส่งและส่งมอบ', group: 'ops', href: '',
    icon: '<rect x="4" y="12" width="24" height="20" rx="3" fill="#0f8ea3"/><path d="M28 18h8l7 7v7H28z" fill="#0c225e"/><circle cx="13" cy="35" r="5" fill="#f79009"/><circle cx="35" cy="35" r="5" fill="#f79009"/>' },
  { id: 'finance', hidden: true, name: 'การเงิน', fullName: 'บัญชีและการเงิน', group: 'org', href: '',
    icon: '<rect x="4" y="11" width="40" height="27" rx="5" fill="#12a06a"/><rect x="4" y="17" width="40" height="5" fill="#0b6b47"/><rect x="10" y="28" width="12" height="4" rx="2" fill="#fff"/><circle cx="36" cy="30" r="4" fill="#f79009"/>' },
  { id: 'project', hidden: true, name: 'โครงการ', fullName: 'บริหารโครงการ', group: 'org', href: '',
    icon: '<rect x="6" y="8" width="36" height="32" rx="4" fill="#1a3a86"/><rect x="11" y="15" width="18" height="5" rx="2" fill="#f79009"/><rect x="11" y="23" width="26" height="5" rx="2" fill="#fff" opacity=".9"/><rect x="11" y="31" width="13" height="5" rx="2" fill="#fff" opacity=".6"/>' },
  { id: 'documents', hidden: true, name: 'เอกสาร', fullName: 'เอกสารและการอนุมัติ', group: 'org', href: '',
    icon: '<path d="M11 5h17l10 10v26a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#4a5d80"/><path d="M28 5v10h10" fill="#c9d3e6"/><circle cx="34" cy="35" r="9" fill="#12a06a"/><path d="M30 35l3 3 5-5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'meeting', hidden: true, name: 'ประชุม', fullName: 'ประชุม', group: 'org', href: '',
    icon: '<circle cx="17" cy="17" r="7" fill="#0f8ea3"/><path d="M5 38a12 12 0 0 1 24 0z" fill="#0f8ea3"/><circle cx="32" cy="15" r="6" fill="#f79009"/><path d="M24 30a11 11 0 0 1 19 8H30" fill="#f79009"/>' }
];
window.IMODE_MODULE_GROUPS = [
  { id: 'ops', name: 'งานหลัก' },
  { id: 'org', name: 'องค์กรและเอกสาร' },
  { id: 'report', name: 'รายงานและระบบ' }
];
