/* Beta 1.0 — จบงาน asks for the customer's signature before it closes the job.

   Reported: "อยากให้ก่อนที่ช่างจะกดอัพเดตสถานะงานไปปิดงาน อยากให้เช็คลายเซ็นลูกค้าก่อนว่ามีหรือไม่
   ถ้ามีปิดงานได้เลย แต่ถ้าไม่ให้ pop up ขึ้นมาว่ายังไม่ได้ลายเซ็นลูกค้า".

   THE TRAP THIS FILE EXISTS AROUND: every report already "has" a customer signature.

     signatureData(id)  ->  canvas.toDataURL('image/png')          (js/03 line 1031)

   A canvas nobody drew on still answers with a perfectly valid PNG — a transparent one — so
   r.customerSignature is a non-empty string on EVERY report ever saved, signed or not. A
   `if(r.customerSignature)` gate would therefore have passed every single case and looked like
   it worked. What is checked here is the ink: the stored PNG is drawn into an offscreen canvas
   and its pixels are counted. A blank pad has none; a signature has thousands.

   That check is asynchronous (an Image has to decode), so the wrapper returns a promise and
   hands over to the original saveFieldStatus only once the answer is in. Nothing downstream
   minds: js/32's advance() removes the temporary #fieldStatusSelect when the promise it was
   given settles, and ours settles after the base's, so the controls js/03 reads as id globals
   are still in the document when it reads them.

   WHAT HAPPENS
     signed      -> straight through to the existing flow: js/63 asks its confirmation and the
                    case is finished exactly as before. Nothing about จบงาน changes.
     not signed  -> a popup saying ยังไม่ได้ลายเซ็นลูกค้า, with a button that opens the
                    ใบตรวจงานช่าง where the pad is, and the status change does NOT happen. The
                    wording separates the two real cases — no inspection sheet at all, or a
                    sheet with an empty pad — because they need different things done.

   Only the word จบงาน is intercepted, read from #fieldStatusSelect the way js/63 does it, so
   every other status step is untouched. All three screens that reach จบงาน go through
   window.saveFieldStatus (js/32's step bar, js/26's stepper, js/03's own status modal), so
   wrapping that one function covers them all.

   This file loads after js/63, which makes it the OUTERMOST wrapper — the gate is decided
   before js/63's "ยืนยันจบงาน" confirmation is raised, so an unsigned job never gets as far as
   being asked about.

   NOT covered, and deliberately: saving the ใบตรวจ itself closes the job too (js/03 sets
   รอส่งงาน and js/44 promotes it to เสร็จสิ้น). That door is the report form, where the
   signature pad is on screen. This is the status-update door the report is about.

   js/03 and js/63 are not edited. Remove this file and จบงาน behaves exactly as it did. */
