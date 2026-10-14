/* Beta 1.0 — the signed quotation goes back to the office, and the case page can show it.

   REPORTED 2026-09-17: on ใบเสนอราคาของฉัน, after the customer has signed, "อยากให้มีปุ่มส่งไปให้
   แอดมิน แอดมินจะได้ใบเสนอราคาตัวเต็มในหน้ารายละเอียดเคสเลย" — and on the case page, under step 2,
   a ใบเสนอราคาของเคสนี้ section with its own track: ส่งให้ลูกค้าแล้ว → รอลูกค้าเซ็น → ลูกค้าส่งกลับมา
   → เสร็จสิ้น, then on to นัดหมาย. Decided with the owner: เสร็จสิ้น is the admin pressing ยืนยัน,
   and step 3 is NOT locked behind it.

   This file is the application half. service-case-detail.html is the other.

   ---------------------------------------------------------------- WHERE EACH FACT LIVES
   ลูกค้าเซ็นแล้ว     settings.quoteApprovals[id]          (js/75, unchanged)
   ลูกค้าส่งกลับมา    settings.quoteApprovals[id].sentAt   (here — the customer's device can only
                                                          push settings, as js/75 already does)
   เสร็จสิ้น           quotation.status = 'อนุมัติ'          (a real column, written by the case page
                                                          with update(), and by the app through
                                                          cloudUpsertQuotation)

   ---------------------------------------------------------------- THE FULL PAPER
   The case page is a document of its own and cannot run quotationDocHTML(): that function
   needs js/03's rate tables, machine helpers and settings. Rebuilding it there would be a second
   copy of an official form, which is how a field added to one silently stops appearing in the
   other. So the application renders the real paper and keeps the HTML in
   settings.quoteDocs[id] = {html, fp, at}; the case page only displays it.

   - Rendered for quotations that belong to a case and have left ร่าง.
   - Re-rendered when the fingerprint moves (status, approval, sentAt, updatedAt), so the
     customer's signature appears in the stored paper once they have signed.
   - Rendered on a STAFF device, after renderAll(). A customer's phone renders only the one
     quotation they send back — it must not be pushing papers for every quotation it can see.
   - Capped at DOC_CAP newest. settings travels as one row; a row that grows without limit
     breaks settings sync for everybody (part 17 §10). The signature image is NOT kept inside
     the stored HTML — it is already in quoteApprovals and the case page puts it back — so each
     paper is a few KB of markup. */
