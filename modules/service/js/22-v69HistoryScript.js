/* V6.9 — the Android back button.

   This application has never had any routing: goPage() only toggles `.page.active`, and
   nothing ever touched history. On a phone that means the hardware / gesture Back button
   does the only thing left to it — leave the site. A customer who opens แจ้งปัญหาเครื่อง
   and presses Back loses the page instead of returning to their Home page; a technician
   who opens a module from the Home board and presses Back leaves the app.

   What this adds is the smallest thing that fixes it: one history entry per screen.

     - Every goPage() that actually changes the visible page pushes an entry.
     - Entering a detail view inside the customer Home page (แจ้งปัญหา, เช็คประกัน, …)
       pushes one too — those do not go through goPage(), they swap #portalContent and add
       .imode-portal-detail-mode to the shell, so the shell's class is what is watched.
     - popstate puts the page (or the detail view) back.

   Deliberately NOT a router: the URL never changes. Pushing a path would 404 on a GitHub
   Pages refresh and would need a rewrite rule; pushing a hash would fight
   initPortalFromUrl(), which reads #/customer-portal. Every entry carries the same URL and
   a state object, which is all the Back button needs.

   Loads last so its goPage wrapper is the outermost one and sees the page that actually
   became active — several earlier wrappers redirect (customer-home → customer-portal,
   dashboard → the first page a role may open), so the requested name is not always the
   name that ends up on screen. */
