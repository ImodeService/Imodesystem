/* 2026-10-14: one screen theme for every staff module.
   "อยากให้ทุกโมดุลตั้งค่าธีมได้เหมือนกัน เวลาเปลี่ยนธีม 1 โมดุลทุกอันจะเปลี่ยนด้วย ยกเว้นของลูกค้า"

   The choice is kept in two places:
     - this browser (localStorage imode.theme), read in <head> so pages open in the right colours;
     - the person's account (Supabase user_metadata.imode_theme), so it follows them to another
       PC or phone. Whichever side was changed last wins (imode.theme.at / imode_theme_at).
   Other open tabs switch at once through the storage event.

   Values are Service's (js/127): flat-light (default) | flat-dark | auto (follow the device) |
   classic (Service's original glass look; every other module shows it as light).
   Customer pages (Service QR / serial / machine portal) keep imode.customerTheme on each device
   and are never touched here.

   Load in <head> on every staff page. Sets html[data-theme="light|dark"] and swaps
   <img data-dark-src> to that picture in dark. ImodeTheme.open() shows the picker (same layout as
   Service's); <body data-theme-fab> adds a round theme button at the bottom right;
   window fires "imode-theme" ({theme, mode}) whenever the theme changes. */
(function () {
  'use strict';
  if (window.ImodeTheme) return;
  var KEY = 'imode.theme', AT = 'imode.theme.at', LEGACY = 'imode.serviceTheme', DEF = 'flat-light';
  var THEMES = [
    { id: 'flat-light', name: 'สว่าง', desc: 'พื้นสีอ่อน เรียบ อ่านง่าย', bg: '#f3f3f3', side: '#0c225e', card: '#ffffff', line: '#e1e1e1', bar: '#c25e00' },
    { id: 'flat-dark', name: 'มืด', desc: 'พื้นสีเข้ม ถนอมสายตาตอนกลางคืน', bg: '#1b1b1b', side: '#111111', card: '#262626', line: '#3a3a3a', bar: '#e07a1f' },
    { id: 'auto', name: 'ตามระบบ', desc: 'สว่างหรือมืดตามที่ตั้งไว้ในเครื่อง', bg: 'linear-gradient(90deg,#f3f3f3 50%,#1b1b1b 50%)', side: '#0c225e', card: 'transparent', line: '#8a8a8a', bar: '#c25e00' },
    { id: 'classic', name: 'กระจก (Glass)', desc: 'หน้าตาเดิมของ Service โมดูลอื่นแสดงแบบสว่าง', bg: '#f6f8fc', side: '#0e3ba6', card: '#ffffff', line: '#e3e8f2', bar: '#ff5b14' }
  ];
  function valid(v) { return THEMES.some(function (t) { return t.id === v; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function get() {
    var v = lsGet(KEY);
    if (valid(v)) return v;
    v = lsGet(LEGACY); // Service's own key before 2026-10-14
    if (valid(v)) { lsSet(KEY, v); return v; }
    return DEF;
  }
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function mode(v) {
    v = v || get();
    if (v === 'auto') return mq && mq.matches ? 'dark' : 'light';
    return v === 'flat-dark' ? 'dark' : 'light';
  }

  function swapLogos(m) {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('img[data-dark-src]').forEach(function (img) {
      if (!img.hasAttribute('data-light-src')) img.setAttribute('data-light-src', img.getAttribute('src') || '');
      var want = m === 'dark' ? img.getAttribute('data-dark-src') : img.getAttribute('data-light-src');
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
  }
  var shown = '';
  function apply() {
    var m = mode(), r = document.documentElement;
    if (r.getAttribute('data-theme') !== m) r.setAttribute('data-theme', m);
    swapLogos(m);
    shellLook(r);
    var t = get();
    if (shown && shown !== t + m) {
      try { window.dispatchEvent(new CustomEvent('imode-theme', { detail: { theme: t, mode: m } })); } catch (e) {}
    }
    shown = t + m;
    if (box) mark();
  }

  /* 2026-10-27: the icon style, sidebar colours and sidebar movement used to be Service's alone.
     The same three choices now dress every module built on shared/module-shell (QC & R&D first,
     "ปรับแต่งหน้าตา UI ได้แบบ service"). They stay in Service's localStorage keys, so one choice
     changes Service and the other modules together. Attributes, not Service's own data-sidebar:
     Service's js/130 and js/131 keep theirs, and module-shell.css reads only these. */
  function shellLook(r) {
    if (typeof SV === 'undefined' || !SV) return;
    var want = { 'data-sh-icons': sv('icons'), 'data-sh-side': sv('side'), 'data-sh-motion': sv('motion') };
    Object.keys(want).forEach(function (a) { if (r.getAttribute(a) !== want[a]) r.setAttribute(a, want[a]); });
  }

  /* ---------- account ---------- */
  function onCustomerPage() {
    try { return typeof window.imodeCustomerSurface === 'function' && !!window.imodeCustomerSurface(); } catch (e) { return false; }
  }
  function client() {
    if (onCustomerPage()) return null;
    try { return window.ImodeAuth && window.ImodeAuth.client(); } catch (e) { return null; }
  }
  function push(v, at) {
    var c = client();
    if (!c) return;
    c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) return;
      return c.auth.updateUser({ data: { imode_theme: v, imode_theme_at: at } });
    }).catch(function () {});
  }
  function pull() {
    var c = client();
    if (!c) return;
    c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) return null;
      return c.auth.getUser();
    }).then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u) return;
      var md = u.user_metadata || {};
      var v = md.imode_theme, at = Number(md.imode_theme_at) || 0, localAt = Number(lsGet(AT)) || 0;
      if (valid(v) && at > localAt) {
        // changed on another device since this one last saw it
        lsSet(KEY, v); lsSet(AT, String(at)); apply();
      } else if (lsGet(KEY) && (localAt > at || !valid(v))) {
        // picked here before signing in (or the account has none yet)
        push(get(), localAt || Date.now());
      }
    }).catch(function () {});
  }

  function set(v) {
    if (!valid(v)) return;
    var at = Date.now();
    lsSet(KEY, v); lsSet(AT, String(at));
    apply();
    push(v, at);
  }

  /* ---------- picker ----------
     Same layout as Service's Settings → ธีมหน้าจอ (js/127 + 130 + 131 + 133): one-tap presets,
     then the icon style, sidebar colours and sidebar movement (Service's own settings, kept on
     this device; Service picks them up at once through the storage event), and the separate
     screen-theme cards behind กำหนดเอง. */
  var SV = { icons: 'imode.serviceIcons', side: 'imode.serviceSidebar', motion: 'imode.serviceSidebarMotion', custom: 'imode.servicePresetCustom' };
  var PRESETS = [
    { id: 'light', name: 'เรียบ สว่าง', desc: 'มาตรฐาน พื้นสว่าง แถบเมนูกรมท่า', set: { theme: 'flat-light', icons: 'emoji', side: 'navy', motion: 'normal' }, pv: THEMES[0] },
    { id: 'dark', name: 'เรียบ มืด', desc: 'พื้นสีเข้ม ถนอมสายตาตอนกลางคืน', set: { theme: 'flat-dark', icons: 'emoji', side: 'navy', motion: 'normal' }, pv: THEMES[1] },
    { id: 'auto', name: 'ตามระบบ', desc: 'สว่างหรือมืดตามที่ตั้งไว้ในเครื่อง', set: { theme: 'auto', icons: 'emoji', side: 'navy', motion: 'normal' }, pv: THEMES[2] },
    { id: 'glass', name: 'กระจก (Glass)', desc: 'หน้าตาเดิมของ Service มีไล่สีและเงา', set: { theme: 'classic', icons: 'emoji', side: 'navy', motion: 'normal' }, pv: THEMES[3] },
    { id: 'gold', name: 'ราตรีสีทอง', desc: 'พื้นมืด เมนูสีทอง ไอคอนเส้น เมนูเลื่อนแบบสไลด์', set: { theme: 'flat-dark', icons: 'line', side: 'game', motion: 'rov' },
      pv: { bg: '#1b1b1b', side: 'linear-gradient(180deg,#080e2e,#1a2a8a)', card: '#262626', line: '#3a3a3a', bar: '#ffc845' } }
  ];
  var GROUPS = [
    { key: 'icons', title: 'สไตล์ไอคอน', opts: [
      { id: 'emoji', name: 'Icon emoji', desc: 'ไอคอนสีสันแบบอีโมจิ (ค่าเริ่มต้น)', pv: '<span class="itp-emo">📋👥📅</span>' },
      { id: 'line', name: 'แบบเส้น', desc: 'ไอคอนเส้นสีเดียว เรียบ', pv: '<svg width="44" height="18" viewBox="0 0 44 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="11" height="14" rx="2"/><path d="M5 7h5M5 11h5"/><circle cx="22" cy="7" r="3"/><path d="M17 16c0-3 2.5-5 5-5s5 2 5 5"/><rect x="31" y="3" width="11" height="12" rx="2"/><path d="M31 7h11"/></svg>' }
    ] },
    { key: 'side', title: 'สไตล์แถบเมนูด้านข้าง', opts: [
      { id: 'navy', name: 'กรมท่า (เดิม)', desc: 'แถบเมนูสีน้ำเงินเข้ม โลโก้สีขาว', pv: '<span class="itp-bar" style="background:#0c225e"><i></i><i style="background:#f79009"></i><i></i></span>' },
      { id: 'light', name: 'เรียบ', desc: 'แถบเมนูสีขาว เมนูที่เปิดอยู่เป็นแถบสีฟ้าอ่อน', pv: '<span class="itp-bar" style="background:#f8fafd;border-color:#d0d7e6"><i style="background:#c9d2e3"></i><i style="background:#0b5cd6"></i><i style="background:#c9d2e3"></i></span>' },
      { id: 'game', name: 'ราตรีสีทอง', desc: 'แถบเมนูสีน้ำเงินม่วงเข้ม เมนูที่เปิดอยู่เป็นสีทอง', pv: '<span class="itp-bar" style="background:linear-gradient(90deg,#080e2e,#1a2a8a)"><i></i><i style="background:#ffc845"></i><i></i></span>' }
    ] },
    { key: 'motion', title: 'การเคลื่อนไหวของแถบเมนู', opts: [
      { id: 'normal', name: 'ปกติ', desc: 'แถบเมนูกางเต็มตลอด', pv: '<span class="itp-bar" style="background:#f3f5f9;border-style:dashed;border-color:#9aa6bd"><i style="background:#9aa6bd"></i><i style="background:#0b5cd6"></i><i style="background:#9aa6bd"></i></span>' },
      { id: 'rov', name: 'เลื่อนแบบสไลด์', desc: 'ย่อเหลือแต่ไอคอน ชี้เมาส์แล้วเมนูเลื่อนออกมาทับหน้าจอ', pv: '<span class="itp-bar" style="width:20px;background:#f3f5f9;border-style:dashed;border-color:#9aa6bd"><i style="background:#9aa6bd"></i><i style="background:#0b5cd6"></i><i style="background:#9aa6bd"></i></span>' }
    ] }
  ];
  function sv(k) {
    var v = lsGet(SV[k]) || '';
    if (k === 'icons') return v === 'line' ? 'line' : 'emoji';
    if (k === 'side') return v === 'light' || v === 'game' ? v : 'navy';
    return v === 'rov' ? 'rov' : 'normal';
  }
  function now() { return { theme: get(), icons: sv('icons'), side: sv('side'), motion: sv('motion') }; }
  function selected() {
    if (lsGet(SV.custom) === '1') return 'custom';
    var n = now();
    for (var i = 0; i < PRESETS.length; i++) {
      var s = PRESETS[i].set;
      if (s.theme === n.theme && s.icons === n.icons && s.side === n.side && s.motion === n.motion) return PRESETS[i].id;
    }
    return 'custom';
  }

  var box = null, lastFocus = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function prev(t, h) {
    return '<span class="itp-prev" style="background:' + t.bg + ';border-color:' + t.line + (h ? ';height:' + h + 'px' : '') + '" aria-hidden="true"><i style="background:' + t.side + '"></i>' +
      '<span><em style="width:55%;background:' + t.bar + '"></em><em style="height:' + (h ? 12 : 24) + 'px;background:' + t.card + ';border:1px solid ' + t.line + '"></em></span></span>';
  }
  function css() {
    if (document.getElementById('imodeThemeCss')) return;
    var s = document.createElement('style');
    s.id = 'imodeThemeCss';
    s.textContent =
      '.itp-back{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(12,20,40,.45)}' +
      /* 2026-10-29: the dialog pops in and out (owner: "อยากให้มีอนิเมชั่นตอน pop up เด้งขึ้นมา") */
      '.itp-back{animation:itp-fade .2s ease both}.itp-back .itp{animation:itp-pop .38s cubic-bezier(.2,1.4,.4,1) both}' +
      '.itp-back.is-out{animation:itp-fade-out .16s ease both}.itp-back.is-out .itp{animation:itp-pop-out .16s ease both}' +
      '@keyframes itp-fade{from{background:rgba(12,20,40,0)}to{background:rgba(12,20,40,.45)}}' +
      '@keyframes itp-fade-out{from{background:rgba(12,20,40,.45)}to{background:rgba(12,20,40,0)}}' +
      '@keyframes itp-pop{from{opacity:0;transform:translateY(28px) scale(.86)}to{opacity:1;transform:none}}' +
      '@keyframes itp-pop-out{to{opacity:0;transform:translateY(14px) scale(.94)}}' +
      '@media (prefers-reduced-motion:reduce){.itp-back,.itp-back .itp{animation:none}}' +
      '.itp{width:min(760px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:20px;border-radius:12px;background:var(--surface,#fff);color:var(--ink,#0c225e);border:1px solid var(--line-soft,#e3eaf5);box-shadow:0 18px 48px -12px rgba(0,0,0,.4);font-family:inherit}' +
      '.itp-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}' +
      '.itp-head h2{margin:0;font-size:19px;font-weight:700;line-height:1.3}' +
      '.itp-head p{margin:2px 0 0;font-size:14px;color:var(--ink-2,#4a5d80)}' +
      '.itp-x{margin-left:auto;flex:none;width:40px;height:40px;border:0;border-radius:8px;background:none;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.itp-x:hover{background:var(--line-soft,#eef3fb)}' +
      '.itp h3{margin:18px 0 8px;font-size:15px;font-weight:600}' +
      '.itp-presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}' +
      '.itp-pre{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:6px 6px 8px;border:1px solid var(--line,#b9c8e2);border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}' +
      '.itp-pre .itp-name{font-size:13px}' +
      '.itp-pre .itp-custom{display:flex;align-items:center;justify-content:center;width:100%;height:34px;border:1px dashed var(--line,#9aa6bd);border-radius:5px;color:var(--ink-2,#4a5d80)}' +
      '.itp-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}' +
      '.itp-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}' +
      '.itp-opt,.itp-pre{transition:border-color .15s}' +
      '.itp-opt{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px;border:1px solid var(--line,#b9c8e2);border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}' +
      '.itp-opt.is-wide{flex-direction:row;align-items:center;gap:12px}' +
      '.itp-opt:hover,.itp-pre:hover{border-color:var(--blue,#0b63e5)}' +
      '.itp-opt[aria-checked="true"],.itp-pre[aria-checked="true"]{border-color:var(--blue,#0b63e5);box-shadow:inset 0 0 0 1px var(--blue,#0b63e5)}' +
      '.itp-prev{display:flex;width:100%;height:52px;border:1px solid;border-radius:6px;overflow:hidden;flex:none}' +
      '.itp-prev i{width:22%;flex:none}' +
      '.itp-prev span{flex:1;display:flex;flex-direction:column;gap:5px;padding:6px}' +
      '.itp-prev em{display:block;height:6px;border-radius:3px}' +
      '.itp-bar{flex:none;display:flex;flex-direction:column;gap:4px;width:40px;height:48px;padding:7px 6px;border:1px solid transparent;border-radius:6px}' +
      '.itp-bar i{display:block;height:5px;border-radius:3px;background:rgba(255,255,255,.55)}' +
      '.itp-emo{flex:none;font-size:18px;letter-spacing:2px}' +
      '.itp-txt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '.itp-name{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600}' +
      '.itp-ok{display:none;color:var(--blue,#0b63e5)}' +
      '.itp-opt[aria-checked="true"] .itp-ok,.itp-pre[aria-checked="true"] .itp-ok{display:inline}' +
      '.itp-opt small{font-size:13px;line-height:1.45;color:var(--ink-2,#4a5d80)}' +
      '.itp-part{margin-top:14px;padding:2px 14px 14px;border:1px solid var(--line-soft,#e3eaf5);border-radius:10px}' +
      '.itp-part[hidden]{display:none}' +
      '.itp-foot{margin:10px 0 0;font-size:13px;color:var(--ink-2,#4a5d80)}' +
      '@media (max-width:640px){.itp-presets{grid-template-columns:repeat(3,minmax(0,1fr))}.itp-list{grid-template-columns:repeat(2,minmax(0,1fr))}.itp-prev{height:40px}}';
    document.head.appendChild(s);
  }
  function mark() {
    var n = now(), sel = selected();
    box.querySelectorAll('.itp-pre').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-preset') === sel)); });
    box.querySelectorAll('.itp-opt').forEach(function (b) { b.setAttribute('aria-checked', String(n[b.getAttribute('data-k')] === b.getAttribute('data-id'))); });
    var part = box.querySelector('.itp-part');
    if (part) part.hidden = sel !== 'custom';
  }
  function close() {
    if (!box) return;
    var gone = box; box = null;
    gone.classList.add('is-out');              /* closing animation, then removed */
    setTimeout(function () { gone.remove(); }, 170);
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Tab' && box) { // keep focus inside the dialog
      var f = [].filter.call(box.querySelectorAll('button'), function (b) { return b.offsetParent !== null; }), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function setOne(k, v) {
    if (k === 'theme') { set(v); return; }
    lsSet(SV[k], v);
    apply();
  }
  function applyPreset(p) {
    set(p.set.theme); setOne('icons', p.set.icons); setOne('side', p.set.side); setOne('motion', p.set.motion);
    lsSet(SV.custom, '0');
  }
  function open() {
    if (box) return;
    css();
    lastFocus = document.activeElement;
    box = document.createElement('div');
    box.className = 'itp-back';
    var ok = '<span class="itp-ok" aria-hidden="true">✓</span>';
    box.innerHTML =
      '<div class="itp" role="dialog" aria-modal="true" aria-labelledby="itpTitle">' +
      '<div class="itp-head"><div><h2 id="itpTitle">ธีมหน้าจอ</h2><p>ใช้กับทุกโมดูลของ I-MODE System</p></div>' +
      '<button type="button" class="itp-x" aria-label="ปิด"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
      '<div class="itp-presets" role="radiogroup" aria-label="พรีเซ็ตหน้าจอ">' + PRESETS.map(function (p) {
        return '<button type="button" class="itp-pre" role="radio" data-preset="' + p.id + '" title="' + esc(p.desc) + '" aria-checked="false">' + prev(p.pv, 34) +
          '<span class="itp-name">' + esc(p.name) + ok + '</span></button>';
      }).join('') +
      '<button type="button" class="itp-pre" role="radio" data-preset="custom" title="เลือกธีม ไอคอน สีและการเคลื่อนไหวของแถบเมนูเอง" aria-checked="false">' +
      '<span class="itp-custom" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg></span>' +
      '<span class="itp-name">กำหนดเอง' + ok + '</span></button></div>' +
      '<p class="itp-foot">กดพรีเซ็ตเพื่อตั้งค่ามาตรฐานทั้งหมดในครั้งเดียว เปลี่ยนแล้วทุกโมดูลเปลี่ยนตามทันที</p>' +
      '<div class="itp-part"><h3>ธีมหน้าจอ (กำหนดเอง)</h3><div class="itp-list" role="radiogroup" aria-label="ธีมหน้าจอ">' + THEMES.map(function (t) {
        return '<button type="button" class="itp-opt" role="radio" data-k="theme" data-id="' + t.id + '" aria-checked="false">' + prev(t) +
          '<span class="itp-name">' + esc(t.name) + ok + '</span><small>' + esc(t.desc) + '</small></button>';
      }).join('') + '</div></div>' +
      GROUPS.map(function (g) {
        return '<h3>' + esc(g.title) + '</h3><div class="itp-row" role="radiogroup" aria-label="' + esc(g.title) + '">' + g.opts.map(function (o) {
          return '<button type="button" class="itp-opt is-wide" role="radio" data-k="' + g.key + '" data-id="' + o.id + '" aria-checked="false">' + o.pv +
            '<span class="itp-txt"><span class="itp-name">' + esc(o.name) + ok + '</span><small>' + esc(o.desc) + '</small></span></button>';
        }).join('') + '</div>';
      }).join('') +
      '<p class="itp-foot">ธีมจำไว้กับบัญชีของคุณ ส่วนไอคอนและแถบเมนูจำไว้ในเครื่องนี้ ใช้กับทุกโมดูลเหมือนกัน</p></div>';
    document.body.appendChild(box);
    mark();
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.closest('.itp-x')) { close(); return; }
      var p = e.target.closest('.itp-pre');
      if (p) {
        var id = p.getAttribute('data-preset');
        if (id === 'custom') lsSet(SV.custom, '1');
        else applyPreset(PRESETS.filter(function (x) { return x.id === id; })[0]);
        mark(); return;
      }
      var b = e.target.closest('.itp-opt');
      if (b) {
        lsSet(SV.custom, b.getAttribute('data-k') === 'theme' ? '1' : '0');
        setOne(b.getAttribute('data-k'), b.getAttribute('data-id'));
        mark();
      }
    });
    document.addEventListener('keydown', onKey, true);
    (box.querySelector('.itp-pre[aria-checked="true"]') || box.querySelector('.itp-pre')).focus();
  }

  /* round button at the bottom right, for pages that ask for it (<body data-theme-fab>) */
  function addFab() {
    if (!document.body || !document.body.hasAttribute('data-theme-fab') || document.getElementById('imodeThemeFab')) return;
    css();
    var st = document.getElementById('imodeThemeFabCss');
    if (!st) {
      st = document.createElement('style'); st.id = 'imodeThemeFabCss';
      st.textContent = '.itp-fab{position:fixed;right:20px;bottom:20px;z-index:30;width:48px;height:48px;border-radius:50%;border:1px solid var(--line-soft,#e3eaf5);background:var(--surface,#fff);color:var(--ink,#0c225e);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px -6px rgba(12,34,94,.35);transition:transform .15s ease-out,border-color .15s}' +
        '.itp-fab:hover{transform:translateY(-2px);border-color:var(--blue,#0b63e5)}' +
        '@media (max-width:560px){.itp-fab{right:14px;bottom:14px}}';
      document.head.appendChild(st);
    }
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'imodeThemeFab'; b.className = 'itp-fab';
    b.title = 'ธีมหน้าจอ'; b.setAttribute('aria-label', 'ธีมหน้าจอ');
    b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  /* ---------- wiring ---------- */
  apply();
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === LEGACY || e.key === SV.icons || e.key === SV.side || e.key === SV.motion) apply();
    if (box) mark();
  });
  if (mq) {
    var onMq = function () { if (get() === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }
  document.addEventListener('DOMContentLoaded', function () { swapLogos(mode()); addFab(); });
  // pages build their logos later (module shell); catch those too
  try { new MutationObserver(function () { if (document.querySelector('img[data-dark-src]:not([data-light-src])')) swapLogos(mode()); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('load', function () { setTimeout(pull, 0); });

  window.ImodeTheme = {
    get: get, set: set, mode: function () { return mode(); }, open: open, close: close,
    list: THEMES.map(function (t) { return { id: t.id, name: t.name }; })
  };
})();
