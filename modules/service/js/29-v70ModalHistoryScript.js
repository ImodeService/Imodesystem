/* Beta Service focus — two things the cloud copy of `settings` and the phone Back button
   both turned out to need.

   1. ROLE PERMISSIONS WERE BEING UNDONE A SECOND AFTER THEY WERE REPAIRED.

      Measured on the live project: `system_settings` holds an Admin / Coordinator role
      with 31 permissions — `qc.view` present but `qc.edit` and `qc.approve` missing — and
      `v69RoleScope: 3`. Boot order is:

          js/12 migrate()  →  js/16 migrate()  →  js/20 repair()      (parse time)
          …
          initCloud() → syncCloud() → settings = mergeSettings(cloudCopy)  (a moment later)

      so every repair ran against the local copy and was then replaced wholesale by the
      cloud copy, which still carried the stripped role. That is exactly what the admin
      saw: QC เครื่อง in the sidebar (qc.view survived) but "คุณไม่มีสิทธิ์" on the QC
      button (qc.edit did not). Reloading could not fix it — the sync always won.

      The fix is to run the same migrations again on what the cloud actually sent, and,
      when they change something, save it and push it back once so the shared copy stops
      being wrong for every other device too. It converges: the corrected copy carries the
      current version number, so the next sync leaves it alone.

   2. The phone Back button had nothing to do while a popup was open, so it left the page.
      js/22 gives every screen a history entry; a modal is a screen too. Opening one
      pushes an entry, Back closes it, and the × and the new ‹ in the modal head consume
      that entry instead of leaving a stale one behind — the same shape as the customer
      portal's ← in js/22. */
