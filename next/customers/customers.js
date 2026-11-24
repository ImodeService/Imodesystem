/* I-MODE System (ระบบใหม่) · รายการลูกค้า (2026-11-24)
   customers + นับเครื่อง (machines.customerId) + เคสที่ยังไม่ปิด (service_cases) + LINE (line_user_id) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, C = window.SvCommon, U = window.CuCommon, $ = function (id) { return document.getElementById(id); };
  var rows = [], mc = {}, oc = {}, reqNew = 0, flt = '', q = '', LIMIT = 200, shown = LIMIT;
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function phoneOf(c) { if (c.phone) return c.phone; var x = (c.contacts || [])[0]; return x ? U.chan(x, 'phone') : ''; }
  function contactOf(c) { if (c.contact) return c.contact; var x = (c.contacts || [])[0]; return x ? x.name : ''; }
  function cards() {
    var C2 = [['ลูกค้าทั้งหมด', rows.length, ''], ['มีเคสเปิดอยู่', rows.filter(function (c) { return oc[c.id]; }).length, 'open'],
      ['เชื่อม LINE แล้ว', rows.filter(function (c) { return c.line_user_id; }).length, 'line'], ['คำขอใหม่จาก LINE', reqNew, 'req']];
    $('cards').innerHTML = C2.map(function (c) { return '<button type="button" class="nx-card q-card" data-f="' + c[2] + '"><small>' + esc(c[0]) + '</small><b>' + c[1] + '</b></button>'; }).join('');
    $('chips').innerHTML = [['', 'ทั้งหมด'], ['open', 'มีเคสเปิด'], ['line', 'เชื่อม LINE']].map(function (c) {
      return '<button type="button" class="q-chip" data-f="' + c[0] + '" aria-pressed="' + (flt === c[0]) + '">' + c[1] + '</button>';
    }).join('');
  }
  function list() {
    var s = q.trim().toLowerCase();
    var v = rows.filter(function (c) {
      if (flt === 'open' && !oc[c.id]) return false;
      if (flt === 'line' && !c.line_user_id) return false;
      if (!s) return true;
      var ct = (c.contacts || []).map(function (x) { return x.name + ' ' + (x.channels || []).map(function (h) { return h.value; }).join(' '); }).join(' ');
      return [c.name, c.branch, c.contact, c.phone, c.email, c.location, c.address, ct].join(' ').toLowerCase().indexOf(s) >= 0;
    });
    $('rows').innerHTML = v.slice(0, shown).map(function (c) {
      var h = 'detail.html?id=' + encodeURIComponent(c.id);
      return '<tr data-href="' + esc(h) + '"><td><a class="nm" href="' + esc(h) + '">' + esc(c.name || '-') + '</a>' + (c.line_user_id ? '<span class="ln">LINE</span>' : '') +
        (c.branch ? '<div class="sub2">' + esc(c.branch) + '</div>' : '') + '</td>' +
        '<td>' + esc(contactOf(c) || '-') + (phoneOf(c) ? '<div class="sub2">' + esc(phoneOf(c)) + '</div>' : '') + '</td>' +
        '<td class="hide-m">' + esc(c.location || c.address || '-') + '</td><td class="num mc">' + (mc[c.id] || 0) + '</td><td class="num oc">' + (oc[c.id] || 0) + '</td></tr>';
    }).join('');
    $('empty').hidden = v.length > 0;
    $('more').hidden = v.length <= shown;
    $('more').innerHTML = v.length > shown ? 'แสดง ' + shown + ' จาก ' + v.length + ' ราย · <button type="button" class="nx-btn" id="showAll">แสดงทั้งหมด</button>' : '';
  }

  var api;
  try { api = await window.NextShell.start({ title: 'ลูกค้า', moduleId: 'customers' }); }
  catch (e) { showErr(e.message); return; }
  $('rows').innerHTML = '<tr><td colspan="5"><span class="sk" style="height:20px;display:block"></span></td></tr>';
  var res = await Promise.all([
    api.sb.from('customers').select('id,name,branch,contact,phone,email,location,address,line_user_id,contacts').is('deleted_at', null).order('name').limit(5000),
    api.sb.from('machines').select('id,customerId').is('deleted_at', null).limit(10000),
    api.sb.from('service_cases').select('id,customer_id,stage,status').is('deleted_at', null).limit(5000),
    api.sb.from('line_customer_requests').select('id,status').eq('status', 'ใหม่').limit(500)
  ]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดลูกค้าไม่ได้: ' + res[0].error.message); return; }
  rows = res[0].data || [];
  (res[1].data || []).forEach(function (m) { if (m.customerId) mc[m.customerId] = (mc[m.customerId] || 0) + 1; });
  (res[2].data || []).forEach(function (c) { if (c.customer_id && C.stageOf(c) !== 'closed') oc[c.customer_id] = (oc[c.customer_id] || 0) + 1; });
  reqNew = (res[3].data || []).length;
  if (api.can('customer.edit')) $('add').hidden = false;
  cards(); list();

  function setF(f) { if (f === 'req') { location.href = '../service/requests.html'; return; } flt = f; shown = LIMIT; cards(); list(); }
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) setF(b.getAttribute('data-f')); });
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) setF(b.getAttribute('data-f')); });
  $('q').addEventListener('input', function () { q = this.value; shown = LIMIT; list(); });
  $('more').addEventListener('click', function (e) { if (e.target.id === 'showAll') { shown = 1e9; list(); } });
  $('rows').addEventListener('click', function (e) { if (e.target.closest('a')) return; var tr = e.target.closest('[data-href]'); if (tr) location.href = tr.getAttribute('data-href'); });
  $('add').addEventListener('click', async function () {
    var row = await U.editCustomer(api.sb, null);
    if (row) location.href = 'detail.html?id=' + encodeURIComponent(row.id);
  });
})();
