/* Beta Service focus — case flow: intake clock, assignment notice, status stepper.

   Three reported problems, all about a case moving from intake to a technician:

     1. A new case sat in the list with nothing saying how long the office had to answer
        it. Every open, unassigned case now carries a response clock on its own row —
        30 minutes by default — and the row turns light red in the last 10.

     2. Assigning a case notified the technician only on the device that did the
        assigning. notifications are written into the local `notifications` array and
        js/03 never uploads that table (syncCloud downloads it, cloudUpsert is never
        called for it), so the notice never left the coordinator's PC. The fix is not to
        start syncing a notification table: the case itself already travels, and its
        `assignee` is the whole message. The notice is derived from the case, exactly the
        way buildNotifications() already derives appointment and urgent notices, so every
        device that has the case computes the same one.

     3. Changing a field status was a free dropdown of nine values, and finishing a case
        made it vanish from the technician's list. The dropdown is now a one-tap
        "next status" stepper (the full list is still there, one disclosure away, because
        the workflow branches and a technician sometimes has to go back), and closed jobs
        move into a collapsed group instead of disappearing. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 function tl(th,en){return (settings.language==='en')?en:th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function caseById(id){return caseList().filter(function(c){return c.id===id})[0]||null}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function isClosed(c){return ['เสร็จสิ้น','ปิดเคส'].indexOf(c.status)>=0}

 /* =========================================================================
    1. Response clock on a new case
    ========================================================================= */
 /* Tunable, and stored with everything else rather than in a key of its own. */
 function slaCfg(){
  var c=settings.slaResponse;
  if(!c||typeof c!=='object'){c={minutes:30,warnMinutes:10};settings.slaResponse=c}
  return {minutes:Number(c.minutes)||30,warnMinutes:Number(c.warnMinutes)||10};
 }
 /* Only a case nobody has picked up yet is on the clock. Assigning it stops the clock,
    which is the point: the clock measures the office's response, not the repair. */
 /* c.respondedAt is stamped by the ตอบกลับแล้ว button in js/48. The clock measures how long the
    office took to answer, so answering is what settles it — not assigning, which happens
    later and used to be the only way to stop the count. */
 function onClock(c){
  return !!c&&!c.assignee&&!c.respondedAt&&!isClosed(c)&&c.status==='เคสใหม่'&&!!c.createdAt;
 }
 function remainingMs(c){
  var cfg=slaCfg();
  return new Date(c.createdAt).getTime()+cfg.minutes*60000-Date.now();
 }
 function clockText(ms){
  var over=ms<0,a=Math.abs(ms);
  var m=Math.floor(a/60000),s=Math.floor((a%60000)/1000);
  var t=m+':'+(s<10?'0':'')+s;
  return over?tl('เกินกำหนด ','Overdue by ')+t:t;
 }
 function chipHTML(c){
  var cfg=slaCfg();
  return '<span class="case-sla-chip" data-case-sla="'+esc2(c.id)+'">'
   +'<i aria-hidden="true">⏱</i>'
   +'<b>'+esc2(tl('ตอบกลับภายใน '+cfg.minutes+' นาที','Respond within '+cfg.minutes+' min'))+'</b>'
   +'<u data-sla-count>'+esc2(clockText(remainingMs(c)))+'</u></span>';
 }
 /* State is written on the chip and on whatever row contains it, so the tick only ever
    touches text and two class names — it never re-renders a list. */
 function paintChip(el){
  var c=caseById(el.getAttribute('data-case-sla'));
  var host=el.closest('tr,.mobile-data-card,.work-row');
  if(!c||!onClock(c)){
   el.remove();
   if(host){host.classList.remove('sla-warn');host.classList.remove('sla-over')}
   return;
  }
  var ms=remainingMs(c),cfg=slaCfg();
  var warn=ms<=cfg.warnMinutes*60000,over=ms<0;
  var n=el.querySelector('[data-sla-count]');
  if(n)n.textContent=clockText(ms);
  el.classList.toggle('is-warn',warn&&!over);
  el.classList.toggle('is-over',over);
  if(host){host.classList.toggle('sla-warn',warn&&!over);host.classList.toggle('sla-over',over)}
 }
 function tick(){document.querySelectorAll('[data-case-sla]').forEach(paintChip)}

 /* The lists are rebuilt by innerHTML on every render, so the chip is put back after
    each one rather than being written into js/03's row templates. */
 function decorate(){
  document.querySelectorAll('#caseTable tr[data-case-id],#caseCards [data-case-id],#page-assign .work-row[data-case]').forEach(function(row){
   var id=row.getAttribute('data-case-id')||row.getAttribute('data-case');
   var c=caseById(id);
   if(!c||!onClock(c)){
    row.classList.remove('sla-warn');row.classList.remove('sla-over');
    var old=row.querySelector('[data-case-sla]');if(old)old.remove();
    return;
   }
   if(row.querySelector('[data-case-sla]'))return;
   var slot=row.matches('tr')?row.querySelector('td:first-child')
          :(row.querySelector('.work-row-main')||row.querySelector('.card-top')||row);
   if(slot)slot.insertAdjacentHTML('beforeend',chipHTML(c));
  });
  tick();
 }
 window.imodeDecorateSla=decorate;

 /* =========================================================================
    2. "You have been assigned" — derived, so it survives the trip to another device
    ========================================================================= */
 /* Announced while the case is still waiting to be started. Once the technician moves it
    on (Check-in, a field status, a report) the notice has done its job and clears itself,
    so the list does not fill up with one row per case they hold. */
 function assignedNotices(){
  var tid=myTechId();
  if(!tid)return [];
  var out=[];
  caseList().forEach(function(c){
   /* 2026-09-16: the crew, not only the lead — a second technician on the job was never told
      they had been given it, because js/38 stores the crew in one comma-separated column. */
   var onIt=(typeof window.imodeIsAssignedTo==='function')
    ? window.imodeIsAssignedTo(c,tid) : c.assignee===tid;
   if(!onIt||isClosed(c))return;
   if(['มอบหมายแล้ว','นัดหมายแล้ว'].indexOf(c.status)<0)return;
   out.push({
    key:'auto_assigned_'+c.id,
    icon:'🧾',
    title:tl('คุณได้รับมอบหมายงาน','Work assigned to you'),
    /* 2026-09-25: raw on purpose - the sink escapes. See js/16's note. */
    message:(c.ticket||c.id)+' · '+(c.customer||'-')+' · '+(c.machine||'-')
      +(c.appointment&&typeof fmt==='function'?' · '+esc2(fmt(c.appointment)):''),
    createdAt:c.updatedAt||c.createdAt,
    caseId:c.id,
    audience:'technician',
    technicianId:tid,
    read:false
   });
  });
  return out;
 }
 /* A stored notice written on this device for the same case would otherwise be shown
    twice — once as itself, once as the derived one. */
 function dedupe(list){
  var seen={};
  return list.filter(function(n){
   if(String(n.key||'').indexOf('auto_assigned_')!==0&&n.caseId&&n.audience==='technician'){
    seen['assigned_'+n.caseId]=true;
   }
   return true;
  }).filter(function(n){
   if(String(n.key||'').indexOf('auto_assigned_')!==0)return true;
   return !seen['assigned_'+n.caseId];
  });
 }
 var baseBuild=window.buildNotifications;
 if(typeof baseBuild==='function'){
  window.buildNotifications=function(){
   var all=baseBuild.apply(this,arguments)||[];
   return dedupe(assignedNotices().concat(all)).sort(function(a,b){
    return new Date(b.createdAt||0)-new Date(a.createdAt||0);
   });
  };
 }

 /* =========================================================================
    3. Field status: one step at a time
    ========================================================================= */
 /* The main path skips รออะไหล่ deliberately — waiting for parts is a branch, not a
    stage every job passes through — and รออะไหล่ is offered as its own button instead. */
 var MAIN=['กำลังเดินทาง','ถึงหน้างาน','เริ่มตรวจเช็ก','กำลัง PM / Maintenance',
           'กำลังซ่อม Service','ทดสอบเครื่อง','รอลูกค้าตรวจรับ','จบงาน'];
 var HOLD='รออะไหล่';
 function nextStatus(cur){
  if(!cur)return MAIN[0];
  if(cur===HOLD)return 'กำลังซ่อม Service';       /* parts arrived: back to the repair */
  var i=MAIN.indexOf(cur);
  if(i<0)return MAIN[0];
  return i>=MAIN.length-1?'':MAIN[i+1];
 }
 /* Exported so the single-job หน้างาน page in js/32 draws the same ladder from the same
    list instead of keeping a second copy of the field workflow. */
 window.imodeFieldSteps=function(){return MAIN.slice()};
 window.imodeFieldHoldStatus=HOLD;
 window.imodeFieldNextStatus=nextStatus;
 function stepperHTML(c){
  var cur=c.fieldStatus||'',nx=nextStatus(cur);
  var steps=MAIN.map(function(s,i){
   var done=cur&&MAIN.indexOf(cur)>i,now=s===cur;
   return '<li class="'+(now?'is-now':done?'is-done':'')+'"><span>'+(i+1)+'</span><b>'+esc2(s)+'</b></li>';
  }).join('');
  var buttons='';
  if(nx){
   buttons+='<button type="button" class="primary-btn action-3d-orange fsx-next" data-status="'+esc2(nx)+'">'
     +esc2(tl('ถัดไป: ','Next: '))+esc2(nx)+' →</button>';
  }else{
   buttons+='<p class="fsx-final">'+esc2(tl('อยู่ขั้นสุดท้ายของงานหน้างานแล้ว','This is the last field step'))+'</p>';
  }
  if(cur!==HOLD&&nx)buttons+='<button type="button" class="soft-btn fsx-next" data-status="'+esc2(HOLD)+'">📦 '+esc2(HOLD)+'</button>';
  return '<div class="fsx-wrap">'
   +'<div class="fsx-head"><small>'+esc2(tl('สถานะปัจจุบัน','Current status'))+'</small>'
   +'<b>'+esc2(cur||tl('ยังไม่เริ่ม','Not started'))+'</b></div>'
   +'<ol class="fsx-steps">'+steps+'</ol>'
   +'<div class="fsx-actions">'+buttons+'</div>'
   +'<details class="fsx-manual"><summary>'+esc2(tl('เลือกสถานะเอง','Pick a status manually'))+'</summary>'
   +'<select id="fieldStatusSelect">'
   + MAIN.concat([HOLD]).map(function(s){return '<option'+(cur===s?' selected':'')+'>'+esc2(s)+'</option>'}).join('')
   +'</select></details></div>';
 }
 /* The original modal is rebuilt rather than wrapped because the dropdown it renders is
    the thing being replaced. Everything the save path reads keeps its id — the select is
    still there inside the disclosure, and fieldStatusNote / fieldStatusMediaGrid are
    untouched — so saveFieldStatus() in js/03 runs exactly as before. */
 var baseOpenField=window.openFieldStatusModal;
 if(typeof baseOpenField==='function'){
  window.openFieldStatusModal=function(cid){
   if(typeof requirePermission==='function'&&!requirePermission('field.status'))return;
   var c=caseById(cid);
   if(!c)return;
   try{pendingFieldStatusMedia=[]}catch(e){}
   var ctx=typeof window.caseContextLinks==='function'?window.caseContextLinks(c):'';
   openModal(tl('อัปเดตสถานะงาน','Update field status'),(c.ticket||'')+' · '+(c.customer||''),
    ctx
    +stepperHTML(c)
    +'<div class="field" style="margin-top:12px"><label>'+esc2(tl('รายละเอียด / สิ่งที่พบ','Notes / findings'))+'</label>'
    +'<textarea id="fieldStatusNote" placeholder="'+esc2(tl('เช่น ตรวจพบเสียงผิดปกติบริเวณ Motor...','e.g. unusual noise near the motor...'))+'"></textarea></div>'
    +'<div class="section-title">'+esc2(tl('หลักฐานสถานะงาน (รูป / วิดีโอ)','Evidence (photo / video)'))+'</div>'
    +'<label class="soft-btn" style="display:inline-block;cursor:pointer">📎 '+esc2(tl('เพิ่มรูปหรือวิดีโอ','Add photo or video'))
    +'<input type="file" accept="image/*,video/*" multiple style="display:none" onchange="addFieldStatusMedia(this)"></label>'
    +'<div id="fieldStatusMediaGrid" class="status-media-grid"></div>'
    +'<div class="button-row" style="margin-top:14px">'
    +'<button type="button" class="soft-btn" onclick="closeModal()">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
    +'<button type="button" class="soft-btn" onclick="saveFieldStatus('+imodeJsArg(c.id)+')">'
    +esc2(tl('บันทึกสถานะที่เลือก','Save selected status'))+'</button></div>',true);
   /* One step per press: point the select the save path reads at the chosen status, then
      hand over to the untouched saveFieldStatus(). */
   document.querySelectorAll('#modalBody .fsx-next').forEach(function(btn){
    btn.onclick=function(){
     var sel=document.getElementById('fieldStatusSelect');
     if(sel)sel.value=btn.getAttribute('data-status');
     if(typeof window.saveFieldStatus==='function')window.saveFieldStatus(c.id);
    };
   });
  };
 }

 /* =========================================================================
    4. Nothing disappears when a job is closed
    ========================================================================= */
 /* renderFieldService() drops any case at ปิดเคส, so finishing a job made it vanish from
    the technician's only screen. The closed ones are appended in a collapsed group. */
 var baseRenderField=window.renderFieldService;
 if(typeof baseRenderField==='function'){
  window.renderFieldService=function(){
   var r=baseRenderField.apply(this,arguments);
   try{
    var host=document.getElementById('fieldJobs');
    if(!host)return r;
    var tid=(typeof fieldTechId!=='undefined'&&fieldTechId)||myTechId();
    var done=caseList().filter(function(c){
     var onIt=(typeof window.imodeIsAssignedTo==='function')
      ? window.imodeIsAssignedTo(c,tid) : c.assignee===tid;
     return onIt&&c.status==='ปิดเคส';
    });
    var old=document.getElementById('fieldClosedBox');
    if(old)old.remove();
    if(!done.length)return r;
    var box=document.createElement('details');
    box.id='fieldClosedBox';
    box.className='field-closed-box';
    box.innerHTML='<summary>'+esc2(tl('งานที่ปิดแล้ว','Closed jobs'))+' ('+done.length+')</summary>'
      +'<div class="field-closed-list">'+done.map(function(c){
        return '<div class="field-closed-row"><b>'+esc2(c.ticket||c.id)+'</b>'
         +'<small>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+'</small>'
         +'<button type="button" class="mini-btn" onclick="imodeOpenCase('+imodeJsArg(c.id)+')">'
         +esc2(tl('รายละเอียด','Details'))+'</button></div>';
       }).join('')+'</div>';
    host.parentNode.insertBefore(box,host.nextSibling);
   }catch(e){}
   return r;
  };
 }
 /* One name every list can call to open a case, so the destination can change in one
    place. v70RowClickScript points it at the full-page case workspace. */
 if(typeof window.imodeOpenCase!=='function'){
  window.imodeOpenCase=function(id){
   if(typeof window.openCaseDetail==='function')window.openCaseDetail(id);
  };
 }

 /* renderAll() does not refresh งานของฉัน / มอบหมายงาน — they are rendered by the goPage
    wrapper in js/16 — so a status change made from either page left a stale list on
    screen. This is what "the job disappeared" looked like from the outside. */
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{
    var active=(document.querySelector('.page.active')||{}).id||'';
    if(active==='page-my-work'&&typeof window.imodeRenderMyWork==='function')window.imodeRenderMyWork();
    if(active==='page-assign'&&typeof window.imodeRenderAssign==='function')window.imodeRenderAssign();
    decorate();
   }catch(e){}
   return r;
  };
 }
 var baseRenderCases=window.renderCases;
 if(typeof baseRenderCases==='function'){
  window.renderCases=function(){
   var r=baseRenderCases.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }

 var style=document.createElement('style');
 style.id='v70CaseFlowStyle';
 style.textContent=''
 +'.case-sla-chip{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:3px 9px;border-radius:999px;'
 +'background:#eef4ff;border:1px solid #cfe0fa;color:#0b3f9e;font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap}'
 +'.case-sla-chip i{font-style:normal}'
 +'.case-sla-chip u{text-decoration:none;font-variant-numeric:tabular-nums;background:#fff;border-radius:999px;padding:0 7px;border:1px solid #dbe7f9}'
 +'.case-sla-chip.is-warn{background:#fff1f1;border-color:#f6c9c9;color:#a51f1f}'
 +'.case-sla-chip.is-warn u{border-color:#f3cccc}'
 +'.case-sla-chip.is-over{background:#ffe4e4;border-color:#f0b4b4;color:#8c1616}'
 +'tr.sla-warn>td,tr.sla-over>td{background:#fff4f4}'
 +'tr.sla-over>td{background:#ffecec}'
 +'.mobile-data-card.sla-warn,.work-row.sla-warn{background:#fff4f4;border-color:#f4cdcd}'
 +'.mobile-data-card.sla-over,.work-row.sla-over{background:#ffecec;border-color:#efb9b9}'
 +'.fsx-wrap{margin-top:14px}'
 +'.fsx-head{background:#f4f8ff;border:1px solid #e2ecfb;border-radius:12px;padding:10px 13px}'
 +'.fsx-head small{display:block;font-size:11px;color:#7385a5}'
 +'.fsx-head b{font-size:16px;color:#0c225e}'
 +'.fsx-steps{list-style:none;margin:12px 0 0;padding:0;display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}'
 +'.fsx-steps li{flex:none;display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e2ecfb;'
 +'border-radius:999px;background:#fff;color:#8195b4;font-size:11px}'
 +'.fsx-steps li span{width:18px;height:18px;border-radius:50%;background:#eef4ff;color:#5b7095;display:grid;place-items:center;font-size:10px;font-weight:800}'
 +'.fsx-steps li.is-done{color:#0b7a45;border-color:#cdebd9;background:#f2fbf6}'
 +'.fsx-steps li.is-done span{background:#dff3e8;color:#0b7a45}'
 +'.fsx-steps li.is-now{color:#0b3f9e;border-color:#b9d2f4;background:#eef4ff;font-weight:800}'
 +'.fsx-steps li.is-now span{background:#0b63e5;color:#fff}'
 +'.fsx-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:13px}'
 +'.fsx-final{margin:0;color:#7385a5;font-size:12.5px}'
 +'.fsx-manual{margin-top:11px}'
 +'.fsx-manual summary{cursor:pointer;color:#0b63e5;font-size:12.5px;font-weight:700}'
 +'.fsx-manual select{margin-top:8px;width:100%;padding:9px 10px;border:1px solid #d3e0f4;border-radius:10px}'
 +'.field-closed-box{margin-top:14px;border:1px solid #e2ecfb;border-radius:14px;background:#fbfdff;padding:10px 13px}'
 +'.field-closed-box summary{cursor:pointer;font-weight:800;color:#0c225e;font-size:13px}'
 +'.field-closed-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}'
 +'.field-closed-row{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:9px 11px;border:1px solid #e6eefb;border-radius:11px;background:#fff}'
 +'.field-closed-row b{color:#0c225e;font-size:13px}'
 +'.field-closed-row small{color:#5b6b88;font-size:11.5px;flex:1;min-width:140px}';
 document.head.appendChild(style);

 setInterval(function(){try{tick()}catch(e){}},1000);
 function install(){try{decorate()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
