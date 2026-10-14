/* V7.0 — the test site holds no demo data (owner, 2026-09-28).
   IMODE_NO_DEMO turns off every demo seed js/03, js/04 and js/25 used to run on an empty
   device; production already skipped them. The test database was emptied by hand, so the
   copies each browser still keeps are wiped ONCE per device (marker below) before js/03
   reads them — otherwise js/41, js/71 and js/110 would upload them straight back.
   Only business-data caches go; session, settings, accounts, cloud config and technicians
   stay. Never runs in production. Bump RESET to wipe again. */
(function(){
 if(window.IMODE_ENV&&window.IMODE_ENV.production){
  /* 2026-10-01: the production build can be served from imodeservice.github.io, the SAME
     origin as the test site, and localStorage is per origin. A device that ever opened the
     test site still holds its test cases / customers; with the real database empty of cases,
     syncCloud() keeps a local array when the cloud returns no rows, and js/71 / js/110 then
     read those rows as unsent work and upload them into the REAL database. So the business
     caches are dropped ONCE per device before js/03 reads them. The real data comes back
     down from the server on the first sync; nothing is lost that the server does not hold.
     Session and cloud config stay (a signed-in person is not signed out). Bump PROD_RESET to
     wipe again. */
  /* 2026-10-01: ONE hostname serves both audiences (GitHub Pages), so "is this the customer
     page" cannot be answered by the hostname. IMODE_ENV.customerByUrl turns the customer
     mode on when the link that opened this tab is a customer link, and remembers it for the
     tab (sessionStorage), because js/28 spends ?machineToken= / ?serial= off the address bar
     and a reload would otherwise land on the staff door. ?staff=1 leaves the mode. When a
     customer hostname exists (customerHost) the old rule still applies and this is unused.
     js/124 and js/125 read window.imodeCustomerMode; nothing else decides it. */
  (function(){
   var E=window.IMODE_ENV,KEY='imode_v70_customer_tab',on=false;
   try{
    var ch=String(E.customerHost||'').toLowerCase(),host=String(location.hostname||'').toLowerCase();
    if(ch&&host===ch)on=true;
    else if(E.customerByUrl){
     var q=location.search,hs=location.hash;
     if(/[?&]staff=1\b/.test(q))sessionStorage.removeItem(KEY);
     else{
      var cu=/[?&]machineToken=/.test(q)||/[?&]serial=/.test(q)||/[?&]page=customer-(entry|portal|home)\b/.test(q)
          ||/#\/customer-(portal|home|entry)/.test(hs);
      if(cu)sessionStorage.setItem(KEY,'1');
      on=!!sessionStorage.getItem(KEY);
     }
    }
   }catch(e){}
   window.imodeCustomerMode=on;
  })();
  var PROD_RESET='2026-10-01', PROD_MARK='imode_v70_prod_reset';
  try{
   if(localStorage.getItem(PROD_MARK)!==PROD_RESET){
    ['imode_test_v532_cases','imode_test_v532_customers','imode_test_v532_machines',
     'imode_test_v532_notifications','imode_test_v532_quotes','imode_test_v532_warranties',
     'imode_test_v532_machine_documents','imode_test_v532_line_requests',
     'imode_test_v532_service_reports','imode_v66_qc_records','imode_v67_petty_cash',
     'imode_v67_spare_parts','imode_v67_purchase_orders','imode_v70_cloud_seen',
     'imode_v70_pending_push','imode_v70_customer_contacts','imode_v70_storage_shed',
     'imode_v5_settings','imode_v5_tech'
    ].forEach(function(k){localStorage.removeItem(k)});
    localStorage.setItem(PROD_MARK,PROD_RESET);
   }
  }catch(e){}
  return;
 }
 window.IMODE_NO_DEMO=true;
 var RESET='2026-09-28', MARK='imode_v70_test_reset';
 try{
  if(localStorage.getItem(MARK)===RESET)return;
  ['imode_test_v532_cases','imode_test_v532_customers','imode_test_v532_machines',
   'imode_test_v532_notifications','imode_test_v532_quotes','imode_test_v532_warranties',
   'imode_test_v532_machine_documents','imode_test_v532_line_requests',
   'imode_test_v532_service_reports','imode_v66_qc_records','imode_v67_petty_cash',
   'imode_v67_spare_parts','imode_v67_purchase_orders','imode_v70_cloud_seen',
   'imode_v70_pending_push','imode_v70_customer_contacts','imode_v70_storage_shed'
  ].forEach(function(k){localStorage.removeItem(k)});
  localStorage.setItem(MARK,RESET);
 }catch(e){}
})();

