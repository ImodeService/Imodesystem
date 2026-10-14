/* Beta 1.0 — the case form says what the coordinator is actually doing.

   FOUR REPORTED ITEMS, all about แก้ไขเคส / ลงรายละเอียดเคส, and all of them wording rather
   than mechanism. They belong together because they are one screen and one flow: item 7 asks
   that the coordinator ring the customer FIRST and then fill this form in with what they were
   told, so the labels are rewritten to say that.

     9.  "Dropdown ของหน้าลงรายละเอียดและอีกหลายๆ หน้าที่มีเลือกประเภทงาน
          เปลี่ยน Remote Support เป็น แก้ไขออนไลน์"
     10. "อาการ / รายละเอียด" -> "อาการ / รายละเอียดเพิ่มเติมหลังติดต่อลูกค้า"
     11. "หมายเหตุภายใน" -> "หมายเหตุภายในเพิ่มเติม"
     12. "เอาปุ่มสถานะออกจากหน้าแก้ไขเคส"

   ---------------------------------------------------------------- 9, and why a patch file

   `serviceTypes` is a SAVED setting. Editing the default list in js/03 would change nothing
   on any device that already has settings — mergeSettings() keeps the stored array — so the
   rename has to happen to the live object, once, on load. It is applied to:

     settings.serviceTypes            the list every ประเภทงาน dropdown is built from
     any case / quotation / report    that carries the old string, so a record already in the
                                      system still matches an option in the list instead of
                                      silently showing the first one when it is opened

   Checked against the live project before writing the migration: of 31 cases, 30 are
   เข้าบริการหน้างาน and one is PM / Preventive Maintenance. NOTHING carries 'Remote Support',
   so this rename moves no real data today — the loop is there so that it stays true if a
   device holds one locally.

   ---------------------------------------------------------------- 10, 11, 12

   The case modal's markup is a template string inside js/03's openCaseModal(). Rather than
   edit that function, the body is rewritten on its way through openModal() — the same seam
   js/63 uses to take the checklist heading out of the inspection sheet — so js/03 keeps
   exactly one copy of the form and this file can be deleted to get the old wording back.

   #fStatus IS KEPT, hidden. saveCase() reads `fStatus.value` as an id global (js/03 line
   1116) and would throw without it, the same reason #fieldQueue and #portalLineIdentity are
   still in the document. Hiding rather than removing also means the status the case already
   has is preserved through a save from this form, which is the point of taking the control
   away: the status is changed on the case page's own step circles, not by whoever happens to
   be editing the contact name. */
(function(){
 'use strict';

 var OLD='Remote Support';
 var NEW='แก้ไขออนไลน์';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}

 /* ------------------------------------------------ 9. the work-type rename ---- */
 function renameServiceType(){
  var touched=false;
  try{
   var list=settings&&settings.serviceTypes;
   if(Array.isArray(list)){
    for(var i=0;i<list.length;i++){
     if(list[i]===OLD){list[i]=NEW;touched=true}
    }
   }
  }catch(e){}
  [['cases','serviceType'],['quotations','serviceType'],['serviceReports','workType']].forEach(function(pair){
   try{
    var arr=window[pair[0]];
    if(!Array.isArray(arr)){
     /* These are top-level `let` in js/03 — lexical globals, absent from window — so they
        have to be reached by bare identifier. */
     if(pair[0]==='cases')arr=cases;
     else if(pair[0]==='quotations')arr=quotations;
     else arr=serviceReports;
    }
    if(!Array.isArray(arr))return;
    arr.forEach(function(r){
     if(r&&r[pair[1]]===OLD){r[pair[1]]=NEW;touched=true}
    });
   }catch(e){}
  });
  if(touched){
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  }
  return touched;
 }
 /* Run once at parse time and again after every cloud sync, because syncCloud() replaces
    `settings` wholesale with the copy in system_settings — the same reason js/29 has to
    re-apply the permission migrations there. It converges: once the stored list says
    แก้ไขออนไลน์, the pass finds nothing and writes nothing. */
 renameServiceType();
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   try{
    if(r&&typeof r.then==='function')r.then(function(){try{renameServiceType()}catch(e){}},function(){});
    else renameServiceType();
   }catch(e){}
   return r;
  };
 }
 /* A dropdown that was built before the rename — the case modal is rebuilt every time it is
    opened, but a page rendered at boot is not — gets the new wording on the next render.

    renderAll() runs on every save, so this must not be a full document scan for ever: once a
    pass over the whole document finds nothing left to rename, there is nothing a later render
    can reintroduce (the list it is built from no longer contains the old string) and the
    document-wide sweep stands itself down. A freshly built modal is still checked, because
    that is a handful of nodes. */
 var documentClean=false;
 function fixOptions(root){
  var whole=!root||root===document;
  if(whole&&documentClean)return;
  try{
   var hit=false;
   [].slice.call((root||document).querySelectorAll('option')).forEach(function(o){
    if((o.textContent||'').trim()===OLD){
     hit=true;
     o.textContent=NEW;
     if(o.value===OLD)o.value=NEW;
    }
   });
   if(whole&&!hit)documentClean=true;
  }catch(e){}
 }

 /* ------------------------------------------- 10, 11, 12. the case form ---- */
 var LABELS=[
  ['อาการ / รายละเอียด *','อาการ / รายละเอียดเพิ่มเติมหลังติดต่อลูกค้า *'],
  ['อาการ / รายละเอียด','อาการ / รายละเอียดเพิ่มเติมหลังติดต่อลูกค้า'],
  ['หมายเหตุภายใน','หมายเหตุภายในเพิ่มเติม']
 ];
 function rewriteCaseForm(html){
  if(!html||html.indexOf('fIssue')<0)return html;   /* only the case form */
  var box=document.createElement('div');
  box.innerHTML=html;

  /* 10 + 11 — the label beside the field, matched on the field it belongs to rather than on
     the text anywhere in the body, so an identical word elsewhere is left alone. */
  [['fIssue',0],['fNote',2]].forEach(function(pair){
   var el=box.querySelector('#'+pair[0]);
   if(!el)return;
   var field=el.closest('.field')||el.parentNode;
   var label=field&&field.querySelector('label');
   if(!label)return;
   var cur=(label.textContent||'').trim();
   for(var i=0;i<LABELS.length;i++){
    if(cur===LABELS[i][0]){label.textContent=LABELS[i][1];return}
   }
   /* Already renamed, or worded differently by a later patch: leave it. */
  });

  /* 12 — the status picker leaves the form. The <select> itself stays so saveCase() still
     finds it and writes back the status the case already had. */
  var st=box.querySelector('#fStatus');
  if(st){
   var field=st.closest('.field');
   if(field){
    field.style.display='none';
    field.setAttribute('aria-hidden','true');
   }
  }
  fixOptions(box);
  return box.innerHTML;
 }

 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title,sub,body,big){
   var args=[].slice.call(arguments);
   try{if(typeof body==='string')args[2]=rewriteCaseForm(body)}catch(e){}
   var r=baseOpenModal.apply(this,args);
   try{fixOptions(document.getElementById('modal'))}catch(e){}
   return r;
  };
 }

 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{fixOptions(document)}catch(e){}
   return r;
  };
 }

 window.imodeRenameServiceType=renameServiceType;
 window.imodeServiceTypeNames={old:OLD,now:NEW};
})();
