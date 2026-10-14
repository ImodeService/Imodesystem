/* Beta 1.0 — 2026-09-23: work done with no signal is no longer thrown away by the next sync.

   THE PROBLEM, and it is not theoretical. A technician on site with no data connection can
   still use the app if the tab is already open: every screen persists through saveLocal().
   The cloud write is what fails, and js/24 already answers `{ok:true, offline:true}` for it
   with the comment "the record is saved locally and the next sync carries it".

   THAT COMMENT IS TRUE FOR A NEW ROW AND FALSE FOR AN EDIT. syncCloud() does
   `cases = a.data.map(fromCaseDb)` — a WHOLESALE replace. js/71 rescues rows the cloud does
   not have at all, but its first test is `if(here[r.id])return` — a case the cloud already
   knows about is "still present", so the server's older copy silently wins and the field
   statuses, notes and photos recorded on site are gone. The same is true of a ใบตรวจ, which
   js/71 does not cover at all.

   WHAT THIS DOES. It remembers which rows this device changed but could not push, keeps the
   local copy through the sync, and re-uploads it. Device-local by definition — it is a note
   about what THIS device still owes the server.

   THE GUARD THAT MAKES IT SAFE: a kept row must be NEWER than the server's. Without that,
   a device reconnecting after two days would overwrite whatever anyone else has done since,
   which turns "last write wins" into "last device to find signal wins". When the server copy
   is newer the local edit is dropped and said so in the console — losing one offline edit to
   a later real one is the right way round.

   SCOPE is `cases` and `serviceReports`: the two the field path writes and the two that are
   replaced wholesale. The four operational tables (QC, petty cash, spare parts, purchase
   orders) are already safe — js/41 merges them by id with the newer updatedAt winning.
   Adding another table here is one entry in TABLES, and each one is a decision, not a
   free win. */
