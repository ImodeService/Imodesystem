/* Beta — a password is required every time, at both doors.

     8  "ตอนที่เข้าลิงต์เว็บของแอดมิน ช่าง หรือ R&D มันเข้าหน้าแดชบอร์ดเลย อยากให้หน้าล็อคอินก่อน"
     9  "เวลากดดู Account ถึงจะมีปุ่มสลับแอคเคาท์ด่วน แต่อยากให้ใส่รหัสก่อนทุกครั้ง ก่อนเข้าหน้าแดชบอร์ด"

   WHY 8 HAPPENED. There was never a bug here — it was a setting working as designed.
   bootRoute() in js/11 already sends a visitor with no session to #page-staff-login, and it
   still does. What kept the door open was the cached session: currentUser is restored from
   imode_v5_current_user on every load, and part 17 raised settings.authConfig to
   sessionHours 24 / idleMinutes 1440 so a demo stand could be left running all day. On a
   phone that had signed in once, every later visit walked straight past the door. That is
   exactly the convenience being withdrawn here, deliberately and on request.

   WHY 9 HAPPENED. imodeQuickSwitch() in js/33 signed in with a fixed UAT password, so
   switching accounts needed no password at all. It is still
   a real sign-in through ImodeAuth; what it skipped was the human proving who they are.
   The password box is now asked for, and the same ImodeAuth call verifies it, so lockout,
   expiry and the audit trail are unchanged.

   WHAT THIS COSTS, stated plainly: a technician who reloads the page, or whose phone
   browser evicts the tab mid-job, signs in again. Nothing typed into a saved form is lost —
   every screen persists through saveLocal() — but it is one more step, every time. That is
   the trade this asks for. Undo it by deleting this file; nothing else depends on it.

   The customer path is untouched and must stay that way: a machine QR, ?serial=, and the
   LINE rich-menu routes have no account behind them at all, so every one of those URLs is
   exempt before anything else here runs. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 /* The same URL test js/01 uses, kept in step with it deliberately: if one of these ever
    grows a new customer route, both have to learn it. */
 function customerRoute(){
  try{
   return /[?&]machineToken=/.test(location.search)
       || /[?&]serial=/.test(location.search)
       || /[?&]page=(customer-entry|scan|customer-portal|customer-home)\b/.test(location.search)
       || /#\/(customer-portal|customer-home|customer-entry|scan)/.test(location.hash)
       || /customer-portal/.test(location.hash);
  }catch(e){return false}
 }

 /* ------------------------------------------------------- 1. the front door ---- */
 /* currentUser is a top-level `let` in js/03 — a lexical global, shared across classic
    scripts and absent from window — so it is cleared by bare identifier. Assigning to an
    existing binding is legal in strict mode; only creating an implicit global is not. */
 function clearSession(){
  try{currentUser=null}catch(e){}
  try{localStorage.removeItem('imode_v5_current_user')}catch(e){}
  try{localStorage.removeItem('imode_v69_session')}catch(e){}
 }

 /* WITHDRAWN 2026-09-11, on the owner's instruction: "การที่ต้องล็อคอินบ่อยๆ มันทำให้เสียเวลา
    ไปเยอะมาก อยากให้แก้เป็นล็อคอินแค่รอบเดียว ตอนเปลี่ยน Account หรือตอนเข้าเว็บครั้งแรก".

    gate() used to run at DOMContentLoaded and clear the session on EVERY page load, which is
    what item 8 above asked for. It stopped being a small cost the moment a case became its
    own document: service-case-detail.html means มอบหมายงาน, นัดหมายบริการ, ทำใบเสนอราคา,
    เริ่มงานหน้างาน, เปลี่ยนสถานะ, the ‹ arrow, the logo and the bell are each a full page
    load — measured, 8 of 9 exits landed back on the login door.

    The door is now the one place it was always meant to be: a visitor with no session at all.
    js/11's bootRoute() has always done that and still does, so nothing has to run here. The
    session's life is governed by settings.authConfig (sessionHours / idleMinutes) and by
    signing out, exactly as auth-core.js intends.

    Part 2 below is UNCHANGED and is the half the owner still wants: switching account asks
    for the password every time. clearSession() is kept because that is the switch's own
    business, not the front door's. */
 void clearSession;   /* still used by nothing here; kept for part 2's sake and for reverting */

 /* ------------------------------------------------- 2. switching needs a password ---- */
 var pending='';
 window.imodeSwitchSubmit=function(){
  var pwBox=document.getElementById('swPass');
  var errBox=document.getElementById('swError');
  var pw=pwBox?String(pwBox.value||''):'';
  var user=pending;
  if(!user)return;
  if(!pw){
   if(errBox){errBox.textContent=tl('กรุณากรอกรหัสผ่าน','Please type the password');errBox.hidden=false}
   if(pwBox)pwBox.focus();
   return;
  }
  if(typeof window.imodeSignIn!=='function'){
   toast(tl('ระบบเข้าสู่ระบบยังไม่พร้อม','Sign-in is not ready'));
   return;
  }
  var btn=document.getElementById('swGo');
  if(btn){btn.disabled=true;btn.textContent=tl('กำลังตรวจสอบ…','Checking…')}
  Promise.resolve(window.imodeSignIn(user,pw)).then(function(res){
   if(res&&res.ok===false)throw new Error(res.error||'');
   /* imodeSignIn routes to the role Home page itself; the popup on top of it is ours. */
   pending='';
   try{if(typeof closeModal==='function')closeModal()}catch(e){}
   var who=user;
   try{if(currentUser&&currentUser.name)who=currentUser.name}catch(e){}
   toast(tl('เข้าใช้งานเป็น ','Signed in as ')+who+tl(' แล้ว',''));
  }).catch(function(err){
   /* Looked up now, never captured earlier: a failed sign-in can re-render the page under
      the popup, and writing to a detached node is how the part-5 staff-login bug hid. */
   var e2=document.getElementById('swError'),p2=document.getElementById('swPass'),
       b2=document.getElementById('swGo');
   if(e2){
    e2.textContent=(err&&err.message)||tl('รหัสผ่านไม่ถูกต้อง','That password is not correct');
    e2.hidden=false;
   }
   if(p2){p2.value='';p2.focus()}
   if(b2){b2.disabled=false;b2.textContent=tl('เข้าสู่ระบบ','Sign in')}
  });
 };

 /* Replaces js/33's version outright rather than wrapping it: the whole point is that the
    old one signed in on the click, so there is nothing of it left to run. */
 window.imodeQuickSwitch=function(username){
  var acc=null;
  try{acc=(window.uatAuth&&window.uatAuth.findAccount)?window.uatAuth.findAccount(username):null}catch(e){}
  var label=(acc&&acc.name)||username;
  var role=(acc&&(acc.role||(acc.accountType==='technician'?tl('ช่าง','Technician'):'')))||'';
  pending=username;
  if(typeof window.openModal!=='function'){
   toast(tl('เปิดหน้าต่างเข้าสู่ระบบไม่ได้','The sign-in dialog could not be opened'));
   return;
  }
  window.openModal(tl('เข้าสู่ระบบเป็น ','Sign in as ')+label,
   username+(role?' · '+role:''),
   '<div class="swbox">'
   +'<p class="swbox-note">'+esc2(tl('ต้องกรอกรหัสผ่านทุกครั้งก่อนเข้าใช้งาน',
                                     'The password is required every time before you go in'))+'</p>'
   +'<div class="field"><label for="swPass">'+esc2(tl('รหัสผ่าน','Password'))+'</label>'
   +'<input id="swPass" type="password" autocomplete="current-password" '
   +'placeholder="'+esc2(tl('รหัสผ่านของ ','Password for '))+esc2(username)+'"></div>'
   +'<div id="swError" class="swbox-error" hidden></div>'
   +'<div class="button-row"><button type="button" class="soft-btn" onclick="closeModal()">'
   +esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" id="swGo" class="primary-btn action-3d-orange" onclick="imodeSwitchSubmit()">'
   +esc2(tl('เข้าสู่ระบบ','Sign in'))+'</button></div>'
   +'</div>',true);
  setTimeout(function(){
   var pw=document.getElementById('swPass');
   if(!pw)return;
   pw.focus();
   pw.addEventListener('keydown',function(ev){
    if(ev.key==='Enter'){ev.preventDefault();window.imodeSwitchSubmit()}
   });
  },40);
 };

 /* The quick-switch card still says "กดเพื่อเข้าใช้งานด้วยบัญชีนั้นทันที", which is no longer
    what happens. js/33 builds that text inside a closure, so the line is corrected on the
    rendered popup instead of forking the template. */
 var baseLoginModal=window.openUserLoginModal;
 if(typeof baseLoginModal==='function'){
  window.openUserLoginModal=function(){
   var r=baseLoginModal.apply(this,arguments);
   setTimeout(function(){
    try{
     var hint=document.querySelector('#modalBody .acctsw-head small');
     if(hint)hint.textContent=tl('กดบัญชีแล้วกรอกรหัสผ่านเพื่อเข้าใช้งาน',
                                 'Tap an account, then type its password to sign in');
    }catch(e){}
   },40);
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70LoginGateStyle';
 st.textContent=''
 +'.swbox-note{margin:0 0 12px;font-size:12.5px;line-height:1.6;color:#5b6b88}'
 +'.swbox .field{margin-bottom:10px}'
 +'.swbox-error{margin:0 0 12px;padding:9px 12px;border-radius:11px;background:#fdeaea;'
 +'border:1px solid #f6cccc;color:#b32020;font-size:12.5px;font-weight:700}'
 +'.swbox-error[hidden]{display:none!important}';
 document.head.appendChild(st);
})();
