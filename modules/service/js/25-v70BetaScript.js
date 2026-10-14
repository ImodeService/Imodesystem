/* Beta Service focus — technician test records and a role-aware mobile bottom bar.

   Two things that look unrelated live together because both decide what a signed-in
   person can actually reach on a phone:

     1. The technician records behind the two new beta accounts (tech_test1, R&D_test1).
        The accounts themselves are in js/09 with the rest of the registry; only the
        technician rows they point at are seeded here, the same way v69TeamScopeScript
        seeds the two team leads.

     2. The mobile bottom bar. It was five hard-coded buttons in index.html
        (หน้าหลัก / เคส / ＋รับเคส / ปฏิทิน / เพิ่มเติม) over a fixed
        grid-template-columns:repeat(5,1fr). applyRoleVisibility() hides a button whose
        page the role may not open by setting display:none, and a display:none child is
        removed from the grid — so on an account missing dashboard.view and case.view the
        bar collapsed to two buttons pinned left with an empty half. It also never carried
        the modules a technician actually works in. It is built from the role's own
        permissions now, and the column count follows what is really visible. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 function tl(th,en){return (settings.language==='en')?en:th}
 function me(){try{return currentUser||null}catch(e){return null}}
 function can(k){try{return typeof canPermission==='function'?canPermission(k):true}catch(e){return false}}

 /* ---------- 1. technician records for the beta accounts ----------
    Same shape and the same one-time guard as the team-lead seed in js/13. The names are
    meant to be edited on the ทีมช่าง page; only the ids are load-bearing, because the
    accounts in js/09 point at them by id. */
 var SEED=[
  {id:'T-TEST-1',name:'ช่างทดสอบ 1',role:'Technician',team:'Technical',phone:'',email:'',color:'blue',status:'พร้อมรับงาน',skills:'Service, PM'},
  {id:'T-RD-1',  name:'R&D ทดสอบ 1',role:'R&D',       team:'R&D',      phone:'',email:'',color:'orange',status:'พร้อมรับงาน',skills:'R&D, Test'}
 ];
 var SEED_VERSION=1;
 function seedTechnicians(){
  if(typeof technicians==='undefined'||!Array.isArray(technicians))return;
  if(settings.v70BetaSeed===SEED_VERSION||((window.IMODE_ENV&&window.IMODE_ENV.production)||window.IMODE_NO_DEMO))return;
  var added=false;
  SEED.forEach(function(row){
   if(technicians.some(function(t){return t.id===row.id}))return;
   technicians.push(JSON.parse(JSON.stringify(row)));
   added=true;
  });
  settings.v70BetaSeed=SEED_VERSION;
  if(typeof saveLocal==='function')saveLocal();
  if(added&&typeof cloudUpsert==='function'){
   SEED.forEach(function(row){
    var t=technicians.filter(function(x){return x.id===row.id})[0];
    if(t){try{cloudUpsert('technicians',t)}catch(e){}}
   });
  }
 }
 try{seedTechnicians()}catch(e){}

 /* ---------- 2. the bottom bar ----------
    Candidates in the order each kind of account works in them. Only pages the role holds
    a permission for survive, so the bar can never offer a page goPage() would bounce. */
 var CANDIDATES={
  technician:[
   {page:'my-work',      icon:'🧾',th:'งานของฉัน', en:'My Work',  perm:'mywork.view'},
   {page:'field-service',icon:'🧰',th:'หน้างาน',   en:'Field',    perm:'field.view'},
   /* 2026-09-21: this slot was QC — "เปลี่ยนปุ่ม QC ตรงนี้ เป็นปุ่มหน้าหลัก และพอกดไปจะไปที่ home Page".
      It goes to #page-home, the module board, exactly like the staff bar's own หน้าหลัก.
      THE PERMISSION IS NOT dashboard.view, which that one uses: a technician does not hold it
      (part 12 — goPage('dashboard') bounces them to their first allowed page), so gating on it
      here would hide the button from the only people this bar is built for. 'home' has no
      PAGE_PERMISSION key of its own, so this string is read by nothing but the filter three
      lines below; mywork.view is simply a key every technician role certainly has — it is what
      งานของฉัน above is gated on, so if it were missing this bar would already be wrong. */
   {page:'home',         icon:'⌂', th:'หน้าหลัก',   en:'Home',     perm:'mywork.view'},
   {page:'calendar',     icon:'📅',th:'ปฏิทิน',    en:'Calendar', perm:'calendar.view'},
   {page:'notifications',icon:'🔔',th:'แจ้งเตือน',  en:'Alerts',   perm:'notifications.view'},
   {page:'machines',     icon:'⚙', th:'เครื่องจักร',en:'Machines', perm:'machine.view'},
   {page:'documents',    icon:'📁',th:'เอกสาร',    en:'Documents',perm:'documents.view'}
   /* QC is deliberately NOT a candidate here any more — "QC ก็ย้ายไปตรงเพิ่มเติมที่อยู่ขวาสุดไง
      เพราะอันนี้เป็นหน้าของช่างอะ". Left at the end of this list it would have climbed back into
      the bar for any role that could not open one of the five above it. It now lives in
      เมนูเพิ่มเติม, where js/06 had never actually listed it, and on the Home board. */
  ],
  staff:[
   /* 2026-09-18: หน้าหลัก means the Home board (#page-home), not the dashboard — "ปุ่มหน้าหลัก
      กดแล้วควรที่จะไปหน้า Home page". The permission stays dashboard.view because that is what
      this slot has always been gated on; 'home' itself has no PAGE_PERMISSION key, so
      applyRoleVisibility() leaves the button alone either way. */
   {page:'home',         icon:'⌂', th:'หน้าหลัก',   en:'Home',     perm:'dashboard.view'},
   {page:'cases',        icon:'📋',th:'เคส',       en:'Cases',    perm:'case.view'},
   {page:'assign',       icon:'📌',th:'มอบหมาย',   en:'Assign',   perm:'case.assign'},
   /* 2026-09-18: คำขอจากลูกค้า takes the fourth slot and ปฏิทิน moves into เมนูเพิ่มเติม (js/06)
      — "อยากให้สิ่งที่จะอยู่แทนปฏิทินคือ คำขอจากลูกค้า". The bar has four slots beside the FAB, so
      calendar staying further down this list means it only reappears for a role that cannot
      open one of the four above it. */
   {page:'requests',     icon:'📥',th:'คำขอ',      en:'Requests', perm:'line.view'},
   {page:'notifications',icon:'🔔',th:'แจ้งเตือน',  en:'Alerts',   perm:'notifications.view'},
   {page:'calendar',     icon:'📅',th:'ปฏิทิน',    en:'Calendar', perm:'calendar.view'},
   {page:'qc',           icon:'✅',th:'QC',         en:'QC',       perm:'qc.view'},
   {page:'machines',     icon:'⚙', th:'เครื่องจักร',en:'Machines', perm:'machine.view'}
  ]
 };
 /* A technician account is the one with a technician record behind it; the role name is
    only the fallback, because a team lead is a technician too. */
 function isTechnicianSession(){
  var u=me();
  if(!u)return false;
  if(u.technicianId)return true;
  return /technician|r&d|engineer|ช่าง/i.test(String(u.permissionRole||u.role||''));
 }
 /* The FAB sits on the grid like any other button, so it costs one of the slots. */
 var SLOTS=5;

 function chooseModules(){
  var list=CANDIDATES[isTechnicianSession()?'technician':'staff'];
  var fab=can('case.create');
  var room=SLOTS-(fab?1:0);
  var out=[];
  for(var i=0;i<list.length&&out.length<room;i++){
   if(!list[i].perm||can(list[i].perm))out.push(list[i]);
  }
  return {mods:out,fab:fab};
 }

 function fabHTML(){
  return '<button class="fab" data-perm="case.create" data-v70="fab" onclick="openCaseModal()">'
       + '<span>＋</span><b>'+tl('รับเคส','New')+'</b></button>';
 }

 function buildBottomNav(){
  var nav=document.querySelector('.bottom-nav');
  if(!nav)return;
  var pick=chooseModules();
  /* Nothing to show at all (no session yet, enforcement denying everything): leave the
     markup exactly as index.html shipped it rather than emptying the bar. */
  if(!pick.mods.length&&!pick.fab)return;
  var sig=pick.mods.map(function(m){return m.page}).join(',')+'|'+pick.fab+'|'+(settings.language||'th');
  if(nav.dataset.v70sig===sig){fitColumns();return}
  nav.dataset.v70sig=sig;

  var html='',mid=Math.ceil(pick.mods.length/2),placed=false;
  pick.mods.forEach(function(m,i){
   if(pick.fab&&i===mid){html+=fabHTML();placed=true}
   html+='<button data-page="'+m.page+'" data-v70="mod"><span>'+m.icon+'</span><b>'
       + tl(m.th,m.en)+'</b></button>';
  });
  if(pick.fab&&!placed)html+=fabHTML();
  html+='<button data-v70="more" onclick="openMoreSheet()"><span>•••</span><b>'
      + tl('เพิ่มเติม','More')+'</b></button>';
  nav.innerHTML=html;

  /* index.html's buttons were wired once at parse time in js/03; these are new nodes. */
  nav.querySelectorAll('[data-page]').forEach(function(b){
   b.onclick=function(){goPage(b.dataset.page)};
  });
  syncActive();
  fitColumns();
 }

 /* repeat(5,1fr) is hard-coded in css/01, and a display:none button leaves its column
    empty — which is what made the bar look broken. The count is dynamic now, so the
    columns follow it. An inline style beats the author rule at every breakpoint. */
 function fitColumns(){
  var nav=document.querySelector('.bottom-nav');
  if(!nav)return;
  var n=0;
  nav.querySelectorAll('button').forEach(function(b){
   if(getComputedStyle(b).display!=='none')n++;
  });
  nav.style.gridTemplateColumns=n?('repeat('+n+',1fr)'):'';
  /* Six columns on a 390px phone leaves ~56px per label; without this the Thai labels are
     ellipsised to "งานขอ…". */
  nav.classList.toggle('is-tight',n>=6);
 }

 function syncActive(){
  var active=(document.querySelector('.page.active')||{}).id||'';
  var name=active.indexOf('page-')===0?active.slice(5):'';
  document.querySelectorAll('.bottom-nav [data-page]').forEach(function(b){
   b.classList.toggle('active',b.dataset.page===name);
  });
 }

 /* applyRoleVisibility() runs on every renderAll() and after a sign-in, which is exactly
    when the right set of buttons can change. It also hides [data-perm] nodes, so the
    column count is recomputed after it, never before. */
 if(typeof window.applyRoleVisibility==='function'){
  var baseVis=window.applyRoleVisibility;
  window.applyRoleVisibility=function(){
   var r=baseVis.apply(this,arguments);
   try{buildBottomNav();fitColumns()}catch(e){}
   return r;
  };
 }
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(){
   var r=baseGo.apply(this,arguments);
   try{syncActive()}catch(e){}
   return r;
  };
 }
 window.imodeBuildBottomNav=buildBottomNav;

 var style=document.createElement('style');
 style.id='v70BetaStyle';
 style.textContent=''
 +'.bottom-nav b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'
 +'.bottom-nav.is-tight b{font-size:7.6px;letter-spacing:-.2px}'
 +'.bottom-nav.is-tight button{padding-left:2px;padding-right:2px}';
 document.head.appendChild(style);

 function install(){try{buildBottomNav()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