(function(){
 'use strict';

 var DONE='จบงาน';
 var INK_MIN=16;          /* pixels of ink below which the pad was never really used */

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
 })}
 function caseById(id){
  try{return (Array.isArray(cases)?cases:[]).filter(function(c){return c.id===id})[0]||null}
  catch(e){return null}
 }
 function reportsFor(cid){
  try{return (Array.isArray(serviceReports)?serviceReports:[]).filter(function(r){return r.caseId===cid})}
  catch(e){return []}
 }

 /* Is there ink on this PNG? A data URL never taints a canvas, so the pixels can be read. */
 function hasInk(dataUrl){
  return new Promise(function(res){
   var u=String(dataUrl||'');
   if(u.indexOf('data:image')!==0)return res(false);
   var im=new Image();
   im.onload=function(){
    try{
     var w=Math.max(1,Math.min(im.naturalWidth||600,600));
     var h=Math.max(1,Math.min(im.naturalHeight||180,300));
     var cv=document.createElement('canvas');
     cv.width=w;cv.height=h;
     var ctx=cv.getContext('2d');
     ctx.drawImage(im,0,0,w,h);
     var d=ctx.getImageData(0,0,w,h).data,ink=0;
     for(var i=0;i<d.length;i+=4){
      /* Ink is anything both opaque and darker than the paper: the pad is transparent when
         it is blank, and a signature saved onto a white ground is still dark strokes. */
      if(d[i+3]>24&&(d[i]<230||d[i+1]<230||d[i+2]<230)){
       ink++;
       if(ink>INK_MIN)return res(true);
      }
     }
     res(ink>INK_MIN);
    }catch(e){
     /* A canvas that cannot be read must never block a technician holding a real signature. */
     res(true);
    }
   };
   im.onerror=function(){res(false)};
   im.src=u;
  });
 }

 /* Resolves {ok, reason}: 'none' = no inspection sheet at all, 'blank' = a sheet whose
    customer pad was left empty. Any one signed report is enough. */
 function customerSigned(cid){
  var list=reportsFor(cid);
  if(!list.length)return Promise.resolve({ok:false,reason:'none'});
  return Promise.all(list.map(function(r){return hasInk(r.customerSignature)}))
   .then(function(marks){
    return marks.some(Boolean)?{ok:true,reason:''}:{ok:false,reason:'blank'};
   })
   .catch(function(){return {ok:true,reason:''}});
 }
 window.imodeCustomerSigned=customerSigned;

 /* -------------------------------------------------------------- the popup ---- */
 window.imodeSignGateReport=function(cid){
  try{if(typeof window.closeModal==='function')window.closeModal()}catch(e){}
  setTimeout(function(){
   try{
    if(typeof window.openServiceReport==='function')window.openServiceReport(cid);
    else if(typeof toastMsg==='function')toastMsg(tl('เปิดใบตรวจไม่ได้','Cannot open the sheet'));
   }catch(e){}
  },60);
 };

 function gatePopup(c,reason){
  var why=reason==='none'
   ? tl('ยังไม่ได้บันทึกใบตรวจงานช่างของเคสนี้ ลายเซ็นลูกค้าอยู่ในใบตรวจ',
        'No inspection sheet has been filed for this case. The customer signs on the sheet.')
   : tl('บันทึกใบตรวจไว้แล้ว แต่ช่องลายเซ็นลูกค้ายังว่างอยู่',
        'The inspection sheet is filed, but the customer signature pad was left empty.');
  var body=''
   +'<div class="signgate">'
   + '<div class="signgate-icon">✍️</div>'
   + '<div class="signgate-title">'+esc(tl('ยังไม่ได้ลายเซ็นลูกค้า','No customer signature yet'))+'</div>'
   + '<p class="signgate-why">'+esc(why)+'</p>'
   + '<p class="signgate-note">'+esc(tl('ต้องให้ลูกค้าเซ็นรับงานในใบตรวจงานช่างก่อน จึงจะจบงานได้',
        'The customer must sign the inspection sheet before the job can be finished.'))+'</p>'
   + '<div class="signgate-acts">'
   +  '<button type="button" class="primary-btn" onclick="imodeSignGateReport('+imodeJsArg(c.id)+')">'
   +   esc(tl('📝 เปิดใบตรวจ / ให้ลูกค้าเซ็น','Open the sheet to sign'))+'</button>'
   +  '<button type="button" class="soft-btn" onclick="closeModal()">'+esc(tl('ปิด','Close'))+'</button>'
   + '</div>'
   +'</div>';
  if(typeof window.openModal==='function'){
   window.openModal(tl('ยังไม่ได้ลายเซ็นลูกค้า','Customer signature missing'),
                    (c.ticket||c.id)+' · '+(c.customer||''),body);
  }else if(typeof toastMsg==='function'){
   toastMsg(tl('ยังไม่ได้ลายเซ็นลูกค้า','Customer signature missing'));
  }
 }

 function ensureStyle(){
  if(document.getElementById('imode-signgate-style'))return;
  var st=document.createElement('style');
  st.id='imode-signgate-style';
  st.textContent=''
   +'.signgate{text-align:center;padding:6px 2px 2px}'
   +'.signgate-icon{font-size:40px;line-height:1}'
   +'.signgate-title{font-size:18px;font-weight:900;margin:8px 0 6px;color:#9b1c28}'
   +'.signgate-why{margin:0 0 8px;font-size:13.5px;line-height:1.6;color:#33456b}'
   +'.signgate-note{margin:0;font-size:12.5px;line-height:1.6;color:#6b7d9e;'
   +'background:#fdecee;border-radius:12px;padding:10px 12px}'
   +'.signgate-acts{display:grid;gap:8px;margin-top:14px}'
   +'.signgate-acts button{width:100%}';
  document.head.appendChild(st);
 }

 /* ------------------------------------------------------------- the wrapper ---- */
 var base=window.saveFieldStatus;
 if(typeof base!=='function')return;
 var busy=false;

 window.saveFieldStatus=function(cid){
  var wanted='';
  try{wanted=(document.getElementById('fieldStatusSelect')||{}).value||''}catch(e){}
  if(wanted!==DONE)return base.apply(this,arguments);

  var c=caseById(cid);
  if(!c)return base.apply(this,arguments);

  /* The check costs one image decode, so a second tap in that window would otherwise run the
     whole save twice and write two timeline entries. */
  if(busy)return Promise.resolve(false);
  busy=true;

  var self=this,args=arguments;
  return customerSigned(cid).then(function(r){
   if(r.ok)return base.apply(self,args);
   ensureStyle();
   gatePopup(c,r.reason);
   return false;
  }).then(function(out){busy=false;return out},function(err){busy=false;throw err});
 };
})();
