/* Beta 1.0 — หน้างาน is ONE job for every role, and the whole queue gets a page of its own.

   REPORTED (item 2):
     "โมดุลหน้างานอะอยากให้โชว์แค่งานเดียว ทุก role เลย ซึ่งมันจะโชว์แค่งานที่เรากดดูจากเคสนั้นๆ
      เช่น กดดูหน้างาน เคส A จะโชว์แค่เคส A เลย พอเปลี่ยนหน้าและกดโมดุลหน้างานอีกครั้งก็จะเป็น
      เคส A อยู่ แต่ admin จะมีโมดุลใหม่คือหน้างานทั้งหมด"

   WHAT WAS ALREADY TRUE, checked before writing anything: js/32 has shown a technician one
   job since part 17, and remembers the last one in `imode_v70_field_last_job`. What it does
   NOT do is any of that for an account with no technicianId — its autoPick() returns '' for
   an admin, deliberately, so that ทีมช่าง could preview a technician's queue. That is why the
   admin still saw the old list of every job.

   So this file changes one thing and adds one page:

     1. AN ACCOUNT WITH NO technicianId ALSO GETS ONE JOB. The choice is made before js/32
        renders, through the setter js/32 exposes, so js/32's own screen does the drawing and
        there is one workspace, not two. A technician's path is not touched at all — the
        pre-work returns immediately when the account has a technicianId, so js/32's own
        rules (last job, then next appointment, own crew included) still decide.

     2. THE JOB STICKS. Opening หน้างาน from a case records it; opening the module again from
        the sidebar, the bottom bar or a Home card reopens the same one. Kept per ACCOUNT in
        `imode_v70_field_last_job_acct`, beside js/32's per-technician key rather than inside
        it, so neither can confuse the other. Device-local on purpose: it is a note about
        where somebody was looking and it must not travel.

     3. หน้างานทั้งหมด — a new page listing every open job, for the roles that hand work out.
        Nothing is lost by (1): what the admin used to see on หน้างาน is here, better, with a
        search box and a ช่าง filter, and a row opens that job's workspace.

   Gated on `case.assign`, DELIBERATELY AN EXISTING KEY. A file that pushes a new key into
   PERMISSION_CATALOG has to load before js/20, which repairs roles against the catalog as it
   stands at that moment; this one loads long after it, so a new key would be stripped from
   every role on every reload — the decay bug from part 14. PAGE_PERMISSION maps a page to an
   existing key and is safe to extend. Admin / Coordinator and both Lead roles hold
   case.assign; no plain technician does, which is what the request asks for.

   js/03 is not edited. js/32 gained one setter and nothing else. */