(function(){
 'use strict';

 var DOC_CAP=25;
 var DONE_STATUS='อนุมัติ';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}}
 function quoteById(id){return quoteList().filter(function(q){return q&&q.id===id})[0]||null}
 function approvals(){
  try{
   if(!settings.quoteApprovals||typeof settings.quoteApprovals!=='object')settings.quoteApprovals={};
   return settings.quoteApprovals;
  }catch(e){return {}}
 }
 function docs(){
  try{
   if(!settings.quoteDocs||typeof settings.quoteDocs!=='object')settings.quoteDocs={};
   return settings.quoteDocs;
  }catch(e){return {}}
 }
 function isDraft(q){
  try{if(typeof window.imodeQuoteIsDraft==='function')return window.imodeQuoteIsDraft(q)}catch(e){}
  return String(q&&q.status||'ร่าง')==='ร่าง';
 }
 function onPortal(){
  var p=document.getElementById('page-customer-portal');
  return !!(p&&p.classList.contains('active'));
 }
 function isStaff(){
  try{return !!currentUser&&!onPortal()}catch(e){return false}
 }
 function push(){
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }

 /* ------------------------------------------------------- 1. the paper ---- */
 function fingerprint(q){
  var a=approvals()[q.id]||{},ss={};
  try{ss=(settings.quoteStaffSigns&&settings.quoteStaffSigns[q.id])||{}}catch(e){}
  return ['sig-id-v2',q.status||'',q.updatedAt||'',a.at||'',a.sentAt||'',q.grand||'',
   (ss.authorized&&ss.authorized.at)||'',(ss.prepared&&ss.prepared.at)||''].join('|');
 }
 function renderPaper(q){
  if(typeof quotationDocHTML!=='function')return '';
  var full=q;
  try{if(typeof window.imodeQuoteWithTotals==='function')full=window.imodeQuoteWithTotals(q)||q}catch(e){}
  var html=quotationDocHTML(full,q.id)||'';
  /* The signature rides in quoteApprovals already; strip the data URL out of the stored copy
     and let the case page put it back from there. */
  return html.replace(/<img src="data:image\/[^"]*"[^>]*>/g,'');
 }
 function keepPaper(q){
  var d=docs(),fp=fingerprint(q);
  if(d[q.id]&&d[q.id].fp===fp)return false;
  var html='';
  try{html=renderPaper(q)}catch(e){return false}
  if(!html)return false;
  d[q.id]={html:html,fp:fp,at:new Date().toISOString(),caseId:q.caseId||''};
  return true;
 }
 function trim(){
  var d=docs(),ids=Object.keys(d);
  if(ids.length<=DOC_CAP)return;
  ids.sort(function(a,b){return new Date(d[b].at||0)-new Date(d[a].at||0)});
  ids.slice(DOC_CAP).forEach(function(k){delete d[k]});
 }
 function refreshPapers(){
  if(!isStaff())return;
  var list=quoteList().filter(function(q){return q&&q.id&&q.caseId&&!isDraft(q)})
   .sort(function(a,b){return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)})
   .slice(0,DOC_CAP);
  var changed=false;
  list.forEach(function(q){if(keepPaper(q))changed=true});
  if(!changed)return;
  trim();
  push();
 }
 var timer=0;
 function schedule(){clearTimeout(timer);timer=setTimeout(function(){try{refreshPapers()}catch(e){}},1500)}
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   schedule();
   return r;
  };
 }
 window.imodeRefreshQuotePapers=refreshPapers;

 /* --------------------------------------- 2. the customer sends it back ---- */
 function sendBackHTML(q){
  var a=approvals()[q.id];
  if(!a)return '';
  if(String(q.status||'')===DONE_STATUS){
   return '<div class="qho-state is-done">✅ '+esc2(tl('แอดมินยืนยันใบเสนอราคาแล้ว ทีม Service จะติดต่อนัดหมาย',
     'The office has confirmed this quotation. Service will contact you to book a visit.'))+'</div>';
  }
  if(a.sentAt){
   var when='';
   try{when=typeof fmt==='function'?fmt(a.sentAt):a.sentAt}catch(e){when=a.sentAt}
   return '<div class="qho-state is-sent">📤 '+esc2(tl('ส่งให้แอดมินแล้ว','Sent to the office'))
    +' · '+esc2(when)+'<small>'+esc2(tl('รอแอดมินตรวจสอบและยืนยัน','Waiting for the office to confirm'))+'</small></div>';
  }
  return '<button type="button" class="qho-send" data-qho-send="'+esc2(q.id)+'">📤 '
   +esc2(tl('ส่งใบเสนอราคาให้แอดมิน','Send the quotation to the office'))+'</button>';
 }
 function decorate(id){
  var box=document.getElementById('portalContent');
  var panel=box&&box.querySelector('.pqa-panel.is-done');
  if(!panel||panel.querySelector('.qho-state,.qho-send'))return;
  var q=quoteById(id);
  if(!q)return;
  var html=sendBackHTML(q);
  if(html)panel.insertAdjacentHTML('beforeend',html);
 }
 var baseOpen=window.imodePortalOpenQuote;
 if(typeof baseOpen==='function'){
  window.imodePortalOpenQuote=function(id){
   var r=baseOpen.apply(this,arguments);
   try{decorate(id)}catch(e){}
   return r;
  };
 }
 window.imodePortalSendQuoteBack=function(id){
  var q=quoteById(id),a=approvals()[id];
  if(!q){toast(tl('ไม่พบใบเสนอราคานี้','Quotation not found'));return false}
  if(!a){toast(tl('กรุณาเซ็นอนุมัติก่อนส่งให้แอดมิน','Please sign the quotation first'));return false}
  if(a.sentAt)return true;
  a.sentAt=new Date().toISOString();
  /* This device renders only this one paper — the office needs it now, not at its next load. */
  try{keepPaper(q);trim()}catch(e){}
  push();
  toast(tl('ส่งใบเสนอราคาให้แอดมินแล้ว ขอบคุณค่ะ','Sent to the office — thank you'));
  try{window.imodePortalOpenQuote(id)}catch(e){}
  return true;
 };
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('[data-qho-send]');
  if(!b)return;
  e.preventDefault();
  if(b.disabled)return;
  b.disabled=true;
  window.imodePortalSendQuoteBack(b.getAttribute('data-qho-send'));
 });

 var st=document.createElement('style');
 st.id='v70QuoteHandoffStyle';
 st.textContent=''
 +'.qho-send{display:block;width:100%;margin-top:12px;padding:13px;border:0;border-radius:12px;'
 +'background:linear-gradient(180deg,#1672ff,#0b63e5);color:#fff;font-size:14px;font-weight:800;cursor:pointer;'
 +'box-shadow:0 5px 0 #084bad}'
 +'.qho-send:hover{transform:translateY(-2px);box-shadow:0 7px 0 #084bad}'
 +'.qho-send:active{transform:translateY(3px);box-shadow:0 1px 0 #084bad}'
 +'.qho-send:disabled{opacity:.6;cursor:default;transform:none}'
 +'.qho-send:focus-visible{outline:2px solid #0b63e5;outline-offset:3px}'
 +'.qho-state{margin-top:12px;padding:11px 13px;border-radius:12px;font-size:13px;font-weight:800}'
 +'.qho-state small{display:block;font-weight:400;font-size:11.5px;margin-top:3px}'
 +'.qho-state.is-sent{background:#eef4ff;color:#0b4fb8;border:1px solid #cfe0fb}'
 +'.qho-state.is-done{background:#e9f9f1;color:#07603a;border:1px solid #b6e6cd}'
 +'@media (prefers-reduced-motion:reduce){.qho-send:hover,.qho-send:active{transform:none}}';
 document.head.appendChild(st);
})();
