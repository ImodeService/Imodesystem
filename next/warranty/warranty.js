/* I-MODE System (ระบบใหม่) · ประกันเครื่อง + PM (2026-11-25)
   ตาราง machine_warranties เดิม (ไม่เปลี่ยนโครงสร้าง) · เลขที่ WTY-YYYYMM-NNN แบบเดิม
   สถานะคิดจากวันที่: ยังไม่เริ่ม / อยู่ในประกัน / ใกล้หมด (warrantyConfig.reminderDays, เดิม 30) / หมดประกัน
   บันทึกแล้วอัปเดตช่อง machines.warranty (อยู่ในประกัน/หมดประกัน) ให้ตรงเหมือนระบบเดิม
   ?t=pm = หน้า PM ที่ใกล้ถึง (machines.pmDue + service_reports.next_pm ล่าสุดของแต่ละเครื่อง)
   ?machine=<id> = เปิดฟอร์มลงทะเบียนประกันของเครื่องนั้นทันที */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var P = new URLSearchParams(location.search), MODE = P.get('t') === 'pm' ? 'pm' : 'w';
  var W = [], mach = {}, machList = [], cust = {}, custList = [], pmRows = [], remind = 30, defMonths = 12, st = '', q = '', LIMIT = 200, shown = LIMIT, api;
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function day(v) { if (!v) return '-'; var d = new Date(String(v).length <= 10 ? v + 'T00:00:00' : v); return isNaN(d) ? String(v) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function longDay(v) { if (!v) return '-'; var d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? String(v) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function daysTo(v) { if (!v) return null; var d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : Math.ceil((d - today()) / 864e5); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addMonths(s, n) { if (!s) return ''; var d = new Date(s + 'T00:00:00'), o = d.getDate(); d.setMonth(d.getMonth() + Number(n || 0)); if (d.getDate() < o) d.setDate(0); return iso(d); }
  function state(w) {
    var e = daysTo(w.end_date), s = daysTo(w.start_date);
    if (e === null) return 'none'; if (s !== null && s > 0) return 'upcoming'; if (e < 0) return 'expired'; return e <= remind ? 'expiring' : 'active';
  }
  var SL = { active: ['ok', 'อยู่ในประกัน'], expiring: ['sent', 'ใกล้หมด'], expired: ['no', 'หมดประกัน'], upcoming: ['', 'ยังไม่เริ่ม'], none: ['', 'ไม่ระบุ'] };
  function stBadge(w) { var s = SL[state(w)]; return '<span class="st ' + s[0] + '">' + s[1] + '</span>'; }
  function machCell(m) {
    if (!m) return '<span class="sub2">ไม่พบเครื่อง</span>';
    var ph = M.photo(m);
    return '<div class="ma-nm">' + (ph ? '<img src="' + esc(ph) + '" alt="" loading="lazy">' : '<span class="ma-ph">⚙</span>') + '<div><a class="nm" href="../machines/detail.html?id=' + encodeURIComponent(m.id) + '">' + esc(M.nameTh(m)) + '</a><div class="sub2">' + esc(m.model || '-') + ' · S/N ' + esc(M.sn(m) || '-') + '</div></div></div>';
  }

  /* ---------- ประกัน ---------- */
  function renderW() {
    var cnt = { all: W.length, active: 0, expiring: 0, expired: 0 };
    W.forEach(function (w) { var s = state(w); if (cnt[s] != null) cnt[s]++; });
    var K = [['', 'ทั้งหมด', cnt.all], ['active', 'อยู่ในประกัน', cnt.active], ['expiring', 'ใกล้หมด (' + remind + ' วัน)', cnt.expiring], ['expired', 'หมดประกัน', cnt.expired]];
    $('cards').innerHTML = K.map(function (c) { return '<button type="button" class="nx-card q-card" data-c="' + c[0] + '" aria-pressed="' + (st === c[0]) + '"><small>' + esc(c[1]) + '</small><b>' + c[2] + '</b></button>'; }).join('');
    $('chips').innerHTML = '';
    var s = q.trim().toLowerCase();
    var v = W.filter(function (w) {
      if (st && state(w) !== st) return false;
      if (!s) return true;
      var m = mach[w.machine_id] || {}, c = cust[w.customer_id] || {};
      return [w.warranty_no, c.name, c.branch, m.nameTh, m.name, m.model, m.serial, m.imodeSn].join(' ').toLowerCase().indexOf(s) >= 0;
    });
    if (st === 'expiring') v.sort(function (a, b) { return String(a.end_date).localeCompare(String(b.end_date)); });
    $('thead').innerHTML = '<tr><th>เลขที่</th><th>เครื่อง</th><th class="hide-m">ลูกค้า</th><th>เริ่ม</th><th>สิ้นสุด</th><th>สถานะ</th></tr>';
    $('rows').innerHTML = v.slice(0, shown).map(function (w) {
      var d = daysTo(w.end_date), c = cust[w.customer_id];
      return '<tr data-w="' + esc(w.id) + '"><td><b class="wr-no">' + esc(w.warranty_no || '-') + '</b>' + (w.attachment_name ? ' <span title="มีไฟล์แนบ" aria-label="มีไฟล์แนบ">📎</span>' : '') + '</td>' +
        '<td>' + machCell(mach[w.machine_id]) + '</td><td class="hide-m">' + (c ? esc(c.name) + (c.branch ? '<div class="sub2">' + esc(c.branch) + '</div>' : '') : '-') + '</td>' +
        '<td>' + day(w.start_date) + '</td><td class="we">' + day(w.end_date) + (d !== null && state(w) !== 'upcoming' ? '<div class="sub2">' + (d >= 0 ? 'เหลือ ' + d + ' วัน' : 'เกิน ' + (-d) + ' วัน') + '</div>' : '') + '</td><td>' + stBadge(w) + '</td></tr>';
    }).join('');
    $('empty').hidden = v.length > 0;
    $('more').hidden = v.length <= shown;
    $('more').innerHTML = v.length > shown ? 'แสดง ' + shown + ' จาก ' + v.length + ' รายการ · <button type="button" class="nx-btn" id="showAll">แสดงทั้งหมด</button>' : '';
  }

  /* ---------- PM ---------- */
  function buildPm() {
    var by = {};
    machList.forEach(function (m) { if (m.pmDue) by[m.id] = { m: m, date: String(m.pmDue).slice(0, 10), from: 'ตั้งที่เครื่อง' }; });
    pmRows.forEach(function (r) { var d = String(r.next_pm || '').slice(0, 10); if (!d || !mach[r.machine_id]) return; var x = by[r.machine_id]; if (!x || d > x.date) by[r.machine_id] = { m: mach[r.machine_id], date: d, from: 'จากใบตรวจ ' + (r.report_no || '') }; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function renderPm() {
    var all = buildPm(), late = all.filter(function (x) { return daysTo(x.date) < 0; }), soon = all.filter(function (x) { var d = daysTo(x.date); return d >= 0 && d <= 30; });
    var K = [['', 'PM ทั้งหมด', all.length], ['late', 'เลยกำหนด', late.length], ['soon', 'ภายใน 30 วัน', soon.length], ['later', 'หลังจากนั้น', all.length - late.length - soon.length]];
    $('cards').innerHTML = K.map(function (c) { return '<button type="button" class="nx-card q-card" data-c="' + c[0] + '" aria-pressed="' + (st === c[0]) + '"><small>' + esc(c[1]) + '</small><b>' + c[2] + '</b></button>'; }).join('');
    $('chips').innerHTML = '';
    var s = q.trim().toLowerCase();
    var v = all.filter(function (x) {
      var d = daysTo(x.date);
      if (st === 'late' && !(d < 0)) return false; if (st === 'soon' && !(d >= 0 && d <= 30)) return false; if (st === 'later' && !(d > 30)) return false;
      if (!s) return true; var c = cust[x.m.customerId] || {};
      return [c.name, c.branch, x.m.nameTh, x.m.name, x.m.model, x.m.serial, x.m.imodeSn].join(' ').toLowerCase().indexOf(s) >= 0;
    });
    $('thead').innerHTML = '<tr><th>เครื่อง</th><th class="hide-m">ลูกค้า</th><th>กำหนด PM</th><th>ที่มา</th><th></th></tr>';
    $('rows').innerHTML = v.slice(0, shown).map(function (x) {
      var d = daysTo(x.date), c = cust[x.m.customerId];
      return '<tr><td>' + machCell(x.m) + '</td><td class="hide-m">' + (c ? esc(c.name) : '-') + '</td><td><b>' + day(x.date) + '</b><div class="sub2 ' + (d < 0 ? 'wr-late' : '') + '">' + (d < 0 ? 'เลยมา ' + (-d) + ' วัน' : d === 0 ? 'วันนี้' : 'อีก ' + d + ' วัน') + '</div></td>' +
        '<td class="sub2">' + esc(x.from) + '</td><td>' + (api.can('service.edit') ? '<a class="nx-btn wr-pm" href="../service/new.html?machine=' + encodeURIComponent(x.m.id) + '">เปิดเคส PM</a>' : '') + '</td></tr>';
    }).join('');
    $('empty').hidden = v.length > 0; $('empty').textContent = all.length ? 'ไม่พบรายการ' : 'ยังไม่มีเครื่องที่ตั้งวัน PM (ตั้งได้ที่หน้าเครื่องจักร > แก้ไข > PM ครั้งถัดไป หรือจากใบตรวจของช่าง)';
    $('more').hidden = v.length <= shown;
    $('more').innerHTML = v.length > shown ? 'แสดง ' + shown + ' จาก ' + v.length + ' เครื่อง · <button type="button" class="nx-btn" id="showAll">แสดงทั้งหมด</button>' : '';
  }
  function render() { if (MODE === 'pm') renderPm(); else renderW(); }

  /* ---------- ดูรายละเอียด ---------- */
  function view(id) {
    var w = W.filter(function (x) { return x.id === id; })[0]; if (!w) return;
    var m = mach[w.machine_id], c = cust[w.customer_id], ph = m && M.photo(m), d = daysTo(w.end_date);
    $('vBody').innerHTML = '<div class="wr-vh">' + (ph ? '<img src="' + esc(ph) + '" alt="">' : '') + '<div><h2>' + esc(w.warranty_no || 'ใบรับประกัน') + '</h2><p>' + esc(m ? M.nameTh(m) : '-') + ' · S/N ' + esc(m ? M.sn(m) || '-' : '-') + '</p>' + stBadge(w) + '</div></div>' +
      '<div class="wr-tl"><div><small>เริ่มประกัน</small><b>' + day(w.start_date) + '</b></div><span>→</span><div><small>สิ้นสุด</small><b>' + day(w.end_date) + '</b>' + (d !== null ? '<small>' + (d >= 0 ? 'เหลือ ' + d + ' วัน' : 'หมดมาแล้ว ' + (-d) + ' วัน') + '</small>' : '') + '</div></div>' +
      '<div class="cu-kv wr-kv"><span>ลูกค้า</span><div>' + esc(c ? c.name + (c.branch ? ' · ' + c.branch : '') : '-') + '</div><span>ระยะเวลา</span><div>' + esc(w.months || '-') + ' เดือน</div>' +
      '<span>วันที่ซื้อ</span><div>' + day(w.purchase_date) + '</div><span>วันที่ติดตั้ง</span><div>' + day(w.install_date) + '</div>' +
      '<span>ขอบเขต</span><div>' + esc(w.coverage || '-') + '</div><span>ข้อยกเว้น</span><div>' + esc(w.exclusions || '-') + '</div>' +
      '<span>หมายเหตุ</span><div>' + esc(w.note || '-') + '</div><span>ผู้จัดทำ</span><div>' + esc(w.issued_by || '-') + '</div></div>' +
      '<div class="cu-dbtn wr-vb">' + (w.attachment_name ? '<button type="button" class="nx-btn" id="vAtt">📎 ' + esc(w.attachment_name) + '</button>' : '') +
      '<button type="button" class="nx-btn" id="vPrint">🖨 ใบรับประกัน</button>' + (api.can('warranty.edit') ? '<button type="button" class="nx-btn edit" id="vEdit">แก้ไข</button>' : '') + '<button type="button" class="nx-btn primary" id="vClose">ปิด</button></div>';
    var dlg = $('vDlg'); dlg.showModal();
    $('vClose').onclick = function () { dlg.close(); };
    $('vPrint').onclick = function () { printCert(w); };
    if ($('vEdit')) $('vEdit').onclick = function () { dlg.close(); edit(w); };
    if ($('vAtt')) $('vAtt').onclick = async function () {
      this.disabled = true;
      var r = await api.sb.from('machine_warranties').select('attachment_data,attachment_type').eq('id', w.id).maybeSingle();
      this.disabled = false;
      var data = r.data && r.data.attachment_data;
      if (!data || !/^data:/.test(data)) { alert('เปิดไฟล์แนบไม่ได้'); return; }
      try { var p = data.split(','), bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); window.open(URL.createObjectURL(new Blob([a], { type: r.data.attachment_type || (p[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' })), '_blank'); } catch (e) { alert('เปิดไฟล์แนบไม่ได้'); }
    };
  }
  var CO = {};
  function printCert(w) {
    var m = mach[w.machine_id] || {}, c = cust[w.customer_id] || {}, e = esc;
    var win = window.open('', '_blank', 'width=1000,height=820'); if (!win) { alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup'); return; }
    var logo = M.root + 'shared/assets/imode-document-logo.webp';
    win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + e(w.warranty_no || 'Warranty') + '</title><style>' +
      'body{font-family:"IBM Plex Sans Thai",Tahoma,Arial,sans-serif;padding:18px;color:#1d2636}.c{background:#fff;border:1px solid #cfd5e0;padding:22px;max-width:950px;margin:auto}' +
      '.h{display:grid;grid-template-columns:210px 1fr;gap:15px;align-items:center;border-bottom:2px solid #e47a22;padding-bottom:10px}.h img{width:175px;height:78px;object-fit:contain}.h div{font-size:11px;line-height:1.55}.h b{font-size:13px}' +
      '.t{text-align:center;margin:13px 0}.t h2{margin:0;font-size:24px;color:#123d9d}.t p{margin:4px 0 0;font-size:13px;letter-spacing:.08em}.g{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '.b{border:1px solid #d7dbe4;padding:10px}.b small{display:block;color:#657089;font-size:10px}.b b{display:block;margin-top:4px;font-size:13px}.s{margin-top:12px;border:1px solid #d7dbe4}.s h4{margin:0;padding:7px 10px;background:#f3f6fb;color:#123d9d;font-size:12px}' +
      '.s div{padding:10px;font-size:12px;line-height:1.6;min-height:55px;white-space:pre-wrap}.sg{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:55px}.sg div{text-align:center;padding-top:9px;border-top:1px solid #555;font-size:12px}@media print{body{padding:0}.c{border:0}}</style></head><body>' +
      '<div class="c"><div class="h"><img src="' + e(logo) + '" alt="I-MODE"><div><b>' + e(CO.companyNameTh || 'บริษัท ไอโมด พลัส จำกัด') + '</b><br>' + e(CO.companyName || 'I-MODE Plus Co., Ltd.') + '<br>' + e(CO.companyAddress || '') + '<br>Tel. ' + e(CO.companyPhone || '') + ' · ' + e(CO.companyEmail || '') + '<br>Tax ID: ' + e(CO.companyTaxId || '-') + '</div></div>' +
      '<div class="t"><h2>ใบรับประกันเครื่องจักร</h2><p>MACHINE WARRANTY CERTIFICATE</p></div><div class="g">' +
      '<div class="b"><small>Warranty No.</small><b>' + e(w.warranty_no || '-') + '</b></div><div class="b"><small>Customer</small><b>' + e(c.name || '-') + '</b></div>' +
      '<div class="b"><small>Machine</small><b>' + e(M.nameTh(m)) + ' / ' + e(m.model || '-') + '</b></div><div class="b"><small>Serial No.</small><b>' + e(M.sn(m) || '-') + '</b></div>' +
      '<div class="b"><small>Warranty Period</small><b>' + longDay(w.start_date) + ' - ' + longDay(w.end_date) + '</b></div><div class="b"><small>Duration</small><b>' + e(w.months || '-') + ' เดือน</b></div></div>' +
      '<div class="s"><h4>ขอบเขตการรับประกัน / WARRANTY COVERAGE</h4><div>' + e(w.coverage || '-') + '</div></div><div class="s"><h4>ข้อยกเว้น / EXCLUSIONS</h4><div>' + e(w.exclusions || '-') + '</div></div>' +
      '<div class="s"><h4>หมายเหตุ / REMARK</h4><div>' + e(w.note || 'การรับประกันมีผลตามเงื่อนไขของบริษัท และต้องมีหมายเลข Serial No. ตรงกับเครื่องที่ลงทะเบียน') + '</div></div>' +
      '<div class="sg"><div>ผู้ออกใบรับประกัน / Issued by<br>' + e(w.issued_by || '') + '</div><div>ลูกค้า / Customer</div></div></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    win.document.close();
  }

  /* ---------- ลงทะเบียน / แก้ไข ---------- */
  function ensureDlg() {
    if ($('wDlg')) return;
    var d = document.createElement('dialog'); d.id = 'wDlg'; d.className = 'cu-dlg ma-dlg';
    d.innerHTML = '<form method="dialog" id="wFrm"><h2 id="wT">ลงทะเบียนประกัน</h2>' +
      '<label class="cu-f">ลูกค้า (ต้องเลือก)<select id="wCust" required></select></label>' +
      '<label class="cu-f">เครื่องจักร (ต้องเลือก)<select id="wMach" required></select></label>' +
      '<div class="cu-2"><label class="cu-f">วันที่ซื้อ / ส่งมอบ<input id="wBuy" type="date"></label><label class="cu-f">วันที่ติดตั้ง<input id="wInst" type="date"></label></div>' +
      '<div class="cu-2"><label class="cu-f">เริ่มประกัน (ต้องใส่)<input id="wStart" type="date" required></label><label class="cu-f">ระยะเวลา (เดือน)<input id="wMonths" type="number" min="1" max="120" inputmode="numeric" required></label></div>' +
      '<label class="cu-f">สิ้นสุดประกัน (คิดให้อัตโนมัติ แก้ได้)<input id="wEnd" type="date" required></label>' +
      '<label class="cu-f">ขอบเขตการรับประกัน<textarea id="wCov" rows="2"></textarea></label>' +
      '<label class="cu-f">ข้อยกเว้น<textarea id="wExc" rows="2"></textarea></label>' +
      '<div class="cu-2"><label class="cu-f">หมายเหตุ<input id="wNote" autocomplete="off"></label><label class="cu-f">ผู้จัดทำ<input id="wBy" autocomplete="off"></label></div>' +
      '<div class="cu-f">ไฟล์แนบ (ไม่เกิน 1.2 MB)<div class="wr-att"><span id="wAttN">ไม่มีไฟล์</span><label class="nx-btn">เลือกไฟล์<input id="wAttIn" type="file" accept="image/*,application/pdf" hidden></label><button type="button" class="nx-btn" id="wAttDel">ลบไฟล์</button></div></div>' +
      '<p id="wErr" class="cu-err" hidden></p>' +
      '<div class="cu-dbtn"><button value="cancel" class="nx-btn" formnovalidate>ยกเลิก</button><button value="ok" class="nx-btn primary" id="wOk">บันทึก</button></div></form>';
    document.body.appendChild(d);
  }
  async function nextNo() {
    var d = new Date(), p = 'WTY-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + '-', n = 1;
    var r = await api.sb.from('machine_warranties').select('warranty_no').like('warranty_no', p + '%').limit(1000);
    (r.data || []).forEach(function (x) { n = Math.max(n, (parseInt(String(x.warranty_no).split('-').pop(), 10) || 0) + 1); });
    return p + ('00' + n).slice(-3);
  }
  function machOpts(cid, sel) {
    var l = machList.filter(function (m) { return m.customerId === cid; });
    $('wMach').innerHTML = '<option value="">— เลือกเครื่อง —</option>' + l.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(M.nameTh(m)) + ' · ' + esc(m.model || '-') + ' · S/N ' + esc(M.sn(m) || '-') + '</option>'; }).join('');
  }
  function edit(row, presetMachine) {
    ensureDlg();
    var dlg = $('wDlg'), frm = $('wFrm'), err = $('wErr'), att = null, attChanged = false;
    var pm = presetMachine ? mach[presetMachine] : null;
    $('wT').textContent = row ? 'แก้ไขประกัน ' + (row.warranty_no || '') : 'ลงทะเบียนประกัน';
    $('wCust').innerHTML = '<option value="">— เลือกลูกค้า —</option>' + custList.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name || '-') + (c.branch ? ' · ' + esc(c.branch) : '') + '</option>'; }).join('');
    var cid = row ? row.customer_id : (pm ? pm.customerId : '');
    $('wCust').value = cid || ''; machOpts(cid, row ? row.machine_id : (pm ? pm.id : ''));
    $('wBuy').value = row && row.purchase_date || ''; $('wInst').value = row && row.install_date || '';
    $('wStart').value = row ? row.start_date || '' : iso(new Date()); $('wMonths').value = row ? row.months || defMonths : defMonths;
    $('wEnd').value = row ? row.end_date || '' : addMonths($('wStart').value, $('wMonths').value);
    $('wCov').value = row && row.coverage || ''; $('wExc').value = row && row.exclusions || ''; $('wNote').value = row && row.note || '';
    $('wBy').value = row ? row.issued_by || '' : ((api.user && (api.user.full_name || api.user.name)) || '');
    function showAtt() { var n = attChanged ? (att && att.name) : (row && row.attachment_name); $('wAttN').textContent = n || 'ไม่มีไฟล์'; $('wAttDel').hidden = !n; }
    showAtt();
    $('wCust').onchange = function () { machOpts(this.value, ''); };
    $('wStart').onchange = $('wMonths').oninput = function () { $('wEnd').value = addMonths($('wStart').value, $('wMonths').value); };
    $('wAttIn').value = '';
    $('wAttIn').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      if (f.size > 1200000) { err.textContent = 'ไฟล์ใหญ่เกิน 1.2 MB'; err.hidden = false; this.value = ''; return; }
      var fr = new FileReader(); fr.onload = function () { att = { name: f.name, type: f.type, data: fr.result }; attChanged = true; err.hidden = true; showAtt(); }; fr.readAsDataURL(f);
    };
    $('wAttDel').onclick = function () { att = null; attChanged = true; showAtt(); };
    err.hidden = true;
    function close() { frm.removeEventListener('submit', submit); }
    async function submit(e) {
      if (e.submitter && e.submitter.value === 'cancel') { close(); return; }
      e.preventDefault();
      var mid = $('wMach').value, m = mach[mid];
      if (!$('wCust').value || !m) { err.textContent = 'กรุณาเลือกลูกค้าและเครื่อง'; err.hidden = false; return; }
      if (!$('wStart').value || !$('wEnd').value) { err.textContent = 'กรุณาใส่วันเริ่มและวันสิ้นสุด'; err.hidden = false; return; }
      if ($('wEnd').value < $('wStart').value) { err.textContent = 'วันสิ้นสุดต้องอยู่หลังวันเริ่ม'; err.hidden = false; return; }
      $('wOk').disabled = true;
      var now = new Date().toISOString();
      var rec = { customer_id: $('wCust').value, machine_id: mid, purchase_date: $('wBuy').value, install_date: $('wInst').value,
        start_date: $('wStart').value, end_date: $('wEnd').value, months: Number($('wMonths').value) || defMonths, coverage: $('wCov').value.trim(),
        exclusions: $('wExc').value.trim(), note: $('wNote').value.trim(), issued_by: $('wBy').value.trim(), updated_at: now };
      if (attChanged) { rec.attachment_name = att ? att.name : ''; rec.attachment_type = att ? att.type : ''; rec.attachment_data = att ? att.data : ''; }
      var res;
      if (row) res = await api.sb.from('machine_warranties').update(rec).eq('id', row.id).select('id,warranty_no,customer_id,machine_id,purchase_date,install_date,start_date,end_date,months,coverage,exclusions,note,issued_by,attachment_name,created_at,updated_at').maybeSingle();
      else {
        rec.id = (function () { try { return crypto.randomUUID(); } catch (x) { return 'w-' + Date.now().toString(36); } })();
        rec.warranty_no = await nextNo(); rec.created_at = now;
        if (!attChanged) { rec.attachment_name = ''; rec.attachment_type = ''; rec.attachment_data = ''; }
        res = await api.sb.from('machine_warranties').insert(rec).select('id,warranty_no,customer_id,machine_id,purchase_date,install_date,start_date,end_date,months,coverage,exclusions,note,issued_by,attachment_name,created_at,updated_at').maybeSingle();
      }
      $('wOk').disabled = false;
      if (res.error || !res.data) { err.textContent = 'บันทึกไม่ได้: ' + (res.error ? res.error.message : 'ไม่มีสิทธิ์'); err.hidden = false; return; }
      var saved = res.data, txt = state(saved) === 'expired' ? 'หมดประกัน' : 'อยู่ในประกัน';
      if (m.warranty !== txt) { var u = await api.sb.from('machines').update({ warranty: txt, updatedAt: now }).eq('id', m.id); if (!u.error) m.warranty = txt; }
      if (row) W = W.map(function (x) { return x.id === saved.id ? saved : x; }); else W.unshift(saved);
      close(); dlg.close(); render();
      view(saved.id);
    }
    frm.addEventListener('submit', submit);
    dlg.addEventListener('close', close, { once: true });
    dlg.showModal();
  }

  /* ---------- เริ่ม ---------- */
  try { api = await window.NextShell.start({ title: MODE === 'pm' ? 'PM ที่ใกล้ถึง' : 'ประกันเครื่อง', moduleId: 'warranty' }); }
  catch (e) { showErr(e.message); return; }
  $('h1').textContent = MODE === 'pm' ? 'PM ที่ใกล้ถึง' : 'ประกันเครื่อง';
  $('q').placeholder = MODE === 'pm' ? 'ค้นหาลูกค้า เครื่อง S/N' : 'ค้นหาเลขที่ ลูกค้า เครื่อง S/N';
  $('rows').innerHTML = '<tr><td colspan="6"><span class="sk" style="height:20px;display:block"></span></td></tr>';
  var res = await Promise.all([
    api.sb.from('machine_warranties').select('id,warranty_no,customer_id,machine_id,purchase_date,install_date,start_date,end_date,months,coverage,exclusions,note,issued_by,attachment_name,created_at,updated_at').order('created_at', { ascending: false }).limit(10000),
    api.sb.from('machines').select('id,customerId,name,nameTh,nameEn,model,serial,imodeSn,warranty,pmDue,photo').is('deleted_at', null).limit(10000),
    api.sb.from('customers').select('id,name,branch').is('deleted_at', null).limit(5000),
    api.sb.from('system_settings').select('data').limit(1).maybeSingle(),
    MODE === 'pm' ? api.sb.from('service_reports').select('machine_id,next_pm,report_no').not('next_pm', 'is', null).limit(10000) : Promise.resolve({ data: [] })
  ]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดข้อมูลประกันไม่ได้: ' + res[0].error.message); return; }
  W = res[0].data || []; machList = res[1].data || []; custList = res[2].data || []; pmRows = res[4].data || [];
  machList.forEach(function (m) { mach[m.id] = m; }); custList.forEach(function (c) { cust[c.id] = c; });
  var sd = (res[3].data && res[3].data.data) || {}; CO = sd; var wc = sd.warrantyConfig || {};
  remind = Number(wc.reminderDays) || 30; defMonths = Number(wc.defaultMonths) || 12;
  if (MODE === 'w' && api.can('warranty.edit')) $('add').hidden = false;
  render();

  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; st = b.getAttribute('data-c'); shown = LIMIT; render(); });
  $('q').addEventListener('input', function () { q = this.value; shown = LIMIT; render(); });
  $('more').addEventListener('click', function (e) { if (e.target.id === 'showAll') { shown = 1e9; render(); } });
  $('rows').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-w]'); if (tr) view(tr.getAttribute('data-w')); });
  $('add').addEventListener('click', function () { edit(null); });
  $('vDlg').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  if (MODE === 'w' && P.get('machine') && api.can('warranty.edit') && mach[P.get('machine')]) edit(null, P.get('machine'));
})();
