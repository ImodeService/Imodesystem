/* Beta — what happens when a technician finishes a job.

   Four reported items, all on the same short path.

     2  (third screenshot) หน้างานช่าง comes off the technician's sidebar. The technician's
        way in is งานของฉัน -> tap the job; opening หน้างาน from the sidebar has no job to
        show, so it silently auto-picks one and the technician can end up filling in a sheet
        for a case they did not choose. An admin previewing a queue from ทีมช่าง still needs
        the entry, so it is hidden for technician accounts only, not deleted.

     10 "ช่างกดส่งงาน ขึ้นแจ้งเตือนส่งงานสำเร็จ แต่หน้างานของฉันกลับขึ้นรอส่ง และหน้าของแอดมินก็รอส่ง".
        saveServiceReport() in js/03 sets `c.status='รอส่งงาน'` — "waiting to be submitted" —
        at the exact moment the submission happens, and then says "จบงานแล้ว". The status and
        the toast contradicted each other on every screen that reads the case. The report is
        the submission, so the case moves on to เสร็จสิ้น and the coordinator closes it from
        there. js/03 is not edited: the status is corrected right after the save it belongs
        to, so the timeline entry, the report record and the cloud push all stay in the one
        function that owns them.

     6  "เวลากดปิดเคสอะเอาเคสออกจากหน้างานของฉันด้วย". renderMyWork() listed every case ever
        assigned and merely sorted the closed ones to the bottom, so a technician's list only
        ever grew. Closed work leaves the list and lands in งานที่สำเร็จแล้ว (js/45) — removed
        from the day's work, not from the record.

     7  "เวลาช่างส่งเคสแล้วอยากให้กลับไปที่งานของฉันโดยอัตโนมัติ". After a successful submit the
        technician is taken back to งานของฉัน, which by then no longer holds the job.

   Nothing here writes a new storage key and no existing function body is rewritten. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function isClosed(c){return ['เสร็จสิ้น','ปิดเคส'].indexOf(String(c&&c.status||''))>=0}
 window.imodeCaseIsClosed=isClosed;

 /* ------------------------------------- 1. หน้างานช่าง leaves the tech sidebar ---- */
 function syncFieldNav(){
  var item=document.querySelector('.sidebar .side-nav .nav-item[data-page="field-service"]');
  if(!item)return;
  if(!myTechId())return;                       /* admin / coordinator keeps it */
  item.style.display='none';
  /* js/36 hides a group header whose every item is hidden; tell it the row moved. */
  try{if(window.imodeNavGroups&&window.imodeNavGroups.sync)window.imodeNavGroups.sync()}catch(e){}
 }
 /* applyRoleVisibility() rewrites style.display on every [data-page] from the permission
    alone, so this has to run after it or the entry comes straight back. */
 var baseVisibility=window.applyRoleVisibility;
 if(typeof baseVisibility==='function'){
  window.applyRoleVisibility=function(){
   var r=baseVisibility.apply(this,arguments);
   try{syncFieldNav()}catch(e){}
   return r;
  };
 }

 /* ------------------------------------ 2. the submit really finishes the job ---- */
 function doneStatus(){
  var list=[];
  try{list=settings.statuses||[]}catch(e){}
  return list.indexOf('เสร็จสิ้น')>=0?'เสร็จสิ้น':(list[list.length-2]||'เสร็จสิ้น');
 }
 /* Only the status js/03 has just written is touched. A case a coordinator had deliberately
    parked at รออะไหล่, or one already closed, is left exactly as it is. */
 function promoteSubmitted(cid){
  var c=caseList().filter(function(x){return x.id===cid})[0];
  if(!c)return false;
  if(String(c.status||'')!=='รอส่งงาน')return false;
  c.status=doneStatus();
  c.updatedAt=new Date().toISOString();
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  return true;
 }
 window.imodePromoteSubmittedCase=promoteSubmitted;

 var baseSaveReport=window.saveServiceReport;
 if(typeof baseSaveReport==='function'){
  window.saveServiceReport=function(doSave,preview){
   /* Read the case id before the call: saveServiceReport() ends with closeModal() and
      renderAll(), either of which can take #srCaseId off the page. */
   var cid='';
   try{cid=(document.getElementById('srCaseId')||{}).value||''}catch(e){}
   var saving=(doSave===undefined||doSave===true);
   /* 2026-09-17: editing the ใบตรวจ of a job that is already finished must not move the case.
      js/03 writes c.status='รอส่งงาน' before its first await, so a closed case was reopened to
      รอส่งงาน and then promoted to เสร็จสิ้น — an edit made a ปิดเคส job look open again. For
      the synchronous part of the call the case's status is pinned, which also keeps the
      intermediate value out of the saveLocal() and the cloud push that follow it. */
   var pinned=null,keep='';
   if(saving&&cid){
    try{
     pinned=caseList().filter(function(x){return x.id===cid})[0]||null;
     keep=pinned?String(pinned.status||''):'';
     if(pinned&&(keep==='ปิดเคส'||keep===doneStatus())){
      Object.defineProperty(pinned,'status',{configurable:true,enumerable:true,
       get:function(){return keep},set:function(){}});
     }else pinned=null;
    }catch(e){pinned=null}
   }
   var r;
   try{r=baseSaveReport.apply(this,arguments)}
   finally{
    if(pinned){try{delete pinned.status;pinned.status=keep}catch(e){}}
   }
   if(!saving||!cid)return r;
   var after=function(){
    try{
     var moved=promoteSubmitted(cid);
     if(!moved){
      if(pinned)toast(tl('บันทึกการแก้ไขใบตรวจแล้ว','Inspection sheet updated'));
      return;
     }
     toast(tl('ส่งงานเรียบร้อย — เคสเปลี่ยนเป็น ','Submitted — the case is now ')+doneStatus());
     /* Item 7: back to งานของฉัน, which by now no longer lists this job. Only for a
        technician; an admin filling in a sheet stays where they were. */
     if(myTechId()&&typeof window.goPage==='function'){
      try{if(typeof window.imodeClearFieldJob==='function')window.imodeClearFieldJob()}catch(e){}
      window.goPage('my-work');
     }
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(after,function(){});
   else setTimeout(after,80);
   return r;
  };
 }

 /* ---------------------------------- 3. งานของฉัน holds only unfinished work ---- */
 /* js/16 builds the rows and its own goPage wrapper calls its *closure* renderMyWork(), not
    window.imodeRenderMyWork, so wrapping the exported name alone would miss the main path.
    Watching the page catches every route into it, including js/26's re-render on a status
    change and anything added later.

    The observer is disconnected around its own writes: a MutationObserver only queues
    records while it is observing, so our edits are never recorded — recording them and
    filtering them out is what spun a nav observer into an infinite loop in part 17. */
 var mwObserver=null;
 function tidyMyWork(){
  var page=document.getElementById('page-my-work');
  if(!page)return;
  var list=page.querySelector('.work-list');
  if(!list)return;

  var rows=list.querySelectorAll('.work-row[data-case]'),done=0,i;
  var drop=[];
  for(i=0;i<rows.length;i++){
   var c=caseList().filter(function(x){return x.id===rows[i].getAttribute('data-case')})[0];
   if(c&&isClosed(c)){done++;drop.push(rows[i])}
  }
  var mine=myTechId();
  var closedTotal=mine?caseList().filter(function(c){
   var on=(typeof window.imodeIsAssignedTo==='function')
    ? window.imodeIsAssignedTo(c,mine) : c.assignee===mine;
   return on&&isClosed(c);
  }).length:0;

  var footerNeeded=!!closedTotal;
  var hasFooter=!!page.querySelector('.mw-donelink');

  if(mwObserver)mwObserver.disconnect();
  try{
   drop.forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)});
   if(!list.querySelector('.work-row')&&!list.querySelector('.empty')){
    list.innerHTML='<div class="empty">'+esc2(tl('ไม่มีงานค้างอยู่ตอนนี้','Nothing open right now'))+'</div>';
   }
   /* The fourth tile counted every case ever assigned, which after this change is the one
      number on the board that is not about today. It becomes the way into the archive. */
   var boxes=page.querySelectorAll('.work-kpi .work-kpi-box');
   if(boxes.length>=4){
    var box=boxes[boxes.length-1];
    box.classList.add('mw-doneKpi');
    box.innerHTML='<small>'+esc2(tl('สำเร็จแล้ว','Completed'))+'</small><b>'+closedTotal+'</b>';
   }
   if(footerNeeded&&!hasFooter){
    var bar=document.createElement('div');
    bar.className='mw-donelink';
    bar.innerHTML='<button type="button" class="soft-btn" onclick="goPage(\'done-jobs\')">📗 '
     +esc2(tl('ดูงานที่สำเร็จแล้ว','Completed work'))+' ('+closedTotal+') ›</button>';
    list.parentNode.insertBefore(bar,list.nextSibling);
   }else if(hasFooter){
    var b=page.querySelector('.mw-donelink button');
    if(b)b.textContent='📗 '+tl('ดูงานที่สำเร็จแล้ว','Completed work')+' ('+closedTotal+') ›';
   }
  }catch(e){}
  if(mwObserver)mwObserver.observe(page,{childList:true,subtree:true});
 }
 function watchMyWork(){
  var page=document.getElementById('page-my-work');
  if(!page||page.dataset.tfWatched)return;
  page.dataset.tfWatched='1';
  mwObserver=new MutationObserver(function(){tidyMyWork()});
  mwObserver.observe(page,{childList:true,subtree:true});
  tidyMyWork();
 }

 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   try{
    syncFieldNav();
    watchMyWork();
    if((document.querySelector('.page.active')||{}).id==='page-my-work')tidyMyWork();
   }catch(e){}
   return r;
  };
 }
 var baseMyWork=window.imodeRenderMyWork;
 if(typeof baseMyWork==='function'){
  window.imodeRenderMyWork=function(){
   var r=baseMyWork.apply(this,arguments);
   try{watchMyWork();tidyMyWork()}catch(e){}
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70TechFlowStyle';
 st.textContent=''
 +'.mw-donelink{margin-top:12px}'
 +'.mw-donelink button{width:100%;justify-content:center}'
 +'.work-kpi-box.mw-doneKpi{background:#f2fbf6;border-color:#cdebd9}'
 +'.work-kpi-box.mw-doneKpi b{color:#0b7a45}';
 document.head.appendChild(st);

 function install(){
  try{syncFieldNav()}catch(e){}
  try{watchMyWork()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
