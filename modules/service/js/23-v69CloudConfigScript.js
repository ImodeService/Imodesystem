/* V6.9 — every device connects to the shared database by itself.

   cloudSettings comes from one place only:

       let cloudSettings = JSON.parse(localStorage.getItem(K.cloud) || '{}')   // js/03:189

   which is per-device. A member of staff can type the URL and key into
   ตั้งค่าระบบ → ฐานข้อมูล Cloud, but a customer who scans a machine QR on their own phone
   never can — so their phone stayed in Local Mode, their case was written to their own
   localStorage, and the admin never saw it. That is the whole reason a reported case did
   not reach the office.

   The connection details are therefore shipped with the application. The publishable key
   is designed to be public — it is handed to every browser that opens the site the moment
   the app is configured at all — so putting it here changes nothing about who can see it.

   WHAT PROTECTS THE DATA IS NOT THIS KEY, IT IS ROW LEVEL SECURITY, AND RLS IS CURRENTLY
   OFF on this project (it had to be: 02-rls.sql grants writes `to authenticated` only, and
   nobody in this application is authenticated with Supabase — customers have no accounts
   and staff sign in against the local UAT registry). While it is off, anyone who reads this
   file can read and write the database. That is a deliberate, temporary UAT choice on a
   project named service_Imode_test. Do not put real customer records in it until RLS is
   back on with policies that match how people actually sign in — see supabase/README.md.

   To point the app at a different project, change the two values below. To disconnect one
   device, use the ใช้ข้อมูลในเครื่อง button in Settings; that is remembered here so this
   script does not silently reconnect it on the next reload. */
(function(){
 'use strict';

 /* Production (js/00-env.js, written by the production build) brings its own server and
    must win over whatever this device remembers: every phone that ever opened the test site
    carries the TEST database in imode_v5_cloud for ever, and would otherwise keep writing
    there while everyone else moved on — the data would split in two without a sound.
    The test values below are dev-only: the production build removes them. */
 var PROD=(window.IMODE_ENV&&window.IMODE_ENV.production)?window.IMODE_ENV:null;
 var DEFAULT_CLOUD=PROD?{url:(PROD.cloud&&PROD.cloud.url)||'',key:(PROD.cloud&&PROD.cloud.key)||''}:{
  /*@dev-only*/
  url:'https://ywlrlfudlxsallanoroq.supabase.co',
  key:'sb_publishable_HmX5AeClb2ln3XG7umpHaw_kWw7E1kk'
  /*@end-dev-only*/
 };
 var OPT_OUT='imode_v69_cloud_optout';

 if(typeof cloudSettings!=='object'||!cloudSettings)return;

 /* Someone pressed ใช้ข้อมูลในเครื่อง on this device — leave it alone. */
 var optedOut=false;
 try{optedOut=localStorage.getItem(OPT_OUT)==='1'}catch(e){}

 var configured=!!(cloudSettings.url&&cloudSettings.key);
 if(PROD&&DEFAULT_CLOUD.url&&(cloudSettings.url!==DEFAULT_CLOUD.url||cloudSettings.key!==DEFAULT_CLOUD.key)){
  configured=false;optedOut=false;    /* production: the shipped server, always */
 }
 if(!configured&&!optedOut&&DEFAULT_CLOUD.url&&DEFAULT_CLOUD.key){
  cloudSettings.url=DEFAULT_CLOUD.url;
  cloudSettings.key=DEFAULT_CLOUD.key;
  /* Written through so the Settings page shows the values and so initCloud(), which runs
     later in the boot sequence (renderAll -> await initCloud -> initPortalFromUrl), reads
     a configured client. */
  try{localStorage.setItem('imode_v5_cloud',JSON.stringify(cloudSettings))}catch(e){}
 }

 /* Remember a deliberate disconnect, and forget it again when someone reconnects. */
 var baseDisconnect=window.disconnectCloud;
 if(typeof baseDisconnect==='function'){
  window.disconnectCloud=function(){
   try{localStorage.setItem(OPT_OUT,'1')}catch(e){}
   return baseDisconnect.apply(this,arguments);
  };
 }
 var baseSave=window.saveCloudSettings;
 if(typeof baseSave==='function'){
  window.saveCloudSettings=function(){
   try{localStorage.removeItem(OPT_OUT)}catch(e){}
   return baseSave.apply(this,arguments);
  };
 }
 /* ---------------------------------------------------------------------------------------
    2026-09-20 — THE LOGIN PROVIDER HAS TO SHIP WITH THE APP TOO, for the same reason the
    connection above does.

    MEASURED on a fresh browser profile against the live project:

      before syncCloud() lands   settings.authConfig = null
                                 -> selectProvider() (auth/auth-integration.js:31) finds no
                                    cfg.provider and falls through to
                                    Auth.autoSelect(['supabase','local'])
                                 -> supabase wins, because THIS FILE just configured a cloud
                                 -> tech_test1 signs in and is told
                                    "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      after syncCloud() lands    authConfig.provider === 'local'  ->  the same sign-in works

    Only three accounts exist in Supabase Auth (supabase/03-users.sql). The other four —
    lead_technical, lead_rd, tech_test1 and whatever the owner creates — live in the local
    registry in js/09, so on a NEW device they were all rejected until the settings row came
    down. A technician opening the site on a new phone hit it every time, and it looked like
    a wrong password rather than a race.

    The owner pinned provider:'local' in the live settings back in part 17 §9; it simply had
    no way to reach a device that had not synced yet. This writes the same value locally so
    it is true from the first paint.

    It does NOT override anything: an explicit provider already in settings — from this
    device's cached copy or from the cloud — is left exactly as it is, so switching the
    project to Supabase Auth later is still one settings change. The re-apply after a sync is
    there because syncCloud() replaces `settings` wholesale, so a cloud row carrying no
    authConfig at all would otherwise wipe the default back out mid-session. */
 function ensureAuthProvider(){
  try{
   if(typeof settings!=='object'||!settings)return;
   if(!settings.authConfig||typeof settings.authConfig!=='object')settings.authConfig={};
   if(PROD)settings.authConfig.provider='supabase';        /* the server's login, only */
   else if(!settings.authConfig.provider)settings.authConfig.provider='local';
  }catch(e){}
 }
 ensureAuthProvider();
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   if(r&&typeof r.then==='function')return r.then(function(v){ensureAuthProvider();return v},
                                                  function(e){ensureAuthProvider();throw e});
   ensureAuthProvider();
   return r;
  };
 }
 window.imodeEnsureAuthProvider=ensureAuthProvider;

 window.imodeDefaultCloud=DEFAULT_CLOUD;
})();
