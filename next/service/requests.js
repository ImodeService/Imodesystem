/* I-MODE System (ระบบใหม่) · คำขอจากลูกค้า
   อ่านจากตาราง line_customer_requests (ข้อมูลเดิมที่ลูกค้าส่งมาทาง LINE OA/QR) ไม่เปลี่ยนโครงสร้างข้อมูล
   ต้องดำเนินการ = status ใหม่ และเคสที่เปิดให้ยังอยู่ขั้นรับเรื่อง (ยังไม่มีใครรับ)
   ปิดเรื่อง = เปลี่ยน status เป็น เสร็จสิ้น (เหมือนระบบเดิม) */
(async function () {
  'use strict';
  var C = window.SvCommon, esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var TYPES = [
    { id: '', name: 'ทั้งหมด' }, { id: 'service', name: 'แจ้งปัญหา' }, { id: 'service_quote', name: 'ขอราคา Service' },
    { id: 'warranty_quote', name: 'ขอราคา Warranty' }, { id: 'warranty_check', name: 'เช็คประกัน' }
  ];
  var rows = [], cases = {}, custs = {}, api = null, q = '', type = '', flt = 'todo';
  function typeName(t) { var x = TYPES.filter(function (y) { return y.id && y.id === t; })[0]; return x ? x.name : 'คำขออื่น'; }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert">' + esc(m) + '</div>' : ''; }
  function isDone(r) { return String(r.status || '') === 'เสร็จสิ้น'; }
  function picked(r) { var c = cases[r.case_id]; return !!(c && C.stageOf(c) !== 'received'); }
  function cat(r) { return isDone(r) ? 'done' : (String(r.status || '') === 'ใหม่' && !picked(r) ? 'todo' : 'doing'); }
  function ago(v) {
    var d = new Date(v); if (isNaN(d)) return '';
    var m = Math.floor((Date.now() - d) / 6e4);
    if (m < 1) return 'เมื่อสักครู่'; if (m < 60) return m + ' นาทีที่แล้ว';
    var h = Math.floor(m / 60); if (h < 24) return h + ' ชั่วโมงที่แล้ว';
    return Math.floor(h / 24) + ' วันที่แล้ว';
  }
  function visible() {
    var s = q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (type && r.type !== type) return false;
      if (flt && cat(r) !== flt) return false;
      if (s && [r.contact, r.phone, r.message, r.line_display_name, (custs[r.customer_id] || {}).name].join(' ').toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
  }
  function render() {
    var by = { todo: 0, doing: 0, done: 0 }; rows.forEach(function (r) { by[cat(r)]++; });
    var K = [['todo', 'ต้องดำเนินการ', by.todo], ['doing', 'กำลังดำเนินการ', by.doing], ['done', 'ปิดเรื่องแล้ว', by.done], ['', 'ทั้งหมด', rows.length]];
    $('kpis').innerHTML = K.map(function (k) { return '<button type="button" class="rq-kpi" data-f="' + k[0] + '" aria-pressed="' + (flt === k[0]) + '"><small>' + k[1] + '</small><b>' + k[2] + '</b></button>'; }).join('');
    $('types').innerHTML = TYPES.map(function (t) {
      var n = rows.filter(function (r) { return !t.id || r.type === t.id; }).length;
      return '<button type="button" data-type="' + esc(t.id) + '" aria-pressed="' + (type === t.id) + '">' + esc(t.name) + ' ' + n + '</button>';
    }).join('');
    var list = visible();
    $('list').innerHTML = list.length ? list.map(function (r) {
      var nm = (custs[r.customer_id] || {}).name || r.line_display_name || r.contact || '-', c = cases[r.case_id];
      var media = Array.isArray(r.media) ? r.media.length : 0, k = cat(r);
      var act = '';
      if (c) act += '<a class="nx-btn primary" href="case.html?id=' + encodeURIComponent(c.id) + '">เปิดเคส</a>';
      if (api.can('service.edit') && !isDone(r)) act += '<button type="button" class="nx-btn" data-done="' + esc(r.id) + '">ปิดเรื่อง</button>';
      return '<article class="rq-card"><div class="rq-main"><div class="rq-top"><span class="nx-badge">' + esc(typeName(r.type)) + '</span>' +
        '<span class="nx-badge' + (k === 'done' ? ' ok' : '') + '">' + esc(k === 'todo' ? 'ใหม่' : k === 'done' ? 'ปิดเรื่องแล้ว' : (r.status || 'กำลังดำเนินการ')) + '</span><span>' + esc(ago(r.created_at)) + '</span></div>' +
        '<div class="rq-cust">' + esc(nm) + '</div>' + (r.message ? '<div class="rq-msg">' + esc(r.message) + '</div>' : '') +
        '<div class="rq-meta">' + (r.phone ? '<span>โทร ' + esc(r.phone) + '</span>' : '') + (r.contact ? '<span>ผู้ติดต่อ ' + esc(r.contact) + '</span>' : '') +
        (c ? '<span>เคส ' + esc(c.ticket || c.id) + '</span>' : '') + (media ? '<span>แนบ ' + media + ' ไฟล์</span>' : '') + (r.priority && r.priority !== 'ปกติ' ? '<span class="rq-late">' + esc(r.priority) + '</span>' : '') + '</div></div>' +
        (act ? '<div class="rq-act">' + act + '</div>' : '') + '</article>';
    }).join('') : '<div class="nx-empty">ไม่มีคำขอในหมวดนี้</div>';
  }

  $('list').innerHTML = '<div class="sk" style="height:96px;border-radius:12px"></div><div class="sk" style="height:96px;border-radius:12px"></div>';
  try { api = await window.NextShell.start({ title: 'Service', moduleId: 'service' }); }
  catch (e) { $('list').innerHTML = ''; showErr(e.message); return; }

  var res = await api.sb.from('line_customer_requests').select('id,type,status,customer_id,case_id,contact,phone,priority,message,line_display_name,created_at,media').order('created_at', { ascending: false }).limit(500);
  if (res.error) { $('list').innerHTML = ''; showErr('โหลดคำขอไม่ได้: ' + res.error.message); return; }
  rows = res.data || [];
  var ids = rows.map(function (r) { return r.case_id; }).filter(Boolean), cids = rows.map(function (r) { return r.customer_id; }).filter(Boolean);
  if (ids.length) { var cr = await api.sb.from('service_cases').select('id,ticket,stage,status').in('id', ids); (cr.data || []).forEach(function (c) { cases[c.id] = c; }); }
  if (cids.length) { var ur = await api.sb.from('customers').select('id,name').in('id', cids); (ur.data || []).forEach(function (c) { custs[c.id] = c; }); }
  if (!rows.some(function (r) { return cat(r) === 'todo'; })) flt = '';  // ไม่มีงานค้าง: โชว์ทั้งหมด จะไม่เห็นหน้าว่าง
  render();

  $('q').addEventListener('input', function (e) { q = e.target.value; render(); });
  $('types').addEventListener('click', function (e) { var b = e.target.closest('[data-type]'); if (b) { type = b.getAttribute('data-type'); render(); } });
  $('kpis').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { flt = b.getAttribute('data-f'); render(); } });
  $('list').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-done]'); if (!b) return;
    var id = b.getAttribute('data-done'), r = rows.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    b.disabled = true;
    var up = await api.sb.from('line_customer_requests').update({ status: 'เสร็จสิ้น' }).eq('id', id);
    if (up.error) { showErr('ปิดเรื่องไม่สำเร็จ: ' + up.error.message); b.disabled = false; return; }
    r.status = 'เสร็จสิ้น'; showErr(''); render();
  });
})();
