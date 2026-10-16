/* 2026-10-15: Settings → ธีมหน้าจอ in Service opens the SAME picker as the module picker page
   (shared/theme-pref.js, ImodeTheme.open()) instead of Service's own dialog, so the theme screen
   looks the same everywhere ("การตั้งค่าธีม มันไม่เหมือนกัน ผมอยากได้แบบรูปแรก").
   The shared picker saves the icon style, sidebar colour and sidebar movement to the same keys
   as js/130 / js/131; this file applies them to the open page at once. The theme itself already
   switches live through the imode-theme event (js/127). Customer pages keep their own picker. */
(function(){
 'use strict';
 function isCustomer(){try{return typeof window.imodeCustomerSurface==='function'&&!!window.imodeCustomerSurface()}catch(e){return false}}
 function ls(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}

 /* the shared dialog uses the launcher's colour names; give it Service's light / dark values */
 function css(){
  if(document.getElementById('svcSharedThemeCss'))return;
  var s=document.createElement('style');s.id='svcSharedThemeCss';
  s.textContent='.itp-back{z-index:10050}'+
   '.itp{--surface:#fff;--ink:#0c225e;--ink-2:#4a5d80;--line:#b9c8e2;--line-soft:#e3eaf5;--blue:#0b63e5}'+
   'html[data-ui="flat-dark"] .itp{--surface:#262626;--ink:#f0f0f0;--ink-2:#b5b5b5;--line:#4a4a4a;--line-soft:#3a3a3a;--blue:#4c9bff}';
  document.head.appendChild(s);
 }

 /* after a click in the shared picker, bring this page's icons and sidebar in line */
 function follow(){
  var I=window.imodeIconStyle,S=window.imodeSidebarStyle;
  var icons=ls('imode.serviceIcons')==='line'?'line':'emoji';
  var side=ls('imode.serviceSidebar');side=side==='light'||side==='game'?side:'navy';
  var motion=ls('imode.serviceSidebarMotion')==='rov'?'rov':'normal';
  /* the picker has already saved them, so get() matches; set() again to redraw this page */
  if(I)I.set(icons);
  if(S)S.set(side);
  if(S&&S.setMotion)S.setMotion(motion);
 }
 document.addEventListener('click',function(e){
  if(e.target&&e.target.closest&&e.target.closest('.itp-back'))setTimeout(follow,0);
 });

 function hook(){
  var base=window.openUiThemeSettingModal;
  if(typeof base!=='function'||base.__shared)return;
  var wrapped=function(){
   if(!isCustomer()&&window.ImodeTheme&&typeof window.ImodeTheme.open==='function'){css();window.ImodeTheme.open();return}
   return base.apply(this,arguments);
  };
  wrapped.__shared=true;
  window.openUiThemeSettingModal=wrapped;
 }
 /* js/133 wraps on DOMContentLoaded too; go after it */
 function later(){setTimeout(hook,0)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',later);else later();
})();
