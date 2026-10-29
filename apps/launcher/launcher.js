(function () {
  'use strict';
  /* Module list lives in shared/modules.js; hrefs there are from the platform root. */
  var MODULES = window.IMODE_MODULES.map(function (m) {
    return { id: m.id, name: m.name, icon: m.icon, href: m.href ? '../../' + m.href : '' };
  });

  /* ---- per-person order + icon choice (local + account, like the theme) ---- */
  var BASE = MODULES.slice();           // default order
  var DEFAULT_ICON = {};
  BASE.forEach(function (m) { DEFAULT_ICON[m.id] = m.icon; });
  var G = function (d) { return '<g transform="translate(8 8) scale(1.33)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</g>'; };
  var GLYPHS = [
    ['box', '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>'],
    ['tool', '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'],
    ['chart', '<path d="M12 20V10M18 20V4M6 20v-4"/>'],
    ['check', '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>'],
    ['users', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
    ['cart', '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'],
    ['truck', '<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'],
    ['file', '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>'],
    ['calendar', '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'],
    ['dollar', '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'],
    ['clipboard', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'],
    ['pin', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'],
    ['shield', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'],
    ['star', '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>'],
    ['chat', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'],
    ['briefcase', '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'],
    ['home', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'],
    ['flask', '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/>'],
    ['bolt', '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'],
    ['bell', '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>']
  ];
  var COLORS = ['#0b63e5', '#f79009', '#12a06a', '#6a4fd6', '#c2417a', '#0f8ea3', '#0c225e', '#d92d20', '#4a5d80'];
  function glyphOf(id) { for (var i = 0; i < GLYPHS.length; i++) if (GLYPHS[i][0] === id) return GLYPHS[i][1]; return null; }
  function glyphSvg(g, c) { return '<rect x="6" y="6" width="36" height="36" rx="9" fill="' + c + '"/>' + G(glyphOf(g)); }

  var st = { order: [], icons: {}, at: 0 };   // saved choice
  var storeKey = 'imode.launcher';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function cleanState(x) {
    var o = { order: [], icons: {}, at: Number(x && x.at) || 0 };
    if (x && Array.isArray(x.order)) o.order = x.order.filter(function (id) { return typeof id === 'string' && DEFAULT_ICON[id] !== undefined; });
    if (x && x.icons && typeof x.icons === 'object') {
      Object.keys(x.icons).forEach(function (id) {
        var v = x.icons[id];
        if (DEFAULT_ICON[id] !== undefined && v && glyphOf(v.g) && COLORS.indexOf(v.c) >= 0) o.icons[id] = { g: v.g, c: v.c };
      });
    }
    return o;
  }
  function applyState() {
    var pos = {};
    st.order.forEach(function (id, i) { pos[id] = i; });
    MODULES = BASE.map(function (m, i) { return { m: m, k: pos[m.id] !== undefined ? pos[m.id] : st.order.length + i }; })
      .sort(function (a, b) { return a.k - b.k; })
      .map(function (x) {
        var ic = st.icons[x.m.id];
        return { id: x.m.id, name: x.m.name, href: x.m.href, icon: ic ? glyphSvg(ic.g, ic.c) : DEFAULT_ICON[x.m.id] };
      });
  }
  function acct() {
    try { return window.ImodeAuth && window.ImodeAuth.client(); } catch (e) { return null; }
  }
  function push() {
    var c = acct();
    if (!c) return;
    c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) return;
      return c.auth.updateUser({ data: { imode_launcher: { order: st.order, icons: st.icons, at: st.at } } });
    }).catch(function () {});
  }
  function save() {
    st.at = Date.now();
    lsSet(storeKey, JSON.stringify(st));
    push();
  }
  function pull() {
    var c = acct();
    if (!c) return;
    c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) return null;
      return c.auth.getUser();
    }).then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u || editing) return;
      var remote = cleanState((u.user_metadata || {}).imode_launcher);
      if (remote.at > st.at) {
        st = remote; lsSet(storeKey, JSON.stringify(st)); applyState(); renderGrid();
      } else if (st.at > remote.at) {
        push();
      }
    }).catch(function () {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function greeting(name) {
    var h = new Date().getHours();
    var part = h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
    return part + ' คุณ' + name;
  }

  function renderGrid() {
    document.getElementById('appGrid').innerHTML = MODULES.map(function (m) {
      var ready = !!m.href;
      var inner =
        '<span class="app-icon"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">' + m.icon + '</svg>' +
        '</span>' +
        '<span class="app-name">' + esc(m.name) + '</span>';
      return '<li data-id="' + esc(m.id) + '">' + (ready
        ? '<a class="app" href="' + esc(m.href) + '">' + inner + '</a>'
        : '<button type="button" class="app is-soon" data-name="' + esc(m.name) + '" aria-label="' + esc(m.name) + ' (ยังไม่เปิดใช้)">' + inner + '</button>') +
        '</li>';
    }).join('');
    var soon = MODULES.filter(function (m) { return !m.href; }).length;
    var note = document.getElementById('gridNote');
    if (note) note.innerHTML = soon ? '<i aria-hidden="true"></i>กรอบเส้นประ = กำลังพัฒนา (' + soon + ' โมดูล)' : '';
  }
  document.getElementById('appGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.is-soon');
    if (b) toast('โมดูล ' + b.getAttribute('data-name') + ' กำลังพัฒนา');
  });

  /* ---- edit mode: drag to reorder, tap to change icon ---- */
  var editing = false, drag = null, press = null, swallowClick = false;
  function grid() { return document.getElementById('appGrid'); }
  function setEditing(on) {
    editing = on;
    grid().classList.toggle('is-editing', on);
    document.getElementById('editBar').hidden = !on;
    document.getElementById('gridNote').hidden = on;
    if (on) toast('ลากเพื่อย้าย แตะที่โมดูลเพื่อเปลี่ยนไอคอน');
  }
  function commitOrder() {
    st.order = [].map.call(grid().children, function (li) { return li.getAttribute('data-id'); });
    save(); applyState();
  }
  function endDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    drag.li.classList.remove('is-drag');
    drag = null;
  }
  function openIconDialog(id) {
    var mod = MODULES.filter(function (m) { return m.id === id; })[0];
    if (!mod) return;
    var cur = st.icons[id] || null;
    var back = document.createElement('div');
    back.className = 'icon-dlg-back';
    back.innerHTML =
      '<div class="icon-dlg" role="dialog" aria-modal="true" aria-label="เปลี่ยนไอคอน ' + esc(mod.name) + '">' +
      '<h2>เปลี่ยนไอคอน · ' + esc(mod.name) + '</h2>' +
      '<div class="icon-prev"><span class="app-icon"><svg width="48" height="48" viewBox="0 0 48 48" id="dlgPrev" aria-hidden="true"></svg></span></div>' +
      '<div><h3>รูปไอคอน</h3><div class="glyph-grid">' + GLYPHS.map(function (g) {
        return '<button type="button" class="glyph-btn" data-g="' + g[0] + '" aria-label="' + g[0] + '"><svg viewBox="0 0 48 48" aria-hidden="true">' + G(g[1]).replace(/#fff/g, 'currentColor') + '</svg></button>';
      }).join('') + '</div></div>' +
      '<div><h3>สี</h3><div class="color-row">' + COLORS.map(function (c) {
        return '<button type="button" class="color-btn" data-c="' + c + '" style="background:' + c + '" aria-label="สี ' + c + '"></button>';
      }).join('') + '</div></div>' +
      '<div class="dlg-actions"><button type="button" class="edit-btn" id="dlgDefault">ใช้ไอคอนเดิม</button><button type="button" class="edit-btn is-primary" id="dlgClose">ตกลง</button></div>' +
      '</div>';
    document.body.appendChild(back);
    var prevFocus = document.activeElement;
    function paint() {
      back.querySelector('#dlgPrev').innerHTML = cur ? glyphSvg(cur.g, cur.c) : DEFAULT_ICON[id];
      [].forEach.call(back.querySelectorAll('.glyph-btn'), function (b) { b.setAttribute('aria-pressed', String(!!cur && cur.g === b.getAttribute('data-g'))); });
      [].forEach.call(back.querySelectorAll('.color-btn'), function (b) { b.setAttribute('aria-pressed', String(!!cur && cur.c === b.getAttribute('data-c'))); });
    }
    function commit() {
      if (cur) st.icons[id] = cur; else delete st.icons[id];
      save(); applyState(); renderGrid(); setEditing(true);
    }
    function close() { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {} }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.id === 'dlgClose') return close();
      if (e.target.id === 'dlgDefault') { cur = null; commit(); paint(); return; }
      var g = e.target.closest('.glyph-btn'), c = e.target.closest('.color-btn');
      if (g) { cur = { g: g.getAttribute('data-g'), c: cur ? cur.c : COLORS[0] }; commit(); paint(); }
      else if (c) { cur = { g: cur ? cur.g : GLYPHS[0][0], c: c.getAttribute('data-c') }; commit(); paint(); }
    });
    document.addEventListener('keydown', onKey);
    paint();
    back.querySelector('#dlgClose').focus();
  }
  function wireEdit() {
    var g = grid();
    g.addEventListener('dragstart', function (e) { e.preventDefault(); });
    g.addEventListener('contextmenu', function (e) { if (editing) e.preventDefault(); });
    // while editing, tiles never open their module
    g.addEventListener('click', function (e) {
      if (editing || swallowClick) { e.preventDefault(); e.stopImmediatePropagation(); swallowClick = false; }
    }, true);
    g.addEventListener('pointerdown', function (e) {
      var li = e.target.closest('#appGrid > li');
      if (!li || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var d = { li: li, id: li.getAttribute('data-id'), x: e.clientX, y: e.clientY, moved: false, ghost: null };
      if (editing) { drag = d; return; }
      // long-press (touch or mouse) enters edit mode
      clearTimeout(press);
      press = setTimeout(function () { press = null; swallowClick = true; setEditing(true); }, 550);
      d.watch = true; drag = d;
    });
    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dist = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      if (!editing) { if (dist > 10) { clearTimeout(press); press = null; drag = null; } return; }
      if (!drag.moved && dist > 6) {
        drag.moved = true;
        var r = drag.li.getBoundingClientRect();
        drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
        drag.ghost = drag.li.cloneNode(true);
        drag.ghost.className = 'drag-ghost';
        drag.ghost.style.width = r.width + 'px';
        document.body.appendChild(drag.ghost);
        drag.li.classList.add('is-drag');
      }
      if (!drag.moved) return;
      e.preventDefault();
      drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
      drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest && el.closest('#appGrid > li');
      if (over && over !== drag.li) {
        var kids = [].slice.call(g.children);
        if (kids.indexOf(over) > kids.indexOf(drag.li)) g.insertBefore(drag.li, over.nextSibling);
        else g.insertBefore(drag.li, over);
      }
    }, { passive: false });
    function up() {
      clearTimeout(press); press = null;
      if (!drag) return;
      var d = drag;
      if (!editing) { drag = null; return; }
      endDrag();
      if (d.moved) { swallowClick = true; commitOrder(); renderGrid(); setEditing(true); }
      else if (!swallowClick) openIconDialog(d.id);
      setTimeout(function () { swallowClick = false; }, 0);
    }
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', function () { clearTimeout(press); press = null; endDrag(); });
    document.getElementById('doneBtn').addEventListener('click', function () { setEditing(false); });
    document.getElementById('resetBtn').addEventListener('click', function () {
      st.order = []; st.icons = {}; save(); applyState(); renderGrid(); setEditing(true);
      toast('คืนลำดับและไอคอนเดิมแล้ว');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && editing && !document.querySelector('.icon-dlg-back')) setEditing(false); });
  }

  function renderUser(u) {
    var display = u.name || u.username;
    document.getElementById('avatar').textContent = display.trim().charAt(0).toUpperCase();
    if (u.photo) {
      var img = new Image();
      img.alt = '';
      img.onload = function () { var a = document.getElementById('avatar'); a.textContent = ''; a.appendChild(img); };
      img.src = u.photo;
    }
    document.getElementById('userName').textContent = display;
    document.getElementById('userRole').textContent = u.role + (u.team ? ' · ' + u.team : '');
    document.getElementById('popName').textContent = display;
    document.getElementById('popUser').textContent = '@' + u.username;
    document.getElementById('greeting').textContent = greeting(display);
  }

  function wireMenu() {
    var btn = document.getElementById('userBtn');
    var pop = document.getElementById('userPop');
    function set(open) { pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(pop.hidden); });
    document.addEventListener('click', function (e) { if (!pop.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
    document.getElementById('themeBtn').addEventListener('click', function () { set(false); window.ImodeTheme.open(); });
    document.getElementById('editBtn').addEventListener('click', function () { set(false); setEditing(true); });
    document.getElementById('signOutBtn').addEventListener('click', async function () {
      leaving = true;
      await ImodeAuth.signOut();
      location.replace('login.html');
    });
  }

  /* 2026-10-29 — the round palette button (shared/theme-pref.js <body data-theme-fab>) becomes a
     quick-action button, like Opera's: tap it, or press and hold, and round actions fan out around
     it over a dimmed page. Tap one, or keep holding and slide onto one and let go. Escape, the
     button again, or the dim page closes it. On every other page the button still opens the theme. */
  var FAB_ITEMS = [
    { id: 'edit', label: 'จัดเรียงไอคอน', run: function () { setEditing(true); },
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/></svg>' },
    { id: 'theme', label: 'ตั้งค่าธีม', run: function () { window.ImodeTheme.open(); },
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.8-.8-1.3-.8-2.1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>' }
  ];
  function wireFab() {
    var old = document.getElementById('imodeThemeFab');
    if (!old) return false;
    var fab = old.cloneNode(true);            /* drops theme-pref's own click → theme */
    old.parentNode.replaceChild(fab, old);
    fab.title = 'การตั้งค่า'; fab.setAttribute('aria-label', 'การตั้งค่า');
    fab.setAttribute('aria-haspopup', 'menu'); fab.setAttribute('aria-expanded', 'false');
    var menu = null, hold = null, held = false, hot = null;

    function place() {
      var r = fab.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      /* a quarter circle from straight left to straight up, away from the screen corner */
      var n = FAB_ITEMS.length, R = 96;
      [].forEach.call(menu.querySelectorAll('.fab-act'), function (b, i) {
        var a = Math.PI + (n === 1 ? Math.PI / 4 : (Math.PI / 2) * (0.15 + 0.7 * i / (n - 1)));
        b.style.left = (cx + R * Math.cos(a)) + 'px';
        b.style.top = (cy + R * Math.sin(a)) + 'px';
      });
    }
    function open() {
      if (menu) return;
      menu = document.createElement('div');
      menu.className = 'fab-menu';
      menu.setAttribute('role', 'menu');
      menu.innerHTML = FAB_ITEMS.map(function (it, i) {
        return '<button type="button" role="menuitem" class="fab-act" data-act="' + it.id + '" style="--i:' + i + '">' +
          '<span class="fab-ic">' + it.icon + '</span><span class="fab-lb">' + it.label + '</span></button>';
      }).join('');
      document.body.appendChild(menu);
      document.body.classList.add('fab-open');
      fab.setAttribute('aria-expanded', 'true');
      place();
      requestAnimationFrame(function () { if (menu) menu.classList.add('is-in'); });
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('.fab-act');
        if (b) { run(b.getAttribute('data-act')); return; }
        close();
      });
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', place);
    }
    function close() {
      if (!menu) return;
      menu.remove(); menu = null; hot = null;
      document.body.classList.remove('fab-open');
      fab.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    }
    function run(id) {
      close();
      var it = FAB_ITEMS.filter(function (x) { return x.id === id; })[0];
      if (it) it.run();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); fab.focus(); } }
    function hit(x, y) {
      var el = document.elementFromPoint(x, y), b = el && el.closest ? el.closest('.fab-act') : null;
      if (hot && hot !== b) hot.classList.remove('is-hot');
      hot = b; if (b) b.classList.add('is-hot');
    }

    fab.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      held = false;
      clearTimeout(hold);
      hold = setTimeout(function () {          /* press and hold: open, then slide onto an action */
        held = true;
        open();
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {}
      }, 320);
      try { fab.setPointerCapture(e.pointerId); } catch (x) {}
    });
    fab.addEventListener('pointermove', function (e) { if (held && menu) hit(e.clientX, e.clientY); });
    fab.addEventListener('pointerup', function (e) {
      clearTimeout(hold);
      if (held) {
        held = false;
        if (hot) { var id = hot.getAttribute('data-act'); run(id); }
        fab.dataset.skipClick = '1';         /* the click that follows a hold is not a tap */
      }
    });
    fab.addEventListener('pointercancel', function () { clearTimeout(hold); held = false; });
    fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    fab.addEventListener('click', function () {
      if (fab.dataset.skipClick) { delete fab.dataset.skipClick; return; }
      if (menu) close(); else { open(); var f = menu.querySelector('.fab-act'); if (f) f.focus(); }
    });
    return true;
  }

  var leaving = false;
  wireMenu();
  wireEdit();
  if (!wireFab()) document.addEventListener('DOMContentLoaded', function () { if (!wireFab()) setTimeout(wireFab, 300); });
  ImodeAuth.requireUser('login.html').then(function (u) {
    storeKey = 'imode.launcher.' + u.username;
    try { st = cleanState(JSON.parse(lsGet(storeKey) || 'null')); } catch (e) {}
    applyState();
    renderGrid();
    renderUser(u);
    pull();
    document.body.classList.remove('is-loading');
  });
  // signed out in another tab
  ImodeAuth.client().auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT' && !leaving) location.replace('login.html');
  });
})();
