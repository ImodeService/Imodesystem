/* Beta 1.0 — 2026-09-23: every popup in the application opens and closes with motion.
   Asked for: "เพิ่ม Animation ของ popup ทุก popup เวลาเปิดให้มันเด้งขึ้นมา สมูทๆ และตอนปิดก็ปิดแบบสมูท".

   THE PART THAT IS NOT OBVIOUS — the exit. css/01 is `.modal{display:none}` /
   `.modal.open{display:flex}`, and closeModal() removes that class synchronously, so the
   element is display:none in the same frame and there is nothing left to animate. The usual
   fix — keeping the modal displayed all the time and fading `visibility` — was rejected: too
   much of this project asks `modal.classList.contains('open')` (js/29's whole popup stack does),
   and a full-screen overlay that is always in the layout is a new class of bug for a phone.

   Instead `open` keeps its exact meaning and a transient class, `is-closing`, holds the
   element visible for 200ms while it animates out. `#modal.is-closing` is (1,1,0) against
   `.modal`'s (0,1,0), so it wins the display without !important, and nothing else in the
   application can see a state it did not have before.

   The styles are injected rather than added to css/, because css/21 and css/23 have to stay
   the last two stylesheets. Every selector here is anchored on #modal, so an id beats the
   class rules in css/01 and css/07 whatever the load order turns out to be. */
(function(){
 'use strict';

 var OUT=220;   /* keep in step with the exit animation duration below */

 function modalEl(){return document.getElementById('modal')}
 function panelEl(){return document.getElementById('modalPanel')}
 function motionOk(){
  try{return !window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return true}
 }

 var outT=null;
 function cancelClosing(m){
  if(!m)return;
  clearTimeout(outT);
  m.classList.remove('is-closing');
 }

 var baseOpen=window.openModal;
 if(typeof baseOpen==='function'){
  window.openModal=function(){
   var m=modalEl();
   /* Re-opening during the exit: drop the closing state first, or the panel animates out
      from under content that has already been replaced. */
   cancelClosing(m);
   var wasOpen=!!(m&&m.classList.contains('open'));
   var r=baseOpen.apply(this,arguments);
   /* A popup opened ON TOP of another (js/29 stacks them) never gets the `open` class added,
      so the entrance keyframe does not re-run. The content really did change, so it gets a
      shorter swap animation of its own — restarted by hand, because re-adding a class in the
      same frame does not replay an animation. */
   if(wasOpen&&motionOk()){
    var p=panelEl();
    if(p){
     p.classList.remove('is-swap');
     void p.offsetWidth;
     p.classList.add('is-swap');
     setTimeout(function(){p.classList.remove('is-swap')},300);
    }
   }
   return r;
  };
 }

 var baseClose=window.closeModal;
 if(typeof baseClose==='function'){
  window.closeModal=function(){
   var m=modalEl();
   var wasOpen=!!(m&&m.classList.contains('open'));
   var r=baseClose.apply(this,arguments);
   m=modalEl();
   /* Only when it really closed. js/29's closeModal decides about history on the next
      macrotask and may leave the popup open; this must follow what actually happened. */
   if(wasOpen&&m&&!m.classList.contains('open')&&motionOk()){
    m.classList.add('is-closing');
    clearTimeout(outT);
    outT=setTimeout(function(){m.classList.remove('is-closing')},OUT+40);
   }
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70ModalMotionStyle';
 st.textContent=''
 /* enter */
 +'@keyframes imModalIn{from{opacity:0}to{opacity:1}}'
 +'@keyframes imPanelIn{from{opacity:0;transform:translateY(20px) scale(.965)}'
 +'to{opacity:1;transform:none}}'
 +'@keyframes imPanelSwap{from{opacity:.4;transform:translateY(7px) scale(.992)}'
 +'to{opacity:1;transform:none}}'
 /* leave */
 +'@keyframes imModalOut{from{opacity:1}to{opacity:0}}'
 /* The exit SHRINKS — asked for directly: "ผมอยากให้มันหดลง". A fade alone reads as the
    popup dissolving; pulling it down to 86% reads as it being put away. */
 +'@keyframes imPanelOut{from{opacity:1;transform:none}'
 +'to{opacity:0;transform:translateY(8px) scale(.86)}}'
 +'#modal.open{animation:imModalIn .2s ease both}'
 /* the springy tail of this curve is the "เด้ง" — it overshoots slightly and settles */
 +'#modal.open .modal-panel{animation:imPanelIn .38s cubic-bezier(.16,1.06,.32,1) both}'
 +'#modal .modal-panel.is-swap{animation:imPanelSwap .28s cubic-bezier(.2,.9,.3,1) both}'
 +'#modal.is-closing{display:flex;pointer-events:none;animation:imModalOut .2s ease both}'
 +'#modal.is-closing .modal-panel{transform-origin:center center;animation:imPanelOut .22s cubic-bezier(.36,0,.66,-.05) both}'
 /* A modal that is closing must never take a click meant for the page underneath. */
 +'#modal.is-closing *{pointer-events:none}'
 +'@media(prefers-reduced-motion:reduce){'
 +'#modal.open,#modal.open .modal-panel,#modal .modal-panel.is-swap,'
 +'#modal.is-closing,#modal.is-closing .modal-panel{animation:none}}';
 document.head.appendChild(st);
})();
