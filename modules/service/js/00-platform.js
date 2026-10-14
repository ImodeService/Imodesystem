/* 2026-10-13: Service as a module of the I-MODE platform (G:\imodeservice).
   "ล็อคอินในหน้าล็อคอินหลักแล้วลิงค์บัญชีไปทุกโมดุล"

   Runs in <head>, after ../../shared/config.js and before everything else. When this page
   sits at .../modules/service/ next to the platform's shared/config.js it:
     1. plays the part of the production build's js/00-env.js (production on, the platform's
        Supabase project), so Service talks to the same project and accounts as the launcher;
     2. hands the data client (js/03 initCloud) the platform's session storage key, so the
        launcher and Service hold ONE Supabase session — signing in or out in either one
        counts for both;
     3. hides the staff screens until js/128 has checked that shared session.
   Anywhere else (the old standalone copy, a real production build with its own 00-env.js)
   it does nothing. */
(function(){
 'use strict';
 if(window.IMODE_ENV)return;
 var C=window.IMODE_CONFIG;
 if(!C||!C.supabaseUrl||!C.supabaseAnonKey||!C.storageKey)return;
 if(!/\/modules\/service\//.test(location.pathname))return;

 var remember=true;
 try{remember=localStorage.getItem('imode.remember')!=='0'}catch(e){}
 var store;
 try{store=remember?window.localStorage:window.sessionStorage}catch(e){}

 window.IMODE_PLATFORM={
  storageKey:C.storageKey,
  loginUrl:new URL('../../apps/launcher/login.html',location.href).href,
  launcherUrl:new URL('../../apps/launcher/index.html',location.href).href
 };
 window.IMODE_SB_OPTIONS={auth:{
  persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
  storageKey:C.storageKey,storage:store
 }};
 window.IMODE_ENV=Object.freeze({
  production:true,
  platform:true,
  version:'Version 1.0',
  builtAt:'',
  customerHost:'',
  customerByUrl:true,
  staffHost:'',
  cloud:{url:C.supabaseUrl,key:C.supabaseAnonKey},
  line:{addFriendUrl:'https://line.me/R/ti/p/%40imodeservice',officialAccountId:'@imodeservice'}
 });

 /* Customer links (machine QR, serial, LINE menu) have no account and are never held. */
 var customer=/[?&](machineToken|serial)=/.test(location.search)
  ||/[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search)
  ||/customer-portal|#\/(customer-home|customer-entry|scan)/.test(location.hash);
 /* only the main page has js/128 to lift it; service-case-detail.html just needs 1 and 2 */
 var mainPage=/\/modules\/service\/(index\.html)?$/.test(location.pathname);
 if(!customer&&mainPage){
  var st=document.createElement('style');
  st.id='imodeSsoWaitStyle';
  st.textContent='html.sso-wait body{visibility:hidden}';
  document.head.appendChild(st);
  document.documentElement.classList.add('sso-wait');
  /* never leave the page blank if something below fails */
  setTimeout(function(){document.documentElement.classList.remove('sso-wait')},12000);
 }
})();
