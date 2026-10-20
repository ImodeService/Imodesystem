/* QC & R&D module — machine QC, moved out of Service on 2026-10-16.
   "อยากจะแบ่งโมดุลใน service เอาไปแบ่งในโมดุล QC R&D" → "ลองย้ายดู"

   Same QC as Service had (js/03 + js/04 + js/05): five QC types, the twelve-point checklist
   with รอตรวจ / ผ่าน / ไม่ผ่าน / N/A, findings, corrective action, up to 8 photos or clips,
   and the two-page Thai A4 document. What changed is where it lives:
     - records are in Supabase public.qc_records (supabase/01-qc-records.sql), so every staff
       member sees the same list — Service kept them in one browser's localStorage only;
     - customers, machines and cases are read from the same tables Service uses;
     - QC that a browser still holds from Service can be copied up once (import banner).
   2026-10-20: Service and QC & R&D are separate (two admins); neither links to the other and
   both open from the launcher. Service js/136 hid its QC menu and buttons; this page's sidebar
   leaves Service out. Links still understood: ?new=1&machine=&case=&type=  ?edit=<id>  ?open=<id>

   The Workshop case page (service-case-detail.html) still checks Pre-Delivery QC through the
   localStorage key imode_v66_qc_records, so every load and save here writes a copy of the
   list there without photos (mirror()), and Service js/137 refreshes it on the case page. */
