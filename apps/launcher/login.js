(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var form = document.getElementById('loginForm');
  var errBox = document.getElementById('loginError');
  var btn = document.getElementById('submitBtn');
  var user = document.getElementById('username');
  var pw = document.getElementById('password');
  var remember = document.getElementById('remember');

  // only allow returning to a page on this site
  function nextUrl() {
    var n = params.get('next') || '';
    return /^\/[^/\\]/.test(n) || n === '/' ? n : 'index.html';
  }
  function showError(msg) {
    errBox.textContent = msg;
    errBox.hidden = !msg;
  }
  function busy(on) {
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span><span>กำลังเข้าสู่ระบบ</span>'
                       : '<span class="btn-label">เข้าสู่ระบบ</span>';
  }

  remember.checked = ImodeAuth.rememberOn();
  try { var last = localStorage.getItem('imode.lastUser'); if (last) user.value = last; } catch (e) {}
  if (params.get('msg')) showError(params.get('msg'));
  (user.value ? pw : user).focus();

  // already signed in: go straight to the launcher
  ImodeAuth.currentSession().then(function (s) { if (s && !params.get('msg')) location.replace(nextUrl()); });

  document.getElementById('togglePw').addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(show));
    this.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
  });
  document.getElementById('forgotBtn').addEventListener('click', function () {
    var n = document.getElementById('forgotNote');
    n.hidden = !n.hidden;
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    busy(true);
    try {
      await ImodeAuth.signIn(user.value, pw.value, remember.checked);
      try { localStorage.setItem('imode.lastUser', remember.checked ? user.value.trim() : ''); } catch (e2) {}
      location.replace(nextUrl());
    } catch (err) {
      showError(err.message);
      busy(false);
      pw.select();
    }
  });
})();
