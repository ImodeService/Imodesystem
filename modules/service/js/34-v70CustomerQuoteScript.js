/* Beta — the customer Home page can see the quotations made for that customer.

   Asked for: "เวลาแอดมินกดสร้างใบเสนอราคาของลูกค้าเจ้านั้นๆ เสร็จ ใบเสนอราคาจะถูกส่งมายัง
   หน้านั้น". The page already had ขอราคา Service, which sends a *request* in; there was
   nothing that showed the answer coming back.

   No new delivery mechanism was needed and none was built. saveQuotation() in js/03
   already writes to the quotations array and calls cloudUpsertQuotation(), and syncCloud()
   already downloads the quotations table, so a quotation created on the coordinator's PC
   is on the customer's phone as soon as that phone syncs. What was missing was only a view
   of it, which is what this file adds.

   Scope: the customer's OWN quotations, matched on customerId, newest first. It is
   deliberately the customer and not the scanned machine — a quotation covers a list of
   machines (q.machineIds) and often several at once, so filtering by the one machine in
   hand would hide quotations that legitimately include it alongside others. The machine
   that was scanned is marked with a chip on the rows that contain it, so the visitor can
   still tell which quotation is about the machine in front of them.

   Drafts are not shown. A quotation at ร่าง is the coordinator still working on it; it
   has not been sent to anybody, and putting it in front of the customer would turn every
   half-finished calculation into an offer. Everything from the first real status onward
   is shown, including cancelled and expired ones, because a customer asking "what happened
   to that quote" needs to see that outcome rather than an empty page.

   How it reaches the screen: js/08 owns the portal's detail mode — the back arrow, the
   machine context strip and the .imode-portal-detail-mode class that js/22 watches to give
   the phone Back button something to do. It wraps its detail views by name inside an
   install() that runs at DOMContentLoaded, so a function defined here at parse time is
   already on window when that runs and gets wrapped exactly like showPortalHistory(). One
   line was added to js/08's wrap list; nothing else there changed.

   Read-only. This file writes nothing and changes no storage key. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function fmtDate(v){
  try{return (v&&typeof fmt==='function')?fmt(v):(v||'-')}catch(e){return v||'-'}
 }
 function money(v){
  try{if(typeof window.money==='function')return window.money(v)}catch(e){}
  var n=Number(v)||0;
  return n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' ฿';
 }
 function machine(){
  try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}
 }
 function quoteList(){
  try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}
 }

 /* ร่าง is the only status held back — see the header. Anything else has left the office. */
 function isVisible(q){return String(q&&q.status||'')!=='ร่าง'}

 /* A quotation's own status vocabulary is configurable (settings.quotationStatuses), so
    the colour is chosen by meaning rather than by an exhaustive list, and anything
    unrecognised simply gets the neutral chip. */
 function statusTone(status){
  var s=String(status||'');
  if(/อนุมัติ|ยอมรับ|ตกลง|approved|accept/i.test(s))return 'ok';
  if(/ยกเลิก|ปฏิเสธ|หมดอายุ|cancel|reject|expire/i.test(s))return 'off';
  if(/รอ|ส่ง|pending|sent/i.test(s))return 'wait';
  return '';
 }

 function rowHTML(q,mid){
  var mine=mid&&Array.isArray(q.machineIds)&&q.machineIds.indexOf(mid)>=0;
  var count=(q.machineIds||[]).length;
  /* The id travels on the row so js/56 can turn it into a button that opens the document.
     On its own the attribute does nothing — remove js/56 and these rows are inert again. */
  return '<div class="pquote-item" data-pquote-id="'+esc2(q.id||'')+'">'
   +'<div class="pquote-top">'
   +'<b>'+esc2(q.id||'-')+'</b>'
   +'<span class="pquote-status '+statusTone(q.status)+'">'+esc2(q.status||'-')+'</span>'
   +'</div>'
   +'<div class="pquote-meta">'+esc2(fmtDate(q.updatedAt||q.createdAt))
   +(count?' · '+esc2(tl('เครื่อง','Machines'))+' '+count:'')
   +(mine?' <span class="pquote-thismachine">'+esc2(tl('เครื่องนี้','this machine'))+'</span>':'')
   +'</div>'
   +'<div class="pquote-total"><small>'+esc2(tl('ยอดรวม','Total'))+'</small><b>'+esc2(money(q.grand))+'</b></div>'
   +'</div>';
 }

 /* The name js/08 wraps. Rendering into portalContent is all a portal detail view does;
    the toolbar, the back arrow and the machine strip are added by that wrapper. */
 window.showPortalQuotations=function(){
  var m=machine();
  var content=document.getElementById('portalContent');
  if(!content)return;
  var cid=m&&m.customerId||'';
  var list=cid?quoteList().filter(function(q){return q.customerId===cid&&isVisible(q)}):[];
  list.sort(function(a,b){
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
  var head='<h3>🧾 '+esc2(tl('ใบเสนอราคาของฉัน','My quotations'))+'</h3>';
  if(!cid){
   content.innerHTML=head+'<p class="pquote-empty">'
    +esc2(tl('ยังไม่ทราบว่าเครื่องนี้เป็นของลูกค้ารายใด กรุณาติดต่อทีม Service',
             'This machine is not linked to a customer yet — please contact Service'))+'</p>';
   return;
  }
  if(!list.length){
   content.innerHTML=head+'<p class="pquote-empty">'
    +esc2(tl('ยังไม่มีใบเสนอราคาสำหรับบริษัทของคุณ เมื่อทีมงานจัดทำเสร็จ ใบเสนอราคาจะแสดงที่นี่',
             'No quotations yet. When the team issues one, it appears here.'))+'</p>'
    +'<button type="button" class="pquote-cta" onclick="openPortalServiceQuoteRequest()">'
    +esc2(tl('ขอใบเสนอราคา Service','Request a service quotation'))+' ›</button>';
   return;
  }
  content.innerHTML=head+list.map(function(q){return rowHTML(q,m&&m.id)}).join('');
 };

 var st=document.createElement('style');
 st.id='v70CustomerQuoteStyle';
 st.textContent=''
 +'.pquote-item{border:1px solid #e1e9f6;border-radius:14px;padding:12px 13px;margin-bottom:9px;background:#fff}'
 +'.pquote-top{display:flex;align-items:center;justify-content:space-between;gap:10px}'
 +'.pquote-top b{font-size:14px;color:#0c225e}'
 +'.pquote-status{font-size:10.5px;font-weight:700;border-radius:999px;padding:3px 10px;'
 +'background:#eef3fb;color:#3d557f;border:1px solid #dbe5f5;white-space:nowrap}'
 +'.pquote-status.ok{background:#e9f9f1;color:#07603a;border-color:#b6e6cd}'
 +'.pquote-status.wait{background:#fff6e8;color:#8a5a17;border-color:#f6dcb8}'
 +'.pquote-status.off{background:#fdecec;color:#a02020;border-color:#f2c9c9}'
 +'.pquote-meta{margin-top:5px;font-size:11.5px;color:#6f81a3}'
 +'.pquote-thismachine{display:inline-block;font-size:10px;font-weight:700;color:#0b3f9e;'
 +'background:#eaf3ff;border:1px solid #cfe0fa;border-radius:999px;padding:1px 8px}'
 +'.pquote-total{display:flex;align-items:baseline;justify-content:space-between;gap:10px;'
 +'margin-top:9px;padding-top:9px;border-top:1px dashed #e1e9f6}'
 +'.pquote-total small{font-size:11px;color:#6f81a3}'
 +'.pquote-total b{font-size:16px;color:#0b3f9e}'
 +'.pquote-empty{font-size:13px;color:#5b6b88;line-height:1.6}'
 +'.pquote-cta{display:block;width:100%;margin-top:10px;padding:12px;border-radius:12px;'
 +'border:1px solid #cfe0fa;background:#f2f7ff;color:#0b3f9e;font-size:13px;font-weight:700;cursor:pointer}'
 +'.pquote-cta:hover{background:#e7f0ff;border-color:#0b63e5}'
 +'.pquote-cta:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
 document.head.appendChild(st);
})();
