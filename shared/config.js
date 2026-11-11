/* Settings shared by every module. The anon key is public by design (every browser gets it);
   Supabase RLS is what protects the data. Never put the service_role key here. */
window.IMODE_CONFIG = {
  supabaseUrl: 'https://cwrkquzuuyhfhesozqnb.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cmtxdXp1dXloZmhlc296cW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTgwNzAsImV4cCI6MjEwNjEzNDA3MH0.JhWDk3su9Pf9XZSPTDe4sWJiHKE3Pl2OPKHvTj0QTgw',
  // Staff sign in with a username; it maps to <username>@<usernameDomain>, same as the old app.
  usernameDomain: 'imode.local',
  // One session key for the whole platform so a login carries across modules.
  storageKey: 'imode-platform-auth'
};

/* 2026-11-11 owner: "The quota has been exceeded." on sign-in (iPad, also PCs). This site shares
   its ~5 MB of localStorage with the old app on the same origin, and when it is full the Supabase
   session cannot be written, so signing in fails. IMODE_STORAGE.wrap(storage) is what every
   Supabase client here keeps its session in (shared/auth.js, modules/service/js/00-platform.js):
     1. a write that does not fit first frees what is safe to free and tries again:
        - re-downloadable copies only this platform made (the menu snapshot, QC rows mirrored from
          the server, marked cloud:true);
        - photo/clip data of service cases and customer requests the server has ACKNOWLEDGED
          (imode_v70_cloud_seen of this same project). They stay on the server; the row keeps a
          stub {name,type,size,offloaded} WITHOUT `data`, exactly the stub js/72 writes. Rows the
          server has not acknowledged are never touched, no key is ever removed;
     2. still full: the session goes to sessionStorage (its own quota; signed in until the tab
        closes), and failing that to memory, so signing in always works;
     3. IMODE_STORAGE.full turns true and 'imode-storage-full' fires so a page can say so in Thai.
   Reads look in all three places. Nothing else changes when storage is not full. */
(function () {
  'use strict';
  var C = window.IMODE_CONFIG || {};
  var mem = Object.create(null);
  var S = { full: false, freed: 0, where: '' };
  function isQuota(e) {
    if (!e) return false;
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014) return true;
    return /quota|exceeded/i.test(String(e.message || e));
  }
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function ss() { try { return window.sessionStorage; } catch (e) { return null; } }
  function readJ(k) { try { return JSON.parse(ls().getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { ls().setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function size(k) { try { return (ls().getItem(k) || '').length; } catch (e) { return 0; } }
  function stubList(m) {
    return (Array.isArray(m) ? m : []).map(function (x) {
      return { name: (x && x.name) || '', type: (x && x.type) || '', size: (x && x.size) || 0, offloaded: true };
    });
  }
  function hasData(m) { return Array.isArray(m) && m.some(function (x) { return x && x.data; }); }
  /* frees what is safe; returns the number of characters freed */
  function freeSpace() {
    var before = 0, after = 0, keys = ['imode_v70_side_menu', 'imode_v66_qc_records', 'imode_test_v532_cases', 'imode_test_v532_line_requests'];
    keys.forEach(function (k) { before += size(k); });
    try { ls().removeItem('imode_v70_side_menu'); } catch (e) {}
    var qc = readJ('imode_v66_qc_records');
    if (Array.isArray(qc) && qc.some(function (q) { return q && q.cloud; })) put('imode_v66_qc_records', qc.filter(function (q) { return q && !q.cloud; }));
    var seen = readJ('imode_v70_cloud_seen');
    if (seen && seen.__url && C.supabaseUrl && String(seen.__url).replace(/\/+$/, '') === String(C.supabaseUrl).replace(/\/+$/, '')) {
      [['imode_test_v532_cases', 'cases'], ['imode_test_v532_line_requests', 'lineRequests']].forEach(function (t) {
        var ids = Object.create(null);
        (Array.isArray(seen[t[1]]) ? seen[t[1]] : []).forEach(function (id) { ids[id] = 1; });
        var list = readJ(t[0]);
        if (!Array.isArray(list)) return;
        var n = 0;
        var out = list.map(function (r) {
          if (!r || !ids[r.id] || !hasData(r.media)) return r;
          n++;
          var c = {}; for (var p in r) if (Object.prototype.hasOwnProperty.call(r, p)) c[p] = r[p];
          c.media = stubList(r.media);
          return c;
        });
        if (n && put(t[0], out)) { try { ls().setItem('imode_v70_storage_shed', '1'); } catch (e) {} }
      });
    }
    keys.forEach(function (k) { after += size(k); });
    S.freed += Math.max(0, before - after);
    return Math.max(0, before - after);
  }
  function flag(where) {
    S.where = where;
    if (S.full) return;
    S.full = true;
    try { window.dispatchEvent(new CustomEvent('imode-storage-full', { detail: { where: where } })); } catch (e) {}
  }
  S.isQuota = isQuota;
  S.freeSpace = freeSpace;
  /* what is in localStorage, biggest first (for anyone looking; not used by the pages) */
  S.report = function () {
    var rows = [], total = 0, s = ls();
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i), n = k.length + (s.getItem(k) || '').length; total += n; rows.push({ key: k, chars: n }); } } catch (e) {}
    rows.sort(function (a, b) { return b.chars - a.chars; });
    return { totalChars: total, keys: rows.slice(0, 15) };
  };
  S.wrap = function (base) {
    if (!base) base = ls();
    var other = base === ss() ? null : ss();
    return {
      getItem: function (k) {
        if (k in mem) return mem[k];
        var v = null;
        try { v = base.getItem(k); } catch (e) {}
        if (v == null && other) { try { v = other.getItem(k); } catch (e) {} }
        return v;
      },
      setItem: function (k, v) {
        var clean = function () { delete mem[k]; if (other) { try { other.removeItem(k); } catch (e) {} } };
        try { base.setItem(k, v); clean(); return; } catch (e) { if (!isQuota(e)) throw e; }
        if (base === ls()) {
          freeSpace();
          try { base.setItem(k, v); clean(); flag('freed'); return; } catch (e) {}
        }
        try { base.removeItem(k); } catch (e) {}
        if (other) { try { other.setItem(k, v); delete mem[k]; flag('session'); return; } catch (e) {} }
        mem[k] = v; flag('memory');
      },
      removeItem: function (k) {
        delete mem[k];
        try { base.removeItem(k); } catch (e) {}
        if (other) { try { other.removeItem(k); } catch (e) {} }
      }
    };
  };
  window.IMODE_STORAGE = S;
})();
