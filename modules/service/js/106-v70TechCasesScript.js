/* Beta 1.0 — 2026-09-23: งานหน้างาน on a ทีมช่าง card lists that person's cases.
   It used to call openFieldService(id), which leaves the page for the field workspace — one
   job, the one that technician happens to have open. What the button is asked for is the
   opposite: every case this person is on, without going anywhere.

   The crew test is js/03's own caseHasTech() (which delegates to imodeIsAssignedTo), so a job
   where they are a crew member and not the lead counts — nine places in js/03 compared
   `c.assignee === id` directly and lost exactly those jobs in part 25. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function when(v){
  try{if(typeof fmt==='function')return fmt(v)}catch(e){}
  return String(v||'').slice(0,16).replace('T',' ');
 }
 function onTech(c,tid){
  try{if(typeof caseHasTech==='function')return !!caseHasTech(c,tid)}catch(e){}
  try{if(typeof window.imodeIsAssignedTo==='function')return !!window.imodeIsAssignedTo(c,tid)}catch(e){}
  return String((c&&c.assignee)||'')===tid;
 }
 var CLOSED={'เสร็จสิ้น':1,'ปิดเคส':1};

 function rowHTML(c){
  return '<button type="button" class="tcase-row" onclick="imodeOpenCase('+imodeJsArg(c.id)+')">'
   +'<b>'+esc2(c.ticket||c.id)+'</b>'
   +'<small>'+esc2(c.customer||'')+(c.machine?' · '+esc2(c.machine):'')+'</small>'
   +'<span class="tcase-st">'+esc2(c.status||'')+'</span>'
   +'<i aria-hidden="true">›</i></button>';
 }
 window.imodeTechCases=function(tid){
  var t=null;
  try{t=(Array.isArray(technicians)?technicians:[]).filter(function(x){return x&&x.id===tid})[0]}catch(e){}
  var list=[];
  try{list=(Array.isArray(cases)?cases:[]).filter(function(c){return c&&onTech(c,tid)})}catch(e){}
  list.sort(function(a,b){return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)});
  var open=list.filter(function(c){return !CLOSED[String(c.status||'')]});
  var done=list.filter(function(c){return CLOSED[String(c.status||'')]});
  var body='<div class="tcase">'
   +'<div class="tcase-kpi">'
   +'<div><small>'+esc2(tl('งานที่ยังไม่จบ','Open'))+'</small><b>'+open.length+'</b></div>'
   +'<div><small>'+esc2(tl('ปิดแล้ว','Closed'))+'</small><b>'+done.length+'</b></div>'
   +'<div><small>'+esc2(tl('ทั้งหมด','Total'))+'</small><b>'+list.length+'</b></div>'
   +'</div>'
   +(open.length?'<h4>'+esc2(tl('กำลังดำเนินการ','In progress'))+'</h4>'+open.map(rowHTML).join('')
                :'<p class="tcase-empty">'+esc2(tl('ยังไม่มีงานที่เปิดอยู่','No open jobs'))+'</p>')
   +(done.length?'<h4>'+esc2(tl('ปิดแล้ว','Closed'))+'</h4>'+done.map(rowHTML).join(''):'')
   +'<div class="button-row" style="margin-top:14px">'
   +'<button type="button" class="soft-btn" onclick="closeModal();openFieldService('+imodeJsArg(tid)+')">'
   +esc2(tl('เปิดหน้างานของช่างคนนี้','Open their field workspace'))+'</button></div>'
   +'</div>';
  if(typeof window.openModal!=='function')return;
  window.openModal(esc2(tl('เคสของ ','Cases for '))+esc2((t&&t.name)||tid),
   esc2(tl('งานทั้งหมดที่ช่างคนนี้ได้รับมอบหมาย','Every case this person is assigned to')),
   body,true);
 };

 /* The card template lives in js/03 and is rebuilt on every render, so the onclick is
    rewritten after each one rather than by forking the template. */
 function swap(){
  var grid=document.getElementById('technicianGrid');
  if(!grid)return;
  [].forEach.call(grid.querySelectorAll('button[onclick^="openFieldService("]'),function(b){
   var id=(String(b.getAttribute('onclick')).match(/openFieldService\('([^']+)'\)/)||[])[1];
   if(!id)return;
   b.setAttribute('onclick',"imodeTechCases('"+id+"')");
  });
 }
 var base=window.renderTechnicians;
 if(typeof base==='function'){
  window.renderTechnicians=function(){
   var r=base.apply(this,arguments);
   try{swap()}catch(e){}
   return r;
  };
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',swap,{once:true});
 else swap();

 var st=document.createElement('style');
 st.id='v70TechCasesStyle';
 st.textContent=''
 +'.tcase-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}'
 +'.tcase-kpi>div{border:1px solid #e2eaf7;border-radius:12px;padding:9px 11px;background:#f7faff}'
 +'.tcase-kpi small{display:block;font-size:10.5px;color:#6f81a3}'
 +'.tcase-kpi b{display:block;font-size:19px;color:#12356f}'
 +'.tcase h4{margin:12px 0 7px;font-size:12px;color:#41567c}'
 +'.tcase-row{width:100%;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;'
 +'border:1px solid #e2eaf7;border-radius:11px;padding:10px 12px;margin-bottom:7px;background:#fff;'
 +'color:inherit;font:inherit}'
 +'.tcase-row:hover{border-color:#b9d3f5;background:#f6faff}'
 +'.tcase-row b{flex:none;font-size:12.5px;color:#12356f}'
 +'.tcase-row small{flex:1;min-width:0;font-size:11px;color:#6f81a3;overflow:hidden;'
 +'text-overflow:ellipsis;white-space:nowrap}'
 +'.tcase-st{flex:none;font-size:10.5px;font-weight:700;color:#41567c;background:#eef3fb;'
 +'border-radius:999px;padding:3px 9px}'
 +'.tcase-row i{flex:none;font-style:normal;color:#9fb2d0}'
 +'.tcase-empty{font-size:12px;color:#6f81a3;padding:10px;border:1px dashed #d3e0f4;border-radius:11px}';
 document.head.appendChild(st);
})();
