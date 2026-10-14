/* Beta — a customer form is sent once, however many times the button is tapped.

   Reported: "เวลาลูกค้ากดปุ่มส่งเคสรัวๆ เคสมันจะส่งรัวๆ แทนที่มันจะมา 1 เคสแต่มันมา 2".

   The three customer forms that create a record — แจ้งปัญหา (submitPortalIssue), ขอราคา
   Service (submitPortalServiceQuoteRequest) and ขอราคา Warranty (submitPortalWarrantyRequest)
   — are async in js/03 and all do the same thing: build the record, unshift it into
   cases / lineRequests and saveLocal() at once, then await up to three network round trips
   (sendPortalBackend, cloudUpsertLineRequest, cloudUpsertCase) before replacing the form.
   For that whole wait the form stays on screen with its button live and nothing changes, so
   the customer taps again — and every tap is a new record with a new id and a new ticket.
   With photos attached the wait is several seconds.

   WHAT THIS FILE DOES
     * the first submit marks that form element as sending; any further submit of the same
       element is swallowed — with preventDefault, or the browser would fall back to a native
       form submission and reload the page,
     * the button reads กำลังส่ง… and is disabled, so the customer can see it is working,
     * when the submit settles and the form is somehow still on screen (the base replaces it
       on success, and js/19 replaces the issue form on failure too), the form is released
       rather than left dead.

   The flag lives on the FORM ELEMENT, not in a variable: reopening a form draws a new
   element, so a second, deliberate report is never blocked by the first.

   A `submit` event only fires after the browser's own required-field check has passed, so an
   incomplete form is never locked.

   Wiring: portalIssueForm.onsubmit and portalWarrantyForm.onsubmit are assigned from the bare
   identifier when the form is opened, and the service-quote form calls
   submitPortalServiceQuoteRequest(event) inline. All three resolve the window property at that
   moment, so wrapping it here — this file loads last, outside js/19's own wrapper — covers
   every path. js/03 is not edited. */
(function(){
 'use strict';

 var NAMES=['submitPortalIssue','submitPortalServiceQuoteRequest','submitPortalWarrantyRequest'];
 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}

 function formOf(ev){
  var t=ev&&ev.target;
  if(t&&t.tagName==='FORM')return t;
  return t&&t.closest?t.closest('form'):null;
 }
 function submitButtons(form){
  return Array.prototype.slice.call(
   form.querySelectorAll('button:not([type="button"]):not([type="reset"]),input[type="submit"]'));
 }
 function busy(form,on){
  submitButtons(form).forEach(function(b){
   var isInput=b.tagName==='INPUT';
   if(on){
    if(b.dataset.imodeLabel==null)b.dataset.imodeLabel=isInput?b.value:b.innerHTML;
    b.disabled=true;
    b.setAttribute('aria-busy','true');
    var txt='⏳ '+tl('กำลังส่ง…','Sending…');
    if(isInput)b.value=txt;else b.textContent=txt;
   }else{
    if(b.dataset.imodeLabel!=null){
     if(isInput)b.value=b.dataset.imodeLabel;else b.innerHTML=b.dataset.imodeLabel;
     delete b.dataset.imodeLabel;
    }
    b.disabled=false;
    b.removeAttribute('aria-busy');
   }
  });
 }
 function release(form){
  if(!form||!form.isConnected)return;
  delete form.dataset.imodeSending;
  busy(form,false);
 }

 NAMES.forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(ev){
   var form=formOf(ev);
   if(form&&form.dataset.imodeSending==='1'){
    if(ev&&typeof ev.preventDefault==='function')ev.preventDefault();
    return;
   }
   if(form){form.dataset.imodeSending='1';busy(form,true)}
   var out;
   try{out=base.apply(this,arguments)}
   catch(err){release(form);throw err}
   if(out&&typeof out.then==='function')out.then(function(){release(form)},function(){release(form)});
   else release(form);
   return out;
  };
 });
})();
