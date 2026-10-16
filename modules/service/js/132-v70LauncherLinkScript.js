/* 2026-10-14: a way back to the I-MODE System module picker from inside Service.
   Asked for as "อยากให้มีปุ่มกลับมายังหน้าเลือกโมดุลหลัก และอยากให้เพิ่มใน slide bar".

   Two entry points, both plain links to IMODE_PLATFORM.launcherUrl (set by js/00 only when
   Service runs as a platform module, so the old standalone copy shows neither):
     1. the first item of the sidebar, above js/36's groups;
     2. a button in the top-left corner of Home (#page-home), opposite the TH | EN switch.
   Going there does not sign anyone out: the launcher shares this page's session (js/128).

   The sidebar item borrows .nav-item so every theme (js/127), sidebar style (js/131) and icon
   style (js/130, '▦' -> grid icon) dresses it like the rest, but it has no data-page, so:
   js/36 never moves it (it only regroups .nav-item[data-page]); js/03's goPage() never marks
   it active; and its `onclick` is pinned, because js/03 and later scripts assign
   b.onclick=()=>goPage(b.dataset.page) to every .nav-item they find and that would open a
   page called "undefined" instead of following the link. */
(function(){
 'use strict';
 var P=window.IMODE_PLATFORM;
 if(!P||!P.launcherUrl)return;
 var URL_=P.launcherUrl;
 function L(th,en){try{return (window.settings&&settings.language==='en')?en:th}catch(e){return th}}

 var st=document.createElement('style');
 st.id='v70LauncherLinkStyle';
 st.textContent=''
  +'.side-nav .nav-launcher{display:grid!important;text-decoration:none!important}'
  +'.side-nav .nav-launcher+.nav-launcher-sep{display:block;height:1px;margin:4px 10px 6px;background:currentColor;opacity:.16}'
  +'#page-home .rhome-brand{position:relative}'
  +'#page-home .rhome-launcher{position:absolute;left:22px;top:14px;z-index:2;display:flex;align-items:center;gap:6px;'
  +'max-width:calc(50% - 90px);min-height:36px;padding:0 14px 0 10px;border:1px solid #cfdbef;border-radius:999px;'
  +'background:#fff;color:#1a3a86;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;'
  +'transition:background-color .15s ease-out,border-color .15s ease-out}'
  +'#page-home .rhome-launcher:hover{background:#eef3fb;border-color:#9fb4d8}'
  +'#page-home .rhome-launcher:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
  +'#page-home .rhome-launcher svg{width:18px;height:18px;flex:none}'
  +'html[data-ui="flat-dark"] #page-home .rhome-launcher{background:#262626;border-color:#3a3a3a;color:#e8e8e8}'
  +'html[data-ui="flat-dark"] #page-home .rhome-launcher:hover{background:#2f2f2f}'
  +'#page-home .rhome-launcher span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  +'@media (max-width:640px){#page-home .rhome-launcher{left:14px;top:12px;max-width:calc(100% - 130px);font-size:13px;padding:0 12px 0 8px}}';
 document.head.appendChild(st);

 var GRID='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  +'<path d="M15 18l-6-6 6-6"/></svg>';

 /* ---------- 1. sidebar ---------- */
 function sideItem(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav)return;
  var a=nav.querySelector('.nav-launcher');
  if(!a){
   a=document.createElement('a');
   a.className='nav-item nav-launcher';
   a.href=URL_;
   a.innerHTML='<span>▦</span><b></b>';
   try{Object.defineProperty(a,'onclick',{configurable:true,get:function(){return null},set:function(){}})}catch(e){}
   var sep=document.createElement('div');
   sep.className='nav-launcher-sep';
   sep.setAttribute('aria-hidden','true');
   nav.insertBefore(sep,nav.firstChild);
   nav.insertBefore(a,sep);
  }else if(nav.firstChild!==a){
   /* something re-ordered the nav: put the link (and its divider) back on top */
   var s=nav.querySelector('.nav-launcher-sep');
   nav.insertBefore(a,nav.firstChild);
   if(s)nav.insertBefore(s,a.nextSibling);
  }
  var b=a.querySelector('b'),t=L('หน้าเลือกโมดูลหลัก','All modules');
  if(b&&b.textContent!==t)b.textContent=t;
  a.title=L('กลับไปหน้าเลือกโมดูลของ I-MODE System','Back to the I-MODE System module picker');
 }

 /* ---------- 2. Home ---------- */
 function homeBar(){
  var host=document.getElementById('page-home');
  if(!host||host.querySelector('.rhome-launcher'))return;
  /* only on the signed-in board; the sign-in gate has its own way out */
  if(!host.querySelector('.rhome-cardhome'))return;
  var a=document.createElement('a');
  a.className='rhome-launcher';
  a.href=URL_;
  a.innerHTML=GRID+'<span></span>';
  a.querySelector('span').textContent=L('กลับหน้าเลือกโมดูลหลัก','Back to all modules');
  var brand=host.querySelector('.rhome-brand');
  (brand||host).insertBefore(a,(brand||host).firstChild);
 }

 var queued=false;
 function run(){queued=false;try{sideItem()}catch(e){}try{homeBar()}catch(e){}}
 function schedule(){if(queued)return;queued=true;(window.requestAnimationFrame||setTimeout)(run)}
 run();
 try{
  /* Whole body, not #page-home: js/10's ensurePages() can create or replace the Home page
     element after this script has run. run() is two cheap lookups per animation frame. */
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 }catch(e){}
 /* language switch re-renders labels */
 document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.rhome-lang'))setTimeout(run,50)},true);
})();