(async function () {
  'use strict';
  var esc = ImodeShell.esc, icon = ImodeShell.icon;
  var LEGACY_KEY = 'imode_v66_qc_records';
  var DOC_LOGO = new URL('../service/assets/imode-document-logo.webp', location.href).href;
  var DOC_CSS = new URL('qc-doc.css', location.href).href;

  var TYPES = ['Incoming Inspection', 'Pre-Delivery QC', 'Post-Service QC', 'Installation Acceptance', 'PM Verification'];
  var TYPE_TH = { 'Incoming Inspection': 'ตรวจรับเข้า', 'Pre-Delivery QC': 'ตรวจก่อนส่งมอบ', 'Post-Service QC': 'ตรวจหลังซ่อม', 'Installation Acceptance': 'ตรวจรับหลังติดตั้ง', 'PM Verification': 'ตรวจยืนยัน PM' };
  var STATUS_TH = { Pending: 'รอตรวจ', Draft: 'รอตรวจ', 'In Progress': 'กำลังตรวจ', Pass: 'ผ่าน', Conditional: 'ผ่านแบบมีเงื่อนไข', Fail: 'ไม่ผ่าน', 'N/A': 'ไม่เกี่ยวข้อง' };
  var STATUS_TONE = { 'รอตรวจ': 'grey', 'กำลังตรวจ': 'orange', 'ผ่าน': 'green', 'ผ่านแบบมีเงื่อนไข': 'orange', 'ไม่ผ่าน': 'red' };
  /* Service js/03 QC_CHECKLIST_MASTER, unchanged */
  var CHECKLIST = [
    { id: 'physical', th: 'ตรวจสภาพภายนอกและความเสียหาย', en: 'Visual condition / damage' },
    { id: 'identity', th: 'ตรวจ Model / Serial / Nameplate', en: 'Model / Serial / Nameplate' },
    { id: 'electrical', th: 'ตรวจ Power / Plug / Breaker / Ground', en: 'Power / Plug / Breaker / Ground' },
    { id: 'safety', th: 'ตรวจระบบ Safety / Interlock / Emergency Stop', en: 'Safety / Interlock / Emergency Stop' },
    { id: 'mechanical', th: 'ตรวจ Mechanical / Movement / Fastener', en: 'Mechanical / Movement / Fastener' },
    { id: 'sensor', th: 'ตรวจ Sensor / Switch / Connector', en: 'Sensor / Switch / Connector' },
    { id: 'function', th: 'Function Test / ทดสอบการทำงานจริง', en: 'Function test' },
    { id: 'alarm', th: 'ตรวจ Alarm / Error Code / Log', en: 'Alarm / Error Code / Log' },
    { id: 'accessory', th: 'ตรวจอุปกรณ์และอะไหล่ประกอบครบถ้วน', en: 'Accessories / supplied parts completeness' },
    { id: 'cleaning', th: 'ตรวจความสะอาดและสภาพก่อนส่งมอบ', en: 'Cleaning / appearance' },
    { id: 'document', th: 'ตรวจ Manual / Drawing / เอกสารที่ต้องส่ง', en: 'Manual / Drawing / documents' },
    { id: 'release', th: 'Final QC Release / อนุมัติปล่อยเครื่อง', en: 'Final QC release' }
  ];
  var MAX_MEDIA = 8, MAX_VIDEO_MB = 4, PHOTO_EDGE = 1600;
  var INTERNAL = 'บริษัท ไอโมด พลัส จำกัด';

  var db = { qc: [], customers: [], machines: [], cases: [], settings: {} };
  var tableMissing = false;
  var list, page;

  /* ---------- helpers ---------- */
  function todayISO() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return 'QC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  function thDate(v) {
    if (!v) return '-';
    try { return new Date(String(v).length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return String(v); }
  }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
  function machineName(m) { return m ? (m.nameTh || m.name || m.model || 'เครื่องจักร') : ''; }
  function stats(q) {
    var a = (q && q.checklist) || [], total = a.length || CHECKLIST.length;
    var done = a.filter(function (x) { return x.result && x.result !== 'Pending'; }).length;
    return { total: total, done: done,
      pass: a.filter(function (x) { return x.result === 'Pass'; }).length,
      fail: a.filter(function (x) { return x.result === 'Fail'; }).length };
  }
  function freshChecklist() { return CHECKLIST.map(function (x) { return { id: x.id, labelTh: x.th, labelEn: x.en, result: 'Pending', remark: '' }; }); }
  function nextNo() {
    var d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), max = 0;
    db.qc.forEach(function (q) { var mt = String(q.qcNo || '').match(/QC-\d{6}-(\d+)/); if (mt) max = Math.max(max, Number(mt[1]) || 0); });
    return 'QC-' + y + m + '-' + String(max + 1).padStart(3, '0');
  }
  function sb() { return ImodeAuth.client(); }

  /* row <-> the object shape Service used (so the document code and the mirror stay the same) */
  function fromRow(r) {
    return { id: r.id, qcNo: r.qc_no, type: r.type, qcDate: r.qc_date || '', status: r.status, customerId: r.customer_id || '',
      machineId: r.machine_id || '', caseId: r.case_id || '', inspector: r.inspector || '', reviewer: r.reviewer || '',
      targetCompany: r.target_company || '', checklist: r.checklist || [], findings: r.findings || '',
      correctiveAction: r.corrective_action || '', note: r.note || '', media: r.media || [],
      createdAt: r.created_at, updatedAt: r.updated_at };
  }
  function toRow(q, source) {
    return { id: q.id, qc_no: q.qcNo, type: TYPES.indexOf(q.type) >= 0 ? q.type : 'Pre-Delivery QC', qc_date: q.qcDate || null,
      status: STATUS_TH[q.status] && q.status !== 'Pending' && q.status !== 'N/A' ? q.status : 'Draft',
      customer_id: q.customerId || null, machine_id: q.machineId || null, case_id: q.caseId || null,
      inspector: q.inspector || '', reviewer: q.reviewer || '', target_company: q.targetCompany || '',
      checklist: q.checklist || [], findings: q.findings || '', corrective_action: q.correctiveAction || '',
      note: q.note || '', media: q.media || [], source: source || 'qc-module' };
  }

  /* copy for the Workshop case page (and anything else in Service still reading localStorage) */
  function mirror() {
    try {
      var old = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') || [];
      var ids = {}; db.qc.forEach(function (q) { ids[q.id] = 1; });
      // keep what only this browser has (Service demo rows, QC not yet moved up); replace the cloud copies
      var keep = old.filter(function (q) { return q && !ids[q.id] && !q.cloud; });
      var lite = db.qc.map(function (q) { var c = Object.assign({}, q); c.media = []; c.mediaCount = (q.media || []).length; c.cloud = true; return c; });
      localStorage.setItem(LEGACY_KEY, JSON.stringify(lite.concat(keep)));
    } catch (e) { console.warn('[qc] mirror', e); }
  }

  /* ---------- data ---------- */
  async function loadAll() {
    var c = sb();
    var res = await Promise.all([
      c.from('qc_records').select('*').order('qc_date', { ascending: false }).order('created_at', { ascending: false }),
      c.from('customers').select('id,name,branch').order('name'),
      c.from('machines').select('id,"customerId",name,"nameTh","nameEn",model,serial'),
      c.from('service_cases').select('id,ticket,status,customer_id,machine_id,service_type'),
      c.from('system_settings').select('data').eq('id', 'main').maybeSingle()
    ]);
    if (res[0].error) {
      tableMissing = /qc_records|relation|does not exist|schema cache/i.test(res[0].error.message || '');
      if (!tableMissing) throw res[0].error;
      db.qc = [];
    } else db.qc = (res[0].data || []).map(fromRow);
    db.customers = res[1].data || [];
    db.machines = (res[2].data || []).map(function (m) { return Object.assign({}, m, { customerId: m.customerId || '' }); });
    db.cases = res[3].data || [];
    db.settings = (res[4].data && res[4].data.data) || {};
    if (res[1].error || res[2].error || res[3].error) console.warn('[qc] lookup tables', res[1].error, res[2].error, res[3].error);
  }

  function rowsForList() {
    return db.qc.map(function (q) {
      var m = byId(db.machines, q.machineId), cu = byId(db.customers, q.customerId), st = stats(q);
      return { id: q.id, qcNo: q.qcNo, date: thDate(q.qcDate), type: TYPE_TH[q.type] || q.type,
        customer: (cu && cu.name) || '', machine: m ? machineName(m) + (m.serial ? ' · S/N ' + m.serial : '') : '',
        inspector: q.inspector, progress: st.done + '/' + st.total, status: STATUS_TH[q.status] || q.status, raw: q };
    });
  }
  function refreshList() { list.setFilter(null); list.setRows(rowsForList()); drawKpis(); }

  /* ---------- page ---------- */
  page = await ImodeShell.start({
    module: 'qc', root: '../../',
    hide: ['service'], // separate admins (2026-10-20): reach Service from the launcher only
    subtitle: 'ใบตรวจ QC เครื่องจักร: ตรวจรับเข้า ก่อนส่งมอบ หลังซ่อม รับหลังติดตั้ง และยืนยัน PM',
    actions: [
      { label: 'ส่งออก CSV', icon: 'download', onClick: function () {
        var n = list.csv('I-MODE_QC_' + todayISO() + '.csv'); page.toast('ส่งออก ' + n + ' รายการแล้ว');
      } },
      { label: 'สร้าง QC', icon: 'plus', primary: true, onClick: function () { openForm(null, {}); } }
    ]
  });

  var notice = document.createElement('div');
  notice.hidden = true;
  page.body.appendChild(notice);
  function say(html) { notice.innerHTML = html || ''; notice.hidden = !html; }
  var kpiHost = document.createElement('div');
  page.body.appendChild(kpiHost);

  var isWaiting = function (r) { return r.raw.status === 'Draft' || r.raw.status === 'In Progress'; };
  var isPass = function (r) { return r.raw.status === 'Pass'; };
  var isProblem = function (r) { return r.raw.status === 'Fail' || r.raw.status === 'Conditional'; };
  var kp = null;
  function drawKpis() {
    var rows = rowsForList(), n = function (f) { return rows.filter(f).length; };
    kpiHost.innerHTML = '';
    kp = ImodeShell.kpis(kpiHost, [
      { label: 'QC ทั้งหมด', value: rows.length, note: 'ทุกประเภท', tone: 'blue', icon: 'list' },
      { label: 'รอตรวจ / กำลังตรวจ', value: n(isWaiting), note: 'ยังไม่สรุปผล', tone: 'orange', icon: 'clock', filter: isWaiting },
      { label: 'ผ่าน', value: n(isPass), note: 'ปล่อยเครื่องได้', tone: 'green', icon: 'check', filter: isPass },
      { label: 'ไม่ผ่าน / มีเงื่อนไข', value: n(isProblem), note: 'ต้องแก้ไขหรือตรวจซ้ำ', tone: 'red', icon: 'alert', filter: isProblem }
    ]);
    if (list) kp.bind(list);
  }

  list = ImodeShell.list(page.body, {
    title: 'รายการ QC เครื่อง', subtitle: 'ค้นหาด้วยเลขที่ QC ลูกค้า เครื่อง S/N หรือผู้ตรวจ แตะรายการเพื่อดูเอกสาร',
    columns: [
      { key: 'qcNo', label: 'เลขที่ QC', isKey: true },
      { key: 'date', label: 'วันที่ตรวจ' },
      { key: 'type', label: 'ประเภท' },
      { key: 'customer', label: 'ลูกค้า' },
      { key: 'machine', label: 'เครื่องจักร' },
      { key: 'inspector', label: 'ผู้ตรวจ' },
      { key: 'progress', label: 'Checklist' },
      { key: 'status', label: 'ผล QC' }
    ],
    rows: [], loading: true, statusKey: 'status', statusTone: STATUS_TONE,
    empty: { title: 'ยังไม่มีใบ QC', text: 'กด "สร้าง QC" เพื่อเริ่มตรวจเครื่องแรก' },
    footNote: 'ข้อมูลจากฐานข้อมูลกลาง เห็นเหมือนกันทุกเครื่อง',
    onRowClick: function (r) { openDoc(r.raw); },
    rowLabel: function (r) { return 'เปิดเอกสาร ' + r.qcNo; }
  });
  drawKpis();

  try { await loadAll(); }
  catch (e) {
    console.error('[qc] load', e);
    say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>โหลดข้อมูล QC ไม่สำเร็จ: ' + esc(e.message || e) + '</span></div>');
  }
  if (tableMissing) {
    say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>ยังไม่ได้สร้างตาราง QC ในฐานข้อมูล ให้ผู้ดูแลรันไฟล์ modules/qc-rnd/supabase/01-qc-records.sql ใน Supabase ก่อน จึงจะบันทึก QC ได้</span></div>');
  }
  refreshList();
  if (!tableMissing) { mirror(); offerImport(); }

  /* ---------- one-time copy of QC this browser still holds from Service ---------- */
  function legacyRecords() {
    try {
      var all = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') || [];
      var have = {}; db.qc.forEach(function (q) { have[q.id] = 1; });
      return all.filter(function (q) { return q && q.id && !q.isDemo && !q.cloud && !have[q.id]; });
    } catch (e) { return []; }
  }
  function offerImport() {
    var pending = legacyRecords();
    if (!pending.length) return;
    say('<div class="sh-banner qc-import" role="note">' + icon('inbox') +
      '<span>เครื่องนี้มีใบ QC เดิมจากโมดูล Service ' + pending.length + ' ใบ ที่ยังไม่อยู่ในฐานข้อมูลกลาง</span>' +
      '<button type="button" class="sh-btn">ย้ายขึ้นฐานข้อมูล</button></div>');
    notice.querySelector('button').addEventListener('click', async function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'กำลังย้าย…';
      var taken = {}; db.qc.forEach(function (q) { taken[q.qcNo] = 1; });
      var rows = pending.map(function (q) {
        var r = toRow(q, 'service-local'), no = r.qc_no || r.id, k = 1;
        while (taken[no]) no = (r.qc_no || r.id) + '-L' + (k++);   // two browsers may both have QC-YYYYMM-001
        taken[no] = 1; r.qc_no = no; return r;
      });
      var r = await sb().from('qc_records').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (r.error) { b.disabled = false; b.textContent = 'ลองอีกครั้ง'; page.toast('ย้ายไม่สำเร็จ: ' + r.error.message); return; }
      await loadAll(); refreshList(); mirror();
      say('');
      page.toast('ย้ายใบ QC ' + rows.length + ' ใบขึ้นฐานข้อมูลแล้ว');
    });
  }

  /* ---------- links into this page (bookmarks; Service no longer sends people here) ---------- */
  function handleLink() {
    var p = new URLSearchParams(location.search);
    var id = p.get('open') || p.get('edit');
    if (id) {
      var q = db.qc.filter(function (x) { return x.id === id || x.qcNo === id; })[0];
      if (!q) { page.toast('ไม่พบใบ QC นี้ในฐานข้อมูล'); }
      else if (p.get('edit')) openForm(q); else openDoc(q);
    } else if (p.get('new')) {
      var preset = { machineId: p.get('machine') || '', caseId: p.get('case') || p.get('caseId') || '', type: p.get('type') || '' };
      var c = preset.caseId ? byId(db.cases, preset.caseId) : null;
      if (c) { preset.machineId = preset.machineId || c.machine_id || ''; preset.customerId = c.customer_id || ''; }
      openForm(null, preset);
    }
    if (id || p.get('new')) history.replaceState(null, '', location.pathname);
  }

  /* ---------- dialog ---------- */
  var dlg = document.createElement('dialog');
  dlg.className = 'qc-dlg';
  dlg.setAttribute('aria-labelledby', 'qcDlgTitle');
  document.body.appendChild(dlg);
  dlg.addEventListener('cancel', function (e) { if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) e.preventDefault(); });
  function show(title, sub, body, foot) {
    dlg.innerHTML = '<div class="qc-dlg-head"><div><h2 id="qcDlgTitle">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button type="button" class="sh-icon-btn" data-close aria-label="ปิด">' + icon('close') + '</button></div>' +
      '<div class="qc-dlg-body">' + body + '</div><div class="qc-dlg-foot">' + foot + '</div>';
    dlg.dataset.dirty = '';
    dlg.querySelector('[data-close]').addEventListener('click', function () {
      if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) return;
      dlg.close();
    });
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.qc-dlg-body').scrollTop = 0;
  }
  function btn(label, attrs, primary) { return '<button type="button" class="sh-btn' + (primary ? ' is-primary' : '') + '" ' + attrs + '>' + esc(label) + '</button>'; }

  /* ---------- form ---------- */
  var draft = null;
  /* old: a saved record to edit; preset: fields for a new one; restore: an unsaved draft coming back from preview */
  function openForm(old, preset, restore) {
    if (tableMissing) { page.toast('ยังบันทึกไม่ได้ ต้องสร้างตาราง QC ในฐานข้อมูลก่อน'); return; }
    old = old || null; preset = preset || {};
    var m0 = byId(db.machines, (old && old.machineId) || preset.machineId);
    draft = restore ? restore : old ? JSON.parse(JSON.stringify(old)) : {
      id: '', qcNo: nextNo(), type: TYPES.indexOf(preset.type) >= 0 ? preset.type : 'Pre-Delivery QC', qcDate: todayISO(), status: 'Draft',
      customerId: preset.customerId || (m0 && m0.customerId) || '', machineId: preset.machineId || '', caseId: preset.caseId || '',
      inspector: page.user.name || page.user.username, reviewer: '', targetCompany: INTERNAL,
      checklist: freshChecklist(), findings: '', correctiveAction: '', note: '', media: []
    };
    if (!draft.checklist || !draft.checklist.length) draft.checklist = freshChecklist();
    var opt = function (v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var body = '<form id="qcForm" class="qc-grid" novalidate>' +
      '<label class="qc-f"><span>เลขที่ QC</span><input id="fNo" value="' + esc(draft.qcNo) + '" readonly></label>' +
      '<label class="qc-f"><span>ประเภท QC <b>*</b></span><select id="fType">' + TYPES.map(function (t) { return opt(t, TYPE_TH[t] + ' (' + t + ')', draft.type === t); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>วันที่ตรวจ <b>*</b></span><input id="fDate" type="date" value="' + esc(draft.qcDate) + '" required></label>' +
      '<label class="qc-f"><span>ลูกค้า <b>*</b></span><select id="fCustomer"><option value="">เลือกลูกค้า</option>' +
        db.customers.map(function (c) { return opt(c.id, c.name + (c.branch ? ' · ' + c.branch : ''), c.id === draft.customerId); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>เครื่องจักร <b>*</b></span><select id="fMachine"></select></label>' +
      '<label class="qc-f"><span>Service Case</span><select id="fCase"></select></label>' +
      '<label class="qc-f"><span>ผู้ตรวจ QC <b>*</b></span><input id="fInspector" value="' + esc(draft.inspector) + '" autocomplete="off"></label>' +
      '<label class="qc-f"><span>ผู้อนุมัติ</span><input id="fReviewer" value="' + esc(draft.reviewer) + '" autocomplete="off"></label>' +
      '<label class="qc-f"><span>ผล QC</span><select id="fStatus">' +
        ['Draft', 'In Progress', 'Pass', 'Conditional', 'Fail'].map(function (s) { return opt(s, STATUS_TH[s], draft.status === s); }).join('') + '</select></label>' +
      '<label class="qc-f full"><span>QC เพื่อส่งให้บริษัท</span><input id="fTarget" value="' + esc(draft.targetCompany) + '" placeholder="เช่น ' + INTERNAL + '"></label>' +
      '<div class="qc-sec"><i>1</i> หน้า 1: รายการตรวจสอบ</div>' +
      '<div class="qc-f full"><div class="qc-sum" id="fSum" aria-live="polite"></div><div class="qc-checks" id="fChecks"></div></div>' +
      '<div class="qc-sec"><i>2</i> หน้า 2: สิ่งที่พบและรูปประกอบ <small>รูป 6 รูปแรกพิมพ์ลงเอกสาร วิดีโอไม่พิมพ์</small></div>' +
      '<label class="qc-f full"><span>สิ่งที่พบ / รายละเอียดปัญหา</span><textarea id="fFindings">' + esc(draft.findings) + '</textarea></label>' +
      '<div class="qc-f full"><span>รูปภาพและวิดีโอประกอบ</span><div class="qc-media-tools">' +
        '<label class="sh-btn">' + icon('plus') + '<span>เพิ่มรูปภาพ</span><input type="file" accept="image/*" multiple data-media></label>' +
        '<label class="sh-btn">' + icon('plus') + '<span>เพิ่มวิดีโอ</span><input type="file" accept="video/*" multiple data-media></label>' +
        '<small>รวมได้สูงสุด ' + MAX_MEDIA + ' ไฟล์ รูปถูกย่อให้เล็กลงอัตโนมัติ วิดีโอไม่เกิน ' + MAX_VIDEO_MB + ' MB</small></div><div id="fMedia"></div></div>' +
      '<label class="qc-f full"><span>การแก้ไข / แนวทางดำเนินการ</span><textarea id="fCorrective">' + esc(draft.correctiveAction) + '</textarea></label>' +
      '<label class="qc-f full"><span>หมายเหตุ / Release Note</span><textarea id="fNote">' + esc(draft.note) + '</textarea></label>' +
      '</form>';
    show(draft.id ? 'แก้ไข QC ' + draft.qcNo : 'สร้าง QC เครื่อง', 'เชื่อมลูกค้า เครื่องจักร และงานบริการ แล้วตรวจตาม Checklist', body,
      btn('ยกเลิก', 'data-cancel') + btn('ดูเอกสาร QC 2 หน้า', 'data-preview') + btn('บันทึก QC', 'data-save', true));

    var $ = function (s) { return dlg.querySelector(s); };
    function fillMachines() {
      var cid = $('#fCustomer').value;
      var ms = db.machines.filter(function (m) { return !cid || String(m.customerId) === String(cid); });
      $('#fMachine').innerHTML = '<option value="">เลือกเครื่อง</option>' + ms.map(function (m) {
        return opt(m.id, machineName(m) + ' · ' + (m.model || '-') + ' · S/N ' + (m.serial || '-'), String(m.id) === String(draft.machineId));
      }).join('');
      if (!ms.some(function (m) { return String(m.id) === String(draft.machineId); })) draft.machineId = '';
      fillCases();
    }
    function fillCases() {
      var cid = $('#fCustomer').value, mid = $('#fMachine').value;
      var cs = db.cases.filter(function (c) { return (!cid || c.customer_id === cid) && (!mid || c.machine_id === mid); });
      $('#fCase').innerHTML = '<option value="">ไม่ผูก Service Case</option>' + cs.map(function (c) {
        return opt(c.id, (c.ticket || c.id) + ' · ' + (c.status || ''), c.id === draft.caseId);
      }).join('');
    }
    $('#fCustomer').addEventListener('change', function () { draft.customerId = this.value; fillMachines(); });
    $('#fMachine').addEventListener('change', function () {
      draft.machineId = this.value;
      var m = byId(db.machines, this.value);
      if (m && m.customerId && !$('#fCustomer').value) { $('#fCustomer').value = m.customerId; draft.customerId = m.customerId; fillMachines(); }
      fillCases();
    });
    $('#fCase').addEventListener('change', function () { draft.caseId = this.value; });
    fillMachines();
    drawChecks(); drawMedia();
    $('#qcForm').addEventListener('input', function () { dlg.dataset.dirty = '1'; });
    $('#qcForm').addEventListener('change', function () { dlg.dataset.dirty = '1'; });
    [].forEach.call(dlg.querySelectorAll('[data-media]'), function (inp) { inp.addEventListener('change', addMedia); });
    $('[data-cancel]').addEventListener('click', function () { if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) return; dlg.close(); });
    $('[data-preview]').addEventListener('click', function () { readForm(); openDoc(draft, true); });
    $('[data-save]').addEventListener('click', save);
    if (restore) dlg.dataset.dirty = '1';
  }

  function drawChecks() {
    var host = dlg.querySelector('#fChecks');
    var P = [['Pending', 'รอตรวจ', 'p-pending'], ['Pass', 'ผ่าน', 'p-pass'], ['Fail', 'ไม่ผ่าน', 'p-fail'], ['N/A', 'N/A', 'p-na']];
    host.innerHTML = draft.checklist.map(function (it, i) {
      return '<div class="qc-check" data-i="' + i + '"><span class="qc-check-n">' + (i + 1) + '</span>' +
        '<div class="qc-check-t"><b>' + esc(it.labelTh) + '</b><small>' + esc(it.labelEn) + '</small></div>' +
        '<div class="qc-pills" role="group" aria-label="ผลข้อ ' + (i + 1) + '">' + P.map(function (p) {
          return '<button type="button" class="' + p[2] + '" data-r="' + p[0] + '" aria-pressed="' + (it.result === p[0]) + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
        '<input data-remark placeholder="หมายเหตุ / ค่าที่วัด" value="' + esc(it.remark || '') + '" aria-label="หมายเหตุข้อ ' + (i + 1) + '"></div>';
    }).join('');
    host.onclick = function (e) {
      var b = e.target.closest('button[data-r]'); if (!b) return;
      var row = b.closest('.qc-check'), i = +row.dataset.i;
      draft.checklist[i].result = b.dataset.r;
      [].forEach.call(row.querySelectorAll('button[data-r]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      dlg.dataset.dirty = '1'; drawSum();
    };
    host.oninput = function (e) {
      if (!e.target.matches('[data-remark]')) return;
      draft.checklist[+e.target.closest('.qc-check').dataset.i].remark = e.target.value;
    };
    drawSum();
  }
  function drawSum() {
    var st = stats(draft);
    dlg.querySelector('#fSum').innerHTML = '<div>ตรวจแล้ว<b>' + st.done + '/' + st.total + '</b></div><div>ผ่าน<b>' + st.pass + '</b></div><div>ไม่ผ่าน<b>' + st.fail + '</b></div>';
  }

  function drawMedia() {
    var host = dlg.querySelector('#fMedia');
    if (!draft.media.length) { host.innerHTML = '<div class="qc-media-empty">ยังไม่มีรูปภาพหรือวิดีโอ</div>'; return; }
    host.innerHTML = '<div class="qc-media">' + draft.media.map(function (f, i) {
      var v = /^video\//.test(f.type || '');
      return '<figure>' + (v ? '<video src="' + esc(f.data) + '" controls preload="metadata"></video>' : '<img src="' + esc(f.data) + '" alt="รูปประกอบ ' + (i + 1) + '">') +
        '<figcaption><span>' + esc(f.name || 'ไฟล์ ' + (i + 1)) + '</span><button type="button" data-del="' + i + '">ลบ</button></figcaption></figure>';
    }).join('') + '</div>';
    host.onclick = function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      draft.media.splice(+b.dataset.del, 1); dlg.dataset.dirty = '1'; drawMedia();
    };
  }
  function readAsDataURL(file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = no; r.readAsDataURL(file); }); }
  function shrink(file) {
    return readAsDataURL(file).then(function (url) {
      return new Promise(function (ok) {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, PHOTO_EDGE / Math.max(img.width, img.height));
          if (k === 1 && file.size < 500 * 1024) return ok({ data: url, type: file.type, size: file.size });
          var cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var out = cv.toDataURL('image/jpeg', 0.82);
          ok({ data: out, type: 'image/jpeg', size: Math.round(out.length * 0.75) });
        };
        img.onerror = function () { ok({ data: url, type: file.type, size: file.size }); };
        img.src = url;
      });
    });
  }
  async function addMedia(e) {
    var files = [].slice.call(e.target.files || []); e.target.value = '';
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (draft.media.length >= MAX_MEDIA) { page.toast('แนบได้สูงสุด ' + MAX_MEDIA + ' ไฟล์'); break; }
      try {
        if (/^image\//.test(f.type)) {
          var s = await shrink(f);
          draft.media.push({ name: f.name, type: s.type, size: s.size, data: s.data, createdAt: new Date().toISOString() });
        } else if (/^video\//.test(f.type)) {
          if (f.size > MAX_VIDEO_MB * 1024 * 1024) { page.toast('วิดีโอ ' + f.name + ' ใหญ่เกิน ' + MAX_VIDEO_MB + ' MB'); continue; }
          draft.media.push({ name: f.name, type: f.type, size: f.size, data: await readAsDataURL(f), createdAt: new Date().toISOString() });
        }
      } catch (err) { page.toast('อ่านไฟล์ ' + f.name + ' ไม่ได้'); }
    }
    dlg.dataset.dirty = '1'; drawMedia();
  }

  function readForm() {
    var $ = function (s) { return dlg.querySelector(s); };
    if (!$('#qcForm')) return;
    draft.type = $('#fType').value; draft.qcDate = $('#fDate').value; draft.customerId = $('#fCustomer').value;
    draft.machineId = $('#fMachine').value; draft.caseId = $('#fCase').value; draft.inspector = $('#fInspector').value.trim();
    draft.reviewer = $('#fReviewer').value.trim(); draft.status = $('#fStatus').value; draft.targetCompany = $('#fTarget').value.trim();
    draft.findings = $('#fFindings').value.trim(); draft.correctiveAction = $('#fCorrective').value.trim(); draft.note = $('#fNote').value.trim();
  }

  async function save() {
    readForm();
    var miss = !draft.customerId ? '#fCustomer' : !draft.machineId ? '#fMachine' : !draft.qcDate ? '#fDate' : !draft.inspector ? '#fInspector' : '';
    if (miss) { page.toast('กรอกช่องที่มี * ให้ครบ'); dlg.querySelector(miss).focus(); return; }
    var b = dlg.querySelector('[data-save]'); b.disabled = true; b.textContent = 'กำลังบันทึก…';
    var isNew = !draft.id;
    if (isNew) { draft.id = uid(); draft.qcNo = nextNo(); }
    var r = await sb().from('qc_records').upsert(toRow(draft), { onConflict: 'id' }).select().single();
    if (r.error && isNew && /qc_no/.test(r.error.message || '')) {          // someone took this number a moment ago
      await loadAll(); draft.qcNo = nextNo();
      r = await sb().from('qc_records').upsert(toRow(draft), { onConflict: 'id' }).select().single();
    }
    b.disabled = false; b.textContent = 'บันทึก QC';
    if (r.error) { if (isNew) draft.id = ''; page.toast('บันทึกไม่สำเร็จ: ' + r.error.message); return; }
    var saved = fromRow(r.data), i = db.qc.findIndex(function (x) { return x.id === saved.id; });
    if (i >= 0) db.qc[i] = saved; else db.qc.unshift(saved);
    refreshList(); mirror();
    dlg.dataset.dirty = ''; dlg.close();
    page.toast('บันทึก ' + saved.qcNo + ' แล้ว');
  }

  /* ---------- the two-page Thai document (Service js/05 qcDocHTML, unchanged layout) ---------- */
  function docHTML(q) {
    var m = byId(db.machines, q.machineId) || {}, cu = byId(db.customers, q.customerId) || {}, c = byId(db.cases, q.caseId), st = stats(q), S = db.settings || {};
    var pics = (q.media || []).filter(function (x) { return /^image\//.test(String(x.type || '')); });
    var rows = (q.checklist || []).map(function (it, i) {
      return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(it.labelTh || it.labelEn || it.id) + '</td><td class="result">' + esc(STATUS_TH[it.result] || it.result || '-') + '</td><td class="remark">' + esc(it.remark || '-') + '</td></tr>';
    }).join('');
    var company = esc(S.companyNameTh || S.companyName || INTERNAL), address = esc(S.companyAddress || ''), phone = esc(S.companyPhone || '-'), email = esc(S.companyEmail || '-');
    var mName = esc(machineName(m) || '-'), model = esc(m.model || '-'), serial = esc(m.serial || '-'), customer = esc(cu.name || '-'), target = esc(q.targetCompany || INTERNAL);
    var ticket = esc((c && c.ticket) || '-'), type = esc(TYPE_TH[q.type] || q.type || '-'), result = esc(STATUS_TH[q.status] || q.status);
    var slots = [0, 1, 2, 3, 4, 5].map(function (i) {
      var x = pics[i];
      return '<div class="qc-photo-slot"><div class="photo-stage">' + (x ? '<img src="' + esc(x.data) + '" alt="รูปประกอบ QC ' + (i + 1) + '">' : '<div class="photo-empty">ช่องรูปภาพ ' + (i + 1) + '<br>ปัญหา / ความเสียหาย / อุปกรณ์ไม่ครบ</div>') +
        '</div><div class="photo-caption">' + (x ? 'รูปที่ ' + (i + 1) + ' · ' + esc(x.name || 'รูปประกอบ QC') : 'รูปที่ ' + (i + 1) + ' · ยังไม่มีรูป') + '</div></div>';
    }).join('');
    var head = function (title, pageName, sub) {
      return '<div class="qc-doc-page-head"><img src="' + esc(DOC_LOGO) + '" alt="I-MODE"><div><h1>' + title + '</h1><div class="page-name">' + pageName + '</div><div class="qc-doc-company"><b>' + company + '</b><br>' + sub + '</div></div></div>';
    };
    return '<div class="qc-doc-stack" id="qcPrintDoc">' +
      '<section class="qc-doc-page qc-doc-page-1">' + head('ใบตรวจสอบคุณภาพเครื่องจักร (QC)', 'หน้าที่ 1 / 2 — รายการตรวจสอบ', address + '<br>โทร. ' + phone + ' · ' + email) +
        '<div class="qc-doc-info"><div><b>เลขที่ QC:</b> ' + esc(q.qcNo || '-') + '<br><b>ประเภทการตรวจ:</b> ' + type + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>เลขที่งานบริการ:</b> ' + ticket + '</div>' +
        '<div><b>ลูกค้า:</b> ' + customer + '<br><b>เอกสารส่งให้:</b> ' + target + '<br><b>เครื่องจักร:</b> ' + mName + '<br><b>รุ่น / หมายเลขเครื่อง:</b> ' + model + ' / ' + serial + '</div></div>' +
        '<table class="qc-doc-table"><thead><tr><th class="n">ลำดับ</th><th>รายการตรวจสอบ</th><th class="result">ผลการตรวจ</th><th class="remark">หมายเหตุ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="qc-doc-summary"><div><b>สรุปรายการตรวจ:</b> ตรวจแล้ว ' + st.done + '/' + st.total + ' รายการ · ผ่าน ' + st.pass + ' รายการ · ไม่ผ่าน ' + st.fail + ' รายการ</div>' +
        '<div><b>ผล QC:</b> ' + result + '<br><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผู้อนุมัติ:</b> ' + esc(q.reviewer || '-') + '</div></div>' +
        '<div class="qc-doc-sign"><div><b>ผู้ตรวจ QC</b><div>วันที่ ....................</div></div><div><b>ฝ่ายบริการ / เทคนิค</b><div>วันที่ ....................</div></div><div><b>ผู้อนุมัติ / ผู้รับมอบ</b><div>วันที่ ....................</div></div></div>' +
      '</section>' +
      '<section class="qc-doc-page qc-doc-page-2">' + head('ภาพประกอบปัญหา / อุปกรณ์ไม่ครบ', 'หน้าที่ 2 / 2 — หลักฐานประกอบการตรวจ QC', 'เลขที่ QC ' + esc(q.qcNo || '-') + ' · ' + mName + ' · ' + model + ' · S/N ' + serial) +
        '<div class="qc-doc-info"><div><b>ลูกค้า:</b> ' + customer + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>ประเภทการตรวจ:</b> ' + type + '</div>' +
        '<div><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผล QC:</b> ' + result + '<br><b>เลขที่งานบริการ:</b> ' + ticket + '</div></div>' +
        '<div class="qc-doc-note-grid"><div class="qc-doc-note-box"><b>สิ่งที่พบ / รายละเอียดปัญหา</b>' + esc(q.findings || '-') + '</div><div class="qc-doc-note-box"><b>การแก้ไข / แนวทางดำเนินการ</b>' + esc(q.correctiveAction || '-') + '</div><div class="qc-doc-note-box full"><b>หมายเหตุเพิ่มเติม</b>' + esc(q.note || '-') + '</div></div>' +
        '<div class="qc-doc-section-title">รูปภาพประกอบ</div><div class="qc-photo-sheet">' + slots + '</div>' +
        (pics.length > 6 ? '<div class="qc-photo-extra">มีรูปเพิ่มเติมในข้อมูล QC อีก ' + (pics.length - 6) + ' รูป</div>' : '') +
      '</section></div>';
  }

  function openDoc(q, isDraft) {
    var back = isDraft ? draft : null;
    show(isDraft ? 'ตัวอย่างเอกสาร QC' : 'QC ' + q.qcNo, isDraft ? 'ยังไม่ได้บันทึก' : (TYPE_TH[q.type] || q.type) + ' · ' + (STATUS_TH[q.status] || q.status),
      '<div class="qc-doc-wrap">' + docHTML(q) + '</div>',
      (isDraft ? btn('กลับไปแก้ไข', 'data-back') : btn('ปิด', 'data-cancel')) + btn('พิมพ์ / PDF', 'data-print') + (isDraft ? '' : btn('แก้ไข', 'data-edit', true)));
    var $ = function (s) { return dlg.querySelector(s); };
    if ($('[data-cancel]')) $('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if ($('[data-back]')) $('[data-back]').addEventListener('click', function () { openForm(null, null, back); });
    if ($('[data-edit]')) $('[data-edit]').addEventListener('click', function () { openForm(q); });
    $('[data-print]').addEventListener('click', function () { printDoc(q); });
  }
  function printDoc(q) {
    var w = window.open('', '_blank', 'width=1100,height=900');
    if (!w) { page.toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up'); return; }
    w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เอกสาร QC ' + esc(q.qcNo || '') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700;800&display=swap"><link rel="stylesheet" href="' + esc(DOC_CSS) + '">' +
      '<style>body{margin:0;background:#fff}</style></head><body>' + docHTML(q) +
      '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>');
    w.document.close();
  }

  handleLink();   // last: the dialog and form above must exist first
})();