(function(){
 'use strict';
 if(typeof window.cloudUpsert!=='function'||typeof window.syncCloud!=='function')return;

 var PEND_KEY='imode_v70_pending_push';
 var CAP=200;                        /* ids remembered per table */

 /* `cases` and `serviceReports` are top-level let in js/03 — lexical globals, never on
    window, read AND assigned by bare identifier. */
 var TABLES={
  'service_cases':{
   key:'cases',
   get:function(){return (typeof cases!=='undefined'&&Array.isArray(cases))?cases:null},
   set:function(v){cases=v},
   push:'cloudUpsertCase'
  },
  'service_reports':{
   key:'serviceReports',
   get:function(){return (typeof serviceReports!=='undefined'&&Array.isArray(serviceReports))?serviceReports:null},
   set:function(v){serviceReports=v},
   push:'cloudUpsertServiceReport'
  },
  'machines':{
   key:'machines',
   get:function(){return (typeof machines!=='undefined'&&Array.isArray(machines))?machines:null},
   set:function(v){machines=v},
   push:'imodePushMachine'
  }
 };

 function readPend(){
  try{var o=JSON.parse(localStorage.getItem(PEND_KEY)||'{}');return (o&&typeof o==='object')?o:{}}
  catch(e){return {}}
 }
 function writePend(o){try{localStorage.setItem(PEND_KEY,JSON.stringify(o))}catch(e){}}

 function mark(tableName,id){
  var t=TABLES[tableName];
  if(!t||!id)return;
  var p=readPend(),list=Array.isArray(p[t.key])?p[t.key]:[];
  if(list.indexOf(id)<0){
   list.push(id);
   if(list.length>CAP)list=list.slice(list.length-CAP);
   p[t.key]=list;writePend(p);
  }
 }
 function clear(tableName,id){
  var t=TABLES[tableName];
  if(!t||!id)return;
  var p=readPend(),list=Array.isArray(p[t.key])?p[t.key]:[];
  var i=list.indexOf(id);
  if(i<0)return;
  list.splice(i,1);p[t.key]=list;writePend(p);
 }

 /* ------------------------------------------------ 1. notice what did not land --- */
 var baseUpsert=window.cloudUpsert;
 window.cloudUpsert=function(table,obj){
  var id=obj&&obj.id;
  var out;
  try{out=baseUpsert.apply(this,arguments)}
  catch(e){mark(table,id);throw e}
  if(!out||typeof out.then!=='function'){mark(table,id);return out}
  return out.then(function(res){
   /* js/24 returns {ok, offline, error}. `offline` means no client at all, which is exactly
      the case this file exists for. A build without js/24 returns undefined from the js/03
      original, which swallows its own errors — nothing can be told there, so nothing is
      marked rather than marking every write as pending for ever. */
   if(res&&res.ok===true&&res.offline!==true)clear(table,id);
   else if(res&&(res.offline===true||res.ok===false))mark(table,id);
   return res;
  },function(e){mark(table,id);throw e});
 };

 function client(){try{return (typeof supa!=='undefined')?supa:null}catch(e){return null}}

 /* ------------------------------------ 1b. THE HOLE THE WRAPPER ABOVE CANNOT SEE ---- */
 /* Measured on 2026-09-23, and it was silent data loss:

      1. the technician RELOADS the app on site with no signal
      2. initCloud() (js/03:1733) probes with `supa.from('service_cases').select('id')`,
         the probe fails, and its catch does `supa=null` — the device is in Local Mode
      3. every typed writer in js/03 begins `if(!supa)return;` — cloudUpsertCase and
         cloudUpsertServiceReport therefore NEVER REACH cloudUpsert, so the wrapper above
         is never called and nothing is marked
      4. the signal comes back, syncCloud() does `cases=a.data.map(fromCaseDb)` — a
         wholesale replace — and js/71 skips the row because the cloud already has it

    Driven end to end against a stand-in for supabase-js: a field status with a note was
    recorded, and after the sync `fieldStatusLog.length` was back to 0 and the server had
    never seen it. A whole day of work, gone, with nothing on screen to say so.

    The fix is to mark at the typed writer when there is no client, which is the one moment
    the wrapper above cannot observe. Only the two functions this file already names in
    TABLES are wrapped — the tables it knows how to keep and re-upload. A top-level
    `function` declaration IS a window property, so replacing it changes what js/03's own
    bare `cloudUpsertCase(c)` calls resolve to. */
 Object.keys(TABLES).forEach(function(tableName){
  var name=TABLES[tableName].push;
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(row){
   /* With a client the write really is attempted, and the wrapper above owns the outcome. */
   if(!client())mark(tableName,row&&row.id);
   return base.apply(this,arguments);
  };
 });

 /* ------------------------------------------ 1c. and something has to try again ---- */
 /* Nothing in the project reconnected the database when the network came back: the only
    'online' listeners are js/93's error flush and the auth banner. So a device that booted
    with no signal stayed in Local Mode until somebody reloaded or pressed เชื่อม Cloud,
    and the work marked above sat there — safe, because the mark is in localStorage, but
    not going anywhere and with nothing to tell the technician.

    Only a device that is actually in Local Mode is touched, so an already-connected one is
    left completely alone. initCloud() ends in syncCloud(), which this file wraps, so the
    re-upload happens as part of it. A failed attempt simply sets supa=null again. */
 var tryingBack=false;
 function reconnect(){
  if(tryingBack||client())return;
  if(typeof window.initCloud!=='function')return;
  tryingBack=true;
  Promise.resolve().then(function(){return window.initCloud()})
   .then(function(){
    if(client()){try{console.info('[imode outbox] back online — reconnected and syncing')}catch(e){}}
   })
   .catch(function(){})
   .then(function(){tryingBack=false});
 }
 /* ------------------------------ 1d. signal lost WHILE the app was open (2026-09-28) --- */
 /* The case above covers a device that booted with no signal. The common one is a phone that
    loses signal mid-job: `supa` still exists, the writes fail (js/24 now returns at once when
    the device knows it is offline, and gives up after 15 s on a weak signal), the rows are
    marked — and nothing tried again until the next full sync, i.e. a reload. "แอบส่งแบบ
    เงียบๆ": when the network is back, when the app is looked at again, and every 45 s while
    anything is owed, the owed rows are re-sent through their own typed writer, silently. Each
    clears its own mark through the wrapper above when it lands. A row deleted meanwhile, or in
    the bin, is not re-sent. */
 var flushing=false;
 function flush(){
  if(flushing||!client()||navigator.onLine===false)return;
  var p=readPend(),jobs=[];
  Object.keys(TABLES).forEach(function(tableName){
   var t=TABLES[tableName],ids=Array.isArray(p[t.key])?p[t.key]:[],list=t.get();
   if(!ids.length||!list)return;
   ids.forEach(function(id){
    /* Only a row that is no longer on this device (deleted, or moved to the bin) is dropped.
       NOT imodeSyncWasDeleted(): that answers "has the cloud ever had it", which is true of
       every existing case — using it here dropped an offline edit to a case instead of
       sending it (caught by the test before it shipped). */
    var row=list.filter(function(r){return r&&r.id===id})[0];
    if(!row){clear(tableName,id);return}
    /* a slow write of this row is still on its way (js/24): do not send it twice */
    try{if(typeof window.imodeUpsertInflight==='function'&&window.imodeUpsertInflight(tableName,id))return}catch(e){}
    jobs.push({fn:window[t.push],row:row});
   });
  });
  if(!jobs.length)return;
  flushing=true;
  jobs.reduce(function(chain,j){
   return chain.then(function(){return typeof j.fn==='function'?j.fn(j.row):null}).catch(function(){});
  },Promise.resolve()).then(function(){
   flushing=false;
   try{console.info('[imode outbox] sent '+jobs.length+' record(s) kept while offline')}catch(e){}
  });
 }
 /* js/24 lets a slow write run on in the background; when it finally lands, it is no longer owed. */
 window.addEventListener('imode-upsert-landed',function(e){
  try{var d=e.detail||{};clear(d.table,d.id)}catch(x){}
 });
 function owed(){var p=readPend();return Object.keys(p).some(function(k){return Array.isArray(p[k])&&p[k].length})}
 function backOnline(){if(client())flush();else reconnect()}
 window.addEventListener('online',function(){setTimeout(backOnline,1200)});
 document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible'&&navigator.onLine!==false)setTimeout(backOnline,600);
 });
 setInterval(function(){if(owed())backOnline()},45000);
 window.imodeReconnectCloud=reconnect;
 window.imodeFlushOutbox=flush;

 /* ------------------------------------------------ 2. hold it through the sync --- */
 function stamp(r){
  var v=(r&&(r.updatedAt||r.createdAt))||'';
  var t=Date.parse(v);
  return isNaN(t)?0:t;
 }
 function snapshot(){
  var p=readPend(),out={};
  Object.keys(TABLES).forEach(function(tableName){
   var t=TABLES[tableName],ids=Array.isArray(p[t.key])?p[t.key]:[];
   if(!ids.length)return;
   var list=t.get();
   if(!list)return;
   var rows=list.filter(function(r){return r&&ids.indexOf(r.id)>=0});
   if(rows.length)out[tableName]=rows;
  });
  return out;
 }
 function restore(before){
  var repush=[],dropped=0,changed=false;
  Object.keys(before).forEach(function(tableName){
   var t=TABLES[tableName],mine=before[tableName],now=t.get();
   if(!now)return;
   var index={};
   now.forEach(function(r,i){if(r&&r.id)index[r.id]=i});
   var next=now.slice(),touched=false;
   mine.forEach(function(row){
    var at=index[row.id];
    if(at===undefined){                       /* the server never had it: put it back */
     /* 2026-09-25 — unless the server DID have it and it was deleted since (or it is in the bin):
        then the delete wins and the pending mark goes, instead of the record coming back. */
     var gone=false;
     try{gone=typeof window.imodeSyncWasDeleted==='function'&&window.imodeSyncWasDeleted(tableName,row.id)}catch(e){gone=false}
     if(gone){dropped++;clear(tableName,row.id);return}
     next.unshift(row);touched=true;repush.push({t:t,row:row});return;
    }
    /* 2026-09-23 — THE TEST IS "IS THEIRS NEWER", NOT "IS OURS NEWER". Those are not
       opposites, because the third case is that the array was never replaced at all and
       next[at] IS our own row, at exactly our own timestamp.

       That happens more often than it sounds. syncCloud() only assigns when the fetch
       came back with rows — `if(!k.error&&k.data.length)` — so a table the server has
       nothing in yet is left alone, and a Promise.all that rejects on a flaky connection
       leaves EVERY array alone while this still runs (the wrapper below uses
       .then(done,done)). Written the other way round, equal timestamps fell through to
       the drop branch and the pending mark was cleared WITHOUT the record ever being
       sent. Measured: an inspection sheet filed with no signal stayed on the device for
       ever, because service_reports was empty on the server and so was never replaced.

       So only a strictly newer copy from somewhere else wins. Equal means either our own
       untouched row or the server echoing back what we wrote, and re-sending is an
       idempotent upsert in both cases — a wasted request is not a lost day of work. */
    if(stamp(next[at])>stamp(row)){
     /* Somebody else has edited it since, and later than we did. Their copy stands. */
     dropped++;clear(tableName,row.id);return;
    }
    if(next[at]!==row){next[at]=row;touched=true}
    repush.push({t:t,row:row});
   });
   if(touched){t.set(next);changed=true}
  });
  if(dropped){
   try{console.warn('[imode outbox] '+dropped+' offline edit(s) dropped — the server copy is '
    +'newer, so another device edited the same record after this one did')}catch(e){}
  }
  if(changed){
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
  }
  if(repush.length){
   /* Outside the `changed` guard: a record can need re-uploading without the arrays having
      moved at all, which is exactly the case the note above describes. */
   try{console.warn('[imode outbox] re-uploading '+repush.length+' record(s) edited offline')}
   catch(e){}
  }
  /* After the arrays are repaired, so a failed upload cannot leave the screen and storage
     disagreeing. Each clears its own pending mark through the wrapper above when it lands. */
  repush.forEach(function(job){
   try{
    var fn=window[job.t.push];
    if(typeof fn==='function')fn(job.row);
   }catch(e){}
  });
 }

 var baseSync=window.syncCloud;
 window.syncCloud=function(){
  var before=snapshot();
  var r=baseSync.apply(this,arguments);
  var done=function(){try{restore(before)}catch(e){}};
  if(r&&typeof r.then==='function')r.then(done,done);
  else done();
  return r;
 };

 /* What this device still owes the server, for the console. */
 window.imodeOutbox=function(){
  var p=readPend(),out={};
  Object.keys(TABLES).forEach(function(n){
   var k=TABLES[n].key;
   out[k]=(Array.isArray(p[k])?p[k]:[]).length;
  });
  return out;
 };

 /* Repair machines that exist only in this browser. Read cloud ids first: an older local
    copy must never overwrite a machine already maintained by another staff member. */
 var repairButton=document.getElementById('syncLocalMachinesBtn'),repairBusy=false;
 if(repairButton&&window.IMODE_ENV&&window.IMODE_ENV.production&&!window.imodeCustomerMode){
  repairButton.hidden=false;
  window.imodeSyncLocalMachines=async function(){
   if(repairBusy)return;
   var db=client(),rows=Array.isArray(machines)?machines.slice():[];
   if(!db||!rows.length){toastMsg(db?'ไม่มีเครื่องในเบราว์เซอร์นี้':'ยังไม่เชื่อม Cloud');return}
   repairBusy=true;repairButton.disabled=true;
   var popup=window.imodeUploadProgressPopup;
   if(popup){popup.open([],'กำลังตรวจสอบเครื่องใน Cloud…');popup.setPct(5)}
   try{
    var auth=await db.auth.getUser();
    if(auth.error||!auth.data||!auth.data.user)throw new Error('กรุณาเข้าสู่ระบบใหม่');
    var ids=rows.map(function(m){return m&&m.id}).filter(Boolean),remote=Object.create(null);
    for(var i=0;i<ids.length;i+=100){
     var found=await db.from('machines').select('id,qrToken').in('id',ids.slice(i,i+100));
     if(found.error)throw found.error;
     (found.data||[]).forEach(function(m){remote[m.id]=m});
    }
    var missing=rows.filter(function(m){return m&&m.id&&!remote[m.id]});
    var deleted=missing.filter(function(m){return window.imodeSyncWasDeleted&&window.imodeSyncWasDeleted('machines',m.id)});
    missing=missing.filter(function(m){return deleted.indexOf(m)<0});
    var different=rows.filter(function(m){return m&&remote[m.id]&&m.qrToken&&remote[m.id].qrToken!==m.qrToken}).length;
    var done=0,failed=[];
    for(var j=0;j<missing.length;j++){
     var m=missing[j];
     if(popup){popup.phase('กำลังส่งเครื่อง '+(j+1)+'/'+missing.length+' ขึ้น Cloud…',true);popup.setPct(10+Math.round(80*j/Math.max(1,missing.length)))}
     try{
      if(!m.qrToken){m.qrToken=window.imodeNewQrToken();saveLocal()}
      var sent=await window.cloudUpsert('machines',m);
      if(!sent||!sent.ok||sent.offline)throw sent&&sent.error||new Error('Cloud ไม่รับข้อมูล');
      var checked=await db.rpc('portal_open',{p_token:m.qrToken});
      if(checked.error||!checked.data||!checked.data.ok)throw checked.error||new Error('QR ยังเปิดจากเครื่องอื่นไม่ได้');
      done++;
     }catch(e){failed.push((m.serial||m.name||m.id)+': '+(e.message||String(e)))}
    }
    var msg='ขึ้น Cloud และตรวจ QR แล้ว '+done+' เครื่อง';
    if(failed.length)msg+=' · ไม่สำเร็จ '+failed.length+' เครื่อง: '+failed.slice(0,2).join('; ');
    if(different)msg+=' · QR ในเครื่องนี้ไม่ตรง Cloud '+different+' เครื่อง (ยังไม่เปลี่ยน QR เดิม)';
    if(deleted.length)msg+=' · ข้ามเครื่องที่เคยถูกลบจาก Cloud '+deleted.length+' เครื่อง';
    if(popup)popup.finish({bad:!!failed.length||!!different||!!deleted.length,title:failed.length?'ซิงก์เครื่องไม่ครบ':'ตรวจสอบเครื่องเรียบร้อย',msg:msg,holdMs:6000});
    else toastMsg(msg);
    if(failed.length)console.warn('[machine repair] failed:',failed);
   }catch(e){
    var message='ตรวจสอบ Cloud ไม่สำเร็จ: '+(e.message||String(e));
    if(popup)popup.finish({bad:true,title:'ยังไม่ได้ซิงก์เครื่อง',msg:message});else toastMsg(message);
   }finally{repairBusy=false;repairButton.disabled=false}
  };
 }
})();
