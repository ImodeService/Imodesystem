/* Beta — ถังขยะ: deleted records wait 30 days before they are really gone.

   Asked for: "เพิ่มโมดุลถังขยะขึ้นมา และแบ่งประเภทของข้อมูลที่ลบ เช่น เคส เอกสาร บัญชี
   ที่อยู่ในโมดุลถังขยะ นับถอยหลัง 30 วัน".

   WHAT COULD BE DELETED BEFORE THIS FILE, AND WHAT ACTUALLY HAPPENED

   Almost nothing. Searching the whole workspace for record deletion turns up exactly two
   functions — deleteMachineDocument() in js/03 and deleteRelatedEmployee() in js/06 — plus
   the account deletion added in js/39. Cases, customers, machines, warranties, QC records,
   spare parts, purchase orders and petty cash have no delete at all.

   Both of the two were also broken on a cloud-connected device, which nobody had noticed
   because it only shows on the second device: they removed the row from the local array
   and never touched Supabase, and syncCloud() replaces the whole array from the server, so
   the "deleted" document came back on the next sync. Deleting now removes the cloud row as
   well, and restoring puts it back.

   THE STORE

   settings.trash               the bin, so it travels between devices like everything else
   settings.trashRetentionDays  30 by default, changeable without touching this file

   An account deletion has to reach every device or the account keeps signing in elsewhere,
   which is the reason the bin lives in settings rather than in a key of its own.

   THE SIZE PROBLEM, AND WHY SOME ENTRIES SAY "เฉพาะเครื่องนี้"

   settings is pushed to system_settings as one JSON blob. A deleted machine document can
   carry a base64 file of several megabytes; a handful of those in the bin would bloat that
   row and eventually break settings sync for everybody — a much worse failure than losing
   an undo. So a payload over BIG_BYTES is kept in a device-local overflow store
   (imode_v70_trash_blob) and only its description travels. That entry says on screen that
   it can be restored on this device only. Small records — cases, accounts, employees, and
   documents that are just a link — travel whole and restore anywhere.

   PERMISSION: DELIBERATELY AN EXISTING KEY

   The bin is gated on settings.manage rather than a new trash.view. Any script that pushes
   a new key into PERMISSION_CATALOG must load before js/20, which repairs roles against
   the catalog as it stands at that moment; this file loads after it, so a new key would be
   stripped from every role on every reload. That is the bug that quietly removed four
   permissions for two sessions. PAGE_PERMISSION is a different thing — it maps a page to
   an existing key — and is safe to extend.

   PURGING IS NOT UNDOING

   For a created account, an employee, a document or a case, purging means the payload is
   dropped and the record is gone for good. For one of the seven built-in accounts the
   deletion is a tombstone in settings.uatAccountEdits: purging removes the bin entry and
   LEAVES the tombstone, because clearing it would resurrect the account — the opposite of
   what "delete permanently" means. */