(function(){
 'use strict';
 if(!window.history||typeof history.pushState!=='function')return;

 var restoring=false;   /* true while a popstate is being applied — never push then */
 var booting=true;      /* boot navigations replace instead of push, see below */
 var lastPage='';
 var lastDetail=false;

 function activePage(){
  var p=document.querySelector('.page.active');
  return p?String(p.id||'').replace(/^page-/,''):'';
 }
 function inDetail(){
  var s=document.querySelector('#page-customer-portal .portal-shell');
  return !!(s&&s.classList.contains('imode-portal-detail-mode'));
 }
 function snapshot(){return {imodePage:activePage(),imodeDetail:inDetail()}}
 function sync(){lastPage=activePage();lastDetail=inDetail()}

 /* 2026-09-17 — "เวลากดออกจากทุกโมดูล ช่างจะกลับมาที่หน้า Home page". For a TECHNICIAN
    (an account linked to a technician record) the Home board is the hub: Back from any module
    returns to it, not to the module visited before. A popup still closes first and a nested
    popup still steps down a level — js/29 owns those entries and they sit above this one.
    Done by shape, not by intercepting Back: moving module → module REPLACES the entry instead
    of pushing one, so the history under a module is always [..., home, module]. Admin and
    other staff keep the ordinary one-entry-per-screen history. */
 var NOT_MODULE={'home':1,'staff-login':1,'customer-home':1,'customer-login':1,'customer-portal':1,'customer-entry':1};
 function techHub(){
  try{return !!(currentUser&&currentUser.technicianId)}catch(e){return false}
 }
 function isModule(p){return !!p&&!NOT_MODULE[p]}
 /* A popup entry whose popup has already been closed (a button that closed it and navigated)
    is spent, and is replaced like any other module entry. */
 function modalOpen(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('open'))}
 function record(){
  /* During boot the app routes itself several times — the QR guard, bootRoute() sending a
     visitor with no session to the staff door, initPortalFromUrl() opening a scanned
     machine. Pushing those would leave dead Back presses that appear to do nothing, so
     until the page has settled every navigation replaces the single initial entry. */
  try{
   if(booting)history.replaceState(snapshot(),'',location.href);
   else if(techHub()&&isModule(lastPage)&&isModule(activePage())&&!(history.state&&history.state.imodeModal&&modalOpen()))
    history.replaceState(snapshot(),'',location.href);
   else history.pushState(snapshot(),'',location.href);
  }catch(e){}
  sync();
 }

 /* ---------- 1. page navigation ---------- */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   if(!restoring){
    if(activePage()!==lastPage)record();
    else sync();
   }
   return r;
  };
 }

 /* ---------- 2. detail views inside the customer Home page ----------
    setPortalMode() in js/08 is not exported, and the seven actions are already wrapped
    there, so the shell's class is watched instead: it is the one thing every path through
    a detail view has in common, including any added later. */
 /* js/08 defines window.imodePortalBackHome inside its own DOMContentLoaded install(), so
    it does not exist yet while this file is being parsed. Captured in start() instead,
    which runs after js/08's listener because js/08 registered its one first. */
 var basePortalBack=null;
 function watchPortalShell(){
  var shell=document.querySelector('#page-customer-portal .portal-shell');
  if(!shell||shell.__imodeHistoryWatched)return;
  shell.__imodeHistoryWatched=true;
  try{
   new MutationObserver(function(){
    if(restoring)return;
    var d=inDetail();
    if(d===lastDetail)return;
    if(d)record();      /* opened a detail view */
    else sync();        /* left it — the pop below already moved the history */
   }).observe(shell,{attributes:true,attributeFilter:['class']});
  }catch(e){}
 }

 /* The portal's own ← button should consume a history entry rather than leave a stale one
    behind, so it asks the browser to go back and lets popstate do the work. */
 function wrapPortalBack(){
  if(basePortalBack||typeof window.imodePortalBackHome!=='function')return;
  basePortalBack=window.imodePortalBackHome;
  window.imodePortalBackHome=function(){
   if(!restoring&&!booting&&lastDetail){history.back();return}
   return basePortalBack.apply(this,arguments);
  };
 }

 /* ---------- 3. going back ---------- */
 window.addEventListener('popstate',function(ev){
  var st=(ev&&ev.state)||{};
  var wantPage=st.imodePage||'';
  var wantDetail=!!st.imodeDetail;
  restoring=true;
  try{
   /* Leave a detail view first: it is drawn inside the page, not instead of it. */
   wrapPortalBack();
   if(inDetail()&&!wantDetail&&typeof basePortalBack==='function')basePortalBack.call(window);
   /* A spent popup entry can leave an older module under the current one (a button inside a
      popup that navigated). For a technician, module → module on Back still means Home. */
   if(techHub()&&isModule(wantPage)&&isModule(activePage())&&wantPage!==activePage())wantPage='home';
   if(wantPage&&wantPage!==activePage()&&typeof baseGoPage==='function')baseGoPage.call(window,wantPage);
   /* Going forward into a detail view is not restored: its content came from a function
      call and a half-filled form cannot be rebuilt. The visitor lands on the Home page,
      which is where the buttons are. */
  }catch(e){}
  restoring=false;
  sync();
 });

 /* ---------- 4. start ---------- */
 function settle(){
  watchPortalShell();
  wrapPortalBack();
  booting=false;
  sync();
  try{history.replaceState(snapshot(),'',location.href)}catch(e){}
  /* A signed-in technician who reloads lands on the Dashboard — the page index.html marks
     active by default. The hub is Home, whether or not the role may also open the Dashboard
     (on the live project Technician holds dashboard.view, which is why a permission test here
     did nothing there). The Dashboard stays one tap away on the Home profile card. */
  techToHome();          /* again, in case something routed to the Dashboard during load */
  /* A technician who arrives straight in a module (a reload, or coming back from the case
     page) has no Home entry underneath; put one there so Back still reaches the hub. */
  try{
   if(techHub()&&isModule(activePage())){
    var here=snapshot();
    history.replaceState({imodePage:'home',imodeDetail:false},'',location.href);
    history.pushState(here,'',location.href);
   }
  }catch(e){}
 }
 /* Done in start() — a DOMContentLoaded listener, the same dispatch in which js/11 releases
    the boot splash — so no frame is painted with the Dashboard. Doing it only in settle(),
    half a second after load, showed the Dashboard for that half second. */
 function techToHome(){
  try{
   if(techHub()&&activePage()==='dashboard'&&typeof baseGoPage==='function'){
    baseGoPage.call(window,'home');
    sync();
    history.replaceState(snapshot(),'',location.href);
   }
  }catch(e){}
 }
 function start(){
  watchPortalShell();
  wrapPortalBack();
  techToHome();
  sync();
  try{history.replaceState(snapshot(),'',location.href)}catch(e){}
  /* initPortalFromUrl() is awaited inside the window load handler, so the page is only
     really settled a moment after it. 500 ms is long enough for that and short enough that
     a person cannot navigate first; being wrong costs one redundant Back press, nothing
     more. */
  if(document.readyState==='complete')setTimeout(settle,500);
  else window.addEventListener('load',function(){setTimeout(settle,500)},{once:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
