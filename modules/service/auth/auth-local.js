/* I-MODE Plus Service & Maintenance — V6.8 Service focus
   auth-local.js — the offline / UAT authentication provider.

   It does NOT implement password checking of its own: it delegates to window.uatAuth,
   the account registry already in index.html (v68UatAccountsScript). This provider only
   adapts that registry to the ImodeAuth provider contract.

   It works with no network at all, which is why it stays available for field technicians.

   New localStorage key owned by this file:
     imode_v69_local_pw   per-user password-hash overrides set through "change password"

   Security note: this provider verifies passwords inside the browser, so it is suitable
   for UAT and offline fallback only. It is not a substitute for server-side auth.
*/
(function(){
 'use strict';
 if(!window.ImodeAuth)return;

 var PW_KEY='imode_v69_local_pw';

 function registry(){return window.uatAuth||null}

 function overrides(){
  try{
   var raw=localStorage.getItem(PW_KEY);
   var o=raw?JSON.parse(raw):{};
   return (o&&typeof o==='object')?o:{};
  }catch(e){return {}}
 }
 function saveOverrides(o){
  try{localStorage.setItem(PW_KEY,JSON.stringify(o));return true}catch(e){return false}
 }
 function unameKey(u){return String(u||'').trim().toLowerCase()}

 var provider={
  name:'local',
  label:'บัญชีในเครื่อง (ออฟไลน์)',

  /* Available whenever the account registry loaded. Needs no network. */
  ready:function(){
   var r=registry();
   return !!(r&&typeof r.verify==='function');
  },

  signIn:function(username,password){
   var r=registry();
   if(!r||typeof r.verify!=='function'){
    return {ok:false,reason:'unavailable',message:'ทะเบียนบัญชีในเครื่องยังไม่พร้อม'};
   }
   /* A changed password wins over the built-in one for that account. */
   var ov=overrides()[unameKey(username)];
   if(ov){
    var account=r.findAccount?r.findAccount(username):null;
    if(!account)return {ok:false,reason:'invalid'};
    if(typeof r.hash!=='function')return {ok:false,reason:'unavailable'};
    if(r.hash(password)!==ov)return {ok:false,reason:'invalid'};
    return {ok:true,user:r.accountToUser(account),account:account};
   }
   var res=r.verify(username,password);
   if(!res)return {ok:false,reason:'invalid'};
   return {ok:true,user:res.user,account:res.account};
  },

  signOut:function(){/* nothing server-side to revoke */},

  changePassword:function(user,oldPassword,newPassword){
   var r=registry();
   if(!r||typeof r.hash!=='function'){
    return {ok:false,reason:'unavailable',message:'เปลี่ยนรหัสผ่านไม่ได้ในโหมดนี้'};
   }
   var uname=user&&user.username;
   if(!uname)return {ok:false,reason:'no-session',message:'ไม่พบบัญชีผู้ใช้'};
   var check=provider.signIn(uname,oldPassword);
   if(!check.ok)return {ok:false,reason:'wrong-current',message:'รหัสผ่านเดิมไม่ถูกต้อง'};
   var policy=provider.checkPasswordPolicy(newPassword,uname);
   if(!policy.ok)return policy;
   var ov=overrides();
   ov[unameKey(uname)]=r.hash(newPassword);
   if(!saveOverrides(ov))return {ok:false,reason:'storage',message:'บันทึกรหัสผ่านใหม่ไม่สำเร็จ'};
   return {ok:true,message:'เปลี่ยนรหัสผ่านแล้ว (เฉพาะเครื่องนี้)'};
  },

  /* There is no mail server behind this provider, so a self-service reset is impossible
     by design rather than unimplemented. Say so plainly instead of pretending. */
  requestPasswordReset:function(){
   return {ok:false,reason:'unsupported',
    message:'โหมดออฟไลน์รีเซ็ตรหัสผ่านเองไม่ได้ กรุณาติดต่อผู้ดูแลระบบ'};
  },

  /* One shared policy, configured in auth-core. */
  checkPasswordPolicy:function(pw,username){
   return window.ImodeAuth.checkPasswordPolicy(pw,username);
  },

  /* Admin tooling: forget a locally changed password and fall back to the built-in one. */
  resetLocalOverride:function(username){
   var ov=overrides();
   delete ov[unameKey(username)];
   return saveOverrides(ov);
  },
  hasLocalOverride:function(username){return !!overrides()[unameKey(username)]}
 };

 window.ImodeAuth.register('local',provider);
 window.ImodeAuthLocal=provider;
})();
