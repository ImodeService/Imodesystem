/* V6.8 Service focus — role-based Home Pages.
   Three new pages are injected into <main>: page-home (Admin / Technician),
   page-customer-home (reached from a machine QR, before login) and page-customer-login.
   Authentication, roles and permissions are NOT reimplemented here: this script reads
   settings.roles / settings.userPermissions and calls the existing login in
   v68UatAccountsScript through window.uatAuth. */
(function(){
 const T=()=>settings.language!=='en';
 const L=(th,en)=>T()?th:en;

 /* ---------- module catalog ----------
    page + icon + label mirror the existing sidebar; perm is the key already defined in
    PERMISSION_CATALOG. onsite / spare-parts / petty-cash have no permission key in the
    catalog, so perm is null and the back-office rule below decides. */
 const MODULES=[
  {page:'cases',        icon:'📋', th:'เคสงานบริการ',          en:'Service Cases',       perm:'case.view'},
  {page:'quotation',    icon:'฿',  th:'ใบเสนอราคา',           en:'Quotation',           perm:'quotation.view'},
  {page:'customers',    icon:'👥', th:'ลูกค้า',                en:'Customers',           perm:'customer.view'},
  {page:'machines',     icon:'⚙',  th:'เครื่องจักร',           en:'Machines',            perm:'machine.view'},
  {page:'qc',           icon:'✅', th:'QC เครื่อง',            en:'Machine QC',          perm:'qc.view'},
  {page:'calendar',     icon:'📅', th:'ปฏิทินงาน',            en:'Calendar',            perm:'calendar.view'},
  {page:'field-service',icon:'🧰', th:'Field Service',        en:'Field Service',       perm:'field.view'},
  {page:'technicians',  icon:'👨‍🔧',th:'ทีมงาน',              en:'Team',        perm:'team.view'},
  {page:'warranty',     icon:'🛡', th:'ระบบประกันเครื่อง',      en:'Warranty',            perm:'warranty.view'},
  {page:'documents',    icon:'📁', th:'เอกสารเครื่องจักร',      en:'Documents',           perm:'documents.view'},
  {page:'notifications',icon:'🔔', th:'การแจ้งเตือน',          en:'Notifications',       perm:'notifications.view'},
  {page:'reports',      icon:'📊', th:'รายงาน',               en:'Reports',             perm:'reports.view'},
  {page:'settings',     icon:'🛠', th:'ตั้งค่าระบบ',           en:'Settings',            perm:'settings.manage'},
  /* These three had no permission key, so the Home page fell back to a "back office role"
     rule. v69RoleScopeScript gives them real keys; the rule stays only as a fallback for
     a settings object saved before that script existed. */
  {page:'onsite',       icon:'📍', th:'หน้างาน',              en:'Worksite',            perm:'onsite.view'},
  {page:'spare-parts',  icon:'📦', th:'สต๊อกอะไหล่',           en:'Spare Parts',         perm:'parts.view'},
  {page:'petty-cash',   icon:'💵', th:'เงินสดย่อย',            en:'Petty Cash',          perm:'pettycash.view'}
 ];

 /* Customer circles are journey visuals only — they never open an internal module. */
 const CUSTOMER_NODES=[
  {icon:'⚠',  th:'แจ้งปัญหา',        en:'Report Issue'},
  {icon:'⚙',  th:'ข้อมูลเครื่อง',     en:'Machine Info'},
  {icon:'📄', th:'ขอใบเสนอราคา',    en:'Request Quotation'},
  {icon:'🕘', th:'ประวัติการบริการ',  en:'Service History'},
  {icon:'📘', th:'คู่มือ / เอกสาร',   en:'Manuals / Documents'},
  {icon:'💬', th:'ติดต่อเรา',        en:'Contact Us'},
  {icon:'🛡', th:'การรับประกัน',      en:'Warranty'}
 ];

 /* ---------- permissions ----------
    Same precedence as the active window.canPermission (individual override wins over the
    role), but without its enforceRolePermissions short-circuit — that toggle is off, and
    the Home Page must still show only what the role is actually granted. */
 function permKeyFor(u){return String(u&&(u.id||u.name)||'').trim()}
 function effectivePermissions(){
  const entry=settings.userPermissions&&settings.userPermissions[permKeyFor(currentUser||{})];
  if(entry&&entry.enabled)return entry.permissions||[];
  const r=typeof currentRoleConfig==='function'?currentRoleConfig():null;
  return r?(r.permissions||[]):null; /* null = role not found: do not hide anything */
 }
 /* Pages with no permission key go to roles that can assign work or administer the system. */
 function backOfficeRole(perms){return perms.includes('case.assign')||perms.includes('settings.manage')||perms.includes('users.manage')}
 /* Later patch scripts register their own modules here instead of editing this table.
    position: 'first', 'after:<page>', or omitted for the end. */
 window.imodeRegisterHomeModule=function(mod,position){
  if(!mod||!mod.page||MODULES.some(m=>m.page===mod.page))return false;
  const at=String(position||'');
  if(at==='first')MODULES.unshift(mod);
  else if(at.indexOf('after:')===0){
   const i=MODULES.findIndex(m=>m.page===at.slice(6));
   if(i<0)MODULES.push(mod); else MODULES.splice(i+1,0,mod);
  }else MODULES.push(mod);
  /* Newly registered work modules belong at the front of the quick board. */
  if(mod.page==='my-work'){
   QUICK_DEFAULT.technician.unshift('my-work');
   QUICK_DEFAULT.lead.unshift('my-work');
  }
  if(mod.page==='assign'){
   QUICK_DEFAULT.staff.unshift('assign');
   QUICK_DEFAULT.lead.splice(1,0,'assign');
  }
  return true;
 };

 function homeModules(){
  const perms=effectivePermissions();
  if(!perms)return MODULES.slice();
  return MODULES.filter(m=>m.perm?perms.includes(m.perm):backOfficeRole(perms));
 }

 function isCustomerSession(){return !!(currentUser&&currentUser.accountType==='customer')}
 function staffLoggedIn(){return !!currentUser&&!isCustomerSession()}
 function roleLabel(){
  if(!currentUser)return '';
  const r=String(currentUser.permissionRole||currentUser.role||'');
  return /technician|ช่าง/i.test(r)?'Technician':(r||'Staff');
 }

 /* ---------- radial layout ----------
    Radii deliberately vary per index so the composition is organic, not a perfect ring. */
 const RADIUS_FACTORS=[1,.84,1.12,.92,1.05,.8,1.15,.95,1.08,.87,1.02,.9];
 const ANGLE_JITTER=[0,.07,-.06,.04,-.08,.03,-.04,.06,-.02,.05,-.07,.02];
 function layout(n,mobile){
  const W=mobile?700:1000,H=mobile?1000:700,cx=W/2,cy=H/2;
  const rx=mobile?248:366,ry=mobile?378:254;
  const nodes=[];
  for(let i=0;i<n;i++){
   const a=(i/n)*Math.PI*2-Math.PI/2+ANGLE_JITTER[i%ANGLE_JITTER.length];
   const f=RADIUS_FACTORS[i%RADIUS_FACTORS.length];
   nodes.push({x:cx+Math.cos(a)*rx*f,y:cy+Math.sin(a)*ry*f});
  }
  return {W,H,cx,cy,nodes};
 }
 const mobileQuery=window.matchMedia('(max-width:640px)');
 const reducedMotion=window.matchMedia('(prefers-reduced-motion:reduce)');

 /* Builds the stage: one SVG of connector lines plus one absolutely placed node per item. */
 function buildStage(items,opts){
  const o=opts||{},mobile=mobileQuery.matches,lay=layout(items.length,mobile);
  const lines=lay.nodes.map((p,i)=>`<line class="rhome-link" data-i="${esc(String(i))}" x1="${lay.cx}" y1="${lay.cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"></line>`).join('');
  const dots=lay.nodes.map(p=>{
   const mx=lay.cx+(p.x-lay.cx)*.55,my=lay.cy+(p.y-lay.cy)*.55;
   return `<circle class="rhome-link-dot" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4"></circle>`;
  }).join('');
  const nodes=items.map((it,i)=>{
   const p=lay.nodes[i],label=esc(L(it.th,it.en));
   return `<button type="button" class="rhome-node${o.nodeClass?' '+o.nodeClass:''}" data-i="${esc(String(i))}"${it.page?` data-page="${esc(it.page)}"`:''}
     style="left:${(p.x/lay.W*100).toFixed(2)}%;top:${(p.y/lay.H*100).toFixed(2)}%"
     aria-label="${label}" title="${esc(String(label))}"><span class="rhome-node-icon" aria-hidden="true">${it.icon}</span><span class="rhome-node-label">${label}</span></button>`;
  }).join('');
  return `<div class="rhome-stage${mobile?' is-mobile':''}" style="--rhome-w:${lay.W};--rhome-h:${lay.H}">
    <svg class="rhome-links" viewBox="0 0 ${lay.W} ${lay.H}" preserveAspectRatio="none" aria-hidden="true">${lines}${dots}</svg>
    <button type="button" class="rhome-center" id="${esc(o.centerId||'rhomeCenter')}" style="left:50%;top:50%" aria-label="${esc(o.centerAria||'')}">
      <span class="rhome-center-inner">
        <img class="rhome-center-logo" src="./assets/imode-ui-logo-v532.png" alt="I-MODE Plus">
        <b class="rhome-center-title" hidden></b>
        <small class="rhome-center-sub"${o.centerSub?'':' hidden'}>${esc(o.centerSub||'')}</small>
        ${o.centerBadge?`<span class="rhome-center-badge">${esc(o.centerBadge)}</span>`:''}
      </span>
    </button>
    <div class="rhome-nodes">${nodes}</div>
  </div>`;
 }

 /* Shared with v69CustomerEntryScript so the customer entry page uses the same header. */
 window.imodeBrandHeaderHTML=function(){return brandHeader()};

 /* These Home surfaces sit on white, so they use the dark navy wordmark, which also
    carries the tagline. imode-ui-logo-v532.png is white-on-transparent and belongs on the
    blue sidebar; it would be invisible here without a dark backing. */
 function brandHeader(){
  return `<div class="rhome-brand">
    <img class="rhome-brand-mark" src="./assets/imode-document-logo-removeBG.png" alt="I-MODE Plus · Service for a Better Tomorrow">
    <button type="button" class="rhome-lang" onclick="toggleLanguage()">${settings.language==='en'?'TH | <b>EN</b>':'<b>TH</b> | EN'}</button>
  </div>`;
 }

 /* ---------- Admin / Technician Home ---------- */
 function renderRoleHome(){
  const host=document.getElementById('page-home');
  if(!host)return;
  if(!staffLoggedIn()){
   host.innerHTML=`${brandHeader()}<div class="rhome-body"><div class="rhome-gate">
     <div class="rhome-gate-icon" aria-hidden="true">🔒</div>
     <h2>${esc(L('กรุณาเข้าสู่ระบบ','Please sign in'))}</h2>
     <p>${esc(L('หน้าแรกนี้แสดงเฉพาะโมดูลที่บัญชีของคุณมีสิทธิ์เข้าถึง','This home page shows only the modules your account is allowed to open'))}</p>
     <button type="button" class="primary-btn action-3d-orange" onclick="openUserLoginModal()">${esc(L('เข้าสู่ระบบ','Sign in'))}</button>
   </div></div>`;
   return;
  }
  const mods=homeModules();
  const quick=quickModules(mods),rest=mods.filter(m=>quick.indexOf(m)<0);
  host.innerHTML=`${brandHeader()}
   <div class="rhome-body rhome-cardhome">
    ${profileCard()}
    <div class="rhome-quickhead">
     <b>${esc(L('โมดูลที่ใช้บ่อย','Quick modules'))}</b>
     <small>${esc(fixedQuickOrder()?L('โมดูลหลักที่ใช้ทุกวัน','The ones you work in every day')
                                    :L('เรียงตามการใช้งานของคุณ','Ordered by how often you use them'))}</small>
    </div>
    <div class="rhome-modgrid">${quick.map(moduleCard).join('')}</div>
    ${rest.length?`<button type="button" class="rhome-more-btn" id="rhomeMoreBtn" aria-expanded="false">${esc(L('โมดูลทั้งหมด','All modules'))} (${rest.length}) ▾</button>
    <div class="rhome-modgrid rhome-modgrid-rest" id="rhomeRestGrid" hidden>${groupedRest(rest)}</div>`:''}
    ${mods.length?'':`<p class="rhome-empty">${esc(L('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าถึงโมดูลใด','This account has not been granted access to any module'))}</p>`}
   </div>`;
  host.querySelectorAll('.rhome-modcard[data-page]').forEach(btn=>{btn.onclick=()=>launchStaff(btn.dataset.page,btn)});
  const more=document.getElementById('rhomeMoreBtn'),restGrid=document.getElementById('rhomeRestGrid');
  if(more&&restGrid)more.onclick=()=>{
   const open=restGrid.hidden;
   restGrid.hidden=!open;
   more.setAttribute('aria-expanded',String(open));
   more.innerHTML=`${esc(L('โมดูลทั้งหมด','All modules'))} (${rest.length}) ${open?'▴':'▾'}`;
  };
  playStaffIntro(host);
 }

 /* ---------- quick modules ----------
    This page is the first thing staff see after signing in, so it is a shortcut board, not
    a directory: the handful of modules that role actually works in, ordered by how often
    this person has opened them. Everything else stays one tap away under "โมดูลทั้งหมด". */
 const QUICK_LIMIT=6;
 const QUICK_DEFAULT={
  technician:['field-service','calendar','qc','machines','documents','notifications'],
  lead:['field-service','calendar','cases','qc','machines','technicians'],
  staff:['cases','calendar','quotation','customers','machines','qc']
 };
 const HOME_USAGE_KEY='imode_v69_home_usage';
 function usageMap(){
  try{return JSON.parse(localStorage.getItem(HOME_USAGE_KEY)||'{}')||{}}catch(e){return {}}
 }
 function usageKey(){
  const u=currentUser||{};
  return String(u.username||u.id||u.name||'anon');
 }
 function myUsage(){
  const all=usageMap(),mine=all[usageKey()];
  return (mine&&typeof mine==='object')?mine:{};
 }
 function bumpUsage(page){
  try{
   const all=usageMap(),k=usageKey();
   const mine=(all[k]&&typeof all[k]==='object')?all[k]:{};
   mine[page]=(Number(mine[page])||0)+1;
   all[k]=mine;
   localStorage.setItem(HOME_USAGE_KEY,JSON.stringify(all));
  }catch(e){}
 }
 /* 2026-09-18, the owner's own list for the ADMIN board, in this order and fixed:
    "อยากให้จัดโมดุลที่ใช้งานบ่อย ปรับใหม่ เริ่มจาก 1.คำขอจากลูกค้า 2.เคส 3.ใบเสนอราคา 4.เครื่องจักร
    5.มอบหมายงาน 6.ลูกค้า ส่วนที่เหลือก็เอาไปใส่ไว้ในโมดุลทั้งหมดและแบ่งหมวดหมู่ไว้" — said of the
    admin, so a technician's board keeps the usage ordering it has had since part 6 §6.
    It is deliberately NOT reordered by how often each one is opened: an asked-for board that
    rearranges itself after a few taps is not the board that was asked for. */
 const STAFF_QUICK=['requests','cases','quotation','machines','assign','customers'];
 function fixedQuickOrder(){
  const r=String((currentUser&&(currentUser.permissionRole||currentUser.role))||'');
  return !(/lead|supervisor|หัวหน้า/i.test(r))&&!(/technician|r&d|engineer|ช่าง/i.test(r));
 }
 function defaultQuickList(){
  const r=String((currentUser&&(currentUser.permissionRole||currentUser.role))||'');
  if(/lead|supervisor|หัวหน้า/i.test(r))return QUICK_DEFAULT.lead;
  if(/technician|r&d|engineer|ช่าง/i.test(r))return QUICK_DEFAULT.technician;
  /* Its own constant rather than QUICK_DEFAULT.staff, which js/16 unshifts 'assign' onto at
     registration time — that would put มอบหมายงาน first again and undo the order above. */
  return STAFF_QUICK;
 }
 /* Usage wins, then the role's default order, then the module order itself. A module the
    role cannot open never enters the list, because `mods` is already permission filtered. */
 function quickModules(mods){
  /* Order always applies, even when every module fits: a technician should land with
     Field Service first, not with whatever order the module table happens to use. */
  const use=myUsage(),pref=defaultQuickList();
  const rank=m=>{
   const i=pref.indexOf(m.page);
   return i<0?pref.length+mods.indexOf(m):i;
  };
  /* The admin board is the list above, in that order, whatever has been opened most. */
  if(fixedQuickOrder()){
   return mods.slice().sort((a,b)=>rank(a)-rank(b))
     .slice(0,Math.max(QUICK_LIMIT,mods.length<=QUICK_LIMIT?mods.length:0));
  }
  return mods.slice().sort((a,b)=>{
   const ua=Number(use[a.page])||0,ub=Number(use[b.page])||0;
   if(ua!==ub)return ub-ua;
   return rank(a)-rank(b);
  }).slice(0,Math.max(QUICK_LIMIT,mods.length<=QUICK_LIMIT?mods.length:0));
 }

 /* Everything that is not on the quick board, under headings — "ส่วนที่เหลือก็เอาไปใส่ไว้ใน
    โมดุลทั้งหมดและแบ่งหมวดหมู่ไว้". The categories are js/36's sidebar groups, read at render
    time rather than copied: the sidebar and this list must not be able to disagree about
    which group a module belongs to, and js/36 loads after this file. A module in no group,
    and any module added later, falls into อื่น ๆ rather than disappearing. */
 function groupedRest(rest){
  let groups=[];
  try{groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[]}catch(e){}
  const left=rest.slice(),out=[];
  groups.forEach(g=>{
   const inGroup=[];
   (g.pages||[]).forEach(p=>{
    const i=left.findIndex(m=>m.page===p);
    if(i>=0)inGroup.push(left.splice(i,1)[0]);
   });
   if(inGroup.length)out.push({name:L(g.th,g.en||g.th),mods:inGroup});
  });
  if(left.length)out.push({name:L('อื่น ๆ','Other'),mods:left});
  if(!out.length)return rest.map(moduleCard).join('');
  return out.map(sec=>`<h4 class="rhome-restgroup">${esc(sec.name)}</h4>`
    +sec.mods.map(moduleCard).join('')).join('');
 }

 /* The identity block at the top: the person's photo on the left, their details on the
    right. The photo falls back to initials because most accounts have no image. */
 function profileCard(){
  const u=currentUser||{};
  const photo=String(u.photo||'').trim();
  const initials=String(u.name||'?').trim().split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join('');
  /* Name and role only: this is a shortcut board, and team, username and module counts
     were noise above the cards. */
  /* 2026-10-13: the Dashboard is gone, so this block is just who is signed in. */
  return `<div class="rhome-profile">
    <div class="rhome-avatar">${photo?`<img src="${esc(photo)}" alt="${esc(u.name||'')}">`:`<span>${esc(initials||'?')}</span>`}</div>
    <div class="rhome-profile-body">
     <h2>${esc(u.name||'')}</h2>
     <p class="rhome-profile-role">${esc(u.permissionRole||u.role||roleLabel())}</p>
    </div>
   </div>`;
 }

 function moduleCard(m,i){
  const label=esc(L(m.th,m.en));
  return `<button type="button" class="rhome-modcard" data-page="${esc(m.page)}" data-i="${esc(String(i))}" aria-label="${label}">
    <span class="rhome-modcard-icon" aria-hidden="true">${m.icon}</span>
    <span class="rhome-modcard-label">${label}</span>
   </button>`;
 }

 /* Staff intro: the mirror of the customer merge. The circles start on the centre and
    bloom outward to their places, the connectors draw after them. The inline animation is
    written synchronously right after innerHTML, before the browser paints, so nothing is
    ever seen in its final position first. backwards fill keeps frame 0 during the delay. */
 function playStaffIntro(host){
  const grid=host&&host.querySelector('.rhome-modgrid');
  if(grid)return playCardIntro(host,grid);
  const stage=host&&host.querySelector('.rhome-stage');
  if(!stage)return;
  const center=stage.querySelector('.rhome-center');
  const nodes=[...stage.querySelectorAll('.rhome-node')];
  const links=[...stage.querySelectorAll('.rhome-link,.rhome-link-dot')];
  if(reducedMotion.matches){
   if(center)center.style.animation='rhomeStaffFade 240ms ease backwards';
   nodes.forEach((n,i)=>{n.style.animation='rhomeStaffFade 240ms ease '+(60+i*18)+'ms backwards'});
   links.forEach(l=>{l.style.animation='rhomeStaffFade 240ms ease 120ms backwards'});
   return;
  }
  const box=stage.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
  if(center)center.style.animation='rhomeCenterIn 520ms cubic-bezier(.22,.9,.3,1.05) backwards';
  nodes.forEach((n,i)=>{
   const r=n.getBoundingClientRect();
   n.style.setProperty('--rhome-dx',(cx-(r.left+r.width/2)).toFixed(1)+'px');
   n.style.setProperty('--rhome-dy',(cy-(r.top+r.height/2)).toFixed(1)+'px');
   n.style.animation='rhomeBloomOut 620ms cubic-bezier(.22,.9,.3,1.02) '+(160+i*55)+'ms backwards';
  });
  links.forEach((l,i)=>{l.style.animation='rhomeStaffFade 420ms ease '+(260+i%nodes.length*55)+'ms backwards'});
 }

 /* Card Home intro: the identity block settles first, then the module cards rise in on a
    short stagger. Written inline before the first paint, with backwards fill, so a card is
    never seen in place before it moves. */
 function playCardIntro(host,grid){
  const profile=host.querySelector('.rhome-profile');
  const cards=[...grid.querySelectorAll('.rhome-modcard')];
  if(reducedMotion.matches){
   if(profile)profile.style.animation='rhomeStaffFade 240ms ease backwards';
   cards.forEach((c,i)=>{c.style.animation='rhomeStaffFade 240ms ease '+(60+i*16)+'ms backwards'});
   return;
  }
  if(profile)profile.style.animation='rhomeCardDrop 460ms cubic-bezier(.22,.9,.3,1.02) backwards';
  cards.forEach((c,i)=>{c.style.animation='rhomeCardRise 420ms cubic-bezier(.22,.9,.3,1.03) '+(170+i*52)+'ms backwards'});
 }

 /* Module launch: the picked circle grows and the rest of the stage dims, then the page
    changes. Navigation is never blocked for longer than the animation, and a second click
    during it is ignored rather than queued. */
 let staffLaunching=false;
 function launchStaff(page,el){
  if(staffLaunching)return;
  const grid=el&&el.closest('.rhome-modgrid');
  if(grid){
   bumpUsage(page);
   if(reducedMotion.matches){goPage(page);return}
   staffLaunching=true;
   grid.classList.add('is-launching');
   el.style.animation='';
   el.classList.add('is-launch');
   setTimeout(()=>{staffLaunching=false;goPage(page)},300);
   return;
  }
  const stage=el&&el.closest('.rhome-stage');
  if(!stage||reducedMotion.matches){goPage(page);return}
  staffLaunching=true;
  stage.classList.add('is-launching');
  const center=stage.querySelector('.rhome-center');
  /* The centre itself has nowhere to travel, so it just takes the hit. */
  if(el===center){
   el.classList.add('is-launch');
   setTimeout(()=>{staffLaunching=false;goPage(page)},330);
   return;
  }
  /* Measure at launch time rather than reusing the intro vars: a reduced-motion intro
     never sets them, and a breakpoint re-render moves every circle. Drop the intro
     animation and force a reflow first, otherwise a click landing mid-intro measures the
     circle in flight and the slam aims at the wrong point. */
  el.style.animation='';
  void el.offsetWidth;
  const box=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
  el.style.setProperty('--rhome-dx',((box.left+box.width/2)-(r.left+r.width/2)).toFixed(1)+'px');
  el.style.setProperty('--rhome-dy',((box.top+box.height/2)-(r.top+r.height/2)).toFixed(1)+'px');
  /* Grow to exactly the centre circle's size, so the module lands as the new centre. */
  const cr=center?center.getBoundingClientRect():null;
  const grow=cr&&r.width?cr.width/r.width:3;
  el.style.setProperty('--rhome-grow',grow.toFixed(3));
  el.classList.add('is-slam');
  /* The centre reacts on impact, not on the click. */
  setTimeout(()=>{if(center)center.classList.add('is-hit')},280);
  setTimeout(()=>{staffLaunching=false;goPage(page)},620);
 }

 /* ---------- Customer Home (entered from a machine QR) ---------- */
 let entryMode='',qrMachineId='',merging=false;
 function qrMachine(){return typeof machineByQrToken==='function'?machineByQrToken(portalMachineToken):null}
 function renderCustomerHome(){
  const host=document.getElementById('page-customer-home');
  if(!host)return;
  merging=false;
  const m=qrMachine();
  qrMachineId=m?m.id:'';
  const ctx=m
   ? `<div class="rhome-qr-card">${typeof machineMediaHTML==='function'?machineMediaHTML(m):'<span class="rhome-qr-icon" aria-hidden="true">▣</span>'}<div>
        <b>${esc(L('เข้าสู่บริการจาก QR','Opened from machine QR'))}</b>
        <small>${esc(L('เครื่อง','Machine'))}: ${esc(machinePrimaryName(m))}</small>
        <small>${esc(L('รุ่น','Model'))}: ${esc(m.model||'-')} · S/N ${esc(m.serial||'-')}</small>
      </div></div>`
   : `<div class="rhome-qr-card is-warn"><span class="rhome-qr-icon" aria-hidden="true">▣</span><div>
        <b>${esc(L('ไม่พบเครื่องจาก QR นี้','Machine not found for this QR'))}</b>
        <small>${esc(L('ยังเข้าสู่ระบบเพื่อดูข้อมูลของคุณได้','You can still sign in to see your own machines'))}</small>
      </div></div>`;
  host.innerHTML=`${brandHeader()}
   <div class="rhome-body rhome-customer">
    <div class="rhome-head">
     <h2>${esc(L('ยินดีต้อนรับ','Welcome'))}</h2>
     <p>${esc(L('สู่ศูนย์รวมงานบริการดูแลเครื่องของคุณ','to the service centre that looks after your machine'))}</p>
     <p class="rhome-head-en">Welcome to I-MODE Plus Service</p>
    </div>
    ${ctx}
    ${buildStage(CUSTOMER_NODES,{centerId:'rhomeCustomerCenter',nodeClass:'is-journey',centerAria:L('กดเพื่อเข้าสู่ระบบสำหรับลูกค้า','Press to continue to the customer login')})}
    <p class="rhome-hint">${esc(L('กดวงกลมตรงกลางเพียงครั้งเดียวเพื่อเข้าสู่ระบบ','Press the centre circle once to continue'))}</p>
   </div>`;
  const center=document.getElementById('rhomeCustomerCenter');
  if(center)center.onclick=startMerge;
  /* Journey circles are not module launchers; they only point back to the centre. */
  host.querySelectorAll('.rhome-node.is-journey').forEach(btn=>{
   btn.setAttribute('aria-disabled','true');
   btn.onclick=()=>{if(!merging)toastMsg(L('กดวงกลมตรงกลางเพื่อเข้าสู่ระบบ','Press the centre circle to continue'))};
  });
 }

 function startMerge(){
  if(merging)return;
  merging=true;
  const host=document.getElementById('page-customer-home');
  const stage=host&&host.querySelector('.rhome-stage');
  const center=document.getElementById('rhomeCustomerCenter');
  if(!stage||!center){goPage('customer-login');return}
  center.disabled=true;
  stage.classList.add('is-merging');
  const nodes=[...stage.querySelectorAll('.rhome-node')];
  const finish=()=>{
   const logo=stage.querySelector('.rhome-center-logo');
   if(logo)logo.hidden=true;
   const title=stage.querySelector('.rhome-center-title');
   if(title){title.hidden=false;title.textContent='Customer'}
   const sub=stage.querySelector('.rhome-center-sub');
   if(sub){sub.hidden=false;sub.textContent=L('พร้อมเข้าสู่ระบบ','Ready to login')}
   stage.classList.add('is-merged');
   setTimeout(()=>goPage('customer-login'),reducedMotion.matches?150:520);
  };
  if(reducedMotion.matches){
   stage.classList.add('is-reduced');
   setTimeout(finish,220);
   return;
  }
  const box=stage.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
  nodes.forEach((n,i)=>{
   const r=n.getBoundingClientRect();
   const dx=cx-(r.left+r.width/2),dy=cy-(r.top+r.height/2);
   n.style.setProperty('--rhome-dx',dx.toFixed(1)+'px');
   n.style.setProperty('--rhome-dy',dy.toFixed(1)+'px');
   setTimeout(()=>n.classList.add('is-merging'),80+i*60);
  });
  setTimeout(finish,80+nodes.length*60+820);
 }

 /* ---------- Customer Login ---------- */
 function lineLoginAvailable(){
  const cfg=settings.lineConfig||{};
  return !!(cfg.liffId||cfg.addFriendUrl||cfg.officialAccountId);
 }
 function renderCustomerLogin(){
  const host=document.getElementById('page-customer-login');
  if(!host)return;
  const m=qrMachine();
  host.innerHTML=`${brandHeader()}
   <div class="rhome-body rhome-login-body">
    <div class="rhome-login-card">
     <h2>Customer Login</h2>
     <p>${esc(L('เข้าสู่ระบบสำหรับลูกค้า','Sign in to the customer service portal'))}</p>
     ${m?`<div class="rhome-login-machine">${esc(machinePrimaryName(m))} · S/N ${esc(m.serial||'-')}</div>`:''}
     <form id="rhomeCustomerLoginForm" autocomplete="on">
      <div class="rhome-field"><span aria-hidden="true">👤</span><input id="rhomeCustomerUser" autocomplete="username" placeholder="${esc(L('ชื่อผู้ใช้ / อีเมล','Username / email'))}" aria-label="${esc(L('ชื่อผู้ใช้','Username'))}"></div>
      <div class="rhome-field"><span aria-hidden="true">🔒</span><input id="rhomeCustomerPass" type="password" autocomplete="current-password" placeholder="${esc(L('รหัสผ่าน','Password'))}" aria-label="${esc(L('รหัสผ่าน','Password'))}"></div>
      <div id="rhomeCustomerError" class="rhome-login-error" role="alert"></div>
      <button type="submit" class="rhome-login-btn">${esc(L('เข้าสู่ระบบ','Sign in'))}</button>
      ${lineLoginAvailable()?`<div class="rhome-login-or">${esc(L('หรือ','or'))}</div>
      <button type="button" class="rhome-login-line" id="rhomeCustomerLine">LINE ${esc(L('เข้าสู่ระบบด้วย LINE','Continue with LINE'))}</button>`:''}
     </form>
     <button type="button" class="rhome-login-back" id="rhomeCustomerBack">← ${esc(L('กลับหน้าแรก','Back to home'))}</button>
    </div>
   </div>`;
  const form=document.getElementById('rhomeCustomerLoginForm');
  if(form)form.onsubmit=submitCustomerLogin;
  const back=document.getElementById('rhomeCustomerBack');
  if(back)back.onclick=()=>goPage('customer-home');
  const line=document.getElementById('rhomeCustomerLine');
  /* LINE Login scaffold (v69PortalEntryScript). Without a LIFF ID it can only open the
     Official Account, exactly as before. */
  if(line)line.onclick=()=>{
   if(window.imodeLineAuth&&typeof window.imodeLineAuth.signIn==='function'){window.imodeLineAuth.signIn();return}
   if(typeof window.openPortalLineOfficial==='function')window.openPortalLineOfficial();
  };
 }
 /* Signs in through ImodeAuth so the customer door uses the same provider, lockout,
    session expiry and audit trail as the staff door. It never checks a password itself. */
 /* ---------- staff login door ----------
    This is the application's front door: opening the link with no session lands here
    instead of on the Dashboard. Customers never arrive this way — they reach the app by
    scanning a machine QR — so a customer account is refused here and pointed at LINE OA.
    It reuses window.imodeSignIn (same provider, lockout, expiry and audit) with
    noRoute:true, so this page decides where the visitor goes. */
 function renderStaffLogin(){
  const host=document.getElementById('page-staff-login');
  if(!host)return;
  host.innerHTML=`${brandHeader()}
   <div class="rhome-body rhome-login-body">
    <div class="rhome-login-card">
     <h2>${esc(L('เข้าสู่ระบบพนักงาน','Staff sign in'))}</h2>
     <p>${esc(L('สำหรับแอดมิน และช่างบริการ','For administrators and service technicians'))}</p>
     <form id="rhomeStaffLoginForm" autocomplete="on">
      <div class="rhome-field"><span aria-hidden="true">👤</span><input id="rhomeStaffUser" autocomplete="username" placeholder="${esc(L('ชื่อผู้ใช้','Username'))}" aria-label="${esc(L('ชื่อผู้ใช้','Username'))}"></div>
      <div class="rhome-field"><span aria-hidden="true">🔒</span><input id="rhomeStaffPass" type="password" autocomplete="current-password" placeholder="${esc(L('รหัสผ่าน','Password'))}" aria-label="${esc(L('รหัสผ่าน','Password'))}"></div>
      <div id="rhomeStaffError" class="rhome-login-error" role="alert"></div>
      <button type="submit" class="rhome-login-btn">${esc(L('เข้าสู่ระบบ','Sign in'))}</button>
     </form>
     <button type="button" class="rhome-login-back" id="rhomeStaffDemo">${esc(L('ผู้ใช้ทดสอบ / เลือกผู้ใช้งาน','Demo users'))}</button>
     ${currentUser?`<button type="button" class="rhome-login-back" id="rhomeStaffBackSettings">${esc(L('‹ กลับไปหน้าตั้งค่า','‹ Back to Settings'))}</button>`:''}
     <div class="rhome-login-note">${esc(L('ลูกค้า: กรุณาเปิดลิงก์จาก LINE OA ของ I-MODE หรือสแกน QR ที่ตัวเครื่อง','Customers: please open the link in the I-MODE LINE OA, or scan the QR on your machine.'))}</div>
    </div>
   </div>`;
  const form=document.getElementById('rhomeStaffLoginForm');
  if(form)form.onsubmit=submitStaffLogin;
  const demo=document.getElementById('rhomeStaffDemo');
  if(demo)demo.onclick=()=>{if(typeof openUserLoginModal==='function')openUserLoginModal()};
  /* Reached from ตั้งค่า → สำหรับเทสระบบ while signed in: this page hides the sidebar, so it
     needs its own way back. A visitor with no session never sees the button. */
  const back=document.getElementById('rhomeStaffBackSettings');
  if(back)back.onclick=()=>goPage('settings');
  const u=document.getElementById('rhomeStaffUser');
  if(u&&!mobileQuery.matches)setTimeout(()=>u.focus(),40);
 }

 function submitStaffLogin(e){
  e.preventDefault();
  const err=document.getElementById('rhomeStaffError');
  const btn=document.querySelector('#rhomeStaffLoginForm .rhome-login-btn');
  const u=(document.getElementById('rhomeStaffUser')||{}).value||'';
  const p=(document.getElementById('rhomeStaffPass')||{}).value||'';
  /* Refusing a customer signs the account out again, which re-renders this page, so every
     element is looked up fresh at the time the message is written, never captured. */
  const fail=msg=>{
   const box=document.getElementById('rhomeStaffError');
   if(box){box.textContent=msg;box.classList.add('show')}
   const pw=document.getElementById('rhomeStaffPass');
   if(pw){pw.value='';pw.focus()}
   const b=document.querySelector('#rhomeStaffLoginForm .rhome-login-btn');
   if(b)b.disabled=false;
  };
  if(err){err.textContent='';err.classList.remove('show')}
  if(typeof window.imodeSignIn!=='function'){
   fail(L('ระบบเข้าสู่ระบบยังไม่พร้อม','The login service is unavailable'));
   return Promise.resolve();
  }
  if(btn)btn.disabled=true;
  return window.imodeSignIn(u,p,{noRoute:true}).then(res=>{
   if(btn)btn.disabled=false;
   if(!res||!res.ok){
    fail((res&&res.message)||L('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','Incorrect username or password'));
    return;
   }
   const acc=res.session&&res.session.user;
   if(acc&&acc.accountType==='customer'){
    const out=typeof window.imodeSignOut==='function'?window.imodeSignOut():Promise.resolve();
    return out.then(()=>fail(L('บัญชีลูกค้าเข้าสู่ระบบที่หน้านี้ไม่ได้ กรุณาเปิดลิงก์จาก LINE OA',
                              'Customer accounts cannot sign in here. Please use the link in the LINE OA.')));
   }
   toastMsg(L('เข้าสู่ระบบ: ','Signed in: ')+(currentUser&&currentUser.name||''));
   if(typeof window.imodeRoleHomeAfterLogin==='function'&&window.imodeRoleHomeAfterLogin(acc))return;
   goPage('home');
  }).catch(()=>fail(L('เกิดข้อผิดพลาด กรุณาลองใหม่','Something went wrong. Please try again.')));
 }

 function submitCustomerLogin(e){
  e.preventDefault();
  const err=document.getElementById('rhomeCustomerError');
  const btn=document.querySelector('#rhomeCustomerLoginForm .rhome-login-btn');
  const u=(document.getElementById('rhomeCustomerUser')||{}).value||'';
  const p=(document.getElementById('rhomeCustomerPass')||{}).value||'';
  const fail=msg=>{
   if(err){err.textContent=msg;err.classList.add('show')}
   const pw=document.getElementById('rhomeCustomerPass');
   if(pw){pw.value='';pw.focus()}
   if(btn)btn.disabled=false;
  };
  if(err){err.textContent='';err.classList.remove('show')}
  if(typeof window.imodeSignIn!=='function'){
   fail(L('ระบบเข้าสู่ระบบยังไม่พร้อม','The login service is unavailable'));
   return Promise.resolve();
  }
  if(btn)btn.disabled=true;
  return window.imodeSignIn(u,p,{expect:'customer'}).then(res=>{
   if(btn)btn.disabled=false;
   if(!res||!res.ok){
    fail((res&&res.message)||L('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','Incorrect username or password'));
    return;
   }
   toastMsg(L('เข้าสู่ระบบลูกค้า: ','Signed in: ')+(currentUser&&currentUser.name||''));
  }).catch(()=>fail(L('เกิดข้อผิดพลาด กรุณาลองใหม่','Something went wrong. Please try again.')));
 }

 /* ---------- page shells ---------- */
 function ensurePages(){
  const main=document.querySelector('main.main');
  if(!main)return;
  [['home','rhome-page'],['staff-login','rhome-page'],['customer-home','rhome-page'],['customer-login','rhome-page']].forEach(([name,cls])=>{
   if(document.getElementById('page-'+name))return;
   const s=document.createElement('section');
   s.className='page '+cls;
   s.id='page-'+name;
   main.appendChild(s);
  });
  ['th','en'].forEach(lang=>{
   const info=PAGE_INFO&&PAGE_INFO[lang];
   if(!info)return;
   info.home=lang==='en'?['Home','Choose a module']:['หน้าแรก','เลือกโมดูลที่ต้องการ'];
   info['customer-home']=lang==='en'?['Customer Home','I-MODE Plus Service']:['หน้าแรกลูกค้า','I-MODE Plus Service'];
   info['customer-login']=lang==='en'?['Customer Login','Sign in']:['เข้าสู่ระบบลูกค้า','เข้าสู่ระบบ'];
   info['staff-login']=lang==='en'?['Staff Login','Admin and technician']:['เข้าสู่ระบบพนักงาน','แอดมินและช่างบริการ'];
  });
 }
 const HOME_PAGES=['home','staff-login','customer-home','customer-login'];
 function syncChrome(){
  const active=(document.querySelector('.page.active')||{}).id||'';
  const name=active.replace('page-','');
  document.body.classList.toggle('rhome-mode',HOME_PAGES.indexOf(name)>=0);
  const btn=document.getElementById('rhomeHomeBtn');
  if(btn)btn.hidden=!staffLoggedIn();
  return name;
 }

 /* ---------- navigation ---------- */
 /* renderFieldService() falls back to technicians[0] when the select is untouched, so a
    technician account must be pointed at its own queue whichever entry point opened the page. */
 function pointFieldServiceAtSelf(){
  const tid=currentUser&&currentUser.technicianId;
  if(!tid)return;
  const sel=document.getElementById('fieldTechSelect');
  if(sel&&Array.prototype.some.call(sel.options,o=>o.value===tid))sel.value=tid;
  fieldTechId=tid;
 }
 const baseGoPage=window.goPage;
 window.goPage=function(name){
  if(HOME_PAGES.indexOf(name)>=0&&!document.getElementById('page-'+name))ensurePages();
  if(name==='field-service')pointFieldServiceAtSelf();
  const r=baseGoPage.apply(this,arguments);
  const active=syncChrome();
  if(active==='home')renderRoleHome();
  else if(active==='staff-login')renderStaffLogin();
  else if(active==='customer-home')renderCustomerHome();
  else if(active==='customer-login')renderCustomerLogin();
  return r;
 };

 /* Post-login destination for staff. Customers are handled by the accounts script. */
 window.imodeRoleHomeAfterLogin=function(){
  if(!staffLoggedIn())return false;
  goPage('home');
  return true;
 };
 /* The legacy demo picker and the manual-name form land on the Home Page too. */
 ['chooseUser','saveManualUser'].forEach(fn=>{
  const base=window[fn];
  if(typeof base!=='function')return;
  window[fn]=function(){
   const r=base.apply(this,arguments);
   if(staffLoggedIn())goPage('home');
   return r;
  };
 });

 /* QR entry: a machine token opens the Customer Home instead of the portal. */
 const basePortalInit=window.initPortalFromUrl;
 window.initPortalFromUrl=async function(){
  const token=new URLSearchParams(location.search).get('machineToken');
  if(token&&!isCustomerSession()){
   portalMachineToken=token;
   entryMode='customer-qr';
   ensurePages();
   goPage('customer-home');
   return;
  }
  return basePortalInit.apply(this,arguments);
 };

 /* ---------- topbar Home button ---------- */
 function ensureHomeButton(){
  if(document.getElementById('rhomeHomeBtn'))return;
  const actions=document.querySelector('.v68-topbar-actions');
  if(!actions)return;
  const btn=document.createElement('button');
  btn.id='rhomeHomeBtn';
  btn.type='button';
  btn.className='icon-btn rhome-home-btn';
  btn.textContent='⌂';
  btn.title=L('หน้าแรก','Home');
  btn.setAttribute('aria-label',L('หน้าแรก','Home'));
  btn.onclick=()=>goPage('home');
  const bell=actions.querySelector('.v68-bell-btn');
  actions.insertBefore(btn,bell||actions.lastChild);
 }

 const style=document.createElement('style');
 style.id='v68RoleHomeStyle';
 style.textContent=`
 body.rhome-mode .sidebar,body.rhome-mode .topbar,body.rhome-mode .bottom-nav,body.rhome-mode .v68-global-hero{display:none!important}
 body.rhome-mode::before{display:none!important;content:none!important}
 body.rhome-mode .app-shell{display:block}
 body.rhome-mode .main{padding:0;display:block}
 body.rhome-mode{background:linear-gradient(160deg,#eef4ff 0%,#f8fbff 46%,#ffffff 100%)}
 .rhome-page{padding:0}
 .rhome-brand{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-bottom:1px solid #dfe9f8;background:linear-gradient(180deg,#ffffff,#f4f8ff)}
 .rhome-brand-mark{flex:none;height:48px;width:auto;max-width:none;object-fit:contain;display:block}
 .rhome-lang{border:1px solid #d3e0f4;background:#fff;color:#123a80;border-radius:999px;padding:5px 13px;font-size:12px;cursor:pointer}
 .rhome-lang b{color:#0b63e5}
 .rhome-body{max-width:1180px;margin:0 auto;padding:20px 18px 40px}
 .rhome-head{text-align:center;margin-bottom:6px}
 .rhome-head h2{margin:0;color:#0c225e;font-size:26px}
 .rhome-head p{margin:5px 0 0;color:#5b6b88;font-size:13px}
 .rhome-head-en{font-size:12px!important;color:#8a97ad!important}
 .rhome-hint{text-align:center;color:#5b6b88;font-size:12.5px;margin:2px 0 0}
 .rhome-empty{text-align:center;color:#b32020;font-size:13px}
 .rhome-qr-card{display:flex;align-items:center;gap:12px;max-width:430px;margin:14px auto 0;padding:11px 15px;border:1px solid #d3e0f4;border-radius:14px;background:#fff;box-shadow:0 8px 20px rgba(18,58,128,.07)}
 .rhome-qr-card.is-warn{border-color:#f4d7a8;background:#fffaf0}
 .rhome-qr-icon{font-size:26px;color:#0b63e5}
 .rhome-qr-card .machine-thumb{flex:none;width:82px;height:64px;border-radius:12px}
 .rhome-qr-card .machine-thumb-placeholder{flex:none;width:82px;height:64px;font-size:10px}
 .rhome-qr-card .machine-reference-badge{font-size:7px;padding:2px 5px;right:3px;bottom:3px}
 .rhome-qr-card b{display:block;color:#0c225e;font-size:13px}
 .rhome-qr-card small{display:block;color:#5b6b88;font-size:11.5px}

 .rhome-stage{position:relative;width:100%;max-width:960px;margin:6px auto 0;aspect-ratio:var(--rhome-w)/var(--rhome-h)}
 .rhome-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
 .rhome-link{stroke:#9dc2f2;stroke-width:1.6;opacity:.85;transition:opacity .45s ease}
 .rhome-link-dot{fill:#bcd7f7;transition:opacity .45s ease}
 .rhome-stage.is-merging .rhome-link,.rhome-stage.is-merging .rhome-link-dot{opacity:0}
 .rhome-center{position:absolute;transform:translate(-50%,-50%);width:min(230px,25%);aspect-ratio:1;border-radius:50%;border:none;cursor:pointer;padding:0;
   background:radial-gradient(circle at 34% 28%,#4d9bff 0%,#1266e8 46%,#0a3f9e 100%);
   box-shadow:0 18px 40px rgba(11,99,229,.34),0 0 0 10px rgba(77,155,255,.12),inset 0 -8px 18px rgba(4,30,80,.35);
   color:#fff;display:grid;place-items:center;transition:transform .5s cubic-bezier(.2,.7,.3,1),box-shadow .45s ease}
 .rhome-center:hover{transform:translate(-50%,-50%) scale(1.035)}
 .rhome-center:focus-visible{outline:3px solid #ff8a3c;outline-offset:4px}
 .rhome-center-inner{display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.06;padding:0 6px}
 .rhome-center-logo{width:min(66%,158px);height:auto;max-width:none;object-fit:contain;display:block;filter:drop-shadow(0 2px 7px rgba(2,18,54,.4))}
 .rhome-center-title{font-size:clamp(16px,2.3vw,28px);font-weight:800;letter-spacing:.2px}
 .rhome-center-sub{font-size:clamp(7px,.85vw,10px);opacity:.85;margin-top:4px;text-align:center;padding:0 8px}
 .rhome-center-badge{margin-top:6px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:2px 10px;font-size:clamp(8px,.9vw,11px);font-weight:700}
 .rhome-stage.is-merged .rhome-center{box-shadow:0 18px 44px rgba(7,148,85,.4),0 0 0 16px rgba(7,148,85,.14);background:radial-gradient(circle at 34% 28%,#4fd39a 0%,#0aa06a 48%,#06774f 100%);animation:rhomePulse .55s ease}
 @keyframes rhomePulse{0%{transform:translate(-50%,-50%) scale(.9)}55%{transform:translate(-50%,-50%) scale(1.09)}100%{transform:translate(-50%,-50%) scale(1)}}

 .rhome-node{position:absolute;transform:translate(-50%,-50%);width:clamp(52px,7.4%,86px);aspect-ratio:1;border-radius:50%;cursor:pointer;padding:0;
   border:1px solid #d7e6fb;background:linear-gradient(180deg,#ffffff,#eef5ff);
   box-shadow:0 10px 22px rgba(18,58,128,.14);display:grid;place-items:center;
   transition:transform .5s cubic-bezier(.2,.7,.3,1),box-shadow .4s ease,border-color .4s ease}
 .rhome-node:not(.is-journey):hover{box-shadow:0 16px 30px rgba(18,58,128,.22);transform:translate(-50%,-50%) scale(1.05)}
 .rhome-node.is-journey{cursor:default}
 .rhome-node.is-journey:hover{box-shadow:0 14px 26px rgba(18,58,128,.18);border-color:#a9cdf7}
 .rhome-node:focus-visible{outline:3px solid #ff8a3c;outline-offset:3px}
 .rhome-node-icon{font-size:clamp(17px,2.1vw,27px);line-height:1}
 .rhome-node-label{position:absolute;top:104%;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:clamp(9px,1vw,11.5px);color:#31456b;font-weight:600;pointer-events:none;text-shadow:0 1px 0 #fff}
 @keyframes rhomeFlowIn{
  0%{transform:translate(-50%,-50%) scale(1);opacity:1}
  10%{transform:translate(calc(-50% - var(--rhome-dx) * .05),calc(-50% - var(--rhome-dy) * .05)) scale(1.04);opacity:1}
  55%{transform:translate(calc(-50% + var(--rhome-dx) * .46),calc(-50% + var(--rhome-dy) * .46)) scale(.66);opacity:1}
  80%{opacity:.92}
  100%{transform:translate(calc(-50% + var(--rhome-dx)),calc(-50% + var(--rhome-dy))) scale(.12);opacity:0}
 }
 .rhome-node.is-merging{animation:rhomeFlowIn 900ms cubic-bezier(.4,.05,.3,1) forwards;z-index:2}
 .rhome-node.is-merging .rhome-node-label{opacity:0;transition:opacity .18s ease}
 .rhome-stage.is-reduced .rhome-node{opacity:0;transition:opacity .2s ease}

 /* Staff Home: bloom-out intro + module launch. */
 @keyframes rhomeBloomOut{
  0%{transform:translate(calc(-50% + var(--rhome-dx)),calc(-50% + var(--rhome-dy))) scale(.14);opacity:0}
  38%{opacity:1}
  72%{transform:translate(calc(-50% + var(--rhome-dx) * .06),calc(-50% + var(--rhome-dy) * .06)) scale(1.07);opacity:1}
  100%{transform:translate(-50%,-50%) scale(1);opacity:1}
 }
 @keyframes rhomeCenterIn{
  0%{transform:translate(-50%,-50%) scale(.72);opacity:0}
  60%{transform:translate(-50%,-50%) scale(1.05);opacity:1}
  100%{transform:translate(-50%,-50%) scale(1);opacity:1}
 }
 @keyframes rhomeStaffFade{from{opacity:0}to{opacity:1}}
 @keyframes rhomeLaunch{
  0%{transform:translate(-50%,-50%) scale(1);opacity:1}
  55%{transform:translate(-50%,-50%) scale(1.32);opacity:1;box-shadow:0 20px 40px rgba(11,99,229,.34)}
  100%{transform:translate(-50%,-50%) scale(1.9);opacity:0}
 }
 .rhome-stage.is-launching .rhome-node:not(.is-launch):not(.is-slam),
 .rhome-stage.is-launching .rhome-center:not(.is-launch):not(.is-hit),
 .rhome-stage.is-launching .rhome-links{opacity:.12;transition:opacity .28s ease}
 .rhome-node.is-launch,.rhome-center.is-launch{animation:rhomeLaunch 340ms cubic-bezier(.35,.1,.3,1) forwards;z-index:3}
 .rhome-node.is-launch .rhome-node-label{opacity:0;transition:opacity .16s ease}

 /* Pick a module and its circle slams into the centre. A short pull back the other way
    first, so the strike reads as deliberate rather than as a slide. */
 @keyframes rhomeSlamIn{
  0%{transform:translate(-50%,-50%) scale(1)}
  16%{transform:translate(calc(-50% - var(--rhome-dx) * .09),calc(-50% - var(--rhome-dy) * .09)) scale(1.06)}
  54%{transform:translate(calc(-50% + var(--rhome-dx) * .96),calc(-50% + var(--rhome-dy) * .96)) scale(1.24)}
  64%{transform:translate(calc(-50% + var(--rhome-dx)),calc(-50% + var(--rhome-dy))) scale(calc(var(--rhome-grow, 3) * .82))}
  82%{transform:translate(calc(-50% + var(--rhome-dx)),calc(-50% + var(--rhome-dy))) scale(calc(var(--rhome-grow, 3) * 1.05))}
  100%{transform:translate(calc(-50% + var(--rhome-dx)),calc(-50% + var(--rhome-dy))) scale(var(--rhome-grow, 3));opacity:1}
 }
 .rhome-node.is-slam{animation:rhomeSlamIn 560ms cubic-bezier(.5,-.14,.3,1) forwards;z-index:4;
   box-shadow:0 18px 34px rgba(11,99,229,.32);border-color:#8fbdf6}
 /* The icon rides the same transform, so it would balloon with the circle. */
 .rhome-node.is-slam .rhome-node-icon{transform:scale(calc(1 / var(--rhome-grow, 3) * 1.7));transition:transform .34s ease .12s}
 .rhome-node.is-slam .rhome-node-label{opacity:0;transition:opacity .14s ease}
 @keyframes rhomeHit{
  0%{transform:translate(-50%,-50%) scale(1)}
  22%{transform:translate(-50%,-50%) scale(1.13);box-shadow:0 20px 46px rgba(11,99,229,.42),0 0 0 18px rgba(11,99,229,.16)}
  58%{transform:translate(-50%,-50%) scale(.97)}
  100%{transform:translate(-50%,-50%) scale(1.03)}
 }
 .rhome-center.is-hit{animation:rhomeHit 300ms cubic-bezier(.3,.9,.35,1) forwards;z-index:3}

 /* ---------- Card Home (replaces the circle stage for staff) ---------- */
 .rhome-cardhome{max-width:920px}
 .rhome-profile{display:flex;gap:16px;align-items:stretch;background:#fff;border:1px solid #dfe9f8;border-radius:18px;padding:16px;box-shadow:0 14px 34px rgba(18,58,128,.09);width:100%;text-align:inherit;font:inherit;cursor:pointer;position:relative;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
 .rhome-profile:hover{transform:translateY(-2px);border-color:#b9d2f4;box-shadow:0 18px 40px rgba(18,58,128,.14)}
 .rhome-profile:active{transform:translateY(0)}
 .rhome-profile:focus-visible{outline:3px solid #0b63e5;outline-offset:3px}
 .rhome-profile-go{align-self:center;flex:none;font-size:12px;font-weight:800;color:#0b63e5;background:#eef4ff;border:1px solid #dce8fa;border-radius:999px;padding:6px 12px;white-space:nowrap}
 @media (prefers-reduced-motion:reduce){.rhome-profile{transition:none}.rhome-profile:hover{transform:none}}
 .rhome-avatar{flex:none;width:118px;height:118px;border-radius:14px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(160deg,#0b63e5,#073763);color:#fff;font-size:38px;font-weight:800;letter-spacing:1px}
 .rhome-avatar img{width:100%;height:100%;object-fit:cover;display:block}
 .rhome-profile-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:9px}
 .rhome-profile-body h2{margin:0;font-size:19px;color:#0c225e;line-height:1.25;overflow-wrap:anywhere}
 .rhome-profile-role{margin:0;font-size:13px;font-weight:700;color:#0b63e5;background:#eef4ff;border:1px solid #dce8fa;border-radius:999px;padding:5px 13px;align-self:flex-start;overflow-wrap:anywhere}

 .rhome-quickhead{display:flex;align-items:baseline;gap:10px;margin:20px 2px 0;flex-wrap:wrap}
 .rhome-quickhead b{font-size:15px;color:#0c225e}
 .rhome-quickhead small{font-size:11.5px;color:#8a97ad}
 .rhome-more-btn{display:block;width:100%;margin-top:14px;padding:11px;border-radius:12px;cursor:pointer;
   border:1px dashed #c3d7f4;background:#fff;color:#123a80;font-size:13px;font-weight:700}
 .rhome-more-btn:hover{background:#f4f8ff;border-color:#8fbdf6}
 .rhome-more-btn:focus-visible{outline:3px solid #ff8a3c;outline-offset:2px}
 .rhome-modgrid-rest{margin-top:12px}
 .rhome-modgrid{margin-top:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
 .rhome-modgrid[hidden]{display:none}

 .rhome-modcard{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;min-height:104px;padding:16px;cursor:pointer;text-align:left;
   border:1px solid #dbe7fa;border-radius:18px;background:linear-gradient(180deg,#ffffff,#f2f7ff);
   box-shadow:0 10px 22px rgba(18,58,128,.10);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
 .rhome-modcard:hover{transform:translateY(-2px);box-shadow:0 16px 30px rgba(18,58,128,.16);border-color:#a9cdf7}
 .rhome-modcard:active{transform:translateY(0)}
 .rhome-modcard:focus-visible{outline:3px solid #ff8a3c;outline-offset:3px}
 .rhome-modcard-icon{font-size:26px;line-height:1}
 .rhome-modcard-label{font-size:14.5px;font-weight:700;color:#0c225e;line-height:1.3}

 @keyframes rhomeCardRise{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
 @keyframes rhomeCardDrop{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
 @keyframes rhomeCardLaunch{0%{transform:none}45%{transform:scale(1.05)}100%{transform:scale(.96);opacity:.35}}
 .rhome-modgrid.is-launching .rhome-modcard:not(.is-launch){opacity:.25;transition:opacity .24s ease}
 .rhome-modcard.is-launch{animation:rhomeCardLaunch 300ms cubic-bezier(.35,.1,.3,1) forwards;border-color:#0b63e5;box-shadow:0 18px 34px rgba(11,99,229,.3)}

 @media (min-width:900px){
  .rhome-modgrid{grid-template-columns:repeat(3,1fr)}
 }
 @media (max-width:640px){
  /* The photo stays beside the details, never above them. */
  .rhome-profile{gap:10px;padding:13px}
  .rhome-profile-go{font-size:0;padding:6px 9px}
  .rhome-profile-go::after{content:'›';font-size:18px;line-height:1}
  .rhome-avatar{width:78px;height:78px;font-size:26px;border-radius:12px}
  .rhome-profile-body h2{font-size:16px}
  .rhome-profile-role{font-size:12px;padding:4px 11px}
  .rhome-modgrid{gap:11px}
  .rhome-modcard{min-height:92px;padding:13px}
  .rhome-modcard-label{font-size:13px}
 }

 .rhome-gate{max-width:420px;margin:42px auto;text-align:center;background:#fff;border:1px solid #dfe9f8;border-radius:18px;padding:30px 24px;box-shadow:0 14px 34px rgba(18,58,128,.1)}
 .rhome-gate-icon{font-size:38px}
 .rhome-gate h2{margin:8px 0 4px;color:#0c225e;font-size:20px}
 .rhome-gate p{margin:0 0 16px;color:#5b6b88;font-size:13px}

 .rhome-login-body{display:grid;place-items:center;min-height:min(72vh,620px)}
 .rhome-login-card{width:min(420px,100%);background:#fff;border:1px solid #dfe9f8;border-radius:20px;padding:26px 24px;box-shadow:0 18px 44px rgba(18,58,128,.13);text-align:center}
 .rhome-login-card h2{margin:0;color:#0c225e;font-size:23px}
 .rhome-login-card>p{margin:5px 0 16px;color:#5b6b88;font-size:12.5px}
 .rhome-login-machine{margin:0 0 14px;padding:7px 11px;border-radius:10px;background:#f1f6ff;color:#123a80;font-size:12px}
 .rhome-field{display:flex;align-items:center;gap:9px;border:1px solid #d7e2f3;border-radius:11px;padding:0 12px;margin-bottom:10px;background:#fbfdff}
 .rhome-field span{color:#7d8ba5;font-size:14px}
 .rhome-field input{flex:1;border:none;background:transparent;padding:12px 0;font-size:13.5px;outline:none;min-width:0}
 .rhome-field:focus-within{border-color:#0b63e5;box-shadow:0 0 0 3px rgba(11,99,229,.12)}
 .rhome-login-error{display:none;margin:0 0 10px;padding:8px 10px;border-radius:9px;background:#fdecec;color:#b32020;font-size:12px;text-align:left}
 .rhome-login-error.show{display:block}
 .rhome-login-btn{width:100%;border:none;border-radius:11px;padding:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(180deg,#2b7cf0,#0b56cc);box-shadow:0 8px 18px rgba(11,86,204,.28)}
 .rhome-login-btn:hover{filter:brightness(1.06)}
 .rhome-login-or{margin:12px 0 10px;color:#8a97ad;font-size:11.5px}
 .rhome-login-line{width:100%;border:none;border-radius:11px;padding:11px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(180deg,#3fce5a,#18b13a)}
 .rhome-login-back{margin-top:15px;border:none;background:none;color:#5b6b88;font-size:12.5px;cursor:pointer}
 .rhome-login-note{margin-top:14px;padding-top:13px;border-top:1px solid #eaf1fb;color:#8a97ad;font-size:11.5px;line-height:1.5}
 .rhome-login-back:hover{color:#0b63e5}
 .rhome-home-btn{font-size:17px;line-height:1}

 @media (max-width:900px){
  .rhome-body{padding:16px 12px 34px}
  .rhome-head h2{font-size:22px}
  .rhome-center{width:min(200px,28%)}
 }
 @media (max-width:640px){
  .rhome-brand{padding:11px 14px}
  .rhome-brand-mark{height:36px}
  .rhome-head h2{font-size:19px}
  .rhome-stage{max-width:520px}
  .rhome-center{width:min(168px,34%)}
  .rhome-node{width:clamp(48px,13.5%,62px)}
  .rhome-node-label{font-size:9.5px;max-width:74px;white-space:normal;text-align:center;line-height:1.15}
 }
 @media (prefers-reduced-motion:reduce){
  .rhome-node,.rhome-center{transition:opacity .2s ease}
  .rhome-stage.is-merged .rhome-center{animation:none}
 }
 `;
 document.head.appendChild(style);

 function install(){
  ensurePages();
  ensureHomeButton();
  syncChrome();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
 mobileQuery.addEventListener('change',()=>{
  const name=(document.querySelector('.page.active')||{}).id||'';
  if(name==='page-home')renderRoleHome();
  else if(name==='page-customer-home')renderCustomerHome();
 });
})();
