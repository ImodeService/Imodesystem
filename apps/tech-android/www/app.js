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
  var VERSION = '0.7';      /* bump for every release; tools/make-version.js copies it into version.json */
  var NATIVE = 1;           /* the native (APK) features this bundle needs; see AppChromePlugin.NATIVE */
  var STEPS = ['กำลังเดินทาง', 'ถึงหน้างาน', 'เริ่มตรวจเช็ก', 'กำลัง PM / Maintenance', 'กำลังซ่อม Service', 'ทดสอบเครื่อง', 'รอลูกค้าตรวจรับ', 'จบงาน'];
  var HOLD = 'รออะไหล่';
  var TRAVEL = STEPS[0], ARRIVED = STEPS[1], DONE = STEPS[STEPS.length - 1];
  var CLOSED = ['เสร็จสิ้น', 'ปิดเคส'];
  var COLS = 'id,ticket,customer_id,machine_id,customer,contact,phone,location,branch,map_url,latitude,longitude,machine,model,serial,warranty,service_type,priority,issue,note,status,assignee,appointment,field_status,field_status_log,updated_at';

  var THEMES = [
    { id: 'light', name: 'เรียบ สว่าง', desc: 'มาตรฐาน พื้นสว่าง แถบบนกรมท่า', sw: '#f3f3f3', dot: '#0c225e', web: 'flat-light' },
    { id: 'dark', name: 'เรียบ มืด', desc: 'พื้นสีเข้ม ถนอมสายตาตอนกลางคืน', sw: '#1b1b1b', dot: '#e07a1f', web: 'flat-dark' },
    { id: 'auto', name: 'ตามระบบ', desc: 'สว่างหรือมืดตามที่ตั้งไว้ในมือถือ', sw: 'linear-gradient(90deg,#f3f3f3 50%,#1b1b1b 50%)', dot: '#b45300', web: 'auto' },
    { id: 'glass', name: 'กระจก (Glass)', desc: 'หน้าตาเดิมของ Service มีไล่สี', sw: '#eef3fc', dot: '#ff5b14', web: 'classic' },
    { id: 'gold', name: 'ราตรีสีทอง', desc: 'พื้นน้ำเงินเข้ม จุดเด่นสีทอง', sw: 'linear-gradient(135deg,#080e2e,#1a2a8a)', dot: '#ffc845', web: 'flat-dark' }
  ];

  var app = document.getElementById('app');
  var sb = null, me = null, jobs = [], allCases = [], filter = 'today', busy = false;

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
    pen: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    cal: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
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
    namesFromAccount(authUser);
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
    me = null; jobs = []; allCases = []; chatStop(); unread = 0; hub.loaded = false; hub.dms = []; hub.people = []; hub.byPerson = {}; hub.caseTops = {}; hub.q = '';
    paint(); location.hash = '';
    renderLogin();
  }

  /* -------------------------------------------------------------- data ---- */
  function crewOf(c) { return String(c.assignee || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  async function loadJobs() {
    var r = await client().from('service_cases').select(COLS);
    if (r.error) throw new Error(friendly(r.error));
    allCases = r.data || [];
    jobs = allCases.filter(function (c) {
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
    else if (to === DONE) status = 'เสร็จสิ้น';
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
      '<button type="button" data-go="#/cal"' + (cur === 'cal' ? ' aria-current="page"' : '') + '>' + I.cal + 'ปฏิทิน</button>' +
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
    try { await loadJobs(); if (say) toast('อัปเดตรายการงานแล้ว'); loadHub().catch(function () {}); }
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
      (at >= 1 ? '<button type="button" class="row-btn" id="jr">' + I.pen + '<span class="grow"><b>ใบตรวจงาน</b><small>' + (lsGet('imode.reportDraft.' + c.id) ? 'มีฉบับร่างในเครื่อง กดเพื่อทำต่อ' : 'กรอกได้ระหว่างทำงาน ส่งตอนจบงาน') + '</small></span>' + I.arrow + '</button>' : '') +
      '</div></div>' +
      '<div class="bar">' +
      (backTo ? '<button type="button" class="back" id="jk" aria-label="ย้อนขั้นตอนไป ' + esc(backTo) + '">' + I.undo + '</button>' : '') +
      (next ? '<button type="button" class="next" id="jx">ถัดไป: ' + esc(next) + I.arrow + '</button>'
        : cur === DONE ? '<span class="final">จบงานแล้ว</span>'
        : '<button type="button" class="next" id="jd">ใบตรวจ ลายเซ็น และจบงาน' + I.arrow + '</button>') +
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
    var br = document.getElementById('jr'), bd = document.getElementById('jd');
    [br, bd].forEach(function (b) { if (b) b.onclick = function () { location.hash = '#/report/' + encodeURIComponent(c.id); }; });
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

  /* ------------------------------------------------------------ report ---- */
  /* ใบตรวจงาน, the web's sheet (js/03 openServiceReport + saveServiceReport, js/77 checklist /
     PM date / satisfaction, js/70 signature undo, js/68 signature gate, js/44 + js/63 จบงาน)
     on a phone. It writes the same service_reports row the web writes, so the office opens,
     prints and sends it exactly as before. Until it is sent the sheet is kept as a draft on
     this phone (imode.reportDraft.<caseId>), photos included, videos not (too big). */
  var CHECKS = {
    PM: ['ตรวจสภาพภายนอก โครงสร้าง ฝาครอบ และจุดยึด', 'ตรวจระบบไฟฟ้า สายไฟ ปลั๊ก ขั้วต่อ และสายดิน', 'ตรวจอุปกรณ์นิรภัย ปุ่มหยุดฉุกเฉิน อินเตอร์ล็อก และเซนเซอร์นิรภัย', 'ทำความสะอาดภายใน ภายนอก และจุดสะสมฝุ่นหรือคราบ', 'ตรวจระบบกลไก การเคลื่อนที่ สายพาน ลูกปืน รางนำ และสกรู', 'ตรวจและเติมสารหล่อลื่นตามจุดที่กำหนด', 'ตรวจระบบลม สุญญากาศ ระบบระบายความร้อน ไส้กรอง และพัดลม (ถ้ามี)', 'ตรวจเซนเซอร์ สวิตช์ ลิมิต เอนโค้ดเดอร์ และสัญญาณผิดปกติ', 'ตรวจวัสดุสิ้นเปลืองและชิ้นส่วนสึกหรอ พร้อมประเมินอายุการใช้งาน', 'ทดสอบการทำงาน สอบเทียบ และทดลองเดินเครื่องหลัง PM', 'ตรวจบันทึกข้อผิดพลาดและสัญญาณเตือน พร้อมบันทึกค่าที่สำคัญ', 'ติดป้าย PM และกำหนดวัน PM ครั้งถัดไป'],
    Maintenance: ['ตรวจสภาพเครื่องและอาการผิดปกติก่อนบำรุงรักษา', 'ตรวจชิ้นส่วนกลไก แนวศูนย์ ระยะห่าง และจุดยึด', 'ตรวจระบบไฟฟ้า แหล่งจ่ายไฟ ระบบควบคุม และขั้วต่อ', 'ตรวจระบบลม สุญญากาศ และระบบระบายความร้อน', 'ตรวจเซนเซอร์ อุปกรณ์ขับเคลื่อน มอเตอร์ และชุดควบคุม', 'ทำความสะอาดและหล่อลื่นจุดสำคัญ', 'ปรับตั้ง แนวศูนย์ และขันยึดตามความจำเป็น', 'ตรวจชิ้นส่วนสึกหรอและวางแผนรายการที่ควรเปลี่ยน', 'ตรวจการสอบเทียบ ค่าพารามิเตอร์ และซอฟต์แวร์ (ถ้ามี)', 'ทดสอบการทำงานและทดสอบภาระหลังบำรุงรักษา', 'บันทึกคำแนะนำและแผนบำรุงรักษาครั้งถัดไป'],
    Service: ['ยืนยันอาการเสียกับลูกค้าและตรวจรับอาการ', 'ตรวจรหัสข้อผิดพลาด สัญญาณเตือน บันทึกเหตุการณ์ และอาการที่เกิดขึ้น', 'ตรวจระบบไฟฟ้า แหล่งจ่ายไฟ ขั้วต่อ ฟิวส์ และเบรกเกอร์', 'ตรวจระบบกลไก การเคลื่อนที่ เซนเซอร์ และอุปกรณ์ขับเคลื่อน', 'วิเคราะห์สาเหตุของปัญหา', 'ดำเนินการซ่อมและปรับตั้ง', 'ตรวจและบันทึกอะไหล่ที่เปลี่ยน หมายเลขอะไหล่ จำนวน และหมายเลขประจำชิ้น', 'ทดสอบการทำงานหลังซ่อม', 'ทดสอบร่วมกับลูกค้าและยืนยันว่าแก้ปัญหาแล้ว', 'แจ้งคำแนะนำและแนวทางป้องกันปัญหาซ้ำ', 'ส่งมอบงานและบันทึกการรับทราบของลูกค้า']
  };
  var RESULTS = [{ v: 'ผ่าน', cls: 'ok', icon: '✓' }, { v: 'พอใช้', cls: 'fair', icon: '~' }, { v: 'แก้ไข', cls: 'fix', icon: '!' }];
  var FACES = [[1, '😞', 'ไม่พอใจมาก'], [2, '🙁', 'ไม่พอใจ'], [3, '😐', 'พอใช้'], [4, '🙂', 'พอใจ'], [5, '😍', 'พอใจมาก']];
  var MAX_PHOTOS = 4, MAX_VIDEOS = 2, MAX_VIDEO_MB = 2.5, INK_MIN = 16;
  var rep = null;

  function workTypeOf(c) {
    var s = String(c && c.service_type || '').toLowerCase();
    return s.indexOf('pm') >= 0 || s.indexOf('preventive') >= 0 ? 'PM' : s.indexOf('maintenance') >= 0 ? 'Maintenance' : 'Service';
  }
  /* old reports answered OK / NG; map what maps and leave the rest unanswered (js/77) */
  function normResult(v) {
    v = String(v || '');
    if (RESULTS.some(function (r) { return r.v === v; })) return v;
    return v === 'OK' ? 'ผ่าน' : v === 'NG' ? 'แก้ไข' : '';
  }
  /* only the labels come from the template; an answer is carried over only from a real earlier one */
  function checklistFor(type, prior) {
    prior = Array.isArray(prior) ? prior : [];
    return (CHECKS[type] || CHECKS.Service).map(function (label, i) {
      var p = prior.filter(function (o) { return o && o.label === label; })[0] || prior[i] || null;
      return { label: label, result: p ? normResult(p.result) : '', note: p ? String(p.note || '') : '' };
    });
  }
  function draftKey(id) { return 'imode.reportDraft.' + id; }
  function saveDraft() {
    if (!rep) return;
    var f = Object.assign({}, rep.f, { videos: [] });
    try { localStorage.setItem(draftKey(rep.c.id), JSON.stringify({ at: Date.now(), f: f })); }
    catch (e) { try { localStorage.setItem(draftKey(rep.c.id), JSON.stringify({ at: Date.now(), f: Object.assign({}, f, { before: [], after: [] }) })); } catch (e2) {} }
  }
  var draftTimer = null;
  function touch() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }

  async function openReport(id) {
    app.innerHTML = '<div class="screen"><div class="loading"><span class="spin" aria-hidden="true"></span>กำลังเปิดใบตรวจงาน</div></div>';
    try {
      var c = await freshCase(id);
      var r = await client().from('service_reports').select('*').eq('case_id', id).order('updated_at', { ascending: false }).limit(1);
      if (r.error) throw new Error(friendly(r.error));
      var old = (r.data && r.data[0]) || null, fb = null;
      try {
        var s = await client().from('system_settings').select('fb:data->caseFeedback').eq('id', 'main').maybeSingle();
        fb = s.data && s.data.fb && s.data.fb[id] || null;
      } catch (e) {}
      var o = old || {}, type = o.work_type || workTypeOf(c);
      var f = {
        workType: type, checklist: checklistFor(type, o.checklist), diagnosis: o.diagnosis || '', work: o.work_performed || '',
        recommend: o.recommendation || '', parts: Array.isArray(o.parts) ? o.parts : [], before: o.before_photos || [], after: o.after_photos || [],
        videos: o.videos || [], accept: o.customer_accept || c.contact || '', nextPm: o.next_pm || '',
        rating: fb ? Number(fb.rating) || 0 : 0, comment: fb ? String(fb.comment || '') : '', csig: o.customer_signature || '', tsig: o.tech_signature || ''
      };
      var d = null; try { d = JSON.parse(lsGet(draftKey(id)) || 'null'); } catch (e) {}
      var fromDraft = !!(d && d.f && (!old || d.at > Date.parse(old.updated_at || 0)));
      if (fromDraft) { var v = f.videos; f = Object.assign(f, d.f); if (!f.videos.length) f.videos = v; }
      rep = { c: c, old: old, f: f, undo: { cs: [], ts: [] } };
      if (location.hash !== '#/report/' + encodeURIComponent(id)) return;
      renderReport();
      if (fromDraft) toast('เปิดฉบับร่างที่ยังไม่ได้ส่ง');
    } catch (e) { toast(e.message); history.back(); }
  }

  function photoGrid(kind) {
    var list = rep.f[kind];
    return '<div class="rp-photos">' + list.map(function (src, i) {
      return '<span class="rp-ph"><img src="' + esc(src) + '" alt="" data-view="' + kind + '|' + i + '"><button type="button" class="rp-del" data-del="' + kind + '|' + i + '" aria-label="ลบรูป">' + I.x + '</button></span>';
    }).join('') + (list.length < MAX_PHOTOS ? '<label class="rp-add">' + I.cam + '<span>เพิ่มรูป</span><input type="file" accept="image/*" multiple hidden data-add="' + kind + '"></label>' : '') + '</div>';
  }
  function partsHTML() {
    var p = rep.f.parts;
    return (p.length ? p.map(function (x, i) {
      return '<div class="rp-part" data-part="' + i + '"><div class="rp-part-row"><input placeholder="Part No." value="' + esc(x.partNo || '') + '" data-pf="partNo"><input type="number" min="1" inputmode="numeric" value="' + (Number(x.qty) || 1) + '" data-pf="qty" aria-label="จำนวน"></div>' +
        '<input placeholder="ชื่ออะไหล่" value="' + esc(x.name || '') + '" data-pf="name"><div class="rp-part-row"><input placeholder="หมายเหตุ / S/N" value="' + esc(x.note || '') + '" data-pf="note">' +
        '<button type="button" class="rp-del2" data-pdel="' + i + '" aria-label="ลบอะไหล่">' + I.x + '</button></div></div>';
    }).join('') : '<p class="rp-empty">ยังไม่มีอะไหล่ที่เปลี่ยน</p>') + '<button type="button" class="rp-more" id="rpPart">＋ เพิ่มอะไหล่</button>';
  }
  function checkHTML() {
    return rep.f.checklist.map(function (x, i) {
      return '<div class="rp-chk' + (x.result ? '' : ' blank') + '"><div class="rp-chk-t"><span>' + (i + 1) + '</span><b>' + esc(x.label) + '</b></div>' +
        '<div class="rp-pick">' + RESULTS.map(function (r) {
          return '<button type="button" class="is-' + r.cls + '" data-set="' + i + '|' + r.v + '" aria-pressed="' + (x.result === r.v) + '"><i aria-hidden="true">' + r.icon + '</i>' + r.v + '</button>';
        }).join('') + '<button type="button" class="rp-note' + (x.note ? ' on' : '') + '" data-note="' + i + '" aria-label="หมายเหตุข้อ ' + (i + 1) + '">📝</button></div>' +
        (x.note ? '<p class="rp-notetext">' + esc(x.note) + '</p>' : '') + '</div>';
    }).join('');
  }
  function padHTML(key, label) {
    return '<div class="rp-sign"><div class="rp-sign-h"><b>' + label + '</b><span><button type="button" data-sundo="' + key + '">↶ ย้อนกลับ</button><button type="button" data-sclr="' + key + '">ล้าง</button></span></div>' +
      '<canvas id="sig-' + key + '" width="560" height="180" aria-label="' + label + '"></canvas><small>ใช้นิ้วเซ็นในกรอบ</small></div>';
  }
  function renderReport() {
    var c = rep.c, f = rep.f, closed = CLOSED.indexOf(String(c.status || '')) >= 0;
    var answered = f.checklist.filter(function (x) { return x.result; }).length;
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row">' +
      '<button type="button" class="icon-btn" id="rb" aria-label="กลับ">' + I.back + '</button>' +
      '<div class="grow"><small>' + esc([c.ticket, rep.old && rep.old.report_no].filter(Boolean).join(' · ')) + '</small><b class="t">ใบตรวจงาน · ' + esc(c.customer || '-') + '</b></div></div></header>' +
      '<div class="scroll" id="rs"><div class="body rp">' +
      '<section class="info"><h2>ประเภทใบตรวจ</h2><div class="rp-seg" role="radiogroup" aria-label="ประเภทใบตรวจ">' +
      ['PM', 'Maintenance', 'Service'].map(function (t) { return '<button type="button" role="radio" data-wt="' + t + '" aria-checked="' + (f.workType === t) + '">' + t + '</button>'; }).join('') + '</div>' +
      '<small class="rp-hint">เครื่อง ' + esc([c.machine, c.model].filter(Boolean).join(' ') || '-') + ' · ซีเรียล ' + esc(c.serial || '-') + '</small></section>' +
      '<section class="info"><h2>เช็กลิสต์ตรวจเครื่อง <small class="rp-count">' + answered + '/' + f.checklist.length + '</small></h2><small class="rp-hint">เลือก ผ่าน / พอใช้ / แก้ไข ทีละข้อ กด 📝 เพื่อเขียนหมายเหตุ</small><div class="rp-chks" id="rpChk">' + checkHTML() + '</div></section>' +
      '<section class="info"><h2>งานที่ดำเนินการ</h2>' +
      '<div class="field"><label for="rpDia">การวิเคราะห์ / ผลการตรวจพบ</label><textarea id="rpDia" rows="3" data-ff="diagnosis" placeholder="เช่น ลูกปืนแกน X สึก มีเสียงดังตอนเดินเครื่อง">' + esc(f.diagnosis) + '</textarea></div>' +
      '<div class="field"><label for="rpWork">งานที่ดำเนินการ</label><textarea id="rpWork" rows="3" data-ff="work" placeholder="เช่น เปลี่ยนลูกปืน ปรับตั้งแนวศูนย์ ทดสอบเดินเครื่อง 30 นาที">' + esc(f.work) + '</textarea></div>' +
      '<div class="field"><label for="rpRec">คำแนะนำ / งานที่ควรทำต่อ</label><textarea id="rpRec" rows="2" data-ff="recommend" placeholder="เช่น ควรเปลี่ยนสายพานภายใน 3 เดือน">' + esc(f.recommend) + '</textarea></div></section>' +
      '<section class="info"><h2>อะไหล่ที่เปลี่ยน</h2><div id="rpParts">' + partsHTML() + '</div></section>' +
      '<section class="info"><h2>รูปก่อนทำงาน <small class="rp-count">' + f.before.length + '/' + MAX_PHOTOS + '</small></h2>' + photoGrid('before') +
      '<h2>รูปหลังทำงาน <small class="rp-count">' + f.after.length + '/' + MAX_PHOTOS + '</small></h2>' + photoGrid('after') +
      '<h2>วิดีโอ <small class="rp-count">' + f.videos.length + '/' + MAX_VIDEOS + '</small></h2><div class="rp-videos">' +
      f.videos.map(function (v, i) { return '<div class="rp-vid"><span>🎬 ' + esc(v.name || 'วิดีโอ') + '</span><button type="button" class="rp-del2" data-vdel="' + i + '" aria-label="ลบวิดีโอ">' + I.x + '</button></div>'; }).join('') +
      (f.videos.length < MAX_VIDEOS ? '<label class="rp-more">🎥 เพิ่มวิดีโอ (ไม่เกิน ' + MAX_VIDEO_MB + ' MB)<input type="file" accept="video/*" hidden id="rpVid"></label>' : '') + '</div></section>' +
      '<section class="info"><h2>ส่งมอบงาน</h2>' +
      '<div class="field"><label for="rpAcc">ผู้รับมอบงาน / ลูกค้า</label><input id="rpAcc" data-ff="accept" value="' + esc(f.accept) + '" autocomplete="off"></div>' +
      '<div class="field' + (f.workType === 'PM' ? '' : ' off') + '"><label for="rpPm">PM ครั้งถัดไป</label><input id="rpPm" type="date" data-ff="nextPm" value="' + esc(f.nextPm) + '"' + (f.workType === 'PM' ? '' : ' disabled') + '>' + (f.workType === 'PM' ? '' : '<small class="rp-hint">ใช้ได้เฉพาะใบตรวจประเภท PM</small>') + '</div>' +
      padHTML('cs', 'ลายเซ็นลูกค้า / ผู้รับมอบงาน') + padHTML('ts', 'ลายเซ็นทีมช่าง') + '</section>' +
      '<section class="info"><h2>ความพึงพอใจของลูกค้า</h2><small class="rp-hint">ให้ลูกค้าให้คะแนนหลังเซ็นรับงาน</small><div class="rp-faces" role="radiogroup" aria-label="คะแนนความพึงพอใจ">' +
      FACES.map(function (x) { return '<button type="button" role="radio" data-rate="' + x[0] + '" aria-checked="' + (f.rating === x[0]) + '"><i aria-hidden="true">' + x[1] + '</i><span>' + x[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="field"><label for="rpCom">ความเห็นของลูกค้า</label><textarea id="rpCom" rows="2" data-ff="comment" placeholder="ความเห็นเพิ่มเติม (ถ้ามี)">' + esc(f.comment) + '</textarea></div></section>' +
      '<p class="note">ข้อมูลที่กรอกจะเก็บเป็นฉบับร่างในเครื่องนี้ จนกว่าจะกดส่ง</p>' +
      '</div></div>' +
      '<div class="bar"><button type="button" class="next" id="rsend">' + (closed ? 'บันทึกใบตรวจ' : 'ส่งใบตรวจ และจบงาน') + I.arrow + '</button></div></div>';
    wireReport();
  }
  function wireReport() {
    var f = rep.f, root = app;
    document.getElementById('rb').onclick = function () { saveDraft(); history.length > 1 ? history.back() : (location.hash = '#/job/' + encodeURIComponent(rep.c.id)); };
    root.querySelectorAll('[data-ff]').forEach(function (el) { el.oninput = function () { f[el.getAttribute('data-ff')] = el.value; touch(); }; });
    root.querySelectorAll('[data-wt]').forEach(function (b) { b.onclick = function () {
      var t = b.getAttribute('data-wt'); if (t === f.workType) return;
      f.workType = t; f.checklist = checklistFor(t, f.checklist); touch(); keepScroll(renderReport);
    }; });
    var chk = document.getElementById('rpChk');
    chk.onclick = function (e) {
      var s = e.target.closest('[data-set]'), n = e.target.closest('[data-note]');
      if (s) { var a = s.getAttribute('data-set').split('|'), x = f.checklist[+a[0]]; x.result = x.result === a[1] ? '' : a[1]; touch(); keepScroll(renderReport); }
      if (n) noteSheet(+n.getAttribute('data-note'));
    };
    var parts = document.getElementById('rpParts');
    parts.oninput = function (e) {
      var row = e.target.closest('[data-part]'), k = e.target.getAttribute('data-pf'); if (!row || !k) return;
      var p = f.parts[+row.getAttribute('data-part')]; p[k] = k === 'qty' ? (Number(e.target.value) || 1) : e.target.value; touch();
    };
    parts.onclick = function (e) {
      if (e.target.closest('#rpPart')) { f.parts.push({ partNo: '', name: '', qty: 1, note: '' }); touch(); keepScroll(renderReport); }
      var d = e.target.closest('[data-pdel]'); if (d) { f.parts.splice(+d.getAttribute('data-pdel'), 1); touch(); keepScroll(renderReport); }
    };
    root.querySelectorAll('[data-add]').forEach(function (inp) { inp.onchange = async function () {
      var kind = inp.getAttribute('data-add'), files = [].slice.call(inp.files || []).slice(0, MAX_PHOTOS - f[kind].length);
      for (var i = 0; i < files.length; i++) { try { f[kind].push(await shrink(files[i], 1000, 0.78)); } catch (e) { toast(e.message); } }
      touch(); keepScroll(renderReport);
    }; });
    root.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = async function () {
      var a = b.getAttribute('data-del').split('|');
      if (await confirmSheet('ลบรูปนี้?', 'รูปจะหายจากใบตรวจงาน', 'ลบรูป')) { f[a[0]].splice(+a[1], 1); touch(); keepScroll(renderReport); }
    }; });
    root.querySelectorAll('[data-view]').forEach(function (im) { im.onclick = function () { viewPic(im.getAttribute('src')); }; });
    var vid = document.getElementById('rpVid');
    if (vid) vid.onchange = function () {
      var file = vid.files && vid.files[0]; if (!file) return;
      if (file.size > MAX_VIDEO_MB * 1048576) { toast('วิดีโอใหญ่เกิน ' + MAX_VIDEO_MB + ' MB ลองถ่ายให้สั้นลง'); return; }
      var rd = new FileReader();
      rd.onload = function () { f.videos.push({ name: file.name, type: file.type, size: file.size, data: rd.result }); keepScroll(renderReport); };
      rd.readAsDataURL(file);
    };
    root.querySelectorAll('[data-vdel]').forEach(function (b) { b.onclick = function () { f.videos.splice(+b.getAttribute('data-vdel'), 1); keepScroll(renderReport); }; });
    root.querySelectorAll('[data-rate]').forEach(function (b) { b.onclick = function () { var v = +b.getAttribute('data-rate'); f.rating = f.rating === v ? 0 : v; touch(); keepScroll(renderReport); }; });
    initPad('cs'); initPad('ts');
    document.getElementById('rsend').onclick = sendReport;
  }
  function keepScroll(fn) { var s = document.getElementById('rs'), y = s ? s.scrollTop : 0; fn(); var n = document.getElementById('rs'); if (n) n.scrollTop = y; }
  function noteSheet(i) {
    var x = rep.f.checklist[i], w = document.createElement('div');
    w.innerHTML = '<div class="scrim top-dialog" role="dialog" aria-modal="true" aria-labelledby="nt-t"><form class="sheet" id="nt-f">' +
      '<h2 id="nt-t">📝 หมายเหตุข้อ ' + (i + 1) + '</h2><p>' + esc(x.label) + '</p>' +
      '<div class="field"><textarea id="nt-i" rows="4" placeholder="พิมพ์สิ่งที่พบ หรือสิ่งที่ต้องแก้ไข">' + esc(x.note) + '</textarea></div>' +
      '<div class="sheet-actions"><button type="button" id="nt-c">ยกเลิก</button><button type="submit" class="primary">บันทึก</button></div></form></div>';
    var s = w.firstChild; document.body.appendChild(s);
    var t = document.getElementById('nt-i'); setTimeout(function () { try { t.focus(); } catch (e) {} }, 120);
    s.addEventListener('click', function (e) { if (e.target === s) s.remove(); });
    document.getElementById('nt-c').onclick = function () { s.remove(); };
    document.getElementById('nt-f').onsubmit = function (e) {
      e.preventDefault(); var v = t.value.trim(); x.note = v; s.remove(); touch(); keepScroll(renderReport);
      toast(v ? 'เพิ่มหมายเหตุแล้ว' : 'ลบหมายเหตุแล้ว');
    };
  }
  /* the signature pads: the same 560×180 transparent PNG the web stores; ย้อนกลับ undoes one stroke, ล้าง too */
  function initPad(key) {
    var cv = document.getElementById('sig-' + key); if (!cv) return;
    var g = cv.getContext('2d'), field = key === 'cs' ? 'csig' : 'tsig', stack = rep.undo[key], drawing = false;
    function style() { g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#173b8f'; }
    function load(src, done) { g.clearRect(0, 0, cv.width, cv.height); if (!src) return done && done(); var im = new Image(); im.onload = function () { g.drawImage(im, 0, 0, cv.width, cv.height); if (done) done(); }; im.src = src; }
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
    style(); load(rep.f[field]);
    cv.onpointerdown = function (e) { e.preventDefault(); stack.push(rep.f[field]); if (stack.length > 20) stack.shift(); drawing = true; style(); var p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + .1, p.y + .1); g.stroke(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
    cv.onpointermove = function (e) { if (!drawing) return; var p = pos(e); g.lineTo(p.x, p.y); g.stroke(); };
    cv.onpointerup = cv.onpointercancel = function () { if (!drawing) return; drawing = false; rep.f[field] = cv.toDataURL('image/png'); touch(); };
    app.querySelector('[data-sundo="' + key + '"]').onclick = function () { if (!stack.length) return toast('ไม่มีอะไรให้ย้อนกลับ'); rep.f[field] = stack.pop(); load(rep.f[field]); touch(); };
    app.querySelector('[data-sclr="' + key + '"]').onclick = function () { if (!rep.f[field]) return; stack.push(rep.f[field]); rep.f[field] = ''; load(''); touch(); };
  }
  /* js/68: a blank pad still makes a valid (transparent) PNG, so count the ink, not the string */
  function hasInk(src) {
    return new Promise(function (res) {
      if (!src) return res(false);
      var im = new Image();
      im.onload = function () {
        var cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
        var g = cv.getContext('2d'); g.drawImage(im, 0, 0);
        var d = g.getImageData(0, 0, cv.width, cv.height).data, n = 0;
        for (var i = 3; i < d.length; i += 4) if (d[i] > 0 && ++n > INK_MIN) return res(true);
        res(false);
      };
      im.onerror = function () { res(false); };
      im.src = src;
    });
  }
  async function nextReportNo() {
    var d = new Date(), p = 'SR-' + d.getFullYear() + pad2(d.getMonth() + 1) + '-', n = 1;
    var r = await client().from('service_reports').select('report_no').like('report_no', p + '%');
    if (r.error) throw new Error(friendly(r.error));
    (r.data || []).forEach(function (x) { n = Math.max(n, (parseInt(String(x.report_no).split('-').pop(), 10) || 0) + 1); });
    return p + String(n).padStart(3, '0');
  }
  async function sendReport() {
    if (busy || !rep) return;
    var f = rep.f, c = rep.c, closed = CLOSED.indexOf(String(c.status || '')) >= 0;
    if (!(await hasInk(f.csig))) {
      var go = await confirmSheet('ยังไม่ได้ลายเซ็นลูกค้า', 'ต้องให้ลูกค้าเซ็นรับงานก่อนถึงจะส่งใบตรวจและจบงานได้', 'ไปที่ช่องเซ็น');
      if (go) { var pad = document.getElementById('sig-cs'); if (pad) pad.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    var blank = f.checklist.filter(function (x) { return !x.result; }).length;
    var ok = await confirmSheet(closed ? 'บันทึกใบตรวจ?' : 'ส่งใบตรวจและจบงาน?',
      (blank ? 'เช็กลิสต์ยังไม่ได้เลือก ' + blank + ' ข้อ (จะพิมพ์เป็นช่องว่าง) ' : '') + (closed ? 'ใบตรวจของงานนี้จะถูกแก้ตามที่กรอก' : 'งานนี้จะย้ายออกจากงานของฉัน และออฟฟิศจะเห็นใบตรวจทันที'),
      closed ? 'บันทึก' : 'จบงาน');
    if (!ok) return;
    busy = true;
    var btn = document.getElementById('rsend'); btn.disabled = true; btn.textContent = 'กำลังส่งใบตรวจ…';
    try {
      var fresh = await freshCase(c.id), now = new Date().toISOString(), old = rep.old;
      var arrived = (fresh.field_status_log || []).filter(function (x) { return x && x.status === ARRIVED; })[0];
      var row = {
        id: old ? old.id : uid(), report_no: old && old.report_no ? old.report_no : await nextReportNo(), case_id: fresh.id,
        customer_id: fresh.customer_id || null, machine_id: fresh.machine_id || null, tech_id: fresh.assignee || null,
        service_type: fresh.service_type || '', work_type: f.workType, check_in_at: arrived ? arrived.createdAt : (old && old.check_in_at) || null,
        appointment: fresh.appointment || null, checklist: f.checklist, diagnosis: f.diagnosis.trim(), work_performed: f.work.trim(),
        recommendation: f.recommend.trim(), parts: f.parts.filter(function (p) { return p.partNo || p.name; }), before_photos: f.before, after_photos: f.after,
        videos: f.videos, status_log: fresh.field_status_log || [], customer_accept: f.accept.trim(), customer_signature: f.csig, tech_signature: f.tsig,
        next_pm: f.workType === 'PM' && f.nextPm ? f.nextPm : (old && old.next_pm) || null, line_sent_at: old ? old.line_sent_at : null,
        line_send_status: old ? old.line_send_status || '' : '', status: 'Completed', created_at: old ? old.created_at : now, updated_at: now
      };
      var w = await client().from('service_reports').upsert(row);
      if (w.error) throw new Error(friendly(w.error));
      var stillClosed = CLOSED.indexOf(String(fresh.status || '')) >= 0;
      if (!stillClosed) {
        var log = (fresh.field_status_log || []).slice();
        log.push({ id: uid(), status: DONE, note: 'บันทึกใบตรวจและลงลายเซ็นจบงาน', media: [], createdAt: now, techId: me.techId, source: 'app' });
        var u = await client().from('service_cases').update({ field_status: DONE, field_status_log: log, status: 'เสร็จสิ้น', updated_at: now }).eq('id', fresh.id).select('id').maybeSingle();
        if (u.error) throw new Error(friendly(u.error));
      }
      if (f.rating || f.comment.trim()) {
        try {
          var s = await client().from('system_settings').select('data').eq('id', 'main').maybeSingle();
          if (s.data && s.data.data) {
            var data = s.data.data; data.caseFeedback = data.caseFeedback || {};
            data.caseFeedback[fresh.id] = { rating: f.rating, comment: f.comment.trim(), at: now, by: me.name || me.username || '' };
            await client().from('system_settings').update({ data: data, updated_at: now }).eq('id', 'main');
          }
        } catch (e) {}
      }
      client().from('case_messages').insert({ case_id: fresh.id, body: stillClosed ? '📝 ช่างแก้ใบตรวจงาน ' + row.report_no : '✅ ช่างส่งใบตรวจ ' + row.report_no + ' และจบงานแล้ว', photos: [] }).then(function () {}, function () {});
      try { localStorage.removeItem(draftKey(fresh.id)); } catch (e) {}
      if (!stillClosed) jobs = jobs.filter(function (x) { return x.id !== fresh.id; });
      rep = null; busy = false;
      toast(stillClosed ? 'บันทึกใบตรวจ ' + row.report_no + ' แล้ว' : 'ส่งใบตรวจ ' + row.report_no + ' และจบงานแล้ว');
      location.replace('#/jobs');
    } catch (e) {
      busy = false; btn.disabled = false; btn.innerHTML = (closed ? 'บันทึกใบตรวจ' : 'ส่งใบตรวจ และจบงาน') + I.arrow;
      saveDraft(); toast(e.message + ' (ข้อมูลยังเก็บไว้ในเครื่อง ลองส่งใหม่ได้)');
    }
  }

  /* --------------------------------------------------------------- chat ---- */
  /* The same two kinds of chat as the web's chat button (js/141):
       เคส    public.case_messages (js/138, supabase/14): the team chat of one case
       ส่วนตัว public.direct_messages (supabase/15): one-to-one between staff; only the two people
              can read it, and only the recipient marks it read (read_at)
     The server stamps the author and the time on both. Photos are shrunk JPEG data URLs, max 4.
     New messages arrive by realtime, with a pull every 15 s as a fallback.
     A chat can be given its own name (เปลี่ยนชื่อแชท). The names are the technician's own: kept
     in localStorage and in the account (user_metadata.imode_chat_names), so every phone signed
     in to the account shows them; nobody else sees them. */
  var CHAT_COLS = 'id,case_id,body,photos,author_id,author_name,created_at';
  var DM_COLS = 'id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at';
  var AUTO = /^(🔄|↩️|👷|🔧|🏭|📎|✏️)/;
  var COLORS = ['#0b63e5', '#0f8a5f', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f', '#9a3412'];
  var chat = null;   /* { kind: 'case'|'dm', id, msgs, byId, last, chan, timer, pending } */
  function missingTable(err) { return /PGRST205|PGRST202|42P01|does not exist|Could not find/i.test(String(err && (err.code + ' ' + err.message))); }
  /* direct_messages rows use sender_*; give them the case chat's author_* names */
  function norm(m) {
    if (!m || m.sender_id === undefined) return m;
    return { id: m.id, author_id: m.sender_id, author_name: m.sender_name, recipient_id: m.recipient_id, body: m.body, photos: m.photos, created_at: m.created_at, read_at: m.read_at };
  }
  function chatStop() {
    if (!chat) return;
    try { if (chat.chan) client().removeChannel(chat.chan); } catch (e) {}
    clearInterval(chat.timer);
    chat = null;
  }
  function chatAdd(list) {
    var n = 0;
    (list || []).forEach(function (m) { m = norm(m); if (m && m.id && !chat.byId[m.id]) { chat.byId[m.id] = m; chat.msgs.push(m); n++; } });
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
  function when(t) { if (!t) return ''; var d = new Date(t); return dayKey(d) === dayKey(new Date()) ? hhmm(d) : dayLabel(d); }
  function linkify(t) { return esc(t).replace(/(@[^\s@]+(?:\s[^\s@]+)?)/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
  function initials(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase(); }
  function colorOf(n) { var h = 0, s = String(n || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return COLORS[Math.abs(h) % COLORS.length]; }

  /* own names for chats: key 'case:<id>' or 'dm:<user id>' */
  function chatNames() { try { return JSON.parse(lsGet('imode.chatNames') || '{}') || {}; } catch (e) { return {}; } }
  function chatName(key) { var v = chatNames()[key]; return typeof v === 'string' ? v : ''; }
  function namesFromAccount(user) {
    var n = user && user.user_metadata && user.user_metadata.imode_chat_names;
    if (n && typeof n === 'object') lsSet('imode.chatNames', JSON.stringify(n));
  }
  function saveChatName(key, name) {
    var o = chatNames();
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name) o[key] = name; else delete o[key];
    lsSet('imode.chatNames', JSON.stringify(o));
    client().auth.updateUser({ data: { imode_chat_names: o } }).catch(function () {});
  }
  function renameSheet(key, original) {
    var cur = chatName(key);
    var w = document.createElement('div');
    /* a card near the top, not a bottom sheet: the keyboard covers the lower half of the screen */
    w.innerHTML = '<div class="scrim top-dialog" role="dialog" aria-modal="true" aria-labelledby="rn-t"><form class="sheet" id="rn-f">' +
      '<h2 id="rn-t">เปลี่ยนชื่อแชท</h2><p>ชื่อนี้เห็นเฉพาะคุณ ใช้ได้ทุกเครื่องที่เข้าบัญชีนี้ ชื่อเดิมคือ ' + esc(original) + '</p>' +
      '<div class="field"><label for="rn-i">ชื่อแชท</label><input id="rn-i" maxlength="60" autocomplete="off" value="' + esc(cur || original) + '"></div>' +
      '<div class="sheet-actions">' + (cur ? '<button type="button" id="rn-r">ใช้ชื่อเดิม</button>' : '<button type="button" id="rn-c">ยกเลิก</button>') +
      '<button type="submit" class="primary">บันทึก</button></div></form></div>';
    var s = w.firstChild; document.body.appendChild(s);
    var inp = document.getElementById('rn-i');
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 120);
    function done(v) { s.remove(); if (v !== undefined) { saveChatName(key, v === original ? '' : v); route(); } }
    s.addEventListener('click', function (e) { if (e.target === s) done(); });
    var c = document.getElementById('rn-c'); if (c) c.onclick = function () { done(); };
    var r = document.getElementById('rn-r'); if (r) r.onclick = function () { done(''); toast('ใช้ชื่อเดิมแล้ว'); };
    document.getElementById('rn-f').onsubmit = function (e) { e.preventDefault(); done(inp.value.trim()); };
  }

  function chatFeed() {
    if (!chat.msgs.length) return '<div class="empty"><b>ยังไม่มีข้อความ</b>' + (chat.kind === 'dm' ? 'พิมพ์ทักได้เลย' : 'เขียนอัปเดตงานหรือส่งรูปหน้างานให้ทีมได้เลย') + '</div>';
    var out = '', lastDay = '';
    chat.msgs.forEach(function (m) {
      var d = new Date(m.created_at), k = dayKey(d);
      if (k !== lastDay) { out += '<div class="day"><span>' + esc(dayLabel(d)) + '</span></div>'; lastDay = k; }
      var body = String(m.body || ''), ph = Array.isArray(m.photos) ? m.photos : [];
      if (chat.kind === 'case' && AUTO.test(body) && !ph.length) {
        out += '<div class="sys"><span>' + esc(body) + ' · ' + esc(m.author_name || '') + ' ' + hhmm(d) + '</span></div>';
        return;
      }
      var mine = m.author_id === me.id;
      out += '<div class="msg' + (mine ? ' mine' : '') + '">' + (mine || chat.kind === 'dm' ? '' : '<small class="who">' + esc(m.author_name || 'พนักงาน') + '</small>') +
        '<div class="bubble">' + (body ? '<div>' + linkify(body) + '</div>' : '') +
        (ph.length ? '<div class="pics">' + ph.map(function (src, i) {
          return /^data:image\/(jpeg|png|webp);base64,/.test(String(src)) ? '<button type="button" class="pic" data-pic="' + esc(m.id) + '|' + i + '"><img src="' + esc(src) + '" alt="รูปที่ ' + (i + 1) + '"></button>' : '';
        }).join('') + '</div>' : '') +
        '</div><small class="at">' + hhmm(d) + (mine && chat.kind === 'dm' && m.read_at ? ' · อ่านแล้ว' : '') + '</small></div>';
    });
    return out;
  }
  function chatPaint(stick) {
    var feed = document.getElementById('cf'); if (!feed || !chat) return;
    var near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
    feed.innerHTML = chatFeed();
    if (chat.kind === 'case' && chat.last && chat.last > seenAt(chat.id)) lsSet('imode.chatSeen.' + chat.id, chat.last);
    if (stick || near) feed.scrollTop = feed.scrollHeight;
  }
  function chatPending() {
    var box = document.getElementById('cpend'); if (!box) return;
    box.hidden = !chat.pending.length;
    box.innerHTML = chat.pending.map(function (src, i) { return '<span class="pend"><img src="' + src + '" alt=""><button type="button" data-rm="' + i + '" aria-label="เอารูปออก">' + I.x + '</button></span>'; }).join('');
  }
  function shrink(file, max, q) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('ไม่ใช่ไฟล์รูป'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, (max || 1280) / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', q || 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('เปิดรูปไม่ได้')); };
      img.src = url;
    });
  }
  async function chatPull() {
    if (!chat) return;
    var o = chat, q;
    if (o.kind === 'dm') {
      q = client().from('direct_messages').select(DM_COLS)
        .or('and(sender_id.eq.' + me.id + ',recipient_id.eq.' + o.id + '),and(sender_id.eq.' + o.id + ',recipient_id.eq.' + me.id + ')')
        .order('created_at', { ascending: true }).limit(500);
    } else {
      q = client().from('case_messages').select(CHAT_COLS).eq('case_id', o.id).order('created_at', { ascending: true }).limit(500);
    }
    if (o.last) q = q.gt('created_at', o.last);
    var r = await q;
    if (r.error) throw new Error(missingTable(r.error) ? 'ระบบแชทนี้ยังไม่ได้เปิดใช้ ติดต่อผู้ดูแลระบบ' : friendly(r.error));
    if (chat === o && chatAdd(r.data)) chatPaint();
    if (chat === o && o.kind === 'dm') markDmRead(o.id);
  }
  function markDmRead(other) {
    var now = new Date().toISOString(), any = false;
    chat.msgs.concat(hub.dms).forEach(function (m) {
      var from = m.author_id !== undefined ? m.author_id : m.sender_id;
      if (from === other && m.recipient_id === me.id && !m.read_at) { m.read_at = now; any = true; }
    });
    if (!any) return;
    countUnread();
    client().from('direct_messages').update({ read_at: now }).eq('recipient_id', me.id).eq('sender_id', other).is('read_at', null).then(function () {}, function () {});
  }
  function chatTitle(kind, id) {
    if (kind === 'dm') {
      var p = hub.byPerson[id];
      var base = p ? p.name : 'แชทส่วนตัว';
      return { key: 'dm:' + id, base: base, title: chatName('dm:' + id) || base, sub: 'แชทส่วนตัว' + (p && p.role ? ' · ' + p.role : '') };
    }
    var c = jobs.filter(function (x) { return x.id === id; })[0] || {};
    var cb = c.customer || c.ticket || 'แชทเคส', own = chatName('case:' + id);
    return { key: 'case:' + id, base: cb, title: own || cb, sub: 'แชทเคส · ' + (c.ticket || '') + (own && c.customer ? ' · ' + c.customer : '') };
  }
  function renderChat(kind, id) {
    if (!chat || chat.id !== id || chat.kind !== kind) { chatStop(); chat = { kind: kind, id: id, msgs: [], byId: {}, last: '', chan: null, timer: null, pending: [] }; }
    if (kind === 'dm' && !hub.people.length) loadPeople().then(function () { if (chat && chat.id === id) { var t = document.getElementById('ctt'); if (t) t.textContent = chatTitle(kind, id).title; } }, function () {});
    var t = chatTitle(kind, id);
    app.innerHTML = '<div class="screen chat"><header class="head"><div class="head-row">' +
      '<button type="button" class="icon-btn" id="cb" aria-label="กลับ">' + I.back + '</button>' +
      '<div class="grow"><small>' + esc(t.sub) + '</small><b class="t" id="ctt">' + esc(t.title) + '</b></div>' +
      '<button type="button" class="icon-btn" id="crn" aria-label="เปลี่ยนชื่อแชท">' + I.pen + '</button></div></header>' +
      '<div class="scroll feed" id="cf" aria-live="polite"><div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดแชท</div></div>' +
      '<div class="pending" id="cpend" hidden></div>' +
      '<form class="composer" id="cform"><label class="cam" aria-label="แนบรูป">' + I.cam + '<input id="cfile" type="file" accept="image/*" multiple hidden></label>' +
      '<textarea id="ctext" rows="1" placeholder="พิมพ์ข้อความ" aria-label="ข้อความ"></textarea>' +
      '<button type="submit" class="sendb" id="csend" aria-label="ส่ง">' + I.send + '</button></form></div>';
    document.getElementById('cb').onclick = function () { history.length > 1 ? history.back() : (location.hash = kind === 'dm' ? '#/chats' : '#/job/' + encodeURIComponent(id)); };
    document.getElementById('crn').onclick = function () { var x = chatTitle(kind, id); renameSheet(x.key, x.base); };
    var ta = document.getElementById('ctext');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    /* the keyboard pushes the composer up (APK 0.4+); keep the newest message in view */
    ta.addEventListener('focus', function () { setTimeout(function () { var f = document.getElementById('cf'); if (f) f.scrollTop = f.scrollHeight; }, 350); });
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
      var row = { body: text.slice(0, 4000), photos: chat.pending.slice() };
      if (kind === 'dm') row.recipient_id = id; else row.case_id = id;
      var r = await client().from(kind === 'dm' ? 'direct_messages' : 'case_messages').insert(row).select(kind === 'dm' ? DM_COLS : CHAT_COLS).maybeSingle();
      send.disabled = false;
      if (r.error) { toast('ส่งไม่สำเร็จ: ' + (missingTable(r.error) ? 'ระบบแชทนี้ยังไม่ได้เปิดใช้' : friendly(r.error))); return; }
      ta.value = ''; ta.style.height = 'auto'; chat.pending = []; chatPending();
      if (r.data) { if (kind === 'dm') hub.dms.unshift(r.data); if (chatAdd([r.data])) chatPaint(true); }
    };
    chatPending();
    chatPull().then(function () { chatPaint(true); }, function (e) {
      var f = document.getElementById('cf'); if (f) f.innerHTML = '<div class="empty"><b>เปิดแชทไม่ได้</b>' + esc(e.message) + '</div>';
    });
    if (!chat.chan && typeof client().channel === 'function') {
      try {
        var o = chat;
        chat.chan = client().channel('app-chat-' + uid())
          .on('postgres_changes', kind === 'dm'
            ? { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: 'recipient_id=eq.' + me.id }
            : { event: 'INSERT', schema: 'public', table: 'case_messages', filter: 'case_id=eq.' + id }, function (p) {
            if (chat !== o || !p || !p.new) return;
            if (kind === 'dm' && p.new.sender_id !== id) return;
            if (chatAdd([p.new])) { chatPaint(); if (kind === 'dm') markDmRead(id); }
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

  /* ----------------------------------------------------------- calendar ---- */
  /* ปฏิทิน tab, the web's ปฏิทินงาน (js/03 renderCalendar + js/119) on a phone: เดือน (default, as
     on the web), สัปดาห์ and วัน; ของฉัน = my jobs, ทั้งทีม = every case with an appointment. A job
     wears the colour of its technicians (technicians.color, the same values js/99 writes: a
     preset name or c-rrggbb). Read only: appointments are set by the office on the web. */
  var cal = { view: lsGet('imode.calView') || 'month', scope: lsGet('imode.calScope') === 'team' ? 'team' : 'mine', at: null, pick: null };
  var techs = [], techById = {};
  var TECH_PRESET = { blue: '#0b63e5', orange: '#f2751a', green: '#079455', purple: '#8a5bc0' };
  var TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  var TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function techHex(v) {
    v = String(v || '');
    if (/^c-[0-9a-f]{6}$/i.test(v)) return '#' + v.slice(2).toLowerCase();
    if (TECH_PRESET[v]) return TECH_PRESET[v];
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    return TECH_PRESET.blue;
  }
  async function loadTechs() {
    if (techs.length) return;
    var r = await client().from('technicians').select('id,name,color,team');
    if (r.error) return;
    techs = r.data || []; techById = {};
    techs.forEach(function (t) { techById[t.id] = t; });
  }
  function crewColors(c) {
    var cs = crewOf(c).map(function (id) { return techById[id]; }).filter(Boolean).map(function (t) { return techHex(t.color); });
    return cs.length ? cs : ['#8a93ad'];
  }
  function crewNames(c) {
    return crewOf(c).map(function (id) { return techById[id] ? techById[id].name : ''; }).filter(Boolean).join(', ') || 'ยังไม่มอบหมาย';
  }
  function calCases() {
    var list = cal.scope === 'team' ? allCases : allCases.filter(function (c) { return crewOf(c).indexOf(me.techId) >= 0; });
    return list.filter(function (c) { return apptDate(c); }).sort(function (a, b) { return apptDate(a) - apptDate(b); });
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function calRange() {
    var a = cal.at;
    if (cal.view === 'day') return { from: startOfDay(a), to: addDays(startOfDay(a), 1), label: thDate(a) + ' ' + (a.getFullYear() + 543) };
    if (cal.view === 'week') {
      var s = addDays(startOfDay(a), -a.getDay()), e = addDays(s, 7), l = addDays(s, 6);
      return { from: s, to: e, label: s.getDate() + ' ' + TH_MON[s.getMonth()] + ' – ' + l.getDate() + ' ' + TH_MON[l.getMonth()] + ' ' + (l.getFullYear() + 543) };
    }
    var f = new Date(a.getFullYear(), a.getMonth(), 1);
    return { from: f, to: new Date(a.getFullYear(), a.getMonth() + 1, 1), label: TH_MONTH[f.getMonth()] + ' ' + (f.getFullYear() + 543) };
  }
  function calItem(c) {
    var d = apptDate(c), closed = CLOSED.indexOf(String(c.status || '')) >= 0, cols = crewColors(c);
    return '<button type="button" class="cal-job' + (closed ? ' closed' : '') + '" data-cj="' + esc(c.id) + '">' +
      '<span class="cal-bar" aria-hidden="true">' + cols.map(function (h) { return '<i style="background:' + h + '"></i>'; }).join('') + '</span>' +
      '<span class="grow"><span class="crow-top"><b>' + hhmm(d) + ' น. · ' + esc(c.customer || '-') + '</b>' + (closed ? '<span class="chip">ปิดแล้ว</span>' : chipFor(c)) + '</span>' +
      '<small>' + esc([c.machine, c.service_type].filter(Boolean).join(' · ') || '-') + '</small>' +
      '<small>' + esc(crewNames(c)) + '</small></span></button>';
  }
  /* month dots: one dot per job; a job with several technicians is a dot split into their colours
     (asked 2026-10-26), lead technician first, so the dots tell how many jobs and who goes */
  function dotFill(c) {
    var cs = crewColors(c);
    if (cs.length === 1) return cs[0];
    var step = 360 / cs.length;
    return 'conic-gradient(' + cs.map(function (h, i) { return h + ' ' + (i * step) + 'deg ' + ((i + 1) * step) + 'deg'; }).join(',') + ')';
  }
  function dotsFor(list) {
    var max = 4;
    return list.slice(0, max).map(function (c) { return '<i style="background:' + dotFill(c) + '"></i>'; }).join('') +
      (list.length > max ? '<em>+' + (list.length - max) + '</em>' : '');
  }
  function dayBlock(day, list, title) {
    return '<section class="cal-day"><h3>' + esc(title || (thDate(day) + (dayKey(day) === dayKey(new Date()) ? ' · วันนี้' : ''))) + '</h3>' +
      (list.length ? list.map(calItem).join('') : '<p class="cal-none">ไม่มีงานนัดหมาย</p>') + '</section>';
  }
  function calBody() {
    var rg = calRange(), list = calCases().filter(function (c) { var d = apptDate(c); return d >= rg.from && d < rg.to; });
    var byDay = {};
    list.forEach(function (c) { var k = dayKey(apptDate(c)); (byDay[k] = byDay[k] || []).push(c); });
    if (cal.view === 'day') {
      if (cal.scope !== 'team') return dayBlock(rg.from, list);
      /* ทั้งทีม: one card per technician, like the web's day view */
      var out = '';
      techs.forEach(function (t) {
        var mine = list.filter(function (c) { return crewOf(c).indexOf(t.id) >= 0; });
        if (!mine.length) return;
        out += '<section class="cal-day"><h3><i class="dot" style="background:' + techHex(t.color) + '"></i>' + esc(t.name) + '</h3>' + mine.map(calItem).join('') + '</section>';
      });
      var none = list.filter(function (c) { return !crewOf(c).some(function (id) { return techById[id]; }); });
      if (none.length) out += '<section class="cal-day"><h3>ยังไม่มอบหมาย</h3>' + none.map(calItem).join('') + '</section>';
      return out || '<div class="empty"><b>ไม่มีงานนัดหมายวันนี้</b></div>';
    }
    if (cal.view === 'week') {
      var w = '';
      for (var i = 0; i < 7; i++) { var d = addDays(rg.from, i); w += dayBlock(d, byDay[dayKey(d)] || []); }
      return w;
    }
    /* month grid; the picked day's jobs are listed under it */
    var first = rg.from, start = addDays(first, -first.getDay()), today = dayKey(new Date());
    if (!cal.pick || cal.pick < rg.from || cal.pick >= rg.to) cal.pick = dayKey(new Date()) === dayKey(cal.at) || (new Date() >= rg.from && new Date() < rg.to) ? startOfDay(new Date()) : first;
    var g = '<div class="mgrid" role="grid">' + TH_DOW.map(function (n, i) { return '<span class="mdow' + (i === 0 || i === 6 ? ' we' : '') + '">' + n + '</span>'; }).join('');
    for (var k = 0; k < 42; k++) {
      var day = addDays(start, k), key = dayKey(day), jobsOn = byDay[key] || [], inMonth = day.getMonth() === first.getMonth();
      if (k >= 35 && !inMonth) break;
      g += '<button type="button" class="mday' + (inMonth ? '' : ' out') + (key === today ? ' today' : '') + (key === dayKey(cal.pick) ? ' pick' : '') + '" data-md="' + day.getTime() + '"' +
        ' aria-label="' + esc(thDate(day) + (jobsOn.length ? ' ' + jobsOn.length + ' งาน' : '')) + '"><span>' + day.getDate() + '</span><span class="mdots">' +
        dotsFor(jobsOn) + '</span></button>';
    }
    g += '</div>';
    return g + dayBlock(cal.pick, byDay[dayKey(cal.pick)] || []);
  }
  function renderCal(loading) {
    if (!cal.at) cal.at = new Date();
    var rg = calRange();
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row"><div class="grow"><small>ตารางงานและนัดหมาย</small><h1>ปฏิทิน</h1></div>' +
      '<button type="button" class="icon-btn" id="kr" aria-label="โหลดใหม่">' + I.refresh + '</button></div>' +
      '<div class="ctabs three" role="tablist">' + [['month', 'เดือน'], ['week', 'สัปดาห์'], ['day', 'วัน']].map(function (v) {
        return '<button type="button" role="tab" data-cv="' + v[0] + '" aria-selected="' + (cal.view === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div></header>' +
      '<div class="cal-nav"><button type="button" class="back" id="kp" aria-label="ก่อนหน้า">' + I.back + '</button>' +
      '<button type="button" class="cal-label" id="kt">' + esc(rg.label) + '<small>กลับวันนี้</small></button>' +
      '<button type="button" class="back flip" id="kn" aria-label="ถัดไป">' + I.back + '</button></div>' +
      '<div class="pills cal-scope" role="group" aria-label="แสดงงาน">' +
      '<button type="button" data-cs="mine" aria-pressed="' + (cal.scope === 'mine') + '">ของฉัน</button>' +
      '<button type="button" data-cs="team" aria-pressed="' + (cal.scope === 'team') + '">ทั้งทีม</button></div>' +
      '<div class="scroll"><div class="cal-body" id="kb">' + (loading ? '<div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดปฏิทิน</div>' : calBody()) + '</div></div>' +
      navHTML('cal') + '</div>';
    function step(n) {
      var a = new Date(cal.at);
      if (cal.view === 'day') a.setDate(a.getDate() + n); else if (cal.view === 'week') a.setDate(a.getDate() + 7 * n); else { a.setDate(1); a.setMonth(a.getMonth() + n); }
      cal.at = a; cal.pick = null; renderCal();
    }
    document.getElementById('kp').onclick = function () { step(-1); };
    document.getElementById('kn').onclick = function () { step(1); };
    document.getElementById('kt').onclick = function () { cal.at = new Date(); cal.pick = null; renderCal(); };
    document.getElementById('kr').onclick = function () { refreshCal(true); };
    app.querySelectorAll('[data-cv]').forEach(function (b) { b.onclick = function () { cal.view = b.getAttribute('data-cv'); lsSet('imode.calView', cal.view); if (cal.pick) cal.at = new Date(cal.pick); renderCal(); }; });
    app.querySelectorAll('[data-cs]').forEach(function (b) { b.onclick = function () { cal.scope = b.getAttribute('data-cs'); lsSet('imode.calScope', cal.scope); renderCal(); }; });
    var kb = document.getElementById('kb');
    kb.onclick = function (e) {
      var d = e.target.closest('[data-md]');
      if (d) { cal.pick = new Date(Number(d.getAttribute('data-md'))); if (cal.pick.getMonth() !== cal.at.getMonth()) cal.at = new Date(cal.pick); renderCal(); return; }
      var j = e.target.closest('[data-cj]');
      if (j) openCalJob(j.getAttribute('data-cj'));
    };
    wireNav();
  }
  /* my open job: its job page; anything else: a read-only card */
  function openCalJob(id) {
    if (jobs.some(function (c) { return c.id === id; })) { location.hash = '#/job/' + encodeURIComponent(id); return; }
    var c = allCases.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var d = apptDate(c);
    var w = document.createElement('div');
    w.innerHTML = '<div class="scrim" role="dialog" aria-modal="true" aria-labelledby="cj-t"><div class="sheet"><span class="grab" aria-hidden="true"></span>' +
      '<h2 id="cj-t">' + esc(c.customer || '-') + '</h2><p>' + esc(c.ticket || '') + ' · ' + esc(c.status || '') + '</p>' +
      '<div class="kv"><span>นัดหมาย</span><span>' + (d ? esc(thDate(d) + ' ' + hhmm(d) + ' น.') : '-') + '</span>' +
      '<span>ช่าง</span><span>' + esc(crewNames(c)) + '</span>' +
      '<span>เครื่อง</span><span>' + esc([c.machine, c.model].filter(Boolean).join(' ') || '-') + '</span>' +
      '<span>งาน</span><span>' + esc(c.service_type || '-') + '</span>' +
      '<span>สถานที่</span><span>' + esc(c.location || c.branch || '-') + '</span>' +
      (c.field_status ? '<span>หน้างาน</span><span>' + esc(c.field_status) + '</span>' : '') + '</div>' +
      '<p class="note">งานนี้ไม่ได้มอบหมายให้คุณ ดูได้อย่างเดียว</p>' +
      '<div class="sheet-actions"><button type="button" class="primary">ปิด</button></div></div></div>';
    var s = w.firstChild; document.body.appendChild(s);
    s.addEventListener('click', function (e) { if (e.target === s || e.target.closest('.primary')) s.remove(); });
  }
  async function refreshCal(say) {
    try {
      await Promise.all([loadJobs(), loadTechs()]);
      if (say) toast('อัปเดตปฏิทินแล้ว');
    } catch (e) { toast(e.message); }
    if (location.hash === '#/cal') renderCal();
  }

  /* ---------------------------------------------------------- chat list ---- */
  /* แชท tab, two tabs like the web: เคส/งาน (the chats of my open jobs; unread = messages from
     others since I last opened that chat on this phone, imode.chatSeen.<case>) and ส่วนตัว
     (people I talked with first, then everyone; unread = not yet read_at). */
  var unread = 0;
  var hub = { tab: lsGet('imode.chatTab') === 'dm' ? 'dm' : 'case', q: '', people: [], byPerson: {}, dms: [], dmState: '', caseTops: {}, caseState: '', loaded: false };
  function seenAt(id) { return lsGet('imode.chatSeen.' + id) || ''; }
  function unreadIn(id, list) {
    var seen = seenAt(id), from = seen || new Date(Date.now() - 2 * 86400000).toISOString();
    return list.filter(function (m) { return m.author_id !== me.id && m.created_at > from; }).length;
  }
  function caseUnread() { return jobs.reduce(function (n, c) { return n + unreadIn(c.id, hub.caseTops[c.id] || []); }, 0); }
  function dmUnread() { return hub.dms.filter(function (m) { return m.recipient_id === me.id && !m.read_at; }).length; }
  function countUnread() { unread = caseUnread() + dmUnread(); paintBadge(); }
  async function loadPeople() {
    var r = await client().from('profiles').select('id,username,full_name,role,is_active').limit(500);
    if (r.error) return;
    hub.people = (r.data || []).filter(function (p) { return p && p.id !== me.id && p.is_active !== false && !/^customer$/i.test(String(p.role || '')); })
      .map(function (p) { return { id: p.id, name: String(p.full_name || '').trim() || String(p.username || '').trim(), role: String(p.role || '') }; })
      .filter(function (p) { return p.name; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });
    hub.byPerson = {}; hub.people.forEach(function (p) { hub.byPerson[p.id] = p; });
  }
  async function loadDms() {
    var r = await client().from('direct_messages').select('id,sender_id,sender_name,recipient_id,body,created_at,read_at')
      .or('sender_id.eq.' + me.id + ',recipient_id.eq.' + me.id).order('created_at', { ascending: false }).limit(1000);
    if (r.error) { hub.dmState = missingTable(r.error) ? 'nosql' : 'error'; return; }
    hub.dms = r.data || []; hub.dmState = 'ok';
  }
  async function loadCaseTops() {
    var ids = jobs.map(function (c) { return c.id; });
    if (!ids.length) { hub.caseTops = {}; hub.caseState = 'ok'; return; }
    var r = await client().from('case_messages').select('id,case_id,body,author_id,author_name,created_at')
      .in('case_id', ids).order('created_at', { ascending: false }).limit(500);
    if (r.error) { hub.caseState = missingTable(r.error) ? 'nosql' : 'error'; return; }
    var tops = {};
    (r.data || []).forEach(function (m) { (tops[m.case_id] = tops[m.case_id] || []).push(m); });
    hub.caseTops = tops; hub.caseState = 'ok';
  }
  async function loadHub() {
    await Promise.all([loadPeople().catch(function () {}), loadDms().catch(function () { hub.dmState = 'error'; }), loadCaseTops().catch(function () { hub.caseState = 'error'; })]);
    hub.loaded = true;
    countUnread();
  }
  function paintBadge() {
    var b = document.getElementById('nb'); if (b) { b.hidden = !unread; b.textContent = unread > 99 ? '99+' : String(unread); }
    var n = dmUnread(), k = caseUnread();
    var x = document.getElementById('tbdm'); if (x) { x.hidden = !n; x.textContent = String(n); }
    var y = document.getElementById('tbcase'); if (y) { y.hidden = !k; y.textContent = String(k); }
  }
  function match(q, s) { q = String(q || '').trim().toLowerCase(); return !q || String(s || '').toLowerCase().indexOf(q) >= 0; }
  function caseListHTML() {
    if (!hub.loaded) return '<div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดแชท</div>';
    if (hub.caseState === 'nosql') return '<div class="empty"><b>แชทเคสยังไม่เปิดใช้</b>ติดต่อผู้ดูแลระบบ</div>';
    var rows = jobs.map(function (c) { var l = hub.caseTops[c.id] || []; return { c: c, last: l[0] || null, n: unreadIn(c.id, l), name: chatName('case:' + c.id) }; })
      .filter(function (x) { return match(hub.q, [x.name, x.c.ticket, x.c.customer, x.c.machine].join(' ')); })
      .sort(function (a, b) { return String(b.last ? b.last.created_at : '').localeCompare(String(a.last ? a.last.created_at : '')); });
    if (!rows.length) return '<div class="empty"><b>' + (hub.q ? 'ไม่พบเคสนี้' : 'ยังไม่มีงานที่ได้รับมอบหมาย') + '</b>' + (hub.q ? '' : 'แชทของแต่ละเคสจะขึ้นที่นี่') + '</div>';
    return rows.map(function (x) {
      var m = x.last;
      var line = m ? (m.author_id === me.id ? 'คุณ: ' : (m.author_name ? m.author_name + ': ' : '')) + (String(m.body || '').trim() || '📷 รูปภาพ') : 'ยังไม่มีข้อความ';
      return '<button type="button" class="crow" data-chat="' + esc(x.c.id) + '"><span class="av case" aria-hidden="true">' + I.jobs + '</span>' +
        '<span class="grow"><span class="crow-top"><b>' + esc(x.name || x.c.customer || x.c.ticket || '') + '</b><small>' + esc(when(m && m.created_at)) + '</small></span>' +
        '<small class="crow-sub">' + esc(x.c.ticket || '') + (x.name && x.c.customer ? ' · ' + esc(x.c.customer) : '') + '</small>' +
        '<span class="crow-top"><span class="sub">' + esc(line) + '</span>' + (x.n ? '<i class="badge">' + (x.n > 99 ? '99+' : x.n) + '</i>' : '') + '</span></span></button>';
    }).join('');
  }
  function dmListHTML() {
    if (!hub.loaded) return '<div class="loading"><span class="spin" aria-hidden="true"></span>กำลังโหลดแชท</div>';
    if (hub.dmState === 'nosql') return '<div class="empty"><b>แชทส่วนตัวยังไม่เปิดใช้</b>ติดต่อผู้ดูแลระบบ</div>';
    if (hub.dmState === 'error') return '<div class="empty"><b>โหลดแชทส่วนตัวไม่ได้</b>กดปุ่มโหลดใหม่ด้านบน</div>';
    var conv = {};
    hub.dms.forEach(function (m) {
      var other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      var x = conv[other] || (conv[other] = { last: null, n: 0 });
      if (!x.last || m.created_at > x.last.created_at) x.last = m;
      if (m.recipient_id === me.id && !m.read_at) x.n++;
    });
    var talked = [], rest = [];
    hub.people.forEach(function (p) {
      var own = chatName('dm:' + p.id);
      if (!match(hub.q, own + ' ' + p.name + ' ' + p.role)) return;
      (conv[p.id] ? talked : rest).push(p);
    });
    talked.sort(function (a, b) { return conv[a.id].last.created_at < conv[b.id].last.created_at ? 1 : -1; });
    function row(p) {
      var x = conv[p.id], m = x && x.last, own = chatName('dm:' + p.id);
      var line = m ? (m.sender_id === me.id ? 'คุณ: ' : '') + (String(m.body || '').trim() || '📷 รูปภาพ') : (p.role || '');
      return '<button type="button" class="crow" data-dm="' + esc(p.id) + '"><span class="av" style="background:' + colorOf(p.name) + '" aria-hidden="true">' + esc(initials(own || p.name)) + '</span>' +
        '<span class="grow"><span class="crow-top"><b>' + esc(own || p.name) + '</b><small>' + esc(when(m && m.created_at)) + '</small></span>' +
        (own ? '<small class="crow-sub">' + esc(p.name) + '</small>' : '') +
        '<span class="crow-top"><span class="sub">' + esc(line) + '</span>' + (x && x.n ? '<i class="badge">' + (x.n > 99 ? '99+' : x.n) + '</i>' : '') + '</span></span></button>';
    }
    var html = '';
    if (talked.length) html += '<div class="sec">ล่าสุด</div>' + talked.map(row).join('');
    if (rest.length) html += '<div class="sec">ทุกคน</div>' + rest.map(row).join('');
    return html || '<div class="empty"><b>' + (hub.q ? 'ไม่พบชื่อนี้' : 'ยังไม่มีรายชื่อพนักงาน') + '</b></div>';
  }
  function paintChatList() {
    var l = document.getElementById('clist'); if (!l) return;
    l.innerHTML = hub.tab === 'dm' ? dmListHTML() : caseListHTML();
    l.querySelectorAll('[data-chat]').forEach(function (b) { b.onclick = function () { location.hash = '#/chat/' + encodeURIComponent(b.getAttribute('data-chat')); }; });
    l.querySelectorAll('[data-dm]').forEach(function (b) { b.onclick = function () { location.hash = '#/dm/' + encodeURIComponent(b.getAttribute('data-dm')); }; });
    paintBadge();
  }
  function renderChats() {
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row"><div class="grow"><small>คุยส่วนตัว และคุยในเคส/งาน</small><h1>แชท</h1></div>' +
      '<button type="button" class="icon-btn" id="hr" aria-label="โหลดแชทใหม่">' + I.refresh + '</button></div>' +
      '<div class="ctabs" role="tablist">' +
      '<button type="button" role="tab" data-tab="case" aria-selected="' + (hub.tab === 'case') + '">เคส / งาน<i class="badge" id="tbcase" hidden></i></button>' +
      '<button type="button" role="tab" data-tab="dm" aria-selected="' + (hub.tab === 'dm') + '">ส่วนตัว<i class="badge" id="tbdm" hidden></i></button></div></header>' +
      '<div class="csearch"><input id="cq" type="search" placeholder="' + (hub.tab === 'dm' ? 'ค้นหาชื่อคน' : 'ค้นหาเลขเคส / ลูกค้า') + '" aria-label="ค้นหา" value="' + esc(hub.q) + '"></div>' +
      '<div class="scroll"><div class="clist" id="clist"></div></div>' + navHTML('chats') + '</div>';
    document.getElementById('hr').onclick = function () { refreshChats(true); };
    app.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { hub.tab = b.getAttribute('data-tab'); hub.q = ''; lsSet('imode.chatTab', hub.tab); renderChats(); };
    });
    document.getElementById('cq').addEventListener('input', function () { hub.q = this.value; paintChatList(); });
    paintChatList();
    wireNav();
  }
  async function refreshChats(say) {
    try {
      if (!jobs.length) await loadJobs();
      await loadHub();
      if (say) toast('อัปเดตแชทแล้ว');
    } catch (e) { toast(e.message); }
    if (location.hash === '#/chats') paintChatList();
  }

  /* ----------------------------------------------------------------- me ---- */
  function renderMe() {
    var th = THEMES.filter(function (x) { return x.id === appTheme(); })[0];
    app.innerHTML = '<div class="screen"><header class="head"><div class="head-row"><div class="grow"><small>' + esc(me.username) + '</small><h1>' + esc(me.name || 'ฉัน') + '</h1></div></div></header>' +
      '<div class="scroll"><div class="me">' +
      '<button type="button" class="row-btn" id="mt">' + I.palette + '<span class="grow"><b>ธีมหน้าจอ</b><small>' + esc(th ? th.name : '') + '</small></span></button>' +
      (chrome() && chrome().downloadBundle ? '<button type="button" class="row-btn" id="mu">' + I.refresh + '<span class="grow"><b>ตรวจหาอัปเดต</b><small>เวอร์ชันที่ใช้อยู่ ' + VERSION + '</small></span></button>' : '') +
      '<button type="button" class="row-btn danger" id="mo">' + I.out + '<span class="grow"><b>ออกจากระบบ</b></span></button>' +
      '<p class="note">I-MODE แอพทีมช่าง เวอร์ชัน ' + VERSION + '<span id="mapk"></span></p></div></div>' + navHTML('me') + '</div>';
    var P = chrome();
    if (P && P.info) P.info().then(function (i) { var x = document.getElementById('mapk'); if (x) x.textContent = ' · ตัวแอพ ' + (i.name || 'รุ่นเก่ากว่า 0.6'); }, function () {});
    document.getElementById('mt').onclick = function () { openThemeSheet(); };
    document.getElementById('mo').onclick = signOut;
    var mu = document.getElementById('mu');
    if (mu) mu.onclick = async function () {
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
    document.querySelectorAll('.scrim:not(.upd-pop)').forEach(function (s) { s.remove(); });
    if (!me) return renderLogin();
    var h = location.hash || '#/jobs', m;
    if ((m = /^#\/chat\/(.+)$/.exec(h))) return renderChat('case', decodeURIComponent(m[1]));
    if ((m = /^#\/dm\/(.+)$/.exec(h))) return renderChat('dm', decodeURIComponent(m[1]));
    chatStop();
    if ((m = /^#\/report\/(.+)$/.exec(h))) return openReport(decodeURIComponent(m[1]));
    rep = null;
    if ((m = /^#\/job\/(.+)$/.exec(h))) return renderJob(decodeURIComponent(m[1]));
    if (h === '#/me') return renderMe();
    if (h === '#/cal') { renderCal(!allCases.length || !techs.length); return refreshCal(); }
    if (h === '#/chats') { renderChats(); return refreshChats(); }
    renderJobs(!jobs.length);
    if (!jobs.length) refreshJobs();
  }
  window.addEventListener('hashchange', route);

  /* ------------------------------------------------- phone Back button ---- */
  /* MainActivity hands the Android Back button to this function and leaves the app only when it
     answers 'exit'. Back closes an open sheet or pop-up first, then goes to the previous page; the
     other tabs go back to งาน; on งาน (or the login page) the first press only warns, and a second
     press within 2 seconds leaves the app. */
  var backAt = 0;
  var TABS = ['#/cal', '#/chats', '#/me'];
  window.imodeBack = function () {
    if (document.querySelector('.updating')) {
      if (upd.running) return 'stay';                        /* never cut an update in the middle */
      document.querySelector('.updating').remove(); return 'stay';
    }
    var later = document.getElementById('up-later');
    if (later) { later.click(); return 'stay'; }             /* Back on the update pop-up = อัปเดตภายหลัง */
    var all = document.querySelectorAll('.scrim'), s = all[all.length - 1];
    if (s) {
      /* tap the backdrop, so each sheet closes its own way (a confirm answers ยกเลิก) */
      s.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (s.isConnected) s.remove();
      return 'stay';
    }
    var h = location.hash || '#/jobs';
    if (me && TABS.indexOf(h) >= 0) { location.hash = '#/jobs'; return 'stay'; }
    if (me && h !== '#/jobs') {
      /* a job or a chat: the page it was opened from; if there is none, its parent page */
      var m = /^#\/(?:chat|report)\/(.+)$/.exec(h), parent = m ? '#/job/' + m[1] : /^#\/dm\//.test(h) ? '#/chats' : '#/jobs';
      if (rep) saveDraft();
      history.back();
      setTimeout(function () { if (location.hash === h) location.hash = parent; }, 250);
      return 'stay';
    }
    if (Date.now() - backAt < 2000) return 'exit';
    backAt = Date.now();
    toast('กดกลับอีกครั้งเพื่อออกจากแอพ');
    return 'stay';
  };
  /* back on screen after the phone slept or another app: pull fresh jobs */
  /* MainActivity calls this every time the app comes back on screen (the WebView does not always
     fire visibilitychange then); checkUpdate itself skips a second look within a minute */
  window.imodeResume = function () {
    /* back from Android's "install unknown apps" page: open the install screen now */
    if (upd.apkWait && document.querySelector('.updating')) {
      var P = chrome();
      if (P) P.info().then(function (i) { if (i.canInstall) { upd.apkWait = false; installApk(); } }, function () {});
      return;
    }
    checkUpdate(false);
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkUpdate(false);
    if (document.visibilityState === 'visible' && me && !busy) {
      if (chat) { chatPull().catch(function () {}); return; }   /* keep what is being typed */
      if (rep) return;   /* the ใบตรวจ is open: coming back from the camera must not redraw it */
      loadJobs().then(function () { if (!document.querySelector('.scrim')) route(); if (location.hash !== '#/chats') loadHub().catch(function () {}); }, function () {});
    }
  });

  /* ------------------------------------------------------- live update ---- */
  /* The screens are files inside the app. A newer set is published with the web system at
     UPDATE_URL (version.json lists every file with its SHA-256). The app checks it on start and
     when it comes back to the screen and offers it; when the technician taps อัปเดต, the native side
     downloads and checks the files behind a loading page, and the app starts again on them. A new APK is needed only
     when version.json asks for newer native features than this APK has. */
  var UPDATE_URL = 'https://imodeservice.github.io/Imodesystem/apps/tech-android/www/version.json';
  /* a newer APK (version.json "apk": code, name, path under apps/tech-android/, sha256, size) is
     offered the same way: the app downloads it and opens Android's install screen (APK 0.6+);
     an older APK has no download of its own, so the phone's browser downloads the file instead */
  var APK_BASE = 'https://imodeservice.github.io/Imodesystem/apps/tech-android/';
  var upd = { at: 0, busy: false, offer: null, running: false, later: '', laterAt: 0, apkWait: false, apk: null };
  function cmpVer(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  function chrome() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppChrome; }
  /* looks only; nothing is downloaded until the technician taps อัปเดต */
  async function checkUpdate(force) {
    var P = chrome();
    if (!P || !P.downloadBundle || upd.busy || upd.running) return 'busy';
    /* looked less than a minute ago: offer what was found then, without asking the server again */
    if (!force && Date.now() - upd.at < 60000) { if (upd.offer) { showOffer(); return 'new'; } return 'busy'; }
    upd.busy = true; upd.at = Date.now();
    try {
      var r = await fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return 'none';
      var text = await r.text(), m = JSON.parse(text);
      if (!m || !m.version || !m.files) return 'none';
      var info = await P.info();
      upd.apk = info;
      var a = m.apk;
      if (a && a.code > (info.code || 0) && /^release\/[A-Za-z0-9_.\-]+\.apk$/.test(String(a.path)) && /^[0-9a-f]{64}$/.test(String(a.sha256))) {
        upd.offer = { apk: a, version: String(a.name || a.code), own: !!(info.apk && P.downloadApk) };
        showOffer(force);
        return 'new';
      }
      if (cmpVer(m.version, VERSION) <= 0) { upd.offer = null; return 'none'; }
      if ((m.native || 1) > (info.native || 1)) { if (force) toast('มีเวอร์ชัน ' + m.version + ' ต้องติดตั้งแอพตัวใหม่ (APK) ขอไฟล์จากผู้ดูแลระบบ'); return 'apk'; }
      upd.offer = { version: String(m.version), text: text, m: m };
      showOffer(force);
      return 'new';
    } catch (e) { if (force) toast('ตรวจอัปเดตไม่สำเร็จ ลองใหม่ภายหลัง'); return 'err'; }
    finally { upd.busy = false; }
  }
  /* a pop-up in the middle of the screen as the app opens: อัปเดตเลย, or อัปเดตภายหลัง, which
     keeps quiet until the app is opened again (ตรวจหาอัปเดต on ฉัน still offers it at once) */
  function showOffer(force) {
    if (!upd.offer || upd.running || document.querySelector('.upd-pop')) return;
    /* อัปเดตภายหลัง counts until the app is opened again: a fresh start, or back on screen after 30 minutes */
    var key = (upd.offer.apk ? 'apk ' : '') + upd.offer.version;
    if (!force && upd.later === key && Date.now() - upd.laterAt < 30 * 60000) return;
    var head = upd.offer.apk ? 'มีแอพเวอร์ชันใหม่' : 'มีอัปเดตใหม่';
    var body = upd.offer.apk
      ? 'แอพเวอร์ชัน ' + esc(upd.offer.version) + (upd.apk && upd.apk.name ? ' (ตอนนี้ใช้ ' + esc(upd.apk.name) + ')' : '') + '<br>' +
        (upd.offer.own ? 'แอพจะโหลดไฟล์ให้ แล้วกด ติดตั้ง ในหน้าต่างของ Android' : 'เบราว์เซอร์จะโหลดไฟล์ให้ แตะไฟล์ที่โหลดเสร็จแล้วกด ติดตั้ง') + '<br>ข้อมูลและการล็อกอินอยู่ครบ'
      : 'เวอร์ชัน ' + esc(upd.offer.version) + ' พร้อมให้อัปเดต (ตอนนี้ใช้ ' + esc(VERSION) + ')<br>ใช้เวลาไม่ถึงนาที แอพจะเริ่มใหม่เอง';
    var w = document.createElement('div');
    w.innerHTML = '<div class="scrim upd-pop" role="alertdialog" aria-modal="true" aria-labelledby="up-t" aria-describedby="up-d"><div class="pop">' +
      '<span class="pop-ico" aria-hidden="true">' + I.refresh + '</span>' +
      '<h2 id="up-t">' + head + '</h2><p id="up-d">' + body + '</p>' +
      '<button type="button" class="pop-btn primary" id="up-now">อัปเดตเลย</button>' +
      '<button type="button" class="pop-btn" id="up-later">อัปเดตภายหลัง</button></div></div>';
    var s = w.firstChild; document.body.appendChild(s);
    var t = document.querySelector('.toast'); if (t) t.remove();
    document.getElementById('up-now').onclick = function () { s.remove(); runUpdate(); };
    document.getElementById('up-later').onclick = function () {
      s.remove(); upd.later = key; upd.laterAt = Date.now();
      toast('อัปเดตได้ทีหลังที่ ฉัน › ตรวจหาอัปเดต');
    };
    setTimeout(function () { try { document.getElementById('up-now').focus(); } catch (e) {} }, 50);
  }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  /* full-screen loading page with a bar. The APK reports progress (bundleProgress events) from
     version 0.3; an older APK sends none, and the bar then just runs without a number. */
  async function runUpdate() {
    var P = chrome(), o = upd.offer;
    if (!P || !o || upd.running) return;
    if (o.apk) return runApk();
    var t = document.getElementById('ctext');
    if (chat && t && t.value.trim()) { toast('ส่งข้อความที่พิมพ์ค้างไว้ก่อน แล้วค่อยอัปเดต'); return; }
    upd.running = true;
    var old = document.querySelector('.upd-pop'); if (old) old.remove();
    var w = document.createElement('div');
    w.className = 'updating'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'กำลังอัปเดตแอพ');
    w.innerHTML = '<img class="updating-logo" src="img/' + (document.documentElement.getAttribute('data-t') === 'light' || document.documentElement.getAttribute('data-t') === 'glass' ? 'logo.png' : 'logo-white.png') + '" alt="I-MODE">' +
      '<h2 id="ut">กำลังอัปเดตเป็นเวอร์ชัน ' + esc(o.version) + '</h2>' +
      '<div class="ubar run" id="ub" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้า"><i id="uf"></i></div>' +
      '<div class="urow"><b id="up"></b><small id="us">กำลังเตรียมไฟล์</small></div>' +
      '<p class="unote" id="un">อย่าเพิ่งปิดแอพ</p><div class="uact" id="ua" hidden></div>';
    document.body.appendChild(w);
    var bar = document.getElementById('ub'), fill = document.getElementById('uf');
    function set(pct, sub) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      bar.classList.remove('run'); fill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct));
      document.getElementById('up').textContent = pct + '%';
      if (sub) document.getElementById('us').textContent = sub;
    }
    var h = null;
    try {
      h = await P.addListener('bundleProgress', function (e) {
        if (!e || !e.total) return;
        set(e.done / e.total * 100, e.unit === 'bytes' ? kb(e.done) + ' จาก ' + kb(e.total) : 'ไฟล์ ' + e.done + ' จาก ' + e.total);
      });
    } catch (e) {}
    try {
      var res = await P.downloadBundle({ version: o.version, manifest: o.text });
      set(100, 'ตรวจไฟล์ครบแล้ว');
      document.getElementById('ut').textContent = 'อัปเดตเสร็จแล้ว';
      document.getElementById('un').textContent = 'กำลังเริ่มแอพใหม่';
      await P.applyBundle({ path: res.path, now: false });
      setTimeout(function () {
        P.applyBundle({ path: res.path, now: true }).catch(function () { document.getElementById('un').textContent = 'ปิดแล้วเปิดแอพใหม่ เพื่อใช้เวอร์ชันใหม่'; });
      }, 700);
    } catch (e) {
      upd.running = false;
      bar.classList.remove('run'); bar.classList.add('bad');
      document.getElementById('ut').textContent = 'อัปเดตไม่สำเร็จ';
      document.getElementById('us').textContent = 'เช็กอินเทอร์เน็ตแล้วลองใหม่';
      document.getElementById('up').textContent = '';
      document.getElementById('un').textContent = 'แอพยังใช้เวอร์ชันเดิมได้ตามปกติ';
      var act = document.getElementById('ua'); act.hidden = false;
      act.innerHTML = '<button type="button" class="ghost">ปิด</button><button type="button" class="primary">ลองอีกครั้ง</button>';
      act.querySelector('.ghost').onclick = function () { w.remove(); };
      act.querySelector('.primary').onclick = function () { w.remove(); runUpdate(); };
    } finally {
      try { if (h && h.remove) h.remove(); } catch (e) {}
    }
  }
  /* a newer APK: download it with the same loading page, then Android's install screen.
     Android asks once whether this app may install apps; its settings page opens, and when the
     technician comes back the install screen opens by itself (imodeResume). */
  async function runApk() {
    var P = chrome(), o = upd.offer;
    if (!o || !o.apk) return;
    var url = APK_BASE + o.apk.path + '?v=' + String(o.apk.sha256).slice(0, 12);
    if (!o.own) {
      /* APK 0.5 or older: an address outside the app opens in the phone's browser, which downloads the file */
      toast('กำลังเปิดเบราว์เซอร์ แตะไฟล์ที่โหลดเสร็จแล้วกด ติดตั้ง');
      setTimeout(function () { location.href = url; }, 300);
      return;
    }
    var t = document.getElementById('ctext');
    if (chat && t && t.value.trim()) { toast('ส่งข้อความที่พิมพ์ค้างไว้ก่อน แล้วค่อยอัปเดต'); return; }
    upd.running = true;
    var old = document.querySelector('.upd-pop'); if (old) old.remove();
    var w = document.createElement('div');
    w.className = 'updating'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'กำลังอัปเดตแอพ');
    w.innerHTML = '<img class="updating-logo" src="img/' + (document.documentElement.getAttribute('data-t') === 'light' || document.documentElement.getAttribute('data-t') === 'glass' ? 'logo.png' : 'logo-white.png') + '" alt="I-MODE">' +
      '<h2 id="ut">กำลังโหลดแอพเวอร์ชัน ' + esc(o.version) + '</h2>' +
      '<div class="ubar run" id="ub" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้า"><i id="uf"></i></div>' +
      '<div class="urow"><b id="up"></b><small id="us">กำลังเตรียมไฟล์</small></div>' +
      '<p class="unote" id="un">อย่าเพิ่งปิดแอพ</p><div class="uact" id="ua" hidden></div>';
    document.body.appendChild(w);
    var bar = document.getElementById('ub'), fill = document.getElementById('uf');
    function set(pct, sub) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      bar.classList.remove('run'); fill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct));
      document.getElementById('up').textContent = pct + '%';
      if (sub) document.getElementById('us').textContent = sub;
    }
    function actions(html, wire) { var act = document.getElementById('ua'); act.hidden = false; act.innerHTML = html; wire(act); }
    var h = null;
    try { h = await P.addListener('bundleProgress', function (e) { if (e && e.total) set(e.done / e.total * 100, kb(e.done) + ' จาก ' + kb(e.total)); }); } catch (e) {}
    try {
      await P.downloadApk({ path: o.apk.path, sha256: o.apk.sha256, size: o.apk.size || 0 });
      set(100, 'ตรวจไฟล์ครบแล้ว');
      upd.running = false;
      document.getElementById('ut').textContent = 'โหลดแอพเวอร์ชัน ' + o.version + ' เสร็จแล้ว';
      document.getElementById('un').textContent = 'กด ติดตั้ง ในหน้าต่างของ Android แอพจะปิดแล้วเปิดเป็นเวอร์ชันใหม่';
      actions('<button type="button" class="ghost">ภายหลัง</button><button type="button" class="primary">ติดตั้ง</button>', function (act) {
        act.querySelector('.ghost').onclick = function () { upd.apkWait = false; w.remove(); upd.later = 'apk ' + o.version; upd.laterAt = Date.now(); };
        act.querySelector('.primary').onclick = function () { installApk(); };
      });
      installApk();
    } catch (e) {
      upd.running = false;
      bar.classList.remove('run'); bar.classList.add('bad');
      document.getElementById('ut').textContent = 'โหลดแอพไม่สำเร็จ';
      document.getElementById('us').textContent = 'เช็กอินเทอร์เน็ตแล้วลองใหม่';
      document.getElementById('up').textContent = '';
      document.getElementById('un').textContent = 'แอพยังใช้เวอร์ชันเดิมได้ตามปกติ';
      actions('<button type="button" class="ghost">ปิด</button><button type="button" class="primary">ลองอีกครั้ง</button>', function (act) {
        act.querySelector('.ghost').onclick = function () { w.remove(); };
        act.querySelector('.primary').onclick = function () { w.remove(); runApk(); };
      });
    } finally {
      try { if (h && h.remove) h.remove(); } catch (e) {}
    }
  }
  async function installApk() {
    var P = chrome(); if (!P || !P.installApk) return;
    try {
      var r = await P.installApk();
      upd.apkWait = !!(r && r.needPermission);
      var n = document.getElementById('un');
      if (n) n.textContent = upd.apkWait ? 'เปิด "อนุญาตจากแหล่งที่มานี้" ให้แอพ I-MODE ช่าง แล้วกดย้อนกลับมาที่แอพ'
        : 'กด ติดตั้ง ในหน้าต่างของ Android แอพจะปิดแล้วเปิดเป็นเวอร์ชันใหม่ ถ้าหน้าต่างหายไป กดปุ่ม ติดตั้ง ด้านล่าง';
    } catch (e) { toast('เปิดหน้าติดตั้งไม่ได้ ลองกด ติดตั้ง อีกครั้ง'); }
  }

  /* the native side keeps the last good set; a new set that never reaches this point is dropped
     after two tries and the app goes back to the previous one */
  function bootOk() {
    var P = chrome(); if (P && P.markGood) P.markGood().catch(function () {});
    var seen = lsGet('imode.appVersion');
    if (seen && seen !== VERSION && cmpVer(VERSION, seen) > 0) setTimeout(function () { toast('อัปเดตเป็นเวอร์ชัน ' + VERSION + ' แล้ว'); }, 600);
    lsSet('imode.appVersion', VERSION);
    setTimeout(function () { checkUpdate(false); }, 1200);
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
