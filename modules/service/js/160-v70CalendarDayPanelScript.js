/* 2026-11-09 — ปฏิทินงาน: tap a day → that day's jobs → one job's details.

   Owner (LINE): "ทำให้ปฏิทินงานสามารถกดเข้าไปดูงานของแต่ละวันได้ และจากนั้นค่อยกดดูเคสของวันนั้นเป็นเคส
   เป็นเคสไป กดวัน -> มีงานกี่งาน -> รายละเอียดของงานนั้นๆ" (mockup approved 2026-11-09).

     - Month view: a day cell (and its "+ อีก N รายการ") opens a panel on the right: the date, how many
       jobs and technicians, and one card per job in time order. A job chip opens the panel straight on
       that job. Week view: the day headings do the same.
     - A card opens the job: status, customer, contact, place, machine, job type, crew, problem, with
       "เปิดหน้าเคส" and "เปิดหน้างานช่าง". ‹ goes back to the day.
     - "＋ เพิ่มนัดหมายวันนี้" only for accounts with calendar.edit (the same button the calendar has).
     - Phone: the panel is full screen.

   The jobs are the ones the calendar itself shows for that day (js/03 renderCalendar: an appointment
   on that date, teamMatchedCase). Nothing is written. Remove this file and the calendar is as before. */
