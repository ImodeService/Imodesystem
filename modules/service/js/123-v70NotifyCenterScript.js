/* Version 1.0 — 2026-09-25: the notification centre works — the same list and the same unread
   count on every device, "read" that stays read, and each person told about their own work.

   Measured before this file:
   - every automatic notice (auto_visit_, auto_urgent_, auto_part_, auto_assigned_ …) was built
     fresh with read:false on every render, so the bell could never go down;
   - the notices js/03 STORES (n_…) lived only on the device that made them — the cloud
     `notifications` table held 0 rows — which is why three browsers showed 23 / 37 / 13;
   - apart from js/16's assignment notices, everybody saw everything.

   What this does, as the OUTERMOST wrapper on buildNotifications():
   1. Device-local stored notices are dropped, except the addressed ones js/16 writes. The list
      is then derived only from shared data, so every device computes the same one.
   2. Two missing kinds are added: a customer request still waiting (auto_req_), and a customer
      opening / sending back a quotation (auto_qview_, auto_qsent_).
   3. Who sees what: a field technician sees only notices about cases they are on; the office
      rest needs the permission the notice is about (line.view, quotation.view).
   4. Read state is per ACCOUNT: supabase/13-notification-reads.sql, one row per (account,
      notice). Kept locally too (imode_v70_notice_reads) so it works offline and before the SQL
      is run — then it simply stays on the device. Opening a notice marks it read; the page gets
      an อ่านทั้งหมด button. Realtime + a refetch after each sync carry reads between devices. */
