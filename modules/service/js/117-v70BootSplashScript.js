/* 2026-09-25 - the loading screen stays up until the app is actually ready, for everyone.
   Asked for directly: "อยากให้เพิ่มหน้ารอเว็บโหลดหน่อย ของทุกคนเลย".

   A splash already existed (js/01, part 5) and it already covered every visitor - the `qr`
   test there is computed and then deliberately unused, so `qr-booting` goes on the document
   unconditionally. What was wrong was WHEN it came off. Measured in a browser with a stub
   cloud answering in 1.5 s:

        0 ms  document-start
      428 ms  splash visible
      892 ms  DOMContentLoaded
     1903 ms  SPLASH REMOVED      <- js/11's install() releases it here
     1904 ms  window load         <- and only NOW does the boot sequence start
     2325 ms  createClient + the first table read
       ...    ten more reads, then renderAll() paints the real data

   js/03's boot is `load -> renderAll() -> await initCloud() -> renderAll() ->
   await initPortalFromUrl()`, so the splash was gone before the first byte of data was even
   requested. The visitor got the shell with whatever was in localStorage - on a new device,
   an empty dashboard - and watched it fill in. That is the "หน้ารอ" that was missing.

   WHAT THIS FILE DOES
   Holds the splash until `initPortalFromUrl()` settles, which is the last await of js/03's
   load handler and therefore the honest end of boot. js/01 and js/03 are NOT edited: the
   existing release function is wrapped, so every early caller (js/11 at DOMContentLoaded,
   js/14 and js/21 on the customer routes) only ARMS the release instead of performing it.
   This file loads last, so its wrapper on initPortalFromUrl is the outermost one and
   resolves after js/09, js/11, js/14, js/19, js/84, js/85, js/93 and js/110 have had theirs.

   WHY THE DOOR WAITS TOO, which is a real behaviour change
   A visitor with no session used to be able to type a password at ~1.9 s. They now wait for
   the sync. That is deliberate and it closes a footgun: since part 31 the login accounts
   live in `settings` (settings.uatAccounts), so they arrive WITH the cloud copy - an account
   created on another device does not exist here until syncCloud() has landed, and signing in
   before that fails with "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" for no visible reason.

   THE CAP IS NOT OPTIONAL. Nobody may be stranded on a splash, so the hold ends after
   HOLD_MAX whatever happens, and the app - which works offline - appears. js/01's own 12 s
   timeout calls the release by name, which is now this wrapper, so it would only arm it;
   the timeout below is what really fires. */
(function () {
 'use strict';

 var HOLD_MAX = 10000;   /* ms. Beyond this something is wrong and the app is better than a spinner. */
 var TAB_KEY  = 'imode_v70_tab_booted';

 var base = window.imodeQrBootRelease;
 if (typeof base !== 'function') return;   /* no splash in this build - nothing to hold */

 /* ---------------------------------------------- ONLY THE FIRST LOAD IN A TAB WAITS ----
    2026-09-25, reported the same day this shipped: "ระหว่างที่แอดมินสลับหน้ารายละเอียดเคสกับ
    หน้าหลักปกติอะไม่ต้องโหลดได้มั้ย". service-case-detail.html is a separate document, so
    going there and back is two full page loads - and the hold above turned each one into a
    fresh wait for the whole sync. Measured on a 1 s-per-call cloud: first open 5440 ms, and
    then 4593 ms EVERY time the admin came back from a case.
    There is nothing to wait for on that second load: the data is already in localStorage
    from the first one, and syncCloud() keeps running behind the app either way. So the hold
    applies to the first load in the tab and to nothing else.
    sessionStorage is exactly this scope - created with the tab, kept across same-tab
    navigation and reloads, gone when the tab closes - which is the same reason js/50 keeps
    its pending route there. A new tab, a bookmark or coming back tomorrow waits again.
    Losing the key costs one extra wait and nothing else. */
 var warm = false;
 try { warm = sessionStorage.getItem(TAB_KEY) === '1'; } catch (e) {}
 if (warm) {
  /* Leave js/01 and js/11 exactly as they were: the splash still covers the parse and comes
     off at DOMContentLoaded. Nothing is wrapped, so there is no hold to go wrong. */
  window.imodeBootSplashState = function () { return { held: false, warmTab: true, cap: 0 }; };
  return;
 }

 var done = false, armed = false;

 function finish() {
  if (done) return;
  done = true;
  /* Mark the tab BEFORE releasing, so a navigation that starts the instant the app appears
     already counts as warm. */
  try { sessionStorage.setItem(TAB_KEY, '1'); } catch (e) {}
  try { base(); } catch (e) {}
 }

 /* Early callers only arm it. Keeping their calls rather than removing them means a build
    without this file still behaves exactly as it did. */
 window.imodeQrBootRelease = function () { armed = true; };

 /* Reading `armed` keeps it honest for anyone debugging: it says somebody wanted the splash
    gone earlier and this file held it. */
 window.imodeBootSplashState = function () {
  return { held: !done, armedEarly: armed, warmTab: false, cap: HOLD_MAX };
 };

 /* ------------------------------------------------------------------ the status line ---
    A blank spinner for four seconds reads as a hang. The text says which stage is running,
    and it is driven by the real functions rather than by a timer, so it cannot claim to be
    syncing when it is not. */
 function say(msg) {
  try {
   var host = document.getElementById('qrBootSplash');
   if (!host) return;
   var el = document.getElementById('bootSplashStatus');
   if (!el) {
    el = document.createElement('small');
    el.id = 'bootSplashStatus';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'color:rgba(255,255,255,.78);font:600 12px/1.5 system-ui,sans-serif;'
     + 'letter-spacing:.02em;text-align:center;max-width:76vw;min-height:18px';
    host.appendChild(el);
   }
   el.textContent = msg;
  } catch (e) {}
 }

 function wrap(name, msg) {
  var fn = window[name];
  if (typeof fn !== 'function') return;
  window[name] = function () {
   if (!done) say(msg);
   return fn.apply(this, arguments);
  };
 }
 wrap('initCloud', 'กำลังเชื่อมต่อฐานข้อมูล…');
 wrap('syncCloud', 'กำลังซิงก์ข้อมูล…');

 /* ------------------------------------------------------- the end of the boot sequence ---
    initPortalFromUrl() is js/03's last await. It may be sync or async depending on which
    wrappers are installed, so both shapes are handled, and a throw still releases - a
    visitor must never be left looking at a spinner because something failed behind it. */
 var basePortal = window.initPortalFromUrl;
 if (typeof basePortal === 'function') {
  window.initPortalFromUrl = function () {
   var r;
   try { r = basePortal.apply(this, arguments); }
   catch (e) { finish(); throw e; }
   if (r && typeof r.then === 'function') {
    return r.then(function (v) { finish(); return v; },
                  function (e) { finish(); throw e; });
   }
   finish();
   return r;
  };
 } else {
  /* Nothing to hang the release on; fall back to the load event plus a tick. */
  window.addEventListener('load', function () { setTimeout(finish, 0); }, { once: true });
 }

 say('กำลังโหลด…');
 setTimeout(function () { finish(); }, HOLD_MAX);
})();
