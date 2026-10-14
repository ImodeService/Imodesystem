/* V6.9 the person picker in the login modal is editable.
   demoUsers is a hard-coded const in the main script, so nothing is deleted from it.
   Removed people are remembered in settings.hiddenLoginUsers (the existing settings key)
   and filtered out of the picker, which keeps the change reversible — "คืนค่ารายชื่อเดิม"
   brings them all back.
   People with no login account are marked, can be removed one at a time, or all at once. */
(function(){
 'use strict';
 if(typeof settings!=='object'||typeof demoUsers==='undefined')return;

 function tl(th,en){return typeof window.L==='function'?window.L(th,en):th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 function hiddenIds(){
  if(!Array.isArray(settings.hiddenLoginUsers))settings.hiddenLoginUsers=[];
  return settings.hiddenLoginUsers;
 }
 function isHidden(id){return hiddenIds().indexOf(id)>=0}
 function allPeople(){return Array.isArray(demoUsers)?demoUsers:[]}
 function visiblePeople(){return allPeople().filter(function(u){return !isHidden(u.id)})}

 /* A person "has an account" when a UAT account resolves to the same display name. */
 function accountNames(){
  try{
   if(!window.uatAuth||typeof window.uatAuth.allAccounts!=='function')return [];
   return window.uatAuth.allAccounts().map(function(a){
    try{return (window.uatAuth.accountToUser(a)||{}).name||a.name||a.username}
    catch(e){return a.name||a.username}
   });
  }catch(e){return []}
 }
 function hasAccount(u){
  var names=accountNames();
  return names.indexOf(u.name)>=0;
 }
 /* The account behind a person, so the row can show that ACCOUNT's role and sign in as it.
    Matched by the account's own userId first (js/09 carries one on the linked accounts) and
    by display name second — the same test hasAccount() has always used. */
 function accountFor(u){
  if(!u)return null;
  try{
   if(!window.uatAuth||typeof window.uatAuth.allAccounts!=='function')return null;
   var list=window.uatAuth.allAccounts()||[];
   var byId=list.filter(function(a){return a.userId&&a.userId===u.id})[0];
   if(byId)return byId;
   return list.filter(function(a){
    var nm;
    try{nm=(window.uatAuth.accountToUser(a)||{}).name||a.name||a.username}
    catch(e){nm=a.name||a.username}
    return nm===u.name;
   })[0]||null;
  }catch(e){return null}
 }
 /* The chip used to print u.team — a team, not a permission — so changing an account's role
    in การจัดการบัญชีผู้ใช้ never showed here. It reads the account's role now. */
 function roleOf(u){
  var a=accountFor(u);
  return (a&&a.role)||(u&&u.team)||'';
 }
 function accountlessPeople(){return visiblePeople().filter(function(u){return !hasAccount(u)})}

 function persist(){
  if(typeof saveLocal==='function')saveLocal();
  if(typeof cloudSaveSettings==='function'){try{cloudSaveSettings()}catch(e){}}
 }

 window.imodeRemoveLoginUser=function(id){
  var u=allPeople().filter(function(x){return x.id===id})[0];
  if(!u)return;
  if(!confirm(tl('ลบ "'+u.name+'" ออกจากรายชื่อผู้ใช้งานใช่ไหม','Remove "'+u.name+'" from the user list?')))return;
  if(!isHidden(id))hiddenIds().push(id);
  persist();
  redraw();
  if(typeof toastMsg==='function')toastMsg(tl('ลบ '+u.name+' ออกจากรายชื่อแล้ว','Removed '+u.name));
 };
 window.imodeRemoveAccountlessUsers=function(){
  var list=accountlessPeople();
  if(!list.length)return;
  if(!confirm(tl('ลบผู้ใช้ที่ยังไม่มีบัญชีเข้าระบบทั้ง '+list.length+' คนใช่ไหม',
                 'Remove all '+list.length+' people who have no login account?')))return;
  list.forEach(function(u){if(!isHidden(u.id))hiddenIds().push(u.id)});
  persist();
  redraw();
  if(typeof toastMsg==='function')toastMsg(tl('ลบ '+list.length+' รายชื่อแล้ว','Removed '+list.length+' people'));
 };
 window.imodeRestoreLoginUsers=function(){
  settings.hiddenLoginUsers=[];
  persist();
  redraw();
  if(typeof toastMsg==='function')toastMsg(tl('คืนค่ารายชื่อเดิมแล้ว','User list restored'));
 };

 /* One-time clean-up, as instructed: everyone in the picker who has no login account is
    removed. It runs once, so anything restored afterwards stays restored, and
    imodeRestoreLoginUsers() brings the original list back at any time. */
 function cleanOnce(){
  if(settings.v69LoginListCleaned)return;
  allPeople().forEach(function(u){
   if(!hasAccount(u)&&!isHidden(u.id))hiddenIds().push(u.id);
  });
  settings.v69LoginListCleaned=true;
  persist();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanOnce,{once:true});
 else cleanOnce();

 /* chooseUser() is the legacy one-click sign-in; a removed person must not slip back in
    through a stale button. */
 var baseChoose=window.chooseUser;
 if(typeof baseChoose==='function'){
  window.chooseUser=function(id){
   if(isHidden(id))return;
   /* 2026-09-23: one click used to sign straight in with NO password. A person who has an
      account now goes through js/46's imodeQuickSwitch — the same password door as the
      account switcher, so lockout, expiry and the audit trail all still apply. Someone with
      no account keeps the old name-only behaviour; there is no password to ask for. */
   var u=allPeople().filter(function(x){return x.id===id})[0];
   var acc=accountFor(u);
   if(acc&&acc.username&&typeof window.imodeQuickSwitch==='function')
    return window.imodeQuickSwitch(acc.username);
   return baseChoose.apply(this,arguments);
  };
 }

 function rowHTML(u){
  var avatar=(typeof loginAvatarHTML==='function')?loginAvatarHTML(u):'';
  var none=!hasAccount(u);
  return '<div class="login-user-item'+(none?' is-accountless':'')+'">'
   +'<div class="left" onclick="chooseUser('+imodeJsArg(u.id)+')">'+avatar
   +'<div><b>'+esc2(u.name)+'</b>'
   +(u.nameTh?'<small class="login-user-th">'+esc2(u.nameTh)+'</small>':'')
   +'<small>'+esc2(u.role||'')+'</small></div></div>'
   +'<span class="login-chip" title="'+esc2(roleOf(u))+'">'+esc2(roleOf(u))+'</span>'
   +(none?'<span class="login-noaccount">'+esc2(tl('ไม่มีบัญชี','no account'))+'</span>':'')
   +'<button type="button" class="login-user-del" title="'+esc2(tl('ลบออกจากรายชื่อ','Remove from the list'))+'"'
   +' aria-label="'+esc2(tl('ลบ','Remove'))+' '+esc2(u.name)+'"'
   +' onclick="imodeRemoveLoginUser('+imodeJsArg(u.id)+')">✕</button>'
   +'</div>';
 }

 function listHTML(){
  var people=visiblePeople(),none=accountlessPeople().length,removed=hiddenIds().length;
  var head='<div class="login-user-tools">'
   +'<small>'+esc2(tl('ผู้ใช้งานในรายการ','People in this list'))+': <b>'+people.length+'</b></small>'
   +(none?'<button type="button" class="mini-btn" onclick="imodeRemoveAccountlessUsers()">'
     +esc2(tl('ลบผู้ที่ไม่มีบัญชี','Remove those without an account'))+' ('+none+')</button>':'')
   +(removed?'<button type="button" class="mini-btn" onclick="imodeRestoreLoginUsers()">'
     +esc2(tl('คืนค่ารายชื่อเดิม','Restore the list'))+' ('+removed+')</button>':'')
   +'</div>';
  var body=people.length?people.map(rowHTML).join('')
   :'<div class="login-user-empty">'+esc2(tl('ไม่มีผู้ใช้ในรายการนี้แล้ว — เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านด้านบน',
      'This list is empty — sign in with the username and password above'))+'</div>';
  return head+body;
 }

 function redraw(){
  var box=document.querySelector('.login-user-list');
  if(!box)return;
  box.innerHTML=listHTML();
 }
 /* js/97 adds and deletes profiles and needs the same list redrawn afterwards. */
 window.imodeRedrawLoginUsers=redraw;

 var baseOpen=window.openUserLoginModal;
 if(typeof baseOpen==='function'){
  window.openUserLoginModal=function(){
   var r=baseOpen.apply(this,arguments);
   redraw();
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v69LoginUserListStyle';
 st.textContent=''
 +'.login-user-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}'
 +'.login-user-tools small{color:#5b6b88;font-size:11.5px}'
 +'.login-user-item{position:relative}'
 +'.login-user-item .left{display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0}'
 +'.login-user-item.is-accountless{border-style:dashed}'
 +'.login-noaccount{font-size:10.5px;font-weight:700;color:#8a5a17;background:#fff7ec;border:1px solid #f6dcb8;border-radius:999px;padding:2px 8px;white-space:nowrap}'
 +'.login-user-del{flex:none;width:26px;height:26px;border-radius:8px;cursor:pointer;font-size:12px;line-height:1;'
 +'border:1px solid #f0cccc;background:#fff;color:#b32020}'
 +'.login-user-del:hover{background:#fdecec}'
 +'.login-user-del:focus-visible{outline:2px solid #b32020;outline-offset:2px}'
 +'.login-user-th{color:#4a5d7e;font-weight:600}'
 +'.login-user-empty{padding:12px;border:1px dashed #d3e0f4;border-radius:12px;color:#5b6b88;font-size:12px;text-align:center}';
 document.head.appendChild(st);
})();
