/* V6.9 — the customer page has its own file.

   The customer Home page is the only page a customer ever reaches, and the only one with
   no sidebar and no topbar, so its markup was moved out of index.html into
   ./pages/customer-home.html (it was called customer-portal.html until 2026-09-08; the
   page is now "Customer Home"). This script pulls it back in, at the exact position in
   <main> the <section> used to occupy. The section id stays page-customer-portal because
   goPage(), renderCustomerPortal() and several stylesheets address it by that name;
   goPage('customer-home') is accepted as the new name and translated in
   js/19-v69CustomerHomeScript.js.

   Why it is loaded synchronously, from inside <main>, and not on DOMContentLoaded:
   goPage() does getElementById('page-'+name).classList.add('active') and throws if the
   section is missing, and renderCustomerPortal() reads portalLineIdentity /
   portalMachineHero / portalContent as id globals. The markup therefore has to be in the
   document before any other script runs — a QR link (?machineToken=) renders the portal
   during boot.

   XMLHttpRequest, not fetch(): fetch() refuses the file:// scheme outright, XHR does not.
   Over http — Live Server, GitHub Pages, the real deployment — both work. Opening
   index.html by double-clicking it (plain file://) the browser blocks the read either
   way; the fallback below then keeps the ids alive so nothing throws, and says where the
   page went. */
(function(){
 'use strict';
 var here=document.currentScript;

 /* customer-home.html is a whole document, not a bare fragment, so it can be opened on
    its own and still look like the real page — it carries a <base>, the twenty
    stylesheets and a rule that reveals the section. None of that may reach index.html:
    those <link> tags would re-apply the whole cascade from inside <main>, at the end,
    overriding every later patch stylesheet. So only the <section> is taken. */
 function sectionOf(text){
  if(!text||text.indexOf('page-customer-portal')<0)return '';
  try{
   var doc=new DOMParser().parseFromString(text,'text/html');
   var sec=doc.getElementById('page-customer-portal');
   if(sec)return sec.outerHTML;
  }catch(e){}
  return '';
 }

 /* 2026-09-23 — THE ONE REQUEST THE OFFLINE CACHE CANNOT SERVE.
    Measured in a browser with the service worker installed and the network switched off:
    the file IS in the cache (5,680 bytes) and `fetch('pages/customer-home.html')` returns
    it with status 200 — while the SYNCHRONOUS XMLHttpRequest below fails outright with
    "Failed to execute 'send' on 'XMLHttpRequest'". A sync XHR from the main thread does
    not go through the worker's fetch handler, so sw.js listing this file in EXTRA cannot
    help it. The symptom was the customer page showing the "open it over http" notice with
    no machine card and none of the eight action buttons, on a phone with no signal.

    It cannot simply become fetch(): the markup must be in the document before any other
    script runs, because goPage() throws without the section and renderCustomerPortal()
    reads portalLineIdentity / portalMachineHero / portalContent as id globals, and a QR
    link renders the portal during boot. fetch() is a promise and would arrive a tick late.

    So the last good copy is kept in localStorage — the only store that can be read
    synchronously — and used when the read fails. It is refreshed on every successful load,
    so offline it is at worst one deploy behind, which is far better than a notice. 5.7 KB,
    and nothing else reads the key. */
 var SHELL_KEY='imode_v70_portal_shell';

 var html='';
 try{
  var x=new XMLHttpRequest();
  x.open('GET','./pages/customer-home.html',false);
  x.send(null);
  /* a file:// read that succeeds reports status 0, not 200 */
  if((x.status===200||x.status===0)&&x.responseText)html=sectionOf(x.responseText);
 }catch(e){}

 if(html){
  try{localStorage.setItem(SHELL_KEY,html)}catch(e){}
 }else{
  /* No network and no file access: the copy this device kept the last time it did have
     one. sectionOf() only ever stores real markup, so a stored value is known to carry
     the section and its three ids. */
  try{
   var kept=localStorage.getItem(SHELL_KEY);
   if(kept&&kept.indexOf('page-customer-portal')>=0)html=kept;
  }catch(e){}
 }

 if(!html){
  html='<section class="page customer-portal-page" id="page-customer-portal">'
   +'<div class="portal-shell">'
   +'<div class="portal-header"><img src="./assets/imode-ui-logo-v532.png" alt="I-MODE">'
   +'<div><b>I-MODE Plus</b><small>หน้าหลักลูกค้า · Customer Home</small></div>'
   +'<button class="portal-close" onclick="exitCustomerPortal()">×</button></div>'
   +'<div id="portalLineIdentity" class="portal-line-identity"></div>'
   +'<div id="portalMachineHero"></div>'
   +'<div id="portalContent" class="portal-content">'
   +'<b>เปิดหน้าหลักลูกค้าจากไฟล์ในเครื่องไม่ได้</b>'
   +'<p>pages/customer-home.html ต้องเปิดผ่าน Live Server หรือ GitHub Pages</p>'
   +'</div></div></section>';
 }
 if(here&&here.parentNode)here.insertAdjacentHTML('beforebegin',html);
 else document.write(html);
})();
