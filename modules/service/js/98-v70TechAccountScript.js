/* Beta 1.0 — 2026-09-23: create the login account while adding a Service employee.
   Asked for directly: "ตรงนี้คือ pop up ของปุ่มเพิ่มพนักงาน ผมอยากให้ตอนเพิ่มพนักงานสามารถ
   เพิ่ม Account ได้เลย". Before this, adding a person and giving them a way in were two
   separate screens, and forgetting the second one is exactly how two accounts ended up
   pointing at technician records that no longer existed (part 29).

   Nothing about accounts is reimplemented here: the block collects a username, a password and
   a role, and hands them to window.imodeAccountSave() — js/39's single writer, which owns the
   password policy, the duplicate-username check and where the row is stored. js/03 is not
   edited; saveTech() is wrapped, and a top-level `async function` declaration IS a window
   property, so the `techForm.onsubmit=saveTech` that js/03 sets on a timer picks up this
   wrapper rather than the original. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof toastMsg==='function')toastMsg(m)}
 function accounts(){
  try{
   if(typeof window.imodeAccountList==='function')return window.imodeAccountList()||[];
   if(window.uatAuth&&typeof window.uatAuth.allAccounts==='function')return window.uatAuth.allAccounts()||[];
  }catch(e){}
  return [];
 }
 function accountsFor(tid){
  if(!tid)return [];
  return accounts().filter(function(a){return a&&a.technicianId===tid});
 }
 function roleOptions(sel){
  var list=[];
  try{list=(settings.roles||[]).map(function(r){return r.name})}catch(e){}
  if(!list.length)list=['Technician'];
  if(sel&&list.indexOf(sel)<0)list.push(sel);
  return list.map(function(n){
   return '<option value="'+esc2(n)+'"'+(n===sel?' selected':'')+'>'+esc2(n)+'</option>';
  }).join('');
 }
 /* Technician is the sensible default for this form, but only if that role really exists —
    a role list an admin has renamed must not silently produce an account with no role. */
 function defaultRole(){
  var names=[];
  try{names=(settings.roles||[]).map(function(r){return r.name})}catch(e){}
  if(names.indexOf('Technician')>=0)return 'Technician';
  var tech=names.filter(function(n){return /technician|ช่าง/i.test(n)})[0];
  return tech||names[0]||'Technician';
 }

 function blockHTML(tid){
  var linked=accountsFor(tid);
  if(linked.length){
   /* A button, not a notice: the owner asked to be able to go straight from here to the
      account. js/29 stacks popups, so the account screen opens ON TOP and ‹ comes back. */
   return '<button type="button" class="techacc is-linked" data-act="manage">'
    +'<b>🔑 '+esc2(tl('บัญชีเข้าระบบ','Login account'))+'</b>'
    +'<small>'+esc2(tl('ช่างคนนี้ใช้บัญชี ','This person signs in as ')
      +linked.map(function(a){return a.username}).join(' · '))+'</small>'
    +'<span class="techacc-go">'+esc2(tl('จัดการบัญชีผู้ใช้','Manage the account'))+' ›</span>'
    +'</button>';
  }
  var isNew=!tid;
  var free=freeAccounts();
  return '<div class="techacc">'
   +'<label class="techacc-on"><input type="checkbox" id="tacOn"'+(isNew?' checked':'')+'>'
   +'<span><b>🔑 '+esc2(tl('สร้างบัญชีเข้าระบบให้ด้วย','Create a login account too'))+'</b>'
   +'<small>'+esc2(tl('ช่างต้องมีบัญชีถึงจะเห็นงานของตัวเองและเปิดหน้างานได้',
                      'A technician needs an account to see their own jobs and open the field workspace'))+'</small></span></label>'
   +'<div class="techacc-fields" id="tacFields">'
   +(free.length?'<div class="techacc-modes">'
     +'<label><input type="radio" name="tacMode" value="new" id="tacModeNew" checked> '
     +esc2(tl('สร้างบัญชีใหม่','Create a new account'))+'</label>'
     +'<label><input type="radio" name="tacMode" value="link" id="tacModeLink"> '
     +esc2(tl('ใช้บัญชีที่มีอยู่แล้ว','Use an existing account'))+'</label>'
     +'</div>'
     +'<div class="techacc-grid" id="tacLinkWrap" style="display:none">'
     +'<label class="techacc-wide"><span>'+esc2(tl('เลือกบัญชี','Pick the account'))+'</span>'
     +'<select id="tacLink">'+free.map(function(a){
        return '<option value="'+esc2(a.username)+'">'+esc2(a.username)
         +(a.name?' · '+esc2(a.name):'')+(a.role?' · '+esc2(a.role):'')+'</option>';
       }).join('')+'</select></label></div>':'')
   +'<div class="techacc-grid" id="tacNewWrap">'
   +'<label><span>'+esc2(tl('ชื่อผู้ใช้','Username'))+' *</span>'
   +'<input id="tacUser" autocomplete="off" placeholder="'+esc2(tl('เช่น somchai','e.g. somchai'))+'"></label>'
   +'<label><span>'+esc2(tl('รหัสผ่าน','Password'))+' *</span>'
   +'<input id="tacPass" type="text" autocomplete="new-password" placeholder="'
   +esc2(tl('อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข','At least 8 characters, letters and digits'))+'"></label>'
   +'<label class="techacc-wide"><span>'+esc2(tl('บทบาท / สิทธิ์','Role'))+'</span>'
   +'<select id="tacRole">'+roleOptions(defaultRole())+'</select></label>'
   +'</div></div></div>';
 }
 /* An account that could be linked: a login that is not already pointing at a live technician
    record. One record per login is the rule ผูกบัญชี exists to keep (js/39), so an account that
    already has one is not offered. */
 function freeAccounts(){
  var live={};
  try{(Array.isArray(technicians)?technicians:[]).forEach(function(t){if(t)live[t.id]=1})}catch(e){}
  return accounts().filter(function(a){
   return a&&a.username&&!(a.technicianId&&live[a.technicianId]);
  });
 }

 function sync(){
  var on=document.getElementById('tacOn'),box=document.getElementById('tacFields');
  if(on&&box)box.style.display=on.checked?'':'none';
  var link=document.getElementById('tacModeLink');
  var lw=document.getElementById('tacLinkWrap'),nw=document.getElementById('tacNewWrap');
  var useLink=!!(link&&link.checked);
  if(lw)lw.style.display=useLink?'':'none';
  if(nw)nw.style.display=useLink?'none':'';
 }

 var baseOpen=window.openTechnicianModal;
 if(typeof baseOpen==='function'){
  window.openTechnicianModal=function(tid){
   var r=baseOpen.apply(this,arguments);
   try{
    var form=document.getElementById('techForm');
    if(!form)return r;
    /* The LAST .button-row — the photo picker has one of its own at the top of the form, and
       inserting before that one put the account fields above ชื่อ-นามสกุล. */
    var rows=form.querySelectorAll('.button-row');
    var row=rows.length?rows[rows.length-1]:null;
    if(row)row.insertAdjacentHTML('beforebegin',blockHTML(String(tid||'')));
    else form.insertAdjacentHTML('beforeend',blockHTML(String(tid||'')));
    var on=document.getElementById('tacOn');
    if(on)on.addEventListener('change',sync);
    ['tacModeNew','tacModeLink'].forEach(function(id){
     var el=document.getElementById(id);
     if(el)el.addEventListener('change',sync);
    });
    var manage=form.querySelector('[data-act="manage"]');
    if(manage)manage.addEventListener('click',function(){
     if(typeof window.openAccountAdminModal==='function')window.openAccountAdminModal();
    });
    sync();
   }catch(e){}
   return r;
  };
 }

 /* saveTech() ends with closeModal(), so everything typed here is read BEFORE it runs. */
 var baseSave=window.saveTech;
 if(typeof baseSave==='function'){
  window.saveTech=async function(e){
   var on=document.getElementById('tacOn');
   var want=!!(on&&on.checked);
   var wanted=null,linkTo='';
   var modeLink=document.getElementById('tacModeLink');
   if(want&&modeLink&&modeLink.checked){
    linkTo=String((document.getElementById('tacLink')||{}).value||'');
    if(!linkTo){
     if(e&&e.preventDefault)e.preventDefault();
     toast(tl('เลือกบัญชีที่จะผูกก่อน','Pick the account to link first'));
     return;
    }
    want=false;
   }
   if(want){
    var u=(document.getElementById('tacUser')||{}).value||'';
    var p=(document.getElementById('tacPass')||{}).value||'';
    var role=(document.getElementById('tacRole')||{}).value||defaultRole();
    u=String(u).trim();
    if(!u||!String(p)){
     if(e&&e.preventDefault)e.preventDefault();
     toast(tl('กรอกชื่อผู้ใช้และรหัสผ่าน หรือติ๊ก "สร้างบัญชี" ออก',
              'Enter a username and password, or untick "Create a login account"'));
     return;
    }
    wanted={username:u,password:String(p),role:role,
            name:(document.getElementById('tName')||{}).value||'',
            team:(document.getElementById('tTeam')||{}).value||'Technical'};
   }
   /* Which record the base created is worked out by diffing the ids, because saveTech()
      generates the id itself ('T'+Date.now()) and returns nothing. */
   var before={};
   try{(Array.isArray(technicians)?technicians:[]).forEach(function(t){if(t)before[t.id]=1})}catch(e2){}
   var res=await baseSave.apply(this,arguments);
   if(!wanted&&!linkTo)return res;
   var made=null;
   try{made=(Array.isArray(technicians)?technicians:[]).filter(function(t){return t&&!before[t.id]})[0]}catch(e3){}
   if(!made){
    toast(tl('บันทึกช่างแล้ว แต่หาระเบียนใหม่ไม่เจอ จึงยังไม่ได้สร้างบัญชี',
             'The employee was saved, but the new record could not be found, so no account was created'));
    return res;
   }
   /* Linking an existing login: the same call js/39's own ผูกบัญชี makes, so there is one
      writer for the link and the rules it enforces (one record per account) still apply. */
   if(linkTo&&typeof window.imodeAccountSave==='function'){
    var acc=(typeof window.imodeAccountFind==='function')?window.imodeAccountFind(linkTo):null;
    if(!acc){toast(tl('ไม่พบบัญชีนั้น','That account was not found'));return res}
    var out2=window.imodeAccountSave(acc.username,{
     username:acc.username,name:acc.name||made.name,accountType:'technician',
     role:acc.role||defaultRole(),team:acc.team||made.team||'Technical',
     technicianId:made.id,password:''});
    toast(out2&&out2.ok
      ? tl('ผูกบัญชี ','Linked ')+acc.username+tl(' กับ '+made.name+' แล้ว','')
      : tl('บันทึกช่างแล้ว แต่ผูกบัญชีไม่สำเร็จ: ','Employee saved, but linking failed: ')
        +((out2&&out2.message)||''));
    try{if(typeof renderAll==='function')renderAll()}catch(e5){}
    return res;
   }
   if(typeof window.imodeAccountSave!=='function'){
    toast(tl('บันทึกช่างแล้ว — สร้างบัญชีได้ที่ ตั้งค่าระบบ → การจัดการบัญชีผู้ใช้',
             'Employee saved — create the account in Settings → Account management'));
    return res;
   }
   var out=window.imodeAccountSave('',{
    username:wanted.username,name:wanted.name||made.name,accountType:'technician',
    role:wanted.role,team:wanted.team||made.team||'Technical',
    technicianId:made.id,password:wanted.password});
   if(out&&out.ok){
    toast(tl('สร้างบัญชี ','Created the account ')+wanted.username+tl(' ให้ '+(wanted.name||made.name)+' แล้ว',''));
    try{if(typeof renderAll==='function')renderAll()}catch(e4){}
   }else{
    /* The employee is saved either way; only the account failed, and it says why. */
    toast(tl('บันทึกช่างแล้ว แต่สร้างบัญชีไม่สำเร็จ: ','Employee saved, but the account failed: ')
          +((out&&out.message)||''));
   }
   return res;
  };
 }

 var st=document.createElement('style');
 st.id='v70TechAccountFormStyle';   /* 2026-09-25: js/64 already uses 'v70TechAccountStyle' for ITS style block. Two elements with one id is invalid, and getElementById would always have returned js/64's. Different files, different jobs, the id collision was an accident. */
 st.textContent=''
 +'.techacc{margin:12px 0 4px;padding:11px 12px;border:1px solid #d8e2f2;border-radius:12px;'
 +'background:linear-gradient(180deg,#f7faff,#fff)}'
 +'.techacc.is-linked b{display:block;font-size:12.5px;color:#12356f}'
 +'.techacc.is-linked small{display:block;font-size:11px;color:#6f81a3;margin-top:3px;line-height:1.55}'
 +'.techacc-on{display:flex;align-items:flex-start;gap:9px;cursor:pointer}'
 +'.techacc-on input{margin-top:3px;width:16px;height:16px;flex:none}'
 +'.techacc-on b{display:block;font-size:12.5px;color:#12356f}'
 +'.techacc-on small{display:block;font-size:11px;color:#6f81a3;margin-top:2px;line-height:1.55}'
 +'.techacc-fields{margin-top:10px}'
 +'.techacc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:9px}'
 +'.techacc-grid label{display:block;min-width:0}'
 +'.techacc-grid .techacc-wide{grid-column:1/-1}'
 +'.techacc-grid span{display:block;font-size:10.5px;color:#5b6b88;margin-bottom:3px}'
 +'.techacc-grid input,.techacc-grid select{width:100%;box-sizing:border-box;padding:8px 10px;'
 +'font-size:12.5px;border:1px solid #cfdcf0;border-radius:9px;background:#fff;color:#12356f}'
 +'.techacc-modes{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:9px}'
 +'.techacc-modes label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#33507e;cursor:pointer}'
 +'.techacc-modes input{width:15px;height:15px}'
 +'button.techacc.is-linked{display:block;width:100%;text-align:left;cursor:pointer}'
 +'button.techacc.is-linked:hover{border-color:#b9d3f5;background:#f2f7ff}'
 +'.techacc-go{display:inline-block;margin-top:7px;font-size:11.5px;font-weight:700;color:#0b63e5}';
 document.head.appendChild(st);
})();
