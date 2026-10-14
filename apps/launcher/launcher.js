(function () {
  'use strict';
  /* Module list. `href` is relative to this page; leave it empty until the module exists.
     Which modules each person sees will come from the Accounts module (enforced by RLS). */
  var MODULES = [
    { id: 'dashboard', name: 'แดชบอร์ด', href: '',
      icon: '<rect x="8" y="24" width="8" height="16" rx="2" fill="#0b63e5"/><rect x="20" y="14" width="8" height="26" rx="2" fill="#f79009"/><rect x="32" y="8" width="8" height="32" rx="2" fill="#0c225e"/>' },
    { id: 'service', name: 'Service', href: '../../modules/service/index.html',
      icon: '<path d="M30 8a10 10 0 0 0-9.6 12.8L8 33.2a4 4 0 0 0 5.7 5.7l12.4-12.4A10 10 0 0 0 39 16.6l-6 6-6.4-1.7L24.9 15l6-6A10 10 0 0 0 30 8z" fill="#0b63e5"/><circle cx="11" cy="36" r="2" fill="#fff"/><circle cx="38" cy="36" r="7" fill="#f79009"/>' },
    { id: 'qc', name: 'QC & Installation', href: '',
      icon: '<rect x="8" y="8" width="32" height="32" rx="7" fill="#12a06a"/><path d="M16 24.5l5.5 5.5L33 18.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'inventory', name: 'Inventory', href: '',
      icon: '<path d="M24 6l16 9v18l-16 9-16-9V15z" fill="#f79009"/><path d="M8 15l16 9 16-9" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M24 24v18" stroke="#fff" stroke-width="3"/><path d="M24 24l16-9v18l-16 9z" fill="#c25e00"/>' },
    { id: 'planner', name: 'Installation Planner', href: '',
      icon: '<rect x="7" y="9" width="34" height="30" rx="4" fill="#6a4fd6"/><rect x="12" y="15" width="10" height="8" rx="1.5" fill="#fff"/><rect x="26" y="15" width="10" height="18" rx="1.5" fill="#fff" opacity=".85"/><rect x="12" y="27" width="10" height="6" rx="1.5" fill="#f79009"/>' },
    { id: 'meeting', name: 'ประชุม', href: '',
      icon: '<circle cx="17" cy="17" r="7" fill="#0f8ea3"/><path d="M5 38a12 12 0 0 1 24 0z" fill="#0f8ea3"/><circle cx="32" cy="15" r="6" fill="#f79009"/><path d="M24 30a11 11 0 0 1 19 8H30" fill="#f79009"/>' },
    { id: 'accounts', name: 'บัญชีและสิทธิ์', href: '',
      icon: '<circle cx="20" cy="16" r="8" fill="#3b4a66"/><path d="M6 40a14 14 0 0 1 22-11.5V40z" fill="#3b4a66"/><circle cx="35" cy="34" r="9" fill="#0b63e5"/><path d="M31 34l3 3 5-5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' }
  ];

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
        (ready ? '' : '<span class="soon-tag">เร็วๆ นี้</span>') + '</span>' +
        '<span class="app-name">' + esc(m.name) + '</span>';
      return '<li>' + (ready
        ? '<a class="app" href="' + esc(m.href) + '">' + inner + '</a>'
        : '<button type="button" class="app is-soon" data-name="' + esc(m.name) + '" aria-label="' + esc(m.name) + ' (ยังไม่เปิดใช้)">' + inner + '</button>') +
        '</li>';
    }).join('');
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
