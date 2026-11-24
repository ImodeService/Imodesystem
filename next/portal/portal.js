/* I-MODE System (ระบบใหม่) · หน้าลูกค้าหลังสแกน QR (2026-11-25)
   ไม่ต้องล็อกอิน · ทุกอย่างผ่าน RPC ที่ฐานข้อมูลคุมเอง (ใช้ตัวเดิมของระบบเก่า ไม่ต้องรัน SQL เพิ่ม)
     portal_open(token) / portal_find(serial)   อ่านข้อมูลของเครื่องเดียว
     portal_submit(token, table, row)           แจ้งปัญหา (คำขอ + เคส) / ขอใบเสนอราคา / ขอประกัน
     portal_settings_patch(token, patch)        ลายเซ็นใบเสนอราคา / เปิดอ่านแล้ว / รีวิว
     portal_quote_status(token, quoteId)        ใบที่ลูกค้าเซ็นแล้ว → อนุมัติ
   ลิงก์เดิมบนฉลาก (modules/service/?machineToken=...#/customer-portal) ถูกส่งต่อมาหน้านี้ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MA = window.MaCommon || {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { n = Number(n) || 0; return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function day(v) { if (!v) return '-'; var d = new Date(String(v).length <= 10 ? v + 'T00:00:00' : v); return isNaN(d) ? String(v) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function dayTime(v) { if (!v) return '-'; var d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function uid() { try { return crypto.randomUUID(); } catch (e) { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }
  function nowIso() { return new Date().toISOString(); }

  var cfg = window.IMODE_CONFIG || {};
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'imode-portal' } });
  function rpc(fn, args) { return sb.rpc(fn, args).then(function (r) { if (r.error) throw r.error; return r.data; }); }

  var S = { token: '', snap: null };
  function set() { return (S.snap && S.snap.settings) || {}; }
  function mach() { return (S.snap && S.snap.machine) || {}; }

  /* ---------- theme ---------- */
  var SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function paintTheme() { $('theme').innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? SUN : MOON; }
  $('theme').onclick = function () {
    var d = document.documentElement.getAttribute('data-theme') !== 'dark';
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    try { localStorage.setItem('imode.theme', d ? 'flat-dark' : 'flat-light'); localStorage.setItem('imode.theme.at', String(Date.now())); } catch (e) {}
    paintTheme();
  };
  paintTheme();

  /* ---------- toast / sheet ---------- */
  var tt;
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove('on'); }, 2600); }
  var lastFocus = null;
  function sheet(title, html, mount) {
    lastFocus = document.activeElement;
    $('sheetT').textContent = title; $('sheetB').innerHTML = html; $('sheet').hidden = false;
    document.body.classList.add('pt-lock');
    if (mount) mount($('sheetB'));
    var f = $('sheet').querySelector('.pt-x'); if (f) f.focus();
  }
  function closeSheet() { $('sheet').hidden = true; $('sheetB').innerHTML = ''; document.body.classList.remove('pt-lock'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  $('sheet').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  /* ---------- อ่านที่อยู่ ---------- */
  function readParams() {
    var q = new URLSearchParams(location.search), h = location.hash.replace(/^#\/?/, '');
    var st = q.get('liff.state'); // เปิดผ่าน LIFF: ?liff.state=%3FmachineToken%3D...
    if (st) { try { var q2 = new URLSearchParams(st.replace(/^[^?]*\?/, '')); q2.forEach(function (v, k) { if (!q.get(k)) q.set(k, v); }); } catch (e) {} }
    var hq = h.indexOf('?') >= 0 ? new URLSearchParams(h.slice(h.indexOf('?') + 1)) : null;
    return { token: q.get('machineToken') || q.get('t') || (hq && hq.get('machineToken')) || '', serial: q.get('serial') || q.get('sn') || '' };
  }

  /* ---------- เปิดเครื่อง ---------- */
  async function open(token, quiet) {
    var r = await rpc('portal_open', { p_token: token });
    if (!r || !r.ok || !r.snapshot) throw new Error('not_found');
    S.token = r.token || token; S.snap = r.snapshot;
    try { history.replaceState(null, '', location.pathname + '?machineToken=' + encodeURIComponent(S.token)); } catch (e) {}
    if (!quiet) window.scrollTo(0, 0);
    renderHome();
  }
  async function boot() {
    var p = readParams();
    try {
      if (p.token) { await open(p.token); return; }
      if (p.serial) { await find(p.serial); return; }
      renderFind();
    } catch (e) { renderFind(e && e.message === 'not_found' ? 'ไม่พบเครื่องจาก QR นี้ ลองค้นด้วยหมายเลขเครื่อง (S/N) ด้านล่าง' : 'เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง'); }
  }

  /* ---------- ค้นด้วย S/N ---------- */
  function renderFind(msg, hits) {
    $('app').innerHTML = '<section class="pt-find nx-card"><h1>ค้นหาเครื่องของท่าน</h1>' +
      '<p class="pt-mut">สแกน QR ที่ติดบนเครื่อง หรือพิมพ์หมายเลขเครื่อง (S/N) ที่อยู่บนป้ายเครื่อง</p>' +
      (msg ? '<div class="nx-err">' + esc(msg) + '</div>' : '') +
      '<form id="fF" class="pt-findf"><label class="pt-lab" for="fS">หมายเลขเครื่อง (S/N)</label><div class="pt-row"><input id="fS" class="pt-in" autocomplete="off" autocapitalize="characters" placeholder="เช่น IM-2410-0012" required><button class="nx-btn primary" type="submit">ค้นหา</button></div></form>' +
      (hits ? '<div class="pt-hits">' + hits.map(function (h, i) {
        var m = h.snapshot.machine || {}, c = h.snapshot.customer || {};
        return '<button type="button" class="pt-hit" data-i="' + i + '"><b>' + esc(MA.nameTh ? MA.nameTh(m) : m.name) + '</b><span>' + esc(m.model || '') + ' · S/N ' + esc(MA.sn ? MA.sn(m) : m.serial) + '</span><span class="pt-mut">' + esc(c.name || '') + '</span></button>';
      }).join('') + '</div>' : '') + '</section>';
    $('fF').onsubmit = function (e) { e.preventDefault(); find($('fS').value); };
    if (hits) $('app').querySelectorAll('.pt-hit').forEach(function (b) {
      b.onclick = function () { var h = hits[+b.dataset.i]; S.token = h.token; S.snap = h.snapshot; history.replaceState(null, '', location.pathname + '?machineToken=' + encodeURIComponent(h.token)); renderHome(); };
    });
  }
  async function find(serial) {
    serial = String(serial || '').trim();
    if (!serial) return renderFind();
    var hits = [];
    try { var r = await rpc('portal_find', { p_serial: serial }); hits = (r && r.ok && r.hits) || []; }
    catch (e) { return renderFind('ค้นหาไม่ได้ในตอนนี้ (ค้นบ่อยเกินไปหรือเน็ตหลุด) กรุณาลองใหม่ภายหลัง'); }
    if (hits.length === 1) { S.token = hits[0].token; S.snap = hits[0].snapshot; history.replaceState(null, '', location.pathname + '?machineToken=' + encodeURIComponent(S.token)); return renderHome(); }
    renderFind(hits.length ? '' : 'ไม่พบหมายเลข "' + serial + '" กรุณาตรวจตัวอักษรอีกครั้ง หรือติดต่อทีม Service', hits.length ? hits : null);
    if ($('fS')) $('fS').value = serial;
  }

  /* ---------- ข้อมูลที่ใช้หลายที่ ---------- */
  var STEPS = [
    { id: 'received', name: 'รับเรื่องแล้ว' }, { id: 'inspect', name: 'ตรวจเช็ค' }, { id: 'quote', name: 'เสนอราคา' },
    { id: 'repair', name: 'กำลังซ่อม' }, { id: 'return', name: 'ส่งคืนเครื่อง' }, { id: 'closed', name: 'เสร็จสิ้น' }
  ];
  var FROM_OLD = { 'เคสใหม่': 'received', 'นัดหมายแล้ว': 'inspect', 'กำลังดำเนินการ': 'repair', 'รออะไหล่': 'repair', 'เสร็จสิ้น': 'return', 'ปิดเคส': 'closed' };
  function stageOf(c) { var s = c.stage || FROM_OLD[c.status] || 'received'; return s === 'transport' ? 'repair' : s; }
  function stepIdx(c) { var s = stageOf(c); if (s === 'hold') s = c.stage_before_hold === 'transport' ? 'repair' : (c.stage_before_hold || 'quote'); for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === s) return i; return 0; }
  function isOpen(c) { var s = stageOf(c); return s !== 'closed' && s !== 'return' && !c.deleted_at; }
  function cases() { return ((S.snap && S.snap.cases) || []).filter(function (c) { return !c.deleted_at; }).sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }); }
  function quotes() { return ((S.snap && S.snap.quotations) || []).filter(function (q) { return !q.deleted_at; }).sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }); }
  function warranty() {
    var w = ((S.snap && S.snap.warranties) || []).slice().sort(function (a, b) { return String(b.end_date || '').localeCompare(String(a.end_date || '')); })[0] || null;
    var today = new Date().toISOString().slice(0, 10);
    if (w && w.end_date) return { w: w, active: w.end_date >= today, text: (w.end_date >= today ? 'อยู่ในประกันถึง ' : 'หมดประกันเมื่อ ') + day(w.end_date) };
    var t = mach().warranty || '';
    return { w: null, active: t === 'อยู่ในประกัน', text: t || 'ไม่ทราบสถานะประกัน' };
  }
  function approvalOf(q) { var a = (set().quoteApprovals || {})[q.id]; if (!a) return null; var c = Date.parse(q.created_at || ''), t = Date.parse(a.at || ''); return (!isFinite(c) || !isFinite(t) || t >= c) ? a : null; }
  function canSign(q) { return (q.status === 'ส่งแล้ว' || q.status === 'รออนุมัติ') && !approvalOf(q); }
  var QTYPE = { OS: 'Service หน้างาน', WS: 'Service ที่บริษัท', DG: 'ตรวจเช็ค/วิเคราะห์อาการ', SP: 'อะไหล่', WP: 'ต่อประกัน' };
  function qType(q) { return q.warranty_mode === 'extend' ? 'ต่อประกัน' : (QTYPE[q.service] || 'ใบเสนอราคา'); }
  function qBadge(q) {
    if (approvalOf(q) || q.status === 'อนุมัติ') return '<span class="nx-badge ok">ท่านยืนยันแล้ว</span>';
    if (q.status === 'ไม่อนุมัติ' || q.status === 'ยกเลิก') return '<span class="nx-badge bad">' + esc(q.status) + '</span>';
    if (canSign(q)) return '<span class="nx-badge hold">รอท่านยืนยัน</span>';
    return '<span class="nx-badge">' + esc(q.status || '-') + '</span>';
  }
  /* จุดแจ้งของใหม่ (เก็บในเครื่องลูกค้า) */
  function seenKey() { return 'imode.portal.seen.' + (mach().id || ''); }
  function seen() { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}') || {}; } catch (e) { return {}; } }
  function markSeen(kind, id, v) { var s = seen(); s[kind] = s[kind] || {}; s[kind][id] = v || 1; try { localStorage.setItem(seenKey(), JSON.stringify(s)); } catch (e) {} }
  function isNewQ(q) { var s = seen(); return !(s.q && s.q[q.id]) && !((set().quoteViews || {})[q.id]); }
  function isNewC(c) { var s = seen(); return !!(s.c && s.c[c.id]) && s.c[c.id] !== (c.updated_at || c.created_at); }

  /* ---------- หน้าเครื่อง ---------- */
  function renderHome() {
    var m = mach(), cu = (S.snap && S.snap.customer) || {}, w = warranty(), pic = MA.photo ? MA.photo(m) : '';
    var cs = cases(), qs = quotes(), act = cs.filter(isOpen), toSign = qs.filter(canSign);
    var news = (set().portalNews || []); if (!Array.isArray(news)) news = [];
    var h = '';
    h += '<section class="pt-hero nx-card">' +
      '<div class="pt-pic' + (pic ? '' : ' none') + '">' + (pic ? '<img src="' + esc(pic) + '" alt="">' : '<span>ไม่มีรูปเครื่อง</span>') + '</div>' +
      '<div class="pt-hero-t"><h1>' + esc(MA.nameTh ? MA.nameTh(m) : m.name) + '</h1>' +
      (MA.nameEn && MA.nameEn(m) ? '<p class="pt-mut">' + esc(MA.nameEn(m)) + '</p>' : '') +
      '<dl class="pt-kv"><div><dt>รุ่น</dt><dd>' + esc(m.model || '-') + '</dd></div><div><dt>S/N</dt><dd>' + esc((MA.sn ? MA.sn(m) : m.serial) || '-') + '</dd></div>' +
      '<div><dt>ลูกค้า</dt><dd>' + esc(cu.name || '-') + (cu.branch ? ' · ' + esc(cu.branch) : '') + '</dd></div></dl>' +
      '<button type="button" class="pt-war ' + (w.active ? 'ok' : 'off') + '" id="bWar"><span class="dot"></span>' + esc(w.text) + '<span class="go">›</span></button></div></section>';
    if (toSign.length) h += '<button type="button" class="pt-alert" data-q="' + esc(toSign[0].id) + '"><b>มีใบเสนอราคารอท่านยืนยัน ' + toSign.length + ' ใบ</b><span>แตะเพื่อดูรายละเอียดและเซ็นยืนยัน ›</span></button>';
    act.forEach(function (c) { h += caseCard(c, true); });
    h += '<section class="pt-acts" aria-label="บริการ">' +
      act_('bIssue', 'แจ้งปัญหา / ขอช่าง', 'เครื่องมีอาการผิดปกติ', '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>') +
      act_('bQuote', 'ขอใบเสนอราคา', 'Service / ตรวจเช็ค', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>') +
      act_('bWar2', 'ประกันเครื่อง', 'เช็ค / ต่อประกัน', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>') +
      act_('bLine', 'ติดต่อทีม Service', 'LINE / โทร', '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/>') +
      '</section>';
    news = news.filter(function (n) { return n && (n.title || n.text) && n.active !== false; }).slice(0, 3);
    if (news.length) h += '<section class="pt-sec"><h2>ข่าวจาก I-MODE</h2>' + news.map(function (n) { return '<article class="pt-news nx-card"><b>' + esc(n.title || '') + '</b>' + (n.text ? '<p>' + esc(n.text) + '</p>' : '') + (n.url && /^https:\/\//.test(n.url) ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">อ่านต่อ ›</a>' : '') + '</article>'; }).join('') + '</section>';
    h += '<section class="pt-sec"><h2>ใบเสนอราคา</h2>' + (qs.length ? '<div class="pt-list nx-card">' + qs.map(function (q) {
      return '<button type="button" class="pt-li" data-q="' + esc(q.id) + '">' + (isNewQ(q) ? '<span class="pt-new" aria-label="ใหม่"></span>' : '') +
        '<span class="t"><b>' + esc(q.id) + '</b><small>' + esc(qType(q)) + ' · ' + day(q.created_at) + '</small></span><span class="r"><b>฿' + money(q.grand) + '</b>' + qBadge(q) + '</span></button>';
    }).join('') + '</div>' : '<p class="pt-none">ยังไม่มีใบเสนอราคา</p>') + '</section>';
    var past = cs.filter(function (c) { return !isOpen(c); });
    h += '<section class="pt-sec"><h2>ประวัติงานบริการ</h2>' + (past.length ? '<div class="pt-list nx-card">' + past.map(function (c) {
      return '<button type="button" class="pt-li" data-c="' + esc(c.id) + '"><span class="t"><b>' + esc(c.ticket || '-') + '</b><small>' + day(c.created_at) + ' · ' + esc(String(c.issue || '').split('\n')[0].slice(0, 60)) + '</small></span><span class="r"><span class="nx-badge ok">' + (stageOf(c) === 'return' ? 'ส่งคืนแล้ว' : 'เสร็จสิ้น') + '</span></span></button>';
    }).join('') + '</div>' : '<p class="pt-none">ยังไม่มีประวัติงาน</p>') + '</section>';
    var docs = (S.snap.documents || []);
    if (docs.length) h += '<section class="pt-sec"><h2>เอกสารเครื่อง</h2><div class="pt-list nx-card">' + docs.map(function (d, i) {
      return '<button type="button" class="pt-li" data-d="' + i + '"><span class="t"><b>' + esc(d.title || d.file_name || 'เอกสาร') + '</b><small>' + esc([d.category, d.version, d.doc_date && day(d.doc_date)].filter(Boolean).join(' · ')) + '</small></span><span class="r pt-mut">เปิด ›</span></button>';
    }).join('') + '</div></section>';
    h += '<footer class="pt-foot">' + esc(set().companyNameTh || set().companyName || 'I-MODE Plus') + (set().companyPhone ? ' · โทร <a href="tel:' + esc(String(set().companyPhone).replace(/[^0-9+]/g, '')) + '">' + esc(set().companyPhone) + '</a>' : '') + '<br><button type="button" class="pt-lnk" id="bOther">ดูเครื่องอื่น (ค้นด้วย S/N)</button></footer>';
    $('app').innerHTML = h;
    $('bIssue').onclick = issueForm; $('bQuote').onclick = quoteReqForm; $('bWar').onclick = $('bWar2').onclick = warrantySheet; $('bLine').onclick = contactSheet;
    $('bOther').onclick = function () { history.replaceState(null, '', location.pathname); renderFind(); };
    $('app').querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { quoteSheet(b.dataset.q); }; });
    $('app').querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { caseSheet(b.dataset.c); }; });
    $('app').querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { openDoc(docs[+b.dataset.d]); }; });
    cs.forEach(function (c) { if (!(seen().c || {})[c.id]) markSeen('c', c.id, c.updated_at || c.created_at); });
    poll();
  }
  function act_(id, t, s, path) { return '<button type="button" class="pt-act nx-card" id="' + id + '"><span class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg></span><b>' + t + '</b><small>' + s + '</small></button>'; }
  function caseCard(c) {
    var i = stepIdx(c), hold = stageOf(c) === 'hold';
    return '<button type="button" class="pt-case nx-card" data-c="' + esc(c.id) + '">' + (isNewC(c) ? '<span class="pt-new" aria-label="มีความคืบหน้าใหม่"></span>' : '') +
      '<span class="pt-case-h"><b>งานที่กำลังดำเนินการ</b><span class="pt-mut">' + esc(c.ticket || '') + '</span></span>' +
      '<span class="pt-case-s">' + (hold ? 'รอท่านตัดสินใจ' : esc(STEPS[i].name)) + '</span>' +
      '<span class="pt-bar" style="--p:' + Math.round((i + 1) / STEPS.length * 100) + '%"><i></i></span>' +
      '<span class="pt-case-f"><span>' + esc(String(c.issue || '').split('\n')[0].slice(0, 70)) + '</span><span class="go">ดูความคืบหน้า ›</span></span></button>';
  }

  /* ---------- รายละเอียดเคส ---------- */
  function techNames(c) {
    var t = (S.snap.technicians || []), ids = String(c.assignee || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return ids.map(function (id) { var x = t.filter(function (y) { return y.id === id; })[0]; return x ? x.name : ''; }).filter(Boolean).join(', ');
  }
  var FACES = [{ v: 1, i: '😞', t: 'ไม่พอใจมาก' }, { v: 2, i: '🙁', t: 'ไม่พอใจ' }, { v: 3, i: '😐', t: 'พอใช้' }, { v: 4, i: '🙂', t: 'พอใจ' }, { v: 5, i: '😍', t: 'พอใจมาก' }];
  function caseSheet(id) {
    var c = cases().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    markSeen('c', c.id, c.updated_at || c.created_at);
    var i = stepIdx(c), hold = stageOf(c) === 'hold', done = !isOpen(c);
    var reps = (S.snap.reports || []).filter(function (r) { return r.case_id === c.id; });
    var tn = techNames(c);
    var h = '<dl class="pt-kv pt-kv2"><div><dt>เลขงาน</dt><dd>' + esc(c.ticket || '-') + '</dd></div><div><dt>แจ้งเมื่อ</dt><dd>' + dayTime(c.created_at) + '</dd></div>' +
      (c.appointment ? '<div><dt>นัดหมาย</dt><dd>' + dayTime(c.appointment) + '</dd></div>' : '') + (tn ? '<div><dt>ช่าง</dt><dd>' + esc(tn) + '</dd></div>' : '') + '</dl>' +
      '<p class="pt-issue">' + esc(c.issue || '') + '</p>' +
      (hold ? '<div class="pt-hold">งานนี้รอท่านตัดสินใจ (เช่น ยืนยันใบเสนอราคา) หากมีคำถามกด "ติดต่อทีม Service"</div>' : '') +
      '<ol class="pt-steps">' + STEPS.map(function (s, k) { return '<li class="' + (k < i || done ? 'done' : k === i ? 'now' : '') + '"><span class="b"></span><span>' + esc(s.name) + '</span></li>'; }).join('') + '</ol>';
    reps.forEach(function (r) {
      var parts = Array.isArray(r.parts) ? r.parts.map(function (p) { return p && (p.name || p.part) ? (p.name || p.part) + (p.qty ? ' ×' + p.qty : '') : ''; }).filter(Boolean) : [];
      h += '<section class="pt-rep"><h3>รายงานช่าง ' + esc(r.report_no || '') + ' <small>' + day(r.created_at) + '</small></h3>' +
        (r.diagnosis ? '<p><b>ตรวจพบ</b> ' + esc(r.diagnosis) + '</p>' : '') + (r.work_performed ? '<p><b>งานที่ทำ</b> ' + esc(r.work_performed) + '</p>' : '') +
        (parts.length ? '<p><b>อะไหล่</b> ' + esc(parts.join(', ')) + '</p>' : '') + (r.recommendation ? '<p><b>คำแนะนำ</b> ' + esc(r.recommendation) + '</p>' : '') +
        (r.next_pm ? '<p><b>PM ครั้งถัดไป</b> ' + day(r.next_pm) + '</p>' : '') + '</section>';
    });
    if (done) {
      var fb = (set().caseFeedback || {})[c.id] || null, val = fb && Number(fb.rating) || 0;
      h += '<section class="pt-fb"><h3>' + (fb ? 'รีวิวของท่าน (แก้ไขได้)' : 'ให้คะแนนงานบริการนี้') + '</h3><div class="pt-faces" role="radiogroup" aria-label="ความพอใจ">' +
        FACES.map(function (f) { return '<button type="button" role="radio" aria-checked="' + (f.v === val) + '" data-v="' + f.v + '" title="' + f.t + '"><span>' + f.i + '</span><small>' + f.t + '</small></button>'; }).join('') +
        '</div><textarea id="fbC" class="pt-in" rows="2" maxlength="500" placeholder="ความคิดเห็นเพิ่มเติม (ถ้ามี)">' + esc(fb && fb.comment || '') + '</textarea><button type="button" class="nx-btn primary pt-full" id="fbS">ส่งรีวิว</button></section>';
    }
    sheet('งาน ' + (c.ticket || ''), h, function (b) {
      if (!done) return;
      var pick = val;
      b.querySelectorAll('.pt-faces button').forEach(function (x) { x.onclick = function () { pick = +x.dataset.v; b.querySelectorAll('.pt-faces button').forEach(function (y) { y.setAttribute('aria-checked', String(y === x)); }); }; });
      $('fbS').onclick = async function () {
        if (!pick) { toast('กรุณาเลือกระดับความพอใจ'); return; }
        var old = (set().caseFeedback || {})[c.id] || null, now = nowIso(), cm = $('fbC').value.trim();
        var hist = (old && Array.isArray(old.history) ? old.history.slice() : []);
        if (old) hist.unshift({ rating: old.rating, comment: old.comment || '', at: old.at, by: old.by || '' });
        var rec = Object.assign({}, old || {}, { rating: pick, comment: cm, at: now, by: 'ลูกค้า (หน้าลูกค้า)', customerEditedAt: now, history: hist.slice(0, 5) });
        this.disabled = true;
        try { var p = {}; p[c.id] = rec; await rpc('portal_settings_patch', { p_token: S.token, p_patch: { caseFeedback: p } }); set().caseFeedback = set().caseFeedback || {}; set().caseFeedback[c.id] = rec; closeSheet(); toast('ขอบคุณสำหรับรีวิว'); }
        catch (e) { this.disabled = false; toast('ส่งไม่สำเร็จ กรุณาลองใหม่'); }
      };
    });
  }

  /* ---------- ใบเสนอราคา ---------- */
  function quoteSheet(id) {
    var q = quotes().filter(function (x) { return x.id === id; })[0]; if (!q) return;
    markSeen('q', q.id);
    if (!(set().quoteViews || {})[q.id]) { var v = {}; v[q.id] = { at: nowIso() }; rpc('portal_settings_patch', { p_token: S.token, p_patch: { quoteViews: v } }).then(function () { set().quoteViews = set().quoteViews || {}; set().quoteViews[q.id] = v[q.id]; }).catch(function () {}); }
    var parts = Array.isArray(q.parts) ? q.parts : [], a = approvalOf(q);
    var sub = Number(q.subtotal) || 0, vat = Number(q.vat) || 0, disc = Number(q.discount_pct) || 0;
    var h = '<div class="pt-qh"><div><b>' + esc(qType(q)) + '</b><small>ออกเมื่อ ' + day(q.created_at) + (q.case_ticket ? ' · งาน ' + esc(q.case_ticket) : '') + '</small></div>' + qBadge(q) + '</div>';
    if (parts.length) h += '<table class="pt-tbl"><thead><tr><th>รายการอะไหล่</th><th>ราคา</th></tr></thead><tbody>' + parts.map(function (p) { return '<tr><td>' + esc(p.name || 'อะไหล่') + '</td><td>' + money(p.cost) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<dl class="pt-sum">' + (sub ? '<div><dt>รวมก่อนภาษี</dt><dd>' + money(sub) + '</dd></div>' : '') + (disc ? '<div><dt>ส่วนลด</dt><dd>' + disc + '%</dd></div>' : '') + (vat ? '<div><dt>VAT 7%</dt><dd>' + money(vat) + '</dd></div>' : '') +
      '<div class="g"><dt>ยอดรวมทั้งสิ้น</dt><dd>฿' + money(q.grand) + '</dd></div></dl>';
    if (q.payment || q.delivery) h += '<p class="pt-mut pt-small">' + esc([q.payment && 'ชำระเงิน: ' + q.payment, q.delivery && 'หมายเหตุ: ' + q.delivery].filter(Boolean).join(' · ')) + '</p>';
    if (a) h += '<section class="pt-signed"><b>ท่านเซ็นยืนยันแล้ว</b>' + (a.sig ? '<img src="' + esc(a.sig) + '" alt="ลายเซ็น">' : '') + '<span>' + esc(a.name || '') + ' · ' + dayTime(a.at) + '</span></section>';
    else if (canSign(q)) h += '<section class="pt-sign"><h3>ยืนยันใบเสนอราคา</h3><label class="pt-lab" for="sgN">ชื่อผู้ยืนยัน</label><input id="sgN" class="pt-in" maxlength="80" autocomplete="name">' +
      '<label class="pt-lab">ลายเซ็น <button type="button" class="pt-lnk" id="sgClr">ล้าง</button></label><canvas id="sgC" class="pt-pad" aria-label="ช่องเซ็นชื่อ"></canvas>' +
      '<button type="button" class="nx-btn approve pt-full" id="sgOk">เซ็นยืนยันใบเสนอราคา</button><p class="pt-mut pt-small">เมื่อยืนยันแล้ว ทีมงานจะติดต่อกลับเพื่อนัดหมาย</p></section>';
    sheet('ใบเสนอราคา ' + q.id, h, function () {
      if (!$('sgC')) return;
      var pad = signPad($('sgC'));
      $('sgClr').onclick = pad.clear;
      $('sgOk').onclick = async function () {
        var name = $('sgN').value.trim();
        if (!name) { toast('กรุณาใส่ชื่อผู้ยืนยัน'); $('sgN').focus(); return; }
        if (pad.empty()) { toast('กรุณาเซ็นชื่อในช่อง'); return; }
        var rec = { sig: pad.data(), name: name, at: nowIso() }, p = {}; p[q.id] = rec;
        this.disabled = true;
        try {
          var r = await rpc('portal_settings_patch', { p_token: S.token, p_patch: { quoteApprovals: p } });
          if (!r || !r.ok || !r.applied) throw new Error('not_applied');
          await rpc('portal_quote_status', { p_token: S.token, p_quote_id: q.id }).catch(function () {});
          set().quoteApprovals = set().quoteApprovals || {}; set().quoteApprovals[q.id] = Object.assign(rec, { by: 'customer' });
          closeSheet(); toast('ยืนยันใบเสนอราคาแล้ว ขอบคุณครับ'); refresh();
        } catch (e) { this.disabled = false; toast('ยืนยันไม่สำเร็จ (ใบนี้อาจถูกยืนยันไปแล้ว) กรุณารีเฟรช'); }
      };
    });
  }
  function signPad(cv) {
    var r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight, ctx, drawn = false, last = null;
    cv.width = w * r; cv.height = h * r; ctx = cv.getContext('2d'); ctx.scale(r, r);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10204a';
    function pt(e) { var b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); last = pt(e); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) { if (!last) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; e.preventDefault(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { last = null; }); });
    return {
      clear: function () { ctx.clearRect(0, 0, w, h); drawn = false; },
      empty: function () { return !drawn; },
      data: function () { // ลายเซ็นพื้นขาว ย่อขนาด (ไปอยู่บนใบพิมพ์)
        var o = document.createElement('canvas'), s = Math.min(1, 600 / cv.width); o.width = cv.width * s; o.height = cv.height * s;
        var x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(cv, 0, 0, o.width, o.height);
        return o.toDataURL('image/png');
      }
    };
  }

  /* ---------- แบบฟอร์มส่งเรื่อง ---------- */
  function contactFields() {
    var mem = {}; try { mem = JSON.parse(localStorage.getItem('imode.portal.contact') || '{}') || {}; } catch (e) {}
    return '<div class="pt-2"><div><label class="pt-lab" for="ctN">ชื่อผู้ติดต่อ *</label><input id="ctN" class="pt-in" maxlength="100" autocomplete="name" value="' + esc(mem.n || '') + '" required></div>' +
      '<div><label class="pt-lab" for="ctP">เบอร์โทร *</label><input id="ctP" class="pt-in" maxlength="30" type="tel" autocomplete="tel" inputmode="tel" value="' + esc(mem.p || '') + '" required></div></div>';
  }
  function readContact() {
    var n = $('ctN').value.trim(), p = $('ctP').value.trim();
    if (!n) { toast('กรุณาใส่ชื่อผู้ติดต่อ'); $('ctN').focus(); return null; }
    if (!/[0-9]{6,}/.test(p.replace(/[^0-9]/g, ''))) { toast('กรุณาใส่เบอร์โทรที่ติดต่อได้'); $('ctP').focus(); return null; }
    try { localStorage.setItem('imode.portal.contact', JSON.stringify({ n: n, p: p })); } catch (e) {}
    return { contact: n, phone: p };
  }
  function chips(name, list, val) { return '<div class="pt-chips" role="radiogroup">' + list.map(function (x) { return '<button type="button" role="radio" data-' + name + '="' + esc(x[0]) + '" aria-checked="' + (x[0] === val) + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>'; }
  function wireChips(b, name, cb) { b.querySelectorAll('[data-' + name + ']').forEach(function (x) { x.onclick = function () { b.querySelectorAll('[data-' + name + ']').forEach(function (y) { y.setAttribute('aria-checked', String(y === x)); }); cb(x.getAttribute('data-' + name)); }; }); }
  function fallbackTicket() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return 'SRV-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-Q' + String(Math.floor(Math.random() * 900) + 100); }
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () { var s = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok({ data: c.toDataURL('image/jpeg', 0.72), name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg' }); };
        im.onerror = bad; im.src = fr.result;
      };
      fr.onerror = bad; fr.readAsDataURL(file);
    });
  }

  function issueForm() {
    var pri = 'ปกติ', pics = [];
    var h = '<p class="pt-mut">' + esc(MA.nameTh ? MA.nameTh(mach()) : '') + ' · S/N ' + esc(MA.sn ? MA.sn(mach()) : '') + '</p>' + contactFields() +
      '<label class="pt-lab" for="isT">อาการที่พบ *</label><textarea id="isT" class="pt-in" rows="4" maxlength="2000" placeholder="เช่น เครื่องเปิดไม่ติด, มีเสียงดังผิดปกติ, ขึ้น error ..."></textarea>' +
      '<span class="pt-lab">ความเร่งด่วน</span>' + chips('pr', [['ปกติ', 'ปกติ'], ['สูง', 'ค่อนข้างด่วน'], ['ด่วนมาก', 'ด่วนมาก (เครื่องหยุด)']], pri) +
      '<span class="pt-lab">รูปถ่าย (ไม่เกิน 4 รูป)</span><div class="pt-pics" id="isP"></div><label class="nx-btn pt-addpic">＋ เพิ่มรูป<input type="file" id="isF" accept="image/*" multiple hidden></label>' +
      '<button type="button" class="nx-btn primary pt-full" id="isOk">ส่งเรื่องแจ้งปัญหา</button>';
    sheet('แจ้งปัญหา / ขอช่าง', h, function (b) {
      wireChips(b, 'pr', function (v) { pri = v; });
      function drawPics() { $('isP').innerHTML = pics.map(function (p, i) { return '<figure><img src="' + p.data + '" alt=""><button type="button" data-rm="' + i + '" aria-label="ลบรูป">✕</button></figure>'; }).join(''); $('isP').querySelectorAll('[data-rm]').forEach(function (x) { x.onclick = function () { pics.splice(+x.dataset.rm, 1); drawPics(); }; }); }
      $('isF').onchange = async function () { var fs = Array.prototype.slice.call(this.files || []); this.value = ''; for (var i = 0; i < fs.length && pics.length < 4; i++) { try { pics.push(await shrink(fs[i])); } catch (e) {} } drawPics(); };
      $('isOk').onclick = async function () {
        var ct = readContact(); if (!ct) return;
        var issue = $('isT').value.trim(); if (!issue) { toast('กรุณาเล่าอาการที่พบ'); $('isT').focus(); return; }
        this.disabled = true; this.textContent = 'กำลังส่ง...';
        var now = nowIso(), caseId = uid(), ticket = fallbackTicket(), m = mach();
        try {
          var r1 = await rpc('portal_submit', { p_token: S.token, p_table: 'line_customer_requests', p_row: { id: uid(), type: 'service', case_id: caseId, contact: ct.contact, phone: ct.phone, priority: pri, message: issue, created_at: now, media: [] } });
          if (!r1 || !r1.ok) throw new Error(r1 && r1.reason || 'fail');
          var r2 = await rpc('portal_submit', { p_token: S.token, p_table: 'service_cases', p_row: { id: caseId, ticket: ticket, created_at: now, updated_at: now, contact: ct.contact, phone: ct.phone, warranty: m.warranty || '', service_type: 'เข้าบริการหน้างาน', priority: pri, issue: issue, note: 'รับแจ้งจาก Customer Portal / Machine QR', media: pics } });
          if (!r2 || !r2.ok) throw new Error(r2 && r2.reason || 'fail');
          if (r2.ticket) ticket = r2.ticket;
          closeSheet(); doneSheet('ส่งเรื่องแล้ว', 'เลขงานของท่าน <b>' + esc(ticket) + '</b><br>ทีม Service จะติดต่อกลับที่เบอร์ ' + esc(ct.phone) + ' โดยเร็ว');
          refresh();
        } catch (e) { this.disabled = false; this.textContent = 'ส่งเรื่องแจ้งปัญหา'; toast(e && e.message === 'media_too_large' ? 'รูปใหญ่เกินไป ลองลดจำนวนรูป' : 'ส่งไม่สำเร็จ กรุณาลองใหม่ หรือโทรหาทีม Service'); }
      };
    });
  }
  async function sendRequest(btn, row, okTitle, okText) {
    btn.disabled = true;
    try {
      var r = await rpc('portal_submit', { p_token: S.token, p_table: 'line_customer_requests', p_row: Object.assign({ id: uid(), created_at: nowIso(), media: [] }, row) });
      if (!r || !r.ok) throw new Error(r && r.reason || 'fail');
      closeSheet(); doneSheet(okTitle, okText);
    } catch (e) { btn.disabled = false; toast('ส่งไม่สำเร็จ กรุณาลองใหม่'); }
  }
  function quoteReqForm() {
    var mode = 'OS';
    var h = contactFields() + '<span class="pt-lab">ต้องการบริการแบบ</span>' + chips('md', [['OS', 'ช่างไปหน้างาน'], ['WS', 'ส่งเครื่องเข้าบริษัท'], ['DG', 'ตรวจเช็ค/วิเคราะห์อาการ']], mode) +
      '<label class="pt-lab" for="qrT">รายละเอียด</label><textarea id="qrT" class="pt-in" rows="3" maxlength="2000" placeholder="บอกงานที่ต้องการ หรืออาการของเครื่อง"></textarea>' +
      '<button type="button" class="nx-btn primary pt-full" id="qrOk">ขอใบเสนอราคา</button>';
    sheet('ขอใบเสนอราคา', h, function (b) {
      wireChips(b, 'md', function (v) { mode = v; });
      $('qrOk').onclick = function () {
        var ct = readContact(); if (!ct) return;
        var lab = { OS: 'ช่างไปหน้างาน', WS: 'ส่งเครื่องเข้าบริษัท', DG: 'ตรวจเช็ค/วิเคราะห์อาการ' }[mode];
        sendRequest(this, { type: 'service_quote', contact: ct.contact, phone: ct.phone, priority: 'ปกติ', message: '[' + mode + ' · ' + lab + '] ' + $('qrT').value.trim() }, 'ส่งคำขอแล้ว', 'ทีมงานจะจัดทำใบเสนอราคา และแจ้งกลับทาง LINE / โทรศัพท์<br>ใบเสนอราคาจะขึ้นในหน้านี้ด้วย');
      };
    });
  }
  function warrantySheet() {
    var w = warranty(), months = '12', wc = set().warrantyConfig || {};
    var h = '<div class="pt-wbox ' + (w.active ? 'ok' : 'off') + '"><b>' + esc(w.text) + '</b>' +
      (w.w ? '<small>เลขที่ ' + esc(w.w.warranty_no || '-') + (w.w.start_date ? ' · เริ่ม ' + day(w.w.start_date) : '') + (w.w.months ? ' · ' + w.w.months + ' เดือน' : '') + '</small>' + (w.w.coverage ? '<p>ครอบคลุม: ' + esc(w.w.coverage) + '</p>' : '') + (w.w.exclusions ? '<p class="pt-mut">ไม่ครอบคลุม: ' + esc(w.w.exclusions) + '</p>' : '') : '') + '</div>' +
      contactFields() + '<span class="pt-lab">ต้องการต่อประกัน</span>' + chips('mo', [['6', '6 เดือน'], ['12', '12 เดือน'], ['24', '24 เดือน']], months) +
      '<button type="button" class="nx-btn primary pt-full" id="wqOk">ขอใบเสนอราคาต่อประกัน</button><button type="button" class="nx-btn pt-full" id="wcOk">ขอให้ตรวจสอบสถานะประกัน</button>' +
      (wc.portalNote ? '<p class="pt-mut pt-small">' + esc(wc.portalNote) + '</p>' : '');
    sheet('ประกันเครื่อง', h, function (b) {
      wireChips(b, 'mo', function (v) { months = v; });
      $('wqOk').onclick = function () { var ct = readContact(); if (!ct) return; sendRequest(this, { type: 'warranty_quote', contact: ct.contact, phone: ct.phone, months: months, message: 'ขอใบเสนอราคาต่อประกัน ' + months + ' เดือน' }, 'ส่งคำขอแล้ว', 'ทีมงานจะส่งใบเสนอราคาต่อประกัน ' + months + ' เดือน มาให้ในหน้านี้'); };
      $('wcOk').onclick = function () { var ct = readContact(); if (!ct) return; sendRequest(this, { type: 'warranty_check', contact: ct.contact, phone: ct.phone, message: 'ขอให้ตรวจสอบสถานะประกัน (หน้าลูกค้าแสดง: ' + w.text + ')' }, 'ส่งคำขอแล้ว', 'ทีมงานจะตรวจสอบและแจ้งกลับ'); };
    });
  }
  function contactSheet() {
    var lc = set().lineConfig || {}, id = String(lc.officialAccountId || '@imodeservice').trim(); if (id.charAt(0) !== '@') id = '@' + id;
    var url = lc.addFriendUrl || ('https://line.me/R/ti/p/' + encodeURIComponent(id)), tel = String(set().companyPhone || '').replace(/[^0-9+]/g, '');
    sheet('ติดต่อทีม Service', '<a class="pt-big line" href="' + esc(url) + '" target="_blank" rel="noopener"><b>LINE ' + esc(id) + '</b><small>แชทกับทีม Service</small></a>' +
      (tel ? '<a class="pt-big" href="tel:' + esc(tel) + '"><b>โทร ' + esc(set().companyPhone) + '</b><small>เวลาทำการ</small></a>' : '') +
      '<p class="pt-mut pt-small">แจ้ง S/N ' + esc(MA.sn ? MA.sn(mach()) : '') + ' เพื่อให้ทีมงานหาข้อมูลเครื่องได้เร็วขึ้น</p>');
  }
  function doneSheet(t, html) { sheet(t, '<div class="pt-done"><span class="ok">✓</span><p>' + html + '</p><button type="button" class="nx-btn primary pt-full" data-close>กลับหน้าเครื่อง</button></div>'); }
  function openDoc(d) {
    if (!d) return;
    if (d.url && /^https:\/\//.test(d.url)) { window.open(d.url, '_blank', 'noopener'); return; }
    if (d.file_data && /^data:/.test(d.file_data)) {
      try { var p = d.file_data.split(','), mime = (p[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream', bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); window.open(URL.createObjectURL(new Blob([a], { type: mime })), '_blank'); } catch (e) { toast('เปิดเอกสารไม่ได้'); }
      return;
    }
    toast('เอกสารนี้ยังไม่มีไฟล์ กรุณาติดต่อทีม Service');
  }

  /* ---------- อัปเดตเอง (มีงานค้างอยู่) ---------- */
  var pt = null;
  function refresh() { if (!S.token) return; rpc('portal_open', { p_token: S.token }).then(function (r) { if (r && r.ok && r.snapshot) { S.snap = r.snapshot; if ($('sheet').hidden) renderHome(); else poll(); } }).catch(function () { poll(); }); }
  function poll() { clearTimeout(pt); if (cases().some(isOpen)) pt = setTimeout(function () { if (document.visibilityState === 'visible') refresh(); else poll(); }, 90000); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.snap && cases().some(isOpen)) refresh(); });

  boot();
})();
