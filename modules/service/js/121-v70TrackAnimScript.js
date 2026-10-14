/* Version 1.0 — 2026-09-25: every status bar animates when its status moves on.

   Asked for: "อยากให้เพิ่ม Animation ให้แถบสถานะทุกแถบ" — the owner chose: play it when the status
   CHANGES (not on every page open), in the same style as the customer's ladder (js/120): the
   green line grows from the old step to the new one, step by step, and the new step pops.

   Loaded by BOTH documents — index.html and service-case-detail.html — so there is one copy.
   It knows the three kinds of bar in the project:

     ol.scd-steps   the case page's five main steps        (li.done / li.now, line = li::before)
     ol.sd-field    the case page's field, Workshop and     (li.done / li.now, line = li::before)
                    quotation tracks
     ol.fw-ladder   the technician's หน้างาน chips           (li.is-done / li.is-now, no line)

   How "changed" is known: every bar that appears is scored (index of the furthest reached step,
   ×2, +1 when that step is done rather than current) and the score is remembered per case and bar
   in imode_v70_track_seen — device-local, losing it only skips one animation. A bar scoring
   higher than last time animates from the remembered step; a bar seen for the first time just
   records. A repaint that draws the same state again therefore never replays anything, and a
   drawer opened for the first time after a change plays it then — "since you last looked".

   Nothing here renders a bar or changes a status; it only adds classes for a moment. */
