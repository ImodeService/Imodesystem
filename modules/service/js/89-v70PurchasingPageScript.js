/* Beta 1.0 — การจัดซื้อ is a page of its own.

   REQUESTED 2026-09-20: "ผมเห็นว่ามันมีตารางสั่งซื้ออะไหล่ แยกหน้าออกมาหน่อย และเพิ่มปุ่มใน
   slide bar ด้วย ชื่อปุ่มคือ การจัดซื้อ" — with the note that สต๊อกอะไหล่ is not in use yet but
   will be, and that the system's real job today is the machines I-MODE has sold.

   WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO.

   The ระบบการสั่งซื้ออะไหล่ panel is MOVED, not rebuilt. It is the second .panel inside
   #page-spare-parts and it carries <tbody id="purchaseOrderTable">, which
   renderSpareParts() in js/04 fills by id on every render — as an id global, the way this
   project writes everything. Rebuilding the markup here would mean two copies of the same
   table drifting apart, and js/04 would keep filling the one nobody can see. Relocating the
   element keeps exactly one table, still filled by exactly one function, with js/04 not
   edited at all. js/15 moves #topbarUserCard into the sidebar the same way.

   THE MOVE IS IDEMPOTENT. renderSpareParts() rewrites the tbody's rows, never the panel
   around it, so the panel stays where it was put. The guard is the panel's own id.

   PERMISSION: `parts.view`, DELIBERATELY AN EXISTING KEY. A file that pushes a new key into
   PERMISSION_CATALOG has to load before js/20, which repairs every role against the catalog
   as it stands at that moment — and this file loads long after it, so a new key would be
   stripped from every role on every reload (the decay bug of part 14). Purchasing is the
   same audience as the stock it buys for, so the same key is the honest answer as well as
   the safe one. PAGE_PERMISSION maps a page to an existing key and is safe to extend.

   WHERE IT SITS: straight after สต๊อกอะไหล่, in whichever group holds it — the group ids in
   js/36 are an API (js/43, js/45 and js/49 all insert by id) so the group is found through
   the page rather than named here, and a later re-organisation moves both together. */
(function(){
 'use strict';

 var PAGE='purchasing';
 var PERM='parts.view';
 var PANEL_ID='purchasingPanel';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* ---------------------------------------------------------------- the page ---- */
 if(typeof PAGE_INFO!=='undefined'){
  PAGE_INFO.th[PAGE]=['การจัดซื้อ','ใบสั่งซื้ออะไหล่ และการติดตามสถานะรับเข้า'];
  PAGE_INFO.en[PAGE]=['Purchasing','Spare part purchase orders and their receiving status'];
 }
 try{if(typeof PAGE_PERMISSION!=='undefined')PAGE_PERMISSION[PAGE]=PERM}catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'🧾',th:'การจัดซื้อ',en:'Purchasing',
   perm:PERM},'after:spare-parts');
 }
 /* Beside สต๊อกอะไหล่, in whatever group that page is in today. */
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  for(var gi=0;gi<groups.length;gi++){
   var pages=groups[gi].pages||[];
   var at=pages.indexOf('spare-parts');
   if(at<0)continue;
   if(pages.indexOf(PAGE)<0)pages.splice(at+1,0,PAGE);
   break;
  }
 }catch(e){}

 function ensurePage(){
  var main=document.querySelector('main.main');
  if(!main)return null;
  var sec=document.getElementById('page-'+PAGE);
  if(sec)return sec;
  sec=document.createElement('section');
  sec.id='page-'+PAGE;
  sec.className='page';
  main.appendChild(sec);
  return sec;
 }

 /* The panel that holds the purchase orders, wherever it currently is. Found by the tbody
    js/04 writes into, never by position. */
 function poPanel(){
  var tb=document.getElementById('purchaseOrderTable');
  if(!tb)return null;
  var p=tb.closest?tb.closest('.panel'):null;
  return p||null;
 }

 function movePanel(){
  var sec=ensurePage();
  if(!sec)return;
  var panel=poPanel();
  if(!panel)return;
  if(panel.parentNode===sec)return;                 /* already moved */
  panel.id=panel.id||PANEL_ID;
  sec.appendChild(panel);
  /* The stock page loses a panel; nothing else about it changes. */
 }

 /* ---------------------------------------------------------------- the nav ---- */
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav||nav.querySelector('.nav-item[data-page="'+PAGE+'"]'))return;
  var b=document.createElement('button');
  b.className='nav-item';
  b.setAttribute('data-page',PAGE);
  b.innerHTML='<span>🧾</span><b>'+esc2(tl('การจัดซื้อ','Purchasing'))+'</b>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="spare-parts"]');
  if(ref&&ref.parentNode)ref.parentNode.insertBefore(b,ref.nextSibling);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }

 /* ------------------------------------------------------------- rendering ---- */
 /* renderSpareParts() fills the table for both pages — it always did, the tbody has simply
    moved. Calling it when this page opens is what keeps the rows current without a second
    render path to maintain. */
 function render(){
  movePanel();
  try{if(typeof window.renderSpareParts==='function')window.renderSpareParts()}catch(e){}
 }
 window.imodeRenderPurchasing=render;

 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(name){
   if(name===PAGE)movePanel();               /* before the page is shown, not after */
   var r=baseGoPage.apply(this,arguments);
   try{if(name===PAGE)render()}catch(e){}
   return r;
  };
 }
 /* renderAll() redraws the stock page; the panel is already elsewhere, but a rebuild of
    #page-spare-parts by a later patch would put it back, so the move is re-asserted. */
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{movePanel()}catch(e){}
   return r;
  };
 }

 function start(){ensurePage();ensureNav();movePanel()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
