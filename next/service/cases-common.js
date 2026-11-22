/* I-MODE System (ระบบใหม่) · ค่าที่หน้าเคส Service ใช้ร่วมกัน (บอร์ด, รายละเอียดเคส, เปิดเคสใหม่) */
(function () {
  'use strict';
  var STAGES = [
    { id: 'received',  name: 'รับเรื่อง' },
    { id: 'inspect',   name: 'ตรวจเช็ค' },
    { id: 'quote',     name: 'ใบเสนอราคา' },
    { id: 'hold',      name: 'Hold รอลูกค้าตัดสินใจ' },
    { id: 'transport', name: 'ขนส่ง / รับเครื่อง' },
    { id: 'repair',    name: 'กำลังซ่อม' },
    { id: 'return',    name: 'ส่งคืน' },
    { id: 'closed',    name: 'ปิดเคส' }
  ];
  var FLOW = ['received', 'inspect', 'quote', 'transport', 'repair', 'return', 'closed']; // ขั้นปกติ (ไม่รวม hold)
  var NEXT_LABEL = { received: 'ส่งไปตรวจเช็ค', inspect: 'ส่งไปทำใบเสนอราคา', quote: 'ลูกค้ายืนยัน ไปขนส่ง', transport: 'รับเครื่องแล้ว เริ่มซ่อม', repair: 'ซ่อมเสร็จ ส่งคืน', return: 'ปิดเคส' };
  /* เคสที่ยังไม่มี stage (มาจากระบบเดิม) เดาจากสถานะเดิม */
  var FROM_OLD = { 'เคสใหม่': 'received', 'นัดหมายแล้ว': 'inspect', 'กำลังดำเนินการ': 'repair', 'เสร็จสิ้น': 'return', 'ปิดเคส': 'closed' };
  /* ค่า service_type ต้องตรงกับระบบเดิม */
  var TYPES = [
    { id: 'ลูกค้าส่งเครื่องเข้าบริษัท', name: 'Workshop', long: 'Workshop (ส่งเครื่องเข้าซ่อม)' },
    { id: 'เข้าบริการหน้างาน', name: 'Onsite', long: 'Onsite (ช่างไปหน้างาน)' },
    { id: 'ติดตั้งเครื่อง', name: 'ติดตั้ง', long: 'ติดตั้งเครื่อง' }
  ];
  var PRIORITIES = ['ปกติ', 'สูง', 'ด่วนมาก'];
  var CHANNELS = ['LINE OA', 'โทรศัพท์', 'ฝ่ายขาย', 'อีเมล', 'อื่นๆ'];

  function stageOf(c) { return c.stage || FROM_OLD[c.status] || 'received'; }
  function stageName(id) { var s = STAGES.filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; }
  function typeName(t) { var x = TYPES.filter(function (y) { return y.id === t; })[0]; return x ? x.name : (t || '-'); }
  function holdDays(c) { return c.hold_since ? Math.max(0, Math.floor((Date.now() - new Date(c.hold_since)) / 864e5)) : 0; }
  function nextStage(c) { var i = FLOW.indexOf(stageOf(c)); return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null; }
  function unholdStage(c) { return c.stage_before_hold && c.stage_before_hold !== 'hold' ? c.stage_before_hold : 'quote'; }
  /* วันที่แบบไทย เช่น 21 พ.ย. 69 09:00 (รับทั้ง ISO และ 2026-11-21T09:00) */
  function fmtDate(v, withTime) {
    if (!v) return '';
    var d = new Date(v); if (isNaN(d)) return String(v);
    var s = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    if (withTime !== false && /T\d\d:\d\d/.test(String(v))) s += ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return s;
  }
  /* รายชื่อช่าง (assignee ในเคสเก็บเป็นรหัสช่างคั่นด้วย ,) */
  async function loadTechs(sb) {
    var r = await sb.from('technicians').select('id,name,status').order('name');
    return r.error ? [] : (r.data || []);
  }
  function techNames(ids, techs) {
    if (!ids) return '';
    return String(ids).split(',').map(function (id) {
      id = id.trim(); var t = techs.filter(function (x) { return x.id === id; })[0];
      return t ? t.name : id;
    }).filter(Boolean).join(', ');
  }

  window.SvCommon = {
    STAGES: STAGES, FLOW: FLOW, NEXT_LABEL: NEXT_LABEL, FROM_OLD: FROM_OLD, TYPES: TYPES,
    PRIORITIES: PRIORITIES, CHANNELS: CHANNELS,
    stageOf: stageOf, stageName: stageName, typeName: typeName, holdDays: holdDays,
    nextStage: nextStage, unholdStage: unholdStage, fmtDate: fmtDate, loadTechs: loadTechs, techNames: techNames
  };
})();
