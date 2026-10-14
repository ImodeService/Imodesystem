/* js/69-v70StatusLogScript.js — 2026-09-16
   ประวัติการเปลี่ยนสถานะเคส: what changed, when, who, and whether a person did it.

   WHY THIS EXISTS. A case carries its status in ONE string field, c.status, and there has
   never been a history of any kind beside it — the only log in the project is
   fieldStatusLog, which is the technician's nine field statuses, a different ladder. So the
   moment a status is overwritten the previous value and its cause are gone, and the six
   circles on service-case-detail.html have to INFER their timestamps from unrelated fields:
   createdAt, the appointment, the last field log entry, updatedAt. That is why a case can
   show step 2 at 09:57 and step 4 at 09:55 — the two numbers come from different places and
   the timeline reads backwards.

   The application already changes a status automatically in six places (assign, schedule,
   check-in, a field status update, saving the ใบตรวจ, and จบงาน) and manually in three
   (the stepper, เปลี่ยนสถานะ, the case edit form). Nothing was wrong with any of them; what
   was missing is that none of them left a trace. This file adds the trace and changes no
   existing behaviour: it never moves a case, never blocks one, and it is the only thing that
   would have to be deleted to put the project back exactly as it was.

   WHERE IT IS KEPT, and the owner's choice. settings.caseStatusLog, because `settings` is
   pushed whole to system_settings and therefore reaches every device at once, while
   cloudUpsertCase() writes an explicit column whitelist that would drop a new field on the
   case silently — the same trap that lost the customers' photos in part 18. The cost is that
   the row grows, so the log is capped hard (12 entries per case, 150 cases), the way part 17
   caps the recycle bin: a settings row that grows without limit breaks settings sync for
   everybody, which is far worse than forgetting an old transition.

   THE ONE THING THAT WOULD MAKE IT LIE. syncCloud() replaces `cases` wholesale with the copy
   in Supabase, so every case whose status differs from this device's copy looks exactly like
   somebody just changed it. Recording during a sync would invent transitions that no person
   or rule ever made, and attribute them to whoever happens to be signed in here. So the
   recorder is switched off for the duration of a sync and only re-reads its snapshot. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 var CAP_PER_CASE=12;    /* a case that really moves 12 times has an operational problem */
 var CAP_CASES=150;      /* ≈ 150 × 12 × ~90 bytes ≈ 160 KB inside the settings row */
 var STORE='imode_v5_settings';

 /* ---------- the store ---------- */
 function log(){
  if(!settings.caseStatusLog||typeof settings.caseStatusLog!=='object')settings.caseStatusLog={};
  return settings.caseStatusLog;
 }
 /* service-case-detail.html is a separate document that writes its own entries straight into
    localStorage (it cannot load this file). Merging the stored copy in at boot is what keeps
    the application's in-memory settings from overwriting them on its next saveLocal(). Keyed
    by at+to, so re-running is harmless. */
 function mergeStored(){
  var stored;
  try{stored=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return}
  var from=stored&&stored.caseStatusLog;
  if(!from||typeof from!=='object')return;
  var map=log();
  Object.keys(from).forEach(function(id){
   var incoming=Array.isArray(from[id])?from[id]:[];
   var have=Array.isArray(map[id])?map[id]:[];
   var seen={};
   have.forEach(function(e){if(e)seen[String(e.at)+'|'+String(e.to)]=true});
   incoming.forEach(function(e){
    if(!e)return;
    var k=String(e.at)+'|'+String(e.to);
    if(seen[k])return;
    seen[k]=true;have.push(e);
   });
   have.sort(function(a,b){return String(a.at)<String(b.at)?-1:(String(a.at)>String(b.at)?1:0)});
   while(have.length>CAP_PER_CASE)have.shift();
   map[id]=have;
  });
 }
 function prune(map){
  var ids=Object.keys(map);
  if(ids.length<=CAP_CASES)return;
  var lastAt=function(id){
   var l=map[id];
   return (Array.isArray(l)&&l.length)?String(l[l.length-1].at||''):'';
  };
  ids.sort(function(a,b){var x=lastAt(a),y=lastAt(b);return x<y?-1:(x>y?1:0)});
  ids.slice(0,ids.length-CAP_CASES).forEach(function(id){delete map[id]});
 }

 /* ---------- who, and why ---------- */
 /* currentUser is a top-level `let` in js/03 — a lexical global that is NOT on window, which
    this project has had to relearn several times. Read the bare binding. */
 function who(){
  try{return (currentUser&&(currentUser.name||currentUser.id))||''}catch(e){return ''}
 }
 var hint='';            /* the rule currently running, if a rule is what is moving the case */
 var syncing=false;      /* a cloud sync is not a transition — see the header */

 /* ---------- the recorder ---------- */
 var snap={};
 function takeSnap(){
  var m={};
  try{
   (Array.isArray(cases)?cases:[]).forEach(function(c){if(c&&c.id)m[c.id]=c.status||''});
  }catch(e){}
  return m;
 }
 function record(){
  if(syncing){snap=takeSnap();return false}
  var now=takeSnap(),map=log(),changed=false,stamp=new Date().toISOString(),by=who();
  Object.keys(now).forEach(function(id){
   /* A case that was not in the previous snapshot has just arrived — it was created, or it
      came down with a sync. Neither is a transition, so it only joins the snapshot. */
   if(!Object.prototype.hasOwnProperty.call(snap,id))return;
   if(snap[id]===now[id])return;
   var list=Array.isArray(map[id])?map[id]:[];
   list.push({at:stamp,from:snap[id],to:now[id],by:by,how:hint?'auto':'manual',why:hint||''});
   while(list.length>CAP_PER_CASE)list.shift();
   map[id]=list;
   changed=true;
  });
  snap=now;
  if(changed)prune(map);
  return changed;
 }

 /* ---------- pushing it ---------- */
 /* settings travel whole, so one push carries every entry. Debounced: assigning a case can
    save several times in a row and the row does not need uploading each time. */
 var t=null;
 function pushSoon(){
  if(t)clearTimeout(t);
  t=setTimeout(function(){
   t=null;
   try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  },1500);
 }

 /* ---------- the choke point ---------- */
 /* Every path that changes a status calls saveLocal() — js/03's own six, js/16's assign,
    js/44, js/63, and the case edit form — so the diff is taken here rather than by wrapping
    each of them, and a path added later is covered for free. It runs BEFORE the base call,
    so the entry is written into `settings` in time to be persisted by that same save.
    js/41 already wraps saveLocal; this composes over it rather than replacing it. */
 var baseSave=window.saveLocal;
 if(typeof baseSave==='function'){
  window.saveLocal=function(){
   var wrote=false;
   try{wrote=record()}catch(e){}
   var out=baseSave.apply(this,arguments);
   if(wrote)pushSoon();
   return out;
  };
 }

 /* ---------- what the rules are called, in Thai, for the page to show ----------
    A wrapper here does not change what the function does; it only says WHY, while it runs,
    so the entry the diff writes can name the rule instead of blaming whoever is signed in.
    js/69 loads last, so each of these wraps the outermost version — js/63's and js/68's
    saveFieldStatus, js/44's saveServiceReport — and the status those files set on the way
    through is covered by the same hint. */
 function hintWrap(name,text){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var prev=hint;hint=text;
   try{return base.apply(this,arguments)}
   finally{hint=prev}
  };
 }
 hintWrap('saveFieldStatus','ช่างอัปเดตสถานะหน้างาน');
 hintWrap('fieldCheckIn','ช่าง Check-in ถึงหน้างาน');
 hintWrap('saveServiceReport','บันทึกใบตรวจ / จบงาน');
 hintWrap('imodeAssignCase','มอบหมายช่าง');
 hintWrap('saveSchedule','ตั้งนัดหมายบริการ');

 /* ---------- a sync is not a transition ---------- */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   syncing=true;
   var out;
   try{out=baseSync.apply(this,arguments)}
   catch(e){syncing=false;snap=takeSnap();throw e}
   var done=function(){syncing=false;snap=takeSnap()};
   if(out&&typeof out.then==='function')out.then(done,done);
   else done();
   return out;
  };
 }

 /* ---------- read side ---------- */
 window.imodeCaseStatusLog=function(caseId){
  var l=log()[caseId];
  return Array.isArray(l)?l.slice():[];
 };
 window.imodeStatusLogLabel=function(e){
  if(!e)return '';
  return e.how==='auto'
   ? ('ระบบเปลี่ยนเอง'+(e.why?' · '+e.why:''))
   : ('กดเปลี่ยนเอง'+(e.by?' · '+e.by:''));
 };

 /* ---------- start ---------- */
 try{mergeStored()}catch(e){}
 snap=takeSnap();
 /* The first snapshot is taken at parse time, before initCloud() and before anyone can press
    anything, so the first real change of the session is measured against the right baseline. */
})();
