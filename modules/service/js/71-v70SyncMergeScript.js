/* js/71-v70SyncMergeScript.js — 2026-09-16
   A row that has not reached the cloud yet is no longer destroyed by the next sync.

   THE FLAW. syncCloud() (js/03:1649) replaces whole arrays:

       if(!a.error && a.data.length) cases        = a.data.map(fromCaseDb);
       if(!j.error && j.data.length) lineRequests = j.data.map(fromLineRequestDb);
       … saveLocal();

   so anything held locally that the cloud has not got is gone — permanently, because
   saveLocal() then writes the replacement over localStorage. A customer's แจ้งปัญหา is
   written locally BEFORE the upload is awaited, so if the upload fails or the tab is closed
   or the phone drops off the network in between, the report and its case exist only until
   the next sync and then vanish with nothing in the console. js/41 already learned this for
   the operational tables and merges by id there; the tables js/03 owns never did.

   WHAT IS NOT DONE, AND WHY. Protecting EVERY locally-held row that is missing from the
   cloud would be wrong: that wholesale replace is also how a delete made on another device
   reaches this one (js/52's cloudDelete removes the cloud row, and the other devices notice
   only by the row's absence). Blanket protection would resurrect every record anybody
   deleted while this device was offline.

   So a row is protected only while THE CLOUD HAS NEVER ACKNOWLEDGED IT. Every id that comes
   back in a sync is remembered in imode_v70_cloud_seen; once an id is in that list the cloud
   is the authority on it and its later absence is taken as a real delete. An id the cloud has
   never returned is, by definition, one this device has never confirmed as uploaded, so it is
   kept and pushed again.

   FIRST RUN. On a device that has never run this file the remembered list is empty, which
   would make every local-only row look unconfirmed — including ones legitimately deleted
   elsewhere. So the first sync only SEEDS the list, and protects nothing except rows created
   in the last two hours, which cannot plausibly be old remote deletes and are exactly the
   failed uploads this file exists for.

   Scope is deliberately the two tables the reported loss involved — cases and lineRequests.
   Adding another is one entry in TABLES, but each one is a decision about delete propagation,
   not a free win. */
