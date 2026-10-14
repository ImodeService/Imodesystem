/* Beta — QC, เงินสดย่อย, สต๊อกอะไหล่ and ใบสั่งซื้อ reach the other devices.

   These four were the only modules with no Supabase table at all. Everything else the
   application owns already travels; a QC done on a technician's tablet was invisible to
   the office and always would have been, which is exactly the demonstration a fair needs.

   ONE MANUAL STEP: supabase/05-v70-operational-tables.sql has to be run once in the
   Supabase SQL Editor. Until it is, this file detects the missing tables on its first
   attempt, says so once in the console, and stops trying — the application behaves exactly
   as it did before, on the device only. Nothing here can break the app if the tables never
   appear.

   THE WHOLE RECORD TRAVELS AS jsonb

   Every other table maps each field to a column and cloudUpsert() sends an explicit
   whitelist, which has twice meant a field added in JavaScript was dropped silently on the
   way out. These records are read and written only by this application, so each row is
   {id, data, updated_at} and the record itself lives in `data`. A new field needs no
   migration and cannot be lost. system_settings already works this way.

   PUSH IS A DIFF AFTER saveLocal(), NOT A HOOK ON EACH SAVE BUTTON

   Wrapping saveQc / savePettyCash / saveSparePart / savePurchaseOrder would miss the ones
   that change these arrays without going through a save button: receiving a purchase order
   also increments the part's stock, and the backup restore and the "clear test data"
   button rewrite all three at once. So the four arrays are snapshotted by id, and after
   every saveLocal() whatever actually changed is pushed and whatever vanished is deleted.
   No knowledge of js/04's internals, and no writer can be forgotten.

   The three v67 arrays are `let` inside js/04's IIFE — not globals of any kind — so they
   are reached through window.imodeV67Data, two accessors added there for this. qcRecords
   is a top-level `let` in js/03 and therefore a lexical global, which another classic
   script can both read and assign by bare identifier.

   PULL MERGES, IT DOES NOT REPLACE

   syncCloud() replaces its arrays wholesale from the server. Doing that here would throw
   away a QC written on this device seconds ago but not yet pushed, so the download is
   merged by id with the newer updatedAt winning. Last write wins, as everywhere else in
   this application; nothing here reconciles a genuine conflict. */
