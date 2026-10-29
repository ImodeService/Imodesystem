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
  /* 2026-10-29: ลืมรหัสผ่าน opens a small popup (was a line of text under the row). Nobody can
     reset their own password here; the department head or an admin sets a new one. */
  document.getElementById('forgotBtn').addEventListener('click', function () {
    var old = document.getElementById('forgotPop');
    if (old) old.remove();
    var back = document.activeElement;
    var box = document.createElement('div');
    box.id = 'forgotPop';
    box.className = 'forgot-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'forgotPopTitle');
    box.innerHTML = '<div class="forgot-pop-card">'
      + '<div class="forgot-pop-ic" aria-hidden="true">🔑</div>'
      + '<h3 id="forgotPopTitle">ลืมรหัสผ่าน</h3>'
      + '<p>กรุณาติดต่อหัวหน้าแผนกหรือผู้ดูแลระบบ เพื่อตั้งรหัสผ่านใหม่ให้</p>'
      + '<button type="button" class="btn-primary forgot-pop-ok">ตกลง</button></div>';
    var closing = false;
    function close() {
      if (closing) return; closing = true;
      document.removeEventListener('keydown', onKey, true);
      box.classList.add('is-out');                 /* plays the closing animation, then goes */
      setTimeout(function () { box.remove(); }, 170);
      if (back) try { back.focus(); } catch (e) {}
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('.forgot-pop-ok')) close(); });
    document.body.appendChild(box);
    document.addEventListener('keydown', onKey, true);
    box.querySelector('.forgot-pop-ok').focus();
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
