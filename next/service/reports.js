/* I-MODE System (ระบบใหม่) · รายงานบริการของช่าง (2026-11-25)
   ตาราง service_reports (ช่างส่งจากแอปมือถือ) · หน้านี้ดูอย่างเดียว + พิมพ์ · ?id=<report id> = เปิดรายงานนั้นทันที
   รายการโหลดเฉพาะคอลัมน์เบา รูป/ลายเซ็นโหลดตอนเปิดรายงาน */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, F = window.NextForm, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var api, R = [], cust = {}, mach = {}, tech = {}, cases = {}, CO = {}, ty = '', q = '';
  var LIST = 'id,report_no,case_id,customer_id,machine_id,tech_id,service_type,work_type,check_in_at,appointment,next_pm,status,line_sent_at,created_at';
  var TYPES = [['', 'ทั้งหมด'], ['เข้าบริการหน้างาน', 'Onsite'], ['ลูกค้าส่งเครื่องเข้าบริษัท', 'Workshop'], ['ติดตั้งเครื่อง', 'ติดตั้ง']];
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function when(r) { return r.check_in_at || r.appointment || r.created_at || ''; }
  function day(v, t) { if (!v) return '-'; var d = new Date(v); if (isNaN(d)) return esc(v); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + (t ? ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''); }
  function tyName(v) { var t = TYPES.filter(function (x) { return x[0] === v; })[0]; return t ? t[1] : (v || '-'); }
  function techName(id) { return String(id || '').split(',').map(function (x) { x = x.trim(); return tech[x] || x; }).filter(Boolean).join(', ') || '-'; }
  function mLabel(id) { var m = mach[id]; return m ? M.nameTh(m) + (M.sn(m) ? ' · S/N ' + M.sn(m) : '') : '-'; }
  function stCls(s) { return /complete|เสร็จ/i.test(s || '') ? 'ok' : /cancel|ยกเลิก/i.test(s || '') ? 'no' : 'sent'; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function imgs(L) { L = arr(L).map(function (x) { return typeof x === 'string' ? x : x && (x.url || x.data) || ''; }).filter(function (x) { return /^(data:image\/|https:\/\/)/.test(x); }); return L; }

  function render() {
    var base = R;
    $('chips').innerHTML = TYPES.map(function (t) { return '<button type="button" class="q-chip" data-k="' + esc(t[0]) + '" aria-pressed="' + (ty === t[0]) + '">' + esc(t[1]) + ' <b>' + (t[0] ? base.filter(function (r) { return r.service_type === t[0]; }).length : base.length) + '</b></button>'; }).join('');
    var mon = new Date().toISOString().slice(0, 7);
    $('cards').innerHTML = [['รายงานทั้งหมด', R.length], ['เดือนนี้', R.filter(function (r) { return String(when(r)).slice(0, 7) === mon; }).length], ['ส่ง LINE แล้ว', R.filter(function (r) { return r.line_sent_at; }).length], ['มีนัด PM ถัดไป', R.filter(function (r) { return r.next_pm; }).length]]
      .map(function (c) { return '<div class="nx-card q-card"><small>' + c[0] + '</small><b>' + c[1] + '</b></div>'; }).join('');
    var s = q.trim().toLowerCase();
    var rows = R.filter(function (r) { return (!ty || r.service_type === ty) && (!s || [r.report_no, (cust[r.customer_id] || {}).name, mLabel(r.machine_id), techName(r.tech_id), (cases[r.case_id] || {}).ticket].join(' ').toLowerCase().indexOf(s) >= 0); })
      .sort(function (a, b) { return String(when(b)).localeCompare(String(when(a))); });
    $('thead').innerHTML = '<tr><th>เลขที่รายงาน</th><th>ลูกค้า</th><th>เครื่อง</th><th>ช่าง</th><th>ประเภท</th><th>สถานะ</th></tr>';
    $('rows').innerHTML = rows.map(function (r) {
      return '<tr data-id="' + esc(r.id) + '"><td><b>' + esc(r.report_no || r.id) + '</b><div class="sub2">' + day(when(r), true) + ((cases[r.case_id] || {}).ticket ? ' · ' + esc(cases[r.case_id].ticket) : '') + '</div></td><td>' + esc((cust[r.customer_id] || {}).name || '-') + '</td>' +
        '<td>' + esc(mLabel(r.machine_id)) + '</td><td data-l="ช่าง">' + esc(techName(r.tech_id)) + '</td><td data-l="ประเภท">' + esc(tyName(r.service_type)) + '</td><td><span class="st ' + stCls(r.status) + '">' + esc(r.status || '-') + '</span></td></tr>';
    }).join('');
    $('empty').hidden = rows.length > 0; $('empty').textContent = R.length ? 'ไม่พบรายงาน' : 'ยังไม่มีรายงานจากช่าง';
  }

  function body(r, forPrint) {
    var e = esc, c = cust[r.customer_id] || {}, k = cases[r.case_id];
    var info = [['เลขที่รายงาน', r.report_no || r.id], ['วันที่เข้างาน', day(when(r), true)], ['ลูกค้า', c.name || '-'], ['เครื่อง', mLabel(r.machine_id)], ['ช่าง', techName(r.tech_id)], ['ประเภทงาน', tyName(r.service_type) + (r.work_type ? ' · ' + r.work_type : '')], ['เคส', k ? k.ticket || r.case_id : (r.case_id || '-')], ['นัด PM ถัดไป', r.next_pm ? day(r.next_pm) : '-']];
    var ck = arr(r.checklist).filter(function (x) { return x && x.label; });
    var sec = function (t, v) { return v ? '<section class="rp-s"><h4>' + t + '</h4><div class="rp-pre">' + e(v) + '</div></section>' : ''; };
    var ph = function (t, L) { L = imgs(L); return L.length ? '<section class="rp-s"><h4>' + t + ' (' + L.length + ')</h4><div class="rp-ph">' + L.map(function (u, i) { return '<img src="' + e(u) + '" alt="' + t + ' ' + (i + 1) + '" data-img="' + i + '">'; }).join('') + '</div></section>' : ''; };
    var parts = arr(r.parts).filter(Boolean);
    return '<div class="rp-g">' + info.map(function (x) { return '<div><small>' + x[0] + '</small><b>' + (x[0] === 'วันที่เข้างาน' || x[0] === 'นัด PM ถัดไป' ? x[1] : e(x[1])) + '</b></div>'; }).join('') + '</div>' +
      (ck.length ? '<section class="rp-s"><h4>Checklist</h4><table class="rp-ck"><tbody>' + ck.map(function (x) { return '<tr><td>' + e(x.label) + '</td><td><b>' + e(x.result || '-') + '</b></td><td>' + e(x.note || '') + '</td></tr>'; }).join('') + '</tbody></table></section>' : '') +
      sec('อาการ / ผลตรวจ', r.diagnosis) + sec('งานที่ทำ', r.work_performed) + sec('ข้อแนะนำ', r.recommendation) +
      (parts.length ? '<section class="rp-s"><h4>อะไหล่ที่ใช้</h4><div class="rp-pre">' + parts.map(function (p) { return e(typeof p === 'string' ? p : [p.partNo, p.name, p.qty ? '× ' + p.qty : ''].filter(Boolean).join(' ')); }).join('<br>') + '</div></section>' : '') +
      ph('รูปก่อนทำ', r.before_photos) + ph('รูปหลังทำ', r.after_photos) +
      '<div class="rp-sig"><div>' + (/^data:image\//.test(r.tech_signature || '') ? '<img src="' + e(r.tech_signature) + '" alt="">' : '') + '<span>ช่างผู้ให้บริการ<br>' + e(techName(r.tech_id)) + '</span></div>' +
      '<div>' + (/^data:image\//.test(r.customer_signature || '') ? '<img src="' + e(r.customer_signature) + '" alt="">' : '') + '<span>ลูกค้า<br>' + e(r.customer_accept || '') + '</span></div></div>' + (forPrint ? '' : '');
  }

  async function open1(id) {
    var x = await api.sb.from('service_reports').select('*').eq('id', id).maybeSingle();
    if (x.error || !x.data) { showErr('เปิดรายงานไม่ได้' + (x.error ? ': ' + x.error.message : '')); return; }
    var r = x.data;
    var p = F.open({ title: 'รายงานบริการ ' + (r.report_no || ''), sub: (cust[r.customer_id] || {}).name || '', fields: [], okLabel: 'ปิด', view: true,
      extra: '<div class="rp-tools"><button type="button" class="nx-btn" id="rpPrint">🖨 พิมพ์ / PDF</button>' + (r.case_id && cases[r.case_id] ? '<a class="nx-btn" href="case.html?id=' + encodeURIComponent(r.case_id) + '">เปิดเคส</a>' : '') + '</div><div class="rp">' + body(r) + '</div>' });
    $('rpPrint').onclick = function () { printR(r); };
    document.querySelectorAll('#nfDlg .rp-ph img').forEach(function (im) { im.onclick = function () { F.openData(im.src); }; });
    try { history.replaceState(null, '', '?id=' + encodeURIComponent(id)); } catch (e) {}
    await p; try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }
  function printR(r) {
    var win = window.open('', '_blank', 'width=1000,height=820'); if (!win) { alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup'); return; }
    var e = esc, logo = M.root + 'shared/assets/imode-document-logo.webp';
    win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + e(r.report_no || 'Service Report') + '</title><style>' +
      'body{font-family:"IBM Plex Sans Thai",Tahoma,Arial,sans-serif;padding:18px;color:#1d2636;font-size:12px}.c{max-width:950px;margin:auto}' +
      '.h{display:grid;grid-template-columns:210px 1fr;gap:15px;align-items:center;border-bottom:2px solid #e47a22;padding-bottom:10px}.h img{width:175px;height:78px;object-fit:contain}.h div{font-size:11px;line-height:1.55}.h b{font-size:13px}' +
      '.t{text-align:center;margin:12px 0}.t h2{margin:0;font-size:22px;color:#123d9d}.t p{margin:3px 0 0;letter-spacing:.08em}' +
      '.rp-g{display:grid;grid-template-columns:1fr 1fr;gap:6px}.rp-g div{border:1px solid #d7dbe4;padding:7px 9px}.rp-g small{display:block;color:#657089;font-size:10px}.rp-g b{display:block;margin-top:2px}' +
      '.rp-s{margin-top:10px;border:1px solid #d7dbe4;break-inside:avoid}.rp-s h4{margin:0;padding:6px 9px;background:#f3f6fb;color:#123d9d}.rp-pre{padding:8px 9px;white-space:pre-wrap;line-height:1.6}' +
      '.rp-ck{width:100%;border-collapse:collapse}.rp-ck td{border-top:1px solid #e6e9ef;padding:5px 9px;vertical-align:top}.rp-ph{display:flex;flex-wrap:wrap;gap:6px;padding:8px}.rp-ph img{width:150px;height:112px;object-fit:cover;border:1px solid #d7dbe4}' +
      '.rp-sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px;break-inside:avoid}.rp-sig div{text-align:center}.rp-sig img{height:70px;max-width:100%;object-fit:contain}.rp-sig span{display:block;border-top:1px solid #555;padding-top:6px}@media print{body{padding:0}}</style></head><body>' +
      '<div class="c"><div class="h"><img src="' + e(logo) + '" alt="I-MODE"><div><b>' + e(CO.companyNameTh || 'บริษัท ไอโมด พลัส จำกัด') + '</b><br>' + e(CO.companyName || 'I-MODE Plus Co., Ltd.') + '<br>' + e(CO.companyAddress || '') + '<br>Tel. ' + e(CO.companyPhone || '') + (CO.companyEmail ? ' · ' + e(CO.companyEmail) : '') + '</div></div>' +
      '<div class="t"><h2>รายงานการให้บริการ</h2><p>SERVICE REPORT</p></div>' + body(r, true) + '</div><script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
    win.document.close();
  }

  try { api = await window.NextShell.start({ title: 'รายงานบริการ', moduleId: 'service' }); } catch (e) { $('rows').innerHTML = ''; showErr(e.message); return; }
  $('q').placeholder = 'ค้นหาเลขรายงาน ลูกค้า เครื่อง ช่าง';
  var res = await Promise.all([api.sb.from('service_reports').select(LIST).limit(5000),
    api.sb.from('customers').select('id,name').limit(10000),
    api.sb.from('machines').select('id,name,nameTh,nameEn,model,serial,imodeSn,customerId').limit(10000),
    api.sb.from('technicians').select('id,name').limit(1000),
    api.sb.from('service_cases').select('id,ticket').limit(10000),
    api.sb.from('system_settings').select('data').eq('id', 'main').maybeSingle()]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดรายงานไม่ได้: ' + res[0].error.message); return; }
  R = res[0].data || [];
  (res[1].data || []).forEach(function (c) { cust[c.id] = c; });
  (res[2].data || []).forEach(function (m) { mach[m.id] = m; });
  (res[3].data || []).forEach(function (t) { tech[t.id] = t.name; });
  (res[4].data || []).forEach(function (c) { cases[c.id] = c; });
  CO = (res[5].data && res[5].data.data) || {};
  render();
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; ty = b.getAttribute('data-k'); render(); });
  $('q').addEventListener('input', function () { q = this.value; render(); });
  $('rows').addEventListener('click', function (e) { var a = e.target.closest('[data-id]'); if (a) open1(a.getAttribute('data-id')); });
  var pre = new URLSearchParams(location.search).get('id'); if (pre) open1(pre);
})();
