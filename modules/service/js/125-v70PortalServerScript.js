/* Version 1.0 — the production server, customer side.

   INERT UNLESS window.IMODE_ENV.production IS TRUE AND this page is served from
   IMODE_ENV.customerHost. On GitHub Pages, Live Server and the staff address it returns on
   its first lines.

   On the customer address nobody signs in, and every table refuses the anon key (database/
   02-security.sql). The customer page therefore gets its data the only way the server allows:
   by handing it the machine's QR token.

     reading   portal_open(token) / portal_find(serial) return a snapshot of ONE machine —
               the machine, its customer's name, its cases, reports, warranties, documents,
               the quotations sent for it, and the settings the page needs. It is merged into
               the same arrays every screen already reads, so js/03, js/08, js/19, js/53,
               js/56, js/102 and js/120 draw it with no change at all.
     writing   the page's writes still happen where they always did — cloudUpsert() and
               cloudSaveSettings() — and are rerouted here, in one place:
                 new case / request        → portal_submit(token, table, row)
                 quotation moves to อนุมัติ  → portal_quote_status(token, id)
                 signature / opened / review → portal_settings_patch(token, only what changed)
               The server re-checks every one of them against the token; this file does not
               decide what a customer may do, it only carries the request.
     staying   the page cannot subscribe to realtime (it may not read the tables), so an open
               customer page refreshes its snapshot every REFRESH_MS while it is visible.
     going     only the customer pages exist on this address. Any attempt to open another
               page — the staff login door included — goes to the scan / serial page instead.

   The hooks it answers are one line each in js/14 (serial box, camera) and js/21 (?serial=):
   window.imodePortalRemote(key, 'token' | 'serial'), called when the machine is not on this
   phone yet. */
