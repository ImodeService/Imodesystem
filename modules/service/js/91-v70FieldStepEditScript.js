/* js/91-v70FieldStepEditScript.js — 2026-09-21
   THE อัปเดตสถานะงาน POPUP: save moves the job on, and a step already recorded can be corrected.

   Two things the owner asked for on หน้างานช่าง:

     1. "หลังกดบันทึกสถานะที่เลือกเสร็จไปสถานะต่อไปออโต้" — the note and the photos describe the
        step the technician has just finished, so they are saved against the CURRENT status and
        the job then moves on by itself. One press instead of two.
     2. "ทำให้สามารถกดกลับมาแก้ไขได้เผื่อเขียนอะไรผิด" — the numbered chips are pressable. One that
        has already been recorded reopens what was written there, and saving CORRECTS that entry
        rather than adding another. Every correction keeps the version it replaced, so a wrong
        correction can be put back.

   WHERE IT ALL LIVES. Nothing new: an entry of `c.fieldStatusLog` gains `editedAt`, `editedBy`
   and `revisions[]`. That array is `service_cases.field_status_log`, a real jsonb column in
   cloudUpsertCase()'s whitelist (js/03:1726), so the history travels between devices with the
   case and needs no SQL from anybody.

   WHAT A REVISION KEEPS, and why not everything. The note, always. The photos ONLY when the
   edit actually changed them: a note-only correction would otherwise copy hundreds of KB of
   data URLs into the same case row, and this project has already hit the localStorage ceiling
   once (part 26). A revision that did not touch the photos says so on screen, and restoring it
   puts the note back and leaves the photos alone. Capped at REV_CAP, oldest dropped.

   WHY NOT WRAP saveFieldStatus(). js/32's step bar and js/26's own ถัดไป buttons call it too,
   and they must NOT auto-advance — they already are the advance. Only the one button inside
   this popup changes, so its onclick is replaced during the enhancement pass and js/03,
   js/26, js/63 and js/68 are all left exactly as they are.

   Loads last, so this wrapper on openFieldStatusModal is the outermost one and sees the markup
   js/26 built. */
