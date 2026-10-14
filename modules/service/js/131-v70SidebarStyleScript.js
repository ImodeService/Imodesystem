/* 2026-10-14: Settings -> ธีมหน้าจอ also picks the SIDEBAR STYLE, saved per device
   (localStorage imode.serviceSidebar): 'navy' (default, the original dark-blue bar) or 'light'
   (white bar, coloured logo, the open page as a light-blue pill — the look of the owner's
   stock app). Staff screens only; the customer pages have no sidebar.

   Loaded in <head>, not in the numbered tail, on purpose: the attribute and the style must be
   in place before the first paint, or every page load flashes the navy bar first. The picker
   is added at DOMContentLoaded, by which time js/127 and js/130 have defined the dialog. */
(function(){
 'use strict';
 var KEY='imode.serviceSidebar';
 var STYLES=[
  {id:'navy',name:'กรมท่า (เดิม)',desc:'แถบเมนูสีน้ำเงินเข้ม โลโก้สีขาว'},
  {id:'light',name:'สว่าง',desc:'แถบเมนูสีขาว โลโก้สี เมนูที่เปิดอยู่เป็นแถบสีฟ้าอ่อน'}
 ];
 function mode(){var v='';try{v=localStorage.getItem(KEY)||''}catch(e){}return v==='light'?'light':'navy'}
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
  +'.ui-side-opt .pv.light{background:#f8fafd}.ui-side-opt .pv.light i{background:#c9d2e3}.ui-side-opt .pv.light i.on{background:#0b5cd6}';
 var st=document.createElement('style');
 st.id='v70SidebarStyle';
 st.textContent=css;
 (document.head||root).appendChild(st);
 apply();

 function set(m){
  try{localStorage.setItem(KEY,m==='light'?'light':'navy')}catch(e){}
  apply();
 }
 window.imodeSidebarStyle={get:mode,set:set};

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
     }).join('')+'</div>';
    body.appendChild(wrap);
    wrap.addEventListener('click',function(e){
     var b=e.target.closest('.ui-side-opt');if(!b)return;
     set(b.getAttribute('data-sidebar-style'));
     wrap.querySelectorAll('.ui-side-opt').forEach(function(x){x.setAttribute('aria-checked',String(x===b))});
    });
   },60);
   return r;
  };
  wrapped.__sidebarStyle=true;
  window.openUiThemeSettingModal=wrapped;
 }
 function start(){
  apply();
  hookPicker();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.addEventListener('storage',function(e){if(e.key===KEY)apply()});
})();
