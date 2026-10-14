/* I-MODE Plus Service & Maintenance — V6.8 Service focus
   auth-integration.js — connects ImodeAuth to the existing application.

   This is the only place that knows about both sides. It replaces the sign-in path of
   v68UatAccountsScript with the provider-backed one, restores a cached session at start-up,
   enforces expiry and idle timeout, and shows the offline-grace banner.

   It does not create accounts, roles or permissions: those still come from the account
   registry (window.uatAuth) or from Supabase `profiles`, depending on the active provider.
*/
(function(){
 'use strict';
 if(!window.ImodeAuth)return;

 var Auth=window.ImodeAuth;
 var watchdog=null;

 /* `settings` is a global lexical binding in index.html, not a window property. */
 function appSettings(){return Auth.appSettings()}
 function t(th,en){
  try{var s=appSettings();return (s&&s.language==='en')?en:th}catch(e){return th}
 }
 function toast(msg){
  if(typeof window.toastMsg==='function')window.toastMsg(msg);
 }

 /* ---------- provider selection ----------
    When Supabase Auth is configured it becomes the only way in: leaving the local UAT
    accounts enabled next to it would be a documented bypass of the server check.
    settings.authConfig.allowLocalFallback = true opts back in, knowingly, for UAT. */
 function selectProvider(){
  var cfg={};
  try{var s=appSettings();cfg=(s&&s.authConfig)||{}}catch(e){}
  if(cfg.provider&&Auth.providers().indexOf(cfg.provider)>=0){
   Auth.use(cfg.provider);
   return cfg.provider;
  }
  return Auth.autoSelect(['supabase','local']);
 }

 function applySession(session){
  if(!session||!session.user)return;
  if(window.uatAuth&&typeof window.uatAuth.setSessionUser==='function'){
   window.uatAuth.setSessionUser(session.user);
  }
 }

 function clearAppUser(){
  if(window.uatAuth&&typeof window.uatAuth.logout==='function'){
   window.uatAuth.logout(true); /* silent: clears currentUser, no navigation */
  }
 }

 function routeAfterLogin(user){
  if(!user)return;
  if(user.accountType==='customer'){
   if(window.uatAuth&&typeof window.uatAuth.enterCustomerPortal==='function'){
    window.uatAuth.enterCustomerPortal();
   }
   return;
  }
  if(typeof window.imodeRoleHomeAfterLogin==='function'){
   if(window.imodeRoleHomeAfterLogin({accountType:user.accountType,technicianId:user.technicianId}))return;
  }
  if(typeof window.goPage==='function')window.goPage('dashboard');
 }

 /* ---------- the one sign-in entry point ----------
    opts.expect: 'customer' or 'staff' — rejects an account that used the wrong door. */
 window.imodeSignIn=function(username,password,opts){
  opts=opts||{};
  selectProvider();
  return Auth.signIn(username,password).then(function(res){
   if(!res.ok)return res;
   var user=res.session.user;
   if(opts.expect==='customer'&&user.accountType!=='customer'){
    return Auth.signOut().then(function(){
     return {ok:false,reason:'wrong-door',
      message:t('บัญชีนี้เป็นบัญชีพนักงาน กรุณาเข้าสู่ระบบจากหน้าพนักงาน',
                'This is a staff account. Please use the staff login.')};
    });
   }
   /* There is no opts.expect==='staff' rejection: a customer signing in from the staff
      modal gains nothing, because the goPage wrapper still confines them to their portal.
      The customer door is the one that must refuse staff, since anyone can reach it by
      scanning a machine QR. */
   applySession(res.session);
   /* With RLS enabled the start-up sync ran anonymously and legitimately saw nothing.
      Now that a session exists, pull again so the app actually loads its data.
      Fire and forget: syncCloud re-renders when it finishes. */
   if(res.session.provider==='supabase'&&typeof window.syncCloud==='function'){
    try{window.syncCloud(true)}catch(e){}
   }
   if(typeof window.renderAll==='function')window.renderAll();
   if(!opts.noRoute)routeAfterLogin(user);
   return res;
  });
 };

 window.imodeSignOut=function(){
  return Auth.signOut().then(function(){
   if(typeof window.uatLogoutBase==='function')window.uatLogoutBase();
  });
 };

 /* ---------- replace the staff modal handler ----------
    The original was synchronous; this one awaits the provider. */
 var origSubmit=window.uatSubmitLogin;
 window.uatSubmitLogin=function(e){
  if(e&&typeof e.preventDefault==='function')e.preventDefault();
  var uEl=document.getElementById('uatLoginUser');
  var pEl=document.getElementById('uatLoginPass');
  var errEl=document.getElementById('uatLoginError');
  var btn=document.querySelector('#uatLoginForm button[type="submit"]');
  var showError=function(msg){
   if(errEl){errEl.textContent=msg;errEl.classList.add('show')}
   if(pEl){pEl.value='';pEl.focus()}
  };
  if(errEl){errEl.textContent='';errEl.classList.remove('show')}
  if(btn){btn.disabled=true}
  return window.imodeSignIn(uEl?uEl.value:'',pEl?pEl.value:'')
   .then(function(res){
    if(btn){btn.disabled=false}
    if(!res.ok){showError(res.message||t('เข้าสู่ระบบไม่สำเร็จ','Sign-in failed'));return res}
    if(typeof window.closeModal==='function')window.closeModal();
    toast(t('เข้าสู่ระบบเป็น ','Signed in as ')+(res.session.user.name||''));
    return res;
   })
   .catch(function(err){
    if(btn){btn.disabled=false}
    showError(t('เกิดข้อผิดพลาด กรุณาลองใหม่','Something went wrong. Please try again.'));
    return {ok:false,reason:'error'};
   });
 };

 /* ---------- logout ---------- */
 window.uatLogoutBase=window.uatLogout;
 window.uatLogout=function(){
  Auth.signOut();
  if(typeof window.uatLogoutBase==='function')window.uatLogoutBase();
 };

 /* ---------- session lifecycle ---------- */
 function endSession(reason){
  clearAppUser();
  if(typeof window.goPage==='function')window.goPage('dashboard');
  if(typeof window.renderAll==='function')window.renderAll();
  toast(reason==='idle'
   ? t('ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน','Signed out after a period of inactivity')
   : t('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่','Session expired, please sign in again'));
 }

 function checkSession(){
  /* currentUser is a top-level `let` in js/03, so it is a lexical global and window
     .currentUser is always undefined — the same trap auth-core.js documents for `settings`.
     Reading it that way made hadUser permanently false, so endSession('expired') never
     fired and an expired or idle session was never actually ended: Auth.session() returned
     null while the application happily kept its signed-in user. */
  var hadUser=false;
  try{hadUser=(typeof currentUser!=='undefined')&&!!currentUser}catch(e){}
  var s=Auth.session();
  if(!s&&hadUser){
   /* Only end it when the session really came from ImodeAuth; a legacy currentUser
      restored below always has a session, so this cannot fire spuriously. */
   endSession('expired');
   return;
  }
  updateOfflineBanner();
 }

 /* ---------- offline grace banner ---------- */
 function updateOfflineBanner(){
  var el=document.getElementById('imodeOfflineBanner');
  var show=Auth.inOfflineGrace();
  if(!show){if(el)el.remove();return}
  if(!el){
   el=document.createElement('div');
   el.id='imodeOfflineBanner';
   el.setAttribute('role','status');
   document.body.appendChild(el);
  }
  el.textContent=t('โหมดออฟไลน์ — ข้อมูลจะซิงก์เมื่อกลับมามีอินเทอร์เน็ต',
                   'Offline mode — data will sync when the connection returns');
 }

 /* ---------- start-up ---------- */
 function boot(){
  selectProvider();
  var s=Auth.restore();
  if(s){
   applySession(s);
  }else{
   /* Upgrade path: someone already signed in before this file existed keeps their
      session instead of being kicked out, but from now on it expires like any other. */
   var legacy=null;
   try{legacy=(typeof currentUser!=='undefined')?currentUser:null}catch(e){}
   if(legacy&&legacy.name){
    Auth.signIn.__migrated=true;
    var migrated={
     user:legacy,provider:Auth.active()||'local',
     issuedAt:Date.now(),lastSeenAt:Date.now(),
     expiresAt:Date.now()+Auth.config().sessionHours*3600000,
     offlineGraceUntil:Date.now()+Auth.config().sessionHours*3600000+Auth.config().offlineGraceDays*86400000
    };
    try{localStorage.setItem(Auth.keys.session,JSON.stringify(migrated))}catch(e){}
    Auth.restore();
   }
  }
  if(typeof window.renderAll==='function')window.renderAll();
  updateOfflineBanner();

  ['pointerdown','keydown','touchstart'].forEach(function(ev){
   window.addEventListener(ev,function(){Auth.touch()},{passive:true});
  });
  window.addEventListener('online',updateOfflineBanner);
  window.addEventListener('offline',updateOfflineBanner);
  if(watchdog)clearInterval(watchdog);
  watchdog=setInterval(checkSession,60000);
 }

 var style=document.createElement('style');
 style.id='imodeAuthStyle';
 style.textContent=
  '#imodeOfflineBanner{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);'+
  'z-index:9999;background:#7a4b00;color:#fff;padding:8px 16px;border-radius:999px;'+
  'font-size:12px;box-shadow:0 8px 20px rgba(0,0,0,.24);pointer-events:none;max-width:92vw;'+
  'text-align:center}'+
  '#uatLoginForm button[type="submit"][disabled]{opacity:.6;cursor:progress}';
 document.head.appendChild(style);

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();
