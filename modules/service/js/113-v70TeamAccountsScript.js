/* Beta 1.0 — 2026-09-24: every login account is listed on ทีมงาน.

   REPORTED: "ตรงบัญชีผู้ใช้อะ อยากให้บัญชีทุกบัญชีขึ้นที่ทีมงานครับ".

   The page showed TECHNICIAN RECORDS, which is a different set from ACCOUNTS. Of the nine on
   the roster only four hold a technician record — lead_technician (T-LEAD-TECH), lead_rd
   (T-LEAD-RD), tech_demo1 and tech_demo2 — so ceo_demo, manager_demo, dev_demo, sales_demo and admin appeared
   nowhere on it, and there was no screen outside Settings that answered "who can sign in".

   WHAT IS DELIBERATELY NOT DONE: no technician record is created for the five. A technician
   record is what cases, field logs, service reports and QC are attributed BY (CLAUDE.md, and
   js/107 says the same), and it also feeds the Field Service picker, the calendar rows, the
   assignment lists and every team headcount. Giving the CEO one so that a card appears would
   put him in the queue to be assigned jobs. So the accounts are listed as accounts, in their
   own block, and `technicians` is not touched.

   The block is read only except for one button, which opens the account screen that already
   exists (openAccountAdminModal, the Settings → การจัดการบัญชีผู้ใช้ card) rather than a second
   copy of the form.

   2026-09-28 — "ไอช่างในทะเบียนเอาออก หน้าทีมงานเราจะโชว์ว่า Account ไหนอยู่ Role อะไรมีหน้าที่อะไร
   ... เราเซ็ทเป็น Account ดีกว่า". The owner chose (asked, all four answers on record):
   * who is a technician is decided by the ROLE (imodeIsTechRole below). The technician record
     still exists — cases, field logs and reports are attributed by its id — but it is made
     and kept in step by the account screens (js/39 test site, js/124 production), never by hand;
   * the register (#technicianGrid, its summary and "＋ เพิ่มพนักงาน Service") is hidden;
   * a technician's calendar colour and phone are edited from the account card;
   * "หน้าที่" is the menu the role can open, computed from its permissions;
   * the photo is changed by tapping the avatar (users.manage, or your own). */
