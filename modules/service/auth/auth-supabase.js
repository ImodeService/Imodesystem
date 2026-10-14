/* I-MODE Plus Service & Maintenance — V6.8 Service focus
   auth-supabase.js — the server-backed authentication provider.

   Passwords are verified by Supabase (bcrypt, server side), which also owns rate limiting,
   token expiry and the password-reset mail. Nothing here trusts the browser.

   Reads the Supabase URL / anon key already stored by the app in `imode_v5_cloud`
   (Settings -> Cloud). It does not change that setting, the project URL, the key, or any
   existing table. The only new tables are the ones in /supabase/*.sql, which the project
   owner runs themselves.

   It creates its OWN Supabase client with a separate storageKey so the data-sync client
   created by initCloud() is untouched.

   IMPORTANT — this provider intentionally has no offline sign-in. A first sign-in on a
   device needs network. Continuity for field technicians comes from the cached session
   and the offline grace period in auth-core.js, not from a local password check.

   New localStorage key owned by this file (managed by supabase-js):
     imode_v69_sb_auth   Supabase session tokens
*/
(function(){
 'use strict';
 if(!window.ImodeAuth)return;

 var STORAGE_KEY='imode_v69_sb_auth';
 var CLOUD_KEY='imode_v5_cloud';
 var client=null;
 var clientFor='';

 function cloudConfig(){
  /* 2026-10-09 security: sign-in talks ONLY to this device's own cloud config (imode_v5_cloud,
     which js/23 pins to the shipped endpoint on the production build). It used to prefer
     settings.authConfig.supabaseUrl/supabaseKey, but `settings` is the shared system_settings
     row any staff role can write, so one account could send everyone's password to a server of
     its choosing whenever the data client was not up yet. No screen ever set those two keys. */
  try{
   var raw=localStorage.getItem(CLOUD_KEY);
   var c=raw?JSON.parse(raw):null;
   if(c&&c.url&&c.key)return {url:String(c.url).trim(),key:String(c.key).trim()};
  }catch(e){}
  return null;
 }

 /* The application's own data client, created by initCloud(). It is a global `let`, not a
    window property. */
 function appDataClient(){
  try{return (typeof supa!=='undefined'&&supa)?supa:null}catch(e){return null}
 }

 function getClient(){
  var cfg=cloudConfig();
  if(!cfg||typeof window.supabase==='undefined'||!window.supabase.createClient)return null;

  /* Sign in on the SAME client the app reads and writes data with. A separate auth client
     would hold the session while every .from() call stayed anonymous, and with RLS enabled
     that means the app can never see its own data even when signed in. */
  var shared=appDataClient();
  if(shared&&shared.auth&&typeof shared.auth.signInWithPassword==='function')return shared;

  var sig=cfg.url+'|'+cfg.key;
  if(client&&clientFor===sig)return client;
  try{
   client=window.supabase.createClient(cfg.url,cfg.key,{
    auth:{
     persistSession:true,
     autoRefreshToken:true,
     detectSessionInUrl:false,
     storageKey:STORAGE_KEY
    }
   });
   clientFor=sig;
   return client;
  }catch(e){client=null;clientFor='';return null}
 }

 /* Maps a profiles row onto the user shape the rest of the application already uses,
    so Field Service name matching, the role Home Page and portal confinement keep working. */
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

 function friendlyError(error){
  var msg=String(error&&error.message||'');
  if(/invalid login credentials/i.test(msg))
   return {reason:'invalid',message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'};
  if(/email not confirmed/i.test(msg))
   return {reason:'unconfirmed',message:'บัญชียังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ'};
  if(/too many requests|rate limit/i.test(msg))
   return {reason:'rate-limited',message:'พยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่'};
  if(/failed to fetch|network/i.test(msg))
   return {reason:'offline',message:'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'};
  return {reason:'error',message:'เข้าสู่ระบบไม่สำเร็จ: '+msg};
 }

 var provider={
  name:'supabase',
  label:'Supabase Auth (เซิร์ฟเวอร์)',

  /* Configured and the library is present. Deliberately not network-dependent: whether
     the device is online is decided per request, not when the provider is chosen. */
  ready:function(){return !!getClient()},

  signIn:function(username,password,ctx){
   var supa=getClient();
   if(!supa)return {ok:false,reason:'unavailable',message:'ยังไม่ได้ตั้งค่า Supabase'};
   if(navigator.onLine===false){
    return {ok:false,reason:'offline',
     message:'ต้องมีอินเทอร์เน็ตเพื่อเข้าสู่ระบบครั้งแรกบนเครื่องนี้'};
   }
   var email=window.ImodeAuth.toEmail(username,ctx&&ctx.config&&ctx.config.usernameDomain);
   return supa.auth.signInWithPassword({email:email,password:password})
    .then(function(res){
     if(res.error)return Object.assign({ok:false},friendlyError(res.error));
     var authUser=res.data&&res.data.user,sess=res.data&&res.data.session;
     if(!authUser||!sess)return {ok:false,reason:'invalid'};
     return supa.from('profiles').select('*').eq('id',authUser.id).maybeSingle()
      .then(function(p){
       if(p.error||!p.data){
        /* Authenticated but not provisioned: do not leave a half-valid session behind. */
        return supa.auth.signOut().then(function(){
         return {ok:false,reason:'no-profile',
          message:'บัญชีนี้ยังไม่ได้ผูกสิทธิ์ในระบบ กรุณาติดต่อผู้ดูแลระบบ'};
        });
       }
       if(p.data.is_active===false){
        return supa.auth.signOut().then(function(){
         return {ok:false,reason:'disabled',message:'บัญชีนี้ถูกระงับการใช้งาน'};
        });
       }
       return {
        ok:true,
        user:toAppUser(p.data,authUser),
        token:sess.access_token,
        refreshToken:sess.refresh_token,
        tokenExpiresAt:sess.expires_at?sess.expires_at*1000:null
       };
      });
    });
  },

  signOut:function(){
   var supa=getClient();
   if(!supa)return;
   return supa.auth.signOut().catch(function(){});
  },

  changePassword:function(user,oldPassword,newPassword,ctx){
   var supa=getClient();
   if(!supa)return {ok:false,reason:'unavailable',message:'ยังไม่ได้ตั้งค่า Supabase'};
   var policy=provider.checkPasswordPolicy(newPassword,user&&user.username);
   if(!policy.ok)return policy;
   var email=user&&user.email?user.email:window.ImodeAuth.toEmail(user&&user.username,ctx&&ctx.config&&ctx.config.usernameDomain);
   /* Re-authenticate first: an unattended open session must not be enough to take over. */
   return supa.auth.signInWithPassword({email:email,password:oldPassword})
    .then(function(res){
     if(res.error)return {ok:false,reason:'wrong-current',message:'รหัสผ่านเดิมไม่ถูกต้อง'};
     return supa.auth.updateUser({password:newPassword}).then(function(up){
      if(up.error)return Object.assign({ok:false},friendlyError(up.error));
      return {ok:true,message:'เปลี่ยนรหัสผ่านเรียบร้อย'};
     });
    });
  },

  requestPasswordReset:function(username,ctx){
   var supa=getClient();
   if(!supa)return {ok:false,reason:'unavailable',message:'ยังไม่ได้ตั้งค่า Supabase'};
   var email=window.ImodeAuth.toEmail(username,ctx&&ctx.config&&ctx.config.usernameDomain);
   var redirect=location.href.split('#')[0].split('?')[0];
   return supa.auth.resetPasswordForEmail(email,{redirectTo:redirect})
    .then(function(res){
     /* Always answer the same way so this cannot be used to discover which accounts exist. */
     return {ok:true,message:'ถ้ามีบัญชีนี้อยู่ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปทางอีเมลแล้ว'};
    })
    .catch(function(){
     return {ok:true,message:'ถ้ามีบัญชีนี้อยู่ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปทางอีเมลแล้ว'};
    });
  },

  /* One shared policy, configured in auth-core. Supabase still applies its own
     server-side minimum length on top of this. */
  checkPasswordPolicy:function(pw,username){
   return window.ImodeAuth.checkPasswordPolicy(pw,username);
  },

  /* Best-effort server-side audit. Never blocks or breaks a sign-in. */
  audit:function(entry){
   var supa=getClient();
   if(!supa)return;
   try{
    supa.from('auth_audit').insert({
     at:entry.at,event:entry.event,username:entry.username,
     ok:entry.ok,reason:entry.reason,provider:entry.provider
    }).then(function(){},function(){});
   }catch(e){}
  },

  /* Lets the app show the live session and refresh state when it needs to. */
  currentServerSession:function(){
   var supa=getClient();
   if(!supa)return Promise.resolve(null);
   return supa.auth.getSession().then(function(r){return r&&r.data&&r.data.session||null})
    .catch(function(){return null});
  }
 };

 window.ImodeAuth.register('supabase',provider);
 window.ImodeAuthSupabase=provider;
})();