(function(){
 'use strict';
 var KEY='imode_v70_track_seen';
 var STEP_MS=380;
 var reduce=false;try{reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}

 var KINDS=[
  {sel:'ol.scd-steps',done:'done',now:'now',mark:'.mark',line:true,name:'main'},
  {sel:'ol.sd-field',done:'done',now:'now',mark:'.fdot',line:true,name:'field'},
  {sel:'ol.fw-ladder',done:'is-done',now:'is-now',mark:'span',line:false,name:'ladder'}
 ];

 function caseId(){
  try{var q=new URLSearchParams(location.search).get('caseId');if(q&&/service-case-detail/.test(location.pathname))return q}catch(e){}
  try{if(typeof window.imodeFieldJobId==='function')return window.imodeFieldJobId()||''}catch(e){}
  return '';
 }
 function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return {}}}
 function save(o){
  try{
   var k=Object.keys(o);
   if(k.length>400)k.slice(0,k.length-300).forEach(function(x){delete o[x]});
   localStorage.setItem(KEY,JSON.stringify(o));
  }catch(e){}
 }
 function score(ol,kind){
  var li=ol.querySelectorAll(':scope > li'),best=-1,done=false;
  for(var i=0;i<li.length;i++){
   var d=li[i].classList.contains(kind.done),n=li[i].classList.contains(kind.now);
   if(d||n){best=i;done=d&&!n}
  }
  return best<0?-1:best*2+(done?1:0);
 }
 function keyOf(ol,kind,cid){
  var sub=ol.classList.contains('sd-qt-track')?'qt':kind.name;
  return cid+'|'+sub+'|'+ol.querySelectorAll(':scope > li').length;
 }
 function play(ol,kind,from,to){
  var li=ol.querySelectorAll(':scope > li');
  var a=Math.max(0,Math.floor(from/2)),b=Math.floor(to/2);
  /* the same step going from "current" to "done" only pops */
  var first=to>from&&b===a?b:a+1,n=0;
  for(var k=first;k<=b&&k<li.length;k++){
   li[k].style.setProperty('--trk-d',(n*STEP_MS)+'ms');
   li[k].classList.add(kind.line?'trk-grow':'trk-chip');
   n++;
  }
  var last=li[b];
  if(!last)return;
  var total=Math.max(0,n-1)*STEP_MS+STEP_MS;
  setTimeout(function(){
   last.classList.add('trk-pop');
   var m=last.querySelector(kind.mark);
   if(m){var r=document.createElement('i');r.className='trk-ripple';m.appendChild(r);setTimeout(function(){if(r.parentNode)r.parentNode.removeChild(r)},900)}
  },total);
  setTimeout(function(){
   [].forEach.call(li,function(x){x.classList.remove('trk-grow','trk-chip','trk-pop');x.style.removeProperty('--trk-d')});
  },total+1000);
  /* a bar wider than its box scrolls; bring the new step into view */
  try{if(ol.scrollWidth>ol.clientWidth+4)ol.scrollTo({left:Math.max(0,last.offsetLeft-ol.clientWidth/2+last.offsetWidth/2),behavior:'smooth'})}catch(e){}
 }
 var done=typeof WeakSet==='function'?new WeakSet():null;
 function scan(){
  var cid=caseId();if(!cid)return;
  var seen=null,dirty=false;
  KINDS.forEach(function(kind){
   [].forEach.call(document.querySelectorAll(kind.sel),function(ol){
    if(done&&done.has(ol))return;
    if(!ol.offsetParent&&!ol.getClientRects().length)return;
    if(done)done.add(ol);
    var s=score(ol,kind);if(s<0)return;
    if(!seen)seen=load();
    var k=keyOf(ol,kind,cid),prev=seen[k];
    if(typeof prev==='number'&&s>prev&&!reduce)play(ol,kind,prev,s);
    if(prev!==s){seen[k]=s;dirty=true}
   });
  });
  if(dirty)save(seen);
 }
 var queued=false;
 function queue(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{scan()}catch(e){}})}
 function start(){
  queue();
  try{new MutationObserver(queue).observe(document.body,{childList:true,subtree:true})}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.imodeTrackAnimScan=scan;

 var st=document.createElement('style');st.id='v70TrackAnimStyle';
 st.textContent=[
  /* the line: the grey ::before stays, a green ::after grows over it from the left */
  '.scd-steps li.trk-grow::before,.sd-field li.trk-grow::before{background:#e3ecfa!important}',
  '.scd-steps li.trk-grow::after,.sd-field li.trk-grow::after{content:"";position:absolute;left:-50%;width:100%;height:3px;background:#12a150;box-shadow:0 0 6px rgba(18,161,80,.55);transform-origin:left center;transform:scaleX(0);animation:trkLine '+STEP_MS+'ms cubic-bezier(.45,.05,.3,1) var(--trk-d,0ms) forwards;z-index:0}',
  '.scd-steps li.trk-grow::after{top:17px}.sd-field li.trk-grow::after{top:13px}',
  '.scd-steps li:first-child.trk-grow::after,.sd-field li:first-child.trk-grow::after{display:none}',
  '@keyframes trkLine{to{transform:scaleX(1)}}',
  /* the dot waits grey until its line arrives, then comes in */
  '.trk-grow .mark,.trk-grow .fdot{animation:trkDotIn .32s ease calc(var(--trk-d,0ms) + '+(STEP_MS-80)+'ms) both}',
  '@keyframes trkDotIn{from{filter:grayscale(1);opacity:.55;transform:scale(.85)}to{filter:none;opacity:1;transform:scale(1)}}',
  /* chips light up one after another */
  '.fw-ladder li.trk-chip{animation:trkChip .42s ease var(--trk-d,0ms) both}',
  '@keyframes trkChip{from{filter:grayscale(1);opacity:.6;transform:scale(.92)}60%{transform:scale(1.06)}to{filter:none;opacity:1;transform:scale(1)}}',
  /* the new step pops, with a ripple */
  '.trk-pop .mark,.trk-pop .fdot,.fw-ladder li.trk-pop span{animation:trkPop .55s cubic-bezier(.3,1.6,.5,1) both!important}',
  '@keyframes trkPop{0%{transform:scale(.7)}60%{transform:scale(1.28)}100%{transform:scale(1)}}',
  '.trk-ripple{position:absolute;inset:-4px;border-radius:50%;border:3px solid #22c55e;animation:trkRipple .9s ease-out forwards;pointer-events:none}',
  '@keyframes trkRipple{from{transform:scale(1);opacity:.9}to{transform:scale(2.4);opacity:0}}',
  '.fw-ladder li span{position:relative}'
 ].join('\n');
 function addStyle(){if(!document.getElementById(st.id))(document.head||document.documentElement).appendChild(st)}
 addStyle();
})();
