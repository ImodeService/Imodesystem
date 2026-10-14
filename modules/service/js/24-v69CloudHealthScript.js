/* V6.9 — a rejected cloud write is no longer silent.

   THE PROBLEM THIS SOLVES

   js/03 ends every cloud write with:

       async function cloudUpsert(table,obj){
         if(!supa)return;
         try{const {error}=await supa.from(table).upsert(obj);if(error)throw error}
         catch(e){console.warn(e)}          <-- swallowed
       }

   and decides the connection is healthy on a read alone:

       const {error}=await supa.from('service_cases').select('id').limit(1);
       if(error)throw error; updateCloudUI(true)

   Under Row Level Security with no policy for the `anon` role — which is what
   02-rls.sql produces, because every policy in it is `to authenticated` and nobody in
   this application is ever authenticated with Supabase — a SELECT returns HTTP 200 with
   zero rows rather than an error. So the probe passes, the badge says "Cloud Connected",
   and every single write is rejected with 42501 where only the console can see it.

   A customer submitted a report, the app said it was sent, and nothing left the phone.

   WHAT THIS DOES

   Replaces window.cloudUpsert with the same one line of work plus an outcome record, and
   surfaces the first failure. It does not retry, does not queue, and does not change what
   is written — a failed write still fails, it is just no longer invisible.

   `supa` and `cloudSettings` are top-level `let` bindings in js/03: lexical globals, shared
   across classic scripts but absent from `window`. They are read here by bare identifier.

   Loads last, so its wrapper is the outermost one. It registers no permission key, so the
   "must load before js/20" rule does not apply to it. */
