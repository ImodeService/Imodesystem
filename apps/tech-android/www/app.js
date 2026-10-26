/* I-MODE แอพทีมช่าง (Android, Capacitor). Version 0.1.
   A light front end for the technician side of Service. It talks to the same Supabase project
   and the same rows as the web system, so whatever a technician does here shows on the web
   at once, and the other way round:
     - sign in: same accounts (username -> <username>@imode.local), staff with a technician_id only
     - งานของฉัน: service_cases where the technician is in the crew (assignee holds a comma list)
     - หน้างาน: field_status / field_status_log, written the way js/03 saveFieldStatus() writes them,
       plus one line in the case chat (case_messages) the way js/138 posts it
   Writes are an UPDATE of the few columns that change, never an upsert of the whole row, so
   nothing the office changed meanwhile is overwritten. */
(function () {
  'use strict';

  var C = window.IMODE_CONFIG || {};
  var VERSION = '0.2.2';      /* bump for every release; tools/make-version.js copies it into version.json */
  var NATIVE = 1;           /* the native (APK) features this bundle needs; see AppChromePlugin.NATIVE */
  var STEPS = ['กำลังเดินทาง', 'ถึงหน้างาน', 'เริ่มตรวจเช็ก', 'กำลัง PM / Maintenance', 'กำลังซ่อม Service', 'ทดสอบเครื่อง', 'รอลูกค้าตรวจรับ', 'จบงาน'];
  var HOLD = 'รออะไหล่';
  var TRAVEL = STEPS[0], ARRIVED = STEPS[1], DONE = STEPS[STEPS.length - 1];
  var CLOSED = ['เสร็จสิ้น', 'ปิดเคส'];
  var COLS = 'id,ticket,customer,contact,phone,location,branch,map_url,latitude,longitude,machine,model,serial,warranty,service_type,priority,issue,note,status,assignee,appointment,field_status,field_status_log,updated_at';

  var THEMES = [
    { id: 'light', name: 'เรียบ สว่าง', desc: 'มาตรฐาน พื้นสว่าง แถบบนกรมท่า', sw: '#f3f3f3', dot: '#0c225e', web: 'flat-light' },
    { id: 'dark', name: 'เรียบ มืด', desc: 'พื้นสีเข้ม ถนอมสายตาตอนกลางคืน', sw: '#1b1b1b', dot: '#e07a1f', web: 'flat-dark' },
    { id: 'auto', name: 'ตามระบบ', desc: 'สว่างหรือมืดตามที่ตั้งไว้ในมือถือ', sw: 'linear-gradient(90deg,#f3f3f3 50%,#1b1b1b 50%)', dot: '#b45300', web: 'auto' },
    { id: 'glass', name: 'กระจก (Glass)', desc: 'หน้าตาเดิมของ Service มีไล่สี', sw: '#eef3fc', dot: '#ff5b14', web: 'classic' },
    { id: 'gold', name: 'ราตรีสีทอง', desc: 'พื้นน้ำเงินเข้ม จุดเด่นสีทอง', sw: 'linear-gradient(135deg,#080e2e,#1a2a8a)', dot: '#ffc845', web: 'flat-dark' }
  ];

  var app = document.getElementById('app');
  var sb = null, me = null, jobs = [], filter = 'today', busy = false;

  /* ------------------------------------------------------------ helpers ---- */
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function hhmm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  var TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function thDate(d) { return 'วัน' + TH_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MON[d.getMonth()]; }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function apptDate(c) { var d = c.appointment ? new Date(c.appointment) : null; return d && !isNaN(d) ? d : null; }

  var I = {
    eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L20 12 L7 20 Z" fill="#fff"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    palette: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.7 4.7 0 0 0 21 9.6C21 5.9 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/></svg>',
    refresh: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    pin: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    nav: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
    phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    undo: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    arrow: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    jobs: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    send: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z"/></svg>',
    cam: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    out: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>'
  };

  var toastTimer = null;
  function toast(msg) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  /* ------------------------------------------------------------- theme ---- */
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function appTheme() { var t = lsGet('imode.appTheme'); return THEMES.some(function (x) { return x.id === t; }) ? t : 'auto'; }
  function paint() {
    var t = me ? appTheme() : 'auto';                /* before sign-in the phone decides */
    var mode = t === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-t', mode);
    bars();
  }
  /* status-bar icons: dark on a light top (the sign-in screen in a light theme), white over the
     coloured header everywhere else; navigation-bar icons follow the bottom of the screen */
  function bars() {
    var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppChrome;
    if (!P) return;
    var light = ['light', 'glass'].indexOf(document.documentElement.getAttribute('data-t')) >= 0;
    try { P.setBars({ statusDark: light && !me, navDark: light }); } catch (e) {}
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  function setTheme(id) {
    var at = new Date().toISOString();
    lsSet('imode.appTheme', id); lsSet('imode.appTheme.at', at);
    paint();
    var th = THEMES.filter(function (x) { return x.id === id; })[0];
    /* the account carries it, so the web follows (imode_theme is what shared/theme-pref.js reads) */
    if (sb && th) sb.auth.updateUser({ data: { imode_app_theme: id, imode_app_theme_at: at, imode_theme: th.web, imode_theme_at: at } }).catch(function () {});
  }
  function themeFromAccount(user) {
    var md = (user && user.user_metadata) || {};
    var mine = lsGet('imode.appTheme.at') || '';
    if (md.imode_app_theme && String(md.imode_app_theme_at || '') > mine) {
      lsSet('imode.appTheme', md.imode_app_theme); lsSet('imode.appTheme.at', md.imode_app_theme_at || '');
    }
  }
  function openThemeSheet() {
    var cur = appTheme();
    var html = '<div class="scrim" data-close><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="thT">' +
      '<span class="grab"></span><h2 id="thT">ธีมหน้าจอ</h2><p>ชุดเดียวกับระบบเว็บ เลือกในแอพแล้วเว็บก็เปลี่ยนตาม</p>' +
      '<div role="radiogroup" aria-labelledby="thT" style="display:flex;flex-direction:column;gap:6px">' +
      THEMES.map(function (t) {
        return '<button type="button" class="opt" role="radio" aria-checked="' + (t.id === cur) + '" data-theme="' + t.id + '">' +
          '<span class="sw" style="background:' + t.sw + '"><i style="background:' + t.dot + '"></i></span>' +
          '<span><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></span></button>';
      }).join('') + '</div></div></div>';
    var wrap = document.createElement('div'); wrap.innerHTML = html; var scrim = wrap.firstChild;
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme]');
      if (b) {
        setTheme(b.getAttribute('data-theme'));
        scrim.querySelectorAll('[data-theme]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
        return;
      }
      if (e.target === scrim) scrim.remove();
    });
  }

  /* ------------------------------------------------------------ dialogs ---- */
  function confirmSheet(title, text, okText) {
    return new Promise(function (resolve) {
      var w = document.createElement('div');
      w.innerHTML = '<div class="scrim"><div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="cfT"><span class="grab"></span>' +
        '<h2 id="cfT">' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="sheet-actions">' +
        '<button type="button" data-v="0">ยกเลิก</button><button type="button" class="primary" data-v="1">' + esc(okText) + '</button></div></div></div>';
      var s = w.firstChild; document.body.appendChild(s);
      s.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (b || e.target === s) { s.remove(); resolve(!!(b && b.getAttribute('data-v') === '1')); }
      });
    });
  }

  /* -------------------------------------------------------------- auth ---- */
  function client() {
    if (sb) return sb;
    var remember = lsGet('imode.remember') !== '0';
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: C.storageKey, storage: remember ? localStorage : sessionStorage }
    });
    return sb;
  }
  function friendly(err) {
    var m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    if (/rate limit|too many/i.test(m)) return 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่';
    if (/fetch|network|failed to/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    return m || 'เกิดข้อผิดพลาด';
  }
  async function loadMe(authUser) {
    var r = await client().from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (r.error) throw new Error('อ่านข้อมูลบัญชีไม่ได้: ' + friendly(r.error));
    var p = r.data;
    if (!p) throw new Error('บัญชีนี้ยังไม่ได้ตั้งค่าในระบบ ติดต่อผู้ดูแลระบบ');
    if (p.is_active === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ');
    if (!p.technician_id) throw new Error('แอพนี้สำหรับบัญชีช่าง บัญชีนี้ยังไม่ได้ผูกกับรายชื่อช่าง ติดต่อผู้ดูแลระบบ');
    themeFromAccount(authUser);
    return { id: authUser.id, techId: String(p.technician_id), name: p.full_name || p.username || '', username: p.username || String(authUser.email || '').split('@')[0], team: p.team || '', role: p.role || '' };
  }
  async function signIn(username, password, remember) {
    var u = String(username || '').trim();
    if (!u || !password) throw new Error('กรอกชื่อผู้ใช้และรหัสผ่าน');
    lsSet('imode.remember', remember ? '1' : '0');
    try { (remember ? sessionStorage : localStorage).removeItem(C.storageKey); } catch (e) {}
    sb = null;
    var r;
    try { r = await client().auth.signInWithPassword({ email: u.indexOf('@') >= 0 ? u : u + '@' + C.usernameDomain, password: password }); }
    catch (e) { throw new Error(friendly(e)); }
    if (r.error) throw new Error(friendly(r.error));
    try { me = await loadMe(r.data.user); }
    catch (e) { await client().auth.signOut().catch(function () {}); throw e; }
    lsSet('imode.lastUser', remember ? u : '');
  }
  async function signOut() {
    var ok = await confirmSheet('ออกจากระบบ?', 'ครั้งหน้าต้องกรอกรหัสผ่านใหม่', 'ออกจากระบบ');
    if (!ok) return;
    try { await client().auth.signOut(); } catch (e) {}
    me = null; jobs = []; paint(); location.hash = '';
    renderLogin();
  }

  /* -------------------------------------------------------------- data ---- */
  function crewOf(c) { return String(c.assignee || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  async function loadJobs() {
    var r = await client().from('service_cases').select(COLS);
    if (r.error) throw new Error(friendly(r.error));
    jobs = (r.data || []).filter(function (c) {
      return crewOf(c).indexOf(me.techId) >= 0 && CLOSED.indexOf(String(c.status || '')) < 0;
    }).sort(function (a, b) {
      var x = apptDate(a), y = apptDate(b);
      if (x && y) return x - y; if (x) return -1; if (y) return 1;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
  }
  async function freshCase(id) {
    var r = await client().from('service_cases').select(COLS).eq('id', id).maybeSingle();
    if (r.error) throw new Error(friendly(r.error));
    if (!r.data) throw new Error('ไม่พบงานนี้ อาจถูกลบหรือย้ายไปแล้ว');
    var i = jobs.findIndex(function (c) { return c.id === id; });
    if (i >= 0) jobs[i] = r.data; else jobs.push(r.data);
    return r.data;
  }
  function getGps() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function () { resolve(null); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }
  /* The one write path. Reads the row first so the step is decided on what the server has now,
     not on what this screen showed a minute ago. */
  async function moveStep(id, to, opts) {
    opts = opts || {};
    var c = await freshCase(id);
    var from = c.field_status || '';
    if (opts.mustBe != null && from !== opts.mustBe) throw new Error('ขั้นตอนของงานนี้เปลี่ยนไปแล้ว (ตอนนี้: ' + (from || 'ยังไม่เริ่ม') + ') ลองใหม่อีกครั้ง');
    var now = new Date().toISOString();
    var entry = { id: uid(), status: to, note: opts.note || '', media: [], createdAt: now, techId: me.techId, source: 'app' };
    if (opts.gps) { entry.latitude = opts.gps.lat; entry.longitude = opts.gps.lng; }
    var status = c.status;
    if (to === HOLD) status = 'รออะไหล่';
    else if (to === DONE) status = 'รอส่งงาน';
    else if (CLOSED.indexOf(status) < 0) status = 'กำลังดำเนินการ';
    var log = Array.isArray(c.field_status_log) ? c.field_status_log.slice() : [];
    log.push(entry);
    var r = await client().from('service_cases').update({ field_status: to, field_status_log: log, status: status, updated_at: now }).eq('id', id).select(COLS).maybeSingle();
    if (r.error) throw new Error(friendly(r.error));
    if (!r.data) throw new Error('บันทึกไม่สำเร็จ บัญชีนี้อาจไม่มีสิทธิ์แก้งานนี้');
    var i = jobs.findIndex(function (x) { return x.id === id; }); if (i >= 0) jobs[i] = r.data;
    /* the case chat line, worded like js/138 so the office sees one kind of entry */
    var back = STEPS.indexOf(to) >= 0 && STEPS.indexOf(from) > STEPS.indexOf(to);
    var text = back ? '↩️ ช่างย้อนสถานะหน้างาน: ' + from + ' → ' + to : '🔧 ช่างอัปเดตหน้างาน: ' + to;
    if (opts.gps === null && to === ARRIVED) text += ' (ไม่ได้พิกัด GPS)';
    client().from('case_messages').insert({ case_id: id, body: text, photos: [] }).then(function () {}, function () {});
    return r.data;
  }

  /* -------------------------------------------------------------- login ---- */
  function renderLogin(msg) {
    paint();
    var last = lsGet('imode.lastUser') || '';
    var remember = lsGet('imode.remember') !== '0';
    var dark = document.documentElement.getAttribute('data-t') === 'dark' || document.documentElement.getAttribute('data-t') === 'gold';
    app.innerHTML = '<main class="screen login">' +
      '<svg class="login-motif" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 6 L92 50 L10 94 Z" fill="' + (dark ? '#fff' : '#2c3790') + '"/></svg>' +
      '<div class="login-brand"><img src="' + (dark ? 'img/logo-white.png' : 'img/logo.png') + '" alt="I-MODE"><span>แอพทีมช่าง</span></div>' +
      '<h1>เข้าสู่ระบบ</h1>' +
      '<form class="login-card" id="lf" novalidate>' +
      '<div class="err" id="le" role="alert"' + (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</div>' +
      '<div class="field"><label for="lu">ชื่อผู้ใช้</label><input id="lu" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="ชื่อผู้ใช้ของคุณ" value="' + esc(last) + '"></div>' +
      '<div class="field"><label for="lp">รหัสผ่าน</label><div class="pw"><input id="lp" type="password" autocomplete="current-password" placeholder="รหัสผ่าน">' +
      '<button type="button" id="lt" aria-label="แสดงรหัสผ่าน" aria-pressed="false">' + I.eye + '</button></div></div>' +
      '<div class="login-row"><label class="check"><input id="lr" type="checkbox"' + (remember ? ' checked' : '') + '> จำฉันไว้</label>' +
      '<button type="submit" class="go" id="lg">เข้าสู่ระบบ<i>' + I.play + '</i></button></div></form>' +
      '<p class="login-foot">ลืมรหัสผ่าน ติดต่อหัวหน้าแผนก · เวอร์ชัน ' + VERSION + '</p></main>';
    var f = document.getElementById('lf'), pw = document.getElementById('lp'), err = document.getElementById('le'), go = document.getElementById('lg');
    document.getElementById('lt').onclick = function () {
      var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
      this.setAttribute('aria-pressed', String(show)); this.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    };
    f.onsubmit = async function (e) {
      e.preventDefault();
      if (go.disabled) return;
      err.hidden = true; go.disabled = true; go.innerHTML = '<span class="spin" aria-hidden="true"></span>กำลังเข้าสู่ระบบ';
      try {
        await signIn(document.getElementById('lu').value, pw.value, document.getElementById('lr').checked);
        paint(); location.hash = '#/jobs'; route();
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        go.disabled = false; go.innerHTML = 'เข้าสู่ระบบ<i>' + I.play + '</i>';
      }
    };
  }

  /* --------------------------------------------------------------- jobs ---- */
  function navHTML(cur) {
    return '<nav class="nav" aria-label="เมนูหลัก">' +
      '<button type="button" data-go="#/jobs"' + (cur === 'jobs' ? ' aria-current="page"' : '') + '>' + I.jobs + 'งาน</button>' +
      '<button type="button" data-go="#/chats"' + (cur === 'chats' ? ' aria-current="page"' : '') + '><span class="nav-ico">' + I.chat + '<i class="badge" id="nb"' + (unread ? '' : ' hidden') + '>' + (unread > 99 ? '99+' : unread) + '</i></span>แชท</button>' +
      '<button type="button" data-go="#/me"' + (cur === 'me' ? ' aria-current="page"' : '') + '>' + I.user + 'ฉัน</button></nav>';
  }
  function chipFor(c) {
    var fs = c.field_status || '';
    if (fs && fs !== DONE) return '<span class="chip on">' + esc(fs) + '</span>';
    if (fs === DONE) return '<span class="chip">จบงานแล้ว</span>';
    if (/ด่วน/.test(String(c.priority || ''))) return '<span class="chip urgent">' + esc(c.priority) + '</span>';
    return '<span class="chip">ยังไม่เริ่ม</span>';
  }
  function jobCard(c) {
    var d = apptDate(c), live = c.field_status && c.field_status !== DONE;
    var when = d ? (dayKey(d) === dayKey(new Date()) ? hhmm(d) + ' น.' : d.getDate() + ' ' + TH_MON[d.getMonth()] + ' · ' + hhmm(d) + ' น.') : 'ยังไม่นัดหมาย';
    var where = c.location || c.branch || '';
    return '<button type="button" class="job' + (live ? ' live' : '') + '" data-job="' + esc(c.id) + '">' +
      '<span class="job-top"><span class="job-time">' + esc(when) + '</span>' + chipFor(c) + '</span>' +
      '<span style="display:flex;flex-direction:column;gap:2px"><b>' + esc(c.customer || '-') + '</b>' +
      '<span class="sub">' + esc([c.machine, c.service_type].filter(Boolean).join(' · ') || '-') + '</span></span>' +
      (where ? '<span class="where">' + esc(where) + '</span>' : '') + '</button>';
  }
  function visibleJobs() {
    var today = new Date(), tm = new Date(Date.now() + 86400000);
    return jobs.filter(function (c) {
      if (filter === 'all') return true;
      var d = apptDate(c);
      var live = c.field_status && c.field_status !== DONE;
      if (filter === 'today') return live || (d && dayKey(d) === dayKey(today)) || (d && d < today);
      return d && dayKey(d) === dayKey(tm);
    });
  }
  function renderJobs(loading) {
    var now = new Date(), week = new Date(Date.now() + 7 * 86400000);
    var todayN = jobs.filter(function (c) { var d = apptDate(c); return d && dayKey(d) === dayKey(now); }).length;
    var liveN = jobs.filter(function (c) { return c.field_status && c.field_status !== DONE; }).length;
    var weekN = jobs.filter(function (c) { var d = apptDate(c); return d && d >= now && d <= week; }).length;
    var list = visibleJobs();
    var empty = filter === 'today' ? 'วันนี้ไม่มีงานที่นัดไว้' : filter === 'tomorrow' ? 'พรุ่งนี้ยังไม่มีงานที่นัดไว้' : 'ยังไม่มีงานที่ได้รับมอบหมาย';
    app.innerHTML = '<div class="screen home"><header class="head"><div class="head-row"><div class="grow">' +
      '<small>' + esc(thDate(now)) + '</small><h1>งานของฉัน</h1></div>' +
      '<button type="button" class="icon-btn" id="jr" aria-label="โหลดงานใหม่">' + I.refresh + '</button>' +
      '<button type="button" class="icon-btn" id="jt" aria-label="เปลี่ยนธีม">' + I.palette + '</button></div></header>' +
      '<div class="stats"><div><b>' + todayN + '</b><span>งานวันนี้</span></div><div><b class="hot">' + liveN + '</b><span>กำลังทำ</span></div><div><b>' + weekN + '</b><span>7 วันข้างหน้า</span></div></div>' +
      '<div class="pills" role="group" aria-label="ช่วงเวลา">' +
      [['today', 'วันนี้'], ['tomorrow', 'พรุ่งนี้'], ['all', 'ทั้งหมด']].map(function (p) {
        return '<button type="button" data-f="' + p[0] + '" aria-pressed="' + (filter === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="scroll"><div class="list">' +
      (loading ? '<div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดงาน</div>'
        : list.length ? list.map(jobCard).join('') : '<div class="empty"><b>' + esc(empty) + '</b>ดูงานอื่นได้ที่แท็บ ทั้งหมด</div>') +
      '</div></div>' + navHTML('jobs') + '</div>';
    document.getElementById('jt').onclick = openThemeSheet;
    document.getElementById('jr').onclick = function () { refreshJobs(true); };
    app.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filter = b.getAttribute('data-f'); renderJobs(); }; });
    app.querySelectorAll('[data-job]').forEach(function (b) { b.onclick = function () { location.hash = '#/job/' + encodeURIComponent(b.getAttribute('data-job')); }; });
    wireNav();
  }
  async function refreshJobs(say) {
    if (location.hash.indexOf('#/jobs') === 0 && !jobs.length) renderJobs(true);
    try { await loadJobs(); if (say) toast('อัปเดตรายการงานแล้ว'); loadChatTops().catch(function () {}); }
    catch (e) { toast(e.message); }
    if (location.hash.indexOf('#/jobs') === 0 || !location.hash) renderJobs();
  }

  /* ---------------------------------------------------------------- job ---- */
  function mapUrl(c) {
    if (c.latitude && c.longitude) return 'https://www.google.com/maps/dir/?api=1&destination=' + c.latitude + ',' + c.longitude;
    if (c.map_url && /^https:\/\//.test(c.map_url)) return c.map_url;
    var q = [c.customer, c.location].filter(Boolean).join(' ');
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }
  function lastEntryFor(c, status) {
    var log = Array.isArray(c.field_status_log) ? c.field_status_log : [];
    for (var i = log.length - 1; i >= 0; i--) if (log[i] && log[i].status === status) return log[i];
    return null;
  }
  function renderJob(id) {
    var c = jobs.filter(function (x) { return x.id === id; })[0];
    if (!c) {
      app.innerHTML = '<div class="screen"><div class="loading"><span class="spin" aria-hidden="true"></span>กำลังเปิดงาน</div></div>';
      freshCase(id).then(function () { renderJob(id); }, function (e) { toast(e.message); location.hash = '#/jobs'; });
      return;
    }
    var cur = c.field_status || '', at = STEPS.indexOf(cur), onHold = cur === HOLD;
    var shown = at >= 0 ? at : -1;
    var d = apptDate(c);
    var steps = STEPS.map(function (s, k) { return '<span class="' + (k < shown ? 'done' : k === shown ? 'now' : '') + '"></span>'; }).join('');
    var stepLabel = cur ? (at >= 0 ? 'ขั้น ' + (at + 1) + ' จาก ' + STEPS.length : 'พักงานไว้') : 'ยังไม่เริ่มงาน';

    var top;
    if (cur === TRAVEL) {
      top = '<button type="button" class="checkin" id="ci"><span class="ring">' + I.pin + '</span><span><b>Check-in ถึงหน้างาน</b><small>บันทึกเวลาและพิกัด GPS</small></span></button>';
    } else {
      var ci = lastEntryFor(c, ARRIVED), title, sub;
      if (!cur) { title = 'ยังเช็คอินไม่ได้'; sub = 'กด "ถัดไป: กำลังเดินทาง" ตอนออกเดินทาง แล้วปุ่ม Check-in จะเปิด'; }
      else if (ci) { title = 'Check-in แล้ว ' + hhmm(new Date(ci.createdAt)) + ' น.'; sub = cur === ARRIVED ? 'กดผิด? กดปุ่มย้อนขั้นตอนด้านล่าง แล้ว Check-in ใหม่' : 'Check-in ได้เฉพาะขั้น กำลังเดินทาง'; }
      else { title = 'Check-in ไม่ได้ในขั้นนี้'; sub = 'Check-in ได้เฉพาะขั้น กำลังเดินทาง'; }
      top = '<div class="locked"><span class="ring">' + I.lock + '</span><span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span></div>';
    }

    /* forward / back. On hold the job resumes at the step it was paused on. */
    var next = '', backTo = '';
    if (onHold) {
      var log = Array.isArray(c.field_status_log) ? c.field_status_log : [], prev = '';
      for (var i = log.length - 1; i >= 0; i--) { if (log[i] && STEPS.indexOf(log[i].status) >= 0) { prev = log[i].status; break; } }
      next = prev || STEPS[2];
    } else if (at < 0) next = TRAVEL;
    else if (at < STEPS.length - 2) next = STEPS[at + 1];
    if (at > 0) backTo = STEPS[at - 1];
    var atReport = at === STEPS.length - 2;   /* รอลูกค้าตรวจรับ: จบงาน needs the service report */

    var url = mapUrl(c), tel = String(c.phone || '').replace(/[^\d+]/g, '');
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row">' +
      '<button type="button" class="icon-btn" id="jb" aria-label="กลับไปงานของฉัน">' + I.back + '</button>' +
      '<div class="grow"><small>' + esc([c.ticket, d ? hhmm(d) + ' น.' : ''].filter(Boolean).join(' · ')) + '</small><b class="t">' + esc(c.customer || '-') + '</b></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;gap:8px"><small>ขั้นตอนตอนนี้</small><small>' + esc(stepLabel) + '</small></div>' +
      '<span class="step-now">' + esc(cur || 'ยังไม่เริ่มงาน') + '</span><div class="steps" aria-hidden="true">' + steps + '</div></div></header>' +
      '<div class="scroll"><div class="body">' + top +
      '<div class="actions">' +
      '<button type="button" class="action" id="jn"' + (url ? '' : ' disabled') + '>' + I.nav + 'นำทาง</button>' +
      '<button type="button" class="action" id="jc"' + (tel ? '' : ' disabled') + '>' + I.phone + 'โทรลูกค้า</button>' +
      '<button type="button" class="action" id="jm">' + I.chat + 'แชทเคส</button></div>' +
      '<section class="info"><h2>เครื่องที่ต้องดู</h2><div class="kv">' +
      '<span>เครื่อง</span><span>' + esc([c.machine, c.model].filter(Boolean).join(' ') || '-') + '</span>' +
      '<span>ซีเรียล</span><span>' + esc(c.serial || '-') + '</span>' +
      '<span>งาน</span><span>' + esc(c.service_type || '-') + '</span>' +
      '<span>อาการ</span><span>' + esc(c.issue || '-') + '</span>' +
      (c.warranty ? '<span>ประกัน</span><span>' + esc(c.warranty) + '</span>' : '') + '</div></section>' +
      '<section class="info"><h2>ลูกค้า</h2><div class="kv">' +
      '<span>ผู้ติดต่อ</span><span>' + esc(c.contact || '-') + '</span>' +
      '<span>โทร</span><span>' + esc(c.phone || '-') + '</span>' +
      '<span>สถานที่</span><span>' + esc(c.location || c.branch || '-') + '</span>' +
      (c.note ? '<span>หมายเหตุ</span><span>' + esc(c.note) + '</span>' : '') + '</div></section>' +
      (cur && !onHold && at >= 2 && at < STEPS.length - 1 ? '<button type="button" class="hold" id="jh">📦 ' + HOLD + '</button>' : '') +
      (atReport ? '<p class="note">ใบตรวจงาน ลายเซ็นลูกค้า และการจบงาน ทำบนเว็บไปก่อน รอบถัดไปจะมีในแอพ</p>' : '') +
      '</div></div>' +
      '<div class="bar">' +
      (backTo ? '<button type="button" class="back" id="jk" aria-label="ย้อนขั้นตอนไป ' + esc(backTo) + '">' + I.undo + '</button>' : '') +
      (next ? '<button type="button" class="next" id="jx">ถัดไป: ' + esc(next) + I.arrow + '</button>'
        : '<span class="final">' + (cur === DONE ? 'จบงานแล้ว' : 'ขั้นถัดไปคือทำใบตรวจงานบนเว็บ') + '</span>') +
      '</div></div>';

    document.getElementById('jb').onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/jobs'); };
    var bn = document.getElementById('jn'); if (url) bn.onclick = function () { location.href = url; };
    var bc = document.getElementById('jc'); if (tel) bc.onclick = function () { location.href = 'tel:' + tel; };
    document.getElementById('jm').onclick = function () { location.hash = '#/chat/' + encodeURIComponent(c.id); };
    var bci = document.getElementById('ci');
    if (bci) bci.onclick = function () { run(bci, async function () {
      toast('กำลังอ่านพิกัด GPS…');
      var gps = await getGps();
      await moveStep(c.id, ARRIVED, { mustBe: TRAVEL, gps: gps, note: 'Check-in จากแอพช่าง' });
      toast(gps ? 'Check-in หน้างานแล้ว' : 'Check-in แล้ว แต่ไม่ได้พิกัด GPS');
    }); };
    var bx = document.getElementById('jx');
    if (bx) bx.onclick = function () { run(bx, async function () {
      var gps = next === ARRIVED ? await getGps() : undefined;
      await moveStep(c.id, next, { mustBe: cur, gps: gps });
      toast('อัปเดตเป็น ' + next);
    }); };
    var bk = document.getElementById('jk');
    if (bk) bk.onclick = async function () {
      var ok = await confirmSheet('ย้อนขั้นตอน?', 'ย้อนกลับไปที่ "' + backTo + '" ระบบจะแจ้งในแชทของเคสนี้ด้วย', 'ย้อนกลับ');
      if (ok) run(bk, async function () { await moveStep(c.id, backTo, { mustBe: cur }); toast('ย้อนกลับไปที่ ' + backTo); });
    };
    var bh = document.getElementById('jh');
    if (bh) bh.onclick = async function () {
      var ok = await confirmSheet('พักงานรออะไหล่?', 'สถานะเคสจะเป็น รออะไหล่ จนกว่าจะกดทำต่อ', 'พักงาน');
      if (ok) run(bh, async function () { await moveStep(c.id, HOLD, { mustBe: cur }); toast('พักงานรออะไหล่แล้ว'); });
    };
  }
  /* one action at a time: every step button is dead until the save has come back */
  async function run(btn, fn) {
    if (busy) return;
    busy = true;
    app.querySelectorAll('.bar button,.checkin,.hold').forEach(function (b) { b.disabled = true; });
    try { await fn(); }
    catch (e) { toast(e.message); }
    busy = false;
    var m = /^#\/job\/(.+)$/.exec(location.hash);
    if (m) renderJob(decodeURIComponent(m[1]));
  }

  /* --------------------------------------------------------------- chat ---- */
  /* The case chat of js/138: public.case_messages, one row per message. The server stamps the
     author and the time (trigger case_messages_stamp), photos are shrunk JPEG data URLs, max 4.
     New messages arrive by realtime, with a pull every 15 s as a fallback. */
  var CHAT_COLS = 'id,case_id,body,photos,author_id,author_name,created_at';
  var AUTO = /^(🔄|↩️|👷|🔧|🏭|📎|✏️)/;
  var chat = null;   /* { id, msgs, byId, last, chan, timer, pending } */
  function chatStop() {
    if (!chat) return;
    try { if (chat.chan) client().removeChannel(chat.chan); } catch (e) {}
    clearInterval(chat.timer);
    chat = null;
  }
  function chatAdd(list) {
    var n = 0;
    (list || []).forEach(function (m) { if (m && m.id && !chat.byId[m.id]) { chat.byId[m.id] = m; chat.msgs.push(m); n++; } });
    if (n) {
      chat.msgs.sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
      chat.last = chat.msgs[chat.msgs.length - 1].created_at;
    }
    return n;
  }
  function dayLabel(d) {
    var t = new Date(), y = new Date(Date.now() - 86400000);
    if (dayKey(d) === dayKey(t)) return 'วันนี้';
    if (dayKey(d) === dayKey(y)) return 'เมื่อวาน';
    return d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }
  function linkify(t) { return esc(t).replace(/(@[^\s@]+(?:\s[^\s@]+)?)/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
  function chatFeed() {
    if (!chat.msgs.length) return '<div class="empty"><b>ยังไม่มีข้อความ</b>เขียนอัปเดตงานหรือส่งรูปหน้างานให้ทีมได้เลย</div>';
    var out = '', lastDay = '';
    chat.msgs.forEach(function (m) {
      var d = new Date(m.created_at), k = dayKey(d);
      if (k !== lastDay) { out += '<div class="day"><span>' + esc(dayLabel(d)) + '</span></div>'; lastDay = k; }
      var body = String(m.body || ''), ph = Array.isArray(m.photos) ? m.photos : [];
      if (AUTO.test(body) && !ph.length) {
        out += '<div class="sys"><span>' + esc(body) + ' · ' + esc(m.author_name || '') + ' ' + hhmm(d) + '</span></div>';
        return;
      }
      var mine = m.author_id === me.id;
      out += '<div class="msg' + (mine ? ' mine' : '') + '">' + (mine ? '' : '<small class="who">' + esc(m.author_name || 'พนักงาน') + '</small>') +
        '<div class="bubble">' + (body ? '<div>' + linkify(body) + '</div>' : '') +
        (ph.length ? '<div class="pics">' + ph.map(function (src, i) {
          return /^data:image\/(jpeg|png|webp);base64,/.test(String(src)) ? '<button type="button" class="pic" data-pic="' + esc(m.id) + '|' + i + '"><img src="' + esc(src) + '" alt="รูปที่ ' + (i + 1) + '"></button>' : '';
        }).join('') + '</div>' : '') +
        '</div><small class="at">' + hhmm(d) + '</small></div>';
    });
    return out;
  }
  function chatPaint(stick) {
    var feed = document.getElementById('cf'); if (!feed || !chat) return;
    var near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
    feed.innerHTML = chatFeed();
    if (chat.last && chat.last > seenAt(chat.id)) lsSet('imode.chatSeen.' + chat.id, chat.last);
    if (stick || near) feed.scrollTop = feed.scrollHeight;
  }
  function chatPending() {
    var box = document.getElementById('cpend'); if (!box) return;
    box.hidden = !chat.pending.length;
    box.innerHTML = chat.pending.map(function (src, i) { return '<span class="pend"><img src="' + src + '" alt=""><button type="button" data-rm="' + i + '" aria-label="เอารูปออก">' + I.x + '</button></span>'; }).join('');
  }
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('ไม่ใช่ไฟล์รูป'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1280 / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('เปิดรูปไม่ได้')); };
      img.src = url;
    });
  }
  async function chatPull() {
    if (!chat) return;
    var q = client().from('case_messages').select(CHAT_COLS).eq('case_id', chat.id).order('created_at', { ascending: true }).limit(500);
    if (chat.last) q = q.gt('created_at', chat.last);
    var r = await q;
    if (r.error) throw new Error(/PGRST205|42P01|does not exist/i.test(String(r.error.code + ' ' + r.error.message)) ? 'ระบบแชทยังไม่ได้เปิดใช้ ติดต่อผู้ดูแลระบบ' : friendly(r.error));
    if (chat && chatAdd(r.data)) chatPaint();
  }
  function renderChat(id) {
    if (!chat || chat.id !== id) { chatStop(); chat = { id: id, msgs: [], byId: {}, last: '', chan: null, timer: null, pending: [] }; }
    var c = jobs.filter(function (x) { return x.id === id; })[0] || {};
    app.innerHTML = '<div class="screen chat"><header class="head"><div class="head-row">' +
      '<button type="button" class="icon-btn" id="cb" aria-label="กลับไปหน้างาน">' + I.back + '</button>' +
      '<div class="grow"><small>แชทเคส · ' + esc(c.ticket || '') + '</small><b class="t">' + esc(c.customer || '') + '</b></div></div></header>' +
      '<div class="scroll feed" id="cf" aria-live="polite"><div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดแชท</div></div>' +
      '<div class="pending" id="cpend" hidden></div>' +
      '<form class="composer" id="cform"><label class="cam" aria-label="แนบรูป">' + I.cam + '<input id="cfile" type="file" accept="image/*" multiple hidden></label>' +
      '<textarea id="ctext" rows="1" placeholder="พิมพ์ข้อความ" aria-label="ข้อความ"></textarea>' +
      '<button type="submit" class="sendb" id="csend" aria-label="ส่ง">' + I.send + '</button></form></div>';
    document.getElementById('cb').onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/job/' + encodeURIComponent(id)); };
    var ta = document.getElementById('ctext');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    document.getElementById('cfile').onchange = async function () {
      var files = Array.prototype.slice.call(this.files || []); this.value = '';
      for (var i = 0; i < files.length; i++) {
        if (chat.pending.length >= 4) { toast('แนบรูปได้สูงสุด 4 รูปต่อข้อความ'); break; }
        try { chat.pending.push(await shrink(files[i])); } catch (e) { toast(e.message); }
      }
      chatPending();
    };
    document.getElementById('cpend').onclick = function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      chat.pending.splice(Number(b.getAttribute('data-rm')), 1); chatPending();
    };
    document.getElementById('cf').onclick = function (e) {
      var b = e.target.closest('[data-pic]'); if (!b) return;
      var parts = b.getAttribute('data-pic').split('|'), m = chat.byId[parts[0]];
      if (m) viewPic(m.photos[Number(parts[1])]);
    };
    document.getElementById('cform').onsubmit = async function (e) {
      e.preventDefault();
      var send = document.getElementById('csend');
      var text = ta.value.trim();
      if (send.disabled || (!text && !chat.pending.length)) return;
      send.disabled = true;
      var r = await client().from('case_messages').insert({ case_id: id, body: text.slice(0, 4000), photos: chat.pending.slice() }).select(CHAT_COLS).maybeSingle();
      send.disabled = false;
      if (r.error) { toast('ส่งไม่สำเร็จ: ' + friendly(r.error)); return; }
      ta.value = ''; ta.style.height = 'auto'; chat.pending = []; chatPending();
      if (r.data && chatAdd([r.data])) chatPaint(true);
    };
    chatPending();
    chatPull().then(function () { chatPaint(true); }, function (e) {
      var f = document.getElementById('cf'); if (f) f.innerHTML = '<div class="empty"><b>เปิดแชทไม่ได้</b>' + esc(e.message) + '</div>';
    });
    if (!chat.chan && typeof client().channel === 'function') {
      try {
        chat.chan = client().channel('app-chat-' + uid())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_messages', filter: 'case_id=eq.' + id }, function (p) {
            if (chat && p && p.new && chatAdd([p.new])) chatPaint();
          }).subscribe();
      } catch (e) {}
    }
    if (!chat.timer) chat.timer = setInterval(function () { chatPull().catch(function () {}); }, 15000);
  }
  function viewPic(src) {
    if (!/^data:image\//.test(String(src))) return;
    var w = document.createElement('div');
    w.innerHTML = '<div class="scrim viewer" role="dialog" aria-modal="true" aria-label="รูป"><img src="' + esc(src) + '" alt=""><button type="button" class="icon-btn close" aria-label="ปิด">' + I.x + '</button></div>';
    var s = w.firstChild; document.body.appendChild(s);
    s.onclick = function () { s.remove(); };
  }

  /* ---------------------------------------------------------- chat list ---- */
  /* แชท tab: the chats of my open jobs, newest first, with the last line and how many messages
     came from others since I last opened that chat (kept on this phone: imode.chatSeen.<case>). */
  var unread = 0, chatTops = {};
  function seenAt(id) { return lsGet('imode.chatSeen.' + id) || ''; }
  function unreadIn(id, list) {
    var seen = seenAt(id), from = seen || new Date(Date.now() - 2 * 86400000).toISOString();
    return list.filter(function (m) { return m.author_id !== me.id && m.created_at > from; }).length;
  }
  async function loadChatTops() {
    var ids = jobs.map(function (c) { return c.id; });
    chatTops = {};
    if (!ids.length) { unread = 0; return; }
    var r = await client().from('case_messages').select('id,case_id,body,author_id,author_name,created_at')
      .in('case_id', ids).order('created_at', { ascending: false }).limit(500);
    if (r.error) throw new Error(/PGRST205|42P01|does not exist/i.test(String(r.error.code + ' ' + r.error.message)) ? 'ระบบแชทยังไม่ได้เปิดใช้ ติดต่อผู้ดูแลระบบ' : friendly(r.error));
    (r.data || []).forEach(function (m) { (chatTops[m.case_id] = chatTops[m.case_id] || []).push(m); });
    unread = ids.reduce(function (n, id) { return n + unreadIn(id, chatTops[id] || []); }, 0);
    paintBadge();
  }
  function paintBadge() {
    var b = document.getElementById('nb'); if (!b) return;
    b.hidden = !unread; b.textContent = unread > 99 ? '99+' : String(unread);
  }
  function renderChats(loading) {
    var rows = jobs.map(function (c) { var l = chatTops[c.id] || []; return { c: c, last: l[0] || null, n: unreadIn(c.id, l) }; })
      .sort(function (a, b) { return String(b.last ? b.last.created_at : '').localeCompare(String(a.last ? a.last.created_at : '')); });
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row"><div class="grow"><small>แชทเคสของงานที่ได้รับมอบหมาย</small><h1>แชท</h1></div>' +
      '<button type="button" class="icon-btn" id="hr" aria-label="โหลดแชทใหม่">' + I.refresh + '</button></div></header>' +
      '<div class="scroll"><div class="list">' +
      (loading ? '<div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดแชท</div>'
        : rows.length ? rows.map(function (x) {
          var m = x.last, d = m ? new Date(m.created_at) : null;
          var line = m ? (m.author_id === me.id ? 'คุณ: ' : (m.author_name ? m.author_name + ': ' : '')) + (String(m.body || '').trim() || '📷 รูปภาพ') : 'ยังไม่มีข้อความ';
          return '<button type="button" class="job thread" data-chat="' + esc(x.c.id) + '">' +
            '<div class="job-top"><span class="chip">' + esc(x.c.ticket || '') + '</span><small class="at">' + (d ? (dayKey(d) === dayKey(new Date()) ? hhmm(d) : esc(dayLabel(d))) : '') + '</small></div>' +
            '<b>' + esc(x.c.customer || '') + '</b>' +
            '<div class="thread-row"><span class="sub">' + esc(line) + '</span>' + (x.n ? '<i class="badge">' + (x.n > 99 ? '99+' : x.n) + '</i>' : '') + '</div></button>';
        }).join('') : '<div class="empty"><b>ยังไม่มีงานที่ได้รับมอบหมาย</b>แชทของแต่ละเคสจะขึ้นที่นี่</div>') +
      '</div></div>' + navHTML('chats') + '</div>';
    document.getElementById('hr').onclick = function () { refreshChats(true); };
    app.querySelectorAll('[data-chat]').forEach(function (b) { b.onclick = function () { location.hash = '#/chat/' + encodeURIComponent(b.getAttribute('data-chat')); }; });
    wireNav();
  }
  async function refreshChats(say) {
    try {
      if (!jobs.length) await loadJobs();
      await loadChatTops();
      if (say) toast('อัปเดตแชทแล้ว');
    } catch (e) { toast(e.message); }
    if (location.hash === '#/chats') renderChats();
  }

  /* ----------------------------------------------------------------- me ---- */
  function renderMe() {
    var th = THEMES.filter(function (x) { return x.id === appTheme(); })[0];
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row"><div class="grow"><small>' + esc(me.username) + '</small><h1>' + esc(me.name || 'ฉัน') + '</h1></div></div></header>' +
      '<div class="scroll"><div class="me">' +
      '<button type="button" class="row-btn" id="mt">' + I.palette + '<span class="grow"><b>ธีมหน้าจอ</b><small>' + esc(th ? th.name : '') + '</small></span></button>' +
      (chrome() && chrome().downloadBundle ? '<button type="button" class="row-btn" id="mu">' + I.refresh + '<span class="grow"><b>ตรวจหาอัปเดต</b><small>เวอร์ชันที่ใช้อยู่ ' + VERSION + '</small></span></button>' : '') +
      '<button type="button" class="row-btn danger" id="mo">' + I.out + '<span class="grow"><b>ออกจากระบบ</b></span></button>' +
      '<p class="note">I-MODE แอพทีมช่าง เวอร์ชัน ' + VERSION + '</p></div></div>' + navHTML('me') + '</div>';
    document.getElementById('mt').onclick = function () { openThemeSheet(); };
    document.getElementById('mo').onclick = signOut;
    var mu = document.getElementById('mu');
    if (mu) mu.onclick = async function () {
      if (upd.ready) return showUpdate();
      mu.disabled = true; toast('กำลังตรวจหาอัปเดต');
      upd.at = 0; var st = await checkUpdate(true);
      mu.disabled = false;
      if (st === 'none') toast('ใช้เวอร์ชันล่าสุดอยู่แล้ว (' + VERSION + ')');
    };
    wireNav();
  }
  function wireNav() {
    app.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-go'); }; });
  }

  /* -------------------------------------------------------------- route ---- */
  function route() {
    document.querySelectorAll('.scrim').forEach(function (s) { s.remove(); });
    if (!me) return renderLogin();
    var h = location.hash || '#/jobs', m;
    if ((m = /^#\/chat\/(.+)$/.exec(h))) return renderChat(decodeURIComponent(m[1]));
    chatStop();
    if ((m = /^#\/job\/(.+)$/.exec(h))) return renderJob(decodeURIComponent(m[1]));
    if (h === '#/me') return renderMe();
    if (h === '#/chats') { renderChats(!Object.keys(chatTops).length); return refreshChats(); }
    renderJobs(!jobs.length);
    if (!jobs.length) refreshJobs();
  }
  window.addEventListener('hashchange', route);
  /* back on screen after the phone slept or another app: pull fresh jobs */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkUpdate(false);
    if (document.visibilityState === 'visible' && me && !busy) {
      if (chat) { chatPull().catch(function () {}); return; }   /* keep what is being typed */
      loadJobs().then(function () { if (!document.querySelector('.scrim')) route(); if (location.hash !== '#/chats') loadChatTops().catch(function () {}); }, function () {});
    }
  });

  /* ------------------------------------------------------- live update ---- */
  /* The screens are files inside the app. A newer set is published with the web system at
     UPDATE_URL (version.json lists every file with its SHA-256). The app checks it on start and
     when it comes back to the screen; the native side downloads and checks the files, and they are
     used from the next start, or at once if the technician taps เริ่มใหม่. A new APK is needed only
     when version.json asks for newer native features than this APK has. */
  var UPDATE_URL = 'https://imodeservice.github.io/Imodesystem/apps/tech-android/www/version.json';
  var upd = { at: 0, busy: false, ready: null };
  function cmpVer(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  function chrome() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppChrome; }
  async function checkUpdate(force) {
    var P = chrome();
    if (!P || !P.downloadBundle || upd.busy || upd.ready) return 'busy';
    if (!force && Date.now() - upd.at < 20 * 60000) return 'busy';
    upd.busy = true; upd.at = Date.now();
    try {
      var r = await fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return 'none';
      var text = await r.text(), m = JSON.parse(text);
      if (!m || !m.version || !m.files || cmpVer(m.version, VERSION) <= 0) return 'none';
      var info = await P.info();
      if ((m.native || 1) > (info.native || 1)) { if (force) toast('มีเวอร์ชัน ' + m.version + ' ต้องติดตั้งแอพตัวใหม่ (APK) ขอไฟล์จากผู้ดูแลระบบ'); return 'apk'; }
      var res = await P.downloadBundle({ version: String(m.version), manifest: text });
      await P.applyBundle({ path: res.path, now: false });      /* used from the next start anyway */
      upd.ready = { version: String(m.version), path: res.path };
      showUpdate();
      return 'new';
    } catch (e) { if (force) toast('ตรวจอัปเดตไม่สำเร็จ ลองใหม่ภายหลัง'); return 'err'; }
    finally { upd.busy = false; }
  }
  function showUpdate() {
    if (!upd.ready || document.querySelector('.upd')) return;
    var b = document.createElement('div'); b.className = 'upd'; b.setAttribute('role', 'status');
    b.innerHTML = '<span class="grow"><b>อัปเดต ' + esc(upd.ready.version) + ' พร้อมแล้ว</b><small>เริ่มใหม่ตอนนี้ หรือเปิดแอพครั้งหน้าก็ได้</small></span>' +
      '<button type="button" class="later">ไว้ก่อน</button><button type="button" class="now">เริ่มใหม่</button>';
    document.body.appendChild(b);
    b.querySelector('.later').onclick = function () { b.remove(); };
    b.querySelector('.now').onclick = function () {
      if (chat && document.getElementById('ctext') && document.getElementById('ctext').value.trim()) { toast('ส่งข้อความที่พิมพ์ค้างไว้ก่อน แล้วค่อยเริ่มใหม่'); return; }
      b.querySelector('.now').disabled = true;
      chrome().applyBundle({ path: upd.ready.path, now: true }).catch(function () { toast('เริ่มใหม่ไม่สำเร็จ ปิดแล้วเปิดแอพใหม่แทนได้'); });
    };
  }
  /* the native side keeps the last good set; a new set that never reaches this point is dropped
     after two tries and the app goes back to the previous one */
  function bootOk() {
    var P = chrome(); if (P && P.markGood) P.markGood().catch(function () {});
    var seen = lsGet('imode.appVersion');
    if (seen && seen !== VERSION && cmpVer(VERSION, seen) > 0) setTimeout(function () { toast('อัปเดตเป็นเวอร์ชัน ' + VERSION + ' แล้ว'); }, 600);
    lsSet('imode.appVersion', VERSION);
    setTimeout(function () { checkUpdate(false); }, 3000);
  }

  async function boot() {
    paint();
    try { window.Capacitor.Plugins.AppChrome.ready(); } catch (e) {}
    if (!window.supabase || !C.supabaseUrl) { app.innerHTML = '<div class="empty"><b>ตั้งค่าแอพไม่ครบ</b></div>'; return; }
    var s = null;
    try { s = (await client().auth.getSession()).data.session; } catch (e) {}
    bootOk();
    if (!s) return renderLogin();
    app.innerHTML = '<div class="screen"><div class="loading"><span class="spin" aria-hidden="true"></span>กำลังเปิดแอพ</div></div>';
    try { me = await loadMe(s.user); }
    catch (e) {
      if (/เชื่อมต่อ/.test(e.message)) { app.innerHTML = '<div class="screen"><div class="empty"><b>ไม่มีอินเทอร์เน็ต</b>ต่อเน็ตแล้วเปิดแอพใหม่อีกครั้ง</div></div>'; return; }
      await client().auth.signOut().catch(function () {});
      return renderLogin(e.message);
    }
    paint();
    route();
  }
  boot();
})();
