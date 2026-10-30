/* 2026-10-31 — ทำใบเสนอราคา from the case page opened as a warranty quotation.

   Owner: "ทำไมมันถึงเป็นใบเสนอราคาประกัน ทั้งที่มันควรเป็น service เพราะกดจากหน้ารายละเอียดเคส".

   Measured: the case page hands off with ?page=quotation&caseId=, js/28 calls prepareQuotation(cid),
   and js/03 asks "เริ่มใบเสนอราคาใหม่จากเคสนี้หรือไม่?" whenever the builder looks used — which it
   always did, because renderQuotation() puts the first machine into an empty builder on its own
   (js/03, `if(!quoteMachineLines.length && machines.length)`). So every trip from the case page
   stopped on that question; answered with ยกเลิก (or not noticed on a phone) the case was never
   loaded and the builder stayed in whatever mode it was in — ประกัน included.

   The question is only skipped when nothing has really been entered: no quotation being edited,
   no customer, no case, no parts, and at most that one machine the page added itself. Anything
   the person typed still gets the question. The case then loads as before, and loadCaseIntoQuote
   (js/03) sets หน้างาน / Workshop / Diagnosis from the case — never ประกัน.

   js/03 is not edited. Remove this file and the question comes back. */
(function(){
 'use strict';
 function untouched(){
  try{
   if(quoteEditingId)return false;
   if(document.getElementById('qCustomer')&&qCustomer.value)return false;
   if(document.getElementById('qCase')&&qCase.value)return false;
   if(Array.isArray(quotePartLines)&&quotePartLines.length)return false;
   return !Array.isArray(quoteMachineLines)||quoteMachineLines.length<=1;
  }catch(e){return false}
 }
 var base=window.prepareQuotation;
 if(typeof base!=='function')return;
 window.prepareQuotation=function(cid){
  if(cid&&untouched()){try{quoteMachineLines=[]}catch(e){}}
  return base.apply(this,arguments);
 };
})();
