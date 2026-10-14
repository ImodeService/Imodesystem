/* Shared sign-in for every module: one Supabase account per person.
   Usage: <script src=".../shared/vendor/supabase.min.js">, config.js, then this file.
   ImodeAuth.signIn(username, password, remember) / requireUser(loginUrl) / signOut() */
(function () {
  'use strict';
  var C = window.IMODE_CONFIG || {};
  var REMEMBER_KEY = 'imode.remember';
  var client = null;

  function rememberOn() {
    try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
  }
  function store() {
    try { return rememberOn() ? window.localStorage : window.sessionStorage; } catch (e) { return undefined; }
  }

  function sb() {
    if (client) return client;
    if (!window.supabase || !C.supabaseUrl) throw new Error('ตั้งค่าระบบไม่ครบ (shared/config.js)');
    client = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: C.storageKey,
        storage: store()
      }
    });
    return client;
  }

  function toEmail(username) {
    var u = String(username || '').trim();
    if (!u) return '';
    return u.indexOf('@') >= 0 ? u : u + '@' + C.usernameDomain;
  }

  function friendly(error) {
    var msg = String((error && error.message) || error || '');
    if (/invalid login credentials/i.test(msg)) return new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    if (/email not confirmed/i.test(msg)) return new Error('บัญชีนี้ยังไม่ได้เปิดใช้งาน ติดต่อผู้ดูแลระบบ');
    if (/rate limit|too many/i.test(msg)) return new Error('ลองเข้าสู่ระบบหลายครั้งเกินไป รอสักครู่แล้วลองใหม่');
    if (/fetch|network|failed to/i.test(msg)) return new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    return new Error(msg || 'เข้าสู่ระบบไม่สำเร็จ');
  }

  /* Staff only: customers have their own portal. Inactive or unprofiled accounts are refused. */
  async function loadProfile(authUser) {
    var res = await sb().from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (res.error) return { ok: false, message: 'อ่านข้อมูลบัญชีไม่ได้: ' + friendly(res.error).message };
    var p = res.data;
    if (!p) return { ok: false, message: 'บัญชีนี้ยังไม่ได้ตั้งค่าในระบบ ติดต่อผู้ดูแลระบบ' };
    if (p.is_active === false) return { ok: false, message: 'บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ' };
    if (/^customer$/i.test(String(p.role || '')) || p.customer_id) {
      return { ok: false, message: 'หน้านี้สำหรับพนักงาน I-MODE เท่านั้น' };
    }
    return {
      ok: true,
      user: {
        id: authUser.id,
        username: p.username || String(authUser.email || '').split('@')[0],
        name: p.full_name || p.username || '',
        role: p.role || '',
        extraRoles: Array.isArray(p.extra_roles) ? p.extra_roles : [],
        team: p.team || '',
        photo: p.photo_url || ''
      }
    };
  }

  async function signIn(username, password, remember) {
    if (!String(username || '').trim() || !password) throw new Error('กรอกชื่อผู้ใช้และรหัสผ่าน');
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
      // drop a session left in the other storage so only one copy exists
      (remember ? sessionStorage : localStorage).removeItem(C.storageKey);
    } catch (e) {}
    client = null;
    var res;
    try {
      res = await sb().auth.signInWithPassword({ email: toEmail(username), password: password });
    } catch (e) { throw friendly(e); }
    if (res.error) throw friendly(res.error);
    var prof = await loadProfile(res.data.user);
    if (!prof.ok) {
      await sb().auth.signOut().catch(function () {});
      throw new Error(prof.message);
    }
    return prof.user;
  }

  /* For protected pages: returns the user, or sends the browser to the login page. */
  async function requireUser(loginUrl) {
    var back = function (msg) {
      var q = '?next=' + encodeURIComponent(location.pathname + location.search);
      if (msg) q += '&msg=' + encodeURIComponent(msg);
      location.replace(loginUrl + q);
      return new Promise(function () {});
    };
    var s;
    try { s = await sb().auth.getSession(); } catch (e) { return back(); }
    var session = s && s.data && s.data.session;
    if (!session) return back();
    var prof = await loadProfile(session.user);
    if (!prof.ok) {
      await sb().auth.signOut().catch(function () {});
      return back(prof.message);
    }
    return prof.user;
  }

  async function currentSession() {
    try { var s = await sb().auth.getSession(); return s.data.session; } catch (e) { return null; }
  }

  async function signOut() {
    try { await sb().auth.signOut(); } catch (e) {}
  }

  window.ImodeAuth = {
    client: sb, signIn: signIn, signOut: signOut, requireUser: requireUser,
    currentSession: currentSession, rememberOn: rememberOn
  };
})();