(function(){
 'use strict';

 function isTechRole(role){
  var r=String(role||'').trim();
  return /^technician\b/i.test(r)||/^r&d$/i.test(r)||/\blead$/i.test(r);
 }
 window.imodeIsTechRole=isTechRole;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){
  if(typeof window.esc==='function')return window.esc(v);
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/"/g,'&quot;');
 }
 function accounts(){
  /* js/39's merged view: the built-ins from js/09, the created ones in settings.uatAccounts,
     and the edits and tombstones in settings.uatAccountEdits. uatAuth.allAccounts() is the
     fallback for a build without js/39. */
  try{
   if(typeof window.imodeAccountList==='function')return window.imodeAccountList()||[];
  }catch(e){}
  try{
   if(window.uatAuth&&typeof window.uatAuth.allAccounts==='function')
    return window.uatAuth.allAccounts()||[];
  }catch(e){}
  return [];
 }
 function techById2(id){
  if(!id)return null;
  try{
   return (Array.isArray(technicians)?technicians:[])
    .filter(function(t){return t&&t.id===id})[0]||null;
  }catch(e){return null}
 }
 function may(key){
  try{return typeof canPermission==='function'?!!canPermission(key):false}catch(e){return false}
 }
 function initials(name){
  var n=String(name||'').trim();
  if(!n)return '?';
  var p=n.split(/\s+/);
  return (p.length>1?(p[0][0]+p[1][0]):n.slice(0,2)).toUpperCase();
 }
 function meName(){try{return String((currentUser&&currentUser.username)||'').toLowerCase()}catch(e){return ''}}
 /* Who manages accounts: Dev and Service Manager, on both sites (owner, 2026-09-28) — the same
    rule as the account screen, asked of js/124 so there is one answer. A person may still
    change their own photo, colour and phone. */
 function manageAcc(){
  try{if(typeof window.imodeCanManageAccounts==='function')return !!window.imodeCanManageAccounts()}catch(e){}
  return may('users.manage');
 }
 function mayEdit(a){return manageAcc()||(!!meName()&&meName()===String(a.username||'').toLowerCase())}

 /* "หน้าที่": the pages this role can open, in sidebar order, labelled as the sidebar labels
    them. Individual overrides (settings.userPermissions) are not shown; this is the role. */
 function duties(role){
  var perms=[];
  try{
   var r=(settings.roles||[]).filter(function(x){return x&&x.name===role})[0];
   perms=(r&&Array.isArray(r.permissions))?r.permissions:[];
  }catch(e){}
  var map={};try{map=PAGE_PERMISSION||{}}catch(e){}
  var seen={},out=[];
  [].forEach.call(document.querySelectorAll('.side-nav [data-page]'),function(el){
   var pg=el.getAttribute('data-page');
   if(!pg||seen[pg]||!map[pg]||perms.indexOf(map[pg])<0)return;
   seen[pg]=1;
   var lb=el.querySelector('b');
   var t=String((lb||el).textContent||'').replace(/\d+\s*$/,'').trim();
   if(t)out.push(t);
  });
  return out;
 }
 function dutyHTML(role){
  var d=duties(role);if(!d.length)return '';
  var MAX=8,more=d.length>MAX?'<span>+'+(d.length-MAX)+'</span>':'';
  return '<div class="tacc-duty"><em>'+esc2(tl('หน้าที่','Duties'))+'</em>'
   +d.slice(0,MAX).map(function(x){return '<span>'+esc2(x)+'</span>'}).join('')+more+'</div>';
 }
 function techColor(t){
  try{if(typeof window.imodeTechColorHex==='function')return window.imodeTechColorHex(t.color)}catch(e){}
  return '#0b63e5';
 }
 function techCaseCount(tid){
  try{
   return (cases||[]).filter(function(c){
    if(!c||c.status==='ปิดเคส')return false;
    return typeof caseHasTech==='function'?caseHasTech(c,tid):c.assignee===tid;
   }).length;
  }catch(e){return 0}
 }

 /* ---------------------------------------------------------- photo, colour, phone -- */
 /* Downscaled to 256px JPEG: the photo travels with the account (settings on the test site,
    profiles.photo_url on the server, capped at 400 KB there). */
 function pickPhoto(done){
  var inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.onchange=function(){
   var f=inp.files&&inp.files[0];if(!f)return;
   var rd=new FileReader();
   rd.onload=function(){
    var img=new Image();
    img.onload=function(){
     var S=256,w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,S/Math.max(w,h));
     var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
     c.getContext('2d').drawImage(img,0,0,c.width,c.height);
     done(c.toDataURL('image/jpeg',.85));
    };
    img.src=rd.result;
   };
   rd.readAsDataURL(f);
  };
  inp.click();
 }
 function savePhoto(a,photo){
  if(typeof window.imodeAccountSave!=='function')return;
  /* js/39 rebuilds the whole account from what it is given, so the account goes with it;
     js/124 only reads .photo. */
  var res=window.imodeAccountSave(a.username,{
   username:a.username,name:a.name,role:a.role,team:a.team,
   accountType:a.technicianId?'technician':'staff',technicianId:a.technicianId||'',photo:photo});
  if(res&&res.ok===false){if(typeof toastMsg==='function')toastMsg(res.message||'บันทึกรูปไม่สำเร็จ');return}
  if(typeof toastMsg==='function')toastMsg(tl('เปลี่ยนรูปโปรไฟล์แล้ว','Photo updated'));
  setTimeout(function(){try{render()}catch(e){}},400);
 }
 window.imodePickAccountPhoto=function(done){pickPhoto(done)};
 function openTechEdit(a){
  var t=techById2(a.technicianId);if(!t||typeof openModal!=='function')return;
  var w=typeof window.imodeTechColorWidget==='function'?window.imodeTechColorWidget(t.color||'blue')
   :'<input type="hidden" id="tColor" value="'+esc2(t.color||'blue')+'">';
  openModal(tl('สีปฏิทินและเบอร์โทร','Calendar colour and phone'),a.name||a.username,
   '<form id="taccTechForm" class="form-grid" data-tid="'+esc2(t.id)+'">'
   +'<div class="field"><label>'+esc2(tl('เบอร์โทร','Phone'))+'</label>'
   +'<input id="taccPhone" type="tel" value="'+esc2(t.phone||'')+'"></div>'
   +'<div class="field"><label>'+esc2(tl('สีในปฏิทิน','Calendar colour'))+'</label>'+w+'</div>'
   +'<div style="display:flex;gap:8px;margin-top:6px"><button type="submit" class="primary-btn">💾 '
   +esc2(tl('บันทึก','Save'))+'</button></div></form>');
  try{if(typeof window.imodeTechColorPaint==='function')window.imodeTechColorPaint()}catch(e){}
 }
 function wireModal(){
  var b=document.getElementById('modalBody');
  if(!b||b.__taccTech)return;
  b.__taccTech=true;
  /* js/05 stops propagation at #modalPanel, so this listens on #modalBody itself. */
  b.addEventListener('submit',function(e){
   var f=e.target;if(!f||f.id!=='taccTechForm')return;
   e.preventDefault();
   var t=techById2(f.getAttribute('data-tid'));if(!t)return;
   var col=document.getElementById('tColor');
   t.phone=String((document.getElementById('taccPhone')||{}).value||'').trim();
   if(col&&col.value)t.color=col.value;
   try{saveLocal()}catch(x){}
   try{if(typeof cloudUpsert==='function')cloudUpsert('technicians',t)}catch(x){}
   if(typeof closeModal==='function')closeModal();
   try{if(typeof renderAll==='function')renderAll()}catch(x){}
   if(typeof toastMsg==='function')toastMsg(tl('บันทึกแล้ว','Saved'));
  });
 }
 var lastList=[];
 document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest?e.target:null;if(!t||!t.closest('#imodeTeamAccounts'))return;
  var el,a;
  if((el=t.closest('[data-tacc-photo]'))){
   a=lastList[+el.getAttribute('data-tacc-photo')];if(!a||!mayEdit(a))return;
   pickPhoto(function(ph){savePhoto(a,ph)});return;
  }
  if((el=t.closest('[data-tacc-techedit]'))){
   a=lastList[+el.getAttribute('data-tacc-techedit')];if(a){wireModal();openTechEdit(a)}return;
  }
  if((el=t.closest('[data-tacc-jobs]'))){
   if(typeof window.imodeTechCases==='function')window.imodeTechCases(el.getAttribute('data-tacc-jobs'));
  }
 });

 /* ------------------------------------------------------------------ the styles ---- */
 /* Runtime <style>, because css/21 and css/23 have to stay the last two <link> tags. */
 function style(){
  if(document.getElementById('imodeTeamAccStyle'))return;
  var s=document.createElement('style');
  s.id='imodeTeamAccStyle';
  s.textContent=[
   '.tacc-block{margin-top:18px;border-top:1px solid var(--line,#e4e9f2);padding-top:14px}',
   '.tacc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;'
    +'flex-wrap:wrap;margin-bottom:4px}',
   '.tacc-head h4{margin:0;font-size:14px;color:#173f8a}',
   '.tacc-head p{margin:2px 0 0;font-size:11px;color:#6b7d9e}',
   '.tacc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));'
    +'gap:10px;margin-top:11px}',
   '.tacc-card{display:flex;gap:11px;align-items:flex-start;border:1px solid var(--line,#e4e9f2);'
    +'border-radius:15px;background:#fff;padding:12px;min-width:0}',
   '.tacc-av{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:flex;'
    +'align-items:center;justify-content:center;font-weight:800;font-size:13px;'
    +'background:linear-gradient(135deg,#ff9d45,#ff5b18);color:#fff;overflow:hidden}',
   '.tacc-av img{width:100%;height:100%;object-fit:cover}',
   '.tacc-main{min-width:0;flex:1 1 auto}',
   '.tacc-main b{display:block;font-size:13px;color:#16223c;overflow-wrap:anywhere}',
   '.tacc-user{font-size:11px;color:#5a6b86;overflow-wrap:anywhere}',
   '.tacc-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}',
   '.tacc-chip{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:10px;'
    +'font-weight:700;background:#e8f0ff;color:#2856a8;white-space:nowrap}',
   '.tacc-chip.is-tech{background:#e4f7ee;color:#177353}',
   '.tacc-chip.is-office{background:#f1eef9;color:#5b4794}',
   '.tacc-chip.is-test{background:#fff0d6;color:#8f5800}',
   '.tacc-group{margin-top:14px}',
   '.tacc-group-head{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:#173f8a}',
   '.tacc-group-head span{padding:2px 9px;border-radius:999px;background:#e8f0ff;font-size:11px}',
   '.tacc-group-head::after{content:"";flex:1;height:1px;background:#e4e9f2}',
   '.tacc-group .tacc-grid{margin-top:8px}',
   '.tacc-block.is-top{margin:0 0 18px;border-top:0;padding:16px 17px 0}',
   '.people-grid.tacc-people{padding:0}',
   '.tacc-people .person-card h4{overflow-wrap:anywhere}',
   '@media(max-width:640px){.tacc-block.is-top{padding:12px 11px 0}}',
   '.team-badge.devteam{background:#e7f6f8;color:#0f6b78}',
   'button.tacc-av{border:0;padding:0;cursor:pointer;position:relative}',
   'button.tacc-av::after{content:"📷";position:absolute;right:-2px;bottom:-2px;font-size:10px;'
    +'background:#fff;border-radius:999px;padding:1px 2px;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
   '.tacc-duty{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}',
   '.tacc-duty span{font-size:10px;padding:2px 7px;border-radius:7px;background:#f4f6fb;color:#44546f}',
   '.tacc-duty em{font-style:normal;font-size:10px;font-weight:800;color:#6b7d9e;margin-right:2px}',
   '.tacc-tech{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#44546f}',
   '.tacc-dot{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #cfd8e6}',
   '.tacc-tech .soft-btn{padding:4px 9px;font-size:11px;min-height:0}',
   '.tacc-people{margin-top:10px}',
   '.person-card .tacc-duty{margin:10px 0 0}',
   '.tacc-colcard{border-top:5px solid var(--tacc-col)}',
   '.tacc-colbadge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#f3f6fb;font-size:11px;font-weight:700;color:#44546f}',
   '.tacc-colbadge i{width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}',
   '.tacc-hero{position:relative}',
   '.tacc-big-initials{width:100%;height:100%;min-height:120px;display:flex;align-items:center;justify-content:center;'
    +'font-size:34px;font-weight:800;color:#fff;background:linear-gradient(135deg,#ff9d45,#ff5b18);border-radius:18px}',
   '.tacc-photo-btn{position:absolute;right:6px;bottom:6px;width:32px;height:32px;border-radius:50%;border:0;'
    +'background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;font-size:15px;line-height:1}',
   '@media(max-width:640px){.tacc-grid{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(s);
 }

 /* ------------------------------------------------------------------ the block ---- */
 /* 2026-09-28 (second pass): "หน้าทีมงานผมอยากได้แบบนี้ โชว์ของแต่ละคนๆ" — every account gets the
    big person card the technician register used (same .person-card markup, so css/01's look is
    reused as it is), grouped by role. A technician's card keeps what the old one had: status,
    phone, the calendar-colour top edge, open jobs and งานหน้างาน / รายละเอียด / แก้ไข. */
 function cardHTML(a){
  var tech=techById2(a.technicianId);
  var name=a.name||a.username||'-';
  var isTech=!!(a.technicianId&&tech);
  var techRole=isTechRole(a.role);
  var test=/_test\d*$/i.test(String(a.username||''));
  var idx=lastList.length;lastList.push(a);
  var photo=a.photo||(tech&&tech.photo)||'';
  var hero='';
  try{hero=typeof techAvatarHTML==='function'?techAvatarHTML({name:name,photo:photo,color:tech&&tech.color}):''}catch(e){}
  if(!hero)hero=photo?'<img class="person-photo" src="'+esc2(photo)+'" alt="">':'<div class="tacc-big-initials">'+esc2(initials(name))+'</div>';
  var badges='';
  var tm=a.team||(tech&&tech.team)||'';
  try{if(tm)badges+=typeof teamBadge==='function'?teamBadge(tm):''}catch(e){}
  if(isTech){
   try{badges+='<span class="tech-status-dot '+(typeof techStatusClass==='function'?techStatusClass(tech.status):'')+'">'+esc2(tech.status||'พร้อมรับงาน')+'</span>'}catch(e){}
   badges+='<span class="tacc-colbadge"><i style="background:'+esc2(techColor(tech))+'"></i>'+esc2(tl('สีปฏิทิน','Calendar'))+'</span>';
  }else{
   badges+='<span class="tacc-chip is-office">'+esc2(tl('งานออฟฟิศ','Office'))+'</span>';
  }
  if(test)badges+='<span class="tacc-chip is-test">'+esc2(tl('บัญชีทดสอบ','Test account'))+'</span>';
  if(a.active===false)badges+='<span class="tacc-chip is-test">'+esc2(tl('ปิดใช้งาน','Disabled'))+'</span>';
  /* A technician role with no record behind it cannot be assigned work. Saving the account
     once from จัดการบัญชี creates the record; nothing here creates one silently. */
  if(techRole&&!isTech)badges+='<span class="tacc-chip is-test">'
   +esc2(tl('ยังไม่มีข้อมูลช่าง — บันทึกบัญชีนี้ใน จัดการบัญชี อีกครั้ง','No technician data yet — save this account once'))+'</span>';
  var photoBtn=mayEdit(a)?'<button type="button" class="tacc-photo-btn" data-tacc-photo="'+idx+'" title="'
   +esc2(tl('เปลี่ยนรูปโปรไฟล์','Change photo'))+'">📷</button>':'';
  var bottom;
  if(isTech){
   bottom='<div class="person-stat"><span>'+esc2(tl('งานเปิด','Open jobs'))+'</span><b>'+techCaseCount(tech.id)+'</b></div>'
    +'<div class="person-actions">'
    +'<button class="soft-btn" type="button" data-tacc-jobs="'+esc2(tech.id)+'">'+esc2(tl('งานหน้างาน','Field jobs'))+'</button>'
    +'<button class="soft-btn" type="button" onclick="openTechnicianDetail('+imodeJsArg(tech.id)+')">'+esc2(tl('รายละเอียด','Details'))+'</button>'
    +(mayEdit(a)?'<button class="primary-btn" type="button" data-tacc-techedit="'+idx+'">'+esc2(tl('แก้ไข','Edit'))+'</button>':'')
    +'</div>';
  }else{
   bottom='<div class="person-stat"><span>'+esc2(tl('เมนูที่เข้าได้','Menus'))+'</span><b>'+duties(a.role).length+'</b></div>'
    +'<div class="person-actions">'
    +(manageAcc()&&typeof window.openAccountAdminModal==='function'
      ?'<button class="primary-btn" type="button" onclick="openAccountAdminModal()">'+esc2(tl('แก้ไข','Edit'))+'</button>':'')
    +'</div>';
  }
  return '<div class="person-card'+(isTech?' tacc-colcard':'')+'"'+(isTech?' style="--tacc-col:'+esc2(techColor(tech))+'"':'')+'>'
   +'<div class="person-card-top"><div class="person-card-main">'
   +'<h4>'+esc2(name)+'</h4>'
   +'<p class="person-role">'+esc2(a.role||tl('ไม่ระบุบทบาท','No role'))+'</p>'
   +'<p class="tacc-user" style="display:block;margin:-2px 0 6px">'+esc2(a.username||'')+'</p>'
   +'<div class="person-badges">'+badges+'</div>'
   +(isTech?'<p class="person-phone">'+esc2(tech.phone||'-')+'</p>':'')
   +'</div><div class="person-hero tacc-hero">'+hero+photoBtn+'</div></div>'+dutyHTML(a.role)
   +'<div class="person-bottom">'+bottom+'</div></div>';
 }

 var ROLE_ORDER=['Dev','CEO','Service Manager','Admin','Admin / Coordinator','Sale / Admin','Sales',
  'Technical Lead','R&D Lead','Technician','Technician - Technical','R&D','Technician - R&D'];
 function groupsHTML(list){
  var by={};
  list.forEach(function(a){var r=a.role||tl('ไม่ระบุบทบาท','No role');(by[r]=by[r]||[]).push(a)});
  var names=Object.keys(by).sort(function(x,y){
   var i=ROLE_ORDER.indexOf(x),j=ROLE_ORDER.indexOf(y);
   if(i<0&&j<0)return x.localeCompare(y);return (i<0?99:i)-(j<0?99:j);
  });
  if(!names.length)return '<p class="tacc-user" style="margin-top:10px">'+esc2(tl('ยังไม่มีบัญชีในทีมนี้','No accounts in this team'))+'</p>';
  return names.map(function(r){
   return '<div class="tacc-group"><div class="tacc-group-head">'+esc2(r)+' <span>'+by[r].length+'</span></div>'
    +'<div class="people-grid tacc-people">'+by[r].map(cardHTML).join('')+'</div></div>';
  }).join('');
 }
 function render(){
  var grid=document.getElementById('technicianGrid');
  if(!grid||!grid.parentNode)return;
  style();
  /* 2026-09-28: the register is hidden, not removed — js/03, js/99 and js/104 still render
     into #technicianGrid by id and would throw without it. css/23 makes [hidden] win. */
  grid.hidden=true;
  var sum=document.getElementById('technicianTeamSummary');if(sum)sum.hidden=true;
  var addBtn=document.querySelector('#page-technicians [onclick^="openTechnicianModal"]');if(addBtn)addBtn.hidden=true;
  lastList=[];
  var old=document.getElementById('imodeTeamAccounts');
  if(old&&old.parentNode)old.parentNode.removeChild(old);

  var list=accounts().slice();
  if(!list.length)return;
  /* 2026-09-25: "หน้าทีมงานโชว์ทุกคน ทุก account แบ่งเป็นหมวดตาม Role". The block now leads the
     page, is grouped by role, and follows the team chips above it (ทั้งหมด shows everyone). */
  var team='all';try{team=techTeamFilter||'all'}catch(e){}
  var TEAMS=[];try{TEAMS=TEAM_LIST.slice()}catch(e){}
  if(team!=='all'&&TEAMS.indexOf(team)>=0)list=list.filter(function(a){return (a.team||'Technical')===team});
  list.sort(function(a,b){
   return String(a.name||a.username||'').localeCompare(String(b.name||b.username||''),'th');
  });
  var techCount=0;
  list.forEach(function(a){if(a.technicianId&&techById2(a.technicianId))techCount++});

  var box=document.createElement('div');
  box.id='imodeTeamAccounts';
  box.className='tacc-block';
  /* applyLanguageTo() walks every text node on a setTimeout after a render and would rewrite
     these labels; data-no-i18n is the opt-out that function already honours (part 13). */
  box.setAttribute('data-no-i18n','true');
  var manage=may('users.manage')&&typeof window.openAccountAdminModal==='function'
   ? '<button type="button" class="soft-btn" onclick="openAccountAdminModal()">'
     +esc2(tl('🔐 จัดการบัญชี','🔐 Manage accounts'))+'</button>'
   : '';
  box.innerHTML='<div class="tacc-head"><div>'
   +'<h4>'+esc2(tl('บัญชีผู้ใช้งานทั้งหมด','All login accounts'))+' ('+list.length+')</h4>'
   +'<p>'+esc2(tl('ช่างหน้างาน '+techCount+' · ไม่ใช่ช่าง '+(list.length-techCount)
     +' — ทุกบัญชีที่เข้าสู่ระบบได้ แบ่งตาม Role · ตัวกรองทีมด้านบนใช้กับรายการนี้ด้วย',
     techCount+' field · '+(list.length-techCount)
     +' office — every account that can sign in, grouped by role; the team chips filter it too'))+'</p>'
   +'</div>'+manage+'</div>'
   +groupsHTML(list);
  box.classList.add('is-top');
  grid.parentNode.insertBefore(box,grid);
 }
 window.imodeRenderTeamAccounts=render;

 /* renderTechnicians() is a top-level function declaration in js/03 and therefore a window
    property, so replacing it changes what js/03's own renderAll() resolves to. It is also
    called by the team segment buttons and after every account save, so the block is rebuilt
    every time the grid is — which is why render() removes its previous copy first. */
 var base=window.renderTechnicians;
 if(typeof base==='function'){
  window.renderTechnicians=function(){
   var r=base.apply(this,arguments);
   try{render()}catch(e){}
   return r;
  };
 }
 /* An account created or deleted from the accounts screen does not re-render this page, so
    the list is refreshed when the page is opened as well. */
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   var r=baseGo.apply(this,arguments);
   try{if(name==='technicians')render()}catch(e){}
   return r;
  };
 }
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',function(){setTimeout(render,600)});
 else setTimeout(render,600);
})();