/* V6.9 — snapshot the saved settings before anything can rewrite them.

   mergeSettings() in js/03 runs normalizeRoleSetting() -> migrateLegacyPermissions(),
   which drops every saved permission key that is not yet in PERMISSION_CATALOG. js/12 and
   js/16 register four keys (onsite.view, parts.view, pettycash.view, mywork.view) and
   both run *after* js/03, so those four are stripped from every role on every load. Any
   saveLocal() that happens before the repair in js/20 then writes the stripped set back
   and the permission is gone for good.

   This file is the first script in the document, so the copy taken here is the last one
   the admin actually saved. js/20 repairs from it. One line of storage, no writes.
   See js/20-v69PermissionEditorScript.js for the repair itself. */
(function(){
 try{window.imodeSettingsSnapshot=JSON.parse(localStorage.getItem('imode_v5_settings')||'{}')}
 catch(e){window.imodeSettingsSnapshot=null}
})();

/* V6.9 QR boot guard.
   window load -> renderAll() -> await initCloud() -> initPortalFromUrl(), so a phone that
   scans a machine QR used to see the internal dashboard for the whole cloud round-trip.
   This runs before the shell is painted and hides it until the portal entry has decided
   where the visitor belongs. window.imodeQrBootRelease() clears it. */
(function(){
 try{
  /* Every customer entry URL, not only the machine QR. js/21 added #/customer-entry and
     ?serial= for the LINE rich menu; a device where staff had signed in once would
     otherwise skip the splash on those and show the dashboard while the cloud syncs. */
  var qr=/[?&]machineToken=/.test(location.search)
      || /[?&]serial=/.test(location.search)
      || /[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search)
      || /#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash)
      || /customer-portal/.test(location.hash);
  /* Hide the shell for every visitor who is not already on a customer route.
     Until js/46 there was an exemption here for a device that still held a session, because
     that device went straight to the dashboard and had nothing to wait for. A password is
     now required on every load, so that device goes to the staff login door like any other
     and must not see the dashboard on the way. js/11's install() releases the splash in the
     same DOMContentLoaded dispatch that routes, so nothing is painted in between.
     The customer/staff distinction still has to be made, but it is made where the release
     happens — js/11 for staff, the portal entry for a QR — not here. `qr` is left computed
     above so the two tests stay side by side and cannot drift apart. */
  void qr;
  /* 2026-09-18: the same test, exported, because the answer is needed after boot too —
     "หน้าของลูกค้าอะมันมักจะมีแจ้งเตือนของแอดมินโผล่มา". Anything that speaks to staff on its own
     (js/85's realtime notices, js/24's cloud warning) asks this before it opens its mouth.
     The URL is only half of it: a customer reaches the portal from the entry page without the
     URL changing, so the surface on screen counts as well. This is the fourth copy of the URL
     test (js/01, js/46, js/84 and now its exported form) and they are kept in step by hand —
     if one grows a new customer route, all of them have to learn it. */
  window.imodeCustomerSurface=function(){
   try{
    if(/[?&]machineToken=/.test(location.search))return true;
    if(/[?&]serial=/.test(location.search))return true;
    if(/[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search))return true;
    if(/#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash))return true;
    if(/customer-portal/.test(location.hash))return true;
    var b=document.body;
    if(b&&b.classList&&b.classList.contains('customer-portal-mode'))return true;
    var active=(document.querySelector('.page.active')||{}).id||'';
    return active==='page-customer-portal'||active==='page-customer-entry'
        || active==='page-customer-home'||active==='page-scan';
   }catch(e){return false}
  };
  /* ------------------------------------------- A WARM TAB GETS NO LOADING SCREEN -------
     2026-09-25, reported as "มันยังขึ้นอยู่อะ" after the first attempt only shortened the wait:
     js/117 stopped the tab's SECOND load from waiting for the sync, but this file still
     painted the splash and js/11 still took it off at DOMContentLoaded, so switching between
     the app and service-case-detail.html - a separate document, so a full page load each way -
     still put a loading screen on screen for about 2 seconds every time.
     On a tab that has already completed one boot there is nothing to cover: the markup, the
     stylesheets and every js/NN file are in the HTTP and service-worker caches, the session is
     known and the data is in localStorage. So the guard does not run at all and the app simply
     appears.
     `qr` is the exception and this is what it was computed for. A customer route still has to
     be covered even on a warm tab, because initPortalFromUrl() decides where that visitor
     belongs asynchronously and the dashboard would show through in the meantime. */
  var warmTab=false;
  try{warmTab=sessionStorage.getItem('imode_v70_tab_booted')==='1'}catch(e){}
  if(warmTab&&!qr){
   /* js/11, js/14 and js/21 all call this by name; give them something harmless. */
   window.imodeQrBootRelease=function(){};
   return;
  }

  var st=document.createElement('style');
  st.id='v69QrBootGuardStyle';
  /* 2026-09-25: the spinner became a ring of module circles orbiting the logo, asked for as
     "เอาหน้าโหลดแบบ มี animation โมดุลเป็นวงกลมหมุนไปรอบๆ".
     Three nested elements per circle, and each level exists for a reason:
       .qbo-slot   static rotate(a) translateY(-R)  - puts the point on the ring
       .qbo-cancel static rotate(-a)                - undoes the slot's own rotation
       .qbo-face   animated rotate(0 -> -360deg)    - undoes the RING's rotation
     so the icon rides the circle and still reads upright. Both keyframe sets declare an
     explicit from AND to: with a `to`-only rule the implicit start has a different transform
     function list, the browser falls back to matrix interpolation, and a matrix for
     rotate(360deg) is the identity - the thing would sit perfectly still. */
  st.textContent='html.qr-booting .app-shell{visibility:hidden!important}'
   +'.qr-boot-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#2d3695}'
   +'.qr-boot-splash>.qr-boot-name{color:rgba(255,255,255,.92);font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.02em}'
   +'.qr-boot-orbit{position:relative;width:340px;height:340px;flex:none}'
   +'.qbo-ring{position:absolute;inset:0;animation:qboSpin 9s linear infinite}'
   +'.qbo-slot{position:absolute;top:50%;left:50%;width:0;height:0}'
   +'.qbo-pull{position:absolute;display:block;translate:0 calc(var(--ro) * -1);'
   +'animation:qboPull var(--d) ease-in-out var(--dl) infinite alternate}'
   +'.qbo-cancel{position:absolute;display:block;animation:qboShrink var(--d) ease-in-out var(--dl) infinite alternate}'
   +'.qbo-face{position:absolute;width:42px;height:42px;margin:0;border-radius:50%;display:flex;'
   +'align-items:center;justify-content:center;font-size:19px;line-height:1;'
   +'background:rgba(255,255,255,.17);border:1px solid rgba(255,255,255,.36);'
   +'box-shadow:0 6px 16px rgba(3,24,66,.26);transform:translate(-50%,-50%);'
   +'animation:qboBack 9s linear infinite}'
   +'.qbo-core{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}'
   +'.qbo-core img{width:118px;max-width:40vw;height:auto;display:block}'
   +'@keyframes qboSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
   +'@keyframes qboBack{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(-360deg)}}'
   +'@keyframes qboPull{from{translate:0 calc(var(--ro) * -1)}to{translate:0 calc(var(--ri) * -1)}}'
   +'@keyframes qboShrink{from{scale:1;opacity:1}to{scale:.5;opacity:.35}}'
   +'@keyframes qboFade{0%,100%{opacity:.62}50%{opacity:1}}'
   +'@media (max-width:420px){.qr-boot-orbit{transform:scale(.8)}}'
   /* Reduced motion: nothing travels. The ring keeps its place and breathes instead, and the
      faces drop their counter-rotation so they stay upright without it. */
   +'@media (prefers-reduced-motion:reduce){.qbo-ring{animation:qboFade 2.6s ease-in-out infinite}.qbo-face,.qbo-pull,.qbo-cancel{animation:none}}';
  (document.head||document.documentElement).appendChild(st);
  document.documentElement.classList.add('qr-booting');
  var released=false;
  function paintSplash(){
   if(document.getElementById('qrBootSplash')||!document.body)return;
   var d=document.createElement('div');
   d.className='qr-boot-splash';
   d.id='qrBootSplash';
   /* The eight the sidebar leads with. Emoji rather than the module table, because that table
      is defined in js/06 and this file is the first script in the document. */
   var MODS=['\ud83d\udccb','\ud83e\uddf0','\ud83d\udcc5','\ud83c\udfed','\u2705','\ud83d\udcb0','\ud83d\udce6','\ud83d\udd14'];
   /* 2026-09-25, "ลากเข้าลากออกจาก Imode แบบสุ่ม เอารัศมีกว้างๆ": every circle is pulled in
      towards the logo and let back out along its own spoke, each on its own random radius,
      period and phase, so no two move together. .qbo-pull carries the radial travel with the
      individual `translate` property, and .qbo-cancel shrinks and fades with `scale` - separate
      properties, so neither disturbs the transform the counter-rotation relies on. The slot
      only rotates now; the radius moved to .qbo-pull. */
   var ring='';
   function rnd(lo,hi){return lo+Math.random()*(hi-lo)}
   for(var i=0;i<MODS.length;i++){
    var a=i*(360/MODS.length)+rnd(-10,10),dur=rnd(2.2,4.4);
    ring+='<span class="qbo-slot" style="transform:rotate('+a.toFixed(1)+'deg);--ro:'+rnd(122,150).toFixed(0)
     +'px;--ri:'+rnd(14,40).toFixed(0)+'px;--d:'+dur.toFixed(2)+'s;--dl:-'+rnd(0,dur*2).toFixed(2)+'s">'
     +'<span class="qbo-pull"><span class="qbo-cancel" style="transform:rotate('+(-a).toFixed(1)+'deg)">'
     +'<span class="qbo-face">'+MODS[i]+'</span></span></span></span>';
   }
   d.innerHTML='<div class="qr-boot-orbit"><div class="qbo-ring">'+ring+'</div>'
    +'<span class="qbo-core"><img src="./assets/imode-ui-logo-v532.png" alt="I-MODE"></span></div>'
    +'<span class="qr-boot-name">I-MODE Plus Service</span>';
   document.body.appendChild(d);
  }
  paintSplash();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paintSplash,{once:true});
  window.imodeQrBootRelease=function(){
   if(released)return;
   released=true;
   document.documentElement.classList.remove('qr-booting');
   var d=document.getElementById('qrBootSplash');
   if(d&&d.parentNode)d.parentNode.removeChild(d);
  };
  /* Never strand the visitor on the splash if portal entry throws. */
  setTimeout(function(){window.imodeQrBootRelease()},12000);
 }catch(e){}
})();