(function(){
 'use strict';

 var TABLES=[
  {key:'qc',        table:'qc_records',      label:'QC เครื่อง'},
  {key:'pettyCash', table:'petty_cash',      label:'เงินสดย่อย'},
  {key:'spareParts',table:'spare_parts',     label:'สต๊อกอะไหล่'},
  {key:'purchaseOrders',table:'purchase_orders',label:'ใบสั่งซื้อ'}
 ];

 var missing=false;      /* the SQL has not been run: report once, then stay quiet */
 var reported=false;
 var pushing=false;
 var snap=null;          /* {key: {id: fingerprint}} */
 var timer=0;

 function client(){try{return (typeof supa!=='undefined')?supa:null}catch(e){return null}}
 function v67(){try{return (window.imodeV67Data&&window.imodeV67Data.get())||null}catch(e){return null}}
 function qcList(){try{return Array.isArray(qcRecords)?qcRecords:[]}catch(e){return []}}

 function readAll(){
  var d=v67()||{};
  return {
   qc:qcList(),
   pettyCash:Array.isArray(d.pettyCash)?d.pettyCash:[],
   spareParts:Array.isArray(d.spareParts)?d.spareParts:[],
   purchaseOrders:Array.isArray(d.purchaseOrders)?d.purchaseOrders:[]
  };
 }
 function writeAll(next){
  try{if(Array.isArray(next.qc))qcRecords=next.qc}catch(e){}
  try{
   if(window.imodeV67Data&&typeof window.imodeV67Data.set==='function')
    window.imodeV67Data.set({pettyCash:next.pettyCash,spareParts:next.spareParts,purchaseOrders:next.purchaseOrders});
  }catch(e){}
 }
 /* A cheap fingerprint. JSON.stringify is not key-order stable in theory, but these objects
    are built by the same literals every time, so in practice it changes exactly when the
    record does — and a false positive only costs one redundant upsert. */
 function fp(o){try{return JSON.stringify(o)}catch(e){return String(Math.random())}}
 function index(list){
  var m={};
  (list||[]).forEach(function(r){if(r&&r.id)m[r.id]=fp(r)});
  return m;
 }
 function snapshot(){
  var all=readAll(),out={};
  TABLES.forEach(function(t){out[t.key]=index(all[t.key])});
  return out;
 }

 function note(msg,err){
  if(reported)return;
  reported=true;
  console.warn('[imode ops-sync] '+msg,err||'');
 }
 function tableMissing(err){
  var s=JSON.stringify(err||{});
  return s.indexOf('PGRST205')>=0||s.indexOf('42P01')>=0||/does not exist/i.test(s);
 }

 /* ------------------------------------------------------------------- push ----- */
 function push(){
  var sb=client();
  if(!sb||missing)return Promise.resolve();
  if(pushing)return Promise.resolve();
  var all=readAll(),now=snapshot(),before=snap||{};
  var jobs=[];
  TABLES.forEach(function(t){
   var prev=before[t.key]||{},cur=now[t.key]||{},rows=all[t.key]||[];
   var changed=rows.filter(function(r){return r&&r.id&&prev[r.id]!==cur[r.id]});
   var gone=Object.keys(prev).filter(function(id){return !(id in cur)});
   if(changed.length){
    jobs.push({table:t.table,op:'upsert',payload:changed.map(function(r){
     return {id:String(r.id),data:r,updated_at:r.updatedAt||new Date().toISOString()};
    })});
   }
   gone.forEach(function(id){jobs.push({table:t.table,op:'delete',id:id})});
  });
  if(!jobs.length){snap=now;return Promise.resolve()}
  /* 2026-09-28: offline, nothing is attempted and the snapshot is NOT moved — so everything
     changed meanwhile is still a difference, and goes on the next push once the network is
     back (the 'online' listener below). Before this, a push that failed on the network still
     set snap=now, and a QC or an expense recorded with no signal was never sent at all. */
  if(navigator.onLine===false)return Promise.resolve();
  pushing=true;
  var failed=false;
  return jobs.reduce(function(p,j){
   return p.then(function(){
    if(j.op==='upsert')return sb.from(j.table).upsert(j.payload);
    return sb.from(j.table).delete().eq('id',j.id);
   }).then(function(res){
    if(res&&res.error){
     failed=true;
     if(tableMissing(res.error)){missing=true;note('supabase/05-v70-operational-tables.sql has not been run yet — QC, petty cash, spare parts and purchase orders stay on this device.',res.error);}
     else note('push failed for '+j.table,res.error);
    }
   },function(e){
    failed=true;
    if(tableMissing(e)){missing=true;note('supabase/05-v70-operational-tables.sql has not been run yet.',e)}
    else note('push threw for '+j.table,e);
   });
  },Promise.resolve()).then(function(){
   pushing=false;
   if(!missing&&!failed)snap=now;   /* only trust the snapshot when the writes really landed */
  },function(){pushing=false});
 }
 function schedulePush(){
  if(!client()||missing)return;
  clearTimeout(timer);
  timer=setTimeout(function(){push()},400);
 }
 /* 2026-09-28: whatever was held back offline goes when the network returns, and a failed
    push is retried every 45 s — silently; push() sends only differences, so a pass with
    nothing owed does nothing. */
 window.addEventListener('online',function(){setTimeout(schedulePush,1500)});
 setInterval(function(){if(navigator.onLine!==false)schedulePush()},45000);

 /* ------------------------------------------------------------------- pull ----- */
 function newer(a,b){
  var ta=Date.parse((a&&(a.updatedAt||a.createdAt))||'')||0;
  var tb=Date.parse((b&&(b.updatedAt||b.createdAt))||'')||0;
  return ta>=tb?a:b;
 }
 function merge(local,remote){
  var m={},out=[];
  (local||[]).forEach(function(r){if(r&&r.id)m[r.id]=r});
  (remote||[]).forEach(function(r){
   if(!r||!r.id)return;
   m[r.id]=m[r.id]?newer(m[r.id],r):r;
  });
  Object.keys(m).forEach(function(k){out.push(m[k])});
  out.sort(function(a,b){
   return Date.parse(b.updatedAt||b.createdAt||'')-Date.parse(a.updatedAt||a.createdAt||'')||0;
  });
  return out;
 }
 function pull(){
  var sb=client();
  if(!sb||missing)return Promise.resolve(false);
  return Promise.all(TABLES.map(function(t){
   return Promise.resolve(sb.from(t.table).select('id,data,updated_at')).then(function(r){
    if(r&&r.error){
     if(tableMissing(r.error)){missing=true;note('supabase/05-v70-operational-tables.sql has not been run yet — QC, petty cash, spare parts and purchase orders stay on this device.',r.error)}
     return null;
    }
    return (r&&r.data)?r.data.map(function(row){
     var rec=row.data||{};
     if(!rec.id)rec.id=row.id;
     return rec;
    }):null;
   },function(e){
    if(tableMissing(e)){missing=true;note('supabase/05-v70-operational-tables.sql has not been run yet.',e)}
    return null;
   });
  })).then(function(sets){
   if(missing)return false;
   var all=readAll(),next={},touched=false;
   TABLES.forEach(function(t,i){
    var remote=sets[i];
    if(!remote){next[t.key]=all[t.key];return}
    var merged=merge(all[t.key],remote);
    next[t.key]=merged;
    if(fp(merged)!==fp(all[t.key]))touched=true;
   });
   if(!touched)return false;
   writeAll(next);
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   snap=snapshot();
   return true;
  });
 }
 window.imodeOpsPull=pull;
 window.imodeOpsPush=push;
 window.imodeOpsStatus=function(){return {connected:!!client(),tablesMissing:missing}};

 /* --------------------------------------------------------------- the wiring --- */
 /* saveLocal is the one call every writer of these four arrays makes — js/04 replaced the
    global with its own version precisely so it could persist them. Diffing after it runs
    catches the save buttons, the stock movement a received purchase order causes, the
    backup restore and the clear-test-data button, without wrapping any of them. */
 var baseSave=window.saveLocal;
 if(typeof baseSave==='function'){
  window.saveLocal=function(){
   var r=baseSave.apply(this,arguments);
   try{schedulePush()}catch(e){}
   return r;
  };
 }
 /* syncCloud pulls the eleven tables it knows about; these four follow it, then re-render
    so the office sees the tablet's QC without a reload. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var after=function(){
    pull().then(function(changed){
     if(changed&&typeof renderAll==='function'){try{renderAll()}catch(e){}}
    },function(){});
   };
   if(r&&typeof r.then==='function')r.then(after,after);
   else after();
   return r;
  };
 }

 /* First run: take the baseline before anything can change, then pull once the connection
    exists. initCloud() runs on `load`, so the client is not there at parse time. */
 function start(){
  snap=snapshot();
  var tries=0,wait;
  function tick(){
   tries++;
   if(client()){
    clearInterval(wait);
    pull().then(function(changed){
     if(changed&&typeof renderAll==='function'){try{renderAll()}catch(e){}}
     /* Anything this device already held that the cloud has not seen goes up. */
     var base=snap;snap={};push().then(function(){if(missing)snap=base});
    },function(){});
   }else if(tries===40){
    /* 2026-09-28: ~20 s with no connection is a device that booted offline, not one with
       nothing to do — js/110 reconnects it when the signal returns, and the work recorded
       meanwhile has to go up then. Keep waiting, slowly, instead of giving up. */
    clearInterval(wait);wait=setInterval(tick,5000);
   }
  }
  wait=setInterval(tick,500);
 }
 if(document.readyState==='complete')start();
 else window.addEventListener('load',start,{once:true});
})();
