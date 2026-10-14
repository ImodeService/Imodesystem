/* Beta 1.0 — the customer's approval reaches the office, and receiving it schedules the job.

   REPORTED (2026-09-18):
     "หลังทำใบเสนอราคาเสร็จลูกค้าเซ็นตอบรับ เสร็จ แอดมินรับใบเสนอราคาเสร็จตามโปรเสส
      อัพเดตสถานะไปนัดหมายอัตโนมัติ"

   WHAT WAS MEASURED FIRST, because three of the four steps already existed:

     the customer signs        js/75 writes settings.quoteApprovals — and NOTHING else. The
                               quotation's own status stayed 'ส่งแล้ว', so the office's status
                               pill said the customer had not answered yet.
     the office is told        it was not. The only sign was the chip on ดูใบเสนอราคา, which
                               has to be opened to be seen.
     the admin receives it     there was no such step anywhere in the project.
     the case is scheduled     imodeOpenAssignPicker() in js/16 already demands a technician
                               AND a date and lands the case on 'นัดหมายแล้ว' (part 22 §2).

   So this file is the two missing links — the receipt, and what it sets off — and it reuses
   the picker rather than writing a second scheduling path.

   ---------------------------------------------------------------- THE OWNER'S THREE CHOICES

   1. THE ADMIN PRESSES รับใบเสนอราคา. The customer signing is not enough on its own: nobody
      has checked the signature, and a case must not move because a phone was tapped.
   2. WITH NO APPOINTMENT YET, THE PICKER OPENS. 'นัดหมายแล้ว' is written by every existing
      path only together with a real date, and the calendar filters on c.appointment — a case
      put on that status with no date disappears from the calendar, which is exactly the 19
      cases part 25 had to repair by hand. So the receipt opens the picker and js/16 sets the
      status when the date is really there. A case that ALREADY has a date is moved straight
      on, because there is nothing left to ask.
   3. THE APPROVAL IS ANNOUNCED THREE WAYS: the notification centre, the ดูใบเสนอราคา row,
      and the Service Cases row.

   ---------------------------------------------------------------- WHERE THE RECEIPT LIVES

   `settings.quoteAccepts` — `{quoteId:{at,by}}` — beside js/75's quoteApprovals and for the
   same reason: cloudUpsertQuotation() writes an explicit column whitelist, so a field added
   to the quotation object is dropped silently on the way to Supabase (it is already dropping
   the derived breakdown — part 18 §4). `settings` travels whole, so a receipt is on every
   device at the next sync with no SQL for anybody to run. The record is two short strings;
   nothing here grows the way the bin or a signature image can.

   ---------------------------------------------------------------- WHY THE NOTICE IS DERIVED

   `notifications` is written locally and js/03 NEVER uploads it — there is no
   cloudUpsertNotification (part 16 §5). A notice written on the customer's phone the moment
   they sign would therefore never leave that phone, which is the whole failure this is
   supposed to fix. It is computed instead from settings.quoteApprovals minus
   settings.quoteAccepts, both of which travel, so every device works it out for itself and it
   clears itself the moment the receipt is recorded.

   ---------------------------------------------------------------- PERMISSIONS

   Gated on `case.assign`, DELIBERATELY AN EXISTING KEY. A file that pushes a new key into
   PERMISSION_CATALOG must load before js/20, which repairs roles against the catalog as it
   stands at that moment; this one loads last, so a new key would be stripped from every role
   on every reload (part 14). case.assign is also the right test on its own: receiving the
   quotation leads directly into assigning and scheduling the job. No technician holds it. */
