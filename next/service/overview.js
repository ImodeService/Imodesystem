/* I-MODE System (ระบบใหม่) · หน้าภาพรวม Service (v2, 2026-11-22)
   แบนเนอร์งานวันนี้ + การ์ด 4 หมวด + กราฟเคสตามขั้นงาน (คอม) + รายการวันนี้ต้องทำ (เลยกำหนดขึ้นก่อน)
   ข้อมูลจริงจาก service_cases (ไม่รวมเคสในถังขยะ) */
(async function () {
  'use strict';
  var C = window.SvCommon, esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var BAR = [
    { id: 'received', s: 'รับเรื่อง' }, { id: 'inspect', s: 'ตรวจเช็ค' }, { id: 'quote', s: 'ใบเสนอ' }, { id: 'hold', s: 'Hold' },
    { id: 'transport', s: 'ขนส่ง' }, { id: 'repair', s: 'ซ่อม' }, { id: 'return', s: 'ส่งคืน' }
  ];
  function catOf(st) { return (C.CATS.filter(function (k) { return k.stages.indexOf(st) >= 0; })[0] || {}).id || ''; }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }

  function skeleton() {
    $('cards').innerHTML = [1, 2, 3, 4].map(function () { return '<div class="nx-card ov-card"><span class="sk" style="width:60px"></span><span class="sk" style="width:40px;height:34px;margin-top:6px;display:block"></span></div>'; }).join('');
    $('today').innerHTML = '<li><span class="sk" style="height:20px;margin:9px 0;display:block"></span></li><li><span class="sk" style="height:20px;margin:9px 0;display:block"></span></li>';
  }

  function render(cases, techs) {
    var open = cases.filter(function (c) { return C.stageOf(c) !== 'closed'; });
    var by = {}; C.STAGES.forEach(function (s) { by[s.id] = 0; });
    open.forEach(function (c) { by[C.stageOf(c)]++; });
    var now = new Date(), mon = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var closedMonth = cases.filter(function (c) { return C.stageOf(c) === 'closed' && String(c.updated_at || '').slice(0, 7) === mon; }).length;

    // งานวันนี้ = นัดวันนี้ + เลยกำหนด
    var tk = C.ymd(now);
    var late = open.filter(C.isLate).sort(function (a, b) { return C.lateDays(b) - C.lateDays(a); });
    var today = open.filter(function (c) { var d = c.appointment && new Date(c.appointment); return d && !isNaN(d) && C.ymd(d) === tk; })
      .sort(function (a, b) { return String(a.appointment).localeCompare(String(b.appointment)); });
    var held = open.filter(function (c) { return C.stageOf(c) === 'hold'; }).sort(function (a, b) { return C.holdDays(b) - C.holdDays(a); })[0];

    var todo = late.length + today.length;
    $('bnTitle').textContent = todo ? 'วันนี้มี ' + todo + ' เคสต้องทำ' : 'วันนี้ไม่มีเคสนัด';
    $('bnSub').textContent = [
      late.length ? 'เลยกำหนด ' + late.length + ' เคส' : 'ไม่มีเคสเลยกำหนด',
      held ? 'Hold นานสุด ' + C.holdDays(held) + ' วัน (' + (held.customer || held.ticket || '') + ')' : ''
    ].filter(Boolean).join(' · ');

    var subs = {
      new: ['รับเรื่อง ' + by.received, 'ตรวจเช็ค ' + by.inspect],
      wait: ['ใบเสนอราคา ' + by.quote, 'Hold ' + by.hold],
      repair: ['ขนส่ง ' + by.transport, 'ซ่อม ' + by.repair],
      return: ['รอส่งคืน ' + by['return'], 'ปิดเดือนนี้ ' + closedMonth]
    };
    var counts = C.catCounts(open);
    $('cards').innerHTML = C.CATS.map(function (k) {
      return '<a class="nx-card ov-card" href="index.html?c=' + k.id + '"><small>' + esc(k.name) + '</small><b>' + counts[k.id] + '</b>' +
        '<span class="sub">' + subs[k.id].map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span></a>';
    }).join('');
    window.NextShell.setCounts(counts);

    // กราฟแท่ง สีเดียวทุกขั้น (รวม Hold)
    var max = Math.max.apply(null, BAR.map(function (b) { return by[b.id]; }).concat([1]));
    $('chart').innerHTML = '<div class="vb">' + BAR.map(function (b) {
      var n = by[b.id], name = C.stageName(b.id);
      return '<a href="index.html?c=' + catOf(b.id) + '" aria-label="' + esc(name) + ' ' + n + ' เคส" title="' + esc(name) + ': ' + n + ' เคส">' + n +
        '<i style="height:' + Math.round(n / max * 85) + '%"></i></a>';
    }).join('') + '</div><div class="vl" aria-hidden="true">' + BAR.map(function (b) { return '<span>' + esc(b.s) + '</span>'; }).join('') + '</div>';

    function row(c, isLate) {
      var t = String(c.appointment || ''), tm = isLate ? 'เลย' : (/T\d\d:\d\d/.test(t) ? t.slice(11, 16) : 'วันนี้');
      var who = C.techNames(c.assignee, techs);
      return '<li><a href="case.html?id=' + encodeURIComponent(c.id) + '"><span class="tm">' + esc(tm) + '</span>' +
        '<span class="nm">' + esc((c.ticket || '') + ' · ' + (c.customer || '-') + (who && !isLate ? ' · ' + who : '')) + '</span>' +
        (isLate ? '<span class="late">เลย ' + C.lateDays(c) + ' วัน</span>' : '') + '</a></li>';
    }
    var rows = late.map(function (c) { return row(c, true); }).concat(today.map(function (c) { return row(c, false); }));
    $('today').innerHTML = rows.length ? rows.slice(0, 8).join('') + (rows.length > 8 ? '<li class="empty">และอีก ' + (rows.length - 8) + ' เคส</li>' : '')
      : '<li class="empty">ไม่มีเคสนัดวันนี้</li>';
  }

  skeleton();
  var api;
  try { api = await window.NextShell.start({ title: 'Service', moduleId: 'service' }); }
  catch (e) { $('cards').innerHTML = $('today').innerHTML = ''; showErr(e.message); return; }
  if (api.can('service.edit')) $('newCase').hidden = false;

  var res = await api.sb.from('service_cases')
    .select('id,ticket,created_at,updated_at,customer,service_type,status,assignee,appointment,stage,hold_since,deleted_at')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
  if (res.error) { $('cards').innerHTML = $('today').innerHTML = ''; showErr('โหลดเคสไม่ได้: ' + res.error.message); return; }
  var techs = await C.loadTechs(api.sb);
  render(res.data || [], techs);
})();
