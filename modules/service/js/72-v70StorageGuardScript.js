/* Beta 1.0 — localStorage runs out, and saveLocal() takes the caller down with it.

   REPORTED (item 1, with a screenshot of the sign-in popup):
     "Failed to execute 'setItem' on 'Storage': Setting the value of
      'imode_test_v532_line_requests' exceeded the quota."

   Reproduced against the live project, and it is not cosmetic. saveLocal() — the copy in
   js/04, which overrides js/03's and writes SIXTEEN keys in a row with no try/catch — throws
   out of whatever called it:

     * signing in:   setSessionUser() -> applySession() -> the error lands in the login popup
                     and the session is never completed. That is the screenshot.
     * every page:   ensureMasters() saves on every renderAll(), so goPage() threw half way
                     through and the page it was building was left empty. That is REPORTED
                     ITEM 5 — the ตั้งค่า -> "หน้าลูกค้า · สแกน QR" button landing on a blank
                     page. The same bug, not a second one; measured, not assumed.
     * silently:     the throw lands on the 11th of 16 setItem calls, so serviceReports,
                     qcRecords, pettyCash, spareParts and purchaseOrders were simply never
                     written after that point.

   WHAT IS ACTUALLY FULL, measured on a synced device (Chrome allows about 5 MB):

     imode_test_v532_cases          3,580,444   of which 3,546,857 is `media`
     imode_test_v532_line_requests  1,711,385   of which 1,699,682 is `media`
     everything else together         ~234,000

   So 97% of it is the photos and clips customers attach to แจ้งปัญหา. Since part 18 those
   travel to Supabase (`service_cases.media`, `line_customer_requests.media`), so the copy in
   localStorage is a cache of something the server already holds.

   WHAT THIS FILE DOES

     1. saveLocal() never throws again. A quota failure is caught, weight is shed, and the
        save is retried. If even that cannot fit, it reports and returns — the in-memory data
        is still correct and the cloud push is a separate path, so a full device must not be
        allowed to break sign-in, navigation, or anything else.

     2. Weight is shed by writing the two heavy arrays to storage with their `media` replaced
        by a stub that keeps the file's name, type and size but drops the data URL. THE
        IN-MEMORY ARRAYS ARE NOT TOUCHED. That matters: js/42 injects `media` into the
        outgoing payload from the case object, so mutating it would upload stubs over good
        cloud rows, and js/71 re-uploads rows the cloud has not acknowledged. Only the bytes
        on their way to localStorage are lighter. The swap is made around the base call and
        undone in a `finally` — JavaScript is single threaded and the base is synchronous, so
        nothing else can observe it. Same technique as js/63's checklistTemplate swap.

     3. A row the cloud has NOT acknowledged keeps its media whatever happens. Those are the
        rows whose photos exist nowhere else yet; js/71 knows which they are from
        `imode_v70_cloud_seen`, and that list is read here rather than duplicated.

     4. Newest first, up to a byte budget; everything else stubbed. A technician looking at
        today's job still sees the photos offline; a case from three weeks ago re-fetches
        them on the next sync.

   Shed mode, once entered, is remembered in `imode_v70_storage_shed` so the next page load
   starts light instead of throwing once more before learning the same thing. Clearing that
   key only costs one caught exception.

   Nothing is deleted and no storage key is renamed. Remove this file and the old behaviour —
   including the crash — returns exactly. */
