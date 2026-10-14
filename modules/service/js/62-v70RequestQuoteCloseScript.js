/* Beta 1.0 — a quote request closes itself when the quotation is sent.

   REPORTED (2026-09-15): "ในหน้าคำขออยากให้เวลาทำเสร็จแล้วคำขอนั้นจะหายไปจากหน้าคำขอ เช่น
   ลูกค้าขอใบเสนอราคา เรากดทำ กดส่ง ตอนกดส่งให้เอาคำขอนี้ออกจากหน้าคำขอ".

   The other half of that sentence — a แจ้งปัญหา leaving once its case is picked up — has
   worked since part 21 (js/49's pickedUp()). A QUOTE request had no way out at all: nothing
   in the project ever linked a quotation back to the request it was built from, so
   ขอราคา Service and ขอราคา Warranty sat in the inbox for ever however much work was done.

   เช็คประกัน needs nothing, and the owner was right about why: showPortalWarranty() answers
   the customer on the spot and writes no request. `warranty_check` is a filter label in
   js/49 and js/61 that no code path can ever produce.

   WHAT THIS FILE DOES

     * pressing ทำใบเสนอราคา on a request moves it to กำลังดำเนินการ, so the inbox shows that
       somebody has it. It stays listed — the work is not finished yet.
     * saving the quotation records which request it came from.
     * pressing ส่งให้ลูกค้า marks that request เสร็จสิ้น, which js/49 now treats as "out of
       the inbox". Nothing is lost: ประวัติคำขอ (js/61) keeps every request ever received.

   THE LINK, and why it is where it is. `quotations` has no column for a request id —
   cloudUpsertQuotation() writes an explicit whitelist, the same one that already drops the
   derived breakdown (part 18 §4) — so a field on the quotation would never leave the device.
   It is kept in `settings.quoteRequestLink` instead, because settings travel whole. When even
   that is missing (a quotation prepared on one device and sent from another) the send falls
   back to matching the request by customer, machine and kind, which is narrow enough to be
   safe: a Warranty request is only ever closed by a WP quotation and a Service request only
   by a non-WP one.

   `lineRequests` rows DO carry status to Supabase — `status` is in cloudUpsertLineRequest()'s
   whitelist — so the close itself reaches every device even when the link did not.

   js/03 is not edited. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function reqList(){try{return Array.isArray(lineRequests)?lineRequests:[]}catch(e){return []}}
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return []}}
 function reqById(id){return reqList().filter(function(r){return r.id===id})[0]||null}
 function isQuoteReq(r){return r&&(r.type==='service_quote'||r.type==='warranty_quote')}
 function save(){try{if(typeof saveLocal==='function')saveLocal()}catch(e){}}
 function pushReq(r){try{if(typeof cloudUpsertLineRequest==='function')cloudUpsertLineRequest(r)}catch(e){}}
 function repaint(){
  try{if(typeof window.imodeRenderRequests==='function')window.imodeRenderRequests()}catch(e){}
  try{if(typeof window.imodeRenderRequestLog==='function')window.imodeRenderRequestLog()}catch(e){}
  try{if(typeof renderLineRequests==='function')renderLineRequests()}catch(e){}
  try{if(typeof window.imodePaintRequestBadge==='function')window.imodePaintRequestBadge()}catch(e){}
 }

 /* ------------------------------------------------------------- the link ---- */
 function links(){
  try{
   if(!settings.quoteRequestLink||typeof settings.quoteRequestLink!=='object')settings.quoteRequestLink={};
   return settings.quoteRequestLink;
  }catch(e){return {}}
 }
 function linkQuote(quoteId,reqId){
  if(!quoteId||!reqId)return;
  var map=links();
  if(map[quoteId]===reqId)return;
  map[quoteId]=reqId;
  save();
 }
 /* Only used when no link was recorded — see the header. */
 function guessRequest(q){
  if(!q)return null;
  var wantWarranty=String(q.service||'')==='WP';
  var ids=(q.machineIds||[]).slice();
  var open=reqList().filter(function(r){
   if(!isQuoteReq(r))return false;
   if(String(r.status||'')==='เสร็จสิ้น')return false;
   if(String(r.customerId||'')!==String(q.customerId||''))return false;
   if((r.type==='warranty_quote')!==wantWarranty)return false;
   return !ids.length||!r.machineId||ids.indexOf(r.machineId)>=0;
  });
  /* Never guess between two: closing the wrong customer request is worse than leaving one. */
  return open.length===1?open[0]:null;
 }
 function requestFor(q){
  if(!q)return null;
  var id=links()[q.id];
  return (id&&reqById(id))||guessRequest(q);
 }
 window.imodeRequestForQuote=requestFor;

 /* -------------------------------------------- 1. ทำใบเสนอราคา = somebody has it ---- */
 var pendingReq='';
 ['prepareServiceQuoteFromRequest','prepareWarrantyQuoteFromRequest'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(id){
   pendingReq=id||'';
   var out=base.apply(this,arguments);
   try{
    var r=reqById(id);
    if(r&&String(r.status||'')==='ใหม่'){
     r.status='กำลังดำเนินการ';
     save();pushReq(r);repaint();
    }
   }catch(e){}
   return out;
  };
 });

 /* ---------------------------------------------- 2. saving records the link ---- */
 /* saveQuotation() sets quoteEditingId synchronously, before its first await, so the id of
    the row it has just written is readable the moment the call returns. quoteEditingId is a
    top-level `let` in js/03 — a lexical global, never a property of window (part 17 §5). */
 var baseSave=window.saveQuotation;
 if(typeof baseSave==='function'){
  window.saveQuotation=function(){
   var out=baseSave.apply(this,arguments);
   try{
    var id='';
    try{id=quoteEditingId||''}catch(e){}
    if(id&&pendingReq&&reqById(pendingReq))linkQuote(id,pendingReq);
   }catch(e){}
   return out;
  };
 }
 /* Starting a fresh quotation is no longer answering that request. */
 var baseReset=window.resetQuote;
 if(typeof baseReset==='function'){
  window.resetQuote=function(){pendingReq='';return baseReset.apply(this,arguments)};
 }

 /* ------------------------------------------------- 3. ส่งให้ลูกค้า closes it ---- */
 var baseSend=window.imodeSendQuoteToCustomer;
 if(typeof baseSend==='function'){
  window.imodeSendQuoteToCustomer=function(id,quiet){
   var q=quoteList().filter(function(x){return x.id===id})[0];
   var draft=!q||(typeof window.imodeQuoteIsDraft!=='function')||window.imodeQuoteIsDraft(q);
   var out=baseSend.apply(this,arguments);
   /* Only a send that really happened closes the request — pressing it on a quotation that
      was already sent must not reopen and re-close anything. */
   if(!draft)return out;
   try{
    var r=requestFor(q);
    if(r&&String(r.status||'')!=='เสร็จสิ้น'){
     r.status='เสร็จสิ้น';
     save();pushReq(r);repaint();
     if(!quiet)toast(tl('ปิดคำขอของลูกค้าแล้ว — ออกจากกล่องคำขอ',
                        'The customer request is closed and has left the inbox'));
    }
   }catch(e){}
   if(pendingReq&&q&&links()[q.id]===pendingReq)pendingReq='';
   return out;
  };
 }
})();
