/* Beta 1.0 — the destination survives the login door.

   This file was written when the door was per page load (part 18) and then per browser tab.
   Both are gone: the owner's instruction on 2026-09-11 is "ล็อคอินแค่รอบเดียว ตอนเปลี่ยน
   Account หรือตอนเข้าเว็บครั้งแรก", so js/46's gate is withdrawn at the source and a session
   now lives until it expires, until the user signs out, or until somebody switches account —
   which still asks for a password, in js/46 part 2.

   What is left here is the second half of the same report, and it is still needed: a visitor
   who arrives with no session at all is sent to the door by js/11's bootRoute(), and
   js/28's spendUrl() deletes ?page= / ?caseId= / ?intent= at load + 380 ms — BEFORE they can
   type a password. So the page they asked for was thrown away and submitStaffLogin() fell
   back to the Home board. Measured: the query string is already empty while the login page is
   on screen.

   The stash runs on DOMContentLoaded, which is how it gets ahead of js/28's `load` + 380 ms,
   and the wrapper on imodeRoleHomeAfterLogin — the one funnel every staff door uses,
   submitStaffLogin(), the legacy demo picker and auth-integration's routeAfterLogin() —
   spends it instead of going Home. When there IS a session nothing is touched and js/28
   behaves exactly as it always did.

   Loads after js/46 and after js/28. */
(function(){
 'use strict';

 var PENDING='imode_v70_pending_route';   /* sessionStorage — where they were going */

 function ss(){try{return window.sessionStorage}catch(e){return null}}

 /* The same customer test js/01 and js/46 use. A machine QR, ?serial= and the LINE rich-menu
    routes have no account behind them at all and must never meet a door. */
 function customerRoute(){
  try{
   return /[?&]machineToken=/.test(location.search)
       || /[?&]serial=/.test(location.search)
       || /[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search)
       || /#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash)
       || /customer-portal/.test(location.hash);
  }catch(e){return false}
 }

 /* --------------------------------------------- 1. remember where they were going ---- */
 /* js/28 spends these params at load + 380 ms. This runs on DOMContentLoaded, so it reads
    them first, and takes them out of the URL itself when the visitor is about to be stopped
    at the door — otherwise js/28 would route a logged-out visitor and throw the destination
    away. When there IS a session, nothing is touched and js/28 behaves exactly as before. */
 function stashRoute(){
  var p,page;
  try{p=new URLSearchParams(location.search);page=String(p.get('page')||'').trim()}catch(e){return}
  if(!page)return;
  var s=ss();
  if(!s)return;
  try{
   s.setItem(PENDING,JSON.stringify({
    page:page,
    caseId:String(p.get('caseId')||''),
    intent:String(p.get('intent')||''),
    q:String(p.get('q')||'')
   }));
   var u=new URL(location.href);
   ['page','caseId','intent','q'].forEach(function(k){u.searchParams.delete(k)});
   var qs=u.searchParams.toString();
   history.replaceState(history.state||null,'',u.pathname+(qs?'?'+qs:'')+u.hash);
  }catch(e){}
 }
 function takeRoute(){
  var s=ss();
  if(!s)return null;
  try{
   var raw=s.getItem(PENDING);
   if(!raw)return null;
   s.removeItem(PENDING);
   var o=JSON.parse(raw);
   return (o&&o.page)?o:null;
  }catch(e){return null}
 }
 /* The same three things js/28's router does once it has a page and a case. */
 function applyRoute(o){
  if(!o||typeof window.goPage!=='function')return false;
  try{window.goPage(o.page)}catch(e){return false}
  if(!o.caseId)return true;
  var c=null;
  try{c=(Array.isArray(cases)?cases:[]).filter(function(x){return x.id===o.caseId})[0]||null}catch(e){}
  if(!c)return true;                 /* an intent is a convenience, never a promise */
  setTimeout(function(){
   try{
    if(o.intent==='schedule'&&typeof window.imodeOpenAssignPicker==='function')window.imodeOpenAssignPicker(o.caseId);
    else if(o.intent==='status'&&typeof openCaseModal==='function')openCaseModal(o.caseId);
    /* 2026-09-18: the same one-shot marker js/28 reads — service-case-detail.html asks on its
       own page now, so a visitor who went through the login door on the way here is not asked
       a second time. Without a marker this is still the asking path. */
    else if(o.intent==='delete'&&typeof window.imodeDeleteCase==='function'){
     var okMark='';
     try{okMark=sessionStorage.getItem('imode_v70_delete_ok')||''}catch(e){}
     try{sessionStorage.removeItem('imode_v70_delete_ok')}catch(e){}
     if(okMark&&okMark===o.caseId&&typeof window.imodeDeleteCaseConfirmed==='function')
      window.imodeDeleteCaseConfirmed(o.caseId);
     else window.imodeDeleteCase(o.caseId);
    }
    else if(o.page==='quotation'&&typeof prepareQuotation==='function')prepareQuotation(o.caseId);
   }catch(e){}
  },280);
  return true;
 }

 /* Every staff door ends here — submitStaffLogin(), the legacy demo picker and
    auth-integration's routeAfterLogin() all call it — so one wrapper covers them all. */
 var baseAfterLogin=window.imodeRoleHomeAfterLogin;
 if(typeof baseAfterLogin==='function'){
  window.imodeRoleHomeAfterLogin=function(){
   var o=takeRoute();
   if(o&&applyRoute(o))return true;
   return baseAfterLogin.apply(this,arguments);
  };
 }

 /* ------------------------------------------------------- 2. stash before js/28 spends it ---- */
 /* Only when there is nobody signed in. With a session, js/28 routes normally and this does
    nothing at all — the params are left exactly where it expects to find them. */
 function stashIfLoggedOut(){
  if(customerRoute())return;
  var signed=false;
  try{signed=!!currentUser}catch(e){}
  if(signed)return;
  stashRoute();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stashIfLoggedOut,{once:true});
 else stashIfLoggedOut();
})();
