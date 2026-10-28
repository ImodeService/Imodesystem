/* 2026-10-27 — Role "Engineer". Seeded into settings.roles with the Technician permissions,
   so it shows in Settings → Roles, in the account role pickers (js/124) and is assignable.

   settings.roles lives inside `settings`, which syncCloud() replaces wholesale, so the seed is
   re-applied after every sync. settings.v70EngineerRole records that it was seeded once: after
   that an admin who deletes the role is not fought. A copy without the flag gets it again and
   the flag travels back up with the push. Rename/permission edits are never overwritten. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;
 var NAME='Engineer',FLAG=1;

 function techPerms(){
  var r=(settings.roles||[]).filter(function(x){return String(x&&x.name||'').toLowerCase()==='technician'})[0];
  if(r&&Array.isArray(r.permissions)&&r.permissions.length)return r.permissions.slice();
  return typeof permissionPresetForRoleName==='function'?permissionPresetForRoleName(NAME):[];
 }
 function ensure(){
  if(settings.v70EngineerRole===FLAG)return false;
  settings.roles=Array.isArray(settings.roles)?settings.roles:[];
  if(!settings.roles.some(function(r){return r&&r.name===NAME})){
   var at=-1;
   settings.roles.forEach(function(r,i){if(r&&r.name==='Technician')at=i});
   var role={name:NAME,users:0,teamScope:'',positionScope:'',permissions:techPerms()};
   if(at>=0)settings.roles.splice(at+1,0,role);else settings.roles.push(role);
  }
  settings.v70EngineerRole=FLAG;
  return true;
 }
 window.imodeEnsureEngineerRole=ensure;

 try{if(ensure()&&typeof saveLocal==='function')saveLocal()}catch(e){}

 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{
     if(!ensure())return;
     if(typeof saveLocal==='function')saveLocal();
     if(typeof applyRoleVisibility==='function')applyRoleVisibility();
     if(typeof renderAll==='function')renderAll();
     if(typeof cloudSaveSettings==='function'){try{cloudSaveSettings()}catch(e){}}
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }
})();
