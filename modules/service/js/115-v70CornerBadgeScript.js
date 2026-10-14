/* Version 1.0 — 2026-09-24: the count sits in an orange circle on the CORNER of the button.

   Reported with a phone screenshot: js/74 put the งานของฉัน count inside the label of the mobile
   bottom bar, where it wrapped under the word as a separate "3" box. Asked for: an orange circle
   with the number in it on the corner of the square, and the same on the Home board.

   Everything outside the sidebar that opens a counted page gets a corner badge; the sidebar keeps
   js/74 / js/49's inline pill, which reads well in a list. The numbers are not recomputed here —
   they come from what already counts them, so they cannot disagree with the sidebar:
     my-work        js/74 imodeNewJobCount()   (jobs this technician has not opened yet)
     requests       js/49's sidebar badge      (new customer requests)
     notifications  js/03's #sideNotifyBadge   (open notices)
   A page the account cannot open has no button to badge, so no permission logic is needed. */
(function(){
 'use strict';
 function num(el){
  if(!el||el.hidden)return 0;
  try{if(getComputedStyle(el).display==='none')return 0}catch(e){}
  var n=parseInt(String(el.textContent||'').replace(/[^0-9]/g,''),10);
  return isFinite(n)?n:0;
 }
 function counts(){
  var c={};
  try{c['my-work']=typeof window.imodeNewJobCount==='function'?(window.imodeNewJobCount()||0):0}catch(e){c['my-work']=0}
  c.requests=num(document.querySelector('.side-nav [data-req-badge]'));
  c.notifications=num(document.getElementById('sideNotifyBadge'));
  return c;
 }
 function paint(){
  var c=counts();
  Object.keys(c).forEach(function(page){
   var n=c[page];
   var nodes=document.querySelectorAll('[data-page="'+page+'"]');
   for(var i=0;i<nodes.length;i++){
    var el=nodes[i];
    if(el.closest('.side-nav'))continue;                 /* the sidebar keeps its inline pill */
    var b=el.querySelector(':scope > .imode-cbadge');
    if(!n){if(b)b.remove();continue}
    if(!b){b=document.createElement('span');b.className='imode-cbadge';el.appendChild(b);el.classList.add('has-cbadge')}
    var t=n>99?'99+':String(n);
    if(b.textContent!==t)b.textContent=t;
    b.setAttribute('aria-label',n+(page==='my-work'?' งานใหม่':' รายการใหม่'));
   }
  });
 }
 window.imodePaintCornerBadges=paint;

 var baseRender=window.renderAll;
 if(typeof baseRender==='function'){
  window.renderAll=function(){var r=baseRender.apply(this,arguments);try{paint()}catch(e){}return r};
 }
 /* The Home board is drawn by js/10's goPage wrapper, not by renderAll(). */
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(){var r=baseGo.apply(this,arguments);setTimeout(function(){try{paint()}catch(e){}},40);return r};
 }
 /* Counts also move on a realtime event or a sync with no render of our own; cheap enough. */
 setInterval(function(){try{if(!document.hidden)paint()}catch(e){}},4000);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(paint,300)});
 else setTimeout(paint,300);

 var st=document.createElement('style');
 st.textContent=[
  '.has-cbadge{position:relative}',
  '.imode-cbadge{position:absolute;top:-6px;right:-6px;z-index:3;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;',
  '  display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#f26a10;color:#fff;',
  '  font-size:12px;font-weight:800;line-height:1;border:2px solid #fff;box-shadow:0 3px 8px rgba(242,106,16,.38);pointer-events:none}',
  /* the bottom bar is tight: a smaller circle on the icon's corner */
  /* the bottom bar styles every <span> in a button as its icon chip, so the badge restates what it needs */
  '.bottom-nav [data-page] > span.imode-cbadge{position:absolute!important;top:2px!important;left:calc(50% + 6px)!important;right:auto!important;',
  '  width:auto!important;min-width:18px!important;height:18px!important;padding:0 4px!important;margin:0!important;font-size:10.5px!important;',
  '  background:#f26a10!important;color:#fff!important;border-radius:999px!important;border:2px solid #fff!important;',
  '  display:inline-flex!important;align-items:center;justify-content:center;transform:none;box-shadow:0 3px 8px rgba(242,106,16,.38)!important}',
  '.rhome-modcard .imode-cbadge{top:10px;right:10px;min-width:26px;height:26px;font-size:13px}',
  /* js/74's inline count stays in the sidebar only; everywhere else the corner badge replaces it */
  '.bottom-nav .njb-navcount,.rhome-modcard .njb-navcount{display:none!important}',
  '@keyframes cbadgePop{0%{transform:scale(.4)}70%{transform:scale(1.15)}100%{transform:scale(1)}}',
  '.imode-cbadge{animation:cbadgePop .32s ease-out}',
  '@media (prefers-reduced-motion:reduce){.imode-cbadge{animation:none}}'
 ].join('\n');
 document.head.appendChild(st);
})();
