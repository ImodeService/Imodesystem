/* Beta 1.0 — on a phone the top bar follows the finger.

   REPORTED (2026-09-18, with a screenshot of the bar on a phone): "เวลาเลื่อนลงข้างล่างอะอยากให้
   อันนี้ตามมาด้วย เพราะว่ามันจะสะดวกกว่าในการใช้งาน ก็คือตอนเลื่อนลงให้ซ่อนไว้ พอเลื่อนขึ้นก็โชว์ออกมา
   และพออยู่บนสุดของเว็บก็โชว์ไว้"

   So: scrolling down hides it, scrolling up brings it back, and at the top of the page it is
   always there. The bar carries ☰, TH/EN, the Home button and the notification bell, which is
   why having it follow is worth anything at all — on a long list it is otherwise a screenful
   away.

   HOW IT MOVES. .topbar is position:sticky (css/01), so its space is already reserved in the
   flow: translating it up moves only the bar and nothing below it shifts. The transform and
   the transition live in css/23 §7b; this file only decides when the class is on. Delete it
   and the bar simply stays where it always was.

   WHAT IT DELIBERATELY DOES NOT DO:
     * nothing above 900px — that is where the sidebar is a drawer and the bottom bar appears,
       i.e. the phone/tablet layout this was asked about. The desktop bar is left alone.
     * it never hides while a popup is open (the page behind does not scroll then, but iOS can
       still fire a scroll while a modal is dismissed) or on the customer page or the Home
       board, neither of which has this bar at all.
     * it shows the bar again the moment scrolling stops near the top, so a short page can
       never end up with a hidden bar and nothing left to scroll back up.

   The listener is passive and does no layout work: a scroll handler that reads offsetHeight
   is the classic way to make a phone stutter. Everything it needs is scrollY and a class. */
(function(){
 'use strict';

 var MOBILE=900;        /* the app's own phone/tablet breakpoint (css/01, css/23) */
 var DELTA=6;           /* ignore the jitter of a finger resting on the glass */
 var TOP=12;            /* "อยู่บนสุดของเว็บก็โชว์ไว้" */
 var HIDE_AFTER=90;     /* never hide while the top of the page is still in sight */

 var lastY=0,ticking=false,hidden=false;

 function body(){return document.body}
 function mobile(){return window.innerWidth<=MOBILE}
 function blocked(){
  try{
   var b=body();
   if(!b)return true;
   if(b.classList.contains('rhome-mode'))return true;            /* the Home board: no bar */
   if(b.classList.contains('customer-portal-mode'))return true;  /* the customer page */
   var m=document.getElementById('modal');
   if(m&&/\bopen\b/.test(m.className||''))return true;           /* a popup is up */
  }catch(e){return true}
  return false;
 }
 function show(){
  if(!hidden)return;
  hidden=false;
  try{body().classList.remove('v70-topbar-hidden')}catch(e){}
 }
 function hide(){
  if(hidden)return;
  hidden=true;
  try{body().classList.add('v70-topbar-hidden')}catch(e){}
 }

 function measure(){
  ticking=false;
  var y=window.scrollY||window.pageYOffset||0;
  if(!mobile()||blocked()){show();lastY=y;return}
  if(y<=TOP){show();lastY=y;return}
  var d=y-lastY;
  if(Math.abs(d)<DELTA)return;                 /* lastY is kept: small moves accumulate */
  if(d>0&&y>HIDE_AFTER)hide();
  else if(d<0)show();
  lastY=y;
 }
 function onScroll(){
  if(ticking)return;
  ticking=true;
  window.requestAnimationFrame(measure);
 }

 window.addEventListener('scroll',onScroll,{passive:true});
 /* Rotating to landscape, or a desktop window shrinking past the breakpoint, must not leave
    a bar hidden with no way to bring it back. */
 window.addEventListener('resize',function(){if(!mobile())show();lastY=window.scrollY||0});
 /* goPage() scrolls to the top itself; this keeps the bar in step on a page change. */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   lastY=0;show();
   return r;
  };
 }
 window.imodeTopbarShow=show;
})();
