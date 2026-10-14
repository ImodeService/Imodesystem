/* Beta — a job can belong to several technicians, from more than one team.

   Asked for: "อยากให้เพิ่มงานของทั้งทีมและช่างที่ได้รับมอบหมายมีคนไหนบ้าง สามารถให้แอดมิน
   เลือกได้ว่าจะเอางานให้เจาะจงเป็นคนหรือทั้งทีมหรือให้งานนี้มีช่างกี่คนที่ทำ และสามารถเลือก
   ข้ามทีมได้".

   THE SHAPE

   `c.assignee` stays exactly what it was: one technician id, the lead. About fifteen
   places in js/03 alone read it — the dashboard workload counts, the calendar rows, the
   service report header, the reports popups — and none of them are touched. `c.assignees`
   is added beside it: the full list, lead first. So a one-person job is byte-identical to
   what the app has always written, and a two-person job degrades to its lead everywhere
   that has not been taught about the list.

   HOW IT CROSSES THE WIRE, AND WHY NOT A NEW COLUMN

   `service_cases` has no `assignees` column and cloudUpsertCase() sends an explicit
   whitelist, so a new field would simply be dropped and the second technician's phone
   would never learn about the job. Adding a column is a schema change on a database this
   session does not own.

   So the list travels inside the column that already exists: `assignee` is written as
   "T001,T-RD-1", lead first, and split back apart on the way in. A single assignee is
   still written as plain "T001" — nothing about existing rows changes, and a row written
   by an older build still reads correctly. The two wrappers below are the only places
   that know this; everywhere else in the application sees an array.

   The one cost, stated plainly: anything reading the table directly — a SQL report, an
   export — sees a comma list in that column for multi-technician jobs. When a real
   `assignees jsonb` column is added later, delete the two wrappers and map the field
   properly; the rest of the code needs no change because it already speaks arrays.

   TEAM ASSIGNMENT IS A SNAPSHOT

   Choosing "ทั้งทีม Technical" expands to the members of that team at that moment and
   stores them individually. It is not a live reference: somebody hired next month should
   not silently inherit a job that was handed out today, and a technician who leaves the
   team should not lose the job they are in the middle of. */
(function(){
 'use strict';

 function techList(){try{return Array.isArray(technicians)?technicians:[]}catch(e){return[]}}
 function techById(id){return techList().filter(function(t){return t.id===id})[0]||null}

 /* Reading is deliberately forgiving: a case may carry a list, a bare lead, a wire string
    that has not been split yet, or nothing at all. All four have to answer sensibly, or a
    screen breaks on data written by a build that is one version out of step. */
 function assigneesOf(c){
  if(!c)return [];
  var out=[];
  if(Array.isArray(c.assignees))out=c.assignees.slice();
  else if(typeof c.assignees==='string'&&c.assignees)out=c.assignees.split(',');
  if(!out.length&&c.assignee)out=String(c.assignee).split(',');
  var seen={},clean=[];
  out.forEach(function(v){
   var id=String(v||'').trim();
   if(!id||seen[id])return;
   seen[id]=1;clean.push(id);
  });
  return clean;
 }
 /* Writing keeps the two fields in step. The lead is always assignees[0] — never a
    separate choice — so there is no state in which they can disagree. */
 function setAssignees(c,ids){
  if(!c)return [];
  var seen={},clean=[];
  (ids||[]).forEach(function(v){
   var id=String(v||'').trim();
   if(!id||seen[id])return;
   seen[id]=1;clean.push(id);
  });
  c.assignees=clean;
  c.assignee=clean[0]||'';
  /* serviceTeam follows the lead, as it always did. It is not synced to the cloud (there
     is no column for it either), so it is a local convenience, not a record. */
  var lead=techById(c.assignee);
  if(lead)c.serviceTeam=lead.team||c.serviceTeam||'Technical';
  else if(!clean.length)c.serviceTeam=c.serviceTeam||'';
  return clean;
 }
 function isAssignedTo(c,techId){
  if(!techId)return false;
  return assigneesOf(c).indexOf(techId)>=0;
 }
 function assigneeNames(c){
  return assigneesOf(c).map(function(id){
   var t=techById(id);
   return t?t.name:id;
  });
 }
 /* The distinct teams a job spans — what makes "ข้ามทีม" visible on the row. */
 function assigneeTeams(c){
  var seen={},out=[];
  assigneesOf(c).forEach(function(id){
   var t=techById(id),team=(t&&t.team)||'Technical';
   if(seen[team])return;
   seen[team]=1;out.push(team);
  });
  return out;
 }

 window.imodeCaseAssignees=assigneesOf;
 window.imodeSetCaseAssignees=setAssignees;
 window.imodeIsAssignedTo=isAssignedTo;
 window.imodeAssigneeNames=assigneeNames;
 window.imodeAssigneeTeams=assigneeTeams;

 /* ---------------------------------------------------------------- the wire ----- */
 /* Both of these are plain top-level function declarations in js/03, therefore properties
    of window, and every caller — including `a.data.map(fromCaseDb)` inside syncCloud —
    uses the bare identifier, which resolves to the property. Wrapping them is enough. */
 var baseUpsert=window.cloudUpsertCase;
 if(typeof baseUpsert==='function'){
  window.cloudUpsertCase=function(c){
   var ids=assigneesOf(c);
   if(ids.length<2)return baseUpsert.apply(this,arguments);
   /* A shallow copy: the real case object must keep its array, or every screen that has
      just been taught to read one would see a string until the next sync. */
   var wire={},k;
   for(k in c)if(Object.prototype.hasOwnProperty.call(c,k))wire[k]=c[k];
   wire.assignee=ids.join(',');
   return baseUpsert.call(this,wire);
  };
 }
 var baseFrom=window.fromCaseDb;
 if(typeof baseFrom==='function'){
  window.fromCaseDb=function(row){
   var c=baseFrom.apply(this,arguments);
   try{
    var ids=assigneesOf({assignee:c.assignee});
    c.assignees=ids;
    c.assignee=ids[0]||'';
   }catch(e){}
   return c;
  };
 }

 /* A case loaded from localStorage predates this file and carries only a lead. Normalising
    once at boot means nothing downstream has to keep asking which shape it holds. */
 function normalizeAll(){
  try{
   if(!Array.isArray(cases))return;
   cases.forEach(function(c){
    var ids=assigneesOf(c);
    c.assignees=ids;
    c.assignee=ids[0]||'';
   });
  }catch(e){}
 }
 normalizeAll();
 window.imodeNormalizeAssignees=normalizeAll;
 /* syncCloud() replaces the whole array, and js/29 already wraps it for settings; this is
    the same reason — what comes back has to be normalised before anything renders. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){try{normalizeAll()}catch(e){}};
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }
})();
