/* V6.9 role scope.
   Turns on the permission engine that was already built into Settings -> Users & Roles but
   left switched off, and closes the three holes that made switching it on unsafe:
     1. Admin / Coordinator had no quotation permission at all.
     2. Spare Parts and Petty Cash had no PAGE_PERMISSION key, so enforcement could never
        hide them from a technician.
     3. Onsite pricing was keyed to field.view, which every technician holds.
   Additive: three new permission keys, a one-time migration of the saved roles, and a
   guard so a role without dashboard.view is not sent to a page it cannot open. No storage
   key is renamed and no existing role edit made by an admin is overwritten twice. */
(function(){
 'use strict';
 if(typeof PERMISSION_CATALOG==='undefined'||typeof settings!=='object')return;

 /* ---------- 1. the three missing module permissions ---------- */
 var NEW_PERMS=[
  ['onsite.view','เข้าหน้างาน / ตั้งราคา Onsite','Access worksite / onsite pricing'],
  ['parts.view','ดูสต๊อกอะไหล่','View spare parts stock'],
  ['pettycash.view','ดูเงินสดย่อย','View petty cash']
 ];
 var have=PERMISSION_CATALOG.some(function(g){return (g.items||[]).some(function(i){return i[0]==='parts.view'})});
 if(!have){
  PERMISSION_CATALOG.push({group:'คลังและค่าใช้จ่าย',groupEn:'Stock & Expenses',items:NEW_PERMS});
 }
 PAGE_PERMISSION.onsite='onsite.view';
 PAGE_PERMISSION['spare-parts']='parts.view';
 PAGE_PERMISSION['petty-cash']='pettycash.view';

 /* ---------- 2. role presets ---------- */
 /* The technician set agreed with the user: งานของฉัน, Field Service, Calendar, QC,
    Machines (read), Documents, Notifications — plus the role Home itself. Deliberately no
    Dashboard, no Cases list, no Customers, no Warranty, no company Reports, no Spare
    Parts, no Petty Cash, no Onsite pricing.
    mywork.view belongs in this list even though js/16 is what defines the key: this array
    *replaces* a technician's permissions, both in the migration below and behind the
    "ชุดสิทธิ์มาตรฐาน" button, so leaving it out silently deleted งานของฉัน from the
    sidebar of any role the preset was applied to. */
 var TECHNICIAN_PERMS=[
  'machine.view','qc.view','qc.edit','calendar.view',
  'field.view','field.status','field.checkin','field.report','field.media','field.signature',
  'documents.view','notifications.view','mywork.view'
 ];
 /* users.manage + settings.manage are not optional: without them an enforced Admin
    account cannot open Settings -> Users & Roles, which is the very screen that decides
    what a technician sees. */
/* field.report (2026-09-16): an admin could already READ a ใบตรวจ from หน้ารายงาน —
    previewServiceReport() is not gated — but openServiceReport() refuses without this key,
    so the แก้ไขใบตรวจ button on the case page would have been a button that always said no.
    js/47 re-applies this preset on EVERY load, so this one line reaches every device and
    needs no SCOPE_VERSION bump; and a key that was never in the preset cannot be in
    settings.rolePresetOptOut, so nothing blocks it. */
 var ADMIN_ADD=['quotation.view','quotation.create','onsite.view','parts.view','pettycash.view',
                'users.manage','settings.manage','field.report'];
 /* 4 (2026-09-09): reported from a live browser — QC เครื่อง was missing from the admin
    sidebar, and on one phone the bottom nav had lost หน้าหลัก and เคส as well. On a fresh
    profile the role is correct (33 permissions, qc.view included), so this is a saved
    settings object that has lost keys, not a rendering bug. The base preset is the
    documented Admin / Coordinator set; adding it back is add-only, so anything the admin
    deliberately granted on top of it survives, and it runs once. */
 function adminBaseline(){
  var base=typeof permissionPresetForRoleName==='function'
   ?(basePreset?basePreset('Admin / Coordinator'):permissionPresetForRoleName('Admin / Coordinator'))
   :[];
  return (base||[]).concat(ADMIN_ADD);
 }

 /* Keep the "ชุดสิทธิ์มาตรฐาน" button in Settings in step with the same sets. */
 var basePreset=window.permissionPresetForRoleName;
 if(typeof basePreset==='function'){
  window.permissionPresetForRoleName=function(name){
   var n=String(name||'').toLowerCase();
   if(n.indexOf('technician')>=0||n==='r&d'||n.indexOf('engineer')>=0)return TECHNICIAN_PERMS.slice();
   var out=basePreset.apply(this,arguments)||[];
   if(n.indexOf('admin')>=0||n.indexOf('coordinator')>=0){
    ADMIN_ADD.forEach(function(k){if(out.indexOf(k)<0)out.push(k)});
   }
   if(n.indexOf('manager')>=0||n.indexOf('supervisor')>=0){
    NEW_PERMS.forEach(function(p){if(out.indexOf(p[0])<0)out.push(p[0])});
   }
   return out;
  };
 }

 /* ---------- 3. one-time migration of whatever is already saved ----------
    Runs once. After it, an admin's own checkbox edits are never overwritten again. */
 /* 3 (2026-09-08): installs that had already run version 2 lost onsite.view /
    parts.view / pettycash.view (and mywork.view) to the mergeSettings() strip described in
    js/20, and saved the stripped set back. Bumping restores them once. */
 var SCOPE_VERSION=4;   /* bump to re-run the migration when these sets change */
 function migrate(){
  if(settings.v69RoleScope===SCOPE_VERSION)return false;
  var roles=Array.isArray(settings.roles)?settings.roles:[];
  roles.forEach(function(r){
   var n=String(r.name||'').toLowerCase();
   var perms=Array.isArray(r.permissions)?r.permissions.slice():[];
   var add=function(k){if(perms.indexOf(k)<0)perms.push(k)};
   if(n.indexOf('technician')>=0||n==='r&d'||n.indexOf('engineer')>=0){
    perms=TECHNICIAN_PERMS.slice();
   }else if(n.indexOf('admin')>=0||n.indexOf('coordinator')>=0){
    adminBaseline().forEach(add);
   }else if(n.indexOf('manager')>=0||n.indexOf('supervisor')>=0){
    NEW_PERMS.forEach(function(p){add(p[0])});
    adminBaseline().forEach(add);
   }
   r.permissions=perms;
  });
  settings.systemBehavior=settings.systemBehavior||{};
  settings.systemBehavior.enforceRolePermissions=true;
  settings.v69RoleScope=SCOPE_VERSION;
  if(typeof saveLocal==='function')saveLocal();
  return true;
 }
 migrate();
 /* syncCloud() replaces `settings` wholesale with the copy in system_settings, which is
    saved from whichever device wrote last and can be older than this migration. Exposed so
    v70SettingsSyncGuard can run it again on what the cloud sent. */
 window.imodeRoleScopeMigrate=migrate;

 /* ---------- 4. do not send anyone to a page their role cannot open ----------
    The Home centre used to go straight to the Dashboard, which a technician no longer
    holds; uatLogout and the legacy demo login do the same. Land on the first module the
    role actually has instead. */
 function firstAllowedPage(){
  var order=['dashboard','field-service','calendar','qc','cases','machines','documents','notifications','home'];
  for(var i=0;i<order.length;i++){
   var k=PAGE_PERMISSION[order[i]];
   if(!k||(typeof canPermission==='function'&&canPermission(k)))return order[i];
  }
  return 'home';
 }
 window.imodeFirstAllowedPage=firstAllowedPage;
 var baseGoPage=window.goPage;
 window.goPage=function(name){
  if(name==='dashboard'){
   var k=PAGE_PERMISSION.dashboard;
   if(k&&typeof canPermission==='function'&&!canPermission(k)){
    var alt=firstAllowedPage();
    if(alt!=='dashboard')return baseGoPage.call(this,alt);
   }
  }
  return baseGoPage.apply(this,arguments);
 };

 /* Settings -> Users & Roles is the only place these are edited, so re-apply the nav
    visibility after it saves. saveRoles() already calls renderAll(), which calls
    applyRoleVisibility(); this covers the paths that do not. */
 if(typeof window.saveRoles==='function'){
  var baseSaveRoles=window.saveRoles;
  window.saveRoles=function(){
   var r=baseSaveRoles.apply(this,arguments);
   if(typeof applyRoleVisibility==='function')applyRoleVisibility();
   return r;
  };
 }
 /* Buttons are not pages, so applyRoleVisibility() never looked at them: it only walks
    [data-page]. Anything carrying data-perm is now hidden the same way — the topbar
    "รับเคสใหม่" button is the first, because taking a case in is the coordinator's job and
    a technician holds no case.create. */
 function applyActionVisibility(){
  document.querySelectorAll('[data-perm]').forEach(function(el){
   var k=el.getAttribute('data-perm');
   if(!k)return;
   el.style.display=(typeof canPermission==='function'&&canPermission(k))?'':'none';
  });
 }
 window.imodeApplyActionVisibility=applyActionVisibility;
 if(typeof window.applyRoleVisibility==='function'){
  var baseVisibility=window.applyRoleVisibility;
  window.applyRoleVisibility=function(){
   var r=baseVisibility.apply(this,arguments);
   applyActionVisibility();
   return r;
  };
 }
 if(typeof applyRoleVisibility==='function')applyRoleVisibility();
 applyActionVisibility();
})();
