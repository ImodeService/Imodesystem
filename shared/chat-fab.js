/* shared/chat-fab.js — 2026-11-24
   ปุ่ม + มุมขวาล่าง ทุกหน้า (ระบบใหม่ next/ + หน้าเลือกโมดุล)
   - แตะ = กางเมนู: แชท · (จัดเรียงไอคอน เฉพาะหน้าเลือกโมดุล) · ธีม
   - กดค้าง = เมนูกาง แล้วลากนิ้วไปที่ปุ่มย่อยแล้วปล่อย = เลือก ; ปล่อยตรงปุ่ม + = เปิดแชททันที
   - กดค้างนิ่งๆ ~1.5 วินาที (ปุ่มสั่น) = ย้ายปุ่ม ลากไปวางได้ จำตำแหน่งไว้ในเครื่อง
   แชทใช้ตารางเดิม: direct_messages / chat_groups + chat_group_members + group_messages / case_messages
   (สิทธิ์อ่านเขียนคุมด้วย RLS ในฐานข้อมูลเหมือนแชทเดิม) ; อ่านเคสแล้วใช้คีย์เดียวกับหน้าเคส imode.caseChat.seen
   หน้าอื่นเพิ่มปุ่มย่อยได้ด้วย ImodeFab.addItem({id,label,icon,run,order}) */
