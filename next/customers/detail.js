/* I-MODE System (ระบบใหม่) · ลูกค้าแต่ละราย (2026-11-24)
   แท็บ เครื่อง / เคส / ใบเสนอราคา / ประกัน ของลูกค้านี้ + ข้อมูลบริษัท + ผู้ติดต่อ (แก้ได้ถ้ามีสิทธิ์ customer.edit) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, C = window.SvCommon, U = window.CuCommon, $ = function (id) { return document.getElementById(id); };
  var id = '', cu = null, data = { m: [], c: [], q: [], w: [] }, tab = 'm', api, canEdit = false, editIdx = -1;
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) {}
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function day(v) { var d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'; }
  function money(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function wEnd(mid) { var w = data.w.filter(function (x) { return x.machine_id === mid && x.end_date; }).sort(function (a, b) { return String(b.end_date).localeCompare(a.end_date); })[0]; return w ? w.end_date : ''; }
  function wBadge(end) {
    if (!end) return '<span class="st">ไม่มีข้อมูล</span>';
    var left = Math.ceil((new Date(end) - Date.now()) / 864e5);
    return left < 0 ? '<span class="st no">หมดประกัน</span>' : (left <= 30 ? '<span class="st sent">ใกล้หมด ' + left + ' วัน</span>' : '<span class="st ok">ถึง ' + esc(day(end)) + '</span>');
  }
  function stCls(s) { return /^อนุมัติ/.test(s) ? 'ok' : (/ไม่อนุมัติ|หมดอายุ|ยกเลิก/.test(s) ? 'no' : (/ส่ง|รอ/.test(s) ? 'sent' : '')); }
  function qType(r) { var s = String(r.service || ''); return s === 'SP' ? 'parts' : (s === 'WP' || r.warranty_mode === 'extend' ? 'warranty' : 'service'); }
  function mName(m) { return m ? (m.nameTh || m.name || m.nameEn || m.model || '-') : '-'; }

  function head() {
    $('title').innerHTML = esc(cu.name || '-') + (cu.line_user_id ? '<span class="ln">LINE</span>' : '');
    document.title = (cu.name || 'ลูกค้า') + ' · I-MODE System';
    var map = U.mapsUrl(cu);
    var I = [['สาขา', cu.branch], ['สถานที่', cu.location], ['ที่อยู่', cu.address], ['ผู้ติดต่อหลัก', cu.contact], ['โทร', cu.phone], ['อีเมล', cu.email],
      ['LINE', cu.line_user_id ? 'เชื่อมแล้ว' + (cu.line_display_name ? ' (' + cu.line_display_name + ')' : '') : 'ยังไม่เชื่อม'], ['หมายเหตุ', cu.note]];
    $('info').innerHTML = I.filter(function (x) { return x[1]; }).map(function (x) { return '<span>' + esc(x[0]) + '</span><div>' + esc(x[1]) + '</div>'; }).join('') +
      (map ? '<span>แผนที่</span><div><a href="' + esc(map) + '" target="_blank" rel="noopener">เปิด Google Maps</a></div>' : '');
    var cts = Array.isArray(cu.contacts) ? cu.contacts : [];
    $('cts').innerHTML = cts.length ? cts.map(function (x, i) {
      var parts = [x.position, U.chan(x, 'phone'), U.chan(x, 'email'), U.chan(x, 'line') && 'LINE ' + U.chan(x, 'line'), x.note].filter(Boolean);
      return '<div class="cu-ct"><div><b>' + esc(x.name || '-') + '</b><small>' + esc(parts.join(' · ') || '-') + '</small></div>' + (canEdit ? '<button type="button" data-ct="' + i + '">แก้</button>' : '') + '</div>';
    }).join('') : '<p class="mut" style="margin:0;font-size:14px">ยังไม่มีผู้ติดต่อ</p>';
  }
  function tabs() {
    var T = [['m', 'เครื่อง', data.m.length], ['c', 'เคส', data.c.length], ['q', 'ใบเสนอราคา', data.q.length], ['w', 'ประกัน', data.w.length]];
    $('tabs').innerHTML = T.map(function (t) { return '<button type="button" class="q-chip" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + ' ' + t[2] + '</button>'; }).join('');
    var h = '', mById = {}; data.m.forEach(function (m) { mById[m.id] = m; });
    if (tab === 'm') h = data.m.length ? '<table class="q-t"><thead><tr><th>เครื่อง</th><th>Serial</th><th>ประกัน</th><th class="num">เคส</th></tr></thead><tbody>' + data.m.map(function (m) {
      var n = data.c.filter(function (c) { return c.machine_id === m.id; }).length;
      var mu = '../machines/detail.html?id=' + encodeURIComponent(m.id);
      return '<tr data-href="' + esc(mu) + '"><td><a class="no" href="' + esc(mu) + '">' + esc(mName(m)) + '</a><div class="ty">' + esc([m.model, m.size].filter(Boolean).join(' · ')) + '</div></td><td>' + esc(m.imodeSn || m.serial || '-') + '</td><td>' + wBadge(wEnd(m.id)) + '</td><td class="num cn">' + n + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีเครื่อง</p>';
    if (tab === 'c') h = data.c.length ? '<table class="q-t"><thead><tr><th>เคส</th><th>วันที่</th><th>เครื่อง</th><th>ขั้นงาน</th></tr></thead><tbody>' + data.c.map(function (c) {
      var u = '../service/case.html?id=' + encodeURIComponent(c.id);
      return '<tr data-href="' + esc(u) + '"><td><a class="no" href="' + esc(u) + '">' + esc(c.ticket || '-') + '</a><div class="ty">' + esc(C.typeName ? C.typeName(c.service_type) : (c.service_type || '')) + '</div></td><td>' + esc(day(c.created_at)) + '</td><td>' + esc(c.machine || '-') + '</td><td><span class="st' + (C.stageOf(c) === 'closed' ? ' ok' : '') + '">' + esc(C.stageName(C.stageOf(c))) + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีเคส</p>';
    if (tab === 'q') h = data.q.length ? '<table class="q-t"><thead><tr><th>เลขที่</th><th>วันที่</th><th class="num">ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>' + data.q.map(function (r) {
      var u = '../../modules/service/quote-' + qType(r) + '.html?id=' + encodeURIComponent(r.id);
      return '<tr data-href="' + esc(u) + '"><td><a class="no" href="' + esc(u) + '">' + esc(r.id) + '</a></td><td>' + esc(day(r.created_at)) + '</td><td class="num">' + esc(money(r.grand)) + '</td><td><span class="st ' + stCls(r.status || '') + '">' + esc(r.status || 'ร่าง') + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีใบเสนอราคา</p>';
    if (tab === 'w') h = data.w.length ? '<table class="q-t"><thead><tr><th>เลขประกัน</th><th>เครื่อง</th><th>เริ่ม</th><th>สิ้นสุด</th></tr></thead><tbody>' + data.w.map(function (w) {
      return '<tr><td><b>' + esc(w.warranty_no || w.id) + '</b></td><td>' + esc(mName(mById[w.machine_id])) + '</td><td>' + esc(day(w.start_date)) + '</td><td>' + wBadge(w.end_date) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="q-empty">ยังไม่มีประกัน</p>';
    $('tab').innerHTML = h;
  }

  try { api = await window.NextShell.start({ title: 'ลูกค้า', moduleId: 'customers' }); }
  catch (e) { showErr(e.message); return; }
  if (!id) { showErr('ไม่พบลูกค้า'); $('title').textContent = 'ไม่พบลูกค้า'; return; }
  var r0 = await api.sb.from('customers').select('*').eq('id', id).maybeSingle();
  if (r0.error || !r0.data) { showErr(r0.error ? 'โหลดข้อมูลไม่ได้: ' + r0.error.message : 'ไม่พบลูกค้านี้ (อาจถูกลบแล้ว)'); $('title').textContent = 'ไม่พบลูกค้า'; return; }
  cu = r0.data;
  if (cu.deleted_at) showErr('ลูกค้านี้อยู่ในถังขยะ');
  canEdit = api.can('customer.edit') && !cu.deleted_at;
  ['edit', 'del', 'addCt'].forEach(function (k) { $(k).hidden = !canEdit; });
  if (api.can('service.edit')) { $('newCase').href = '../service/new.html?customer=' + encodeURIComponent(id); $('newCase').hidden = false; }
  if (api.can('quote.edit')) { $('newQuote').href = '../../modules/service/quote-service.html?customerId=' + encodeURIComponent(id); $('newQuote').hidden = false; }
  head(); $('tab').innerHTML = '<span class="sk" style="height:20px;display:block"></span>';
  var res = await Promise.all([
    api.sb.from('machines').select('id,name,nameTh,nameEn,model,serial,imodeSn,size').eq('customerId', id).is('deleted_at', null).limit(2000),
    api.sb.from('service_cases').select('id,ticket,created_at,machine,machine_id,service_type,stage,status').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
    api.sb.from('quotations').select('id,created_at,grand,status,service,warranty_mode').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
    api.sb.from('machine_warranties').select('id,warranty_no,machine_id,start_date,end_date').eq('customer_id', id).order('end_date', { ascending: false }).limit(2000)
  ]);
  var bad = res.filter(function (r) { return r.error; })[0];
  if (bad) showErr('โหลดบางส่วนไม่ได้: ' + bad.error.message);
  data = { m: res[0].data || [], c: res[1].data || [], q: res[2].data || [], w: res[3].data || [] };
  tabs();

  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.getAttribute('data-tab'); tabs(); } });
  $('tab').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-href]'); if (tr) location.href = tr.getAttribute('data-href'); });
  $('edit').addEventListener('click', async function () { var row = await U.editCustomer(api.sb, cu); if (row) { cu = Object.assign(cu, row); head(); } });
  $('del').addEventListener('click', async function () {
    var why = prompt('ลบลูกค้า "' + (cu.name || '') + '" ไปถังขยะ (กู้คืนได้ 30 วัน)\nเหตุผล:');
    if (why === null) return;
    var r = await api.sb.rpc('app_soft_delete', { p_table: 'customers', p_id: id, p_reason: why });
    if (r.error) { showErr('ลบไม่สำเร็จ: ' + r.error.message); return; }
    location.href = 'index.html';
  });

  /* ผู้ติดต่อ */
  function openCt(i) {
    editIdx = i; var x = i >= 0 ? cu.contacts[i] : { channels: [] };
    $('ctT').textContent = i >= 0 ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ';
    $('cName').value = x.name || ''; $('cPos').value = x.position || ''; $('cNote').value = x.note || '';
    $('cPhone').value = U.chan(x, 'phone'); $('cEmail').value = U.chan(x, 'email'); $('cLine').value = U.chan(x, 'line');
    $('cDel').hidden = i < 0; $('ctDlg').showModal(); $('cName').focus();
  }
  async function saveCts(list) {
    var r = await api.sb.from('customers').update({ contacts: list }).eq('id', id);
    if (r.error) { showErr('บันทึกผู้ติดต่อไม่สำเร็จ: ' + r.error.message); return false; }
    cu.contacts = list; showErr(''); head(); return true;
  }
  $('addCt').addEventListener('click', function () { if (!Array.isArray(cu.contacts)) cu.contacts = []; openCt(-1); });
  $('cts').addEventListener('click', function (e) { var b = e.target.closest('[data-ct]'); if (b) openCt(+b.getAttribute('data-ct')); });
  $('ctFrm').addEventListener('submit', async function (e) {
    if (!e.submitter || e.submitter.value !== 'ok') return;
    e.preventDefault();
    var name = $('cName').value.trim(); if (!name) { $('cName').focus(); return; }
    var old = editIdx >= 0 ? cu.contacts[editIdx] : {}, cid = old.id || 'CT-' + U.uid().slice(0, 8);
    var ch = [['phone', 'cPhone'], ['email', 'cEmail'], ['line', 'cLine']].map(function (p) { var v = $(p[1]).value.trim(); return v ? { id: 'CH-' + U.uid().slice(0, 8), type: p[0], value: v } : null; }).filter(Boolean);
    var keep = (old.channels || []).filter(function (c) { return ['phone', 'email', 'line'].indexOf(c.type) < 0; });
    var item = Object.assign({}, old, { id: cid, name: name, position: $('cPos').value.trim(), note: $('cNote').value.trim(), channels: ch.concat(keep) });
    var list = cu.contacts.slice(); if (editIdx >= 0) list[editIdx] = item; else list.push(item);
    if (await saveCts(list)) $('ctDlg').close();
  });
  $('cDel').addEventListener('click', async function () {
    if (editIdx < 0 || !confirm('ลบผู้ติดต่อ "' + (cu.contacts[editIdx].name || '') + '"?')) return;
    var list = cu.contacts.slice(); list.splice(editIdx, 1);
    if (await saveCts(list)) $('ctDlg').close();
  });
})();