(function(){
 'use strict';

 /* ------------------------------------------------------------------ helpers ---- */
 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function me(){try{return currentUser||null}catch(e){return null}}
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function caseById(id){return caseList().filter(function(c){return c&&c.id===id})[0]||null}
 function quoteById(id){return quoteList().filter(function(q){return q&&q.id===id})[0]||null}
 function can(k){try{return typeof canPermission!=='function'||canPermission(k)}catch(e){return true}}
 function myTechId(){var u=me();return (u&&u.technicianId)||''}
 function money(v){try{return typeof money2==='function'?money2(v):String(v==null?'-':v)}
                   catch(e){return String(v==null?'-':v)}}
 function fmtAt(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}
 function approved(id){try{return typeof window.imodeQuoteApproved==='function'&&window.imodeQuoteApproved(id)}
                       catch(e){return false}}
 function approvalOf(id){try{return typeof window.imodeQuoteApproval==='function'?window.imodeQuoteApproval(id):null}
                         catch(e){return null}}

 /* 'ไม่อนุมัติ' contains 'อนุมัติ', so the list is matched exactly rather than by indexOf. */
 var APPROVED_STATUS='อนุมัติ';
 function approvedStatus(){
  try{
   var list=settings.quotationStatuses||[];
   for(var i=0;i<list.length;i++)if(String(list[i])===APPROVED_STATUS)return list[i];
  }catch(e){}
  return APPROVED_STATUS;
 }

 /* ------------------------------------------------------------- 1. the receipt ---- */
 function store(){
  try{
   if(!settings.quoteAccepts||typeof settings.quoteAccepts!=='object')settings.quoteAccepts={};
   return settings.quoteAccepts;
  }catch(e){return {}}
 }
 function acceptOf(id){try{var r=store()[id];return (r&&typeof r==='object')?r:null}catch(e){return null}}
 function isAccepted(id){return !!acceptOf(id)}
 window.imodeQuoteAccepted=isAccepted;
 window.imodeQuoteAccept=acceptOf;

 /* A quotation the customer has signed and the office has not taken in yet. */
 function waiting(q){return !!q&&approved(q.id)&&!isAccepted(q.id)}
 function waitingList(){return quoteList().filter(waiting)}
 window.imodeQuotesAwaitingAccept=waitingList;

 function saveAccept(id){
  try{
   var u=me();
   store()[id]={at:new Date().toISOString(),by:(u&&(u.name||u.id))||'staff'};
   if(typeof saveLocal==='function')saveLocal();
   if(typeof cloudSaveSettings==='function')cloudSaveSettings();
   return true;
  }catch(e){return false}
 }

 /* --------------------------------------- 2. signing also moves the quotation on ---- */
 /* js/75 records the approval and stops there, so ดูใบเสนอราคา still showed 'ส่งแล้ว' next to
    an อนุมัติแล้ว chip — the two disagreed. The status is set here rather than inside js/75
    so that file keeps doing one thing, and it is written only when the approval really
    landed (the pad can be blank, the name can be missing, and js/75 refuses both). */
 function markApprovedStatus(id){
  var q=quoteById(id);
  if(!q||!approved(id))return false;
  var want=approvedStatus();
  if(String(q.status||'')===want)return false;
  q.status=want;
  q.updatedAt=new Date().toISOString();
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertQuotation==='function')cloudUpsertQuotation(q)}catch(e){}
  return true;
 }
 /* A quotation signed BEFORE this file existed kept its 'ส่งแล้ว' while the approval record
    said otherwise — measured on the live project: QT-SRV-202609-015 was exactly that. The two
    disagreed on screen, so the status is brought into line once, quietly, on load and after
    every sync. Only ever ส่งแล้ว/รออนุมัติ → อนุมัติ; a draft and a refusal are left alone. */
 function repairApprovedStatuses(){
  var moved=0;
  quoteList().forEach(function(q){
   if(!q||!q.id||!approved(q.id))return;
   var s=String(q.status||'');
   if(s===approvedStatus()||s===''||s==='ร่าง'||s==='ไม่อนุมัติ'||s==='หมดอายุ')return;
   if(markApprovedStatus(q.id))moved++;
  });
  return moved;
 }
 window.imodeRepairApprovedStatuses=repairApprovedStatuses;

 var baseApprove=window.imodePortalApproveQuote;
 if(typeof baseApprove==='function'){
  window.imodePortalApproveQuote=function(id){
   var r=baseApprove.apply(this,arguments);
   try{markApprovedStatus(id)}catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------- 3. รับใบเสนอราคา, and what follows ---- */
 var EARLY=['เคสใหม่','มอบหมายแล้ว'];
 function isClosed(c){return !!c&&(c.status==='ปิดเคส'||c.status==='เสร็จสิ้น')}

 function schedule(q){
  var c=q.caseId?caseById(q.caseId):null;
  if(!c){
   toast(tl('รับใบเสนอราคาแล้ว · ใบนี้ไม่ได้อ้างอิงเคส จึงไม่มีสถานะให้อัปเดต',
            'Received — this quotation has no case, so there is no status to update'));
   return;
  }
  if(isClosed(c)){
   toast(tl('รับใบเสนอราคาแล้ว · เคสนี้ปิดไปแล้ว',
            'Received — this case is already finished'));
   return;
  }
  /* A date is already on the case: there is nothing left to ask, so the status moves on its
     own — which is the "อัตโนมัติ" that was asked for. The guard is js/16's: a case already
     past this point keeps the status it has, and a settings.statuses without นัดหมายแล้ว
     degrades instead of writing a status the system does not have. */
  if(c.appointment&&EARLY.indexOf(c.status)>=0&&(settings.statuses||[]).indexOf('นัดหมายแล้ว')>=0){
   c.status='นัดหมายแล้ว';
   c.updatedAt=new Date().toISOString();
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
   toast(tl('รับใบเสนอราคาแล้ว · เคสอัปเดตเป็น "นัดหมายแล้ว" · ',
            'Received — the case is now scheduled · ')+fmtAt(c.appointment));
   return;
  }
  /* No date yet. Rather than write a status the calendar cannot honour, the picker opens —
     it demands a technician and a date and then sets นัดหมายแล้ว itself. */
  if(typeof window.imodeOpenAssignPicker==='function'){
   toast(tl('รับใบเสนอราคาแล้ว · เลือกช่างและวันนัดหมายเพื่ออัปเดตสถานะ',
            'Received — pick a technician and a date to schedule the case'));
   try{window.imodeOpenAssignPicker(c.id);return}catch(e){}
  }
  toast(tl('รับใบเสนอราคาแล้ว · กรุณานัดหมายเคสนี้เพื่ออัปเดตสถานะ',
           'Received — please schedule this case to update its status'));
 }

 function ask(opts){
  if(typeof window.imodeConfirm==='function')return window.imodeConfirm(opts);
  var okNative=false;
  try{okNative=window.confirm(opts.message)}catch(e){}
  return Promise.resolve(okNative);
 }

 window.imodeAcceptQuote=function(id){
  var q=quoteById(id);
  if(!q){toast(tl('ไม่พบใบเสนอราคา','Quotation not found'));return}
  if(typeof requirePermission==='function'&&!requirePermission('case.assign'))return;
  if(!approved(id)){toast(tl('ลูกค้ายังไม่ได้เซ็นอนุมัติใบนี้','The customer has not approved this quotation yet'));return}
  if(isAccepted(id)){toast(tl('ใบนี้รับเรียบร้อยแล้ว','This quotation has already been received'));return}
  var a=approvalOf(id)||{},c=q.caseId?caseById(q.caseId):null;
  var next=!c?tl('ใบนี้ไม่ได้อ้างอิงเคส','This quotation has no case')
    :(c.appointment?tl('เคสจะอัปเดตเป็น "นัดหมายแล้ว" · ','The case moves to scheduled · ')+fmtAt(c.appointment)
                   :tl('ระบบจะเปิดหน้าต่างเลือกช่างและวันนัดหมายต่อทันที',
                       'The technician and date picker opens next'));
  ask({
   title:tl('รับใบเสนอราคา','Receive the quotation'),
   okText:tl('รับใบเสนอราคา','Receive'),
   message:q.id+' · '+(q.customer||'-')+' · '+money(q.grand)+'\n'
     +tl('ลูกค้าอนุมัติโดย ','Approved by ')+(a.name||'-')+' · '+fmtAt(a.at)+'\n'+next
  }).then(function(ok){
   if(!ok)return;
   if(!saveAccept(id)){toast(tl('บันทึกไม่สำเร็จ กรุณาลองใหม่','Could not save — please try again'));return}
   try{markApprovedStatus(id)}catch(e){}
   try{decorate()}catch(e){}
   try{if(typeof window.imodeRenderQuoteView==='function')window.imodeRenderQuoteView()}catch(e){}
   schedule(q);
  });
 };

 /* ------------------------------------------------ 4. told three ways: the notices ---- */
 /* Derived, not stored — see the header. Shown only to an account that can actually act on
    it; a technician never sees it (they hold no case.assign and carry a technicianId). */
 function acceptNotices(){
  var out=[];
  if(myTechId())return out;
  try{if(typeof canPermission==='function'&&!canPermission('case.assign'))return out}catch(e){}
  waitingList().forEach(function(q){
   var a=approvalOf(q.id)||{};
   out.push({
    key:'auto_quoteok_'+q.id,
    icon:'✍',
    title:tl('ลูกค้าอนุมัติใบเสนอราคาแล้ว','The customer approved a quotation'),
    /* 2026-09-25: raw on purpose - the sink escapes. See js/16's note. */
    message:(q.id||'')+' · '+(q.customer||'-')+' · '+money(q.grand)
      +(a.name?' · '+tl('เซ็นโดย ','signed by ')+a.name:''),
    createdAt:a.at||q.updatedAt||q.createdAt,
    caseId:q.caseId||'',
    read:false
   });
  });
  return out;
 }
 var baseBuild=window.buildNotifications;
 if(typeof baseBuild==='function'){
  window.buildNotifications=function(){
   var all=baseBuild.apply(this,arguments)||[];
   /* Ahead of the rest: it is the thing somebody has to act on. js/16's visibleTo() has
      already run inside the wrapper below this one, and these are not addressed to a
      technician, so they are added rather than filtered again. */
   return acceptNotices().concat(all);
  };
 }

 /* ---------------------------------------- 5. told three ways: the two lists ---- */
 function rowButtonHTML(id){
  return '<button type="button" class="qac-btn" data-qac-accept="'+esc2(id)+'">📥 '
   +esc2(tl('รับใบเสนอราคา','Receive'))+'</button>';
 }
 function caseChipHTML(){
  return '<span class="qac-chip" data-qac-chip="1">✍ '
   +esc2(tl('ลูกค้าอนุมัติราคาแล้ว','Quotation approved'))+'</span>';
 }

 /* The lists are rebuilt by innerHTML on every render, so the button is put back after each
    one rather than written into js/43's and js/03's row templates — the same technique js/26
    uses for the response clock and js/75 for its chip. */
 function decorate(){
  var mayAct=!myTechId()&&can('case.assign');

  /* 5a. ดูใบเสนอราคา — the row the office works from. */
  var host=document.getElementById('page-quote-view');
  if(host){
   [].slice.call(host.querySelectorAll('.qv-row[data-quote]')).forEach(function(el){
    var id=el.getAttribute('data-quote')||'';
    var old=el.querySelector('[data-qac-accept]');
    if(!id||!mayAct||!waiting(quoteById(id))){if(old)old.remove();return}
    if(old)return;
    /* The side column is where js/43 keeps the row's own action (ส่งให้ลูกค้า) and where the
       row's click handler already ignores a button; the title row is only a fallback. */
    var slot=el.querySelector('.qv-row-side')||el.querySelector('.qv-row-top')||el;
    slot.insertAdjacentHTML('beforeend',rowButtonHTML(id));
   });
  }

  /* 5b. Service Cases — a badge on the case whose quotation is waiting to be taken in.
     Keyed by caseId, so a case with two quotations still gets one badge. */
  var flagged={};
  if(mayAct)waitingList().forEach(function(q){if(q.caseId)flagged[q.caseId]=1});
  document.querySelectorAll('#caseTable tr[data-case-id],#caseCards [data-case-id],'
   +'#page-assign .work-row[data-case]').forEach(function(row){
   var id=row.getAttribute('data-case-id')||row.getAttribute('data-case');
   var chip=row.querySelector('[data-qac-chip]');
   if(!flagged[id]){if(chip)chip.remove();return}
   if(chip)return;
   var slot=row.matches('tr')?row.querySelector('td:first-child')
          :(row.querySelector('.work-row-main')||row.querySelector('.card-top')||row);
   if(slot)slot.insertAdjacentHTML('beforeend',caseChipHTML());
  });
 }
 window.imodeDecorateQuoteAccept=decorate;

 /* 5c. the quotation document popup — where somebody reading the paper decides. */
 var baseDoc=window.imodeOpenQuoteDoc;
 if(typeof baseDoc==='function'){
  window.imodeOpenQuoteDoc=function(id){
   var r=baseDoc.apply(this,arguments);
   try{
    if(!myTechId()&&can('case.assign')&&waiting(quoteById(id))){
     var row=document.querySelector('#modalBody .button-row');
     if(row&&!row.querySelector('[data-qac-accept]')){
      row.insertAdjacentHTML('beforeend','<button type="button" class="primary-btn action-3d-orange" '
       +'data-qac-accept="'+esc2(id)+'">📥 '+esc2(tl('รับใบเสนอราคา','Receive'))+'</button>');
     }
    }
   }catch(e){}
   return r;
  };
 }

 /* One delegated listener for every surface. It is registered on #modalBody as well because
    js/05 stops propagation at #modalPanel — the "ต้องกดกากบาทเท่านั้น" guard — so a click
    inside a popup never reaches the document (part 26). The panel swallows the event, so
    exactly one of the two listeners sees any given click. */
 function onClick(e){
  if(!e.target||!e.target.closest)return;
  var b=e.target.closest('[data-qac-accept]');
  if(!b)return;
  e.preventDefault();
  e.stopPropagation();
  window.imodeAcceptQuote(b.getAttribute('data-qac-accept'));
 }
 document.addEventListener('click',onClick);
 function wireModal(){
  var mb=document.getElementById('modalBody');
  if(mb&&!mb.__qacWired){mb.__qacWired=1;mb.addEventListener('click',onClick)}
 }

 /* Same reason as js/75: the ดูใบเสนอราคา rows are rebuilt by js/43 after renderAll() has
    already run, so the รับใบเสนอราคา button has to be put back by that render too. */
 var baseQuoteView=window.imodeRenderQuoteView;
 if(typeof baseQuoteView==='function'){
  window.imodeRenderQuoteView=function(){
   var r=baseQuoteView.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }
 /* After a sync as well as at start-up: the approval arrives in settings.quoteApprovals, and
    the quotation row it belongs to may come down in the same pass. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var after=function(){try{repairApprovedStatuses();decorate()}catch(e){}};
   if(r&&typeof r.then==='function')r.then(after,after);else setTimeout(after,0);
   return r;
  };
 }
 function start(){
  wireModal();
  try{repairApprovedStatuses()}catch(e){}
  try{decorate()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
 else start();
 window.addEventListener('load',start);

 /* ---------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70QuoteAcceptStyle';
 st.textContent=''
 +'.qac-btn{margin-left:6px;padding:6px 12px;border-radius:999px;border:1px solid #0b8a4b;'
 +'background:linear-gradient(180deg,#14a35c,#0b8a4b);color:#fff;font-size:11.5px;font-weight:800;'
 +'cursor:pointer;white-space:nowrap;box-shadow:0 3px 0 #077038}'
 +'.qac-btn:hover{filter:brightness(1.05)}'
 +'.qac-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #077038}'
 +'.qac-btn:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.qac-chip{display:inline-block;margin-left:6px;padding:3px 10px;border-radius:999px;'
 +'border:1px solid #b6e6cd;background:#e9f9f1;color:#07603a;font-size:10.5px;font-weight:800;'
 +'white-space:nowrap}'
 +'@media (prefers-reduced-motion:reduce){.qac-btn:active{transform:none}}';
 document.head.appendChild(st);
})();
