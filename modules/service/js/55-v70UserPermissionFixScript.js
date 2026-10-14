/* Beta 1.0 — สิทธิ์รายบุคคล actually does something when you edit it.

   REPORTED: "การตั้งค่าผู้ใช้งานและสิทธิ์ผมกดลบสิทธิ์แล้วมันไม่หายไปจากช่าง".

   MEASURED, in a browser, on a clean profile. The ROLE side is fine: unticking qc.view on
   the Technician card, saving, then signing in as tech_test1 gives canPermission('qc.view')
   false and the QC nav item hidden, and it survives a reload — js/47 records the untick in
   settings.rolePresetOptOut and its repair leaves it alone. The INDIVIDUAL side is where the
   report comes from, and it has two faults that compound:

     1. Every checkbox on a สิทธิ์รายบุคคล card starts UNTICKED, whatever the account can
        really do. js/20's cloneUserCard() ticks settings.userPermissions[key].permissions,
        which is [] until somebody has saved an individual set, and js/03's own cards resolve
        to [] as well. So an admin opening ช่างทดสอบ 1 sees 0/43 while the account really
        holds 13 through its role — and "unticking" one of them changes nothing, because it
        was already unticked.

     2. The card is ignored entirely unless its โหมดสิทธิ์ toggle is on. canPermission()
        reads the entry only when entry.enabled is true, so an edit made with the toggle off
        is collected, stored and never consulted.

   Either one alone is enough to make a removed permission "not disappear from the
   technician". Both are fixed here, in the smallest way that leaves the stored shape alone:

     - the card is SEEDED from the role the account resolves to, so what is on screen is what
       the account can really do, and taking a tick off means something;
     - changing anything on a card turns its individual mode on, with a line saying so, so the
       edit is the one canPermission() will read;
     - a card that was only seeded and never touched is put back to empty immediately before
       saveRoles() collects it, so an untouched account still stores {enabled:false,
       permissions:[]} exactly as it did before this file existed. Nothing new is persisted
       unless an admin really edited that account.

   It also refreshes window.imodeSettingsSnapshot after a save. js/20's repair restores role
   permissions from that snapshot and js/29 re-runs it after every syncCloud, so a permission
   unticked and then followed by a manual ซิงก์ Cloud in the same page view came back from the
   pre-boot copy and was pushed up. Re-reading it from storage after the save — the same read
   js/01 does — closes that without touching the repair itself.

   Loads last. It registers nothing in PERMISSION_CATALOG, so the "must load before js/20"
   rule does not apply; it must load AFTER js/20 (whose enhance() clones the cards for the real
   login accounts) and after js/47 (whose saveRoles wrapper records the opt-outs). */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function list(){return document.getElementById('userPermissionList')}
 function cards(){
  var l=list();
  return l?[].slice.call(l.querySelectorAll('.user-permission-card')):[];
 }

 /* ---------- what the account can really do ---------- */
 /* The card carries the role in its second read-only field, which is where both js/03's
    userPermissionCard() and js/20's cloneUserCard() write it. resolvePermissionRoleName()
    is js/03's own mapping from a job title to a role row, so "Technician - R&D" and a plain
    "Technician" land where the application would put them. */
 function roleNameOf(card){
  var inputs=card.querySelectorAll('.role-card-head input[readonly]');
  var raw=inputs[1]?String(inputs[1].value||'').trim():'';
  if(!raw||raw==='-')return '';
  var rows=Array.isArray(settings.roles)?settings.roles:[];
  if(rows.some(function(r){return String(r.name||'')===raw}))return raw;
  try{
   if(typeof window.resolvePermissionRoleName==='function'){
    var n=window.resolvePermissionRoleName({role:raw});
    if(rows.some(function(r){return String(r.name||'')===n}))return n;
   }
  }catch(e){}
  return '';
 }
 function rolePerms(name){
  var r=(Array.isArray(settings.roles)?settings.roles:[])
   .filter(function(x){return String(x.name||'')===name})[0];
  return r&&Array.isArray(r.permissions)?r.permissions.slice():[];
 }
 function savedEntry(card){
  try{return (settings.userPermissions||{})[card.dataset.userKey||'']||null}catch(e){return null}
 }

 /* ---------- seeding ---------- */
 var seeding=false;

 function refreshCount(card){
  var one=card.querySelector('[data-user-perm]');
  try{if(one&&typeof window.updateUserPermissionSummary==='function')window.updateUserPermissionSummary(one)}catch(e){}
  /* js/20 keeps the picker option label in step through a change listener on the list. */
  try{if(one)one.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
 }

 function seedCard(card){
  var entry=savedEntry(card);
  /* A real individual set — saved before, on or off — is data. Only an empty one is a
     placeholder, and that is what every account starts with. */
  if(entry&&Array.isArray(entry.permissions)&&entry.permissions.length)return;
  var perms=rolePerms(roleNameOf(card));
  if(!perms.length)return;
  card.querySelectorAll('[data-user-perm]').forEach(function(cb){
   cb.checked=perms.indexOf(cb.dataset.userPerm)>=0;
  });
  card.dataset.permxSeeded='1';
  refreshCount(card);
 }

 function noteOn(card){
  var bar=card.querySelector('.role-perm-toolbar');
  if(!bar||card.querySelector('.permx-autonote'))return;
  var n=document.createElement('div');
  n.className='permx-autonote';
  n.setAttribute('data-no-i18n','true');
  /* 2026-09-15: js/65 keeps only the difference from the role, so the role still applies. */
  n.textContent=tl('เปิดโหมดสิทธิ์รายบุคคลแล้ว — ช่องที่ต่างจากบทบาทจะเก็บเป็นข้อยกเว้นของคนนี้ ถ้าแก้บทบาททีหลัง คนนี้จะเปลี่ยนตามด้วย',
                   'Individual mode is on — boxes that differ from the role are kept as this person\'s exceptions; later role changes still apply.');
  bar.parentNode.insertBefore(n,bar.nextSibling);
 }

 /* ---------- an edit means it, so individual mode goes on ---------- */
 function onListChange(e){
  if(seeding)return;
  var t=e.target;
  if(!t||!t.matches)return;
  var card=t.closest&&t.closest('.user-permission-card');
  if(!card)return;
  if(t.matches('[data-user-enable]')){card.dataset.permxEdited='1';return}
  if(!t.matches('[data-user-perm]'))return;
  card.dataset.permxEdited='1';
  var tog=card.querySelector('[data-user-enable]');
  if(!tog||tog.checked)return;
  tog.checked=true;
  try{if(typeof window.toggleUserPermissionMode==='function')window.toggleUserPermissionMode(tog)}catch(x){}
  try{tog.dispatchEvent(new Event('change',{bubbles:true}))}catch(x){}
  noteOn(card);
 }

 function decorate(){
  var l=list();
  if(!l||l.dataset.permxSeed==='1')return;
  l.dataset.permxSeed='1';
  seeding=true;
  try{cards().forEach(seedCard)}finally{seeding=false}
  l.addEventListener('change',onListChange);
  var hint=document.querySelector('.sales-inline-note');
  if(hint&&!hint.dataset.permxHint){
   hint.dataset.permxHint='1';
   hint.setAttribute('data-no-i18n','true');
   hint.textContent=tl('ช่องด้านล่างถูกเติมตามสิทธิ์ของบทบาทให้แล้ว ติ๊กเพิ่มหรือเอาออกเพื่อทำเป็นข้อยกเว้นของคนนี้ — ถ้าแก้บทบาททีหลัง คนนี้จะเปลี่ยนตามบทบาทด้วย ยกเว้นช่องที่ตั้งเป็นข้อยกเว้นไว้',
                       'The boxes below are filled in from the role. Tick or untick to make an exception for this person — later role changes still apply, except for the boxes set as exceptions.');
  }
 }

 var baseOpen=window.openRolesSettingModal;
 if(typeof baseOpen==='function'){
  window.openRolesSettingModal=function(){
   var r=baseOpen.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }

 /* ---------- saving ---------- */
 /* Runs first on the way in (this wrapper is the outermost) and last on the way out. */
 var baseSave=window.saveRoles;
 if(typeof baseSave==='function'){
  window.saveRoles=function(){
   try{
    cards().forEach(function(card){
     if(card.dataset.permxSeeded!=='1'||card.dataset.permxEdited==='1')return;
     card.querySelectorAll('[data-user-perm]').forEach(function(cb){cb.checked=false});
    });
   }catch(e){}
   var r=baseSave.apply(this,arguments);
   /* The snapshot js/20's repair restores from. Without this it still holds the permissions
      as they were before this save, and the next syncCloud() puts them back. */
   try{window.imodeSettingsSnapshot=JSON.parse(localStorage.getItem('imode_v5_settings')||'{}')}catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70UserPermissionFixStyle';
 st.textContent=''
 +'.permx-autonote{margin:8px 0 2px;padding:8px 11px;border-radius:9px;background:#eef6ff;'
 +'border:1px solid #c5ddfa;color:#0b3f9e;font-size:12.5px;line-height:1.55}';
 document.head.appendChild(st);
})();
