/* Beta 1.0 — the customer can open a quotation and read the real document. View only.

   Reported: "ทำให้ลูกค้ากดดูใบเสนอราคาได้หน่อย", from ใบเสนอราคาของฉัน on the customer page.

   js/34 already lists the customer's own quotations — id, date, status, machine count and
   the grand total — and that list is right. What it had was no way in: the rows were plain
   <div>s and the figure on them was a total with nothing behind it. A customer cannot tell
   what they are being charged for from one number.

   NOTHING IS RE-DRAWN HERE. quotationDocHTML() in js/03 is the real quotation paper the
   office prints, and it is what this view shows, through the same two repairs js/43 already
   makes for the staff module:

     * imodeQuoteWithTotals() recomputes serviceFee / travel / pickup / labor / other, which
       cloudUpsertQuotation() has no columns for, so a quotation opened on a device other
       than the one that built it still has its lines and not just its total;
     * the same call corrects `warranty`, stored as the STRING "false" in a text column and
       read back as true, which made quotationDocHTML() zero every machine line.

   Printing is the existing printQuotation(): it looks up #quotePreviewDoc anywhere in the
   document and re-prints its outerHTML in a window with its own styles, and the paper this
   view renders carries that id, so Save-as-PDF works for the customer with no new code.

   SCOPE IS RE-CHECKED, NOT TRUSTED. The row carries an id, so the open function re-applies
   js/34's own two rules — the quotation must belong to the scanned machine's customer, and
   it must not be ร่าง — instead of believing the attribute. A draft or somebody else's
   quotation therefore cannot be opened by editing the DOM.

   READ ONLY, as a property of the code: this file renders and nothing else. No form, no
   input, no save call; it never assigns to `quotations`, localStorage or Supabase.

   js/34 is not rewritten. It gained one attribute (data-pquote-id) and nothing else; without
   this file those rows are inert exactly as they were. window.showPortalQuotations is
   wrapped at parse time, so js/08's install() — which runs at DOMContentLoaded — wraps THIS
   version and the view keeps the portal's detail-mode header, machine strip and back arrow
   for free, the same way js/53 does for ประวัติ Service. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function content(){return document.getElementById('portalContent')}
 /* `quotations` is a top-level let in js/03 — a lexical global, absent from window. */
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}}
 function theMachine(){try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}}
 function fmtAt(v){try{return fmt(v)}catch(e){return String(v||'')}}
 /* money() is a top-level function declaration in js/03, so window.money is real; the
    fallback only covers a build where it is not. */
 function money(v){
  try{if(typeof window.money==='function')return window.money(v)}catch(e){}
  return (Number(v)||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' บาท';
 }

 /* The same two rules js/34's list uses, re-applied to whatever id arrives. */
 function findVisible(id){
  var m=theMachine(),cid=m&&m.customerId||'';
  if(!id||!cid)return null;
  return quoteList().filter(function(q){
   return q&&q.id===id&&q.customerId===cid&&String(q.status||'')!=='ร่าง';
  })[0]||null;
 }

 /* ------------------------------------------------------------- 1. the rows ---- */
 /* js/34 renders a <div>; a thing you press should be a button, so it gets the keyboard,
    the focus ring and css/21's press feel without any of that being re-implemented. The
    node is replaced rather than given role="button" for the same reason. */
 function upgradeRows(){
  var box=content();
  if(!box)return;
  [].slice.call(box.querySelectorAll('div.pquote-item[data-pquote-id]')).forEach(function(div){
   var id=div.getAttribute('data-pquote-id')||'';
   if(!id)return;
   var b=document.createElement('button');
   b.type='button';
   b.className='pquote-item is-open';
   b.setAttribute('data-pquote-open',id);
   b.setAttribute('aria-label',tl('เปิดดูใบเสนอราคา ','Open quotation ')+id);
   b.innerHTML=div.innerHTML
    +'<span class="pquote-open">'+esc2(tl('ดูใบเสนอราคา','View quotation'))+' ›</span>';
   div.parentNode.replaceChild(b,div);
  });
 }

 var baseList=window.showPortalQuotations;
 if(typeof baseList==='function'){
  window.showPortalQuotations=function(){
   var r=baseList.apply(this,arguments);
   try{upgradeRows()}catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------------------ 2. the paper ---- */
 function withTotals(q){
  try{
   if(typeof window.imodeQuoteWithTotals==='function')return window.imodeQuoteWithTotals(q);
  }catch(e){}
  return q;
 }

 window.imodePortalOpenQuote=function(id){
  var box=content();
  if(!box)return;
  var q=findVisible(id);
  if(!q){
   try{if(typeof toastMsg==='function')toastMsg(tl('ไม่พบใบเสนอราคานี้','Quotation not found'))}catch(e){}
   return;
  }
  var doc='';
  try{doc=window.quotationDocHTML(withTotals(q),q.id)||''}catch(e){doc=''}
  if(!doc){
   box.innerHTML='<button type="button" class="pqv-back" data-pqv-back="1">&lsaquo; '
    +esc2(tl('กลับไปรายการ','Back to the list'))+'</button>'
    +'<p class="pquote-empty">'+esc2(tl('เปิดเอกสารใบเสนอราคาไม่สำเร็จ กรุณาติดต่อทีม Service',
                                        'The quotation document could not be opened — please contact Service'))+'</p>';
   return;
  }
  box.innerHTML='<button type="button" class="pqv-back" data-pqv-back="1">&lsaquo; '
    +esc2(tl('กลับไปรายการ','Back to the list'))+'</button>'
   +'<div class="pqv-head"><h3>'+esc2(q.id||'-')+'</h3>'
     +'<span class="pquote-status">'+esc2(q.status||'-')+'</span></div>'
   +'<div class="pqv-meta">'+esc2(tl('ออกเมื่อ','Issued'))+' '+esc2(fmtAt(q.updatedAt||q.createdAt))+'</div>'
   /* The three figures the sheet's own summary box carries, repeated above it. On a phone
      the summary sits off the right-hand edge of a 900px sheet, and the total is the one
      thing a customer opens a quotation to see. They are q.subtotal / q.vat / q.grand as
      stored — imodeQuoteWithTotals() fills in line items and never touches these — so the
      block cannot disagree with the paper below it. */
   +'<div class="pqv-sum">'
     +'<div><small>'+esc2(tl('รวมเป็นเงิน','Total'))+'</small><b>'+esc2(money(q.subtotal))+'</b></div>'
     +'<div><small>'+esc2(tl('ภาษีมูลค่าเพิ่ม','VAT'))+'</small><b>'+esc2(money(q.vat))+'</b></div>'
     +'<div class="is-grand"><small>'+esc2(tl('ยอดรวมทั้งสิ้น','Grand Total'))+'</small><b>'+esc2(money(q.grand))+'</b></div>'
   +'</div>'
   /* The paper is an A4 layout with fixed grid columns. fitPaper() shrinks it to the width
      it has when that still leaves it readable, and lets it scroll inside its own box when
      it does not — the calendar solves the same problem the same way. The zoom goes on a
      wrapper, never on the document itself, so printQuotation() copies a clean #quotePreviewDoc. */
   +'<div class="pqv-paper"><div class="pqv-scale">'+doc+'</div>'
     +'<p class="pqv-swipe" hidden>'+esc2(tl('เลื่อนซ้าย–ขวาเพื่อดูเอกสารทั้งแผ่น หรือกดพิมพ์ / บันทึกเป็น PDF',
                                             'Swipe to see the whole sheet, or use Print / Save as PDF'))+'</p></div>'
   +'<button type="button" class="pquote-cta" data-pqv-print="1">🖨 '
     +esc2(tl('พิมพ์ / บันทึกเป็น PDF','Print / Save as PDF'))+'</button>'
   +'<p class="pqv-note">'+esc2(tl('เอกสารนี้แสดงเพื่อดูอย่างเดียว หากต้องการแก้ไขหรือยืนยันการสั่งซื้อ กรุณาติดต่อทีม Service',
                                   'This document is for reading only. To change or confirm it, please contact Service'))+'</p>';
  try{fitPaper()}catch(e){}
  try{box.scrollIntoView({block:'start'})}catch(e){}
 };

 /* The width is MEASURED, not assumed: the table inside the paper carries fixed pixel
    columns, so the sheet really needs about 880px however wide its own box is, and a
    constant guessed from the stylesheet left the Amount column cut off. The zoom is cleared
    before measuring, or the second call would scale an already-scaled sheet. Below MIN_ZOOM
    the type is too small to read, so the box scrolls instead and the hint says so. */
 var MIN_ZOOM=0.72;
 function fitPaper(){
  var box=content();
  var wrap=box&&box.querySelector('.pqv-paper');
  var scale=wrap&&wrap.querySelector('.pqv-scale');
  var doc=scale&&scale.querySelector('.quote-doc');
  if(!wrap||!scale||!doc)return;
  scale.style.zoom='';
  /* 2026-09-24 — the customer sees the same A4 page the office does: js/112 fixes the paper at
     210mm and scales it to fit, with its own พอดีจอ / 100% bar. This view never goes through
     openModal(), which is where js/112 hooks in, so it is asked for by name. Its own resize
     handling takes over; the zoom below stays as the fallback for a build without js/112. */
  if(typeof window.imodeA4Apply==='function'){
   try{window.imodeA4Apply(wrap);if(typeof window.imodeA4Fit==='function')window.imodeA4Fit()}catch(e){}
   var h=wrap.querySelector('.pqv-swipe');if(h)h.hidden=true;
   if(doc.classList.contains('imode-a4-page'))return;
  }
  var natural=Math.max(doc.scrollWidth||0,Math.round(doc.getBoundingClientRect().width)||0)||900;
  var avail=wrap.clientWidth-20;
  var z=(avail>0&&natural>0)?Math.min(1,avail/natural):1;
  scale.style.zoom=(z<1&&z>=MIN_ZOOM)?String(z):'';
  var hint=wrap.querySelector('.pqv-swipe');
  if(hint)hint.hidden=!(z<MIN_ZOOM);
 }
 window.addEventListener('resize',function(){try{fitPaper()}catch(e){}});

 /* ------------------------------------------------------------ 3. the wiring ---- */
 /* One delegated listener, so a row rendered by any later patch still works. */
 document.addEventListener('click',function(e){
  if(!e.target||!e.target.closest)return;
  if(e.target.closest('[data-pqv-print]')){
   e.preventDefault();
   try{if(typeof printQuotation==='function')printQuotation()}catch(x){}
   return;
  }
  if(e.target.closest('[data-pqv-back]')){
   e.preventDefault();
   if(typeof window.showPortalQuotations==='function')window.showPortalQuotations();
   return;
  }
  var row=e.target.closest('[data-pquote-open]');
  if(row){e.preventDefault();window.imodePortalOpenQuote(row.getAttribute('data-pquote-open'))}
 });

 /* While a quotation is open the header's back arrow belongs to the list, not to the portal
    home. Derived from the DOM rather than from a flag, so it cannot go stale. Registered
    after js/08's install(), js/22's wrapper and js/53's, so this one ends up outermost and
    falls through to js/53 when it is a case that is open. */
 document.addEventListener('DOMContentLoaded',function(){
  if(typeof window.imodePortalBackHome!=='function')return;
  var base=window.imodePortalBackHome;
  window.imodePortalBackHome=function(){
   var box=content();
   if(box&&box.querySelector('[data-pqv-back]')){window.showPortalQuotations();return}
   return base.apply(this,arguments);
  };
 });

 /* Appended at runtime like js/10, js/16 and js/53 do, rather than as a new stylesheet:
    css/21 and css/23 have to stay the last two <link>s. */
 var st=document.createElement('style');
 st.id='v70PortalQuoteViewStyle';
 st.textContent=''
 +'button.pquote-item{display:block;width:100%;text-align:left;font:inherit;cursor:pointer}'
 +'button.pquote-item:hover{border-color:#0b63e5;background:#f7fbff}'
 +'button.pquote-item:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.pquote-open{display:block;margin-top:8px;font-size:11.5px;font-weight:700;color:#0b3f9e;text-align:right}'
 +'.pqv-back{border:1px solid #e1e9f6;background:#fff;border-radius:10px;padding:7px 11px;'
 +'font-size:11.5px;font-weight:700;color:#0b3f9e;cursor:pointer;margin-bottom:10px}'
 +'.pqv-back:hover{border-color:#0b63e5}'
 +'.pqv-back:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.pqv-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 4px}'
 +'.pqv-head h3{margin:0;font-size:15px;color:#0c225e}'
 +'.pqv-meta{font-size:11.5px;color:#6f81a3;margin-bottom:10px}'
 +'.pqv-sum{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}'
 +'.pqv-sum>div{flex:1 1 120px;border:1px solid #e1e9f6;border-radius:11px;padding:8px 11px;background:#fbfdff}'
 +'.pqv-sum small{display:block;font-size:10.5px;color:#6f81a3}'
 +'.pqv-sum b{display:block;margin-top:3px;font-size:14px;color:#0c225e;white-space:nowrap}'
 +'.pqv-sum .is-grand{background:#f2f7ff;border-color:#cfe0fa}'
 +'.pqv-sum .is-grand b{color:#0b3f9e;font-size:16px}'
 +'.pqv-paper{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e1e9f6;'
 +'border-radius:12px;background:#fff;padding:10px}'
 +'.pqv-scale{display:block}'
 +'.pqv-paper .quote-doc.official{min-width:900px;margin:0}'
 +'.pqv-paper .quote-doc.official.imode-a4-page{min-width:0}'
 +'.pqv-paper:has(.imode-a4-fit){overflow-x:visible}'
 +'.pqv-swipe{margin:8px 0 0;font-size:10.5px;color:#6f81a3;text-align:center}'
 +'.pqv-swipe[hidden]{display:none!important}'
 +'.pqv-note{margin:12px 0 0;font-size:10.5px;color:#6f81a3;text-align:center;line-height:1.6}';
 document.head.appendChild(st);
})();
