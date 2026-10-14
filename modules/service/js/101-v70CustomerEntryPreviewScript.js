/* Beta 1.0 — 2026-09-23: ▦ ดูหน้าหลักลูกค้า on the Customers page opens the scan / serial page.
   It used to call previewCustomerPortal(), which shows machines[0] — whichever machine happens
   to be first in the array — so it answered "what does a customer see?" with one arbitrary
   machine and no way to choose another. The customer's real first screen is the entry page:
   scan the QR on the machine, or type its serial.

   js/03 is not edited. previewCustomerPortal() keeps working for anything else that calls it;
   the button points at this instead.

   The entry page hides the sidebar and the topbar (js/14 adds body.rhome-mode), and it has no
   way back, because a customer has nowhere to go back TO. A staff member does, so they get a
   floating chip — kept OUTSIDE the page element on purpose: renderEntry() rewrites that
   element's innerHTML on every pass (a failed scan, a serial that matches two machines), which
   would wipe a button placed inside it. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 /* currentUser is a top-level let in js/03 — a lexical global that is NEVER on window.
    Reading window.currentUser here would make this chip invisible to everybody. */
 function isStaff(){
  try{return !!(currentUser&&currentUser.username||currentUser&&currentUser.name)}
  catch(e){return false}
 }
 function entryActive(){
  var p=document.getElementById('page-customer-entry');
  return !!(p&&p.classList.contains('active'));
 }

 window.imodeOpenCustomerEntry=function(){
  if(typeof goPage!=='function')return;
  goPage('customer-entry');
 };

 function chip(){
  var el=document.getElementById('centryStaffBack');
  if(el)return el;
  el=document.createElement('button');
  el.id='centryStaffBack';
  el.type='button';
  el.className='centry-staffback';
  el.innerHTML='‹ '+tl('กลับสู่ระบบ','Back to the app');
  el.addEventListener('click',function(){
   if(typeof goPage==='function')goPage('customers');
  });
  document.body.appendChild(el);
  return el;
 }
 function update(){
  var show=entryActive()&&isStaff();
  var el=document.getElementById('centryStaffBack');
  if(!show){if(el)el.style.display='none';return}
  el=chip();
  el.innerHTML='‹ '+tl('กลับสู่ระบบ','Back to the app');
  el.style.display='';
 }

 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   setTimeout(update,0);
   return r;
  };
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});
 else update();

 var st=document.createElement('style');
 st.id='v70CustomerEntryPreviewStyle';
 st.textContent=''
 +'.centry-staffback{position:fixed;left:14px;bottom:14px;z-index:9000;cursor:pointer;'
 +'padding:9px 14px;border-radius:999px;border:1px solid #cfdcf0;background:#fff;color:#12356f;'
 +'font-size:12.5px;font-weight:700;box-shadow:0 6px 18px rgba(12,34,94,.16)}'
 +'.centry-staffback:hover{background:#f2f7ff;border-color:#b9d3f5}'
 +'.centry-staffback:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
 document.head.appendChild(st);
})();
