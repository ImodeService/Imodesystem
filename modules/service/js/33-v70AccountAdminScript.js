/* Beta — account management moves to Settings; the login popup becomes a switcher.

   Reported: "หน้า account มันแบบแปลกๆ" — one popup was doing three unrelated jobs at once.
   Opening the sidebar account card produced, in one scroll:

     1. the UAT username / password form            (js/09)
     2. a collapsed list of every test account      (js/09)
     3. the eight-person picker with delete, bulk
        remove and restore buttons                  (js/03 markup, js/17 behaviour)
     4. a create-a-user form with a photo uploader  (js/03)

   Only (1) is something you do when you want to sign in. (2), (3) and (4) are
   administration, and administration belongs on the Settings page beside
   ผู้ใช้งานและสิทธิ์ — which is where the same admin already goes to change what those
   accounts may do.

   So the same popup is now built twice from the same source:

     openUserLoginModal()    sign in / switch — the password form plus one button per
                             account, with the administration blocks removed.
     openAccountAdminModal() manage — the administration blocks, with the password form
                             removed, plus a read-only table of the real login accounts.

   Both call the existing chain (js/17 -> js/09 -> js/03) and then take away what does not
   belong, rather than rendering markup of their own. That is deliberate: js/17 fills the
   person list through its own wrapper and its delete / restore buttons are wired by
   onclick attributes inside that markup, so a second copy of the list here would need a
   second copy of that behaviour and would drift from it. Nothing is written by this file —
   chooseUser(), saveManualUser(), imodeRemoveLoginUser() and the storage keys are all the
   originals.

   Load order matters: this file must come after js/09 and js/17 so the chain it captures
   is the complete one. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function body(){return document.getElementById('modalBody')}
 function accounts(){
  try{return (window.uatAuth&&typeof window.uatAuth.allAccounts==='function')?window.uatAuth.allAccounts():[]}
  catch(e){return[]}
 }
 function currentUsername(){
  try{return (currentUser&&currentUser.username)||''}catch(e){return''}
 }
 /* HIDDEN, NEVER REMOVED.

    js/03 ends openUserLoginModal() with

        setTimeout(()=>manualLoginForm.onsubmit=saveManualUser,20)

    which reads manualLoginForm as an *id global* — a bare identifier, not a
    getElementById call — 20 ms after the popup opens. Deleting .login-manual-box
    therefore threw a ReferenceError on every open; the popup still looked right, which is
    exactly why it took a browser run to see it. Same reason #fieldQueue and
    #portalLineIdentity are hidden rather than removed elsewhere in this project.

    An inline display:none is used rather than the hidden attribute because .login-user-list
    and .login-manual-box both carry author display rules, which beat the UA [hidden] rule —
    the trap that made the โมดูลทั้งหมด button look dead in part 6. */
 function hide(sel){
  var b=body();if(!b)return;
  [].slice.call(b.querySelectorAll(sel)).forEach(function(n){n.style.display='none'});
 }
 /* openModal() writes these two nodes; retitling after it returns is enough, and it leaves
    js/29's modal-history snapshot pointing at the heading the visitor actually sees. */
 function retitle(title,sub){
  var t=document.getElementById('modalTitle'),s=document.getElementById('modalSub');
  if(t)t.textContent=title;
  if(s)s.textContent=sub;
 }

 /* ------------------------------------------------------------ quick switch ---- */
 /* Signing in as another account without retyping a password that is, by the documented
    UAT convention, the username again — the popup used to print that convention in plain
    text, so this exposes nothing new. It is still a real sign-in through ImodeAuth, so
    lockout, expiry and the audit trail all apply.

    If the convention does not hold — someone used change-password on this device — the
    attempt fails and the username is filled in with the password box focused, which is
    where the visitor would have had to start anyway. */
 /* Reported: the popup sat there after the switch and could not be closed for a moment.
    Two separate causes, both fixed here.

    It never closed at all on success — imodeSignIn routes to the Home page underneath and
    nothing dismissed the popup on top of it. And the wait was real: signing in runs
    renderAll(), which redraws every module, so the main thread is busy and a click on × does
    nothing until it finishes.

    So the popup is closed FIRST, synchronously, on the click — before the sign-in starts and
    therefore before anything can block. A failure then has nowhere to write, so it reopens
    the login popup with the username filled in and the reason shown, which is also clearer
    than an error appearing inside a popup the user thought they had left. */
 window.imodeQuickSwitch=function(username){
  if(typeof window.imodeSignIn!=='function'){toast(tl('ระบบเข้าสู่ระบบยังไม่พร้อม','Sign-in is not ready'));return}
  var acc=null;
  try{acc=(window.uatAuth&&window.uatAuth.findAccount)?window.uatAuth.findAccount(username):null}catch(e){}
  var label=(acc&&acc.name)||username;
  if(typeof closeModal==='function'){try{closeModal()}catch(e){}}
  toast(tl('กำลังสลับเป็น ','Switching to ')+label+'…');
  Promise.resolve(window.imodeSignIn(username,username)).then(function(res){
   if(res&&res.ok===false)throw new Error(res.error||'');
   var who=label;
   try{if(currentUser&&currentUser.name)who=currentUser.name}catch(e){}
   toast(tl('สลับเป็น ','Switched to ')+who+tl(' แล้ว',''));
  }).catch(function(){
   toast(tl('สลับบัญชีไม่สำเร็จ — บัญชีนี้ตั้งรหัสผ่านใหม่ไว้',
            'Could not switch — this account has a changed password'));
   if(typeof window.openUserLoginModal!=='function')return;
   window.openUserLoginModal();
   /* Looked up after the popup is rebuilt, never captured earlier: writing to a detached
      node is how the part-5 staff-login bug hid itself. */
   setTimeout(function(){
    var u=document.getElementById('uatLoginUser'),pw=document.getElementById('uatLoginPass');
    if(u)u.value=username;
    if(pw){pw.value='';pw.focus()}
    var box=document.getElementById('uatLoginError');
    if(box){
     box.textContent=tl('บัญชีนี้ตั้งรหัสผ่านใหม่ไว้ กรุณากรอกรหัสผ่าน','This account has a changed password — please type it');
     box.classList.add('show');
    }
   },60);
  });
 };

 function switchHTML(){
  var list=accounts(),me=currentUsername();
  if(!list.length)return '';
  /* 2026-09-23: with nobody signed in this popup IS the front door, and a door must not
     publish the list of everyone who can open it — there is also nothing to "switch" from.
     currentUser is a top-level let in js/03, a lexical global that is never on window, so it
     is read by bare identifier; window.currentUser would be undefined and the block would
     stay hidden for everybody. */
  var signedIn=false;
  try{signedIn=!!(currentUser&&(currentUser.username||currentUser.name))}catch(e){}
  if(!signedIn)return '';
  var rows=list.map(function(a){
   var sub=a.accountType==='technician'
    ? esc2(tl('ช่าง','Technician'))+' · '+esc2(a.technicianId||'')
    : esc2(a.role||'');
   var mine=a.username===me;
   return '<button type="button" class="acctsw-btn'+(mine?' is-current':'')+'"'
    +(mine?' aria-current="true"':'')
    +' onclick="imodeQuickSwitch('+imodeJsArg(a.username)+')">'
    +'<b>'+esc2(a.username)+'</b><small>'+sub+'</small>'
    +(mine?'<i>'+esc2(tl('ใช้งานอยู่','signed in'))+'</i>':'')
    +'</button>';
  }).join('');
  return '<div class="acctsw"><div class="acctsw-head"><b>'+esc2(tl('สลับบัญชีด่วน','Quick switch'))+'</b>'
   +'<small>'+esc2(tl('กดเพื่อเข้าใช้งานด้วยบัญชีนั้นทันที','Tap an account to sign straight in'))+'</small></div>'
   +'<div class="acctsw-grid">'+rows+'</div></div>';
 }

 /* ------------------------------------------------------- the accounts table ---- */
 function accountsTableHTML(){
  var list=accounts(),me=currentUsername();
  if(!list.length)return '<p class="acctadm-empty">'+esc2(tl('ยังไม่มีบัญชีเข้าสู่ระบบในระบบนี้','No login accounts are registered'))+'</p>';
  var rows=list.map(function(a){
   var link=a.accountType==='technician'
    ? esc2(tl('ช่าง ','Technician '))+esc2(a.technicianId||'-')
    : esc2(tl('ไม่ผูกกับระเบียนช่าง','Not linked to a technician'));
   return '<div class="acctadm-row'+(a.username===me?' is-current':'')+'">'
    +'<div><b>'+esc2(a.username)+'</b><small>'+link+'</small></div>'
    +'<span class="acctadm-role">'+esc2(a.role||'-')+'</span>'
    +'<span class="acctadm-team">'+esc2(a.team||'-')+'</span>'
    +'</div>';
  }).join('');
  return '<div class="acctadm-box">'
   +'<div class="acctadm-head"><b>'+esc2(tl('บัญชีเข้าสู่ระบบ','Login accounts'))+' ('+list.length+')</b>'
   +'<small>'+esc2(tl('แก้สิทธิ์ของบทบาทเหล่านี้ได้ที่ ตั้งค่าระบบ → ผู้ใช้งานและสิทธิ์',
                     'Change what these roles may do in Settings → Users & permissions'))+'</small></div>'
   +'<div class="acctadm-list">'+rows+'</div></div>';
 }

 /* --------------------------------------------------------------- the two doors ---- */
 var baseLogin=window.openUserLoginModal;
 if(typeof baseLogin!=='function')return;

 window.openUserLoginModal=function(){
  var r=baseLogin.apply(this,arguments);
  var b=body();
  if(!b)return r;
  /* administration lives in Settings now */
  hide('.login-user-list');
  hide('.login-manual-box');
  hide('.uat-account-hint');
  var box=b.querySelector('.uat-login-box');
  if(box)box.insertAdjacentHTML('beforeend',switchHTML());
  else b.insertAdjacentHTML('afterbegin',switchHTML());
  retitle(tl('เข้าสู่ระบบ / สลับบัญชี','Sign in / switch account'),
          tl('กรอกชื่อผู้ใช้และรหัสผ่าน หรือกดบัญชีด้านล่างเพื่อสลับทันที',
             'Type a username and password, or tap an account below to switch'));
  return r;
 };

 window.openAccountAdminModal=function(){
  if(typeof window.requirePermission==='function'&&!window.requirePermission('users.manage'))return;
  var r=baseLogin.apply(this,arguments);
  var b=body();
  if(!b)return r;
  /* the sign-in form belongs to the other door */
  hide('.uat-login-box');
  b.insertAdjacentHTML('afterbegin',accountsTableHTML());
  retitle(tl('การจัดการบัญชีผู้ใช้','Account management'),
          tl('บัญชีเข้าสู่ระบบ รายชื่อผู้ใช้งานในตัวเลือก และการเพิ่มผู้ใช้เอง',
             'Login accounts, the people picker, and adding a user by hand'));
  return r;
 };

 var st=document.createElement('style');
 st.id='v70AccountAdminStyle';
 st.textContent=''
 +'.acctsw{margin-top:12px;border-top:1px solid #e3ecfa;padding-top:11px}'
 +'.acctsw-head b{display:block;font-size:12.5px;color:#0c225e}'
 +'.acctsw-head small{display:block;font-size:11px;color:#6f81a3;margin-top:1px}'
 +'.acctsw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:9px}'
 +'.acctsw-btn{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1px;'
 +'padding:9px 12px;border:1px solid #d7e3f5;border-radius:12px;background:linear-gradient(180deg,#fff,#f3f7ff);'
 +'cursor:pointer;text-align:left;box-shadow:0 4px 0 #e4ecf9;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}'
 +'.acctsw-btn b{font-size:12.5px;color:#123a80;font-weight:700;word-break:break-all}'
 +'.acctsw-btn small{font-size:10.5px;color:#6f81a3}'
 +'.acctsw-btn i{font-style:normal;font-size:10px;font-weight:700;color:#079455}'
 +'.acctsw-btn:hover{transform:translateY(-2px);border-color:#a9cdf7;box-shadow:0 6px 0 #dce8f9}'
 +'.acctsw-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #dce8f9}'
 +'.acctsw-btn:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.acctsw-btn.is-current{border-color:#079455;background:linear-gradient(180deg,#f2fbf6,#e6f7ee);box-shadow:0 4px 0 #cceedd}'
 +'.acctadm-box{border:1px solid #d8e2f2;border-radius:14px;padding:13px;margin-bottom:14px;background:linear-gradient(180deg,#f7faff,#fff)}'
 +'.acctadm-head b{display:block;font-size:13.5px;color:#0c225e}'
 +'.acctadm-head small{display:block;font-size:11px;color:#6f81a3;margin-top:2px;line-height:1.5}'
 +'.acctadm-list{margin-top:10px;display:grid;gap:6px}'
 +'.acctadm-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;'
 +'padding:8px 11px;border-radius:10px;background:#f3f7ff;border:1px solid #e3ecfa}'
 +'.acctadm-row.is-current{border-color:#8fd9b4;background:#f2fbf6}'
 +'.acctadm-row b{display:block;font-size:12.5px;color:#123a80;word-break:break-all}'
 +'.acctadm-row small{display:block;font-size:10.5px;color:#7385a5}'
 +'.acctadm-role{font-size:11px;font-weight:700;color:#3d557f}'
 +'.acctadm-team{font-size:10.5px;color:#7385a5}'
 +'.acctadm-empty{font-size:12px;color:#6f81a3}'
 +'@media (max-width:640px){.acctadm-row{grid-template-columns:1fr;gap:2px}'
 +'.acctadm-role,.acctadm-team{justify-self:start}}';
 document.head.appendChild(st);
})();
