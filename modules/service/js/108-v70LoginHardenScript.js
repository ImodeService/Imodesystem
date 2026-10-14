/* Beta 1.0 — 2026-09-23: the two ways left to get a session without a password.

   Found by listing every place in the project that assigns `currentUser`. After js/17 and
   js/46 there are only two left, and both are js/03 originals that predate the login:

   1. saveManualUser() — the "กรอกชื่อเอง" form at the bottom of the legacy login popup. Type
      any name, pick ANY role out of settings.roles (CEO and Service Manager are both in that
      list), press บันทึกและเข้าสู่ระบบ, and you are signed in as that role. No account, no
      password, no audit entry. js/33 hides the form with an inline display:none — but hidden
      is not gone: the <form> is still in the document with a live onsubmit, so one line in
      DevTools, or any later patch that re-renders that popup without js/33's hiding pass,
      brings it back. A door that only a stylesheet is holding shut is not shut.

   2. chooseUser() for a person who has NO account. js/17 sends anyone WITH an account to the
      password prompt, and falls through to the original one-click sign-in for anyone without.
      That fallback was right when the picker was a list of demo users; with a nine-account
      roster it is a way to become a person the account system has never heard of.

   Neither is removed — `manualLoginForm` is read as an id global 20 ms after the popup opens
   and deleting it throws (js/33 §HIDDEN, NEVER REMOVED), and chooseUser is called by markup
   this file does not own. They are refused instead, with a line saying where to sign in.

   A top-level `function` declaration IS a window property, so replacing window.saveManualUser
   changes what the bare identifier in js/03's `setTimeout(()=>manualLoginForm.onsubmit=
   saveManualUser,20)` resolves to. That is the whole reason this works as a wrapper. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 function allAccounts(){
  try{
   if(window.uatAuth&&typeof window.uatAuth.allAccounts==='function')
    return window.uatAuth.allAccounts()||[];
  }catch(e){}
  return [];
 }

 /* The escape hatch, and the only reason this is a condition rather than a flat refusal: a
    build with no accounts at all would otherwise have no way in. That cannot happen while
    js/09 defines any in code, but a guard that locks everybody out when something upstream
    fails is worse than the hole it closes. */
 function haveAccounts(){return allAccounts().length>0}

 /* --------------------------------------------------- 1. the name-only form --- */
 var baseManual=window.saveManualUser;
 if(typeof baseManual==='function'){
  window.saveManualUser=function(e){
   if(!haveAccounts())return baseManual.apply(this,arguments);
   if(e&&e.preventDefault)e.preventDefault();
   toast(tl('เข้าสู่ระบบด้วยชื่อเปล่าไม่ได้แล้ว กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน',
            'Name-only sign-in is closed. Use a username and password.'));
   return false;
  };
 }

 /* ------------------------------------------ 2. a person with no account --- */
 /* The same match js/17 uses — userId first, display name second — kept here as a guard
    rather than exported from there, because the two answer different questions: js/17 asks
    which account to send you to, this asks whether you may be let in at all. */
 function hasAccount(person){
  if(!person)return false;
  var list=allAccounts(),i,a;
  for(i=0;i<list.length;i++){
   a=list[i];
   if(!a)continue;
   if(person.id&&a.userId===person.id)return true;
   if(person.name&&String(a.name||'')===String(person.name))return true;
  }
  return false;
 }
 function personById(id){
  try{
   return (Array.isArray(demoUsers)?demoUsers:[]).filter(function(p){return p&&p.id===id})[0]||null;
  }catch(e){return null}
 }
 var baseChoose=window.chooseUser;     /* js/17's wrapper — this one sits outside it */
 if(typeof baseChoose==='function'){
  window.chooseUser=function(id){
   if(!haveAccounts())return baseChoose.apply(this,arguments);
   var person=personById(id);
   if(person&&!hasAccount(person)){
    toast(tl('คนนี้ยังไม่มีบัญชีผู้ใช้ ให้ผู้ดูแลระบบสร้างบัญชีให้ก่อน',
             'This person has no login account yet. Ask an administrator to create one.'));
    return;
   }
   return baseChoose.apply(this,arguments);
  };
 }

 /* Readable from the console when checking this is really in place. */
 window.imodeLoginDoors=function(){
  return {accounts:allAccounts().length,
          manualFormClosed:window.saveManualUser!==baseManual,
          pickerGuarded:window.chooseUser!==baseChoose};
 };
})();
