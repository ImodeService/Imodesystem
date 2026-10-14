/* Beta 1.0 — the customer signs the quotation, and stops seeing other machines' quotations.

   REPORTED (item 4, four parts, all on ใบเสนอราคาของฉัน on the customer page):

     4.1  "ทำให้ลูกค้าสามารถเซ็นลายเซ็นได้ในหน้าใบเสนอราคาของฉัน แยกเป็นใบๆเลย … เพราะว่าลูกค้า
           จะต้องอนุมัติใบเสนอราคาด้วย"
     4.2  the list gets a filter: อนุมัติแล้ว / ยังไม่ได้อนุมัติ
     4.3  each row says which it is, and the test is simply whether the customer has signed
     4.4  "มันมีใบเสนอราคาของเคสอื่นมาปนอยู่ด้วย … เช็คหน้าอื่นด้วยเผื่อมีอาการคล้ายๆกัน"

   ---------------------------------------------------------------- 4.4 first, because it
   is a real leak and it was measured, not guessed. The portal is opened by scanning ONE
   machine, but js/34 lists every quotation belonging to that machine's CUSTOMER. Read off
   the live project for the machine in the report (MCH-0001, S/N DEMO-HO500WT-0001):

     QT-SRV-202609-011  machine_ids ["MCH-0010"]   <- another machine
     QT-SRV-202609-006  machine_ids ["MCH-0001"]   <- this one
     QT-SRV-202609-005  machine_ids ["MCH-0003"]   <- another machine
     QT-SRV-202609-002  machine_ids ["MCH-0002"]   <- another machine

   Three of the four were about machines the visitor is not standing in front of, which is
   exactly "ของเคสอื่นมาปนอยู่". A quotation is now listed only when the scanned machine is on
   it. One with NO machine list at all is still shown — there is nothing to attribute it
   elsewhere, and hiding it would lose it entirely.

   THE OTHER PORTAL PAGES WERE CHECKED AND ARE ALREADY CORRECT, so nothing was changed there:
   showPortalHistory() filters `c.machineId===m.id`, showPortalDocuments() filters
   `d.machineId===m.id`, showPortalWarranty() reads latestWarrantyForMachine(m.id), and
   js/53's case view opens only a case from that list. Quotations were the only one keyed to
   the customer rather than the machine.

   ---------------------------------------------------------------- WHERE APPROVAL LIVES

   `settings.quoteApprovals` — `{quoteId:{at,by,name,sig}}` — and NOT a field on the
   quotation, for a reason this project has been bitten by twice: cloudUpsertQuotation()
   writes an explicit column whitelist, so a field added to the object is dropped silently on
   the way to Supabase (it is already dropping the derived breakdown — part 18 §4 — and the
   same shape of fault lost the customers' photos in part 18). `settings` travels whole, so an
   approval made on the customer's phone is on the coordinator's PC at their next sync with no
   schema change and no SQL for anybody to run.

   The signature image is downscaled to 300px wide before it is stored — a pad is 560x180 and
   a line drawing at that size is a few KB — and only the most recent APPROVAL_SIG_CAP images
   are kept. The record itself (who, when) is tiny and is never dropped, so a quotation stays
   approved for ever even once its picture has aged out. A settings row that grows without
   limit breaks settings sync for everybody, which is the trap part 17 documented for the bin.

   ---------------------------------------------------------------- HOW IT IS DRAWN

   Nothing is re-implemented. js/34 renders the rows and js/56 turns them into buttons and
   draws the real quotationDocHTML() paper; both are wrapped here, outermost, and the result is
   post-processed — the same technique js/27 uses to make a table row the button. Remove this
   file and the list and the document are exactly what they were.

   The signature pad is js/03's own signaturePadHTML / initSignaturePad / signatureData, so the
   customer's pad behaves like the technician's, undo from js/70 included.

   THE BLANK-PAD TRAP: signatureData() is canvas.toDataURL(), and a canvas nobody drew on
   still answers with a perfectly valid transparent PNG — `if(sig)` would approve every
   quotation the moment the panel opened. The ink is counted on the live canvas before the
   image is taken. That is the same fault js/68 had to solve for the closing gate. */