(function(){
 'use strict';

 var REV_CAP=5;
 var EDIT=null;                 /* {caseId, entryId} while a past step is being corrected */

 function esc2(v){try{return window.esc?window.esc(v):String(v==null?'':v)}catch(e){return String(v==null?'':v)}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 /* fmt / fmtDay in js/03 are const arrow functions — lexical globals, never on window
    (part 19). Rather than reach for one, this page formats its own. */
 function fmtT(v){
  if(!v)return '-';
  var d=new Date(v);
  if(isNaN(d))return String(v);
  try{return d.toLocaleString(typeof uiLocale==='function'?uiLocale():'th-TH',
    {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  catch(e){return d.toISOString()}
 }
 function caseById(id){
  try{for(var i=0;i<cases.length;i++)if(cases[i]&&cases[i].id===id)return cases[i]}catch(e){}
  return null;
 }
 function logOf(c){return (c&&Array.isArray(c.fieldStatusLog))?c.fieldStatusLog:[]}
 function entryById(c,eid){
  var l=logOf(c);
  for(var i=0;i<l.length;i++)if(l[i]&&l[i].id===eid)return l[i];
  return null;
 }
 /* the newest entry recorded at that status — that is the one a correction edits */
 function latestFor(c,status){
  var l=logOf(c),hit=null;
  for(var i=0;i<l.length;i++)if(l[i]&&l[i].status===status)hit=l[i];
  return hit;
 }
 function who(){
  try{return (currentUser&&(currentUser.name||currentUser.id))||''}catch(e){return ''}
 }
 function mediaNow(){
  try{return JSON.parse(JSON.stringify(pendingFieldStatusMedia||[]))}catch(e){return []}
 }
 function sameMedia(a,b){
  a=a||[];b=b||[];
  if(a.length!==b.length)return false;
  for(var i=0;i<a.length;i++){
   if(String((a[i]||{}).data||'')!==String((b[i]||{}).data||''))return false;
  }
  return true;
 }

 /* ------------------------------------------------------------ revisions ---- */
 function pushRevision(e,nextMedia){
  if(!e)return;
  if(!Array.isArray(e.revisions))e.revisions=[];
  var prev={note:e.note||'',at:e.editedAt||e.createdAt||'',by:e.editedBy||e.techId||''};
  if(!sameMedia(e.media,nextMedia)){
   try{prev.media=JSON.parse(JSON.stringify(e.media||[]))}catch(x){}
  }
  e.revisions.push(prev);
  while(e.revisions.length>REV_CAP)e.revisions.shift();
 }
 function persist(c,msg){
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
  try{if(typeof closeModal==='function')closeModal()}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  if(msg)toast(msg);
 }

 /* ------------------------------------------------------- the enhancement ---- */
 function chipsHTML(c){
  /* rebuilt from what js/26 rendered, so the ladder stays one list in one place */
  var steps=document.querySelectorAll('#modalBody .fsx-steps li');
  [].forEach.call(steps,function(li){
   if(li.querySelector('.fsx-editbtn'))return;
   var status=(li.querySelector('b')||{}).textContent||'';
   var e=latestFor(c,status);
   var btn=document.createElement('button');
   btn.type='button';
   btn.className='fsx-editbtn'+(e?' has-entry':'');
   btn.setAttribute('data-fsx-edit',status);
   btn.setAttribute('aria-label',status+(e?' — แก้ไขบันทึกของขั้นนี้':' — ยังไม่มีบันทึก'));
   while(li.firstChild)btn.appendChild(li.firstChild);
   if(e)btn.insertAdjacentHTML('beforeend','<i class="fsx-pen" aria-hidden="true">✎</i>');
   li.appendChild(btn);
  });
 }
 function banner(){
  var host=document.getElementById('fsxEditBox');
  if(!host)return;
  if(!EDIT){host.innerHTML='';host.hidden=true;return}
  var c=caseById(EDIT.caseId),e=entryById(c,EDIT.entryId);
  if(!e){host.innerHTML='';host.hidden=true;return}
  var revs=Array.isArray(e.revisions)?e.revisions:[];
  host.hidden=false;
  host.innerHTML='<div class="fsx-edit-head"><b>✎ กำลังแก้ไข: '+esc2(e.status)+'</b>'
   +'<small>บันทึกครั้งแรก '+esc2(fmtT(e.createdAt))
   +(e.editedAt?(' · แก้ไขล่าสุด '+esc2(fmtT(e.editedAt))+(e.editedBy?' โดย '+esc2(e.editedBy):'')):'')
   +'</small>'
   +'<button type="button" class="soft-btn fsx-cancel-edit" data-fsx-cancel="1">ออกจากการแก้ไข</button></div>'
   +(revs.length?'<details class="fsx-revs"><summary>🕘 ประวัติการแก้ไข ('+revs.length+')</summary>'
     +'<ol class="fsx-revlist">'+revs.map(function(r,i){
        return '<li><div class="fsx-revmeta">'+esc2(fmtT(r.at))
          +(r.by?' · '+esc2(r.by):'')
          +(r.media?(' · รูป/วิดีโอ '+(r.media.length||0)+' ไฟล์'):' · ไม่ได้เปลี่ยนรูป')+'</div>'
          +'<div class="fsx-revnote">'+(r.note?esc2(r.note):'<i>ไม่มีรายละเอียด</i>')+'</div>'
          +'<button type="button" class="soft-btn" data-fsx-restore="'+i+'">ใช้ฉบับนี้</button></li>';
       }).join('')+'</ol>'
     +'<p class="fsx-revhint">กดใช้ฉบับนี้แล้วฉบับปัจจุบันจะถูกเก็บเข้าประวัติด้วย จึงย้อนกลับได้อีก</p>'
     +'</details>':'<p class="fsx-revhint">ยังไม่เคยแก้ไขบันทึกของขั้นนี้</p>');
 }
 function enterEdit(cid,status){
  var c=caseById(cid),e=latestFor(c,status);
  if(!e){toast('ยังไม่มีบันทึกของขั้น "'+status+'" — ทำถึงขั้นนี้ก่อนจึงจะแก้ไขได้');return}
  EDIT={caseId:cid,entryId:e.id};
  var note=document.getElementById('fieldStatusNote');
  if(note)note.value=e.note||'';
  try{pendingFieldStatusMedia=JSON.parse(JSON.stringify(e.media||[]))}catch(x){}
  try{if(typeof renderFieldStatusMedia==='function')renderFieldStatusMedia()}catch(x){}
  paint(cid);
  if(note)try{note.focus()}catch(x){}
 }
 function leaveEdit(cid){
  EDIT=null;
  var note=document.getElementById('fieldStatusNote');
  if(note)note.value='';
  try{pendingFieldStatusMedia=[]}catch(x){}
  try{if(typeof renderFieldStatusMedia==='function')renderFieldStatusMedia()}catch(x){}
  paint(cid);
 }
 /* what the popup looks like depends only on EDIT, so one function sets all of it */
 function paint(cid){
  var c=caseById(cid);
  var editing=!!EDIT;
  var acts=document.querySelector('#modalBody .fsx-actions');
  if(acts)acts.style.display=editing?'none':'';
  var manual=document.querySelector('#modalBody .fsx-manual');
  if(manual)manual.style.display=editing?'none':'';
  var save=document.getElementById('fsxSaveBtn');
  if(save){
   var nx='';
   try{nx=window.imodeFieldNextStatus?window.imodeFieldNextStatus((c&&c.fieldStatus)||''):''}catch(e){}
   save.textContent=editing?'บันทึกการแก้ไข'
     :(nx?('บันทึก แล้วไปต่อ: '+nx):'บันทึกสถานะที่เลือก');
   save.className=editing?'primary-btn':'primary-btn';
  }
  [].forEach.call(document.querySelectorAll('#modalBody .fsx-steps li'),function(li){
   var b=li.querySelector('[data-fsx-edit]');
   li.classList.toggle('is-editing',!!(editing&&b&&b.getAttribute('data-fsx-edit')===editStatus()));
  });
  banner();
 }
 function editStatus(){
  if(!EDIT)return '';
  var e=entryById(caseById(EDIT.caseId),EDIT.entryId);
  return e?e.status:'';
 }

 /* ------------------------------------------------------------- the saves ---- */
 function saveEdit(){
  var c=caseById(EDIT.caseId),e=entryById(c,EDIT.entryId);
  if(!c||!e){toast('ไม่พบบันทึกที่กำลังแก้ไข');EDIT=null;return}
  var noteEl=document.getElementById('fieldStatusNote');
  var note=noteEl?String(noteEl.value||'').trim():'';
  var media=mediaNow();
  if(note===String(e.note||'')&&sameMedia(e.media,media)){
   toast('ไม่มีอะไรเปลี่ยน');
   return;
  }
  pushRevision(e,media);
  e.note=note;
  e.media=media;
  e.editedAt=new Date().toISOString();
  e.editedBy=who();
  c.updatedAt=e.editedAt;
  EDIT=null;
  persist(c,'แก้ไขบันทึกของ "'+e.status+'" แล้ว');
 }
 function restore(idx){
  var c=caseById(EDIT.caseId),e=entryById(c,EDIT.entryId);
  if(!c||!e||!Array.isArray(e.revisions))return;
  var r=e.revisions[idx];
  if(!r)return;
  /* the version being replaced goes into the history too, so a wrong restore is undoable */
  var nextMedia=r.media?JSON.parse(JSON.stringify(r.media)):e.media;
  pushRevision(e,nextMedia);
  e.note=r.note||'';
  if(r.media){try{e.media=JSON.parse(JSON.stringify(r.media))}catch(x){}}
  e.editedAt=new Date().toISOString();
  e.editedBy=who();
  c.updatedAt=e.editedAt;
  /* stay in the popup so the result is visible and can be undone straight away */
  var noteEl=document.getElementById('fieldStatusNote');
  if(noteEl)noteEl.value=e.note;
  try{pendingFieldStatusMedia=JSON.parse(JSON.stringify(e.media||[]))}catch(x){}
  try{if(typeof renderFieldStatusMedia==='function')renderFieldStatusMedia()}catch(x){}
  try{if(typeof saveLocal==='function')saveLocal()}catch(x){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(x){}
  paint(c.id);
  toast('นำฉบับเมื่อ '+fmtT(r.at)+' กลับมาใช้แล้ว');
 }
 /* The note and the photos belong to the step just finished, so they are written against the
    CURRENT status and the job is moved on afterwards.

    THE NOTE GOES INTO THE ENTRY THAT STEP ALREADY HAS. saveFieldStatus() always APPENDS, so
    handing it the note would leave two entries for the same step — the empty one written when
    the technician arrived, and a second one carrying the note — on every single step. Measured:
    the ladder filled with pairs and the correction history hung off the older of the two, where
    nothing would ever look for it. One step, one entry, and it accumulates what happened there.

    Only the move to the NEXT status goes through js/03: js/32's advance() is reused rather than
    reimplemented, so the status write, the cloud push and the re-render stay in the one function
    that owns them, and จบงาน still meets js/63's confirmation and js/68's signature gate.

    Two cases fall back to the base save instead: a step with no entry yet (nothing to fill in),
    and a manually picked status the job has never been at. */
 function saveAndAdvance(cid){
  var c=caseById(cid);
  var cur='';
  var sel=document.getElementById('fieldStatusSelect');
  if(sel)cur=sel.value||'';
  if(!cur)cur=(c&&c.fieldStatus)||'';
  var nx='';
  try{nx=window.imodeFieldNextStatus?window.imodeFieldNextStatus(cur):''}catch(e){}
  var onward=function(){
   if(!nx||typeof window.imodeFieldAdvance!=='function')return;
   /* advance() refuses while a modal is open, so this waits for the close to have happened */
   setTimeout(function(){try{window.imodeFieldAdvance(cid,nx)}catch(e){}},0);
  };

  var e=(cur===((c&&c.fieldStatus)||''))?latestFor(c,cur):null;
  if(c&&e){
   var noteEl=document.getElementById('fieldStatusNote');
   var note=noteEl?String(noteEl.value||'').trim():'';
   var media=mediaNow();
   if(note!==String(e.note||'')||!sameMedia(e.media,media)){
    /* a revision only when something is being REPLACED — filling in a step that was recorded
       empty on arrival is not a correction and should not clutter the history */
    if(String(e.note||'')||(e.media||[]).length){
     pushRevision(e,media);
     e.editedAt=new Date().toISOString();
     e.editedBy=who();
    }
    e.note=note;
    e.media=media;
    c.updatedAt=new Date().toISOString();
   }
   try{if(typeof saveLocal==='function')saveLocal()}catch(x){}
   try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(x){}
   try{if(typeof closeModal==='function')closeModal()}catch(x){}
   if(nx){onward();return}
   try{if(typeof renderAll==='function')renderAll()}catch(x){}
   toast('บันทึก "'+cur+'" แล้ว — อยู่ขั้นสุดท้ายของงานหน้างานแล้ว');
   return;
  }

  var r;
  try{r=window.saveFieldStatus(cid)}catch(x){return}
  if(r&&typeof r.then==='function')r.then(onward,function(){});
  else onward();
 }

 /* --------------------------------------------------------------- wiring ---- */
 function install(cid){
  var body=document.getElementById('modalBody');
  if(!body)return;
  var c=caseById(cid);
  if(!c)return;
  chipsHTML(c);

  /* the edit banner sits directly under the ladder */
  if(!document.getElementById('fsxEditBox')){
   var wrap=body.querySelector('.fsx-wrap');
   if(wrap){
    var box=document.createElement('div');
    box.id='fsxEditBox';box.className='fsx-editbox';box.hidden=true;
    wrap.appendChild(box);
   }
  }
  /* the one button in this popup that changes — not saveFieldStatus itself, which the step
     bar and the ถัดไป buttons also call and which must stay exactly as it is for them */
  var save=null;
  [].forEach.call(body.querySelectorAll('button'),function(b){
   if(save)return;
   var oc=b.getAttribute('onclick')||'';
   if(oc.indexOf('saveFieldStatus')>=0)save=b;
  });
  if(save){
   save.id='fsxSaveBtn';
   save.removeAttribute('onclick');
   save.onclick=function(ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(EDIT)saveEdit();else saveAndAdvance(cid);
   };
  }

  /* A delegated listener on `document` NEVER fires inside the popup: js/05 stops propagation
     on #modalPanel (the ต้องกดกากบาทเท่านั้น guard). Listeners on its descendants still do,
     so this one lives on #modalBody. Recorded in js/16 and walked into again in part 26. */
  if(!body.dataset.fsxWired){
   body.dataset.fsxWired='1';
   body.addEventListener('click',function(ev){
    var t=ev.target;
    var ed=t.closest&&t.closest('[data-fsx-edit]');
    if(ed){ev.preventDefault();enterEdit(cid,ed.getAttribute('data-fsx-edit'));return}
    if(t.closest&&t.closest('[data-fsx-cancel]')){ev.preventDefault();leaveEdit(cid);return}
    var rs=t.closest&&t.closest('[data-fsx-restore]');
    if(rs){ev.preventDefault();restore(Number(rs.getAttribute('data-fsx-restore'))||0);return}
   });
  }
  paint(cid);
 }

 var baseOpen=window.openFieldStatusModal;
 if(typeof baseOpen==='function'){
  window.openFieldStatusModal=function(cid){
   EDIT=null;
   var r=baseOpen.apply(this,arguments);
   try{install(cid)}catch(e){}
   return r;
  };
 }

 /* ----------------------------------------------- the ladder ON THE PAGE ----
    หน้างานช่าง draws its own copy of the nine steps (js/32's .fw-ladder), and only the one inside
    the popup had been made pressable. Same behaviour here: a step already recorded opens the
    popup ALREADY in edit mode for it, so there is one correction form, not two.

    THE CLICK IS DELEGATED ON `document` AND THAT IS DELIBERATE. The ladder is on the page, not
    inside #modal, so js/05's propagation guard does not apply here (it is exactly why the
    popup's listener had to sit on #modalBody instead). Delegating also means the handler
    survives every re-render of #fwStatus without being re-attached — and renderWorkspace() is
    reached through js/32's CLOSURE, not through window.imodeRenderFieldWorkspace, so wrapping
    the exported name would have missed the main path (the trap renderMyWork set in part 18).

    The decoration — role, tabindex, a class for the cursor — is applied by an observer on
    #fwStatus, disconnected around its own writes so it cannot see them. If it ever misses a
    pass the clicking still works, because that does not depend on it. */
 function pageCaseId(){
  try{return (window.imodeFieldJobId&&window.imodeFieldJobId())||''}catch(e){return ''}
 }
 function statusOfLi(li){
  var b=li&&li.querySelector('b');
  return b?String(b.textContent||'').trim():'';
 }
 function openPageEdit(status){
  var cid=pageCaseId();
  if(!cid||!status)return;
  var c=caseById(cid);
  if(!latestFor(c,status)){
   toast('ยังไม่มีบันทึกของขั้น "'+status+'" — ทำถึงขั้นนี้ก่อนจึงจะแก้ไขได้');
   return;
  }
  if(typeof window.openFieldStatusModal!=='function')return;
  window.openFieldStatusModal(cid);
  /* openModal() fills #modalBody synchronously, and install() has run by the time this
     returns, so the edit can be entered straight away. */
  try{enterEdit(cid,status)}catch(e){}
 }
 document.addEventListener('click',function(ev){
  var li=ev.target&&ev.target.closest&&ev.target.closest('.fw-ladder li');
  if(!li)return;
  ev.preventDefault();
  openPageEdit(statusOfLi(li));
 });
 document.addEventListener('keydown',function(ev){
  if(ev.key!=='Enter'&&ev.key!==' ')return;
  var li=ev.target&&ev.target.closest&&ev.target.closest('.fw-ladder li');
  if(!li)return;
  ev.preventDefault();
  openPageEdit(statusOfLi(li));
 });
 (function watchLadder(){
  var obs=null;
  function decorate(){
   var c=caseById(pageCaseId());
   var list=document.querySelectorAll('.fw-ladder li');
   if(!list.length)return;
   if(obs)obs.disconnect();
   [].forEach.call(list,function(li){
    var status=statusOfLi(li);
    var has=!!latestFor(c,status);
    li.setAttribute('role','button');
    li.setAttribute('tabindex','0');
    li.classList.add('fw-step-press');
    li.classList.toggle('has-entry',has);
    li.setAttribute('aria-label',status+(has?' — แก้ไขบันทึกของขั้นนี้':' — ยังไม่มีบันทึก'));
   });
   if(obs&&host())obs.observe(host(),{childList:true,subtree:true});
  }
  function host(){return document.getElementById('fwStatus')}
  var tries=0;
  var t=setInterval(function(){
   tries++;
   var h=host();
   if(h){
    clearInterval(t);
    obs=new MutationObserver(function(){try{decorate()}catch(e){}});
    obs.observe(h,{childList:true,subtree:true});
    decorate();
   }else if(tries>120)clearInterval(t);     /* the page was never opened this session */
  },500);
 })();

 /* the styles, injected the way js/10 and js/16 do it: css/21 and css/23 must stay the last
    two <link> tags, so a new stylesheet would have to follow them */
 var css=''
  +'.fsx-steps li{position:relative}'
  +'.fsx-editbtn{display:block;width:100%;margin:0;padding:0;border:0;background:none;font:inherit;'
  +'color:inherit;cursor:pointer;text-align:inherit;border-radius:10px}'
  +'.fsx-editbtn:focus-visible{outline:2px solid #0f62d6;outline-offset:2px}'
  +'.fsx-editbtn.has-entry:hover{filter:brightness(.96)}'
  +'.fsx-pen{font-style:normal;font-size:10px;opacity:.55;margin-left:4px}'
  +'.fsx-steps li.is-editing{box-shadow:0 0 0 2px #f6a11a inset;border-radius:999px}'
  +'.fsx-editbox{margin-top:10px;border:1px solid #f0c48a;background:#fffaf1;border-radius:12px;padding:10px 12px}'
  +'.fsx-edit-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
  +'.fsx-edit-head b{font-size:13.5px;color:#8a5200}'
  +'.fsx-edit-head small{color:#8d7a5e;font-size:11.5px;flex:1;min-width:140px}'
  +'.fsx-cancel-edit{padding:5px 12px;font-size:12px}'
  +'.fsx-revs{margin-top:8px}'
  +'.fsx-revs summary{cursor:pointer;font-size:12.5px;font-weight:700;color:#8a5200}'
  +'.fsx-revlist{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}'
  +'.fsx-revlist li{border:1px solid #eadfcc;background:#fff;border-radius:10px;padding:8px 10px;'
  +'display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center}'
  +'.fsx-revmeta{grid-column:1;font-size:11px;color:#8d7a5e}'
  +'.fsx-revnote{grid-column:1;font-size:13px;color:#2a3550;white-space:pre-wrap;word-break:break-word}'
  +'.fsx-revlist button{grid-column:2;grid-row:1/3;padding:6px 12px;font-size:12px;white-space:nowrap}'
  +'.fsx-revhint{margin:8px 0 0;font-size:11.5px;color:#8d7a5e}'
  +'@media (max-width:520px){.fsx-revlist li{grid-template-columns:1fr}'
  +'.fsx-revlist button{grid-column:1;grid-row:auto;width:100%}}'
  /* the ladder on the page */
  +'.fw-ladder li.fw-step-press{cursor:pointer;transition:transform .14s ease,box-shadow .14s ease}'
  +'.fw-ladder li.fw-step-press:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(16,54,128,.14)}'
  +'.fw-ladder li.fw-step-press:focus-visible{outline:2px solid #0f62d6;outline-offset:2px}'
  /* the character itself, not a CSS escape: "\u270e" is not one — CSS wants \270e */
  +'.fw-ladder li.fw-step-press.has-entry::after{content:"✎";margin-left:2px;font-size:10px;opacity:.6}';
 try{
  var st=document.createElement('style');
  st.setAttribute('data-from','js/91');
  st.textContent=css;
  document.head.appendChild(st);
 }catch(e){}

 window.imodeFieldStepEdit={
  state:function(){return EDIT},
  revisionsOf:function(cid,status){
   var e=latestFor(caseById(cid),status);
   return e&&Array.isArray(e.revisions)?e.revisions.slice():[];
  }
 };
})();
