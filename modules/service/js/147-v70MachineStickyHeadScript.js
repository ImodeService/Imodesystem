/* js/147-v70MachineStickyHeadScript.js — 2026-10-26
   "สิ่งที่อยู่ในกรอบฟีดตลอด แบบเวลาเลื่อนลงล่างงี้อันนี้ก็จะตามไปด้วย" (พี่แอดมิน, with a screenshot of
   หน้าเครื่องจักร: title, tabs, KPI tiles, แสดง/ซิงก์/เพิ่มเครื่อง row, search + filters).

   WHAT IT DOES. On หน้าเครื่องจักร the top of the page stays on screen while the list scrolls.
   - Desktop (wider than 900px and at least 650px tall): the whole block sticks under the top bar —
     page title, the two tabs (js/142), the KPI tiles, the แสดง/เพิ่มเครื่อง row and the search row —
     and once the table's own header row has scrolled under it, a copy of that header row hangs
     from its bottom edge, column widths and sideways scroll kept in step with the real table.
   - Phone / tablet / a short window: only the search + filter row sticks, so the list keep most of
     the screen. It sits right under the top bar, and moves up to the very top while js/87 has the
     bar hidden.

   HOW. Sticky needs one box, and the pieces live in three places: the title is the app-wide
   header above every page (#v68GlobalHero), the tabs and tiles are children of #page-machines and
   the two toolbar rows are inside the list's .panel, whose overflow:hidden would stop them sticking.
   So this file builds #mcStick at the top of #page-machines and moves the tabs, the tiles and the
   two toolbar rows into it (same nodes, same ids, so every renderMachines / filter / onclick keeps
   working). The title is a copy kept in step with #pageTitle / #pageDesc; the real header is hidden
   only while หน้าเครื่องจักร is open (body.mc-on). On a phone #mcStick and its inner card are
   display:contents, which lets the search row stick on its own.

   Nothing here saves, syncs or changes the list itself. Delete this file and its <script> tag and
   the page is back to how it was. */