(function(){
 'use strict';
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function list(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function locale(){try{return typeof uiLocale==='function'?uiLocale():'th-TH'}catch(e){return 'th-TH'}}
 function teamOk(c){try{return typeof teamMatchedCase==='function'?teamMatchedCase(c):true}catch(e){return true}}
 function view(){try{return calendarView}catch(e){return 'month'}}
 function baseDate(){try{return getBaseCalendarDate()}catch(e){return new Date()}}
 function canEdit(){try{return typeof canPermission!=='function'||canPermission('calendar.edit')}catch(e){return false}}
 function crew(c){
  var ids=[];
  try{if(typeof window.imodeCaseAssignees==='function')ids=window.imodeCaseAssignees(c)||[]}catch(e){}
  if(!ids.length&&c&&c.assignee)ids=String(c.assignee).split(',');
  var seen={};
  return ids.map(function(v){return String(v||'').trim()}).filter(function(v){if(!v||seen[v])return false;seen[v]=1;return true})
   .map(function(id){var t=null;try{t=technicians.filter(function(x){return x.id===id})[0]}catch(e){}return t||{id:id,name:id}});
 }
 function hex(t){try{if(t&&typeof window.imodeTechColorHex==='function')return window.imodeTechColorHex(t.color)}catch(e){}return '#0b63e5'}
 function hhmm(c){return new Date(c.appointment).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})}
 function key(d){return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()}
 function jobsOn(dk){
  return list().filter(function(c){return c&&c.appointment&&teamOk(c)&&key(new Date(c.appointment))===dk})
   .sort(function(a,b){return new Date(a.appointment)-new Date(b.appointment)});
 }
 function dayOf(dk){var p=dk.split('-');return new Date(+p[0],+p[1]-1,+p[2])}
 function dayTitle(dk){return dayOf(dk).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'short',year:'numeric'})}

 /* ---------------------------------------------------------------- the panel ---- */
 var panel=null,shade=null,state={dk:'',id:''};
 function ensure(){
  if(panel)return;
  shade=document.createElement('div');shade.className='cdp-shade';shade.hidden=true;
  panel=document.createElement('aside');panel.className='cdp-panel';panel.id='calDayPanel';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','cdpTitle');
  document.body.appendChild(shade);document.body.appendChild(panel);
  shade.addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();state.id?showDay(state.dk):close()}},true);
  panel.addEventListener('click',function(e){
   var t=e.target.closest('[data-cdp]');if(!t)return;
   var a=t.getAttribute('data-cdp'),id=t.getAttribute('data-id');
   if(a==='close')close();
   else if(a==='back')showDay(state.dk);
   else if(a==='job')showJob(id);
   else if(a==='case'){location.href='./service-case-detail.html?caseId='+encodeURIComponent(id)}
   else if(a==='field'){close();try{window.imodeOpenFieldJob(id)}catch(err){}}
   else if(a==='add'){close();try{window.imodeOpenAssignChooser()}catch(err){}}
  });
 }
 function open(){ensure();panel.hidden=false;shade.hidden=false;document.documentElement.classList.add('cdp-open');setTimeout(function(){var b=panel.querySelector('[data-cdp]');if(b)b.focus()},30)}
 function close(){if(!panel)return;panel.hidden=true;shade.hidden=true;document.documentElement.classList.remove('cdp-open');state={dk:'',id:''}}
 function showDay(dk){
  ensure();state={dk:dk,id:''};
  var jobs=jobsOn(dk),techs={};
  jobs.forEach(function(c){crew(c).forEach(function(t){techs[t.id]=1})});
  var nT=Object.keys(techs).length;
  panel.innerHTML='<div class="cdp-head"><div class="cdp-hmain"><b id="cdpTitle">'+esc2(dayTitle(dk))+'</b><small>'+(jobs.length?jobs.length+' งาน'+(nT?' · ช่าง '+nT+' คน':''):'ไม่มีงานนัดหมาย')+'</small></div>'
   +'<button type="button" class="cdp-x" data-cdp="close" aria-label="ปิด">✕</button></div>'
   +'<div class="cdp-body">'
   +(jobs.length?jobs.map(function(c){
     var cr=crew(c),col=cr.length?hex(cr[0]):'#0b63e5';
     return '<button type="button" class="cdp-card" data-cdp="job" data-id="'+esc2(c.id)+'" style="border-left-color:'+esc2(col)+'">'
      +'<span class="cdp-ctop"><b>'+esc2(c.ticket||c.id)+' · '+esc2(c.customer||'-')+'</b><span class="cdp-time">'+esc2(hhmm(c))+'</span></span>'
      +'<small>'+esc2([c.machine,c.serviceType].filter(Boolean).join(' · ')||'-')+'</small>'
      +'<small>👨‍🔧 '+esc2(cr.length?cr.map(function(t){return t.name||t.id}).join(', '):'ยังไม่มอบหมาย')+'</small>'
      +'<span class="cdp-pill">'+esc2(c.status||'-')+'</span></button>';
    }).join(''):'<p class="cdp-empty">วันนี้ยังไม่มีงานนัดหมาย</p>')
   +(canEdit()?'<button type="button" class="cdp-sec" data-cdp="add">＋ เพิ่มนัดหมายวันนี้</button>':'')
   +'</div>';
  open();
 }
 function showJob(id){
  var c=list().filter(function(x){return x&&x.id===id})[0];if(!c)return;
  ensure();if(!state.dk)state.dk=key(new Date(c.appointment));state.id=id;
  var cr=crew(c),cu=null;try{cu=customers.filter(function(x){return x.id===c.customerId})[0]}catch(e){}
  var place=c.location||(cu&&(cu.address||[cu.branch,cu.location].filter(Boolean).join(' / ')))||'';
  var mc=[c.machine,c.model,c.serial?'S/N '+c.serial:''].filter(Boolean).join(' · ');
  var rows=[['สถานะ',c.status],['ลูกค้า',c.customer],['ผู้ติดต่อ',[c.contact,c.phone].filter(Boolean).join(' · ')],['สถานที่',place],
   ['เครื่อง',mc],['ประเภทงาน',c.serviceType],['ช่าง',cr.map(function(t){return t.name||t.id}).join(', ')||'ยังไม่มอบหมาย'],['อาการ',c.issue]];
  panel.innerHTML='<div class="cdp-head"><button type="button" class="cdp-x" data-cdp="back" aria-label="กลับไปรายการวันนี้">‹</button>'
   +'<div class="cdp-hmain"><b id="cdpTitle">'+esc2((c.ticket||c.id)+' · '+(c.customer||''))+'</b><small>'+esc2(dayTitle(state.dk)+' · '+hhmm(c))+'</small></div>'
   +'<button type="button" class="cdp-x" data-cdp="close" aria-label="ปิด">✕</button></div>'
   +'<div class="cdp-body"><dl class="cdp-grid">'+rows.filter(function(r){return r[1]}).map(function(r){return '<dt>'+esc2(r[0])+'</dt><dd>'+esc2(r[1])+'</dd>'}).join('')+'</dl>'
   +'<button type="button" class="cdp-main" data-cdp="case" data-id="'+esc2(c.id)+'">เปิดหน้าเคส ›</button>'
   +(typeof window.imodeOpenFieldJob==='function'?'<button type="button" class="cdp-sec" data-cdp="field" data-id="'+esc2(c.id)+'">🔧 เปิดหน้างานช่าง</button>':'')
   +'</div>';
  open();
 }

 /* ------------------------------------------------- hook the calendar grid ---- */
 /* js/03 draws the cells without dates; tag them after each render with the same arithmetic */
 function tag(){
  var host=document.getElementById('technicianCalendar');if(!host)return;
  var b=baseDate(),v=view();
  if(v==='month'){
   var first=new Date(b.getFullYear(),b.getMonth(),1),start=new Date(first);start.setDate(start.getDate()-start.getDay());
   [].forEach.call(host.querySelectorAll('.month-cell'),function(cell,i){
    var d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    cell.setAttribute('data-cdp-day',key(d));cell.setAttribute('tabindex','0');cell.setAttribute('role','button');
    cell.setAttribute('aria-label','ดูงานวันที่ '+d.toLocaleDateString(locale(),{day:'numeric',month:'long'}));
   });
  }else if(v==='week'){
   [].forEach.call(host.querySelectorAll('.cal-header > div'),function(h,i){
    if(!i)return;
    var d=new Date(b.getFullYear(),b.getMonth(),b.getDate()+i-1);
    h.setAttribute('data-cdp-day',key(d));h.setAttribute('tabindex','0');h.setAttribute('role','button');h.classList.add('cdp-weekday');
    h.setAttribute('aria-label','ดูงานวันที่ '+d.toLocaleDateString(locale(),{day:'numeric',month:'long'}));
   });
  }
 }
 var base=window.renderCalendar;
 if(typeof base==='function'){
  window.renderCalendar=function(){var r=base.apply(this,arguments);try{tag()}catch(e){}return r};
 }
 function bind(){
  var host=document.getElementById('technicianCalendar');
  if(!host){setTimeout(bind,500);return}
  /* capture: a job chip's own onclick (the case popup) is replaced by the panel on that job */
  host.addEventListener('click',function(e){
   var chip=e.target.closest('.month-appt[onclick], .job-chip[onclick]');
   var day=e.target.closest('[data-cdp-day]');
   if(chip&&view()==='month'){
    var m=/openCaseDetail\('([^']+)'\)/.exec(chip.getAttribute('onclick')||'');
    if(m){e.stopPropagation();e.preventDefault();state.dk='';showJob(m[1]);return}
   }
   if(day&&!chip){e.preventDefault();showDay(day.getAttribute('data-cdp-day'))}
  },true);
  host.addEventListener('keydown',function(e){
   if(e.key!=='Enter'&&e.key!==' ')return;
   var day=e.target.closest('[data-cdp-day]');if(!day||e.target!==day)return;
   e.preventDefault();showDay(day.getAttribute('data-cdp-day'));
  });
  try{tag()}catch(err){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();

 var st=document.createElement('style');
 st.id='v70CalDayPanelStyle';
 st.textContent=''
  +'.month-cell[data-cdp-day]{cursor:pointer}'
  +'.month-cell[data-cdp-day]:hover{box-shadow:inset 0 0 0 2px var(--fx-accent,#0b63e5)}'
  +'.month-cell[data-cdp-day]:focus-visible,.cdp-weekday:focus-visible{outline:3px solid #f27a1a;outline-offset:-3px}'
  +'.month-more{cursor:pointer;text-decoration:underline}'
  +'.cdp-weekday{cursor:pointer}.cdp-weekday:hover{color:var(--fx-accent,#0b63e5);text-decoration:underline}'
  +'.cdp-shade{position:fixed;inset:0;z-index:10498;background:rgba(9,18,38,.35)}'
  +'.cdp-panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);z-index:10499;display:flex;flex-direction:column;'
   +'background:var(--fx-surface,#fff);color:var(--fx-text,#1f1f1f);box-shadow:-12px 0 40px rgba(0,0,0,.2);font-size:14px}'
  +'.cdp-head{display:flex;align-items:center;gap:10px;padding:14px 16px calc(14px);padding-top:calc(14px + env(safe-area-inset-top,0px));border-bottom:1px solid var(--fx-line,#e1e1e1);flex:none}'
  +'.cdp-hmain{flex:1;min-width:0}.cdp-hmain b{display:block;font-size:16px;color:var(--fx-head,#0c225e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  +'.cdp-hmain small{display:block;color:var(--fx-muted,#5f6672)}'
  +'.cdp-x{width:38px;height:38px;flex:none;border:1px solid var(--fx-line,#e1e1e1);border-radius:4px;background:transparent;color:inherit;font-size:17px;cursor:pointer}'
  +'.cdp-x:hover{background:var(--fx-hover,#ebebeb)}'
  +'.cdp-body{flex:1;min-height:0;overflow-y:auto;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px}'
  +'.cdp-card{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;'
   +'border:1px solid var(--fx-line,#e1e1e1);border-left:4px solid #0b63e5;border-radius:4px;padding:10px 12px;background:var(--fx-surface-2,#fff)}'
  +'.cdp-card:hover{background:var(--fx-hover,#f4f8ff)}'
  +'.cdp-card:focus-visible,.cdp-x:focus-visible,.cdp-main:focus-visible,.cdp-sec:focus-visible{outline:3px solid #f27a1a;outline-offset:2px}'
  +'.cdp-ctop{display:flex;justify-content:space-between;gap:8px;align-items:baseline}'
  +'.cdp-ctop b{color:var(--fx-head,#0c225e);min-width:0}.cdp-time{font-weight:700;font-variant-numeric:tabular-nums;flex:none}'
  +'.cdp-card small{color:var(--fx-muted,#5f6672)}'
  +'.cdp-pill{align-self:flex-start;margin-top:4px;border-radius:999px;padding:1px 9px;font-size:11.5px;background:#e8f0fe;color:#175cd3}'
  +'html[data-ui="flat-dark"] .cdp-pill{background:#1e3a64;color:#9cc0ff}'
  +'.cdp-empty{color:var(--fx-muted,#5f6672);text-align:center;padding:24px 0;margin:0}'
  +'.cdp-grid{display:grid;grid-template-columns:96px minmax(0,1fr);gap:7px 10px;margin:0}'
  +'.cdp-grid dt{color:var(--fx-muted,#5f6672)}.cdp-grid dd{margin:0;font-weight:600;word-break:break-word}'
  +'.cdp-main{height:44px;border:0;border-radius:4px;background:#c25e00;color:#fff;font:inherit;font-weight:700;cursor:pointer;margin-top:6px}'
  +'html[data-ui="flat-dark"] .cdp-main{background:#e07a1f}'
  +'.cdp-sec{height:44px;border:1px solid var(--fx-line,#e1e1e1);border-radius:4px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}'
  +'.cdp-sec:hover{background:var(--fx-hover,#ebebeb)}'
  +'html.cdp-open,html.cdp-open body{overflow:hidden}'
  +'@media (max-width:640px){.cdp-panel{width:100%}.cdp-shade{display:none}}';
 document.head.appendChild(st);

 window.imodeCalendarDay={open:showDay,job:showJob,close:close};
})();
