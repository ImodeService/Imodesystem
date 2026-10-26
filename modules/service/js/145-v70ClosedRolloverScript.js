/* js/145-v70ClosedRolloverScript.js — 2026-10-25
   A closed case stays in the working lists for the rest of the day it was closed, and leaves
   them at midnight Thai time (Asia/Bangkok, UTC+7). After that it is only on
   งานที่สำเร็จแล้ว (js/45). A display filter only: nothing is deleted or changed on the case.

   WHEN WAS IT CLOSED. There is no closedAt on a case (js/45 explains why), so the time is the
   latest settings.caseStatusLog entry (js/69) that moved the case INTO a closed status.
   A closed case with no such entry — closed before js/69 existed, or pruned from the log —
   counts as closed on an earlier day, so old work does not come back into the lists.
   updatedAt is not used: chat, edits and syncs move it long after the case was closed.

   WHERE IT APPLIES
     เคสบริการ (renderCases)    the table/cards. The status KPIs and the filter counts still
                                 count every case, and choosing a closed status in the filter
                                 shows all of them, so the archive is still reachable there.
     งานของฉัน (js/44)          its tidy step asks window.imodeCaseHiddenFromLists.
     งานหน้างานทั้งหมด (js/73)   jobs() asks the same.
   Pickers that start new work (มอบหมายงาน queue, the assign chooser, the job หน้างาน opens
   by itself) keep leaving closed cases out at once — there is nothing left to do on them. */
(function(){
 'use strict';

 var CLOSED=['เสร็จสิ้น','ปิดเคส'];
 var BKK_MS=7*3600000;   /* Thailand has no daylight saving */

 function isClosedStatus(s){return CLOSED.indexOf(String(s||''))>=0}
 /* The calendar day in Bangkok of a moment, as YYYY-MM-DD, whatever the device's timezone. */
 function bkkDay(v){
  var t=(v instanceof Date)?v.getTime():new Date(v).getTime();
  if(isNaN(t))return '';
  return new Date(t+BKK_MS).toISOString().slice(0,10);
 }
 function now(){return new Date()}

 function closedAt(c){
  if(!c||!isClosedStatus(c.status))return '';
  var l=[];
  try{
   l=typeof window.imodeCaseStatusLog==='function'?window.imodeCaseStatusLog(c.id)
    :((settings.caseStatusLog||{})[c.id]||[]);
  }catch(e){l=[]}
  for(var i=l.length-1;i>=0;i--){
   var e=l[i];
   if(e&&isClosedStatus(e.to)&&!isClosedStatus(e.from))return String(e.at||'');
  }
  return '';
 }
 /* true = closed on a day before today (Bangkok) → keep it out of the working lists. */
 function isClosedBeforeToday(c){
  if(!c||!isClosedStatus(c.status))return false;
  var at=closedAt(c);
  if(!at)return true;
  var d=bkkDay(at);
  return !d||d<bkkDay(now());
 }
 window.imodeCaseClosedAt=closedAt;
 window.imodeCaseHiddenFromLists=isClosedBeforeToday;

 /* ---------- เคสบริการ ----------
    js/03's renderCases() takes its rows from the global caseMatchesSearch(), which
    renderFilters() and renderCaseStatusKpis() also call. The filter is switched on only for
    the rows: on inside renderCases, off again while those two count. */
 var rowsOnly=0;
 function closedFilterChosen(){
  try{return isClosedStatus(document.getElementById('caseStatusFilter').value)}catch(e){return false}
 }
 var baseMatch=window.caseMatchesSearch;
 if(typeof baseMatch==='function'){
  window.caseMatchesSearch=function(){
   var out=baseMatch.apply(this,arguments);
   if(rowsOnly>0&&Array.isArray(out)&&!closedFilterChosen())
    out=out.filter(function(c){return !isClosedBeforeToday(c)});
   return out;
  };
 }
 function pause(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var held=rowsOnly;rowsOnly=0;
   try{return base.apply(this,arguments)}finally{rowsOnly=held}
  };
 }
 pause('renderFilters');
 pause('renderCaseStatusKpis');
 var baseRender=window.renderCases;
 if(typeof baseRender==='function'){
  window.renderCases=function(){
   rowsOnly++;
   try{return baseRender.apply(this,arguments)}finally{rowsOnly--}
  };
 }

 /* ---------- midnight ----------
    A screen left open overnight redraws once when the Bangkok day changes. */
 var day=bkkDay(now());
 setInterval(function(){
  var d=bkkDay(now());
  if(d===day)return;
  day=d;
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
 },60000);
})();
