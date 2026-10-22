/* Beta — หน้างาน is one job, opened from งานของฉัน.

   Four requests that are really one screen:

     4. tapping a row in งานของฉัน should land on หน้างาน for that job, not on a popup
     5. หน้างาน is entered from งานของฉัน and shows a single job
     6. หน้างาน becomes the big page: a status bar at the top, the action buttons, the
        machine information, then the technician's inspection sheet — and the separate
        details view goes away
     9. the inspection sheet carries example text so a technician can see how to fill it

   What was there before: #page-field-service showed a hero, four KPI tiles and a list of
   every job the technician holds, each job a card with six small buttons, and the
   inspection sheet lived behind one of them in a modal. งานของฉัน listed the same jobs
   again with a รายละเอียด button that opened the case popup. So the same job appeared
   twice and the actual work — the sheet — was three taps deep.

   What this file does, all of it additive:

     * a row in งานของฉัน becomes the button. No รายละเอียด, no เริ่มงาน; the whole bar
       opens หน้างาน for that job.
     * renderFieldService() is wrapped. When a job is selected the hero, the KPI tiles and
       the job list are hidden and the single-job workspace is shown in their place. With
       no job selected — an admin opening a technician's queue from ทีมช่าง — the original
       list is exactly what it was, so that path does not regress.
     * the inspection sheet is rendered into the page rather than into a modal, by
       intercepting the openModal() call that openServiceReport() makes. The sheet is
       js/03's own, not a copy: the checklist editor, the parts editor, the photo and video
       grids, the signature pads and the submit handler are all the originals, so a later
       patch to that form shows up here for free.

   js/03 is not edited. Remove this file and the old two-screen behaviour returns. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function caseById(id){return caseList().filter(function(c){return c.id===id})[0]||null}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function isClosed(c){return ['เสร็จสิ้น','ปิดเคส'].indexOf(c.status)>=0}
 function fmtAny(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'')}catch(e){return v||''}}

 /* ---------------------------------------------------------------- 1. state ---- */
 var jobId='';
 function activeCase(){
  var c=caseById(jobId);
  return c||null;
 }
 /* THE JOB THE TECHNICIAN LOOKED AT LAST (2026-09-15).

    Reported: "โมดุลหน้างานอะ อยากให้เวลากดแล้วจะเป็นเคสหน้างานของช่างที่ช่างเปิดดูล่าสุด".
    Opening หน้างาน from the module card, the bottom bar or a Home shortcut used to re-pick
    by next appointment, so a technician who was halfway through a job could be handed a
    different one. The last job opened is remembered per technician and wins, as long as it
    is still theirs and still open — a job that has been closed, reassigned or deleted falls
    through to the appointment order below rather than showing something stale.

    Its own key, not `settings`: it is a per-device convenience about where somebody was
    looking, it must not travel to other devices, and losing it costs nothing. */
 var LAST_KEY='imode_v70_field_last_job';
 function lastMap(){
  try{return JSON.parse(localStorage.getItem(LAST_KEY)||'{}')||{}}catch(e){return {}}
 }
 function rememberJob(id){
  var tid=myTechId();
  if(!tid||!id)return;
  try{
   var m=lastMap();
   if(m[tid]===id)return;
   m[tid]=id;
   localStorage.setItem(LAST_KEY,JSON.stringify(m));
  }catch(e){}
 }
 /* Entering หน้างาน without picking a job — from the sidebar, the bottom bar or a Home
    card — still has to show one job, so the one the technician was last on is chosen, and
    failing that their most current one.
    Anyone who is not a technician (an admin previewing a queue) gets the original list. */
 function autoPick(){
  var tid=myTechId();
  if(!tid)return '';
  var last=lastMap()[tid]||'';
  if(last){
   var lc=caseById(last);
   if(lc&&!isClosed(lc)){
    var still=(typeof window.imodeIsAssignedTo==='function')
     ? window.imodeIsAssignedTo(lc,tid) : lc.assignee===tid;
    if(still)return last;
   }
  }
  /* Any technician on the job, not only its lead — js/38 keeps c.assignees beside the
     lead and this is the screen a second technician actually works from. */
  var onIt=(typeof window.imodeIsAssignedTo==='function')
   ? function(c){return window.imodeIsAssignedTo(c,tid)}
   : function(c){return c.assignee===tid};
  var mine=caseList().filter(function(c){return onIt(c)&&!isClosed(c)});
  mine.sort(function(a,b){
   var ap=a.appointment?new Date(a.appointment).getTime():Infinity;
   var bp=b.appointment?new Date(b.appointment).getTime():Infinity;
   if(ap!==bp)return ap-bp;                       /* the next appointment leads */
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
  return (mine[0]||{}).id||'';
 }
 window.imodeOpenFieldJob=function(id){
  var c=caseById(id);
  if(!c)return;
  jobId=id;
  rememberJob(id);
  if(typeof window.goPage==='function')window.goPage('field-service');
  if(typeof window.renderFieldService==='function')window.renderFieldService();
 };
 window.imodeFieldJobId=function(){return jobId};
 /* Choose the job WITHOUT navigating or rendering. js/73 needs to make the choice for an
    account that is not a technician before renderWorkspace() runs, and imodeOpenFieldJob()
    cannot be used for that — it calls goPage(), which would re-enter the wrapper it is
    being called from. */
 window.imodeSetFieldJob=function(id){jobId=id||''};
 window.imodeClearFieldJob=function(){
  jobId='';
  if(typeof window.renderFieldService==='function')window.renderFieldService();
 };

 /* ------------------------------------------------- 2. งานของฉัน: the bar IS the button ---- */
 /* js/16 builds the rows; they are rewritten on every render, so the wiring is re-applied
    after each one instead of changing that template. */
 function wireMyWork(){
  var rows=document.querySelectorAll('#page-my-work .work-row[data-case]');
  for(var i=0;i<rows.length;i++){
   var row=rows[i];
   if(row.dataset.fwWired)continue;
   row.dataset.fwWired='1';
   var id=row.getAttribute('data-case');
   var acts=row.querySelector('.work-row-actions');
   /* รายละเอียด and เริ่มงาน both led where the bar now leads. */
   if(acts)acts.innerHTML='<span class="fw-go" aria-hidden="true">'+esc2(tl('เปิดหน้างาน','Open job'))+' ›</span>';
   row.classList.add('fw-rowlink');
   row.setAttribute('role','button');
   row.setAttribute('tabindex','0');
   row.setAttribute('aria-label',tl('เปิดหน้างาน ','Open field job ')+(row.querySelector('b')||{}).textContent);
   row.addEventListener('click',function(e){
    if(e.target.closest('button,a,select,input'))return;
    window.imodeOpenFieldJob(this.getAttribute('data-case'));
   });
   row.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){
     e.preventDefault();
     window.imodeOpenFieldJob(this.getAttribute('data-case'));
    }
   });
  }
 }
 var baseMyWork=window.imodeRenderMyWork;
 if(typeof baseMyWork==='function'){
  window.imodeRenderMyWork=function(){
   var r=baseMyWork.apply(this,arguments);
   try{wireMyWork()}catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------------- 3. the status bar ---- */
 function steps(){
  return typeof window.imodeFieldSteps==='function'?window.imodeFieldSteps()
   :['กำลังเดินทาง','ถึงหน้างาน','เริ่มตรวจเช็ก','กำลัง PM / Maintenance','กำลังซ่อม Service','ทดสอบเครื่อง','รอลูกค้าตรวจรับ','จบงาน'];
 }
 function holdStatus(){return window.imodeFieldHoldStatus||'รออะไหล่'}
 function nextStatus(cur){
  if(typeof window.imodeFieldNextStatus==='function')return window.imodeFieldNextStatus(cur);
  var list=steps(),i=list.indexOf(cur);
  if(i<0)return list[0];
  return i>=list.length-1?'':list[i+1];
 }
 /* One tap = one step. saveFieldStatus() in js/03 reads fieldStatusSelect / fieldStatusNote
    as id globals, so the two controls it needs are created for the length of the call and
    taken away again. Doing it this way keeps the timeline entry, the Check-in stamp and
    the case-status mapping in the one function that already owns them, instead of a second
    copy of that logic living here. It is only ever done with no modal open, so the ids
    cannot collide with the modal's own copies. */
 function advance(cid,status){
  if(typeof window.saveFieldStatus!=='function')return;
  if(document.querySelector('#modal.open'))return;
  /* 2026-09-21 — WHY THE IDS BELOW ARE PARKED FIRST.
     closeModal() (js/03:1129) is `modal.classList.remove('open')` and nothing else, so the
     status popup opened by 📷 บันทึกสถานะพร้อมรูป leaves its own #fieldStatusSelect and
     #fieldStatusNote in the document for good. Appending ours then gives TWO elements with
     each id — and a duplicated id makes the id-global an HTMLCollection instead of the
     element, so saveFieldStatus()'s `fieldStatusNote.value.trim()` reads undefined and
     throws. It is an async function, so that is a rejected promise, and the .then(clean,clean)
     below swallows it: nothing saved, nothing in the console, and the ถัดไป button silently
     stopped working for the rest of the session once the popup had been used once.
     Measured: window.fieldStatusSelect came back as [object HTMLCollection] with
     value undefined, and the call rejected with "Cannot read properties of undefined".
     The stale copies are parked under no id for the length of this call and put back after,
     so ours is the only one the id-global can resolve to. */
  var parked=[];
  ['fieldStatusSelect','fieldStatusNote'].forEach(function(id){
   [].forEach.call(document.querySelectorAll('[id="'+id+'"]'),function(el){
    parked.push([el,id]);
    el.id='';
   });
  });
  var box=document.createElement('div');
  box.style.display='none';
  box.innerHTML='<select id="fieldStatusSelect"><option></option></select><textarea id="fieldStatusNote"></textarea>';
  var opt=box.querySelector('option');
  opt.value=status;opt.textContent=status;
  box.querySelector('select').value=status;
  document.body.appendChild(box);
  try{pendingFieldStatusMedia=[]}catch(e){}
  var clean=function(){
   if(box.parentNode)box.parentNode.removeChild(box);
   parked.forEach(function(p){p[0].id=p[1]});
   parked=[];
  };
  var r;
  try{r=window.saveFieldStatus(cid)}catch(e){clean();return}
  if(r&&typeof r.then==='function')r.then(clean,clean);
  else clean();
 }
 window.imodeFieldAdvance=advance;

 function statusHTML(c){
  var cur=c.fieldStatus||'',nx=nextStatus(cur),list=steps(),hold=holdStatus();
  var ladder=list.map(function(s,i){
   var done=cur&&list.indexOf(cur)>i,now=s===cur;
   return '<li class="'+(now?'is-now':done?'is-done':'')+'"><span>'+(i+1)+'</span><b>'+esc2(s)+'</b></li>';
  }).join('');
  var btns='';
  if(nx)btns+='<button type="button" class="primary-btn action-3d-orange fw-next" data-status="'+esc2(nx)+'">'
    +esc2(tl('ถัดไป: ','Next: '))+esc2(nx)+' →</button>';
  else btns+='<span class="fw-final">'+esc2(tl('งานหน้างานถึงขั้นสุดท้ายแล้ว','The field job is at its last step'))+'</span>';
  if(cur!==hold&&nx)btns+='<button type="button" class="soft-btn fw-next" data-status="'+esc2(hold)+'">📦 '+esc2(hold)+'</button>';
  /* 2026-10-21 ข้อ 7: one step back, for a press made by mistake. It goes through the same
     saveFieldStatus() as a step forward, so the log keeps both, and js/138 posts it to the
     case chat as ↩️ ช่างย้อนสถานะหน้างาน. */
  var at=list.indexOf(cur);
  if(at>0)btns+='<button type="button" class="soft-btn fw-stepback" data-status="'+esc2(list[at-1])+'">↩ '
    +esc2(tl('ย้อนกลับ: ','Back: '))+esc2(list[at-1])+'</button>';
  btns+='<button type="button" class="soft-btn" onclick="openFieldStatusModal('+imodeJsArg(c.id)+')">📷 '
    +esc2(tl('บันทึกสถานะพร้อมรูป','Save status with evidence'))+'</button>';
  return '<div class="fw-statusbar">'
   +'<div class="fw-statusnow"><small>'+esc2(tl('สถานะหน้างาน','Field status'))+'</small>'
   +'<b>'+esc2(cur||tl('ยังไม่เริ่มงาน','Not started'))+'</b>'
   +'<span class="fw-casestatus">'+esc2(c.status||'-')+'</span></div>'
   +'<ol class="fw-ladder">'+ladder+'</ol>'
   +'<div class="fw-stepactions">'+btns+'</div></div>';
 }

 /* ------------------------------------------------------------ 4. the header ---- */
 function headHTML(c){
  return '<div class="fw-head">'
   +'<button type="button" class="fw-back" onclick="goPage(\'my-work\')">‹ '+esc2(tl('งานของฉัน','My Work'))+'</button>'
   +'<div class="fw-head-main"><b>'+esc2(c.ticket||c.id)+'</b>'
   +'<small>'+esc2(c.customer||'-')+'</small></div>'
   +(c.priority==='ด่วนมาก'?'<span class="fw-urgent">'+esc2(tl('ด่วนมาก','Urgent'))+'</span>':'')
   +'</div>';
 }

 /* ----------------------------------------------------------- 5. the buttons ---- */
 function actionsHTML(c){
  var mapReady=true;
  try{mapReady=!!(settings.mapConfig&&settings.mapConfig.enabled)}catch(e){}
  /* เตือนลูกค้า was removed from this row on request. sendCustomerReminder() only writes a
     local notification addressed to nobody — it sends the customer nothing — so on the
     technician's own screen it read as an action that had happened when none had. The
     function is untouched and still reachable from the coordinator's case list. */
  var b=[
   ['📍',tl('Check-in','Check-in'),'fieldCheckIn('+imodeJsArg(c.id)+')',''],
   ['🗺',tl('นำทาง','Navigate'),'openMapForCase('+imodeJsArg(c.id)+')',mapReady?'':' muted-btn'],
   ['📞',tl('โทรลูกค้า','Call'),'callCaseCustomer('+imodeJsArg(c.id)+')',''],
   ['📅',tl('ปฏิทินงาน','Calendar'),'goPage(\'calendar\')','']
  ];
  return '<div class="fw-actions">'+b.map(function(x){
   return '<button type="button" class="fw-action'+x[3]+'" onclick="'+x[2]+'">'
    +'<span aria-hidden="true">'+x[0]+'</span><b>'+esc2(x[1])+'</b></button>';
  }).join('')+'</div>';
 }

 /* ------------------------------------------------------- 6. machine information ---- */
 function machineHTML(c){
  var m=null,cu=null,w=null,state='none';
  try{m=machineById(c.machineId)}catch(e){}
  try{cu=customerById(c.customerId)}catch(e){}
  if(m){try{w=latestWarrantyForMachine(m.id);state=w?warrantyState(w):'none'}catch(e){}}
  /* The documented image priority: the machine's own photo, then a family reference shown
     contain, then No Image. A reference is displayed only — it is never written back. */
  var own=String((m&&m.photo)||'').trim(),ref='';
  if(!own&&m){try{ref=machineFamilyPhoto(m)||''}catch(e){ref=''}}
  var src=own||ref;
  var wLabel=w&&typeof warrantyStateLabel==='function'?warrantyStateLabel(state):tl('ยังไม่มี Warranty','No warranty on record');
  var rows=[
   [tl('เครื่องจักร','Machine'),(m&&(m.name||m.nameTh))||c.machine||'-'],
   [tl('โมเดล','Model'),(m&&m.model)||c.model||'-'],
   [tl('ซีเรียล','Serial'),(m&&m.serial)||c.serial||'-'],
   [tl('ลูกค้า','Customer'),(cu&&cu.name)||c.customer||'-'],
   [tl('สถานที่','Location'),(cu&&(cu.address||cu.location))||c.location||'-'],
   [tl('นัดหมาย','Appointment'),c.appointment?fmtAny(c.appointment):tl('ยังไม่นัดหมาย','Not scheduled')],
   [tl('ประเภทงาน','Work type'),(typeof inferWorkType==='function'?inferWorkType(c):c.serviceType)||'-'],
   [tl('การรับประกัน','Warranty'),wLabel]
  ].map(function(r){
   return '<div class="fw-mrow"><dt>'+esc2(r[0])+'</dt><dd>'+esc2(r[1])+'</dd></div>';
  }).join('');
  return '<div class="panel fw-machine">'
   +'<div class="panel-head"><div><h3>'+esc2(tl('ข้อมูลเครื่อง','Machine information'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('ข้อมูลเครื่องและงานที่ลูกค้าแจ้ง','The machine and what the customer reported'))+'</p></div></div>'
   +'<div class="fw-mbody">'
   +'<div class="fw-mphoto">'+(src
      ?'<img src="'+esc2(src)+'" alt="'+esc2((m&&m.name)||'Machine')+'" class="'+(ref?'is-reference':'')+'" loading="lazy">'
       +(ref?'<small>'+esc2(tl('ภาพอ้างอิงรุ่น','Reference image'))+'</small>':'')
      :'<div class="fw-noimg">No Image</div>')+'</div>'
   +'<dl class="fw-mrows">'+rows+'</dl>'
   +'</div>'
   +'<div class="fw-issue"><small>'+esc2(tl('ปัญหาที่ลูกค้าแจ้ง','Reported problem'))+'</small>'
   +'<p>'+esc2(c.issue||tl('ไม่มีรายละเอียด','No description'))+'</p>'
   +(c.note?'<p class="fw-note">'+esc2(c.note)+'</p>':'')+'</div>'
   +'</div>';
 }

 /* ------------------------------------------- 7. the inspection sheet, on the page ---- */
 /* openServiceReport() builds the sheet and hands it to openModal(). Rather than keeping a
    second copy of that long form here, openModal is intercepted for the length of that one
    call and the body is put into the page instead. This script loads last, so this wrapper
    is the outermost one and the modal-history stack in js/29 is never entered. */
 var capture=null;
 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title,sub,body){
   if(capture){
    var host=capture;
    capture=null;
    host.innerHTML=String(body==null?'':body);
    /* caseContextLinks() opens the sheet with Service Case / ลูกค้า / เครื่องจักร /
       Google Maps / Warranty / เอกสาร. In a popup those make sense. Here they are wrong
       twice over: the page above already shows the machine card, the customer address and
       the case, and every one of those buttons runs closeModal() — a no-op on a page — and
       then navigates away, so a technician who taps one mid-inspection loses everything
       typed into the sheet. Removed from the page copy only; the two popups keep theirs. */
    try{
     var bar=host.querySelector('.context-link-bar');
     if(bar)bar.remove();
    }catch(e){}
    return;
   }
   return baseOpenModal.apply(this,arguments);
  };
 }

 /* Item 9: a technician opening a blank sheet had nothing to go on. Each free-text field
    gets a worked example as its placeholder, plus one-tap example sentences underneath —
    tapping one writes it into the field so it can be edited rather than typed from
    nothing. Examples only; nothing is filled in automatically. */
 var EXAMPLES={
  srDiagnosis:{
   ph:tl('เช่น ตรวจพบ Error E-04 ขณะเดินเครื่อง วัดกระแสมอเตอร์สูงกว่าค่ามาตรฐาน 15% ลูกปืนด้านขับมีเสียงดังผิดปกติ',
         'e.g. Error E-04 during operation; motor current 15% above spec; drive-end bearing noisy'),
   list:[
    tl('ตรวจพบ Error E-04 ขณะเดินเครื่อง วัดกระแสมอเตอร์สูงกว่าค่ามาตรฐาน 15%','Error E-04 while running; motor current 15% over spec'),
    tl('ลูกปืนด้านขับมีเสียงดังผิดปกติ และมีความร้อนสะสมที่ตัวเรือน','Drive-end bearing noisy with heat build-up on the housing'),
    tl('แรงดันลมตกระหว่างทำงาน ตรวจพบรอยรั่วที่ข้อต่อชุดจ่ายลม','Air pressure dropping; leak found at the supply coupling')
   ]
  },
  srWork:{
   ph:tl('เช่น เปลี่ยนลูกปืน 6205ZZ จำนวน 2 ตัว ทำความสะอาดชุดกรอง ตั้งศูนย์เพลาใหม่ และทดสอบเดินเครื่อง 30 นาที',
         'e.g. replaced 2x 6205ZZ bearings, cleaned the filter set, re-aligned the shaft, 30-minute test run'),
   list:[
    tl('เปลี่ยนลูกปืน 6205ZZ จำนวน 2 ตัว และอัดจาระบีตามคู่มือ','Replaced 2x 6205ZZ bearings and greased to the manual'),
    tl('ทำความสะอาดชุดกรองและไส้กรอง ตรวจสอบระบบระบายความร้อน','Cleaned the filter set and element; checked the cooling system'),
    tl('ตั้งศูนย์เพลาใหม่ ขันแน่นตามค่าทอร์ก และทดสอบเดินเครื่อง 30 นาที','Re-aligned the shaft, torqued to spec, 30-minute test run')
   ]
  },
  srRecommend:{
   ph:tl('เช่น แนะนำ PM ครั้งถัดไปภายใน 3 เดือน และควรสำรองลูกปืนชุดเดียวกันไว้ 1 ชุด',
         'e.g. next PM within 3 months; keep one spare bearing set on site'),
   list:[
    tl('แนะนำ PM ครั้งถัดไปภายใน 3 เดือน','Next PM within 3 months'),
    tl('ควรสำรองอะไหล่ชุดเดียวกันไว้ 1 ชุดที่หน้างาน','Keep one spare set of the same parts on site'),
    tl('แนะนำให้ลูกค้าตรวจเช็กแรงดันลมทุกสัปดาห์และบันทึกค่าไว้','Ask the customer to check and log air pressure weekly')
   ]
  }
 };
 function applyExamples(root){
  Object.keys(EXAMPLES).forEach(function(id){
   var el=(root||document).querySelector('#'+id);
   if(!el||el.dataset.fwExamples)return;
   el.dataset.fwExamples='1';
   el.setAttribute('placeholder',EXAMPLES[id].ph);
   var box=document.createElement('div');
   box.className='fw-examples';
   box.innerHTML='<small>'+esc2(tl('ตัวอย่างข้อความ (กดเพื่อใส่)','Example text — tap to insert'))+'</small>'
    +EXAMPLES[id].list.map(function(t){
      return '<button type="button" class="fw-example">'+esc2(t)+'</button>';
     }).join('');
   el.parentNode.insertBefore(box,el.nextSibling);
   box.querySelectorAll('.fw-example').forEach(function(btn){
    btn.onclick=function(){
     var cur=String(el.value||'').trim();
     el.value=cur?cur+'\n'+btn.textContent:btn.textContent;
     el.focus();
    };
   });
  });
  /* The checklist note boxes get one shared hint rather than three sentences each. */
  var notes=(root||document).querySelectorAll('[id^="srn"]');
  for(var i=0;i<notes.length;i++){
   if(notes[i].getAttribute('placeholder'))continue;
   notes[i].setAttribute('placeholder',tl('เช่น ค่าที่วัดได้ / สิ่งที่พบ','e.g. measured value / what was found'));
  }
 }
 /* The modal sheet gets the same examples, so the two entry points read alike. */
 var baseOpenReport=window.openServiceReport;
 if(typeof baseOpenReport==='function'){
  window.openServiceReport=function(cid){
   /* Never let the page copy and a modal copy of the sheet share ids. */
   if(!capture){
    var inline=document.getElementById('fwReport');
    if(inline&&inline.querySelector('#serviceReportForm')){inline.innerHTML='';inline.removeAttribute('data-case')}
   }
   var r=baseOpenReport.apply(this,arguments);
   try{applyExamples(document)}catch(e){}
   return r;
  };
 }

 function renderReportInto(host,cid){
  if(typeof window.openServiceReport!=='function'){
   host.innerHTML='<div class="empty">'+esc2(tl('ยังเปิดใบตรวจไม่ได้','The inspection sheet is not available'))+'</div>';
   return;
  }
  host.innerHTML='';
  capture=host;
  try{window.openServiceReport(cid)}catch(e){}
  capture=null;
  if(!host.querySelector('#serviceReportForm')){
   /* requirePermission() inside openServiceReport() refused, or the case vanished. */
   host.innerHTML='<div class="empty">'+esc2(tl('บัญชีนี้ไม่มีสิทธิ์บันทึกใบตรวจงานช่าง','This account may not fill in the inspection sheet'))+'</div>';
   host.removeAttribute('data-case');
   return;
  }
  /* ยกเลิก closes a modal; on a page there is nothing to close. */
  host.querySelectorAll('button[onclick="closeModal()"]').forEach(function(b){b.remove()});
  applyExamples(host);
 }

 /* ------------------------------------------------------- 8. the page itself ---- */
 function ensureShell(){
  var page=document.getElementById('page-field-service');
  if(!page)return null;
  var ws=document.getElementById('fieldWorkspace');
  if(ws)return ws;
  ws=document.createElement('div');
  ws.id='fieldWorkspace';
  ws.className='fw-wrap';
  ws.innerHTML='<div id="fwHead"></div><div id="fwStatus"></div><div id="fwActionBar"></div>'
   +'<div id="fwMachine"></div>'
   +'<div class="panel fw-reportpanel"><div class="panel-head"><div><h3>'+esc2(tl('ใบตรวจงานช่าง','Technician inspection sheet'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('กรอกผลตรวจ งานที่ทำ อะไหล่ รูปก่อน/หลัง และลายเซ็น แล้วกดบันทึก / จบงาน',
                                  'Findings, work done, parts, before/after photos and signatures, then save'))+'</p></div></div>'
   +'<div id="fwReport"></div></div>';
  page.insertBefore(ws,page.firstChild);
  return ws;
 }
 function chrome(show){
  var page=document.getElementById('page-field-service');
  if(!page)return;
  ['.field-hero','.field-kpi-grid','.field-layout'].forEach(function(sel){
   var el=page.querySelector(sel);
   if(el)el.classList.toggle('fw-hidden',!show);
  });
 }

 function renderWorkspace(){
  var page=document.getElementById('page-field-service');
  if(!page)return;
  if(!jobId)jobId=autoPick();
  var c=activeCase();
  var ws=document.getElementById('fieldWorkspace');

  if(!c){
   /* Nothing to show as a single job: the original list is the right fallback, and it is
      also what an admin previewing a technician's queue expects. */
   if(ws){ws.classList.add('fw-hidden');var rep=document.getElementById('fwReport');if(rep){rep.innerHTML='';rep.removeAttribute('data-case')}}
   chrome(true);
   return;
  }
  ws=ensureShell();
  if(!ws)return;
  ws.classList.remove('fw-hidden');
  chrome(false);

  document.getElementById('fwHead').innerHTML=headHTML(c);
  document.getElementById('fwStatus').innerHTML=statusHTML(c);
  document.getElementById('fwActionBar').innerHTML=actionsHTML(c);
  document.getElementById('fwMachine').innerHTML=machineHTML(c);

  ws.querySelectorAll('.fw-next').forEach(function(btn){
   btn.onclick=function(){advance(c.id,btn.getAttribute('data-status'))};
  });
  ws.querySelectorAll('.fw-stepback').forEach(function(btn){
   btn.onclick=function(){
    var to=btn.getAttribute('data-status');
    var ask=typeof window.imodeConfirm==='function'
     ?window.imodeConfirm({title:tl('ย้อนสถานะหน้างาน?','Step back?'),message:tl('ย้อนกลับไปที่ "','Go back to "')+to+tl('" ระบบจะแจ้งในแชทของเคสนี้ด้วย','"? The case chat will show it.'),okText:tl('ย้อนกลับ','Go back')})
     :Promise.resolve(window.confirm(tl('ย้อนกลับไปที่ ','Go back to ')+to+' ?'));
    ask.then(function(ok){if(ok)advance(c.id,to)});
   };
  });

  /* The sheet is rebuilt only when it is not already the sheet for this case. renderAll()
     runs on every save and on every cloud sync; rebuilding here would throw away whatever
     the technician had typed but not yet saved, and reset both signature pads. */
  var report=document.getElementById('fwReport');
  if(report&&(report.getAttribute('data-case')!==c.id||!report.querySelector('#serviceReportForm'))){
   report.setAttribute('data-case',c.id);
   renderReportInto(report,c.id);
  }
 }
 window.imodeRenderFieldWorkspace=renderWorkspace;

 var baseRenderField=window.renderFieldService;
 if(typeof baseRenderField==='function'){
  window.renderFieldService=function(){
   var r=baseRenderField.apply(this,arguments);
   try{renderWorkspace()}catch(e){}
   return r;
  };
 }
 /* Leaving หน้างาน drops the selection, so coming back from anywhere else re-picks the
    current job rather than reopening a job that may since have been closed. */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(name){
   if(name!=='field-service')jobId='';
   var r=baseGoPage.apply(this,arguments);
   try{
    var active=(document.querySelector('.page.active')||{}).id||'';
    if(active==='page-field-service')renderWorkspace();
    if(active==='page-my-work')wireMyWork();
   }catch(e){}
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70FieldWorkspaceStyle';
 st.textContent=''
 /* Specificity, not just !important: css/01 sets `.field-hero.hero-digital{display:flex
    !important}` — two classes plus !important — so a single-class rule loses to it even
    with !important of its own. The same trap as `.panel[hidden]` and the โมดูลทั้งหมด grid
    recorded earlier in this project. */
 +'.fw-hidden,.field-hero.hero-digital.fw-hidden,.field-kpi-grid.fw-hidden,.field-layout.fw-hidden,'
 /* css/11 has `#page-field-service>.field-kpi-grid{display:grid!important}` inside the
    mobile block — an id beats any number of classes, so the phone kept showing the KPI
    tiles while the desktop hid them. These three carry the id too. */
 +'#page-field-service>.field-hero.fw-hidden,#page-field-service>.field-kpi-grid.fw-hidden,'
 +'#page-field-service>.field-layout.fw-hidden{display:none!important}'
 +'.fw-wrap{display:flex;flex-direction:column;gap:14px}'
 /* header */
 +'.fw-head{display:flex;align-items:center;gap:11px;flex-wrap:wrap}'
 +'.fw-back{border:1px solid #d3e0f4;background:#fff;color:#0b3f9e;border-radius:11px;padding:8px 13px;font-size:13px;font-weight:800;cursor:pointer}'
 +'.fw-back:hover{border-color:#0b63e5}'
 +'.fw-back:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.fw-head-main{display:flex;flex-direction:column;min-width:0;flex:1}'
 +'.fw-head-main b{font-size:17px;color:#0c225e;line-height:1.25}'
 +'.fw-head-main small{font-size:12px;color:#5b6b88}'
 +'.fw-urgent{flex:none;font-size:11px;font-weight:800;color:#b32020;background:#fdeaea;border:1px solid #f6cccc;border-radius:999px;padding:3px 11px}'
 /* status bar */
 +'.fw-statusbar{border:1px solid #d9e6fa;border-radius:16px;background:linear-gradient(180deg,#f7fbff,#eef4ff);padding:14px}'
 +'.fw-statusnow{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}'
 +'.fw-statusnow small{width:100%;font-size:11px;color:#7385a5}'
 +'.fw-statusnow b{font-size:19px;color:#0c225e}'
 +'.fw-casestatus{font-size:11px;font-weight:700;color:#123a80;background:#fff;border:1px solid #dce8fa;border-radius:999px;padding:2px 10px}'
 +'.fw-ladder{list-style:none;margin:12px 0 0;padding:0 0 4px;display:flex;gap:6px;overflow-x:auto}'
 +'.fw-ladder li{flex:none;display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e2ecfb;border-radius:999px;background:#fff;color:#8195b4;font-size:11px}'
 +'.fw-ladder li span{width:18px;height:18px;border-radius:50%;background:#eef4ff;color:#5b7095;display:grid;place-items:center;font-size:10px;font-weight:800}'
 +'.fw-ladder li.is-done{color:#0b7a45;border-color:#cdebd9;background:#f2fbf6}'
 +'.fw-ladder li.is-done span{background:#dff3e8;color:#0b7a45}'
 +'.fw-ladder li.is-now{color:#0b3f9e;border-color:#b9d2f4;background:#eef4ff;font-weight:800}'
 +'.fw-ladder li.is-now span{background:#0b63e5;color:#fff}'
 +'.fw-stepactions{display:flex;flex-wrap:wrap;gap:9px;margin-top:13px}'
 +'.fw-final{align-self:center;color:#7385a5;font-size:12.5px}'
 /* action buttons */
 +'.fw-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px}'
 +'.fw-action{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border:1px solid #e2ecfb;'
 +'border-radius:14px;background:#fff;cursor:pointer;box-shadow:0 4px 0 #e5edfa;transition:transform .12s ease,box-shadow .12s ease}'
 +'.fw-action span{font-size:20px;line-height:1}'
 +'.fw-action b{font-size:12px;color:#0c225e;font-weight:700;text-align:center}'
 +'.fw-action:hover{transform:translateY(-2px);box-shadow:0 6px 0 #dde8f8}'
 +'.fw-action:active{transform:translateY(3px);box-shadow:0 1px 0 #dde8f8}'
 +'.fw-action:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.fw-action.muted-btn{opacity:.55}'
 /* machine card */
 +'.fw-mbody{display:grid;grid-template-columns:200px 1fr;gap:16px;padding:14px}'
 +'.fw-mphoto{display:flex;flex-direction:column;gap:5px}'
 +'.fw-mphoto img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#f4f8ff;border:1px solid #e2ecfb}'
 +'.fw-mphoto img.is-reference{object-fit:contain;padding:6px}'
 +'.fw-mphoto small{font-size:10.5px;color:#7385a5;text-align:center}'
 +'.fw-noimg{width:100%;aspect-ratio:4/3;display:grid;place-items:center;border-radius:12px;background:#f4f8ff;border:1px dashed #cfe0fa;color:#8195b4;font-size:12px}'
 +'.fw-mrows{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px 16px}'
 +'.fw-mrow{border-bottom:1px dashed #eaf1fb;padding-bottom:6px}'
 +'.fw-mrow dt{font-size:10.5px;color:#7385a5;text-transform:uppercase;letter-spacing:.03em}'
 +'.fw-mrow dd{margin:2px 0 0;font-size:13px;color:#0c225e;font-weight:600;word-break:break-word}'
 +'.fw-issue{margin:0 14px 14px;padding:12px 14px;border-radius:12px;background:#fff8ef;border:1px solid #f5e0c4}'
 +'.fw-issue small{display:block;font-size:11px;font-weight:800;color:#9a6516}'
 +'.fw-issue p{margin:5px 0 0;font-size:13px;line-height:1.55;color:#4a3a22}'
 +'.fw-issue .fw-note{color:#8a7455;font-size:12px}'
 /* the sheet on the page */
 +'.fw-reportpanel #fwReport{padding:14px}'
 +'.fw-examples{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}'
 +'.fw-examples small{width:100%;font-size:10.5px;color:#7385a5}'
 +'.fw-example{text-align:left;font-size:11.5px;line-height:1.4;color:#0b3f9e;background:#f2f7ff;border:1px dashed #c6dbf8;'
 +'border-radius:10px;padding:6px 10px;cursor:pointer;max-width:100%}'
 +'.fw-example:hover{background:#e7f0ff;border-style:solid}'
 +'.fw-example:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* งานของฉัน rows */
 +'.fw-rowlink{cursor:pointer;transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}'
 +'.fw-rowlink:hover{border-color:#0b63e5;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,99,229,.12)}'
 +'.fw-rowlink:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.fw-go{font-size:12px;font-weight:800;color:#0b63e5;white-space:nowrap}'
 +'@media (max-width:900px){.fw-mbody{grid-template-columns:1fr}.fw-mphoto img,.fw-noimg{max-width:280px}}'
 +'@media (max-width:640px){.fw-statusnow b{font-size:17px}.fw-actions{grid-template-columns:repeat(auto-fit,minmax(88px,1fr))}'
 +'.fw-action b{font-size:11px}.fw-reportpanel #fwReport{padding:11px}}'
 +'@media (prefers-reduced-motion:reduce){.fw-action,.fw-rowlink{transition:none}'
 +'.fw-action:hover,.fw-action:active,.fw-rowlink:hover{transform:none}}';
 document.head.appendChild(st);

 function install(){
  try{wireMyWork()}catch(e){}
  try{if((document.querySelector('.page.active')||{}).id==='page-field-service')renderWorkspace()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