(function(){
 'use strict';
 var TABLE='notification_reads',LKEY='imode_v70_notice_reads',CAP=3000;
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function me(){try{return currentUser&&(currentUser.username||currentUser.id)||''}catch(e){return ''}}
 function techId(){try{return currentUser&&currentUser.technicianId||''}catch(e){return ''}}
 function can(k){try{return typeof canPermission==='function'?!!canPermission(k):true}catch(e){return true}}
 function db(){try{return supa||null}catch(e){return null}}

 /* ------------------------------------------------------------ read state ---- */
 function loadLocal(){try{return JSON.parse(localStorage.getItem(LKEY)||'{}')||{}}catch(e){return {}}}
 function saveLocal2(o){try{localStorage.setItem(LKEY,JSON.stringify(o))}catch(e){}}
 function readsFor(u){var o=loadLocal();return o[u]||{}}
 function markLocal(u,keys){
  var o=loadLocal(),m=o[u]||{},now=Date.now();
  keys.forEach(function(k){if(!m[k])m[k]=now});
  var ks=Object.keys(m);
  if(ks.length>CAP){ks.sort(function(a,b){return m[a]-m[b]});ks.slice(0,ks.length-CAP).forEach(function(k){delete m[k]})}
  o[u]=m;saveLocal2(o);
 }
 var cloudOk=null;   /* null unknown · true table present · false missing */
 function push(u,keys){
  var c=db();if(!c||cloudOk===false||!keys.length)return;
  var now=new Date().toISOString();
  var rows=keys.map(function(k){return {id:u+'|'+k,user_key:u,notice_key:k,read_at:now}});
  try{
   c.from(TABLE).upsert(rows).then(function(res){
    if(res&&res.error){noteMissing(res.error)}else cloudOk=true;
   },function(){});
  }catch(e){}
 }
 function noteMissing(err){
  var code=String(err&&(err.code||err.message)||'');
  if(/PGRST205|42P01|does not exist|Could not find/i.test(code)){
   if(cloudOk!==false)try{console.warn('[imode notify] table '+TABLE+' is missing — read state stays on this device until supabase/13-notification-reads.sql is run')}catch(e){}
   cloudOk=false;
  }
 }
 var fetching=false;
 function pull(){
  var c=db(),u=me();if(!c||!u||fetching||cloudOk===false)return;
  fetching=true;
  try{
   c.from(TABLE).select('notice_key,read_at').eq('user_key',u).limit(5000).then(function(res){
    fetching=false;
    if(!res||res.error){if(res&&res.error)noteMissing(res.error);return}
    cloudOk=true;
    var have=readsFor(u),add=[];
    (res.data||[]).forEach(function(r){if(r&&r.notice_key&&!have[r.notice_key])add.push(r.notice_key)});
    if(add.length){markLocal(u,add);repaint()}
   },function(){fetching=false});
  }catch(e){fetching=false}
 }
 var chan=null,chanUser='';
 function listen(){
  var c=db(),u=me();
  if(!c||!u||typeof c.channel!=='function'||cloudOk===false)return;
  if(chan&&chanUser===u)return;
  try{if(chan&&typeof c.removeChannel==='function')c.removeChannel(chan)}catch(e){}
  try{
   chanUser=u;
   chan=c.channel('imode-reads-'+Math.random().toString(36).slice(2,8))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE,filter:'user_key=eq.'+u},function(p){
     var k=p&&p.new&&p.new.notice_key;
     if(k&&!readsFor(u)[k]){markLocal(u,[k]);repaint()}
    }).subscribe();
  }catch(e){}
 }
 window.imodeNotifyMarkRead=function(keys){
  var u=me();if(!u)return;
  keys=(Array.isArray(keys)?keys:[keys]).filter(Boolean);
  var have=readsFor(u);keys=keys.filter(function(k){return !have[k]});
  if(!keys.length)return;
  markLocal(u,keys);push(u,keys);repaint();
 };
 window.imodeNotifyMarkAll=function(){
  var list=[];try{list=window.buildNotifications()||[]}catch(e){}
  window.imodeNotifyMarkRead(list.filter(function(n){return !n.read}).map(function(n){return n.key}));
  try{if(typeof toastMsg==='function')toastMsg('อ่านทั้งหมดแล้ว')}catch(e){}
 };
 var painting=false;
 function repaint(){
  if(painting)return;painting=true;
  try{if(typeof renderNotifications==='function')renderNotifications()}catch(e){}
  painting=false;
 }

 /* ---------------------------------------------------------- the list ---- */
 function quoteNotices(){
  var out=[];
  if(!can('quotation.view'))return out;
  var s={};try{s=settings||{}}catch(e){}
  var views=s.quoteViews||{},apps=s.quoteApprovals||{};
  var qs=[];try{qs=Array.isArray(quotations)?quotations:[]}catch(e){}
  qs.forEach(function(q){
   if(!q||!q.id)return;
   var created=Date.parse(q.createdAt||'')||0,a=apps[q.id],v=views[q.id];
   if(a&&a.sentAt&&Date.parse(a.sentAt)>=created){
    out.push({key:'auto_qsent_'+q.id,icon:'📥',title:'ลูกค้าส่งใบเสนอราคาที่เซ็นแล้วกลับมา',
     message:q.id+' · '+(q.customer||'')+' — ตรวจแล้วกดยืนยันในหน้าเคส',createdAt:a.sentAt,caseId:q.caseId||'',read:false});
   }else if(v&&v.at&&Date.parse(v.at)>=created&&!a){
    out.push({key:'auto_qview_'+q.id,icon:'👀',title:'ลูกค้าเปิดดูใบเสนอราคาแล้ว',
     message:q.id+' · '+(q.customer||'')+' — กำลังรอลูกค้าเซ็น',createdAt:v.at,caseId:q.caseId||'',read:false});
   }
  });
  return out;
 }
 function requestNotices(){
  var out=[];
  if(!can('line.view'))return out;
  var rs=[];try{rs=Array.isArray(lineRequests)?lineRequests:[]}catch(e){}
  var LABEL={service_quote:'ขอราคา Service',warranty_quote:'ขอราคา Warranty',warranty_check:'เช็คประกัน'};
  rs.forEach(function(r){
   if(!r||!r.id||r.caseId)return;                 /* a แจ้งปัญหา opens a case — js/16 announces that */
   if(String(r.status||'ใหม่')!=='ใหม่')return;
   var cu=null;try{cu=customerById(r.customerId)}catch(e){}
   out.push({key:'auto_req_'+r.id,icon:'📥',title:'คำขอใหม่จากลูกค้า · '+(LABEL[r.type]||'คำขอ'),
    message:((cu&&cu.name)||r.contact||'-')+(r.message?' · '+String(r.message).slice(0,80):''),createdAt:r.createdAt,read:false,requestId:r.id});
  });
  return out;
 }
 function caseIsMine(cid){
  var t=techId();if(!t||!cid)return false;
  var c=null;try{c=cases.filter(function(x){return x.id===cid})[0]}catch(e){}
  if(!c)return false;
  try{if(typeof window.imodeIsAssignedTo==='function')return window.imodeIsAssignedTo(c,t)}catch(e){}
  return String(c.assignee||'').split(',').map(function(x){return x.trim()}).indexOf(t)>=0;
 }
 var base=null;
 function install(){
  if(typeof window.buildNotifications!=='function'||window.buildNotifications.__center)return;
  base=window.buildNotifications;
  var w=function(){
   var list=(base.apply(this,arguments)||[]).filter(function(n){
    if(!n||!n.key)return false;
    /* device-local stored notices go; the addressed ones js/16 writes stay */
    if(/^n_/.test(n.key)&&!n.audience&&!n.technicianId)return false;
    return true;
   });
   if(!techId())list=list.concat(quoteNotices(),requestNotices());
   else list=list.filter(function(n){return caseIsMine(n.caseId)||(n.technicianId&&n.technicianId===techId())});
   var seen={},u=me(),reads=u?readsFor(u):{};
   list=list.filter(function(n){if(seen[n.key])return false;seen[n.key]=1;return true});
   list.forEach(function(n){n.read=!!reads[n.key]||(/^n_/.test(n.key)&&!!n.read)});
   return list.sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0)});
  };
  w.__center=true;
  window.buildNotifications=w;

  var baseOpen=window.openNotificationDetail;
  if(typeof baseOpen==='function')window.openNotificationDetail=function(key){
   try{window.imodeNotifyMarkRead(key)}catch(e){}
   /* a request notice opens the request, not an empty detail box */
   if(/^auto_req_/.test(String(key))&&typeof window.imodeOpenRequest==='function'){
    window.imodeOpenRequest(String(key).replace('auto_req_',''));return;
   }
   return baseOpen.apply(this,arguments);
  };

  var baseRender=window.renderNotifications;
  if(typeof baseRender==='function')window.renderNotifications=function(){
   var r=baseRender.apply(this,arguments);
   try{addMarkAll()}catch(e){}
   return r;
  };
 }
 function addMarkAll(){
  var host=document.getElementById('page-notifications');if(!host)return;
  var unreadBtn=host.querySelector('button[onclick="imodeNotifyUnread()"]');
  var bar=unreadBtn?unreadBtn.parentNode:host.querySelector('.panel-head');
  if(!bar||bar.querySelector('[data-notify-all]'))return;
  var b=document.createElement('button');
  b.type='button';b.className='soft-btn';b.setAttribute('data-notify-all','1');
  b.textContent='✓ อ่านทั้งหมด';
  b.addEventListener('click',function(){window.imodeNotifyMarkAll()});
  bar.appendChild(b);
 }

 /* read state follows the account and the database */
 var lastUser='';
 function tick(){
  var u=me();
  if(u!==lastUser){lastUser=u;pull();listen();repaint()}
 }
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function')window.syncCloud=function(){
  var r=baseSync.apply(this,arguments);
  var after=function(){try{pull();listen()}catch(e){}};
  if(r&&typeof r.then==='function')r.then(after,after);else after();
  return r;
 };
 document.addEventListener('visibilitychange',function(){if(!document.hidden)pull()});
 setInterval(tick,2000);
 install();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){install();tick()},{once:true});
 else tick();
 window.imodeNotifyState=function(){return {user:me(),cloud:cloudOk,reads:Object.keys(readsFor(me())).length}};
})();
