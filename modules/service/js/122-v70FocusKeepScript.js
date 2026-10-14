/* Version 1.0 — 2026-09-25: a search box keeps its focus while its list redraws.

   Found in the bug sweep, measured: on คำขอจากลูกค้า the search box took ONE character and then
   lost focus — every keystroke calls a setter that rebuilds the whole page with innerHTML, the
   box included, so the element being typed into no longer exists. The same shape is on
   ประวัติคำขอ (js/61), ดูใบเสนอราคา (js/43) and งานที่สำเร็จแล้ว (js/45), and renderAll() — which
   every realtime row and sync calls — could knock the cursor out of any of them too.

   One seam for all of them: around each of those setters and around renderAll(), the focused
   text box is noted (id, else tag + classes + placeholder) with its caret; if the redraw
   replaced it, the new one is focused and the caret put back. Nothing is re-rendered here and
   no value is touched — the new box already carries the value the page drew into it. */
(function(){
 'use strict';
 function snap(){
  var a=document.activeElement;
  if(!a||!/^(INPUT|TEXTAREA)$/.test(a.tagName))return null;
  if(/^(checkbox|radio|button|submit|file|color|range)$/i.test(a.type||''))return null;
  var sel=a.id?'#'+CSS.escape(a.id):a.tagName.toLowerCase()
   +[].map.call(a.classList,function(c){return '.'+CSS.escape(c)}).join('')
   +(a.getAttribute('placeholder')?'[placeholder="'+String(a.getAttribute('placeholder')).replace(/"/g,'\\"')+'"]':'');
  var s=null,e=null;try{s=a.selectionStart;e=a.selectionEnd}catch(x){}
  return {el:a,sel:sel,s:s,e:e};
 }
 function restore(k){
  if(!k||document.contains(k.el))return;
  var n=null;try{n=document.querySelector(k.sel)}catch(x){n=null}
  if(!n||n===document.activeElement)return;
  try{n.focus({preventScroll:true})}catch(x){try{n.focus()}catch(y){}}
  try{if(k.s!=null)n.setSelectionRange(k.s,k.e)}catch(x){}
 }
 function keep(name){
  var base=window[name];
  if(typeof base!=='function'||base.__focusKept)return;
  var w=function(){
   var k=snap();
   var r=base.apply(this,arguments);
   try{restore(k)}catch(x){}
   return r;
  };
  w.__focusKept=true;
  window[name]=w;
 }
 function install(){
  ['imodeRequestsSet','imodeReqLogSet','imodeQuoteViewSet','imodeDoneSet','renderAll'].forEach(keep);
 }
 install();
 /* some of these are defined inside a DOMContentLoaded install(); a second pass catches them */
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
})();