(function(){
 'use strict';

 var PAGE='field-all';
 var PERM='case.assign';
 var ACCT_KEY='imode_v70_field_last_job_acct';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function techList(){try{return Array.isArray(technicians)?technicians:[]}catch(e){return[]}}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function acctKey(){
  try{return String((currentUser&&(currentUser.username||currentUser.id))||'guest')}
  catch(e){return 'guest'}
 }
 function fmtAny(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}
 function isClosed(c){
  if(typeof window.imodeCaseIsClosed==='function')return window.imodeCaseIsClosed(c);
  return ['เสร็จสิ้น','ปิดเคส'].indexOf(String((c&&c.status)||''))>=0;
 }
 function onCase(c,tid){
  if(!tid)return false;
  if(typeof window.imodeIsAssignedTo==='function')return window.imodeIsAssignedTo(c,tid);
  return c.assignee===tid;
 }
 function can(k){
  try{return typeof canPermission==='function'?!!canPermission(k):true}catch(e){return true}
 }

 /* ------------------------------------------------- 1. the remembered job ---- */
 function readMap(){
  try{return JSON.parse(localStorage.getItem(ACCT_KEY)||'{}')||{}}catch(e){return {}}
 }
 function remember(id){
  if(!id)return;
  try{
   var m=readMap(),k=acctKey();
   if(m[k]===id)return;
   m[k]=id;
   localStorage.setItem(ACCT_KEY,JSON.stringify(m));
  }catch(e){}
 }
 /* The one this account was last on, as long as it is still an open case. A job that has been
    closed or deleted falls through to the most current open one rather than showing nothing
    or showing something stale. */
 function pickForAccount(){
  var last=readMap()[acctKey()]||'';
  var list=caseList();
  if(last){
   var lc=list.filter(function(c){return c.id===last})[0];
   if(lc&&!isClosed(lc))return last;
  }
  var open=list.filter(function(c){return !isClosed(c)&&(c.assignee||(c.assignees||[]).length)});
  open.sort(function(a,b){
   var ap=a.appointment?new Date(a.appointment).getTime():Infinity;
   var bp=b.appointment?new Date(b.appointment).getTime():Infinity;
   if(ap!==bp)return ap-bp;
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
  return (open[0]||{}).id||'';
 }

 /* Every route into a single job goes through js/32's imodeOpenFieldJob, so recording it
    there covers the case page's เริ่มหน้างาน, a งานของฉัน row and หน้างานทั้งหมด alike. */
 var baseOpenJob=window.imodeOpenFieldJob;
 if(typeof baseOpenJob==='function'){
  window.imodeOpenFieldJob=function(id){
   try{remember(id)}catch(e){}
   return baseOpenJob.apply(this,arguments);
  };
 }

 /* -------------------------------------------- 2. one job for every role ---- */
 /* Outermost wrapper, so the choice is made before js/32's renderWorkspace() asks for it.
    A technician is left entirely to js/32. */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'&&typeof window.imodeSetFieldJob==='function'){
  window.goPage=function(name){
   try{
    if(name==='field-service'&&!myTechId()){
     var cur=(typeof window.imodeFieldJobId==='function')?window.imodeFieldJobId():'';
     if(!cur){
      var pick=pickForAccount();
      if(pick){window.imodeSetFieldJob(pick);remember(pick)}
     }
    }
   }catch(e){}
   return baseGoPage.apply(this,arguments);
  };
 }

 /* ------------------------------------------- 3. หน้างานทั้งหมด, a page of its own ---- */
 try{PAGE_PERMISSION[PAGE]=PERM}catch(e){}
 try{
  if(typeof PAGE_INFO!=='undefined'){
   PAGE_INFO.th[PAGE]=['หน้างานทั้งหมด','งานหน้างานของทีมช่างทุกคน'];
   PAGE_INFO.en[PAGE]=['All field jobs','Every technician’s field work'];
  }
 }catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'🗂',th:'หน้างานทั้งหมด',en:'All field jobs',
   perm:PERM},'after:field-service');
 }
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  for(var gi=0;gi<groups.length;gi++){
   if(groups[gi].id!=='service')continue;
   if(groups[gi].pages.indexOf(PAGE)<0){
    var at=groups[gi].pages.indexOf('field-service');
    groups[gi].pages.splice(at<0?groups[gi].pages.length:at+1,0,PAGE);
   }
  }
 }catch(e){}

 function ensurePage(){
  var main=document.querySelector('main.main');
  if(!main||document.getElementById('page-'+PAGE))return;
  var sec=document.createElement('section');
  sec.className='page';
  sec.id='page-'+PAGE;
  main.appendChild(sec);
 }
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav||nav.querySelector('.nav-item[data-page="'+PAGE+'"]'))return;
  var b=document.createElement('button');
  b.className='nav-item';
  b.setAttribute('data-page',PAGE);
  b.innerHTML='<span>🗂</span><b>'+esc2(tl('หน้างานทั้งหมด','All field jobs'))+'</b>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="field-service"]')
        ||nav.querySelector('.nav-item[data-page="my-work"]')
        ||nav.querySelector('.nav-item[data-page="cases"]');
  if(ref&&ref.nextSibling)nav.insertBefore(b,ref.nextSibling);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }

 var state={q:'',tech:''};
 window.imodeFieldAllSet=function(k,v){state[k]=v;render()};
 window.imodeFieldAllClear=function(){state={q:'',tech:''};render()};
 window.imodeFieldAllOpen=function(id){
  if(typeof window.imodeOpenFieldJob==='function')window.imodeOpenFieldJob(id);
 };

 function jobs(){
  return caseList().filter(function(c){
   if(isClosed(c))return false;
   if(!(c.assignee||(c.assignees||[]).length))return false;   /* not handed out yet */
   if(state.tech&&!onCase(c,state.tech))return false;
   var s=state.q.trim().toLowerCase();
   if(!s)return true;
   return [c.ticket,c.customer,c.machine,c.serial,c.issue,c.fieldStatus,c.status]
    .some(function(v){return String(v||'').toLowerCase().indexOf(s)>=0});
  }).sort(function(a,b){
   var ap=a.appointment?new Date(a.appointment).getTime():Infinity;
   var bp=b.appointment?new Date(b.appointment).getTime():Infinity;
   if(ap!==bp)return ap-bp;
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
 }
 function crew(c){
  try{
   if(typeof window.imodeAssigneeNames==='function'){
    var n=window.imodeAssigneeNames(c);
    if(n&&n.length)return n.join(', ');
   }
  }catch(e){}
  try{var t=(typeof techById==='function')?techById(c.assignee):null;return (t&&t.name)||c.assignee||'-'}
  catch(e){return c.assignee||'-'}
 }
 function row(c){
  var fs=String(c.fieldStatus||'');
  return '<button type="button" class="fa-row" onclick="imodeFieldAllOpen('+imodeJsArg(c.id)+')">'
   +'<span class="fa-main">'
   +'<b>'+esc2(c.ticket||c.id)+'</b>'
   +'<span class="fa-chips">'
   +'<i class="fa-chip">'+esc2(c.status||'-')+'</i>'
   +(fs?'<i class="fa-chip is-field">'+esc2(fs)+'</i>':'')
   +(c.priority==='ด่วนมาก'?'<i class="fa-chip is-urgent">'+esc2(tl('ด่วนมาก','Urgent'))+'</i>':'')
   +'</span>'
   +'<small>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+'</small>'
   +'<small>'+esc2(tl('ช่าง','Technicians'))+': '+esc2(crew(c))+'</small>'
   +'<small>'+esc2(tl('นัดหมาย','Appointment'))+': '
   +esc2(c.appointment?fmtAny(c.appointment):tl('ยังไม่นัด','not scheduled'))+'</small>'
   +'</span><span class="fa-go" aria-hidden="true">'+esc2(tl('เปิดหน้างาน','Open'))+' ›</span></button>';
 }
 function render(){
  var host=document.getElementById('page-'+PAGE);
  if(!host)return;
  if(!can(PERM)){
   host.innerHTML='<div class="panel"><div class="empty">'
    +esc2(tl('หน้านี้สำหรับผู้ที่มอบหมายงานได้เท่านั้น','This page is for accounts that assign work'))
    +'</div></div>';
   return;
  }
  var list=jobs(),all=caseList().filter(function(c){return !isClosed(c)&&(c.assignee||(c.assignees||[]).length)});
  var today=new Date(),sameDay=function(v){
   if(!v)return false;
   var d=new Date(v);
   return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
  };
  var opts=techList().map(function(t){
   return '<option value="'+esc2(t.id)+'"'+(state.tech===t.id?' selected':'')+'>'+esc2(t.name||t.id)+'</option>';
  }).join('');
  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div><h3>'+esc2(tl('หน้างานทั้งหมด','All field jobs'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('งานหน้างานที่ยังไม่จบของทีมช่างทุกคน — กดที่แถวเพื่อเปิดหน้างานของงานนั้น',
       'Every open field job across the team — tap a row to open its workspace'))+'</p></div></div>'
   +'<div class="work-kpi">'
   +'<div class="work-kpi-box"><small>'+esc2(tl('งานที่ยังไม่จบ','Open'))+'</small><b>'+all.length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('นัดวันนี้','Today'))+'</small><b>'
     +all.filter(function(c){return sameDay(c.appointment)}).length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('ด่วนมาก','Urgent'))+'</small><b>'
     +all.filter(function(c){return c.priority==='ด่วนมาก'}).length+'</b></div>'
   +'<div class="work-kpi-box"><small>'+esc2(tl('ช่างในระบบ','Technicians'))+'</small><b>'+techList().length+'</b></div>'
   +'</div>'
   +'<div class="fa-tools">'
   +'<input id="faSearch" class="fa-search" placeholder="'+esc2(tl('ค้นหาเลขเคส ลูกค้า เครื่อง','Search ticket, customer, machine'))+'" value="'+esc2(state.q)+'">'
   +'<select class="fa-select" onchange="imodeFieldAllSet(\'tech\',this.value)">'
   +'<option value="">'+esc2(tl('ช่างทุกคน','All technicians'))+'</option>'+opts+'</select>'
   +(state.q||state.tech?'<button type="button" class="mini-btn" onclick="imodeFieldAllClear()">'+esc2(tl('ล้างตัวกรอง','Clear'))+'</button>':'')
   +'</div>'
   +'<div class="fa-list">'+(list.length?list.map(row).join('')
     :'<div class="empty">'+esc2(tl('ไม่มีงานหน้างานที่ตรงกับเงื่อนไข','No field jobs match'))+'</div>')+'</div>'
   +'</div>';
  var box=document.getElementById('faSearch');
  if(box){
   /* The list is re-rendered on every keystroke, so the caret has to be put back. */
   box.oninput=function(){
    var v=this.value,pos=this.selectionStart;
    state.q=v;render();
    var again=document.getElementById('faSearch');
    if(again){again.focus();try{again.setSelectionRange(pos,pos)}catch(e){}}
   };
  }
 }
 window.imodeRenderFieldAll=render;

 var baseGo2=window.goPage;
 if(typeof baseGo2==='function'){
  window.goPage=function(name){
   if(name===PAGE)ensurePage();
   var r=baseGo2.apply(this,arguments);
   try{if(((document.querySelector('.page.active')||{}).id||'')==='page-'+PAGE)render()}catch(e){}
   return r;
  };
 }
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{
    ensureNav();
    if(((document.querySelector('.page.active')||{}).id||'')==='page-'+PAGE)render();
   }catch(e){}
   return r;
  };
 }
 function start(){ensurePage();ensureNav()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();

 var st=document.createElement('style');
 st.id='v70FieldScopeStyle';
 st.textContent=''
 +'.fa-tools{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}'
 +'.fa-search{flex:1 1 220px;min-width:0;padding:9px 12px;border:1px solid #d9e4f5;border-radius:11px;font-size:13px}'
 +'.fa-select{padding:9px 12px;border:1px solid #d9e4f5;border-radius:11px;font-size:13px;background:#fff}'
 +'.fa-search:focus,.fa-select:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.fa-list{display:flex;flex-direction:column;gap:9px}'
 +'.fa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;'
 +'padding:12px 14px;border:1px solid #e2ecfb;border-radius:14px;background:#fff;cursor:pointer;'
 +'box-shadow:0 4px 0 #e4ecfa;transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}'
 +'.fa-row:hover{border-color:#0b63e5;transform:translateY(-2px);box-shadow:0 6px 0 #dbe6f8}'
 +'.fa-row:active{transform:translateY(2px);box-shadow:0 1px 0 #dbe6f8}'
 +'.fa-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.fa-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}'
 +'.fa-main b{color:#0c225e;font-size:14px}'
 +'.fa-main small{color:#5b6b88;font-size:11.5px}'
 +'.fa-chips{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0}'
 +'.fa-chip{font-style:normal;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 9px;'
 +'background:#eef3fb;color:#3d557f;border:1px solid #dbe5f5}'
 +'.fa-chip.is-field{background:#eaf3ff;color:#0b3f9e;border-color:#cfe0fa}'
 +'.fa-chip.is-urgent{background:#fdecec;color:#a02020;border-color:#f2c9c9}'
 +'.fa-go{font-size:12px;font-weight:800;color:#0b3f9e;white-space:nowrap}'
 +'@media (max-width:640px){.fa-row{flex-direction:column;align-items:stretch}.fa-go{text-align:right}'
 +'.fa-search,.fa-select{flex:1 1 100%}}';
 document.head.appendChild(st);
})();
