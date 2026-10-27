/* QC & R&D module — machine QC, moved out of Service on 2026-10-16.
   "อยากจะแบ่งโมดุลใน service เอาไปแบ่งในโมดุล QC R&D" → "ลองย้ายดู"

   Same QC as Service had (js/03 + js/04 + js/05): five QC types, the twelve-point checklist
   with รอตรวจ / ผ่าน / ไม่ผ่าน / N/A, findings, corrective action, photos or clips,
   and the two-page Thai A4 document. What changed is where it lives:
     - records are in Supabase public.qc_records, so every staff member sees the same list —
       Service kept them in one browser's localStorage only;
     - customers, machines and cases are read from the same tables Service uses;
     - QC that a browser still holds from Service can be copied up once (import banner).
   2026-10-20: Service and QC & R&D are separate (two admins); neither links to the other and
   both open from the launcher. Service js/136 hid its QC menu and buttons; this page's sidebar
   leaves Service out. Links still understood: ?new=1&machine=&case=&type=  ?edit=<id>  ?open=<id>

   2026-10-27 phase 1 "QC Core" (supabase/02-qc-core.sql):
     - รับเครื่องเข้า QC: one server call (qc_intake) registers a new machine in Service's
       `machines` table with the next IMODE S/N (IMD-M-YY-NNNN) and opens its QC job. The machine
       stays off Service's list (Service js/148) until QC hands it over (qc_handover), then Service
       looks after the same record (user: "หลังเราส่งเครื่องให้ลูกค้าแล้ว service จะเข้ามาดูแลต่อ");
     - the form runs in four steps: job, the seven required photos, checklist with measured /
       standard values (who and when is stamped per item), result;
     - ผ่าน only when every item is checked, none failed, every N/A has a reason and, for
       ตรวจรับเข้า / ตรวจก่อนส่งมอบ, all seven photos are there. ผ่านแบบมีเงื่อนไข is NOT ผ่าน;
     - new photos and files go to the private Storage bucket qc-evidence (table qc_evidence) and
       are shown through short-lived signed links; base64 media of older QC is still shown;
     - tab เครื่อง lists machines by IMODE S/N, Factory S/N, PO, project, supplier or customer.
   Without 02 run the page works as before and says which file to run.

   The Workshop case page (service-case-detail.html) still checks Pre-Delivery QC through the
   localStorage key imode_v66_qc_records, so every load and save here writes a copy of the
   list there without photos (mirror()), and Service js/137 refreshes it on the case page. */
