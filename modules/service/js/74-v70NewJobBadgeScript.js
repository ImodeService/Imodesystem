/* Beta 1.0 — a job the technician has not looked at yet says so, once.

   REPORTED (item 3):
     "ผมอยากให้เวลามีมอบหมายงานให้ช่างแล้วช่างกดดูที่งานของฉันอะ อยากให้มีไฮไลท์หน่อยว่าเป็นงานใหม่
      และพอกดดูไฮไลท์นั้นก็จะหายไป"

   งานของฉัน draws every assigned case the same way, so a job handed over five minutes ago sits
   among nine the technician has been working all week and looks exactly like them. The
   notification says a job arrived; the list does not say WHICH.

   WHAT COUNTS AS NEW, and why it is not a field on the case:

     A case does not record who has looked at it, and adding that to `service_cases` would need
     a column (cloudUpsertCase() writes an explicit whitelist — a field added to the object is
     dropped silently, which is how the customers' photos were lost in part 18) and would then
     mean "somebody, somewhere has seen it". What is wanted is per-person and per-device: has
     THIS technician opened THIS job yet. That is a note about a person's own reading, so it
     lives on the device, in `imode_v70_seen_jobs` — `{accountKey: {caseId: ts}}`.

     Losing that key only marks a few jobs new again for one person. No business data is in it.

   HOW THE HIGHLIGHT CLEARS. Opening the job is the signal, not merely scrolling past it, so it
   is cleared by imodeOpenFieldJob() — which is what a งานของฉัน row, the case page's
   เริ่มหน้างาน button and หน้างานทั้งหมด all call — and by imodeOpenAssignedCase(), the
   รายละเอียด path. The row is re-drawn immediately so the chip goes at the moment of the tap
   rather than at the next render.

   FIRST RUN is the trap this had to avoid. With an empty record every job a technician already
   holds would light up as new on the day this ships, which is the opposite of useful. The first
   time an account is seen, everything currently assigned to it is marked as already read, and
   only what arrives afterwards is new.

   renderMyWork is reached three ways and only one of them goes through window (js/16's own
   goPage wrapper calls its closure), so the rows are decorated from a MutationObserver on the
   list element — disconnected around our own writes, so our edits are never recorded rather
   than recorded and filtered, which is what span a nav observer into an infinite loop in
   part 17 §11. */