(function(){
 'use strict';
 var ENV=window.IMODE_ENV;
 if(!ENV||!ENV.production)return;
 /* js/01 decides: the customer hostname, or (customerByUrl) a customer link in this tab */
 if(!window.imodeCustomerMode)return;
 window.imodeIsCustomerHost=true;

 var REFRESH_MS=20000;
 var CUSTOMER_PAGES=['customer-portal','customer-home','customer-entry'];
 var MAP_KEYS=['quoteApprovals','quoteStaffSigns','quoteViews','quoteAccepts','quoteWarrantyType','caseFeedback','caseStatusLog'];
 var PATCH_KEYS=['quoteApprovals','quoteViews','caseFeedback'];

 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function arr(name){try{var v=eval(name);return Array.isArray(v)?v:null}catch(e){return null}}

 /* ------------------------------------------------ the anon client --- */
 var anon=null;
 function api(){
  if(anon)return anon;
  var url=ENV.cloud&&ENV.cloud.url,key=ENV.cloud&&ENV.cloud.key;
  if(!url||!key||!window.supabase||!window.supabase.createClient)return null;
  anon=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return anon;
 }
 /* One request at a time: an approval must land before the status change that depends on it. */
 var queue=Promise.resolve();
 function rpc(fn,args){
  var run=function(){
   var c=api();
   if(!c)return Promise.reject(new Error('offline'));
   return c.rpc(fn,args).then(function(r){if(r.error)throw r.error;return r.data});
  };
  var p=queue.then(run,run);
  queue=p.then(function(){},function(){});
  return p;
 }
 function friendly(err){
  var m=String(err&&(err.message||err)||'');
  if(/rate_limited/.test(m))return 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if(/failed to fetch|network|offline/i.test(m))return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
 }

 /* ------------------------------------------------ merge a snapshot --- */
 var tokens={};            /* machine id → token, for everything opened in this page view */
 var baseline={};          /* key → id → JSON, what the server last told us */
 var lastSig='';
 function upsert(list,row){
  if(!list||!row||!row.id)return;
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===row.id){list[i]=row;return}
  list.push(row);
 }
 function map(fn,row){try{return typeof window[fn]==='function'?window[fn](row):row}catch(e){return row}}
 function merge(snap,token){
  if(!snap||!snap.machine)return null;
  var m=snap.machine;
  if(token)m.qrToken=token;
  tokens[m.id]=m.qrToken;
  upsert(arr('machines'),m);
  if(snap.customer)upsert(arr('customers'),map('fromCustomerDb',snap.customer));
  (snap.cases||[]).forEach(function(r){upsert(arr('cases'),map('fromCaseDb',r))});
  (snap.reports||[]).forEach(function(r){upsert(arr('serviceReports'),map('fromServiceReportDb',r))});
  (snap.warranties||[]).forEach(function(r){upsert(arr('warranties'),map('fromWarrantyDb',r))});
  (snap.documents||[]).forEach(function(r){upsert(arr('machineDocuments'),map('fromMachineDocumentDb',r))});
  (snap.quotations||[]).forEach(function(r){upsert(arr('quotations'),map('fromQuotationDb',r))});
  var techs=arr('technicians');
  (snap.technicians||[]).forEach(function(t){
   var cur=techs&&techs.filter(function(x){return x.id===t.id})[0];
   if(cur){cur.name=t.name;if(t.team)cur.team=t.team}else if(techs)techs.push({id:t.id,name:t.name,team:t.team||''});
  });
  var s=snap.settings||{};
  try{
   Object.keys(s).forEach(function(k){
    if(MAP_KEYS.indexOf(k)>=0){
     if(!settings[k]||typeof settings[k]!=='object')settings[k]={};
     Object.keys(s[k]||{}).forEach(function(id){
      settings[k][id]=s[k][id];
      (baseline[k]=baseline[k]||{})[id]=JSON.stringify(s[k][id]);
     });
    }else settings[k]=s[k];
   });
  }catch(e){}
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  return m;
 }
 function signature(snap){
  try{return JSON.stringify([snap.cases,snap.reports,snap.quotations,snap.warranties,snap.documents,snap.settings])}catch(e){return String(Math.random())}
 }

 /* ------------------------------------------------ open by token / serial --- */
 function currentToken(){try{return typeof portalMachineToken!=='undefined'?String(portalMachineToken||''):''}catch(e){return ''}}
 function load(token){
  return rpc('portal_open',{p_token:token}).then(function(r){
   if(!r||!r.ok)return null;
   lastSig=signature(r.snapshot);
   return merge(r.snapshot,r.token);
  });
 }
 function entryMessage(text,isError){
  var box=document.getElementById('centryError');
  if(!box)return;
  box.classList.toggle('show',!!text);
  box.textContent=text||'';
  if(isError===false)box.style.color='';
 }
 var inflight='',failed={};
 window.imodePortalRemote=function(key,kind){
  key=String(key||'').trim();
  if(!key||inflight===key)return;
  if(failed[key]&&Date.now()-failed[key]<30000)return;    /* the camera re-reads the same bad code every frame */
  inflight=key;
  entryMessage('กำลังค้นหาเครื่อง…',false);
  var p=kind==='serial'
   ?rpc('portal_find',{p_serial:key}).then(function(r){return (r&&r.ok&&r.hits)||[]})
   :rpc('portal_open',{p_token:key}).then(function(r){return r&&r.ok?[{token:r.token,snapshot:r.snapshot}]:[]});
  p.then(function(hits){
   if(!hits.length){
    failed[key]=Date.now();
    entryMessage(kind==='serial'?'ไม่พบเครื่องนี้ในระบบ กรุณาตรวจหมายเลขอีกครั้ง หรือติดต่อทีม Service'
                                :'QR นี้ไม่ตรงกับเครื่องในระบบ ลองเล็งใหม่อีกครั้ง หรือกรอกหมายเลขเครื่อง',true);
    return;
   }
   var opened=hits.map(function(h){lastSig=signature(h.snapshot);return merge(h.snapshot,h.token)}).filter(Boolean);
   entryMessage('');
   if(opened.length===1){
    try{if(typeof window.imodeStopCustomerScan==='function')window.imodeStopCustomerScan()}catch(e){}
    if(typeof window.imodeOpenMachinePortal==='function')window.imodeOpenMachinePortal(opened[0]);
    return;
   }
   /* A genuinely shared serial: now that the machines are on this phone, the entry page's
      own search finds them all and asks which one is meant — no second copy of that list. */
   if(typeof window.goPage==='function')window.goPage('customer-entry');
   var input=document.getElementById('centrySerial'),form=input&&input.form;
   if(input)input.value=key;
   if(form&&typeof form.onsubmit==='function')form.onsubmit({preventDefault:function(){}});
  }).catch(function(err){entryMessage(friendly(err),true)})
   .then(function(){inflight=''});
 };

 var baseInitPortal=window.initPortalFromUrl;
 if(typeof baseInitPortal==='function'){
  window.initPortalFromUrl=function(){
   var self=this,args=arguments;
   var token=new URLSearchParams(location.search).get('machineToken');
   if(!token)return baseInitPortal.apply(self,args);
   return load(token).catch(function(){return null}).then(function(){return baseInitPortal.apply(self,args)});
  };
 }

 /* ------------------------------------------------ only customer pages --- */
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   var n=String(name||'');
   if(CUSTOMER_PAGES.indexOf(n)<0)n='customer-entry';
   return baseGo.call(this,n);
  };
 }
 function landing(){
  var q=new URLSearchParams(location.search);
  if(q.get('machineToken')||q.get('serial'))return;
  var active=document.querySelector('.page.active');
  var id=active?active.id.replace(/^page-/,''):'';
  if(CUSTOMER_PAGES.indexOf(id)<0&&typeof window.goPage==='function')window.goPage('customer-entry');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',landing);
 else landing();
 window.addEventListener('load',function(){setTimeout(landing,0)});

 /* ------------------------------------------------ writes, rerouted --- */
 function tokenFor(machineId){
  if(machineId&&tokens[machineId])return tokens[machineId];
  var m=(arr('machines')||[]).filter(function(x){return x.id===machineId})[0];
  return (m&&m.qrToken)||currentToken();
 }
 function localMedia(listName,id){
  var o=(arr(listName)||[]).filter(function(x){return x&&x.id===id})[0];
  return o&&Array.isArray(o.media)?o.media:[];
 }
 window.cloudUpsert=function(table,obj){
  obj=obj||{};
  if(table==='service_cases'||table==='line_customer_requests'){
   var row={};for(var k in obj)row[k]=obj[k];
   /* cloudUpsertCase() writes a column whitelist without media (CLAUDE.md part 18); js/42
      puts it back further in, where this funnel never reaches. So it is read off the case. */
   if(!row.media||!row.media.length)row.media=localMedia(table==='service_cases'?'cases':'lineRequests',row.id);
   return rpc('portal_submit',{p_token:tokenFor(row.machine_id),p_table:table,p_row:row})
    .then(function(r){if(!r||!r.ok)throw new Error((r&&r.reason)||'refused');return {ok:true}})
    .catch(function(err){toast('ส่งข้อมูลไม่สำเร็จ: '+friendly(err));return {ok:false}});
  }
  if(table==='quotations'&&obj.status==='อนุมัติ'){
   var m=null;try{m=(Array.isArray(obj.machine_ids)&&obj.machine_ids[0])||''}catch(e){}
   return rpc('portal_quote_status',{p_token:tokenFor(m),p_quote_id:obj.id})
    .then(function(){return {ok:true}},function(){return {ok:false}});
  }
  return Promise.resolve({ok:false,skipped:true});
 };
 window.cloudSaveSettings=function(){
  var patch={},n=0;
  try{
   PATCH_KEYS.forEach(function(k){
    var cur=settings[k]||{},base=baseline[k]||{};
    Object.keys(cur).forEach(function(id){
     var j=JSON.stringify(cur[id]);
     if(base[id]===j)return;
     (patch[k]=patch[k]||{})[id]=cur[id];n++;
    });
   });
  }catch(e){}
  if(!n)return Promise.resolve({ok:true,applied:0});
  return rpc('portal_settings_patch',{p_token:currentToken(),p_patch:patch}).then(function(r){
   PATCH_KEYS.forEach(function(k){
    Object.keys(patch[k]||{}).forEach(function(id){(baseline[k]=baseline[k]||{})[id]=JSON.stringify(patch[k][id])});
   });
   return r;
  }).catch(function(err){toast('บันทึกไม่สำเร็จ: '+friendly(err));return {ok:false}});
 };
 window.cloudDelete=function(){return Promise.resolve({ok:false,skipped:true})};

 /* ------------------------------------------------ staying current --- */
 function refresh(){
  var t=currentToken();
  if(!t||t.length<16)return Promise.resolve();
  return rpc('portal_open',{p_token:t}).then(function(r){
   if(!r||!r.ok)return;
   var sig=signature(r.snapshot);
   if(sig===lastSig)return;
   lastSig=sig;
   merge(r.snapshot,r.token);
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
  },function(){});
 }
 /* syncCloud() is how the rest of the app asks for fresh data; here that is the snapshot. */
 window.syncCloud=function(){return refresh()};
 setInterval(function(){
  if(document.hidden)return;
  var active=document.querySelector('.page.active');
  if(active&&active.id==='page-customer-portal')refresh();
 },REFRESH_MS);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
})();
