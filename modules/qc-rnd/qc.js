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
   list there without photos (mirror()), and Service js/137 refreshes it on the case page.

   2026-11-07 V3.1 phase 1 "Head QC อนุมัติ" (supabase/03-qc-roles-audit.sql + 04-qc-approval.sql):
     - the technician can no longer pick ผ่าน / ผ่านแบบมีเงื่อนไข. The form saves รอตรวจ / กำลังตรวจ /
       ไม่ผ่าน and has "ส่งให้ Head QC อนุมัติ" (qc_submit; the server checks the same gate again);
     - tab รออนุมัติ: queue + detail (gate from qc_gate, required photos, history from qc_approvals);
       Head QC approves (→ ผ่าน, machine → ready), returns with a reason (→ ส่งกลับแก้) or rejects
       (→ ไม่ผ่าน) through qc_decide. Nobody approves a QC they made or sent;
     - a QC waiting for or past approval is locked; Head QC can re-open an approved one with a reason
       (qc_reopen, revision + 1) and Head QC / Admin QC can cancel one instead of deleting (qc_cancel);
     - Service may open this module again (meeting 2026-11-03): Service shows in the sidebar, and a
       page opened from a Service case (?case= or ?from=service) gets a "กลับไป Service" button.
   Without 04 run the page keeps the phase-1 behaviour above.

   2026-11-07 V3.1 phase 2 (supabase/05-qc-ncr.sql, 06-qc-po-stock.sql, 07-qc-release.sql) — each part shows
   only once its file is in the database:
     - NCR (STEP 04 FAIL): a failed checklist item opens an NCR (qc_ncr_open); tab NCR walks it through
       analyse + plan (Before photo) → Head QC approves the plan → fixed (After photo) → Re-QC → Head QC
       closes it; the item then passes and the QC can be sent for approval again;
     - PO / Stock (STEP 01–02): tab "PO / อุปกรณ์ค้าง" keeps POs and the outstanding accessories; รับเครื่องเข้า QC
       records the Stock receipt (qc_receive). Purchasing and Stock do not use the system yet, so QC records
       their steps on their behalf with the real person's name;
     - Release (STEP 06): tab ส่งมอบ: delivery plan (approved by Purchasing, recorded on behalf) → Head QC
       confirms the release → via Stock or direct → receiver's signature photo → delivered (Service takes over).

   2026-11-12 QC meeting fixes (owner OK'd the mockup; supabase/09-qc-meeting-fixes.sql):
     - photos are optional (the server gate no longer asks for them); two switches turn the Factory S/N and
       IMODE S/N plate photos on or off (photo_opts); both off also drops checklist item "Model / Serial / Nameplate";
     - accessories are a list, one row per item with its own photos (qc_evidence kind 'accessories',
       check_id 'acc:<key>'); stored in qc_records.accessories as lines "name | qty | #key";
     - checklist rows keep only the result and a note (older QC still print their measured / standard values);
     - รับเครื่องเข้า QC no longer asks for supplier, PO or project (tab "PO" is gone, outstanding accessories stay);
       ผู้รับเครื่อง / ผู้ส่งมอบ (received_by / delivered_by); สถานที่ตรวจ typed or picked from a list;
     - customer and machine are searchable and can be added from QC;
     - status "ผ่าน" is back: Head QC who did not make or inspect the QC passes it at once (qc_pass),
       anyone else sends it to Head QC;
     - the document prints photos as small thumbnails under headings. */
(async function () {
  'use strict';
  var esc = ImodeShell.esc, icon = ImodeShell.icon;
  var LEGACY_KEY = 'imode_v66_qc_records';
  var DOC_LOGO = new URL('../service/assets/imode-document-logo.webp', location.href).href;
  var DOC_CSS = new URL('qc-doc.css?v=20261112', location.href).href;
  var BUCKET = 'qc-evidence';
  var SQL_FILE = 'modules/qc-rnd/supabase/02-qc-core.sql';
  var SQL_APPROVAL = 'modules/qc-rnd/supabase/03-qc-roles-audit.sql และ 04-qc-approval.sql';
  var SERVICE_URL = '../service/index.html';
  var SQL_MEET = 'modules/qc-rnd/supabase/09-qc-meeting-fixes.sql';

  var TYPES = ['Incoming Inspection', 'Pre-Delivery QC', 'Post-Service QC', 'Installation Acceptance', 'PM Verification'];
  var TYPE_TH = { 'Incoming Inspection': 'ตรวจรับเข้า', 'Pre-Delivery QC': 'ตรวจก่อนส่งมอบ', 'Post-Service QC': 'ตรวจหลังซ่อม', 'Installation Acceptance': 'ตรวจรับหลังติดตั้ง', 'PM Verification': 'ตรวจยืนยัน PM' };
  var INTAKE_TYPES = ['Incoming Inspection', 'Pre-Delivery QC'];
  var STATUS_TH = { Pending: 'รอตรวจ', Draft: 'รอตรวจ', 'In Progress': 'กำลังตรวจ', Pass: 'ผ่าน', Conditional: 'ผ่านแบบมีเงื่อนไข', Fail: 'ไม่ผ่าน', 'N/A': 'ไม่เกี่ยวข้อง',
    'Pending Approval': 'รอ Head QC อนุมัติ', Returned: 'ส่งกลับแก้', Cancelled: 'ยกเลิก' };
  var STATUS_TONE = { 'รอตรวจ': 'grey', 'กำลังตรวจ': 'orange', 'ผ่าน': 'green', 'ผ่านแบบมีเงื่อนไข': 'orange', 'ไม่ผ่าน': 'red',
    'รอ Head QC อนุมัติ': 'blue', 'ส่งกลับแก้': 'red', 'ยกเลิก': 'grey' };
  /* after 04: statuses only the server sets; a QC in one of LOCKED cannot be edited */
  var LOCKED = ['Pending Approval', 'Pass', 'Cancelled', 'Conditional'];
  var DECISION_TH = { submit: 'ส่งอนุมัติ', approve: 'อนุมัติ QC PASS', 'return': 'ส่งกลับแก้', reject: 'ไม่อนุมัติ (ไม่ผ่าน)', reopen: 'เปิดแก้', cancel: 'ยกเลิกใบ QC', legacy: 'ผ่านก่อนมีขั้นอนุมัติ' };
  var PRIORITY_TH = { normal: 'ปกติ', urgent: 'ด่วน', critical: 'ด่วนมาก' };
  var STAGE_TH = { qc: 'อยู่ระหว่าง QC', ready: 'ผ่าน QC รอส่งมอบ', delivered: 'ส่งมอบแล้ว (Service ดูแล)' };
  var STAGE_TONE = { 'อยู่ระหว่าง QC': 'orange', 'ผ่าน QC รอส่งมอบ': 'green', 'ส่งมอบแล้ว (Service ดูแล)': 'grey', 'เครื่องของลูกค้า': 'grey' };
  /* the seven photos every ตรวจรับเข้า / ตรวจก่อนส่งมอบ must have (spec STEP 04) */
  var PHOTOS = [
    { kind: 'front', th: 'ด้านหน้า' }, { kind: 'back', th: 'ด้านหลัง' }, { kind: 'left', th: 'ด้านซ้าย' }, { kind: 'right', th: 'ด้านขวา' },
    { kind: 'factoryPlate', th: 'ป้ายชื่อโรงงาน (Factory S/N)' }, { kind: 'imodePlate', th: 'ป้าย IMODE S/N' }
  ];
  var PLATES = ['factoryPlate', 'imodePlate'];   // the two photos with an on/off switch (2026-11-12)
  var LOC_PRESET = ['QC Area', 'คลังสินค้า', 'หน้างานลูกค้า'];
  var KIND_TH = { extra: 'รูป / ไฟล์เพิ่มเติม', test: 'ผลทดสอบ', before: 'ก่อนแก้ (Before)', after: 'หลังแก้ (After)', recheck: 'Re-QC',
    signature: 'ลายเซ็นผู้รับ', delivery: 'รูปส่งมอบ' };
  PHOTOS.forEach(function (p) { KIND_TH[p.kind] = p.th; });
  KIND_TH.accessories = 'อุปกรณ์ที่มากับเครื่อง';
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

  var db = { qc: [], customers: [], machines: [], cases: [], settings: {}, ev: [], appr: [],
    ncr: [], ncrEv: [], rechecks: [], po: [], receipts: [], acc: [], rel: [] };
  var ncrOn = false, poOn = false, relOn = false;   // 05 / 06 / 07 are in the database
  var NCR_TH = { Open: 'รอวิเคราะห์ / เสนอแผน', 'Plan Submitted': 'รอ Head QC อนุมัติแผน', 'Plan Approved': 'กำลังแก้ไข',
    'Waiting Re-QC': 'รอตรวจซ้ำ (Re-QC)', 'Re-QC Passed': 'รอ Head QC ปิด NCR', Closed: 'ปิดแล้ว', Cancelled: 'ยกเลิก' };
  var NCR_TONE = { 'รอวิเคราะห์ / เสนอแผน': 'red', 'รอ Head QC อนุมัติแผน': 'blue', 'กำลังแก้ไข': 'orange', 'รอตรวจซ้ำ (Re-QC)': 'orange',
    'รอ Head QC ปิด NCR': 'blue', 'ปิดแล้ว': 'green', 'ยกเลิก': 'grey' };
  var NCR_STEPS = ['Open', 'Plan Submitted', 'Plan Approved', 'Waiting Re-QC', 'Re-QC Passed', 'Closed'];
  var SEV_TH = { Critical: 'วิกฤต', Major: 'สำคัญ', Minor: 'เล็กน้อย' };
  var REL_TH = { none: 'รอวางแผนส่ง', Planned: 'รอ Head QC ยืนยัน Release', 'Released:stock': 'Release แล้ว รอ Stock รับ', 'Released:direct': 'Release แล้ว รอส่ง',
    'In Stock': 'อยู่ที่ Stock รอส่ง', Delivered: 'ส่งมอบแล้ว', Cancelled: 'ยกเลิก' };
  var REL_TONE = { 'รอวางแผนส่ง': 'orange', 'รอ Head QC ยืนยัน Release': 'blue', 'Release แล้ว รอ Stock รับ': 'orange', 'Release แล้ว รอส่ง': 'orange',
    'อยู่ที่ Stock รอส่ง': 'orange', 'ส่งมอบแล้ว': 'green', 'ยกเลิก': 'grey' };
  var ACC_TH = { Open: 'ค้างส่ง', Received: 'ได้รับแล้ว', Cancelled: 'ยกเลิก' };
  var ACC_TONE = { 'ค้างส่ง': 'orange', 'ได้รับแล้ว': 'green', 'ยกเลิก': 'grey' };
  var PO_TH = { Open: 'เปิด', Closed: 'ปิดแล้ว', Cancelled: 'ยกเลิก' };
  var tableMissing = false, core = false;
  var appr = false;                       // 04-qc-approval.sql is in the database
  var meet = false;                       // 09-qc-meeting-fixes.sql is in the database
  var myRoles = [], isHead = false, canCancel = false;
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
  function evOf(qcId) { return db.ev.filter(function (e) { return e.qc_id === qcId && !e.ncr_id && !e.release_id; }); }
  function ncrEvOf(id) { return db.ev.filter(function (e) { return e.ncr_id === id; }); }
  function relEvOf(id) { return db.ev.filter(function (e) { return e.release_id === id; }); }
  function ncrOf(qcId) { return db.ncr.filter(function (n) { return n.qc_id === qcId; }); }
  function ncrOpen(n) { return n.status !== 'Closed' && n.status !== 'Cancelled'; }
  function relActive(r) { return r.status === 'Planned' || r.status === 'Released' || r.status === 'In Stock'; }
  function relOfMachine(mid) {
    var a = db.rel.filter(function (r) { return r.machine_id === mid && r.status !== 'Cancelled'; });
    return a.filter(relActive)[0] || a[a.length - 1] || null;
  }
  function relLabel(r) { return !r ? REL_TH.none : r.status === 'Released' ? REL_TH['Released:' + r.route] : REL_TH[r.status] || r.status; }
  function nowLocal() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function custName(id) { var c = byId(db.customers, id); return c ? c.name + (c.branch ? ' · ' + c.branch : '') : ''; }
  function mLabel(m) { return m ? (m.imodeSn ? m.imodeSn + ' · ' : '') + machineName(m) + (m.model ? ' ' + m.model : '') : '-'; }
  /* one server call that may not exist yet: returns { error } like supabase-js */
  async function call(fn, args) { try { return await sb().rpc(fn, args || {}); } catch (e) { return { error: { message: String(e.message || e) } }; } }
  /* a picked file goes straight to Storage (NCR / release evidence: the QC itself may be locked) */
  async function uploadNow(f, o) {
    var item = await pendingFile(f, o.kind); if (!item) return false;
    var ext = (String(f.name).match(/\.([a-z0-9]{1,5})$/i) || [])[1] || (item.mime.split('/')[1] || 'bin');
    var path = o.folder + '/' + o.kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext.toLowerCase();
    var store = sb().storage.from(BUCKET), up = await store.upload(path, item.blob, { contentType: item.mime, upsert: false });
    if (up.error) { page.toast('อัปโหลดไม่สำเร็จ: ' + up.error.message); return false; }
    var row = { qc_id: o.qcId, machine_id: o.machineId || null, kind: o.kind, path: path, name: f.name || '', mime: item.mime, size: item.size || 0 };
    if (o.ncrId) row.ncr_id = o.ncrId; if (o.releaseId) row.release_id = o.releaseId;
    var ins = await sb().from('qc_evidence').insert(row).select().single();
    if (ins.error) { store.remove([path]); page.toast('บันทึกไฟล์ไม่สำเร็จ: ' + ins.error.message); return false; }
    db.ev.push(ins.data);
    return true;
  }
  function evGrid(list, attrs) {
    if (!list.length) return '<p class="qc-muted">ยังไม่มีรูป</p>';
    return '<div class="qa-photos">' + list.map(function (e) {
      var url = evUrl(e);
      return '<figure class="qa-ph">' + (url && /^image\//.test(e.mime || '') ? '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="' + esc(KIND_TH[e.kind] || e.kind) + '"></a>'
        : '<a class="qc-file" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + '<span>ไฟล์</span></a>') +
        '<figcaption>' + esc(KIND_TH[e.kind] || e.kind) + (attrs && attrs.time ? ' · ' + esc(thTime(e.created_at)) : '') + '</figcaption></figure>';
    }).join('') + '</div>';
  }
  function upBtn(label, kind) {
    return '<label class="sh-btn">' + icon('plus') + '<span>' + esc(label) + '</span><input type="file" accept="image/*,application/pdf" capture="environment" data-up="' + kind + '" hidden></label>';
  }
  function apprOf(qcId) { return db.appr.filter(function (a) { return a.qc_id === qcId; }); }
  function lastDecision(qcId, kind) { var a = apprOf(qcId).filter(function (x) { return x.decision === kind; }); return a[a.length - 1] || null; }
  function myId() { return page.user.id || ''; }
  function queue() {
    return db.qc.filter(function (q) { return q.status === 'Pending Approval'; })
      .sort(function (a, b) { return String(a.submittedAt).localeCompare(String(b.submittedAt)); });
  }
  function ago(v) {
    if (!v) return '';
    var m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
    return m < 60 ? m + ' นาทีที่แล้ว' : m < 1440 ? Math.round(m / 60) + ' ชม.ที่แล้ว' : Math.round(m / 1440) + ' วันที่แล้ว';
  }
  /* approval history, newest first */
  function historyHTML(q) {
    var a = apprOf(q.id).slice().reverse();
    var items = a.map(function (x) {
      var cls = x.decision === 'submit' ? 'sub' : x.decision === 'approve' || x.decision === 'legacy' ? 'ok' : 'ret';
      return '<li class="' + cls + '">' + esc(DECISION_TH[x.decision] || x.decision) + (x.revision ? ' (Revision ' + x.revision + ')' : '') +
        (x.comment ? ': "' + esc(x.comment) + '"' : '') + '<small>' + esc(x.by_name || '-') + ' · ' + esc(thTime(x.at)) + '</small></li>';
    });
    if (q.createdAt) items.push('<li>สร้างใบ ' + esc(q.qcNo) + '<small>' + esc(thTime(q.createdAt)) + '</small></li>');
    return '<ul class="qa-log">' + items.join('') + '</ul>';
  }

  /* row <-> the object shape Service used (so the document code and the mirror stay the same) */
  function fromRow(r) {
    return { id: r.id, qcNo: r.qc_no, type: r.type, qcDate: r.qc_date || '', status: r.status, customerId: r.customer_id || '',
      machineId: r.machine_id || '', caseId: r.case_id || '', inspector: r.inspector || '', reviewer: r.reviewer || '',
      targetCompany: r.target_company || '', checklist: r.checklist || [], findings: r.findings || '',
      correctiveAction: r.corrective_action || '', note: r.note || '', media: r.media || [],
      assignedTo: r.assigned_to || '', plannedDate: r.planned_date || '', priority: r.priority || 'normal', location: r.location || '',
      poNo: r.po_no || '', projectNo: r.project_no || '', supplier: r.supplier || '', receivedDate: r.received_date || '',
      accessories: r.accessories || '', accessoriesMissing: r.accessories_missing || '', accessoriesStatus: r.accessories_status || 'complete',
      createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by || '',
      submittedAt: r.submitted_at || '', submittedBy: r.submitted_by || '', approvedAt: r.approved_at || '', approvedBy: r.approved_by || '',
      approverName: r.approver_name || '', revision: r.revision || 0, statusNote: r.status_note || '',
      receivedBy: r.received_by || '', deliveredBy: r.delivered_by || '', photoOpts: r.photo_opts || {} };
  }
  function toRow(q, source) {
    var r = { id: q.id, qc_no: q.qcNo, type: TYPES.indexOf(q.type) >= 0 ? q.type : 'Pre-Delivery QC', qc_date: q.qcDate || null,
      status: STATUS_TH[q.status] && q.status !== 'Pending' && q.status !== 'N/A' ? q.status : 'Draft',
      customer_id: q.customerId || null, machine_id: q.machineId || null, case_id: q.caseId || null,
      inspector: q.inspector || '', reviewer: q.reviewer || '', target_company: q.targetCompany || '',
      checklist: q.checklist || [], findings: q.findings || '', corrective_action: q.correctiveAction || '',
      note: q.note || '', media: q.media || [], source: source || 'qc-module' };
    // 04 guard: an upsert runs the INSERT check first, which refuses "Returned"; "Draft" keeps a returned QC returned
    if (r.status === 'Returned') r.status = 'Draft';
    if (core) {   // phase-1 columns exist only after 02-qc-core.sql
      var miss = String(q.accessoriesMissing || '').trim();
      Object.assign(r, { assigned_to: q.assignedTo || '', planned_date: q.plannedDate || null, priority: PRIORITY_TH[q.priority] ? q.priority : 'normal',
        location: q.location || '', po_no: q.poNo || '', project_no: q.projectNo || '', supplier: q.supplier || '',
        received_date: q.receivedDate || null, accessories: q.accessories || '', accessories_missing: miss,
        accessories_status: q.accessoriesStatus === 'delivered' || q.accessoriesStatus === 'partial' ? q.accessoriesStatus : (miss ? 'outstanding' : 'complete') });
    }
    if (meet) Object.assign(r, { received_by: q.receivedBy || '', delivered_by: q.deliveredBy || '', photo_opts: photoOpts(q) });
    return r;
  }
  /* 2026-11-12 helpers: plate-photo switches (default on) and the accessory list */
  function photoOpts(q) {
    var o = (q && q.photoOpts) || {};
    return { factoryPlate: o.factoryPlate !== false, imodePlate: o.imodePlate !== false };
  }
  function accKey() { return Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6); }
  function accParse(txt) {
    return String(txt || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); }), k = p[2] && /^#/.test(p[2]) ? p[2].slice(1) : '';
      return { name: p[0], qty: p.length > 1 && /^\d+$/.test(p[1]) ? p[1] : '', key: k || accKey() };
    });
  }
  function accText(rows) {
    return rows.filter(function (a) { return String(a.name || '').trim(); })
      .map(function (a) { return a.name.trim().replace(/\|/g, '/') + ' | ' + (Math.max(1, +a.qty || 1)) + ' | #' + a.key; }).join('\n');
  }
  function accLabel(txt) { return accParse(txt).map(function (a) { return a.name + (a.qty ? ' x' + a.qty : ''); }).join(', '); }
  function locOptions() {
    var seen = {}, out = [];
    LOC_PRESET.concat(db.qc.map(function (q) { return q.location; })).forEach(function (v) {
      v = String(v || '').trim(); if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
    });
    return '<datalist id="qcLocList">' + out.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>';
  }
  function custLabel(c) { return c ? c.name + (c.branch ? ' · ' + c.branch : '') : ''; }
  function machLabel(m) {
    return m ? (m.imodeSn ? m.imodeSn + ' · ' : '') + machineName(m) + ' · ' + (m.model || '-') + ' · S/N ' + (m.factorySn || m.serial || '-') + (inQc(m) ? ' (ใน QC)' : '') : '';
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
    gateCache = {};
    var res = await Promise.all([
      c.from('qc_records').select('*').order('qc_date', { ascending: false }).order('created_at', { ascending: false }),
      c.from('customers').select('id,name,branch').order('name'),
      c.from('machines').select(M_CORE),
      c.from('service_cases').select('id,ticket,status,customer_id,machine_id,service_type'),
      c.from('system_settings').select('data').eq('id', 'main').maybeSingle(),
      c.from('qc_evidence').select('*').order('created_at'),
      c.from('qc_approvals').select('*').order('at')
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
    appr = core && !res[6].error;
    db.appr = appr ? (res[6].data || []) : [];
    if (appr && !myRoles.length) {   // roles come from profiles.role / extra_roles, read on the server
      var rr = await c.rpc('qc_my_roles');
      myRoles = (rr.data || []).map(function (x) { return String(x || '').toLowerCase(); });
      isHead = myRoles.indexOf('head qc') >= 0;
      canCancel = isHead || myRoles.indexOf('admin qc') >= 0;
    }
    if (core) { var p9 = await c.from('qc_records').select('photo_opts').limit(1); meet = !p9.error; } else meet = false;
    if (res[1].error || res[2].error || res[3].error) console.warn('[qc] lookup tables', res[1].error, res[2].error, res[3].error);
    // phase 2: each part only when its SQL file has been run
    var ph = appr ? await Promise.all([
      c.from('qc_ncr').select('*').order('detected_at', { ascending: false }),
      c.from('qc_ncr_events').select('*').order('at'),
      c.from('qc_rechecks').select('*').order('at'),
      c.from('qc_po').select('*').order('created_at', { ascending: false }),
      c.from('qc_stock_receipts').select('*'),
      c.from('qc_acc_items').select('*').order('created_at'),
      c.from('qc_releases').select('*').order('plan_at', { ascending: false })
    ]) : [];
    var ok = function (i) { return appr && ph[i] && !ph[i].error; };
    ncrOn = ok(0); poOn = ok(3); relOn = ok(6);
    db.ncr = ncrOn ? ph[0].data || [] : []; db.ncrEv = ok(1) ? ph[1].data || [] : []; db.rechecks = ok(2) ? ph[2].data || [] : [];
    db.po = poOn ? ph[3].data || [] : []; db.receipts = ok(4) ? ph[4].data || [] : []; db.acc = ok(5) ? ph[5].data || [] : [];
    db.rel = relOn ? ph[6].data || [] : [];
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
    var counts = { approve: queue().length, ncr: db.ncr.filter(ncrOpen).length,
      release: rowsForRelease().filter(function (r) { return r.open; }).length, po: db.acc.filter(function (a) { return a.status === 'Open'; }).length };
    Object.keys(counts).forEach(function (k) {
      var tb = tabs.querySelector('[data-tab="' + k + '"]'), cnt = tb.querySelector('.qa-count');
      tb.hidden = !tabOn(k); cnt.hidden = !counts[k]; cnt.textContent = counts[k];
    });
    if (ncrOn) { nlist.setFilter(null); nlist.setRows(rowsForNcr()); }
    if (relOn) { rlist.setFilter(null); rlist.setRows(rowsForRelease()); }
    if (poOn) { plist.setFilter(null); plist.setRows(rowsForPo()); alist.setFilter(null); alist.setRows(rowsForAcc()); }
    if (!tabOn(tab)) setTab('qc');
    else if (tab === 'approve') drawApprove();
  }

  /* ---------- page ---------- */
  /* opened from Service (meeting 2026-11-03: Service may open QC again) → offer the way back.
     Remembered for this tab, because handleLink() clears the query string. */
  var fromService = '';
  try {
    var q0 = new URLSearchParams(location.search);
    if (q0.get('from') === 'service' || q0.get('case')) sessionStorage.setItem('imode.qc.fromService', '1');
    fromService = sessionStorage.getItem('imode.qc.fromService') || '';
  } catch (e) {}
  page = await ImodeShell.start({
    module: 'qc', root: '../../',
    subtitle: 'รับเครื่องเข้า QC ตรวจตาม Checklist พร้อมรูปประกอบ Head QC อนุมัติผล แล้วส่งมอบเครื่องให้ Service ดูแลต่อ',
    actions: (fromService ? [{ label: 'กลับไป Service', icon: 'chevron', onClick: function () { location.href = SERVICE_URL; } }] : []).concat([
      { label: 'ส่งออก CSV', icon: 'download', onClick: function () {
        var l = tab === 'machines' ? mlist : list;
        var n = l.csv('I-MODE_QC_' + (tab === 'machines' ? 'machines_' : '') + todayISO() + '.csv'); page.toast('ส่งออก ' + n + ' รายการแล้ว');
      } },
      { label: 'สร้าง QC เครื่องที่มีอยู่', icon: 'plus', onClick: function () { openForm(null, {}); } },
      { label: 'รับเครื่องเข้า QC', icon: 'inbox', primary: true, onClick: function () { openIntake(); } }
    ])
  });

  var notice = document.createElement('div');
  notice.hidden = true;
  page.body.appendChild(notice);
  function say(html) { notice.innerHTML = html || ''; notice.hidden = !html; }

  /* three views: QC documents, the Head QC approval queue (after 04) and machines (by IMODE S/N) */
  var tab = 'qc';
  var TABS = ['qc', 'approve', 'ncr', 'release', 'machines', 'po'];
  try { var t0 = localStorage.getItem('imode.qc.tab'); if (TABS.indexOf(t0) >= 0) tab = t0; } catch (e) {}
  var tabs = document.createElement('div');
  tabs.className = 'qc-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'มุมมอง');
  tabs.innerHTML = '<button type="button" role="tab" data-tab="qc">' + icon('list') + '<span>ใบ QC</span></button>' +
    '<button type="button" role="tab" data-tab="approve" hidden>' + icon('check') + '<span>รออนุมัติ</span><b class="qa-count" hidden></b></button>' +
    '<button type="button" role="tab" data-tab="ncr" hidden>' + icon('alert') + '<span>NCR</span><b class="qa-count" hidden></b></button>' +
    '<button type="button" role="tab" data-tab="release" hidden>' + icon('chevron') + '<span>ส่งมอบ</span><b class="qa-count" hidden></b></button>' +
    '<button type="button" role="tab" data-tab="machines">' + icon('inbox') + '<span>เครื่อง (IMODE S/N)</span></button>' +
    '<button type="button" role="tab" data-tab="po" hidden>' + icon('list') + '<span>อุปกรณ์ค้าง</span><b class="qa-count" hidden></b></button>';
  page.body.appendChild(tabs);
  var qcView = document.createElement('div'), aView = document.createElement('div'), mView = document.createElement('div');
  var nView = document.createElement('div'), rView = document.createElement('div'), pView = document.createElement('div');
  [qcView, aView, nView, rView, mView, pView].forEach(function (v) { page.body.appendChild(v); });
  var tabOn = function (t) { return t === 'approve' ? appr : t === 'ncr' ? ncrOn : t === 'release' ? relOn : t === 'po' ? poOn : true; };
  var kpiHost = document.createElement('div'), mKpiHost = document.createElement('div');
  qcView.appendChild(kpiHost); mView.appendChild(mKpiHost);
  aView.className = 'qa-grid';
  aView.innerHTML = '<section class="qa-card qa-queue" aria-labelledby="qaQueueTitle"><h2 id="qaQueueTitle">คิวรออนุมัติ (ส่งก่อนอยู่บน)</h2><div id="qaQueue"></div></section>' +
    '<section class="qa-card qa-detail" id="qaDetail" aria-live="polite"></section>';
  function setTab(t) {
    if (!tabOn(t)) t = 'qc';
    tab = t;
    try { localStorage.setItem('imode.qc.tab', t); } catch (e) {}
    [].forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
    qcView.hidden = t !== 'qc'; aView.hidden = t !== 'approve'; mView.hidden = t !== 'machines';
    nView.hidden = t !== 'ncr'; rView.hidden = t !== 'release'; pView.hidden = t !== 'po';
    if (t === 'approve') drawApprove();
  }
  tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  var isWaiting = function (r) { return r.raw.status === 'Draft' || r.raw.status === 'In Progress' || r.raw.status === 'Returned'; };
  var isPending = function (r) { return r.raw.status === 'Pending Approval'; };
  var isPass = function (r) { return r.raw.status === 'Pass'; };
  var isProblem = function (r) { return r.raw.status === 'Fail' || r.raw.status === 'Conditional'; };
  var stage = function (s) { return function (r) { return r.raw.lifecycle === s; }; };
  function drawKpis() {
    var rows = rowsForList(), n = function (f) { return rows.filter(f).length; };
    kpiHost.innerHTML = '';
    var returned = rows.filter(function (r) { return r.raw.status === 'Returned'; }).length;
    var kp = ImodeShell.kpis(kpiHost, appr ? [
      { label: 'รอตรวจ / กำลังตรวจ', value: n(isWaiting), note: returned ? 'รวมส่งกลับแก้ ' + returned : 'ยังไม่ส่งอนุมัติ', tone: 'orange', icon: 'clock', filter: isWaiting },
      { label: 'รอ Head QC อนุมัติ', value: n(isPending), note: 'ดูที่แท็บรออนุมัติ', tone: 'blue', icon: 'alert', filter: isPending },
      { label: 'ผ่าน (อนุมัติแล้ว)', value: n(isPass), note: 'ปล่อยเครื่องได้', tone: 'green', icon: 'check', filter: isPass },
      { label: 'ไม่ผ่าน', value: n(isProblem), note: 'ต้องแก้ไขหรือตรวจซ้ำ', tone: 'red', icon: 'alert', filter: isProblem }
    ] : [
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
    title: 'รายการ QC เครื่อง', subtitle: 'ค้นหาด้วยเลขที่ QC ลูกค้า เครื่อง IMODE S/N, S/N หรือผู้ตรวจ แตะรายการเพื่อดูเอกสาร',
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
    title: 'เครื่องจักรในงาน QC', subtitle: 'ค้นหาด้วย IMODE S/N, Factory S/N, ชื่อเครื่อง หรือลูกค้า แตะเครื่องเพื่อดูประวัติ QC และส่งมอบ',
    columns: [
      { key: 'imodeSn', label: 'IMODE S/N', isKey: true },
      { key: 'factorySn', label: 'Factory S/N' },
      { key: 'machine', label: 'เครื่อง / รุ่น' },
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

  /* ---------- phase 2 lists: NCR, ส่งมอบ, PO / อุปกรณ์ค้าง ---------- */
  function rowsForNcr() {
    return db.ncr.map(function (n) {
      var m = byId(db.machines, n.machine_id), q = byId(db.qc, n.qc_id);
      return { id: n.id, no: n.ncr_no, date: thDate(n.detected_at), machine: mLabel(m), qcNo: q ? q.qcNo : '',
        item: n.item_label || n.item_id || '-', severity: SEV_TH[n.severity] || n.severity, desc: n.description,
        round: String(n.round || 1), status: NCR_TH[n.status] || n.status, raw: n };
    });
  }
  function rowsForRelease() {
    var out = [];
    db.machines.filter(function (m) { return m.lifecycle === 'ready' && !db.rel.some(function (r) { return r.machine_id === m.id && relActive(r); }); })
      .forEach(function (m) {
        var q = latestQc(m.id);
        out.push({ id: 'm:' + m.id, no: '–', machine: mLabel(m), customer: custName(m.customerId || (q && q.customerId)), route: '–', plan: '–',
          purchaser: '', status: REL_TH.none, open: true, raw: { machine: m } });
      });
    db.rel.forEach(function (r) {
      out.push({ id: r.id, no: r.release_no, machine: mLabel(byId(db.machines, r.machine_id)), customer: custName(r.customer_id),
        route: r.route === 'stock' ? 'ผ่าน Stock' : 'ส่งตรง', plan: thDate(r.plan_date), purchaser: r.purchaser_name,
        status: relLabel(r), open: relActive(r), raw: { rel: r } });
    });
    return out;
  }
  function rowsForPo() {
    return db.po.map(function (o) {
      var ordered = (o.items || []).reduce(function (a, x) { return a + (+x.qty || 0); }, 0);
      var got = db.machines.filter(function (m) { return String(m.poNo || '').toLowerCase() === String(o.po_no).toLowerCase(); }).length;
      return { id: o.id, no: o.po_no, project: o.project_no, supplier: o.supplier, items: (o.items || []).map(function (x) { return (x.name || x.model) + ' x' + x.qty; }).join(', '),
        received: got + '/' + (ordered || '-'), purchaser: o.purchaser_name, due: thDate(o.expected_date), status: PO_TH[o.status] || o.status, raw: o };
    });
  }
  function rowsForAcc() {
    return db.acc.map(function (a) {
      var m = byId(db.machines, a.machine_id);
      var late = a.status === 'Open' && a.due_date && a.due_date < todayISO();
      return { id: a.id, item: a.item + ' x' + a.qty, machine: mLabel(m), po: a.po_no, supplier: a.supplier, follow: a.follow_name,
        due: a.due_date ? thDate(a.due_date) + (late ? ' (เลยกำหนด)' : '') : '–', note: a.last_note, status: ACC_TH[a.status] || a.status, raw: a };
    });
  }
  var nlist = ImodeShell.list(nView, {
    title: 'NCR — ข้อบกพร่องที่ตรวจพบ', subtitle: '1 ใบต่อ 1 ข้อบกพร่อง เปิดจากข้อที่ "ไม่ผ่าน" ในฟอร์มตรวจ แตะรายการเพื่อทำขั้นต่อไป',
    columns: [{ key: 'no', label: 'เลขที่ NCR', isKey: true }, { key: 'date', label: 'วันที่พบ' }, { key: 'machine', label: 'เครื่อง' },
      { key: 'item', label: 'ข้อ Checklist' }, { key: 'desc', label: 'ข้อบกพร่อง' }, { key: 'severity', label: 'ความรุนแรง' }, { key: 'round', label: 'รอบ' },
      { key: 'status', label: 'ขั้นตอน' }],
    searchKeys: ['no', 'machine', 'qcNo', 'item', 'desc', 'status'], rows: [], statusKey: 'status', statusTone: NCR_TONE,
    empty: { title: 'ยังไม่มี NCR', text: 'เมื่อข้อใดในฟอร์มตรวจ "ไม่ผ่าน" กด "เปิด NCR" ที่ข้อนั้น' },
    onRowClick: function (r) { openNcr(r.raw.id); }, rowLabel: function (r) { return 'เปิด ' + r.no; }
  });
  var rlist = ImodeShell.list(rView, {
    title: 'ส่งมอบเครื่อง (Release)', subtitle: 'เครื่องที่ Head QC อนุมัติแล้ว: วางแผนส่ง (จัดซื้ออนุมัติ บันทึกแทน) → Head QC ยืนยัน Release → ผ่าน Stock หรือส่งตรง → ผู้รับลงชื่อ',
    columns: [{ key: 'no', label: 'เลขที่', isKey: true }, { key: 'machine', label: 'เครื่อง' }, { key: 'customer', label: 'ลูกค้า' },
      { key: 'route', label: 'เส้นทาง' }, { key: 'plan', label: 'วันที่นัดส่ง' }, { key: 'purchaser', label: 'จัดซื้อที่อนุมัติแผน' }, { key: 'status', label: 'สถานะ' }],
    searchKeys: ['no', 'machine', 'customer', 'route', 'purchaser', 'status'], rows: [], statusKey: 'status', statusTone: REL_TONE,
    empty: { title: 'ยังไม่มีเครื่องรอส่งมอบ', text: 'เครื่องจะมาอยู่ที่นี่เมื่อ Head QC อนุมัติผล QC แล้ว' },
    onRowClick: function (r) { if (r.raw.rel) openRelease(r.raw.rel.id); else openReleasePlan(r.raw.machine); },
    rowLabel: function (r) { return 'เปิด ' + (r.no !== '–' ? r.no : r.machine); }
  });
  /* 2026-11-12 meeting: PO is no longer kept in QC; the PO list is built off-page so old code paths still work */
  var poHidden = document.createElement('div'); poHidden.hidden = true;
  var plist = ImodeShell.list(poHidden, {
    title: 'PO / โครงการ', subtitle: 'รายการเครื่องที่สั่ง และจำนวนที่รับเข้า QC แล้ว แตะเพื่อแก้ไข',
    columns: [{ key: 'no', label: 'เลขที่ PO', isKey: true }, { key: 'project', label: 'โครงการ' }, { key: 'supplier', label: 'ผู้ขาย' },
      { key: 'items', label: 'เครื่องที่สั่ง' }, { key: 'received', label: 'รับแล้ว/สั่ง' }, { key: 'due', label: 'กำหนดเข้า' }, { key: 'purchaser', label: 'ผู้จัดซื้อ' }, { key: 'status', label: 'สถานะ' }],
    searchKeys: ['no', 'project', 'supplier', 'items', 'purchaser'], rows: [], statusKey: 'status', statusTone: { 'เปิด': 'blue', 'ปิดแล้ว': 'green', 'ยกเลิก': 'grey' },
    empty: { title: 'ยังไม่มี PO', text: 'กด "เปิด PO" เพื่อบันทึก PO แทนฝ่ายจัดซื้อ แล้วเลือก PO ตอนรับเครื่องเข้า QC' },
    onRowClick: function (r) { openPo(r.raw); }, rowLabel: function (r) { return 'แก้ไข PO ' + r.no; }
  });
  var alist = ImodeShell.list(pView, {
    title: 'อุปกรณ์ค้างส่ง (Outstanding Accessories)', subtitle: 'ให้จัดซื้อตามกับ Supplier ไม่บล็อกการตรวจ แตะเพื่อบันทึกการติดตามหรือรับของ',
    columns: [{ key: 'item', label: 'อุปกรณ์', isKey: true }, { key: 'machine', label: 'เครื่อง' },
      { key: 'follow', label: 'ผู้ติดตาม' }, { key: 'due', label: 'กำหนดส่ง' }, { key: 'note', label: 'ติดตามล่าสุด' }, { key: 'status', label: 'สถานะ' }],
    searchKeys: ['item', 'machine', 'po', 'supplier', 'follow', 'status'], rows: [], statusKey: 'status', statusTone: ACC_TONE,
    empty: { title: 'ไม่มีอุปกรณ์ค้างส่ง', text: 'ใส่รายการที่ยังขาดได้ตอนรับเครื่อง หรือจากหน้าประวัติเครื่อง' },
    onRowClick: function (r) { openAcc(r.raw); }, rowLabel: function (r) { return 'ติดตาม ' + r.item; }
  });
  setTab('qc');   // the newer tabs exist only once the data says their SQL is there
  var wantTab = tab;
  drawKpis();

  function warnSql() {
    if (tableMissing) say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>ยังไม่ได้สร้างตาราง QC ในฐานข้อมูล ให้ผู้ดูแลรันไฟล์ ' + SQL_FILE + ' ใน Supabase SQL Editor หนึ่งครั้ง จึงจะบันทึก QC ได้</span></div>');
    else if (!core) say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>ฐานข้อมูลยังไม่มีส่วน QC ระยะ 1 (รับเครื่อง IMODE S/N รูปบังคับ ส่งมอบ) ให้ผู้ดูแลรันไฟล์ ' + SQL_FILE + ' ใน Supabase SQL Editor หนึ่งครั้ง ระหว่างนี้ใช้ใบ QC แบบเดิมได้</span></div>');
    else if (!appr) say('<div class="sh-banner" role="note">' + icon('alert') + '<span>ฐานข้อมูลยังไม่มีขั้น Head QC อนุมัติ ช่างยังบันทึก "ผ่าน" เองได้ ให้ผู้ดูแลรัน ' + SQL_APPROVAL + ' แล้วหน้านี้จะเปลี่ยนเป็นส่งให้ Head QC อนุมัติเอง</span></div>');
    else if (!meet) say('<div class="sh-banner" role="note">' + icon('alert') + '<span>ฐานข้อมูลยังไม่ได้อัปเดตตามที่ประชุม QC ให้ผู้ดูแลรัน ' + SQL_MEET + ' หนึ่งครั้ง ระหว่างนี้ฐานข้อมูลยังบังคับรูป 7 มุมก่อนส่งอนุมัติ และยังไม่บันทึกผู้รับเครื่อง / ผู้ส่งมอบ</span></div>');
  }
  try { await loadAll(); }
  catch (e) {
    console.error('[qc] load', e);
    say('<div class="sh-banner" role="alert">' + icon('alert') + '<span>โหลดข้อมูล QC ไม่สำเร็จ: ' + esc(e.message || e) + '</span></div>');
  }
  warnSql();
  refreshList();
  if (wantTab !== 'qc' && tabOn(wantTab)) setTab(wantTab);
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


  /* ---------- 2026-11-12: searchable picker with "+ add new" (customer, machine) ---------- */
  function comboHTML(id, label, req, text, ph, full) {
    return '<div class="qc-f qc-combo' + (full ? ' full' : '') + '"><span>' + esc(label) + (req ? ' <b class="qc-req-' + id + '">*</b>' : '') + '</span>' +
      '<input type="hidden" id="' + id + '">' +
      '<input type="text" class="qc-combo-in" id="' + id + 'Txt" value="' + esc(text || '') + '" placeholder="' + esc(ph || 'พิมพ์เพื่อค้นหา') + '" autocomplete="off"' +
      ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + 'List" aria-label="' + esc(label) + '">' +
      '<ul class="qc-combo-list" id="' + id + 'List" role="listbox" hidden></ul></div>';
  }
  /* o: { items(): [{id, label}], value, onPick(id), addLabel(text) -> string, onAdd(text) } */
  function bindCombo(root, id, o) {
    var hid = root.querySelector('#' + id), inp = root.querySelector('#' + id + 'Txt'), ul = root.querySelector('#' + id + 'List');
    var shown = [], act = -1;
    function labelOf(v) { var x = o.items().filter(function (i) { return String(i.id) === String(v); })[0]; return x ? x.label : ''; }
    function set(v, quiet) { hid.value = v || ''; inp.value = labelOf(v); if (!quiet && o.onPick) o.onPick(hid.value); }
    function close() { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; }
    function draw() {
      var q = inp.value.trim().toLowerCase(), all = o.items();
      var picked = labelOf(hid.value);
      if (picked && inp.value === picked) q = '';            // showing the current choice: list everything
      shown = all.filter(function (i) { return !q || i.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 40);
      var add = o.addLabel ? o.addLabel(inp.value.trim()) : '';
      ul.innerHTML = shown.map(function (i, k) {
        return '<li role="option" data-k="' + k + '" aria-selected="' + (String(i.id) === String(hid.value)) + '">' + esc(i.label) + '</li>';
      }).join('') + (!shown.length ? '<li class="is-empty">ไม่พบรายการที่ตรง</li>' : '') +
        (add ? '<li role="option" class="is-add" data-add>' + icon('plus') + '<span>' + esc(add) + '</span></li>' : '');
      ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); act = -1;
    }
    function choose(li) {
      if (!li) return;
      if (li.hasAttribute('data-add')) { var t = inp.value.trim(); close(); if (labelOf(hid.value) === t) t = ''; o.onAdd(t); return; }
      if (li.dataset.k == null) return;
      set(shown[+li.dataset.k].id); close();
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    inp.addEventListener('focus', draw);
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', function (e) {
      var lis = ul.querySelectorAll('li[role=option]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (ul.hidden) draw(); lis = ul.querySelectorAll('li[role=option]'); if (!lis.length) return;
        act = (act + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
        [].forEach.call(lis, function (l, k) { l.classList.toggle('is-active', k === act); });
        lis[act].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { if (!ul.hidden && act >= 0) { e.preventDefault(); choose(lis[act]); } }
      else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); e.stopPropagation(); close(); } }
    });
    ul.addEventListener('mousedown', function (e) { e.preventDefault(); choose(e.target.closest('li')); });
    inp.addEventListener('blur', function () {
      setTimeout(function () {
        close();
        if (!inp.value.trim()) { if (hid.value) { set(''); inp.dispatchEvent(new Event('change', { bubbles: true })); } }
        else inp.value = labelOf(hid.value);                  // typed text that was not picked goes back to the choice
      }, 120);
    });
    set(o.value, true);
    return { set: set, get: function () { return hid.value; }, refresh: function () { inp.value = labelOf(hid.value); } };
  }

  /* a second, small dialog on top of a form (quick add) so the form underneath keeps what was typed */
  var dlg2 = document.createElement('dialog');
  dlg2.className = 'qc-dlg qc-dlg-sm';
  dlg2.setAttribute('aria-labelledby', 'qcDlg2Title');
  document.body.appendChild(dlg2);
  function show2(title, sub, body, okLabel, onOk) {
    dlg2.innerHTML = '<div class="qc-dlg-head"><div><h2 id="qcDlg2Title">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button type="button" class="sh-icon-btn" data-close aria-label="ปิด">' + icon('close') + '</button></div>' +
      '<div class="qc-dlg-body"><form class="qc-grid qc-grid-2" novalidate>' + body + '</form></div><div class="qc-dlg-foot">' + btn('ยกเลิก', 'data-close') + btn(okLabel, 'data-ok', true) + '</div>';
    [].forEach.call(dlg2.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { dlg2.close(); }); });
    var ok = dlg2.querySelector('[data-ok]');
    ok.addEventListener('click', async function () {
      ok.disabled = true; var t = ok.textContent; ok.textContent = 'กำลังบันทึก…';
      try { if (await onOk(function (s) { return dlg2.querySelector(s).value.trim(); })) dlg2.close(); }
      finally { ok.disabled = false; ok.textContent = t; }
    });
    dlg2.showModal();
    var f = dlg2.querySelector('input'); if (f) f.focus();
  }
  /* new customer, straight into the shared customers table (Service sees it too) */
  function addCustomer(name, done) {
    show2('เพิ่มลูกค้าใหม่', 'บันทึกแล้วเลือกให้อัตโนมัติ และเห็นในโมดูล Service ด้วย',
      field('ncName', 'ชื่อลูกค้า / ร้าน', name, { full: true }, true) + field('ncBranch', 'สาขา', '') + field('ncContact', 'ผู้ติดต่อ', '') +
      field('ncPhone', 'เบอร์โทร', '', { type: 'tel' }) + field('ncLoc', 'จังหวัด / พื้นที่', ''),
      'บันทึกลูกค้า', async function (v) {
        if (!v('#ncName')) { page.toast('ใส่ชื่อลูกค้า'); dlg2.querySelector('#ncName').focus(); return false; }
        var dup = db.customers.filter(function (c) { return String(c.name).trim().toLowerCase() === v('#ncName').toLowerCase() && String(c.branch || '').trim().toLowerCase() === v('#ncBranch').toLowerCase(); })[0];
        if (dup && !confirm('มีลูกค้าชื่อนี้แล้ว (' + custLabel(dup) + ') ยังต้องการเพิ่มใหม่หรือไม่?')) return false;
        var row = { id: 'CUS-QC-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
          name: v('#ncName'), branch: v('#ncBranch'), contact: v('#ncContact'), phone: v('#ncPhone'), location: v('#ncLoc') };
        var r = await sb().from('customers').insert(row).select('id,name,branch').single();
        if (r.error) { page.toast('เพิ่มลูกค้าไม่สำเร็จ: ' + r.error.message); return false; }
        db.customers.push(r.data);
        db.customers.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); });
        page.toast('เพิ่มลูกค้า ' + r.data.name + ' แล้ว');
        done(r.data.id); return true;
      });
  }
  /* new machine from the QC form: gets the next IMODE S/N at once.
     For ตรวจรับเข้า / ตรวจก่อนส่งมอบ it is a new machine still in QC (no customer until hand-over, like qc_intake);
     for the other types it is the customer's machine and shows in Service straight away. */
  function addMachine(name, customerId, type, done) {
    var toQc = INTAKE_TYPES.indexOf(type) >= 0;
    if (!toQc && !customerId) { page.toast('เลือกลูกค้าก่อน แล้วจึงเพิ่มเครื่องของลูกค้า'); return; }
    show2('เพิ่มเครื่องใหม่', (toQc ? 'เครื่องใหม่เข้า QC' : 'เครื่องของ ' + custName(customerId)) + ' · ระบบออก IMODE S/N ให้ทันที',
      field('nmNameTh', 'ชื่อเครื่อง (ไทย)', name, null, true) + field('nmNameEn', 'ชื่อเครื่อง (อังกฤษ)', '') +
      field('nmModel', 'รุ่น (Model)', '', null, true) + field('nmFsn', 'Factory S/N', '', { ph: 'หมายเลขจากป้ายโรงงาน' }),
      'บันทึกเครื่อง', async function (v) {
        if (!v('#nmNameTh') || !v('#nmModel')) { page.toast('กรอกชื่อเครื่องและรุ่นให้ครบ'); dlg2.querySelector(!v('#nmNameTh') ? '#nmNameTh' : '#nmModel').focus(); return false; }
        var fsn = v('#nmFsn'), model = v('#nmModel');
        if (fsn && db.machines.some(function (m) { return String(m.factorySn || m.serial || '').toLowerCase() === fsn.toLowerCase() && String(m.model || '').toLowerCase() === model.toLowerCase(); })) {
          page.toast('มีเครื่องรุ่นนี้ Factory S/N นี้ในระบบแล้ว ค้นหาจากช่องเครื่องจักรได้เลย'); return false;
        }
        var sn = await sb().rpc('qc_next_imode_sn');
        if (sn.error || !sn.data) { page.toast('ออก IMODE S/N ไม่สำเร็จ: ' + ((sn.error && sn.error.message) || '')); return false; }
        var now = new Date().toISOString();
        var row = { id: 'M-QC-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), customerId: toQc ? null : customerId,
          name: v('#nmNameTh'), nameTh: v('#nmNameTh'), nameEn: v('#nmNameEn'), model: model, serial: fsn, imodeSn: sn.data, factorySn: fsn || null,
          lifecycle: toQc ? 'qc' : null, receivedAt: toQc ? todayISO() : null, source: 'QC', createdAt: now, updatedAt: now };
        var r = await sb().from('machines').insert(row).select(M_CORE).single();
        if (r.error) { page.toast('เพิ่มเครื่องไม่สำเร็จ: ' + r.error.message); return false; }
        db.machines.push(Object.assign({}, r.data, { customerId: r.data.customerId || '' }));
        page.toast('เพิ่มเครื่องแล้ว IMODE S/N ' + sn.data);
        done(r.data.id); return true;
      });
  }

  /* ---------- 2026-11-12: accessories, one row per item, each with its own photos ---------- */
  function accRowHTML(a, evs) {
    var ph = evs.filter(function (e) { return e.kind === 'accessories' && e.check_id === 'acc:' + a.key; });
    return '<div class="qc-acc-row" data-key="' + esc(a.key) + '">' +
      '<input data-k="name" value="' + esc(a.name || '') + '" placeholder="ชื่ออุปกรณ์ เช่น สายไฟ" aria-label="ชื่ออุปกรณ์">' +
      '<input data-k="qty" type="number" min="1" inputmode="numeric" value="' + esc(a.qty || 1) + '" aria-label="จำนวน">' +
      '<label class="sh-btn qc-acc-cam">' + icon('plus') + '<span>ถ่าย / เลือกรูป</span><input type="file" accept="image/*" data-accph aria-label="รูปอุปกรณ์"></label>' +
      '<button type="button" class="sh-btn" data-accdel aria-label="ลบอุปกรณ์นี้">' + icon('close') + '</button>' +
      (ph.length ? '<div class="qc-acc-ph">' + ph.map(function (e) {
        return '<figure><img src="' + esc(evUrl(e)) + '" alt="รูป ' + esc(a.name || 'อุปกรณ์') + '"><button type="button" data-evdel="' + evs.indexOf(e) + '" aria-label="ลบรูป">ลบ</button></figure>';
      }).join('') + '</div>' : '') + '</div>';
  }
  /* st: { rows: [{name, qty, key}], ev: [] evidence (pending or saved), drop(e), dirty() } */
  function bindAcc(host, st) {
    function draw() {
      var legacy = st.ev.filter(function (e) { return e.kind === 'accessories' && !/^acc:/.test(e.check_id || ''); });
      host.innerHTML = '<div class="qc-acc-head" aria-hidden="true"><span>อุปกรณ์</span><span>จำนวน</span><span>รูป</span></div>' +
        st.rows.map(function (a) { return accRowHTML(a, st.ev); }).join('') +
        (!st.rows.length ? '<p class="qc-muted qc-acc-empty">ยังไม่มีรายการ กด "+ เพิ่มอุปกรณ์"</p>' : '') +
        (legacy.length ? '<div class="qc-acc-legacy"><small>รูปอุปกรณ์ (แบบเดิม รวมทุกชิ้น)</small><div class="qc-acc-ph">' + legacy.map(function (e) {
          return '<figure><img src="' + esc(evUrl(e)) + '" alt="รูปอุปกรณ์"><button type="button" data-evdel="' + st.ev.indexOf(e) + '" aria-label="ลบรูป">ลบ</button></figure>';
        }).join('') + '</div></div>' : '') +
        '<button type="button" class="sh-btn" data-accadd>' + icon('plus') + '<span>เพิ่มอุปกรณ์</span></button>';
    }
    function rowOf(el) { var r = el.closest('.qc-acc-row'); return r ? st.rows.filter(function (a) { return a.key === r.dataset.key; })[0] : null; }
    host.addEventListener('input', function (e) {
      var a = rowOf(e.target), k = e.target.dataset.k; if (!a || !k) return;
      a[k] = e.target.value; st.dirty();
    });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-accadd]')) {
        st.rows.push({ name: '', qty: '1', key: accKey() }); draw(); st.dirty();
        var ins = host.querySelectorAll('.qc-acc-row [data-k=name]'); if (ins.length) ins[ins.length - 1].focus();
        return;
      }
      var d = e.target.closest('[data-evdel]');
      if (d) { st.drop(st.ev[+d.dataset.evdel]); draw(); st.dirty(); return; }
      if (e.target.closest('[data-accdel]')) {
        var a = rowOf(e.target); if (!a) return;
        var ph = st.ev.filter(function (x) { return x.kind === 'accessories' && x.check_id === 'acc:' + a.key; });
        if (ph.length && !confirm('ลบ "' + (a.name || 'อุปกรณ์') + '" พร้อมรูป ' + ph.length + ' รูป?')) return;
        ph.forEach(st.drop);
        st.rows.splice(st.rows.indexOf(a), 1); draw(); st.dirty();
      }
    });
    host.addEventListener('change', async function (e) {
      var inp = e.target; if (!inp.matches('[data-accph]')) return;
      var a = rowOf(inp), f = inp.files && inp.files[0]; inp.value = ''; if (!a || !f) return;
      if (!/^image\//.test(f.type)) { page.toast('ช่องนี้รับเฉพาะรูปภาพ'); return; }
      var item = await pendingFile(f, 'accessories', 'acc:' + a.key); if (!item) return;
      st.ev.push(item); draw(); st.dirty();
    });
    draw();
    return { draw: draw };
  }
  /* upload the files picked while the QC was not saved yet; returns how many failed */
  async function uploadPending(qcId, machineId, pend, label) {
    var failed = 0, store = sb().storage.from(BUCKET);
    for (var i = 0; i < pend.length; i++) {
      var e = pend[i], ext = (String(e.name).match(/\.([a-z0-9]{1,5})$/i) || [])[1] || (e.mime.split('/')[1] || 'bin');
      var path = qcId + '/' + e.kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext.toLowerCase();
      if (label) label('กำลังอัปโหลดไฟล์ ' + (i + 1) + '/' + pend.length + '…');
      var up = await store.upload(path, e.blob, { contentType: e.mime, upsert: false });
      if (up.error) { failed++; continue; }
      var row = { qc_id: qcId, machine_id: machineId || null, kind: e.kind, path: path, name: e.name || '', mime: e.mime, size: e.size || 0 };
      if (e.check_id) row.check_id = e.check_id;
      var ins = await sb().from('qc_evidence').insert(row).select().single();
      if (ins.error) { failed++; store.remove([path]); continue; }
      e.pending = false; Object.assign(e, ins.data);
    }
    return failed;
  }

  /* ---------- รับเครื่องเข้า QC: new machine + IMODE S/N + QC job, in one server call ---------- */
  function openIntake() {
    if (tableMissing || !core) { warnSql(); page.toast('ต้องรันไฟล์ ' + SQL_FILE + ' ก่อน จึงจะรับเครื่องเข้า QC ได้'); return; }
    // 2026-11-12 meeting: no supplier / PO / project / Stock receipt here any more
    var accRow = function () {
      return '<div class="qn-row is-acc"><input data-k="item" placeholder="อุปกรณ์ที่ขาด" aria-label="อุปกรณ์ที่ขาด"><input data-k="qty" type="number" min="1" value="1" aria-label="จำนวน">' +
        '<input data-k="due" type="date" aria-label="กำหนดส่ง"><input data-k="who" placeholder="ผู้ติดตาม (จัดซื้อ)" aria-label="ผู้ติดตาม"><button type="button" class="sh-btn" data-del aria-label="ลบแถว">' + icon('close') + '</button></div>';
    };
    var acc = { rows: [], ev: [], drop: function (e) { var i = acc.ev.indexOf(e); if (i >= 0) acc.ev.splice(i, 1); try { URL.revokeObjectURL(e.blobUrl); } catch (x) {} },
      dirty: function () { dlg.dataset.dirty = '1'; } };
    var body = '<form id="inForm" class="qc-grid" novalidate>' +
      '<div class="qc-sec"><i>1</i> เครื่องจักร <small>IMODE S/N ออกให้อัตโนมัติเมื่อบันทึก</small></div>' +
      field('iNameTh', 'ชื่อเครื่อง (ไทย)', '', null, true) + field('iNameEn', 'ชื่อเครื่อง (อังกฤษ)', '') + field('iModel', 'รุ่น (Model)', '', null, true) +
      field('iFactorySn', 'Factory S/N', '', { ph: 'หมายเลขจากป้ายโรงงาน' }) + field('iReceived', 'วันที่รับเครื่อง', todayISO(), { type: 'date' }) +
      comboHTML('iCustomer', 'ลูกค้าที่จะส่งมอบ (ถ้าทราบ)', false, '', 'พิมพ์ชื่อลูกค้า หรือเว้นว่าง') +
      '<div class="qc-sec"><i>2</i> รับเครื่องและงาน QC</div>' +
      field('iRecvBy', 'ผู้รับเครื่อง', me(), { ph: 'ชื่อคนที่รับเครื่องเข้า' }) + field('iDelivBy', 'ผู้ส่งมอบ', '', { ph: 'ชื่อคนที่เอาเครื่องมาส่ง' }) +
      '<label class="qc-f"><span>สถานที่ตรวจ <small>พิมพ์หรือเลือก</small></span><input id="iLocation" list="qcLocList" placeholder="เช่น QC Area" autocomplete="off"></label>' + locOptions() +
      '<label class="qc-f"><span>ประเภท QC <b>*</b></span><select id="iType">' + INTAKE_TYPES.map(function (t) { return opt(t, TYPE_TH[t], t === 'Incoming Inspection'); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>ความเร่งด่วน</span><select id="iPriority">' + Object.keys(PRIORITY_TH).map(function (k) { return opt(k, PRIORITY_TH[k], k === 'normal'); }).join('') + '</select></label>' +
      field('iPlanned', 'วันที่นัดตรวจ', todayISO(), { type: 'date' }) +
      '<div class="qc-sec"><i>3</i> อุปกรณ์ที่มากับเครื่อง <small>ทีละชิ้น แต่ละชิ้นถ่ายรูปแนบได้</small></div>' +
      '<div class="qc-f full"><div class="qc-acc" id="iAcc"></div></div>' +
      (poOn ? '<div class="qc-f full"><span>อุปกรณ์ที่ยังขาด / ค้างส่ง (จัดซื้อตามทีละชิ้น)</span><div id="iAccRows"></div>' +
          '<button type="button" class="sh-btn" data-addacc>' + icon('plus') + '<span>เพิ่มอุปกรณ์ที่ขาด</span></button></div>'
        : '<label class="qc-f full"><span>อุปกรณ์ที่ยังขาด / ค้างส่ง</span><textarea id="iAccMiss" class="is-short" placeholder="เว้นว่างถ้าครบ"></textarea></label>') +
      '<label class="qc-f full"><span>หมายเหตุ</span><textarea id="iNote" class="is-short"></textarea></label>' +
      '</form>';
    show('รับเครื่องเข้า QC', 'ลงทะเบียนเครื่องใหม่ ออก IMODE S/N และเปิดงานตรวจในครั้งเดียว', body, btn('ยกเลิก', 'data-cancel') + btn('รับเครื่องและเริ่มตรวจ', 'data-save', true));
    var $ = function (s) { return dlg.querySelector(s); };
    var cust = bindCombo(dlg, 'iCustomer', {
      items: function () { return db.customers.map(function (c) { return { id: c.id, label: custLabel(c) }; }); }, value: '',
      addLabel: function (t) { return t ? '+ เพิ่มลูกค้าใหม่ "' + t + '"' : '+ เพิ่มลูกค้าใหม่'; },
      onAdd: function (t) { addCustomer(t, function (id) { cust.set(id); dlg.dataset.dirty = '1'; }); }
    });
    bindAcc($('#iAcc'), acc);
    $('#inForm').addEventListener('input', function () { dlg.dataset.dirty = '1'; });
    $('[data-cancel]').addEventListener('click', function () { if (dlg.dataset.dirty === '1' && !confirm('ปิดโดยไม่บันทึก?')) return; dlg.close(); });
    if (poOn) {
      $('[data-addacc]').addEventListener('click', function () { $('#iAccRows').insertAdjacentHTML('beforeend', accRow()); $('#iAccRows .qn-row:last-child input').focus(); });
      $('#iAccRows').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (b) b.parentNode.remove(); });
    }
    $('[data-save]').addEventListener('click', async function () {
      var v = function (s) { return $(s).value.trim(); };
      var miss = !v('#iNameTh') ? '#iNameTh' : !v('#iModel') ? '#iModel' : '';
      if (miss) { page.toast('กรอกชื่อเครื่องและรุ่นให้ครบ'); $(miss).focus(); return; }
      var fsn = v('#iFactorySn').toLowerCase(), model = v('#iModel').toLowerCase();
      if (fsn && db.machines.some(function (m) { return String(m.factorySn || '').toLowerCase() === fsn && String(m.model || '').toLowerCase() === model; })
        && !confirm('มีเครื่องรุ่นนี้ Factory S/N นี้ในระบบแล้ว ยังต้องการรับเข้าใหม่หรือไม่?')) return;
      var b = $('[data-save]'); b.disabled = true; b.textContent = 'กำลังบันทึก…';
      var outstanding = poOn ? [].map.call(dlg.querySelectorAll('#iAccRows .qn-row'), function (r) {
        var g = function (k) { return r.querySelector('[data-k=' + k + ']').value.trim(); };
        return { item: g('item'), qty: Math.max(1, +g('qty') || 1), dueDate: g('due') || null, followName: g('who') };
      }).filter(function (x) { return x.item; }) : [];
      var recv = v('#iRecvBy'), deliv = v('#iDelivBy');
      var r = await call('qc_intake', { p: {
        nameTh: v('#iNameTh'), nameEn: v('#iNameEn'), model: v('#iModel'), factorySn: v('#iFactorySn'),
        customerId: cust.get(), receivedAt: $('#iReceived').value,
        type: $('#iType').value, priority: $('#iPriority').value, plannedDate: $('#iPlanned').value, assignedTo: recv || me(),
        location: v('#iLocation'), accessories: accText(acc.rows), accessoriesMissing: poOn ? '' : v('#iAccMiss'), note: v('#iNote'),
        inspector: me(), targetCompany: INTERNAL } });
      if (r.error || !r.data) { b.disabled = false; b.textContent = 'รับเครื่องและเริ่มตรวจ'; page.toast('รับเครื่องไม่สำเร็จ: ' + ((r.error && r.error.message) || 'ไม่มีผลตอบกลับ')); return; }
      var d = r.data, warn = [];
      // what qc_intake does not take: receiver / deliverer and the plate switches (09), accessory photos, outstanding items
      if (meet) {
        var u = await sb().from('qc_records').update({ received_by: recv, delivered_by: deliv, photo_opts: { factoryPlate: true, imodePlate: true } }).eq('id', d.qc_id);
        if (u.error) warn.push('ผู้รับ/ผู้ส่งมอบ');
      }
      var pend = acc.ev.filter(function (e) { return e.pending; });
      if (pend.length) { var nf = await uploadPending(d.qc_id, d.machine_id, pend, function (t) { b.textContent = t; }); if (nf) warn.push('รูปอุปกรณ์ ' + nf + ' รูป'); }
      for (var i = 0; i < outstanding.length; i++) {
        var a = await call('qc_acc_add', { p: Object.assign({ machineId: d.machine_id }, outstanding[i]) });
        if (a.error) warn.push('อุปกรณ์ค้าง "' + outstanding[i].item + '"');
      }
      b.disabled = false; b.textContent = 'รับเครื่องและเริ่มตรวจ';
      dlg.dataset.dirty = '';
      await loadAll(); refreshList(); mirror();
      page.toast('รับเครื่องแล้ว IMODE S/N ' + d.imode_sn + ' · ' + d.qc_no + (warn.length ? ' (บันทึกไม่สำเร็จ: ' + warn.join(', ') + ' ใส่ใหม่ในฟอร์มตรวจ)' : ''));
      var q = byId(db.qc, d.qc_id);
      if (q) openForm(q); else dlg.close();
    });
  }

  /* ---------- machine history + hand-over ---------- */
  function openMachine(m) {
    var qs = db.qc.filter(function (q) { return q.machineId === m.id; });
    var cu = byId(db.customers, m.customerId);
    var info = [['IMODE S/N', m.imodeSn], ['Factory S/N', m.factorySn || m.serial], ['เครื่อง', machineName(m)], ['รุ่น', m.model], ['ผู้ขาย', m.supplier],
      ['PO', m.poNo], ['โครงการ', m.projectNo], ['วันที่รับเครื่อง', m.receivedAt ? thDate(m.receivedAt) : ''], ['ลูกค้า', cu && cu.name], ['สถานะเครื่อง', STAGE_TH[m.lifecycle] || 'เครื่องของลูกค้า']]
      .filter(function (x) { return x[1] || ['ผู้ขาย', 'PO', 'โครงการ'].indexOf(x[0]) < 0; });   // 2026-11-12: PO etc. only on older machines
    var body = '<dl class="qc-info">' + info.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="qc-sec qc-sec-block"><i>' + qs.length + '</i> ประวัติ QC</div>' +
      (qs.length ? '<ul class="qc-history">' + qs.map(function (q) {
        return '<li><button type="button" data-qc="' + esc(q.id) + '"><b>' + esc(q.qcNo) + '</b><span>' + esc(TYPE_TH[q.type] || q.type) + ' · ' + thDate(q.qcDate) + '</span>' +
          '<span class="sh-chip tone-' + (STATUS_TONE[STATUS_TH[q.status]] || 'grey') + '">' + esc(STATUS_TH[q.status] || q.status) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="qc-muted">ยังไม่มีใบ QC</p>') +
      (poOn ? machineStockHTML(m) : '') + (relOn ? machineRelHTML(m) : '') +
      (m.lifecycle === 'qc' ? '<p class="qc-hint">' + icon('alert') + '<span>' + (appr ? 'ส่งมอบได้เมื่อ Head QC อนุมัติ QC ล่าสุดของเครื่องนี้แล้วเท่านั้น' : 'ส่งมอบได้เมื่อ QC ล่าสุดของเครื่องนี้ "ผ่าน" แล้วเท่านั้น (ผ่านแบบมีเงื่อนไขไม่นับ)') + '</span></p>' : '');
    show(m.imodeSn || machineName(m), machineName(m) + (m.model ? ' · ' + m.model : ''), body,
      btn('ปิด', 'data-cancel') + btn('สร้าง QC ใหม่ให้เครื่องนี้', 'data-new') +
      (poOn && inQc(m) ? btn('เพิ่มอุปกรณ์ค้าง', 'data-accnew') : '') +
      (m.lifecycle !== 'ready' ? '' : !relOn ? btn('ส่งมอบให้ลูกค้า', 'data-hand', true)
        : relOfMachine(m.id) && relActive(relOfMachine(m.id)) ? btn('ดูการส่งมอบ', 'data-relview', true) : btn('วางแผนส่งมอบ', 'data-relplan', true)));
    var $ = function (s) { return dlg.querySelector(s); };
    $('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    $('[data-new]').addEventListener('click', function () { openForm(null, { machineId: m.id, customerId: m.customerId || '', type: inQc(m) ? 'Pre-Delivery QC' : '' }); });
    if ($('[data-hand]')) $('[data-hand]').addEventListener('click', function () { openHandover(m); });
    if ($('[data-accnew]')) $('[data-accnew]').addEventListener('click', function () { openAccNew(m); });
    if ($('[data-relplan]')) $('[data-relplan]').addEventListener('click', function () { openReleasePlan(m); });
    if ($('[data-relview]')) $('[data-relview]').addEventListener('click', function () { openRelease(relOfMachine(m.id).id); });
    dlg.querySelector('.qc-dlg-body').addEventListener('click', function (e) {
      var a = e.target.closest('[data-acc]'); if (a) { openAcc(byId(db.acc, a.dataset.acc)); return; }
      var r = e.target.closest('[data-rel]'); if (r) { openRelease(r.dataset.rel); return; }
      var b = e.target.closest('[data-qc]'); if (b) openDoc(byId(db.qc, b.dataset.qc));
    });
  }
  /* STEP 02: who in Stock received it, plus the outstanding accessories Purchasing follows */
  function machineStockHTML(m) {
    var rc = db.receipts.filter(function (x) { return x.machine_id === m.id; })[0];
    var acc = db.acc.filter(function (a) { return a.machine_id === m.id && a.status !== 'Cancelled'; });
    return '<div class="qc-sec qc-sec-block"><i>' + icon('inbox') + '</i> รับเข้า Stock และอุปกรณ์ค้าง</div>' +
      (rc ? '<p class="qa-text">' + esc(rc.receipt_no) + ' · รับโดย <b>' + esc(rc.stock_name) + '</b> · ' + esc(thTime(rc.received_at)) + (rc.location ? ' · ' + esc(rc.location) : '') +
          (rc.condition_note ? '<br>สภาพ: ' + esc(rc.condition_note) : '') + '<br><small class="qc-muted">บันทึกแทนโดย ' + esc(rc.recorded_name || '-') + '</small></p>'
        : '<p class="qc-muted">ไม่มีใบรับเข้า Stock (เครื่องรับก่อนมีระบบนี้)</p>') +
      (acc.length ? '<ul class="qc-history">' + acc.map(function (a) {
        return '<li><button type="button" data-acc="' + esc(a.id) + '"><b>' + esc(a.item) + ' x' + esc(a.qty) + '</b><span>' + esc(a.follow_name || 'ยังไม่มีผู้ติดตาม') + (a.due_date ? ' · กำหนด ' + esc(thDate(a.due_date)) : '') + '</span>' +
          '<span class="sh-chip tone-' + (ACC_TONE[ACC_TH[a.status]] || 'grey') + '">' + esc(ACC_TH[a.status] || a.status) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="qc-muted">ไม่มีอุปกรณ์ค้าง</p>');
  }
  function machineRelHTML(m) {
    var list = db.rel.filter(function (r) { return r.machine_id === m.id; });
    if (!list.length) return '';
    return '<div class="qc-sec qc-sec-block"><i>' + list.length + '</i> การส่งมอบ</div><ul class="qc-history">' + list.map(function (r) {
      return '<li><button type="button" data-rel="' + esc(r.id) + '"><b>' + esc(r.release_no) + '</b><span>' + esc(custName(r.customer_id) || '-') + (r.plan_date ? ' · ' + esc(thDate(r.plan_date)) : '') + '</span>' +
        '<span class="sh-chip tone-' + (REL_TONE[relLabel(r)] || 'grey') + '">' + esc(relLabel(r)) + '</span></button></li>';
    }).join('') + '</ul>';
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
    var nOpen = ncrOn && d.id ? ncrOf(d.id).filter(ncrOpen).length : 0;
    if (nOpen) out.push('มี NCR ที่ยังไม่ปิด ' + nOpen + ' ใบ');
    return out;   // 2026-11-12: photos are no longer required
  }
  /* both plate switches off → checklist item "Model / Serial / Nameplate" leaves; back on → it returns in its place */
  function syncIdentity() {
    var o = draft.photoOpts || photoOpts(draft), off = !o.factoryPlate && !o.imodePlate, at = -1;
    draft.checklist.forEach(function (x, i) { if (x.id === 'identity') at = i; });
    if (off && at >= 0) draft.identityItem = draft.checklist.splice(at, 1)[0];
    else if (!off && at < 0) {
      var it = draft.identityItem || freshChecklist()[1], ord = CHECKLIST.map(function (x) { return x.id; });
      var pos = draft.checklist.filter(function (x) { var k = ord.indexOf(x.id); return k >= 0 && k < 1; }).length;
      draft.checklist.splice(pos, 0, it); delete draft.identityItem;
    }
  }
  /* "ผ่าน" passes at once only for Head QC who did not create or inspect this QC (same rule as qc_pass / qc_decide) */
  function passDirect() {
    var ins = dlg.querySelector('#fInspector'), who = String((ins ? ins.value : draft.inspector) || '').trim().toLowerCase();
    return appr && meet && isHead && !!draft.id && draft.createdBy !== myId() && who !== String(me()).trim().toLowerCase();
  }

  /* old: a saved record to edit; preset: fields for a new one; restore: an unsaved draft coming back from preview */
  async function openForm(old, preset, restore) {
    if (tableMissing) { warnSql(); page.toast('ยังบันทึกไม่ได้ ต้องสร้างตาราง QC ในฐานข้อมูลก่อน'); return; }
    old = old || null; preset = preset || {};
    if (appr && old && !restore && LOCKED.indexOf(old.status) >= 0) {
      page.toast('ใบ ' + old.qcNo + ' ' + (STATUS_TH[old.status] || old.status) + ' แก้ไขไม่ได้' + (old.status === 'Pass' ? ' (Head QC กด "เปิดแก้" ได้)' : ''));
      openDoc(old); return;
    }
    var m0 = byId(db.machines, (old && old.machineId) || preset.machineId);
    draft = restore ? restore : old ? JSON.parse(JSON.stringify(old)) : {
      id: '', qcNo: nextNo(), type: TYPES.indexOf(preset.type) >= 0 ? preset.type : 'Pre-Delivery QC', qcDate: todayISO(), status: 'Draft',
      customerId: preset.customerId || (m0 && m0.customerId) || '', machineId: preset.machineId || '', caseId: preset.caseId || '',
      inspector: me(), reviewer: '', targetCompany: INTERNAL,
      checklist: freshChecklist(), findings: '', correctiveAction: '', note: '', media: [],
      assignedTo: me(), plannedDate: '', priority: 'normal', location: '', poNo: (m0 && m0.poNo) || '', projectNo: (m0 && m0.projectNo) || '',
      supplier: (m0 && m0.supplier) || '', receivedDate: (m0 && m0.receivedAt) || '', accessories: '', accessoriesMissing: '', accessoriesStatus: 'complete',
      receivedBy: me(), deliveredBy: '', photoOpts: { factoryPlate: true, imodePlate: true }
    };
    if (!draft.checklist || !draft.checklist.length) draft.checklist = freshChecklist();
    draft.photoOpts = photoOpts(draft);
    if (!restore) draft.accRows = accParse(draft.accessories);
    syncIdentity();
    if (!restore) { draft.ev = draft.id ? evOf(draft.id).slice() : []; draft.evGone = []; }
    if (draft.ev.length) await sign(draft.ev.filter(function (e) { return !e.blobUrl; }));
    var C = core;
    var back = appr && draft.status === 'Returned' ? lastDecision(draft.id, 'return') : null;
    var body = (back || (appr && draft.status === 'Returned') ? '<p class="qc-hint tone-red qc-returned">' + icon('alert') + '<span><b>ส่งกลับแก้</b>' +
        (back ? ' โดย ' + esc(back.by_name || 'Head QC') + ' · ' + esc(thTime(back.at)) : '') + ': "' + esc((back && back.comment) || draft.statusNote || '-') + '" แก้แล้วกดส่งให้ Head QC อนุมัติอีกครั้ง</span></p>' : '') +
      '<nav class="qc-steps" aria-label="ขั้นตอน">' +
      ['ข้อมูลงาน', C ? 'รูปเครื่อง' : null, 'Checklist', 'หลักฐาน', 'สรุปผล'].filter(Boolean).map(function (s, i) {
        return '<a href="#qcStep' + (i + 1) + '" data-step="' + (i + 1) + '"><i>' + (i + 1) + '</i><span>' + esc(s) + '</span></a>';
      }).join('') + '</nav>' +
      '<form id="qcForm" class="qc-grid" novalidate>' +
      '<div class="qc-sec" id="qcStep1"><i>1</i> ข้อมูลงาน QC</div>' +
      '<label class="qc-f"><span>เลขที่ QC</span><input id="fNo" value="' + esc(draft.qcNo) + '" readonly></label>' +
      '<label class="qc-f"><span>ประเภท QC <b>*</b></span><select id="fType">' + TYPES.map(function (t) { return opt(t, TYPE_TH[t] + ' (' + t + ')', draft.type === t); }).join('') + '</select></label>' +
      '<label class="qc-f"><span>วันที่ตรวจ <b>*</b></span><input id="fDate" type="date" value="' + esc(draft.qcDate) + '" required></label>' +
      comboHTML('fCustomer', 'ลูกค้า', true, '', 'พิมพ์ชื่อลูกค้าเพื่อค้นหา') +
      comboHTML('fMachine', 'เครื่องจักร', true, '', 'พิมพ์ IMODE S/N, ชื่อ, รุ่น หรือ S/N') +
      '<label class="qc-f"><span>Service Case</span><select id="fCase"></select></label>' +
      '<label class="qc-f"><span>ผู้ตรวจ QC <b>*</b></span><input id="fInspector" value="' + esc(draft.inspector) + '" autocomplete="off"></label>' +
      (appr ? '<label class="qc-f"><span>ผู้อนุมัติ (Head QC)</span><input id="fReviewer" value="' + esc(draft.approverName || draft.reviewer) + '" readonly placeholder="ระบบใส่ให้เมื่อ Head QC อนุมัติ"></label>'
        : '<label class="qc-f"><span>ผู้อนุมัติ</span><input id="fReviewer" value="' + esc(draft.reviewer) + '" autocomplete="off"></label>') +
      '<label class="qc-f"><span>QC เพื่อส่งให้บริษัท</span><input id="fTarget" value="' + esc(draft.targetCompany) + '" placeholder="เช่น ' + INTERNAL + '"></label>' +
      (C ? (meet ? field('fRecvBy', 'ผู้รับเครื่อง', draft.receivedBy, { ph: 'ชื่อคนที่รับเครื่องเข้า' }) + field('fDelivBy', 'ผู้ส่งมอบ', draft.deliveredBy, { ph: 'ชื่อคนที่เอาเครื่องมาส่ง' }) : '') +
        field('fPlanned', 'วันที่นัดตรวจ', draft.plannedDate, { type: 'date' }) +
        '<label class="qc-f"><span>ความเร่งด่วน</span><select id="fPriority">' + Object.keys(PRIORITY_TH).map(function (k) { return opt(k, PRIORITY_TH[k], draft.priority === k); }).join('') + '</select></label>' +
        '<label class="qc-f"><span>สถานที่ตรวจ <small>พิมพ์หรือเลือก</small></span><input id="fLocation" list="qcLocList" value="' + esc(draft.location) + '" placeholder="เช่น QC Area" autocomplete="off"></label>' + locOptions() +
        field('fReceived', 'วันที่รับเครื่อง', draft.receivedDate, { type: 'date' }) +
        '<div class="qc-f qc-f-note" id="fSnBox"></div>' +
        '<div class="qc-f full"><span>อุปกรณ์ที่มากับเครื่อง <small>ทีละชิ้น แต่ละชิ้นถ่ายรูปแนบได้</small></span><div class="qc-acc" id="fAccList"></div></div>' +
        '<label class="qc-f full"><span>อุปกรณ์ที่ยังขาด / ค้างส่ง <small>เว้นว่างถ้าครบ</small></span><textarea id="fAccMiss" class="is-short">' + esc(draft.accessoriesMissing) + '</textarea></label>' : '') +
      (C ? '<div class="qc-sec" id="qcStep2"><i>2</i> รูปเครื่อง <small>ไม่บังคับ แตะช่องเพื่อถ่ายหรือเลือกรูป</small></div>' +
        '<div class="qc-f full"><div class="qc-sw-row" role="group" aria-label="รูปป้าย S/N">' + PLATES.map(function (k) {
          return '<label class="qc-sw"><input type="checkbox" data-popt="' + k + '"' + (draft.photoOpts[k] ? ' checked' : '') + '><i aria-hidden="true"></i><span>รูป' + esc(KIND_TH[k]) + '</span></label>';
        }).join('') + '<small>ปิดทั้งสองอัน ข้อ "ตรวจ Model / Serial / Nameplate" จะไม่อยู่ใน Checklist</small></div>' +
        '<div class="qc-photos" id="fPhotos"></div></div>' : '') +
      '<div class="qc-sec" id="qcStep' + (C ? 3 : 2) + '"><i>' + (C ? 3 : 2) + '</i> รายการตรวจสอบ <small>เลือกผลแล้วระบบจะบันทึกชื่อผู้ตรวจและเวลาให้ N/A ต้องใส่เหตุผลในหมายเหตุ</small></div>' +
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
      '<label class="qc-f"><span>' + (appr ? 'สถานะ' : 'ผล QC') + '</span><select id="fStatus">' +
        (appr ? (draft.status === 'Returned' ? ['Returned', 'In Progress', 'Pass', 'Fail'] : ['Draft', 'In Progress', 'Pass', 'Fail']) : ['Draft', 'In Progress', 'Pass', 'Conditional', 'Fail'])
          .map(function (s) { return opt(s, STATUS_TH[s], draft.status === s); }).join('') + '</select>' +
        (appr ? '<small class="qc-f-help">' + (passDirect() ? 'เลือก "ผ่าน" แล้วกดบันทึก ใบจะผ่านทันที (คุณเป็น Head QC)' : 'เลือก "ผ่าน" แล้วกดบันทึก ใบจะถูกส่งให้ Head QC อนุมัติ') + '</small>' : '') + '</label>' +
      '<div class="qc-f qc-f-wide"><div class="qc-gate" id="fGate" aria-live="polite"></div></div>' +
      '<label class="qc-f full"><span>หมายเหตุ / Release Note</span><textarea id="fNote">' + esc(draft.note) + '</textarea></label>' +
      '</form>';
    show(draft.id ? 'แก้ไข QC ' + draft.qcNo : 'สร้าง QC เครื่อง', 'ตรวจตามขั้นตอน 1 ถึง ' + (C ? 5 : 4) + (appr ? ' แล้วส่งให้ Head QC อนุมัติ' : ' แล้วบันทึก') + ' บันทึกระหว่างทางได้ตลอด', body,
      btn('ยกเลิก', 'data-cancel') + btn('ดูเอกสาร QC 2 หน้า', 'data-preview') + btn('บันทึก QC', 'data-save', !appr) +
      (appr ? btn('ส่งให้ Head QC อนุมัติ', 'data-submit', true) : ''));

    var $ = function (s) { return dlg.querySelector(s); };
    // machines still in QC have no customer yet, so they stay listed whatever customer is chosen
    function machineList() {
      var cid = $('#fCustomer').value;
      return db.machines.filter(function (m) { return !cid || String(m.customerId) === String(cid) || inQc(m) || String(m.id) === String(draft.machineId); });
    }
    var cuCombo = bindCombo(dlg, 'fCustomer', {
      items: function () { return db.customers.map(function (c) { return { id: c.id, label: custLabel(c) }; }); }, value: draft.customerId,
      onPick: function (id) { draft.customerId = id; fillMachines(); },
      addLabel: function (t) { return t ? '+ เพิ่มลูกค้าใหม่ "' + t + '"' : '+ เพิ่มลูกค้าใหม่'; },
      onAdd: function (t) { addCustomer(t, function (id) { cuCombo.set(id); dlg.dataset.dirty = '1'; }); }
    });
    var mCombo = bindCombo(dlg, 'fMachine', {
      items: function () { return machineList().map(function (m) { return { id: m.id, label: machLabel(m) }; }); }, value: draft.machineId,
      onPick: function (id) { pickMachine(id); },
      addLabel: function (t) { return t ? '+ เพิ่มเครื่องใหม่ "' + t + '"' : '+ เพิ่มเครื่องใหม่'; },
      onAdd: function (t) { addMachine(t, $('#fCustomer').value, $('#fType').value, function (id) { mCombo.set(id); dlg.dataset.dirty = '1'; }); }
    });
    function fillMachines() {
      if (!machineList().some(function (m) { return String(m.id) === String(draft.machineId); })) { draft.machineId = ''; mCombo.set('', true); }
      fillCases(); drawSn();
    }
    function pickMachine(id) {
      draft.machineId = id;
      var m = byId(db.machines, id);
      if (m && m.customerId && !$('#fCustomer').value) { cuCombo.set(m.customerId, true); draft.customerId = m.customerId; }
      if (m && C && $('#fReceived') && !$('#fReceived').value && m.receivedAt) $('#fReceived').value = m.receivedAt;
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
      var cuStar = $('.qc-req-fCustomer'); if (cuStar) cuStar.hidden = !!(m && inQc(m));
    }
    $('#fCase').addEventListener('change', function () { draft.caseId = this.value; });
    $('#fType').addEventListener('change', function () { draft.type = this.value; drawGate(); });
    $('#fStatus').addEventListener('change', function () { draft.status = this.value; drawGate(); });
    $('#fInspector').addEventListener('input', drawGate);
    fillMachines();
    if ($('#fAccList')) bindAcc($('#fAccList'), { rows: draft.accRows, ev: draft.ev, drop: dropEv, dirty: function () { dlg.dataset.dirty = '1'; } });
    [].forEach.call(dlg.querySelectorAll('[data-popt]'), function (cb) {
      cb.addEventListener('change', function () {
        var k = cb.dataset.popt, had = (draft.ev || []).filter(function (x) { return x.kind === k; });
        if (!cb.checked && had.length && !confirm('ปิดรูป' + KIND_TH[k] + ' และลบรูปที่ถ่ายไว้ ' + had.length + ' รูป?')) { cb.checked = true; return; }
        if (!cb.checked) had.forEach(dropEv);
        draft.photoOpts[k] = cb.checked; syncIdentity();
        dlg.dataset.dirty = '1'; drawPhotos(); drawChecks(); drawGate();
      });
    });
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
    $('[data-save]').addEventListener('click', function () { save(false); });
    if ($('[data-submit]')) $('[data-submit]').addEventListener('click', function () { save(true); });
    if (restore) dlg.dataset.dirty = '1';
    drawGate();
  }

  function drawGate() {
    var host = dlg.querySelector('#fGate'); if (!host) return;
    var st = dlg.querySelector('#fStatus').value, probs = passProblems(draft);
    var steps = dlg.querySelectorAll('.qc-steps a');
    if (steps.length) {   // tick the steps that are complete
      var have = {}; (draft.ev || []).forEach(function (e) { have[e.kind] = 1; });
      var photosOk = PHOTOS.some(function (p) { return have[p.kind]; }), s = stats(draft);   // optional: ticked once any photo is in
      var fnd = dlg.querySelector('#fFindings'), extra = !!((fnd && fnd.value.trim()) || draft.media.length || (draft.ev || []).some(function (e) { return e.kind === 'extra' || e.kind === 'test'; }));
      var done = core ? [!!draft.machineId, photosOk, s.done === s.total, extra, st !== 'Draft'] : [!!draft.machineId, s.done === s.total, extra, st !== 'Draft'];
      [].forEach.call(steps, function (a, i) { a.classList.toggle('is-done', !!done[i]); });
    }
    var sub = dlg.querySelector('[data-submit]');
    if (appr) {
      var sv = dlg.querySelector('[data-save]'), help = dlg.querySelector('#fStatus + .qc-f-help'), direct = passDirect();
      if (help) help.textContent = direct ? 'เลือก "ผ่าน" แล้วกดบันทึก ใบจะผ่านทันที (คุณเป็น Head QC และไม่ใช่ผู้ตรวจใบนี้)' : 'เลือก "ผ่าน" แล้วกดบันทึก ใบจะถูกส่งให้ Head QC อนุมัติ';
      if (sub) sub.style.display = st === 'Pass' ? 'none' : '';
      if (sv && !sv.dataset.idle) sv.dataset.idle = sv.textContent;
      if (sv && sv.textContent.indexOf('กำลัง') < 0) sv.textContent = st === 'Pass' ? (direct ? 'บันทึกผล "ผ่าน"' : 'บันทึกและส่ง Head QC') : sv.dataset.idle;
      if (sv) sv.classList.toggle('is-primary', st === 'Pass');
      if (st === 'Pass') {
        if (sv) { sv.disabled = !!probs.length; sv.title = probs.length ? 'ยังผ่านไม่ได้: ' + probs.join(' · ') : ''; }
        host.innerHTML = probs.length ? '<p class="qc-hint tone-orange">' + icon('alert') + '<span>ยังเลือก "ผ่าน" ไม่ได้: ' + esc(probs.join(' · ')) + '</span></p>'
          : '<p class="qc-hint tone-green">' + icon('check') + '<span>' + (direct ? 'ครบเงื่อนไขแล้ว กดบันทึก ใบนี้จะผ่าน QC ทันที เครื่องเปลี่ยนเป็น "ผ่าน QC รอส่งมอบ"'
            : 'ครบเงื่อนไขแล้ว กดบันทึก ใบนี้จะถูกส่งให้ Head QC อนุมัติ (ผู้ตรวจหรือผู้สร้างใบอนุมัติเองไม่ได้)') + '</span></p>';
        return;
      }
      if (sv) { sv.disabled = false; sv.title = ''; }
      if (sub) { sub.disabled = !!probs.length || st === 'Fail'; sub.title = probs.length ? 'ยังส่งไม่ได้: ' + probs.join(' · ') : st === 'Fail' ? 'สถานะ "ไม่ผ่าน" ส่งอนุมัติไม่ได้' : ''; }
      host.innerHTML = st === 'Fail' ? '<p class="qc-hint tone-red">' + icon('alert') + '<span>บันทึกเป็น "ไม่ผ่าน" ระบุสิ่งที่พบและแนวทางแก้ไข เมื่อแก้แล้วเปลี่ยนเป็น "กำลังตรวจ" และส่งอนุมัติใหม่</span></p>'
        : probs.length ? '<p class="qc-hint tone-orange">' + icon('alert') + '<span>ยังส่งอนุมัติไม่ได้: ' + esc(probs.join(' · ')) + '</span></p>'
        : '<p class="qc-hint tone-green">' + icon('check') + '<span>ครบเงื่อนไขแล้ว กด "ส่งให้ Head QC อนุมัติ" ได้ ระบบตรวจซ้ำฝั่งฐานข้อมูลก่อนรับเรื่อง ส่งแล้วแก้ไขใบนี้ไม่ได้จนกว่า Head QC จะส่งกลับ</span></p>';
      return;
    }
    if (st === 'Conditional') host.innerHTML = '<p class="qc-hint tone-orange">' + icon('alert') + '<span>ผ่านแบบมีเงื่อนไข <b>ไม่นับเป็นผ่าน</b> ส่งมอบเครื่องไม่ได้จนกว่าจะแก้ไข ตรวจซ้ำ และได้ผลผ่าน</span></p>';
    else if (st === 'Pass' && probs.length) host.innerHTML = '<p class="qc-hint tone-red">' + icon('alert') + '<span>ยังบันทึกเป็น "ผ่าน" ไม่ได้: ' + esc(probs.join(' · ')) + '</span></p>';
    else if (st === 'Pass') host.innerHTML = '<p class="qc-hint tone-green">' + icon('check') + '<span>ครบเงื่อนไขผ่าน QC แล้ว</span></p>';
    else host.innerHTML = probs.length ? '<p class="qc-hint">' + icon('clock') + '<span>ก่อนบันทึกเป็น "ผ่าน" ต้อง: ' + esc(probs.join(' · ')) + '</span></p>' : '<p class="qc-hint tone-green">' + icon('check') + '<span>ครบเงื่อนไขผ่าน QC แล้ว เลือกผล "ผ่าน" ได้</span></p>';
  }

  /* the seven required photo slots */
  function drawPhotos() {
    var host = dlg.querySelector('#fPhotos'); if (!host) return;
    var o = draft.photoOpts || photoOpts(draft);
    host.innerHTML = PHOTOS.filter(function (p) { return o[p.kind] !== false; }).map(function (p) {
      var e = (draft.ev || []).filter(function (x) { return x.kind === p.kind; }).slice(-1)[0], url = e && evUrl(e);
      return '<div class="qc-photo' + (e ? ' has-file' : '') + '">' +
        '<label>' + (url ? '<img src="' + esc(url) + '" alt="' + esc(p.th) + '">' : '<span class="qc-photo-empty">' + icon('plus') + '<em>ถ่าย / เลือกรูป</em></span>') +
        '<input type="file" accept="image/*" data-kind="' + p.kind + '" aria-label="รูป' + esc(p.th) + '"></label>' +
        '<div class="qc-photo-cap"><span>' + esc(p.th) + '</span>' + (e ? '<button type="button" data-drop="' + p.kind + '">ลบ</button>' : '') + '</div></div>';
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
    var i = draft.ev.indexOf(e); if (i >= 0) draft.ev.splice(i, 1);
    if (e.pending) { try { URL.revokeObjectURL(e.blobUrl); } catch (x) {} } else draft.evGone.push(e);
  }
  /* a picked file becomes a pending evidence item; it is uploaded when the QC is saved */
  async function pendingFile(f, kind, checkId) {
    try {
      var blob = f, mime = f.type || 'application/octet-stream';
      if (/^image\//.test(mime)) { var s = await shrink(f); blob = dataUrlBlob(s.data); mime = blob.type; }
      if (blob.size > MAX_FILE_MB * 1024 * 1024) { page.toast('ไฟล์ ' + f.name + ' ใหญ่เกิน ' + MAX_FILE_MB + ' MB'); return null; }
      return { pending: true, kind: kind, check_id: checkId || null, blob: blob, name: f.name, mime: mime, size: blob.size, blobUrl: URL.createObjectURL(blob) };
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
        '<div class="qc-check-v is-note">' +
          '<input data-k="remark" placeholder="' + (it.result === 'N/A' ? 'เหตุผลที่ N/A (จำเป็น)' : 'หมายเหตุ') + '" value="' + esc(it.remark || '') + '"' + (naMiss ? ' aria-invalid="true"' : '') + ' aria-label="หมายเหตุข้อ ' + (i + 1) + '">' +
        '</div>' + (ncrOn ? '<div class="qc-check-ncr">' + ncrSlot(it) + '</div>' : '') + '</div>';
    }).join('');
    host.onclick = function (e) {
      var nb = e.target.closest('[data-ncr],[data-ncrnew]');
      if (nb) {
        if (nb.dataset.ncr) { openNcr(nb.dataset.ncr); return; }
        var saved = draft.id && byId(db.qc, draft.id);
        var item = draft.checklist[+nb.closest('.qc-check').dataset.i];
        // 2026-11-13 (tester A10): an unsaved form is saved first, then the NCR opens straight away
        if (!saved || dlg.dataset.dirty === '1') { save(false, function (q) { openNcrNew(q, (q.checklist || []).filter(function (x) { return x.id === item.id; })[0] || item); }); return; }
        openNcrNew(saved, item); return;
      }
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
      var ns = row.querySelector('.qc-check-ncr'); if (ns) ns.innerHTML = ncrSlot(it);
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
  /* NCR line under a checklist row: existing NCRs for the item, or a button to open one when it failed */
  function ncrSlot(it) {
    var list = draft.id ? ncrOf(draft.id).filter(function (n) { return n.item_id === it.id && n.status !== 'Cancelled'; }) : [];
    var chips = list.map(function (n) {
      return '<button type="button" class="sh-chip qc-ncr-chip tone-' + (NCR_TONE[NCR_TH[n.status]] || 'grey') + '" data-ncr="' + esc(n.id) + '">' + esc(n.ncr_no) + ' · ' + esc(NCR_TH[n.status] || n.status) + '</button>';
    }).join('');
    var canNew = it.result === 'Fail' && !list.some(ncrOpen) && (!draft.status || LOCKED.indexOf(draft.status) < 0);
    return chips + (canNew ? '<button type="button" class="sh-btn qc-ncr-new" data-ncrnew>' + icon('alert') + '<span>เปิด NCR ข้อนี้</span></button>' : '');
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
    if ($('#fPlanned')) {
      draft.plannedDate = v('#fPlanned'); draft.priority = $('#fPriority').value; draft.location = v('#fLocation');
      draft.receivedDate = v('#fReceived'); draft.accessoriesMissing = v('#fAccMiss');
      if ($('#fRecvBy')) { draft.receivedBy = v('#fRecvBy'); draft.deliveredBy = v('#fDelivBy'); }
      if (draft.accRows) draft.accessories = accText(draft.accRows);
    }
  }

  async function upsertDraft(status) {
    var row = toRow(draft); if (status) row.status = status;
    return sb().from('qc_records').upsert(row, { onConflict: 'id' }).select().single();
  }
  /* submit: after saving, send to Head QC (qc_submit checks the gate again on the server) */
  async function save(submit, after) {   // after(savedQc): keep going (e.g. open an NCR) instead of closing
    readForm();
    var m = byId(db.machines, draft.machineId);
    var miss = !draft.customerId && !inQc(m) ? '#fCustomer' : !draft.machineId ? '#fMachine' : !draft.qcDate ? '#fDate' : !draft.inspector ? '#fInspector' : '';
    if (miss) { page.toast('กรอกช่องที่มี * ให้ครบ'); dlg.querySelector(miss).focus(); return; }
    if (submit) {
      var sp = passProblems(draft);
      if (draft.status === 'Fail') sp.unshift('สถานะ "ไม่ผ่าน" ส่งอนุมัติไม่ได้ เปลี่ยนเป็น "กำลังตรวจ" หลังแก้ไขแล้ว');
      if (sp.length) { page.toast('ยังส่งอนุมัติไม่ได้: ' + sp[0]); drawGate(); dlg.querySelector('#fGate').scrollIntoView({ block: 'nearest' }); return; }
    }
    var wantPass = appr && draft.status === 'Pass';
    if (wantPass) {
      var pp = passProblems(draft);
      if (pp.length) { page.toast('ยังผ่านไม่ได้: ' + pp[0]); drawGate(); dlg.querySelector('#fGate').scrollIntoView({ block: 'nearest' }); return; }
      draft.status = 'In Progress'; submit = false;   // the server sets ผ่าน (qc_pass) or sends it to Head QC
    }
    if (draft.status === 'Pass' && !appr) {
      var probs = passProblems(draft);
      if (probs.length) { page.toast('ยังบันทึกเป็นผ่านไม่ได้: ' + probs[0]); drawGate(); dlg.querySelector('#fGate').scrollIntoView({ block: 'nearest' }); return; }
    }
    if (draft.status === 'Draft' && stats(draft).done > 0) draft.status = 'In Progress';
    var b = dlg.querySelector(submit ? '[data-submit]' : '[data-save]'), idle = b.textContent, label = function (t) { b.textContent = t; };
    if (wantPass) idle = b.dataset.idle || idle;
    [].forEach.call(dlg.querySelectorAll('.qc-dlg-foot button'), function (x) { x.disabled = true; });
    var done = function () { [].forEach.call(dlg.querySelectorAll('.qc-dlg-foot button'), function (x) { x.disabled = false; }); label(idle); drawGate(); };
    label('กำลังบันทึก…');
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
    if (r.error) { done(); if (isNew) draft.id = ''; page.toast('บันทึกไม่สำเร็จ: ' + r.error.message); return; }

    var store = sb().storage.from(BUCKET);
    var failed = await uploadPending(draft.id, draft.machineId, pend, label);
    for (var j = 0; j < (draft.evGone || []).length; j++) {
      var g = draft.evGone[j];
      var del = await sb().from('qc_evidence').delete().eq('id', g.id);
      if (!del.error) store.remove([g.path]);
    }
    draft.evGone = [];
    if (first && !failed) r = await upsertDraft();
    if (r.error) { done(); page.toast('บันทึกผลไม่สำเร็จ: ' + r.error.message); return; }

    var sent = null, passed = false;
    if (submit && !failed) {
      label('กำลังส่งให้ Head QC…');
      sent = await sb().rpc('qc_submit', { p_qc_id: draft.id });
    }
    if (wantPass && !failed) {
      label('กำลังบันทึกผล…');
      sent = meet ? await call('qc_pass', { p_qc_id: draft.id }) : await sb().rpc('qc_submit', { p_qc_id: draft.id });
      passed = !!(meet && sent && !sent.error && sent.data && sent.data.passed);
    }
    done();
    await loadAll(); refreshList(); mirror();
    var saved = byId(db.qc, draft.id) || fromRow(r.data);
    if (failed) {
      page.toast('บันทึก ' + saved.qcNo + ' แล้ว แต่อัปโหลดไฟล์ไม่สำเร็จ ' + failed + ' ไฟล์' + (first ? ' ผลจึงยังเป็น "กำลังตรวจ"' : submit ? ' จึงยังไม่ได้ส่งอนุมัติ' : '') + ' ลองเพิ่มใหม่อีกครั้ง');
      openForm(saved);
      return;
    }
    if (sent && sent.error) {   // saved, but the server gate said no: stay on the form
      dlg.dataset.dirty = '';
      page.toast('บันทึกแล้ว แต่' + (wantPass ? 'ตั้งผ่านไม่สำเร็จ: ' : 'ส่งอนุมัติไม่สำเร็จ: ') + sent.error.message.replace(/^(ยังส่งอนุมัติไม่ได้|ยังผ่านไม่ได้):\s*/, ''));
      openForm(saved);
      return;
    }
    dlg.dataset.dirty = '';
    if (after && !sent) { page.toast('บันทึก ' + saved.qcNo + ' แล้ว'); after(saved); return; }
    dlg.close();
    page.toast(passed ? saved.qcNo + ' ผ่าน QC แล้ว เครื่องพร้อมส่งมอบ' : sent ? 'ส่ง ' + saved.qcNo + ' ให้ Head QC อนุมัติแล้ว' : 'บันทึก ' + saved.qcNo + ' แล้ว');
  }

  /* ---------- the two-page Thai document (Service js/05 qcDocHTML layout) ---------- */
  function docHTML(q, evs) {
    var m = byId(db.machines, q.machineId) || {}, cu = byId(db.customers, q.customerId || m.customerId) || {}, c = byId(db.cases, q.caseId), st = stats(q), S = db.settings || {};
    /* 2026-11-12: small thumbnails, four to a row, under headings */
    var accRows = accParse(q.accessories), accName = {}; accRows.forEach(function (a) { accName['acc:' + a.key] = a.name; });
    var imgs = (evs || []).filter(function (e) { return /^image\//.test(e.mime || '') && evUrl(e); });
    var GROUPS = [['รูปรอบเครื่อง', ['front', 'back', 'left', 'right']], ['ป้าย S/N', ['factoryPlate', 'imodePlate']], ['อุปกรณ์ที่มากับเครื่อง', ['accessories']]];
    var used = {}, groups = GROUPS.map(function (g) {
      var list = [];
      g[1].forEach(function (k) { imgs.filter(function (e) { return e.kind === k; }).forEach(function (e) { used[imgs.indexOf(e)] = 1; list.push({ src: evUrl(e), name: k === 'accessories' ? accName[e.check_id] || 'อุปกรณ์' : KIND_TH[k] }); }); });
      return [g[0], list];
    });
    var extra = imgs.filter(function (e, i) { return !used[i]; }).map(function (e) { return { src: evUrl(e), name: (KIND_TH[e.kind] || 'รูปเพิ่มเติม') + (e.name && (e.kind === 'extra' || e.kind === 'test') ? ' · ' + e.name : '') }; })
      .concat((q.media || []).filter(function (x) { return /^image\//.test(String(x.type || '')); }).map(function (x) { return { src: x.data, name: x.name || 'รูปประกอบ QC' }; }));
    groups.push(['หลักฐานเพิ่มเติม', extra]);
    var photoHTML = groups.filter(function (g) { return g[1].length; }).map(function (g) {
      return '<div class="qc-doc-section-title">' + esc(g[0]) + ' <small>(' + g[1].length + ' รูป)</small></div><div class="qc-pgrid">' + g[1].map(function (x) {
        return '<figure><div class="ph"><img src="' + esc(x.src) + '" alt="' + esc(x.name) + '"></div><figcaption>' + esc(x.name) + '</figcaption></figure>';
      }).join('') + '</div>';
    }).join('') || '<div class="qc-doc-section-title">รูปภาพประกอบ</div><p class="qc-pgrid-empty">ไม่มีรูปประกอบ</p>';
    var hasVals = (q.checklist || []).some(function (it) { return it.measured || it.standard; });   // older QC still print their values
    var rows = (q.checklist || []).map(function (it, i) {
      var val = [it.measured ? 'วัดได้ ' + it.measured : '', it.standard ? 'มาตรฐาน ' + it.standard : '', it.remark || ''].filter(Boolean).join(' · ');
      return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(it.labelTh || it.labelEn || it.id) + '</td><td class="result">' + esc(STATUS_TH[it.result] || it.result || '-') + '</td><td class="remark">' + esc(val || '-') + '</td></tr>';
    }).join('');
    var company = esc(S.companyNameTh || S.companyName || INTERNAL), address = esc(S.companyAddress || ''), phone = esc(S.companyPhone || '-'), email = esc(S.companyEmail || '-');
    var mName = esc(machineName(m) || '-'), model = esc(m.model || '-'), serial = esc(m.factorySn || m.serial || '-'), customer = esc(cu.name || '-'), target = esc(q.targetCompany || INTERNAL);
    var imodeSn = m.imodeSn ? '<br><b>IMODE S/N:</b> ' + esc(m.imodeSn) : '', po = q.poNo ? '<br><b>PO / ผู้ขาย:</b> ' + esc(q.poNo) + (q.supplier ? ' / ' + esc(q.supplier) : '') : '';
    var ticket = esc((c && c.ticket) || '-'), type = esc(TYPE_TH[q.type] || q.type || '-'), result = esc(STATUS_TH[q.status] || q.status);
    if (q.status === 'Conditional') result += ' (ยังไม่นับเป็นผ่าน)';

    var head = function (title, pageName, sub) {
      return '<div class="qc-doc-page-head"><img src="' + esc(DOC_LOGO) + '" alt="I-MODE"><div><h1>' + title + '</h1><div class="page-name">' + pageName + '</div><div class="qc-doc-company"><b>' + company + '</b><br>' + sub + '</div></div></div>';
    };
    return '<div class="qc-doc-stack" id="qcPrintDoc">' +
      '<section class="qc-doc-page qc-doc-page-1">' + head('ใบตรวจสอบคุณภาพเครื่องจักร (QC)', 'หน้าที่ 1 / 2 — รายการตรวจสอบ', address + '<br>โทร. ' + phone + ' · ' + email) +
        '<div class="qc-doc-info"><div><b>เลขที่ QC:</b> ' + esc(q.qcNo || '-') + '<br><b>ประเภทการตรวจ:</b> ' + type + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>เลขที่งานบริการ:</b> ' + ticket + po +
          (q.location ? '<br><b>สถานที่ตรวจ:</b> ' + esc(q.location) : '') +
          (q.receivedBy || q.deliveredBy ? '<br><b>ผู้รับเครื่อง / ผู้ส่งมอบ:</b> ' + esc(q.receivedBy || '-') + ' / ' + esc(q.deliveredBy || '-') : '') + '</div>' +
        '<div><b>ลูกค้า:</b> ' + customer + '<br><b>เอกสารส่งให้:</b> ' + target + '<br><b>เครื่องจักร:</b> ' + mName + '<br><b>รุ่น / หมายเลขเครื่อง:</b> ' + model + ' / ' + serial + imodeSn + '</div></div>' +
        '<table class="qc-doc-table"><thead><tr><th class="n">ลำดับ</th><th>รายการตรวจสอบ</th><th class="result">ผลการตรวจ</th><th class="remark">' + (hasVals ? 'ค่าที่วัด / หมายเหตุ' : 'หมายเหตุ') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="qc-doc-summary"><div><b>สรุปรายการตรวจ:</b> ตรวจแล้ว ' + st.done + '/' + st.total + ' รายการ · ผ่าน ' + st.pass + ' รายการ · ไม่ผ่าน ' + st.fail + ' รายการ' +
          (accRows.length ? '<br><b>อุปกรณ์ที่มากับเครื่อง:</b> ' + esc(accLabel(q.accessories)) : '') +
          (q.accessoriesMissing ? '<br><b>อุปกรณ์ค้างส่ง:</b> ' + esc(q.accessoriesMissing) : '') + '</div>' +
        '<div><b>ผล QC:</b> ' + result + '<br><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผู้อนุมัติ:</b> ' + esc(q.approverName || q.reviewer || '-') + (q.approvedAt ? ' · ' + thDate(q.approvedAt) : '') + '</div></div>' +
        '<div class="qc-doc-sign"><div><b>ผู้ตรวจ QC</b><div>วันที่ ....................</div></div><div><b>ฝ่ายบริการ / เทคนิค</b><div>วันที่ ....................</div></div><div><b>ผู้อนุมัติ / ผู้รับมอบ</b><div>วันที่ ....................</div></div></div>' +
      '</section>' +
      '<section class="qc-doc-page qc-doc-page-2">' + head('ภาพประกอบการตรวจ QC', 'หน้าที่ 2 / 2 — หลักฐานประกอบการตรวจ QC', 'เลขที่ QC ' + esc(q.qcNo || '-') + ' · ' + mName + ' · ' + model + ' · S/N ' + serial + (m.imodeSn ? ' · ' + esc(m.imodeSn) : '')) +
        '<div class="qc-doc-info"><div><b>ลูกค้า:</b> ' + customer + '<br><b>วันที่ตรวจ:</b> ' + thDate(q.qcDate) + '<br><b>ประเภทการตรวจ:</b> ' + type + '</div>' +
        '<div><b>ผู้ตรวจ:</b> ' + esc(q.inspector || '-') + '<br><b>ผล QC:</b> ' + result + '<br><b>เลขที่งานบริการ:</b> ' + ticket + '</div></div>' +
        '<div class="qc-doc-note-grid"><div class="qc-doc-note-box"><b>สิ่งที่พบ / รายละเอียดปัญหา</b>' + esc(q.findings || '-') + '</div><div class="qc-doc-note-box"><b>การแก้ไข / แนวทางดำเนินการ</b>' + esc(q.correctiveAction || '-') + '</div><div class="qc-doc-note-box full"><b>หมายเหตุเพิ่มเติม</b>' + esc(q.note || '-') + '</div></div>' +
        photoHTML +
      '</section></div>';
  }

  async function openDoc(q, isDraft) {
    var back = isDraft ? draft : null;
    var evs = isDraft ? (draft.ev || []) : evOf(q.id);
    await sign(evs.filter(function (e) { return !e.blobUrl; }));
    var locked = appr && !isDraft && LOCKED.indexOf(q.status) >= 0;
    var m = byId(db.machines, q.machineId);
    var canReopen = appr && !isDraft && isHead && q.status === 'Pass' && !(m && m.lifecycle === 'delivered');
    var canCxl = appr && !isDraft && canCancel && q.status !== 'Pass' && q.status !== 'Cancelled';
    var hist = appr && !isDraft && apprOf(q.id).length ? '<details class="qc-doc-hist"><summary>ประวัติการอนุมัติ (' + apprOf(q.id).length + ')</summary>' + historyHTML(q) + '</details>' : '';
    show(isDraft ? 'ตัวอย่างเอกสาร QC' : 'QC ' + q.qcNo, isDraft ? 'ยังไม่ได้บันทึก' : (TYPE_TH[q.type] || q.type) + ' · ' + (STATUS_TH[q.status] || q.status) + (q.revision ? ' · Revision ' + q.revision : ''),
      hist + '<div class="qc-doc-wrap">' + docHTML(q, evs) + '</div>',
      (isDraft ? btn('กลับไปแก้ไข', 'data-back') : btn('ปิด', 'data-cancel')) + btn('พิมพ์ / PDF', 'data-print') +
      (canCxl ? btn('ยกเลิกใบ QC', 'data-cxl') : '') + (canReopen ? btn('เปิดแก้ (Revision)', 'data-reopen') : '') +
      (appr && !isDraft && q.status === 'Pending Approval' && isHead ? btn('พิจารณาอนุมัติ', 'data-judge', true) : '') +
      (isDraft || locked ? '' : btn('แก้ไข', 'data-edit', true)));
    var $ = function (s) { return dlg.querySelector(s); };
    if ($('[data-cancel]')) $('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if ($('[data-back]')) $('[data-back]').addEventListener('click', function () { openForm(null, null, back); });
    if ($('[data-edit]')) $('[data-edit]').addEventListener('click', function () { openForm(q); });
    if ($('[data-judge]')) $('[data-judge]').addEventListener('click', function () { dlg.close(); pick = q.id; setTab('approve'); });
    if ($('[data-reopen]')) $('[data-reopen]').addEventListener('click', function () {
      askReason('เปิดแก้ QC ' + q.qcNo, 'ใบที่อนุมัติแล้วจะกลับมาแก้ได้ (Revision ' + (q.revision + 1) + ') เครื่องกลับเป็น "อยู่ระหว่าง QC" และต้องส่งอนุมัติใหม่', 'เหตุผลที่เปิดแก้', 'เปิดแก้',
        function (why) { return sb().rpc('qc_reopen', { p_qc_id: q.id, p_reason: why }); }, 'เปิดแก้ ' + q.qcNo + ' แล้ว', function () { openDoc(q); });
    });
    if ($('[data-cxl]')) $('[data-cxl]').addEventListener('click', function () {
      askReason('ยกเลิก QC ' + q.qcNo, 'ใบ QC ไม่ถูกลบ เก็บไว้เป็นประวัติพร้อมเหตุผล', 'เหตุผลที่ยกเลิก', 'ยืนยันยกเลิก',
        function (why) { return sb().rpc('qc_cancel', { p_qc_id: q.id, p_reason: why }); }, 'ยกเลิก ' + q.qcNo + ' แล้ว', function () { openDoc(q); });
    });
    $('[data-print]').addEventListener('click', function () { printDoc(q, evs); });
  }

  /* a small dialog that needs a reason, then runs one server call */
  function askReason(title, sub, label, okLabel, call, okToast, onBack) {
    show(title, sub, '<label class="qc-f full"><span>' + esc(label) + ' <b>*</b></span><textarea id="rWhy"></textarea></label>',
      btn('กลับ', 'data-back') + btn(okLabel, 'data-save', true));
    var $ = function (s) { return dlg.querySelector(s); };
    $('#rWhy').focus();
    $('[data-back]').addEventListener('click', onBack);
    $('[data-save]').addEventListener('click', async function () {
      var why = $('#rWhy').value.trim();
      if (!why) { page.toast('ต้องใส่เหตุผล'); $('#rWhy').focus(); return; }
      var b = $('[data-save]'); b.disabled = true;
      var r = await call(why);
      b.disabled = false;
      if (r.error) { page.toast('ไม่สำเร็จ: ' + r.error.message); return; }
      await loadAll(); refreshList(); mirror();
      dlg.close(); page.toast(okToast);
    });
  }

  /* ================= phase 2 dialogs ================= */
  async function reloadAll() { await loadAll(); refreshList(); mirror(); }
  /* run a server call from a dialog button: disable, call, toast, reload, then next() */
  async function act(b, fn, args, okMsg, next) {
    if (b) b.disabled = true;
    var r = await call(fn, args);
    if (b) b.disabled = false;
    if (r.error) { page.toast('ไม่สำเร็จ: ' + r.error.message); return null; }
    await reloadAll();
    if (okMsg) page.toast(okMsg);
    if (next) next(r.data);
    return r;
  }
  function stepper(steps, cur, th) {
    var i = steps.indexOf(cur);
    return '<ol class="qn-steps">' + steps.map(function (s, k) {
      return '<li class="' + (k < i || cur === 'Closed' || cur === 'Delivered' ? 'is-done' : k === i ? 'is-now' : '') + '">' + esc(th(s)) + '</li>';
    }).join('') + '</ol>';
  }
  function bindUploads(host, o, redraw) {
    [].forEach.call(host.querySelectorAll('input[data-up]'), function (inp) {
      inp.addEventListener('change', async function () {
        var fs = [].slice.call(inp.files || []); inp.value = '';
        for (var i = 0; i < fs.length; i++) { page.toast('กำลังอัปโหลด ' + fs[i].name + '…'); await uploadNow(fs[i], Object.assign({}, o, { kind: inp.dataset.up })); }
        if (fs.length) { page.toast('อัปโหลดแล้ว'); redraw(); }
      });
    });
  }
  var $d = function (s) { return dlg.querySelector(s); };
  var vd = function (s) { var x = $d(s); return x ? x.value.trim() : ''; };

  /* ---------- NCR ---------- */
  function openNcrNew(q, item) {
    var it = item || {};
    show('เปิด NCR', q.qcNo + (it.labelTh ? ' · ข้อ ' + it.labelTh : ''),
      '<form class="qc-grid" novalidate>' +
      '<label class="qc-f full"><span>ข้อบกพร่องที่พบ <b>*</b></span><textarea id="nDesc" placeholder="อาการ ค่าที่วัดได้ เงื่อนไขทดสอบ">' + esc([it.remark, it.measured ? 'วัดได้ ' + it.measured : ''].filter(Boolean).join(' · ')) + '</textarea></label>' +
      '<label class="qc-f"><span>ความรุนแรง</span><select id="nSev">' + ['Critical', 'Major', 'Minor'].map(function (k) { return opt(k, SEV_TH[k] + ' (' + k + ')', k === 'Major'); }).join('') + '</select></label>' +
      '<p class="qc-f full qc-muted">เปิดแล้วใบ QC เป็น "ไม่ผ่าน" จนกว่า NCR ทุกใบจะปิด ขั้นต่อไป: ถ่ายรูปก่อนแก้ วิเคราะห์สาเหตุ และเสนอแผนให้ Head QC อนุมัติ</p></form>',
      btn('กลับ', 'data-back') + btn('เปิด NCR', 'data-save', true));
    $d('[data-back]').addEventListener('click', function () { openForm(byId(db.qc, q.id) || q); });
    $d('[data-save]').addEventListener('click', function () {
      if (!vd('#nDesc')) { page.toast('ระบุข้อบกพร่องก่อน'); $d('#nDesc').focus(); return; }
      act(this, 'qc_ncr_open', { p_qc_id: q.id, p: { item_id: it.id || '', item_label: it.labelTh || '', severity: $d('#nSev').value, description: vd('#nDesc') } },
        null, function (d) { page.toast('เปิด ' + d.ncr_no + ' แล้ว'); openNcr(d.id); });
    });
  }

  async function openNcr(id) {
    var n = byId(db.ncr, id); if (!n) { page.toast('ไม่พบ NCR'); return; }
    var q = byId(db.qc, n.qc_id) || {}, m = byId(db.machines, n.machine_id), evs = ncrEvOf(n.id), mine = myId() && myId() === n.plan_by;
    await sign(evs);
    var ev = function (k) { return evs.filter(function (e) { return k.indexOf(e.kind) >= 0; }); };
    var hist = db.ncrEv.filter(function (e) { return e.ncr_id === n.id; }).slice().reverse();
    var rc = db.rechecks.filter(function (x) { return x.ncr_id === n.id; });
    var open = ncrOpen(n);
    var info = [['เลขที่ NCR', n.ncr_no], ['ใบ QC', q.qcNo], ['เครื่อง', mLabel(m)], ['ข้อ Checklist', n.item_label || '-'], ['ความรุนแรง', SEV_TH[n.severity] || n.severity],
      ['พบโดย', (n.detected_name || '-') + ' · ' + thTime(n.detected_at)], ['รอบ', String(n.round)]];
    var plan = n.plan ? '<div class="qa-sec"><h3>สาเหตุและแผนแก้ไข</h3><dl class="qa-meta">' +
      [['สาเหตุ', n.root_cause], ['วิธีแก้', n.fix_route === 'supplier' ? 'Supplier' : 'แก้ไขภายใน'], ['แผน', n.plan], ['เสนอโดย', n.plan_name + ' · ' + thTime(n.plan_at)],
       ['Head QC', n.plan_decided_name ? n.plan_decided_name + ' · ' + thTime(n.plan_decided_at) + (n.plan_comment ? ' · "' + n.plan_comment + '"' : '') : 'รอพิจารณา']]
        .map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl></div>' : '';
    var fixed = n.fixed_at ? '<div class="qa-sec"><h3>การแก้ไข</h3><p class="qa-text">' + esc(n.fixed_by_name + ': ' + n.fix_note + ' · ' + thTime(n.fixed_at)) + '</p></div>' : '';
    var rcs = rc.length ? '<div class="qa-sec"><h3>ผล Re-QC</h3><ul class="qa-log">' + rc.map(function (x) {
      return '<li class="' + (x.result === 'Pass' ? 'ok' : 'ret') + '">รอบ ' + x.round + ': ' + (x.result === 'Pass' ? 'ผ่าน' : 'ไม่ผ่าน') + (x.measured ? ' · วัดได้ ' + esc(x.measured) : '') + (x.remark ? ' · ' + esc(x.remark) : '') +
        '<small>' + esc(x.inspector_name) + ' · ' + esc(thTime(x.at)) + '</small></li>';
    }).join('') + '</ul></div>' : '';
    // what can be done now
    var A = '', head = isHead;
    if (n.status === 'Open') {
      A = (n.plan_comment && !n.plan_decided_at ? '' : n.plan_comment ? '<p class="qc-hint tone-red">' + icon('alert') + '<span>Head QC ไม่อนุมัติแผนเดิม: "' + esc(n.plan_comment) + '"</span></p>' : '') +
        '<label class="qc-f full"><span>สาเหตุ (Root cause) <b>*</b></span><textarea id="aCause">' + esc(n.root_cause) + '</textarea></label>' +
        '<label class="qc-f"><span>วิธีแก้ <b>*</b></span><select id="aRoute">' + opt('', 'เลือก', !n.fix_route) + opt('internal', 'แก้ไขภายใน', n.fix_route === 'internal') + opt('supplier', 'ให้ Supplier แก้ / เคลม', n.fix_route === 'supplier') + '</select></label>' +
        '<label class="qc-f full"><span>แผนแก้ไข <b>*</b></span><textarea id="aPlan">' + esc(n.plan) + '</textarea></label>' +
        '<div class="qa-btns">' + btn('ส่งแผนให้ Head QC อนุมัติ', 'data-a="plan"', true) + '</div><p class="qa-note">ต้องมีรูปก่อนแก้ (Before) อย่างน้อย 1 รูป</p>';
    } else if (n.status === 'Plan Submitted') {
      A = head && !mine ? '<label class="qc-f full"><span>ความเห็น <small>บังคับเมื่อไม่อนุมัติ</small></span><textarea id="aWhy"></textarea></label>' +
        '<div class="qa-btns">' + btn('อนุมัติแผน', 'data-a="planok"', true) + btn('ไม่อนุมัติแผน', 'data-a="planno"') + '</div>'
        : '<p class="qc-hint">' + icon('clock') + '<span>' + (mine && head ? 'คุณเป็นผู้เสนอแผน ต้องให้ Head QC คนอื่นอนุมัติ' : 'รอ Head QC อนุมัติแผน') + '</span></p>';
    } else if (n.status === 'Plan Approved') {
      A = field('aBy', 'ผู้แก้ไขจริง (ภายใน หรือชื่อ Supplier)', n.fix_route === 'supplier' ? 'Supplier ' + (m && m.supplier || '') : me(), null, true) +
        '<label class="qc-f full"><span>สิ่งที่ทำ <b>*</b></span><textarea id="aNote"></textarea></label>' +
        '<div class="qa-btns">' + btn('บันทึกว่าแก้ไขแล้ว', 'data-a="fixed"', true) + '</div><p class="qa-note">ต้องมีรูปหลังแก้ (After) อย่างน้อย 1 รูป</p>';
    } else if (n.status === 'Waiting Re-QC') {
      A = field('aMeas', 'ค่าที่วัดได้', '') + '<label class="qc-f full"><span>ผล / สิ่งที่พบ <small>บังคับเมื่อไม่ผ่าน</small></span><textarea id="aRem"></textarea></label>' +
        '<div class="qa-btns">' + btn('Re-QC ผ่าน', 'data-a="rqpass"', true) + btn('Re-QC ไม่ผ่าน', 'data-a="rqfail"') + '</div><p class="qa-note">ตรวจซ้ำเฉพาะเรื่องของ NCR นี้ · ผ่านต้องมีรูปหลังแก้หรือรูป Re-QC</p>';
    } else if (n.status === 'Re-QC Passed') {
      A = head ? '<label class="qc-f full"><span>สรุปผลการแก้ไข (Resolution) <b>*</b></span><textarea id="aRes"></textarea></label><div class="qa-btns">' + btn('ปิด NCR', 'data-a="close"', true) + '</div>' +
        '<p class="qa-note">ปิดแล้วข้อ Checklist ที่ผูกไว้เป็น "ผ่าน" และถ้าไม่มี NCR ค้าง ใบ QC กลับเป็น "กำลังตรวจ" ให้ส่งอนุมัติ</p>'
        : '<p class="qc-hint">' + icon('clock') + '<span>Re-QC ผ่านแล้ว รอ Head QC ปิด NCR</span></p>';
    } else {
      A = '<p class="qc-hint ' + (n.status === 'Closed' ? 'tone-green' : '') + '">' + icon(n.status === 'Closed' ? 'check' : 'alert') + '<span>' +
        (n.status === 'Closed' ? 'ปิดโดย ' + esc(n.closed_name) + ' · ' + esc(thTime(n.closed_at)) + ': ' + esc(n.resolution) : 'ยกเลิก: ' + esc(n.cancel_reason)) + '</span></p>';
    }
    var body = stepper(NCR_STEPS, n.status === 'Cancelled' ? '' : n.status, function (s) { return NCR_TH[s]; }) +
      '<dl class="qa-meta">' + info.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="qa-sec"><h3>ข้อบกพร่อง</h3><p class="qa-text">' + esc(n.description) + '</p></div>' +
      '<div class="qa-sec"><h3>รูปก่อนแก้ (Before)</h3>' + evGrid(ev(['before'])) + (open ? '<div class="qa-btns">' + upBtn('เพิ่มรูป Before', 'before') + '</div>' : '') + '</div>' +
      plan + fixed +
      (n.status !== 'Open' && n.status !== 'Plan Submitted' || ev(['after', 'recheck']).length ? '<div class="qa-sec"><h3>รูปหลังแก้ / Re-QC</h3>' + evGrid(ev(['after', 'recheck'])) +
        (open ? '<div class="qa-btns">' + upBtn('เพิ่มรูป After', 'after') + upBtn('เพิ่มรูป Re-QC', 'recheck') + '</div>' : '') + '</div>' : '') +
      rcs + '<div class="qa-decide qc-grid">' + A + '</div>' +
      '<div class="qa-sec"><h3>ไทม์ไลน์</h3><ul class="qa-log">' + hist.map(function (h) {
        return '<li class="' + (h.to_status === 'Closed' ? 'ok' : h.to_status === 'Open' && h.from_status ? 'ret' : 'sub') + '">' + esc(NCR_TH[h.to_status] || h.to_status) + (h.note ? ': ' + esc(h.note) : '') +
          '<small>' + esc(h.by_name) + ' · ' + esc(thTime(h.at)) + '</small></li>';
      }).join('') + '</ul></div>';
    show(n.ncr_no + ' · ' + (NCR_TH[n.status] || n.status), mLabel(m), body,
      btn('ปิด', 'data-cancel') + (q.id ? btn('ดูใบ QC', 'data-qc') : '') + (open && head ? btn('ยกเลิก NCR', 'data-cxl') : ''));
    var again = function () { openNcr(n.id); };
    $d('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if ($d('[data-qc]')) $d('[data-qc]').addEventListener('click', function () { var qq = byId(db.qc, n.qc_id); if (LOCKED.indexOf(qq.status) >= 0) openDoc(qq); else openForm(qq); });
    if ($d('[data-cxl]')) $d('[data-cxl]').addEventListener('click', function () {
      askReason('ยกเลิก ' + n.ncr_no, 'ใช้เมื่อเปิดผิดหรือซ้ำ NCR ไม่ถูกลบ', 'เหตุผล', 'ยืนยันยกเลิก', function (why) { return call('qc_ncr_cancel', { p_id: n.id, p_reason: why }); }, 'ยกเลิก ' + n.ncr_no + ' แล้ว', again);
    });
    bindUploads(dlg, { folder: 'ncr-' + n.id, qcId: n.qc_id, machineId: n.machine_id, ncrId: n.id }, again);
    dlg.querySelector('.qa-decide').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var k = b.dataset.a;
      if (k === 'plan') act(b, 'qc_ncr_plan', { p_id: n.id, p_root_cause: vd('#aCause'), p_fix_route: $d('#aRoute').value, p_plan: vd('#aPlan') }, 'ส่งแผนให้ Head QC แล้ว', again);
      if (k === 'planok') act(b, 'qc_ncr_plan_decide', { p_id: n.id, p_approve: true, p_comment: vd('#aWhy') }, 'อนุมัติแผนแล้ว', again);
      if (k === 'planno') act(b, 'qc_ncr_plan_decide', { p_id: n.id, p_approve: false, p_comment: vd('#aWhy') }, 'ส่งแผนกลับให้วิเคราะห์ใหม่', again);
      if (k === 'fixed') act(b, 'qc_ncr_fixed', { p_id: n.id, p_fixed_by_name: vd('#aBy'), p_note: vd('#aNote') }, 'บันทึกการแก้ไขแล้ว รอ Re-QC', again);
      if (k === 'rqpass') act(b, 'qc_ncr_recheck', { p_id: n.id, p_result: 'Pass', p_measured: vd('#aMeas'), p_remark: vd('#aRem') }, 'Re-QC ผ่าน รอ Head QC ปิด NCR', again);
      if (k === 'rqfail') act(b, 'qc_ncr_recheck', { p_id: n.id, p_result: 'Fail', p_measured: vd('#aMeas'), p_remark: vd('#aRem') }, 'Re-QC ไม่ผ่าน กลับไปวิเคราะห์', again);
      if (k === 'close') act(b, 'qc_ncr_close', { p_id: n.id, p_resolution: vd('#aRes') }, 'ปิด ' + n.ncr_no + ' แล้ว', again);
    };
  }

  /* ---------- PO (recorded on behalf of Purchasing) ---------- */
  function openPo(o) {
    o = o || { items: [{ model: '', name: '', qty: 1 }], status: 'Open' };
    var got = o.id ? db.machines.filter(function (m) { return String(m.poNo || '').toLowerCase() === String(o.po_no).toLowerCase(); }) : [];
    var itemRow = function (x) {
      return '<div class="qn-row"><input data-k="model" placeholder="รุ่น" value="' + esc(x.model || '') + '" aria-label="รุ่น"><input data-k="name" placeholder="ชื่อเครื่อง" value="' + esc(x.name || '') + '" aria-label="ชื่อเครื่อง">' +
        '<input data-k="qty" type="number" min="1" value="' + esc(x.qty || 1) + '" aria-label="จำนวน"><button type="button" class="sh-btn" data-del aria-label="ลบแถว">' + icon('close') + '</button></div>';
    };
    show(o.id ? 'PO ' + o.po_no : 'เปิด PO (บันทึกแทนจัดซื้อ)', 'STEP 01 · จัดซื้อยังไม่ใช้ระบบ ใส่ชื่อผู้จัดซื้อที่เปิด PO จริง',
      '<form class="qc-grid" novalidate>' + field('oNo', 'เลขที่ PO', o.po_no, null, true) + field('oProject', 'เลขที่โครงการ', o.project_no) + field('oSupplier', 'ผู้ขาย / โรงงาน', o.supplier) +
      field('oDate', 'วันที่ PO', o.po_date, { type: 'date' }) + field('oDue', 'กำหนดเครื่องเข้า', o.expected_date, { type: 'date' }) + field('oBuyer', 'ผู้จัดซื้อที่เปิด PO (ตัวจริง)', o.purchaser_name, null, true) +
      (o.id ? '<label class="qc-f"><span>สถานะ</span><select id="oStatus">' + Object.keys(PO_TH).map(function (k) { return opt(k, PO_TH[k], o.status === k); }).join('') + '</select></label>' : '') +
      '<div class="qc-f full"><span>เครื่องที่สั่ง</span><div id="oItems">' + (o.items || []).map(itemRow).join('') + '</div><button type="button" class="sh-btn" data-add>' + icon('plus') + '<span>เพิ่มรายการ</span></button></div>' +
      '<label class="qc-f full"><span>หมายเหตุ</span><textarea id="oNote" class="is-short">' + esc(o.note) + '</textarea></label>' +
      (o.id ? '<div class="qc-f full"><span>รับเข้า QC แล้ว ' + got.length + ' เครื่อง</span><p class="qa-text">' + esc(got.map(mLabel).join(' · ') || '-') + '</p></div>' +
        '<p class="qc-f full qc-muted">บันทึกโดย ' + esc(o.recorded_name || '-') + ' · ' + esc(thTime(o.created_at)) + '</p>' : '') + '</form>',
      btn('ยกเลิก', 'data-cancel') + btn('บันทึก PO', 'data-save', true));
    $d('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    $d('[data-add]').addEventListener('click', function () { $d('#oItems').insertAdjacentHTML('beforeend', itemRow({ qty: 1 })); });
    $d('#oItems').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (b) b.parentNode.remove(); });
    $d('[data-save]').addEventListener('click', function () {
      var items = [].map.call(dlg.querySelectorAll('#oItems .qn-row'), function (r) {
        return { model: r.querySelector('[data-k=model]').value.trim(), name: r.querySelector('[data-k=name]').value.trim(), qty: Math.max(1, +r.querySelector('[data-k=qty]').value || 1) };
      }).filter(function (x) { return x.model || x.name; });
      act(this, 'qc_po_save', { p: { id: o.id || '', po_no: vd('#oNo'), project_no: vd('#oProject'), supplier: vd('#oSupplier'), po_date: vd('#oDate'),
        expected_date: vd('#oDue'), purchaser_name: vd('#oBuyer'), note: vd('#oNote'), items: items, status: $d('#oStatus') ? $d('#oStatus').value : 'Open' } },
        'บันทึก PO ' + vd('#oNo') + ' แล้ว', function () { dlg.close(); });
    });
  }

  /* ---------- outstanding accessories ---------- */
  function openAcc(a) {
    var m = byId(db.machines, a.machine_id), open = a.status === 'Open';
    var log = (a.log || []).slice().reverse();
    show(a.item + ' x' + a.qty, mLabel(m) + ' · ' + (ACC_TH[a.status] || a.status),
      '<dl class="qa-meta">' + [['PO', a.po_no], ['ผู้ขาย', a.supplier], ['ผู้ติดตาม (จัดซื้อ)', a.follow_name], ['กำหนดส่ง', a.due_date ? thDate(a.due_date) : ''], ['บันทึกโดย', a.recorded_name + ' · ' + thTime(a.created_at)]]
        .map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      (open ? '<form class="qc-grid qa-decide" novalidate><label class="qc-f full"><span>ผลการติดตาม / หมายเหตุ</span><textarea id="cNote" placeholder="เช่น Supplier แจ้งส่งวันที่ ..."></textarea></label>' +
        field('cDue', 'กำหนดส่งใหม่', a.due_date, { type: 'date' }) + field('cWho', 'ผู้ติดตาม (จัดซื้อ)', a.follow_name) + '</form>' : '') +
      '<div class="qa-sec"><h3>ประวัติการติดตาม</h3>' + (log.length ? '<ul class="qa-log">' + log.map(function (x) {
        return '<li>' + esc(x.note) + (x.due ? ' · กำหนด ' + esc(thDate(x.due)) : '') + '<small>' + esc(x.by) + ' · ' + esc(thTime(x.at)) + '</small></li>'; }).join('') + '</ul>' : '<p class="qc-muted">ยังไม่มี</p>') + '</div>',
      btn('ปิด', 'data-cancel') + (open ? btn('ยกเลิกรายการ', 'data-cxl') + btn('บันทึกการติดตาม', 'data-follow') + btn('ได้รับของแล้ว', 'data-got', true) : ''));
    var again = function () { openAcc(byId(db.acc, a.id)); };
    $d('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if (!open) return;
    $d('[data-follow]').addEventListener('click', function () { act(this, 'qc_acc_follow', { p_id: a.id, p_note: vd('#cNote'), p_due: vd('#cDue') || null, p_follow_name: vd('#cWho') }, 'บันทึกการติดตามแล้ว', again); });
    $d('[data-got]').addEventListener('click', function () { act(this, 'qc_acc_receive', { p_id: a.id, p_note: vd('#cNote') }, 'รับ ' + a.item + ' แล้ว', again); });
    $d('[data-cxl]').addEventListener('click', function () {
      if (!vd('#cNote')) { page.toast('ใส่เหตุผลที่ยกเลิกในช่องหมายเหตุ'); $d('#cNote').focus(); return; }
      act(this, 'qc_acc_cancel', { p_id: a.id, p_reason: vd('#cNote') }, 'ยกเลิกรายการแล้ว', again);
    });
  }
  function openAccNew(m) {
    show('เพิ่มอุปกรณ์ค้างส่ง', mLabel(m), '<form class="qc-grid" novalidate>' + field('xItem', 'อุปกรณ์', '', null, true) + field('xQty', 'จำนวน', '1', { type: 'number' }) +
      field('xDue', 'กำหนดส่ง', '', { type: 'date' }) + field('xWho', 'ผู้ติดตาม (จัดซื้อ)', '') + '</form>', btn('กลับ', 'data-back') + btn('เพิ่ม', 'data-save', true));
    $d('[data-back]').addEventListener('click', function () { openMachine(m); });
    $d('[data-save]').addEventListener('click', function () {
      act(this, 'qc_acc_add', { p: { machineId: m.id, item: vd('#xItem'), qty: vd('#xQty'), dueDate: vd('#xDue'), followName: vd('#xWho') } }, 'เพิ่มรายการค้างส่งแล้ว', function () { openMachine(byId(db.machines, m.id)); });
    });
  }

  /* ---------- release (STEP 06) ---------- */
  function openReleasePlan(m) {
    var q = latestQc(m.id), openAcc = db.acc.filter(function (a) { return a.machine_id === m.id && a.status === 'Open'; });
    show('วางแผนส่งมอบ', mLabel(m) + ' · ' + (q ? q.qcNo + ' อนุมัติโดย ' + (q.approverName || '-') : ''),
      '<form class="qc-grid" novalidate>' +
      (openAcc.length ? '<p class="qc-hint tone-orange qc-f full">' + icon('alert') + '<span>มีอุปกรณ์ค้างส่ง: ' + esc(openAcc.map(function (a) { return a.item + ' x' + a.qty; }).join(', ')) + '</span></p>' : '') +
      '<label class="qc-f full"><span>ลูกค้า <b>*</b></span><select id="lCust">' + customerOptions(m.customerId || (q && q.customerId) || '') + '</select></label>' +
      '<label class="qc-f"><span>เส้นทาง <b>*</b></span><select id="lRoute">' + opt('direct', 'QC → ขนส่ง (ส่งตรง)', true) + opt('stock', 'QC → Stock → ขนส่ง', false) + '</select></label>' +
      field('lDate', 'วันที่นัดส่ง', '', { type: 'date' }) + field('lDest', 'สถานที่ส่ง / ติดตั้ง', '') +
      field('lBuyer', 'จัดซื้อที่อนุมัติ Delivery Plan (ตัวจริง)', '', null, true) +
      '<label class="qc-f full"><span>หมายเหตุ</span><textarea id="lNote" class="is-short"></textarea></label>' +
      '<p class="qc-f full qc-muted">บันทึกแทนฝ่ายจัดซื้อ ขั้นต่อไป Head QC ยืนยัน Release</p></form>',
      btn('ยกเลิก', 'data-cancel') + btn('บันทึกแผนส่ง', 'data-save', true));
    $d('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    $d('[data-save]').addEventListener('click', function () {
      act(this, 'qc_release_plan', { p: { machineId: m.id, customerId: $d('#lCust').value, route: $d('#lRoute').value, planDate: vd('#lDate'), destination: vd('#lDest'),
        purchaserName: vd('#lBuyer'), note: vd('#lNote') } }, null, function (d) { page.toast('บันทึกแผนส่ง ' + d.release_no + ' แล้ว'); openRelease(d.id); });
    });
  }
  async function openRelease(id) {
    var r = byId(db.rel, id); if (!r) { page.toast('ไม่พบรายการส่งมอบ'); return; }
    var m = byId(db.machines, r.machine_id), q = byId(db.qc, r.qc_id) || {}, evs = relEvOf(r.id), active = relActive(r);
    await sign(evs);
    var steps = r.route === 'stock' ? ['Planned', 'Released', 'In Stock', 'Delivered'] : ['Planned', 'Released', 'Delivered'];
    var th = function (s) { return { Planned: 'จัดซื้ออนุมัติแผน', Released: 'Head QC ยืนยัน Release', 'In Stock': 'Stock รับเครื่อง', Delivered: 'ส่งมอบ + ลงชื่อรับ' }[s]; };
    var info = [['เลขที่', r.release_no], ['เครื่อง', mLabel(m)], ['ใบ QC', q.qcNo + ' · อนุมัติโดย ' + (q.approverName || '-')], ['ลูกค้า', custName(r.customer_id)],
      ['เส้นทาง', r.route === 'stock' ? 'QC → Stock → ขนส่ง' : 'QC → ขนส่ง (ส่งตรง)'], ['วันที่นัดส่ง', r.plan_date ? thDate(r.plan_date) : ''], ['สถานที่', r.destination],
      ['จัดซื้อที่อนุมัติแผน', r.purchaser_name + ' (บันทึกโดย ' + r.plan_name + ')'], ['Head QC Release', r.released_name ? r.released_name + ' · ' + thTime(r.released_at) : ''],
      ['Stock รับ', r.stock_name ? r.stock_name + (r.stock_location ? ' · ' + r.stock_location : '') + ' · ' + thTime(r.stock_at) : ''],
      ['ผู้รับเครื่อง', r.receiver_name ? r.receiver_name + ' · ' + thDate(r.delivered_on) + (r.transporter ? ' · ' + r.transporter : '') : '']];
    var canDeliver = (r.route === 'direct' && r.status === 'Released') || (r.route === 'stock' && r.status === 'In Stock');
    var A = '';
    if (r.status === 'Planned') A = isHead ? '<div class="qa-btns">' + btn('ยืนยัน Release', 'data-a="rel"', true) + '</div><p class="qa-note">ระบบตรวจว่า QC ล่าสุดยังผ่านและไม่มี NCR ค้าง</p>'
      : '<p class="qc-hint">' + icon('clock') + '<span>รอ Head QC ยืนยัน Release</span></p>';
    else if (r.status === 'Released' && r.route === 'stock') A = field('aStock', 'คน Stock ที่รับเครื่อง (ตัวจริง)', '', null, true) + field('aLoc', 'ตำแหน่งในคลัง', '') +
      '<div class="qa-btns">' + btn('บันทึกว่า Stock รับเครื่องแล้ว', 'data-a="stock"', true) + '</div>';
    else if (canDeliver) A = field('aRecv', 'ชื่อผู้รับเครื่อง', '', null, true) + field('aDate', 'วันที่ส่งมอบ', todayISO(), { type: 'date' }) + field('aTrans', 'ขนส่งโดย', '') +
      '<label class="qc-f full"><span>หมายเหตุ</span><textarea id="aNote" class="is-short"></textarea></label>' +
      '<div class="qa-btns">' + btn('ยืนยันส่งมอบ', 'data-a="deliver"', true) + '</div><p class="qa-note">ต้องแนบรูปลายเซ็นผู้รับ (หรือใบรับเครื่องที่ลงชื่อ) ก่อน ส่งมอบแล้วเครื่องจะไปอยู่ในหน้าเครื่องจักรของ Service</p>';
    else if (r.status === 'Delivered') A = '<p class="qc-hint tone-green">' + icon('check') + '<span>ส่งมอบแล้ว · บันทึกโดย ' + esc(r.delivered_name) + ' · ' + esc(thTime(r.delivered_at)) + '</span></p>';
    else A = '<p class="qc-hint">' + icon('alert') + '<span>ยกเลิก: ' + esc(r.cancel_reason) + '</span></p>';
    show(r.release_no + ' · ' + relLabel(r), mLabel(m),
      (r.status !== 'Cancelled' ? stepper(steps, r.status, th) : '') +
      '<dl class="qa-meta">' + info.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      (r.plan_note ? '<p class="qa-text">' + esc(r.plan_note) + '</p>' : '') +
      '<div class="qa-sec"><h3>ลายเซ็นผู้รับ / รูปส่งมอบ</h3>' + evGrid(evs) +
        (active && r.status !== 'Planned' ? '<div class="qa-btns">' + upBtn('แนบรูปลายเซ็นผู้รับ', 'signature') + upBtn('รูปส่งมอบ / ติดตั้ง', 'delivery') + '</div>' : '') + '</div>' +
      '<div class="qa-decide qc-grid">' + A + '</div>',
      btn('ปิด', 'data-cancel') + (active && isHead ? btn('ยกเลิกแผนส่ง', 'data-cxl') : ''));
    var again = function () { openRelease(r.id); };
    $d('[data-cancel]').addEventListener('click', function () { dlg.close(); });
    if ($d('[data-cxl]')) $d('[data-cxl]').addEventListener('click', function () {
      askReason('ยกเลิก ' + r.release_no, 'เครื่องยังเป็น "ผ่าน QC รอส่งมอบ" วางแผนใหม่ได้', 'เหตุผล', 'ยืนยันยกเลิก', function (why) { return call('qc_release_cancel', { p_id: r.id, p_reason: why }); }, 'ยกเลิก ' + r.release_no + ' แล้ว', again);
    });
    bindUploads(dlg, { folder: 'rel-' + r.id, qcId: r.qc_id, machineId: r.machine_id, releaseId: r.id }, again);
    dlg.querySelector('.qa-decide').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var k = b.dataset.a;
      if (k === 'rel') act(b, 'qc_release_confirm', { p_id: r.id }, 'ยืนยัน Release ' + r.release_no + ' แล้ว', again);
      if (k === 'stock') act(b, 'qc_release_stock_in', { p_id: r.id, p_stock_name: vd('#aStock'), p_location: vd('#aLoc') }, 'บันทึก Stock รับเครื่องแล้ว', again);
      if (k === 'deliver') act(b, 'qc_release_deliver', { p_id: r.id, p_receiver: vd('#aRecv'), p_date: vd('#aDate') || null, p_transporter: vd('#aTrans'), p_note: vd('#aNote') },
        'ส่งมอบ ' + (m && m.imodeSn || '') + ' แล้ว เครื่องไปอยู่ใน Service', again);
    };
  }

  /* ---------- tab รออนุมัติ: queue on the left, the chosen QC on the right (Head QC decides here) ---------- */
  var pick = '', gateCache = {};
  async function drawApprove() {
    var qs = queue(), host = aView.querySelector('#qaQueue'), det = aView.querySelector('#qaDetail');
    if (!qs.some(function (q) { return q.id === pick; })) pick = qs[0] ? qs[0].id : '';
    host.innerHTML = qs.length ? qs.map(function (q) {
      var m = byId(db.machines, q.machineId) || {}, s = lastDecision(q.id, 'submit');
      return '<button type="button" class="qa-item" data-pick="' + esc(q.id) + '" aria-current="' + (q.id === pick) + '"><b>' + esc(m.imodeSn || q.qcNo) + '</b>' +
        '<span>' + esc(q.qcNo + ' · ' + (machineName(m) || '-') + (m.model ? ' ' + m.model : '')) + '</span>' +
        '<span>ผู้ตรวจ ' + esc(q.inspector || '-') + ' · ส่ง' + esc(s && s.by_name ? 'โดย ' + s.by_name + ' ' : '') + esc(ago(q.submittedAt)) + '</span>' +
        (q.revision ? '<span class="qa-sla warn">Revision ' + q.revision + '</span>' : '') + '</button>';
    }).join('') : '<p class="qc-muted qa-empty">ไม่มีใบ QC รออนุมัติ</p>';
    host.onclick = function (e) { var b = e.target.closest('[data-pick]'); if (b) { pick = b.dataset.pick; drawApprove(); } };
    var q = byId(db.qc, pick);
    if (!q) { det.innerHTML = '<p class="qc-muted">เลือกใบ QC จากคิวด้านซ้าย</p>'; return; }
    var m = byId(db.machines, q.machineId) || {}, st = stats(q), evs = evOf(q.id);
    var na = (q.checklist || []).filter(function (x) { return x.result === 'N/A'; }).length;
    var own = myId() && (myId() === q.createdBy || myId() === q.submittedBy);
    det.innerHTML = '<div class="qa-detail-head"><h2>' + esc((m.imodeSn ? m.imodeSn + ' · ' : '') + (machineName(m) || q.qcNo) + (m.model ? ' ' + m.model : '')) + '</h2>' +
        '<span class="sh-chip tone-blue">ส่งเมื่อ ' + esc(thTime(q.submittedAt)) + '</span></div>' +
      '<dl class="qa-meta">' + [['เลขใบ QC', q.qcNo], ['ประเภท', TYPE_TH[q.type] || q.type], ['Factory S/N', m.factorySn || m.serial], ['ผู้ขาย', m.supplier || q.supplier],
        ['ผู้ตรวจ', q.inspector], ['Checklist', 'ผ่าน ' + st.pass + ' · ไม่ผ่าน ' + st.fail + ' · N/A ' + na + ' จาก ' + st.total], ['Revision', String(q.revision || 0)]]
        .map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] || '–') + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="qa-sec"><h3>ด่านตรวจก่อนอนุมัติ (ระบบตรวจให้)</h3><ul class="qa-gate" id="qaGate"><li>กำลังตรวจ…</li></ul></div>' +
      '<div class="qa-sec"><h3>รูปประกอบ</h3><div id="qaPhotos"></div></div>' +
      (q.findings || q.note ? '<div class="qa-sec"><h3>สิ่งที่พบ / หมายเหตุ</h3><p class="qa-text">' + esc([q.findings, q.note].filter(Boolean).join(' · ')) + '</p></div>' : '') +
      '<div class="qa-sec"><h3>ประวัติ</h3>' + historyHTML(q) + '</div>' +
      '<div class="qa-decide">' + (isHead && !own ?
        '<label class="qc-f full"><span>ความเห็น <small>บังคับเมื่อส่งกลับหรือไม่อนุมัติ</small></span><textarea id="qaWhy" placeholder="เช่น รูปป้ายไม่ชัด ถ่ายใหม่"></textarea></label>' +
        '<div class="qa-btns">' + btn('อนุมัติ QC PASS', 'data-d="approve"', true) + btn('ส่งกลับแก้ไข', 'data-d="return"') + btn('ไม่อนุมัติ (ไม่ผ่าน)', 'data-d="reject" class-danger') + btn('ดูเอกสารเต็ม', 'data-doc') + '</div>' +
        '<p class="qa-note">อนุมัติแล้วผลตรวจถูกล็อก เครื่องเปลี่ยนเป็น "ผ่าน QC รอส่งมอบ" ถ้าต้องแก้ภายหลัง Head QC กด "เปิดแก้" พร้อมเหตุผล (Revision +1)</p>'
        : '<p class="qc-hint">' + icon('alert') + '<span>' + (own ? 'คุณเป็นผู้ตรวจหรือผู้ส่งใบนี้ จึงอนุมัติเองไม่ได้ ต้องเป็น Head QC คนอื่น' : 'เฉพาะ Head QC กดอนุมัติได้ ใบนี้รอ Head QC พิจารณา') + '</span></p>' +
          '<div class="qa-btns">' + btn('ดูเอกสารเต็ม', 'data-doc') + '</div>') + '</div>';
    var rej = det.querySelector('[data-d="reject"]'); if (rej) { rej.removeAttribute('class-danger'); rej.classList.add('is-danger'); }
    det.querySelector('[data-doc]').addEventListener('click', function () { openDoc(q); });
    det.onclick = async function (e) {
      var b = e.target.closest('[data-d]'); if (!b) return;
      var d = b.dataset.d, why = det.querySelector('#qaWhy').value.trim();
      if (d !== 'approve' && !why) { page.toast('ใส่เหตุผลก่อน' + (d === 'return' ? 'ส่งกลับ' : 'ไม่อนุมัติ')); det.querySelector('#qaWhy').focus(); return; }
      if (d === 'reject' && !confirm('ยืนยันไม่อนุมัติ ' + q.qcNo + '? ผลจะเป็น "ไม่ผ่าน"')) return;
      [].forEach.call(det.querySelectorAll('.qa-btns button'), function (x) { x.disabled = true; });
      var r = await sb().rpc('qc_decide', { p_qc_id: q.id, p_decision: d, p_comment: why });
      if (r.error) { [].forEach.call(det.querySelectorAll('.qa-btns button'), function (x) { x.disabled = false; }); page.toast('ไม่สำเร็จ: ' + r.error.message); return; }
      delete gateCache[q.id];
      await loadAll(); refreshList(); mirror();
      page.toast(d === 'approve' ? 'อนุมัติ ' + q.qcNo + ' แล้ว เครื่องพร้อมส่งมอบ' : d === 'return' ? 'ส่งกลับ ' + q.qcNo + ' ให้แก้ไขแล้ว' : 'บันทึกไม่อนุมัติ ' + q.qcNo + ' แล้ว');
    };
    await sign(evs.filter(function (e) { return /^image\//.test(e.mime || ''); }));
    if (pick !== q.id) return;
    var ph = det.querySelector('#qaPhotos');
    ph.innerHTML = evGrid(evs.filter(function (e) { return /^image\//.test(e.mime || ''); }));
    var g = gateCache[q.id] || (await sb().rpc('qc_gate', { p_qc_id: q.id })).data || { ok: false, problems: ['ตรวจด่านไม่สำเร็จ'] };
    gateCache[q.id] = g;
    if (pick !== q.id) return;
    var lines = (g.problems || []).map(function (t) { return '<li><span class="n">✕</span>' + esc(t) + '</li>'; });
    if (g.ok) lines = ['ตรวจครบ ' + st.total + ' ข้อ ไม่มีข้อไม่ผ่าน ข้อ N/A มีเหตุผล', 'ไม่มี NCR ค้าง', 'มีผู้ตรวจ เครื่อง และ IMODE S/N']
      .map(function (t) { return '<li><span class="y">✓</span>' + esc(t) + '</li>'; });
    lines.push(own ? '<li><span class="n">✕</span>คุณเป็นผู้ตรวจหรือผู้ส่ง อนุมัติเองไม่ได้</li>' : '<li><span class="y">✓</span>ผู้อนุมัติไม่ใช่ผู้ตรวจหรือผู้ส่ง</li>');
    det.querySelector('#qaGate').innerHTML = lines.join('');
    var ok = det.querySelector('[data-d="approve"]');
    if (ok && !g.ok) { ok.disabled = true; ok.title = 'ด่านยังไม่ผ่าน ส่งกลับให้แก้ไข'; }
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