(function(){
 'use strict';

 var KEY='imode_v70_seen_jobs';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function acctKey(){
  try{return String((currentUser&&(currentUser.username||currentUser.id))||'')}
  catch(e){return ''}
 }
 function onCase(c,tid){
  if(!tid)return false;
  if(typeof window.imodeIsAssignedTo==='function')return window.imodeIsAssignedTo(c,tid);
  return c.assignee===tid;
 }
 function isClosed(c){
  if(typeof window.imodeCaseIsClosed==='function')return window.imodeCaseIsClosed(c);
  return ['เสร็จสิ้น','ปิดเคส'].indexOf(String((c&&c.status)||''))>=0;
 }

 function readAll(){
  try{var o=JSON.parse(localStorage.getItem(KEY)||'{}');return (o&&typeof o==='object')?o:{}}
  catch(e){return {}}
 }
 function writeAll(o){try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}

 /* Everything this account already holds counts as read the first time we see the account. */
 function mine(){
  var all=readAll(),k=acctKey();
  if(!k)return null;
  if(!all[k]){
   var first={};
   var tid=myTechId();
   if(tid)caseList().forEach(function(c){if(onCase(c,tid))first[c.id]=0});
   all[k]=first;
   writeAll(all);
  }
  return all[k];
 }
 function isNew(id){
  var m=mine();
  return !!m&&!Object.prototype.hasOwnProperty.call(m,id);
 }
 function markRead(id){
  if(!id)return false;
  var all=readAll(),k=acctKey();
  if(!k)return false;
  if(!all[k])all[k]={};
  if(Object.prototype.hasOwnProperty.call(all[k],id))return false;
  all[k][id]=Date.now();
  writeAll(all);
  return true;
 }
 window.imodeJobIsNew=isNew;
 window.imodeMarkJobRead=function(id){
  if(!markRead(id))return false;
  try{decorate()}catch(e){}
  return true;
 };
 /* Only for a technician, and only among the jobs they hold. */
 window.imodeNewJobCount=function(){
  var tid=myTechId();
  if(!tid)return 0;
  /* 2026-09-24 — take the first-visit baseline NOW, even with no jobs. It used to be taken
     lazily by the first isNew() call, which the filter below only makes once the account holds
     a job — so a technician's FIRST job was swallowed into the baseline and never showed. */
  mine();
  return caseList().filter(function(c){return onCase(c,tid)&&!isClosed(c)&&isNew(c.id)}).length;
 };

 /* ------------------------------------------------------------ the chip ---- */
 var obs=null;
 function decorate(){
  var host=document.getElementById('page-my-work');
  if(!host||!myTechId())return;
  var rows=host.querySelectorAll('.work-row[data-case]');
  if(!rows.length)return;
  if(obs)obs.disconnect();
  try{
   for(var i=0;i<rows.length;i++){
    var row=rows[i],id=row.getAttribute('data-case');
    var want=isNew(id);
    var chip=row.querySelector('.njb-chip');
    row.classList.toggle('njb-new',want);
    if(want&&!chip){
     var main=row.querySelector('.work-row-main')||row;
     var b=main.querySelector('b');
     var span=document.createElement('span');
     span.className='njb-chip';
     span.textContent=tl('งานใหม่','NEW');
     span.setAttribute('aria-label',tl('งานใหม่ที่ยังไม่ได้เปิดดู','A new job you have not opened yet'));
     if(b&&b.nextSibling)main.insertBefore(span,b.nextSibling);
     else main.insertBefore(span,main.firstChild);
    }else if(!want&&chip){
     chip.parentNode.removeChild(chip);
    }
   }
  }catch(e){}
  if(obs)watch();
 }
 function watch(){
  var host=document.getElementById('page-my-work');
  if(!host)return;
  if(!obs)obs=new MutationObserver(function(){try{decorate()}catch(e){}});
  obs.observe(host,{childList:true,subtree:true});
 }

 /* ------------------------------------------------ clearing the highlight ---- */
 /* Every way into a single job. js/73 wraps the same name for its own memory; both wrappers
    simply run, in load order, and neither needs to know about the other. */
 ['imodeOpenFieldJob','imodeOpenAssignedCase','imodeOpenCase'].forEach(function(fn){
  var base=window[fn];
  if(typeof base!=='function')return;
  window[fn]=function(id){
   try{if(typeof id==='string')markRead(id)}catch(e){}
   var r=base.apply(this,arguments);
   try{decorate()}catch(e){}
   try{paintNavCount()}catch(e){}
   return r;
  };
 });

 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(name){
   var r=baseGoPage.apply(this,arguments);
   try{if(((document.querySelector('.page.active')||{}).id||'')==='page-my-work'){watch();decorate()}}catch(e){}
   try{paintNavCount()}catch(e){}
   return r;
  };
 }
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{decorate()}catch(e){}
   try{paintNavCount()}catch(e){}
   return r;
  };
 }
 /* The badge is recomputed rather than incremented, so it can never drift from the rows. */
 function paintNavCount(){
  var n=0;
  try{n=window.imodeNewJobCount()}catch(e){n=0}
  var nodes=document.querySelectorAll('[data-page="my-work"]');
  for(var i=0;i<nodes.length;i++){
   var el=nodes[i],b=el.querySelector('.njb-navcount');
   if(!n){if(b)b.parentNode.removeChild(b);continue}
   if(!b){b=document.createElement('span');b.className='njb-navcount';
    /* Into the label, not the icon, so it does not sit on top of the glyph. */
    (el.querySelector('b')||el).appendChild(b);}
   b.textContent=n>99?'99+':String(n);
   b.setAttribute('aria-label',tl(n+' งานใหม่',n+' new jobs'));
  }
 }
 window.imodePaintNewJobCount=paintNavCount;
 function start(){try{watch();decorate();paintNavCount()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();

 var st=document.createElement('style');
 st.id='v70NewJobBadgeStyle';
 st.textContent=''
 /* 2026-09-20: bigger. Reported as not noticeable on a phone ("เวลามีงานใหม่มาที่หน้าช่าง
    ให้ไฮไลท์ด้วยว่ามีงานใหม่") — 10px uppercase on a 390px screen reads as decoration. */
 +'.njb-chip{display:inline-block;margin-left:0;font-size:11.5px;font-weight:800;letter-spacing:.4px;'
 +'color:#fff;background:linear-gradient(180deg,#ff8a3d,#f26a10);border-radius:999px;padding:3px 11px;'
 +'box-shadow:0 2px 0 #cf5a0c;text-transform:uppercase;align-self:flex-start}'
 /* The row itself, so the whole bar reads as new rather than one small chip. The ledge colour
    is the one css/21 gives a tactile row, kept so the press still lands the same way. */
 +'.work-row.njb-new{border-color:#f7b27a;background:linear-gradient(180deg,#fffaf4,#fff5ea)}'
 +'.work-row.njb-new:hover{border-color:#f26a10}'
 +'@keyframes njbPulse{0%,100%{box-shadow:0 0 0 0 rgba(242,106,16,.34)}50%{box-shadow:0 0 0 6px rgba(242,106,16,0)}}'
 +'.work-row.njb-new .njb-chip{animation:njbPulse 2.1s ease-in-out infinite}'
 +'@media (prefers-reduced-motion:reduce){.work-row.njb-new .njb-chip{animation:none}}'
 /* 2026-09-20 — THE COUNT, WHERE IT IS SEEN BEFORE THE PAGE IS OPENED.
    The row chip only exists once งานของฉัน is on screen, so a technician had to go and
    look to find out whether anything had arrived. This puts the same number on every
    งานของฉัน entry — the sidebar item and the mobile bottom bar are both [data-page] —
    the way js/49 badges คำขอจากลูกค้า. imodeNewJobCount() already existed. */
 +'.njb-navcount{display:inline-flex;align-items:center;justify-content:center;min-width:18px;'
 +'height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#f26a10;color:#fff;'
 +'font-size:11px;font-weight:800;line-height:1;vertical-align:middle;'
 +'box-shadow:0 0 0 2px rgba(255,255,255,.35)}';
 document.head.appendChild(st);
})();
