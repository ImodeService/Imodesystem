/* Beta — the admin owns the login accounts: add, rename, re-password, delete.

   Asked for: "อยากให้ admin สามารถเพิ่ม Account เปลี่ยน User เปลี่ยน password ของทุกบัญชี
   ได้ แล้วก็สามารถลบบัญชีได้ด้วย อยากให้อยู่ในตั้งค่า/การจัดการบัญชีผู้ใช้".

   Until now the seven accounts were a `const STAFF` array in js/09 with SHA-256 hashes
   baked into the source. Adding a person meant editing and redeploying the site.

   WHERE THE ACCOUNTS LIVE NOW

   settings.uatAccounts       accounts the admin created
   settings.uatAccountEdits   changes to the seven built-ins, keyed by their original
                              username: a new hash, a new username, a new link, or
                              {deleted:true}

   Both are inside the existing settings object, so they need no new storage key, they are
   pushed to system_settings by cloudSaveSettings(), and every other device picks them up
   on its next sync. That matters: an account created on the office PC has to work on the
   technician's phone. mergeSettings() spreads `raw` wholesale, so unknown top-level keys
   survive it — checked, because a whitelist there is exactly what silently ate four
   permissions in an earlier session.

   The built-in array is never rewritten. Deleting a built-in records a tombstone; the
   admin can put it back. Deleting an account the admin created removes it outright,
   because there is nothing underneath to fall back to.

   WHY THE REGISTRY FUNCTIONS ARE REPLACED, NOT WRAPPED

   js/09's findAccount(), verify() and login() all call its own closure allAccounts() —
   not window.uatAuth.allAccounts. Replacing only the window view would leave a created
   account visible in every list and still unable to sign in, which is precisely the leak
   that let a deleted customer account keep signing in two sessions ago. So verify() and
   findAccount() are reimplemented here over the merged list. They are the two the local
   auth provider calls, so this is what actually decides who gets in.

   window.uatSubmitLogin — the legacy modal form — called the js/09 closure directly and
   would have bypassed all of this, so it is re-pointed at window.imodeSignIn, the same
   entry point the staff door uses.

   TWO THINGS THIS REFUSES TO DO

   1. Delete the account you are signed in as. You would still be holding a session for an
      account that no longer exists.
   2. Delete the last account that can reach this screen. There would then be no way back
      into account management on any device.
   Renaming the account currently in use is allowed, but its cached session is cleared and
   the page reloads so the admin signs in again with the new username.

   Passwords go through the application's own policy (ImodeAuth.checkPasswordPolicy), the
   same one "change password" uses. The seven built-ins predate that policy and do not
   satisfy it — that is why they still work and a new one like them would be refused.

   A password an admin sets here is stored as a hash in settings and therefore applies on
   every device. A password the user changed themselves through "change password" is a
   per-device override in imode_v69_local_pw and wins locally, so setting a password here
   clears that override on this device. On another device that user's own change would
   still win until they sign in and change it again. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function key(u){return String(u||'').trim().toLowerCase()}
 function reg(){return window.uatAuth||null}
 function hashOf(pw){var r=reg();return (r&&typeof r.hash==='function')?r.hash(pw):null}

 /* ------------------------------------------------------------------ the store -- */
 function store(){
  try{
   if(!Array.isArray(settings.uatAccounts))settings.uatAccounts=[];
   if(!settings.uatAccountEdits||typeof settings.uatAccountEdits!=='object')settings.uatAccountEdits={};
   return {added:settings.uatAccounts,edits:settings.uatAccountEdits};
  }catch(e){return {added:[],edits:{}}}
 }
 function persist(){
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }

 /* The seven from js/09, before anything here touched them. Captured as a function rather
    than a value because js/09 builds the list fresh each call. */
 var baseAll=null;
 function builtIns(){
  try{return (typeof baseAll==='function')?(baseAll.call(reg())||[]):[]}catch(e){return []}
 }

 function merged(){
  var st=store(),out=[],seen={};
  builtIns().forEach(function(a){
   var ed=st.edits[key(a.username)];
   if(ed&&ed.deleted)return;
   var row={};
   for(var k in a)if(Object.prototype.hasOwnProperty.call(a,k))row[k]=a[k];
   row.builtIn=true;
   row.originalUsername=a.username;
   if(ed){
    if(ed.username)row.username=ed.username;
    if(ed.hash)row.hash=ed.hash;
    if(ed.name)row.name=ed.name;
    if(ed.role)row.role=ed.role;
    if(typeof ed.team==='string')row.team=ed.team;
    if(typeof ed.technicianId==='string')row.technicianId=ed.technicianId;
    if(ed.accountType)row.accountType=ed.accountType;
    /* 2026-09-23 — the edit patch is applied field by field, so a field not named here is
       silently dropped on the next load. That is why a profile photo set on one of the seven
       BUILT-IN accounts came back empty after a reload: js/97 saved it, and this rebuilt the
       row without it. `typeof === 'string'` rather than truthiness, so clearing a photo
       ('' on purpose) is kept too. */
    if(typeof ed.photo==='string')row.photo=ed.photo;
   }
   out.push(row);
   seen[key(row.username)]=1;
  });
  st.added.forEach(function(a){
   if(!a||!a.username)return;
   if(seen[key(a.username)])return;         /* a created account never shadows a built-in */
   var row={};
   for(var k in a)if(Object.prototype.hasOwnProperty.call(a,k))row[k]=a[k];
   row.builtIn=false;
   out.push(row);
   seen[key(row.username)]=1;
  });
  return out;
 }
 function find(u){
  var k=key(u);
  return merged().filter(function(a){return key(a.username)===k})[0]||null;
 }
 function deletedBuiltIns(){
  var st=store();
  return builtIns().filter(function(a){var e=st.edits[key(a.username)];return !!(e&&e.deleted)});
 }

 /* ------------------------------------------------------- take over the registry -- */
 var r0=reg();
 if(r0){
  baseAll=r0.allAccounts;
  r0.allAccounts=function(){return merged()};
  r0.findAccount=function(u){return find(u)};
  r0.verify=function(username,password){
   var acc=find(username);
   if(!acc)return null;
   var h=hashOf(password);
   if(!h||h!==acc.hash)return null;
   return {account:acc,user:r0.accountToUser(acc)};
  };
  r0.login=function(username,password){
   var res=r0.verify(username,password);
   if(!res)return null;
   if(typeof r0.setSessionUser==='function')r0.setSessionUser(res.user);
   return res.account;
  };
 }
 /* The legacy modal form called the js/09 closure, which the lines above cannot reach.
    Sending it through the one sign-in entry point also gives it the lockout, expiry and
    audit trail every other door already had. */
 window.uatSubmitLogin=function(e){
  if(e&&e.preventDefault)e.preventDefault();
  var uEl=document.getElementById('uatLoginUser'),
      pEl=document.getElementById('uatLoginPass'),
      errEl=document.getElementById('uatLoginError');
  var u=uEl?uEl.value:'',p=pEl?pEl.value:'';
  if(typeof window.imodeSignIn!=='function')return;
  Promise.resolve(window.imodeSignIn(u,p)).then(function(res){
   var err=document.getElementById('uatLoginError');
   var pw=document.getElementById('uatLoginPass');
   if(res&&res.ok){
    if(typeof closeModal==='function')closeModal();
    if(typeof renderAll==='function')renderAll();
    return;
   }
   /* Looked up again rather than closed over: a failed sign-in can re-render the page. */
   if(err){err.textContent=(res&&res.message)||tl('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','Incorrect username or password');err.classList.add('show')}
   if(pw){pw.value='';pw.focus()}
  });
 };

 /* --------------------------------------------------------------------- guards --- */
 function meUser(){try{return currentUser||null}catch(e){return null}}
 function meName(){var u=meUser();return u&&u.username?u.username:''}
 function roleCan(roleName,perm){
  try{
   var role=(settings.roles||[]).filter(function(r){return r.name===roleName})[0];
   return !!(role&&Array.isArray(role.permissions)&&role.permissions.indexOf(perm)>=0);
  }catch(e){return false}
 }
 function adminCapable(){
  return merged().filter(function(a){return roleCan(a.role,'users.manage')});
 }
 function checkPolicy(pw,username){
  try{
   if(window.ImodeAuth&&typeof window.ImodeAuth.checkPasswordPolicy==='function')
    return window.ImodeAuth.checkPasswordPolicy(pw,username);
  }catch(e){}
  return (String(pw||'').length>=8)?{ok:true}:{ok:false,message:tl('รหัสผ่านอย่างน้อย 8 ตัวอักษร','At least 8 characters')};
 }

 /* ----------------------------------------------------------------- operations --- */
 function setEdit(original,patch){
  var st=store(),k=key(original);
  st.edits[k]=Object.assign({},st.edits[k]||{},patch);
 }

 window.imodeAccountSave=function(originalUsername,data){
  var acc=originalUsername?find(originalUsername):null;
  /* 2026-09-28: the ROLE decides whether an account is a field technician (owner's choice;
     js/113 imodeIsTechRole). Applied only to a new account or a role that really changed, so
     a photo save can never re-link or unlink anybody. A technician role with no record gets
     one from createRecordFor() below. */
  if(data&&data.role&&typeof window.imodeIsTechRole==='function'&&(!acc||String(acc.role||'')!==String(data.role))){
   data=Object.assign({},data,{accountType:window.imodeIsTechRole(data.role)?'technician':'staff'});
  }
  var uname=String(data.username||'').trim();
  if(!uname)return {ok:false,message:tl('กรุณากรอกชื่อผู้ใช้','Please enter a username')};
  if(/\s/.test(uname))return {ok:false,message:tl('ชื่อผู้ใช้ต้องไม่มีช่องว่าง','A username cannot contain spaces')};
  var clash=find(uname);
  if(clash&&(!acc||key(clash.username)!==key(acc.username)))
   return {ok:false,message:tl('มีชื่อผู้ใช้นี้อยู่แล้ว','That username already exists')};
  var renamingMe=!!(acc&&key(acc.username)===key(meName())&&key(uname)!==key(acc.username));
  /* 2026-09-15 item 3: a technician account with no record no longer fails — it gets one.
     This has to happen HERE, before the guard below, not after the save: the guard is what
     used to reject it, so an auto-create placed further down was never reached at all.
     An account being edited that already points at a live record is untouched. */
  /* 2026-09-25: only when the account has NO record at all. An id this device merely does not
     hold (a stale device, a list that failed to save) is not a missing record — creating a new
     one there re-linked tech_demo1 and tech_demo2 to fresh ids when their passwords were reset, and
     the old records, still carrying their work, were then swept away. */
  if(data.accountType==='technician'&&!String(data.technicianId||'').trim()){
   var autoId=createRecordFor({username:uname,name:data.name,role:data.role,team:data.team},data.team);
   if(autoId)data=Object.assign({},data,{technicianId:autoId});
  }
  if(data.accountType==='technician'&&!String(data.technicianId||'').trim())
   return {ok:false,message:tl('บัญชีช่างต้องเลือกระเบียนช่าง','A technician account must be linked to a technician record')};

  var hash=null;
  var pw=String(data.password||'');
  if(pw){
   var pol=checkPolicy(pw,uname);
   if(!pol.ok)return {ok:false,message:pol.message||tl('รหัสผ่านไม่ผ่านเงื่อนไข','Password rejected')};
   hash=hashOf(pw);
   if(!hash)return {ok:false,message:tl('เข้ารหัสรหัสผ่านไม่สำเร็จ','Could not hash the password')};
  }else if(!acc){
   return {ok:false,message:tl('บัญชีใหม่ต้องตั้งรหัสผ่าน','A new account needs a password')};
  }

  var fields={username:uname,name:String(data.name||'').trim(),role:data.role||'',
    team:String(data.team||''),accountType:data.accountType||'staff',
    technicianId:data.accountType==='technician'?String(data.technicianId||'').trim():''};
  /* Same rule: only a caller that really sent a photo may change one. */
  if(data.photo!==undefined)fields.photo=String(data.photo||'');

  if(!acc){
   var row=Object.assign({},fields,{hash:hash,createdAt:new Date().toISOString(),createdBy:meName()});
   store().added.push(row);
  }else if(acc.builtIn){
   var patch=Object.assign({},fields);
   if(hash)patch.hash=hash;
   setEdit(acc.originalUsername,patch);
  }else{
   var st=store();
   for(var i=0;i<st.added.length;i++){
    if(key(st.added[i].username)!==key(acc.username))continue;
    st.added[i]=Object.assign({},st.added[i],fields);
    if(hash)st.added[i].hash=hash;
    break;
   }
  }
  /* A device-local "change password" override would otherwise keep winning here. */
  if(hash&&window.ImodeAuthLocal&&typeof window.ImodeAuthLocal.resetLocalOverride==='function'){
   try{window.ImodeAuthLocal.resetLocalOverride(uname);window.ImodeAuthLocal.resetLocalOverride(acc?acc.username:uname)}catch(e){}
  }
  /* ...and so would a lockout left by the wrong guesses that made the reset necessary (2026-09-25). */
  if(hash&&typeof window.imodeClearSignInLock==='function'){window.imodeClearSignInLock(uname);if(acc)window.imodeClearSignInLock(acc.username)}
  persist();
  /* The cached auth session still contains the old username. Sign out after saving instead
     of leaving a ghost session that no longer matches any account. */
  if(renamingMe){
   try{if(window.ImodeAuth&&typeof window.ImodeAuth.signOut==='function')window.ImodeAuth.signOut()}catch(e){}
   try{localStorage.removeItem('imode_v69_session')}catch(e){}
   try{currentUser=null;if(typeof saveLocal==='function')saveLocal()}catch(e){}
   setTimeout(function(){try{location.reload()}catch(e){}},350);
  }
  return {ok:true,signedOut:renamingMe};
 };
 function hasRecord(id){
  if(!id)return false;
  try{return !!(Array.isArray(technicians)?technicians:[]).filter(function(t){return t.id===id})[0]}
  catch(e){return false}
 }

 window.imodeAccountDelete=function(username){
  var acc=find(username);
  if(!acc)return {ok:false,message:tl('ไม่พบบัญชีนี้','No such account')};
  if(key(acc.username)===key(meName()))
   return {ok:false,message:tl('ลบบัญชีที่กำลังใช้งานอยู่ไม่ได้','You cannot delete the account you are signed in as')};
  var admins=adminCapable();
  if(admins.length<=1&&admins.filter(function(a){return key(a.username)===key(acc.username)}).length)
   return {ok:false,message:tl('นี่คือบัญชีสุดท้ายที่เข้าหน้าจัดการบัญชีได้ ลบไม่ได้',
                               'This is the last account that can reach account management')};
  if(acc.builtIn)setEdit(acc.originalUsername,{deleted:true});
  else{
   var st=store();
   settings.uatAccounts=st.added.filter(function(a){return key(a.username)!==key(acc.username)});
  }
  persist();
  return {ok:true};
 };

 window.imodeAccountRestore=function(originalUsername){
  var st=store(),k=key(originalUsername);
  if(st.edits[k])delete st.edits[k].deleted;
  persist();
  return {ok:true};
 };

 window.imodeAccountList=merged;
 /* 2026-09-15: js/64 opens this same form from the ทีมช่าง page, so there is one account form
    in the project rather than a second one to keep in step. The submit and cancel handlers
    live on #modalBody (see wire()), which is where js/64 inserts it, so the form works there
    with no wiring of its own. Exported rather than duplicated. */
 window.imodeAccountForm=formHTML;
 window.imodeAccountWire=wire;
 window.imodeAccountSyncTypeFields=syncTypeFields;
 window.imodeAccountFind=find;
 /* js/64 saves the form itself (it has no account list to refresh), so it needs the same
    reader this file's own submit handler uses — one way of reading the form, not two. */
 window.imodeAccountRead=readForm;

 /* ------------------------------------------------------------------- the screen -- */
 function techOptions(sel){
  var list=[];
  try{list=Array.isArray(technicians)?technicians:[]}catch(e){}
  return '<option value="">'+esc2(tl('— เลือกระเบียนช่าง —','— pick a technician record —'))+'</option>'
   +list.map(function(t){
    return '<option value="'+esc2(t.id)+'"'+(t.id===sel?' selected':'')+'>'
     +esc2(t.name)+' · '+esc2(t.id)+' · '+esc2(t.team||'Technical')+'</option>';
   }).join('');
 }
 /* The five teams live in js/03's TEAM_META (a lexical const, so read by bare identifier —
    window.TEAM_META is undefined, the trap this project has hit repeatedly). The fallback keeps
    this file working on its own if that ever moves. */
 function teamOptions(sel){
  var list=[];
  try{list=(typeof TEAM_LIST!=='undefined'&&TEAM_LIST.length)?TEAM_LIST.slice():[]}catch(e){}
  if(!list.length)list=['Technical','R&D','Admin','Sales','Management'];
  if(sel&&list.indexOf(sel)<0)list.push(sel);
  return list.map(function(n){
   var label=n;
   try{if(typeof teamLabel==='function')label=teamLabel(n)}catch(e){}
   return '<option value="'+esc2(n)+'"'+(n===sel?' selected':'')+'>'+esc2(label)+'</option>';
  }).join('');
 }
 function roleOptions(sel){
  var list=[];
  try{list=(settings.roles||[]).map(function(r){return r.name})}catch(e){}
  if(sel&&list.indexOf(sel)<0)list.push(sel);
  return list.map(function(n){
   return '<option value="'+esc2(n)+'"'+(n===sel?' selected':'')+'>'+esc2(n)+'</option>';
  }).join('');
 }
 function formHTML(acc){
  var a=acc||{accountType:'technician',team:'Technical'};
  var isMe=acc&&key(acc.username)===key(meName());
  return '<form class="acctmg-form" data-original="'+esc2(acc?acc.username:'')+'">'
   +'<div class="acctmg-grid">'
   +'<label><span>'+esc2(tl('ชื่อผู้ใช้','Username'))+' *</span>'
   +'<input name="username" value="'+esc2(a.username||'')+'" autocomplete="off"></label>'
   +'<label><span>'+esc2(tl('ชื่อที่แสดง','Display name'))+'</span>'
   +'<input name="name" value="'+esc2(a.name||'')+'" autocomplete="off"></label>'
   +'<label><span>'+esc2(tl('ประเภทบัญชี','Account type'))+'</span>'
   +'<select name="accountType">'
   +'<option value="technician"'+(a.accountType==='technician'?' selected':'')+'>'+esc2(tl('ช่าง','Technician'))+'</option>'
   +'<option value="staff"'+(a.accountType!=='technician'?' selected':'')+'>'+esc2(tl('พนักงานสำนักงาน','Office staff'))+'</option>'
   +'</select></label>'
   +'<label><span>'+esc2(tl('บทบาท / สิทธิ์','Role'))+'</span>'
   +'<select name="role">'+roleOptions(a.role||'')+'</select></label>'
   +'<label><span>'+esc2(tl('ทีม','Team'))+'</span>'
   +'<select name="team">'+teamOptions(a.team||'')+'</select></label>'
   +'<label class="acctmg-tech"><span>'+esc2(tl('ผูกกับระเบียนช่าง','Technician record'))+'</span>'
   +'<select name="technicianId">'+techOptions(a.technicianId||'')+'</select></label>'
   +'<label class="acctmg-wide"><span>'
   +esc2(acc?tl('รหัสผ่านใหม่ (เว้นว่างไว้ถ้าไม่เปลี่ยน)','New password (leave blank to keep it)')
             :tl('รหัสผ่าน','Password'))+(acc?'':' *')+'</span>'
   +'<input name="password" type="text" autocomplete="new-password" placeholder="'
   +esc2(tl('อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข','At least 8 characters, letters and digits'))+'"></label>'
   +'</div>'
   +(isMe?'<p class="acctmg-note">'+esc2(tl('นี่คือบัญชีที่กำลังใช้งานอยู่ หากเปลี่ยนชื่อผู้ใช้ ระบบจะออกจากระบบเพื่อให้เข้าสู่ระบบใหม่ด้วยชื่อใหม่',
                                            'This account is signed in. Renaming it signs you out so you can sign in with the new username.'))+'</p>':'')
   +'<div class="acctmg-actions">'
   +'<button type="button" class="acctmg-btn" data-act="cancel">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="submit" class="acctmg-btn is-primary">'+esc2(acc?tl('บันทึก','Save'):tl('เพิ่มบัญชี','Add account'))+'</button>'
   +'</div></form>';
 }
 /* Does this account point at a record that actually exists? A technicianId left over from a
    deleted record counts as unlinked — it is exactly the case ผูกบัญชี is there to repair. */
 function linkedRecord(a){
  if(!a)return null;
  var uid=String(a.userId||'');
  if(uid){
   try{
    var people=(typeof demoUsers!=='undefined'&&Array.isArray(demoUsers))?demoUsers:[];
    var person=people.filter(function(u){return u.id===uid})[0]||null;
    if(person)return {kind:'employee',record:person};
   }catch(e){}
  }
  if(a.accountType!=='technician')return null;
  var id=String(a.technicianId||'');
  if(!id)return null;
  try{
   var tech=(Array.isArray(technicians)?technicians:[]).filter(function(t){return t.id===id})[0]||null;
   return tech?{kind:'technician',record:tech}:null;
  }
  catch(e){return null}
 }
 function rowHTML(a){
  var me=key(a.username)===key(meName());
  var rec=linkedRecord(a);
  var unlinked=!rec;
  var link;
  if(rec){
   link=esc2((rec.kind==='employee'?tl('พนักงาน · ','Employee · '):tl('ทีมงาน · ','Team member · '))
     +(rec.record.name||rec.record.id));
  }else if(a.accountType==='technician'){
   link='<em class="acctmg-unlinked">'+esc2(a.technicianId
              ?tl('ระเบียนที่ผูกไว้หายไป','The linked record is missing')
              :tl('ยังไม่ผูกกับระเบียนทีมงาน','Not linked to a team record'))+'</em>';
  }else{
   link='<em class="acctmg-unlinked">'+esc2(tl('ยังไม่ผูกกับระเบียนพนักงาน','Not linked to an employee record'))+'</em>';
  }
  /* 2026-09-15 item 1: the whole bar opens the editor. Reaching for a small แก้ไข button on a
     long row is fussy, and every other list in this project (มอบหมายงาน, คำขอ, ประวัติคำขอ)
     already works this way. role="button" + tabindex so Enter and Space work too. */
  return '<div class="acctmg-row'+(me?' is-current':'')+(unlinked?' is-unlinked':'')+'"'
   +' data-user="'+esc2(a.username)+'" role="button" tabindex="0"'
   +' aria-label="'+esc2(tl('แก้ไขบัญชี ','Edit the account ')+a.username)+'">'
   +'<div class="acctmg-id"><b>'+esc2(a.username)+'</b>'
   +(me?'<i>'+esc2(tl('ใช้งานอยู่','signed in'))+'</i>':'')
   +(a.builtIn?'':'<u>'+esc2(tl('สร้างเอง','created'))+'</u>')
   +'<small>'+link+'</small></div>'
   +'<span class="acctmg-role">'+esc2(a.role||'-')+'</span>'
   +'<span class="acctmg-team">'+esc2(a.team?(typeof teamLabel==='function'?teamLabel(a.team):a.team):'-')+'</span>'
   +'<div class="acctmg-ops">'
   /* item 2: a way to attach an account that has no team record — either to an existing one
      or to a record created on the spot. Only offered where it means something. */
   +(unlinked&&a.accountType==='technician'?'<button type="button" class="acctmg-mini is-link" data-act="link">🔗 '
     +esc2(tl('ผูกบัญชี','Link'))+'</button>':'')
   +'<button type="button" class="acctmg-mini" data-act="history">'+esc2(tl('ข้อมูล / ประวัติ','Details / history'))+'</button>'
   +'<button type="button" class="acctmg-mini" data-act="edit">'+esc2(tl('แก้ไข','Edit'))+'</button>'
   +'<button type="button" class="acctmg-mini is-danger" data-act="del"'+(me?' disabled':'')+'>'
   +esc2(tl('ลบ','Delete'))+'</button>'
   +'</div><div class="acctmg-slot"></div></div>';
 }
 function employeeLinkSummary(){
  var people=[];
  try{people=(typeof demoUsers!=='undefined'&&Array.isArray(demoUsers))?demoUsers:[]}catch(e){}
  var list=merged(),linked={};
  list.forEach(function(a){if(a&&a.userId)linked[a.userId]=a.username});
  var missing=people.filter(function(p){return !linked[p.id]});
  var legacy=list.filter(function(a){return !a.userId});
  return '<div class="acctmg-link-summary">'
   +'<div><b>'+esc2(tl('การผูกบัญชีกับพนักงานจริง','Real employee account links'))+'</b>'
   +'<small>'+esc2(tl('ผูกแล้ว ','Linked ')+(people.length-missing.length)+' / '+people.length)+'</small></div>'
   +(missing.length?'<div class="acctmg-link-warning"><b>'+esc2(tl('พนักงานที่ยังไม่มีบัญชี','Employees without accounts'))+' ('+missing.length+')</b><span>'
     +missing.map(function(p){return esc2(p.name||p.id)}).join(' · ')+'</span></div>'
    :'<span class="acctmg-link-ok">✓ '+esc2(tl('พนักงานจริงมีบัญชีครบทุกคน','Every real employee has an account'))+'</span>')
   +(legacy.length?'<div class="acctmg-link-warning"><b>'+esc2(tl('บัญชีเดิมที่ยังไม่ผูกพนักงานจริง','Legacy accounts not linked to a real employee'))+' ('+legacy.length+')</b><span>'
     +legacy.map(function(a){return esc2(a.username)}).join(' · ')+'</span></div>':'')
   +'</div>';
 }
 function relatedRows(acc){
  var tid=String(acc&&acc.technicianId||''),names=[acc&&acc.name,acc&&acc.username].filter(Boolean);
  try{
   var tech=(Array.isArray(technicians)?technicians:[]).filter(function(t){return t.id===tid})[0];
   if(tech&&tech.name)names.push(tech.name);
  }catch(e){}
  function named(v){return names.indexOf(String(v||''))>=0}
  var cs=[],reports=[],qcs=[],expenses=[],quotes=[];
  try{cs=(Array.isArray(cases)?cases:[]).filter(function(c){
   var ids=Array.isArray(c.assignees)?c.assignees:String(c.assignee||'').split(',');
   return (tid&&ids.indexOf(tid)>=0)||named(c.createdBy)||named(c.updatedBy)||named(c.coordinator);
  })}catch(e){}
  try{reports=(Array.isArray(serviceReports)?serviceReports:[]).filter(function(r){return (tid&&r.techId===tid)||named(r.technicianName)||named(r.technician)})}catch(e){}
  try{qcs=(Array.isArray(qcRecords)?qcRecords:[]).filter(function(q){return named(q.inspector)||named(q.reviewer)})}catch(e){}
  try{expenses=(typeof pettyCashEntries!=='undefined'&&Array.isArray(pettyCashEntries)?pettyCashEntries:[]).filter(function(x){return named(x.requester)})}catch(e){}
  try{quotes=(Array.isArray(quotations)?quotations:[]).filter(function(q){return named(q.authorizedBy)||named(q.preparedBy)})}catch(e){}
  /* One record can match on more than one test (the technician id AND a name field), and a
     duplicate row here would read as duplicated work. Deduped by id, which is what identifies
     a record — two rows that survive this really are two records. */
  function uniq(list){
   var seen={};
   return (list||[]).filter(function(x){
    var k=x&&(x.id||x.ticket||x.reportNo);
    if(!k||seen[k])return false;
    seen[k]=1;return true;
   });
  }
  return {cases:uniq(cs),reports:uniq(reports),qcs:uniq(qcs),expenses:uniq(expenses),quotes:uniq(quotes)};
 }
 function accountHistoryHTML(acc){
  if(!acc)return '<p class="empty">'+esc2(tl('ไม่พบข้อมูลบัญชี','Account not found'))+'</p>';
  var rel=relatedRows(acc),total=rel.cases.length+rel.reports.length+rel.qcs.length+rel.expenses.length+rel.quotes.length;
  function section(title,list,line){
   return '<section class="accthist-sec"><b>'+esc2(title)+' ('+list.length+')</b>'
    +(list.length?'<div class="accthist-list">'+list.map(line).join('')+'</div>'
      :'<small>'+esc2(tl('ยังไม่มีข้อมูล','No records'))+'</small>')+'</section>';
  }
  /* Every row opens the record it names. They are all popups, so js/29 stacks them over this
     screen and ‹ comes straight back — the point of this page is to look through somebody's
     work without losing your place in it. */
  function row(call,id,head,sub){
   if(!id)return '<div>'+'<b>'+esc2(head)+'</b><small>'+esc2(sub)+'</small></div>';
   return '<button type="button" class="accthist-row" onclick="'+esc2(call)+'('+imodeJsArg(id)+')">'
    +'<b>'+esc2(head)+'</b><small>'+esc2(sub)+'</small><i aria-hidden="true">›</i></button>';
  }
  return '<div class="accthist-head"><div><b>'+esc2(acc.username||'-')+'</b><small>'+esc2(acc.name||'-')+' · '+esc2(acc.role||'-')+' · '+esc2(acc.team||'-')+'</small></div>'
   +'<span>'+total+' '+esc2(tl('รายการที่เกี่ยวข้อง','related records'))+'</span></div>'
   +'<div class="accthist-note">'+esc2(tl('การลบบัญชีจะลบเฉพาะสิทธิ์เข้าสู่ระบบ ข้อมูลพนักงาน งาน และเอกสารด้านล่างจะยังอยู่ครบ',
      'Deleting the login removes access only. The employee, jobs and documents below remain intact.'))+'</div>'
   +section(tl('เคสงานบริการ','Service cases'),rel.cases,function(c){
     return row('openCaseDetail',c.id,c.ticket||c.id||'-',(c.customer||'')+' · '+(c.status||''))})
   +section(tl('ใบตรวจช่าง','Inspection sheets'),rel.reports,function(r){
     return row('previewServiceReport',r.id,r.reportNo||r.id||'-',r.workType||r.serviceType||'')})
   +section(tl('เอกสาร QC','QC documents'),rel.qcs,function(q){
     return row('imodeAccountOpenQc',q.id,q.qcNo||q.id||'-',(q.type||'')+' · '+(q.status||''))})
   +section(tl('ใบเสนอราคา','Quotations'),rel.quotes,function(q){
     return row('imodeOpenQuoteDoc',q.id,q.quoteNo||q.id||'-',q.status||'')})
   +section(tl('ค่าใช้จ่าย','Expenses'),rel.expenses,function(x){
     return row('openPettyCashPreview',x.id,x.docNo||x.id||'-',(x.purpose||'')+' · '+(x.amount||0)+' บาท')});
 }
 /* openQcPreviewRecord() takes the RECORD, not an id — the only one of the five that does,
    so the lookup lives here rather than in the row template. qcRecords is a top-level let in
    js/03: a lexical global, read by bare identifier and never on window. */
 window.imodeAccountOpenQc=function(id){
  var q=null;
  try{q=(Array.isArray(qcRecords)?qcRecords:[]).filter(function(x){return x&&x.id===id})[0]}catch(e){}
  if(!q){toast(tl('ไม่พบเอกสาร QC นี้','That QC document was not found'));return}
  if(typeof window.openQcPreviewRecord==='function')window.openQcPreviewRecord(q);
 };
 window.imodeAccountHistoryHTML=accountHistoryHTML;
 window.imodeOpenAccountHistory=function(username){
  var acc=find(username);if(!acc)return;
  openModal(tl('ข้อมูลและประวัติบัญชี','Account details and history'),
    tl('ดูข้อมูลที่เชื่อมโยงโดยไม่เปลี่ยนหรือลบประวัติงาน','View linked information without changing work history'),
    accountHistoryHTML(acc)+'<div class="button-row"><button type="button" class="soft-btn" onclick="openAccountAdminModal()">← '+esc2(tl('กลับไปจัดการบัญชี','Back to accounts'))+'</button></div>',true);
  var p=document.getElementById('modalPanel');if(p)p.classList.add('large');
 };
 /* 2026-09-23: the list is grouped — one section per Role, with the UAT test accounts in a
    section of their own at the end. The group is DERIVED from the account's role at render
    time, and refresh() rebuilds the whole box after a save, so changing a role moves the row
    into its new section with nothing extra to keep in step.
    A test account is recognised by its username ending in _test / _testN, which is the UAT
    naming convention every one of them follows — not by a hard-coded list, so a test account
    added later lands in the right place by itself. */
 function isTestAccount(a){return /_test\d*$/i.test(String((a&&a.username)||''))}
 function groupsOf(list){
  var order=[],bag={};
  try{
   (settings.roles||[]).forEach(function(r){
    if(r&&r.name&&!bag[r.name]){order.push(r.name);bag[r.name]=[]}
   });
  }catch(e){}
  var test=[],none=[];
  list.forEach(function(a){
   if(isTestAccount(a)){test.push(a);return}
   var r=String(a.role||'').trim();
   if(!r){none.push(a);return}
   if(!bag[r]){bag[r]=[];order.push(r)}
   bag[r].push(a);
  });
  var out=order.filter(function(n){return bag[n]&&bag[n].length})
               .map(function(n){return {name:n,rows:bag[n]}});
  if(none.length)out.push({name:tl('ยังไม่ได้กำหนดบทบาท','No role set'),rows:none});
  if(test.length)out.push({name:tl('บัญชีทดสอบ','Test accounts'),rows:test,test:true});
  return out;
 }
 function groupedListHTML(list){
  return groupsOf(list).map(function(g){
   return '<div class="acctmg-group'+(g.test?' is-test':'')+'">'
    +'<div class="acctmg-group-head"><b>'+esc2(g.name)+'</b><span>'+g.rows.length+'</span></div>'
    +'<div class="acctmg-list">'+g.rows.map(rowHTML).join('')+'</div></div>';
  }).join('');
 }
 function boxHTML(){
  var list=merged();
  return '<div class="acctmg-box">'
   +'<div class="acctmg-head"><div><b>'+esc2(tl('บัญชีเข้าสู่ระบบ','Login accounts'))+' ('+list.length+')</b>'
   +'<small>'+esc2(tl('เพิ่ม เปลี่ยนชื่อผู้ใช้ เปลี่ยนรหัสผ่าน และลบบัญชีได้ที่นี่ · แก้สิทธิ์ของแต่ละบทบาทที่ ผู้ใช้งานและสิทธิ์',
                     'Add, rename, re-password and delete here · change what each role may do in Users & permissions'))+'</small></div>'
   +'<button type="button" class="acctmg-btn is-primary" data-act="new">＋ '+esc2(tl('เพิ่มบัญชี','Add account'))+'</button></div>'
   +employeeLinkSummary()
   +'<div class="acctmg-newslot"></div>'
   +groupedListHTML(list)
   +'<div class="acctmg-gone"><b>'+esc2(tl('บัญชีที่ลบไปแล้ว','Deleted accounts'))+'</b>'
     +'<button type="button" class="acctmg-mini" onclick="closeModal();goPage(\'trash\')">'
     +esc2(tl('ดูข้อมูล / กู้คืนที่ถังขยะ','View details / restore in the bin'))+' ›</button></div>'
   +'</div>';
 }

 /* ------------------------------------------------- item 2: ผูกบัญชี ---- */
 /* An account with no team record gets one of two things: attached to a record that already
    exists, or a record created for it from what the account already knows. Both write through
    imodeAccountSave()/saveTech's own shape — nothing here invents a second storage path. */
 function recordOptions(){
  var list=[];
  try{list=Array.isArray(technicians)?technicians:[]}catch(e){}
  /* A record that already belongs to another account is not offered: two logins pointing at
     one person is the state ผูกบัญชี exists to avoid, not to create. */
  var taken={};
  try{
   merged().forEach(function(a){
    if(a.accountType==='technician'&&a.technicianId)taken[a.technicianId]=a.username;
   });
  }catch(e){}
  return list.map(function(t){
   var who=taken[t.id];
   return '<option value="'+esc2(t.id)+'"'+(who?' disabled':'')+'>'
    +esc2(t.name||t.id)+' · '+esc2(t.team||'Technical')
    +(who?esc2(tl(' (ใช้กับ ','  (used by ')+who+')'):'')+'</option>';
  }).join('');
 }
 /* The record shape is saveTech()'s (js/03:1209) exactly — same fields, same id convention —
    so a record made here is indistinguishable from one added on the ทีมงาน page. */
 function createRecordFor(acc,team){
  if(!acc)return '';
  var id='T'+Date.now();
  var rec={id:id,name:acc.name||acc.username,role:acc.role||'',team:team||'Technical',
           phone:'',email:'',status:'พร้อมรับงาน',skills:'',color:'#0b63e5',photo:''};
  try{
   if(!Array.isArray(technicians))return '';
   technicians.push(rec);
   if(typeof saveLocal==='function')saveLocal();
   if(typeof cloudUpsert==='function'){try{cloudUpsert('technicians',rec)}catch(e){}}
  }catch(e){return ''}
  return id;
 }
 /* 2026-09-23: the edit form used to appear and vanish in one frame. It slides now, with the
    recipe this project already proved on the case page (part 30): pin the real height, force a
    reflow so there is a value to animate FROM, then run to the target.
    Two things that look like nothing and are not: the open animates to scrollHeight rather
    than to a large max-height cap — with a cap the value passes the content height within a
    few frames and the whole thing still looks instant — and the emptying happens at the END
    of the collapse, because an element that has already been removed cannot transition. */
 function motionOk(){
  try{return !window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return true}
 }
 function slideIn(slot){
  if(!slot)return;
  if(!motionOk()){slot.style.maxHeight='';slot.style.opacity='';return}
  slot.classList.add('is-sliding');
  slot.style.maxHeight='0px';slot.style.opacity='0';
  void slot.offsetHeight;
  slot.style.maxHeight=slot.scrollHeight+'px';slot.style.opacity='1';
  /* js/97 adds the photo block through a MutationObserver, i.e. after this measurement, so
     the target is taken again once that has landed — otherwise the form is clipped mid-slide. */
  setTimeout(function(){
   if(slot.classList.contains('is-sliding'))slot.style.maxHeight=slot.scrollHeight+'px';
  },60);
  clearTimeout(slot.__slideT);
  slot.__slideT=setTimeout(function(){
   /* let it size itself again, so a photo loading later cannot be clipped */
   slot.style.maxHeight='';slot.classList.remove('is-sliding');
  },340);
 }
 function slideShut(slot,after){
  if(!slot)return;
  if(!slot.innerHTML||!motionOk()){
   slot.innerHTML='';slot.style.maxHeight='';slot.style.opacity='';
   if(after)after();
   return;
  }
  slot.classList.add('is-sliding');
  slot.style.maxHeight=slot.scrollHeight+'px';
  void slot.offsetHeight;
  slot.style.maxHeight='0px';slot.style.opacity='0';
  clearTimeout(slot.__slideT);
  slot.__slideT=setTimeout(function(){
   slot.innerHTML='';slot.style.maxHeight='';slot.style.opacity='';
   slot.classList.remove('is-sliding');
   if(after)after();
  },300);
 }
 function toggleSlot(slot,html){
  if(!slot)return;
  if(slot.innerHTML)slideShut(slot);
  else{slot.innerHTML=html;slideIn(slot)}
 }
 function openLinkPanel(row,acc){
  if(!row||!acc)return;
  var slot=row.querySelector('.acctmg-slot');
  if(!slot)return;
  if(slot.innerHTML){slideShut(slot);return}
  slot.innerHTML='<div class="acctmg-link" data-user="'+esc2(acc.username)+'">'
   +'<p class="acctmg-note">'+esc2(tl('ผูกบัญชีนี้กับระเบียนในหน้าทีมงาน เพื่อให้รับงาน มอบหมายงาน และขึ้นในปฏิทินได้',
                                      'Link this account to a team record so it can be assigned work and appear on the calendar'))+'</p>'
   +'<div class="acctmg-grid">'
   +'<label><span>'+esc2(tl('ผูกกับระเบียนที่มีอยู่','Link to an existing record'))+'</span>'
   +'<select name="linkTo"><option value="">'+esc2(tl('— เลือกระเบียน —','— pick a record —'))+'</option>'
   +recordOptions()+'</select></label>'
   +'<label><span>'+esc2(tl('หรือสร้างระเบียนใหม่ในทีม','Or create a new record in team'))+'</span>'
   +'<select name="linkTeam">'+teamOptions(acc.team||'Technical')+'</select></label>'
   +'</div>'
   +'<div class="acctmg-actions">'
   +'<button type="button" class="acctmg-btn" data-act="cancel-link">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" class="acctmg-btn" data-act="link-new">＋ '+esc2(tl('สร้างระเบียนใหม่','Create a record'))+'</button>'
   +'<button type="button" class="acctmg-btn is-primary" data-act="link-save">'+esc2(tl('ผูกบัญชี','Link'))+'</button>'
   +'</div></div>';
  slideIn(slot);
 }
 function doLink(row,useExisting){
  var box=row.querySelector('.acctmg-link');
  if(!box)return;
  var acc=find(box.getAttribute('data-user'));
  if(!acc)return;
  var recId='';
  if(useExisting){
   var sel=box.querySelector('[name="linkTo"]');
   recId=sel?String(sel.value||''):'';
   if(!recId){toast(tl('กรุณาเลือกระเบียน หรือกดสร้างระเบียนใหม่','Pick a record, or create one'));return}
  }else{
   var teamSel=box.querySelector('[name="linkTeam"]');
   var team=teamSel?String(teamSel.value||'Technical'):'Technical';
   recId=createRecordFor(acc,team);
   if(!recId){toast(tl('สร้างระเบียนไม่สำเร็จ','Could not create the record'));return}
  }
  var res=window.imodeAccountSave(acc.username,{
   username:acc.username,name:acc.name||'',accountType:'technician',
   role:acc.role||'',team:acc.team||'Technical',technicianId:recId,password:''});
  toast(res&&res.ok?tl('ผูกบัญชีแล้ว','Account linked'):((res&&res.message)||tl('ผูกไม่สำเร็จ','Could not link')));
  if(res&&res.ok){
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
   refresh();
  }
 }
 /* After a save the list is redrawn, which closes the form and puts the row back looking
    exactly as it did — so on its own a successful edit looked like nothing had happened. The
    row that was saved flashes and carries a chip for a moment, and is scrolled into view. */
 function flashSaved(username,label){
  var b=document.getElementById('modalBody');
  if(!b)return;
  var row=[].filter.call(b.querySelectorAll('.acctmg-row'),function(r){
   return key(r.getAttribute('data-user'))===key(username);
  })[0];
  if(!row)return;
  row.classList.add('is-saved');
  var id=row.querySelector('.acctmg-id');
  if(id&&!id.querySelector('.acctmg-saved')){
   var chip=document.createElement('span');
   chip.className='acctmg-saved';
   chip.textContent=label;
   id.appendChild(chip);
  }
  try{row.scrollIntoView({block:'nearest',behavior:'smooth'})}catch(e){}
  setTimeout(function(){
   row.classList.remove('is-saved');
   var c=row.querySelector('.acctmg-saved');
   if(c)c.parentNode.removeChild(c);
  },2800);
 }
 function readForm(form){
  function v(n){var el=form.querySelector('[name="'+n+'"]');return el?el.value:''}
  var out={username:v('username'),name:v('name'),accountType:v('accountType'),
           role:v('role'),team:v('team'),technicianId:v('technicianId'),password:v('password')};
  /* js/97 adds the profile photo to this form. It is only sent when the field is really
     there, so a form rendered without it can never blank a photo that is already saved. */
  if(form.querySelector('[name="photo"]'))out.photo=v('photo');
  return out;
 }
 function refresh(){
  var box=document.querySelector('#modalBody .acctmg-box');
  if(!box)return;
  box.outerHTML=boxHTML();
  syncTypeFields();
 }
 /* The technician link only means something for a technician account. Hidden rather than
    removed so the form can be read back without branching. */
 function syncTypeFields(){
  [].slice.call(document.querySelectorAll('#modalBody .acctmg-form')).forEach(function(f){
   var t=f.querySelector('[name="accountType"]'),cell=f.querySelector('.acctmg-tech');
   if(!t||!cell)return;
   cell.style.display=(t.value==='technician')?'':'none';
  });
 }

 function wire(){
  var b=document.getElementById('modalBody');
  if(!b||b.__acctmgWired)return;
  b.__acctmgWired=true;
  b.addEventListener('click',function(e){
   var t=e.target;
   if(!t||!t.closest)return;
   var act=t.closest('[data-act]');
   if(!act||!b.contains(act))return;
   var a=act.getAttribute('data-act');
   if(a==='new'){
    /* 2026-09-23: the new-account form used to unfold inside the list and push every row
       down. It opens as its own popup now. js/29 stacks popups, so this sits ON TOP of
       การจัดการบัญชีผู้ใช้ and ‹ steps back to it; the list is then rebuilt from data,
       because what js/29 restores is a snapshot of the markup and would not show the
       account that was just added. */
    if(typeof window.openModal==='function'){
     window.openModal(tl('เพิ่มบัญชีผู้ใช้','Add an account'),
       tl('ตั้งชื่อผู้ใช้ รหัสผ่าน และบทบาทของบัญชีใหม่','Set the username, password and role of the new account'),
       '<div class="acctmg-box acctmg-box-modal">'+formHTML(null)+'</div>',true);
     syncTypeFields();
     return;
    }
    var slot=b.querySelector('.acctmg-newslot');
    if(slot)slot.innerHTML=slot.innerHTML?'':formHTML(null);
    syncTypeFields();
    return;
   }
   if(a==='restore'){
    window.imodeAccountRestore(act.getAttribute('data-user'));
    toast(tl('คืนค่าบัญชีแล้ว','Account restored'));
    refresh();
    return;
   }
   var row=act.closest('.acctmg-row');
   if(!row)return;
   var user=row.getAttribute('data-user');
   if(a==='edit'){
    var s=row.querySelector('.acctmg-slot');
    if(s)toggleSlot(s,formHTML(find(user)));
    syncTypeFields();
   }else if(a==='link'){
    openLinkPanel(row,find(user));
   }else if(a==='history'){
    window.imodeOpenAccountHistory(user);
   }else if(a==='del'){
    var acc=find(user),message=tl('ต้องการลบบัญชี ','Delete account ')+user+tl(' ใช่หรือไม่?','?')+'\n'
      +tl('ระบบจะลบเฉพาะบัญชีเข้าสู่ระบบ ข้อมูลพนักงาน เคส ประวัติงาน ใบตรวจ QC และค่าใช้จ่ายจะยังอยู่ครบ',
          'Only the login will be removed. Employee data, cases, work history, inspection sheets, QC and expenses will remain.');
    var remove=function(){
     var res=window.imodeAccountDelete(user);
     toast(res.ok?tl('ลบบัญชีแล้ว ข้อมูลประวัติยังอยู่ครบ','Account deleted; related history was kept'):res.message);
     if(res.ok)refresh();
    };
    if(typeof window.imodeConfirm==='function'){
     window.imodeConfirm({title:tl('ยืนยันลบบัญชี','Delete account'),message:message,danger:true,
       okText:tl('ลบบัญชี','Delete account')}).then(function(ok){if(ok)remove()});
    }else if(confirm(message))remove();
   }else if(a==='cancel'){
    var f=act.closest('.acctmg-form');
    /* In the add popup, ยกเลิก means close the popup and go back to the list. */
    if(f&&f.closest('.acctmg-box-modal')){
     if(typeof window.imodeModalBack==='function')window.imodeModalBack();
     else if(typeof closeModal==='function')closeModal();
     return;
    }
    if(f)slideShut(f.parentElement);
   }else if(a==='cancel-link'){
    var lb=act.closest('.acctmg-link');
    if(lb)slideShut(lb.parentElement);
   }else if(a==='link-save'){
    doLink(row,true);
   }else if(a==='link-new'){
    doLink(row,false);
   }
  });
  /* item 1: the bar itself opens the editor. Anything that is already a control keeps its own
     job — the ops buttons, and every field inside an open form or link panel, which live
     inside the row and would otherwise re-close it on every click. */
  b.addEventListener('click',function(e){
   var t=e.target;
   if(!t||!t.closest)return;
   var row=t.closest('.acctmg-row');
   if(!row||!b.contains(row))return;
   if(t.closest('[data-act]')||t.closest('button,a,input,select,textarea,label,form'))return;
   var s=row.querySelector('.acctmg-slot');
   if(s)toggleSlot(s,formHTML(find(row.getAttribute('data-user'))));
   syncTypeFields();
  });
  b.addEventListener('keydown',function(e){
   if(['Enter',' ','Spacebar'].indexOf(e.key)<0)return;
   var row=e.target&&e.target.closest&&e.target.closest('.acctmg-row');
   if(!row||e.target!==row)return;
   e.preventDefault();
   var s=row.querySelector('.acctmg-slot');
   if(s)toggleSlot(s,formHTML(find(row.getAttribute('data-user'))));
   syncTypeFields();
  });
  b.addEventListener('change',function(e){
   if(e.target&&e.target.name==='accountType')syncTypeFields();
  });
  b.addEventListener('submit',function(e){
   var f=e.target;
   if(!f||!f.classList||!f.classList.contains('acctmg-form'))return;
   e.preventDefault();
   var original=f.getAttribute('data-original')||'';
   var data=readForm(f);
   /* A disabled input is not read back, so the locked username is restored here. */
   if(original&&!data.username)data.username=original;
   var res=window.imodeAccountSave(original,data);
   toast(res.ok?(original?tl('บันทึกบัญชี ','Saved ')+data.username+tl(' แล้ว','')
                         :tl('เพิ่มบัญชี ','Added ')+data.username+tl(' แล้ว','')):res.message);
   if(res.ok){
    /* Saved from the add popup: step back to the list first, then rebuild it from data. */
    if(f.closest('.acctmg-box-modal')){
     if(typeof window.imodeModalBack==='function')window.imodeModalBack();
     else if(typeof window.openAccountAdminModal==='function')window.openAccountAdminModal();
     /* history.back() resolves on popstate, which is a later task, so the list is waited
        for rather than assumed — refresh() would otherwise rebuild the popup's own box. */
     var tries=0;
     (function whenBack(){
      if(!document.querySelector('#modalBody .acctmg-box:not(.acctmg-box-modal)')&&tries++<20){
       setTimeout(whenBack,30);return;
      }
      refresh();
      flashSaved(data.username,tl('✓ เพิ่มแล้ว','✓ Added'));
     })();
     return;
    }
    refresh();
    flashSaved(data.username,original?tl('✓ บันทึกแล้ว','✓ Saved'):tl('✓ เพิ่มแล้ว','✓ Added'));
   }
  });
 }

 var baseAdmin=window.openAccountAdminModal;
 if(typeof baseAdmin==='function'){
  window.openAccountAdminModal=function(){
   var r=baseAdmin.apply(this,arguments);
   var b=document.getElementById('modalBody');
   if(!b)return r;
   /* js/33 renders a read-only table; this replaces it in place so there is one list. */
   var old=b.querySelector('.acctadm-box');
   if(old)old.outerHTML=boxHTML();
   else b.insertAdjacentHTML('afterbegin',boxHTML());
   wire();
   syncTypeFields();
   return r;
  };
 }

 var st2=document.createElement('style');
 st2.id='v70AccountManageStyle';
 st2.textContent=''
 +'.acctmg-box{border:1px solid #d8e2f2;border-radius:14px;padding:13px;margin-bottom:14px;'
 +'background:linear-gradient(180deg,#f7faff,#fff)}'
 +'.acctmg-head{display:flex;align-items:flex-start;gap:10px}'
 +'.acctmg-head>div{flex:1;min-width:0}'
 +'.acctmg-head b{display:block;font-size:13.5px;color:#0c225e}'
 +'.acctmg-head small{display:block;font-size:11px;color:#6f81a3;margin-top:2px;line-height:1.5}'
 +'.acctmg-list{margin-top:10px;display:grid;gap:6px}'
 +'.acctmg-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) 80px auto;'
 +'align-items:center;gap:8px;padding:9px 11px;border:1px solid #e2eaf7;border-radius:11px;background:#fff}'
 +'.acctmg-row.is-current{border-color:#079455;background:#f4fcf8}'
 +'.acctmg-id{min-width:0}'
 +'.acctmg-id b{font-size:12.5px;color:#12356f;word-break:break-all}'
 +'.acctmg-id i{font-style:normal;font-size:9.5px;font-weight:800;color:#079455;margin-left:6px}'
 +'.acctmg-id u{text-decoration:none;font-size:9.5px;font-weight:800;color:#9a4c07;margin-left:6px;'
 +'background:#fff2e2;border-radius:99px;padding:1px 7px}'
 +'.acctmg-id small{display:block;font-size:10.5px;color:#7d8ca7;margin-top:1px}'
 +'.acctmg-role,.acctmg-team{font-size:11px;color:#41567c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.acctmg-ops{display:flex;gap:6px}'
 +'.acctmg-slot{grid-column:1/-1;overflow:hidden;transition:max-height .3s cubic-bezier(.2,.8,.3,1),opacity .22s ease}'
 +'.acctmg-slot .acctmg-form{animation:acctmgRise .32s cubic-bezier(.2,.8,.3,1) both}'
 +'@keyframes acctmgRise{from{transform:translateY(-6px)}to{transform:none}}'
 +'@media(prefers-reduced-motion:reduce){.acctmg-slot{transition:none}'
 +'.acctmg-slot .acctmg-form{animation:none}}'
 +'.acctmg-slot:empty{display:none}'
 +'.accthist-row{width:100%;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;'
 +'border:1px solid transparent;border-radius:10px;padding:9px 11px;background:#f6f9ff;color:inherit;font:inherit}'
 +'.accthist-row b{flex:none;font-size:12.5px;color:#12356f}'
 +'.accthist-row small{flex:1;min-width:0;text-align:right;font-size:11px;color:#6f81a3;'
 +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.accthist-row i{flex:none;font-style:normal;color:#9fb2d0;font-size:14px}'
 +'.accthist-row:hover{background:#eaf2ff;border-color:#b9d3f5}'
 +'.accthist-row:hover i{color:#0b63e5}'
 +'.accthist-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.acctmg-box-modal{border:0;padding:0;margin:0;background:none}'
 +'.acctmg-newslot:empty{display:none}'
 +'.acctmg-newslot{margin-top:10px}'
 +'.acctmg-mini{border:1px solid #cfe0fa;background:#fff;color:#0b63e5;border-radius:9px;'
 +'padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'
 +'.acctmg-mini:hover{background:#eaf3ff}'
 +'.acctmg-mini.is-danger{color:#c02626;border-color:#f3cdcd}'
 +'.acctmg-mini.is-danger:hover{background:#fdeeee}'
 +'.acctmg-mini[disabled]{opacity:.42;cursor:not-allowed}'
 /* item 1: the bar is the button, so it has to look like one. */
 +'.acctmg-row[role="button"]{cursor:pointer}'
 +'.acctmg-row[role="button"]:hover{border-color:#b9d3f5;background:#f6faff}'
 +'.acctmg-row[role="button"]:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* item 2: an account with nobody behind it on the ทีมงาน page. */
 +'.acctmg-row.is-unlinked{border-left:3px solid #f0a42a}'
 +'.acctmg-unlinked{font-style:normal;color:#a8660c}'
 +'.acctmg-link-summary{display:grid;gap:8px;margin:10px 0 12px;padding:12px;border:1px solid #d8e4f3;border-radius:12px;background:#f8fbff}'
 +'.acctmg-link-summary>div:first-child{display:flex;justify-content:space-between;gap:12px}.acctmg-link-summary small{color:#5b6b88}'
 +'.acctmg-link-ok{color:#087a45;font-weight:700}.acctmg-link-warning{display:grid;gap:3px;color:#8a5a17;font-size:12px}.acctmg-link-warning span{overflow-wrap:anywhere}'
 +'.accthist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #d8e4f3;border-radius:12px;background:#f7faff}.accthist-head div{display:grid;gap:3px}.accthist-head small{color:#5b6b88}.accthist-head span{font-weight:800;color:#0b63e5}'
 +'.accthist-note{margin:10px 0;padding:10px 12px;border:1px solid #f1d39b;border-radius:10px;background:#fff9ed;color:#7a5310;font-size:12px}.accthist-sec{margin-top:10px;padding:11px;border:1px solid #e1e8f3;border-radius:11px}.accthist-sec>b{display:block;color:#102d69;margin-bottom:7px}.accthist-sec>small{color:#71809b}.accthist-list{display:grid;gap:6px}.accthist-list>div{display:flex;justify-content:space-between;gap:12px;padding:7px 9px;border-radius:8px;background:#f7f9fd}.accthist-list small{color:#65738d;text-align:right}'
 +'.acctmg-mini.is-link{border-color:#f3c98b;color:#a8660c;background:#fffaf2}'
 +'.acctmg-mini.is-link:hover{background:#fff3e2}'
 +'.acctmg-link{margin-top:9px;padding:11px;border:1px dashed #f0cf9f;border-radius:11px;background:#fffaf3}'
 /* The saved row flashes green and carries a chip, then settles. */
 +'.acctmg-row.is-saved{border-color:#12a150;background:#effbf3;box-shadow:0 0 0 3px rgba(18,161,80,.18);'
 +'animation:acctmgSaved .9s ease-out}'
 +'@keyframes acctmgSaved{0%{box-shadow:0 0 0 0 rgba(18,161,80,.45)}100%{box-shadow:0 0 0 3px rgba(18,161,80,.18)}}'
 +'.acctmg-saved{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;'
 +'background:#12a150;color:#fff;font-size:10.5px;font-weight:800;vertical-align:middle}'
 +'@media (prefers-reduced-motion:reduce){.acctmg-row.is-saved{animation:none}}'
 +'.acctmg-form{margin-top:9px;padding:11px;border:1px dashed #c9dcf6;border-radius:11px;background:#f4f9ff}'
 +'.acctmg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px}'
 +'.acctmg-grid label{display:flex;flex-direction:column;gap:4px;min-width:0}'
 +'.acctmg-grid label.acctmg-wide{grid-column:1/-1}'
 +'.acctmg-grid span{font-size:10.5px;font-weight:700;color:#41567c}'
 +'.acctmg-grid input,.acctmg-grid select{width:100%;padding:8px 10px;border:1px solid #d3e0f4;'
 +'border-radius:9px;font-size:12.5px;font-family:inherit;background:#fff;color:#12233f}'
 +'.acctmg-grid input[disabled]{background:#eef2f8;color:#7d8ca7}'
 +'.acctmg-note{margin:8px 0 0;font-size:10.5px;color:#9a4c07}'
 +'.acctmg-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}'
 +'.acctmg-btn{border:1px solid #cfe0fa;background:#fff;color:#12233f;border-radius:10px;'
 +'padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'
 +'.acctmg-btn.is-primary{border-color:transparent;color:#fff;'
 +'background:linear-gradient(180deg,#ff9a4d,#f2711c);box-shadow:0 4px 0 #c9560f}'
 +'.acctmg-btn.is-primary:active{box-shadow:0 1px 0 #c9560f;transform:translateY(3px)}'
 +'.acctmg-gone{margin-top:11px;padding-top:10px;border-top:1px dashed #d8e4f6;display:flex;'
 +'flex-wrap:wrap;align-items:center;gap:7px}'
 +'.acctmg-gone b{font-size:11px;color:#7385a5;margin-right:3px}'
 +'@media (max-width:640px){'
 +'.acctmg-row{grid-template-columns:1fr auto;row-gap:6px}'
 +'.acctmg-role,.acctmg-team{grid-column:1/-1}'
 +'.acctmg-grid{grid-template-columns:1fr}}';
 document.head.appendChild(st2);
 var st3=document.createElement('style');
 st3.id='v70AccountGroupStyle';
 st3.textContent=''
 +'.acctmg-group{margin-top:12px}'
 +'.acctmg-group-head{display:flex;align-items:center;gap:8px;padding:0 2px 5px}'
 +'.acctmg-group-head b{font-size:11.5px;font-weight:800;letter-spacing:.03em;color:#12356f;'
 +'text-transform:uppercase}'
 +'.acctmg-group-head span{font-size:10.5px;font-weight:700;color:#41567c;background:#eaf1fd;'
 +'border-radius:999px;padding:1px 8px}'
 +'.acctmg-group-head::after{content:"";flex:1;height:1px;background:#e2eaf7}'
 +'.acctmg-group .acctmg-list{margin-top:0}'
 +'.acctmg-group.is-test .acctmg-group-head b{color:#8a5a17}'
 +'.acctmg-group.is-test .acctmg-group-head span{color:#8a5a17;background:#fff7ec}'
 +'.acctmg-group.is-test .acctmg-group-head::after{background:#f6dcb8}'
 +'.acctmg-group.is-test .acctmg-row{background:#fffdf8;border-color:#f0e2cc}';
 document.head.appendChild(st3);

 /* 2026-09-25 — REPORTED: tech_demo1 could not sign in even after an admin set a new password, while
    tech_demo2 could. Reproduced: five wrong guesses lock the username for 15 minutes
    (auth-core, imode_v69_auth_lock) and nothing an admin did lifted it — the new password was
    correct and still answered "locked". tech_demo2 had simply been guessed fewer times.

    The lock is per DEVICE, so clearing it on the admin's PC (imodeAccountSave above) is not
    enough for the technician's own phone. So the lock remembers which password hash it was set
    against, and a sign-in on any device drops a lock whose account has had its password changed
    since: an admin reset lifts the lock everywhere once the new settings have synced. A lock
    against an unchanged password stays exactly as it was. */
 (function(){
  var LOCK='imode_v69_auth_lock';
  function rd(){try{return JSON.parse(localStorage.getItem(LOCK)||'{}')||{}}catch(e){return {}}}
  function wr(o){try{localStorage.setItem(LOCK,JSON.stringify(o))}catch(e){}}
  function k(u){return String(u||'').trim().toLowerCase()}
  function curHash(u){try{var a=window.uatAuth&&window.uatAuth.findAccount(u);return a&&a.hash||''}catch(e){return ''}}
  window.imodeClearSignInLock=function(u){var o=rd();if(o[k(u)]){delete o[k(u)];wr(o)}};
  var A=window.ImodeAuth;
  if(!A||typeof A.signIn!=='function')return;
  var base=A.signIn;
  A.signIn=function(u){
   var h=curHash(u),o=rd(),r=o[k(u)];
   if(r&&r.pwHash&&h&&r.pwHash!==h){delete o[k(u)];wr(o)}
   return Promise.resolve(base.apply(this,arguments)).then(function(res){
    if(res&&res.reason==='locked'){
     var o2=rd(),r2=o2[k(u)];if(r2&&!r2.pwHash&&h){r2.pwHash=h;wr(o2)}
     res.message=(res.message||'')+' หรือให้แอดมินตั้งรหัสผ่านใหม่เพื่อปลดล็อก';
    }
    return res;
   });
  };
 })();
})();
