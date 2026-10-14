/* js/70-v70SignatureUndoScript.js — 2026-09-16
   ↶ ย้อนกลับ beside ล้างลายเซ็น on the ใบตรวจ signature pads.

   WHY. initSignaturePad() (js/03:1029) draws straight onto the canvas and keeps no history at
   all, so the only repair for a wrong stroke was ล้างลายเซ็น — throw the whole signature away
   and ask the customer to sign again, standing in front of them. One bad line cost the lot.

   HOW, and what is deliberately NOT done. js/03 is not edited. signaturePadHTML() and
   initSignaturePad() are top-level function declarations, which makes them window properties,
   so replacing them here changes what the bare identifiers inside openServiceReport() resolve
   to (part 18). Both are WRAPPED, never reimplemented: the base still builds the markup and
   still owns every line of the drawing logic; this file only adds a snapshot in front of the
   base's own pointerdown handler and a button that puts a snapshot back. Delete this file and
   the pads behave exactly as they did before.

   WHAT A SNAPSHOT IS. canvas.toDataURL(), not getImageData(): a 560×180 ImageData is ~400 KB
   and twenty of them per pad on a technician's phone is 8 MB of live memory for a feature
   nobody may use. A signature is nearly all blank, so the PNG is a few KB. The cost is that
   putting one back is an image load and therefore asynchronous, which is why a second ย้อนกลับ
   pressed during the first one is swallowed rather than queued — the same in-flight guard
   js/68 uses on the signature gate.

   ล้างลายเซ็น IS ALSO UNDOABLE. It snapshots before it clears. Pressing it by mistake destroys
   a signature a customer has already given and who has probably already left, which is worse
   than the wrong stroke this file was asked to fix.

   The styles are injected as a <style> at runtime, the way js/10, js/16 and js/53 do it:
   css/21 and css/23 have to stay the last two <link> tags, so a new stylesheet cannot go
   after them. */
(function(){
 'use strict';
 var CAP=20;                 /* strokes remembered per pad */
 var stacks={};              /* id -> [dataURL, …], oldest first */
 var busy={};                /* id -> true while a restore is in flight */

 function canvasOf(id){return document.getElementById(id)}
 function btnOf(id){return document.getElementById(id+'Undo')}
 function paint(id){
  var b=btnOf(id);
  if(b)b.disabled=!(stacks[id]&&stacks[id].length);
 }
 function snap(id){
  var c=canvasOf(id);
  if(!c)return;
  var url='';
  try{url=c.toDataURL('image/png')}catch(e){return}   /* a tainted canvas cannot be read */
  var s=stacks[id]=stacks[id]||[];
  s.push(url);
  while(s.length>CAP)s.shift();
  paint(id);
 }

 /* ---------- 1. the button, inserted into the markup the base builds ---------- */
 var baseHTML=window.signaturePadHTML;
 if(typeof baseHTML==='function'){
  window.signaturePadHTML=function(id,label){
   var html=baseHTML.apply(this,arguments);
   var clear='<button type="button" class="mini-btn" onclick="clearSignaturePad('+imodeJsArg(id)+')">ล้างลายเซ็น</button>';
   /* If js/03's markup ever changes, leave it alone rather than corrupting it. */
   if(String(html).indexOf(clear)<0)return html;
   var undo='<button type="button" class="mini-btn sig-undo" id="'+id+'Undo" disabled'
     +' onclick="imodeSignatureUndo('+imodeJsArg(id)+')" title="ลบเส้นล่าสุด">↶ ย้อนกลับ</button>';
   /* A <div>, not a <span>: the ≤640px rule sets .signature-actions span{font-size:9.5px;
      max-width:65%} for the hint text, and a span wrapper would shrink both buttons with it. */
   return String(html).replace(clear,'<div class="sig-btns">'+undo+clear+'</div>');
  };
 }

 /* ---------- 2. a snapshot in front of the base's own stroke handler ---------- */
 var baseInit=window.initSignaturePad;
 if(typeof baseInit==='function'){
  window.initSignaturePad=function(id,initial){
   var out=baseInit.apply(this,arguments);
   var c=canvasOf(id);
   if(!c)return out;
   stacks[id]=[];busy[id]=false;
   /* The base has just assigned canvas.onpointerdown, so this chains onto the handler that is
      actually live. It is re-chained on every init because the base reassigns every time. */
   var down=c.onpointerdown;
   if(typeof down==='function'){
    c.onpointerdown=function(e){snap(id);return down.apply(this,arguments)};
   }
   paint(id);
   return out;
  };
 }

 /* ---------- 3. ล้างลายเซ็น becomes undoable too ---------- */
 var baseClear=window.clearSignaturePad;
 if(typeof baseClear==='function'){
  window.clearSignaturePad=function(id){
   snap(id);
   var out=baseClear.apply(this,arguments);
   paint(id);
   return out;
  };
 }

 /* ---------- 4. the undo itself ---------- */
 window.imodeSignatureUndo=function(id){
  var s=stacks[id];
  if(busy[id]||!s||!s.length)return;
  var c=canvasOf(id);
  if(!c)return;
  var url=s.pop();
  paint(id);
  busy[id]=true;
  var ctx=c.getContext('2d');
  var done=function(){busy[id]=false};
  var im=new Image();
  im.onload=function(){
   ctx.clearRect(0,0,c.width,c.height);
   ctx.drawImage(im,0,0,c.width,c.height);
   /* The base set these once at init; drawImage does not disturb them, but a restore is also
      the moment a fresh stroke may start, so they are restated rather than assumed. */
   ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#173b8f';
   done();
  };
  im.onerror=done;
  im.src=url;
 };

 /* ---------- 5. styles ---------- */
 var css=document.createElement('style');
 css.textContent=
  '.sig-btns{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}'
 +'.sig-undo[disabled]{opacity:.42;cursor:not-allowed}'
 +'@media(max-width:640px){.sig-btns{justify-content:flex-start}}';
 (document.head||document.documentElement).appendChild(css);
})();
