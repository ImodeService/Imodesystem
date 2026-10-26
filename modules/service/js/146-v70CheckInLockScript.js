/* 2026-10-25: Check-in is only for the moment the technician arrives.
   Request: once pressed, the 📍 Check-in button cannot be pressed again, and it can only be
   pressed while the field step is กำลังเดินทาง. A technician who pressed something by mistake
   steps back first (↩ ย้อนกลับ on the field workspace, js/32), which puts the job back on
   กำลังเดินทาง and opens the button again.

   1. window.fieldCheckIn (js/03) refuses unless c.fieldStatus is กำลังเดินทาง, and a second
      tap while GPS is still being read does nothing.
   2. Every Check-in button on screen (field workspace action bar, js/03 field job cards) is
      greyed out with the reason in its title whenever the rule says no. It runs off a
      MutationObserver because those buttons are rebuilt by several render functions.
   3. The ถัดไป / 📦 buttons of the step bar (js/32) are disabled from the first tap until the
      bar is rebuilt, so a double tap cannot log the same step twice. */
(function(){
 'use strict';
 var TRAVEL='กำลังเดินทาง';
 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function findCase(cid){try{return cases.find(function(x){return x.id===cid})}catch(e){return null}}
 function canCheckIn(c){return !!c&&(c.fieldStatus||'')===TRAVEL}
 function reason(c){
  if(!c)return '';
  var fs=c.fieldStatus||'';
  if(!fs)return tl('กด "ถัดไป: กำลังเดินทาง" ก่อน จึงจะ Check-in ได้','Set the job to travelling first');
  if(fs==='ถึงหน้างาน'||c.checkInAt)return tl('Check-in แล้ว ถ้ากดผิดให้ย้อนขั้นตอนกลับไปที่ "กำลังเดินทาง" ก่อน','Already checked in. Step back to travelling to check in again');
  return tl('Check-in ได้เฉพาะขั้นตอน "กำลังเดินทาง" ถ้าต้องการให้ย้อนขั้นตอนก่อน','Check-in is only allowed while travelling. Step back first');
 }
 function say(m){try{toastMsg(m)}catch(e){}}

 /* ---------------------------------------------------------- 1. the function ---- */
 var busy={};
 var base=window.fieldCheckIn;
 if(typeof base==='function'){
  window.fieldCheckIn=function(cid){
   var c=findCase(cid);
   if(!canCheckIn(c)){say(reason(c));return}
   if(busy[cid])return;
   busy[cid]=true;
   setTimeout(function(){delete busy[cid]},15000);
   var r;
   try{r=base.apply(this,arguments)}catch(e){delete busy[cid];throw e}
   return r;
  };
 }

 /* ------------------------------------------------------------ 2. the buttons ---- */
 var RX=/fieldCheckIn\('((?:[^'\\]|\\.)*)'\)/;
 function unesc(s){return s.replace(/\\u([0-9a-fA-F]{4})/g,function(_,h){return String.fromCharCode(parseInt(h,16))})}
 function pass(){
  [].forEach.call(document.querySelectorAll('button[onclick*="fieldCheckIn("]'),function(b){
   var m=RX.exec(b.getAttribute('onclick')||'');if(!m)return;
   var c=findCase(unesc(m[1]));
   /* the press went through and the step moved on: a later step back must open it again */
   if(c&&busy[c.id]&&!canCheckIn(c))delete busy[c.id];
   var ok=canCheckIn(c)&&!busy[c.id];
   if(b.disabled===!ok)return;
   b.disabled=!ok;
   b.classList.toggle('imode-ci-locked',!ok);
   if(ok)b.removeAttribute('title');else b.title=reason(c);
  });
 }
 var queued=false;
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{pass()}catch(e){}})}
 function start(){
  try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}catch(e){}
  schedule();
 }
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
 /* a step change re-renders the bar, but a cloud sync can change fieldStatus without one */
 setInterval(schedule,3000);

 /* --------------------------------------------------------- 3. double taps ---- */
 document.addEventListener('click',function(ev){
  var b=ev.target&&ev.target.closest&&ev.target.closest('.fw-next');
  if(!b)return;
  if(b.disabled||b.getAttribute('data-ci-busy')){ev.preventDefault();ev.stopImmediatePropagation();return}
  var bar=b.closest('.fw-stepactions')||b.parentNode;
  setTimeout(function(){
   [].forEach.call(bar.querySelectorAll('.fw-next'),function(x){x.disabled=true;x.setAttribute('data-ci-busy','1')});
  },0);
  /* the bar is normally rebuilt within a moment; this only matters if a save failed */
  setTimeout(function(){
   [].forEach.call(bar.querySelectorAll('.fw-next'),function(x){x.disabled=false;x.removeAttribute('data-ci-busy')});
  },4000);
 },true);

 var st=document.createElement('style');
 st.textContent='button.imode-ci-locked,button.imode-ci-locked:hover,button.imode-ci-locked:active{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;filter:grayscale(.6)}'
  +'.fw-next[disabled]{opacity:.6;cursor:progress}';
 (document.head||document.documentElement).appendChild(st);
})();
