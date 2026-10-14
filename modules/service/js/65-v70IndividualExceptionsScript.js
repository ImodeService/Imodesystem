/* Beta 1.0 — สิทธิ์รายบุคคล is a set of EXCEPTIONS to the role, so a role change reaches
   everybody on that role.

   REPORTED: "ทุกบัญชีของช่างเลยอะที่ไม่เปลี่ยน ผมอยากให้มันเปลี่ยน" — unticking ดูเคส on the
   Technician role changed nothing for the technicians. Two causes, both measured on the live
   system_settings row: js/29 re-ran a snapshot repair after every sync that put the untick
   back (fixed in js/29), and an account with individual mode on ignored its role entirely,
   because an individual entry was a complete permission list that replaced the role's.

   The owner chose: a role change applies to everybody on the role, and what is set per person
   is only the difference from it. So an entry now carries

       add      permissions this person has that the role does not
       remove   permissions the role has that this person does not
       enabled  true while there is at least one of either
       permissions  role + add − remove, recomputed — NEVER hand-set

   `permissions` is kept, and kept correct, because it is what every reader already uses:
   canPermission() (js/03), effectivePermissions() on the Home board (js/10), and the cards in
   the permissions popup (js/03, js/20, js/55). None of them had to change. An entry whose
   exceptions are all gone switches itself back to ตาม Role.

   When it is recomputed: at load, after every cloud sync (the roles may have changed on
   another device), and after saveRoles(). Old-format entries — a full list and no add/remove —
   are converted at LOAD, against the role as it stands then. Converting them only at save time
   would compare them with the role the admin had just edited, so unticking ดูเคส on the role
   would read as an exception that keeps ดูเคส for that person — the exact opposite of what was
   asked.

   The exceptions of a card the admin edited are taken against the role as it was when the
   popup OPENED — the role the card was drawn from — for the same reason.

   Loads last: its saveRoles and syncCloud wrappers must be the outermost, so they see the
   entries js/03 has just written and the roles every other repair has already settled. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function store(){
  if(!settings.userPermissions||typeof settings.userPermissions!=='object')settings.userPermissions={};
  return settings.userPermissions;
 }
 function roleRows(){return Array.isArray(settings.roles)?settings.roles:[]}
 function rolePerms(name,from){
  var r=(from||roleRows()).filter(function(x){return String(x.name||'')===name})[0];
  return r&&Array.isArray(r.permissions)?r.permissions.slice():null;
 }
 function resolveRole(raw){
  raw=String(raw||'').trim();
  if(!raw||raw==='-')return '';
  if(roleRows().some(function(r){return r.name===raw}))return raw;
  try{
   if(typeof window.resolvePermissionRoleName==='function'){
    var n=window.resolvePermissionRoleName({role:raw});
    if(roleRows().some(function(r){return r.name===n}))return n;
   }
  }catch(e){}
  return '';
 }
 /* Which role a stored key belongs to: the signed-in session, a login account
    ('UAT-<username>'), or one of the hard-coded demo names. */
 function roleForKey(key){
  key=String(key||'');
  try{
   if(currentUser&&String(currentUser.id||currentUser.name||'')===key)
    return resolveRole(currentUser.permissionRole||currentUser.role);
  }catch(e){}
  if(key.indexOf('UAT-')===0){
   var want=key.slice(4).toLowerCase(),list=[];
   try{list=(typeof window.imodeAccountList==='function')?(window.imodeAccountList()||[]):[]}catch(e){}
   var a=list.filter(function(x){return String(x.username||'').toLowerCase()===want})[0];
   if(a)return resolveRole(a.role);
  }
  try{
   var d=(Array.isArray(demoUsers)?demoUsers:[]).filter(function(x){return String(x.id||x.name||'')===key})[0];
   if(d)return resolveRole(d.role);
  }catch(e){}
  return '';
 }
 function uniq(a){
  var seen={},out=[];
  (Array.isArray(a)?a:[]).forEach(function(k){if(k&&!seen[k]){seen[k]=1;out.push(k)}});
  return out;
 }
 function diff(list,base){
  return {add:list.filter(function(k){return base.indexOf(k)<0}),
          remove:base.filter(function(k){return list.indexOf(k)<0})};
 }

 /* ---------- recompute every entry from the role it resolves to NOW ---------- */
 function recompute(){
  var m=store(),changed=false;
  Object.keys(m).forEach(function(key){
   var e=m[key];
   if(!e||typeof e!=='object')return;
   var base=rolePerms(roleForKey(key));
   if(!base)return;                       /* role unknown here: leave the entry exactly as it is */
   var add,remove;
   if(Array.isArray(e.add)||Array.isArray(e.remove)){add=uniq(e.add);remove=uniq(e.remove)}
   else if(e.enabled&&Array.isArray(e.permissions)){var d=diff(uniq(e.permissions),base);add=d.add;remove=d.remove}
   else return;                           /* follows the role already */
   /* An exception the role has since caught up with is no longer an exception. */
   add=add.filter(function(k){return base.indexOf(k)<0});
   remove=remove.filter(function(k){return base.indexOf(k)>=0});
   var on=!!(add.length||remove.length);
   var perms=on?base.filter(function(k){return remove.indexOf(k)<0}).concat(add):[];
   var next={enabled:on,add:add,remove:remove,permissions:perms};
   if(JSON.stringify(next)!==JSON.stringify({enabled:!!e.enabled,add:e.add,remove:e.remove,permissions:e.permissions})){
    m[key]=next;changed=true;
   }
  });
  return changed;
 }
 window.imodeRecomputeIndividualPermissions=recompute;

 function push(){
  if(typeof saveLocal==='function')saveLocal();
  try{window.imodeSettingsSnapshot=JSON.parse(localStorage.getItem('imode_v5_settings')||'{}')}catch(e){}
  if(typeof applyRoleVisibility==='function'){try{applyRoleVisibility()}catch(e){}}
  if(typeof cloudSaveSettings==='function'){try{cloudSaveSettings()}catch(e){}}
 }

 /* ---------- the popup: remember the roles it was drawn from ---------- */
 var openRoles=null;
 var baseOpen=window.openRolesSettingModal;
 if(typeof baseOpen==='function'){
  window.openRolesSettingModal=function(){
   try{openRoles=JSON.parse(JSON.stringify(roleRows()))}catch(e){openRoles=null}
   return baseOpen.apply(this,arguments);
  };
 }
 function cards(){
  var l=document.getElementById('userPermissionList');
  return l?[].slice.call(l.querySelectorAll('.user-permission-card')):[];
 }
 function cardRole(card){
  var inputs=card.querySelectorAll('.role-card-head input[readonly]');
  return resolveRole(inputs[1]?inputs[1].value:'')||roleForKey(card.dataset.userKey);
 }

 /* ---------- saving ---------- */
 var baseSave=window.saveRoles;
 if(typeof baseSave==='function'){
  window.saveRoles=function(){
   var pending={},prev={};
   var before=openRoles||roleRows();
   try{prev=JSON.parse(JSON.stringify(store()))}catch(e){prev={}}
   /* Read the edited cards BEFORE js/55 and js/03 touch them — the ticks are the answer. */
   try{
    cards().forEach(function(card){
     var key=card.dataset.userKey;
     if(!key||card.dataset.permxEdited!=='1')return;
     var tog=card.querySelector('[data-user-enable]');
     if(tog&&!tog.checked){pending[key]={add:[],remove:[]};return}   /* switched back to ตาม Role */
     var base=rolePerms(cardRole(card),before)||rolePerms(cardRole(card))||[];
     var ticks=[].map.call(card.querySelectorAll('[data-user-perm]:checked'),function(x){return x.dataset.userPerm});
     pending[key]=diff(ticks,base);
    });
   }catch(e){}
   var rolesBefore=settings.roles;
   var r=baseSave.apply(this,arguments);
   try{
    if(settings.roles===rolesBefore)return r;   /* js/03 refused the save: nothing was written */
    var m=store();
    Object.keys(m).forEach(function(key){
     var e=m[key]||{},p=prev[key];
     if(pending[key]){e.add=pending[key].add;e.remove=pending[key].remove}
     else if(p&&(Array.isArray(p.add)||Array.isArray(p.remove))){e.add=p.add||[];e.remove=p.remove||[]}
     else if(p&&p.enabled&&Array.isArray(p.permissions)){
      /* still old-format (load did not convert it): compare with the role as it was at open */
      var b=rolePerms(roleForKey(key),before);
      if(b){var d=diff(uniq(p.permissions),b);e.add=d.add;e.remove=d.remove}
     }
     m[key]=e;
    });
    recompute();
    push();
   }catch(e){}
   openRoles=null;
   return r;
  };
 }

 /* ---------- load, and every sync ---------- */
 try{if(recompute()&&typeof saveLocal==='function')saveLocal()}catch(e){}
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{
     if(!recompute())return;
     push();
     if(typeof renderAll==='function')renderAll();
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);else done();
   return r;
  };
 }
})();
