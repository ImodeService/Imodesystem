(function () {
  'use strict';
  /* Module list lives in shared/modules.js; hrefs there are from the platform root. */
  var MODULES = window.IMODE_MODULES.map(function (m) {
    return { id: m.id, name: m.name, icon: m.icon, href: m.href ? '../../' + m.href : '' };
  });

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
      return '<li>' + (ready
        ? '<a class="app" href="' + esc(m.href) + '">' + inner + '</a>'
        : '<button type="button" class="app is-soon" data-name="' + esc(m.name) + '" aria-label="' + esc(m.name) + ' (ยังไม่เปิดใช้)">' + inner + '</button>') +
        '</li>';
    }).join('');
    var soon = MODULES.filter(function (m) { return !m.href; }).length;
    var note = document.getElementById('gridNote');
    if (note) note.innerHTML = soon ? '<i aria-hidden="true"></i>กรอบเส้นประ = กำลังพัฒนา (' + soon + ' โมดูล)' : '';
    document.getElementById('appGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.is-soon');
      if (b) toast('โมดูล ' + b.getAttribute('data-name') + ' กำลังพัฒนา');
    });
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
    document.getElementById('signOutBtn').addEventListener('click', async function () {
      leaving = true;
      await ImodeAuth.signOut();
      location.replace('login.html');
    });
  }

  var leaving = false;
  renderGrid();
  wireMenu();
  ImodeAuth.requireUser('login.html').then(function (u) {
    renderUser(u);
    document.body.classList.remove('is-loading');
  });
  // signed out in another tab
  ImodeAuth.client().auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT' && !leaving) location.replace('login.html');
  });
})();