(function(){
 'use strict';
 if(typeof window.syncCloud!=='function')return;

 var SEEN_KEY='imode_v70_cloud_seen';   /* device-local: what the cloud has acknowledged here */
 var CAP_KEEP=50;                       /* rows rescued per table per sync */
 var CAP_SEEN=4000;                     /* ids remembered per table */
 var FRESH_MS=2*60*60*1000;             /* "created just now" window used on the first run */

 /* cases and lineRequests are top-level `let` in js/03: lexical globals, absent from window.
    They are read AND assigned by bare identifier — assigning to an existing lexical binding
    from another classic script is legal; only creating an implicit global is not. */
 var TABLES=[
  {name:'cases',
   get:function(){return (typeof cases!=='undefined'&&Array.isArray(cases))?cases:null},
   set:function(v){cases=v},
   table:'service_cases',
   push:'cloudUpsertCase'},
  {name:'lineRequests',
   get:function(){return (typeof lineRequests!=='undefined'&&Array.isArray(lineRequests))?lineRequests:null},
   set:function(v){lineRequests=v},
   table:'line_customer_requests',
   push:'cloudUpsertLineRequest'},
  {name:'machines',
   get:function(){return (typeof machines!=='undefined'&&Array.isArray(machines))?machines:null},
   set:function(v){machines=v},
   table:'machines',
   push:'imodePushMachine'}
 ];
 window.imodePushMachine=function(row){return window.cloudUpsert('machines',row)};

 /* 2026-09-25: what a database has acknowledged is only true of THAT database. The record is
    stamped with the project URL and ignored under any other one — otherwise pointing a device at
    a new, still-empty database (the move to the company VPS) would read every local row as
    "deleted in the cloud" and emptiedTables() would drop them. */
 function dbUrl(){try{return String((cloudSettings&&cloudSettings.url)||'')}catch(e){return ''}}
 function readSeen(){
  try{
   var o=JSON.parse(localStorage.getItem(SEEN_KEY)||'{}');
   if(!o||typeof o!=='object')return {};
   var u=dbUrl();
   if(o.__url&&u&&o.__url!==u)return {};
   return o;
  }
  catch(e){return {}}
 }
 function writeSeen(o){try{var u=dbUrl();if(u)o.__url=u;localStorage.setItem(SEEN_KEY,JSON.stringify(o))}catch(e){}}

 function idsOf(list){
  var m=Object.create(null);
  (list||[]).forEach(function(r){if(r&&r.id)m[r.id]=1});
  return m;
 }
 function stamp(r){
  var v=(r&&(r.createdAt||r.updatedAt))||'';
  var t=v?new Date(v).getTime():NaN;
  return isNaN(t)?0:t;
 }
 function isFresh(r){return (Date.now()-stamp(r))<FRESH_MS}

 /* Newest first, which is the order every list in this application expects. A row with no
    usable date sorts last rather than jumping to the top. */
 function mergeBack(list,keep){
  var out=list.concat(keep);
  out.sort(function(a,b){return stamp(b)-stamp(a)});
  return out;
 }

 function reconcile(before,refs){
  var seen=readSeen();
  var firstRun=!seen.__seeded;
  var changed=false,repush=[],bin=binnedIds();

  TABLES.forEach(function(t){
   var now=t.get();
   if(!now)return;
   /* 2026-09-25: the base did not replace this array (the cloud table came back empty, or the
      sync failed), so `now` is still this device's own list. Treating it as "what the cloud
      returned" marked every local row acknowledged — including ones never uploaded — which
      the empty-table check below would then have dropped. Nothing was learned; record nothing. */
   if(refs&&now===refs[t.name])return;
   var prev=before[t.name];
   if(!Array.isArray(prev)||!prev.length)return;

   var here=idsOf(now);
   var known=Object.create(null);
   (Array.isArray(seen[t.name])?seen[t.name]:[]).forEach(function(id){known[id]=1});

   var keep=[];
   prev.forEach(function(r){
    if(!r||!r.id||here[r.id])return;                  /* still present: nothing to do */
    if(known[r.id])return;                            /* the cloud had it and does not now: deleted */
    if(firstRun&&!isFresh(r))return;                  /* seeding: only rescue what is clearly new */
    if(bin[r.id])return;                              /* in the bin: deleted on purpose */
    if(keep.length<CAP_KEEP)keep.push(r);
   });

   if(keep.length){
    t.set(mergeBack(now,keep));
    changed=true;
    keep.forEach(function(r){repush.push({table:t,row:r})});
    console.warn('[imode sync-merge] kept '+keep.length+' local '+t.name
     +' row(s) the cloud does not have, and is re-uploading them');
   }

   /* Everything the cloud just returned is acknowledged from now on. */
   var merged=(Array.isArray(seen[t.name])?seen[t.name]:[]).slice();
   Object.keys(here).forEach(function(id){if(!known[id])merged.push(id)});
   if(merged.length>CAP_SEEN)merged=merged.slice(merged.length-CAP_SEEN);
   seen[t.name]=merged;
  });

  seen.__seeded=1;
  writeSeen(seen);

  if(changed){
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
  }
  /* Re-upload AFTER the arrays are repaired, so a failure here cannot leave the screen and
     the storage disagreeing. Each is fire-and-forget: js/24 already reports a write that
     fails, and a row that still does not make it stays protected for the next sync. */
  repush.forEach(function(job){
   try{
    var fn=window[job.table.push];
    if(typeof fn==='function')fn(job.row);
   }catch(e){}
  });
 }

 /* 2026-09-25 — REPORTED: every case was deleted, and one browser still showed five of them after
    a reload and Ctrl+F5 while the other two showed none. syncCloud() only replaces the array
    `if(!a.error && a.data.length)`, so a table the cloud has EMPTIED is never applied: the last
    delete can never reach another device. When the base left the array untouched, one cheap
    probe asks whether the table is really empty, and if it is, every row the cloud had already
    acknowledged here is dropped — it was deleted elsewhere. A row the cloud has never seen stays,
    exactly as reconcile() treats it. A failed probe changes nothing. */
 /* 2026-09-25 — REPORTED: deleted cases went to the bin and their customer requests came back
    on หน้าคำขอ. Measured: of the ten requests bundled into binned cases, six were in Supabase again.
    js/40 deletes the cloud row, but a device that had learned of a row by REALTIME and never in
    a sync had no record of the cloud acknowledging it, so reconcile() took it for unsent work and
    uploaded it again. The bin (settings.trash, which every device receives) now decides: a row
    whose id is in it is never kept or re-uploaded, and one that has come back anyway is removed
    here and in the cloud again. Restoring an entry takes it out of the bin, so a restore is
    never undone by this. */
 function binnedIds(){
  var o=Object.create(null);
  try{
   (Array.isArray(settings.trash)?settings.trash:[]).forEach(function(e){
    if(!e)return;
    (Array.isArray(e.refIds)?e.refIds:[]).forEach(function(id){o[id]=1});
    var p=e.payload;
    if(p&&p.id&&PURGE_TYPES[e.type])o[p.id]=1;
    if(p&&Array.isArray(p.__imodeRequests))p.__imodeRequests.forEach(function(r){if(r&&r.id)o[r.id]=1});
   });
  }catch(e){}
  return o;
 }
 /* The bin covers more than the two tables reconcile() looks after: a quotation, a customer, a
    machine or a machine document deleted on one device was just as able to linger on another —
    syncCloud() never applies an EMPTY table, so deleting the last one never travelled. Only ids
    that are in the bin are touched, so nothing is removed that somebody did not delete. */
 var PURGE_TYPES={'case':1,'request':1,quotation:1,customer:1,machine:1,document:1};
 var PURGE=TABLES.concat([
  {name:'quotations',table:'quotations',get:function(){return (typeof quotations!=='undefined'&&Array.isArray(quotations))?quotations:null},set:function(v){quotations=v}},
  {name:'customers',table:'customers',get:function(){return (typeof customers!=='undefined'&&Array.isArray(customers))?customers:null},set:function(v){customers=v}},
  {name:'machines',table:'machines',get:function(){return (typeof machines!=='undefined'&&Array.isArray(machines))?machines:null},set:function(v){machines=v}},
  {name:'machineDocuments',table:'machine_documents',get:function(){return (typeof machineDocuments!=='undefined'&&Array.isArray(machineDocuments))?machineDocuments:null},set:function(v){machineDocuments=v}}
 ]);
 function purgeBinned(){
  var bin=binnedIds(),db=null,changed=false;
  try{db=supa}catch(e){db=null}
  PURGE.forEach(function(t){
   var now=t.get();if(!now||!now.length||!t.table)return;
   var back=now.filter(function(r){return r&&r.id&&bin[r.id]});
   if(!back.length)return;
   t.set(now.filter(function(r){return !(r&&r.id&&bin[r.id])}));
   changed=true;
   if(db&&typeof db.from==='function')back.forEach(function(r){
    try{db.from(t.table).delete().eq('id',r.id).then(function(){},function(){})}catch(e){}
   });
   try{console.info('[imode sync-merge] removed '+back.length+' '+t.name+' row(s) that are in the bin')}catch(e){}
  });
  if(changed){
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
   try{if(typeof window.imodeRenderRequests==='function')window.imodeRenderRequests()}catch(e){}
  }
 }
 window.imodePurgeBinnedRows=purgeBinned;

 function emptiedTables(refs){
  var db=null;try{db=supa}catch(e){db=null}
  if(!db||typeof db.from!=='function')return;
  TABLES.forEach(function(t){
   var cur=t.get();
   if(!t.table||!cur||cur!==refs[t.name]||!cur.length)return;   /* replaced, or nothing to clear */
   db.from(t.table).select('id').limit(1).then(function(res){
    if(!res||res.error||!Array.isArray(res.data)||res.data.length)return;
    var known={};(readSeen()[t.name]||[]).forEach(function(id){known[id]=1});
    var now=t.get();if(!now)return;
    var left=now.filter(function(r){return !(r&&r.id&&known[r.id])});
    if(left.length===now.length)return;
    t.set(left);
    try{console.info('[imode sync-merge] cloud '+t.table+' is empty — removed '+(now.length-left.length)+' deleted row(s) from this device')}catch(e){}
    try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
    try{if(typeof renderAll==='function')renderAll()}catch(e){}
   },function(){});
  });
 }

 /* 2026-09-25 — the same "last one never leaves" hole for the tables reconcile() does not look
    after. Only the detection is extended, NOT reconcile's keep-and-re-upload: each sync that
    really replaced one of these arrays records its ids (as "seen", scoped to the database like
    everything above), and a sync that left it untouched while the cloud table is empty drops the
    rows the cloud had acknowledged. A row the cloud never had is left alone. */
 var EXTRA=[
  {name:'quotations',table:'quotations',get:function(){return (typeof quotations!=='undefined'&&Array.isArray(quotations))?quotations:null},set:function(v){quotations=v}},
  {name:'warranties',table:'machine_warranties',get:function(){return (typeof warranties!=='undefined'&&Array.isArray(warranties))?warranties:null},set:function(v){warranties=v}},
  {name:'machineDocuments',table:'machine_documents',get:function(){return (typeof machineDocuments!=='undefined'&&Array.isArray(machineDocuments))?machineDocuments:null},set:function(v){machineDocuments=v}},
  {name:'serviceReports',table:'service_reports',get:function(){return (typeof serviceReports!=='undefined'&&Array.isArray(serviceReports))?serviceReports:null},set:function(v){serviceReports=v}}
 ];
 function extraAfter(refs){
  var seen=readSeen(),dirty=false;
  EXTRA.forEach(function(t){
   var now=t.get();if(!now)return;
   if(now!==refs[t.name]){
    var ids=now.map(function(r){return r&&r.id}).filter(Boolean);
    if(ids.length>CAP_SEEN)ids=ids.slice(ids.length-CAP_SEEN);
    seen[t.name]=ids;dirty=true;
   }
  });
  if(dirty)writeSeen(seen);
  var db=null;try{db=supa}catch(e){db=null}
  if(!db||typeof db.from!=='function')return;
  EXTRA.forEach(function(t){
   var now=t.get();
   if(!now||now!==refs[t.name]||!now.length)return;
   var known={};(seen[t.name]||[]).forEach(function(id){known[id]=1});
   if(!Object.keys(known).length)return;
   db.from(t.table).select('id').limit(1).then(function(res){
    if(!res||res.error||!Array.isArray(res.data)||res.data.length)return;
    var cur=t.get();if(!cur)return;
    var left=cur.filter(function(r){return !(r&&r.id&&known[r.id])});
    if(left.length===cur.length)return;
    t.set(left);
    try{console.info('[imode sync-merge] cloud '+t.table+' is empty — removed '+(cur.length-left.length)+' deleted row(s) from this device')}catch(e){}
    try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
    try{if(typeof renderAll==='function')renderAll()}catch(e){}
   },function(){});
  });
 }

 var base=window.syncCloud;
 window.syncCloud=function(){
  var before={},refs={};
  EXTRA.forEach(function(t){refs[t.name]=t.get()});
  TABLES.forEach(function(t){
   var cur=t.get();
   refs[t.name]=cur;
   before[t.name]=cur?cur.slice():[];      /* a shallow copy: the base REPLACES the array */
  });
  var out;
  try{out=base.apply(this,arguments)}
  catch(e){throw e}
  var after=function(){try{reconcile(before,refs)}catch(e){console.warn('[imode sync-merge]',e)}try{emptiedTables(refs)}catch(e){}try{purgeBinned()}catch(e){}try{extraAfter(refs)}catch(e){}};
  if(out&&typeof out.then==='function')out.then(after,after);
  else after();
  return out;
 };

 /* For the console, and for a suite: what this device believes the cloud has acknowledged. */
 window.imodeSyncSeen=function(){return readSeen()};

 /* 2026-09-25 — WHERE THE "MYSTERY REQUESTS" CAME FROM. "Seen" used to be learned from a full
    sync only. A row this device UPLOADED itself, or received by REALTIME, was unknown to it until
    the next full sync — and if another device deleted it first, reconcile() took the missing row
    for unsent work and uploaded it again. The customer's phone that reported a problem is exactly
    that device. So a row is acknowledged the moment the cloud has it: a successful upload (the
    cloudUpsert funnel below) or a row arriving by realtime (js/85 calls imodeSyncAck). */
 var ACK_TABLES={service_cases:'cases',line_customer_requests:'lineRequests',machines:'machines',quotations:'quotations',
  machine_warranties:'warranties',machine_documents:'machineDocuments',service_reports:'serviceReports'};
 function ack(table,id){
  var name=ACK_TABLES[table]||table;
  if(!id||!name)return;
  var seen=readSeen(),list=Array.isArray(seen[name])?seen[name]:[];
  if(list.indexOf(id)>=0)return;
  list.push(id);
  if(list.length>CAP_SEEN)list=list.slice(list.length-CAP_SEEN);
  seen[name]=list;writeSeen(seen);
 }
 window.imodeSyncAck=function(table,id){try{ack(table,String(id||''))}catch(e){}};
 /* For js/110: was this row in the cloud once (so its absence now is a deletion), or in the bin? */
 window.imodeSyncWasDeleted=function(name,id){
  if(!id)return false;
  name=ACK_TABLES[name]||name;   /* a table name (service_cases) or an array name (cases) */
  try{if(binnedIds()[id])return true}catch(e){}
  var seen=readSeen();
  return Array.isArray(seen[name])&&seen[name].indexOf(id)>=0;
 };
 var baseUp=window.cloudUpsert;
 if(typeof baseUp==='function'){
  window.cloudUpsert=function(table,obj){
   var r=baseUp.apply(this,arguments);
   var id=obj&&obj.id;
   if(id&&ACK_TABLES[table]&&r&&typeof r.then==='function')r.then(function(res){
    if(res&&res.ok&&!res.offline&&!res.error)ack(table,String(id));
   },function(){});
   return r;
  };
 }
})();
