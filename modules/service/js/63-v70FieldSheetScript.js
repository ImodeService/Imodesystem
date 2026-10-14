/* Beta 1.0 — the inspection sheet loses its checklist, and จบงาน asks first.

   Two reported items, both on the technician's หน้างาน screen.

   5. "อยากให้เอาเช็คลิสออก" — the Checklist จุดตรวจเครื่อง block, eleven rows of
      ปกติ / หมายเหตุ, at the top of the sheet. Confirmed with the owner: out of the whole
      system, INCLUDING the printed ใบตรวจ. What the technician fills in is the diagnosis,
      the work performed, the parts, the photos and the signatures.

      Three things had to move together, because leaving any one of them would have printed a
      lie: eleven "ปกติ" rows that nobody had actually looked at.

        a. the editor stops rendering — window.renderChecklistEditor returns ''. It is a
           top-level function declaration in js/03 and therefore a real window property, so
           the form and changeReportWorkType() both pick the override up.
        b. the heading and the "Checklist จะเปลี่ยนตามประเภทงาน" hint are taken out of the form
           markup as it passes through openModal(). #checklistEditor itself is KEPT, empty and
           hidden: changeReportWorkType() writes to it as an id global and would throw without
           it — the same reason #fieldQueue and #portalLineIdentity are still in the document.
           This wrapper is outermost (js/63 loads after js/32), so js/32 renders the sheet into
           the page from the markup this file has already cleaned.
        c. saveServiceReport() builds its answers from checklistTemplate(workType) and falls
           back to 'OK' for every row whose <select> is missing, so a hidden editor would have
           stored a full pass. checklistTemplate is swapped for one that returns [] around the
           call, which is precise: an async function runs synchronously up to its first await,
           and `const check=template.map(...)` is well before it. New reports store
           checklist:[] and the printed sheet drops the table.

      Reports written BEFORE this keep their checklist in storage; it simply stops being
      printed. QC has its own, separate checklist (QC_CHECKLIST_MASTER) and is not touched.

   6. "เวลาช่างกดจบงานให้งานนั้นหายไปจากหน้างานของฉัน ของ ช่างกับ R&D" — with the owner's
      "กดจบงานแล้วถามก่อน".

      จบงาน used to set the case to รอส่งงาน (js/03 line 978), which is not a closed status, so
      the job stayed on งานของฉัน looking exactly as unfinished as before. Pressing it now asks
      first — and says whether the ใบตรวจ has been filed, because that is the one thing the
      technician cannot go back for once the job has left their list — and on yes the case
      lands on เสร็จสิ้น, the same status the submit path has used since part 18. The job
      leaves งานของฉัน (js/44 drops closed rows) and is in งานที่สำเร็จแล้ว (js/45).

      The hook is window.saveFieldStatus rather than any one button, because three screens
      reach จบงาน through it: js/32's step bar on the page, js/26's stepper in the popup and
      js/03's own status modal. Only the word จบงาน is intercepted; every other step is
      untouched.

   js/03 is not edited. Remove this file and both behaviours return exactly. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function caseById(id){return caseList().filter(function(c){return c.id===id})[0]||null}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 /* ==================================================== 5. no more checklist ==== */
 if(typeof window.renderChecklistEditor==='function'){
  window.renderChecklistEditor=function(){return ''};
 }

 /* The form markup, cleaned on its way through openModal(). Done on a detached element so a
    half-built string is never put into the live document. */
 function stripChecklist(html){
  if(!html||html.indexOf('checklistEditor')<0)return html;
  var box=document.createElement('div');
  box.innerHTML=html;
  var ed=box.querySelector('#checklistEditor');
  if(!ed)return html;
  ed.innerHTML='';
  ed.style.display='none';
  var prev=ed.previousElementSibling;
  if(prev&&prev.classList.contains('section-title'))prev.parentNode.removeChild(prev);
  /* "Checklist จะเปลี่ยนตามประเภทงาน" beside the work-type picker describes a control that is
     no longer there. */
  [].slice.call(box.querySelectorAll('.report-type-strip span')).forEach(function(s){
   if(/Checklist/i.test(s.textContent||''))s.parentNode.removeChild(s);
  });
  return box.innerHTML;
 }
 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title,sub,body,big){
   var args=[].slice.call(arguments);
   try{if(typeof body==='string')args[2]=stripChecklist(body)}catch(e){}
   return baseOpenModal.apply(this,args);
  };
 }

 /* What gets stored. See (c) in the header for why the swap is safe. */
 var baseSaveReport=window.saveServiceReport;
 if(typeof baseSaveReport==='function'&&typeof window.checklistTemplate==='function'){
  window.saveServiceReport=function(){
   /* 2026-09-17: a checklist is BACK on the sheet — js/77's three-answer one, which writes
      into the same #src<i> / #srn<i> ids js/03 reads. The swap below exists only to stop a
      HIDDEN editor storing a full pass on eleven points nobody looked at; with a real editor
      on screen it would now throw away answers a technician actually gave. So it is skipped
      exactly when one is present. With js/77 removed, #src0 does not exist and this behaves
      as it did. */
   if(document.getElementById('src0'))return baseSaveReport.apply(this,arguments);
   var keep=window.checklistTemplate;
   window.checklistTemplate=function(){return []};
   try{return baseSaveReport.apply(this,arguments)}
   finally{window.checklistTemplate=keep}
  };
 }

 /* What gets printed. Older reports still hold a checklist array; the table goes either way. */
 var baseReportHTML=window.serviceReportHTML;
 if(typeof baseReportHTML==='function'){
  window.serviceReportHTML=function(r){
   var html=baseReportHTML.apply(this,arguments);
   /* 2026-09-17: a report carrying js/77's ผ่าน / พอใช้ / แก้ไข answers KEEPS its table — the
      technician really filled it in and it belongs on the sheet the customer signs. An OLD
      report's OK / NG / N/A table still goes, which is what part 22 asked for. */
   try{if(typeof window.imodeIsNewChecklist==='function'&&window.imodeIsNewChecklist(r&&r.checklist))return html}catch(e){}
   try{
    var box=document.createElement('div');
    box.innerHTML=html;
    [].slice.call(box.querySelectorAll('h4')).forEach(function(h){
     var t=(h.textContent||'').trim();
     if(t.indexOf('รายการตรวจเช็ก')!==0&&!/Checklist$/i.test(t))return;
     var next=h.nextElementSibling;
     if(next&&next.tagName==='TABLE')next.parentNode.removeChild(next);
     h.parentNode.removeChild(h);
    });
    return box.innerHTML;
   }catch(e){return html}
  };
 }

 /* ======================================== 6. จบงาน asks, then really finishes ==== */
 var DONE='จบงาน';
 function hasReport(cid){
  try{return (Array.isArray(serviceReports)?serviceReports:[]).some(function(r){return r.caseId===cid})}
  catch(e){return false}
 }
 function confirmFinish(c){
  var lines=[tl('ยืนยันจบงานเคส ','Finish case ')+(c.ticket||c.id)+'?',''];
  lines.push(hasReport(c.id)
   ? tl('• บันทึกใบตรวจงานช่างไว้แล้ว','• The inspection sheet has been filed')
   : tl('• ยังไม่ได้บันทึกใบตรวจงานช่าง — ถ้าจบงานตอนนี้ ต้องเข้าไปบันทึกที่หน้า "งานที่สำเร็จแล้ว"',
        '• No inspection sheet yet — after finishing you must file it from "Completed work"'));
  lines.push(tl('• งานนี้จะออกจาก "งานของฉัน" และไปอยู่ใน "งานที่สำเร็จแล้ว"',
                '• The job leaves "My Work" and moves to "Completed work"'));
  return window.confirm(lines.join('\n'));
 }
 /* Only the status js/03 has just written is touched, exactly like js/44's promoteSubmitted:
    a case a coordinator had parked at รออะไหล่, or one already closed, is left alone. */
 function finish(cid){
  var c=caseById(cid);
  if(!c)return false;
  if(String(c.status||'')!=='รอส่งงาน')return false;
  c.status='เสร็จสิ้น';
  c.updatedAt=new Date().toISOString();
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  return true;
 }

 var baseFieldStatus=window.saveFieldStatus;
 if(typeof baseFieldStatus==='function'){
  window.saveFieldStatus=function(cid){
   var wanted='';
   try{wanted=(document.getElementById('fieldStatusSelect')||{}).value||''}catch(e){}
   if(wanted!==DONE)return baseFieldStatus.apply(this,arguments);

   var c=caseById(cid);
   if(!c)return baseFieldStatus.apply(this,arguments);
   if(!confirmFinish(c))return Promise.resolve(false);

   var out=baseFieldStatus.apply(this,arguments);
   var after=function(){
    try{
     if(!finish(cid))return;
     toast(tl('จบงานแล้ว — ย้ายไปที่ "งานที่สำเร็จแล้ว"','Finished — moved to "Completed work"'));
     /* Back where the technician's remaining work is; an admin filling in for somebody else
        stays where they were. */
     if(myTechId()&&typeof window.goPage==='function'){
      try{if(typeof window.imodeClearFieldJob==='function')window.imodeClearFieldJob()}catch(e){}
      window.goPage('my-work');
     }
    }catch(e){}
   };
   if(out&&typeof out.then==='function')out.then(after,function(){});
   else setTimeout(after,80);
   return out;
  };
 }
})();
