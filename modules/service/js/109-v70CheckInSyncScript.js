/* Beta 1.0 — 2026-09-23: the check-in time survives a sync, without a schema change.

   THE PROBLEM. `cloudUpsertCase()` writes an explicit column list and `check_in_at` is not in
   it, so `c.checkInAt`, `c.checkInLat` and `c.checkInLng` never left the device that recorded
   them — and `syncCloud()` replaces `cases` wholesale, so they were destroyed on that device
   too at the next sync. On any other screen the case read "ยังไม่อัปเดต" although the
   technician had checked in, because fieldStatusLabel() falls back to `c.checkInAt`.

   WHY THERE IS NO SQL HERE. Adding `check_in_at` to the payload without adding the column to
   the table makes PostgREST reject the row (PGRST204) — and that is the whole upsert, so
   EVERY case would stop syncing, which is far worse than the gap being closed. The column
   could be added with one line of SQL, but it does not need to be: all three values are
   already written into the SAME `fieldStatusLog` entry that records the arrival —

       {status:'ถึงหน้างาน', createdAt:<the check-in time>, latitude:lat, longitude:lng}

   — in both paths that set them (js/03:1015 reads the entry, js/03:1031 writes both at once),
   and `field_status_log` IS a real jsonb column in the whitelist. So the value does not need
   to travel; it can simply be read back out of the thing that already travels.

   This derives, it never invents: a case with no ถึงหน้างาน entry is left exactly as it is,
   and a value already present is never overwritten. Nothing is pushed — the source of truth
   is the log, which the case carries by itself. */
(function(){
 'use strict';

 var ARRIVED='ถึงหน้างาน';

 /* The first arrival, not the last: a job re-opened and checked into again should still show
    when the technician first got there, which is what js/03:1015's `!c.checkInAt` guard
    means when it runs on the device that was there. */
 function arrival(c){
  var log=(c&&Array.isArray(c.fieldStatusLog))?c.fieldStatusLog:null;
  if(!log)return null;
  for(var i=0;i<log.length;i++){
   var e=log[i];
   if(e&&String(e.status||'')===ARRIVED&&e.createdAt)return e;
  }
  return null;
 }

 function backfill(){
  var list=[];
  try{list=Array.isArray(cases)?cases:[]}catch(e){return false}
  var changed=0;
  list.forEach(function(c){
   if(!c||c.checkInAt)return;                 /* already known here: leave it alone */
   var e=arrival(c);
   if(!e)return;
   c.checkInAt=e.createdAt;
   /* Only when the entry really carries them. An empty string is what js/03 stores when the
      browser refused the location, and copying that over is honest — but `undefined` is not
      a coordinate and must not become one. */
   if(typeof e.latitude!=='undefined'&&!c.checkInLat)c.checkInLat=e.latitude;
   if(typeof e.longitude!=='undefined'&&!c.checkInLng)c.checkInLng=e.longitude;
   changed++;
  });
  if(!changed)return false;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{console.info('[imode] check-in time restored from the field log on '+changed+' case(s)')}catch(e){}
  return true;
 }
 window.imodeRestoreCheckIn=backfill;

 /* After the sync, because that is when the freshly downloaded copy has the gap. Also at
    boot, so a device that is offline today still reads its own stored cases correctly. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{if(backfill()&&typeof renderAll==='function')renderAll()}catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',backfill,{once:true});
 else backfill();
})();