(async function () {
  'use strict';
  var esc = ImodeShell.esc, icon = ImodeShell.icon;
  var LEGACY_KEY = 'imode_v66_qc_records';
  var DOC_LOGO = new URL('../service/assets/imode-document-logo.webp', location.href).href;
  var DOC_CSS = new URL('qc-doc.css', location.href).href;
  var BUCKET = 'qc-evidence';
  var SQL_FILE = 'modules/qc-rnd/supabase/02-qc-core.sql';

  var TYPES = ['Incoming Inspection', 'Pre-Delivery QC', 'Post-Service QC', 'Installation Acceptance', 'PM Verification'];
  var TYPE_TH = { 'Incoming Inspection': 'ตรวจรับเข้า', 'Pre-Delivery QC': 'ตรวจก่อนส่งมอบ', 'Post-Service QC': 'ตรวจหลังซ่อม', 'Installation Acceptance': 'ตรวจรับหลังติดตั้ง', 'PM Verification': 'ตรวจยืนยัน PM' };
  var INTAKE_TYPES = ['Incoming Inspection', 'Pre-Delivery QC'];
  var STATUS_TH = { Pending: 'รอตรวจ', Draft: 'รอตรวจ', 'In Progress': 'กำลังตรวจ', Pass: 'ผ่าน', Conditional: 'ผ่านแบบมีเงื่อนไข', Fail: 'ไม่ผ่าน', 'N/A': 'ไม่เกี่ยวข้อง' };
  var STATUS_TONE = { 'รอตรวจ': 'grey', 'กำลังตรวจ': 'orange', 'ผ่าน': 'green', 'ผ่านแบบมีเงื่อนไข': 'orange', 'ไม่ผ่าน': 'red' };
  var PRIORITY_TH = { normal: 'ปกติ', urgent: 'ด่วน', critical: 'ด่วนมาก' };
  var STAGE_TH = { qc: 'อยู่ระหว่าง QC', ready: 'ผ่าน QC รอส่งมอบ', delivered: 'ส่งมอบแล้ว (Service ดูแล)' };
  var STAGE_TONE = { 'อยู่ระหว่าง QC': 'orange', 'ผ่าน QC รอส่งมอบ': 'green', 'ส่งมอบแล้ว (Service ดูแล)': 'grey', 'เครื่องของลูกค้า': 'grey' };
  /* the seven photos every ตรวจรับเข้า / ตรวจก่อนส่งมอบ must have (spec STEP 04) */
  var PHOTOS = [
    { kind: 'front', th: 'ด้านหน้า' }, { kind: 'back', th: 'ด้านหลัง' }, { kind: 'left', th: 'ด้านซ้าย' }, { kind: 'right', th: 'ด้านขวา' },
    { kind: 'factoryPlate', th: 'ป้ายชื่อโรงงาน (Factory S/N)' }, { kind: 'imodePlate', th: 'ป้าย IMODE S/N' }, { kind: 'accessories', th: 'อุปกรณ์ที่มากับเครื่อง' }
  ];
  var KIND_TH = { extra: 'รูป / ไฟล์เพิ่มเติม', test: 'ผลทดสอบ' };
  PHOTOS.forEach(function (p) { KIND_TH[p.kind] = p.th; });
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
  var MAX_MEDIA = 8, MAX_VIDEO_MB = 4, MAX_FILE_MB = 20, PHOTO_EDGE = 1600;
  var INTERNAL = 'บริษัท ไอโมด พลัส จำกัด';

  var db = { qc: [], customers: [], machines: [], cases: [], settings: {}, ev: [] };
  var tableMissing = false, core = false;
  var signed = {};      // storage path -> { url, until }
  var list, mlist, page;

  /* ---------- helpers ---------- */
  function todayISO() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return 'QC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  function thDate(v) {
    if (!v) return '-';
    try { return new Date(String(v).length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return String(v); }
  }
  function thTime(v) {
    if (!v) return '';
    try { return new Date(v).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(v); }
  }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
  function machineName(m) { return m ? (m.nameTh || m.name || m.model || 'เครื่องจักร') : ''; }
  function inQc(m) { return !!m && (m.lifecycle === 'qc' || m.lifecycle === 'ready'); }
  function stats(q) {
    var a = (q && q.checklist) || [], total = a.length || CHECKLIST.length;
    var done = a.filter(function (x) { return x.result && x.result !== 'Pending'; }).length;
    return { total: total, done: done,
      pass: a.filter(function (x) { return x.result === 'Pass'; }).length,
      fail: a.filter(function (x) { return x.result === 'Fail'; }).length };
  }
  function freshChecklist() { return CHECKLIST.map(function (x) { return { id: x.id, labelTh: x.th, labelEn: x.en, result: 'Pending', measured: '', standard: '', remark: '', checkedBy: '', checkedAt: '' }; }); }
  function nextNo() {
    var d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), max = 0;
    db.qc.forEach(function (q) { var mt = String(q.qcNo || '').match(/QC-\d{6}-(\d+)/); if (mt) max = Math.max(max, Number(mt[1]) || 0); });
    return 'QC-' + y + m + '-' + String(max + 1).padStart(3, '0');
  }
  function sb() { return ImodeAuth.client(); }
  function me() { return page.user.name || page.user.username || ''; }
  function evOf(qcId) { return db.ev.filter(function (e) { return e.qc_id === qcId; }); }

  /* row <-> the object shape Service used (so the document code and the mirror stay the same) */
  function fromRow(r) {
    return { id: r.id, qcNo: r.qc_no, type: r.type, qcDate: r.qc_date || '', status: r.status, customerId: r.customer_id || '',
      machineId: r.machine_id || '', caseId: r.case_id || '', inspector: r.inspector || '', reviewer: r.reviewer || '',
      targetCompany: r.target_company || '', checklist: r.checklist || [], findings: r.findings || '',
      correctiveAction: r.corrective_action || '', note: r.note || '', media: r.media || [],
      assignedTo: r.assigned_to || '', plannedDate: r.planned_date || '', priority: r.priority || 'normal', location: r.location || '',
      poNo: r.po_no || '', projectNo: r.project_no || '', supplier: r.supplier || '', receivedDate: r.received_date || '',
      accessories: r.accessories || '', accessoriesMissing: r.accessories_missing || '', accessoriesStatus: r.accessories_status || 'complete',
      createdAt: r.created_at, updatedAt: r.updated_at };
  }
  function toRow(q, source) {
    var r = { id: q.id, qc_no: q.qcNo, type: TYPES.indexOf(q.type) >= 0 ? q.type : 'Pre-Delivery QC', qc_date: q.qcDate || null,
      status: STATUS_TH[q.status] && q.status !== 'Pending' && q.status !== 'N/A' ? q.status : 'Draft',
      customer_id: q.customerId || null, machine_id: q.machineId || null, case_id: q.caseId || null,
      inspector: q.inspector || '', reviewer: q.reviewer || '', target_company: q.targetCompany || '',
      checklist: q.checklist || [], findings: q.findings || '', corrective_action: q.correctiveAction || '',
      note: q.note || '', media: q.media || [], source: source || 'qc-module' };
    if (core) {   // phase-1 columns exist only after 02-qc-core.sql
      var miss = String(q.accessoriesMissing || '').trim();
      Object.assign(r, { assigned_to: q.assignedTo || '', planned_date: q.plannedDate || null, priority: PRIORITY_TH[q.priority] ? q.priority : 'normal',
        location: q.location || '', po_no: q.poNo || '', project_no: q.projectNo || '', supplier: q.supplier || '',
        received_date: q.receivedDate || null, accessories: q.accessories || '', accessories_missing: miss,
        accessories_status: q.accessoriesStatus === 'delivered' || q.accessoriesStatus === 'partial' ? q.accessoriesStatus : (miss ? 'outstanding' : 'complete') });
    }
    return r;
  }

  /* copy for the Workshop case page (and anything else in Service still reading localStorage) */
  function mirror() {
    try {
      var old = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') || [];
      var ids = {}; db.qc.forEach(function (q) { ids[q.id] = 1; });
      // keep what only this browser has (Service demo rows, QC not yet moved up); replace the cloud copies
      var keep = old.filter(function (q) { return q && !ids[q.id] && !q.cloud; });
      var lite = db.qc.map(function (q) { var c = Object.assign({}, q); c.media = []; c.mediaCount = (q.media || []).length + evOf(q.id).length; c.cloud = true; return c; });
      localStorage.setItem(LEGACY_KEY, JSON.stringify(lite.concat(keep)));
    } catch (e) { console.warn('[qc] mirror', e); }
  }

  /* ---------- data ---------- */
  var M_BASE = 'id,"customerId",name,"nameTh","nameEn",model,serial';
  var M_CORE = M_BASE + ',"imodeSn","factorySn",lifecycle,"poNo","projectNo",supplier,"receivedAt"';
  async function loadAll() {
    var c = sb();
    var res = await Promise.all([
      c.from('qc_records').select('*').order('qc_date', { ascending: false }).order('created_at', { ascending: false }),
      c.from('customers').select('id,name,branch').order('name'),
      c.from('machines').select(M_CORE),
      c.from('service_cases').select('id,ticket,status,customer_id,machine_id,service_type'),
      c.from('system_settings').select('data').eq('id', 'main').maybeSingle(),
      c.from('qc_evidence').select('*').order('created_at')
    ]);
    if (res[0].error) {
      tableMissing = /qc_records|relation|does not exist|schema cache/i.test(res[0].error.message || '');
      if (!tableMissing) throw res[0].error;
      db.qc = [];
    } else { tableMissing = false; db.qc = (res[0].data || []).map(fromRow); }
    core = !tableMissing && !res[2].error && !res[5].error;
    if (res[2].error) res[2] = await c.from('machines').select(M_BASE);   // 02 not run: the QC columns are not there yet
    db.customers = res[1].data || [];
    db.machines = (res[2].data || []).map(function (m) { return Object.assign({}, m, { customerId: m.customerId || '' }); });
    db.cases = res[3].data || [];
    db.settings = (res[4].data && res[4].data.data) || {};
    db.ev = core ? (res[5].data || []) : [];
    if (res[1].error || res[2].error || res[3].error) console.warn('[qc] lookup tables', res[1].error, res[2].error, res[3].error);
  }

  /* short-lived links to private evidence files (1 hour, renewed 5 minutes before) */
  async function sign(rows) {
    var now = Date.now();
    var need = rows.filter(function (e) { var s = signed[e.path]; return !s || s.until < now + 300000; });
    await Promise.all(need.map(function (e) {
      return sb().storage.from(BUCKET).createSignedUrl(e.path, 3600).then(function (r) {
        if (r && r.data && r.data.signedUrl) signed[e.path] = { url: r.data.signedUrl, until: now + 3600000 };
      }, function () {});
    }));
  }
  function evUrl(e) { return e.blobUrl || (signed[e.path] && signed[e.path].url) || ''; }

  function latestQc(mid) {
    var qs = db.qc.filter(function (q) { return q.machineId === mid; });
    qs.sort(function (a, b) { return String(b.qcDate || '').localeCompare(String(a.qcDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    return qs[0] || null;
  }
  function rowsForList() {
    return db.qc.map(function (q) {
      var m = byId(db.machines, q.machineId), cu = byId(db.customers, q.customerId || (m && m.customerId)), st = stats(q);
      return { id: q.id, qcNo: q.qcNo, date: thDate(q.qcDate), type: TYPE_TH[q.type] || q.type,
        customer: (cu && cu.name) || '', machine: m ? machineName(m) + (m.imodeSn ? ' · ' + m.imodeSn : m.serial ? ' · S/N ' + m.serial : '') : '',
        inspector: q.inspector || q.assignedTo, progress: st.done + '/' + st.total, status: STATUS_TH[q.status] || q.status,
        po: q.poNo, supplier: q.supplier, sn: m ? [m.imodeSn, m.factorySn, m.serial].filter(Boolean).join(' ') : '', raw: q };
    });
  }
  function rowsForMachines() {
    var hasQc = {}; db.qc.forEach(function (q) { if (q.machineId) hasQc[q.machineId] = 1; });
    return db.machines.filter(function (m) { return m.imodeSn || m.lifecycle || hasQc[m.id]; }).map(function (m) {
      var q = latestQc(m.id), cu = byId(db.customers, m.customerId || (q && q.customerId));
      return { id: m.id, imodeSn: m.imodeSn || '', factorySn: m.factorySn || m.serial || '', machine: machineName(m) + (m.model ? ' · ' + m.model : ''),
        supplier: m.supplier || (q && q.supplier) || '', po: m.poNo || (q && q.poNo) || '', project: m.projectNo || (q && q.projectNo) || '',
        customer: (cu && cu.name) || '', lastQc: q ? q.qcNo + ' · ' + (STATUS_TH[q.status] || q.status) : '',
        stage: STAGE_TH[m.lifecycle] || 'เครื่องของลูกค้า', raw: m };
    }).sort(function (a, b) { return String(b.imodeSn).localeCompare(String(a.imodeSn)); });
  }
  function refreshList() {
    list.setFilter(null); list.setRows(rowsForList());
    mlist.setFilter(null); mlist.setRows(rowsForMachines());
    drawKpis();
  }

  /* ---------- page ---------- */
  page = await ImodeShell.start({
    module: 'qc', root: '../../',
    hide: ['service'], // separate admins (2026-10-20): reach Service from the launcher only
    subtitle: 'รับเครื่องเข้า QC ตรวจตาม Checklist พร้อมรูปบังคับ และส่งมอบเครื่องที่ผ่านให้ Service ดูแลต่อ',
    actions: [
      { label: 'ส่งออก CSV', icon: 'download', onClick: function () {
        var l = tab === 'machines' ? mlist : list;
        var n = l.csv('I-MODE_QC_' + (tab === 'machines' ? 'machines_' : '') + todayISO() + '.csv'); page.toast('ส่งออก ' + n + ' รายการแล้ว');
      } },
      { label: 'สร้าง QC เครื่องที่มีอยู่', icon: 'plus', onClick: function () { openForm(null, {}); } },
      { label: 'รับเครื่องเข้า QC', icon: 'inbox', primary: true, onClick: function () { openIntake(); } }
    ]
  });

  var notice = document.createElement('div');
  notice.hidden = true;
  page.body.appendChild(notice);
  function say(html) { notice.innerHTML = html || ''; notice.hidden = !html; }

  /* two views: QC documents and machines (by IMODE S/N) */
  var tab = 'qc';
  try { if (localStorage.getItem('imode.qc.tab') === 'machines') tab = 'machines'; } catch (e) {}
  var tabs = document.createElement('div');
  tabs.className = 'qc-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'มุมมอง');
  tabs.innerHTML = '<button type="button" role="tab" data-tab="qc">' + icon('list') + '<span>ใบ QC</span></button>' +
    '<button type="button" role="tab" data-tab="machines">' + icon('inbox') + '<span>เครื่อง (IMODE S/N)</span></button>';
  page.body.appendChild(tabs);
  var qcView = document.createElement('div'), mView = document.createElement('div');
  page.body.appendChild(qcView); page.body.appendChild(mView);
  var kpiHost = document.createElement('div'), mKpiHost = document.createElement('div');
  qcView.appendChild(kpiHost); mView.appendChild(mKpiHost);
  function setTab(t) {
    tab = t;
    try { localStorage.setItem('imode.qc.tab', t); } catch (e) {}
    [].forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
    qcView.hidden = t !== 'qc'; mView.hidden = t !== 'machines';
  }
  tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  var isWaiting = function (r) { return r.raw.status === 'Draft' || r.raw.status === 'In Progress'; };
  var isPass = function (r) { return r.raw.status === 'Pass'; };
  var isProblem = function (r) { return r.raw.status === 'Fail' || r.raw.status === 'Conditional'; };
  var stage = function (s) { return function (r) { return r.raw.lifecycle === s; }; };
  function drawKpis() {
    var rows = rowsForList(), n = function (f) { return rows.filter(f).length; };
    kpiHost.innerHTML = '';
    var kp = ImodeShell.kpis(kpiHost, [
      { label: 'QC ทั้งหมด', value: rows.length, note: 'ทุกประเภท', tone: 'blue', icon: 'list' },
      { label: 'รอตรวจ / กำลังตรวจ', value: n(isWaiting), note: 'ยังไม่สรุปผล', tone: 'orange', icon: 'clock', filter: isWaiting },
      { label: 'ผ่าน', value: n(isPass), note: 'ปล่อยเครื่องได้', tone: 'green', icon: 'check', filter: isPass },
      { label: 'ไม่ผ่าน / มีเงื่อนไข', value: n(isProblem), note: 'ต้องแก้ไขหรือตรวจซ้ำ', tone: 'red', icon: 'alert', filter: isProblem }
    ]);
    if (list) kp.bind(list);
    var ms = rowsForMachines(), mn = function (f) { return ms.filter(f).length; };
    mKpiHost.innerHTML = '';
    var mk = ImodeShell.kpis(mKpiHost, [
      { label: 'เครื่องที่มี QC', value: ms.length, note: 'ทั้งหมดในแท็บนี้', tone: 'blue', icon: 'list' },
      { label: 'อยู่ระหว่าง QC', value: mn(stage('qc')), note: 'ยังไม่แสดงใน Service', tone: 'orange', icon: 'clock', filter: stage('qc') },
      { label: 'ผ่าน QC รอส่งมอบ', value: mn(stage('ready')), note: 'กดที่เครื่องเพื่อส่งมอบ', tone: 'green', icon: 'check', filter: stage('ready') },
      { label: 'ส่งมอบแล้ว', value: mn(stage('delivered')), note: 'Service ดูแลต่อ', tone: 'blue', icon: 'check', filter: stage('delivered') }
    ]);
    if (mlist) mk.bind(mlist);
  }

  list = ImodeShell.list(qcView, {
    title: 'รายการ QC เครื่อง', subtitle: 'ค้นหาด้วยเลขที่ QC ลูกค้า เครื่อง IMODE S/N, S/N, PO, ผู้ขาย หรือผู้ตรวจ แตะรายการเพื่อดูเอกสาร',
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
    searchKeys: ['qcNo', 'date', 'type', 'customer', 'machine', 'inspector', 'status', 'po', 'supplier', 'sn'],
    rows: [], loading: true, statusKey: 'status', statusTone: STATUS_TONE,
    empty: { title: 'ยังไม่มีใบ QC', text: 'กด "รับเครื่องเข้า QC" สำหรับเครื่องใหม่ หรือ "สร้าง QC เครื่องที่มีอยู่"' },
    footNote: 'ข้อมูลจากฐานข้อมูลกลาง เห็นเหมือนกันทุกเครื่อง',
    onRowClick: function (r) { openDoc(r.raw); },
    rowLabel: function (r) { return 'เปิดเอกสาร ' + r.qcNo; }
  });
  mlist = ImodeShell.list(mView, {
    title: 'เครื่องจักรในงาน QC', subtitle: 'ค้นหาด้วย IMODE S/N, Factory S/N, PO, โครงการ, ผู้ขาย หรือลูกค้า แตะเครื่องเพื่อดูประวัติ QC และส่งมอบ',
    columns: [
      { key: 'imodeSn', label: 'IMODE S/N', isKey: true },
      { key: 'factorySn', label: 'Factory S/N' },
      { key: 'machine', label: 'เครื่อง / รุ่น' },
      { key: 'supplier', label: 'ผู้ขาย' },
      { key: 'po', label: 'PO' },
      { key: 'project', label: 'โครงการ' },
      { key: 'customer', label: 'ลูกค้า' },
      { key: 'lastQc', label: 'QC ล่าสุด' },
      { key: 'stage', label: 'สถานะเครื่อง' }
    ],
    rows: [], loading: true, statusKey: 'stage', statusTone: STAGE_TONE,
    empty: { title: 'ยังไม่มีเครื่องในงาน QC', text: 'กด "รับเครื่องเข้า QC" เพื่อรับเครื่องเครื่องแรกและออก IMODE S/N' },
    footNote: 'เครื่องที่ยังไม่ส่งมอบจะไม่แสดงในหน้าเครื่องจักรของ Service',
    onRowClick: function (r) { openMachine(r.raw); },
    rowLabel: function (r) { return 'เปิดประวัติเครื่อง ' + (r.imodeSn || r.machine); }
  });
  setTab(tab);
  drawKpis();

  function warnSql() {
    if (tableMissing) say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>ยังไม่ได้สร้างตาราง QC ในฐานข้อมูล ให้ผู้ดูแลรันไฟล์ ' + SQL_FILE + ' ใน Supabase SQL Editor หนึ่งครั้ง จึงจะบันทึก QC ได้</span></div>');
    else if (!core) say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>ฐานข้อมูลยังไม่มีส่วน QC ระยะ 1 (รับเครื่อง IMODE S/N รูปบังคับ ส่งมอบ) ให้ผู้ดูแลรันไฟล์ ' + SQL_FILE + ' ใน Supabase SQL Editor หนึ่งครั้ง ระหว่างนี้ใช้ใบ QC แบบเดิมได้</span></div>');
  }
  try { await loadAll(); }
  catch (e) {
    console.error('[qc] load', e);
    say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>โหลดข้อมูล QC ไม่สำเร็จ: ' + esc(e.message || e) + '</span></div>');
  }
  warnSql();
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
      say(''); warnSql();
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
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function field(id, label, value, extra, req) {
    return '<label class="qc-f' + (extra && extra.full ? ' full' : '') + '"><span>' + esc(label) + (req ? ' <b>*</b>' : '') + '</span><input id="' + id + '" value="' + esc(value || '') + '"' +
      (extra && extra.type ? ' type="' + extra.type + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + ' autocomplete="off"></label>';
  }
  function customerOptions(sel, blank) {
    return '<option value="">' + esc(blank || 'เลือกลูกค้า') + '</option>' +
      db.customers.map(function (c) { return opt(c.id, c.name + (c.branch ? ' · ' + c.branch : ''), c.id === sel); }).join('');
  }

  /* ---------- รับเครื่องเข้า QC: new machine + IMODE S/N + QC job, in one server call ---------- */
  function openIntake() {
    if (tableMissing || !core) { warnSql(); page.toast('ต้องรันไฟล์ ' + SQL_FILE + ' ก่อน จึงจะรับเครื่องเข้า QC ได้'); return; }
    var body = '<form id="inForm" class="qc-grid" novalidate>' +
      '<div class="qc-sec"><i>1</i> เครื่องจักร <small>IMODE S/N ออกให้อัตโนมัติเมื่อบันทึก</small></div>' +
      field('iNameTh', 'ชื่อเครื่อง (ไทย)', '', null, true) + field('iNameEn', 'ชื่อเครื่อง (อังกฤษ)', '') + field('iModel', 'รุ่น (Model)', '', null, true) +
      field('iFactorySn', 'Factory S/N', '', { ph: 'หมายเลขจากป้ายโรงงาน' }) + field('iSupplier', 'ผู้ขาย / โรงงาน', '') + field('iReceived', 'วันที่รับเครื่อง', todayISO(), { type: 'date' }) +
      field('iPo', 'เลขที่ PO', '') + field('iProject', 'เลขที่โครงการ', '') +
      '<label class="qc-f"><span>ลูกค้าที่จะส่งมอบ (ถ้าทราบ)</span><select id="iCustomer">' + customerOptions('', 'ยังไม่ทราบ') + '</select></label>' +
      '<div class="qc-sec"><i>2</i> งาน QC</div>' +
      '<label class="qc-f"><span>ประเภท QC <b>*</b></span><select id="iType">' + INTAKE_TYPES.map(function (t) { return opt(t, TYPE_TH[t], t === 'Incoming Inspection'); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>ความเร่งด่วน</span><select id="iPriority">' + Object.keys(PRIORITY_TH).map(function (k) { return opt(k, PRIORITY_TH[k], k === 'normal'); }).join('') + '</select></label>' +
      field('iPlanned', 'วันที่นัดตรวจ', todayISO(), { type: 'date' }) +
      field('iAssigned', 'ผู้รับผิดชอบตรวจ', me()) + field('iLocation', 'สถานที่ตรวจ', '', { ph: 'เช่น คลังสินค้า / หน้างาน' }) +
      '<div class="qc-sec"><i>3</i> อุปกรณ์ที่มากับเครื่อง</div>' +
      '<label class="qc-f full"><span>อุปกรณ์ที่ได้รับ</span><textarea id="iAcc" placeholder="เช่น สายไฟ 1 เส้น, คู่มือ 1 เล่ม"></textarea></label>' +
      '<label class="qc-f full"><span>อุปกรณ์ที่ยังขาด / ค้างส่ง</span><textarea id="iAccMiss" placeholder="เว้นว่างถ้าครบ"></textarea></label>' +
      '<label class="qc-f full"><span>หมายเหตุ</span><textarea id="iNote"></textarea></label>' +
      '</form>';
    show('รับเครื่องเข้า QC', 'ลงทะเบียนเครื่องใหม่ ออก IMODE S/N และเปิดงานตรวจในครั้งเดียว', body, btn('ยกเลิก', 'data-cancel') + btn('รับเครื่องและเริ่มตรวจ', 'data-save', true));
    var $ = function (s) { return dlg.querySelector(s); };
    $('#inForm').addEventListener('input', function () { dlg.dataset.dirty = '1'; });
    $('[data-cancel]').addEventListener('click', function () { if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) return; dlg.close(); });
    $('[data-save]').addEventListener('click', async function () {
      var v = function (s) { return $(s).value.trim(); };
      var miss = !v('#iNameTh') ? '#iNameTh' : !v('#iModel') ? '#iModel' : '';
      if (miss) { page.toast('กรอกชื่อเครื่องและรุ่นให้ครบ'); $(miss).focus(); return; }
      var fsn = v('#iFactorySn').toLowerCase(), model = v('#iModel').toLowerCase();
      if (fsn && db.machines.some(function (m) { return String(m.factorySn || '').toLowerCase() === fsn && String(m.model || '').toLowerCase() === model; })
        && !confirm('มีเครื่องรุ่นนี้ Factory S/N นี้ในระบบแล้ว ยังต้องการรับเข้าใหม่หรือไม่?')) return;
      var b = $('[data-save]'); b.disabled = true; b.textContent = 'กำลังบันทึก…';
      var r = await sb().rpc('qc_intake', { p: {
        nameTh: v('#iNameTh'), nameEn: v('#iNameEn'), model: v('#iModel'), factorySn: v('#iFactorySn'), supplier: v('#iSupplier'),
        poNo: v('#iPo'), projectNo: v('#iProject'), customerId: $('#iCustomer').value, receivedAt: $('#iReceived').value,
        type: $('#iType').value, priority: $('#iPriority').value, plannedDate: $('#iPlanned').value, assignedTo: v('#iAssigned'),
        location: v('#iLocation'), accessories: v('#iAcc'), accessoriesMissing: v('#iAccMiss'), note: v('#iNote'),
        inspector: v('#iAssigned') || me(), targetCompany: INTERNAL } });
      b.disabled = false; b.textContent = 'รับเครื่องและเริ่มตรวจ';
      if (r.error || !r.data) { page.toast('รับเครื่องไม่สำเร็จ: ' + ((r.error && r.error.message) || 'ไม่มีผลตอบกลับ')); return; }
      dlg.dataset.dirty = '';
      await loadAll(); refreshList(); mirror();
      page.toast('รับเครื่องแล้ว IMODE S/N ' + r.data.imode_sn + ' · ' + r.data.qc_no);
      var q = byId(db.qc, r.data.qc_id);
      if (q) openForm(q); else dlg.close();
    });
  }

  /* ---------- machine history + hand-over ---------- */
  function openMachine(m) {
    var qs = db.qc.filter(function (q) { return q.machineId === m.id; });
    var cu = byId(db.customers, m.customerId);
    var info = [['IMODE S/N', m.imodeSn], ['Factory S/N', m.factorySn || m.serial], ['เครื่อง', machineName(m)], ['รุ่น', m.model], ['ผู้ขาย', m.supplier],
      ['PO', m.poNo], ['โครงการ', m.projectNo], ['วันที่รับเครื่อง', m.receivedAt ? thDate(m.receivedAt) : ''], ['ลูกค้า', cu && cu.name], ['สถานะเครื่อง', STAGE_TH[m.lifecycle] || 'เครื่องของลูกค้า']];
    var body = '<dl class="qc-info">' + info.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="qc-sec qc-sec-block"><i>' + qs.length + '</i> ประวัติ QC</div>' +
      (qs.length ? '<ul class="qc-history">' + qs.map(function (q) {
        return '<li><button type="button" data-qc="' + esc(q.id) + '"><b>' + esc(q.qcNo) + '</b><span>' + esc(TYPE_TH[q.type] || q.type) + ' · ' + thDate(q.qcDate) + '</span>' +
          '<span class="sh-chip tone-' + (STATUS_TONE[STATUS_TH[q.status]] || 'grey') + '">' + esc(STATUS_TH[q.status] || q.status) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="qc-muted">ยังไม่มีใบ QC</p>') +
      (m.lifecycle === 'qc' ? '<p class="qc-hint">' + icon('alert') + '<span>ส่งมอบได้เมื่อ QC ล่าสุดของเครื่องนี้ "ผ่าน" แล้วเท่านั้น (ผ่านแบบมีเงื่อนไขไม่นับ)</span></p>' : '');
    show(m.imodeSn || machineName(m), machineName(m) + (m.model ? ' · ' + m.model : ''), body,
      btn('ปิด', 'data-cancel') + btn('สร้าง QC ใหม่ให้เครื่องนี้', 'data-new') + (m.lifecycle === 'ready' ? btn('ส่งมอบให้ลูกค้า', 'data-hand', true) : ''));
    var $ = function (s) { return dlg.querySelector(s); };
    $('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    $('[data-new]').addEventListener('click', function () { openForm(null, { machineId: m.id, customerId: m.customerId || '', type: inQc(m) ? 'Pre-Delivery QC' : '' }); });
    if ($('[data-hand]')) $('[data-hand]').addEventListener('click', function () { openHandover(m); });
    dlg.querySelector('.qc-dlg-body').addEventListener('click', function (e) {
      var b = e.target.closest('[data-qc]'); if (b) openDoc(byId(db.qc, b.dataset.qc));
    });
  }
  function openHandover(m) {
    var q = latestQc(m.id);
    var body = '<form class="qc-grid" novalidate>' +
      '<p class="qc-f full qc-muted">หลังส่งมอบ เครื่อง ' + esc(m.imodeSn || machineName(m)) + ' จะแสดงในหน้าเครื่องจักรของ Service ภายใต้ลูกค้าที่เลือก และ Service ดูแลต่อจากนี้</p>' +
      '<label class="qc-f full"><span>ลูกค้า <b>*</b></span><select id="hCustomer">' + customerOptions(m.customerId || (q && q.customerId) || '') + '</select></label>' +
      field('hDate', 'วันที่ส่งมอบ', todayISO(), { type: 'date' }) + '</form>';
    show('ส่งมอบเครื่องให้ลูกค้า', (m.imodeSn || '') + ' · QC ล่าสุด ' + (q ? q.qcNo + ' ' + (STATUS_TH[q.status] || q.status) : '-'), body,
      btn('ยกเลิก', 'data-cancel') + btn('ยืนยันส่งมอบ', 'data-save', true));
    var $ = function (s) { return dlg.querySelector(s); };
    $('[data-cancel]').addEventListener('click', function () { openMachine(m); });
    $('[data-save]').addEventListener('click', async function () {
      var cid = $('#hCustomer').value;
      if (!cid) { page.toast('เลือกลูกค้าก่อน'); $('#hCustomer').focus(); return; }
      var b = $('[data-save]'); b.disabled = true; b.textContent = 'กำลังส่งมอบ…';
      var r = await sb().rpc('qc_handover', { p_machine_id: m.id, p_customer_id: cid, p_date: $('#hDate').value || null });
      b.disabled = false; b.textContent = 'ยืนยันส่งมอบ';
      if (r.error) { page.toast('ส่งมอบไม่สำเร็จ: ' + r.error.message); return; }
      await loadAll(); refreshList(); mirror();
      dlg.close();
      page.toast('ส่งมอบ ' + (m.imodeSn || machineName(m)) + ' แล้ว เครื่องจะแสดงใน Service');
    });
  }

  /* ---------- form ---------- */
  var draft = null;
  /* what blocks ผ่าน: unchecked or failed items, N/A without a reason, missing required photos */
  function passProblems(d) {
    var out = [], a = d.checklist || [];
    var open = a.filter(function (x) { return !x.result || x.result === 'Pending'; }).length;
    var fail = a.filter(function (x) { return x.result === 'Fail'; }).length;
    var na = a.map(function (x, i) { return x.result === 'N/A' && !String(x.remark || '').trim() ? i + 1 : 0; }).filter(Boolean);
    if (open) out.push('ยังไม่ได้ตรวจ ' + open + ' ข้อ');
    if (fail) out.push('มีข้อที่ไม่ผ่าน ' + fail + ' ข้อ');
    if (na.length) out.push('ข้อที่เลือก N/A ต้องใส่เหตุผลในหมายเหตุ (ข้อ ' + na.join(', ') + ')');
    if (core && INTAKE_TYPES.indexOf(d.type) >= 0) {
      var have = {}; (d.ev || []).forEach(function (e) { have[e.kind] = 1; });
      var lack = PHOTOS.filter(function (p) { return !have[p.kind]; }).map(function (p) { return p.th; });
      if (lack.length) out.push('รูปบังคับยังไม่ครบ: ' + lack.join(', '));
    }
    return out;
  }

  /* old: a saved record to edit; preset: fields for a new one; restore: an unsaved draft coming back from preview */
  async function openForm(old, preset, restore) {
    if (tableMissing) { warnSql(); page.toast('ยังบันทึกไม่ได้ ต้องสร้างตาราง QC ในฐานข้อมูลก่อน'); return; }
    old = old || null; preset = preset || {};
    var m0 = byId(db.machines, (old && old.machineId) || preset.machineId);
    draft = restore ? restore : old ? JSON.parse(JSON.stringify(old)) : {
      id: '', qcNo: nextNo(), type: TYPES.indexOf(preset.type) >= 0 ? preset.type : 'Pre-Delivery QC', qcDate: todayISO(), status: 'Draft',
      customerId: preset.customerId || (m0 && m0.customerId) || '', machineId: preset.machineId || '', caseId: preset.caseId || '',
      inspector: me(), reviewer: '', targetCompany: INTERNAL,
      checklist: freshChecklist(), findings: '', correctiveAction: '', note: '', media: [],
      assignedTo: me(), plannedDate: '', priority: 'normal', location: '', poNo: (m0 && m0.poNo) || '', projectNo: (m0 && m0.projectNo) || '',
      supplier: (m0 && m0.supplier) || '', receivedDate: (m0 && m0.receivedAt) || '', accessories: '', accessoriesMissing: '', accessoriesStatus: 'complete'
    };
    if (!draft.checklist || !draft.checklist.length) draft.checklist = freshChecklist();
    if (!restore) { draft.ev = draft.id ? evOf(draft.id).slice() : []; draft.evGone = []; }
    if (draft.ev.length) await sign(draft.ev.filter(function (e) { return !e.blobUrl; }));
    var C = core;
    var body = '<nav class="qc-steps" aria-label="ขั้นตอน">' +
      ['ข้อมูลงาน', C ? 'รูปบังคับ' : null, 'Checklist', 'หลักฐาน', 'สรุปผล'].filter(Boolean).map(function (s, i) {
        return '<a href="#qcStep' + (i + 1) + '" data-step="' + (i + 1) + '"><i>' + (i + 1) + '</i><span>' + esc(s) + '</span></a>';
      }).join('') + '</nav>' +
      '<form id="qcForm" class="qc-grid" novalidate>' +
      '<div class="qc-sec" id="qcStep1"><i>1</i> ข้อมูลงาน QC</div>' +
      '<label class="qc-f"><span>เลขที่ QC</span><input id="fNo" value="' + esc(draft.qcNo) + '" readonly></label>' +
      '<label class="qc-f"><span>ประเภท QC <b>*</b></span><select id="fType">' + TYPES.map(function (t) { return opt(t, TYPE_TH[t] + ' (' + t + ')', draft.type === t); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>วันที่ตรวจ <b>*</b></span><input id="fDate" type="date" value="' + esc(draft.qcDate) + '" required></label>' +
      '<label class="qc-f"><span>ลูกค้า <b class="qc-req-cu">*</b></span><select id="fCustomer">' + customerOptions(draft.customerId) + '</select></label>' +
      '<label class="qc-f"><span>เครื่องจักร <b>*</b></span><select id="fMachine"></select></label>' +
      '<label class="qc-f"><span>Service Case</span><select id="fCase"></select></label>' +
      '<label class="qc-f"><span>ผู้ตรวจ QC <b>*</b></span><input id="fInspector" value="' + esc(draft.inspector) + '" autocomplete="off"></label>' +
      '<label class="qc-f"><span>ผู้อนุมัติ</span><input id="fReviewer" value="' + esc(draft.reviewer) + '" autocomplete="off"></label>' +
      '<label class="qc-f"><span>QC เพื่อส่งให้บริษัท</span><input id="fTarget" value="' + esc(draft.targetCompany) + '" placeholder="เช่น ' + INTERNAL + '"></label>' +
      (C ? field('fAssigned', 'ผู้รับผิดชอบตรวจ', draft.assignedTo) + field('fPlanned', 'วันที่นัดตรวจ', draft.plannedDate, { type: 'date' }) +
        '<label class="qc-f"><span>ความเร่งด่วน</span><select id="fPriority">' + Object.keys(PRIORITY_TH).map(function (k) { return opt(k, PRIORITY_TH[k], draft.priority === k); }).join('') + '</select></label>' +
        field('fLocation', 'สถานที่ตรวจ', draft.location) + field('fPo', 'เลขที่ PO', draft.poNo) + field('fProject', 'เลขที่โครงการ', draft.projectNo) +
        field('fSupplier', 'ผู้ขาย / โรงงาน', draft.supplier) + field('fReceived', 'วันที่รับเครื่อง', draft.receivedDate, { type: 'date' }) +
        '<div class="qc-f qc-f-note" id="fSnBox"></div>' +
        '<label class="qc-f full"><span>อุปกรณ์ที่ได้รับ</span><textarea id="fAcc" class="is-short">' + esc(draft.accessories) + '</textarea></label>' +
        '<label class="qc-f full"><span>อุปกรณ์ที่ยังขาด / ค้างส่ง <small>เว้นว่างถ้าครบ</small></span><textarea id="fAccMiss" class="is-short">' + esc(draft.accessoriesMissing) + '</textarea></label>' : '') +
      (C ? '<div class="qc-sec" id="qcStep2"><i>2</i> รูปบังคับ 7 มุม <small>จำเป็นสำหรับตรวจรับเข้าและตรวจก่อนส่งมอบ แตะช่องเพื่อถ่ายหรือเลือกรูป</small></div>' +
        '<div class="qc-f full"><div class="qc-photos" id="fPhotos"></div></div>' : '') +
      '<div class="qc-sec" id="qcStep' + (C ? 3 : 2) + '"><i>' + (C ? 3 : 2) + '</i> รายการตรวจสอบ <small>เลือกผลแล้วระบบจะบันทึกชื่อผู้ตรวจและเวลาให้ N/A ต้องใส่เหตุผล</small></div>' +
      '<div class="qc-f full"><div class="qc-sum" id="fSum" aria-live="polite"></div><div class="qc-checks" id="fChecks"></div></div>' +
      '<div class="qc-sec" id="qcStep' + (C ? 4 : 3) + '"><i>' + (C ? 4 : 3) + '</i> สิ่งที่พบและหลักฐานเพิ่มเติม <small>รูปพิมพ์ลงเอกสารหน้า 2 วิดีโอและ PDF ไม่พิมพ์</small></div>' +
      '<label class="qc-f full"><span>สิ่งที่พบ / รายละเอียดปัญหา</span><textarea id="fFindings">' + esc(draft.findings) + '</textarea></label>' +
      '<div class="qc-f full"><span>รูปภาพ วิดีโอ และไฟล์ผลทดสอบ</span><div class="qc-media-tools">' +
        '<label class="sh-btn">' + icon('plus') + '<span>เพิ่มรูปภาพ</span><input type="file" accept="image/*" multiple data-media></label>' +
        '<label class="sh-btn">' + icon('plus') + '<span>เพิ่มวิดีโอ</span><input type="file" accept="video/*" multiple data-media></label>' +
        (C ? '<label class="sh-btn">' + icon('plus') + '<span>ไฟล์ผลทดสอบ (PDF)</span><input type="file" accept="application/pdf,image/*" multiple data-media data-kind="test"></label>' : '') +
        '<small>' + (C ? 'ไฟล์ละไม่เกิน ' + MAX_FILE_MB + ' MB รูปถูกย่อให้เล็กลงอัตโนมัติ' : 'รวมได้สูงสุด ' + MAX_MEDIA + ' ไฟล์ รูปถูกย่อให้เล็กลงอัตโนมัติ วิดีโอไม่เกิน ' + MAX_VIDEO_MB + ' MB') + '</small></div><div id="fMedia"></div></div>' +
      '<label class="qc-f full"><span>การแก้ไข / แนวทางดำเนินการ</span><textarea id="fCorrective">' + esc(draft.correctiveAction) + '</textarea></label>' +
      '<div class="qc-sec" id="qcStep' + (C ? 5 : 4) + '"><i>' + (C ? 5 : 4) + '</i> สรุปผล QC</div>' +
      '<label class="qc-f"><span>ผล QC</span><select id="fStatus">' +
        ['Draft', 'In Progress', 'Pass', 'Conditional', 'Fail'].map(function (s) { return opt(s, STATUS_TH[s], draft.status === s); }).join('') + '</select></label>' +
      '<div class="qc-f qc-f-wide"><div class="qc-gate" id="fGate" aria-live="polite"></div></div>' +
      '<label class="qc-f full"><span>หมายเหตุ / Release Note</span><textarea id="fNote">' + esc(draft.note) + '</textarea></label>' +
      '</form>';
    show(draft.id ? 'แก้ไข QC ' + draft.qcNo : 'สร้าง QC เครื่อง', 'ตรวจตามขั้นตอน 1 ถึง ' + (C ? 5 : 4) + ' แล้วบันทึก บันทึกระหว่างทางได้ตลอด', body,
      btn('ยกเลิก', 'data-cancel') + btn('ดูเอกสาร QC 2 หน้า', 'data-preview') + btn('บันทึก QC', 'data-save', true));

    var $ = function (s) { return dlg.querySelector(s); };
    function fillMachines() {
      var cid = $('#fCustomer').value;
      // machines still in QC have no customer yet, so they stay listed whatever customer is chosen
      var ms = db.machines.filter(function (m) { return !cid || String(m.customerId) === String(cid) || inQc(m) || String(m.id) === String(draft.machineId); });
      $('#fMachine').innerHTML = '<option value="">เลือกเครื่อง</option>' + ms.map(function (m) {
        return opt(m.id, (m.imodeSn ? m.imodeSn + ' · ' : '') + machineName(m) + ' · ' + (m.model || '-') + ' · S/N ' + (m.factorySn || m.serial || '-') + (inQc(m) ? ' (ใน QC)' : ''), String(m.id) === String(draft.machineId));
      }).join('');
      if (!ms.some(function (m) { return String(m.id) === String(draft.machineId); })) draft.machineId = '';
      fillCases(); drawSn();
    }
    function fillCases() {
      var cid = $('#fCustomer').value, mid = $('#fMachine').value;
      var cs = db.cases.filter(function (c) { return (!cid || c.customer_id === cid) && (!mid || c.machine_id === mid); });
      $('#fCase').innerHTML = '<option value="">ไม่ผูก Service Case</option>' + cs.map(function (c) {
        return opt(c.id, (c.ticket || c.id) + ' · ' + (c.status || ''), c.id === draft.caseId);
      }).join('');
    }
    function drawSn() {
      var box = $('#fSnBox'); if (!box) return;
      var m = byId(db.machines, $('#fMachine').value);
      box.innerHTML = m && (m.imodeSn || m.factorySn) ? '<span>เครื่องที่เลือก</span><div class="qc-sn"><b>' + esc(m.imodeSn || '–') + '</b><small>Factory S/N ' + esc(m.factorySn || m.serial || '–') + '</small></div>' : '';
      var cuStar = $('.qc-req-cu'); if (cuStar) cuStar.hidden = !!(m && inQc(m));
    }
    $('#fCustomer').addEventListener('change', function () { draft.customerId = this.value; fillMachines(); });
    $('#fMachine').addEventListener('change', function () {
      draft.machineId = this.value;
      var m = byId(db.machines, this.value);
      if (m && m.customerId && !$('#fCustomer').value) { $('#fCustomer').value = m.customerId; draft.customerId = m.customerId; fillMachines(); }
      if (m && C) {   // fill job fields from the machine record when still empty
        [['#fPo', 'poNo'], ['#fProject', 'projectNo'], ['#fSupplier', 'supplier'], ['#fReceived', 'receivedAt']].forEach(function (x) { if (!$(x[0]).value && m[x[1]]) $(x[0]).value = m[x[1]]; });
      }
      fillCases(); drawSn();
    });
    $('#fCase').addEventListener('change', function () { draft.caseId = this.value; });
    $('#fType').addEventListener('change', function () { draft.type = this.value; drawGate(); });
    $('#fStatus').addEventListener('change', function () { draft.status = this.value; drawGate(); });
    fillMachines();
    drawPhotos(); drawChecks(); drawMedia(); drawGate();
    $('#qcForm').addEventListener('input', function () { dlg.dataset.dirty = '1'; });
    $('#qcForm').addEventListener('change', function () { dlg.dataset.dirty = '1'; });
    $('#fFindings').addEventListener('change', drawGate);
    [].forEach.call(dlg.querySelectorAll('[data-media]'), function (inp) { inp.addEventListener('change', addMedia); });
    dlg.querySelector('.qc-steps').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-step]'); if (!a) return;
      e.preventDefault();
      var t = dlg.querySelector(a.getAttribute('href')), bd = dlg.querySelector('.qc-dlg-body'), nav = dlg.querySelector('.qc-steps');
      if (t) bd.scrollTo({ top: Math.max(0, t.getBoundingClientRect().top - bd.getBoundingClientRect().top + bd.scrollTop - nav.offsetHeight - 8), behavior: 'smooth' });
    });
    $('[data-cancel]').addEventListener('click', function () { if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) return; dlg.close(); });
    $('[data-preview]').addEventListener('click', function () { readForm(); openDoc(draft, true); });
    $('[data-save]').addEventListener('click', save);
    if (restore) dlg.dataset.dirty = '1';
  }

  function drawGate() {
    var host = dlg.querySelector('#fGate'); if (!host) return;
    var st = dlg.querySelector('#fStatus').value, probs = passProblems(draft);
    var steps = dlg.querySelectorAll('.qc-steps a');
    if (steps.length) {   // tick the steps that are complete
      var have = {}; (draft.ev || []).forEach(function (e) { have[e.kind] = 1; });
      var photosOk = PHOTOS.every(function (p) { return have[p.kind]; }), s = stats(draft);
      var fnd = dlg.querySelector('#fFindings'), extra = !!((fnd && fnd.value.trim()) || draft.media.length || (draft.ev || []).some(function (e) { return e.kind === 'extra' || e.kind === 'test'; }));
      var done = core ? [!!draft.machineId, photosOk, s.done === s.total, extra, st !== 'Draft'] : [!!draft.machineId, s.done === s.total, extra, st !== 'Draft'];
      [].forEach.call(steps, function (a, i) { a.classList.toggle('is-done', !!done[i]); });
    }
    if (st === 'Conditional') host.innerHTML = '<p class="qc-hint tone-orange">' + icon('alert') + '<span>ผ่านแบบมีเงื่อนไข <b>ไม่นับเป็นผ่าน</b> ส่งมอบเครื่องไม่ได้จนกว่าจะแก้ไข ตรวจซ้ำ และได้ผลผ่าน</span></p>';
    else if (st === 'Pass' && probs.length) host.innerHTML = '<p class="qc-hint tone-red">' + icon('alert') + '<span>ยังบันทึกเป็น "ผ่าน" ไม่ได้: ' + esc(probs.join(' · ')) + '</span></p>';
    else if (st === 'Pass') host.innerHTML = '<p class="qc-hint tone-green">' + icon('check') + '<span>ครบเงื่อนไขผ่าน QC แล้ว</span></p>';
    else host.innerHTML = probs.length ? '<p class="qc-hint">' + icon('clock') + '<span>ก่อนบันทึกเป็น "ผ่าน" ต้อง: ' + esc(probs.join(' · ')) + '</span></p>' : '<p class="qc-hint tone-green">' + icon('check') + '<span>ครบเงื่อนไขผ่าน QC แล้ว เลือกผล "ผ่าน" ได้</span></p>';
  }

  /* the seven required photo slots */
  function drawPhotos() {
    var host = dlg.querySelector('#fPhotos'); if (!host) return;
    host.innerHTML = PHOTOS.map(function (p) {
      var e = (draft.ev || []).filter(function (x) { return x.kind === p.kind; }).slice(-1)[0], url = e && evUrl(e);
      return '<div class="qc-photo' + (e ? ' has-file' : '') + '">' +
        '<label>' + (url ? '<img src="' + esc(url) + '" alt="' + esc(p.th) + '">' : '<span class="qc-photo-empty">' + icon('plus') + '<em>ถ่าย / เลือกรูป</em></span>') +
        '<input type="file" accept="image/*" capture="environment" data-kind="' + p.kind + '" aria-label="รูป' + esc(p.th) + '"></label>' +
        '<div class="qc-photo-cap"><span>' + esc(p.th) + '</span>' + (e ? '<button type="button" data-drop="' + p.kind + '">ลบ</button>' : '<b>ต้องมี</b>') + '</div></div>';
    }).join('');
    host.onchange = async function (e) {
      var inp = e.target; if (!inp.matches('input[data-kind]')) return;
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      if (!/^image\//.test(f.type)) { page.toast('ช่องนี้รับเฉพาะรูปภาพ'); return; }
      var kind = inp.dataset.kind;
      (draft.ev || []).filter(function (x) { return x.kind === kind; }).forEach(dropEv);
      var item = await pendingFile(f, kind); if (!item) return;
      draft.ev.push(item); dlg.dataset.dirty = '1'; drawPhotos(); drawGate();
    };
    host.onclick = function (e) {
      var b = e.target.closest('[data-drop]'); if (!b) return;
      (draft.ev || []).filter(function (x) { return x.kind === b.dataset.drop; }).forEach(dropEv);
      dlg.dataset.dirty = '1'; drawPhotos(); drawGate();
    };
  }
  function dropEv(e) {
    draft.ev = draft.ev.filter(function (x) { return x !== e; });
    if (e.pending) { try { URL.revokeObjectURL(e.blobUrl); } catch (x) {} } else draft.evGone.push(e);
  }
  /* a picked file becomes a pending evidence item; it is uploaded when the QC is saved */
  async function pendingFile(f, kind) {
    try {
      var blob = f, mime = f.type || 'application/octet-stream';
      if (/^image\//.test(mime)) { var s = await shrink(f); blob = dataUrlBlob(s.data); mime = blob.type; }
      if (blob.size > MAX_FILE_MB * 1024 * 1024) { page.toast('ไฟล์ ' + f.name + ' ใหญ่เกิน ' + MAX_FILE_MB + ' MB'); return null; }
      return { pending: true, kind: kind, blob: blob, name: f.name, mime: mime, size: blob.size, blobUrl: URL.createObjectURL(blob) };
    } catch (err) { page.toast('อ่านไฟล์ ' + f.name + ' ไม่ได้'); return null; }
  }
  function dataUrlBlob(u) {
    var parts = String(u).split(','), mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1] || ''), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function drawChecks() {
    var host = dlg.querySelector('#fChecks');
    var P = [['Pending', 'รอตรวจ', 'p-pending'], ['Pass', 'ผ่าน', 'p-pass'], ['Fail', 'ไม่ผ่าน', 'p-fail'], ['N/A', 'N/A', 'p-na']];
    host.innerHTML = draft.checklist.map(function (it, i) {
      var naMiss = it.result === 'N/A' && !String(it.remark || '').trim();
      return '<div class="qc-check" data-i="' + i + '"><span class="qc-check-n">' + (i + 1) + '</span>' +
        '<div class="qc-check-t"><b>' + esc(it.labelTh) + '</b><small>' + esc(it.labelEn) + '</small>' +
        '<small class="qc-stamp">' + (it.checkedBy ? 'ตรวจโดย ' + esc(it.checkedBy) + ' · ' + esc(thTime(it.checkedAt)) : '') + '</small></div>' +
        '<div class="qc-pills" role="group" aria-label="ผลข้อ ' + (i + 1) + '">' + P.map(function (p) {
          return '<button type="button" class="' + p[2] + '" data-r="' + p[0] + '" aria-pressed="' + (it.result === p[0]) + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="qc-check-v">' +
          '<input data-k="measured" placeholder="ค่าที่วัดได้" value="' + esc(it.measured || '') + '" aria-label="ค่าที่วัดได้ ข้อ ' + (i + 1) + '">' +
          '<input data-k="standard" placeholder="ค่ามาตรฐาน" value="' + esc(it.standard || '') + '" aria-label="ค่ามาตรฐาน ข้อ ' + (i + 1) + '">' +
          '<input data-k="remark" placeholder="' + (it.result === 'N/A' ? 'เหตุผลที่ N/A (จำเป็น)' : 'หมายเหตุ') + '" value="' + esc(it.remark || '') + '"' + (naMiss ? ' aria-invalid="true"' : '') + ' aria-label="หมายเหตุข้อ ' + (i + 1) + '">' +
        '</div></div>';
    }).join('');
    host.onclick = function (e) {
      var b = e.target.closest('button[data-r]'); if (!b) return;
      var row = b.closest('.qc-check'), i = +row.dataset.i, it = draft.checklist[i];
      it.result = b.dataset.r;
      if (it.result === 'Pending') { it.checkedBy = ''; it.checkedAt = ''; }
      else { it.checkedBy = me(); it.checkedAt = new Date().toISOString(); }
      [].forEach.call(row.querySelectorAll('button[data-r]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      row.querySelector('.qc-stamp').textContent = it.checkedBy ? 'ตรวจโดย ' + it.checkedBy + ' · ' + thTime(it.checkedAt) : '';
      var rm = row.querySelector('[data-k="remark"]');
      rm.placeholder = it.result === 'N/A' ? 'เหตุผลที่ N/A (จำเป็น)' : 'หมายเหตุ';
      if (it.result === 'N/A' && !rm.value.trim()) { rm.setAttribute('aria-invalid', 'true'); rm.focus(); } else rm.removeAttribute('aria-invalid');
      dlg.dataset.dirty = '1'; drawSum(); drawGate();
    };
    host.oninput = function (e) {
      var k = e.target.dataset.k; if (!k) return;
      var it = draft.checklist[+e.target.closest('.qc-check').dataset.i];
      it[k] = e.target.value;
      if (k === 'remark') { if (it.result === 'N/A' && !e.target.value.trim()) e.target.setAttribute('aria-invalid', 'true'); else e.target.removeAttribute('aria-invalid'); drawGate(); }
    };
    drawSum();
  }
  function drawSum() {
    var st = stats(draft);
    dlg.querySelector('#fSum').innerHTML = '<div>ตรวจแล้ว<b>' + st.done + '/' + st.total + '</b></div><div>ผ่าน<b>' + st.pass + '</b></div><div>ไม่ผ่าน<b>' + st.fail + '</b></div>';
  }

  /* extra evidence: Storage files (02 run) and, on older QC, base64 media kept in the row */
  function drawMedia() {
    var host = dlg.querySelector('#fMedia');
    var files = (draft.ev || []).filter(function (e) { return e.kind === 'extra' || e.kind === 'test'; });
    if (!draft.media.length && !files.length) { host.innerHTML = '<div class="qc-media-empty">ยังไม่มีรูปภาพ วิดีโอ หรือไฟล์</div>'; return; }
    var fig = function (attr, mime, url, name) {
      var inner = /^video\//.test(mime || '') ? '<video src="' + esc(url) + '" controls preload="metadata"></video>'
        : /^image\//.test(mime || '') ? '<img src="' + esc(url) + '" alt="' + esc(name) + '">'
        : '<a class="qc-file" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + '<span>PDF</span></a>';
      return '<figure>' + inner + '<figcaption><span>' + esc(name) + '</span><button type="button" ' + attr + '>ลบ</button></figcaption></figure>';
    };
    host.innerHTML = '<div class="qc-media">' +
      draft.media.map(function (f, i) { return fig('data-del="' + i + '"', f.type, f.data, f.name || 'ไฟล์ ' + (i + 1)); }).join('') +
      files.map(function (e) { return fig('data-ev="' + draft.ev.indexOf(e) + '"', e.mime, evUrl(e), (e.kind === 'test' ? 'ผลทดสอบ · ' : '') + (e.name || 'ไฟล์')); }).join('') + '</div>';
    host.onclick = function (e) {
      var b = e.target.closest('[data-del],[data-ev]'); if (!b) return;
      if (b.dataset.del != null) draft.media.splice(+b.dataset.del, 1);
      else dropEv(draft.ev[+b.dataset.ev]);
      dlg.dataset.dirty = '1'; drawMedia(); drawGate();
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
    var files = [].slice.call(e.target.files || []), kind = e.target.dataset.kind || 'extra'; e.target.value = '';
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (core) {   // to Storage on save
        if (!/^(image|video)\//.test(f.type) && f.type !== 'application/pdf') { page.toast('รับเฉพาะรูป วิดีโอ หรือ PDF'); continue; }
        var item = await pendingFile(f, /^video\//.test(f.type) ? 'extra' : kind);
        if (item) draft.ev.push(item);
        continue;
      }
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
    dlg.dataset.dirty = '1'; drawMedia(); drawGate();
  }

  function readForm() {
    var $ = function (s) { return dlg.querySelector(s); }, v = function (s) { var x = $(s); return x ? x.value.trim() : ''; };
    if (!$('#qcForm')) return;
    draft.type = $('#fType').value; draft.qcDate = $('#fDate').value; draft.customerId = $('#fCustomer').value;
    draft.machineId = $('#fMachine').value; draft.caseId = $('#fCase').value; draft.inspector = v('#fInspector');
    draft.reviewer = v('#fReviewer'); draft.status = $('#fStatus').value; draft.targetCompany = v('#fTarget');
    draft.findings = v('#fFindings'); draft.correctiveAction = v('#fCorrective'); draft.note = v('#fNote');
    if ($('#fAssigned')) {
      draft.assignedTo = v('#fAssigned'); draft.plannedDate = v('#fPlanned'); draft.priority = $('#fPriority').value; draft.location = v('#fLocation');
      draft.poNo = v('#fPo'); draft.projectNo = v('#fProject'); draft.supplier = v('#fSupplier'); draft.receivedDate = v('#fReceived');
      draft.accessories = v('#fAcc'); draft.accessoriesMissing = v('#fAccMiss');
    }
  }

  async function upsertDraft(status) {
    var row = toRow(draft); if (status) row.status = status;
    return sb().from('qc_records').upsert(row, { onConflict: 'id' }).select().single();
  }
  async function save() {
    readForm();
    var m = byId(db.machines, draft.machineId);
    var miss = !draft.customerId && !inQc(m) ? '#fCustomer' : !draft.machineId ? '#fMachine' : !draft.qcDate ? '#fDate' : !draft.inspector ? '#fInspector' : '';
    if (miss) { page.toast('กรอกช่องที่มี * ให้ครบ'); dlg.querySelector(miss).focus(); return; }
    if (draft.status === 'Pass') {
      var probs = passProblems(draft);
      if (probs.length) { page.toast('ยังบันทึกเป็นผ่านไม่ได้: ' + probs[0]); drawGate(); dlg.querySelector('#fGate').scrollIntoView({ block: 'nearest' }); return; }
    }
    if (draft.status === 'Draft' && stats(draft).done > 0) draft.status = 'In Progress';
    var b = dlg.querySelector('[data-save]'), label = function (t) { b.textContent = t; };
    b.disabled = true; label('กำลังบันทึก…');
    var isNew = !draft.id;
    if (isNew) { draft.id = uid(); draft.qcNo = nextNo(); }
    var pend = (draft.ev || []).filter(function (e) { return e.pending; });
    // with files still to upload, "Pass" is written only after every file is in place
    var first = draft.status === 'Pass' && pend.length ? 'In Progress' : null;
    var r = await upsertDraft(first);
    if (r.error && isNew && /qc_no/.test(r.error.message || '')) {          // someone took this number a moment ago
      await loadAll(); draft.qcNo = nextNo();
      r = await upsertDraft(first);
    }
    if (r.error) { b.disabled = false; label('บันทึก QC'); if (isNew) draft.id = ''; page.toast('บันทึกไม่สำเร็จ: ' + r.error.message); return; }

    var failed = 0, store = sb().storage.from(BUCKET);
    for (var i = 0; i < pend.length; i++) {
      var e = pend[i], ext = (String(e.name).match(/\.([a-z0-9]{1,5})$/i) || [])[1] || (e.mime.split('/')[1] || 'bin');
      var path = draft.id + '/' + e.kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext.toLowerCase();
      label('กำลังอัปโหลดไฟล์ ' + (i + 1) + '/' + pend.length + '…');
      var up = await store.upload(path, e.blob, { contentType: e.mime, upsert: false });
      if (up.error) { failed++; continue; }
      var ins = await sb().from('qc_evidence').insert({ qc_id: draft.id, machine_id: draft.machineId || null, kind: e.kind, path: path, name: e.name || '', mime: e.mime, size: e.size || 0 }).select().single();
      if (ins.error) { failed++; store.remove([path]); continue; }
      e.pending = false; Object.assign(e, ins.data);
    }
    for (var j = 0; j < (draft.evGone || []).length; j++) {
      var g = draft.evGone[j];
      var del = await sb().from('qc_evidence').delete().eq('id', g.id);
      if (!del.error) store.remove([g.path]);
    }
    draft.evGone = [];
    if (first && !failed) r = await upsertDraft();
    b.disabled = false; label('บันทึก QC');
    if (r.error) { page.toast('บันทึกผลไม่สำเร็จ: ' + r.error.message); return; }

    await loadAll(); refreshList(); mirror();
    var saved = byId(db.qc, draft.id) || fromRow(r.data);
    if (failed) {
      page.toast('บันทึก ' + saved.qcNo + ' แล้ว แต่อัปโหลดไฟล์ไม่สำเร็จ ' + failed + ' ไฟล์' + (first ? ' ผลจึงยังเป็น "กำลังตรวจ"' : '') + ' ลองเพิ่มใหม่อีกครั้ง');
      openForm(saved);
      return;
    }
    dlg.dataset.dirty = ''; dlg.close();
    page.toast('บันทึก ' + saved.qcNo + ' แล้ว');
  }

  /* ---------- the two-page Thai document (Service js/05 qcDocHTML layout) ---------- */
  function docHTML(q, evs) {
    var m = byId(db.machines, q.machineId) || {}, cu = byId(db.customers, q.customerId || m.customerId) || {}, c = byId(db.cases, q.caseId), st = stats(q), S = db.settings || {};
    var order = {}; PHOTOS.forEach(function (p, i) { order[p.kind] = i; });
    var evPics = (evs || []).filter(function (e) { return /^image\//.test(e.mime || '') && evUrl(e); })
      .sort(function (a, b) { return (a.kind in order ? order[a.kind] : 99) - (b.kind in order ? order[b.kind] : 99); })
      .map(function (e) { return { src: evUrl(e), name: (KIND_TH[e.kind] || '') + (e.kind === 'extra' || e.kind === 'test' ? ' · ' + (e.name || '') : '') }; });
    var pics = evPics.concat((q.media || []).filter(function (x) { return /^image\//.test(String(x.type || '')); }).map(function (x) { return { src: x.data, name: x.name || 'รูปประกอบ QC' }; }));
    var rows = (q.checklist || []).map(function (it, i) {
      var val = [it.measured ? 'วัดได้ ' + it.measured : '', it.standard ? 'มาตรฐาน ' + it.standard : '', it.remark || ''].filter(Boolean).join(' · ');
      return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(it.labelTh || it.labelEn || it.id) + '</td><td class="result">' + esc(STATUS_TH[it.result] || it.result || '-') + '</td><td class="remark">' + esc(val || '-') + '</td></tr>';
    }).join('');
    var company = esc(S.companyNameTh || S.companyName || INTERNAL), address = esc(S.companyAddress || ''), phone = esc(S.companyPhone || '-'), email = esc(S.companyEmail || '-');
    var mName = esc(machineName(m) || '-'), model = esc(m.model || '-'), serial = esc(m.factorySn || m.serial || '-'), customer = esc(cu.name || '-'), target = esc(q.targetCompany || INTERNAL);
    var imodeSn = m.imodeSn ? '<br><b>IMODE S/N:</b> ' + esc(m.imodeSn) : '', po = q.poNo ? '<br><b>PO / ผู้ขาย:</b> ' + esc(q.poNo) + (q.supplier ? ' / ' + esc(q.supplier) : '') : '';
    var ticket = esc((c && c.ticket) || '-'), type = esc(TYPE_TH[q.type] || q.type || '-'), result = esc(STATUS_TH[q.status] || q.status);
    if (q.status === 'Conditional') result += ' (ยังไม่นับเป็นผ่าน)';
    var n = pics.length > 6 ? 8 : 6;
    var slots = Array.apply(null, Array(n)).map(function (_, i) {
      var x = pics[i];
      return '<div class="qc-photo-slot"><div class="photo-stage">' + (x ? '<img src="' + esc(x.src) + '" alt="รูปประกอบ QC ' + (i + 1) + '">' : '<div class="photo-empty">ช่องรูปภาพ ' + (i + 1) + '<br>ปัญหา / ความเสียหาย / อุปกรณ์ไม่ครบ</div>') +
        '</div><div class="photo-caption">' + (x ? 'รูปที่ ' + (i + 1) + ' · ' + esc(x.name) : 'รูปที่ ' + (i + 1) + ' · ยังไม่มีรูป') + '</div></div>';
    }).join('');
    var head = function (title, pageName, sub) {
      return '<div class="qc-doc-page-head"><img src="' + esc(DOC_LOGO) + '" alt="I-MODE"><div><h1>' + title + '</h1><div class="page-name">' + pageName + '</div><div class="qc-doc-company"><b>' + company + '</b><br>' + sub + '</div></div></div>';
    };
    return '<div class="qc-doc-stack" id="qcPrintDoc">' +
      '<section class="qc-doc-page qc-doc-page-1">' + head('ใบตรวจสอบคุณภาพเครื่องจักร (QC)', 'หน้าที่ 1 / 2 — รายการตรวจสอบ', address + '<br>โทร. ' + phone + ' · ' + email) +
        '<div class="qc-doc-info"><div><b>เลขที่ QC:</b> ' + esc(q.qcNo || '-') + '<br><b>ประเภทการตรวจ:</b> ' + type + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>เลขที่งานบริการ:</b> ' + ticket + po + '</div>' +
        '<div><b>ลูกค้า:</b> ' + customer + '<br><b>เอกสารส่งให้:</b> ' + target + '<br><b>เครื่องจักร:</b> ' + mName + '<br><b>รุ่น / หมายเลขเครื่อง:</b> ' + model + ' / ' + serial + imodeSn + '</div></div>' +
        '<table class="qc-doc-table"><thead><tr><th class="n">ลำดับ</th><th>รายการตรวจสอบ</th><th class="result">ผลการตรวจ</th><th class="remark">ค่าที่วัด / หมายเหตุ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="qc-doc-summary"><div><b>สรุปรายการตรวจ:</b> ตรวจแล้ว ' + st.done + '/' + st.total + ' รายการ · ผ่าน ' + st.pass + ' รายการ · ไม่ผ่าน ' + st.fail + ' รายการ' +
          (q.accessoriesMissing ? '<br><b>อุปกรณ์ค้างส่ง:</b> ' + esc(q.accessoriesMissing) : '') + '</div>' +
        '<div><b>ผล QC:</b> ' + result + '<br><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผู้อนุมัติ:</b> ' + esc(q.reviewer || '-') + '</div></div>' +
        '<div class="qc-doc-sign"><div><b>ผู้ตรวจ QC</b><div>วันที่ ....................</div></div><div><b>ฝ่ายบริการ / เทคนิค</b><div>วันที่ ....................</div></div><div><b>ผู้อนุมัติ / ผู้รับมอบ</b><div>วันที่ ....................</div></div></div>' +
      '</section>' +
      '<section class="qc-doc-page qc-doc-page-2">' + head('ภาพประกอบการตรวจ QC', 'หน้าที่ 2 / 2 — หลักฐานประกอบการตรวจ QC', 'เลขที่ QC ' + esc(q.qcNo || '-') + ' · ' + mName + ' · ' + model + ' · S/N ' + serial + (m.imodeSn ? ' · ' + esc(m.imodeSn) : '')) +
        '<div class="qc-doc-info"><div><b>ลูกค้า:</b> ' + customer + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>ประเภทการตรวจ:</b> ' + type + '</div>' +
        '<div><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผล QC:</b> ' + result + '<br><b>เลขที่งานบริการ:</b> ' + ticket + '</div></div>' +
        '<div class="qc-doc-note-grid"><div class="qc-doc-note-box"><b>สิ่งที่พบ / รายละเอียดปัญหา</b>' + esc(q.findings || '-') + '</div><div class="qc-doc-note-box"><b>การแก้ไข / แนวทางดำเนินการ</b>' + esc(q.correctiveAction || '-') + '</div><div class="qc-doc-note-box full"><b>หมายเหตุเพิ่มเติม</b>' + esc(q.note || '-') + '</div></div>' +
        '<div class="qc-doc-section-title">รูปภาพประกอบ</div><div class="qc-photo-sheet' + (n === 8 ? ' is-8' : '') + '">' + slots + '</div>' +
        (pics.length > n ? '<div class="qc-photo-extra">มีรูปเพิ่มเติมในข้อมูล QC อีก ' + (pics.length - n) + ' รูป</div>' : '') +
      '</section></div>';
  }

  async function openDoc(q, isDraft) {
    var back = isDraft ? draft : null;
    var evs = isDraft ? (draft.ev || []) : evOf(q.id);
    await sign(evs.filter(function (e) { return !e.blobUrl; }));
    show(isDraft ? 'ตัวอย่างเอกสาร QC' : 'QC ' + q.qcNo, isDraft ? 'ยังไม่ได้บันทึก' : (TYPE_TH[q.type] || q.type) + ' · ' + (STATUS_TH[q.status] || q.status),
      '<div class="qc-doc-wrap">' + docHTML(q, evs) + '</div>',
      (isDraft ? btn('กลับไปแก้ไข', 'data-back') : btn('ปิด', 'data-cancel')) + btn('พิมพ์ / PDF', 'data-print') + (isDraft ? '' : btn('แก้ไข', 'data-edit', true)));
    var $ = function (s) { return dlg.querySelector(s); };
    if ($('[data-cancel]')) $('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if ($('[data-back]')) $('[data-back]').addEventListener('click', function () { openForm(null, null, back); });
    if ($('[data-edit]')) $('[data-edit]').addEventListener('click', function () { openForm(q); });
    $('[data-print]').addEventListener('click', function () { printDoc(q, evs); });
  }
  function printDoc(q, evs) {
    var w = window.open('', '_blank', 'width=1100,height=900');
    if (!w) { page.toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up'); return; }
    w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เอกสาร QC ' + esc(q.qcNo || '') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700;800&display=swap"><link rel="stylesheet" href="' + esc(DOC_CSS) + '">' +
      '<style>body{margin:0;background:#fff}</style></head><body>' + docHTML(q, evs) +
      '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>');
    w.document.close();
  }

  handleLink();   // last: the dialog and form above must exist first
})();
