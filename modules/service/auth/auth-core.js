/* I-MODE Plus Service & Maintenance — V6.8 Service focus
   auth-core.js — provider-agnostic authentication core.

   Why this file exists: the production database is not reachable yet, so the login must be
   able to change backend without the application being rewritten. Everything the app calls
   goes through ImodeAuth; the provider underneath (local / supabase) is swappable.

   Loaded as a classic script (not an ES module) so index.html still opens from file://.

   New localStorage keys owned by this file. No existing key is read or renamed:
     imode_v69_session      the cached session
     imode_v69_auth_audit   local sign-in audit ring buffer
     imode_v69_auth_lock    failed-attempt / lockout state
*/
(function(){
 'use strict';

 var KEYS={
  session:'imode_v69_session',
  audit:'imode_v69_auth_audit',
  lock:'imode_v69_auth_lock'
 };

 var DEFAULTS={
  /* absolute lifetime of a session, from sign-in */
  sessionHours:12,
  /* signed out after this much inactivity while online */
  idleMinutes:240,
  /* a device that cannot reach the server keeps working this long past expiry */
  offlineGraceDays:7,
  /* failed sign-ins allowed per username before a temporary lock */
  maxAttempts:5,
  lockoutMinutes:15,
  /* how many audit entries to keep on the device */
  auditLimit:200,
  /* usernames without '@' become <username>@<domain> for providers that need an email */
  usernameDomain:'imode.local',

  /* Password rules, deliberately relaxed while the system is in UAT.
     Tighten them by setting settings.authConfig — no code change needed:
       passwordMinLength: 8, passwordRequireLetterAndDigit: true, passwordRejectUsername: true
     Note that Supabase enforces its own server-side minimum (6 by default) regardless of
     what is set here, and these rules only apply when CHANGING a password, never to sign-in. */
  passwordMinLength:6,
  passwordRequireLetterAndDigit:false,
  passwordRejectUsername:false
 };

 var providers={};
 var activeName='';
 var session=null;
 var listeners=[];

 /* ---------- storage helpers (never throw: private mode, blocked storage) ---------- */
 function read(key,fallback){
  try{
   var raw=localStorage.getItem(key);
   return raw?JSON.parse(raw):fallback;
  }catch(e){return fallback}
 }
 function write(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true}
  catch(e){return false}
 }
 function drop(key){
  try{localStorage.removeItem(key)}catch(e){}
 }

 /* `settings` is declared with `let` at the top level of index.html, so it lives in the
    global lexical scope and is NOT a property of window. Reading window.settings always
    returns undefined; the bare identifier is the only way to reach it from another
    classic script. */
 function appSettings(){
  try{return (typeof settings!=='undefined'&&settings)?settings:null}catch(e){return null}
 }

 function config(){
  var custom={};
  try{var s=appSettings();custom=(s&&s.authConfig)||{}}catch(e){}
  var out={};
  for(var k in DEFAULTS)if(Object.prototype.hasOwnProperty.call(DEFAULTS,k)){
   out[k]=(custom[k]===undefined||custom[k]===null||custom[k]==='')?DEFAULTS[k]:custom[k];
  }
  return out;
 }

 function now(){return Date.now()}
 function online(){return navigator.onLine!==false}

 /* ---------- audit ----------
    This log lives on the device, so it is accountability among trusted staff, not
    tamper-proof evidence. A provider that has a server (supabase) also pushes it there. */
 function auditLog(event,detail){
  var cfg=config();
  var entry={
   at:new Date().toISOString(),
   event:event,
   username:(detail&&detail.username)||'',
   provider:(detail&&detail.provider)||activeName,
   ok:!!(detail&&detail.ok),
   reason:(detail&&detail.reason)||'',
   online:online()
  };
  var list=read(KEYS.audit,[]);
  if(!Array.isArray(list))list=[];
  list.unshift(entry);
  if(list.length>cfg.auditLimit)list.length=cfg.auditLimit;
  write(KEYS.audit,list);
  var p=providers[activeName];
  if(p&&typeof p.audit==='function'){
   try{p.audit(entry)}catch(e){}
  }
  return entry;
 }

 /* ---------- lockout ---------- */
 function lockState(){
  var s=read(KEYS.lock,{});
  return (s&&typeof s==='object')?s:{};
 }
 function lockKey(username){return String(username||'').trim().toLowerCase()}
 function lockInfo(username){
  var cfg=config(),k=lockKey(username),rec=lockState()[k];
  if(!rec)return {locked:false,attempts:0,remainingMs:0};
  if(rec.until&&rec.until>now())return {locked:true,attempts:rec.attempts||0,remainingMs:rec.until-now()};
  return {locked:false,attempts:rec.attempts||0,remainingMs:0};
 }
 function noteFailure(username){
  var cfg=config(),k=lockKey(username),all=lockState(),rec=all[k]||{attempts:0,until:0};
  /* a lock that has expired starts the count again */
  if(rec.until&&rec.until<=now())rec={attempts:0,until:0};
  rec.attempts=(rec.attempts||0)+1;
  if(rec.attempts>=cfg.maxAttempts){
   rec.until=now()+cfg.lockoutMinutes*60000;
   rec.attempts=0;
  }
  all[k]=rec;
  write(KEYS.lock,all);
  return lockInfo(username);
 }
 function clearFailures(username){
  var all=lockState();
  delete all[lockKey(username)];
  write(KEYS.lock,all);
 }

 /* ---------- session ---------- */
 function buildSession(user,provider,extra){
  var cfg=config(),t=now();
  var s={
   user:user,
   provider:provider,
   issuedAt:t,
   lastSeenAt:t,
   expiresAt:t+cfg.sessionHours*3600000,
   offlineGraceUntil:t+cfg.sessionHours*3600000+cfg.offlineGraceDays*86400000,
   token:(extra&&extra.token)||null,
   refreshToken:(extra&&extra.refreshToken)||null,
   tokenExpiresAt:(extra&&extra.tokenExpiresAt)||null
  };
  return s;
 }

 /* Returns '' when the session is usable, otherwise why it is not. */
 function sessionProblem(s){
  if(!s||!s.user)return 'none';
  var cfg=config(),t=now();
  if(s.expiresAt&&t>s.expiresAt){
   /* past the absolute lifetime: only an offline device may keep going, and only
      inside the grace window, so a revoked account cannot be used forever */
   if(online())return 'expired';
   if(!s.offlineGraceUntil||t>s.offlineGraceUntil)return 'offline-grace-expired';
   return '';
  }
  if(s.lastSeenAt&&cfg.idleMinutes>0&&t-s.lastSeenAt>cfg.idleMinutes*60000)return 'idle';
  return '';
 }

 function loadSession(){
  var s=read(KEYS.session,null);
  if(!s||!s.user)return null;
  return s;
 }
 function saveSession(s){
  session=s;
  if(s)write(KEYS.session,s);else drop(KEYS.session);
  emit();
  return s;
 }
 function touch(){
  if(!session)return;
  var t=now();
  /* avoid a write on every mouse move */
  if(t-(session.lastSeenAt||0)<60000)return;
  session.lastSeenAt=t;
  write(KEYS.session,session);
 }

 function emit(){
  listeners.slice().forEach(function(fn){
   try{fn(session)}catch(e){}
  });
 }

 /* ---------- public API ---------- */
 var api={
  keys:KEYS,
  defaults:DEFAULTS,
  config:config,
  appSettings:appSettings,

  register:function(name,provider){
   providers[name]=provider;
   return api;
  },
  providers:function(){return Object.keys(providers)},
  use:function(name){
   if(!providers[name])throw new Error('unknown auth provider: '+name);
   activeName=name;
   return api;
  },
  active:function(){return activeName},

  /* Picks the strongest provider that is actually usable right now. A provider reports
     ready() itself, so adding one later does not change this logic. */
  autoSelect:function(order){
   var list=order||['supabase','local'];
   for(var i=0;i<list.length;i++){
    var p=providers[list[i]];
    if(!p)continue;
    var ready=true;
    try{ready=typeof p.ready==='function'?!!p.ready():true}catch(e){ready=false}
    if(ready){activeName=list[i];return activeName}
   }
   activeName=providers.local?'local':'';
   return activeName;
  },

  onChange:function(fn){
   if(typeof fn==='function')listeners.push(fn);
   return function(){listeners=listeners.filter(function(x){return x!==fn})};
  },

  /* Restores a cached session on startup. Never contacts the network. */
  restore:function(){
   var s=loadSession();
   if(!s){session=null;return null}
   var problem=sessionProblem(s);
   if(problem){
    session=null;
    drop(KEYS.session);
    auditLog('session-ended',{username:s.user&&s.user.username,reason:problem,provider:s.provider});
    return null;
   }
   session=s;
   emit();
   return session;
  },

  session:function(){
   if(!session)return null;
   if(sessionProblem(session)){
    var why=sessionProblem(session),u=session.user&&session.user.username;
    session=null;
    drop(KEYS.session);
    auditLog('session-ended',{username:u,reason:why});
    return null;
   }
   return session;
  },
  user:function(){var s=api.session();return s?s.user:null},
  touch:touch,

  /* True when the session is only alive because the device cannot reach the server. */
  inOfflineGrace:function(){
   var s=session;
   if(!s||!s.expiresAt)return false;
   return now()>s.expiresAt&&!online();
  },

  lockInfo:lockInfo,
  audit:function(limit){
   var list=read(KEYS.audit,[]);
   return Array.isArray(list)?(limit?list.slice(0,limit):list):[];
  },
  clearAudit:function(){drop(KEYS.audit)},

  /* signIn resolves to {ok:true,session} or {ok:false,reason,message,...} */
  signIn:function(username,password){
   var name=activeName||api.autoSelect();
   var provider=providers[name];
   var uname=String(username||'').trim();
   if(!provider){
    return Promise.resolve({ok:false,reason:'no-provider',message:'ระบบเข้าสู่ระบบยังไม่พร้อม'});
   }
   if(!uname||!password){
    return Promise.resolve({ok:false,reason:'empty',message:'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'});
   }
   var lock=lockInfo(uname);
   if(lock.locked){
    var mins=Math.ceil(lock.remainingMs/60000);
    auditLog('sign-in',{username:uname,ok:false,reason:'locked'});
    return Promise.resolve({ok:false,reason:'locked',remainingMs:lock.remainingMs,
     message:'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ใน '+mins+' นาที'});
   }
   return Promise.resolve()
    .then(function(){return provider.signIn(uname,password,{config:config()})})
    .then(function(res){
     if(!res||!res.ok){
      var info=noteFailure(uname);
      auditLog('sign-in',{username:uname,ok:false,reason:(res&&res.reason)||'invalid'});
      if(info.locked){
       return {ok:false,reason:'locked',remainingMs:info.remainingMs,
        message:'ผิดหลายครั้งเกินไป บัญชีถูกล็อก '+config().lockoutMinutes+' นาที'};
      }
      var left=config().maxAttempts-info.attempts;
      return {ok:false,reason:(res&&res.reason)||'invalid',attemptsLeft:left,
       message:(res&&res.message)||'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'+(left>0&&left<=2?' (เหลืออีก '+left+' ครั้ง)':'')};
     }
     clearFailures(uname);
     var s=buildSession(res.user,name,res);
     saveSession(s);
     auditLog('sign-in',{username:uname,ok:true,provider:name});
     return {ok:true,session:s,user:res.user};
    })
    .catch(function(err){
     auditLog('sign-in',{username:uname,ok:false,reason:'error:'+(err&&err.message||err)});
     return {ok:false,reason:'error',message:'เชื่อมต่อระบบยืนยันตัวตนไม่ได้ กรุณาลองใหม่'};
    });
  },

  signOut:function(){
   var u=session&&session.user&&session.user.username;
   var provider=providers[session&&session.provider||activeName];
   saveSession(null);
   auditLog('sign-out',{username:u,ok:true});
   if(provider&&typeof provider.signOut==='function'){
    return Promise.resolve().then(function(){return provider.signOut()}).catch(function(){});
   }
   return Promise.resolve();
  },

  changePassword:function(oldPassword,newPassword){
   var provider=providers[activeName];
   var user=api.user();
   if(!user)return Promise.resolve({ok:false,reason:'no-session',message:'กรุณาเข้าสู่ระบบก่อน'});
   if(!provider||typeof provider.changePassword!=='function'){
    return Promise.resolve({ok:false,reason:'unsupported',message:'ผู้ให้บริการนี้ยังเปลี่ยนรหัสผ่านไม่ได้'});
   }
   return Promise.resolve()
    .then(function(){return provider.changePassword(user,oldPassword,newPassword,{config:config()})})
    .then(function(res){
     auditLog('change-password',{username:user.username,ok:!!(res&&res.ok),reason:(res&&res.reason)||''});
     return res||{ok:false,reason:'unknown',message:'เปลี่ยนรหัสผ่านไม่สำเร็จ'};
    });
  },

  requestPasswordReset:function(username){
   var provider=providers[activeName];
   if(!provider||typeof provider.requestPasswordReset!=='function'){
    return Promise.resolve({ok:false,reason:'unsupported',
     message:'ระบบนี้ยังรีเซ็ตรหัสผ่านเองไม่ได้ กรุณาติดต่อผู้ดูแลระบบ'});
   }
   return Promise.resolve()
    .then(function(){return provider.requestPasswordReset(username,{config:config()})})
    .then(function(res){
     auditLog('reset-request',{username:username,ok:!!(res&&res.ok)});
     return res;
    });
  },

  /* One password policy for every provider, so there is a single place to tighten it. */
  checkPasswordPolicy:function(pw,username){
   var cfg=config(),s=String(pw||'');
   if(s.length<cfg.passwordMinLength){
    return {ok:false,reason:'too-short',
     message:'รหัสผ่านต้องยาวอย่างน้อย '+cfg.passwordMinLength+' ตัวอักษร'};
   }
   if(cfg.passwordRequireLetterAndDigit&&(!/[0-9]/.test(s)||!/[a-zA-Z]/.test(s))){
    return {ok:false,reason:'too-simple',message:'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'};
   }
   if(cfg.passwordRejectUsername&&username&&s.toLowerCase()===String(username).toLowerCase()){
    return {ok:false,reason:'same-as-username',message:'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้'};
   }
   return {ok:true};
  },

  /* Used by providers that need an email address for a username-style login. */
  toEmail:function(username,domain){
   var u=String(username||'').trim();
   if(!u)return '';
   if(u.indexOf('@')>=0)return u;
   return u+'@'+(domain||config().usernameDomain);
  }
 };

 window.ImodeAuth=api;
})();
