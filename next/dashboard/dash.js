/* 2026-11-22: Dashboard แยกหน้าตามหมวด ใช้ร่วมกันทุกหน้า
   หน้า: overview (ภาพรวม) · cases (งานบริการ) · team (ทีมงาน) · quotes (ใบเสนอราคา) · qc (QC)
   อ่านอย่างเดียว ไม่ดึงรูป (media) เพื่อประหยัดปริมาณดาวน์โหลด */
(async function () {
  'use strict';
  var PAGE = document.body.getAttribute('data-page') || 'overview';
  var C = window.SvCommon, api, esc = function (s) { return window.NextShell.esc(s); };
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var data = { cases: [], quotes: null, qc: null, techs: {} };
  var $ = function (id) { return document.getElementById(id); };
  var yearSel = $('year');
  function num(n) { return Number(n || 0).toLocaleString('th-TH'); }
  function baht(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
  function yr(t) { var d = t ? new Date(t) : null; return d && !isNaN(d) ? d.getFullYear() : null; }
  function mo(t) { return new Date(t).getMonth(); }
  function closedAt(c) {
    var log = Array.isArray(c.stage_log) ? c.stage_log : [];
    for (var i = log.length - 1; i >= 0; i--) if (log[i] && log[i].to === 'closed') return { at: log[i].at, by: log[i].by_name || '' };
    if (C.stageOf(c) === 'closed') return { at: c.updated_at || c.created_at, by: '' };
    return null;
  }
  function openedBy(c) { var log = Array.isArray(c.stage_log) ? c.stage_log : []; return (log[0] && log[0].by_name) || ''; }
  function isPass(s) { return /ผ่าน|pass|approved/i.test(s || '') && !/ไม่ผ่าน|fail/i.test(s || ''); }
  function isFail(s) { return /ไม่ผ่าน|fail|reject/i.test(s || ''); }
  function topList(counts, n) { return Object.keys(counts).filter(Boolean).map(function (k) { return [k, counts[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n); }

  function kpis(list) {
    if (!$('kpis')) return;
    $('kpis').innerHTML = list.map(function (k) {
      var inner = '<small>' + esc(k[0]) + '</small><b>' + k[1] + '</b><span>' + esc(k[2]) + '</span>';
      return k[3] ? '<a class="nx-card db-kpi" href="' + k[3] + '">' + inner + '</a>' : '<div class="nx-card db-kpi">' + inner + '</div>';
    }).join('');
  }
  function rank(el, counts, unit, n) {
    if (!el) return;
    var arr = topList(counts, n || 5);
    el.innerHTML = arr.length ? arr.map(function (r, i) { return '<li><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(r[0]) + '</span><b>' + num(r[1]) + '</b> <span style="color:var(--mut);font-size:12px">' + unit + '</span></li>'; }).join('')
      : '<li class="db-empty" style="border:0">ยังไม่มีข้อมูล (เคสเก่าก่อนระบบใหม่ไม่ได้บันทึกชื่อคนทำ)</li>';
  }
  function hbars(el, rows) {
    if (!el) return;
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    el.innerHTML = rows.length ? rows.map(function (r) {
      return '<div class="db-hbar"><span class="lb">' + esc(r[0]) + (r[2] ? '<small>' + esc(r[2]) + '</small>' : '') + '</span><span class="tr"><i style="width:' + (r[1] ? Math.max(3, r[1] / max * 100) : 0) + '%"></i></span><b>' + num(r[1]) + '</b></div>';
    }).join('') : '<div class="db-empty">ยังไม่มีข้อมูล</div>';
  }
  function noPerm(el, what) { if (el) el.innerHTML = '<div class="db-empty">บัญชีนี้ไม่มีสิทธิ์ดู' + what + '</div>'; }

  /* กราฟแท่งคู่รายเดือน (2 ชุด) วาดตามความกว้างจริงเพื่อให้ตัวหนังสืออ่านออกบนมือถือ */
  var charts = {};
  function monthly(id, a, b) {
    var box = $(id); if (!box) return;
    charts[id] = [a, b];
    var cw = box.clientWidth || 640, small = cw < 520;
    var W = Math.max(300, Math.round(cw)), H = small ? 210 : 240, L = small ? 24 : 30, B = 26, T = 12, R = 6, ph = H - B - T, gw = (W - L - R) / 12, bw = Math.min(16, (gw - (small ? 6 : 10)) / 2);
    var max = Math.max.apply(null, a.vals.concat(b.vals).concat([1])), step = max <= 5 ? 1 : Math.ceil(max / 4);
    var top = Math.ceil(max / step) * step, y = function (v) { return T + ph - v / top * ph; };
    var g = '';
    for (var v = 0; v <= top; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    function bar(x, v, col) {
      if (!v) return '';
      var h = ph * v / top, yy = T + ph - h, r = Math.min(4, h);
      return '<path d="M' + x + ',' + (T + ph) + 'V' + (yy + r) + 'q0,-' + r + ' ' + r + ',-' + r + 'h' + (bw - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + (T + ph) + 'z" fill="' + col + '"/>';
    }
    for (var m = 0; m < 12; m++) {
      var x0 = L + gw * m + (gw - (bw * 2 + 2)) / 2;
      g += bar(x0, a.vals[m], 'var(--s-open)') + bar(x0 + bw + 2, b.vals[m], 'var(--s-close)');
      if (!small || m % 2 === 0) g += '<text x="' + (L + gw * m + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + MONTHS[m] + '</text>';
      g += '<rect class="hit" data-m="' + m + '" x="' + (L + gw * m) + '" y="' + T + '" width="' + gw + '" height="' + ph + '" fill="transparent"/>';
    }
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="กราฟรายเดือน ' + esc(a.name) + ' และ ' + esc(b.name) + '">' + g + '</svg><div class="db-tip" hidden></div>';
    var tip = box.querySelector('.db-tip'), sw = function (c) { return '<i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + c + '"></i> '; };
    box.querySelectorAll('.hit').forEach(function (r) {
      function show() {
        var m = +r.getAttribute('data-m'), bb = r.getBoundingClientRect(), pb = box.getBoundingClientRect();
        tip.innerHTML = '<b>' + MONTHS[m] + ' ' + (+yearSel.value + 543) + '</b><br>' + sw('var(--s-open)') + esc(a.name) + ' ' + num(a.vals[m]) + ' ' + a.unit + '<br>' + sw('var(--s-close)') + esc(b.name) + ' ' + num(b.vals[m]) + ' ' + b.unit;
        var left = Math.min(Math.max(bb.left - pb.left + bb.width / 2, 70), pb.width - 70);
        tip.style.left = left + 'px'; tip.style.top = (bb.top - pb.top + 10) + 'px'; tip.hidden = false;
        r.setAttribute('fill', 'color-mix(in srgb, var(--fg) 6%, transparent)');
      }
      function hide() { tip.hidden = true; r.setAttribute('fill', 'transparent'); }
      r.addEventListener('mouseenter', show); r.addEventListener('mouseleave', hide); r.addEventListener('click', show);
    });
    var tbl = $(id + 'Tbl');
    if (tbl) tbl.innerHTML = '<table class="db-table"><thead><tr><th>เดือน</th><th>' + esc(a.name) + '</th><th>' + esc(b.name) + '</th></tr></thead><tbody>' +
      MONTHS.map(function (n, i) { return '<tr><td>' + n + '</td><td>' + num(a.vals[i]) + '</td><td>' + num(b.vals[i]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  function render() {
    var Y = +yearSel.value, cases = data.cases, yy = 'ปี ' + (Y + 543);
    $('sub').textContent = $('sub').getAttribute('data-base') + ' · ' + yy + ' · อัปเดต ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    var openNow = cases.filter(function (c) { return C.stageOf(c) !== 'closed'; });
    var holdNow = openNow.filter(function (c) { return C.stageOf(c) === 'hold'; });
    var newY = cases.filter(function (c) { return yr(c.created_at) === Y; });
    var closedY = cases.map(function (c) { return [c, closedAt(c)]; }).filter(function (p) { return p[1] && yr(p[1].at) === Y; });
    var opened = new Array(12).fill(0), closed = new Array(12).fill(0);
    newY.forEach(function (c) { opened[mo(c.created_at)]++; });
    closedY.forEach(function (p) { closed[mo(p[1].at)]++; });
    var q = data.quotes ? data.quotes.filter(function (x) { return yr(x.created_at) === Y; }) : null;
    var qOk = q ? q.filter(function (x) { return x.status === 'อนุมัติ'; }) : null;
    var qOkVal = qOk ? qOk.reduce(function (s, x) { return s + Number(x.grand || 0); }, 0) : 0;
    var qcY = data.qc ? data.qc.filter(function (x) { return yr(x.qc_date || x.created_at) === Y; }) : null;
    var qcPass = qcY ? qcY.filter(function (x) { return isPass(x.status); }) : null;
    var qcFail = qcY ? qcY.filter(function (x) { return isFail(x.status); }) : null;
    var o = {}, cl = {}, t = {};
    newY.forEach(function (c) { var n = openedBy(c); if (n) o[n] = (o[n] || 0) + 1; });
    closedY.forEach(function (p) { if (p[1].by) cl[p[1].by] = (cl[p[1].by] || 0) + 1; });
    newY.forEach(function (c) { String(c.assignee || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (id) { var n = data.techs[id] || id; t[n] = (t[n] || 0) + 1; }); });
    var caseChart = [{ name: 'เปิดใหม่', unit: 'เคส', vals: opened }, { name: 'ปิดแล้ว', unit: 'เคส', vals: closed }];
    function stageRows() { return C.STAGES.filter(function (s) { return s.id !== 'closed'; }).map(function (s) { return [s.name, openNow.filter(function (c) { return C.stageOf(c) === s.id; }).length]; }); }
    function typeRows() { var ty = {}; newY.forEach(function (c) { var n = C.typeName(c.service_type) || 'อื่นๆ'; ty[n] = (ty[n] || 0) + 1; }); return topList(ty, 20); }

    if (PAGE === 'overview') {
      kpis([
        ['เคสที่ยังเปิดอยู่', num(openNow.length), 'ตอนนี้', 'cases.html'],
        ['Hold รอลูกค้า', num(holdNow.length), 'ตอนนี้', 'cases.html'],
        ['เคสเปิดใหม่', num(newY.length), yy, 'cases.html'],
        ['เคสที่ปิดแล้ว', num(closedY.length), yy, 'cases.html'],
        ['ใบเสนอราคาที่อนุมัติ', qOk ? baht(qOkVal) : '-', qOk ? num(qOk.length) + ' ใบ' : 'ไม่มีสิทธิ์ดู', 'quotes.html'],
        ['QC ผ่าน', qcPass ? num(qcPass.length) : '-', qcY ? 'จาก ' + num(qcY.length) + ' ใบ' : 'ไม่มีสิทธิ์ดู', 'qc.html']
      ]);
      monthly('monthly', caseChart[0], caseChart[1]);
      function rows(list) { return list.map(function (r) { return '<div class="row"><span>' + esc(r[0]) + '</span><b>' + r[1] + '</b></div>'; }).join(''); }
      var to = topList(o, 1)[0], tc = topList(cl, 1)[0], tt = topList(t, 1)[0];
      $('cTeam').innerHTML = rows([['เปิดเคสมากที่สุด', to ? esc(to[0]) + ' · ' + num(to[1]) : '-'], ['ปิดเคสมากที่สุด', tc ? esc(tc[0]) + ' · ' + num(tc[1]) : '-'], ['ช่างที่รับเคสมากที่สุด', tt ? esc(tt[0]) + ' · ' + num(tt[1]) : '-']]);
      var stg = stageRows().sort(function (a, b) { return b[1] - a[1]; })[0];
      $('cCases').innerHTML = rows([['ขั้นที่ค้างมากที่สุด', stg && stg[1] ? esc(stg[0]) + ' · ' + num(stg[1]) : '-'], ['ประเภทที่มากที่สุด', typeRows()[0] ? esc(typeRows()[0][0]) + ' · ' + num(typeRows()[0][1]) : '-'], ['เปิด / ปิด ในปีนี้', num(newY.length) + ' / ' + num(closedY.length)]]);
      $('cQuotes').innerHTML = q ? rows([['สร้างในปีนี้', num(q.length) + ' ใบ'], ['อนุมัติ', num(qOk.length) + ' ใบ · ' + baht(qOkVal)], ['รอลูกค้าตอบ', num(q.filter(function (x) { return /รอ/.test(x.status || ''); }).length) + ' ใบ']]) : '<div class="db-empty">ไม่มีสิทธิ์ดู</div>';
      $('cQc').innerHTML = qcY ? rows([['ตรวจในปีนี้', num(qcY.length) + ' ใบ'], ['ผ่าน', num(qcPass.length) + ' ใบ' + (qcY.length ? ' (' + Math.round(qcPass.length / qcY.length * 100) + '%)' : '')], ['ไม่ผ่าน', num(qcFail.length) + ' ใบ']]) : '<div class="db-empty">ไม่มีสิทธิ์ดู</div>';
    }

    if (PAGE === 'cases') {
      kpis([['เคสที่ยังเปิดอยู่', num(openNow.length), 'ตอนนี้'], ['Hold รอลูกค้า', num(holdNow.length), 'ตอนนี้'], ['เคสเปิดใหม่', num(newY.length), yy], ['เคสที่ปิดแล้ว', num(closedY.length), yy]]);
      monthly('monthly', caseChart[0], caseChart[1]);
      hbars($('stages'), stageRows());
      hbars($('types'), typeRows());
    }

    if (PAGE === 'team') {
      rank($('rOpen'), o, 'เคส', 10); rank($('rClose'), cl, 'เคส', 10); rank($('rTech'), t, 'เคส', 10);
    }

    if (PAGE === 'quotes') {
      if (!q) { $('kpis').innerHTML = ''; noPerm($('quotes'), 'ใบเสนอราคา'); noPerm($('monthly'), 'ใบเสนอราคา'); return; }
      var wait = q.filter(function (x) { return /รอ/.test(x.status || ''); }), no = q.filter(function (x) { return /ไม่อนุมัติ|ยกเลิก/.test(x.status || ''); });
      kpis([['ยอดที่อนุมัติ', baht(qOkVal), num(qOk.length) + ' ใบ'], ['สร้างในปีนี้', num(q.length), 'ใบ'], ['รอลูกค้าตอบ', num(wait.length), baht(wait.reduce(function (s, x) { return s + Number(x.grand || 0); }, 0))], ['ไม่อนุมัติ / ยกเลิก', num(no.length), 'ใบ']]);
      var qa = new Array(12).fill(0), qb = new Array(12).fill(0);
      q.forEach(function (x) { qa[mo(x.created_at)]++; }); qOk.forEach(function (x) { qb[mo(x.created_at)]++; });
      monthly('monthly', { name: 'สร้างใหม่', unit: 'ใบ', vals: qa }, { name: 'อนุมัติ', unit: 'ใบ', vals: qb });
      var qs = {}; q.forEach(function (x) { var k = x.status || 'ไม่ระบุ'; (qs[k] = qs[k] || [0, 0]); qs[k][0]++; qs[k][1] += Number(x.grand || 0); });
      hbars($('quotes'), Object.keys(qs).sort(function (a, b) { return qs[b][0] - qs[a][0]; }).map(function (k) { return [k, qs[k][0], 'มูลค่า ' + baht(qs[k][1])]; }));
    }

    if (PAGE === 'qc') {
      if (!qcY) { $('kpis').innerHTML = ''; noPerm($('qc'), 'QC'); noPerm($('monthly'), 'QC'); return; }
      kpis([['ตรวจในปีนี้', num(qcY.length), 'ใบ'], ['ผ่าน', num(qcPass.length), qcY.length ? Math.round(qcPass.length / qcY.length * 100) + '% ของทั้งหมด' : '-'], ['ไม่ผ่าน', num(qcFail.length), 'ใบ'], ['ยังไม่สรุปผล', num(qcY.length - qcPass.length - qcFail.length), 'ใบ']]);
      var pa = new Array(12).fill(0), fa = new Array(12).fill(0);
      qcPass.forEach(function (x) { pa[mo(x.qc_date || x.created_at)]++; }); qcFail.forEach(function (x) { fa[mo(x.qc_date || x.created_at)]++; });
      monthly('monthly', { name: 'ผ่าน', unit: 'ใบ', vals: pa }, { name: 'ไม่ผ่าน', unit: 'ใบ', vals: fa });
      var qq = {}; qcY.forEach(function (x) { var k = x.status || 'ไม่ระบุ'; qq[k] = (qq[k] || 0) + 1; });
      hbars($('qc'), topList(qq, 20));
    }
  }

  if ($('kpis')) $('kpis').innerHTML = new Array(+($('kpis').getAttribute('data-n') || 4)).fill('<div class="nx-card db-kpi" style="height:92px"></div>').join('');
  try { api = await window.NextShell.start({ title: 'Dashboard', moduleId: 'dashboard' }); }
  catch (e) { $('err').innerHTML = '<div class="nx-card" style="padding:14px 16px;color:var(--bad-fg);background:var(--bad-bg)">' + esc(e.message) + '</div>'; if ($('kpis')) $('kpis').innerHTML = ''; return; }

  var sb = api.sb, need = { quotes: PAGE === 'overview' || PAGE === 'quotes', qc: PAGE === 'overview' || PAGE === 'qc', cases: PAGE !== 'quotes' && PAGE !== 'qc' };
  var none = Promise.resolve({ data: [] });
  var r = await Promise.all([
    need.cases ? sb.from('service_cases').select('id,created_at,updated_at,stage,status,service_type,assignee,stage_log,deleted_at').is('deleted_at', null) : none,
    need.quotes ? sb.from('quotations').select('id,grand,status,created_at,deleted_at').is('deleted_at', null) : none,
    need.qc ? sb.from('qc_records').select('id,status,qc_date,created_at,deleted_at').is('deleted_at', null) : none,
    (PAGE === 'team' || PAGE === 'overview') && C.loadTechs ? C.loadTechs(sb) : Promise.resolve({})
  ]);
  if (r[0].error) { $('err').textContent = 'โหลดเคสไม่ได้: ' + r[0].error.message; return; }
  data.cases = r[0].data || []; data.quotes = r[1].error ? null : (r[1].data || []); data.qc = r[2].error ? null : (r[2].data || []);
  var tm = r[3] || {}; data.techs = Array.isArray(tm) ? tm.reduce(function (o, t) { o[t.id] = t.name; return o; }, {}) : tm;

  var now = new Date().getFullYear(), years = {}; years[now] = 1;
  data.cases.concat(data.quotes || [], data.qc || []).forEach(function (c) { var y = yr(c.qc_date || c.created_at); if (y) years[y] = 1; });
  yearSel.innerHTML = Object.keys(years).sort().reverse().map(function (y) { return '<option value="' + y + '">ปี ' + (+y + 543) + '</option>'; }).join('');
  try { var saved = sessionStorage.getItem('imode.dash.year'); if (saved && years[saved]) yearSel.value = saved; } catch (e) {}
  yearSel.addEventListener('change', function () { try { sessionStorage.setItem('imode.dash.year', yearSel.value); } catch (e) {} render(); });
  var tb = $('tblBtn');
  if (tb) tb.addEventListener('click', function () {
    var t = $('monthlyTbl'), open = t.hidden; t.hidden = !open; this.setAttribute('aria-expanded', String(open)); this.textContent = open ? 'ซ่อนตาราง' : 'ดูเป็นตาราง';
  });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { Object.keys(charts).forEach(function (id) { monthly(id, charts[id][0], charts[id][1]); }); }, 150); });
  render();
})();
