/* 2026-10-14: Settings -> ธีมหน้าจอ also picks the SIDEBAR STYLE, saved per device
   (localStorage imode.serviceSidebar): 'navy' (default, the original dark-blue bar) or 'light'
   (white bar, coloured logo, the open page as a light-blue pill — the look of the owner's
   stock app). Staff screens only; the customer pages have no sidebar.
   2026-10-14: separate from the colours, the bar's MOVEMENT can follow the friends list in the
   game RoV (user's clip; "เอามาแค่ Animation"): imode.serviceSidebarMotion = 'rov'. On a PC with
   a mouse the bar rests as a slim icon rail and slides out over the page (the page does not
   move) when pointed at, its labels sliding in one after another; on a phone the drawer's items
   slide in the same way. Colours stay those of the chosen style.
   A third colour style 'game' (indigo + gold, the RoV look itself) is kept for whoever likes it.

   Loaded in <head>, not in the numbered tail, on purpose: the attribute and the style must be
   in place before the first paint, or every page load flashes the navy bar first. The picker
   is added at DOMContentLoaded, by which time js/127 and js/130 have defined the dialog. */
(function(){
 'use strict';
 var KEY='imode.serviceSidebar';
 var STYLES=[
  {id:'navy',name:'กรมท่า (เดิม)',desc:'แถบเมนูสีน้ำเงินเข้ม โลโก้สีขาว'},
  {id:'light',name:'เรียบ',desc:'แถบเมนูสีขาว โลโก้สี เมนูที่เปิดอยู่เป็นแถบสีฟ้าอ่อน'},
  {id:'game',name:'ราตรีสีทอง',desc:'แถบเมนูสีน้ำเงินม่วงเข้ม เมนูที่เปิดอยู่เป็นสีทอง'}
 ];
 function valid(v){return v==='light'||v==='game'}
 function mode(){var v='';try{v=localStorage.getItem(KEY)||''}catch(e){}return valid(v)?v:'navy'}
 var root=document.documentElement;
 function apply(){
  var m=mode();
  if(root.getAttribute('data-sidebar')!==m)root.setAttribute('data-sidebar',m);

 }

 /* The sidebar logo is white (assets/imode-ui-logo-v532.png) and disappears on a white bar, so
    the light style shows the coloured logo instead, through CSS content:url(). The src itself
    is never touched: js/03 applyOfficialImodeLogo() rewrites it on every render. The dark
    theme keeps the white logo, because there the bar stays dark. */
 var COLOUR_LOGO='./assets/imode-document-logo-removeBG.png';

 var P='html[data-sidebar="light"]:is(:root,#fx) #sidebar';
 var css=''
  +'html[data-sidebar="light"]{--sbl-bg:#f8fafd;--sbl-card:#ffffff;--sbl-line:#e4e9f2;--sbl-text:#1f2b4d;--sbl-muted:#7a869f;'
  +'--sbl-hover:#eef3fb;--sbl-active-bg:#e3edfd;--sbl-active:#0b5cd6}'
  +'html[data-sidebar="light"][data-ui="flat-dark"]{--sbl-bg:#1f1f1f;--sbl-card:#262626;--sbl-line:#333;--sbl-text:#e8e8e8;--sbl-muted:#9a9a9a;'
  +'--sbl-hover:#2a2a2a;--sbl-active-bg:#22344f;--sbl-active:#8ab8ff}'
  +P+'{background:var(--sbl-bg)!important;background-image:none!important;color:var(--sbl-text)!important;'
  +'border:0!important;border-right:1px solid var(--sbl-line)!important;box-shadow:none!important;backdrop-filter:none!important}'
  +P+'::before,'+P+'::after{display:none!important}'
  +P+' .brand-block{border-color:var(--sbl-line)!important;background:transparent!important}'
  +P+' .brand-logo-shell{background:transparent!important;box-shadow:none!important;border:0!important}'
  +'html[data-sidebar="light"]:not([data-ui="flat-dark"]):is(:root,#fx) #sidebar .brand-logo{content:url("'+COLOUR_LOGO+'");filter:none!important}'
  +P+' .brand-title,'+P+' .brand-title *{color:var(--sbl-text)!important;text-shadow:none!important}'
  +P+' .nav-group,'+P+' .nav-group *{color:var(--sbl-muted)!important;background:transparent!important}'
  +P+' .nav-group:hover{background:var(--sbl-hover)!important}'
  +P+' .nav-item{background:transparent!important;background-image:none!important;color:var(--sbl-text)!important;'
  +'border:0!important;box-shadow:none!important;border-radius:12px!important;text-shadow:none!important}'
  +P+' .nav-item::before,'+P+' .nav-item::after{display:none!important}'
  +P+' .nav-item>b{color:inherit!important;font-weight:500!important;text-shadow:none!important}'
  +P+' .nav-item>span:first-child{color:inherit!important;background:transparent!important;box-shadow:none!important;filter:none!important}'
  +P+' .nav-item:hover{background:var(--sbl-hover)!important}'
  +P+' .nav-item.active{background:var(--sbl-active-bg)!important;color:var(--sbl-active)!important}'
  +P+' .nav-item.active>b{font-weight:600!important}'
  +P+' .nav-item:focus-visible{outline:2px solid var(--sbl-active)!important;outline-offset:-2px}'
  +P+' .sidebar-account{background:transparent!important;border-color:var(--sbl-line)!important}'
  +P+' .topbar-user-card{background:var(--sbl-card)!important;border:1px solid var(--sbl-line)!important;box-shadow:none!important;color:var(--sbl-text)!important}'
  +P+' .top-user-meta,'+P+' .top-user-meta *,'+P+' .top-user-arrow{color:var(--sbl-text)!important}'
  +P+' .top-user-meta small,'+P+' .top-user-meta span{color:var(--sbl-muted)!important}'
  +P+' .sidebar-version{color:var(--sbl-muted)!important}'
  +P+' .side-nav{scrollbar-color:var(--sbl-line) transparent}'
  /* the picker in the theme dialog */
  +'.ui-side-opts{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 0}'
  +'.ui-side-opt{flex:1 1 180px;display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--fx-line,#d0d7e6);border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}'
  +'.ui-side-opt[aria-checked="true"]{border-color:#0b5cd6;box-shadow:inset 0 0 0 1px #0b5cd6}'
  +'.ui-side-opt .pv{flex:none;width:44px;height:52px;border-radius:6px;padding:6px 5px;display:flex;flex-direction:column;gap:4px;border:1px solid #d0d7e6}'
  +'.ui-side-opt .pv i{display:block;height:5px;border-radius:3px}'
  +'.ui-side-opt .pv.navy{background:#0c225e}.ui-side-opt .pv.navy i{background:rgba(255,255,255,.55)}.ui-side-opt .pv.navy i.on{background:#f79009}'
  +'.ui-side-opt .pv.mv{background:#f3f5f9;border-style:dashed}.ui-side-opt .pv.mv i{background:#9aa6bd}.ui-side-opt .pv.mv i.on{background:#0b5cd6}'
  +'.ui-side-opt .pv.mv.rov{width:22px;padding:6px 4px}'
  +'.ui-side-opt .pv.light{background:#f8fafd}.ui-side-opt .pv.light i{background:#c9d2e3}.ui-side-opt .pv.light i.on{background:#0b5cd6}';

 /* ---------- 'game' colours (RoV look) ---------- */
 var G='html[data-sidebar="game"]:is(:root,#fx) #sidebar';
 var GOLD='#ffc845';
 css+=''
  +G+'{background:linear-gradient(90deg,rgba(8,14,46,.99) 0%,rgba(14,24,78,.97) 70%,rgba(14,24,78,.95) 100%)!important;'
  +'border:0!important;border-radius:0!important;box-shadow:inset -1px 0 0 rgba(255,200,69,.22)!important;backdrop-filter:none!important;color:#e9eeff!important}'
  +G+'::before{display:none!important}'
  +G+' .brand-block{position:relative;background:transparent!important;border:0!important;border-bottom:1px solid rgba(255,200,69,.28)!important;box-shadow:none!important}'
  +G+' .brand-logo-shell{background:transparent!important;box-shadow:none!important;border:0!important}'
  +G+' .brand-title,'+G+' .brand-title *{color:#f3f5ff!important;text-shadow:none!important}'
  +G+' .nav-group,'+G+' .nav-group *{color:rgba(255,214,120,.8)!important;background:transparent!important}'
  +G+' .nav-item{background:transparent!important;background-image:none!important;color:#e6ebff!important;border:0!important;box-shadow:none!important;'
  +'border-radius:10px!important;text-shadow:none!important;transform:none!important}'
  +G+' .nav-item::before,'+G+' .nav-item::after{display:none!important}'
  +G+' .nav-item>b{color:inherit!important;font-weight:500!important;text-shadow:none!important}'
  +G+' .nav-item>span:first-child{color:inherit!important;background:transparent!important;box-shadow:none!important}'
  +G+' .nav-item:hover{background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,255,255,0))!important;color:#fff!important}'
  +G+' .nav-item.active{background:linear-gradient(90deg,rgba(255,200,69,.32) 0%,rgba(255,200,69,.08) 65%,rgba(255,200,69,0) 100%)!important;'
  +'color:#ffd772!important;box-shadow:inset 3px 0 0 '+GOLD+'!important}'
  +G+' .nav-item.active>b{font-weight:600!important}'
  +G+' .nav-item.active>span:first-child{filter:drop-shadow(0 0 6px rgba(255,200,69,.85))!important}'
  +G+' .nav-item:focus-visible{outline:2px solid '+GOLD+'!important;outline-offset:-2px}'
  +G+' .nav-launcher-sep{background:rgba(255,200,69,.35)!important;opacity:1!important}'
  +G+' .sidebar-account{background:transparent!important;border-color:rgba(255,200,69,.22)!important}'
  +G+' .topbar-user-card{background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:none!important;color:#f3f5ff!important}'
  +G+' .top-user-meta,'+G+' .top-user-meta *,'+G+' .top-user-arrow{color:#f3f5ff!important}'
  +G+' .top-user-meta small{color:rgba(230,236,255,.7)!important}'
  +G+' .sidebar-version,'+G+' .sidebar-version *{color:rgba(230,236,255,.55)!important}'
  +G+' .side-nav{scrollbar-color:rgba(255,200,69,.35) transparent}'
  +'.ui-side-opt .pv.game{background:linear-gradient(90deg,#080e2e,#1a2a8a);border-color:#3a3f7a}.ui-side-opt .pv.game i{background:rgba(255,255,255,.45)}'
  +'.ui-side-opt .pv.game i.on{background:#ffc845;box-shadow:0 0 6px rgba(255,200,69,.8)}';

 /* ---------- movement like RoV (any colour style) ---------- */
 var MKEY='imode.serviceSidebarMotion';
 var MOTIONS=[
  {id:'normal',name:'ปกติ',desc:'แถบเมนูกางเต็มตลอด'},
  {id:'rov',name:'เลื่อนแบบสไลด์',desc:'ย่อเหลือแต่ไอคอน ชี้เมาส์แล้วเมนูเลื่อนออกมาทับหน้าจอ ชื่อเมนูไหลเข้ามาทีละอัน'}
 ];
 function motion(){var v='';try{v=localStorage.getItem(MKEY)||''}catch(e){}return v==='rov'?'rov':'normal'}
 var M='html[data-sidebar-motion="rov"]:is(:root,#fx) #sidebar';
 var OPEN=':is(:hover,:focus-within)';
 var LABELS=[' .nav-item>b',' .nav-item>i',' .nav-group-label',' .nav-group-caret',' .brand-title',' .top-user-meta',' .top-user-arrow',' .sidebar-version'];
 function m(suffix){return LABELS.map(function(x){return M+suffix+x}).join(',')}
 var EASE='cubic-bezier(.2,.8,.2,1)';
 css+=''
  /* PC with a mouse: icon rail that slides open over the page */
  +'@media (min-width:901px) and (hover:hover){'
  +'html[data-sidebar-motion="rov"]:is(:root,#fx) body:not(.v68-nav-collapsed) .app-shell{grid-template-columns:88px 1fr!important}'
  +M+'{position:fixed!important;top:0!important;left:0!important;bottom:0!important;width:88px!important;padding:14px 12px 12px!important;'
  +'border-radius:0!important;overflow:hidden!important;z-index:60!important;transition:width .34s '+EASE+',box-shadow .34s!important}'
  +M+OPEN+'{width:320px!important;box-shadow:12px 0 36px -10px rgba(0,0,0,.35)!important}'
  /* the little handle on the rail, as in the game */
  +M+'::after{content:""!important;display:block!important;position:absolute!important;inset:auto!important;right:7px!important;top:50%!important;'
  +'width:4px!important;height:46px!important;margin-top:-23px!important;border-radius:4px!important;background:currentColor!important;opacity:.45;transition:opacity .2s!important}'
  +M+OPEN+'::after{opacity:0}'
  +'html[data-sidebar="game"][data-sidebar-motion="rov"]:is(:root,#fx) #sidebar'+OPEN+'{box-shadow:none!important;'
  +'background:linear-gradient(90deg,rgba(7,12,42,.98) 0%,rgba(12,22,74,.96) 76%,rgba(12,22,74,.7) 88%,rgba(12,22,74,0) 100%)!important}'
  +'html[data-sidebar="game"][data-sidebar-motion="rov"]:is(:root,#fx) #sidebar'+OPEN+'{width:352px!important}'
  /* contents keep their open width so nothing reflows while the bar slides */
  +M+' .brand-block,'+M+' .side-nav,'+M+' .sidebar-account,'+M+' .sidebar-version{width:296px!important;max-width:none!important}'
  +M+' .side-nav{overflow-x:hidden!important}'
  +M+' .nav-item{width:280px!important;padding-left:12px!important}'
  +M+' .brand-block{display:flex!important;flex-direction:column!important;align-items:flex-start!important;text-align:left!important}'
  +M+' .brand-logo-shell{margin:0!important}'
  +M+' .brand-logo{width:62px!important;max-width:none!important;transition:width .3s '+EASE+'!important}'
  +M+OPEN+' .brand-logo{width:132px!important}'
  +m('')+'{opacity:0!important;transform:translateX(-12px)!important;transition:opacity .16s ease-out,transform .2s ease-out!important}'
  +m(OPEN)+'{opacity:1!important;transform:none!important;'
  +'transition:opacity .26s ease-out calc(70ms + var(--gi,0) * 16ms),transform .3s '+EASE+' calc(70ms + var(--gi,0) * 16ms)!important}'
  /* a group heading is a short rule while the bar is narrow */
  +M+' .nav-group{position:relative!important}'
  +M+' .nav-group::after{content:""!important;position:absolute!important;left:14px;top:50%;width:38px;height:1px;background:currentColor!important;opacity:.4;transition:opacity .2s!important}'
  +M+OPEN+' .nav-group::after{opacity:0}'
  +M+' .topbar-user-card{width:64px!important;overflow:hidden!important;transition:width .3s '+EASE+'!important}'
  +M+OPEN+' .topbar-user-card{width:290px!important}'
  +'}'
  /* phone drawer: items slide in one after another when it opens */
  +'@keyframes rovSideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}'
  +'@media (max-width:900px){'+M+'.open .side-nav>*{animation:rovSideIn .34s '+EASE+' both;animation-delay:calc(60ms + var(--gi,0) * 18ms)}}'
  +'@media (prefers-reduced-motion:reduce){'+M+','+M+' *{transition:none!important;animation:none!important}}';

 /* stagger order for the slide-in */
 function number(){
  if(motion()!=='rov')return;
  var nav=document.querySelector('#sidebar .side-nav');if(!nav)return;
  var i=0;
  Array.prototype.forEach.call(nav.children,function(el){
   if(getComputedStyle(el).display==='none')return;
   el.style.setProperty('--gi',String(Math.min(i++,24)));
  });
 }
 function wireMotion(){
  var side=document.getElementById('sidebar');
  if(!side||side.__rovWired)return;
  side.__rovWired=true;
  side.addEventListener('mouseenter',number);
  side.addEventListener('focusin',number);
  try{new MutationObserver(function(){if(side.classList.contains('open'))number()}).observe(side,{attributes:true,attributeFilter:['class']})}catch(e){}
  /* after a mouse click inside, focus would keep the bar open; let it close when the mouse leaves */
  side.addEventListener('mouseleave',function(){
   var a=document.activeElement;
   if(motion()==='rov'&&window.innerWidth>900&&side.contains(a)&&!a.matches(':focus-visible'))a.blur();
  });
 }
 function applyMotion(){
  var v=motion();
  if(root.getAttribute('data-sidebar-motion')!==v)root.setAttribute('data-sidebar-motion',v);
 }
 function setMotion(v){try{localStorage.setItem(MKEY,v==='rov'?'rov':'normal')}catch(e){}applyMotion();number()}
 var st=document.createElement('style');
 st.id='v70SidebarStyle';
 st.textContent=css;
 (document.head||root).appendChild(st);
 apply();
 applyMotion();

 function set(m){
  try{localStorage.setItem(KEY,valid(m)?m:'navy')}catch(e){}
  apply();
 }
 window.imodeSidebarStyle={get:mode,set:set,motion:motion,setMotion:setMotion};

 function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function isCustomer(){return root.getAttribute('data-view')==='customer'}
 function hookPicker(){
  var base=window.openUiThemeSettingModal;
  if(typeof base!=='function'||base.__sidebarStyle)return;
  var wrapped=function(){
   var r=base.apply(this,arguments);
   if(isCustomer())return r;
   /* after js/130 has added its icon choice (30 ms), so this one sits below it */
   setTimeout(function(){
    var body=document.getElementById('modalBody');
    if(!body||body.querySelector('.ui-side-opts'))return;
    var cur=mode();
    var wrap=document.createElement('div');
    wrap.innerHTML='<h4 style="margin:18px 0 4px">สไตล์แถบเมนูด้านข้าง</h4>'
     +'<div class="ui-side-opts" role="radiogroup" aria-label="สไตล์แถบเมนูด้านข้าง">'
     +STYLES.map(function(s){
      return '<button type="button" class="ui-side-opt" role="radio" data-sidebar-style="'+s.id+'" aria-checked="'+(s.id===cur)+'">'
       +'<span class="pv '+s.id+'" aria-hidden="true"><i></i><i class="on"></i><i></i><i></i></span>'
       +'<span><b>'+esc(s.name)+'</b><br><small>'+esc(s.desc)+'</small></span></button>';
     }).join('')+'</div>'
     +'<h4 style="margin:18px 0 4px">การเคลื่อนไหวของแถบเมนู</h4>'
     +'<div class="ui-side-opts" role="radiogroup" aria-label="การเคลื่อนไหวของแถบเมนู">'
     +MOTIONS.map(function(o){
      return '<button type="button" class="ui-side-opt" role="radio" data-sidebar-motion="'+o.id+'" aria-checked="'+(o.id===motion())+'">'
       +'<span class="pv mv '+o.id+'" aria-hidden="true"><i></i><i class="on"></i><i></i><i></i></span>'
       +'<span><b>'+esc(o.name)+'</b><br><small>'+esc(o.desc)+'</small></span></button>';
     }).join('')+'</div>';
    body.appendChild(wrap);
    wrap.addEventListener('click',function(e){
     var b=e.target.closest('.ui-side-opt');if(!b)return;
     var group=b.hasAttribute('data-sidebar-motion')?'[data-sidebar-motion]':'[data-sidebar-style]';
     if(b.hasAttribute('data-sidebar-motion'))setMotion(b.getAttribute('data-sidebar-motion'));
     else set(b.getAttribute('data-sidebar-style'));
     wrap.querySelectorAll('.ui-side-opt'+group).forEach(function(x){x.setAttribute('aria-checked',String(x===b))});
    });
   },60);
   return r;
  };
  wrapped.__sidebarStyle=true;
  window.openUiThemeSettingModal=wrapped;
 }
 function start(){
  apply();
  applyMotion();
  hookPicker();
  wireMotion();
  number();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.addEventListener('storage',function(e){if(e.key===KEY)apply();if(e.key===MKEY)applyMotion()});
})();
