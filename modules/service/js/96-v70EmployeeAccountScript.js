/* Beta 1.0 — employee login accounts.
   People in demoUsers had no login identity.
   This one-time migration gives each person a stable account link (userId). Technical/R&D
   staff also get their own technician record so assignments resolve to the same person. */
(function(){
 'use strict';
 if(typeof settings!=='object'||typeof demoUsers==='undefined'||!Array.isArray(demoUsers))return;
 if(!window.uatAuth||typeof window.uatAuth.hash!=='function')return;

 /* Employee id -> login to seed: {username, hash (SHA-256 hex), role, technician}.
    EMPTY IN THIS PUBLIC REPOSITORY — real usernames and password hashes are never committed
    here; staff logins belong in Supabase Auth. Shape, for a local test copy only:
      'USR-001':{username:'someone',hash:'<sha256 hex>',role:'Service Manager'}
    With the map empty, seed() creates no account. */
 var SPEC={
  /*@dev-only*/
  /*@end-dev-only*/
 };

 /* 2026-09-23, on the owner's instruction while tidying the account list: these three are
    removed from the system. USR-002 Removed Person A, USR-005 Removed Person B,
    USR-008 Removed Person C. Their demoUsers rows are gone from js/03 too, so a fresh
    device never has them; this migration clears the accounts a device already holds. */
 var REMOVED={'USR-002':'removed_a','USR-005':'removed_b','USR-008':'removed_c'};

 function accounts(){
  try{return typeof window.imodeAccountList==='function'?(window.imodeAccountList()||[]):[]}
  catch(e){return []}
 }
 function uniqueUsername(base,taken){
  var name=base,n=2;
  while(taken[String(name).toLowerCase()])name=base+(n++);
  taken[String(name).toLowerCase()]=1;
  return name;
 }
 function ensureTechnician(person){
  var id='T-'+person.id;
  var list=Array.isArray(technicians)?technicians:[];
  var found=list.filter(function(t){return t.id===id})[0];
  if(found)return found;
  var rec={id:id,employeeId:person.id,name:person.name,role:person.role||'Technician',
   team:person.team||'Technical',phone:'',email:'',status:'พร้อมรับงาน',skills:'',color:'blue',photo:''};
  list.push(rec);
  try{if(typeof cloudUpsert==='function')cloudUpsert('technicians',rec)}catch(e){}
  return rec;
 }
 /* A person who owns a built-in lead account must not also keep the account the first
    employee migration made for them. The duplicate account is dropped, its technician record
    is merged INTO the lead record (so nothing that points at it is orphaned) and every case
    and service report that named the duplicate is repointed. Work history is preserved —
    only the id it hangs off changes. Written once for หัวหน้าช่าง ก on 2026-09-22; generalised here
    for หัวหน้า R&D ข on 2026-09-23 rather than copied a second time. */
 function dedupeLead(userId,leadId,realName,placeholderName){
  var dupId='T-'+userId;
  if(!Array.isArray(settings.uatAccounts))settings.uatAccounts=[];
  settings.uatAccounts=settings.uatAccounts.filter(function(a){return !(a&&a.userId===userId)});
  var list=Array.isArray(technicians)?technicians:[];
  var duplicate=list.filter(function(t){return t&&t.id===dupId})[0];
  var lead=list.filter(function(t){return t&&t.id===leadId})[0];
  if(lead){
   lead.employeeId=userId;
   if(lead.name===placeholderName)lead.name=(duplicate&&duplicate.name)||realName;
   if(duplicate)['phone','email','skills','photo','status'].forEach(function(k){if(duplicate[k])lead[k]=duplicate[k]});
   try{if(typeof cloudUpsert==='function')cloudUpsert('technicians',lead)}catch(e){}
  }
  technicians=technicians.filter(function(t){return !(t&&t.id===dupId)});
  try{
   cases.forEach(function(c){
    if(c.assignee===dupId)c.assignee=leadId;
    /* the crew can also travel as a comma list in the one assignee column (js/38) */
    else if(typeof c.assignee==='string'&&c.assignee.indexOf(dupId)>=0)
     c.assignee=c.assignee.split(',').map(function(id){return id.trim()===dupId?leadId:id.trim()}).join(',');
    if(Array.isArray(c.assignees))c.assignees=c.assignees.map(function(id){return id===dupId?leadId:id});
   });
   serviceReports.forEach(function(r){if(r.techId===dupId)r.techId=leadId});
  }catch(e){}
  try{if(typeof supa!=='undefined'&&supa)supa.from('technicians').delete().eq('id',dupId)}catch(e){}
 }

 /* Deleting a person is NOT deleting their work. The account goes; the technician record is
    only deleted when nothing points at it, because every case and service report attributes
    its work by that id — an orphaned reference would show a blank technician on a finished
    job. A record that is still referenced is kept and named in the console. */
 function techIsUsed(id){
  var hit=false;
  try{
   cases.forEach(function(c){
    if(c.assignee===id)hit=true;
    else if(typeof c.assignee==='string'&&c.assignee.split(',').some(function(x){return x.trim()===id}))hit=true;
    if(Array.isArray(c.assignees)&&c.assignees.indexOf(id)>=0)hit=true;
   });
   serviceReports.forEach(function(r){if(r.techId===id)hit=true});
  }catch(e){}
  return hit;
 }
 function removeEmployees(){
  var changed=false;
  if(!Array.isArray(settings.uatAccounts))settings.uatAccounts=[];
  var before=settings.uatAccounts.length;
  settings.uatAccounts=settings.uatAccounts.filter(function(a){
   if(!a)return false;
   if(REMOVED[a.userId])return false;
   return !Object.keys(REMOVED).some(function(k){
    return REMOVED[k]===String(a.username||'').toLowerCase();
   });
  });
  if(settings.uatAccounts.length!==before)changed=true;
  /* Their technician record may have been created by hand on the ทีมช่าง page rather than by
     this file, so it does not carry the T-USR-xxx id. It is matched by name as well — still
     only removed when nothing points at it. */
  var REMOVED_NAMES=['Removed Person A','Removed Person B','Removed Person C'];
  (Array.isArray(technicians)?technicians.slice():[]).forEach(function(t){
   if(!t||REMOVED_NAMES.indexOf(String(t.name||'').trim())<0)return;
   if(techIsUsed(t.id)){
    try{console.warn('[imode] technician record '+t.id+' ('+t.name+') still carries work — kept')}catch(e){}
    return;
   }
   technicians=technicians.filter(function(x){return x!==t});
   changed=true;
   try{if(typeof supa!=='undefined'&&supa)supa.from('technicians').delete().eq('id',t.id)}catch(e){}
  });
  Object.keys(REMOVED).forEach(function(userId){
   var techId='T-'+userId;
   var list=Array.isArray(technicians)?technicians:[];
   if(!list.some(function(t){return t&&t.id===techId}))return;
   if(techIsUsed(techId)){
    try{console.warn('[imode] technician record '+techId+' still carries work — record kept, account removed')}catch(e){}
    return;
   }
   technicians=technicians.filter(function(t){return !(t&&t.id===techId)});
   changed=true;
   try{if(typeof supa!=='undefined'&&supa)supa.from('technicians').delete().eq('id',techId)}catch(e){}
  });
  return changed;
 }

 /* syncCloud() replaces `technicians` wholesale from the server, and at parse time `supa` is
    still null so the cloud row cannot be deleted yet — a removed person would come straight
    back on the first sync. Re-applying afterwards cleans the fresh copy and issues the delete
    once the client exists. It sets no flag, so it is idempotent and silent when there is
    nothing to do. */
 function afterSync(){
  /* production: these one-off repairs were written for the test database; never on real data */
  if((window.IMODE_ENV&&window.IMODE_ENV.production))return;
  /* Runs on the copy the server just sent, where `supa` finally exists, so this is also when
     the duplicate's row is actually deleted and the repointed cases are pushed back. */
  var merged1=mergeDuplicateYung();
  if(mergeSameNameDuplicates())merged1=true;
  /* 2026-09-23 — why manager_demo / tech_demo1 / tech_demo2 could not sign in. seed() runs at parse time,
     when `supa` is still null, so its cloudSaveSettings() does nothing; syncCloud() then
     replaces `settings` wholesale and took the new accounts AND the seeded flag with it, on
     every single load. Only js/09's code-defined accounts survived. Seeding again on the copy
     the server sent puts them back and — because `supa` exists by now — actually pushes them,
     after which the flag is in the shared row and this does nothing. seed() is flag-guarded
     and idempotent, so it is safe to call twice. */
  seed();
  if(!removeEmployees()&&!merged1)return;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }
 var baseSyncCloud=window.syncCloud;
 if(typeof baseSyncCloud==='function'){
  window.syncCloud=function(){
   var r=baseSyncCloud.apply(this,arguments);
   if(r&&typeof r.then==='function')return r.then(function(v){afterSync();return v});
   afterSync();
   return r;
  };
 }

 /* 2026-09-23, on the owner's instruction with a screenshot: there are TWO หัวหน้าช่าง ก records on
    the ทีมช่าง page — a plain "หัวหน้าช่าง ก" carrying 5 open jobs, and "หัวหน้าทีม Technical หัวหน้าช่าง ก"
    (T-LEAD-TECH) carrying none. He is the Technical lead, so the work moves to the lead record
    and the plain one goes.
    Those duplicates were created by hand on the ทีมช่าง page, not by this file, so their ids
    are unknown here — they are found by their exact name. Nothing is deleted before its work
    has been repointed, and a record that carries work is never dropped silently.
    It is idempotent: with no duplicate left it returns at once, which is why it needs no
    version flag and can run again after every sync. */
 function techList(){return Array.isArray(technicians)?technicians:[]}
 function mergeTechInto(fromId,toId){
  var touchedCases=[],touchedReports=[];
  try{
   cases.forEach(function(c){
    var hit=false;
    if(c.assignee===fromId){c.assignee=toId;hit=true}
    else if(typeof c.assignee==='string'&&c.assignee.indexOf(fromId)>=0){
     var ids=c.assignee.split(',').map(function(x){return x.trim()});
     if(ids.indexOf(fromId)>=0){
      /* the lead may already be on the crew — repoint, then drop the duplicate id */
      ids=ids.map(function(x){return x===fromId?toId:x});
      c.assignee=ids.filter(function(x,i){return x&&ids.indexOf(x)===i}).join(',');
      hit=true;
     }
    }
    if(Array.isArray(c.assignees)&&c.assignees.indexOf(fromId)>=0){
     var list=c.assignees.map(function(x){return x===fromId?toId:x});
     c.assignees=list.filter(function(x,i){return x&&list.indexOf(x)===i});
     hit=true;
    }
    if(Array.isArray(c.fieldStatusLog)){
     c.fieldStatusLog.forEach(function(e){
      if(e&&e.techId===fromId){e.techId=toId;hit=true}
      else if(e&&typeof e.techId==='string'&&e.techId.indexOf(fromId)>=0){
       e.techId=e.techId.split(',').map(function(x){return x.trim()===fromId?toId:x.trim()}).join(',');
       hit=true;
      }
     });
    }
    if(hit){c.updatedAt=new Date().toISOString();touchedCases.push(c)}
   });
   serviceReports.forEach(function(r){
    if(r&&r.techId===fromId){r.techId=toId;touchedReports.push(r)}
   });
  }catch(e){}
  /* An account that pointed at the duplicate must follow, or its owner signs in to an empty
     งานของฉัน — the exact failure that hit tech_test1 in part 29. */
  try{
   if(Array.isArray(settings.uatAccounts))
    settings.uatAccounts.forEach(function(a){if(a&&a.technicianId===fromId)a.technicianId=toId});
   if(settings.uatAccountEdits&&typeof settings.uatAccountEdits==='object')
    Object.keys(settings.uatAccountEdits).forEach(function(k){
     var ed=settings.uatAccountEdits[k];
     if(ed&&ed.technicianId===fromId)ed.technicianId=toId;
    });
  }catch(e){}
  return {cases:touchedCases,reports:touchedReports};
 }
 function mergeDuplicateYung(){
  var lead=techList().filter(function(t){return t&&t.id==='T-LEAD-TECH'})[0]
        || techList().filter(function(t){
             return t&&String(t.name||'').indexOf('หัวหน้าช่าง ก')>=0
                    &&String(t.role||'').toLowerCase().indexOf('supervisor')>=0;
           })[0];
  if(!lead)return false;
  var dups=techList().filter(function(t){
   return t&&t.id!==lead.id&&String(t.name||'').trim()==='หัวหน้าช่าง ก';
  });
  if(!dups.length)return false;
  var pushCases=[],pushReports=[];
  dups.forEach(function(d){
   var moved=mergeTechInto(d.id,lead.id);
   pushCases=pushCases.concat(moved.cases);
   pushReports=pushReports.concat(moved.reports);
   /* keep the contact details the duplicate carried — the lead card shows "-" for them */
   ['phone','email','skills','photo','color'].forEach(function(k){if(!lead[k]&&d[k])lead[k]=d[k]});
   if(d.employeeId&&!lead.employeeId)lead.employeeId=d.employeeId;
  });
  var goneIds=dups.map(function(d){return d.id});
  technicians=techList().filter(function(t){return goneIds.indexOf(t.id)<0});
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  /* The move has to travel: syncCloud() replaces `cases` wholesale from the server, so a
     repointed case that was only saved locally would be undone by the next sync. */
  try{
   if(typeof window.cloudUpsertCase==='function')pushCases.forEach(function(c){window.cloudUpsertCase(c)});
   if(typeof window.cloudUpsertServiceReport==='function')pushReports.forEach(function(r){window.cloudUpsertServiceReport(r)});
   if(typeof cloudUpsert==='function')cloudUpsert('technicians',lead);
   if(typeof supa!=='undefined'&&supa)goneIds.forEach(function(id){supa.from('technicians').delete().eq('id',id)});
  }catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  try{console.info('[imode] merged '+goneIds.join(', ')+' into '+lead.id+' — '+pushCases.length+' case(s), '+pushReports.length+' report(s)')}catch(e){}
  return true;
 }
 window.imodeMergeDuplicateYung=mergeDuplicateYung;


 /* 2026-09-23: two technician records with the SAME NAME are one person twice — js/39's
    createRecordFor() makes a record for an account that has none, so an employee who already
    had one ends up with a second (หัวหน้า R&D ข had T-LEAD-RD and T1790146531546).
    The record carrying employeeId wins, because that is the one every merge and every lead
    lookup already points at; the other is emptied into it with mergeTechInto(), which moves
    the cases, the field log, the service reports and any account link before it is deleted.
    Idempotent — with no duplicate names it returns at once. */
 function mergeSameNameDuplicates(){
  var list=techList(),byName={},moved=false;
  list.forEach(function(t){
   var n=String((t&&t.name)||'').trim().toLowerCase();
   if(!n)return;
   (byName[n]=byName[n]||[]).push(t);
  });
  Object.keys(byName).forEach(function(n){
   var group=byName[n];
   if(group.length<2)return;
   var keep=group.filter(function(t){return t.employeeId})[0]||group[0];
   var pushCases=[],pushReports=[],gone=[];
   group.forEach(function(d){
    if(d===keep)return;
    var r=mergeTechInto(d.id,keep.id);
    pushCases=pushCases.concat(r.cases);
    pushReports=pushReports.concat(r.reports);
    ['phone','email','skills','photo','color'].forEach(function(k){if(!keep[k]&&d[k])keep[k]=d[k]});
    gone.push(d.id);
   });
   if(!gone.length)return;
   technicians=techList().filter(function(t){return gone.indexOf(t.id)<0});
   moved=true;
   try{
    if(typeof window.cloudUpsertCase==='function')pushCases.forEach(function(c){window.cloudUpsertCase(c)});
    if(typeof window.cloudUpsertServiceReport==='function')pushReports.forEach(function(r){window.cloudUpsertServiceReport(r)});
    if(typeof cloudUpsert==='function')cloudUpsert('technicians',keep);
    if(typeof supa!=='undefined'&&supa)gone.forEach(function(id){supa.from('technicians').delete().eq('id',id)});
   }catch(e){}
   try{console.info('[imode] merged duplicate record(s) '+gone.join(', ')+' into '+keep.id)}catch(e){}
  });
  if(moved){try{if(typeof saveLocal==='function')saveLocal()}catch(e){}}
  return moved;
 }
 window.imodeMergeSameNameTechnicians=mergeSameNameDuplicates;

 /* Does every person SPEC names, and who is actually in demoUsers on this device, hold an
    account? Matched on userId, not on the username, because js/39 may have renamed one. */
 function specAccountsPresent(){
  var have={};
  accounts().forEach(function(a){if(a&&a.userId)have[a.userId]=1});
  var missing=false;
  Object.keys(SPEC).forEach(function(id){
   if(have[id])return;
   if(!demoUsers.filter(function(p){return p&&p.id===id}).length)return;   /* no such person */
   missing=true;
  });
  return !missing;
 }
 function seed(){
  if((window.IMODE_ENV&&window.IMODE_ENV.production))return;
  /* หัวหน้าช่าง ก already owns the built-in lead_technician identity. */
  var moved=false;
  if(!settings.v70LeadTechnicianDeduped){
   dedupeLead('USR-003','T-LEAD-TECH','Example Tech Lead','หัวหน้าทีม Technical');
   settings.v70LeadTechnicianDeduped=true;moved=true;
  }
  /* 2026-09-23, on the owner's mapping: หัวหน้า R&D ข = Example R&D Lead, one account = lead_rd. */
  if(!settings.v70LeadRdDeduped){
   dedupeLead('USR-004','T-LEAD-RD','Example R&D Lead','หัวหน้าทีม R&D');
   settings.v70LeadRdDeduped=true;moved=true;
  }
  if(!settings.v70EmployeeRemoval20260923){
   removeEmployees();
   settings.v70EmployeeRemoval20260923=true;moved=true;
  }
  if(mergeDuplicateYung())moved=true;
  if(mergeSameNameDuplicates())moved=true;
  if(moved){
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  }
  /* The flag on its own is not proof. It and the accounts live in the same settings object,
     and a copy carrying one without the other is exactly the state this device was stuck in
     for a whole session. The accounts themselves are the evidence. */
  if(settings.v70ActualEmployeeAccountsSeeded&&specAccountsPresent())return;
  if(!Array.isArray(settings.uatAccounts))settings.uatAccounts=[];
  var existing=accounts(),taken={};
  existing.forEach(function(a){taken[String(a.username||'').toLowerCase()]=1});
  demoUsers.forEach(function(person){
   var spec=SPEC[person.id];
   if(!spec)return;
   var linked=existing.filter(function(a){
    return a&&a.userId===person.id;
   })[0];
   if(linked)return;
   var username=uniqueUsername(spec.username,taken);
   var tech=spec.technician?ensureTechnician(person):null;
   settings.uatAccounts.push({
    username:username,
    hash:spec.hash,
    accountType:spec.technician?'technician':'staff',
    userId:person.id,
    technicianId:tech?tech.id:'',
    name:person.name,
    role:spec.role,
    team:person.team||'',
    createdAt:new Date().toISOString(),
    createdBy:'system-employee-migration'
   });
  });
  settings.v70ActualEmployeeAccountsSeeded=true;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }

 /* Preserve the real employee identity in the session. permissionRole remains the account
    role, while role keeps the person's job title for screens that display it. */
 var baseAccountToUser=window.uatAuth.accountToUser;
 window.uatAuth.accountToUser=function(acc){
  var user=baseAccountToUser.call(this,acc);
  if(!acc||!acc.userId)return user;
  var person=demoUsers.filter(function(p){return p.id===acc.userId})[0];
  if(!person)return user;
  return Object.assign({},user,person,{
   username:acc.username,
   accountType:acc.accountType,
   permissionRole:acc.role,
   technicianId:acc.technicianId||'',
   photo:user.photo||''
  });
 };

 window.imodeUnlinkedEmployees=function(){
  var linked={};
  accounts().forEach(function(a){if(a&&a.userId)linked[a.userId]=1});
  return demoUsers.filter(function(p){return !linked[p.id]});
 };

 seed();
})();
