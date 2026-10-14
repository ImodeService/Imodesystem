/* Beta 1.0 — a LIFF ID must not turn the whole application into a LINE-only site.

   MEASURED, not guessed, while answering "LIFF ID เอามาจากไหน" (2026-09-18). js/03:949-950:

     async function initPortalFromUrl(){ if(settings.lineConfig?.liffId) await initLiffPortal(); … }
     async function initLiffPortal(){
       …
       await liff.init({liffId:cfg.liffId});
       if(!liff.isLoggedIn() && !liff.isInClient()){ liff.login(); return }   // <-- a REDIRECT
       …
     }

   initPortalFromUrl() runs on EVERY page load, not only on a customer route, and the LIFF
   SDK is loaded by index.html on every page too. So the moment a LIFF ID is saved in
   ตั้งค่าระบบ → LINE OA, every visitor who is not already signed in to LINE is sent to
   LINE's login page before they can reach anything — including an admin opening the system
   on a desktop, and including a customer who scanned a printed QR with their phone camera
   rather than inside the LINE app. The second one would also undo the decision from part 11
   that the customer page needs no login at all.

   Nothing else in the project calls liff.login(); every other use (isInClient, openWindow,
   scanCodeV2, closeWindow) is already guarded and unaffected.

   WHAT THIS FILE DOES — two rules, and nothing else:

     1. initLiffPortal() runs only on a customer route (or inside the LINE app, or when LINE
        itself sent the visitor here). On any other page load it is skipped entirely, so the
        LIFF SDK is never initialised and no redirect can happen.
     2. On a customer route reached from an ORDINARY browser, it still runs — the profile is
        used when the visitor happens to be signed in to LINE — but liff.login is stood down
        for the duration of the call, so it reads what is there and never navigates away.
        Inside LINE, where a login costs the visitor nothing and the profile is the point, it
        is left exactly as it was.

   js/03 is not edited. initLiffPortal is a top-level `async function`, so it IS a window
   property, and initPortalFromUrl calls it by bare identifier — replacing the property is
   what that identifier then resolves to (part 18). The wrapper returns a promise because the
   caller awaits it.

   Remove this file and the old behaviour comes back exactly. */
(function(){
 'use strict';

 /* The same URL test js/01 and js/46 use, kept in step with them deliberately: if one of
    these ever grows a new customer route, all three have to learn it. */
 function customerRoute(){
  try{
   return /[?&]machineToken=/.test(location.search)
       || /[?&]serial=/.test(location.search)
       || /[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search)
       || /#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash)
       || /customer-portal/.test(location.hash);
  }catch(e){return false}
 }

 /* LINE's own in-app browser. The user agent is the only test available BEFORE liff.init(),
    which is exactly when the decision has to be made — liff.isInClient() is documented as
    valid only after init, and init is the thing being decided about. */
 function inLineApp(){
  try{return / Line\//i.test(navigator.userAgent||'')||/\bLine\/\d/i.test(navigator.userAgent||'')}
  catch(e){return false}
 }

 /* A visitor LINE itself redirected here: opening https://liff.line.me/<id>/?x=y lands on the
    endpoint URL carrying liff.state (the original query, encoded) or liff.referrer. Only
    liff.init() can unpack that, so this counts as a LINE route whatever else the URL says. */
 function fromLiff(){
  try{return /[?&]liff\.(state|referrer)=/.test(location.search)}catch(e){return false}
 }

 function shouldInit(){return customerRoute()||inLineApp()||fromLiff()}
 window.imodeLiffShouldInit=shouldInit;

 var base=window.initLiffPortal;
 if(typeof base!=='function')return;

 /* liff.init() is answered once per page view. Without this the call added below would
    initialise a second time on the routes where the base chain reaches it too. */
 var pending=null;

 window.initLiffPortal=function(){
  if(pending)return pending;
  pending=run.apply(this,arguments);
  return pending;
 };

 function run(){
  if(!shouldInit())return Promise.resolve();

  /* Inside LINE (or sent here by LINE) a login is the normal flow and costs nothing. */
  if(inLineApp()||fromLiff())return base.apply(this,arguments);

  /* A customer route in an ordinary browser: read the profile if LINE already knows them,
     but never navigate away from the machine they just scanned. liff.login is put back in a
     finally; JavaScript is single threaded and nothing else in this project calls it, so the
     substitution cannot be seen by anything else even across the await inside the base. */
  var self=this,args=arguments,lf=null,saved=null,swapped=false;
  try{
   lf=(typeof liff!=='undefined')?liff:null;
   if(lf&&typeof lf.login==='function'){
    saved=lf.login;
    lf.login=function(){};
    swapped=true;
   }
  }catch(e){}
  var restore=function(){if(swapped){try{lf.login=saved}catch(e){}swapped=false}};
  var r;
  try{r=base.apply(self,args)}
  catch(e){restore();return Promise.resolve()}
  if(r&&typeof r.then==='function')return r.then(function(v){restore();return v},
                                                 function(){restore()});
  restore();
  return Promise.resolve(r);
 }

 /* AND THE OTHER HALF, found by the suite: js/14's initPortalFromUrl wrapper answers a
    ?machineToken= URL itself and returns WITHOUT calling the base — so on the one route LINE
    actually uses, js/03's `if(liffId) await initLiffPortal()` was never reached and a
    configured LIFF would have stayed dead: no liff.init, so no profile, no lineUserId match,
    and liff.closeWindow() with nothing initialised. Pre-existing; it only ever mattered once
    a LIFF ID existed. Done here, outermost, rather than by editing js/14 — and it is safe
    precisely because the call above is now scoped and cannot redirect anybody. */
 var basePortalInit=window.initPortalFromUrl;
 if(typeof basePortalInit==='function'){
  window.initPortalFromUrl=async function(){
   try{await window.initLiffPortal()}catch(e){}
   return basePortalInit.apply(this,arguments);
  };
 }
})();
