/* I-MODE Plus Service & Maintenance — offline service worker.
   Beta 1.0 — 2026-09-23. Written so a technician who is on site with no signal can still OPEN
   the app, not merely keep a tab alive.

   WHAT THE PROBLEM WAS. Everything except the data is fetched from the server on every load:
   index.html, 23 stylesheets, 110 scripts, the four auth files and the customer page fragment.
   An open tab kept working offline, but a reload, a new tab, or a phone that evicted the tab
   got a blank screen. js/03 used to register a service worker here and there has never been a
   file at this path, so it 404'd on every boot until part 28 removed the line.

   THE STRATEGY, and why it is not the fast one.

     same-origin  ->  NETWORK FIRST, cache only as the fallback
     ./assets/ ./vendor/  ->  cache first (they do not change, and they are the big ones)
     cross-origin ->  network, then cache, then a harmless empty response
     supabase.co  ->  never touched: always the network, never cached

   Cache-first for scripts would be faster, and it is the wrong trade HERE. This application is
   patch-over-patch: js/NN files override each other in numeric order and a page running some
   files from a previous deploy and some from the current one is not a slower app, it is a
   BROKEN one — an override applied to a function that has changed underneath it. Network-first
   means an online device always runs one consistent set, and the cache exists for exactly the
   case it was built for: there is no network at all.

   A stale Supabase response would be worse than no response, so anything addressed to
   supabase.co is passed straight through and never stored.

   THE PRECACHE LIST IS NOT IN THIS FILE, deliberately. A hard-coded list of 146 paths in a
   project that adds a script almost every session is a list that is wrong within a week, and
   the symptom would be a file that works online and is missing offline — the worst kind,
   because testing online never shows it. Instead js/111 reads what the document ACTUALLY
   loaded (`link[rel=stylesheet]`, `script[src]`) and posts it here after `load`. It cannot
   drift, because it is not a copy of anything.

   TO FORCE EVERY DEVICE TO REBUILD ITS CACHE: bump VERSION. Old caches are deleted on
   activate. To remove this entirely: `imodeDisableOffline()` in the console, or delete the
   registration in js/111 — nothing else depends on it. */

var VERSION = 'v5-2026-10-14';
var CACHE = 'imode-offline-' + VERSION;

/* The handful the document never references, so js/111 cannot discover them: the customer
   page is read by XHR, the QR decoder is loaded lazily on the first scan, and the case
   workspace is a separate document reached by navigation.

   The two document logos are here because js/111 collects script[src] and link[href] and
   NOT img[src] — deliberately, so a page full of machine photographs is not dragged into
   the cache. These two are chrome rather than content: the first is the customer page's
   own header logo (pages/customer-home.html and js/14) and the second dresses every
   printed document, QR sheet and QC form. Without them a customer opening their page on a
   phone with no signal gets the layout with a broken image where the logo belongs. */
var EXTRA = [
 './',
 './index.html',
 './pages/customer-home.html',
 './service-case-detail.html',
 './vendor/jsQR.min.js',
 './assets/Iconservice.png',
 './assets/imode-ui-logo-v532.png',
 './assets/imode-document-logo-removeBG.png',
 './assets/imode-document-logo.webp'
];

function bypass(url) {
 /* Live data. A cached answer here would show a technician yesterday's jobs and look right. */
 return url.indexOf('supabase.co') >= 0 || url.indexOf('/rest/v1/') >= 0
     || url.indexOf('/auth/v1/') >= 0 || url.indexOf('/realtime/v1/') >= 0
     /* the company's own server (production) answers on its own domain, so the paths are
        what identify live data there, never the hostname */
     || url.indexOf('/functions/v1/') >= 0 || url.indexOf('/storage/v1/') >= 0
     || url.indexOf('/graphql/v1/') >= 0;
}
function cacheFirstPath(url) {
 return /\/(assets|vendor)\//.test(url);
}

self.addEventListener('install', function (e) {
 /* One at a time and each failure tolerated: cache.addAll rejects the WHOLE install if a
    single path 404s, which would mean one renamed asset costs every device its offline copy. */
 e.waitUntil(
  caches.open(CACHE).then(function (c) {
   return Promise.all(EXTRA.map(function (u) {
    return c.add(u).catch(function () {});
   }));
  }).then(function () { return self.skipWaiting(); })
 );
});

