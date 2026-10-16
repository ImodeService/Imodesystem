/* Shared page frame for new ERP modules (pairs with module-shell.css).
   Load after supabase.min.js, config.js, auth.js and modules.js, then:
     var page = await ImodeShell.start({ module: 'tracking', root: '../../', subtitle, actions });
     var kp = ImodeShell.kpis(page.body, cards);           // cards with `filter` become filter buttons
     var ls = ImodeShell.list(page.body, opt);             // searchable table, cards on phones
     kp.bind(ls);                                          // clicking a card filters the list
   start() signs the visitor in (or sends them to the login page) and draws sidebar, top bar and page head. */
(function () {
  'use strict';
  var ICON = {
    apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'
  };
  function line(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>';
  }
  function tile(m) { return '<svg viewBox="0 0 48 48" aria-hidden="true">' + (m.icon || '') + '</svg>'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  var toastTimer;
  function toast(msg) {
    var t = document.querySelector('.sh-toast');
    if (!t) { t = el('<div class="sh-toast" role="status" aria-live="polite"></div>'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2800);
  }

  function sidebar(root, current) {
    var mods = window.IMODE_MODULES || [];
    var link = function (m) {
      var label = esc(m.fullName || m.name);
      if (m.id === current) return '<a class="sh-link" aria-current="page" href="#">' + tile(m) + '<span>' + label + '</span></a>';
      return '<a class="sh-link" href="' + esc(root + m.href) + '">' + tile(m) + '<span>' + label + '</span></a>';
    };
    // Modules that exist are listed by group; the rest wait under one folded "coming soon" list.
    var groups = (window.IMODE_MODULE_GROUPS || []).map(function (g) {
      var items = mods.filter(function (m) { return m.group === g.id && (m.href || m.id === current); });
      return items.length ? '<div class="sh-group">' + esc(g.name) + '</div>' + items.map(link).join('') : '';
    }).join('');
    var soon = mods.filter(function (m) { return !m.href && m.id !== current; });
    var soonHtml = soon.length ? '<details class="sh-soon"><summary>' + line('chevron') + 'กำลังพัฒนา <span class="sh-soon-n">' + soon.length + '</span></summary>' +
      soon.map(function (m) { return '<span class="sh-link is-soon">' + tile(m) + '<span>' + esc(m.fullName || m.name) + '</span></span>'; }).join('') + '</details>' : '';
    return '<aside class="sh-side" id="shSide" aria-label="เมนูโมดูล">' +
      '<div class="sh-brand"><a href="' + esc(root) + 'apps/launcher/index.html" aria-label="I-MODE System หน้าเลือกโมดูล"><img src="' + esc(root) + 'assets/brand/imode-logo.png" data-dark-src="' + esc(root) + 'assets/brand/imode-logo-white.png" alt=""></a>' +
      '<button type="button" class="sh-icon-btn sh-close" aria-label="ปิดเมนู">' + line('close') + '</button></div>' +
      '<nav class="sh-nav"><a class="sh-link sh-home" href="' + esc(root) + 'apps/launcher/index.html">' + line('apps') + '<span>ทุกโมดูล</span></a>' + groups + soonHtml + '</nav></aside>';
  }

  async function start(opt) {
    var root = opt.root || '../../';
    var mod = (window.IMODE_MODULES || []).filter(function (m) { return m.id === opt.module; })[0] || { name: opt.module, icon: '' };
    var title = opt.title || mod.fullName || mod.name;
    document.title = title + ' · I-MODE System';
    document.body.classList.add('sh-page', 'is-loading');
    var shell = el(
      '<div class="shell">' + sidebar(root, opt.module) + '<div class="sh-scrim" aria-hidden="true"></div>' +
      '<div class="sh-main">' +
        '<header class="sh-top">' +
          '<button type="button" class="sh-icon-btn sh-menu-btn" aria-label="เปิดเมนู" aria-controls="shSide" aria-expanded="false">' + line('menu') + '</button>' +
          '<nav class="sh-crumb" aria-label="ตำแหน่งหน้า"><a href="' + esc(root) + 'apps/launcher/index.html">หน้าหลัก</a><span aria-hidden="true">/</span><span aria-current="page">' + esc(title) + '</span></nav>' +
          '<div class="sh-user"><button type="button" class="sh-user-btn" aria-haspopup="true" aria-expanded="false"><span class="sh-avatar" aria-hidden="true"></span><span class="sh-user-text"><span class="sh-user-name"></span><span class="sh-user-role"></span></span></button>' +
          '<div class="sh-pop" role="menu" hidden><div class="sh-pop-head"><strong class="sh-pop-name"></strong><span class="sh-pop-user"></span></div>' +
          (window.ImodeTheme ? '<button type="button" role="menuitem" class="sh-pop-plain sh-theme">' + line('theme') + 'ธีมหน้าจอ</button>' : '') +
          '<button type="button" role="menuitem" class="sh-signout">' + line('logout') + 'ออกจากระบบ</button></div></div>' +
        '</header>' +
        '<main class="sh-content" id="main">' +
          '<div class="sh-head"><span class="sh-head-icon">' + tile(mod) + '</span><div class="sh-head-text"><h1>' + esc(title) + '</h1>' +
          (opt.subtitle ? '<p>' + esc(opt.subtitle) + '</p>' : '') + '</div><div class="sh-actions"></div></div>' +
          '<div class="sh-body"></div>' +
        '</main>' +
      '</div></div>');

    var acts = shell.querySelector('.sh-actions');
    (opt.actions || []).forEach(function (a) {
      var b = el('<button type="button" class="sh-btn' + (a.primary ? ' is-primary' : '') + '">' + (a.icon ? line(a.icon) : '') + '<span>' + esc(a.label) + '</span></button>');
      if (a.onClick) b.addEventListener('click', function (e) { a.onClick(e, b); });
      acts.appendChild(b);
    });

    // phone / tablet drawer
    var menuBtn = shell.querySelector('.sh-menu-btn');
    function setNav(open) {
      shell.classList.toggle('nav-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      if (open) shell.querySelector('.sh-close').focus(); else if (shell.contains(document.activeElement)) menuBtn.focus();
    }
    menuBtn.addEventListener('click', function () { setNav(true); });
    shell.querySelector('.sh-close').addEventListener('click', function () { setNav(false); });
    shell.querySelector('.sh-scrim').addEventListener('click', function () { setNav(false); });

    // user menu
    var ubtn = shell.querySelector('.sh-user-btn'), pop = shell.querySelector('.sh-pop'), leaving = false;
    function setPop(open) { pop.hidden = !open; ubtn.setAttribute('aria-expanded', String(open)); }
    ubtn.addEventListener('click', function (e) { e.stopPropagation(); setPop(pop.hidden); });
    document.addEventListener('click', function (e) { if (!pop.contains(e.target)) setPop(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!pop.hidden) { setPop(false); ubtn.focus(); }
      if (shell.classList.contains('nav-open')) setNav(false);
    });
    var themeBtn = shell.querySelector('.sh-theme');
    if (themeBtn) themeBtn.addEventListener('click', function () { setPop(false); window.ImodeTheme.open(); });
    shell.querySelector('.sh-signout').addEventListener('click', async function () {
      leaving = true; await ImodeAuth.signOut(); location.replace(root + 'apps/launcher/login.html');
    });

    document.body.appendChild(shell);
    var user = await ImodeAuth.requireUser(root + 'apps/launcher/login.html');
    var display = user.name || user.username;
    shell.querySelector('.sh-avatar').textContent = display.trim().charAt(0).toUpperCase();
    shell.querySelector('.sh-user-name').textContent = display;
    shell.querySelector('.sh-user-role').textContent = user.role + (user.team ? ' · ' + user.team : '');
    shell.querySelector('.sh-pop-name').textContent = display;
    shell.querySelector('.sh-pop-user').textContent = '@' + user.username;
    document.body.classList.remove('is-loading');
    ImodeAuth.client().auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && !leaving) location.replace(root + 'apps/launcher/login.html');
    });
    return { user: user, body: shell.querySelector('.sh-body'), toast: toast };
  }

  /* cards: [{ label, value, note, tone: 'blue'|'orange'|'green'|'red', icon, filter: fn(row) }]
     A card with `filter` is a button: pressing it narrows the bound list; pressing again clears. */
  function kpis(target, cards) {
    var wrap = el('<section class="sh-kpis" aria-label="สรุป"></section>');
    var list = null, active = -1;
    cards.forEach(function (c, i) {
      var tag = c.filter ? 'button' : 'div';
      var node = el('<' + tag + ' class="sh-kpi tone-' + esc(c.tone || 'blue') + '"' + (c.filter ? ' type="button" aria-pressed="false"' : '') + '>' +
        '<span class="sh-kpi-top"><span class="sh-kpi-label">' + esc(c.label) + '</span><span class="sh-kpi-ico">' + line(c.icon || 'list') + '</span></span>' +
        '<span class="sh-kpi-value">' + esc(c.value) + '</span>' + (c.note ? '<span class="sh-kpi-note">' + esc(c.note) + '</span>' : '') + '</' + tag + '>');
      if (c.filter) node.addEventListener('click', function () {
        active = active === i ? -1 : i;
        wrap.querySelectorAll('.sh-kpi').forEach(function (k, j) { if (k.tagName === 'BUTTON') k.setAttribute('aria-pressed', String(j === active)); });
        if (list) list.setFilter(active < 0 ? null : { label: cards[i].label, fn: cards[i].filter });
      });
      wrap.appendChild(node);
    });
    target.appendChild(wrap);
    return {
      bind: function (l) {
        list = l;
        l.onClearFilter(function () { active = -1; wrap.querySelectorAll('.sh-kpi[aria-pressed]').forEach(function (k) { k.setAttribute('aria-pressed', 'false'); }); });
      }
    };
  }

  /* opt: { title, subtitle, columns: [{ key, label, isKey }], rows, statusKey, statusTone: { status: tone },
            searchKeys, empty: { title, text }, footNote, loading }
     returns { setRows(rows), setFilter({label, fn}|null), onClearFilter(cb), csv(filename) } */
  function list(target, opt) {
    var rows = opt.rows || [], extra = null, clearCb = null, loading = !!opt.loading;
    var card = el('<section class="sh-card" aria-busy="false">' +
      '<div class="sh-card-head"><div class="sh-card-title"><h2>' + esc(opt.title) + '</h2>' + (opt.subtitle ? '<p>' + esc(opt.subtitle) + '</p>' : '') + '</div>' +
      '<div class="sh-tools"><label class="sh-search">' + line('search') + '<span class="sr-only">ค้นหา</span><input type="search" placeholder="ค้นหา" autocomplete="off"></label>' +
      (opt.statusKey ? '<select class="sh-select" aria-label="กรองสถานะ"><option value="">ทุกสถานะ</option></select>' : '') + '</div></div>' +
      '<div class="sh-filterbar" hidden><span class="sh-filter-chip"><span class="sh-filter-text"></span><button type="button" aria-label="ล้างตัวกรอง">' + line('close') + '</button></span></div>' +
      '<div class="sh-table-wrap"><table class="sh-table"><thead><tr>' +
      opt.columns.map(function (c) { return '<th scope="col">' + esc(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table></div><div class="sh-card-foot"><span class="sh-count" aria-live="polite"></span><span>' + esc(opt.footNote || '') + '</span></div></section>');
    var tbody = card.querySelector('tbody'), q = card.querySelector('input'), sel = card.querySelector('select');
    var bar = card.querySelector('.sh-filterbar');
    var keys = opt.searchKeys || opt.columns.map(function (c) { return c.key; });

    function fillStatuses() {
      if (!sel) return;
      var keep = sel.value, seen = [];
      rows.forEach(function (r) { var s = r[opt.statusKey]; if (s && seen.indexOf(s) < 0) seen.push(s); });
      sel.innerHTML = '<option value="">ทุกสถานะ</option>' + seen.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
      sel.value = seen.indexOf(keep) >= 0 ? keep : '';
    }
    function cell(c, r) {
      var v = r[c.key], label = ' data-label="' + esc(c.label) + '"';
      if (c.key === opt.statusKey && v) return '<td class="is-status"' + label + '><span class="sh-chip tone-' + esc((opt.statusTone || {})[v] || 'grey') + '">' + esc(v) + '</span></td>';
      var empty = v == null || v === '';
      return '<td' + label + ' class="' + (c.isKey ? 'is-key' : '') + (empty ? ' is-empty' : '') + '">' + (empty ? '<span aria-label="ไม่มีข้อมูล">–</span>' : esc(v)) + '</td>';
    }
    function shown() {
      var term = q.value.trim().toLowerCase(), st = sel ? sel.value : '';
      return rows.filter(function (r) {
        if (extra && !extra.fn(r)) return false;
        if (st && r[opt.statusKey] !== st) return false;
        return !term || keys.some(function (k) { return String(r[k] || '').toLowerCase().indexOf(term) >= 0; });
      });
    }
    function draw() {
      card.setAttribute('aria-busy', String(loading));
      bar.hidden = !extra;
      if (extra) card.querySelector('.sh-filter-text').textContent = 'กรอง: ' + extra.label;
      if (loading) {
        tbody.innerHTML = [0, 1, 2, 3].map(function () { return '<tr class="sh-skel">' + opt.columns.map(function () { return '<td><span></span></td>'; }).join('') + '</tr>'; }).join('');
        card.querySelector('.sh-count').textContent = 'กำลังโหลด…';
        return;
      }
      var list = shown();
      if (list.length) {
        tbody.innerHTML = list.map(function (r) { return '<tr>' + opt.columns.map(function (c) { return cell(c, r); }).join('') + '</tr>'; }).join('');
      } else {
        var none = !rows.length, e = opt.empty || {};
        tbody.innerHTML = '<tr class="sh-empty-row"><td colspan="' + opt.columns.length + '"><div class="sh-empty">' + line(none ? 'inbox' : 'search') +
          '<strong>' + esc(none ? (e.title || 'ยังไม่มีรายการ') : 'ไม่พบรายการที่ตรงกัน') + '</strong>' +
          '<span>' + esc(none ? (e.text || '') : 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรอง') + '</span></div></td></tr>';
      }
      card.querySelector('.sh-count').textContent = 'แสดง ' + list.length + ' จาก ' + rows.length + ' รายการ';
    }
    q.addEventListener('input', draw);
    if (sel) sel.addEventListener('change', draw);
    bar.querySelector('button').addEventListener('click', function () { extra = null; if (clearCb) clearCb(); draw(); });
    fillStatuses();
    draw();
    target.appendChild(card);
    return {
      setRows: function (r) { rows = r || []; loading = false; fillStatuses(); draw(); },
      setFilter: function (f) { extra = f; draw(); },
      onClearFilter: function (cb) { clearCb = cb; },
      /* download what is on screen as CSV (UTF-8 with BOM so Excel reads Thai) */
      csv: function (filename) {
        var data = shown();
        var quote = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var text = [opt.columns.map(function (c) { return quote(c.label); }).join(',')].concat(data.map(function (r) {
          return opt.columns.map(function (c) { return quote(r[c.key]); }).join(',');
        })).join('\r\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        a.download = filename || 'export.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        return data.length;
      }
    };
  }

  window.ImodeShell = { start: start, kpis: kpis, list: list, icon: line, esc: esc, toast: toast };
})();
