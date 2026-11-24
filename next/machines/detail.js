/* I-MODE System (ระบบใหม่) · เครื่องจักรแต่ละเครื่อง (2026-11-25)
   แท็บ เคส / ใบเสนอราคา / ประกัน / ประวัติ S/N / เอกสาร + ข้อมูลเครื่อง + QR (เครื่อง + LINE OA) พิมพ์ฉลากได้ */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, C = window.SvCommon, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var id = '', ma = null, cu = null, custList = [], data = { c: [], q: [], w: [], h: [], d: [] }, tab = 'c', api;
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) {}
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function day(v) { var d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'; }
  function money(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function stCls(s) { return /^อนุมัติ/.test(s) ? 'ok' : (/ไม่อนุมัติ|หมดอายุ|ยกเลิก/.test(s) ? 'no' : (/ส่ง|รอ/.test(s) ? 'sent' : '')); }
  function qType(r) { var s = String(r.service || ''); return s === 'SP' ? 'parts' : (s === 'WP' || r.warranty_mode === 'extend' ? 'warranty' : 'service'); }
  function wBadge(end) {
    if (!end) return '<span class="st">ไม่มีข้อมูล</span>';
    var left = Math.ceil((new Date(end) - Date.now()) / 864e5);
    return left < 0 ? '<span class="st no">หมดประกัน</span>' : (left <= 30 ? '<span class="st sent">ใกล้หมด ' + left + ' วัน</span>' : '<span class="st ok">ถึง ' + esc(day(end)) + '</span>');
  }

  function head() {
    $('title').innerHTML = esc(M.nameTh(ma)) + (M.nameEn(ma) ? '<small class="ma-en">' + esc(M.nameEn(ma)) + '</small>' : '');
    document.title = M.nameTh(ma) + ' · I-MODE System';
    var ph = M.photo(ma);
    $('pic').innerHTML = ph ? '<img src="' + esc(ph) + '" alt="รูปเครื่อง">' : '<span>⚙</span>'; $('pic').classList.toggle('none', !ph);
    var w = data.w[0];
    var I = [['ลูกค้า', cu ? '<a href="../customers/detail.html?id=' + encodeURIComponent(cu.id) + '">' + esc(cu.name) + '</a>' : '-', 1],
      ['Model', ma.model], ['Serial No.', ma.serial], ['IMODE S/N', ma.imodeSn], ['S/N โรงงาน', ma.factorySn], ['ปีออกเครื่อง', ma.issueYear],
      ['ขนาด Service', M.sizeBadge(ma) + (ma.serviceSize ? ' <small class="mut">' + esc(ma.serviceSize) + '</small>' : ''), 1], ['สถานะ Service', M.svcBadge(ma), 1],
      ['ประกัน', w ? wBadge(w.end_date) : esc(ma.warranty || 'ไม่ทราบ'), 1], ['PM ถัดไป', ma.pmDue ? day(ma.pmDue) : ''],
      ['ที่มา', M.isNon(ma) ? 'ไม่ได้ซื้อจาก I-MODE' : ''], ['PO / Project', [ma.poNo, ma.projectNo].filter(Boolean).join(' · ')], ['Supplier', ma.supplier],
      ['รับเข้า', ma.receivedAt ? day(ma.receivedAt) : ''], ['หมายเหตุ', ma.note]];
    $('info').innerHTML = I.filter(function (x) { return x[1]; }).map(function (x) { return '<span>' + esc(x[0]) + '</span><div>' + (x[2] ? x[1] : esc(x[1])) + '</div>'; }).join('');
  }
  function qr() {
    var u = M.portalUrl(ma), a = M.qrData(u, '#0b2f8f'), b = M.qrData(M.lineUrl(), '#06c755');
    $('qrM').innerHTML = a ? '<img src="' + a + '" alt="QR เครื่อง">' : '<small>โหลด QR ไม่ได้</small>';
    $('qrL').innerHTML = b ? '<img src="' + b + '" alt="QR LINE">' : '<small>โหลด QR ไม่ได้</small>';
    $('pUrl').href = u;
    if ($('pNew')) $('pNew').href = MaCommon.root + 'next/portal/index.html?machineToken=' + encodeURIComponent(ma.qrToken || ma.id);
  }
  function tabs() {
    var T = [['c', 'เคส', data.c.length], ['q', 'ใบเสนอราคา', data.q.length], ['w', 'ประกัน', data.w.length], ['h', 'ประวัติ S/N', data.h.length], ['d', 'เอกสาร', data.d.length]];
    $('tabs').innerHTML = T.map(function (t) { return '<button type="button" class="q-chip" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + ' ' + t[2] + '</button>'; }).join('');
    var h = '';
    if (tab === 'c') h = data.c.length ? '<table class="q-t"><thead><tr><th>เคส</th><th>วันที่</th><th>อาการ</th><th>ขั้นงาน</th></tr></thead><tbody>' + data.c.map(function (c) {
      var u = '../service/case.html?id=' + encodeURIComponent(c.id);
      return '<tr data-href="' + esc(u) + '"><td><a class="no" href="' + esc(u) + '">' + esc(c.ticket || '-') + '</a><div class="ty">' + esc(C.typeName ? C.typeName(c.service_type) : (c.service_type || '')) + '</div></td><td>' + esc(day(c.created_at)) + '</td><td>' + esc(String(c.issue || '-').slice(0, 60)) + '</td><td><span class="st' + (C.stageOf(c) === 'closed' ? ' ok' : '') + '">' + esc(C.stageName(C.stageOf(c))) + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีเคสของเครื่องนี้</p>';
    if (tab === 'q') h = data.q.length ? '<table class="q-t"><thead><tr><th>เลขที่</th><th>วันที่</th><th class="num">ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>' + data.q.map(function (r) {
      var u = '../../modules/service/quote-' + qType(r) + '.html?id=' + encodeURIComponent(r.id);
      return '<tr data-href="' + esc(u) + '"><td><a class="no" href="' + esc(u) + '">' + esc(r.id) + '</a></td><td>' + esc(day(r.created_at)) + '</td><td class="num">' + esc(money(r.grand)) + '</td><td><span class="st ' + stCls(r.status || '') + '">' + esc(r.status || 'ร่าง') + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีใบเสนอราคาที่มีเครื่องนี้</p>';
    if (tab === 'w') h = data.w.length ? '<table class="q-t"><thead><tr><th>เลขประกัน</th><th>เริ่ม</th><th>สิ้นสุด</th><th>ความคุ้มครอง</th></tr></thead><tbody>' + data.w.map(function (w) {
      return '<tr><td><b>' + esc(w.warranty_no || w.id) + '</b></td><td>' + esc(day(w.start_date)) + '</td><td>' + wBadge(w.end_date) + '</td><td>' + esc(w.coverage || '-') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีข้อมูลประกัน</p>';
    if (tab === 'w') h += '<p class="q-empty"><a class="nx-btn" href="../warranty/index.html' + (api.can('warranty.edit') ? '?machine=' + encodeURIComponent(ma.id) + '">＋ ลงทะเบียนประกันเครื่องนี้' : '">ดูหน้าประกันทั้งหมด') + '</a></p>';
    if (tab === 'h') h = data.h.length ? '<table class="q-t"><thead><tr><th>วันที่</th><th>จาก</th><th>เป็น</th><th>โดย</th></tr></thead><tbody>' + data.h.map(function (x) {
      return '<tr><td>' + esc(day(x.at)) + '</td><td class="ma-sn">' + esc(x.old_sn || '—') + '</td><td class="ma-sn">' + esc(x.new_sn || '—') + '</td><td>' + esc(x.by_name || '-') + (x.how ? ' <small class="mut">(' + esc(x.how) + ')</small>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่เคยเปลี่ยน IMODE S/N</p>';
    if (tab === 'd') h = data.d.length ? '<table class="q-t"><thead><tr><th>เอกสาร</th><th>หมวด</th><th>Version</th><th>วันที่</th></tr></thead><tbody>' + data.d.map(function (d) {
      var link = d.url ? '<a class="no" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.title || d.file_name || 'เอกสาร') + '</a>' : esc(d.title || d.file_name || 'เอกสาร');
      return '<tr><td>' + link + '</td><td>' + esc(d.category || '-') + '</td><td>' + esc(d.version || '-') + '</td><td>' + esc(day(d.doc_date || d.created_at)) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีเอกสารของเครื่องนี้</p>';
    $('tab').innerHTML = h;
  }

  try { api = await window.NextShell.start({ title: 'เครื่องจักร', moduleId: 'machines' }); }
  catch (e) { showErr(e.message); return; }
  if (!id) { showErr('ไม่พบเครื่องจักร'); $('title').textContent = 'ไม่พบเครื่องจักร'; return; }
  var r0 = await api.sb.from('machines').select('*').eq('id', id).maybeSingle();
  if (r0.error || !r0.data) { showErr(r0.error ? 'โหลดข้อมูลไม่ได้: ' + r0.error.message : 'ไม่พบเครื่องนี้ (อาจถูกลบแล้ว)'); $('title').textContent = 'ไม่พบเครื่องจักร'; return; }
  ma = r0.data;
  if (ma.deleted_at) showErr('เครื่องนี้อยู่ในถังขยะ');
  var canEdit = api.can('machine.edit') && !ma.deleted_at;
  ['edit', 'del'].forEach(function (k) { $(k).hidden = !canEdit; });
  if (api.can('service.edit')) { $('newCase').href = '../service/new.html?machine=' + encodeURIComponent(id); $('newCase').hidden = false; }
  $('tab').innerHTML = '<span class="sk" style="height:20px;display:block"></span>';
  var res = await Promise.all([
    api.sb.from('customers').select('id,name,branch').is('deleted_at', null).limit(5000),
    api.sb.from('service_cases').select('id,ticket,created_at,issue,service_type,stage,status').eq('machine_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
    api.sb.from('quotations').select('id,created_at,grand,status,service,warranty_mode').filter('machine_ids', 'cs', JSON.stringify([id])).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
    api.sb.from('machine_warranties').select('id,warranty_no,start_date,end_date,coverage').eq('machine_id', id).order('end_date', { ascending: false }).limit(200),
    api.sb.from('machine_sn_history').select('id,old_sn,new_sn,how,by_name,at').eq('machine_id', id).order('at', { ascending: false }).limit(200),
    api.sb.from('machine_documents').select('id,title,category,version,url,file_name,doc_date,created_at').eq('machine_id', id).order('created_at', { ascending: false }).limit(200),
    M.lineCfg(api.sb)
  ]);
  custList = res[0].data || [];
  cu = custList.filter(function (c) { return c.id === ma.customerId; })[0] || null;
  var bad = res.slice(1, 6).filter(function (r) { return r && r.error; })[0];
  if (bad) showErr('โหลดบางส่วนไม่ได้: ' + bad.error.message);
  data = { c: res[1].data || [], q: res[2].data || [], w: res[3].data || [], h: res[4].data || [], d: res[5].data || [] };
  head(); tabs(); qr();

  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.getAttribute('data-tab'); tabs(); } });
  $('tab').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-href]'); if (tr) location.href = tr.getAttribute('data-href'); });
  document.querySelector('.ma-qrb').addEventListener('click', function (e) { var b = e.target.closest('[data-print]'); if (b) M.printLabel(ma, b.getAttribute('data-print')); });
  $('copy').addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(M.portalUrl(ma)); this.textContent = 'คัดลอกแล้ว ✓'; } catch (x) { prompt('คัดลอกลิงก์นี้', M.portalUrl(ma)); }
  });
  $('edit').addEventListener('click', async function () {
    var row = await M.editMachine(api.sb, ma, custList);
    if (!row) return;
    ma = Object.assign(ma, row); cu = custList.filter(function (c) { return c.id === ma.customerId; })[0] || null;
    var h = await api.sb.from('machine_sn_history').select('id,old_sn,new_sn,how,by_name,at').eq('machine_id', id).order('at', { ascending: false }).limit(200);
    if (!h.error) data.h = h.data || [];
    head(); tabs(); qr();
  });
  $('del').addEventListener('click', async function () {
    var why = prompt('ลบเครื่อง "' + M.nameTh(ma) + '" ไปถังขยะ (กู้คืนได้ 30 วัน)\nเหตุผล:');
    if (why === null) return;
    var r = await api.sb.rpc('app_soft_delete', { p_table: 'machines', p_id: id, p_reason: why });
    if (r.error) { showErr('ลบไม่สำเร็จ: ' + r.error.message); return; }
    location.href = 'index.html';
  });
})();