(function () {
  'use strict';
  if (window.ImodeFab) return;

  var me0 = document.currentScript && document.currentScript.src || '';
  var ROOT = me0 ? me0.replace(/shared\/chat-fab\.js.*$/, '') : '../../';
  var POS_KEY = 'imode.fab.pos', SEEN = 'imode.caseChat.seen';
  var CLOSED = ['เสร็จสิ้น', 'ปิดเคส', 'ยกเลิก'];
  var HOLD_MS = 320, MOVE_MS = 1500;

  var IC = {
    plus: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    theme: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.8-.8-1.3-.8-2.1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'
  };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function readJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), n = new Date();
    if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  function ini(s) { return String(s || '?').replace(/^(คุณ|นาย|นางสาว|นาง)\s*/, '').trim().slice(0, 2) || '?'; }

  /* ---------------------------------------------------------------- css ---- */
  function css() {
    if (document.getElementById('cfCss')) return;
    var st = document.createElement('style'); st.id = 'cfCss';
    st.textContent = [
      '.cf-fab{position:fixed;right:20px;bottom:20px;z-index:70;width:56px;height:56px;border-radius:50%;border:0;background:var(--navy,#1F3A68);color:var(--navy-fg,#fff);display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 22px -6px rgba(15,30,60,.45);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:box-shadow .15s}',
      '.cf-fab svg{transition:transform .2s ease}.cf-fab.is-open svg{transform:rotate(45deg)}',
      '.cf-fab:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}',
      '.cf-fab.is-move{animation:cfShake .28s ease-in-out infinite;box-shadow:0 14px 30px -6px rgba(15,30,60,.6);cursor:grabbing}',
      '@keyframes cfShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}',
      '.cf-n{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#D9730D;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px var(--bg,#F4F5F7)}',
      '.cf-dim{position:fixed;inset:0;z-index:68;background:rgba(15,25,45,0);transition:background .18s}.cf-dim.is-in{background:rgba(15,25,45,.28)}',
      '.cf-act{position:fixed;z-index:69;display:flex;align-items:center;gap:10px;border:0;background:none;padding:0;cursor:pointer;font:inherit;opacity:0;transform:scale(.6);transition:opacity .15s,transform .18s cubic-bezier(.2,.9,.3,1.3)}',
      '.cf-dim.is-in~.cf-act{opacity:1;transform:none}',
      '.cf-act.lft{flex-direction:row-reverse}',
      '.cf-lb{background:var(--card,var(--surface,#fff));color:var(--fg,var(--ink,#1B2333));font-size:13px;font-weight:600;padding:4px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap}',
      '.cf-ic{position:relative;width:46px;height:46px;border-radius:50%;background:var(--card,var(--surface,#fff));color:var(--navy,#1F3A68);border:1px solid var(--line,var(--line-soft,#E2E5EA));display:grid;place-items:center;transition:transform .12s,background .12s}',
      '.cf-act:hover .cf-ic,.cf-act.is-hot .cf-ic,.cf-act:focus-visible .cf-ic{transform:scale(1.12);background:var(--navy,#1F3A68);color:var(--navy-fg,#fff)}',
      '.cf-act:focus-visible{outline:none}',
      '.cf-pn{position:fixed;top:0;right:0;bottom:0;z-index:72;width:380px;max-width:100vw;background:var(--card,var(--surface,#fff));color:var(--fg,var(--ink,#1B2333));border-left:1px solid var(--line,var(--line-soft,#E2E5EA));box-shadow:-10px 0 28px rgba(15,25,45,.16);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .22s ease}',
      '.cf-pn.is-in{transform:none}',
      '@media (max-width:600px){.cf-pn{width:100vw;border-left:0}.cf-fab{right:14px;bottom:14px}}',
      '.cf-h{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line,var(--line-soft,#E2E5EA));min-height:56px}',
      '.cf-h h2{margin:0;font-size:16px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-h small{display:block;font-size:12px;font-weight:400;color:var(--mut,#6B7383)}',
      '.cf-b{width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;flex:none}.cf-b:hover{background:var(--soft,#EEF1F5)}',
      '.cf-new{border:1px solid var(--line,var(--line-soft,#E2E5EA));background:var(--card,var(--surface,#fff));color:inherit;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}',
      '.cf-tabs{display:flex;gap:6px;padding:10px 14px 6px;flex-wrap:wrap}',
      '.cf-tab{border:1px solid var(--line,var(--line-soft,#E2E5EA));background:var(--card,var(--surface,#fff));color:inherit;border-radius:999px;padding:4px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}',
      '.cf-tab[aria-pressed="true"]{background:var(--navy,#1F3A68);color:var(--navy-fg,#fff);border-color:var(--navy,#1F3A68)}',
      '.cf-tab b{font-weight:700;margin-left:4px;color:#D9730D}.cf-tab[aria-pressed="true"] b{color:#FFD7A8}',
      '.cf-q{margin:4px 14px 8px;padding:8px 12px;border:1px solid var(--line,var(--line-soft,#E2E5EA));border-radius:10px;font:inherit;font-size:14px;background:var(--bg,#F4F5F7);color:inherit}',
      '.cf-list{flex:1;overflow:auto}',
      '.cf-it{display:flex;gap:10px;align-items:center;width:100%;padding:10px 14px;border:0;border-bottom:1px solid var(--line2,#F0F2F5);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}.cf-it:hover{background:var(--soft,#F4F6F9)}',
      '.cf-av{width:38px;height:38px;border-radius:50%;background:#D6DEEB;color:#1F3A68;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none}',
      '.cf-av.g{background:#DCEBDF;color:#2E6B3F}.cf-av.c{background:#F3E3CF;color:#8A5A12}',
      '.cf-tx{flex:1;min-width:0}.cf-tx p{margin:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-tx small{display:block;font-size:12.5px;color:var(--mut,#6B7383);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-rt{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none;font-size:11.5px;color:var(--mut,#6B7383)}',
      '.cf-u{background:#D9730D;color:#fff;border-radius:999px;padding:0 7px;font-size:11px;font-weight:700;line-height:18px}',
      '.cf-emp{padding:30px 20px;text-align:center;color:var(--mut,#6B7383);font-size:14px}',
      '.cf-msgs{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#F4F5F7)}',
      '.cf-m{max-width:80%;align-self:flex-start}.cf-m.me{align-self:flex-end}',
      '.cf-m .who{font-size:11.5px;color:var(--mut,#6B7383);margin:0 0 2px 4px}',
      '.cf-m .bb{background:var(--card,var(--surface,#fff));border:1px solid var(--line,var(--line-soft,#E2E5EA));border-radius:14px 14px 14px 4px;padding:7px 11px;font-size:14px;white-space:pre-wrap;word-break:break-word}',
      '.cf-m.me .bb{background:var(--navy,#1F3A68);color:var(--navy-fg,#fff);border-color:transparent;border-radius:14px 14px 4px 14px}',
      '.cf-m .tm{font-size:10.5px;color:var(--mut,#6B7383);margin:2px 4px 0;text-align:right}',
      '.cf-m img{display:block;max-width:180px;max-height:180px;border-radius:10px;margin-top:4px}',
      '.cf-day{align-self:center;font-size:11.5px;color:var(--mut,#6B7383);background:var(--card,var(--surface,#fff));border-radius:999px;padding:2px 10px}',
      '.cf-in{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,var(--line-soft,#E2E5EA));align-items:flex-end;padding-bottom:max(10px,env(safe-area-inset-bottom))}',
      '.cf-in textarea{flex:1;resize:none;border:1px solid var(--line,var(--line-soft,#E2E5EA));border-radius:12px;padding:9px 12px;font:inherit;font-size:14px;max-height:120px;min-height:40px;background:var(--bg,#F4F5F7);color:inherit}',
      '.cf-snd{width:42px;height:42px;border-radius:50%;border:0;background:var(--navy,#1F3A68);color:var(--navy-fg,#fff);display:grid;place-items:center;cursor:pointer;flex:none}.cf-snd:disabled{opacity:.45;cursor:default}',
      '.cf-err{margin:8px 14px;padding:8px 12px;border-radius:10px;background:#FDECEC;color:#9B1C1C;font-size:13px}',
      '.cf-lnk{font-size:12.5px;color:var(--navy,#1F3A68);text-decoration:underline;white-space:nowrap}',
      '[data-theme="dark"] .cf-av{background:#2A3A55;color:#C9D6EE}[data-theme="dark"] .cf-av.g{background:#244030;color:#BFE0C8}[data-theme="dark"] .cf-av.c{background:#4A3A22;color:#F0D6B0}',
      '[data-theme="dark"] .cf-lnk{color:#9DB8E8}',
      '@media (prefers-reduced-motion:reduce){.cf-fab,.cf-fab svg,.cf-act,.cf-pn,.cf-dim{transition:none}.cf-fab.is-move{animation:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------- items ---- */
  var items = [
    { id: 'chat', label: 'แชท', icon: IC.chat, order: 10, run: function () { openChat(); } },
    { id: 'theme', label: 'ธีม', icon: IC.theme, order: 90, run: function () {
      if (window.ImodeTheme && window.ImodeTheme.open) { window.ImodeTheme.open(); return; }
      var b = document.querySelector('[data-theme-btn]'); if (b) { b.click(); return; }
      var h = document.documentElement, t = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      h.setAttribute('data-theme', t); try { localStorage.setItem('imode.theme', 'flat-' + t); } catch (e) {}
    } }
  ];
  function addItem(it) {
    if (!it || !it.id) return;
    items = items.filter(function (x) { return x.id !== it.id; }).concat([it]);
    items.sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  }

  /* --------------------------------------------------------------- fab ---- */
  var fab, nEl, menu = null, dim = null, hot = null;
  function build() {
    if (fab || !document.body) return;
    css();
    fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'cf-fab';
    fab.setAttribute('aria-label', 'เมนูด่วน: แชท ธีม'); fab.setAttribute('aria-haspopup', 'menu'); fab.setAttribute('aria-expanded', 'false');
    fab.title = 'แตะ = เมนู · กดค้าง = แชท · กดค้างนิ่งๆ = ย้ายปุ่ม';
    fab.innerHTML = IC.plus + '<span class="cf-n" hidden></span>';
    nEl = fab.querySelector('.cf-n');
    document.body.appendChild(fab);
    placeSaved();
    window.addEventListener('resize', function () { placeSaved(); if (menu) placeMenu(); });
    wireGestures();
    badge();
  }
  function placeSaved() {
    var p = readJ(POS_KEY, null); if (!p || typeof p.r !== 'number') { fab.style.right = ''; fab.style.bottom = ''; return; }
    var w = window.innerWidth, h = window.innerHeight;
    fab.style.right = Math.max(6, Math.min(w - 62, p.r)) + 'px';
    fab.style.bottom = Math.max(6, Math.min(h - 62, p.b)) + 'px';
  }

  function openMenu() {
    if (menu) return;
    dim = document.createElement('div'); dim.className = 'cf-dim';
    document.body.appendChild(dim);
    menu = items.map(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cf-act'; b.setAttribute('role', 'menuitem'); b.setAttribute('data-act', it.id);
      b.innerHTML = '<span class="cf-lb">' + esc(it.label) + '</span><span class="cf-ic">' + it.icon + (it.id === 'chat' ? '<span class="cf-n" hidden></span>' : '') + '</span>';
      b.addEventListener('click', function () { run(it.id); });
      document.body.appendChild(b);
      return b;
    });
    dim.addEventListener('click', closeMenu);
    placeMenu(); badge();
    fab.classList.add('is-open'); fab.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { if (dim) dim.classList.add('is-in'); });
    document.addEventListener('keydown', onKey, true);
  }
  function placeMenu() {
    var r = fab.getBoundingClientRect(), cx = r.left + r.width / 2, up = r.top + r.height / 2 > window.innerHeight / 2, left = cx > window.innerWidth / 2;
    menu.forEach(function (b, i) {
      var step = 56 * (i + 1) + 6;
      b.classList.toggle('lft', !left);
      var bw = b.offsetWidth || 160;
      b.style.top = (up ? r.top - step : r.bottom + step - 46) + 'px';
      b.style.left = (left ? r.right - 5 - bw : r.left + 5) + 'px';
      b.style.transitionDelay = (i * 25) + 'ms';
    });
  }
  function closeMenu() {
    if (!menu) return;
    menu.forEach(function (b) { b.remove(); }); menu = null; hot = null;
    if (dim) dim.remove(); dim = null;
    fab.classList.remove('is-open'); fab.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
  }
  function run(id) { closeMenu(); var it = items.filter(function (x) { return x.id === id; })[0]; if (it) it.run(); }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); fab.focus(); } }
  function hit(x, y) {
    var b = null;
    if (menu) menu.forEach(function (m) { var r = m.getBoundingClientRect(); if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) b = m; });
    if (hot && hot !== b) hot.classList.remove('is-hot');
    hot = b; if (b) b.classList.add('is-hot');
  }

  function wireGestures() {
    var t1 = null, t2 = null, held = false, moving = false, sx = 0, sy = 0, moved = false, skip = false, grab = null;
    function clear() { clearTimeout(t1); clearTimeout(t2); }
    fab.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      held = false; moving = false; moved = false; sx = e.clientX; sy = e.clientY;
      var wasOpen = !!menu;
      clear();
      t1 = setTimeout(function () { held = true; if (!wasOpen) openMenu(); try { navigator.vibrate && navigator.vibrate(12); } catch (x) {} }, HOLD_MS);
      t2 = setTimeout(function () {
        if (moved) return;
        closeMenu(); held = false; moving = true;
        var r = fab.getBoundingClientRect(); grab = { dx: sx - r.left, dy: sy - r.top };
        fab.classList.add('is-move');
        try { navigator.vibrate && navigator.vibrate([10, 40, 10]); } catch (x) {}
      }, MOVE_MS);
      try { fab.setPointerCapture(e.pointerId); } catch (x) {}
    });
    fab.addEventListener('pointermove', function (e) {
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) { moved = true; clearTimeout(t2); }
      if (moving) {
        var w = window.innerWidth, h = window.innerHeight;
        var left = Math.max(6, Math.min(w - 62, e.clientX - grab.dx)), top = Math.max(6, Math.min(h - 62, e.clientY - grab.dy));
        fab.style.right = (w - left - 56) + 'px'; fab.style.bottom = (h - top - 56) + 'px';
        return;
      }
      if (held && menu) hit(e.clientX, e.clientY);
    });
    fab.addEventListener('pointerup', function (e) {
      clear();
      if (moving) {
        moving = false; fab.classList.remove('is-move'); skip = true;
        writeJ(POS_KEY, { r: parseFloat(fab.style.right) || 20, b: parseFloat(fab.style.bottom) || 20 });
        return;
      }
      if (held) {
        held = false; skip = true;
        if (hot) { run(hot.getAttribute('data-act')); return; }
        var r = fab.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { closeMenu(); openChat(); }
        else closeMenu();
      }
    });
    fab.addEventListener('pointercancel', function () { clear(); held = false; if (moving) { moving = false; fab.classList.remove('is-move'); placeSaved(); } });
    fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    fab.addEventListener('click', function () {
      if (skip) { skip = false; return; }
      if (menu) closeMenu(); else { openMenu(); if (menu && menu[0]) menu[0].focus(); }
    });
  }

  /* -------------------------------------------------------------- data ---- */
  var sb = null, me = null, people = {}, dms = [], groups = [], gRead = {}, gMsgs = [], caseLast = {}, cases = {}, ready = false, loadErr = '';
  function client() { try { return window.ImodeAuth && window.ImodeAuth.client ? window.ImodeAuth.client() : null; } catch (e) { return null; } }

  async function init() {
    sb = client(); if (!sb) return;
    try {
      var s = await sb.auth.getSession(), ses = s && s.data && s.data.session;
      if (!ses) return;
      me = { id: ses.user.id, name: '' };
    } catch (e) { return; }
    await refresh();
    try {
      sb.channel('chatfab-' + me.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, onNew('dm'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, onNew('group'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_messages' }, onNew('case'))
        .subscribe();
    } catch (e) {}
    setInterval(function () { if (!document.hidden) refresh(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }
  function onNew(kind) {
    return function (p) {
      var m = p && p.new; if (!m) return;
      if (cur && ((kind === 'dm' && cur.kind === 'dm' && (m.sender_id === cur.id || m.recipient_id === cur.id)) ||
        (kind === 'group' && cur.kind === 'group' && m.group_id === cur.id) || (kind === 'case' && cur.kind === 'case' && m.case_id === cur.id))) { openThread(cur, true); }
      refresh();
    };
  }

  async function refresh() {
    if (!sb || !me) return;
    var R = await Promise.all([
      sb.from('profiles').select('id,username,full_name,role,is_active,customer_id').limit(500),
      sb.from('direct_messages').select('id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at').or('sender_id.eq.' + me.id + ',recipient_id.eq.' + me.id).order('created_at', { ascending: false }).limit(1000),
      sb.from('chat_groups').select('id,name').limit(500),
      sb.from('chat_group_members').select('group_id,user_id,last_read_at').eq('user_id', me.id).limit(500),
      sb.from('case_message_last').select('case_id,last_at,messages').order('last_at', { ascending: false }).limit(300)
    ].map(function (q) { return Promise.resolve(q).catch(function (e) { return { error: e }; }); }));
    loadErr = '';
    people = {};
    ((R[0] && R[0].data) || []).forEach(function (p) {
      if (p.is_active === false || p.customer_id || /^customer$/i.test(p.role || '')) return;
      people[p.id] = { id: p.id, name: p.full_name || p.username || 'ไม่มีชื่อ', role: p.role || '' };
    });
    if (people[me.id]) me.name = people[me.id].name;
    if (R[1] && R[1].error) loadErr = 'โหลดแชทส่วนตัวไม่ได้';
    dms = (R[1] && R[1].data) || [];
    gRead = {}; ((R[3] && R[3].data) || []).forEach(function (x) { gRead[x.group_id] = x.last_read_at || ''; });
    groups = ((R[2] && R[2].data) || []).filter(function (g) { return Object.prototype.hasOwnProperty.call(gRead, g.id); });
    gMsgs = [];
    if (groups.length) {
      var g = await Promise.resolve(sb.from('group_messages').select('id,group_id,sender_id,sender_name,body,kind,created_at').in('group_id', groups.map(function (x) { return x.id; })).order('created_at', { ascending: false }).limit(1000)).catch(function () { return {}; });
      gMsgs = (g && g.data) || [];
    }
    caseLast = {}; ((R[4] && R[4].data) || []).forEach(function (x) { if (x && x.case_id) caseLast[x.case_id] = x; });
    var ids = Object.keys(caseLast).filter(function (id) { return !cases[id]; });
    if (ids.length) {
      var c = await Promise.resolve(sb.from('service_cases').select('id,ticket,customer,status,stage,deleted_at').in('id', ids.slice(0, 300))).catch(function () { return {}; });
      ((c && c.data) || []).forEach(function (x) { cases[x.id] = x; });
    }
    ready = true;
    badge();
    if (pn && !cur) renderList();
  }

  function rows() {
    var out = [], conv = {}, s = readJ(SEEN, {}) || {}, week = Date.now() - 7 * 864e5;
    dms.forEach(function (m) {
      var o = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      var x = conv[o] || (conv[o] = { kind: 'dm', id: o, at: '', last: '', unread: 0 });
      if (!x.at || m.created_at > x.at) { x.at = m.created_at; x.last = (m.sender_id === me.id ? 'คุณ: ' : '') + (m.body || (m.photos && m.photos.length ? '[รูป]' : '')); }
      if (m.recipient_id === me.id && !m.read_at) x.unread++;
    });
    Object.keys(conv).forEach(function (k) { var x = conv[k]; x.name = (people[k] && people[k].name) || 'ผู้ใช้'; out.push(x); });
    groups.forEach(function (g) {
      var ms = gMsgs.filter(function (m) { return m.group_id === g.id; }), l = ms[0];
      out.push({ kind: 'group', id: g.id, name: g.name || 'กลุ่ม', at: l ? l.created_at : '', last: l ? (l.sender_name ? l.sender_name + ': ' : '') + (l.body || '[รูป]') : 'ยังไม่มีข้อความ',
        unread: ms.filter(function (m) { return m.sender_id !== me.id && (!gRead[g.id] || m.created_at > gRead[g.id]); }).length });
    });
    Object.keys(caseLast).forEach(function (id) {
      var c = cases[id]; if (!c || c.deleted_at) return;
      var l = caseLast[id], closed = c.stage === 'closed' || CLOSED.indexOf(String(c.status || '')) >= 0;
      var un = !closed && l.last_at && (!s[id] || l.last_at > s[id]) && Date.parse(l.last_at) > week;
      out.push({ kind: 'case', id: id, name: (c.ticket || 'เคส') + (c.customer ? ' · ' + c.customer : ''), at: l.last_at, last: (l.messages || 0) + ' ข้อความ' + (closed ? ' · ปิดแล้ว' : ''), unread: un ? 1 : 0, dot: un });
    });
    out.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    return out;
  }
  function total() { if (!ready) return 0; return rows().filter(function (r) { return r.unread; }).length; }
  function badge() {
    var n = total(), t = n > 99 ? '99+' : String(n);
    [nEl].concat(menu ? [].slice.call(document.querySelectorAll('.cf-act .cf-n')) : []).forEach(function (el) { if (!el) return; el.hidden = !n; el.textContent = t; });
  }

  /* ------------------------------------------------------------- panel ---- */
  var pn = null, tab = 'all', q = '', cur = null, picking = false;
  function openChat(target) {
    if (!pn) {
      pn = document.createElement('aside'); pn.className = 'cf-pn'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'แชท');
      document.body.appendChild(pn);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pn && pn.classList.contains('is-in') && !menu) closeChat(); });
    }
    pn.hidden = false;
    requestAnimationFrame(function () { pn.classList.add('is-in'); });
    if (target) openThread(target); else { cur = null; renderList(); }
    if (!me) pn.innerHTML = head('แชท', '') + '<div class="cf-emp">ต้องเข้าสู่ระบบก่อนถึงจะใช้แชทได้</div>';
  }
  function closeChat() { if (!pn) return; pn.classList.remove('is-in'); cur = null; setTimeout(function () { if (pn && !pn.classList.contains('is-in')) pn.hidden = true; }, 250); }
  function head(title, sub, back, extra) {
    return '<div class="cf-h">' + (back ? '<button type="button" class="cf-b" data-back aria-label="กลับ">' + IC.back + '</button>' : '') +
      '<h2>' + esc(title) + (sub ? '<small>' + sub + '</small>' : '') + '</h2>' + (extra || '') +
      '<button type="button" class="cf-b" data-close aria-label="ปิดแชท">' + IC.x + '</button></div>';
  }
  function wireHead() {
    var c = pn.querySelector('[data-close]'); if (c) c.onclick = closeChat;
    var b = pn.querySelector('[data-back]'); if (b) b.onclick = function () { cur = null; picking = false; renderList(); };
  }
  function renderList() {
    if (!pn || !me) return;
    if (picking) return renderPeople();
    var all = ready ? rows() : [], cnt = { dm: 0, group: 0, case: 0 };
    all.forEach(function (r) { cnt[r.kind] += r.unread ? 1 : 0; });
    var T = [['all', 'ทั้งหมด', cnt.dm + cnt.group + cnt.case], ['dm', 'คน', cnt.dm], ['group', 'กลุ่ม', cnt.group], ['case', 'เคส', cnt.case]];
    var list = all.filter(function (r) { return (tab === 'all' || r.kind === tab) && (!q || (r.name + ' ' + r.last).toLowerCase().indexOf(q.toLowerCase()) >= 0); });
    var keep = pn.querySelector('.cf-q'), hadFocus = keep && document.activeElement === keep;
    pn.innerHTML = head('แชท', '', false, '<button type="button" class="cf-new" data-newdm>＋ แชทใหม่</button>') +
      '<div class="cf-tabs" role="group" aria-label="ประเภทแชท">' + T.map(function (t) { return '<button type="button" class="cf-tab" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + (t[2] ? '<b>' + t[2] + '</b>' : '') + '</button>'; }).join('') + '</div>' +
      '<input class="cf-q" type="search" placeholder="ค้นหาชื่อ / ข้อความ" aria-label="ค้นหาแชท" value="' + esc(q) + '">' +
      (loadErr ? '<div class="cf-err">' + esc(loadErr) + '</div>' : '') +
      '<div class="cf-list">' + (!ready ? '<div class="cf-emp">กำลังโหลด…</div>' : list.length ? list.map(rowHtml).join('') : '<div class="cf-emp">' + (q ? 'ไม่พบแชทที่ค้นหา' : 'ยังไม่มีแชท กด "＋ แชทใหม่" เพื่อเริ่มคุยกับเพื่อนร่วมงาน') + '</div>') + '</div>';
    wireHead();
    pn.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-tab'); renderList(); }; });
    var qi = pn.querySelector('.cf-q'); qi.oninput = function () { q = qi.value; renderList(); };
    if (hadFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    pn.querySelector('[data-newdm]').onclick = function () { picking = true; renderPeople(); };
    pn.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-open').split('|'); openThread({ kind: p[0], id: p[1] }); }; });
  }
  function rowHtml(r) {
    var cls = r.kind === 'group' ? ' g' : r.kind === 'case' ? ' c' : '';
    var av = r.kind === 'case' ? 'SR' : r.kind === 'group' ? 'กล' : ini(r.name);
    return '<button type="button" class="cf-it" data-open="' + r.kind + '|' + esc(r.id) + '"><span class="cf-av' + cls + '">' + esc(av) + '</span>' +
      '<span class="cf-tx"><p>' + esc(r.name) + '</p><small>' + esc(r.last) + '</small></span>' +
      '<span class="cf-rt">' + esc(when(r.at)) + (r.unread ? '<span class="cf-u">' + (r.dot ? 'ใหม่' : r.unread) + '</span>' : '') + '</span></button>';
  }
  function renderPeople() {
    var list = Object.keys(people).map(function (k) { return people[k]; }).filter(function (p) { return p.id !== me.id && (!q || p.name.toLowerCase().indexOf(q.toLowerCase()) >= 0); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });
    pn.innerHTML = head('เริ่มแชทใหม่', 'เลือกเพื่อนร่วมงาน', true) +
      '<input class="cf-q" type="search" placeholder="ค้นหาชื่อ" aria-label="ค้นหาชื่อ" value="' + esc(q) + '">' +
      '<div class="cf-list">' + (list.length ? list.map(function (p) {
        return '<button type="button" class="cf-it" data-open="dm|' + esc(p.id) + '"><span class="cf-av">' + esc(ini(p.name)) + '</span><span class="cf-tx"><p>' + esc(p.name) + '</p><small>' + esc(p.role) + '</small></span></button>';
      }).join('') : '<div class="cf-emp">ไม่พบรายชื่อ</div>') + '</div>';
    wireHead();
    var qi = pn.querySelector('.cf-q'); qi.oninput = function () { q = qi.value; renderPeople(); qi = pn.querySelector('.cf-q'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); };
    pn.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { picking = false; q = ''; openThread({ kind: 'dm', id: b.getAttribute('data-open').slice(3) }); }; });
  }

  async function openThread(t, quiet) {
    cur = { kind: t.kind, id: t.id };
    var name = t.kind === 'dm' ? ((people[t.id] && people[t.id].name) || 'ผู้ใช้') : t.kind === 'group' ? ((groups.filter(function (g) { return g.id === t.id; })[0] || {}).name || 'กลุ่ม') : '';
    var sub = t.kind === 'group' ? 'แชทกลุ่ม' : t.kind === 'dm' ? 'แชทส่วนตัว' : '';
    if (t.kind === 'case') {
      var c = cases[t.id] || {};
      name = c.ticket || 'เคส'; sub = esc(c.customer || '') + ' · <a class="cf-lnk" href="' + esc(ROOT + 'next/service/case.html?id=' + encodeURIComponent(t.id)) + '">เปิดเคส</a>';
    }
    var draft = pn.querySelector('.cf-in textarea'), keep = quiet && draft ? draft.value : '';
    if (!quiet) pn.innerHTML = head(name, sub, true) + '<div class="cf-msgs"><div class="cf-emp">กำลังโหลด…</div></div>' + inputHtml();
    wireHead(); wireInput(keep);
    var r;
    if (t.kind === 'dm') r = await sb.from('direct_messages').select('id,sender_id,sender_name,recipient_id,body,photos,created_at').or('and(sender_id.eq.' + me.id + ',recipient_id.eq.' + t.id + '),and(sender_id.eq.' + t.id + ',recipient_id.eq.' + me.id + ')').order('created_at', { ascending: false }).limit(300);
    else if (t.kind === 'group') r = await sb.from('group_messages').select('id,group_id,sender_id,sender_name,body,photos,kind,created_at').eq('group_id', t.id).order('created_at', { ascending: false }).limit(300);
    else r = await sb.from('case_messages').select('id,case_id,body,photos,author_id,author_name,created_at').eq('case_id', t.id).order('created_at', { ascending: false }).limit(300);
    if (!cur || cur.id !== t.id) return;
    var box = pn.querySelector('.cf-msgs');
    if (r.error) { box.innerHTML = '<div class="cf-err">โหลดข้อความไม่ได้: ' + esc(r.error.message) + '</div>'; return; }
    var ms = (r.data || []).slice().reverse(), lastDay = '';
    box.innerHTML = ms.length ? ms.map(function (m) {
      var mine = (m.sender_id || m.author_id) === me.id, who = m.sender_name || m.author_name || '', d = new Date(m.created_at).toDateString(), sep = '';
      if (d !== lastDay) { lastDay = d; sep = '<div class="cf-day">' + esc(new Date(m.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })) + '</div>'; }
      var ph = Array.isArray(m.photos) ? m.photos.filter(function (p) { return typeof p === 'string' && /^(data:image\/|https:\/\/)/.test(p); }) : [];
      if (m.kind && m.kind !== 'text' && m.kind !== 'message' && !m.body) return sep;
      return sep + '<div class="cf-m' + (mine ? ' me' : '') + '">' + (!mine && t.kind !== 'dm' && who ? '<div class="who">' + esc(who) + '</div>' : '') +
        '<div class="bb">' + esc(m.body || '') + ph.map(function (p) { return '<img alt="รูปที่แนบ" src="' + esc(p) + '">'; }).join('') + '</div>' +
        '<div class="tm">' + esc(new Date(m.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })) + '</div></div>';
    }).join('') : '<div class="cf-emp">ยังไม่มีข้อความ เริ่มพิมพ์ได้เลย</div>';
    box.scrollTop = box.scrollHeight;
    markRead(t, ms);
  }
  function markRead(t, ms) {
    var now = new Date().toISOString();
    if (t.kind === 'dm') { dms.forEach(function (m) { if (m.sender_id === t.id && m.recipient_id === me.id && !m.read_at) m.read_at = now; }); Promise.resolve(sb.from('direct_messages').update({ read_at: now }).eq('recipient_id', me.id).eq('sender_id', t.id).is('read_at', null)).catch(function () {}); }
    else if (t.kind === 'group') { gRead[t.id] = now; Promise.resolve(sb.from('chat_group_members').update({ last_read_at: now }).eq('group_id', t.id).eq('user_id', me.id)).catch(function () {}); }
    else { var o = readJ(SEEN, {}) || {}; o[t.id] = now; writeJ(SEEN, o); }
    badge();
  }
  function inputHtml() { return '<form class="cf-in"><textarea rows="1" placeholder="พิมพ์ข้อความ…" title="Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่" aria-label="ข้อความ"></textarea><button type="submit" class="cf-snd" aria-label="ส่ง" disabled>' + IC.send + '</button></form>'; }
  function wireInput(keep) {
    var f = pn.querySelector('.cf-in'); if (!f) return;
    var ta = f.querySelector('textarea'), bt = f.querySelector('.cf-snd');
    if (keep) ta.value = keep;
    function fit() { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; bt.disabled = !ta.value.trim(); }
    ta.oninput = fit; fit();
    ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : f.onsubmit(e); } };
    f.onsubmit = async function (e) {
      e.preventDefault();
      var body = ta.value.trim(); if (!body || !cur) return;
      bt.disabled = true; ta.disabled = true;
      var t = cur, row = t.kind === 'dm' ? { recipient_id: t.id, body: body, photos: [] } : t.kind === 'group' ? { group_id: t.id, body: body, photos: [] } : { case_id: t.id, body: body, photos: [] };
      var r = await Promise.resolve(sb.from(t.kind === 'dm' ? 'direct_messages' : t.kind === 'group' ? 'group_messages' : 'case_messages').insert(row)).catch(function (x) { return { error: x }; });
      ta.disabled = false;
      if (r && r.error) { bt.disabled = false; var er = pn.querySelector('.cf-err') || document.createElement('div'); er.className = 'cf-err'; er.textContent = 'ส่งไม่สำเร็จ: ' + (r.error.message || r.error); f.parentNode.insertBefore(er, f); return; }
      ta.value = ''; fit(); ta.focus();
      await openThread(t, true); refresh();
    };
    setTimeout(function () { if (window.innerWidth > 600) ta.focus(); }, 60);
  }

  /* ------------------------------------------------------------- start ---- */
  window.ImodeFab = { addItem: addItem, openChat: openChat, closeChat: closeChat, refresh: refresh };
  function start() { build(); init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
