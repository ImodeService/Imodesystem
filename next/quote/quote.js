/* I-MODE System (ระบบใหม่) · รายการใบเสนอราคา (2026-11-24)
   อ่านตาราง quotations (ไม่รวมถังขยะ) · เปิด/สร้างใบ ใช้หน้ากรอกเดิม modules/service/quote-*.html
   ประเภท: service='SP' = อะไหล่, 'WP' หรือ warranty_mode='extend' = ประกัน, อื่น ๆ = Service (เหมือน quote-common.js) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, $ = function (id) { return document.getElementById(id); };
  var ROOT = '../../', EDIT = ROOT + 'modules/service/';
  var TYPES = { service: { name: 'Service', page: 'quote-service.html' }, parts: { name: 'อะไหล่', page: 'quote-parts.html' }, warranty: { name: 'ประกัน', page: 'quote-warranty.html' } };
  var rows = [], type = '', status = '', q = '';
  try { type = new URLSearchParams(location.search).get('t') || ''; } catch (e) {}
  if (!TYPES[type]) type = '';

  function typeOf(r) { var s = String(r.service || ''); return s === 'SP' ? 'parts' : (s === 'WP' || r.warranty_mode === 'extend' ? 'warranty' : 'service'); }
  function money(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function day(v) { var d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function stCls(s) { return /^อนุมัติ/.test(s) ? 'ok' : (/ไม่อนุมัติ|หมดอายุ|ยกเลิก/.test(s) ? 'no' : (/ส่ง|รอ/.test(s) ? 'sent' : '')); }
  function url(r) { return EDIT + TYPES[typeOf(r)].page + '?id=' + encodeURIComponent(r.id); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }

  function cards() {
    var mon = new Date().toISOString().slice(0, 7), mine = rows.filter(function (r) { return !type || typeOf(r) === type; });
    var appr = mine.filter(function (r) { return stCls(r.status) === 'ok' && String(r.updated_at || r.created_at || '').slice(0, 7) === mon; });
    var C = [
      { k: 'ร่าง', n: mine.filter(function (r) { return r.status === 'ร่าง'; }).length, s: 'ร่าง' },
      { k: 'ส่งแล้ว รอลูกค้าตอบ', n: mine.filter(function (r) { return stCls(r.status) === 'sent'; }).length, s: '~sent' },
      { k: 'อนุมัติเดือนนี้', n: appr.length, s: 'อนุมัติ' },
      { k: 'ยอดอนุมัติเดือนนี้', n: money(appr.reduce(function (a, r) { return a + Number(r.grand || 0); }, 0)), s: 'อนุมัติ' }
    ];
    $('cards').innerHTML = C.map(function (c) { return '<button type="button" class="nx-card q-card" data-st="' + esc(c.s) + '"><small>' + esc(c.k) + '</small><b>' + esc(c.n) + '</b></button>'; }).join('');
  }
  function list() {
    var s = q.trim().toLowerCase();
    var v = rows.filter(function (r) {
      if (type && typeOf(r) !== type) return false;
      if (status === '~sent' ? stCls(r.status) !== 'sent' : (status && r.status !== status)) return false;
      return !s || [r.id, r.customer, r.case_ticket, r.contact].join(' ').toLowerCase().indexOf(s) >= 0;
    });
    $('rows').innerHTML = v.map(function (r) {
      return '<tr data-href="' + esc(url(r)) + '"><td><a class="no" href="' + esc(url(r)) + '">' + esc(r.id) + '</a><div class="ty">' + esc(TYPES[typeOf(r)].name) + '</div></td>' +
        '<td>' + esc(day(r.created_at)) + '</td><td>' + esc(r.customer || '-') + '</td><td class="hide-m">' + esc(r.case_ticket || '-') + '</td>' +
        '<td class="num">' + esc(money(r.grand)) + '</td><td><span class="st ' + stCls(r.status || '') + '">' + esc(r.status || 'ร่าง') + '</span></td></tr>';
    }).join('');
    $('empty').hidden = v.length > 0;
  }
  function chips() {
    $('chips').innerHTML = [['', 'ทั้งหมด']].concat(Object.keys(TYPES).map(function (k) { return [k, TYPES[k].name]; })).map(function (c) {
      return '<button type="button" class="q-chip" data-t="' + c[0] + '" aria-pressed="' + (type === c[0]) + '">' + esc(c[1]) + '</button>';
    }).join('');
  }
  function render() { chips(); cards(); list(); }

  var api;
  try { api = await window.NextShell.start({ title: 'ใบเสนอราคา', moduleId: 'quote' }); }
  catch (e) { showErr(e.message); return; }
  if (api.can('quote.edit')) document.querySelectorAll('[data-new]').forEach(function (a) { a.href = EDIT + TYPES[a.getAttribute('data-new')].page; a.hidden = false; });
  else document.querySelector('.q-newl').hidden = true;
  $('rows').innerHTML = '<tr><td colspan="6"><span class="sk" style="height:20px;display:block"></span></td></tr>';

  var res = await api.sb.from('quotations').select('id,customer,contact,case_ticket,service,warranty_mode,grand,status,created_at,updated_at')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(1000);
  if (res.error) { $('rows').innerHTML = ''; showErr('โหลดใบเสนอราคาไม่ได้: ' + res.error.message); return; }
  rows = res.data || [];
  var sts = {}; rows.forEach(function (r) { if (r.status) sts[r.status] = 1; });
  ['ร่าง', 'ส่งแล้ว', 'รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ', 'หมดอายุ'].forEach(function (s) { sts[s] = 1; });
  $('st').innerHTML += Object.keys(sts).map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
  render();

  $('chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return; type = b.getAttribute('data-t');
    try { history.replaceState(null, '', type ? '?t=' + type : location.pathname); } catch (x) {}
    render();
  });
  $('cards').addEventListener('click', function (e) {
    var b = e.target.closest('[data-st]'); if (!b) return; status = b.getAttribute('data-st');
    $('st').value = status === '~sent' ? '' : status; list();
  });
  $('st').addEventListener('change', function () { status = this.value; list(); });
  $('q').addEventListener('input', function () { q = this.value; list(); });
  $('rows').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-href]'); if (tr) location.href = tr.getAttribute('data-href'); });
})();
