/* 2026-10-13: one sign-in for every module — the Service half.
   "ล็อคอินในหน้าล็อคอินหลักแล้วลิงค์บัญชีไปทุกโมดุล"

   Only active when js/00-platform.js found the platform (window.IMODE_PLATFORM). The launcher
   (apps/launcher) and this page share one Supabase session (same project, same storage key),
   so all this file has to do is keep Service's own session (auth-core, imode_v69_session) in
   step with it:

     shared session, Service not signed in   → sign Service in as that person (no password)
     shared session belongs to someone else  → switch Service to that person
     no shared session (signed out anywhere) → go to the main login page, then come back here
     sign out / session end inside Service   → sign out of the shared session too, back to login

   Offline: a technician whose phone cannot reach the server keeps the Service session it
   already has (auth-core's offline grace) instead of being sent to a login that cannot work.
   Customer links are never touched. */
(function(){
 'use strict';
 var P=window.IMODE_PLATFORM;
 if(!P)return;

 var Auth=window.ImodeAuth;
 var root=document.documentElement;
 var adopted=false;        /* Service is signed in from the shared session */
 var leaving=false;

 function reveal(){root.classList.remove('sso-wait')}
 function online(){return navigator.onLine!==false}
 function customerSurface(){
  try{return typeof window.imodeCustomerSurface==='function'&&!!window.imodeCustomerSurface()}catch(e){return false}
 }
 function dataClient(){try{return (typeof supa!=='undefined'&&supa)?supa:null}catch(e){return null}}
 function appUser(){try{return (typeof currentUser!=='undefined')?currentUser:null}catch(e){return null}}

 function toLogin(msg){
  if(leaving)return;
  leaving=true;
  var here=location.pathname+location.search+location.hash;
  var url=P.loginUrl+'?next='+encodeURIComponent(here)+(msg?'&msg='+encodeURIComponent(msg):'');
  location.replace(url);
 }

 /* The same mapping auth/auth-supabase.js uses after a password sign-in. */
 function toAppUser(profile,authUser){
  var role=String(profile.role||'').trim();
  var accountType='staff';
  if(/^customer$/i.test(role)||profile.customer_id)accountType='customer';
  else if(profile.technician_id)accountType='technician';
  return {
   id:'SB-'+authUser.id,
   authId:authUser.id,
   username:profile.username||String(authUser.email||'').split('@')[0],
   email:authUser.email||'',
   name:profile.full_name||profile.username||authUser.email||'',
   role:role||'User',
   permissionRole:role||'User',
   team:profile.team||'',
   accountType:accountType,
   technicianId:profile.technician_id||'',
   customerId:profile.customer_id||'',
   photo:profile.photo_url||''
  };
 }

 function serviceSessionFor(user,sess){
  var cfg=Auth.config(),t=Date.now();
  return {
   user:user,provider:'supabase',
   issuedAt:t,lastSeenAt:t,
   expiresAt:t+cfg.sessionHours*3600000,
   offlineGraceUntil:t+cfg.sessionHours*3600000+cfg.offlineGraceDays*86400000,
   token:sess.access_token||null,
   refreshToken:null,
   tokenExpiresAt:sess.expires_at?sess.expires_at*1000:null
  };
 }

 function enter(user){
  if(window.uatAuth&&typeof window.uatAuth.setSessionUser==='function')window.uatAuth.setSessionUser(user);
  if(typeof window.syncCloud==='function'){try{window.syncCloud(true)}catch(e){}}
  if(typeof window.renderAll==='function'){try{window.renderAll()}catch(e){}}
  var routed=false;
  if(typeof window.imodeRoleHomeAfterLogin==='function'){
   try{routed=!!window.imodeRoleHomeAfterLogin({accountType:user.accountType,technicianId:user.technicianId})}catch(e){}
  }
  if(!routed&&typeof window.goPage==='function')window.goPage('dashboard');
 }

 function waitForClient(ms){
  return new Promise(function(resolve){
   var t0=Date.now();
   (function tick(){
    var c=dataClient();
    if(c&&c.auth)return resolve(c);
    if(Date.now()-t0>ms)return resolve(null);
    setTimeout(tick,100);
   })();
  });
 }

 function check(){
  if(customerSurface()){reveal();return Promise.resolve()}
  return waitForClient(10000).then(function(client){
   var had=Auth&&Auth.session();
   if(!client){
    /* no Supabase at all (library blocked, offline first load): keep what Service has */
    reveal();
    return;
   }
   return client.auth.getSession().then(function(r){
    var sess=r&&r.data&&r.data.session;
    if(!sess){
     if(had&&!online()){reveal();return}          /* offline grace */
     if(had&&Auth)Auth.signOut();
     toLogin();
     return;
    }
    var mine=had&&had.user&&had.user.authId;
    if(mine===sess.user.id){adopted=true;reveal();return}
    /* sign Service in as the person signed in on the platform */
    return client.from('profiles').select('*').eq('id',sess.user.id).maybeSingle().then(function(p){
     if(p.error||!p.data){
      if(had&&!online()){reveal();return}
      return client.auth.signOut().catch(function(){}).then(function(){
       toLogin('บัญชีนี้ยังไม่ได้ผูกสิทธิ์ในระบบ ติดต่อผู้ดูแลระบบ');
      });
     }
     if(p.data.is_active===false){
      return client.auth.signOut().catch(function(){}).then(function(){
       toLogin('บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ');
      });
     }
     var user=toAppUser(p.data,sess.user);
     if(user.accountType==='customer'){
      return client.auth.signOut().catch(function(){}).then(function(){
       toLogin('หน้านี้สำหรับพนักงาน I-MODE เท่านั้น');
      });
     }
     try{localStorage.setItem(Auth.keys.session,JSON.stringify(serviceSessionFor(user,sess)))}catch(e){}
     Auth.restore();
     adopted=true;
     enter(user);
     reveal();
    });
   }).catch(function(){
    reveal();
   });
  });
 }

 /* ---------- signing out from Service signs out of the platform ---------- */
 function signOutEverywhere(){
  leaving=true;
  var done=function(){
   try{if(window.uatAuth&&typeof window.uatAuth.logout==='function')window.uatAuth.logout(true)}catch(e){}
   location.replace(P.loginUrl);
  };
  var c=dataClient();
  Promise.resolve(Auth?Auth.signOut():null)
   .then(function(){return c&&c.auth?c.auth.signOut():null})
   .catch(function(){})
   .then(done,done);
 }
 window.uatLogout=signOutEverywhere;
 window.imodeSignOut=function(){signOutEverywhere();return Promise.resolve()};

 /* ---------- the session ending on its own ----------
    auth-core ends Service's session after sessionHours or idleMinutes. On the platform the
    shared session has to end with it, or the next page load would quietly sign back in. */
 setInterval(function(){
  if(!adopted||leaving||!online()||customerSurface())return;
  if(Auth&&!Auth.session()){
   var c=dataClient();
   Promise.resolve(c&&c.auth?c.auth.signOut():null).catch(function(){}).then(function(){
    toLogin('ออกจากระบบอัตโนมัติ กรุณาเข้าสู่ระบบใหม่');
   });
  }
 },30000);

 /* signed out in the launcher or another tab */
 function watch(){
  waitForClient(10000).then(function(c){
   if(!c)return;
   c.auth.onAuthStateChange(function(event){
    if(event==='SIGNED_OUT'&&!leaving&&!customerSurface()&&adopted)toLogin();
    /* someone else signed in, in another tab or through Service's switch-account box */
    if(event==='SIGNED_IN'&&adopted&&!leaving){
     c.auth.getSession().then(function(r){
      var s=r&&r.data&&r.data.session,u=appUser();
      if(s&&u&&u.authId&&u.authId!==s.user.id)check();
     });
    }
   });
  });
 }

 function start(){check().then(watch)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