(function () {
 'use strict';

 var state = { ok: 0, failed: 0, lastError: null, lastTable: '', notified: false };

 function toast(msg) {
  try { if (typeof toastMsg === 'function') toastMsg(msg); } catch (e) {}
 }

 /* 42501 is the one that means "RLS refused this", as opposed to a network blip. */
 function isDenied(e) {
  return !!e && (e.code === '42501' || /row-level security/i.test(e.message || ''));
 }

 function describe(e) {
  if (!e) return 'unknown error';
  if (isDenied(e)) return 'ฐานข้อมูลปฏิเสธการบันทึก (RLS 42501)';
  return e.message || String(e);
 }

 function record(table, err) {
  if (!err) { state.ok++; return; }
  state.failed++;
  state.lastError = err;
  state.lastTable = table;
  console.warn('[imode cloud] upsert ' + table + ' failed:', err);

  /* Once per session. Repeating it on every row of a sync would bury the page in toasts.
     2026-09-18: and never on a customer surface. The wording is for whoever runs the system —
     a customer who scanned a QR can do nothing with "บันทึกขึ้นระบบส่วนกลางไม่สำเร็จ" except
     worry. The console warning below, the settings badge and imodeCloudHealth() are unchanged,
     so nothing is hidden from the people who can act on it. */
  var customerSurface = false;
  try { customerSurface = typeof window.imodeCustomerSurface === 'function'
                       && window.imodeCustomerSurface(); } catch (e) {}
  if (!state.notified && !customerSurface) {
   state.notified = true;
   toast('บันทึกขึ้นระบบส่วนกลางไม่สำเร็จ: ' + describe(err));
   if (isDenied(err)) {
    console.warn('[imode cloud] Every write will fail until the database grants the anon '
     + 'role write access. See supabase/04-anon-uat.sql.');
   }
  }
  refreshBadge();
 }

 /* The settings page line, so the state is visible somewhere other than a toast. */
 function refreshBadge() {
  try {
   if (typeof cloudResult === 'undefined' || !cloudResult) return;
   if (!state.failed) return;
   cloudResult.textContent = 'เชื่อมต่อได้ แต่บันทึกข้อมูลไม่ได้ — '
    + describe(state.lastError) + ' (ล้มเหลว ' + state.failed + ' รายการ)';
  } catch (e) {}
 }

 var baseUpsert = window.cloudUpsert;
 if (typeof baseUpsert === 'function') {
  /* Reimplemented rather than delegated: the original catches internally, so wrapping it
     can never see whether the write actually landed. This is the same single statement. */
  /* 2026-09-18: it also RETURNS the outcome now. Nothing that called it before reads the
     value, so nothing changes for them; it is there so a caller that wants to tell somebody
     whether the write landed — the ส่งใบเสนอราคา popup in js/43 — can say something true
     instead of guessing. `offline` is not a failure: the record is saved locally and the
     next sync carries it. */
  /* 2026-09-28: "ในกรณีที่ไม่มีเน็ต เก็บไว้ในเครื่องจนกว่าจะได้รับเน็ต และแอบส่งแบบเงียบๆ".
     - The device KNOWS it is offline (navigator.onLine false): the write is not attempted —
       it would only fail — and is reported `offline`, which js/110 keeps and sends later.
     - A weak signal can leave a request hanging for minutes while the technician's save button
       waits on it, so an attempt is given WRITE_WAIT and then treated as not landed. The
       request may still land afterwards; re-sending it is an idempotent upsert.
     - A network failure is recorded and kept, but never toasted: it is not something the
       technician can act on, and the work is safe. A refusal by the server still is. */
  var WRITE_WAIT = 5000;
  /* A write that outlives WRITE_WAIT is not cancelled: it runs on, and if it lands the page is
     told ('imode-upsert-landed', js/110 un-marks it). While it runs, js/110 does not send the
     same row again — a 1 MB case sent twice on a weak signal is the last thing it needs. */
  var inflight = {};
  window.imodeUpsertInflight = function (table, id) { return !!inflight[table + ':' + id]; };
  function isNetwork(e) {
   var m = String((e && (e.message || e.details || e)) || '');
   return !!e && (e.name === 'TypeError' || e.network === true
    || /failed to fetch|networkerror|load failed|network request failed|timeout/i.test(m));
  }
  window.cloudUpsert = async function (table, obj) {
   if (typeof supa === 'undefined' || !supa) return { ok: true, offline: true, error: null };
   if (navigator.onLine === false) return { ok: true, offline: true, error: null };
   var key = table + ':' + (obj && obj.id);
   try {
    var timer, late = false;
    var real = Promise.resolve(supa.from(table).upsert(obj));
    inflight[key] = true;
    real.then(function (r) {
     delete inflight[key];
     if (late && r && !r.error) {
      record(table, null);
      try { window.dispatchEvent(new CustomEvent('imode-upsert-landed', { detail: { table: table, id: obj && obj.id } })); } catch (x) {}
     }
    }, function () { delete inflight[key]; });
    var res = await Promise.race([
     real,
     new Promise(function (r) { timer = setTimeout(function () {
      late = true;
      r({ error: { message: 'timeout: no answer in ' + (WRITE_WAIT / 1000) + ' s', network: true } });
     }, WRITE_WAIT); })
    ]);
    clearTimeout(timer);
    if (res.error) throw res.error;
    record(table, null);
    return { ok: true, offline: false, error: null };
   } catch (e) {
    if (isNetwork(e)) {
     state.failed++; state.lastError = e; state.lastTable = table;
     console.warn('[imode cloud] ' + table + ' not sent (network) — kept on this device:', e);
     return { ok: false, offline: false, network: true, error: e };
    }
    record(table, e);
    return { ok: false, offline: false, error: e };
   }
  };
 }

 /* Keep the warning on screen when something else repaints the settings page. */
 var baseUpdateUI = window.updateCloudUI;
 if (typeof baseUpdateUI === 'function') {
  window.updateCloudUI = function () {
   var r = baseUpdateUI.apply(this, arguments);
   refreshBadge();
   return r;
  };
 }

 /* Deliberately manual: it writes a canary row and deletes it again, which is not something
    to do on every boot of every customer's phone. Run imodeCloudSelfTest() in the console.
    This is the check that distinguishes "the table is empty" from "I am not allowed to see
    it", which a plain read cannot do. */
 window.imodeCloudSelfTest = async function (table) {
  table = table || 'system_settings';
  var out = { table: table, connected: false, canRead: false, canWrite: false, rows: null, error: null };
  if (typeof supa === 'undefined' || !supa) { out.error = 'ยังไม่ได้เชื่อม Cloud'; console.table(out); return out; }
  out.connected = true;
  try {
   var r = await supa.from(table).select('id');
   if (r.error) throw r.error;
   out.canRead = true;
   out.rows = r.data.length;
  } catch (e) { out.error = 'read: ' + describe(e); console.table(out); return out; }

  var id = '__imode_selftest__';
  try {
   var w = await supa.from(table).upsert({ id: id });
   if (w.error) throw w.error;
   out.canWrite = true;
   await supa.from(table).delete().eq('id', id);
  } catch (e) {
   out.error = 'write: ' + describe(e);
  }
  console.table(out);
  if (out.canRead && !out.canWrite) {
   console.warn('[imode cloud] Read-only. A read returning ' + out.rows + ' rows under RLS '
    + 'does NOT prove the table is empty. Run supabase/04-anon-uat.sql.');
  }
  return out;
 };

 window.imodeCloudHealth = function () {
  return {
   connected: (typeof supa !== 'undefined' && !!supa),
   url: (typeof cloudSettings !== 'undefined' && cloudSettings) ? cloudSettings.url || '' : '',
   writesOk: state.ok,
   writesFailed: state.failed,
   lastTable: state.lastTable,
   lastError: state.lastError ? describe(state.lastError) : null
  };
 };
})();
