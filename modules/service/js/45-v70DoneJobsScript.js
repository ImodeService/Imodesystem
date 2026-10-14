/* Beta — งานที่สำเร็จแล้ว: where finished work goes.

   Asked for with item 10: "อยากให้เพิ่มงานที่สำเร็จแล้ว เคสที่สำเร็จแล้วจะไปอยู่ในหน้านี้
   หน้าของช่างจะแสดงแค่เคสของตัวเอง ส่วนของแอดมินจะเห็นของทุกคนและสามารถเลือกตัวกรองได้".

   It is the other half of item 6. js/44 takes closed cases out of งานของฉัน so a technician's
   list is the work still in front of them; this is where those cases land, so nothing is
   lost — the same treatment the Field Service queue got in part 16, given its own page
   because the coordinator needs it too and needs to filter it.

   WHO SEES WHAT is decided by the account, not by a setting:

     an account with a technicianId  ->  only cases that technician is on, own crew included
                                         (js/38 keeps the whole crew, not only the lead)
     anyone else                     ->  every closed case, plus a ช่าง filter

   Gated on `field.view`, deliberately an existing key: every technician role and
   Admin / Coordinator already hold it, and a script that pushes a NEW key into
   PERMISSION_CATALOG must load before js/20, which repairs roles against the catalog as it
   stands at that moment. This file loads after it, so a new key would be stripped from every
   role on every reload — the decay bug from part 14. PAGE_PERMISSION maps a page to an
   existing key and is safe to extend.

   Read-only. Opening a row hands off to the case workspace that already exists. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function techList(){try{return Array.isArray(technicians)?technicians:[]}catch(e){return[]}}
 function myTechId(){try{return (currentUser&&currentUser.technicianId)||''}catch(e){return''}}
 function fmtAny(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}
 function isClosed(c){
  if(typeof window.imodeCaseIsClosed==='function')return window.imodeCaseIsClosed(c);
  return ['เสร็จสิ้น','ปิดเคส'].indexOf(String(c&&c.status||''))>=0;
 }
 function onCase(c,tid){
  if(!tid)return false;
  if(typeof window.imodeIsAssignedTo==='function')return window.imodeIsAssignedTo(c,tid);
  return c.assignee===tid;
 }
 function crewNames(c){
  try{
   if(typeof window.imodeAssigneeNames==='function'){
    var n=window.imodeAssigneeNames(c);
    if(n&&n.length)return n.join(', ');
   }
  }catch(e){}
  try{
   var t=(typeof techById==='function')?techById(c.assignee):null;
   return (t&&t.name)||c.assignee||'-';
  }catch(e){return c.assignee||'-'}
 }
 /* When the case was finished. There is no closedAt field and adding one would only apply to
    cases closed from here on, so updatedAt — stamped by every path that closes a case — is
    the honest answer for the ones already in the database. */
 function doneAt(c){return c.updatedAt||c.createdAt||''}
 function monthKey(v){
  var d=new Date(v||0);
  if(!v||isNaN(d.getTime()))return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 }

 /* --------------------------------------------------- 1. page registration ---- */
 var PAGE='done-jobs';
 try{PAGE_PERMISSION[PAGE]='field.view'}catch(e){}
 try{
  if(typeof PAGE_INFO!=='undefined'){
   PAGE_INFO.th[PAGE]=['งานที่สำเร็จแล้ว','เคสที่เสร็จสิ้นและปิดแล้ว พร้อมตัวกรอง'];
   PAGE_INFO.en[PAGE]=['Completed work','Cases that are finished or closed, with filters'];
  }
 }catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'📗',th:'งานที่สำเร็จแล้ว',en:'Completed work',
   perm:'field.view'},'after:my-work');
 }
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  for(var gi=0;gi<groups.length;gi++){
   if(groups[gi].id!=='history')continue;   /* 2026-09-18: moved out of งานบริการ */
   if(groups[gi].pages.indexOf(PAGE)<0)groups[gi].pages.push(PAGE);
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
  b.innerHTML='<span>📗</span><b>'+esc2(tl('งานที่สำเร็จแล้ว','Completed work'))+'</b>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="my-work"]')
        ||nav.querySelector('.nav-item[data-page="field-service"]')
        ||nav.querySelector('.nav-item[data-page="cases"]');
  if(ref&&ref.nextSibling)nav.insertBefore(b,ref.nextSibling);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }

 /* ------------------------------------------------------------- 2. filters ---- */
 var state={q:'',tech:'',customer:'',status:'',month:'',limit:25};
 window.imodeDoneSet=function(k,v){
  state[k]=v;
  if(k!=='limit')state.limit=25;
  render();
 };
 window.imodeDoneMore=function(){state.limit+=25;render()};
 window.imodeDoneClear=function(){
  state={q:'',tech:'',customer:'',status:'',month:'',limit:25};
  render();
 };

 /* The technician's own scope is applied first and is not a filter — it cannot be cleared
    from the UI, because it is who the account is. */
 function scoped(){
  var mine=myTechId();
  var all=caseList().filter(isClosed);
  if(!mine)return all;
  return all.filter(function(c){return onCase(c,mine)});
 }
 function matches(c){
  if(state.tech&&!onCase(c,state.tech))return false;
  if(state.customer&&String(c.customerId||'')!==state.customer)return false;
  if(state.status&&String(c.status||'')!==state.status)return false;
  if(state.month&&monthKey(doneAt(c))!==state.month)return false;
  var s=state.q.trim().toLowerCase();
  if(!s)return true;
  return [c.ticket,c.customer,c.machine,c.serial,c.model,c.issue,c.location]
   .some(function(v){return String(v||'').toLowerCase().indexOf(s)>=0});
 }

 /* -------------------------------------------------------------- 3. render ---- */
 function monthLabel(key){
  if(!key)return '';
  var p=key.split('-'),d=new Date(Number(p[0]),Number(p[1])-1,1);
  try{
   return d.toLocaleDateString(typeof uiLocale==='function'?uiLocale():'th-TH',
    {month:'long',year:'numeric'});
  }catch(e){return key}
 }
 function rowHTML(c){
  var closed=String(c.status||'')==='ปิดเคส';
  return '<div class="dj-row" data-case="'+esc2(c.id)+'" role="button" tabindex="0"'
   +' aria-label="'+esc2(tl('เปิดเคส ','Open case ')+(c.ticket||c.id))+'">'
   +'<div class="dj-row-main">'
   +'<div class="dj-row-top"><b>'+esc2(c.ticket||c.id)+'</b>'
   +'<span class="dj-chip'+(closed?' is-closed':'')+'">'+esc2(c.status||'-')+'</span>'
   +(c.priority==='ด่วนมาก'?'<span class="dj-urgent">'+esc2(tl('ด่วนมาก','Urgent'))+'</span>':'')
   +'</div>'
   +'<small>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+'</small>'
   +'<small>'+esc2(tl('ช่าง','Technicians'))+': '+esc2(crewNames(c))+'</small>'
   +'</div>'
   +'<div class="dj-row-side"><small>'+esc2(tl('ปิดงาน','Finished'))+'</small>'
   +'<b>'+esc2(fmtAny(doneAt(c)))+'</b>'
   +'<span class="dj-go">'+esc2(tl('ดูเคส','Open'))+' ›</span></div>'
   +'</div>';
 }

 function render(){
  var host=document.getElementById('page-'+PAGE);
  if(!host)return;
  var mine=myTechId();
  var base=scoped();
  var list=base.filter(matches).sort(function(a,b){
   return new Date(doneAt(b)||0)-new Date(doneAt(a)||0);
  });
  var shown=list.slice(0,state.limit);

  var custSeen={},custs=[],monSeen={},months=[],stSeen={},sts=[];
  base.forEach(function(c){
   if(c.customerId&&!custSeen[c.customerId]){
    custSeen[c.customerId]=1;custs.push({id:c.customerId,name:c.customer||c.customerId});
   }
   var mk=monthKey(doneAt(c));
   if(mk&&!monSeen[mk]){monSeen[mk]=1;months.push(mk)}
   if(c.status&&!stSeen[c.status]){stSeen[c.status]=1;sts.push(c.status)}
  });
  custs.sort(function(a,b){return String(a.name).localeCompare(String(b.name),'th')});
  months.sort().reverse();

  /* Only a coordinator gets the ช่าง filter — a technician is already scoped to themselves
     and a picker that can only ever pick them is clutter that reads like a permission. */
  var techs=[];
  if(!mine){
   var tSeen={};
   base.forEach(function(c){
    var ids=(typeof window.imodeCaseAssignees==='function')
     ? window.imodeCaseAssignees(c) : [c.assignee].filter(Boolean);
    ids.forEach(function(id){
     if(!id||tSeen[id])return;
     tSeen[id]=1;
     var t=techList().filter(function(x){return x.id===id})[0];
     techs.push({id:id,name:(t&&t.name)||id});
    });
   });
   techs.sort(function(a,b){return String(a.name).localeCompare(String(b.name),'th')});
  }

  var thisMonth=monthKey(new Date().toISOString());
  var monthCount=base.filter(function(c){return monthKey(doneAt(c))===thisMonth}).length;
  var fullyClosed=base.filter(function(c){return String(c.status||'')==='ปิดเคส'}).length;
  var active=!!(state.q||state.tech||state.customer||state.status||state.month);

  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div>'
   +'<h3>'+esc2(tl('งานที่สำเร็จแล้ว','Completed work'))+'</h3>'
   +'<p class="subtext">'+esc2(mine
      ? tl('เคสของคุณที่เสร็จสิ้นและปิดแล้ว','Your cases that are finished or closed')
      : tl('เคสที่เสร็จสิ้นและปิดแล้วของทุกคน กรองตามช่าง ลูกค้า สถานะ หรือเดือน',
           'Every finished or closed case — filter by technician, customer, status or month'))+'</p></div>'
   +(mine?'<button class="soft-btn" onclick="goPage(\'my-work\')">‹ '
      +esc2(tl('งานของฉัน','My Work'))+'</button>':'')
   +'</div>'
   +'<div class="dj-kpi">'
   +'<div class="dj-kpi-box"><small>'+esc2(tl('สำเร็จทั้งหมด','Completed'))+'</small><b>'+base.length+'</b></div>'
   +'<div class="dj-kpi-box"><small>'+esc2(tl('เดือนนี้','This month'))+'</small><b>'+monthCount+'</b></div>'
   +'<div class="dj-kpi-box"><small>'+esc2(tl('ปิดเคสแล้ว','Closed'))+'</small><b>'+fullyClosed+'</b></div>'
   +'<div class="dj-kpi-box"><small>'+esc2(tl('ที่แสดงอยู่','Showing'))+'</small><b>'+list.length+'</b></div>'
   +'</div>'
   +'<div class="dj-filters">'
   +'<input type="search" class="dj-search" placeholder="'
   +esc2(tl('ค้นหาเลขเคส ลูกค้า เครื่อง หรือซีเรียล','Search ticket, customer, machine or serial'))
   +'" value="'+esc2(state.q)+'" oninput="imodeDoneSet(\'q\',this.value)">'
   +(techs.length
     ?'<select onchange="imodeDoneSet(\'tech\',this.value)"><option value="">'
      +esc2(tl('ช่างทุกคน','Every technician'))+'</option>'
      +techs.map(function(t){
         return '<option value="'+esc2(t.id)+'"'+(state.tech===t.id?' selected':'')+'>'+esc2(t.name)+'</option>';
        }).join('')+'</select>':'')
   +'<select onchange="imodeDoneSet(\'customer\',this.value)"><option value="">'
   +esc2(tl('ทุกลูกค้า','Every customer'))+'</option>'
   +custs.map(function(c){
      return '<option value="'+esc2(c.id)+'"'+(state.customer===c.id?' selected':'')+'>'+esc2(c.name)+'</option>';
     }).join('')+'</select>'
   +'<select onchange="imodeDoneSet(\'status\',this.value)"><option value="">'
   +esc2(tl('ทุกสถานะ','Every status'))+'</option>'
   +sts.map(function(s){
      return '<option value="'+esc2(s)+'"'+(state.status===s?' selected':'')+'>'+esc2(s)+'</option>';
     }).join('')+'</select>'
   +'<select onchange="imodeDoneSet(\'month\',this.value)"><option value="">'
   +esc2(tl('ทุกเดือน','Every month'))+'</option>'
   +months.map(function(m){
      return '<option value="'+esc2(m)+'"'+(state.month===m?' selected':'')+'>'+esc2(monthLabel(m))+'</option>';
     }).join('')+'</select>'
   +(active?'<button type="button" class="dj-clear" onclick="imodeDoneClear()">✕ '
      +esc2(tl('ล้างตัวกรอง','Clear filters'))+'</button>':'')
   +'</div>'
   +'<div class="dj-list">'+(shown.length?shown.map(rowHTML).join('')
      :'<div class="empty">'+esc2(base.length
          ? tl('ไม่พบเคสตามเงื่อนไขนี้','No case matches this filter')
          : tl('ยังไม่มีงานที่สำเร็จ','No completed work yet'))+'</div>')+'</div>'
   +(list.length>shown.length
     ?'<div class="dj-more"><button type="button" class="soft-btn" onclick="imodeDoneMore()">'
      +esc2(tl('แสดงเพิ่ม','Show more'))+' ('+(list.length-shown.length)+')</button></div>':'')
   +'</div>';

  host.querySelectorAll('.dj-row').forEach(function(row){
   var open=function(){
    var id=row.getAttribute('data-case');
    if(typeof window.imodeOpenCase==='function')window.imodeOpenCase(id);
    else if(typeof window.openCaseDetail==='function')window.openCaseDetail(id);
   };
   row.addEventListener('click',function(e){
    if(e.target.closest('button,a,select,input'))return;
    open();
   });
   row.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();open()}
   });
  });
 }
 window.imodeRenderDoneJobs=render;

 /* ------------------------------------------------------------- 4. wiring ---- */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(name){
   if(name===PAGE)ensurePage();
   var r=baseGoPage.apply(this,arguments);
   try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
   return r;
  };
 }
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70DoneJobsStyle';
 st.textContent=''
 +'.dj-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:0 14px 12px}'
 +'.dj-kpi-box{border:1px solid #cdebd9;border-radius:13px;background:#f2fbf6;padding:10px 13px}'
 +'.dj-kpi-box small{display:block;font-size:10.5px;color:#5f8570;margin-bottom:3px}'
 +'.dj-kpi-box b{font-size:18px;color:#0b7a45}'
 +'.dj-filters{display:flex;flex-wrap:wrap;gap:9px;padding:0 14px 12px}'
 +'.dj-filters input,.dj-filters select{flex:1 1 170px;min-width:0;border:1px solid #d9e6fa;'
 +'border-radius:11px;padding:9px 11px;font-size:13px;background:#fff;color:#0c225e;min-height:38px}'
 +'.dj-filters input:focus,.dj-filters select:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.dj-clear{flex:none;border:1px solid #f0cccc;background:#fff5f5;color:#b32020;border-radius:11px;'
 +'padding:9px 13px;font-size:12.5px;font-weight:700;cursor:pointer;min-height:38px}'
 +'.dj-clear:hover{border-color:#e08a8a}'
 +'.dj-clear:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.dj-list{display:flex;flex-direction:column;gap:9px;padding:0 14px 14px}'
 +'.dj-row{display:flex;align-items:center;gap:13px;border:1px solid #e2ecfb;border-radius:14px;'
 +'background:#fff;padding:12px 14px;cursor:pointer;'
 +'transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}'
 +'.dj-row:hover{border-color:#0b7a45;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,122,69,.12)}'
 +'.dj-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.dj-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}'
 +'.dj-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
 +'.dj-row-top b{font-size:14px;color:#0c225e}'
 +'.dj-row-main small{font-size:11.5px;color:#5b6b88;word-break:break-word}'
 +'.dj-chip{font-size:10.5px;font-weight:800;color:#0b7a45;background:#f2fbf6;'
 +'border:1px solid #cdebd9;border-radius:999px;padding:2px 9px}'
 +'.dj-chip.is-closed{color:#3d5578;background:#f2f6fc;border-color:#dce8fa}'
 +'.dj-urgent{font-size:10.5px;font-weight:800;color:#b32020;background:#fdeaea;'
 +'border:1px solid #f6cccc;border-radius:999px;padding:2px 9px}'
 +'.dj-row-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right}'
 +'.dj-row-side small{font-size:10.5px;color:#7385a5}'
 +'.dj-row-side b{font-size:12.5px;color:#0c225e;white-space:nowrap}'
 +'.dj-go{font-size:12px;font-weight:800;color:#0b63e5;white-space:nowrap;margin-top:3px}'
 +'.dj-more{padding:0 14px 16px}'
 +'@media (max-width:640px){'
 +'.dj-row{flex-direction:column;align-items:stretch;gap:8px}'
 +'.dj-row-side{flex-direction:row;align-items:center;justify-content:space-between;text-align:left}'
 +'.dj-filters input,.dj-filters select,.dj-clear{flex:1 1 100%}'
 +'}'
 +'@media (prefers-reduced-motion:reduce){.dj-row{transition:none}.dj-row:hover{transform:none}}';
 document.head.appendChild(st);

 function install(){
  ensurePage();
  ensureNav();
  try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
