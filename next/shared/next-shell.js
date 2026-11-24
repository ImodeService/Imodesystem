/* I-MODE System (ระบบใหม่) · โครงหน้าที่ทุกโมดุลใช้ร่วม
   - ธีม สว่าง/มืด (จำไว้ในเครื่อง)
   - แถบบน: ชื่อโมดุล, ปุ่มสลับธีม, ปุ่ม 9 จุดสลับโมดุล (มีรายการโปรด), บัญชี
   - สิทธิ์: อ่านจาก app_role_perms ตาม role ของผู้ใช้ (ฐานข้อมูลเป็นตัวล็อกจริง หน้าเว็บแค่ซ่อนปุ่ม)
   ใช้: <script src="../shared/next-shell.js"> ใน <head> แล้ว await NextShell.start({ title, moduleId })
   ต้องโหลด ../../shared/vendor/supabase.min.js, ../../shared/config.js, ../../shared/auth.js, ./next-modules.js ก่อน start() */
(function () {
  'use strict';
  /* 2026-11-22: ใช้ธีมเดียวกับทั้งระบบ (imode.theme ของ shared/theme-pref.js: flat-light / flat-dark)
     เปลี่ยนที่นี่ ทุกโมดุลเปลี่ยนตาม และกลับกัน */
  var THEME_KEY = 'imode.theme', THEME_AT = 'imode.theme.at';
  function savedTheme() {
    var v = ''; try { v = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
    if (v === 'auto') return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return v === 'flat-dark' ? 'dark' : 'light';
  }
  function applyTheme(t) {
    t = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    return t;
  }
  function saveTheme(t) {
    try { localStorage.setItem(THEME_KEY, t === 'dark' ? 'flat-dark' : 'flat-light'); localStorage.setItem(THEME_AT, String(Date.now())); } catch (e) {}
  }
  applyTheme(savedTheme()); // ก่อนหน้าแสดง กันจอกระพริบ
  window.addEventListener('storage', function (e) { if (e.key === THEME_KEY) { applyTheme(savedTheme()); if (window.__nxPaintTheme) window.__nxPaintTheme(); } });

  /* root ของเว็บ (โฟลเดอร์ที่มี next/ และ shared/) คิดจากที่อยู่ไฟล์นี้ */
  var me = document.currentScript && document.currentScript.src;
  var ROOT = me ? me.replace(/next\/shared\/next-shell\.js.*$/, '') : '../../';

  var state = { user: null, perms: [], favs: [] };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function can(p) {
    if (!p) return true;
    var mod = p.split('.')[0] + '.*';
    return state.perms.some(function (x) { return x === '*' || x === p || x === mod; });
  }
  function favKey() { return 'imode.next.favs.' + (state.user ? state.user.id : ''); }
  function loadFavs() {
    try { var v = JSON.parse(localStorage.getItem(favKey()) || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
    return ['service', 'qc', 'calendar', 'quote', 'dashboard', 'customers'];
  }
  function saveFavs() { try { localStorage.setItem(favKey(), JSON.stringify(state.favs)); } catch (e) {} }

  function moduleHref(m) { return m.href ? ROOT + m.href : (m.old ? ROOT + m.old : ''); }

  function tile(m, editing) {
    var href = moduleHref(m);
    var inner = '<span class="ic" style="background:' + esc(m.color) + '">' + esc(m.ab) + '</span><span>' + esc(m.name) + '</span>' +
      (editing && state.favs.indexOf(m.id) >= 0 ? '<span class="star" aria-hidden="true">★</span>' : '');
    if (editing) return '<button type="button" class="tile" data-fav="' + esc(m.id) + '" aria-pressed="' + (state.favs.indexOf(m.id) >= 0) + '">' + inner + '</button>';
    if (!href) return '<span class="tile soon" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;font-size:13px;text-align:center" title="ยังไม่เปิดใช้">' + inner + '</span>';
    return '<a href="' + esc(href) + '">' + inner + '</a>';
  }

  function renderSwitcher(panel, editing) {
    var list = (window.NEXT_MODULES || []).filter(function (m) { return can(m.perm); });
    var fav = list.filter(function (m) { return state.favs.indexOf(m.id) >= 0; });
    var rest = list.filter(function (m) { return state.favs.indexOf(m.id) < 0; });
    panel.innerHTML = editing
      ? '<div class="fav"><div class="head"><span>เลือกรายการโปรด</span><button type="button" class="nx-btn" data-done>เสร็จ</button></div>' +
        '<div class="grid">' + list.map(function (m) { return tile(m, true); }).join('') + '</div></div>'
      : '<div class="fav"><div class="head"><span>รายการโปรดของคุณ</span>' +
        '<button type="button" class="nx-icon-btn" data-edit aria-label="แก้ไขรายการโปรด"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg></button></div>' +
        '<div class="grid">' + (fav.length ? fav.map(function (m) { return tile(m); }).join('') : '<div class="nx-empty" style="grid-column:1/-1;padding:12px">กดดินสอเพื่อเลือก</div>') + '</div></div>' +
        (rest.length ? '<div class="lab">โมดุลอื่น</div><div class="grid">' + rest.map(function (m) { return tile(m); }).join('') + '</div>' : '');
  }

  /* โลโก้: สีปกติตอนสว่าง สีขาวตอนมืด (ไฟล์ .png พื้นโปร่งใส; .webp เดิมมีพื้นขาวเลยเป็นกล่องขาวในโหมดมืด) */
  function logo(cls) {
    return '<img class="nx-logo-l' + (cls ? ' ' + cls : '') + '" src="' + esc(ROOT + 'assets/brand/imode-logo.png') + '" alt="I-MODE">' +
      '<img class="nx-logo-d' + (cls ? ' ' + cls : '') + '" src="' + esc(ROOT + 'assets/brand/imode-logo-white.png') + '" alt="">';
  }
  /* 2026-11-22: แถบเมนูซ้ายแบบ Service เดิม (เฉพาะโมดุลที่มีใน NEXT_SIDE) ตัดหน้าที่ย้ายไปเป็นโมดุลของตัวเองแล้ว */
  /* match: ลงท้าย $ = ต้องตรงตัว (นับ ?query ด้วย) ; ไม่มี $ = มีคำนี้อยู่ในที่อยู่ */
  function isHere(it) {
    if (!it.match) return false;
    var here = location.pathname.replace(/\/index\.html$/, '/'), full = here + location.search;
    return it.match.some(function (m) { return m.slice(-1) === '$' ? full.slice(-(m.length - 1)) === m.slice(0, -1) : full.indexOf(m) >= 0; });
  }
  /* 2026-11-22 v2: ตัวเลขข้างเมนู (cnt) ตั้งค่าด้วย NextShell.setCounts({ new: 8, ... }) */
  function setCounts(map) {
    document.querySelectorAll('[data-cnt]').forEach(function (el) {
      var n = map[el.getAttribute('data-cnt')];
      el.textContent = n == null ? '' : String(n); el.hidden = n == null;
    });
  }
  /* แถบล่างมือถือ (NEXT_BOTTOM[moduleId]) */
  function buildBottom(items) {
    var nav = document.createElement('nav');
    nav.className = 'nx-bnav'; nav.setAttribute('aria-label', 'เมนูหลัก');
    nav.innerHTML = items.map(function (it) {
      var on = isHere(it);
      return '<a href="' + esc(ROOT + it.href) + '"' + (on ? ' class="on" aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + it.ic + '</span>' + esc(it.label) + '</a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('nx-with-bnav');
  }
  function buildSide(items, opts) {
    var aside = document.createElement('aside');
    aside.className = 'nx-side'; aside.id = 'nx-side';
    aside.innerHTML =
      '<a href="' + esc(ROOT + 'apps/launcher/index.html') + '" class="nx-side-logo" aria-label="หน้าเลือกโมดุล"><img src="' + esc(ROOT + 'assets/brand/imode-logo-white.png') + '" alt="I-MODE"></a>' +
      '<nav aria-label="เมนู ' + esc(opts.title || '') + '"><ul>' + items.map(function (it, gi) {
        if (it.sep) return '<li class="nx-sep" role="separator"></li>';
        function link(x, sub) {
          var on = isHere(x);
          return '<li><a href="' + esc(ROOT + x.href) + '"' + (on || sub ? ' class="' + (on ? 'on' : '') + (sub ? ' sub' : '') + '"' : '') + (on ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + x.ic + '</span><span>' + esc(x.label) + '</span>' +
            (x.cnt ? '<span class="cnt" data-cnt="' + esc(x.cnt) + '" hidden></span>' : '') + '</a></li>';
        }
        /* 2026-11-23: กลุ่มพับได้ (it.children) เปิดค้างไว้เมื่ออยู่ในหน้าลูก หรือจำสถานะที่ผู้ใช้กดไว้ */
        if (it.children) {
          var inside = it.children.some(isHere), key = 'imode.next.grp.' + (opts.moduleId || '') + '.' + gi, open = inside;
          if (!inside) { try { open = localStorage.getItem(key) === '1'; } catch (e) {} }
          return '<li class="nx-grp"><button type="button" class="nx-grp-btn" data-grp="' + esc(key) + '" aria-expanded="' + open + '" aria-controls="nx-grp-' + gi + '"><span class="ic" aria-hidden="true">' + it.ic + '</span><span>' + esc(it.label) + '</span>' +
            '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
            '<div class="nx-sub-wrap' + (open ? ' open' : '') + '"' + (open ? '' : ' inert') + '><ul class="nx-sub" id="nx-grp-' + gi + '">' + it.children.map(function (c) { return link(c, true); }).join('') + '</ul></div></li>';
        }
        return link(it, false);
      }).join('') + '</ul></nav>' +
      /* 2026-11-24: ปุ่มกลับหน้าเลือกโมดุลหลัก (เจ้าของขอ) อยู่ล่างสุดของเมนูซ้าย */
      '<a href="' + esc(ROOT + 'apps/launcher/index.html') + '" class="nx-side-home"><span class="ic" aria-hidden="true">⬅</span><span>กลับหน้าเลือกโมดุล</span></a>';
    aside.addEventListener('click', function (e) {
      var b = e.target.closest('[data-grp]'); if (!b) return;
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      var w = b.nextElementSibling; w.classList.toggle('open', open); if (open) w.removeAttribute('inert'); else w.setAttribute('inert', '');
      try { localStorage.setItem(b.getAttribute('data-grp'), open ? '1' : '0'); } catch (x) {}
    });
    var back = document.createElement('div');
    back.className = 'nx-side-back'; back.hidden = true;
    document.body.insertBefore(back, document.body.firstChild);
    document.body.insertBefore(aside, document.body.firstChild);
    document.body.classList.add('nx-with-side');
    return { aside: aside, back: back };
  }

  function buildTop(opts) {
    var sideItems = (window.NEXT_SIDE || {})[opts.moduleId], side = sideItems && sideItems.length ? buildSide(sideItems, opts) : null;
    var top = document.createElement('header');
    top.className = 'nx-top';
    var initials = (state.user && (state.user.name || state.user.username) || '?').trim().slice(0, 2);
    top.innerHTML =
      (side ? '<button type="button" class="nx-icon-btn nx-menu-btn" data-menu-btn aria-label="เมนู" aria-expanded="false" aria-controls="nx-side"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' : '') +
      '<a href="' + esc(ROOT + 'apps/launcher/index.html') + '" class="nx-logo" aria-label="หน้าเลือกโมดุล">' + logo() + '</a>' +
      '<span class="nx-title">' + esc(opts.title || '') + '</span>' +
      '<button type="button" class="nx-icon-btn" data-theme-btn aria-label="สลับธีม สว่าง/มืด"></button>' +
      '<span class="nx-bell-wrap" hidden><button type="button" class="nx-icon-btn" data-bell aria-label="แจ้งเตือน" aria-expanded="false" aria-controls="nx-bell">' +
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' +
      '<span class="nx-bell-n" hidden></span></button></span>' +
      '<button type="button" class="nx-icon-btn" data-sw-btn aria-label="โมดุลทั้งหมด" aria-expanded="false" aria-controls="nx-sw">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg></button>' +
      '<button type="button" class="nx-avatar" data-acct aria-label="บัญชีของฉัน" title="' + esc(state.user ? state.user.name + ' · ' + state.user.role : '') + '">' + esc(initials) + '</button>';
    var panel = document.createElement('div');
    panel.className = 'nx-sw'; panel.id = 'nx-sw'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'โมดุลทั้งหมด');
    document.body.insertBefore(panel, document.body.firstChild);
    document.body.insertBefore(top, document.body.firstChild);

    var themeBtn = top.querySelector('[data-theme-btn]');
    function paintThemeBtn() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeBtn.innerHTML = dark
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
    }
    paintThemeBtn();
    window.__nxPaintTheme = paintThemeBtn;
    themeBtn.addEventListener('click', function () {
      var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(t); saveTheme(t);
      paintThemeBtn();
    });

    if (side) {
      var menuBtn = top.querySelector('[data-menu-btn]');
      /* จอใหญ่: ปุ่มนี้ซ่อน/แสดงแถบเมนู (จำไว้ในเครื่อง) · จอเล็ก: เปิดเป็นลิ้นชักทับหน้า */
      var SIDE_KEY = 'imode.next.sideClosed';
      var wide = function () { return !window.matchMedia || matchMedia('(min-width: 901px)').matches; };
      var setMenu = function (v) { side.aside.classList.toggle('open', v); side.back.hidden = !v; menuBtn.setAttribute('aria-expanded', String(v)); };
      var setClosed = function (v) { document.body.classList.toggle('nx-side-closed', v); menuBtn.setAttribute('aria-expanded', String(!v)); try { localStorage.setItem(SIDE_KEY, v ? '1' : '0'); } catch (e) {} };
      var was = false; try { was = localStorage.getItem(SIDE_KEY) === '1'; } catch (e) {}
      document.body.classList.toggle('nx-side-closed', was);
      menuBtn.setAttribute('aria-expanded', String(wide() ? !was : false));
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (wide()) setClosed(!document.body.classList.contains('nx-side-closed'));
        else setMenu(!side.aside.classList.contains('open'));
      });
      side.back.addEventListener('click', function () { setMenu(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && side.aside.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });
    }

    var swBtn = top.querySelector('[data-sw-btn]');
    var editing = false;
    function open(v) { panel.hidden = !v; swBtn.setAttribute('aria-expanded', String(v)); if (v) renderSwitcher(panel, editing); }
    swBtn.addEventListener('click', function (e) { e.stopPropagation(); editing = false; open(panel.hidden); });
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('[data-edit]')) { editing = true; renderSwitcher(panel, true); return; }
      if (e.target.closest('[data-done]')) { editing = false; saveFavs(); renderSwitcher(panel, false); return; }
      var f = e.target.closest('[data-fav]');
      if (f) {
        var id = f.getAttribute('data-fav'), i = state.favs.indexOf(id);
        if (i >= 0) state.favs.splice(i, 1); else state.favs.push(id);
        renderSwitcher(panel, true);
      }
    });
    document.addEventListener('click', function () { if (!panel.hidden) { if (editing) saveFavs(); editing = false; open(false); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); swBtn.focus(); } });

    top.querySelector('[data-acct]').addEventListener('click', async function () {
      if (!window.confirm('ออกจากระบบ?')) return;
      await window.ImodeAuth.signOut();
      location.href = ROOT + 'apps/launcher/index.html';
    });
  }

  /* ---------- แจ้งเตือน (ตาราง app_notifications จาก SQL 04) ----------
     กระดิ่งบนแถบบน: ตัวเลขที่ยังไม่อ่าน, กดดู 15 รายการล่าสุด, กดรายการ = เปิดเคส + อ่านแล้ว
     แจ้งเตือนใหม่เด้งทันทีผ่าน realtime และขึ้นที่มุมจอ (ถ้าเปิดอนุญาตไว้ ขึ้นแจ้งเตือนของเครื่องด้วยตอนอยู่แท็บอื่น) */
  var KIND_IC = { new_case: '🆕', assigned: '🧑‍🔧', stage: '➡️', hold: '⏸️', message: '💬' };
  function ago(t) {
    var s = Math.max(0, (Date.now() - new Date(t)) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว';
    if (s < 86400) return Math.floor(s / 3600) + ' ชม.ที่แล้ว';
    if (s < 172800) return 'เมื่อวาน';
    return new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  function notifHref(n) { return n.case_id ? ROOT + 'next/service/case.html?id=' + encodeURIComponent(n.case_id) : ROOT + 'next/notifications/index.html'; }
  function notifRow(n) {
    return '<a class="nx-nrow' + (n.read_at ? '' : ' unread') + '" href="' + esc(notifHref(n)) + '" data-nid="' + esc(n.id) + '">' +
      '<span class="nx-nic" aria-hidden="true">' + (KIND_IC[n.kind] || '🔔') + '</span>' +
      '<span class="nx-ntx"><b>' + esc(n.title) + '</b>' + (n.body ? '<span>' + esc(n.body) + '</span>' : '') +
      '<small>' + esc((n.actor_name ? n.actor_name + ' · ' : '') + ago(n.created_at)) + '</small></span></a>';
  }
  var notif = { unread: 0, list: [], ok: false };
  async function markRead(ids) {
    if (!ids.length) return;
    var stamp = new Date().toISOString();
    await window.ImodeAuth.client().from('app_notifications').update({ read_at: stamp }).in('id', ids);
    notif.list.forEach(function (n) { if (ids.indexOf(n.id) >= 0 && !n.read_at) { n.read_at = stamp; notif.unread = Math.max(0, notif.unread - 1); } });
  }
  async function markAllRead() {
    var stamp = new Date().toISOString();
    await window.ImodeAuth.client().from('app_notifications').update({ read_at: stamp }).eq('user_id', state.user.id).is('read_at', null);
    notif.list.forEach(function (n) { if (!n.read_at) n.read_at = stamp; });
    notif.unread = 0;
  }
  function toast(n) {
    var t = document.createElement('a');
    t.className = 'nx-toast'; t.href = notifHref(n);
    t.innerHTML = '<span class="nx-nic" aria-hidden="true">' + (KIND_IC[n.kind] || '🔔') + '</span><span class="nx-ntx"><b>' + esc(n.title) + '</b>' + (n.body ? '<span>' + esc(n.body) + '</span>' : '') + '</span>';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, 6000);
    try {
      if (document.hidden && window.Notification && Notification.permission === 'granted') {
        var sys = new Notification(n.title, { body: n.body || '', tag: n.id });
        sys.onclick = function () { window.focus(); location.href = notifHref(n); };
      }
    } catch (e) {}
  }
  async function setupBell(top) {
    var sb = window.ImodeAuth.client();
    var res = await sb.from('app_notifications').select('id,kind,title,body,case_id,actor_name,created_at,read_at')
      .eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(15);
    if (res.error) return; // ยังไม่ได้รัน SQL 04 → ไม่แสดงกระดิ่ง
    var cnt = await sb.from('app_notifications').select('id', { count: 'exact', head: true }).eq('user_id', state.user.id).is('read_at', null);
    notif.ok = true; notif.list = res.data || []; notif.unread = cnt.count || notif.list.filter(function (n) { return !n.read_at; }).length;
    var wrap = top.querySelector('.nx-bell-wrap'), btn = top.querySelector('[data-bell]'), badge = top.querySelector('.nx-bell-n');
    wrap.hidden = false;
    var panel = document.createElement('div');
    panel.className = 'nx-bell'; panel.id = 'nx-bell'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'แจ้งเตือน');
    document.body.appendChild(panel);
    function paint() {
      badge.hidden = !notif.unread; badge.textContent = notif.unread > 99 ? '99+' : String(notif.unread);
      btn.setAttribute('aria-label', 'แจ้งเตือน' + (notif.unread ? ' ยังไม่อ่าน ' + notif.unread : ''));
      if (panel.hidden) return;
      panel.innerHTML = '<div class="nx-bell-head"><b>แจ้งเตือน</b>' + (notif.unread ? '<button type="button" class="nx-link" data-allread>อ่านทั้งหมดแล้ว</button>' : '') + '</div>' +
        (notif.list.length ? '<div class="nx-bell-list">' + notif.list.map(notifRow).join('') + '</div>' : '<div class="nx-empty" style="padding:28px 16px">ยังไม่มีแจ้งเตือน</div>') +
        '<a class="nx-bell-all" href="' + esc(ROOT + 'next/notifications/index.html') + '">ดูทั้งหมด</a>';
    }
    window.NextShell.notif = { paint: paint, markRead: markRead, markAllRead: markAllRead, row: notifRow, state: notif };
    paint();
    btn.addEventListener('click', function (e) { e.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); paint(); });
    panel.addEventListener('click', async function (e) {
      e.stopPropagation();
      if (e.target.closest('[data-allread]')) { await markAllRead(); paint(); return; }
      var a = e.target.closest('[data-nid]');
      if (a) { e.preventDefault(); await markRead([a.getAttribute('data-nid')]); location.href = a.href; }
    });
    document.addEventListener('click', function () { if (!panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.focus(); } });
    try {
      sb.channel('notif-' + state.user.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: 'user_id=eq.' + state.user.id }, function (p) {
          var n = p.new; if (!n || notif.list.some(function (x) { return x.id === n.id; })) return;
          notif.list.unshift(n); notif.list = notif.list.slice(0, 15); notif.unread++;
          paint(); toast(n);
          try { window.dispatchEvent(new CustomEvent('nx-notif', { detail: n })); } catch (e) {}
        }).subscribe();
    } catch (e) {}
  }

  async function loadPerms() {
    var roles = [state.user.role].concat(state.user.extraRoles || []).filter(Boolean);
    var res = await window.ImodeAuth.client().from('app_role_perms').select('perm').in('role', roles);
    if (res.error) throw new Error('อ่านสิทธิ์ไม่ได้ (รัน SQL 01-foundation แล้วหรือยัง?): ' + res.error.message);
    state.perms = (res.data || []).map(function (r) { return r.perm; });
  }

  async function start(opts) {
    opts = opts || {};
    state.user = await window.ImodeAuth.requireUser(ROOT + 'apps/launcher/index.html');
    state.favs = loadFavs();
    var permErr = null;
    try { await loadPerms(); } catch (e) { permErr = e; }
    buildTop(opts);
    var bottom = (window.NEXT_BOTTOM || {})[opts.moduleId];
    if (bottom && bottom.length) buildBottom(bottom);
    if (permErr) throw permErr;
    setupBell(document.querySelector('.nx-top')).catch(function () {});
    var mod = (window.NEXT_MODULES || []).filter(function (m) { return m.id === opts.moduleId; })[0];
    if (mod && mod.perm && !can(mod.perm)) throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าโมดุลนี้');
    // 2026-11-24: ปุ่ม + มุมขวาล่าง (แชท · ธีม) ทุกหน้า
    if (!window.ImodeFab && !document.getElementById('cfJs')) { var fj = document.createElement('script'); fj.id = 'cfJs'; fj.src = ROOT + 'shared/chat-fab.js?v=20261124b'; document.body.appendChild(fj); }
    return { user: state.user, can: can, sb: window.ImodeAuth.client(), root: ROOT, esc: esc };
  }

  window.NextShell = { start: start, applyTheme: applyTheme, esc: esc, setCounts: setCounts };
})();
