/* I-MODE System (ระบบใหม่) · โครงหน้าที่ทุกโมดุลใช้ร่วม
   - ธีม สว่าง/มืด (จำไว้ในเครื่อง)
   - แถบบน: ชื่อโมดุล, ปุ่มสลับธีม, ปุ่ม 9 จุดสลับโมดุล (มีรายการโปรด), บัญชี
   - สิทธิ์: อ่านจาก app_role_perms ตาม role ของผู้ใช้ (ฐานข้อมูลเป็นตัวล็อกจริง หน้าเว็บแค่ซ่อนปุ่ม)
   ใช้: <script src="../shared/next-shell.js"> ใน <head> แล้ว await NextShell.start({ title, moduleId })
   ต้องโหลด ../../shared/vendor/supabase.min.js, ../../shared/config.js, ../../shared/auth.js, ./next-modules.js ก่อน start() */
(function () {
  'use strict';
  var THEME_KEY = 'imode.next.theme';
  function savedTheme() { try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; } }
  function applyTheme(t) {
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    return t;
  }
  applyTheme(savedTheme()); // ก่อนหน้าแสดง กันจอกระพริบ

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

  function buildTop(opts) {
    var top = document.createElement('header');
    top.className = 'nx-top';
    var initials = (state.user && (state.user.name || state.user.username) || '?').trim().slice(0, 2);
    top.innerHTML =
      '<a href="' + esc(ROOT + 'apps/launcher/index.html') + '" aria-label="หน้าเลือกโมดุล" style="display:flex"><img src="' + esc(ROOT + 'assets/brand/imode-logo.webp') + '" alt="" style="height:30px" onerror="this.remove()"></a>' +
      '<span class="nx-title">' + esc(opts.title || '') + '</span>' +
      '<button type="button" class="nx-icon-btn" data-theme-btn aria-label="สลับธีม สว่าง/มืด"></button>' +
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
    themeBtn.addEventListener('click', function () {
      var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
      paintThemeBtn();
    });

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
    if (permErr) throw permErr;
    var mod = (window.NEXT_MODULES || []).filter(function (m) { return m.id === opts.moduleId; })[0];
    if (mod && mod.perm && !can(mod.perm)) throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าโมดุลนี้');
    return { user: state.user, can: can, sb: window.ImodeAuth.client(), root: ROOT, esc: esc };
  }

  window.NextShell = { start: start, applyTheme: applyTheme, esc: esc };
})();