(function(){
 'use strict';
 var page=document.getElementById('page-machines');
 if(!page)return;
 var MOBILE=900,SHORT=650;
 var stick,hero,card,thBox,thTable,realTable,realWrap,built=false,raf=0;

 function q(s,r){return (r||document).querySelector(s)}
 function full(){return window.innerWidth>MOBILE&&window.innerHeight>=SHORT}
 function active(){return page.classList.contains('active')&&!page.hidden}

 /* ---------------------------------------------------------------- build ---- */
 function build(){
  if(built)return true;
  var panel=q('.panel',page),head=panel&&q('.machine-master-head',panel),bar=panel&&q('.demo-master-toolbar',panel);
  if(!panel||!head||!bar)return false;
  built=true;
  stick=document.createElement('div');stick.id='mcStick';stick.className='mc-stick';
  hero=document.createElement('div');hero.className='v68-global-hero hero-digital mc-hero';
  hero.innerHTML='<div class="v68-hero-main"><div class="hero-copy v68-hero-copy"><h2></h2><p></p></div></div>';
  card=document.createElement('div');card.className='panel mc-card';
  thBox=document.createElement('div');thBox.className='mc-thead';thBox.setAttribute('aria-hidden','true');
  stick.appendChild(hero);
  var kpi=document.getElementById('machineStatusKpis');if(kpi)stick.appendChild(kpi);
  card.appendChild(head);card.appendChild(bar);card.appendChild(thBox);
  stick.appendChild(card);
  page.insertBefore(stick,page.firstChild);
  panel.classList.add('mc-body');
  realWrap=q('.table-wrap',panel);realTable=realWrap&&q('table',realWrap);
  if(realWrap)realWrap.addEventListener('scroll',slide,{passive:true});
  if(realTable&&window.ResizeObserver)new ResizeObserver(schedule).observe(realTable);
  if(window.ResizeObserver){
   new ResizeObserver(schedule).observe(stick);
   var tb=q('.topbar');if(tb)new ResizeObserver(schedule).observe(tb);
  }
  adopt();copyTitle();
  return true;
 }
 /* js/142 makes its tab bar on the first renderMachines() and puts it first in the page */
 function adopt(){
  if(!built)return;
  var tabs=document.getElementById('moTabs');
  if(tabs&&tabs.parentNode!==stick)stick.insertBefore(tabs,hero.nextSibling);
 }
 function copyTitle(){
  if(!built)return;
  var t=document.getElementById('pageTitle'),d=document.getElementById('pageDesc');
  var h=q('h2',hero),p=q('p',hero);
  if(t&&h.textContent!==t.textContent)h.textContent=t.textContent;
  if(d&&p.textContent!==d.textContent)p.textContent=d.textContent;
 }

 /* ------------------------------------------------------- header row copy ---- */
 function headCopy(){
  if(!realTable)return;
  var th=q('thead',realTable);if(!th)return;
  if(!thTable){
   thTable=document.createElement('table');
   thBox.appendChild(thTable);
  }
  thTable.className=realTable.className+' mc-thead-table';
  if(thTable.dataset.src!==th.innerHTML){
   thTable.innerHTML='';thTable.appendChild(th.cloneNode(true));thTable.dataset.src=th.innerHTML;
  }
  var a=th.querySelectorAll('th'),b=thTable.querySelectorAll('th');
  thTable.style.width=realTable.getBoundingClientRect().width+'px';
  for(var i=0;i<a.length&&i<b.length;i++)b[i].style.width=a[i].getBoundingClientRect().width+'px';
  slide();
 }
 function slide(){if(thTable&&realWrap)thTable.style.transform='translateX('+(-realWrap.scrollLeft)+'px)'}

 /* ------------------------------------------------------------- measure ---- */
 function topbarBottom(){
  var tb=q('.topbar');if(!tb)return 0;
  if(document.body.classList.contains('v70-topbar-hidden'))return 0;
  var cs=getComputedStyle(tb);
  if(cs.position!=='sticky'&&cs.position!=='fixed')return 0;
  var t=parseFloat(cs.top)||0;
  return Math.max(0,Math.round(t+tb.offsetHeight+(parseFloat(cs.marginBottom)||0)));
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(measure)}
 function measure(){
  raf=0;
  var on=active()&&build();
  document.body.classList.toggle('mc-on',!!on);
  if(!on)return;
  var isFull=full();
  document.body.classList.toggle('mc-full',isFull);
  document.body.classList.toggle('mc-lite',!isFull);
  document.documentElement.style.setProperty('--mc-top',topbarBottom()+'px');
  adopt();copyTitle();
  if(isFull){headCopy();watch()}
  else stick.classList.remove('mc-thead-on');
 }
 /* the copied header row shows only once the real one has gone under the block */
 function watch(){
  if(!built||!realTable||!document.body.classList.contains('mc-full')){return}
  var th=q('thead',realTable);
  var hide=!th||!th.offsetHeight||!realWrap.offsetHeight;
  var under=!hide&&th.getBoundingClientRect().bottom<=stick.getBoundingClientRect().bottom+1
   &&realTable.getBoundingClientRect().bottom>stick.getBoundingClientRect().bottom+th.offsetHeight;
  stick.classList.toggle('mc-thead-on',!!under);
 }
 var wt=0;
 window.addEventListener('scroll',function(){if(!wt&&document.body.classList.contains('mc-on'))wt=requestAnimationFrame(function(){wt=0;watch()})},{passive:true});
 window.addEventListener('resize',schedule);
 new MutationObserver(schedule).observe(page,{attributes:true,attributeFilter:['class','hidden']});
 /* js/87 hides the top bar on a phone while scrolling down: follow it */
 new MutationObserver(function(){
  if(!document.body.classList.contains('mc-on'))return;
  document.documentElement.style.setProperty('--mc-top',topbarBottom()+'px');
 }).observe(document.body,{attributes:true,attributeFilter:['class']});
 ['pageTitle','pageDesc'].forEach(function(id){
  var el=document.getElementById(id);
  if(el)new MutationObserver(copyTitle).observe(el,{childList:true,characterData:true,subtree:true});
 });

 /* ---------------------------------------------------- wrap list functions ---- */
 var baseRender=window.renderMachines;
 if(typeof baseRender==='function'){
  window.renderMachines=function(){
   var r=baseRender.apply(this,arguments);
   try{build();adopt();schedule()}catch(e){}
   return r;
  };
 }
 /* js/07 scrolls the search row into view after a page change; with the row stuck that is a
    no-op, so bring the top of the list back under the block instead. */
 var basePage=window.setMachinePage;
 if(typeof basePage==='function'){
  window.setMachinePage=function(n){
   if(!built||!document.body.classList.contains('mc-on'))return basePage.apply(this,arguments);
   try{machineCurrentPage=Math.max(1,Number(n)||1)}catch(e){}
   if(typeof window.renderMachines==='function')window.renderMachines();
   setTimeout(function(){
    var list=[realWrap,document.getElementById('machineCards')].filter(function(el){return el&&el.offsetHeight})[0];
    if(!list)return;
    var under=document.body.classList.contains('mc-full')?stick.getBoundingClientRect().bottom
     :(q('.demo-master-toolbar',stick)||stick).getBoundingClientRect().bottom;
    var y=window.scrollY+list.getBoundingClientRect().top-under;
    if(window.scrollY>y)window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
   },30);
  };
 }

 /* -------------------------------------------------------------- styles ---- */
 var X='html:is(:root,#fx) body.mc-on';
 var st=document.createElement('style');st.id='v70MachineStickyHeadStyle';
 st.textContent=''
 /* html,body{overflow-x:hidden} (css/09, css/11) turns <body> into a scroll box that never scrolls,
    and sticky then sticks to nothing; clip cuts the same sideways overflow without that */
 +'html:is(:root,#fx) body.mc-on{overflow-x:clip!important;overflow-y:visible!important}'
 +X+' .main{overflow-x:clip!important;overflow-y:visible!important}'
 +X+' #v68GlobalHero{display:none!important}'
 +X+' #page-machines{padding-top:0!important}'
 +'.mc-stick{display:none}'
 +X+' .mc-stick{display:flow-root;position:sticky;top:var(--mc-top,0px);z-index:20;background:var(--fx-bg,var(--bg,#f6f8fc));transition:top .26s ease}'
 +X+' .mc-hero{margin:0 0 10px!important}'
 +X+' .mc-stick #machineStatusKpis{margin-bottom:12px}'
 +X+' .mc-card{position:relative;overflow:visible!important;margin:0!important;border-bottom-left-radius:0!important;border-bottom-right-radius:0!important;border-bottom:0!important;box-shadow:none!important}'
 +X+' .mc-card .machine-master-head{border-top-left-radius:inherit;border-top-right-radius:inherit}'
 +X+' .mc-card .demo-master-toolbar{margin-bottom:0}'
 +X+' #page-machines>.panel.mc-body{margin-top:0!important;border-top-left-radius:0!important;border-top-right-radius:0!important;border-top:0!important}'
 /* the copy of the header row, hanging from the block's bottom edge */
 +'.mc-thead{display:none}'
 +X+'.mc-full .mc-stick.mc-thead-on .mc-thead{display:block;position:absolute;left:-1px;right:-1px;top:100%;overflow:hidden;'
 +'background:var(--fx-surface,#fff);border:1px solid var(--fx-line,var(--line,#e1e1e1));border-top:0;box-shadow:0 6px 10px -8px rgba(0,0,0,.35)}'
 +X+' .mc-thead-table{table-layout:fixed;margin:0!important;min-width:0!important}'
 +X+' .mc-thead-table th{box-sizing:border-box}'
 /* phone / tablet / short window: only the search + filter row sticks */
 +X+'.mc-lite .mc-stick,'+X+'.mc-lite .mc-card{display:contents}'
 +X+'.mc-lite .mc-card .machine-master-head{background:var(--fx-surface,#fff);border:1px solid var(--fx-line,var(--line,#e1e1e1));border-bottom:0;border-radius:var(--fx-radius,20px) var(--fx-radius,20px) 0 0}'
 +X+'.mc-lite .mc-card .demo-master-toolbar{position:sticky;top:var(--mc-top,0px);z-index:20;transition:top .26s ease;'
 +'background:var(--fx-surface,#fff);border:1px solid var(--fx-line,var(--line,#e1e1e1));border-top:0;border-bottom:0;box-shadow:0 6px 10px -10px rgba(0,0,0,.4)}'
 +'@media (prefers-reduced-motion:reduce){'+X+' .mc-stick,'+X+' .mc-card .demo-master-toolbar{transition:none}}';
 document.head.appendChild(st);

 if(active())schedule();
})();
