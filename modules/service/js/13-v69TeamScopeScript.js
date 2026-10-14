/* V6.9 technician teams.
   Two teams, Technical and R&D, with a role each plus a team-lead role, and work lists
   scoped so a technician only sees their own team. The team field, the team badge and the
   Technical / R&D segments on the ทีมช่าง page already existed; what was missing was a
   role per team, a lead account, and any scoping of who a technician can see.
   Placeholder lead records are created so the structure can be tested; the names are meant
   to be edited on the ทีมช่าง page. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!Array.isArray(technicians))return;
 var VERSION=1;

 /* ---------- 1. team lead technician records (placeholders) ---------- */
 var SEED=[
  {id:'T-LEAD-TECH',employeeId:'USR-003',name:'Example Tech Lead',role:'Technical Supervisor',team:'Technical',phone:'',email:'',color:'blue'},
  {id:'T-LEAD-RD',employeeId:'USR-004',name:'Example R&D Lead',role:'R&D Supervisor',team:'R&D',phone:'',email:'',color:'orange'}
 ];
 function ensureLeads(){
  var added=false;
  SEED.forEach(function(seed){
   if(technicians.some(function(t){return t.id===seed.id}))return;
   technicians.push(JSON.parse(JSON.stringify(seed)));
   added=true;
  });
  /* Everyone who predates the team field belongs to Technical, which is what the page
     already assumed with (t.team||'Technical'). Make it explicit so it can be changed. */
  technicians.forEach(function(t){if(!t.team)t.team='Technical'});
  if(added&&typeof saveLocal==='function')saveLocal();
  return added;
 }

 /* ---------- 2. one role per team, plus a lead role ---------- */
 function techPerms(){
  var r=(settings.roles||[]).filter(function(x){return String(x.name||'').toLowerCase()==='technician'})[0];
  if(r&&Array.isArray(r.permissions)&&r.permissions.length)return r.permissions.slice();
  return typeof permissionPresetForRoleName==='function'?permissionPresetForRoleName('Technician'):[];
 }
 /* A lead still works in the field, and additionally sees the team and its case load. */
 var LEAD_EXTRA=['team.view','case.view','case.assign','calendar.edit','reports.view','dashboard.view'];
 function ensureRoles(){
  settings.roles=Array.isArray(settings.roles)?settings.roles:[];
  var base=techPerms();
  var lead=base.slice();
  LEAD_EXTRA.forEach(function(k){if(lead.indexOf(k)<0)lead.push(k)});
  /* 2026-09-15: the technician side is four roles — Technician, R&D, Technical Lead,
     R&D Lead. 'Technician - Technical' is gone (Technician IS the Technical role) and
     'Technician - R&D' is seeded under its real name, 'R&D'. js/47 converts copies already
     saved under the old names. */
  [['R&D','R&D',base],
   ['Technical Lead','Technical',lead],
   ['R&D Lead','R&D',lead]].forEach(function(row){
   var found=settings.roles.filter(function(r){return r.name===row[0]})[0];
   if(found){found.teamScope=found.teamScope||row[1];return}
   settings.roles.push({name:row[0],users:0,teamScope:row[1],positionScope:'',permissions:row[2].slice()});
  });
  /* The original Technician role keeps working; it is simply pinned to Technical. */
  var t=settings.roles.filter(function(r){return String(r.name||'').toLowerCase()==='technician'})[0];
  if(t&&!t.teamScope)t.teamScope='Technical';
 }

 function migrate(){
  if(settings.v69TeamScope===VERSION)return;
  ensureLeads();
  ensureRoles();
  settings.v69TeamScope=VERSION;
  if(typeof saveLocal==='function')saveLocal();
 }
 migrate();

 /* ---------- 3. which team may the current session see ----------
    null means every team: admins, managers and anyone not tied to a team. */
 function techRecord(){
  var id=(typeof currentUser!=='undefined'&&currentUser&&currentUser.technicianId)||'';
  if(!id)return null;
  return technicians.filter(function(t){return t.id===id})[0]||null;
 }
 /* 2026-09-25 — a scope that names no team any technician is in is no scope at all. The live
    Admin / Coordinator role carries teamScope 'Admin', so every assign picker for an admin came
    out EMPTY ("ไม่มีช่างในขอบเขตของบัญชีนี้") while ทีมช่าง listed four technicians. A real team
    lead still gets their own team; only a scope matching nobody falls back to everyone. */
 function teamScope(){var s=rawTeamScope();if(!s)return null;try{if(!technicians.some(function(t){return (t.team||'Technical')===s}))return null}catch(e){}return s}
 function rawTeamScope(){
  var u=(typeof currentUser!=='undefined'&&currentUser)||null;
  if(!u)return null;
  var rec=techRecord();
  if(rec&&rec.team)return rec.team;
  var role=(settings.roles||[]).filter(function(r){return r.name===(u.permissionRole||u.role)})[0];
  if(role&&role.teamScope)return role.teamScope;
  if(u.accountType==='technician')return u.team||'Technical';
  return null;
 }
 window.imodeTeamScope=teamScope;

 function scopeList(list){
  var team=teamScope();
  if(!team||!Array.isArray(list))return list;
  return list.filter(function(t){return (t.team||'Technical')===team});
 }

 /* ---------- 4. apply the scope to the three places work is listed ---------- */
 if(typeof window.filteredTechnicians==='function'){
  var baseFiltered=window.filteredTechnicians;
  window.filteredTechnicians=function(){return scopeList(baseFiltered.apply(this,arguments))};
 }
 if(typeof window.filteredTechOptions==='function'){
  var baseOptions=window.filteredTechOptions;
  window.filteredTechOptions=function(){return scopeList(baseOptions.apply(this,arguments))};
 }
 /* Field Service builds its <select> straight from `technicians`, so the list is trimmed
    after the render instead of duplicating that function. */
 if(typeof window.renderFieldService==='function'){
  var baseField=window.renderFieldService;
  window.renderFieldService=function(){
   var r=baseField.apply(this,arguments);
   var team=teamScope();
   var sel=document.getElementById('fieldTechSelect');
   if(team&&sel){
    var allowed={};
    technicians.forEach(function(t){if((t.team||'Technical')===team)allowed[t.id]=1});
    Array.prototype.slice.call(sel.options).forEach(function(o){if(!allowed[o.value])o.remove()});
    var mine=(typeof currentUser!=='undefined'&&currentUser&&currentUser.technicianId)||'';
    if(mine&&allowed[mine])sel.value=mine;
    else if(sel.options.length&&!allowed[sel.value])sel.value=sel.options[0].value;
   }
   return r;
  };
 }
})();