(function(){
 'use strict';

 var SIG_CAP=40;            /* how many signature images ride along in settings */
 var SIG_WIDTH=300;         /* downscale before storing */
 var INK_MIN=60;            /* pixels of ink below which the pad counts as untouched */

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}}
 function theMachine(){try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}}
 function fmtAt(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}

 /* ------------------------------------------------------- 1. the record ---- */
 function store(){
  try{
   if(!settings.quoteApprovals||typeof settings.quoteApprovals!=='object')settings.quoteApprovals={};
   return settings.quoteApprovals;
  }catch(e){return {}}
 }
 function approvalOf(id){
  try{
   var r=store()[id],q=quoteList().filter(function(x){return x&&x.id===id})[0];
   if(!r||typeof r!=='object')return null;
   var created=Date.parse(q&&q.createdAt||''),signed=Date.parse(r.at||'');
   return Number.isFinite(created)&&Number.isFinite(signed)&&signed<created?null:r;
  }catch(e){return null}
 }
 function isApproved(id){return !!approvalOf(id)}
 window.imodeQuoteApproval=approvalOf;
 window.imodeQuoteApproved=isApproved;

 /* Keep every record; drop only the oldest PICTURES once there are more than the cap. */
 function trimImages(){
  try{
   var all=store();
   var withSig=Object.keys(all).filter(function(k){return all[k]&&all[k].sig});
   if(withSig.length<=SIG_CAP)return;
   withSig.sort(function(a,b){return new Date(all[b].at||0)-new Date(all[a].at||0)});
   withSig.slice(SIG_CAP).forEach(function(k){delete all[k].sig});
  }catch(e){}
 }

 function saveApproval(id,name,sig){
  try{
   var all=store();
   all[id]={at:new Date().toISOString(),by:'customer',name:String(name||''),sig:sig||''};
   trimImages();
   if(typeof saveLocal==='function')saveLocal();
   if(typeof cloudSaveSettings==='function')cloudSaveSettings();
   return true;
  }catch(e){return false}
 }

 /* ------------------------------------------------------- 2. ink and size ---- */
 /* Counted on the live canvas, synchronously: this is our own pad and it is on screen, so
    there is no need for the asynchronous image decode js/68 has to do for a STORED PNG. */
 function padHasInk(id){
  try{
   var c=document.getElementById(id);
   if(!c)return false;
   var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,ink=0;
   for(var i=0;i<d.length;i+=4){
    if(d[i+3]>24&&(d[i]<230||d[i+1]<230||d[i+2]<230)){
     ink++;
     if(ink>INK_MIN)return true;
    }
   }
   return false;
  }catch(e){return true}          /* a canvas we cannot read must not block a real signature */
 }
 function shrink(id){
  try{
   var c=document.getElementById(id);
   if(!c)return '';
   var w=SIG_WIDTH,h=Math.max(1,Math.round(c.height*(w/c.width)));
   var out=document.createElement('canvas');
   out.width=w;out.height=h;
   out.getContext('2d').drawImage(c,0,0,w,h);
   return out.toDataURL('image/png');
  }catch(e){
   try{return typeof signatureData==='function'?signatureData(id):''}catch(x){return ''}
  }
 }

 /* ------------------------------------------------- 3. scope and the list ---- */
 /* A quotation belongs on this page when the scanned machine is on it. One with no machine
    list at all cannot be attributed to another machine, so it is still shown. */
 function forThisMachine(q,mid){
  if(!mid)return true;
  var ids=Array.isArray(q&&q.machineIds)?q.machineIds:[];
  if(!ids.length)return true;
  return ids.indexOf(mid)>=0;
 }
 var filter='all';                                  /* all | yes | no */
 window.imodePortalQuoteFilter=function(v){
  filter=v||'all';
  try{if(typeof window.showPortalQuotations==='function')window.showPortalQuotations()}catch(e){}
 };

 function chipHTML(id){
  return isApproved(id)
   ? '<span class="pqa-chip is-yes">✓ '+esc2(tl('อนุมัติแล้ว','Approved'))+'</span>'
   : '<span class="pqa-chip is-no">'+esc2(tl('ยังไม่ได้อนุมัติ','Not approved yet'))+'</span>';
 }

 /* Post-process whatever js/34 rendered and js/56 upgraded. */
 function decorateList(){
  var box=document.getElementById('portalContent');
  if(!box)return;
  var rows=[].slice.call(box.querySelectorAll('[data-pquote-open],[data-pquote-id]'));
  if(!rows.length)return;                            /* not the quotation list */
  var m=theMachine(),mid=(m&&m.id)||'';
  var kept=0,approved=0,pending=0;
  rows.forEach(function(el){
   var id=el.getAttribute('data-pquote-open')||el.getAttribute('data-pquote-id')||'';
   var q=quoteList().filter(function(x){return x&&x.id===id})[0];
   /* 4.4 — another machine's quotation leaves the page entirely. */
   if(q&&!forThisMachine(q,mid)){
    if(el.parentNode)el.parentNode.removeChild(el);
    return;
   }
   if(isApproved(id))approved++;else pending++;
   /* 4.2 — the filter hides rather than deletes, so the counts above stay honest. */
   var show=filter==='all'||(filter==='yes'?isApproved(id):!isApproved(id));
   el.style.display=show?'':'none';
   if(show)kept++;
   /* 4.3 — the state, beside the quotation's own status chip. */
   if(!el.querySelector('.pqa-chip')){
    var top=el.querySelector('.pquote-top');
    if(top)top.insertAdjacentHTML('beforeend',chipHTML(id));
   }
  });
  if(box.querySelector('.pqa-filter'))return;
  var head=box.querySelector('h3');
  var bar='<div class="pqa-filter" role="group" aria-label="'+esc2(tl('กรองใบเสนอราคา','Filter quotations'))+'">'
   +[['all',tl('ทั้งหมด','All'),approved+pending],
     ['yes',tl('อนุมัติแล้ว','Approved'),approved],
     ['no',tl('ยังไม่ได้อนุมัติ','Not approved'),pending]].map(function(o){
     return '<button type="button" class="pqa-fbtn pqa-f-'+o[0]+(filter===o[0]?' is-on':'')+'"'
      +' aria-pressed="'+(filter===o[0]?'true':'false')+'"'
      +' onclick="imodePortalQuoteFilter('+imodeJsArg(o[0])+')">'+esc2(o[1])+' ('+o[2]+')</button>';
    }).join('')
   +'</div>';
  if(head)head.insertAdjacentHTML('afterend',bar);
  else box.insertAdjacentHTML('afterbegin',bar);
  if(!kept){
   var note=document.createElement('p');
   note.className='pquote-empty pqa-none';
   note.textContent=filter==='yes'
    ? tl('ยังไม่มีใบเสนอราคาที่อนุมัติแล้ว','No approved quotations yet')
    : tl('ไม่มีใบเสนอราคาที่ยังไม่ได้อนุมัติ','No quotations waiting for approval');
   box.appendChild(note);
  }
 }

 var baseList=window.showPortalQuotations;
 if(typeof baseList==='function'){
  window.showPortalQuotations=function(){
   var r=baseList.apply(this,arguments);
   try{decorateList()}catch(e){}
   return r;
  };
 }

 /* --------------------------------------------- 4. signing one quotation ---- */
 var PAD='pqaSignPad',editApprovalId='';
 function panelHTML(q){
  var a=approvalOf(q.id);
  if(a&&editApprovalId!==q.id){
   return '<div class="pqa-panel is-done">'
    +'<div class="pqa-done-head">✓ '+esc2(tl('อนุมัติใบเสนอราคาแล้ว','Quotation approved'))+'</div>'
    +'<div class="pqa-done-meta">'+esc2(tl('โดย','By'))+' <b>'+esc2(a.name||tl('ลูกค้า','the customer'))+'</b>'
    +' · '+esc2(fmtAt(a.at))+'</div>'
    +(a.sig?'<img class="pqa-done-sig" src="'+esc2(a.sig)+'" alt="'+esc2(tl('ลายเซ็นลูกค้า','Customer signature'))+'">':'')
    +'<p class="pqa-hint">'+esc2(tl('ทีม Service ได้รับการอนุมัติของท่านแล้ว','Service has your approval.'))+'</p>'
    +'<button type="button" class="pqa-edit" data-pqa-edit="'+esc2(q.id)+'">✏️ '+esc2(tl('แก้ไขลายเซ็น','Edit signature'))+'</button>'
    +'</div>';
  }
  var pad='';
  try{pad=window.signaturePadHTML(PAD,tl('ลายเซ็นผู้อนุมัติ','Approver signature'))||''}catch(e){pad=''}
  if(!pad)return '';
  return '<div class="pqa-panel">'
   +'<div class="pqa-head">✍ '+esc2(tl('อนุมัติใบเสนอราคาฉบับนี้','Approve this quotation'))+'</div>'
   +'<p class="pqa-hint">'+esc2(tl('กรุณาตรวจสอบรายละเอียดด้านบน แล้วลงชื่อเพื่ออนุมัติ ทีม Service จะเริ่มงานหลังได้รับการอนุมัติ',
       'Please check the details above, then sign to approve. Service starts once you have approved.'))+'</p>'
   +'<div class="pqa-field"><label for="pqaName">'+esc2(tl('ชื่อผู้อนุมัติ','Approver name'))+'</label>'
   +'<input id="pqaName" autocomplete="name" value="'+esc2(a&&a.name||'')+'" placeholder="'+esc2(tl('ชื่อ-นามสกุล','Full name'))+'"></div>'
   +pad
   +'<label class="pqa-attach">📎 '+esc2(tl('แนบรูปลายเซ็น','Attach signature image'))
   +'<input id="pqaSignFile" type="file" accept="image/*" hidden></label>'
   +'<button type="button" class="pqa-submit" data-pqa-approve="'+esc2(q.id)+'">'
   +esc2(tl('อนุมัติใบเสนอราคา','Approve quotation'))+'</button>'
   +'<div id="pqaError" class="pqa-error" role="alert"></div>'
   +'</div>';
 }

 function attachPanel(id){
  var box=document.getElementById('portalContent');
  if(!box||box.querySelector('.pqa-panel'))return;
  var q=quoteList().filter(function(x){return x&&x.id===id})[0];
  if(!q)return;
  var html=panelHTML(q);
  if(!html)return;
  /* Above the print button, which is the last thing on the view. */
  var print=box.querySelector('[data-pqv-print]');
  if(print)print.insertAdjacentHTML('beforebegin',html);
  else box.insertAdjacentHTML('beforeend',html);
  if(!approvalOf(id)||editApprovalId===id){
   try{if(typeof initSignaturePad==='function')initSignaturePad(PAD,(approvalOf(id)||{}).sig||'')}catch(e){}
   var file=document.getElementById('pqaSignFile');
   if(file)file.onchange=function(){window.imodePortalAttachApprovalSign(this)};
  }
 }

 window.imodePortalAttachApprovalSign=function(input){
  var file=input&&input.files&&input.files[0],popup=window.imodeUploadProgressPopup;
  if(!file)return;
  if(!/^image\//.test(file.type||'')||file.size>3*1024*1024){
   if(popup){popup.open([file]);popup.finish({bad:true,msg:tl('กรุณาเลือกไฟล์รูปภาพขนาดไม่เกิน 3 MB','Choose an image up to 3 MB')})}
   else toast(tl('กรุณาเลือกไฟล์รูปภาพขนาดไม่เกิน 3 MB','Choose an image up to 3 MB'));
   input.value='';return;
  }
  if(popup)popup.open([file]);
  var reader=new FileReader();
  reader.onprogress=function(e){if(popup&&e.lengthComputable)popup.setPct(Math.min(90,e.loaded/e.total*90))};
  reader.onerror=function(){if(popup)popup.finish({bad:true,msg:tl('อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่','Could not read the file. Please try again.')})};
  reader.onload=function(){
   if(popup){popup.setPct(94);popup.phase(tl('กำลังเตรียมรูปลายเซ็น…','Preparing signature image…'),true)}
   var img=new Image();
   img.onerror=function(){if(popup)popup.finish({bad:true,msg:tl('ไฟล์รูปภาพไม่ถูกต้อง','Invalid image file')})};
   img.onload=function(){var c=document.getElementById(PAD);if(!c)return;var ctx=c.getContext('2d'),s=Math.min(c.width/img.width,c.height/img.height),w=img.width*s,h=img.height*s;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);if(popup)popup.finish({bad:false,msg:tl('แนบรูปลายเซ็นเรียบร้อย','Signature image attached')})};
   img.src=reader.result;
  };
  reader.readAsDataURL(file);input.value='';
 };

 var baseOpen=window.imodePortalOpenQuote;
 if(typeof baseOpen==='function'){
  window.imodePortalOpenQuote=function(id){
   var r=baseOpen.apply(this,arguments);
   try{attachPanel(id)}catch(e){}
   return r;
  };
 }

 function fail(msg){
  var el=document.getElementById('pqaError');
  if(el)el.textContent=msg;
  toast(msg);
 }
 window.imodePortalApproveQuote=function(id){
  var q=quoteList().filter(function(x){return x&&x.id===id})[0];
  if(!q){fail(tl('ไม่พบใบเสนอราคานี้','Quotation not found'));return}
  if(isApproved(id)&&editApprovalId!==id){toast(tl('ใบเสนอราคานี้อนุมัติแล้ว','Already approved'));return}
  var nameEl=document.getElementById('pqaName');
  var name=nameEl?String(nameEl.value||'').trim():'';
  if(!name){fail(tl('กรุณากรอกชื่อผู้อนุมัติ','Please enter the approver name'));if(nameEl)nameEl.focus();return}
  if(!padHasInk(PAD)){fail(tl('กรุณาเซ็นลายเซ็นในกรอบก่อนกดอนุมัติ','Please sign in the box before approving'));return}
  if(!saveApproval(id,name,shrink(PAD))){
   fail(tl('บันทึกการอนุมัติไม่สำเร็จ กรุณาลองใหม่','Could not save the approval — please try again'));
   return;
  }
  editApprovalId='';
  toast(tl('อนุมัติใบเสนอราคาเรียบร้อยแล้ว ขอบคุณค่ะ','Quotation approved — thank you'));
  try{window.imodePortalOpenQuote(id)}catch(e){}
 };

 document.addEventListener('click',function(e){
  if(!e.target||!e.target.closest)return;
  var edit=e.target.closest('[data-pqa-edit]');
  if(edit){e.preventDefault();editApprovalId=edit.getAttribute('data-pqa-edit')||'';var old=document.querySelector('.pqa-panel');if(old)old.remove();attachPanel(editApprovalId);return}
  var b=e.target.closest('[data-pqa-approve]');
  if(!b)return;
  e.preventDefault();
  window.imodePortalApproveQuote(b.getAttribute('data-pqa-approve'));
 });

 /* -------------------------------------------- 5. the office sees it too ---- */
 /* An approval nobody in the office can see is not an approval. js/43's ดูใบเสนอราคา rows and
    its document popup are post-processed the same way the portal list is. */
 function decorateStaff(){
  var host=document.getElementById('page-quote-view');
  if(!host)return;
  /* js/43 draws `.qv-row[data-quote]` with a `.qv-row-top` that already holds the id and the
     status pill, so the chip goes there and the row keeps its own layout. */
  [].slice.call(host.querySelectorAll('.qv-row[data-quote]')).forEach(function(el){
   var id=el.getAttribute('data-quote')||'';
   if(!id)return;
   if(!quoteList().some(function(x){return x&&x.id===id}))return;
   var want=chipHTML(id),old=el.querySelector('.pqa-chip');
   /* 2026-09-18: REPLACED, not skipped when present. The chip was drawn once and never
      looked at again, so a signature arriving while the page was open — which is exactly
      what realtime now delivers — left ยังไม่ได้อนุมัติ sitting there next to a quotation the
      customer had already approved. */
   if(old){
    if(old.outerHTML!==want)old.outerHTML=want;
    return;
   }
   var top=el.querySelector('.qv-row-top')||el.querySelector('.qv-row-main')||el;
   top.insertAdjacentHTML('beforeend',want);
  });
 }
 /* js/43 rebuilds the rows with innerHTML whenever its page is drawn — a filter, a page
    change, or a realtime update — which throws the chips away. renderAll() and goPage() are
    not enough on their own, because the page render runs AFTER them. */
 var baseQuoteView=window.imodeRenderQuoteView;
 if(typeof baseQuoteView==='function'){
  window.imodeRenderQuoteView=function(){
   var r=baseQuoteView.apply(this,arguments);
   try{decorateStaff()}catch(e){}
   return r;
  };
 }
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{decorateStaff()}catch(e){}
   return r;
  };
 }
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   try{decorateStaff()}catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70QuoteApprovalStyle';
 st.textContent=''
 +'.pqa-chip{display:inline-block;font-size:10.5px;font-weight:800;border-radius:999px;padding:3px 10px;'
 +'margin-left:6px;white-space:nowrap;border:1px solid transparent}'
 +'.pqa-chip.is-yes{background:#e9f9f1;color:#07603a;border-color:#b6e6cd}'
 +'.pqa-chip.is-no{background:#fdecec;color:#b3261e;border-color:#f5c2c0}'
 +'.pqa-filter{display:flex;gap:7px;flex-wrap:wrap;margin:2px 0 12px}'
 +'.pqa-fbtn{flex:1 1 auto;min-width:96px;padding:8px 10px;border-radius:11px;border:1px solid #d9e4f5;'
 +'background:#fff;color:#3d557f;font-size:11.5px;font-weight:700;cursor:pointer}'
 +'.pqa-fbtn:hover{border-color:#0b63e5}'
 +'.pqa-fbtn:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.pqa-fbtn.is-on{background:#0b63e5;border-color:#0b63e5;color:#fff}'
 /* อนุมัติแล้ว is green and ยังไม่ได้อนุมัติ is red, matching the row chips. */
 +'.pqa-fbtn.pqa-f-yes{border-color:#b6e6cd;background:#f2fbf6;color:#07603a}'
 +'.pqa-fbtn.pqa-f-no{border-color:#f5c2c0;background:#fff5f5;color:#b3261e}'
 +'.pqa-fbtn.pqa-f-yes.is-on{background:#0b8a4b;border-color:#0b8a4b;color:#fff}'
 +'.pqa-fbtn.pqa-f-no.is-on{background:#d92d20;border-color:#d92d20;color:#fff}'
 +'.pqa-panel{margin:14px 0 10px;padding:14px;border:1px solid #d9e4f5;border-radius:16px;background:#f7faff}'
 +'.pqa-panel.is-done{border-color:#b6e6cd;background:#f2fbf6}'
 +'.pqa-head{font-size:14px;font-weight:800;color:#0c225e;margin-bottom:5px}'
 +'.pqa-done-head{font-size:15px;font-weight:800;color:#07603a}'
 +'.pqa-done-meta{font-size:12px;color:#3f6552;margin-top:3px}'
 +'.pqa-done-sig{display:block;margin:9px 0 0;max-width:300px;width:100%;background:#fff;'
 +'border:1px solid #cfe7da;border-radius:10px;padding:4px}'
 +'.pqa-hint{font-size:11.5px;color:#5b6b88;line-height:1.6;margin:6px 0 10px}'
 +'.pqa-field{margin-bottom:10px}'
 +'.pqa-field label{display:block;font-size:11.5px;font-weight:700;color:#3d557f;margin-bottom:4px}'
 +'.pqa-field input{width:100%;padding:10px 12px;border:1px solid #d9e4f5;border-radius:11px;font-size:13px}'
 +'.pqa-field input:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.pqa-edit{margin-top:10px;padding:9px 13px;border:1px solid #9bc9ad;border-radius:10px;background:#fff;color:#07603a;font:inherit;font-size:12px;font-weight:800;cursor:pointer}'
 +'.pqa-attach{display:inline-flex;align-items:center;margin-top:8px;padding:9px 12px;border:1px solid #d9e4f5;border-radius:10px;background:#fff;color:#0c3d91;font-size:12px;font-weight:800;cursor:pointer}'
 +'.pqa-attach:hover{border-color:#0b63e5;background:#eef5ff}'
 +'.pqa-submit{display:block;width:100%;margin-top:11px;padding:13px;border:0;border-radius:12px;'
 +'background:linear-gradient(180deg,#14a35c,#0b8a4b);color:#fff;font-size:14px;font-weight:800;'
 +'cursor:pointer;box-shadow:0 5px 0 #086e3c}'
 +'.pqa-submit:hover{transform:translateY(-2px);box-shadow:0 7px 0 #086e3c}'
 +'.pqa-submit:active{transform:translateY(3px);box-shadow:0 1px 0 #086e3c}'
 +'.pqa-submit:focus-visible{outline:2px solid #0b63e5;outline-offset:3px}'
 +'.pqa-error{margin-top:8px;font-size:12px;color:#b3261e;font-weight:700;min-height:1em}'
 +'@media (prefers-reduced-motion:reduce){.pqa-submit:hover,.pqa-submit:active{transform:none}}';
 document.head.appendChild(st);
})();