self.addEventListener('activate', function (e) {
 e.waitUntil(
  caches.keys().then(function (names) {
   return Promise.all(names.map(function (n) {
    if (n !== CACHE && n.indexOf('imode-offline-') === 0) return caches.delete(n);
   }));
  }).then(function () { return self.clients.claim(); })
 );
});

/* js/111 sends the real list once the page has finished loading. Failures are ignored one by
   one for the same reason as above. */
self.addEventListener('message', function (e) {
 var d = e.data;
 if (!d || d.type !== 'imode-precache' || !Array.isArray(d.urls)) return;
 e.waitUntil(
  caches.open(CACHE).then(function (c) {
   return Promise.all(d.urls.slice(0, 400).map(function (u) {
    /* Already there: do not re-download 3 MB on every single page load. */
    return c.match(u).then(function (hit) { return hit ? null : c.add(u).catch(function () {}); });
   }));
  })
 );
});

function putIfOk(req, res) {
 if (!res || !res.ok || res.status !== 200) return res;
 var copy = res.clone();
 caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
 return res;
}

/* 2026-09-24 — ALWAYS ASK THE SERVER. fetch(req) honours the browser's HTTP cache, and GitHub
   Pages serves every file with max-age=600, so for ten minutes after a deploy a device could be
   handed the previous copy of a page or a script — or, worse, a mix of old and new js/NN files,
   which is the exact failure the network-first strategy below exists to prevent. Reported as a
   fixed page that still behaved the old way. `no-cache` revalidates with the server every time
   (a 304 when nothing changed, so it costs a round trip, not a download). */
function fresh(req) {
 try { return fetch(req, { cache: 'no-cache' }); } catch (x) { return fetch(req); }
}

self.addEventListener('fetch', function (e) {
 var req = e.request;
 if (req.method !== 'GET') return;
 var url = req.url;
 if (url.indexOf('http') !== 0) return;
 if (bypass(url)) return;                       /* straight to the network, every time */

 var sameOrigin = url.indexOf(self.location.origin) === 0;

 /* A reload or a bookmark with no network: give back the page we already have rather than
    the browser's dinosaur. */
 if (req.mode === 'navigate') {
  e.respondWith(
   fresh(req).then(function (res) { return putIfOk(req, res); })
    .catch(function () {
     /* Each step is a promise, so they are chained rather than joined with `||` — a promise
        is always truthy and `a || b` here would return a promise resolving to undefined,
        which the browser shows as a network error. */
     return caches.match(req).then(function (hit) {
      return hit || caches.match('./index.html');
     }).then(function (hit) {
      return hit || caches.match('./');
     }).then(function (hit) {
      return hit || new Response(
       '<!doctype html><meta charset="utf-8"><title>ออฟไลน์</title>'
       + '<body style="font-family:sans-serif;padding:28px;color:#12356f">'
       + '<h2>ยังไม่มีสำเนาออฟไลน์</h2><p>อุปกรณ์นี้ต้องเปิดเว็บขณะมีอินเทอร์เน็ตอย่างน้อยหนึ่งครั้ง '
       + 'ก่อนจึงจะใช้งานตอนไม่มีสัญญาณได้</p>',
       { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
     });
    })
  );
  return;
 }

 if (sameOrigin && cacheFirstPath(url)) {
  e.respondWith(
   caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) { return putIfOk(req, res); });
   })
  );
  return;
 }

 if (sameOrigin) {
  e.respondWith(
   fresh(req).then(function (res) { return putIfOk(req, res); })
    .catch(function () { return caches.match(req); })
  );
  return;
 }

 /* Cross-origin: the CDN scripts and Google Fonts. Offline, a request that simply hangs stops
    the HTML parser dead — that is a real failure mode this project has hit in headless Chrome
    — so an empty 200 is returned instead of nothing. An absent qrcodejs or supabase-js is
    already handled: initCloud() falls back to Local Mode and the QR popup is the only thing
    that needs the other. Missing fonts cost the page its typeface and nothing else. */
 e.respondWith(
  fetch(req).then(function (res) { return putIfOk(req, res); })
   .catch(function () {
    return caches.match(req).then(function (hit) {
     if (hit) return hit;
     var css = /\.css($|\?)/.test(url) || url.indexOf('fonts.googleapis.com') >= 0;
     return new Response(css ? '/* offline */' : '', {
      status: 200,
      headers: { 'Content-Type': css ? 'text/css' : 'application/javascript' }
     });
    });
   })
 );
});