(function(){
 'use strict';

 /* =======================================================================
    1. re-apply the role migrations to whatever the cloud sent
    ======================================================================= */
 function reapply(){
  var changed=false;
  try{if(typeof window.imodeRoleScopeMigrate==='function'&&window.imodeRoleScopeMigrate())changed=true}catch(e){}
  try{if(typeof window.imodeWorkMigrate==='function'){window.imodeWorkMigrate();changed=true}}catch(e){}
  /* 2026-09-15: js/20's imodeRepairRolePermissions() is NOT re-run here any more. It restores
     every permission found in THIS device's pre-boot snapshot — right at boot, wrong after a
     sync. Reported: an admin unticked ดูเคส on Technician and saved, the technician reloaded,
     and it came back. Measured on the live row: Technician still held case.view and
     rolePresetOptOut was empty. The technician's device downloaded the admin's roles without
     case.view, this call put it back from its own older snapshot, and line 67 below pushed
     that up for everybody — so ANY untick was undone by the next device to sync.
     The cloud copy is still protected against the catalog strip it was guarding: js/20's
     mergeSettings wrapper (restoreInto) restores from the raw copy being merged, which after
     a sync is the cloud's own row — the right source. */
  return changed;
 }
 /* js/16's migrate() returns nothing and is add-only, so "changed" above is optimistic.
    Compare the role permissions before and after instead, and only write when they really
    moved — otherwise every sync would push a settings row and re-trigger the next one. */
 function fingerprint(){
  try{
   return (settings.roles||[]).map(function(r){
    return String(r.name||'')+':'+(r.permissions||[]).slice().sort().join(',');
   }).join('|')+'#'+settings.v69RoleScope+'#'+settings.v69Work;
  }catch(e){return ''}
 }

 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{
     var before=fingerprint();
     reapply();
     if(fingerprint()===before)return;
     if(typeof saveLocal==='function')saveLocal();
     if(typeof applyRoleVisibility==='function')applyRoleVisibility();
     if(typeof renderAll==='function')renderAll();
     /* Push the corrected copy back so the next device to sync gets the fixed roles
        rather than the stripped ones. */
     if(typeof cloudSaveSettings==='function'){try{cloudSaveSettings()}catch(e){}}
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }
 window.imodeReapplyRoleMigrations=reapply;

 /* =======================================================================
    2. a modal is a screen, and popups stack
    ======================================================================= */
 /* QR, QC and แก้ไข are all opened from the machine popup, so "back" from them means the
    machine popup, not an empty page. openModal() replaces the modal body, so the outgoing
    one is snapshotted first and restored from that snapshot — no function has to be
    re-run and nothing needs to know which popup it came from.

    2026-10-30: the snapshot keeps the popup's own NODES, not a copy of its markup. A markup
    copy lost everything typed and every listener: รับเคสใหม่ → "เลือกช่างและวันนัดหมาย" →
    บันทึกการมอบหมาย came back to a case form with the customer, machine and contact empty
    and no submit handler, so the case could not be saved (admin, 2026-10-30). The nodes are
    moved into a fragment before openModal() overwrites the body, and moved back on restore;
    while they are out of the document their ids cannot clash with the popup on top. */
 var modal=null,restoring=false,wasOpen=false,depth=0,stack=[];

 function isOpen(){return !!(modal&&modal.classList.contains('open'))}
 function el(id){return document.getElementById(id)}

 function snapshot(){
  var t=el('modalTitle'),sub=el('modalSub'),body=el('modalBody'),panel=el('modalPanel');
  if(!t||!body)return null;
  var frag=document.createDocumentFragment();
  while(body.firstChild)frag.appendChild(body.firstChild);
  return {title:t.textContent||'',sub:sub?sub.textContent||'':'',
          frag:frag,panel:panel?panel.className:''};
 }
 function restore(snap){
  if(!snap)return false;
  var t=el('modalTitle'),sub=el('modalSub'),body=el('modalBody'),panel=el('modalPanel');
  if(!t||!body)return false;
  t.textContent=snap.title;
  if(sub)sub.textContent=snap.sub;
  body.innerHTML='';
  if(snap.frag)body.appendChild(snap.frag);
  if(panel&&snap.panel)panel.className=snap.panel;
  return true;
 }

 function pushEntry(){
  depth++;
  try{history.pushState({imodeModal:true,depth:depth},'',location.href)}catch(e){}
 }

 /* A popup opened on top of another one. openCaseDetail() calls openModal() again for
    every tab it draws, and those are the same popup re-rendering, not a new screen — the
    title is what tells them apart, because a tab switch keeps it. */
 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title){
   if(!restoring&&isOpen()){
    var cur=el('modalTitle');
    var same=cur&&String(cur.textContent||'')===String(title==null?'':title);
    if(!same){
     var snap=snapshot();
     if(snap){stack.push(snap);pushEntry()}
    }
   }
   return baseOpenModal.apply(this,arguments);
  };
 }

 function watch(){
  modal=el('modal');
  if(!modal||modal.__v70ModalHistory)return;
  modal.__v70ModalHistory=true;
  wasOpen=isOpen();
  try{
   new MutationObserver(function(){
    if(restoring)return;
    var open=isOpen();
    if(open===wasOpen)return;
    wasOpen=open;
    /* Only the closed → open transition pushes here; a popup opened over another one is
       pushed by the openModal wrapper above, which also keeps the snapshot. */
    if(open)pushEntry();
    else if(depth>0&&!restoring){depth=0;stack.length=0}
   }).observe(modal,{attributes:true,attributeFilter:['class']});
  }catch(e){}
 }

 var baseClose=window.closeModal;
 function activePageId(){var p=document.querySelector('.page.active');return p?String(p.id||''):''}
 /* × means "done with all of this": rewind every entry this popup stack added, so one
    Back press afterwards leaves the page rather than re-opening what was just closed.

    THE CLOSE MUST HAPPEN SYNCHRONOUSLY, and the rewind must not. The first version did
    `history.go(-depth); return` — it returned WITHOUT closing and let the async popstate do
    it. Thirty call sites in this application are written `closeModal();goPage('quotation')`,
    and every one of them broke: goPage ran while the popup was still open, js/22 pushed an
    entry for the new page, and then the pending traversal arrived and js/22 restored the
    page the popup had been opened from. Measured on the machine QR popup — 📱 ดูหน้าหลักลูกค้า
    switched to the portal and was pulled straight back to เครื่องจักร.

    So: close now, and decide about the history on the next macrotask, when the click handler
    has finished and it is known whether it navigated. If it did, the traversal is skipped —
    undoing the navigation it just asked for would be worse than leaving a spent modal entry
    in the history, whose only symptom is one Back press that does nothing before the next one
    works. If it did not, the rewind happens exactly as before. */
 if(typeof baseClose==='function'){
  window.closeModal=function(){
   if(restoring||depth<=0||!isOpen())return baseClose.apply(this,arguments);
   var d=depth,page=activePageId();
   var r=baseClose.apply(this,arguments);
   depth=0;stack.length=0;wasOpen=false;
   setTimeout(function(){
    try{if(activePageId()===page)history.go(-d)}catch(e){}
   },0);
   return r;
  };
 }
 /* ‹ means "one step back": to the popup underneath if there is one, else close. */
 window.imodeModalBack=function(){
  if(!restoring&&depth>1&&stack.length&&isOpen()){
   try{history.back();return}catch(e){}
  }
  if(typeof window.closeModal==='function')window.closeModal();
 };

 window.addEventListener('popstate',function(ev){
  var st=(ev&&ev.state)||{};
  var target=st.imodeModal?(Number(st.depth)||0):0;
  if(depth<=target)return;
  restoring=true;
  try{
   while(depth>target){
    if(target>0&&stack.length){restore(stack.pop());depth--}
    else{
     if(typeof baseClose==='function')baseClose.call(window);
     wasOpen=false;depth=0;stack.length=0;
     break;
    }
   }
  }catch(e){}
  restoring=false;
 });

 var style=document.createElement('style');
 style.id='v70ModalBackStyle';
 style.textContent=''
 +'.modal-back-btn{flex:none;width:38px;height:38px;margin-right:4px;border:1px solid #dfe9f8;border-radius:11px;'
 +'background:#fff;color:#0c225e;font-size:24px;line-height:1;cursor:pointer;display:grid;place-items:center;'
 +'transition:border-color .15s ease,background .15s ease}'
 +'.modal-back-btn:hover{border-color:#b9d2f4;background:#f4f8ff}'
 +'.modal-back-btn:focus-visible{outline:3px solid #0b63e5;outline-offset:2px}'
 +'.modal-head{align-items:center}'
 +'@media (prefers-reduced-motion:reduce){.modal-back-btn{transition:none}}';
 document.head.appendChild(style);

 function install(){watch()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
