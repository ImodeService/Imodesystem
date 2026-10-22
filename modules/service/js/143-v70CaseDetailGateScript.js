/* js/143-v70CaseDetailGateScript.js — 2026-10-21 (ข้อ 3, ความปลอดภัย)
   "คนที่ยังไม่ได้ล็อคอินสามารถเข้าดูรายละเอียดเคสได้โดยการเข้าผ่านลิงค์ของเคสนั้นๆ"

   WHY IT HAPPENED. service-case-detail.html is its own document and reads the cases this
   device keeps in localStorage. It never asked who was looking, so a case link opened on a
   browser that had held a signed-in session before showed the case to anybody. The database
   itself was never open: Supabase RLS refuses an anonymous visitor.

   WHAT THIS DOES. The page starts hidden (html.scd-gate, set in <head>). This file decides:
     platform build (js/00-platform.js found shared/config.js):
       ask Supabase for the shared session the launcher and Service use
         no session                         → the main login page, then back to this case
         customer / inactive / no profile   → the main login page with the reason
         staff                              → show the page
     no Supabase library, or no answer in 10 s (offline, CDN blocked):
       the Service session this device already holds (imode_v69_session, the same offline
       grace auth-core.js gives the application) or the login door. Never the case.
     not the platform build (old standalone / production copy):
       the Service session, or index.html, whose own login door takes over.
   The case data is not rendered differently; it is only never made visible without a
   staff session. Loaded on service-case-detail.html only. */
(function(){
 'use strict';
 var root=document.documentElement;
 var P=window.IMODE_PLATFORM||null;
 var done=false;

 function reveal(){
  if(done)return;done=true;
  root.classList.remove('scd-gate');
 }
 function here(){return location.pathname+location.search+location.hash}
 function toLogin(msg){
  if(done)return;done=true;
  if(P&&P.loginUrl){
   location.replace(P.loginUrl+'?next='+encodeURIComponent(here())+(msg?'&msg='+encodeURIComponent(msg):''));
  }else{
   location.replace('./index.html?page=cases');
  }
 }
 function online(){return navigator.onLine!==false}

 /* the application's own session, read the way auth-core.js judges it */
 function localSession(){
  try{
   var s=JSON.parse(localStorage.getItem('imode_v69_session')||'null');
   if(!s||!s.user)return null;
   var u=s.user;
   if(u.accountType==='customer'||/^customer$/i.test(String(u.role||'')))return null;
   var t=Date.now();
   if(s.expiresAt&&t>s.expiresAt){
    if(online())return null;
    if(!s.offlineGraceUntil||t>s.offlineGraceUntil)return null;
   }
   return s;
  }catch(e){return null}
 }
 function fallback(){if(localSession())reveal();else toLogin()}

 function cloud(){
  var E=window.IMODE_ENV;
  if(E&&E.cloud&&E.cloud.url&&E.cloud.key)return E.cloud;
  return null;
 }

 function check(){
  if(!P){fallback();return}
  var c=cloud();
  if(!c||!window.supabase||typeof window.supabase.createClient!=='function'){fallback();return}
  var client;
  try{client=window.supabase.createClient(c.url,c.key,window.IMODE_SB_OPTIONS)}catch(e){fallback();return}
  var timer=setTimeout(fallback,10000);
  client.auth.getSession().then(function(r){
   var sess=r&&r.data&&r.data.session;
   if(!sess){
    clearTimeout(timer);
    if(!online()&&localSession()){reveal();return}
    toLogin();
    return;
   }
   return client.from('profiles').select('role,is_active,customer_id').eq('id',sess.user.id).maybeSingle().then(function(p){
    clearTimeout(timer);
    if(p.error){
     /* a server that cannot answer is not a reason to show the case to anyone */
     fallback();return;
    }
    var prof=p.data;
    if(!prof){toLogin('บัญชีนี้ยังไม่ได้ผูกสิทธิ์ในระบบ ติดต่อผู้ดูแลระบบ');return}
    if(prof.is_active===false){toLogin('บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ');return}
    if(/^customer$/i.test(String(prof.role||''))||prof.customer_id){toLogin('หน้านี้สำหรับพนักงาน I-MODE เท่านั้น');return}
    reveal();
   });
  }).catch(function(){clearTimeout(timer);fallback()});
 }

 check();
})();
