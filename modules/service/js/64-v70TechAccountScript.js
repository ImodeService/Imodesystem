/* 2026-09-15: a login account can be created or changed from the ทีมช่าง page.
   "หน้าทีมช่างอะอยากให้เพิ่ม หรือ เปลี่ยน Accout ให้ช่างได้".

   js/39 already owns accounts entirely — creating, renaming, re-passwording, deleting, the
   technician link, the password policy, and every refusal that protects the admin from
   locking themselves out. None of that is reimplemented here. This file is a door: it adds
   one button to the technician popup and opens js/39's own form, pre-filled for that
   technician.

   Why a separate file rather than an edit to js/03 or js/39:
     - js/03's openTechnicianProfile() is the original application. Appending a button to the
       popup it just drew leaves that function untouched.
     - js/39 is the account module. It exports what is needed (imodeAccountList,
       imodeAccountSave) and its submit/cancel wiring lives on #modalBody, which is where the
       form is inserted, so the form works here with no wiring of its own.

   Load order: after js/39, because the exports are read at click time — never at parse time,
   so even a reordering would degrade to the button explaining itself rather than throwing. */
(function(){
 'use strict';

 function tl(th,en){return typeof window.L==='function'?window.L(th,en):th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof toastMsg==='function')toastMsg(m)}

 function accountsFor(techId){
  if(typeof window.imodeAccountList!=='function')return [];
  var list=[];
  try{list=window.imodeAccountList()||[]}catch(e){return []}
  return list.filter(function(a){
   return a&&a.accountType==='technician'&&String(a.technicianId||'')===String(techId||'');
  });
 }

 /* A username that is free, derived from the technician id — T001 becomes tech_t001. The
    admin can type over it before saving; this only removes the need to invent one. */
 function suggestUsername(t){
  var base='tech_'+String(t&&t.id||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(base==='tech_')base='tech_new';
  var taken={};
  try{
   (window.imodeAccountList()||[]).forEach(function(a){taken[String(a.username||'').toLowerCase()]=1});
  }catch(e){}
  if(!taken[base])return base;
  for(var i=2;i<200;i++)if(!taken[base+i])return base+i;
  return base+Date.now();
 }

 /* The role a new technician account should hold. The technician's own record carries a free
    text role ("Service Technician"), which is not a permission role, so it is only used when
    it happens to match one that exists. Otherwise the plain Technician role. */
 function roleFor(t){
  var roles=[];
  try{roles=(settings.roles||[]).map(function(r){return r.name})}catch(e){}
  var own=String(t&&t.role||'');
  if(own&&roles.indexOf(own)>=0)return own;
  if(roles.indexOf('Technician')>=0)return 'Technician';
  return roles[0]||'Technician';
 }

 window.imodeOpenTechAccount=function(techId){
  if(typeof requirePermission==='function'&&!requirePermission('users.manage'))return;
  if(typeof window.imodeAccountForm!=='function'){
   toast(tl('โมดูลจัดการบัญชียังไม่พร้อม','Account management is not available'));
   return;
  }
  var t=null;
  try{t=(Array.isArray(technicians)?technicians:[]).filter(function(x){return x.id===techId})[0]||null}catch(e){}
  if(!t){toast(tl('ไม่พบระเบียนช่างนี้','No such technician record'));return}

  var have=accountsFor(techId);
  var acc=have[0]||null;

  var seed=acc||{accountType:'technician',technicianId:t.id,
                 username:suggestUsername(t),name:t.name||'',
                 role:roleFor(t),team:t.team||'Technical'};

  var title=acc?tl('เปลี่ยนบัญชีของ ','Account for ')+(t.name||t.id)
               :tl('สร้างบัญชีให้ ','New account for ')+(t.name||t.id);
  var sub=acc
   ? tl('แก้ชื่อผู้ใช้ รหัสผ่าน บทบาท หรือทีมของบัญชีนี้','Change the username, password, role or team')
   : tl('ช่างคนนี้ยังไม่มีบัญชีเข้าสู่ระบบ','This technician has no login account yet');

  var extra='';
  if(have.length>1){
   extra='<p class="techacc-note">'+esc2(tl('ช่างคนนี้มีบัญชีผูกอยู่ ','This technician has ')
     +have.length+tl(' บัญชี กำลังแก้บัญชีแรก — ดูทั้งหมดได้ที่ ตั้งค่าระบบ → การจัดการบัญชีผู้ใช้',
                     ' linked accounts; editing the first — see them all in Settings → Accounts'))+'</p>';
  }
  if(!acc){
   extra+='<p class="techacc-note">'+esc2(tl('ตั้งรหัสผ่านอย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข',
                                             'Set a password of at least 8 characters, with letters and digits'))+'</p>';
  }

  /* js/39's own form, and its own submit handler on #modalBody. Passing null for a new
     account would lose the seeded username and technician link, so the seed is passed as the
     account and `data-original` is cleared afterwards — that attribute is what tells
     imodeAccountSave() whether this is an edit or an insert. */
  openModal(title,sub,'<div class="techacc-wrap">'+extra+window.imodeAccountForm(acc?acc:seed)+'</div>');
  var body=document.getElementById('modalBody');
  if(!body)return;
  var form=body.querySelector('.acctmg-form');
  if(form&&!acc)form.setAttribute('data-original','');
  if(typeof window.imodeAccountSyncTypeFields==='function')window.imodeAccountSyncTypeFields();

  /* THIS FORM SAVES ITSELF. js/39's handler ends in refresh(), which redraws the account
     LIST — and opened from here there is no list, so a successful save left the form sitting
     there untouched with the password still in it and the button still reading เพิ่มบัญชี.
     It looked exactly like a dead button, and pressing it again answered "มีชื่อผู้ใช้นี้อยู่แล้ว"
     because the first press had in fact created the account. Reported as กดบันทึกไม่ได้.

     The submit is handled here and stopped from reaching js/39's listener on #modalBody, so
     it cannot be saved twice. imodeAccountSave() is still the only thing that writes. */
  if(form){
   form.addEventListener('submit',function(e){
    e.preventDefault();
    e.stopPropagation();
    var data=(typeof window.imodeAccountRead==='function')?window.imodeAccountRead(form):null;
    if(!data){toast(tl('อ่านข้อมูลในฟอร์มไม่ได้','Could not read the form'));return}
    var original=form.getAttribute('data-original')||'';
    if(original&&!data.username)data.username=original;   /* a disabled input reads back empty */
    var res=window.imodeAccountSave(original,data);
    if(!res||!res.ok){toast((res&&res.message)||tl('บันทึกไม่สำเร็จ','Could not save'));return}
    if(typeof closeModal==='function')closeModal();
    toast((original?tl('บันทึกบัญชีของ ','Saved the account for ')
                   :tl('สร้างบัญชีให้ ','Created an account for '))
          +(t.name||t.id)+' · '+data.username);
    /* The ทีมช่าง page shows nothing about accounts today, but a later build might, and the
       profile popup's own button label depends on whether an account exists. */
    try{if(typeof renderAll==='function')renderAll()}catch(e2){}
   },true);
  }
 };

 /* ---------------------------------------------------------------- the button ---- */
 /* openTechnicianProfile() in js/03 draws the popup; this appends one button to the row it
    already built, so that function is not edited. The popup is rebuilt on every open, so the
    button is added on every open too. */
 function addButton(){
  var body=document.getElementById('modalBody');
  if(!body)return;
  var edit=body.querySelector('.button-row button[onclick*="openTechnicianModal"]');
  if(!edit)return;
  var row=edit.parentElement;
  if(!row||row.querySelector('[data-techacc]'))return;
  var m=/openTechnicianModal\('([^']+)'\)/.exec(edit.getAttribute('onclick')||'');
  if(!m)return;
  var tid=m[1];
  if(typeof canPermission==='function'&&!canPermission('users.manage'))return;

  var have=accountsFor(tid);
  var b=document.createElement('button');
  b.className='soft-btn';
  b.setAttribute('data-techacc',tid);
  b.innerHTML='🔑 '+esc2(have.length?tl('บัญชีเข้าสู่ระบบ','Login account')
                                   :tl('สร้างบัญชี','Create account'));
  b.onclick=function(){window.imodeOpenTechAccount(tid)};
  row.insertBefore(b,edit);
 }

 /* js/03:1213 — openTechnicianDetail(tid), a top-level function declaration exported to
    window on the next line, so replacing the window property is what the popup's own callers
    resolve. (openTechnicianProfile does not exist; naming it that silently left this wrapper
    inert and only the observer below would ever have added the button.) */
 var baseProfile=window.openTechnicianDetail;
 if(typeof baseProfile==='function'){
  window.openTechnicianDetail=function(){
   var r=baseProfile.apply(this,arguments);
   try{addButton()}catch(e){}
   return r;
  };
 }
 /* The profile popup is also reached by paths that do not go through that name, so the modal
    is watched as well. A MutationObserver only queues records while it is observing, so the
    observer is disconnected around our own insert — the trap that spun a nav observer into an
    infinite loop in part 17 §11. */
 var obs=null;
 function watch(){
  var body=document.getElementById('modalBody');
  if(!body||body.__techaccWatched)return;
  body.__techaccWatched=true;
  try{
   obs=new MutationObserver(function(){
    if(obs)obs.disconnect();
    try{addButton()}catch(e){}
    if(obs)try{obs.observe(body,{childList:true,subtree:true})}catch(e){}
   });
   obs.observe(body,{childList:true,subtree:true});
  }catch(e){obs=null}
 }

 var style=document.createElement('style');
 style.id='v70TechAccountStyle';
 style.textContent=''
  +'.techacc-wrap .acctmg-form{margin-top:0}'
  +'.techacc-note{margin:0 0 10px;font-size:11.5px;color:#7385a5;line-height:1.55}';
 document.head.appendChild(style);

 function install(){watch()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
