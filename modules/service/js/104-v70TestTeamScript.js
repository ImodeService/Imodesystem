/* Beta 1.0 — 2026-09-23: the UAT technician records get a group of their own.
   ทีมช่าง was showing technician_test1, technician_test2, tech_test1 and lead_rd beside the
   real staff, in ทั้งหมด and in the ทีม Technical / ทีม R&D counts, so every headcount on that
   page was wrong by four.

   They are recognised the same way js/39 recognises a test ACCOUNT — a name ending in _test
   or _testN, which is the UAT naming convention every one of them follows — plus lead_rd,
   which is a placeholder record js/13 seeds and not a person.

   Nothing is renamed, moved or deleted: `filteredTechnicians()` is wrapped, so the records
   still exist, still carry their work, and are one click away under บัญชีทดสอบ. */
(function(){
 'use strict';

 var TEAM='__test__';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* A record belonging to a REAL EMPLOYEE is never a test record, whatever it is called.
    T-LEAD-TECH and T-LEAD-RD carry employeeId USR-003 (หัวหน้าช่าง ก) and USR-004 (หัวหน้า R&D ข) — set by
    js/96's dedupeLead — but their `name` was overwritten with an account username by js/39's
    createRecordFor(), so a name test alone put หัวหน้าช่าง ก in with the UAT records. The ownership
    is checked first; only then the naming convention. */
 function realEmployee(t){
  var id=String((t&&t.employeeId)||'');
  if(!id)return null;
  try{return (Array.isArray(demoUsers)?demoUsers:[]).filter(function(p){return p&&p.id===id})[0]||null}
  catch(e){return null}
 }
 function isTest(t){
  if(realEmployee(t))return false;
  var n=String((t&&t.name)||'').trim();
  if(!n)return false;
  return /_test\d*$/i.test(n);
 }
 window.imodeIsTestTechnician=isTest;

 /* filteredTechnicians() is shared with the CALENDAR and with js/13's team scope, and one of
    these records currently carries five open jobs — grouping them at the source would empty
    those rows out of the calendar too, which is a different decision from tidying one page.
    So the wrapper only changes its answer while renderTechnicians() is the caller. That
    function calls it synchronously, so the flag is exact rather than a guess. */
 var inGrid=false;
 var baseFiltered=window.filteredTechnicians;
 if(typeof baseFiltered==='function'){
  window.filteredTechnicians=function(team){
   if(!inGrid)return baseFiltered.apply(this,arguments);
   var want=(team===undefined)?(typeof techTeamFilter!=='undefined'?techTeamFilter:'all'):team;
   var all=[];
   try{all=Array.isArray(technicians)?technicians:[]}catch(e){}
   if(want===TEAM)return all.filter(isTest);
   return (baseFiltered.call(this,want)||[]).filter(function(t){return !isTest(t)});
  };
 }
 /* js/03 marks the active chip from data-team and does not know this one exists. */
 function markChip(){
  var seg=document.getElementById('techTeamSegment');
  if(!seg)return;
  var on=(typeof techTeamFilter!=='undefined'&&techTeamFilter===TEAM);
  var b=seg.querySelector('[data-team="'+TEAM+'"]');
  if(b)b.classList.toggle('active',on);
  if(on)[].forEach.call(seg.querySelectorAll('.seg-btn'),function(x){
   if(x!==b)x.classList.remove('active');
  });
 }

 /* The chip row is rebuilt by nothing — it is static markup in index.html — so the button is
    added once and then only kept in step with the active filter. */
 function ensureChip(){
  var seg=document.getElementById('techTeamSegment');
  if(!seg||seg.querySelector('[data-team="'+TEAM+'"]'))return;
  var b=document.createElement('button');
  b.type='button';
  b.className='seg-btn';
  b.setAttribute('data-team',TEAM);
  b.textContent=tl('บัญชีทดสอบ','Test accounts');
  b.addEventListener('click',function(){
   if(typeof window.setTechTeamFilter==='function')window.setTechTeamFilter(TEAM);
  });
  seg.appendChild(b);
 }
 /* renderTechnicians() marks the active chip from data-team, so the new one is handled by
    js/03's own line with nothing to add. The counts tile is corrected here instead: it counts
    `technicians` directly rather than going through filteredTechnicians(). */
 function fixCounts(){
  var host=document.getElementById('technicianTeamSummary');
  if(!host)return;
  var all=[];
  try{all=Array.isArray(technicians)?technicians:[]}catch(e){}
  var real=all.filter(function(t){return !isTest(t)}).length;
  var tests=all.length-real;
  var first=host.querySelector('.team-stat b');
  if(first)first.textContent=String(real);
  if(tests&&!host.querySelector('.team-stat.is-test')){
   host.insertAdjacentHTML('beforeend','<div class="team-stat is-test"><small>'
    +esc2(tl('บัญชีทดสอบ','Test accounts'))+'</small><b>'+tests+'</b></div>');
  }
 }
 var baseRender=window.renderTechnicians;
 if(typeof baseRender==='function'){
  window.renderTechnicians=function(){
   inGrid=true;
   var r;
   try{r=baseRender.apply(this,arguments)}
   finally{inGrid=false}
   try{ensureChip();fixCounts();markChip()}catch(e){}
   return r;
  };
 }
 /* js/03's setTechTeamFilter() stores whatever it is given and re-renders, and
    filteredTechnicians() answers an unknown team with an empty list — which is exactly right
    here, because applyGrid() then shows the test cards it hid. */
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureChip,{once:true});
 else ensureChip();

 var st=document.createElement('style');
 st.id='v70TestTeamStyle';
 st.textContent=''
 +'#techTeamSegment [data-team="'+TEAM+'"]{border-style:dashed}'
 +'#techTeamSegment [data-team="'+TEAM+'"].active{border-style:solid}'
 +'.team-stat.is-test small{color:#8a5a17}'
 +'.team-stat.is-test b{color:#8a5a17}';
 document.head.appendChild(st);
})();
