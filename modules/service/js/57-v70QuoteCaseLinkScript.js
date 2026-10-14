/* Beta 1.0 — a quotation started from a customer request carries its case number.

   Reported, on ทำใบเสนอราคา: "ตอนนี้เวลากดมีข้อมูลมาด้วยละ แต่เลขเคสไม่มาด้วย อยากให้เลขเคสมาด้วย"
   — ลูกค้า / ผู้ติดต่อ / สถานที่ arrive, อ้างอิง Service Case stays empty.

   MEASURED, every route into that page, reading both the <select> and the visible combo box:

     prepareQuotation(caseId)                 select CASE-Q1   box empty
     ?page=quotation&caseId=  (detail page)   select CASE-Q1   box empty
     prepareServiceQuoteFromRequest(service)  select EMPTY     box empty
     prepareServiceQuoteFromRequest(quote)    select EMPTY     box empty

   So there were two faults, not one, and they look identical on screen:

     1. The combo box never followed a programmatic `.value` — fixed in js/35, where the
        property is now shadowed on the element so every caller is covered.

     2. THIS FILE. prepareServiceQuoteFromRequest() and prepareWarrantyQuoteFromRequest()
        in js/03 fill customer, contact, location, machine and service type and never touch
        qCase — yet submitPortalIssue() DOES open a real case for a แจ้งปัญหา request and
        records it as `req.caseId`. The link existed in the data the whole time and only the
        quotation builder was not told.

   The case is applied through the same two lines the case path uses — `qCase.value` then
   loadCaseIntoQuote() is NOT called, deliberately: the request has already filled the form
   with what the customer asked for, and re-reading the case would overwrite the service
   mode and the warranty choice the request carries. Only the reference is set.

   A request with no case keeps an empty reference, because there is none: ขอราคา Service
   and ซื้อ / ต่อ Warranty write a lineRequests row and no case at all. Inventing one, or
   guessing at an open case for the same machine, would attach the quotation to work nobody
   asked for. The field reads "ไม่อ้างอิงเคส", which is a true answer.

   js/03 is not edited. Both functions are top-level declarations, so replacing the window
   property changes what every caller resolves — js/49's คำขอจากลูกค้า rows and the request
   panel on the Customers page both go through it. */
(function(){
 'use strict';

 /* `lineRequests` and `cases` are top-level let in js/03 — lexical globals, absent from
    window — so they are read by bare identifier. Read, never assigned. */
 function requestById(id){
  try{return (Array.isArray(lineRequests)?lineRequests:[]).filter(function(r){return r&&r.id===id})[0]||null}
  catch(e){return null}
 }
 function caseExists(cid){
  try{return (Array.isArray(cases)?cases:[]).some(function(c){return c&&c.id===cid})}
  catch(e){return false}
 }

 /* Both base functions do their work inside a setTimeout(...,80) after goPage('quotation'),
    so this has to land after that. 160 ms is two of those, and the write is idempotent —
    if the field has since been set by hand it is left alone. */
 function applyCase(cid){
  if(!cid||!caseExists(cid))return;
  setTimeout(function(){
   try{
    var sel=document.getElementById('qCase');
    if(!sel||sel.value)return;
    if(![].slice.call(sel.options).some(function(o){return o.value===cid}))return;
    sel.value=cid;            /* js/35 shadows this, so the visible box follows */
   }catch(e){}
  },160);
 }

 ['prepareServiceQuoteFromRequest','prepareWarrantyQuoteFromRequest'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(id){
   var r=base.apply(this,arguments);
   try{
    var req=requestById(id);
    if(req&&req.caseId)applyCase(req.caseId);
   }catch(e){}
   return r;
  };
 });
})();
