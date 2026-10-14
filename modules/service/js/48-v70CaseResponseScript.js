/* Beta 1.0 — "ตอบกลับแล้ว": a way to stop the response clock.

   REPORTED: a new case counts down and then counts up past เกินกำหนด for ever, and there
   is no button anywhere to deal with it.

   That is exactly what js/26 built: onClock() is true while a case is open, unassigned and
   still at เคสใหม่, so the only two ways off the clock were to assign the case or to move
   its status. Neither is what actually happens first. The coordinator rings the customer
   back inside the thirty minutes and the case stays unassigned for hours afterwards while
   a technician and a date are found — so the clock was measuring the wrong thing from the
   moment somebody answered.

   This adds the missing step rather than changing the rule: an explicit ตอบกลับแล้ว that
   stamps c.respondedAt (and who), stops the clock, and leaves a green chip saying when the
   customer was answered. The case is still unassigned, still เคสใหม่, still on มอบหมายงาน;
   only the clock is settled. js/26 keeps ownership of the clock itself — its onClock()
   gained one condition and nothing else.

   THE WIRE. cloudUpsertCase() sends an explicit column whitelist, so an unknown field is
   dropped silently, and service_cases has no column for this.
   supabase/07-v70-case-response.sql adds `responded_at timestamptz`. Until somebody runs
   it the stamp stays on the device that made it — the same degradation js/42 uses for the
   media column, and for the same reason: sending a column that does not exist would fail
   the whole case upsert, so the column is probed once per session and the case is sent
   exactly as before when it is missing. Nothing about case sync changes if the SQL is
   never run.

   Loads after js/42, so its cloudUpsertCase wrapper sits outside js/42's, which sits
   outside js/38's; each adds its own field to a copy and hands the copy on. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 function tl(th,en){return (settings.language==='en')?en:th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function caseById(id){return caseList().filter(function(c){return c.id===id})[0]||null}
 function can(k){try{return typeof canPermission==='function'?canPermission(k):true}catch(e){return true}}
 function hhmm(iso){
  var d=new Date(iso);
  if(isNaN(d.getTime()))return '';
  var p=function(n){return (n<10?'0':'')+n};
  return p(d.getDate())+'/'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes());
 }

 /* --------------------------------------------- the device-local mirror ----- */
 /* Two things make a plain field on the case not enough.

    syncCloud() does `cases = a.data.map(fromCaseDb)` — it replaces the array WHOLESALE —
    so until supabase/07-v70-case-response.sql has been run, a stamp made on this device is
    wiped by the next sync, which is worse than not travelling.

    And service-case-detail.html is a separate document that reads and never writes. It
    cannot reach `cases`, `supa` or saveLocal(); handing the visitor back to the
    application does not work either, because js/46 now requires a password on every load,
    so the intent is spent at the login door and lost.

    One small key answers both: the responses recorded on this device. The page writes an
    entry, the application applies it to the case, and it is re-applied after every sync
    that did not carry it. It holds an ISO date and a name per case id — no business data,
    and deleting it only forgets which clocks were stopped here. */
 var MIRROR='imode_v70_case_responded';
 function mirror(){
  try{var o=JSON.parse(localStorage.getItem(MIRROR)||'{}');return (o&&typeof o==='object')?o:{}}
  catch(e){return {}}
 }
 function rememberResponse(id,at,by){
  try{var o=mirror();o[id]={at:at,by:by||''};localStorage.setItem(MIRROR,JSON.stringify(o))}catch(e){}
 }
 /* Applies the mirror to whatever `cases` currently holds. Pushes only what it really
    changed, and only when the column exists — without it the push would drop the field and
    every sync would upsert every stamped case again for nothing. */
 function applyMirror(){
  var o=mirror(),ids=Object.keys(o),changed=[];
  if(!ids.length)return false;
  ids.forEach(function(id){
   var c=caseById(id);
   if(!c||c.respondedAt)return;
   c.respondedAt=o[id].at;
   if(o[id].by)c.respondedBy=o[id].by;
   changed.push(c);
  });
  if(!changed.length)return false;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  columnReady().then(function(ok){
   if(!ok||typeof cloudUpsertCase!=='function')return;
   changed.forEach(function(c){try{cloudUpsertCase(c)}catch(e){}});
  });
  return true;
 }
 window.imodeApplyCaseResponses=applyMirror;

 /* ---------------------------------------------------------- the action ----- */
 window.imodeMarkResponded=function(id){
  var c=caseById(id);
  if(!c){if(typeof toastMsg==='function')toastMsg(tl('ไม่พบเคส','Case not found'));return}
  if(!can('case.assign')){
   if(typeof requirePermission==='function')requirePermission('case.assign');
   return;
  }
  if(c.respondedAt){if(typeof toastMsg==='function')toastMsg(tl('บันทึกการตอบกลับไว้แล้ว','Already recorded'));return}
  c.respondedAt=new Date().toISOString();
  try{c.respondedBy=(currentUser&&(currentUser.name||currentUser.username))||''}catch(e){c.respondedBy=''}
  c.updatedAt=c.respondedAt;
  rememberResponse(c.id,c.respondedAt,c.respondedBy);
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  try{if(typeof window.imodeDecorateSla==='function')window.imodeDecorateSla()}catch(e){}
  if(typeof toastMsg==='function')toastMsg(tl('บันทึกว่าตอบกลับลูกค้าแล้ว','Response recorded'));
 };

 /* ------------------------------------------------- the button and the chip ----- */
 /* js/26 creates the countdown chip in its decorate() and never rebuilds it afterwards —
    its 1s tick only rewrites the number and two class names — so a button appended here
    survives until the chip itself is removed, which is precisely when the clock stops. */
 function buttonHTML(id){
  return '<button type="button" class="case-sla-done" data-sla-done="'+esc2(id)+'"'
   +' onclick="event.stopPropagation();imodeMarkResponded('+imodeJsArg(id)+')">'
   +esc2(tl('ตอบกลับแล้ว','Responded'))+'</button>';
 }
 function doneChipHTML(c){
  return '<span class="case-responded-chip" data-case-responded="'+esc2(c.id)+'">✓ '
   +esc2(tl('ตอบกลับแล้ว','Responded'))+' '+esc2(hhmm(c.respondedAt))+'</span>';
 }
 function decorate(){
  if(can('case.assign')){
   document.querySelectorAll('.case-sla-chip[data-case-sla]').forEach(function(chip){
    if(chip.querySelector('[data-sla-done]'))return;
    chip.insertAdjacentHTML('beforeend',buttonHTML(chip.getAttribute('data-case-sla')));
   });
  }else{
   /* imodeQuickSwitch changes who is signed in without reloading the document, and an open
      popup is not redrawn at all, so a button the new account may not use has to be taken
      away rather than merely not added. */
   document.querySelectorAll('[data-sla-done]').forEach(function(b){b.remove()});
  }
  document.querySelectorAll('#caseTable tr[data-case-id],#caseCards [data-case-id],#page-assign .work-row[data-case]')
   .forEach(function(row){
    var c=caseById(row.getAttribute('data-case-id')||row.getAttribute('data-case'));
    var old=row.querySelector('[data-case-responded]');
    if(!c||!c.respondedAt||c.assignee){if(old)old.remove();return}
    if(old)return;
    var slot=row.matches('tr')?row.querySelector('td:first-child')
           :(row.querySelector('.work-row-main')||row.querySelector('.card-top')||row);
    if(slot)slot.insertAdjacentHTML('beforeend',doneChipHTML(c));
   });
 }
 /* js/26's renderAll / renderCases wrappers call its CLOSURE decorate(), not the exported
    window.imodeDecorateSla, so wrapping the exported name alone never fires on the real
    path — the same trap renderMyWork set in part 18. Wrap the render functions instead
    (this file loads later, so js/26's chip already exists by the time these run), keep the
    exported name wrapped for explicit callers, and back both with js/26's own 1s cadence
    so a chip created by any path picks the button up within a tick. */
 var baseDecorate=window.imodeDecorateSla;
 if(typeof baseDecorate==='function'){
  window.imodeDecorateSla=function(){
   var r=baseDecorate.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }
 ['renderAll','renderCases','goPage'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var r=base.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 });
 setInterval(function(){try{decorate()}catch(e){}},1000);

 /* The case popup is the other place the clock is looked at. openCaseDetail() re-runs for
    every tab, so the button is keyed by id and simply not added twice. */
 var baseOpen=window.openCaseDetail;
 if(typeof baseOpen==='function'){
  window.openCaseDetail=function(cid){
   var r=baseOpen.apply(this,arguments);
   try{
    var c=caseById(cid);
    if(!c||c.assignee||['เสร็จสิ้น','ปิดเคส'].indexOf(c.status)>=0)return r;
    var row=document.querySelector('#modal .button-row');
    if(!row||row.querySelector('[data-sla-done],[data-case-responded]'))return r;
    if(c.respondedAt)row.insertAdjacentHTML('afterbegin',doneChipHTML(c));
    else if(c.status==='เคสใหม่'&&can('case.assign'))row.insertAdjacentHTML('afterbegin',
     '<button type="button" class="soft-btn" data-sla-done="'+esc2(c.id)+'"'
     +' onclick="imodeMarkResponded('+imodeJsArg(c.id)+')">⏱ '
     +esc2(tl('ตอบกลับแล้ว','Responded'))+'</button>');
   }catch(e){}
   return r;
  };
 }

 /* ---------------------------------------------------------------- the wire ----- */
 /* One probe, cached for the session. `supa` is a top-level let in js/03 — a lexical
    global, absent from window — so it is read by bare identifier. */
 var probe=null;
 function columnReady(){
  if(probe)return probe;
  probe=new Promise(function(resolve){
   var db=null;
   try{db=supa}catch(e){db=null}
   if(!db){resolve(false);return}
   db.from('service_cases').select('responded_at').limit(1).then(function(res){
    var ok=!(res&&res.error);
    if(!ok)console.warn('[imode] service_cases.responded_at is missing - the responded stamp '
     +'will not sync between devices. Run supabase/07-v70-case-response.sql once to enable it.');
    resolve(ok);
   },function(){resolve(false)});
  });
  return probe;
 }
 window.imodeRespondedColumnReady=columnReady;

 var baseUpsert=window.cloudUpsertCase;
 if(typeof baseUpsert==='function'){
  window.cloudUpsertCase=function(c){
   var self=this,args=arguments;
   if(!c||!c.respondedAt)return baseUpsert.apply(self,args);
   return columnReady().then(function(ok){
    if(!ok)return baseUpsert.apply(self,args);
    var wire={},k;
    for(k in c)if(Object.prototype.hasOwnProperty.call(c,k))wire[k]=c[k];
    wire.responded_at=c.respondedAt;
    return baseUpsert.call(self,wire);
   });
  };
 }
 /* A sync replaces `cases` wholesale. Put this device's stamps back on before anything
    redraws, or a clock that was stopped here starts counting again. */
 var baseSyncCloud=window.syncCloud;
 if(typeof baseSyncCloud==='function'){
  window.syncCloud=function(){
   var r=baseSyncCloud.apply(this,arguments);
   var done=function(){
    try{
     if(applyMirror()&&typeof renderAll==='function')renderAll();
     decorate();
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }

 var baseFrom=window.fromCaseDb;
 if(typeof baseFrom==='function'){
  window.fromCaseDb=function(row){
   var c=baseFrom.apply(this,arguments);
   try{if(row&&row.responded_at)c.respondedAt=row.responded_at}catch(e){}
   return c;
  };
 }

 var style=document.createElement('style');
 style.id='v70CaseResponseStyle';
 style.textContent=''
 +'.case-sla-done{margin-left:2px;padding:2px 9px;border-radius:999px;border:1px solid #0b63e5;'
 +'background:#0b63e5;color:#fff;font:700 10.5px/1.6 inherit;cursor:pointer;white-space:nowrap}'
 +'.case-sla-done:hover{background:#0a54c4;border-color:#0a54c4}'
 +'.case-sla-chip.is-warn .case-sla-done,.case-sla-chip.is-over .case-sla-done'
 +'{background:#c62828;border-color:#c62828}'
 +'.case-responded-chip{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:3px 9px;'
 +'border-radius:999px;background:#e9f8ef;border:1px solid #b6e6c9;color:#0a6b3d;'
 +'font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap}';
 document.head.appendChild(style);

 function install(){
  /* js/03 has read `cases` from localStorage by now, so the mirror has something to apply
     to. A stamp made on service-case-detail.html reaches the case here, on the next load
     of the application, and is pushed from here as well. */
  try{if(applyMirror()&&typeof renderAll==='function')renderAll()}catch(e){}
  try{decorate()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
