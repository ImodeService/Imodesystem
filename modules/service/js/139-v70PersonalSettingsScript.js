/* 2026-10-19: ("ปรับให้ช่างสามารถเข้าถึงการตั้งค่าที่จำเป็นได้เช่นการปรับแต่งUI")
   The Settings page used to need settings.manage, so a technician could not change their own
   look at all. Now every signed-in role can open it, but a role without settings.manage only
   sees the personal cards: UI theme (theme, icons, sidebar) and font size. Both are saved per
   device / per account, so they change nothing for anyone else. Language stays with the admin
   cards (it is the system language); the TH / EN button in the top bar still works for anyone.
   Hiding here is only about what is shown; Supabase RLS decides what the database accepts. */
(function(){
 'use strict';
 var PERSONAL=['openUiThemeSettingModal','openTypographySettingModal'];
 function isAdmin(){try{return typeof canPermission!=='function'||canPermission('settings.manage')}catch(e){return true}}
 function fnOf(card){var m=/^\s*([\w$]+)/.exec(card.getAttribute('onclick')||'');return m?m[1]:''}

 try{if(typeof PAGE_PERMISSION!=='undefined')delete PAGE_PERMISSION.settings}catch(e){}

 function css(){
  if(document.getElementById('svcPersonalSettingsCss'))return;
  var s=document.createElement('style');s.id='svcPersonalSettingsCss';
  s.textContent='#page-settings [data-personal-off]{display:none!important}';
  document.head.appendChild(s);
 }

 var intro=null;
 function apply(){
  var page=document.getElementById('page-settings');if(!page)return;
  css();
  var admin=isAdmin();
  page.classList.toggle('is-personal-settings',!admin);
  [].forEach.call(page.querySelectorAll('.setting-action-card'),function(card){
   var off=!admin&&PERSONAL.indexOf(fnOf(card))<0;
   if(off&&!card.hasAttribute('data-personal-off')){card.hidden=true;card.setAttribute('data-personal-off','')}
   else if(!off&&card.hasAttribute('data-personal-off')){card.hidden=false;card.removeAttribute('data-personal-off')}
  });
  [].forEach.call(page.querySelectorAll('.settings-cloud-grid'),function(g){
   if(!admin&&!g.hasAttribute('data-personal-off')){g.hidden=true;g.setAttribute('data-personal-off','')}
   else if(admin&&g.hasAttribute('data-personal-off')){g.hidden=false;g.removeAttribute('data-personal-off')}
  });
  var box=page.querySelector('.plain-module-intro');
  if(box){
   var h=box.querySelector('h2'),p=box.querySelector('p'),b=box.querySelector('.settings-edit-badge');
   if(!intro)intro={h:h&&h.textContent,p:p&&p.textContent,b:b&&b.textContent};
   if(h)h.textContent=admin?intro.h:'ตั้งค่าส่วนตัว';
   if(p)p.textContent=admin?intro.p:'ปรับหน้าตาและขนาดตัวอักษรของคุณเอง มีผลเฉพาะบัญชีและเครื่องนี้ ไม่กระทบผู้อื่น';
   if(b)b.textContent=admin?intro.b:'✓ ปรับได้เฉพาะของตัวเอง';
  }
  document.querySelectorAll('[data-page="settings"]').forEach(function(el){if(el.style.display==='none')el.style.display=''});
 }

 /* Font size is kept per user; a technician saving it must not push their copy of the whole
    system settings to the cloud, which could overwrite an admin's newer change. */
 var baseFont=window.saveTypographyPreference;
 if(typeof baseFont==='function'){
  window.saveTypographyPreference=function(){
   if(isAdmin())return baseFont.apply(this,arguments);
   saveFontPreference(currentFontScale());saveLocal();closeModal();renderSettings();
   toastMsg(settings.language==='en'?'Font size preference saved':'บันทึกขนาดตัวอักษรแล้ว');
  };
 }

 if(typeof window.applyRoleVisibility==='function'){
  var base=window.applyRoleVisibility;
  window.applyRoleVisibility=function(){var r=base.apply(this,arguments);apply();return r};
  window.applyRoleVisibility.__stabs=base.__stabs;
 }
 var baseRender=window.renderSettings;
 if(typeof baseRender==='function')window.renderSettings=function(){var r=baseRender.apply(this,arguments);apply();return r};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
})();