(function(){
 'use strict';

 var SHED_KEY='imode_v70_storage_shed';
 var SEEN_KEY='imode_v70_cloud_seen';           /* written by js/71 */
 /* How many bytes of attachments are worth keeping on this device. The two heavy tables
    share it, newest first. Small enough that the other fourteen keys always fit. */
 var MEDIA_BUDGET=900000;
 /* Attachments newer than this are kept on the device whatever else goes, so a technician
    looking at today's job still has the customer's photos with no network. */
 var FRESH_MS=8*60*60*1000;
 var shed=false;
 var announced=false;
 var lastShed={cases:0,requests:0};

 try{shed=localStorage.getItem(SHED_KEY)==='1'}catch(e){}

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 function isQuota(e){
  if(!e)return false;
  if(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED')return true;
  if(e.code===22||e.code===1014)return true;
  return /quota|exceeded the quota|storage is full/i.test(String(e.message||e));
 }

 /* WHICH ROWS THE SERVER ALREADY HAS. Two signals, because neither is enough on its own.

    (a) js/71's `imode_v70_cloud_seen`. Authoritative when it is populated — but its
        reconcile() returns early for a table whose pre-sync array was empty, so on a device
        that has never held data (a fresh install, a cleared browser — and every first run,
        which is exactly when the attachments arrive in bulk) the list for `cases` is never
        written at all. Relying on it alone left every row looking unacknowledged and shed
        nothing; measured.

    (b) what came down in a sync during THIS page view. syncCloud() replaces `cases` and
        `lineRequests` wholesale from the cloud, so every id present once it has finished came
        from the server — and so did its media, because js/42 puts the column on the same
        upsert. The one exception is a row js/71 rescued, and js/71 re-uploads those
        immediately, so they become true within moments.

    A row in neither is treated as the only copy of its photos and is never stubbed. */
 var cloudIds={cases:Object.create(null),lineRequests:Object.create(null)};
 function seenSet(table){
  var out=Object.create(null);
  try{
   var raw=JSON.parse(localStorage.getItem(SEEN_KEY)||'{}')||{};
   var ids=raw&&raw[table];
   if(ids&&!Array.isArray(ids)&&ids.ids)ids=ids.ids;   /* tolerate either shape */
   if(Array.isArray(ids))for(var i=0;i<ids.length;i++)out[ids[i]]=1;
  }catch(e){}
  var live=cloudIds[table];
  if(live)for(var k in live)out[k]=1;
  return out;
 }
 function noteSynced(){
  try{
   if(Array.isArray(cases))cases.forEach(function(c){if(c&&c.id)cloudIds.cases[c.id]=1});
  }catch(e){}
  try{
   if(Array.isArray(lineRequests))lineRequests.forEach(function(r){if(r&&r.id)cloudIds.lineRequests[r.id]=1});
  }catch(e){}
 }
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   try{
    if(r&&typeof r.then==='function')r.then(noteSynced,function(){});
    else noteSynced();
   }catch(e){}
   return r;
  };
 }

 function mediaBytes(row){
  try{
   var m=row&&row.media;
   if(!Array.isArray(m)||!m.length)return 0;
   var n=0;
   for(var i=0;i<m.length;i++)n+=String((m[i]&&m[i].data)||'').length;
   return n;
  }catch(e){return 0}
 }
 /* The stub keeps everything the UI needs in order to say what the file is. js/42's tile
    renderer already draws a document glyph for an item with no `data`, and its lightbox
    returns early on one, so a stubbed row degrades rather than showing a broken image. */
 function stub(m){
  return (Array.isArray(m)?m:[]).map(function(x){
   return {name:(x&&x.name)||'',type:(x&&x.type)||'',size:(x&&x.size)||0,offloaded:true};
  });
 }
 function when(r){
  var v=r&&(r.updatedAt||r.createdAt||r.at||'');
  var t=v?new Date(v).getTime():0;
  return isNaN(t)?0:t;
 }

 /* A shallow clone of the array in which some rows carry a stubbed media list. Rows without
    attachments are passed through untouched, so the common case allocates almost nothing.
    `protectFresh` keeps today's work offline-readable; the escalation ladder below drops that
    protection before it ever drops an unacknowledged row. */
 function lighten(list,table,budget,protectFresh){
  if(!Array.isArray(list))return {list:list,left:budget,dropped:0};
  var seen=seenSet(table),dropped=0,left=budget,cut=Date.now()-FRESH_MS;
  var order=list.map(function(r,i){return {i:i,t:when(r),b:mediaBytes(r)}})
                .filter(function(x){return x.b>0})
                .sort(function(a,b){return b.t-a.t});
  var keep={};
  for(var k=0;k<order.length;k++){
   var row=list[order[k].i];
   var mustKeep=!seen[row&&row.id]                     /* the cloud has never confirmed it */
              ||(protectFresh&&order[k].t>=cut);       /* today's job, worth having offline */
   if(mustKeep||order[k].b<=left){
    keep[order[k].i]=1;
    if(!mustKeep)left-=order[k].b;
   }
  }
  if(!order.length)return {list:list,left:left,dropped:0};
  var out=list.map(function(r,i){
   if(!r||keep[i]||!mediaBytes(r))return r;
   dropped++;
   var c={};
   for(var p in r)if(Object.prototype.hasOwnProperty.call(r,p))c[p]=r[p];
   c.media=stub(r.media);
   return c;
  });
  return {list:out,left:left,dropped:dropped};
 }

 /* Run `fn` with the two heavy arrays temporarily replaced by lighter copies.
    `cases` and `lineRequests` are top-level `let` in js/03 — lexical globals, absent from
    window — so they are read and assigned by bare identifier. Assigning to an existing
    lexical binding from another classic script is legal; creating one would not be. */
 function withLight(fn,ctx,args,budget,protectFresh){
  var keepCases=null,keepReqs=null,swapped=false,info={cases:0,requests:0};
  try{
   var a=lighten(cases,'cases',budget,protectFresh);
   var b=lighten(lineRequests,'lineRequests',a.left,protectFresh);
   info.cases=a.dropped;info.requests=b.dropped;
   keepCases=cases;keepReqs=lineRequests;
   cases=a.list;lineRequests=b.list;
   swapped=true;
  }catch(e){}
  try{return fn.apply(ctx,args)}
  finally{
   if(swapped){try{cases=keepCases;lineRequests=keepReqs}catch(e){}}
   lastShed=info;
  }
 }

 function remember(){
  shed=true;
  try{localStorage.setItem(SHED_KEY,'1')}catch(e){}
 }
 function announceOnce(){
  if(announced)return;
  announced=true;
  toast(tl('พื้นที่เก็บข้อมูลในเครื่องเต็ม — เก็บเฉพาะไฟล์แนบล่าสุดไว้ในเครื่อง ไฟล์เก่ายังอยู่บนคลาวด์',
           'Device storage is full — only recent attachments are kept here; older files stay in the cloud'));
 }

 var base=window.saveLocal;
 if(typeof base!=='function')return;

 /* Each rung gives up a little more, and the last one gives up only what it must.
    [budget, protectFresh] — an unacknowledged row survives every rung. */
 var LADDER=[[MEDIA_BUDGET,true],[MEDIA_BUDGET,false],[200000,false],[0,false]];

 window.saveLocal=function(){
  if(shed)return laddered(this,arguments,false);
  try{return base.apply(this,arguments)}
  catch(e){
   if(!isQuota(e))throw e;                      /* a real bug must still be visible */
   remember();announceOnce();
   return laddered(this,arguments,true);
  }
 };

 function laddered(ctx,args,already){
  var last=null;
  for(var i=0;i<LADDER.length;i++){
   try{return withLight(base,ctx,args,LADDER[i][0],LADDER[i][1])}
   catch(e){
    if(!isQuota(e))throw e;
    last=e;
   }
  }
  /* Nothing left to give: what remains is the unacknowledged rows, which are the only copy of
     those photos, so they are kept and the save simply does not persist. The arrays in memory
     are untouched and the cloud push does not go through here, so the session carries on. */
  try{console.error('[imode] localStorage is full; this save did not persist',last)}catch(x){}
  if(already)announceOnce();
  toast(tl('บันทึกลงเครื่องไม่สำเร็จ (พื้นที่เต็ม) ข้อมูลยังถูกส่งขึ้นคลาวด์ตามปกติ',
           'Could not save to this device (storage full). Data is still sent to the cloud.'));
  return undefined;
 }

 /* What actually happened, for anyone looking. Not used by the application. */
 window.imodeStorageReport=function(){
  var rows=[],total=0;
  try{
   for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i),n=k.length+(localStorage.getItem(k)||'').length;
    total+=n;rows.push({key:k,bytes:n});
   }
  }catch(e){}
  rows.sort(function(a,b){return b.bytes-a.bytes});
  return {shedMode:shed,totalBytes:total,lastShed:lastShed,keys:rows.slice(0,10)};
 };
 /* Undo shed mode by hand — e.g. after the device has been cleared out. */
 window.imodeStorageResetShed=function(){
  shed=false;announced=false;
  try{localStorage.removeItem(SHED_KEY)}catch(e){}
  return true;
 };
})();
