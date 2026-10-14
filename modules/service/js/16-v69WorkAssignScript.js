/* V6.9 assignment flow and per-role notifications.
   Three things that belong together:
     1. งานของฉัน  — a technician's own assigned cases.
     2. มอบหมายงาน — the coordinator assigns a case to a technician.
     3. Notifications are addressed: a technician sees the ones about their own work, and
        the coordinator no longer sees notices written for a single technician.
   Assignment is watched generically rather than only in the new page, so assigning from
   the case modal or the appointment modal notifies the technician exactly the same way. */
(function(){
 'use strict';
 if(typeof settings!=='object'||typeof PAGE_PERMISSION==='undefined')return;

 function tl(th,en){return typeof window.L==='function'?window.L(th,en):th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function me(){try{return currentUser||null}catch(e){return null}}
 function myTechId(){var u=me();return (u&&u.technicianId)||''}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function techList(){try{return Array.isArray(technicians)?technicians:[]}catch(e){return[]}}
 /* js/38 owns the one-or-many assignee shape. It loads after this file, so these are
    resolved when they are called, never captured at parse time. The fallbacks keep this
    module working on its own if js/38 is ever removed. */
 function idsOf(c){
  return (typeof window.imodeCaseAssignees==='function')
   ? window.imodeCaseAssignees(c)
   : (c&&c.assignee?[c.assignee]:[]);
 }
 function assignedTo(c,tid){
  return (typeof window.imodeIsAssignedTo==='function')
   ? window.imodeIsAssignedTo(c,tid)
   : !!(tid&&c&&c.assignee===tid);
 }
 function setIds(c,ids){
  if(typeof window.imodeSetCaseAssignees==='function')return window.imodeSetCaseAssignees(c,ids);
  c.assignees=ids.slice();c.assignee=ids[0]||'';return c.assignees;
 }
 function techById(id){return techList().filter(function(t){return t.id===id})[0]||null}
 function caseById(id){return caseList().filter(function(c){return c.id===id})[0]||null}
 function isClosed(c){return ['เสร็จสิ้น','ปิดเคส'].indexOf(c.status)>=0}

 /* ---------- 1. permission + module registration ---------- */
 var have=false;
 try{have=PERMISSION_CATALOG.some(function(g){return (g.items||[]).some(function(i){return i[0]==='mywork.view'})})}catch(e){}
 if(!have&&typeof PERMISSION_CATALOG!=='undefined'){
  /* Named after the sidebar entry it opens (2026-09-24): the owner looked for "งานของฉัน" in
     Settings → roles and could not find it under "ดูงานที่ได้รับมอบหมายของตนเอง". */
  PERMISSION_CATALOG.push({group:'งานของฉัน (ช่าง)',groupEn:'My Work (technician)',items:[
   ['mywork.view','เมนู งานของฉัน — ดูงานที่ได้รับมอบหมายของตนเอง','My Work menu — view my assigned work']
  ]});
 }
 PAGE_PERMISSION['my-work']='mywork.view';
 PAGE_PERMISSION['assign']='case.assign';

 /* 2 (2026-09-08): the standard-preset button in js/12 rebuilt a technician role from a
    list that did not contain mywork.view, so งานของฉัน disappeared from the sidebar of any
    role it had been applied to. js/12 now carries the key; bumping this re-runs the
    add-only migration once so roles already saved without it get it back. */
 var WORK_VERSION=2;
 function migrate(){
  if(settings.v69Work===WORK_VERSION)return;
  (settings.roles||[]).forEach(function(r){
   var n=String(r.name||'').toLowerCase();
   if(!/technician|r&d|engineer|ช่าง|lead|supervisor/.test(n))return;
   r.permissions=Array.isArray(r.permissions)?r.permissions:[];
   if(r.permissions.indexOf('mywork.view')<0)r.permissions.push('mywork.view');
  });
  settings.v69Work=WORK_VERSION;
  if(typeof saveLocal==='function')saveLocal();
 }
 migrate();
 /* Re-applied after a cloud sync by v70SettingsSyncGuard, for the same reason as js/12. */
 window.imodeWorkMigrate=migrate;

 if(typeof PAGE_INFO!=='undefined'){
  PAGE_INFO.th['my-work']=['งานของฉัน','เคสงานที่ได้รับมอบหมายให้คุณ'];
  PAGE_INFO.en['my-work']=['My Work','Cases assigned to you'];
  PAGE_INFO.th.assign=['มอบหมายงาน','เลือกช่างให้กับเคสงานบริการ และแจ้งเตือนช่างทันที'];
  PAGE_INFO.en.assign=['Assign Work','Give a case to a technician and notify them'];
 }
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:'my-work',icon:'🧾',th:'งานของฉัน',en:'My Work',perm:'mywork.view'},'first');
  window.imodeRegisterHomeModule({page:'assign',icon:'📌',th:'มอบหมายงาน',en:'Assign Work',perm:'case.assign'},'after:cases');
 }

 /* ---------- 2. pages ---------- */
 function ensurePages(){
  var main=document.querySelector('main.main');
  if(!main)return;
  [['my-work','งานของฉัน'],['assign','มอบหมายงาน']].forEach(function(row){
   if(document.getElementById('page-'+row[0]))return;
   var sec=document.createElement('section');
   sec.className='page';
   sec.id='page-'+row[0];
   main.appendChild(sec);
  });
 }
 /* Sidebar entries, so the two modules behave like every other one. Placement mirrors the
    workflow: งานของฉัน at the top for a technician, มอบหมายงาน right after เคสงานบริการ. */
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav)return;
  function add(page,icon,label,after){
   if(nav.querySelector('.nav-item[data-page="'+page+'"]'))return;
   var b=document.createElement('button');
   b.className='nav-item';
   b.setAttribute('data-page',page);
   b.innerHTML='<span>'+icon+'</span><b>'+esc2(label)+'</b>';
   b.onclick=function(){goPage(page)};
   var ref=after?nav.querySelector('.nav-item[data-page="'+after+'"]'):null;
   if(ref&&ref.nextSibling)nav.insertBefore(b,ref.nextSibling);
   else if(after)nav.appendChild(b);
   else nav.insertBefore(b,nav.firstChild);
  }
  add('my-work','🧾',tl('งานของฉัน','My Work'),'');
  add('assign','📌',tl('มอบหมายงาน','Assign Work'),'cases');
  if(typeof applyRoleVisibility==='function')applyRoleVisibility();
 }

 /* ---------- 3. งานของฉัน ---------- */
 function myCases(){
  var id=myTechId();
  if(!id)return [];
  /* Any of the technicians on the job, not only its lead. */
  return caseList().filter(function(c){return assignedTo(c,id)}).sort(function(a,b){
   var ax=isClosed(a)?1:0,bx=isClosed(b)?1:0;
   if(ax!==bx)return ax-bx;
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
 }
 function sameDay(v,d){
  if(!v)return false;
  var x=new Date(v);
  return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()&&x.getDate()===d.getDate();
 }
 /* Who is on this job, and whether it spans more than one team. Drawn for one person too:
    "ช่าง (1): …" reads better on a row than a bare name with no label. */
 function crewLine(c){
  var ids=idsOf(c);
  if(!ids.length)return '<small class="work-crew is-none">'+esc2(tl('ยังไม่มอบหมาย','Not assigned yet'))+'</small>';
  var teams=(typeof window.imodeAssigneeTeams==='function')?window.imodeAssigneeTeams(c):[];
  var names=ids.map(function(id,i){
   var t=techById(id);
   return '<span class="work-crew-chip'+(i===0?' is-lead':'')+'">'+esc2((t&&t.name)||id)
    +(i===0&&ids.length>1?'<em>'+esc2(tl('หัวหน้างาน','Lead'))+'</em>':'')+'</span>';
  }).join('');
  return '<small class="work-crew">'+esc2(tl('ช่าง','Technicians'))+' ('+ids.length+'): '+names
   +(teams.length>1?'<span class="work-crew-cross">'+esc2(tl('ข้ามทีม','Cross-team'))+' · '+esc2(teams.join(' + '))+'</span>':'')
   +'</small>';
 }
 function caseRow(c,actions){
  var st=esc2(c.status||'-');
  return '<div class="work-row" data-case="'+esc2(c.id)+'">'
   +'<div class="work-row-main">'
   +'<b>'+esc2(c.ticket||c.id)+'</b>'
   +'<span class="work-status status-'+st+'">'+st+'</span>'
   +(c.priority==='ด่วนมาก'?'<span class="work-urgent">'+esc2(tl('ด่วนมาก','Urgent'))+'</span>':'')
   +'<small>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+'</small>'
   +crewLine(c)
   +'<small>'+esc2(tl('นัดหมาย','Appointment'))+': '+(c.appointment?esc2(typeof fmt==='function'?fmt(c.appointment):c.appointment):esc2(tl('ยังไม่นัด','not scheduled')))+'</small>'
   +'</div><div class="work-row-actions">'+actions+'</div></div>';
 }
 function renderMyWork(){
  var host=document.getElementById('page-my-work');
  if(!host)return;
  var id=myTechId();
  if(!id){
   host.innerHTML='<div class="panel"><div class="empty">'+esc2(tl('หน้านี้สำหรับบัญชีช่างเท่านั้น','This page is for technician accounts'))+'</div></div>';
   return;
  }
  var list=myCases(),today=new Date();
  var open=list.filter(function(c){return !isClosed(c)});
  var todays=open.filter(function(c){return sameDay(c.appointment,today)});
  var urgent=open.filter(function(c){return c.priority==='ด่วนมาก'});
  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div><h3>'+esc2(tl('งานที่ได้รับมอบหมาย','Assigned to me'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('เคสที่แอดมินมอบหมายให้คุณ','Cases the coordinator gave you'))+'</p></div>'
   +'<button class="primary-btn action-3d-orange" onclick="goPage(\'field-service\')">'+esc2(tl('เปิด Field Service','Open Field Service'))+'</button></div>'
   +'<div class="work-kpi">'
   +'<div class="work-kpi-box"><small>'+esc2(tl('งานที่ยังไม่จบ','Open'))+'</small><b>'+open.length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('นัดวันนี้','Today'))+'</small><b>'+todays.length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('ด่วนมาก','Urgent'))+'</small><b>'+urgent.length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('ทั้งหมด','Total'))+'</small><b>'+list.length+'</b></div>'
   +'</div>'
   +'<div class="work-list">'+(list.length?list.map(function(c){
     return caseRow(c,'<button class="mini-btn" onclick="imodeOpenAssignedCase('+imodeJsArg(c.id)+')">'+esc2(tl('รายละเอียด','Details'))+'</button>'
      +' <button class="mini-btn" onclick="goPage(\'field-service\')">'+esc2(tl('เริ่มงาน','Start'))+'</button>');
    }).join(''):'<div class="empty">'+esc2(tl('ยังไม่มีงานที่มอบหมายให้คุณ','Nothing has been assigned to you yet'))+'</div>')+'</div>'
   +'</div>';
 }
 window.imodeOpenAssignedCase=function(id){
  if(typeof window.openCaseDetail==='function')window.openCaseDetail(id);
 };

 /* ---------- 4. มอบหมายงาน ---------- */
 /* THE PAGE IS A QUEUE, NOT A DIRECTORY (2026-09-15).

    Reported: "หลังจากที่มอบหมายงานแล้วอยากให้เคสนั้นหายไปจากหน้ามอบหมายงานเลย". It used to list
    every open case with the unassigned ones merely sorted first, so the list only grew and the
    two or three cases that actually needed a decision were buried under the ones that had
    already had it. A case leaves the moment it has a technician.

    Changing the technician later is therefore NOT done here any more — it is done on the case
    itself, where the whole case is in front of you: service-case-detail.html's มอบหมายงาน
    button assigns and reassigns in place. */
 function assignableCases(){
  return caseList().filter(function(c){return !isClosed(c)&&!idsOf(c).length}).sort(function(a,b){
   return new Date(b.createdAt||0)-new Date(a.createdAt||0);
  });
 }
 /* Open work that already has a technician — not listed, only counted, so the page still says
    how much is in flight without asking anybody to act on it. */
 function assignedOpen(){
  return caseList().filter(function(c){return !isClosed(c)&&idsOf(c).length}).length;
 }
 /* Who this account may hand work to. A team lead stays inside their own team — that is
    the existing teamScope rule and this change does not loosen it. An admin resolves to
    null and therefore sees every team, which is what makes a cross-team crew possible. */
 function pickableTechs(){
  var team=(typeof window.imodeTeamScope==='function')?window.imodeTeamScope():null;
  return techList().filter(function(t){return !team||(t.team||'Technical')===team});
 }
 function teamsOf(list){
  var seen={},out=[];
  list.forEach(function(t){
   var k=t.team||'Technical';
   if(seen[k])return;
   seen[k]=1;out.push(k);
  });
  return out;
 }
 /* THE PICKER IS A POPUP.

    It used to expand inside the row. Reported, and visible in a screenshot: the panel is
    squeezed into the narrow right-hand column and stretches the row to several times its
    height, so the list around it jumps and the check boxes end up in a 200px gutter. A
    popup gets the full width of the dialog, does not move anything behind it, and matches
    every other "choose something" surface in this application.

    The markup is unchanged — the same .assign-panel that used to sit in the row is simply
    rendered into the modal instead. imodeAssignCase() finds it by data-case wherever it is,
    so nothing else had to know. */
 function pickerHTML(c){
  var cid=esc2(c.id);
  return '<div class="assign-ctl" data-case="'+cid+'">'
   +'<button type="button" class="soft-btn assign-toggle" data-case="'+cid+'">'
   +esc2(tl('เลือกช่าง','Choose technicians'))
   +' <b class="assign-count">'+idsOf(c).length+'</b></button></div>';
 }

 /* The body of the popup. Same classes as before so the CSS and the wiring are shared. */
 function panelHTML(c){
  var list=pickableTechs(),chosen=idsOf(c),teams=teamsOf(list);
  var cid=esc2(c.id);
  var body=teams.map(function(team){
   var members=list.filter(function(t){return (t.team||'Technical')===team});
   return '<div class="assign-team">'
    +'<div class="assign-team-head"><b>'+esc2(tl('ทีม ','Team '))+esc2(team)+'</b>'
    +'<button type="button" class="assign-mini" data-team="'+esc2(team)+'" data-all="1">'
    +esc2(tl('เลือกทั้งทีม','Whole team'))+'</button>'
    +'<button type="button" class="assign-mini" data-team="'+esc2(team)+'" data-all="0">'
    +esc2(tl('ล้าง','Clear'))+'</button></div>'
    +'<div class="assign-members">'+members.map(function(t){
      var on=chosen.indexOf(t.id)>=0;
      return '<label class="assign-member'+(on?' is-on':'')+'">'
       +'<input type="checkbox" class="assign-cb" value="'+esc2(t.id)+'"'+(on?' checked':'')+'>'
       +'<span>'+esc2(t.name)+'</span>'
       +'<small>'+esc2(t.status||tl('พร้อมรับงาน','Available'))+'</small></label>';
     }).join('')+'</div></div>';
  }).join('');
  return '<div class="assign-panel is-modal" data-case="'+cid+'">'
   +(list.length?body:'<div class="empty">'+esc2(tl('ไม่มีช่างในขอบเขตของคุณ','No technicians in your scope'))+'</div>')
   +appointmentFieldHTML(c)
   +'<div class="assign-foot"><small>'+esc2(tl('หัวหน้างานคือคนแรกที่เลือก','The first one chosen is the lead'))+'</small>'
   +'<button type="button" class="soft-btn" onclick="closeModal()">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" class="primary-btn action-3d-orange" data-assign="'+cid+'">'
   +esc2(tl('มอบหมายและนัดหมาย','Assign & schedule'))+'</button></div>'
   +'</div>';
 }

 /* 2026-09-15: มอบหมายงาน and นัดหมาย are one action now — "รวมปุ่ม มอบหมายงาน กับ นัดหมาย
    ไว้ด้วยกัน … สามารถมอบหมายงานให้ช่างได้ตามที่โมดุลมอบหมายทำได้และสามารถกำหนดวันมอบหมายได้".
    Both are required, on the owner's instruction: a job handed to a technician without a
    date is the thing that used to go quiet.

    The control is a plain datetime-local. js/51 upgrades every one of them into the 24-hour
    date + hour + minute control on its own — it sweeps on a MutationObserver, so markup that
    arrives inside a popup is caught without this file knowing anything about it. It is given
    a whole row of its own rather than a third of one, which is what wrapped the hour and
    minute selects onto separate lines in the old เพิ่ม/แก้ไขนัดหมาย popup. */
 function appointmentFieldHTML(c){
  var v=(c&&c.appointment)||'';
  return '<div class="assign-when">'
   +'<label for="assignWhen">'+esc2(tl('วันและเวลานัดหมาย','Appointment date & time'))
   +' <b>*</b></label>'
   +'<input type="datetime-local" id="assignWhen" class="assign-when-input" step="60"'
   +' value="'+esc2(v)+'">'
   +'<small>'+esc2(tl('ต้องระบุวันนัดก่อนจึงจะมอบหมายได้ · เมื่อบันทึกแล้วสถานะจะเป็น “นัดหมายแล้ว”',
                     'A date is required · saving moves the case to “นัดหมายแล้ว”'))+'</small>'
   +'</div>';
 }
 /* Read back from the panel, wherever it is. The hidden native input is the single source of
    truth — js/51 keeps it in step with its own controls and every save path in this project
    reads these by id, so nothing here has to know the 24-hour control exists. */
 function chosenWhen(caseId){
  var panel=panelOf(caseId);
  var el=panel&&panel.querySelector('#assignWhen,.assign-when-input');
  return el?String(el.value||'').trim():'';
 }

 /* 2026-09-15: the old เพิ่ม/แก้ไขนัดหมาย popup is gone, and two of its entry points start
    with no case in mind — ＋เพิ่มนัดหมาย on the calendar, and 📅 เพิ่มนัดหมาย in a technician's
    profile. They cannot open a case-scoped picker directly, so they ask which case first and
    then hand over to the same merged popup everything else uses. One popup in the project,
    no second appointment form to keep in step. */
 window.imodeOpenAssignChooser=function(preTechId){
  if(typeof openModal!=='function')return;
  if(typeof requirePermission==='function'&&!requirePermission('case.assign'))return;
  var list=caseList().filter(function(c){return !isClosed(c)}).sort(function(a,b){
   return new Date(b.createdAt||0)-new Date(a.createdAt||0);
  });
  if(!list.length){
   if(typeof toastMsg==='function')toastMsg(tl('ยังไม่มีเคสที่เปิดอยู่','No open cases'));
   return;
  }
  openModal(tl('เลือกเคสที่จะมอบหมาย / นัดหมาย','Choose a case to assign & schedule'),
   tl('เลือกเคส แล้วจึงเลือกช่างและวันเวลานัดหมาย','Pick the case, then the crew and the date'),
   '<div class="assign-chooser">'+list.map(function(c){
     var when=c.appointment?(typeof fmt==='function'?fmt(c.appointment):c.appointment)
                           :tl('ยังไม่นัด','not scheduled');
     return '<button type="button" class="assign-choose" data-choose="'+esc2(c.id)+'">'
      +'<b>'+esc2(c.ticket||c.id)+'</b>'
      +'<span>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+'</span>'
      +'<small>'+esc2(c.status||'-')+' · '+esc2(tl('นัดหมาย ','Appointment '))+esc2(when)+'</small>'
      +'</button>';
    }).join('')+'</div>');
  var body=document.getElementById('modalBody');
  if(!body)return;
  body.addEventListener('click',function(e){
   var b=e.target&&e.target.closest&&e.target.closest('[data-choose]');
   if(!b)return;
   e.preventDefault();
   window.imodeOpenAssignPicker(b.getAttribute('data-choose'),preTechId);
  });
 };

 window.imodeOpenAssignPicker=function(caseId,preTechId){
  var c=caseById(caseId);
  if(!c)return;
  if(typeof openModal!=='function')return;
  openModal(tl('มอบหมายงานให้ช่าง','Assign technicians'),
   (c.ticket||c.id)+' · '+(c.customer||'-')+' · '+(c.machine||'-'),
   panelHTML(c));
  wireAssign(document.getElementById('modalBody'));
  /* Seeded after the markup exists, so reassigning a two-person job keeps its lead unless
     the admin unticks them. */
  var panel=panelOf(caseId);
  if(panel)panel.__order=idsOf(c);
  /* Opened from a technician's profile: that technician is who the visitor had in mind, so
     tick them. Only when they are not already on the job, or the order — which decides the
     lead — would be disturbed. */
  if(panel&&preTechId&&idsOf(c).indexOf(preTechId)<0){
   var cb=panel.querySelector('.assign-cb[value="'+preTechId+'"]');
   if(cb&&!cb.checked){
    cb.checked=true;
    remember(panel,cb);
    refreshCount(panel);
   }
  }
 };
 function renderAssign(){
  var host=document.getElementById('page-assign');
  if(!host)return;
  var list=assignableCases();
  var waiting=list.length;
  var running=assignedOpen();
  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div><h3>'+esc2(tl('มอบหมายงานให้ช่าง','Assign work to a technician'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('เลือกช่างแล้วกดมอบหมาย ระบบจะแจ้งเตือนช่างและงานจะไปอยู่ใน "งานของฉัน" ของช่างคนนั้น',
                                  'Pick a technician and assign; they are notified and the case appears in their My Work'))+'</p></div>'
   +'<button class="soft-btn" onclick="goPage(\'cases\')">'+esc2(tl('ไปหน้าเคสงานบริการ','Open service cases'))+'</button></div>'
   +'<div class="work-kpi">'
   +'<div class="work-kpi-box"><small>'+esc2(tl('รอมอบหมาย','Waiting'))+'</small><b>'+waiting+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('มอบหมายแล้ว · กำลังทำ','Assigned · running'))+'</small><b>'+running+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('ช่างในระบบ','Technicians'))+'</small><b>'+techList().length+'</b></div>'
   +'</div>'
   +(running?'<p class="assign-moved">'+esc2(tl('มอบหมายไปแล้ว ','Assigned: ')+running
      +tl(' เคส — ติดตามและเปลี่ยนช่างได้ที่หน้าเคสงานบริการ',
          ' case(s) — track them and change the technician on the Service Cases page'))
      +' <button type="button" class="assign-movedlink" onclick="goPage(&quot;cases&quot;)">'
      +esc2(tl('ไปที่หน้าเคส','Go to cases'))+' ›</button></p>':'')
   +'<div class="work-list">'+(list.length?list.map(function(c){
     return caseRow(c,pickerHTML(c));
    }).join(''):'<div class="empty">'+esc2(tl('ไม่มีเคสรอมอบหมาย — มอบหมายครบทุกเคสแล้ว',
                                              'Nothing waiting — every open case has a technician'))+'</div>')+'</div>'
   +'</div>';
  /* 10. THE BAR IS THE BUTTON. Reaching for the small ปุ่มเลือกช่าง on a long row is fussy,
     so the row itself opens the picker. Attributes are set here rather than in caseRow()
     because that function is shared with งานของฉัน and งานที่สำเร็จแล้ว, where a row means
     "open the job", not "assign it". */
  [].slice.call(host.querySelectorAll('.work-row')).forEach(function(r){
   r.setAttribute('role','button');
   r.setAttribute('tabindex','0');
   r.setAttribute('aria-label',tl('มอบหมายเคส ','Assign case ')+(r.getAttribute('data-case')||''));
  });
  wireAssign();
 }
 /* Selection order, not DOM order, decides the lead — "คนแรกที่เลือก" has to mean what
    it says. The order lives on the panel element, seeded from the case when it renders. */
 /* The panel now lives in the modal, not in the row, so it is found by its own data-case
    rather than through the row that opened it. */
 function panelOf(caseId){
  return document.querySelector('.assign-panel[data-case="'+caseId+'"]');
 }
 function chosenIds(caseId){
  var panel=panelOf(caseId);
  if(!panel)return [];
  var checked=[].slice.call(panel.querySelectorAll('.assign-cb:checked')).map(function(b){return b.value});
  var order=panel.__order||[];
  var ranked=order.filter(function(id){return checked.indexOf(id)>=0});
  checked.forEach(function(id){if(ranked.indexOf(id)<0)ranked.push(id)});
  return ranked;
 }
 window.imodeAssignCase=function(caseId){
  var c=caseById(caseId);
  if(!c)return;
  var ids=chosenIds(caseId);
  if(!ids.length){
   if(typeof toastMsg==='function')toastMsg(tl('กรุณาเลือกช่างอย่างน้อย 1 คน','Please choose at least one technician'));
   return;
  }
  /* Read BEFORE closeModal() below — the panel lives inside the popup, so once it is closed
     the input is gone and this would always come back empty. */
  var when=chosenWhen(caseId);
  if(!when){
   if(typeof toastMsg==='function')toastMsg(tl('กรุณาระบุวันและเวลานัดหมาย','Please set the appointment date and time'));
   var wEl=panelOf(caseId)&&panelOf(caseId).querySelector('#assignWhen,.assign-when-input');
   if(wEl){try{wEl.focus()}catch(e){}
    var box=wEl.closest('.assign-when');
    if(box){box.classList.add('is-missing');setTimeout(function(){box.classList.remove('is-missing')},1800)}
   }
   return;
  }
  if(typeof requirePermission==='function'&&!requirePermission('case.assign'))return;
  /* Closed before the work, not after: renderAll() redraws every module and blocks the
     main thread, so a popup left open until then cannot be dismissed and feels stuck —
     the same complaint the account switcher had. */
  if(typeof closeModal==='function'){try{closeModal()}catch(e){}}
  var before=idsOf(c);
  setIds(c,ids);
  c.appointment=when;
  /* The two steps now happen in one press, so the case lands on นัดหมายแล้ว (step 3) rather
     than มอบหมายแล้ว (step 2) — there is a real date on it, which is exactly what that status
     means. saveSchedule() in js/03 has always done this for the appointment half; the guard
     is the same one, so a settings.statuses without it degrades instead of writing a status
     the system does not have. A case already past this point keeps the status it has: a job
     in progress being re-crewed must not be dragged backwards. */
  var EARLY=['เคสใหม่','มอบหมายแล้ว'];
  if(EARLY.indexOf(c.status)>=0&&(settings.statuses||[]).indexOf('นัดหมายแล้ว')>=0)c.status='นัดหมายแล้ว';
  else if(c.status==='เคสใหม่'&&(settings.statuses||[]).indexOf('มอบหมายแล้ว')>=0)c.status='มอบหมายแล้ว';
  c.updatedAt=new Date().toISOString();
  /* One notice per technician who was not already on the job. Somebody who stays on it
     through a reassignment is not told again — nothing changed for them. */
  ids.forEach(function(tid){
   if(before.indexOf(tid)<0)notifyAssignment(c,tid,'');
  });
  if(typeof saveLocal==='function')saveLocal();
  if(typeof cloudUpsertCase==='function'){try{cloudUpsertCase(c)}catch(e){}}
  if(typeof renderAll==='function')renderAll();
  renderAssign();
  if(typeof toastMsg==='function'){
   var names=ids.map(function(id){return (techById(id)||{}).name||id});
   var whenTxt=(typeof fmt==='function')?fmt(when):when;
   toastMsg((ids.length===1
    ? tl('มอบหมายงานให้ ','Assigned to ')+names[0]
    : tl('มอบหมายงานให้ ','Assigned to ')+ids.length+tl(' คน: ',' people: ')+names.join(', '))
    +tl(' · นัดหมาย ',' · appointment ')+whenTxt);
  }
 };

 /* One delegated listener for the whole page rather than inline handlers, because the
    panel is rebuilt on every render and the check boxes carry no ids. */
 /* TWO HOSTS, AND IT HAS TO BE TWO.

    A single delegated listener on `document` looks right and silently does not work: js/05
    line 19 puts a click handler on the modal panel that calls e.stopPropagation(), so no
    click inside a popup ever reaches the document. That guard is the "ต้องกดกากบาทเท่านั้น"
    rule — it keeps a stray click from closing a half-filled form — and it must stay.
    Listeners on descendants of the panel still fire, so the popup is wired on #modalBody,
    which is inside it. The symptom when this is got wrong is exact: the check boxes tick
    (the change listener is on the panel's own host) but the Assign button does nothing at
    all, with no error. */
 function wireAssign(host){
  host=host||document.getElementById('page-assign');
  if(!host||host.__assignWired)return;
  host.__assignWired=true;
  host.addEventListener('keydown',function(e){
   if(['Enter',' '].indexOf(e.key)<0)return;
   var bar=e.target&&e.target.closest&&e.target.closest('.work-row');
   if(!bar||e.target!==bar)return;
   e.preventDefault();
   window.imodeOpenAssignPicker(bar.getAttribute('data-case'));
  });
  host.addEventListener('click',function(e){
   var t=e.target;
   if(!t||!t.closest)return;
   var toggle=t.closest('.assign-toggle');
   if(toggle){
    window.imodeOpenAssignPicker(toggle.getAttribute('data-case'));
    return;
   }
   var go=t.closest('[data-assign]');
   if(go){window.imodeAssignCase(go.getAttribute('data-assign'));return}
   /* Anywhere on the bar that is not already a control. The picker lives in the modal, so
      its own clicks never reach this listener. */
   var bar=t.closest('.work-row');
   if(bar&&!t.closest('button,a,input,select,textarea,label')){
    window.imodeOpenAssignPicker(bar.getAttribute('data-case'));
    return;
   }
   var mini=t.closest('.assign-mini');
   if(mini){
    var grp=mini.closest('.assign-team'),box=mini.closest('.assign-panel');
    var on=mini.getAttribute('data-all')==='1';
    if(!grp||!box)return;
    [].slice.call(grp.querySelectorAll('.assign-cb')).forEach(function(cb){
     if(cb.checked===on)return;
     cb.checked=on;
     remember(box,cb);
    });
    refreshCount(box);
   }
  });
  host.addEventListener('change',function(e){
   var cb=e.target;
   if(!cb||!cb.classList||!cb.classList.contains('assign-cb'))return;
   var box=cb.closest('.assign-panel');
   if(!box)return;
   remember(box,cb);
   refreshCount(box);
  });
 }
 function remember(box,cb){
  box.__order=box.__order||[];
  var i=box.__order.indexOf(cb.value);
  if(cb.checked){if(i<0)box.__order.push(cb.value)}
  else if(i>=0)box.__order.splice(i,1);
  var label=cb.closest('.assign-member');
  if(label)label.classList.toggle('is-on',cb.checked);
 }
 /* The count sits on the trigger back on the page, so it is found by case id rather than
    by walking up from the panel — they are in different trees now. */
 function refreshCount(box){
  var n=box.querySelectorAll('.assign-cb:checked').length;
  var cid=box.getAttribute('data-case');
  var c=document.querySelector('.assign-ctl[data-case="'+cid+'"] .assign-count');
  if(c)c.textContent=String(n);
 }


 /* ---------- 5. addressed notifications ---------- */
 function notifyAssignment(c,tid,before){
  if(!tid||tid===before)return;
  var t=techById(tid);
  try{
   notifications.unshift({
    id:(typeof uid==='function'?uid():'n'+Date.now()),
    icon:'🧾',
    title:tl('ได้รับมอบหมายงานใหม่','New work assigned'),
    message:(c.ticket||c.id)+' · '+(c.customer||'-')+' · '+(c.machine||'-'),
    createdAt:new Date().toISOString(),
    read:false,
    caseId:c.id,
    audience:'technician',
    technicianId:tid,
    fromUser:(me()&&me().name)||''
   });
  }catch(e){}
  return t;
 }
 window.imodeNotifyAssignment=notifyAssignment;

 /* Any path that changes an assignee notifies the technician: the case modal, the
    appointment modal and the assign page all go through the same watch. */
 function snapshot(){
  var m={};
  caseList().forEach(function(c){m[c.id]=idsOf(c)});
  return m;
 }
 function notifyChanges(before){
  caseList().forEach(function(c){
   var was=before[c.id]||[];
   idsOf(c).forEach(function(tid){
    if(was.indexOf(tid)<0)notifyAssignment(c,tid,'');
   });
  });
 }
 ['saveCase','saveSchedule'].forEach(function(fn){
  var base=window[fn];
  if(typeof base!=='function')return;
  window[fn]=function(){
   var before=snapshot();
   var r=base.apply(this,arguments);
   var done=function(){
    notifyChanges(before);
    if(typeof saveLocal==='function')saveLocal();
    if(typeof renderNotifications==='function')renderNotifications();
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 });

 /* A technician sees notices addressed to them plus the automatic ones about their own
    cases; nobody else sees a notice written for one technician. */
 function visibleTo(n){
  var tech=myTechId();
  var owner=n.technicianId||'';
  if(!owner&&n.caseId){
   /* An automatic notice about a case belongs to everybody on that case, not only its
      lead — otherwise the second technician never hears about their own appointment. */
   var c=caseById(n.caseId);
   if(c&&idsOf(c).length){
    if(tech)return assignedTo(c,tech);
    return n.audience!=='technician';
   }
  }
  if(tech)return owner===tech;
  return n.audience!=='technician';
 }
 /* A case a customer opened from the machine QR lands in the list with no assignee and
    nobody is told. buildNotifications() only ever announced appointments, urgent cases,
    waiting parts and submissions — never intake — so the coordinator had to notice the new
    row on the Cases page by themselves. One notice per unassigned open case, addressed to
    whoever may assign work; a technician never sees it (no audience, and visibleTo() keeps
    it away because the case has no assignee yet). */
 function intakeNotices(){
  var out=[];
  if(myTechId())return out;                       /* technicians do not take cases in */
  try{if(typeof canPermission==='function'&&!canPermission('case.assign'))return out}catch(e){}
  caseList().forEach(function(c){
   if(c.assignee||isClosed(c))return;
   if(['เคสใหม่','มอบหมายแล้ว'].indexOf(c.status)<0)return;
   out.push({
    key:'auto_intake_'+c.id,
    icon:c.channel==='LINE OA'?'📱':'🆕',
    title:tl('เคสใหม่รอมอบหมาย','New case waiting to be assigned'),
    /* 2026-09-25: deliberately NOT escaped here. Every sink that renders a notification
       message escapes it already (js/03 lines 397/1118/1152/1297 and js/58), and now that
       window.esc really exists, escaping here too would double it and show the user &amp;. */
    message:(c.ticket||'')+' · '+(c.customer||'-')+' · '+(c.machine||'-')
      +(c.channel?' · '+c.channel:''),
    createdAt:c.createdAt||c.updatedAt,
    caseId:c.id,
    read:false
   });
  });
  return out;
 }
 var baseBuild=window.buildNotifications;
 if(typeof baseBuild==='function'){
  window.buildNotifications=function(){
   var all=baseBuild.apply(this,arguments)||[];
   return intakeNotices().concat(all.filter(visibleTo));
  };
 }

 /* ---------- 6. navigation ---------- */
 var baseGoPage=window.goPage;
 window.goPage=function(name){
  if(name==='my-work'||name==='assign')ensurePages();
  var r=baseGoPage.apply(this,arguments);
  var active=(document.querySelector('.page.active')||{}).id||'';
  if(active==='page-my-work')renderMyWork();
  else if(active==='page-assign')renderAssign();
  return r;
 };
 window.imodeRenderMyWork=renderMyWork;
 window.imodeRenderAssign=renderAssign;

 var style=document.createElement('style');
 style.id='v69WorkStyle';
 style.textContent=''
 +'.work-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0}'
 +'.assign-moved{margin:0 0 10px;padding:9px 12px;border:1px solid #d7e3f6;border-radius:10px;'
 +'background:#f4f8ff;color:#31507f;font-size:12.5px;line-height:1.6}'
 +'.assign-movedlink{border:0;background:none;color:#0b63e5;font:inherit;font-weight:700;cursor:pointer;padding:0}'
 +'.work-kpi-box{background:#f4f8ff;border:1px solid #e2ecfb;border-radius:12px;padding:10px 12px}'
 +'.work-kpi-box small{display:block;font-size:11px;color:#7385a5}'
 +'.work-kpi-box b{font-size:20px;color:#0c225e}'
 +'.work-list{display:flex;flex-direction:column;gap:10px}'
 +'.work-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid #e2ecfb;border-radius:14px;background:#fff}'
 /* Only on มอบหมายงาน does the bar itself do something. */
 +'#page-assign .work-row{cursor:pointer;transition:border-color .12s ease,box-shadow .12s ease,transform .12s ease}'
 +'#page-assign .work-row:hover{border-color:#0b63e5;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,99,229,.12)}'
 +'#page-assign .work-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.work-row-main{display:flex;flex-direction:column;gap:3px;min-width:210px;flex:1}'
 +'.work-row-main b{color:#0c225e;font-size:14px}'
 +'.work-row-main small{color:#5b6b88;font-size:11.5px}'
 +'.work-row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
 +'.work-status{align-self:flex-start;font-size:11px;font-weight:700;color:#123a80;background:#eef4ff;border:1px solid #dce8fa;border-radius:999px;padding:2px 9px}'
 +'.work-urgent{align-self:flex-start;font-size:11px;font-weight:700;color:#b32020;background:#fdeaea;border:1px solid #f6cccc;border-radius:999px;padding:2px 9px}'
 +'.assign-pick{min-width:200px;padding:7px 9px;border:1px solid #d3e0f4;border-radius:10px;font-size:12.5px}'
 +'.assign-current{color:#0b63e5;font-size:11.5px;font-weight:700}'
 /* --- the crew line on a row --- */
 +'.work-crew{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:11.5px;color:#41567c}'
 +'.work-crew.is-none{color:#98a6bf;font-style:italic}'
 +'.work-crew-chip{background:#eaf1fd;color:#12356f;border-radius:99px;padding:2px 9px;font-weight:600;'
 +'display:inline-flex;align-items:center;gap:5px}'
 +'.work-crew-chip.is-lead{background:#e6f4ec;color:#08603a}'
 +'.work-crew-chip em{font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.04em;'
 +'text-transform:uppercase;opacity:.72}'
 +'.work-crew-cross{background:#fff2e2;color:#9a4c07;border-radius:99px;padding:2px 9px;font-weight:700}'
 /* --- the picker --- */
 +'.assign-ctl{display:flex;flex-direction:column;gap:8px;min-width:150px}'
 +'.assign-toggle{display:inline-flex;align-items:center;gap:7px;justify-content:center}'
 +'.assign-count{background:#0b63e5;color:#fff;border-radius:99px;min-width:20px;height:20px;'
 +'display:inline-grid;place-items:center;font-size:11px;padding:0 6px}'
 /* .panel and friends carry an author display rule that beats the UA [hidden] rule, and
    this is a flex container, so the explicit hide is required. Same trap as the
    โมดูลทั้งหมด grid and the Field Service queue panel. */
 +'.assign-panel{display:flex;flex-direction:column;gap:10px;padding:11px;border:1px solid #dbe6f7;'
 +'border-radius:13px;background:#f8fbff}'
 +'.assign-panel[hidden]{display:none!important}'
 /* Inside the modal it already has the dialog's padding and ground, so it drops its own
    frame and lets the member grid use the full width the popup gives it. */
 +'.assign-panel.is-modal{border:0;background:transparent;padding:0;gap:14px}'
 +'.assign-panel.is-modal .assign-members{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}'
 +'.assign-panel.is-modal .assign-team{padding-bottom:4px}'
 +'.assign-panel.is-modal .assign-foot{position:sticky;bottom:0;background:#fff;padding:12px 0 2px;'
 +'margin-top:2px;border-top:1px solid #e6edf8}'
 +'.assign-team-head{display:flex;align-items:center;gap:7px;margin-bottom:6px}'
 +'.assign-team-head b{font-size:11.5px;color:#12356f;flex:1;min-width:0}'
 +'.assign-mini{border:1px solid #cfe0fa;background:#fff;color:#0b63e5;border-radius:8px;'
 +'padding:3px 8px;font-size:10.5px;font-weight:700;cursor:pointer;font-family:inherit}'
 +'.assign-mini:hover{background:#eaf3ff}'
 +'.assign-members{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:6px}'
 +'.assign-member{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #e0e9f7;'
 +'border-radius:10px;background:#fff;font-size:12px;cursor:pointer;line-height:1.3}'
 +'.assign-member span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.assign-member small{font-size:9.5px;color:#8b9ab5;white-space:nowrap}'
 +'.assign-member.is-on{border-color:#0b63e5;background:#eff6ff;font-weight:600}'
 +'.assign-member input{width:15px;height:15px;accent-color:#0b63e5;flex:none}'
 +'.assign-foot{display:flex;align-items:center;gap:9px;border-top:1px dashed #d8e4f6;padding-top:9px}'
 +'.assign-foot small{flex:1;min-width:0;font-size:10.5px;color:#7385a5}'
 /* The appointment gets a full-width row of its own. The old เพิ่ม/แก้ไขนัดหมาย popup put the
    same control in a 1-of-3 grid cell — 187px in a 620px dialog — and js/51's .t24 is a
    flex-wrap container, so the hour and minute selects fell onto separate lines and the cell
    grew to 247px against its neighbours' 70px. Full width is what keeps that from recurring. */
 +'.assign-when{border:1px solid #dbe6f7;border-radius:12px;background:#f8fbff;padding:11px 12px}'
 +'.assign-when label{display:block;font-size:11.5px;font-weight:700;color:#12356f;margin-bottom:6px}'
 +'.assign-when label b{color:#d92d20}'
 +'.assign-when .t24,.assign-when-input{width:100%;box-sizing:border-box}'
 +'.assign-when-input{border:1px solid #d9e6fa;border-radius:11px;background:#fff;color:#0c225e;'
 +'font-family:inherit;font-size:13px;padding:9px 11px;min-height:40px}'
 +'.assign-when small{display:block;margin-top:6px;font-size:10.5px;color:#7385a5;line-height:1.5}'
 +'.assign-when.is-missing{border-color:#d92d20;background:#fff5f4}'
 +'.assign-when.is-missing label{color:#b42318}'
 /* The case chooser the two case-less entry points open first. */
 +'.assign-chooser{display:grid;gap:8px;max-height:56vh;overflow:auto}'
 +'.assign-choose{display:block;width:100%;text-align:left;border:1px solid #e0e9f7;border-radius:11px;'
 +'background:#fff;padding:10px 12px;cursor:pointer;font-family:inherit;line-height:1.45}'
 +'.assign-choose:hover{border-color:#0b63e5;background:#f4f9ff}'
 +'.assign-choose:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.assign-choose b{display:block;font-size:12.5px;color:#12356f}'
 +'.assign-choose span{display:block;font-size:11.5px;color:#41527a;margin-top:1px}'
 +'.assign-choose small{display:block;font-size:10.5px;color:#7385a5;margin-top:2px}'
 +'@media (max-width:640px){.work-row{flex-direction:column;align-items:stretch}.work-row-actions{justify-content:flex-start}.assign-pick{width:100%}'
 +'.assign-ctl{min-width:0;width:100%}.assign-members{grid-template-columns:1fr}'
 +'.assign-panel.is-modal .assign-members{grid-template-columns:1fr}'
 +'.assign-panel.is-modal .assign-foot{flex-wrap:wrap}}';
 document.head.appendChild(style);

 function install(){ensurePages();ensureNav()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
