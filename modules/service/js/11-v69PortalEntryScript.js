/* V6.9 portal entry & exit.
   Loaded after the auth scripts so its wrappers sit outermost. Additive only: it wraps
   goPage / renderCustomerPortal / initPortalFromUrl instead of editing them, in the same
   patch-over-patch style as the rest of this file. No storage key, no Supabase setting
   and no existing function body is changed. */
(function(){
 'use strict';

 /* settings and customers are top-level `let` in js/03 and therefore lexical globals that
    never appear on window — the same trap the comment below already records for
    currentUser. Reading them as window.settings / window.customers made cfg() return {}
    on every call, so lineOaUrl() always produced '' and imodeLineAuth.configured() was
    false even with a LIFF ID configured, which would have kept the whole LINE scaffold
    inert the day IT supplied one. Read the bindings themselves. */
 function cfg(){try{return (settings&&settings.lineConfig)||{}}catch(e){return {}}}
 function customerList(){try{return Array.isArray(customers)?customers:[]}catch(e){return []}}
 function isCustomer(){return !!(window.uatAuth&&window.uatAuth.isCustomerSession&&window.uatAuth.isCustomerSession())}
 /* currentUser is a top-level 'let' in the main script, so it is a lexical global and
    never appears on window. Read the binding itself. */
 function sessionUser(){try{return currentUser||null}catch(e){return null}}
 function isStaff(){var u=sessionUser();return !!(u&&u.name&&!isCustomer())}
 function tl(th,en){return typeof window.L==='function'?window.L(th,en):th}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* ---------- 1. sidebar brand block -> Home (staff only) ----------
    The sidebar is never visible to a customer session, but the handler checks the role
    anyway so the block cannot become a way out of the portal. */
 function wireBrandHome(){
  var block=document.querySelector('.sidebar .brand-block');
  if(!block||block.dataset.homeWired)return;
  block.dataset.homeWired='1';
  block.classList.add('brand-home-hit');
  block.setAttribute('role','button');
  block.setAttribute('tabindex','0');
  block.setAttribute('title',tl('กลับหน้าแรก','Back to home'));
  block.setAttribute('aria-label',tl('กลับหน้าแรก','Back to home'));
  function go(){
   if(!isStaff())return;
   if(typeof window.goPage==='function')window.goPage('home');
  }
  block.addEventListener('click',go);
  block.addEventListener('keydown',function(e){
   if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();go()}
  });
 }

 /* ---------- 2. LINE OA exit target ---------- */
 function lineOaUrl(){
  var c=cfg();
  /* 2026-10-09 security: a stored link is opened only if it is http(s)/line (js/03 imodeSafeUrl) */
  var add=String(c.addFriendUrl||'').trim();
  if(add&&typeof window.imodeSafeUrl==='function')add=window.imodeSafeUrl(add);
  else if(add&&!/^https?:\/\//i.test(add))add='';
  if(add)return add;
  var id=String(c.officialAccountId||'').trim();
  if(!id)return'';
  if(id.charAt(0)!=='@')id='@'+id;
  return 'https://line.me/R/ti/p/'+encodeURIComponent(id);
 }
 function inLineClient(){
  try{return typeof liff!=='undefined'&&liff&&typeof liff.isInClient==='function'&&liff.isInClient()}catch(e){return false}
 }
 /* Returns false when there is nowhere to go, so the caller can stay put instead of
    pretending the visitor left. */
 function leaveToLineOA(){
  if(inLineClient()&&typeof liff.closeWindow==='function'){
   try{liff.closeWindow();return true}catch(e){}
  }
  var url=lineOaUrl();
  if(!url)return false;
  if(typeof window.openPortalLineOfficial==='function'){window.openPortalLineOfficial();return true}
  location.href=url;
  return true;
 }

 /* ---------- 3. portal close button ---------- */
 function decorateClose(){
  var b=document.querySelector('#page-customer-portal .portal-close');
  if(!b)return;
  if(!isCustomer())return;                    /* staff preview keeps the original close */
  b.textContent='×';
  b.title=tl('ออกจาก Customer Portal','Leave the customer portal');
  b.setAttribute('aria-label',tl('ออกจาก Customer Portal','Leave the customer portal'));
  b.setAttribute('onclick','imodePortalExitPrompt()');
 }
 var baseRenderPortal=window.renderCustomerPortal;
 if(typeof baseRenderPortal==='function'){
  window.renderCustomerPortal=function(){
   var r=baseRenderPortal.apply(this,arguments);
   decorateClose();
   return r;
  };
 }

 function closePrompt(){
  var el=document.getElementById('portalExitPrompt');
  if(el&&el.parentNode)el.parentNode.removeChild(el);
 }
 window.imodePortalExitClose=closePrompt;

 /* Keep the session: nothing to clear, just leave for the LINE OA. */
 window.imodePortalExitKeep=function(){
  closePrompt();
  if(leaveToLineOA())return;
  toast(tl('ยังไม่ได้ตั้งค่า LINE OA ในระบบ','LINE OA is not configured yet'));
 };
 /* Do not keep the session: sign out, then land on the Customer Home page. */
 window.imodePortalExitForget=function(){
  closePrompt();
  var token=window.portalExitKeepToken||'';
  function afterOut(){
   try{portalMachineToken=token}catch(e){}
   if(typeof window.goPage==='function')window.goPage('customer-home');
  }
  if(typeof window.imodeSignOut==='function'){
   try{window.imodeSignOut().then(afterOut,afterOut);return}catch(e){}
  }
  if(window.uatAuth&&typeof window.uatAuth.logout==='function')window.uatAuth.logout(true);
  afterOut();
 };

 window.imodePortalExitPrompt=function(){
  if(!isCustomer()){
   if(typeof window.exitCustomerPortal==='function')window.exitCustomerPortal();
   return;
  }
  try{window.portalExitKeepToken=portalMachineToken}catch(e){window.portalExitKeepToken=''}
  closePrompt();
  var name=(sessionUser()&&sessionUser().name)||'';
  var wrap=document.createElement('div');
  wrap.id='portalExitPrompt';
  wrap.className='portal-exit-backdrop';
  wrap.innerHTML=''
   +'<div class="portal-exit-card" role="dialog" aria-modal="true" aria-labelledby="portalExitTitle">'
   +'<h3 id="portalExitTitle">'+esc2(tl('ออกจากหน้า Service ของคุณ','Leave your service page'))+'</h3>'
   +'<p>'+esc2(tl('ต้องการให้จำการเข้าสู่ระบบไว้ในเครื่องนี้ไหม','Do you want this device to remember your sign-in?'))+'</p>'
   +(name?'<div class="portal-exit-who">'+esc2(name)+'</div>':'')
   +'<button type="button" class="portal-exit-keep" onclick="imodePortalExitKeep()">'
   +esc2(tl('จำไว้ในเครื่องนี้ · กลับ LINE OA','Remember me · back to LINE OA'))+'</button>'
   +'<button type="button" class="portal-exit-forget" onclick="imodePortalExitForget()">'
   +esc2(tl('ไม่ต้องจำ · ออกจากระบบ','Do not remember · sign out'))+'</button>'
   +'<button type="button" class="portal-exit-cancel" onclick="imodePortalExitClose()">'
   +esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'</div>';
  wrap.addEventListener('click',function(e){if(e.target===wrap)closePrompt()});
  document.body.appendChild(wrap);
  var first=wrap.querySelector('.portal-exit-keep');
  if(first)first.focus();
 };

 /* ---------- 4. LINE Login scaffold ----------
    There is no LINE Login channel configured in this project yet, so nothing here is
    switched on: every entry point checks settings.lineConfig.liffId first and falls back
    to the existing username / password flow. When IT supplies a LIFF ID, a LINE profile
    is matched to a customer through the customer record's existing lineUserId field --
    the same field the portal already writes when a request is submitted. */
 window.imodeLineAuth={
  configured:function(){return !!String(cfg().liffId||'').trim()},
  officialUrl:lineOaUrl,
  customerForLineUser:function(uid){
   var list=customerList();
   if(!uid||!list.length)return null;
   return list.filter(function(c){return c.lineUserId&&c.lineUserId===uid})[0]||null;
  },
  profile:function(){
   if(!this.configured())return Promise.resolve(null);
   try{
    if(typeof liff==='undefined'||!liff||typeof liff.isLoggedIn!=='function')return Promise.resolve(null);
    if(!liff.isLoggedIn())return Promise.resolve(null);
    return liff.getProfile().then(function(p){return p||null},function(){return null});
   }catch(e){return Promise.resolve(null)}
  },
  /* Resolves to true only when a LINE profile mapped to a real customer record signed in. */
  autoLogin:function(){
   var self=this;
   if(!self.configured())return Promise.resolve(false);
   return self.profile().then(function(p){
    if(!p||!p.userId)return false;
    var cu=self.customerForLineUser(p.userId);
    if(!cu)return false;
    var acc=window.uatAuth&&typeof window.uatAuth.allAccounts==='function'
     ?window.uatAuth.allAccounts().filter(function(a){return a.customerId===cu.id})[0]:null;
    if(!acc||!window.uatAuth.accountToUser||!window.uatAuth.setSessionUser)return false;
    window.uatAuth.setSessionUser(window.uatAuth.accountToUser(acc));
    window.uatAuth.enterCustomerPortal();
    return true;
   },function(){return false});
  },
  /* The Continue-with-LINE button. Without a LIFF ID it can only open the OA. */
  signIn:function(){
   var self=this;
   if(!self.configured()){
    if(!leaveToLineOA())toast(tl('ยังไม่ได้ตั้งค่า LINE Login (LIFF ID)','LINE Login is not configured yet (LIFF ID)'));
    return Promise.resolve(false);
   }
   return self.autoLogin().then(function(ok){
    if(ok)return true;
    try{if(typeof liff!=='undefined'&&liff&&typeof liff.isLoggedIn==='function'&&!liff.isLoggedIn()){liff.login();return false}}catch(e){}
    toast(tl('บัญชี LINE นี้ยังไม่ได้ผูกกับลูกค้าในระบบ กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้','This LINE account is not linked to a customer yet. Please sign in with a username.'));
    return false;
   });
  }
 };

 /* ---------- 5. QR entry: no dashboard flash, LINE auto-login when configured ---------- */
 var basePortalInit=window.initPortalFromUrl;
 window.initPortalFromUrl=async function(){
  try{
   var token=new URLSearchParams(location.search).get('machineToken');
   if(token&&!isCustomer()&&window.imodeLineAuth.configured()){
    var ok=false;
    try{portalMachineToken=token}catch(e){}
    try{ok=await window.imodeLineAuth.autoLogin()}catch(e){ok=false}
    if(ok)return;
   }
   return await basePortalInit.apply(this,arguments);
  }finally{
   if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease();
  }
 };
 /* Every URL that belongs to a customer, not just ?machineToken=. js/21 added
    #/customer-entry and ?serial= for the LINE rich menu, and those visitors have the same
    right not to see the internal dashboard on the way in. */
 function customerRoute(){
  try{
   var p=new URLSearchParams(location.search);
   if(p.get('machineToken'))return true;
   if(p.get('serial'))return true;
   var page=p.get('page');
   if(page==='customer-entry'||page==='scan'||page==='customer-portal'||page==='customer-home')return true;
   return /#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash)
       || /customer-portal/.test(location.hash);
  }catch(e){return false}
 }
 window.imodeIsCustomerRoute=customerRoute;

 /* THE 3-5 SECOND DASHBOARD FLASH.

    Boot is  load -> renderAll() -> await initCloud() -> initPortalFromUrl().  js/03
    registers that listener while it is being parsed, so it runs before this one; it is
    async, so it yields at the await and this listener runs *during* the cloud round-trip.
    Releasing the boot guard here therefore uncovered the internal dashboard and left it
    on screen for as long as Supabase took to answer — the reported 3-5 seconds — until
    initPortalFromUrl() finally swapped in the customer page.

    A customer route now keeps the splash until the wrapper above releases it in its
    finally block, which is after initPortalFromUrl() has decided where they belong. The
    12-second safety timeout in js/01 still applies, so nobody can be stranded on it. */
 window.addEventListener('load',function(){
  if(customerRoute())return;
  setTimeout(function(){if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease()},0);
 });

 /* ---------- styles ---------- */
 var style=document.createElement('style');
 style.id='v69PortalEntryStyle';
 style.textContent=''
 +'.brand-home-hit{cursor:pointer;border-radius:18px;transition:background .18s ease,transform .18s ease}'
 +'.brand-home-hit:hover{background:rgba(255,255,255,.10)}'
 +'.brand-home-hit:active{transform:translateY(1px)}'
 +'.brand-home-hit:focus-visible{outline:2px solid #ffb066;outline-offset:2px}'
 +'.portal-exit-backdrop{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,26,60,.52)}'
 +'.portal-exit-card{width:100%;max-width:340px;background:#fff;border-radius:18px;padding:20px 18px 16px;box-shadow:0 24px 56px rgba(8,26,60,.28);text-align:center}'
 +'.portal-exit-card h3{margin:0 0 6px;font-size:17px;color:#0c225e}'
 +'.portal-exit-card p{margin:0 0 12px;font-size:12.5px;color:#5b6b88;line-height:1.5}'
 +'.portal-exit-who{margin:0 0 12px;font-size:12px;font-weight:700;color:#0b63e5}'
 +'.portal-exit-card button{display:block;width:100%;margin-top:8px;border-radius:11px;padding:11px;font-size:13px;font-weight:700;cursor:pointer}'
 +'.portal-exit-keep{border:none;color:#fff;background:linear-gradient(180deg,#3fce5a,#18b13a)}'
 +'.portal-exit-forget{border:1px solid #d3e0f4;color:#123a80;background:#fff}'
 +'.portal-exit-cancel{border:none;background:none;color:#5b6b88;font-weight:600!important}'
 +'.portal-exit-card button:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
 document.head.appendChild(style);

 /* ---------- 6. front door ----------
    Opening the app with no session must land on the staff login page, not the Dashboard.
    A machine QR is the exception: that visitor is a customer and is handled by the portal
    entry above. This runs at DOMContentLoaded, before initCloud, so nothing else paints
    first. Signing out returns to the same door. */
 function bootRoute(){
  try{
   /* Any customer URL is exempt, not only ?machineToken=: js/21 routes #/customer-entry
      and ?serial= a moment later, and sending that visitor to the staff door first only
      made the page change twice. */
   if(customerRoute())return false;
   if(sessionUser())return false;
   if(typeof window.goPage!=='function')return false;
   window.goPage('staff-login');
   return true;
  }catch(e){return false}
 }
 var baseSignOut=window.imodeSignOut;
 if(typeof baseSignOut==='function'){
  window.imodeSignOut=function(){
   return baseSignOut.apply(this,arguments).then(function(r){
    if(typeof window.goPage==='function')window.goPage('staff-login');
    return r;
   });
  };
 }

 function install(){
  wireBrandHome();
  decorateClose();
  bootRoute();
  /* Same rule as the load listener: a customer route keeps the splash until the portal
     entry has run. Anyone else has already been routed by bootRoute() above, so the shell
     underneath is the right one to show. */
  if(typeof window.imodeQrBootRelease==='function'&&!customerRoute()){
   window.imodeQrBootRelease();
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
