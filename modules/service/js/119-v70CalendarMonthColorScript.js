/* Version 1.0 — 2026-09-25: ปฏิทินงาน opens on the MONTH view, and a job in the month grid wears
   the colour of the technicians it is assigned to.

   Asked for: "เวลากดเข้าไปดูตอนนี้จะอยู่สัปดาห์ แต่ผมอยากให้กดแล้วมันเป็นเดือน" and "อยากให้สีเป็น
   สีของช่างที่ได้รับมอบหมาย … ถ้ามีมากกว่า 1 คน อยากให้เอาสีมาเรียงกัน … อยู่ในกรอบเคส". The owner
   chose the left bar split into one band per technician, top to bottom, lead first.

   1. `calendarView` is a top-level `let` in js/03 — a lexical global, never on `window` — so it
      is assigned here by bare identifier at parse time, before the first renderAll() at load.
      Switching to สัปดาห์/วัน/ปี still works and is kept until the page is reloaded.
   2. js/03 draws `.month-appt` with a TEAM colour (blue Technical, purple R&D, css/01). After each
      renderCalendar() the chips of the month view are re-coloured from the crew: the colour each
      technician carries on ทีมช่าง (js/99, exported as imodeTechColorHex), the crew from js/38's
      imodeCaseAssignees (which also splits the comma-list wire format). A job with no technician
      keeps the team colour it had. Nothing is written; this is paint only. */
(function(){
 'use strict';
 try{calendarView='month'}catch(e){}

 function crewOf(c){
  var ids=[];
  try{if(typeof window.imodeCaseAssignees==='function')ids=window.imodeCaseAssignees(c)||[]}catch(e){}
  if(!ids.length&&c&&c.assignee)ids=String(c.assignee).split(',');
  var seen={};
  return ids.map(function(v){return String(v||'').trim()}).filter(function(v){if(!v||seen[v])return false;seen[v]=1;return true});
 }
 function techOf(id){try{return technicians.filter(function(t){return t.id===id})[0]||null}catch(e){return null}}
 function hexOf(t){
  try{if(typeof window.imodeTechColorHex==='function')return window.imodeTechColorHex(t.color)}catch(e){}
  return '#0b63e5';
 }
 function paint(){
  var host=document.getElementById('technicianCalendar')||document;
  var chips=host.querySelectorAll('.month-appt[onclick]');
  if(!chips.length)return;
  var byId={};try{cases.forEach(function(c){byId[c.id]=c})}catch(e){}
  [].forEach.call(chips,function(el){
   var m=/openCaseDetail\('([^']+)'\)/.exec(el.getAttribute('onclick')||'');
   var c=m&&byId[m[1]];if(!c)return;
   var crew=crewOf(c).map(techOf).filter(Boolean);
   if(!crew.length)return;
   var cols=crew.map(hexOf),n=cols.length,stops=[];
   cols.forEach(function(h,i){stops.push(h+' '+(i*100/n)+'%',h+' '+((i+1)*100/n)+'%')});
   el.classList.add('cal-crew');
   /* The inside is "smoke": one soft radial cloud per technician, spread across the chip and
      overlapping, so several crews blend into each other. Layer 1 is the split left bar. */
   var clouds=cols.map(function(h,i){
    var x=n===1?30:Math.round((i+0.5)*100/n),y=i%2?75:25;
    return 'radial-gradient(ellipse '+(n===1?'90% 160%':Math.round(140/n+40)+'% 170%')+' at '+x+'% '+y+'%,'+h+'5c 0%,'+h+'2e 45%,'+h+'00 80%)';
   });
   if(n===1)clouds.push('radial-gradient(ellipse 70% 150% at 85% 80%,'+cols[0]+'33 0%,'+cols[0]+'00 75%)');
   el.style.backgroundColor='#fbfcff';
   el.style.backgroundImage=['linear-gradient(to bottom,'+stops.join(',')+')'].concat(clouds).join(',');
   el.style.backgroundSize=['4px 100%'].concat(clouds.map(function(){return '100% 100%'})).join(',');
   el.title=crew.map(function(t){return t.name||t.id}).join(' · ');
  });
 }
 var base=window.renderCalendar;
 if(typeof base==='function')window.renderCalendar=function(){
  var r=base.apply(this,arguments);
  try{if(calendarView==='month')paint()}catch(e){}
  return r;
 };
 window.imodePaintCalendarCrew=paint;

 var st=document.createElement('style');
 st.id='v70CalendarCrewStyle';
 st.textContent='.month-appt.cal-crew{border-left-width:0;padding-left:11px;background-repeat:no-repeat;background-position:left top;color:#16223d}';
 if(!document.getElementById(st.id))document.head.appendChild(st);
})();
