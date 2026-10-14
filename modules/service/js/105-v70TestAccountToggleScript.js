/* Beta 1.0 — 2026-09-23: the UAT test accounts can be switched off, and หัวหน้าช่าง ก is not one.

   Two things the owner asked for together, because they are the same confusion:

   1. `technician_test1` and `lead_technician` BOTH point at T-LEAD-TECH — หัวหน้าช่าง ก's record —
      and js/39's createRecordFor() names a record after the account username, so his card on
      ทีมช่าง reads "technician_test1". The record's real owner is known: dedupeLead() stamped
      employeeId USR-003 on it (USR-004 on T-LEAD-RD). The name is restored from that, which is
      also what takes him out of the test group — js/104 now classifies by ownership first.

   2. A switch for the UAT logins. Off means they cannot sign in at all; the rows stay in the
      account screen, marked, so the switch can be found again. The seven real accounts are
      untouched either way.

   A test account is recognised by its username ending in _test / _testN — the same convention
   js/39 groups by. `lead_technician` and `lead_rd` do NOT match it: they belong to หัวหน้าช่าง ก and
   หัวหน้า R&D ข. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof toastMsg==='function')toastMsg(m)}
 function isTestName(u){return /_test\d*$/i.test(String(u||''))}
 function enabled(){return settings.testAccountsEnabled!==false}

 /* ------------------------------------------------- 1. give the lead records their names --- */
 var LEADS={'T-LEAD-TECH':'USR-003','T-LEAD-RD':'USR-004'};
 function personName(uid){
  try{
   var p=(Array.isArray(demoUsers)?demoUsers:[]).filter(function(x){return x&&x.id===uid})[0];
   return p?String(p.name||''):'';
  }catch(e){return ''}
 }
 /* Only a name that is an ACCOUNT USERNAME is replaced. A name the owner typed by hand — even
    an odd one — is left alone; this is repairing a machine-generated value, not renaming
    people. Idempotent, so it can run on every load and after every sync. */
 function usernames(){
  var out={};
  try{
   var list=(typeof window.imodeAccountList==='function')?(window.imodeAccountList()||[]):[];
   list.forEach(function(a){if(a&&a.username)out[String(a.username).toLowerCase()]=1});
  }catch(e){}
  return out;
 }
 function restoreLeadNames(){
  var all=[];
  try{all=Array.isArray(technicians)?technicians:[]}catch(e){return false}
  var names=usernames(),changed=[];
  all.forEach(function(t){
   if(!t)return;
   var uid=t.employeeId||LEADS[t.id];
   if(!uid)return;
   if(!t.employeeId)t.employeeId=uid;
   var real=personName(uid);
   if(!real)return;
   var cur=String(t.name||'').trim();
   if(cur===real)return;
   if(!names[cur.toLowerCase()]&&cur)return;      /* not a username — a human wrote it */
   t.name=real;
   changed.push(t);
  });
  if(!changed.length)return false;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  changed.forEach(function(t){
   try{if(typeof cloudUpsert==='function')cloudUpsert('technicians',t)}catch(e){}
  });
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  return true;
 }

 /* --------------------------------------------------------- 2. the switch itself --- */
 window.imodeTestAccountsEnabled=enabled;
 window.imodeSetTestAccounts=function(on){
  settings.testAccountsEnabled=!!on;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  toast(on?tl('เปิดใช้งานบัญชีทดสอบแล้ว','Test accounts enabled')
          :tl('ปิดใช้งานบัญชีทดสอบแล้ว — บัญชีเหล่านี้เข้าสู่ระบบไม่ได้',
              'Test accounts disabled — they can no longer sign in'));
  try{if(typeof window.openAccountAdminModal==='function')window.openAccountAdminModal()}catch(e){}
 };

 /* The door. js/39 reimplemented verify() and findAccount() on window.uatAuth because js/09's
    own closure versions are what login() calls — the same reason this wraps BOTH: blocking
    only one leaves the account listed and still able to sign in. */
 function blocked(username){return !enabled()&&isTestName(username)}
 if(window.uatAuth){
  ['verify','findAccount'].forEach(function(name){
   var base=window.uatAuth[name];
   if(typeof base!=='function')return;
   window.uatAuth[name]=function(username){
    if(blocked(username))return null;
    return base.apply(this,arguments);
   };
  });
  var baseLogin=window.uatAuth.login;
  if(typeof baseLogin==='function'){
   window.uatAuth.login=function(username){
    if(blocked(username))return null;
    return baseLogin.apply(this,arguments);
   };
  }
 }
 /* ImodeAuth is the provider seam every door goes through (auth-integration.js), so it is
    stopped there too rather than trusting one screen to check. */
 if(window.ImodeAuth&&typeof window.ImodeAuth.signIn==='function'){
  var baseSignIn=window.ImodeAuth.signIn;
  window.ImodeAuth.signIn=function(username){
   if(blocked(username)){
    return Promise.resolve({ok:false,
     message:tl('บัญชีทดสอบถูกปิดใช้งานอยู่','Test accounts are switched off')});
   }
   return baseSignIn.apply(this,arguments);
  };
 }

 /* ------------------------------------------------- the control in the account screen --- */
 function boxHTML(){
  var on=enabled();
  return '<div class="tacct-switch'+(on?'':' is-off')+'">'
   +'<div><b>🧪 '+esc2(tl('บัญชีทดสอบ','Test accounts'))+'</b>'
   +'<small>'+esc2(on?tl('เปิดอยู่ — บัญชีที่ลงท้ายด้วย _test เข้าสู่ระบบได้ตามปกติ',
                         'On — accounts ending in _test can sign in')
                    :tl('ปิดอยู่ — บัญชีที่ลงท้ายด้วย _test เข้าสู่ระบบไม่ได้ ข้อมูลยังอยู่ครบ',
                        'Off — accounts ending in _test cannot sign in; nothing is deleted'))+'</small></div>'
   +'<button type="button" class="tacct-btn" onclick="imodeSetTestAccounts('+(on?'false':'true')+')">'
   +esc2(on?tl('ปิดใช้งาน','Turn off'):tl('เปิดใช้งาน','Turn on'))+'</button></div>';
 }
 function decorate(){
  var body=document.getElementById('modalBody');
  if(!body||body.querySelector('.tacct-switch'))return;
  /* Above the account list, inside the same box js/39 draws. */
  var list=body.querySelector('.acctmg-list');
  var anchor=list?(list.parentElement||list):null;
  if(!anchor)return;
  var head=body.querySelector('.acctmg-head');
  if(head)head.insertAdjacentHTML('afterend',boxHTML());
  else anchor.insertAdjacentHTML('afterbegin',boxHTML());
  /* Mark the rows so a switched-off account is obvious in the list. */
  if(!enabled()){
   [].forEach.call(body.querySelectorAll('.acctmg-row'),function(r){
    if(isTestName(r.getAttribute('data-user')))r.classList.add('is-testoff');
   });
  }
 }
 var baseAdmin=window.openAccountAdminModal;
 if(typeof baseAdmin==='function'){
  window.openAccountAdminModal=function(){
   var r=baseAdmin.apply(this,arguments);
   setTimeout(decorate,0);
   return r;
  };
 }

 function start(){
  restoreLeadNames();
  var baseSync=window.syncCloud;
  if(typeof baseSync==='function'){
   window.syncCloud=function(){
    var r=baseSync.apply(this,arguments);
    if(r&&typeof r.then==='function')return r.then(function(v){restoreLeadNames();return v});
    restoreLeadNames();
    return r;
   };
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();

 var st=document.createElement('style');
 st.id='v70TestAccountToggleStyle';
 st.textContent=''
 +'.tacct-switch{display:flex;align-items:center;gap:12px;margin-top:10px;padding:10px 12px;'
 +'border:1px solid #dbe7cf;border-radius:12px;background:#f6fbf2}'
 +'.tacct-switch.is-off{border-color:#f0d9b8;background:#fff8ef}'
 +'.tacct-switch>div{flex:1;min-width:0}'
 +'.tacct-switch b{display:block;font-size:12.5px;color:#12356f}'
 +'.tacct-switch small{display:block;font-size:11px;color:#6f81a3;margin-top:2px;line-height:1.5}'
 +'.tacct-btn{flex:none;cursor:pointer;padding:8px 14px;border-radius:10px;font-size:12px;'
 +'font-weight:700;border:1px solid #cfdcf0;background:#fff;color:#12356f}'
 +'.tacct-btn:hover{border-color:#b9d3f5;background:#f2f7ff}'
 +'.acctmg-row.is-testoff{opacity:.55}'
 +'.acctmg-row.is-testoff .acctmg-id b::after{content:" · ปิดใช้งาน";font-size:10px;color:#8a5a17}';
 document.head.appendChild(st);
})();
