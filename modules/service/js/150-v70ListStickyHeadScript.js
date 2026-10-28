/* js/150-v70ListStickyHeadScript.js — 2026-10-27
   "ทุกเมนู แต่ตอนนี้เน้น service ก่อน: หน้าลูกค้า หน้าเคส หน้าคำขอ" — give those three pages the same
   behaviour as หน้าเครื่องจักร (js/147): the status tiles, the แสดง/เพิ่ม row and the search + filter
   row stay on screen while the list scrolls.

   HOW (different from js/147 on purpose). js/147 moves nodes into one sticky box; that is not safe
   here because คำขอจากลูกค้า (js/49) rebuilds its whole panel with innerHTML on every render, which
   would throw moved nodes away. So nothing is moved: each piece is made `position:sticky` where it
   already is, and this file only measures heights to stack them (tiles, then head, then toolbar).
   `.panel{overflow:hidden}` would stop sticky, so it is lifted while the page is active.
   Desktop (wider than 900px and at least 650px tall): all three pieces stick under the top bar.
   Phone / tablet / short window: only the search + filter row sticks.

   To add a page, add a row to PAGES. Delete this file and its <script> tag to undo. */
(function(){
 'use strict';
 var MOBILE=900,SHORT=650;
 /* tiles / head / bar are selectors relative to the page; the first match is used */
 var PAGES=[
  {id:'page-cases',    tiles:'#caseStatusKpis', head:'.machine-master-head', bar:'.toolbar'},
  {id:'page-customers',tiles:'.line-kpis',      head:'.machine-master-head', bar:'.demo-master-toolbar'},
  {id:'page-requests', tiles:'.req-kpi',        head:'.panel-head',          bar:'.req-filters'},
  {id:'page-qc',        tiles:'.qc-kpi-grid',    head:'.machine-master-head', bar:'.qc-toolbar'},
  {id:'page-petty-cash',tiles:'.qc-kpi-grid',    head:'.machine-master-head', bar:'.petty-toolbar-2'},
  {id:'page-spare-parts',tiles:'.qc-kpi-grid',   head:'.machine-master-head', bar:'.toolbar-3col'},
  {id:'page-warranty',  tiles:'.module-kpi-grid',head:'.machine-master-head', bar:'.warranty-toolbar'},
  {id:'page-documents', tiles:'.module-kpi-grid',head:'.machine-master-head', bar:'.document-toolbar'}
 ];
 var raf=0,marked=[];

 function q(s,r){return (r||document).querySelector(s)}
 function full(){return window.innerWidth>MOBILE&&window.innerHeight>=SHORT}
 function topbarBottom(){
  var tb=q('.topbar');if(!tb)return 0;
  if(document.body.classList.contains('v70-topbar-hidden'))return 0;
  var cs=getComputedStyle(tb);
  if(cs.position!=='sticky'&&cs.position!=='fixed')return 0;
  return Math.max(0,Math.round((parseFloat(cs.top)||0)+tb.offsetHeight+(parseFloat(cs.marginBottom)||0)));
 }
 function activePage(){
  for(var i=0;i<PAGES.length;i++){
   var el=document.getElementById(PAGES[i].id);
   if(el&&el.classList.contains('active')&&!el.hidden)return {cfg:PAGES[i],el:el};
  }
  return null;
 }
 function clear(){
  marked.forEach(function(e){e.classList.remove('mcs-item');e.style.removeProperty('--mcs-top')});
  marked=[];
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(measure)}
 function measure(){
  raf=0;
  var a=activePage();
  clear();
  document.body.classList.toggle('mcs-on',!!a);
  if(!a)return;
  var isFull=full();
  var y=topbarBottom();
  var parts=isFull?[a.cfg.tiles,a.cfg.head,a.cfg.bar]:[a.cfg.bar];
  /* the head must sit above the bar in the DOM for the stack to read top-to-bottom */
  parts.forEach(function(sel){
   var e=q(sel,a.el);
   if(!e||!e.offsetHeight)return;
   e.classList.add('mcs-item');
   e.style.setProperty('--mcs-top',y+'px');
   marked.push(e);
   y+=e.offsetHeight+(sel===a.cfg.tiles?12:0);
  });
 }

 window.addEventListener('resize',schedule);
 window.addEventListener('load',schedule);
 /* page switches, and a page (คำขอ) that rebuilds its own markup */
 var mo=new MutationObserver(function(muts){
  for(var i=0;i<muts.length;i++){
   var t=muts[i].target;
   if(muts[i].type==='attributes'&&t.classList&&t.classList.contains('mcs-item'))continue;
   schedule();return;
  }
 });
 function watchPages(){
  PAGES.forEach(function(p){
   var el=document.getElementById(p.id);
   if(!el||el.dataset.mcsWatch)return;
   el.dataset.mcsWatch='1';
   mo.observe(el,{attributes:true,attributeFilter:['class','hidden'],childList:true});
  });
 }
 watchPages();
 /* js/49 creates #page-requests after load */
 new MutationObserver(function(){watchPages();schedule()}).observe(document.querySelector('main.main')||document.body,{childList:true});
 /* js/87 hides the top bar on a phone while scrolling down: follow it */
 new MutationObserver(function(){if(document.body.classList.contains('mcs-on'))schedule()})
  .observe(document.body,{attributes:true,attributeFilter:['class']});

 var X='html:is(:root,#fx) body.mcs-on';
 var st=document.createElement('style');st.id='v70ListStickyHeadStyle';
 st.textContent=''
 /* see js/147: overflow-x:hidden on html/body makes body a scroll box and sticky sticks to nothing */
 +X+'{overflow-x:clip!important;overflow-y:visible!important}'
 +X+' .main{overflow-x:clip!important;overflow-y:visible!important}'
 +X+' .page.active .panel{overflow:visible!important}'
 +X+' .mcs-item{position:sticky;top:var(--mcs-top,0px);z-index:20;transition:top .26s ease;'
 +'background:var(--fx-surface,var(--surface,#fff))}'
 +X+' .mcs-item.module-kpi-grid,'+X+' .mcs-item.req-kpi{background:var(--fx-bg,var(--bg,#f6f8fc));padding-bottom:6px}'
 +X+' .mcs-item.toolbar,'+X+' .mcs-item.req-filters{box-shadow:0 6px 10px -10px rgba(0,0,0,.4)}'
 +'@media (prefers-reduced-motion:reduce){'+X+' .mcs-item{transition:none}}';
 document.head.appendChild(st);

 schedule();
})();
