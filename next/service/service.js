/* I-MODE System (ระบบใหม่) · บอร์ดเคส Service
   คอม: คอลัมน์ตามขั้น ลากการ์ดย้ายขั้นได้ (แบบ Odoo) + ลากเข้า Hold ได้จากทุกขั้น
   มือถือ: รายการแบ่งตามวัน + แถบขั้นตอน + ปุ่มขั้นต่อไป
   ย้ายขั้นผ่าน rpc case_move_stage (ฐานข้อมูลเช็คสิทธิ์ service.edit และเก็บประวัติ)
   ลบผ่าน app_soft_delete (ไปถังขยะ ต้องมีเหตุผล) */
(async function () {
  'use strict';
  var STAGES = [
    { id: 'received',  name: 'รับเรื่อง' },
    { id: 'inspect',   name: 'ตรวจเช็ค' },
    { id: 'quote',     name: 'ใบเสนอราคา' },
    { id: 'hold',      name: 'Hold รอลูกค้าตัดสินใจ' },
    { id: 'transport', name: 'ขนส่ง / รับเครื่อง' },
    { id: 'repair',    name: 'กำลังซ่อม' },
    { id: 'return',    name: 'ส่งคืน' },
    { id: 'closed',    name: 'ปิดเคส' }
  ];
  var FLOW = ['received', 'inspect', 'quote', 'transport', 'repair', 'return', 'closed']; // ขั้นปกติ (ไม่รวม hold)
  var NEXT_LABEL = { received: 'ส่งไปตรวจเช็ค', inspect: 'ส่งไปทำใบเสนอราคา', quote: 'ลูกค้ายืนยัน ไปขนส่ง', transport: 'รับเครื่องแล้ว เริ่มซ่อม', repair: 'ซ่อมเสร็จ ส่งคืน', return: 'ปิดเคส' };
  /* เคสที่ยังไม่มี stage (มาจากระบบเดิม) เดาจากสถานะเดิม */
  var FROM_OLD = { 'เคสใหม่': 'received', 'นัดหมายแล้ว': 'inspect', 'กำลังดำเนินการ': 'repair', 'เสร็จสิ้น': 'return', 'ปิดเคส': 'closed' };
  var TYPES = [
    { id: '', name: 'ทั้งหมด' },
    { id: 'ลูกค้าส่งเครื่องเข้าบริษัท', name: 'Workshop' },
    { id: 'เข้าบริการหน้างาน', name: 'Onsite' },
    { id: 'ติดตั้งเครื่อง', name: 'ติดตั้ง' }
  ];
  var esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $('board'), daysEl = $('days'), errEl = $('err');
  var cases = [], api = null, type = '', q = '', showClosed = false, dragId = null;

  function stageOf(c) { return c.stage || FROM_OLD[c.status] || 'received'; }
  function typeName(t) { var x = TYPES.filter(function (y) { return y.id && y.id === t; })[0]; return x ? x.name : (t || '-'); }
  function holdDays(c) { return c.hold_since ? Math.max(0, Math.floor((Date.now() - new Date(c.hold_since)) / 864e5)) : 0; }
  function showErr(m) { errEl.innerHTML = m ? '<div class="nx-err" role="alert">' + esc(m) + '</div>' : ''; }
  function dayKey(c) {
    var d = c.appointment ? new Date(c.appointment) : (c.created_at ? new Date(c.created_at) : null);
    if (!d || isNaN(d)) return { k: '9999', label: 'ไม่ระบุวัน' };
    var ymd = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    var k = ymd(d), today = new Date(), tk = ymd(today), tm = ymd(new Date(today.getTime() + 864e5));
    var label = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
    if (k === tk) label = 'วันนี้ · ' + label; else if (k === tm) label = 'พรุ่งนี้ · ' + label;
    return { k: k, label: label };
  }
  function visible() {
    var s = q.trim().toLowerCase();
    return cases.filter(function (c) {
      if (type && c.service_type !== type) return false;
      if (!showClosed && stageOf(c) === 'closed') return false;
      if (s && [c.ticket, c.customer, c.machine, c.model, c.serial, c.assignee].join(' ').toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
  }

  function cardHtml(c) {
    var st = stageOf(c), hd = st === 'hold' ? '<span class="hd">Hold ' + holdDays(c) + ' วัน</span>' : '';
    var opts = STAGES.map(function (s) { return '<option value="' + s.id + '"' + (s.id === st ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    return '<article class="sv-card" draggable="' + (api.can('service.edit') ? 'true' : 'false') + '" data-id="' + esc(c.id) + '">' +
      '<div class="t"><span>' + esc(c.ticket || c.id) + ' · ' + esc(typeName(c.service_type)) + '</span>' + hd + '</div>' +
      '<div class="c">' + esc(c.customer || '-') + '</div>' +
      '<div class="m">' + esc([c.machine, c.model].filter(Boolean).join(' ') || '-') + '</div>' +
      (c.assignee ? '<div class="m">ช่าง: ' + esc(c.assignee) + '</div>' : '') +
      '<div class="f">' + (api.can('service.edit') ? '<label class="vh" for="mv-' + esc(c.id) + '">ย้ายไปขั้น</label><select id="mv-' + esc(c.id) + '" data-move="' + esc(c.id) + '">' + opts + '</select>' : '') +
      (api.can('service.delete') ? '<button type="button" class="del" data-del="' + esc(c.id) + '" aria-label="ย้ายเคส ' + esc(c.ticket || c.id) + ' ไปถังขยะ">ลบ</button>' : '') + '</div></article>';
  }

  function renderBoard(list) {
    var cols = STAGES.filter(function (s) { return showClosed || s.id !== 'closed'; });
    boardEl.innerHTML = cols.map(function (s) {
      var items = list.filter(function (c) { return stageOf(c) === s.id; });
      return '<section class="sv-col' + (s.id === 'hold' ? ' hold' : '') + '" data-stage="' + s.id + '" aria-label="' + esc(s.name) + '">' +
        '<div class="sv-col-h">' + esc(s.name) + '<span class="n">' + items.length + '</span></div>' +
        '<div class="sv-col-b">' + items.map(cardHtml).join('') + '</div></section>';
    }).join('');
  }

  function stepBar(c) {
    var st = stageOf(c), held = st === 'hold';
    var at = held ? FLOW.indexOf(c.stage_before_hold || 'quote') : FLOW.indexOf(st);
    var h = '';
    for (var i = 0; i < FLOW.length; i++) h += '<span class="' + (i < at || (!held && i === at) ? 'on' : (held && i === at ? 'hold' : '')) + '"></span>';
    return '<div class="sv-steps" aria-label="ขั้นที่ ' + (at + 1) + ' จาก ' + FLOW.length + (held ? ' พักไว้รอลูกค้า' : '') + '">' + h + '</div>';
  }
  function renderDays(list) {
    var groups = {}, order = [];
    list.forEach(function (c) { var d = dayKey(c); if (!groups[d.k]) { groups[d.k] = { label: d.label, items: [] }; order.push(d.k); } groups[d.k].items.push(c); });
    order.sort();
    daysEl.innerHTML = order.length ? order.map(function (k) {
      return '<h2>' + esc(groups[k].label) + '</h2>' + groups[k].items.map(function (c) {
        var st = stageOf(c), held = st === 'hold';
        var nextBtn = !api.can('service.edit') || st === 'closed' ? '' : held
          ? '<button class="nx-btn edit" data-unhold="' + esc(c.id) + '">ลูกค้าตอบแล้ว</button>'
          : '<button class="nx-btn primary" data-next="' + esc(c.id) + '">' + esc(NEXT_LABEL[st] || 'ขั้นต่อไป') + '</button>';
        return '<article class="sv-mcard' + (held ? ' hold' : '') + '" data-id="' + esc(c.id) + '"><div class="sv-card" style="border:none;padding:0;background:none;cursor:default">' +
          '<div class="t"><span>' + esc(c.ticket || c.id) + ' · ' + esc(typeName(c.service_type)) + '</span><span class="nx-badge' + (held ? ' hold' : '') + '">' + esc(held ? 'Hold ' + holdDays(c) + ' วัน' : (STAGES.filter(function (s) { return s.id === st; })[0] || {}).name) + '</span></div>' +
          '<div class="c">' + esc(c.customer || '-') + '</div><div class="m">' + esc([c.machine, c.model].filter(Boolean).join(' ') || '-') + '</div></div>' +
          stepBar(c) + '<div class="btns">' + (api.can('service.edit') && !held && st !== 'closed' ? '<button class="nx-btn" data-hold="' + esc(c.id) + '">พัก Hold</button>' : '') + nextBtn + '</div></article>';
      }).join('');
    }).join('') : '<div class="nx-empty">ไม่มีเคส</div>';
  }

  function render() {
    var list = visible();
    renderBoard(list); renderDays(list);
    $('types').innerHTML = TYPES.map(function (t) {
      var n = cases.filter(function (c) { return (!t.id || c.service_type === t.id) && (showClosed || stageOf(c) !== 'closed'); }).length;
      return '<button type="button" data-type="' + esc(t.id) + '" aria-pressed="' + (type === t.id) + '">' + esc(t.name) + ' ' + n + '</button>';
    }).join('');
  }
  function skeleton() {
    var col = '<section class="sv-col"><div class="sv-col-h"><span class="sk" style="width:90px"></span></div><div class="sv-col-b">' +
      '<div class="sk" style="height:86px;border-radius:10px"></div><div class="sk" style="height:86px;border-radius:10px"></div></div></section>';
    boardEl.innerHTML = col + col + col + col + col;
    daysEl.innerHTML = '<div class="sk" style="height:140px;border-radius:12px"></div><div class="sk" style="height:140px;border-radius:12px"></div>';
  }

  async function load() {
    var res = await api.sb.from('service_cases')
      .select('id,ticket,created_at,updated_at,customer,machine,model,serial,service_type,status,assignee,appointment,stage,stage_before_hold,hold_since,deleted_at')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
    if (res.error) { showErr('โหลดเคสไม่ได้: ' + res.error.message); boardEl.innerHTML = daysEl.innerHTML = ''; return; }
    showErr(''); cases = res.data || []; render();
  }
  async function move(id, stage) {
    var c = cases.filter(function (x) { return x.id === id; })[0];
    if (!c || stageOf(c) === stage) return;
    var before = { stage: c.stage, stage_before_hold: c.stage_before_hold, hold_since: c.hold_since };
    // แสดงผลทันที แล้วค่อยรอฐานข้อมูล ถ้าไม่ผ่านคืนค่าเดิม
    if (stage === 'hold') { c.stage_before_hold = stageOf(c); c.hold_since = new Date().toISOString(); }
    else if (stageOf(c) === 'hold') { c.stage_before_hold = null; c.hold_since = null; }
    c.stage = stage; render();
    var res = await api.sb.rpc('case_move_stage', { p_case: id, p_stage: stage, p_note: '' });
    if (res.error) { c.stage = before.stage; c.stage_before_hold = before.stage_before_hold; c.hold_since = before.hold_since; render(); showErr('ย้ายเคสไม่สำเร็จ: ' + res.error.message); }
  }

  skeleton();
  try { api = await window.NextShell.start({ title: 'Service', moduleId: 'service' }); }
  catch (e) { boardEl.innerHTML = daysEl.innerHTML = ''; showErr(e.message); return; }

  if (api.can('service.edit')) $('newCase').hidden = false;
  // กดการ์ด (ที่ไม่ใช่ปุ่ม/เมนู) เปิดหน้ารายละเอียดเคส
  function openCase(e) {
    if (e.target.closest('select,button,a,label,input')) return;
    var card = e.target.closest('[data-id]'); if (!card) return;
    location.href = 'case.html?id=' + encodeURIComponent(card.getAttribute('data-id'));
  }
  boardEl.addEventListener('click', openCase);
  daysEl.addEventListener('click', openCase);

  $('q').addEventListener('input', function (e) { q = e.target.value; render(); });
  $('showClosed').addEventListener('change', function (e) { showClosed = e.target.checked; render(); });
  $('types').addEventListener('click', function (e) { var b = e.target.closest('[data-type]'); if (b) { type = b.getAttribute('data-type'); render(); } });

  // ลากวาง (คอม)
  boardEl.addEventListener('dragstart', function (e) {
    var card = e.target.closest('.sv-card'); if (!card) return;
    dragId = card.getAttribute('data-id'); card.setAttribute('aria-grabbed', 'true');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {}
  });
  boardEl.addEventListener('dragend', function (e) {
    var card = e.target.closest('.sv-card'); if (card) card.removeAttribute('aria-grabbed');
    boardEl.querySelectorAll('.drop').forEach(function (x) { x.classList.remove('drop'); });
  });
  boardEl.addEventListener('dragover', function (e) {
    var col = e.target.closest('.sv-col'); if (!col || !dragId) return;
    e.preventDefault(); boardEl.querySelectorAll('.drop').forEach(function (x) { if (x !== col) x.classList.remove('drop'); }); col.classList.add('drop');
  });
  boardEl.addEventListener('drop', function (e) {
    var col = e.target.closest('.sv-col'); if (!col || !dragId) return;
    e.preventDefault(); var id = dragId; dragId = null; move(id, col.getAttribute('data-stage'));
  });
  // เลือกขั้นจากเมนูในการ์ด (ใช้แทนการลากได้ทั้งคีย์บอร์ดและจอสัมผัส)
  boardEl.addEventListener('change', function (e) { var s = e.target.closest('[data-move]'); if (s) move(s.getAttribute('data-move'), s.value); });
  // มือถือ
  daysEl.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-next]'))) { var c = cases.filter(function (x) { return x.id === b.getAttribute('data-next'); })[0]; var i = FLOW.indexOf(stageOf(c)); if (i >= 0 && i < FLOW.length - 1) move(c.id, FLOW[i + 1]); }
    else if ((b = e.target.closest('[data-hold]'))) move(b.getAttribute('data-hold'), 'hold');
    else if ((b = e.target.closest('[data-unhold]'))) { var h = cases.filter(function (x) { return x.id === b.getAttribute('data-unhold'); })[0]; move(h.id, h.stage_before_hold && h.stage_before_hold !== 'hold' ? h.stage_before_hold : 'quote'); }
  });
  // ลบ = ย้ายไปถังขยะ
  var dlg = $('delDlg'), delId = null;
  boardEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]'); if (!b) return;
    delId = b.getAttribute('data-del'); var c = cases.filter(function (x) { return x.id === delId; })[0];
    $('delWhat').textContent = (c.ticket || c.id) + ' · ' + (c.customer || '') + ' (กู้คืนได้จากหน้าถังขยะ)';
    $('delReason').value = ''; dlg.showModal();
  });
  dlg.addEventListener('close', async function () {
    if (dlg.returnValue !== 'ok' || !delId) return;
    var reason = $('delReason').value.trim(); if (!reason) return;
    var res = await api.sb.rpc('app_soft_delete', { p_table: 'service_cases', p_id: delId, p_reason: reason });
    if (res.error) { showErr('ลบไม่สำเร็จ: ' + res.error.message); return; }
    cases = cases.filter(function (x) { return x.id !== delId; }); delId = null; render();
  });

  await load();
})();