(function(){
 'use strict';

 var BLOB_KEY='imode_v70_trash_blob';
 var BIG_BYTES=120000;      /* one entry above this stays on the device that deleted it */
 var MAX_ENTRIES=80;        /* oldest beyond this are purged even inside the window */

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 /* 2026-09-17: the styled confirmation (js/78), with the browser's own box as the fallback
    so a missing file can never turn a permanent delete into a silent one. */
 function ask(message,title){
  try{
   if(typeof window.imodeConfirm==='function')
    return window.imodeConfirm({message:message,title:title||'',danger:true});
  }catch(e){}
  return Promise.resolve(window.confirm(message));
 }
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function uid2(){try{return (typeof uid==='function')?uid():'t'+Date.now()+Math.random()}catch(e){return 't'+Date.now()}}
 function meName(){try{return (currentUser&&(currentUser.name||currentUser.username))||''}catch(e){return''}}

 function retentionDays(){
  var n=0;
  try{n=Number(settings.trashRetentionDays)}catch(e){}
  return (n>0&&n<3650)?n:30;
 }
 function bin(){
  try{
   if(!Array.isArray(settings.trash))settings.trash=[];
   return settings.trash;
  }catch(e){return []}
 }
 function persist(){
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }

 /* ------------------------------------------------------------- overflow store -- */
 function blobs(){
  try{var raw=localStorage.getItem(BLOB_KEY);var o=raw?JSON.parse(raw):{};return (o&&typeof o==='object')?o:{}}
  catch(e){return {}}
 }
 function saveBlobs(o){try{localStorage.setItem(BLOB_KEY,JSON.stringify(o));return true}catch(e){return false}}
 function putBlob(id,payload){var o=blobs();o[id]=payload;return saveBlobs(o)}
 function getBlob(id){return blobs()[id]}
 function dropBlob(id){var o=blobs();if(!(id in o))return;delete o[id];saveBlobs(o)}

 /* ------------------------------------------------------------------- the cloud -- */
 /* supa and cloudSettings are top-level `let` in js/03 and therefore absent from window;
    read by bare identifier. A failure here must not stop a local delete — the row is gone
    locally either way and the next sync is what would bring it back, which is reported. */
 function cloudDelete(table,id){
  try{
   if(typeof supa==='undefined'||!supa||!table||!id)return Promise.resolve({skipped:true});
   return Promise.resolve(supa.from(table).delete().eq('id',id)).then(function(r){
    if(r&&r.error){console.warn('[imode trash] cloud delete failed',table,id,r.error);return {error:r.error}}
    return {ok:true};
   },function(e){console.warn('[imode trash] cloud delete threw',table,id,e);return {error:e}});
  }catch(e){return Promise.resolve({error:e})}
 }

 /* The key the customer's requests ride under inside a binned case's payload. Reserved:
    a real case never carries it, and it is stripped again on restore. */
 var REQ_KEY='__imodeRequests';
 var MACHINE_RELATED_KEY='__imodeMachineRelated';

 /* ------------------------------------------------------------------- the types -- */
 /* Each type knows how to describe itself, how to put its record back, and which cloud
    table the row lived in. Adding a new deletable thing later means one entry here. */
 var TYPES={
  'case':{
   th:'เคสงานบริการ', en:'Service cases', icon:'📋', table:'service_cases',
   /* 2026-09-18: a case is binned together with the customer request that opened it —
      "พอกดแล้ว ให้หายไปจากทุกหน้า จะไปอยู่แค่ที่เดียวคือถังขยะ". They travel as ONE entry, under
      REQ_KEY on a copy of the case, so restoring brings both back in one press. An entry
      binned before this exists has no such key and restores exactly as it always did. */
   restore:function(p){
    try{
     if(!Array.isArray(cases))return false;
     var reqs=(p&&Array.isArray(p[REQ_KEY]))?p[REQ_KEY]:[];
     var c={};
     Object.keys(p||{}).forEach(function(k){if(k!==REQ_KEY)c[k]=p[k]});
     if(!cases.some(function(x){return x.id===c.id})){
      cases.unshift(c);
      if(typeof cloudUpsertCase==='function'){try{cloudUpsertCase(c)}catch(e){}}
     }
     if(reqs.length&&Array.isArray(lineRequests)){
      reqs.forEach(function(r){
       if(!r||!r.id)return;
       if(lineRequests.some(function(x){return x.id===r.id}))return;
       lineRequests.unshift(r);
       if(typeof cloudUpsertLineRequest==='function'){try{cloudUpsertLineRequest(r)}catch(e){}}
      });
     }
     return true;
    }catch(e){return false}
   }
  },
  quotation:{
   th:'ใบเสนอราคา', en:'Quotations', icon:'💶', table:'quotations',
   restore:function(p){
    try{
     if(!Array.isArray(quotations))return false;
     if(quotations.some(function(q){return q.id===p.id}))return true;
     quotations.unshift(p);
     if(typeof cloudUpsertQuotation==='function'){try{cloudUpsertQuotation(p)}catch(e){}}
     return true;
    }catch(e){return false}
   }
  },
  request:{
   th:'คำขอจากลูกค้า', en:'Customer requests', icon:'📥', table:'line_customer_requests',
   restore:function(p){
    try{
     if(!Array.isArray(lineRequests))return false;
     if(lineRequests.some(function(r){return r.id===p.id}))return true;
     lineRequests.unshift(p);
     if(typeof cloudUpsertLineRequest==='function'){try{cloudUpsertLineRequest(p)}catch(e){}}
     return true;
    }catch(e){return false}
   }
  },
  customer:{
   th:'ลูกค้า', en:'Customers', icon:'🏢', table:'customers',
   restore:function(p){
    try{
     if(!Array.isArray(customers))return false;
     if(customers.some(function(c){return c.id===p.id}))return true;
     customers.push(p);
     if(typeof cloudUpsertCustomer==='function'){try{cloudUpsertCustomer(p)}catch(e){}}
     return true;
    }catch(e){return false}
   }
  },
  machine:{
   th:'เครื่องจักร', en:'Machines', icon:'⚙', table:'machines',
   restore:function(p){
    try{
     if(!Array.isArray(machines))return false;
     var related=p&&p[MACHINE_RELATED_KEY]||{},m={};
     Object.keys(p||{}).forEach(function(k){if(k!==MACHINE_RELATED_KEY)m[k]=p[k]});
     if(!machines.some(function(x){return x.id===m.id}))machines.unshift(m);
     if(typeof cloudUpsertMachine==='function'){try{cloudUpsertMachine(m)}catch(e){}}
     function restoreRows(target,rows,upsert){
      if(!Array.isArray(target))return;
      (rows||[]).forEach(function(row){
       if(!row||target.some(function(x){return x.id===row.id}))return;
       target.unshift(row);
       if(typeof upsert==='function')try{upsert(row)}catch(e){}
      });
     }
     restoreRows(cases,related.cases,typeof cloudUpsertCase==='function'?cloudUpsertCase:null);
     restoreRows(quotations,related.quotations,typeof cloudUpsertQuotation==='function'?cloudUpsertQuotation:null);
     restoreRows(warranties,related.warranties,typeof cloudUpsertWarranty==='function'?cloudUpsertWarranty:null);
     restoreRows(qcRecords,related.qcRecords,null);
     restoreRows(lineRequests,related.lineRequests,typeof cloudUpsertLineRequest==='function'?cloudUpsertLineRequest:null);
     return true;
    }catch(e){return false}
   }
  },
  document:{
   th:'เอกสารเครื่องจักร', en:'Machine documents', icon:'📁', table:'machine_documents',
   restore:function(p){
    try{
     if(!Array.isArray(machineDocuments))return false;
     if(machineDocuments.some(function(d){return d.id===p.id}))return true;
     machineDocuments.unshift(p);
     if(typeof cloudUpsertMachineDocument==='function'){try{cloudUpsertMachineDocument(p)}catch(e){}}
     return true;
    }catch(e){return false}
   }
  },
  account:{
   th:'บัญชีผู้ใช้', en:'User accounts', icon:'🔐', table:'',
   restore:function(p){
    try{
     if(p.builtIn){
      if(typeof window.imodeAccountRestore==='function')window.imodeAccountRestore(p.originalUsername||p.username);
      return true;
     }
     if(!Array.isArray(settings.uatAccounts))settings.uatAccounts=[];
     var k=String(p.username||'').toLowerCase();
     if(settings.uatAccounts.some(function(a){return String(a.username||'').toLowerCase()===k}))return true;
     var row={};
     for(var f in p)if(Object.prototype.hasOwnProperty.call(p,f)&&f!=='builtIn'&&f!=='originalUsername')row[f]=p[f];
     settings.uatAccounts.push(row);
     return true;
    }catch(e){return false}
   },
   /* A built-in's tombstone must survive the purge, or the account would come back. */
   purge:function(p){ return true; }
  },
  employee:{
   th:'พนักงานที่เกี่ยวข้อง', en:'Related employees', icon:'🪪', table:'',
   restore:function(p){
    try{
     if(!Array.isArray(settings.relatedEmployees))settings.relatedEmployees=[];
     if(settings.relatedEmployees.some(function(e){return e.id===p.id}))return true;
     settings.relatedEmployees.push(p);
     return true;
    }catch(e){return false}
   }
  }
 };
 function typeOf(t){return TYPES[t]||{th:t,en:t,icon:'🗂',table:'',restore:function(){return false}}}

 /* ------------------------------------------------------------------- the API ---- */
 function expiresAt(e){
  var t=new Date(e.deletedAt||0).getTime();
  return t+retentionDays()*86400000;
 }
 function daysLeft(e){
  var ms=expiresAt(e)-Date.now();
  return Math.max(0,Math.ceil(ms/86400000));
 }
 /* Runs on every read and every write. Doing it lazily rather than on a timer means the
    bin is correct whenever anybody looks at it, on whichever device they look. */
 function sweep(){
  var list=bin(),now=Date.now(),keep=[],dropped=0;
  list.forEach(function(e){
   if(expiresAt(e)<=now){dropBlob(e.id);dropped++;return}
   keep.push(e);
  });
  keep.sort(function(a,b){return new Date(b.deletedAt||0)-new Date(a.deletedAt||0)});
  while(keep.length>MAX_ENTRIES){var gone=keep.pop();dropBlob(gone.id);dropped++}
  if(dropped){settings.trash=keep;persist()}
  else settings.trash=keep;
  return keep;
 }

 window.imodeTrashPut=function(type,payload,meta){
  meta=meta||{};
  var id=uid2();
  var json='';
  try{json=JSON.stringify(payload||{})}catch(e){json=''}
  var big=json.length>BIG_BYTES;
  var entry={
   id:id,type:type,
   title:String(meta.title||'').slice(0,160),
   sub:String(meta.sub||'').slice(0,220),
   deletedAt:new Date().toISOString(),
   deletedBy:meName(),
   device:big?(navigator.userAgent||'').slice(0,60):'',
   big:big,
   /* 2026-09-25: the ids of the records this entry holds, kept even when the payload is too
      big to travel — js/71 reads them so no device can sync a binned record back to life. */
   refIds:[payload&&payload.id].concat(((payload&&payload[REQ_KEY])||[]).map(function(r){return r&&r.id})).filter(Boolean)
  };
  if(big){
   if(!putBlob(id,payload))return null;   /* nothing recorded rather than a dead entry */
  }else{
   entry.payload=payload;
  }
  bin().unshift(entry);
  sweep();
  persist();
  return entry;
 };
 window.imodeTrashList=function(){return sweep().slice()};
 window.imodeTrashCounts=function(){
  var out={};
  sweep().forEach(function(e){out[e.type]=(out[e.type]||0)+1});
  return out;
 };
 window.imodeTrashRestore=function(entryId){
  var list=sweep(),e=list.filter(function(x){return x.id===entryId})[0];
  if(!e)return {ok:false,message:tl('ไม่พบรายการนี้ในถังขยะ','That item is no longer in the bin')};
  var payload=e.big?getBlob(e.id):e.payload;
  if(!payload)return {ok:false,message:tl('ข้อมูลของรายการนี้อยู่บนเครื่องที่กดลบเท่านั้น กู้คืนได้จากเครื่องนั้น',
                                          'This item’s data is only on the device it was deleted from')};
  var ok=false;
  try{ok=typeOf(e.type).restore(payload)}catch(x){ok=false}
  if(!ok)return {ok:false,message:tl('กู้คืนไม่สำเร็จ','Restore failed')};
  settings.trash=list.filter(function(x){return x.id!==e.id});
  dropBlob(e.id);
  persist();
  try{if(typeof renderAll==='function')renderAll()}catch(x){}
  return {ok:true};
 };
 window.imodeTrashPurge=function(entryId){
  var list=sweep(),e=list.filter(function(x){return x.id===entryId})[0];
  if(!e)return {ok:false};
  try{var t=typeOf(e.type);if(typeof t.purge==='function')t.purge(e.big?getBlob(e.id):e.payload)}catch(x){}
  settings.trash=list.filter(function(x){return x.id!==e.id});
  dropBlob(e.id);
  persist();
  return {ok:true};
 };
 window.imodeTrashPurgeAll=function(){
  sweep().forEach(function(e){
   try{var t=typeOf(e.type);if(typeof t.purge==='function')t.purge(e.big?getBlob(e.id):e.payload)}catch(x){}
   dropBlob(e.id);
  });
  settings.trash=[];
  persist();
  return {ok:true};
 };

 /* ---------------------------------------------------------- catch the deletions -- */
 /* Machine documents. The original removed the row locally and left the cloud copy, so on
    a second device the document reappeared at the next sync. */
 var baseDelDoc=window.deleteMachineDocument;
 if(typeof baseDelDoc==='function'){
  window.deleteMachineDocument=function(id){
   var d=null;
   try{d=(machineDocuments||[]).filter(function(x){return x.id===id})[0]||null}catch(e){}
   if(!d)return baseDelDoc.apply(this,arguments);
   var before=0;
   try{before=machineDocuments.length}catch(e){}
   var r=baseDelDoc.apply(this,arguments);
   var after=before;
   try{after=machineDocuments.length}catch(e){}
   if(after<before){                       /* the confirm was accepted */
    window.imodeTrashPut('document',d,{
     title:d.title||d.id,
     sub:[d.category,d.machineName||d.machineId,d.version].filter(Boolean).join(' · ')
    });
    cloudDelete('machine_documents',id);
    toast(tl('ย้ายเอกสารไปถังขยะแล้ว','Document moved to the bin'));
   }
   return r;
  };
 }

 /* Related employees live inside settings, so there is no cloud row to remove. */
 var baseDelEmp=window.deleteRelatedEmployee;
 if(typeof baseDelEmp==='function'){
  window.deleteRelatedEmployee=function(id){
   var e0=null;
   try{e0=(settings.relatedEmployees||[]).filter(function(x){return x.id===id})[0]||null}catch(e){}
   var before=0;
   try{before=(settings.relatedEmployees||[]).length}catch(e){}
   var r=baseDelEmp.apply(this,arguments);
   var after=before;
   try{after=(settings.relatedEmployees||[]).length}catch(e){}
   if(e0&&after<before){
    window.imodeTrashPut('employee',e0,{title:e0.name||e0.id,sub:[e0.position,e0.department,e0.phone].filter(Boolean).join(' · ')});
    toast(tl('ย้ายพนักงานไปถังขยะแล้ว','Employee moved to the bin'));
   }
   return r;
  };
 }

 /* Accounts. js/39 already refuses the three dangerous deletions and records a tombstone
    for a built-in; this only remembers what was removed so it can be put back, and it is
    what makes a *created* account recoverable — before this it vanished outright. */
 var baseDelAcct=window.imodeAccountDelete;
 if(typeof baseDelAcct==='function'){
  window.imodeAccountDelete=function(username){
   var acc=null;
   try{acc=(typeof window.imodeAccountList==='function')
    ? window.imodeAccountList().filter(function(a){return String(a.username||'').toLowerCase()===String(username||'').toLowerCase()})[0]||null
    : null}catch(e){}
   var res=baseDelAcct.apply(this,arguments);
   if(res&&res.ok&&acc){
    window.imodeTrashPut('account',acc,{
     title:acc.username,
     sub:[acc.role,acc.team,acc.technicianId].filter(Boolean).join(' · ')
       +(acc.builtIn?' · '+tl('บัญชีมาตรฐาน','built-in'):'')
    });
   }
   return res;
  };
 }
 /* js/39's own restore strip would offer a second, competing way back that ignores the
    countdown; the bin is now the one place. */
 var baseAdminModal=window.openAccountAdminModal;
 if(typeof baseAdminModal==='function'){
  window.openAccountAdminModal=function(){
   var r=baseAdminModal.apply(this,arguments);
   try{
    var strip=document.querySelector('#modalBody .acctmg-gone');
    if(strip){
     strip.innerHTML='<b>'+esc2(tl('บัญชีที่ลบไปแล้ว','Deleted accounts'))+'</b>'
      +'<button type="button" class="acctmg-mini" onclick="closeModal();goPage(\'trash\')">'
      +esc2(tl('กู้คืนได้ที่ถังขยะ','Restore them in the bin'))+' ›</button>';
    }
   }catch(e){}
   return r;
  };
 }

 /* Cases had no delete anywhere in the application. One is added here rather than in js/03
    so it can be removed by deleting this file, and it is safe to offer precisely because it
    is recoverable. The cloud row goes too — without that, syncCloud() would replace the
    local array from the server and the case would be back within seconds. */
 /* The customer's own report is what opened the case, so it goes with it — otherwise the row
    stays on หน้าคำขอ pointing at a case that no longer exists, which is what was reported. */
 function requestsOfCase(cid){
  try{
   if(!Array.isArray(lineRequests))return [];
   return lineRequests.filter(function(r){return r&&r.caseId===cid});
  }catch(e){return []}
 }
 /* `silent` is used by the hand-off from service-case-detail.html, which has already asked on
    its own page — see js/28. Nothing else may pass it. */
 function deleteCase(cid,silent){
  var c=null;
  try{c=(cases||[]).filter(function(x){return x.id===cid})[0]||null}catch(e){}
  if(!c)return {ok:false};
  if(typeof requirePermission==='function'&&!requirePermission('case.edit'))return {ok:false};
  var reqs=requestsOfCase(cid);
  if(!silent&&!confirm(tl('ย้ายเคส ','Move case ')+(c.ticket||c.id)
    +(reqs.length?tl(' และคำขอจากลูกค้า '+reqs.length+' รายการ',' and '+reqs.length+' customer request(s)'):'')
    +tl(' ไปถังขยะ? กู้คืนได้ภายใน ',' to the bin? It can be restored within ')
    +retentionDays()+tl(' วัน',' days')))return {ok:false};
  var payload={};
  Object.keys(c).forEach(function(k){payload[k]=c[k]});
  if(reqs.length)payload[REQ_KEY]=reqs.map(function(r){return r});
  window.imodeTrashPut('case',payload,{
   title:c.ticket||c.id,
   sub:[c.customer,c.machine,c.status].filter(Boolean).join(' · ')
     +(reqs.length?tl(' · +คำขอ '+reqs.length,' · +'+reqs.length+' request(s)'):'')
  });
  try{cases=cases.filter(function(x){return x.id!==cid})}catch(e){}
  cloudDelete('service_cases',cid);
  if(reqs.length){
   try{lineRequests=lineRequests.filter(function(r){return r.caseId!==cid})}catch(e){}
   reqs.forEach(function(r){cloudDelete('line_customer_requests',r.id)});
  }
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof closeModal==='function')closeModal()}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  /* The pages that draw themselves outside renderAll(), so the row really leaves every screen. */
  ['imodeRenderRequests','imodeRenderMyWork','imodeRenderAssign','imodeRenderDoneJobs',
   'imodeRenderReqLog','imodeRenderFieldAll'].forEach(function(fn){
   try{if(typeof window[fn]==='function')window[fn]()}catch(e){}
  });
  toast(reqs.length?tl('ย้ายเคสและคำขอไปถังขยะแล้ว','Case and its request moved to the bin')
                   :tl('ย้ายเคสไปถังขยะแล้ว','Case moved to the bin'));
  return {ok:true};
 }
 window.imodeDeleteCase=function(cid){return deleteCase(cid,false)};
 window.imodeDeleteCaseConfirmed=function(cid){return deleteCase(cid,true)};
 /* The edit form is where a record is managed, so that is where its delete lives. Only for
    a case that already exists — there is nothing to bin while creating one. */
 var baseCaseModal=window.openCaseModal;
 if(typeof baseCaseModal==='function'){
  window.openCaseModal=function(cid){
   var r=baseCaseModal.apply(this,arguments);
   try{
    if(!cid)return r;
    var row=document.querySelector('#modalBody .button-row');
    if(!row||row.querySelector('[data-case-delete]'))return r;
    var can=(typeof canPermission!=='function')||canPermission('case.edit');
    if(!can)return r;
    var b=document.createElement('button');
    b.type='button';
    b.className='soft-btn trash-del-btn';
    b.setAttribute('data-case-delete',cid);
    b.textContent='🗑 '+tl('ลบเคส','Delete case');
    b.onclick=function(){window.imodeDeleteCase(cid)};
    row.insertBefore(b,row.firstChild);
   }catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------------------------- the page --- */
 if(typeof PAGE_INFO!=='undefined'){
  PAGE_INFO.th.trash=['ถังขยะ','ข้อมูลที่ลบแล้ว กู้คืนได้ภายใน '+retentionDays()+' วัน'];
  PAGE_INFO.en.trash=['Recycle bin','Deleted records, restorable for '+retentionDays()+' days'];
 }
 /* An existing permission key on purpose — see the header. */
 try{if(typeof PAGE_PERMISSION!=='undefined')PAGE_PERMISSION.trash='settings.manage'}catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:'trash',icon:'🗑',th:'ถังขยะ',en:'Recycle bin',perm:'settings.manage'},'after:settings');
 }

 function ensurePage(){
  var main=document.querySelector('main.main');
  if(!main||document.getElementById('page-trash'))return;
  var sec=document.createElement('section');
  sec.className='page';
  sec.id='page-trash';
  main.appendChild(sec);
 }
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav||nav.querySelector('.nav-item[data-page="trash"]'))return;
  var b=document.createElement('button');
  b.className='nav-item';
  b.setAttribute('data-page','trash');
  b.innerHTML='<span>🗑</span><b>'+esc2(tl('ถังขยะ','Recycle bin'))+'</b>';
  b.onclick=function(){goPage('trash')};
  nav.appendChild(b);
  if(typeof applyRoleVisibility==='function')applyRoleVisibility();
  /* js/36 sorts the sidebar; tell it a new item arrived so this lands under ระบบ. */
  if(window.imodeNavGroups&&typeof window.imodeNavGroups.layout==='function')window.imodeNavGroups.layout();
 }

 function fmtWhen(v){
  try{return (typeof fmt==='function')?fmt(v):String(v||'')}catch(e){return String(v||'')}
 }
 var filterType='all';
 var showLimit=25;                       /* 0 = ทั้งหมด */
 window.imodeTrashFilter=function(t){filterType=t||'all';render()};
 window.imodeTrashLimit=function(v){showLimit=Number(v)||0;render()};

 function render(){
  var host=document.getElementById('page-trash');
  if(!host)return;
  var list=window.imodeTrashList(),counts=window.imodeTrashCounts(),days=retentionDays();
  var order=['case','request','quotation','customer','machine','document','account','employee'];
  var known={};order.forEach(function(k){known[k]=1});
  Object.keys(counts).forEach(function(k){if(!known[k]){order.push(k);known[k]=1}});

  /* The same .module-kpi-card in a .case-kpi-grid that the cases and QC pages use as a
     clickable status filter. The pill row this replaced was the only control of its kind in
     the application and read as a different product. */
  /* The label was an icon and a name squeezed into one 11px <small>, which is what made
     this row unreadable. Icon, name and count are three lines now, each at a size you can
     read, and the styles are scoped under .trash-kpi so the cases and QC pages keep the
     compact card they were designed with. */
  function card(kind,icon,label,n){
   return '<button type="button" class="module-kpi-card" data-kind="'+esc2(kind)+'"'
    +' aria-pressed="'+(filterType===kind)+'" onclick="imodeTrashFilter('+imodeJsArg(kind)+')">'
    +'<i class="tk-ico" aria-hidden="true">'+esc2(icon)+'</i>'
    +'<small class="tk-name">'+esc2(label)+'</small>'
    +'<b>'+n+'</b><span>'+esc2(tl('รายการ','items'))+'</span></button>';
  }
  var tabs=card('all','🗃',tl('ทั้งหมด','All'),list.length)
   +order.map(function(k){
     var t=typeOf(k);
     return card(k,t.icon,tl(t.th,t.en),counts[k]||0);
    }).join('');

  var matching=list.filter(function(e){return filterType==='all'||e.type===filterType});
  var shown=showLimit?matching.slice(0,showLimit):matching.slice();
  var rows=shown.map(function(e){
   var t=typeOf(e.type),left=daysLeft(e);
   var cls=left<=3?' is-soon':(left<=7?' is-warn':'');
   return '<div class="trash-row'+cls+'" data-entry="'+esc2(e.id)+'" data-act="open"'
    +' role="button" tabindex="0"'
    +' aria-label="'+esc2(tl('ดูรายละเอียด ','View details ')+(e.title||e.id))+'">'
    +'<div class="trash-ico">'+t.icon+'</div>'
    +'<div class="trash-main"><b>'+esc2(e.title||e.id)+'</b>'
    +'<small>'+esc2(tl(t.th,t.en))+(e.sub?' · '+esc2(e.sub):'')+'</small>'
    +'<small class="trash-meta">'+esc2(tl('ลบเมื่อ ','Deleted '))+esc2(fmtWhen(e.deletedAt))
    +(e.deletedBy?' · '+esc2(tl('โดย ','by '))+esc2(e.deletedBy):'')+'</small>'
    +(e.big?'<small class="trash-local">'+esc2(tl('ข้อมูลอยู่บนเครื่องที่กดลบเท่านั้น กู้คืนได้จากเครื่องนั้น',
                                                  'Data is on the device it was deleted from; restore it there'))+'</small>':'')
    +'</div>'
    +'<div class="trash-left'+cls+'"><b>'+left+'</b><small>'+esc2(tl('วัน','days'))+'</small></div>'
    +'<div class="trash-ops">'
    +'<button type="button" class="trash-btn is-primary" data-act="restore">'+esc2(tl('กู้คืน','Restore'))+'</button>'
    +'<button type="button" class="trash-btn is-danger" data-act="purge">'+esc2(tl('ลบถาวร','Delete forever'))+'</button>'
    +'</div></div>';
  }).join('');

  /* No <h3> here. The hero above already says ถังขยะ, and every other module had its
     duplicate panel title removed in an earlier session for exactly that reason — this page
     was the only one that still repeated it. The action button keeps the panel head. */
  var empty=filterType==='all'
   ? '<div class="empty">'+esc2(tl('ถังขยะว่าง — ยังไม่มีข้อมูลที่ถูกลบ','The bin is empty — nothing has been deleted'))+'</div>'
   : '<div class="empty">'+esc2(tl('ไม่มีรายการในประเภทนี้','Nothing of this kind in the bin'))+'</div>';
  host.innerHTML='<div class="trash-kpi case-kpi-grid">'+tabs+'</div>'
   +'<div class="panel">'
   +'<div class="panel-head toolbar-head"><div><p class="subtext">'
   +esc2(tl('ข้อมูลที่ลบจะอยู่ที่นี่ '+days+' วัน แล้วระบบจะลบถาวรเอง',
            'Deleted records stay here for '+days+' days, then they are removed for good'))+'</p></div>'
   +'<div class="trash-headops">'
   +'<select class="trash-limit" onchange="imodeTrashLimit(this.value)" aria-label="'
   +esc2(tl('จำนวนที่แสดง','How many to show'))+'">'
   +[['10','10'],['25','25'],['50','50'],['100','100'],['0',tl('ทั้งหมด','All')]].map(function(o){
      return '<option value="'+o[0]+'"'+(String(showLimit)===o[0]?' selected':'')+'>'
       +esc2(tl('แสดง ','Show ')+o[1])+'</option>';
     }).join('')+'</select>'
   +(list.length?'<button class="soft-btn" data-act="purgeall">'+esc2(tl('ล้างถังขยะทั้งหมด','Empty the bin'))+'</button>':'')
   +'</div>'
   +'</div>'
   +'<div class="trash-list">'+(shown.length?rows:empty)+'</div>'
   +(matching.length>shown.length
     ?'<div class="trash-more"><span>'+esc2(tl('แสดง ','Showing ')+shown.length+tl(' จาก ',' of ')+matching.length)+'</span>'
      +'<button type="button" class="soft-btn" onclick="imodeTrashLimit(0)">'+esc2(tl('แสดงทั้งหมด','Show all'))+'</button></div>'
     :'')
   +'</div>';
  wire(host);
 }
 /* ------------------------------------------------- the read-only detail view ----
    "ในถังขยะสามารถเปิดดูรายละเอียดได้แต่จะไม่สามารถแก้ไขอะไรได้ แต่จะมีปุ่มกู้คืนอยู่ข้างล่าง มาแทนปุ่มลบ"

    READ ONLY IS A PROPERTY OF THE CODE, not a promise: this renders <dl> and nothing else —
    no form, no input, no save path — and it never writes to the payload it is handed. The
    only two things it can do are the two buttons at the bottom, which are the same
    imodeTrashRestore / imodeTrashPurge the row already had. */
 var SKIP_FIELDS={photo:1,sig:1,signature:1,media:1,customerSignature:1,technicianSignature:1,
                  fieldStatusLog:1,checklist:1,password:1,passwordHash:1};
 function readable(v){
  if(v==null||v==='')return '';
  if(Array.isArray(v))return v.length?tl(v.length+' รายการ',v.length+' item(s)'):'';
  if(typeof v==='object')return tl('(ข้อมูลย่อย)','(nested data)');
  var s=String(v);
  if(s.indexOf('data:')===0)return tl('(ไฟล์แนบ)','(attachment)');
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){try{return fmtWhen(s)}catch(e){return s}}
  return s.length>400?s.slice(0,400)+'…':s;
 }
 function detailRows(payload){
  var out='',n=0;
  Object.keys(payload||{}).forEach(function(k){
   if(k===REQ_KEY||k===MACHINE_RELATED_KEY||SKIP_FIELDS[k])return;
   var v=readable(payload[k]);
   if(v===''||v==null)return;
   n++;
   out+='<dt>'+esc2(k)+'</dt><dd>'+esc2(v)+'</dd>';
  });
  return n?'<dl class="trash-kv">'+out+'</dl>'
          :'<p class="empty">'+esc2(tl('ไม่มีรายละเอียดที่แสดงได้','Nothing further to show'))+'</p>';
 }
 function machineRelatedHTML(payload){
  var rel=payload&&payload[MACHINE_RELATED_KEY];
  if(!rel)return '';
  var groups=[
   ['cases',tl('เคสงานบริการ','Service cases'),function(x){return [x.ticket||x.id,x.status,x.issue].filter(Boolean).join(' · ')}],
   ['quotations',tl('ใบเสนอราคา','Quotations'),function(x){return [x.quoteNo||x.id,x.status,x.grand?Number(x.grand).toLocaleString()+' THB':''].filter(Boolean).join(' · ')}],
   ['warranties',tl('ข้อมูลประกัน','Warranties'),function(x){return [x.warrantyNo||x.id,x.endDate].filter(Boolean).join(' · ')}],
   ['qcRecords',tl('รายการ QC','QC records'),function(x){return [x.qcNo||x.id,x.status].filter(Boolean).join(' · ')}],
   ['lineRequests',tl('คำขอจากลูกค้า','Customer requests'),function(x){return [x.status,x.message].filter(Boolean).join(' · ')}]
  ];
  var html='';
  groups.forEach(function(g){
   var rows=Array.isArray(rel[g[0]])?rel[g[0]]:[];
   if(!rows.length)return;
   html+='<div class="trash-detail-sub">'+esc2(g[1]+' ('+rows.length+')')+'</div>'
    +'<ul class="trash-related">'+rows.map(function(x){return '<li>'+esc2(g[2](x)||x.id||'-')+'</li>'}).join('')+'</ul>';
  });
  return html;
 }
 function openEntry(id){
  var e=bin().filter(function(x){return x.id===id})[0];
  if(!e){toast(tl('ไม่พบรายการนี้','Entry not found'));return}
  if(typeof openModal!=='function')return;
  var t=typeOf(e.type),payload=e.big?getBlob(e.id):e.payload;
  var head='<div class="trash-detail-head"><span class="trash-detail-ico">'+t.icon+'</span>'
   +'<div><b>'+esc2(e.title||e.id)+'</b><small>'+esc2(tl(t.th,t.en))
   +(e.sub?' · '+esc2(e.sub):'')+'</small></div></div>'
   +'<dl class="trash-kv is-meta">'
   +'<dt>'+esc2(tl('ลบเมื่อ','Deleted'))+'</dt><dd>'+esc2(fmtWhen(e.deletedAt))+'</dd>'
   +(e.deletedBy?'<dt>'+esc2(tl('ลบโดย','Deleted by'))+'</dt><dd>'+esc2(e.deletedBy)+'</dd>':'')
   +'<dt>'+esc2(tl('เหลือเวลา','Time left'))+'</dt><dd>'+daysLeft(e)+' '+esc2(tl('วัน','days'))+'</dd>'
   +'</dl>';
  var reqs=(payload&&Array.isArray(payload[REQ_KEY]))?payload[REQ_KEY]:[];
  var body=payload
   ? detailRows(payload)
     +(e.type==='account'&&typeof window.imodeAccountHistoryHTML==='function'
       ?window.imodeAccountHistoryHTML(payload):'')
     +machineRelatedHTML(payload)
     +(reqs.length?'<div class="trash-detail-sub">'+esc2(tl('คำขอจากลูกค้าที่ลบไปพร้อมกัน ('+reqs.length+')',
        'Customer requests binned with it ('+reqs.length+')'))+'</div>'
        +reqs.map(function(r){return detailRows(r)}).join(''):'')
   : '<p class="empty">'+esc2(tl('ข้อมูลของรายการนี้อยู่บนเครื่องที่กดลบเท่านั้น',
                                 'This entry\'s data is only on the device it was deleted from'))+'</p>';
  openModal(tl('รายละเอียดในถังขยะ','In the bin'),
    tl('ดูได้อย่างเดียว แก้ไขไม่ได้ · กู้คืนเพื่อนำกลับมาใช้งาน',
       'View only — restore it to use it again'),
    head+body
    +'<div class="button-row" style="margin-top:14px">'
    +'<button type="button" class="soft-btn" data-trash-detail="purge" data-id="'+esc2(e.id)+'">'
    +esc2(tl('ลบถาวร','Delete forever'))+'</button>'
    +'<button type="button" class="primary-btn" data-trash-detail="restore" data-id="'+esc2(e.id)+'">'
    +esc2(tl('↩ กู้คืน','↩ Restore'))+'</button></div>');
  /* js/05 stops propagation at #modalPanel, so a listener on document never sees a click
     inside a popup (part 26). It goes on #modalBody, which is a descendant. */
  var mb=document.getElementById('modalBody');
  if(mb&&!mb.__trashDetailWired){
   mb.__trashDetailWired=1;
   mb.addEventListener('click',function(ev){
    var b=ev.target&&ev.target.closest?ev.target.closest('[data-trash-detail]'):null;
    if(!b)return;
    ev.preventDefault();
    var what=b.getAttribute('data-trash-detail'),eid=b.getAttribute('data-id');
    if(what==='restore'){
     var res=window.imodeTrashRestore(eid);
     toast(res.ok?tl('กู้คืนแล้ว','Restored'):res.message);
     if(typeof closeModal==='function')closeModal();
     render();
     return;
    }
    ask(tl('ลบรายการนี้อย่างถาวร? กู้คืนไม่ได้อีก','Delete this permanently? It cannot be undone.'),
        tl('ลบถาวร','Delete permanently')).then(function(ok){
     if(!ok)return;
     window.imodeTrashPurge(eid);
     toast(tl('ลบถาวรแล้ว','Permanently deleted'));
     if(typeof closeModal==='function')closeModal();
     render();
    });
   });
  }
 }

 function wire(host){
  if(host.__trashWired)return;
  host.__trashWired=true;
  host.addEventListener('keydown',function(e){
   if(e.key!=='Enter'&&e.key!==' '&&e.key!=='Spacebar')return;
   var row=e.target&&e.target.closest?e.target.closest('.trash-row'):null;
   if(!row||e.target.closest('button'))return;
   e.preventDefault();
   openEntry(row.getAttribute('data-entry'));
  });
  host.addEventListener('click',function(e){
   var t=e.target;
   if(!t||!t.closest)return;
   var act=t.closest('[data-act]');
   if(!act)return;
   var a=act.getAttribute('data-act');
   if(a==='purgeall'){
    /* 2026-09-17, item 13: the styled dialog from js/78. This one is inside a click
       listener rather than a named function, so js/78's replay cannot reach it and the
       call is written asynchronously here instead. ask() falls back to the browser box
       when js/78 is not loaded, so the confirmation can never be skipped. */
    ask(tl('ลบทุกอย่างในถังขยะอย่างถาวร? กู้คืนไม่ได้อีก',
           'Permanently delete everything in the bin? This cannot be undone.'),
        tl('ล้างถังขยะทั้งหมด','Empty the bin')).then(function(ok){
     if(!ok)return;
     window.imodeTrashPurgeAll();
     toast(tl('ล้างถังขยะแล้ว','The bin is empty'));
     render();
    });
    return;
   }
   var row=act.closest('.trash-row');
   if(!row)return;
   var id=row.getAttribute('data-entry');
   if(a==='open'){openEntry(id);return}
   if(a==='restore'){
    var res=window.imodeTrashRestore(id);
    toast(res.ok?tl('กู้คืนแล้ว','Restored'):res.message);
    render();
   }else if(a==='purge'){
    ask(tl('ลบรายการนี้อย่างถาวร? กู้คืนไม่ได้อีก','Delete this permanently? It cannot be undone.'),
        tl('ลบถาวร','Delete permanently')).then(function(ok){
     if(!ok)return;
     window.imodeTrashPurge(id);
     toast(tl('ลบถาวรแล้ว','Permanently deleted'));
     render();
    });
   }
  });
 }
 window.imodeRenderTrash=render;

 var baseGoPage=window.goPage;
 window.goPage=function(name){
  if(name==='trash')ensurePage();
  var r=baseGoPage.apply(this,arguments);
  var active=(document.querySelector('.page.active')||{}).id||'';
  if(active==='page-trash')render();
  return r;
 };

 var style=document.createElement('style');
 style.id='v70TrashStyle';
 style.textContent=''
 /* .case-kpi-grid brings the grid, the card look and every breakpoint with it; only the
    margin under the row is this page's own. */
 +'.trash-kpi{display:grid;margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}'
 /* Scoped to this page only. The shared card is built for a one-line status count; a bin
    category needs an icon you can see and a name you can read, so the card grows here and
    nowhere else. */
 +'.trash-kpi .module-kpi-card{padding:14px 12px 12px!important;gap:2px;text-align:center;'
 +'display:flex!important;flex-direction:column;align-items:center;justify-content:flex-start;min-height:118px}'
 +'.trash-kpi .tk-ico{font-style:normal;font-size:26px;line-height:1.15;display:block}'
 +'.trash-kpi .tk-name{font-size:13.5px!important;font-weight:700;color:#22355c;'
 +'line-height:1.35;margin-top:3px;white-space:normal;overflow-wrap:anywhere}'
 +'.trash-kpi .module-kpi-card b{font-size:23px!important;line-height:1.15;margin-top:4px}'
 +'.trash-kpi .module-kpi-card span{font-size:11px!important;color:#6f81a3}'
 +'.trash-kpi .module-kpi-card[aria-pressed="true"] .tk-name{color:#0b3f9e}'
 +'.trash-headops{display:flex;align-items:center;gap:9px;flex-wrap:wrap}'
 +'.trash-limit{border:1px solid #d9e6fa;border-radius:11px;padding:8px 11px;background:#fff;'
 +'color:#0c225e;font-size:12.5px;font-weight:700;font-family:inherit;min-height:36px}'
 +'.trash-limit:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.trash-more{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:0 12px 14px;'
 +'font-size:12.5px;color:#5b6b88}'
 +'.trash-list{padding:12px;display:grid;gap:7px}'
 +'.trash-row{display:grid;grid-template-columns:34px minmax(0,1fr) 62px auto;align-items:center;gap:10px;'
 +'padding:10px 12px;border:1px solid #e2eaf7;border-radius:12px;background:#fff}'
 +'.trash-row.is-warn{border-color:#f7d9a8;background:#fffdf7}'
 +'.trash-row.is-soon{border-color:#f2b8b8;background:#fff8f8}'
 +'.trash-ico{font-size:19px;text-align:center}'
 +'.trash-main{min-width:0}'
 +'.trash-main b{display:block;font-size:13px;color:#12356f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.trash-main small{display:block;font-size:11px;color:#6f81a3;line-height:1.5}'
 +'.trash-main .trash-meta{font-size:10.5px;color:#8b9ab5}'
 +'.trash-main .trash-local{color:#9a4c07;font-size:10.5px}'
 +'.trash-left{text-align:center;line-height:1.1}'
 +'.trash-left b{display:block;font-size:19px;font-weight:800;color:#0b63e5}'
 +'.trash-left small{font-size:10px;color:#8b9ab5}'
 +'.trash-left.is-warn b{color:#c07a07}'
 +'.trash-left.is-soon b{color:#c02626}'
 +'.trash-ops{display:flex;gap:6px}'
 +'.trash-btn{border:1px solid #cfe0fa;background:#fff;color:#0b63e5;border-radius:9px;padding:6px 11px;'
 +'font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'
 +'.trash-btn.is-primary{border-color:transparent;color:#fff;background:linear-gradient(180deg,#2b7cf0,#0b56cc)}'
 +'.trash-btn.is-danger{color:#c02626;border-color:#f3cdcd}'
 +'.trash-btn.is-danger:hover{background:#fdeeee}'
 +'.trash-del-btn{color:#c02626;border-color:#f3cdcd}'
 +'.trash-detail-head{display:flex;align-items:center;gap:11px;margin-bottom:10px}'
 +'.trash-detail-ico{font-size:22px;width:40px;height:40px;border-radius:12px;background:#eef4ff;display:grid;place-items:center;flex:none}'
 +'.trash-detail-head b{display:block;font-size:15px;color:#0c225e}'
 +'.trash-detail-head small{display:block;font-size:11.5px;color:#5b6b88;margin-top:2px}'
 +'.trash-kv{display:grid;grid-template-columns:minmax(96px,34%) 1fr;gap:6px 12px;margin:0 0 12px;font-size:12.5px}'
 +'.trash-kv dt{color:#5b6b88;overflow-wrap:anywhere}'
 +'.trash-kv dd{margin:0;color:#0c225e;font-weight:600;overflow-wrap:anywhere}'
 +'.trash-kv.is-meta{padding:10px 12px;border:1px solid #e3ecfa;border-radius:12px;background:#f8fbff}'
 +'.trash-detail-sub{margin:12px 0 8px;font-size:12px;font-weight:800;color:#5b6b88}'
 +'.trash-related{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:6px}'
 +'.trash-related li{padding:8px 10px;border:1px solid #e3ecfa;border-radius:9px;background:#f8fbff;color:#0c225e;font-size:12px;overflow-wrap:anywhere}'
 +'@media (max-width:640px){'
 +'.trash-row{grid-template-columns:28px minmax(0,1fr) 52px;row-gap:8px}'
 +'.trash-row[role="button"]{cursor:pointer}'
 +'.trash-row[role="button"]:hover{border-color:#b9d2f4}'
 +'.trash-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.trash-detail-head{display:flex;align-items:center;gap:11px;margin-bottom:10px}'
 +'.trash-detail-ico{font-size:22px;width:40px;height:40px;border-radius:12px;background:#eef4ff;display:grid;place-items:center;flex:none}'
 +'.trash-detail-head b{display:block;font-size:15px;color:#0c225e}'
 +'.trash-detail-head small{display:block;font-size:11.5px;color:#5b6b88;margin-top:2px}'
 +'.trash-kv{display:grid;grid-template-columns:minmax(96px,34%) 1fr;gap:6px 12px;margin:0 0 12px;font-size:12.5px}'
 +'.trash-kv dt{color:#5b6b88;overflow-wrap:anywhere}'
 +'.trash-kv dd{margin:0;color:#0c225e;font-weight:600;overflow-wrap:anywhere}'
 +'.trash-kv.is-meta{padding:10px 12px;border:1px solid #e3ecfa;border-radius:12px;background:#f8fbff}'
 +'.trash-detail-sub{margin:4px 0 8px;font-size:12px;font-weight:800;color:#5b6b88}'
 +'.trash-ops{grid-column:1/-1;justify-content:flex-end}'
 +'.trash-main b{white-space:normal}}';
 document.head.appendChild(style);

 function install(){ensurePage();ensureNav();sweep()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
