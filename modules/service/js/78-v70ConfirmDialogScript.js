/* Beta 1.0 — the browser's grey confirm box becomes the application's own dialog.

   REPORTED (item 13):
     "เช็ค alert หน่อยว่าอันไหนยังไม่ได้ตกแต่งตามสไตล์เว็บบ้าง เช่น alert ของปิดเคส"

   THE AUDIT, done first. There is no bare alert() left anywhere in js/ — every message goes
   through toastMsg(), which is styled. What is still the browser's own grey box is
   window.confirm(), in sixteen places:

     STYLED BY THIS FILE (the ones people meet doing the daily job)
       js/40  imodeDeleteCase            ย้ายเคสไปถังขยะ
       js/40  purge / purge-all          the recycle bin's two permanent deletes
       js/52  imodeDeleteQuotation       ย้ายใบเสนอราคาไปถังขยะ
       js/52  imodeDeleteMachine         two questions: linked cases, then the bin
       js/52  imodeDeleteCustomer        two questions: linked records, then the bin
       js/61  imodeDeleteRequestLog      ลบประวัติคำขอ
       js/06  deleteRelatedEmployee      ลบพนักงานที่เกี่ยวข้อง
       js/06  v68ApplyPricingToQuotation นำราคา S/M/L ไปใช้ใน Quotation
       js/03  prepareQuotation           เริ่มใบเสนอราคาใหม่ทับฟอร์มที่ยังไม่บันทึก — added
                                         2026-09-18 on the owner's instruction, with a
                                         screenshot of the grey box. It was on the list below
                                         because it can lose unsaved typing; it is off it
                                         because it is met while doing the daily job, not in
                                         the settings screens. Nothing irreversible happens
                                         before its confirm — a permission check and a
                                         case-exists lookup — so the replay below is safe.
       js/63  จบงาน                       styled in place — see below
       service-case-detail.html          เปลี่ยนสถานะ / ปิดเคส — the one the report named.
                                         That page is a separate document and loads no js/*,
                                         so it carries its own copy of this dialog.

     LEFT AS THE BROWSER'S BOX, deliberately
       js/03, js/04  restore-from-backup and clear-all-test-data
       js/17         คืนค่ารายชื่อเดิม in the login picker
       js/20         unticking settings.manage on your own role
       js/39         deleting a login account
     These wipe or lock something that no bin can bring back, they are reached from the
     settings screens rather than from the work, and a box that looks unmistakably like the
     browser's is the right amount of friction for them. Said out loud so the owner can
     overrule it: styling them is one entry in WRAP below.

   ------------------------------------------------------------------ HOW, WITHOUT REWRITES

   window.confirm is synchronous and a styled dialog cannot be. Every call site in this
   project is written `if(!confirm(msg))return;` at the top of a handler, so making them
   asynchronous would mean restructuring ten function bodies across six files — which is
   exactly the kind of change that introduces the errors the owner asked to avoid.

   So no body is touched. A named function is wrapped, and during the wrapped call
   window.confirm is temporarily replaced by one that RECORDS the question and answers no,
   which makes the function return early having done nothing. The dialog is then shown; on
   yes the same function is called again with the same arguments, and this time the questions
   already answered return true and the next one (if there is one) is asked. A function with
   two questions therefore takes two rounds, which is why imodeDeleteMachine and
   imodeDeleteCustomer work correctly rather than skipping their second one.

   THIS IS ONLY SAFE FOR A FUNCTION THAT DOES NOTHING IRREVERSIBLE BEFORE ITS confirm, because
   that part runs once per round. Every function in WRAP was read before being listed: each
   does a lookup, a permission check and a toast-on-failure, and nothing else. Do not add a
   name to that list without reading it the same way.

   The replacement of window.confirm lasts only for the synchronous body of the call and is
   put back in a `finally`, so nothing else in the application can ever see it. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* ------------------------------------------------------------ the dialog ---- */
 var box=null,lastFocus=null,onKey=null;

 function close(answer,resolve){
  if(onKey){document.removeEventListener('keydown',onKey,true);onKey=null}
  if(box&&box.parentNode)box.parentNode.removeChild(box);
  box=null;
  try{if(lastFocus&&lastFocus.focus)lastFocus.focus()}catch(e){}
  lastFocus=null;
  resolve(!!answer);
 }

 window.imodeConfirm=function(opts){
  var o=opts||{};
  if(typeof o==='string')o={message:o};
  return new Promise(function(resolve){
   /* A second dialog on top of a first would strand the first one's promise. */
   if(box){resolve(false);return}
   lastFocus=document.activeElement;
   var lines=String(o.message||'').split('\n').filter(function(s){return s!==''});
   box=document.createElement('div');
   box.className='icf-ovl';
   box.innerHTML='<div class="icf-card'+(o.danger?' is-danger':'')+'" role="alertdialog" aria-modal="true"'
    +' aria-label="'+esc2(o.title||tl('ยืนยัน','Confirm'))+'">'
    +'<div class="icf-icon" aria-hidden="true">'+(o.danger?'🗑':'❓')+'</div>'
    +'<h4 class="icf-title">'+esc2(o.title||tl('ยืนยันการทำรายการ','Please confirm'))+'</h4>'
    +'<div class="icf-body">'+lines.map(function(s){return '<p>'+esc2(s)+'</p>'}).join('')+'</div>'
    +'<div class="icf-acts">'
    +'<button type="button" class="icf-no" data-icf="0">'+esc2(o.cancelText||tl('ยกเลิก','Cancel'))+'</button>'
    +'<button type="button" class="icf-yes" data-icf="1">'
      +esc2(o.okText||(o.danger?tl('ลบ','Delete'):tl('ยืนยัน','Confirm')))+'</button>'
    +'</div></div>';
   document.body.appendChild(box);
   var yes=box.querySelector('.icf-yes');
   if(yes)yes.focus();
   box.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('[data-icf]'):null;
    if(b){e.preventDefault();close(b.getAttribute('data-icf')==='1',resolve);return}
    /* The backdrop is a cancel, never a confirm. */
    if(e.target===box){e.preventDefault();close(false,resolve)}
   });
   onKey=function(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false,resolve)}
    else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();close(true,resolve)}
   };
   document.addEventListener('keydown',onKey,true);
  });
 };

 /* ------------------------------------------------------------ the result box ----
    2026-09-18: "เพิ่มแจ้งเตือนเป็น pop up ด้วย ว่า ส่งใบเสนอราคาสำเร็จ หรือไม่สำเร็จ ส่งมาเป็น pop up
    ที่ดูดีเป็นสไตล์เดียวกับเว็บ". Same card, same animation, one button — a toast says it and is
    gone, and whether a quotation reached the customer is worth a moment of somebody's
    attention. It resolves when the box closes, so a caller can navigate afterwards. */
 window.imodeNotice=function(opts){
  var o=opts||{};
  if(typeof o==='string')o={message:o};
  return new Promise(function(resolve){
   if(box){resolve(false);return}
   lastFocus=document.activeElement;
   var lines=String(o.message||'').split('\n').filter(function(s){return s!==''});
   var bad=!!o.danger;
   box=document.createElement('div');
   box.className='icf-ovl';
   box.innerHTML='<div class="icf-card icf-notice'+(bad?' is-bad':' is-good')+'" role="alertdialog"'
    +' aria-modal="true" aria-label="'+esc2(o.title||'')+'">'
    +'<div class="icf-icon" aria-hidden="true">'+(o.icon||(bad?'⚠':'✅'))+'</div>'
    +'<h4 class="icf-title">'+esc2(o.title||(bad?tl('ไม่สำเร็จ','Something went wrong')
                                                 :tl('สำเร็จ','Done')))+'</h4>'
    +'<div class="icf-body">'+lines.map(function(s){return '<p>'+esc2(s)+'</p>'}).join('')+'</div>'
    +'<div class="icf-acts"><button type="button" class="icf-yes" data-icf="1">'
    +esc2(o.okText||tl('ตกลง','OK'))+'</button></div></div>';
   document.body.appendChild(box);
   var yes=box.querySelector('.icf-yes');
   if(yes)yes.focus();
   box.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('[data-icf]'):null;
    if(b||e.target===box){e.preventDefault();close(true,resolve)}
   });
   onKey=function(e){
    if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();e.stopPropagation();close(true,resolve)}
   };
   document.addEventListener('keydown',onKey,true);
  });
 };

 /* ------------------------------------------------ the no-rewrite conversion ---- */
 function style(name,opts){
  var base=window[name];
  if(typeof base!=='function')return false;
  var answered=0,running=false;
  window[name]=function(){
   if(running)return base.apply(this,arguments);   /* our own replay: let it through */
   var self=this,args=arguments,seen=0,asked=null;
   var nativeConfirm=window.confirm;
   window.confirm=function(msg){
    seen++;
    if(seen<=answered)return true;
    asked=String(msg==null?'':msg);
    return false;
   };
   var r;
   try{r=base.apply(self,args)}
   finally{window.confirm=nativeConfirm}
   if(asked===null){answered=0;return r}          /* it finished, or stopped for another reason */
   window.imodeConfirm({
    message:asked,
    danger:!!(opts&&opts.danger),
    title:(opts&&opts.title)||'',
    okText:(opts&&opts.okText)||''
   }).then(function(ok){
    if(!ok){answered=0;return}
    answered=seen;                                 /* say yes to the ones already asked */
    try{window[name].apply(self,args)}
    catch(e){answered=0}
   });
   return r;
  };
  return true;
 }

 /* Read before listing — see the header. */
 var WRAP=[
  ['imodeDeleteCase',        {danger:true,title:'ลบเคสไปถังขยะ'}],
  ['imodeDeleteQuotation',   {danger:true,title:'ลบใบเสนอราคาไปถังขยะ'}],
  ['imodeDeleteMachine',     {danger:true,title:'ลบเครื่องจักร'}],
  ['imodeDeleteCustomer',    {danger:true,title:'ลบลูกค้า'}],
  /* 2026-09-25: was imodeDeleteRequestLog, a name that never existed, so this delete kept the
     browser's grey box. js/61's function is imodeDeleteRequest. */
  ['imodeDeleteRequest',     {danger:true,title:'ลบคำขอไปถังขยะ'}],
  ['deleteRelatedEmployee',  {danger:true,title:'ลบพนักงาน'}],
  ['v68ApplyPricingToQuotation',{title:'ใช้ราคานี้ใน Quotation',okText:'นำไปใช้'}],
  ['prepareQuotation',       {title:'เริ่มใบเสนอราคาใหม่',okText:'เริ่มใหม่'}]
 ];
 function applyAll(){
  WRAP.forEach(function(w){
   if(window['__icf_'+w[0]])return;
   if(style(w[0],w[1]))window['__icf_'+w[0]]=1;
  });
 }
 applyAll();
 /* Some of these are defined inside a DOMContentLoaded install(), so a second pass catches
    whatever was not on window yet at parse time. */
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyAll,{once:true});
 window.addEventListener('load',applyAll,{once:true});
 window.imodeStyleConfirm=style;

 /* ------------------------------------------------------------- 3. จบงาน ---- */
 /* js/63 asks its own question inside a wrapper around saveFieldStatus, not inside a named
    function of its own, so the replay above cannot reach it. Its confirm is swapped for the
    dialog directly, and the rest of js/63 — which decides WHETHER to ask and what happens on
    yes — is untouched. The same window.confirm substitution is used, so if js/63 is ever
    changed to ask twice this still behaves. */
 var baseFieldStatus=window.saveFieldStatus;
 if(typeof baseFieldStatus==='function'){
  var fsAnswered=0;
  window.saveFieldStatus=function(cid){
   var self=this,args=arguments,seen=0,asked=null;
   var nativeConfirm=window.confirm;
   window.confirm=function(msg){
    seen++;
    if(seen<=fsAnswered)return true;
    asked=String(msg==null?'':msg);
    return false;
   };
   var r;
   try{r=baseFieldStatus.apply(self,args)}
   finally{window.confirm=nativeConfirm}
   if(asked===null){fsAnswered=0;return r}
   window.imodeConfirm({
    title:tl('ยืนยันจบงาน','Finish the job'),
    message:asked,
    okText:tl('จบงาน','Finish')
   }).then(function(ok){
    if(!ok){fsAnswered=0;return}
    fsAnswered=seen;
    try{window.saveFieldStatus.apply(self,args)}
    catch(e){fsAnswered=0}
   });
   return r;
  };
 }

 /* ---------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70ConfirmDialogStyle';
 st.textContent=''
 /* Above #modal (10000) and above js/77's note popup (12000): a confirmation is always the
    top thing on the screen. The trap part 17 §9 records is painting above and still letting
    pointer events through, so this owns the whole viewport. */
 +'.icf-ovl{position:fixed;inset:0;z-index:12500;background:rgba(9,22,54,.52);display:flex;'
 +'align-items:center;justify-content:center;padding:18px;animation:icfIn .14s ease}'
 +'@keyframes icfIn{from{opacity:0}to{opacity:1}}'
 +'.icf-card{width:100%;max-width:400px;background:#fff;border-radius:20px;padding:20px 18px 16px;'
 +'text-align:center;box-shadow:0 26px 70px rgba(9,22,54,.34);animation:icfPop .16s ease}'
 +'@keyframes icfPop{from{transform:translateY(10px) scale(.97)}to{transform:none}}'
 +'.icf-icon{font-size:30px;line-height:1;margin-bottom:8px}'
 +'.icf-title{margin:0 0 7px;font-size:16px;font-weight:800;color:#0c225e}'
 +'.icf-body{font-size:13px;color:#4a5c7d;line-height:1.65}'
 +'.icf-body p{margin:0 0 6px}'
 +'.icf-body p:last-child{margin-bottom:0}'
 +'.icf-acts{display:flex;gap:9px;margin-top:16px}'
 +'.icf-no,.icf-yes{flex:1;padding:12px 10px;border-radius:13px;font-size:13.5px;font-weight:800;cursor:pointer}'
 +'.icf-no{border:1px solid #d9e4f5;background:#fff;color:#3d557f}'
 +'.icf-no:hover{border-color:#94a9c8}'
 +'.icf-yes{border:0;color:#fff;background:linear-gradient(180deg,#2f7bf0,#0b63e5);box-shadow:0 4px 0 #084bb0}'
 +'.icf-card.is-danger .icf-yes{background:linear-gradient(180deg,#e2574c,#cf3b30);box-shadow:0 4px 0 #a52a21}'
 +'.icf-yes:active{transform:translateY(2px);box-shadow:0 1px 0 #084bb0}'
 +'.icf-card.is-danger .icf-yes:active{box-shadow:0 1px 0 #a52a21}'
 +'.icf-no:focus-visible,.icf-yes:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* the one-button result box */
 +'.icf-notice .icf-acts{justify-content:center}'
 +'.icf-notice .icf-yes{flex:0 1 190px}'
 +'.icf-notice.is-good .icf-yes{background:linear-gradient(180deg,#14a35c,#0b8a4b);box-shadow:0 4px 0 #077038}'
 +'.icf-notice.is-good .icf-yes:active{box-shadow:0 1px 0 #077038}'
 +'.icf-notice.is-bad .icf-yes{background:linear-gradient(180deg,#e2574c,#cf3b30);box-shadow:0 4px 0 #a52a21}'
 +'.icf-notice.is-bad .icf-yes:active{box-shadow:0 1px 0 #a52a21}'
 +'@media (prefers-reduced-motion:reduce){.icf-ovl,.icf-card{animation:none}.icf-yes:active{transform:none}}';
 document.head.appendChild(st);
})();
