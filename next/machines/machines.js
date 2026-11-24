/* I-MODE System (ระบบใหม่) · ทะเบียนเครื่องจักร (2026-11-25)
   machines + ลูกค้า + ประกันล่าสุด (machine_warranties) + จำนวนเคส · แท็บ เครื่องจาก I-MODE / ไม่ได้ซื้อจาก I-MODE (source NON-IMODE) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var rows = [], cust = {}, custList = [], wEnd = {}, cc = {}, origin = 'imode', szf = '', card = '', svc = '', q = '', LIMIT = 200, shown = LIMIT;
  try { if (localStorage.getItem('imode.machines.tab') === 'other') origin = 'other'; } catch (e) {}
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function day(v) { var d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''; }
  function wState(m) {
    var end = wEnd[m.id];
    if (end) { var left = Math.ceil((new Date(end) - Date.now()) / 864e5); return left < 0 ? ['no', 'หมดประกัน'] : left <= 30 ? ['sent', 'ใกล้หมด ' + left + ' วัน'] : ['ok', 'ถึง ' + day(end)]; }
    var t = m.warranty || ''; return t === 'อยู่ในประกัน' ? ['ok', t] : t === 'หมดประกัน' ? ['no', t] : ['', t || 'ไม่ทราบ'];
  }
  function inTab(m) { return origin === 'other' ? M.isNon(m) : !M.isNon(m); }
  function render() {
    var base = rows.filter(inTab), nI = rows.filter(function (m) { return !M.isNon(m); }).length;
    $('origin').innerHTML = [['imode', 'เครื่องจาก I-MODE', nI], ['other', 'เครื่องที่ไม่ได้ซื้อจาก I-MODE', rows.length - nI]].map(function (t) {
      return '<button type="button" role="tab" data-o="' + t[0] + '" aria-selected="' + (origin === t[0]) + '">' + t[1] + ' <b>' + t[2] + '</b></button>';
    }).join('');
    var K = [['', 'เครื่องทั้งหมด', base.length], ['svc', 'ต่อ Service', base.filter(function (m) { return m.serviceStatus === 'ต่อ Service'; }).length],
      ['w', 'ประกันยังไม่หมด', base.filter(function (m) { return wState(m)[0] === 'ok' || wState(m)[0] === 'sent'; }).length], ['sz', 'รอยืนยันขนาด', base.filter(function (m) { return !M.size(m); }).length]];
    $('cards').innerHTML = K.map(function (c) { return '<button type="button" class="nx-card q-card" data-c="' + c[0] + '" aria-pressed="' + (card === c[0]) + '"><small>' + esc(c[1]) + '</small><b>' + c[2] + '</b></button>'; }).join('');
    $('chips').innerHTML = [['', 'ทุกขนาด'], ['S', 'S'], ['M', 'M'], ['L', 'L'], ['-', 'รอยืนยัน']].map(function (c) { return '<button type="button" class="q-chip" data-s="' + c[0] + '" aria-pressed="' + (szf === c[0]) + '">' + c[1] + '</button>'; }).join('');
    var s = q.trim().toLowerCase();
    var v = base.filter(function (m) {
      if (szf && (szf === '-' ? M.size(m) : M.size(m) !== szf)) return false;
      if (svc && (m.serviceStatus || 'ไม่ระบุ') !== svc) return false;
      if (card === 'svc' && m.serviceStatus !== 'ต่อ Service') return false;
      if (card === 'w' && !(wState(m)[0] === 'ok' || wState(m)[0] === 'sent')) return false;
      if (card === 'sz' && M.size(m)) return false;
      if (!s) return true;
      var c = cust[m.customerId] || {};
      return [m.nameTh, m.nameEn, m.name, m.model, m.serial, m.imodeSn, m.factorySn, c.name, c.branch].join(' ').toLowerCase().indexOf(s) >= 0;
    });
    $('rows').innerHTML = v.slice(0, shown).map(function (m) {
      var h = 'detail.html?id=' + encodeURIComponent(m.id), c = cust[m.customerId], ph = M.photo(m), w = wState(m);
      return '<tr data-href="' + esc(h) + '"><td><div class="ma-nm">' + (ph ? '<img src="' + esc(ph) + '" alt="" loading="lazy">' : '<span class="ma-ph">⚙</span>') +
        '<div><a class="nm" href="' + esc(h) + '">' + esc(M.nameTh(m)) + '</a>' + (M.nameEn(m) ? '<div class="sub2">' + esc(M.nameEn(m)) + '</div>' : '') + '</div></div></td>' +
        '<td>' + esc(m.model || '-') + '</td><td class="ma-sn">' + esc(M.sn(m) || '-') + '</td><td class="hide-m">' + (c ? esc(c.name) : '-') + '</td>' +
        '<td>' + M.sizeBadge(m) + '</td><td>' + M.svcBadge(m) + '</td><td><span class="st ' + w[0] + '">' + esc(w[1]) + '</span></td><td class="num cn">' + (cc[m.id] || 0) + '</td></tr>';
    }).join('');
    $('empty').hidden = v.length > 0;
    $('more').hidden = v.length <= shown;
    $('more').innerHTML = v.length > shown ? 'แสดง ' + shown + ' จาก ' + v.length + ' เครื่อง · <button type="button" class="nx-btn" id="showAll">แสดงทั้งหมด</button>' : '';
  }

  var api;
  try { api = await window.NextShell.start({ title: 'เครื่องจักร', moduleId: 'machines' }); }
  catch (e) { showErr(e.message); return; }
  $('rows').innerHTML = '<tr><td colspan="8"><span class="sk" style="height:20px;display:block"></span></td></tr>';
  var res = await Promise.all([
    api.sb.from('machines').select('id,customerId,name,nameTh,nameEn,model,serial,imodeSn,factorySn,size,serviceStatus,warranty,source,createdAt').is('deleted_at', null).order('createdAt', { ascending: false }).limit(10000),
    api.sb.from('customers').select('id,name,branch').is('deleted_at', null).limit(5000),
    api.sb.from('machine_warranties').select('machine_id,end_date').limit(10000),
    api.sb.from('service_cases').select('id,machine_id').is('deleted_at', null).limit(10000)
  ]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดเครื่องจักรไม่ได้: ' + res[0].error.message); return; }
  rows = res[0].data || []; custList = res[1].data || [];
  custList.forEach(function (c) { cust[c.id] = c; });
  (res[2].data || []).forEach(function (w) { if (w.machine_id && w.end_date && (!wEnd[w.machine_id] || w.end_date > wEnd[w.machine_id])) wEnd[w.machine_id] = w.end_date; });
  (res[3].data || []).forEach(function (c) { if (c.machine_id) cc[c.machine_id] = (cc[c.machine_id] || 0) + 1; });
  if (api.can('machine.edit')) $('add').hidden = false;
  render();

  $('origin').addEventListener('click', function (e) { var b = e.target.closest('[data-o]'); if (!b) return; origin = b.getAttribute('data-o'); try { localStorage.setItem('imode.machines.tab', origin); } catch (x) {} shown = LIMIT; render(); });
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; card = b.getAttribute('data-c'); shown = LIMIT; render(); });
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (!b) return; szf = b.getAttribute('data-s'); shown = LIMIT; render(); });
  $('svc').addEventListener('change', function () { svc = this.value; shown = LIMIT; render(); });
  $('q').addEventListener('input', function () { q = this.value; shown = LIMIT; render(); });
  $('more').addEventListener('click', function (e) { if (e.target.id === 'showAll') { shown = 1e9; render(); } });
  $('rows').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-href]'); if (tr) location.href = tr.getAttribute('data-href'); });
  $('add').addEventListener('click', async function () {
    var row = await M.editMachine(api.sb, null, custList, { non: origin === 'other' });
    if (row) location.href = 'detail.html?id=' + encodeURIComponent(row.id);
  });
})();
