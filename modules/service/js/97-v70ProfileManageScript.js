/* Beta 1.0 — 2026-09-23: the profile PHOTO of a login account.
   An admin picks a photo for any account in ตั้งค่าระบบ → การจัดการบัญชีผู้ใช้ → แก้ไข, or
   removes the one that is there. Until now every avatar in this application was initials on
   a coloured disc: js/09's accountToUser() hard-codes `photo:''` and nothing ever set one.

   Where it is stored, and why: on the account row itself, which already lives inside
   `settings` (settings.uatAccounts for a created account, settings.uatAccountEdits for one of
   the built-ins). settings travels whole, so the photo reaches every device with no new
   storage key, no column and no SQL for anybody to run. js/39 carries the field through its
   own save path — two lines there — so there is one writer, not two.

   From the account it is applied outward to the two records that DISPLAY an avatar: the
   person row in `demoUsers` (the picker in js/17) and the technician record (ทีมช่าง, หน้างาน).
   Those are mirrors; the account is the source. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 var MAX=256;            /* an avatar is never shown larger than ~80px; 256 covers retina */
 var QUALITY=0.82;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof toastMsg==='function')toastMsg(m)}
 function accounts(){
  try{return typeof window.imodeAccountList==='function'?(window.imodeAccountList()||[]):[]}
  catch(e){return []}
 }

 /* A square 256px JPEG, cropped from the centre. localStorage on this project has hit its
    ceiling once already, so an avatar is shrunk hard rather than stored at camera size:
    ~15-25 KB each instead of the ~200 KB compressPhoto() would give. */
 function shrink(file){
  return new Promise(function(resolve){
   var r=new FileReader();
   r.onerror=function(){resolve('')};
   r.onload=function(){
    var img=new Image();
    img.onerror=function(){resolve('')};
    img.onload=function(){
     var side=Math.min(img.width,img.height);
     var c=document.createElement('canvas');
     c.width=c.height=Math.min(MAX,side);
     var g=c.getContext('2d');
     g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
     g.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,c.width,c.height);
     try{resolve(c.toDataURL('image/jpeg',QUALITY))}catch(e){resolve('')}
    };
    img.src=r.result;
   };
   r.readAsDataURL(file);
  });
 }

 /* --------------------------------------------------- account -> the records that show it --- */
 /* 2026-09-23 — BUG FIXED HERE. The first version copied `account.photo` onto the person and
    the technician record UNCONDITIONALLY, so an account with no photo wrote '' over a photo
    the technician record already had. Every boot ran it, which is why a photo vanished on
    reload, and saving one account's photo re-ran it for all of them, which is why adding one
    photo wiped another. An empty account photo now means "this account says nothing about the
    photo", never "clear it". Removing a photo is done on the record that owns it. */
 function applyPhotos(){
  var changedTech=[];
  accounts().forEach(function(a){
   if(!a)return;
   var photo=String(a.photo||'');
   if(!photo)return;
   if(a.userId&&typeof demoUsers!=='undefined'&&Array.isArray(demoUsers)){
    var person=demoUsers.filter(function(p){return p.id===a.userId})[0];
    if(person&&person.photo!==photo)person.photo=photo;
   }
   if(a.technicianId&&typeof technicians!=='undefined'&&Array.isArray(technicians)){
    var tech=technicians.filter(function(t){return t.id===a.technicianId})[0];
    if(tech&&tech.photo!==photo){tech.photo=photo;changedTech.push(tech)}
   }
  });
  return changedTech;
 }
 /* What the account should SHOW when it carries no photo of its own: the photo already on the
    record it is linked to. Read only — it is not copied back onto the account. */
 function inheritedPhoto(acc){
  if(!acc)return '';
  try{
   if(acc.technicianId&&Array.isArray(technicians)){
    var t=technicians.filter(function(x){return x&&x.id===acc.technicianId})[0];
    if(t&&t.photo)return t.photo;
   }
  }catch(e){}
  try{
   if(acc.userId&&Array.isArray(demoUsers)){
    var p=demoUsers.filter(function(x){return x&&x.id===acc.userId})[0];
    if(p&&p.photo)return p.photo;
   }
  }catch(e){}
  return '';
 }
 function applyAndSave(){
  var moved=applyPhotos();
  if(!moved.length)return;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  /* technicians is a real column-mapped table, so each changed record is pushed on its own. */
  moved.forEach(function(t){try{if(typeof cloudUpsert==='function')cloudUpsert('technicians',t)}catch(e){}});
 }
 applyPhotos();
 /* syncCloud() replaces `technicians` and `settings` wholesale, so the mirrors have to be
    re-applied afterwards or a synced device shows initials again until the next save. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   if(r&&typeof r.then==='function')return r.then(function(v){applyPhotos();return v});
   applyPhotos();
   return r;
  };
 }

 /* accountToUser() decides what the signed-in session carries; js/09 pins photo to '' and
    js/96 keeps whatever js/09 produced, so the account's own photo has to be put back here.
    js/97 loads last, so this wrapper is the outermost one. */
 if(window.uatAuth&&typeof window.uatAuth.accountToUser==='function'){
  var baseToUser=window.uatAuth.accountToUser;
  window.uatAuth.accountToUser=function(acc){
   var u=baseToUser.apply(this,arguments);
   if(u&&acc&&acc.photo)u.photo=acc.photo;
   return u;
  };
 }

 /* 2026-09-24 — the wrapper above is not enough on its own: js/09's login() calls its own
    CLOSURE accountToUser(), not window.uatAuth.accountToUser, so a real sign-in still arrived
    with photo:'' — and a session restored from storage predates any photo added since. The
    sidebar card therefore showed initials for everybody but technicians. The photo is resolved
    from the account at render time instead, so it follows every sign-in path and every save. */
 if(typeof window.renderUserCard==='function'){
  var baseCard=window.renderUserCard;
  window.renderUserCard=function(){
   try{
    if(typeof currentUser!=='undefined'&&currentUser){
     var un=String(currentUser.username||String(currentUser.id||'').replace(/^UAT-/,'')).toLowerCase();
     var acc=un&&accounts().filter(function(a){return a&&String(a.username||'').toLowerCase()===un})[0];
     var photo=acc?(String(acc.photo||'')||inheritedPhoto(acc)):'';
     if(photo&&currentUser.photo!==photo)currentUser.photo=photo;
    }
   }catch(e){}
   return baseCard.apply(this,arguments);
  };
 }

 /* ------------------------------------------------------------------- the form block --- */
 function initials(name){
  var s=String(name||'').trim();
  if(!s)return '?';
  var parts=s.split(/\s+/);
  return ((parts[0]||'').charAt(0)+((parts[1]||'').charAt(0)||'')).toUpperCase()||'?';
 }
 function previewHTML(photo,name){
  return photo
   ? '<img src="'+esc2(photo)+'" alt="">'
   : '<span>'+esc2(initials(name))+'</span>';
 }
 function blockHTML(acc){
  var photo=String((acc&&acc.photo)||'')||inheritedPhoto(acc);
  return '<div class="acctpic" data-user="'+esc2((acc&&acc.username)||'')+'">'
   +'<div class="acctpic-av'+(photo?' has-photo':'')+'">'+previewHTML(photo,acc&&(acc.name||acc.username))+'</div>'
   +'<div class="acctpic-side">'
   +'<b>'+esc2(tl('รูปโปรไฟล์','Profile photo'))+'</b>'
   +'<small>'+esc2(tl('ไฟล์รูปภาพ ระบบจะย่อเป็นสี่เหลี่ยมจัตุรัสให้เอง','An image file — it is cropped square and shrunk automatically'))+'</small>'
   +'<div class="acctpic-btns">'
   +'<label class="acctmg-mini acctpic-pick">📷 '+esc2(tl('เลือกรูป','Choose photo'))
   +'<input type="file" accept="image/*" data-act="pick"></label>'
   +'<button type="button" class="acctmg-mini is-danger" data-act="clear"'+(photo?'':' disabled')+'>'
   +esc2(tl('ลบรูป','Remove'))+'</button>'
   +'</div></div>'
   +'<input type="hidden" name="photo" value="'+esc2(photo)+'">'
   +'</div>';
 }

 /* The form is built by js/39's own closure, so there is no exported function to wrap — the
    block is added to whatever form appears. A MutationObserver is the choke point every path
    shares (edit, add, refresh after save), and it is disconnected around its own writes: an
    observer only records while it is observing, which is how a nav observer in part 17 spun
    into an infinite loop. */
 var obs=null;
 function decorate(){
  var body=document.getElementById('modalBody');
  if(!body)return;
  var forms=body.querySelectorAll('.acctmg-form:not([data-photo-on])');
  if(!forms.length)return;
  if(obs)obs.disconnect();
  [].forEach.call(forms,function(f){
   f.setAttribute('data-photo-on','1');
   var acc=null;
   try{
    var original=f.getAttribute('data-original');
    if(original&&typeof window.imodeAccountFind==='function')acc=window.imodeAccountFind(original);
   }catch(e){}
   var actions=f.querySelector('.acctmg-actions');
   if(actions)actions.insertAdjacentHTML('beforebegin',blockHTML(acc));
   else f.insertAdjacentHTML('beforeend',blockHTML(acc));
  });
  if(obs)obs.observe(body,{childList:true,subtree:true});
 }
 function watch(){
  var body=document.getElementById('modalBody');
  if(!body)return;
  if(!obs)obs=new MutationObserver(function(){decorate()});
  obs.observe(body,{childList:true,subtree:true});
  decorate();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
 else watch();

 function formName(block){
  var form=block&&block.closest?block.closest('.acctmg-form'):null;
  var el=form?form.querySelector('[name="name"]'):null;
  return el?el.value:'';
 }
 function setPreview(block,photo,name){
  var av=block.querySelector('.acctpic-av'),hid=block.querySelector('[name="photo"]'),
      clear=block.querySelector('[data-act="clear"]');
  if(av){av.innerHTML=previewHTML(photo,name);av.classList.toggle('has-photo',!!photo)}
  if(hid)hid.value=photo||'';
  if(clear)clear.disabled=!photo;
 }

 /* js/05 calls stopPropagation() on #modalPanel — the "ต้องกดกากบาทเท่านั้น" guard — so a
    delegated listener on `document` never fires inside a popup. #modalBody is a descendant of
    the panel and still receives the bubble. This has silently cost the project time twice. */
 function wireBody(){
  var body=document.getElementById('modalBody');
  if(!body||body.getAttribute('data-photo-wired'))return;
  body.setAttribute('data-photo-wired','1');
  body.addEventListener('change',function(ev){
   var input=ev.target;
   if(!input||input.getAttribute('data-act')!=='pick')return;
   var block=input.closest('.acctpic');
   var file=input.files&&input.files[0];
   if(!block||!file)return;
   if(String(file.type||'').indexOf('image/')!==0){toast(tl('กรุณาเลือกไฟล์รูปภาพ','Please choose an image file'));return}
   var name=formName(block);
   /* js/37's cropper lets the admin choose the square by hand; if it is not loaded the
      centre crop in shrink() is the answer, so the button still works either way. */
   var chosen=(typeof window.imodeCropImage==='function')
    ? window.imodeCropImage(file,{aspect:1,title:tl('ครอบตัดรูปโปรไฟล์','Crop the profile photo')})
        .then(function(res){return res?res.file:null})
    : Promise.resolve(file);
   chosen.then(function(f){
    if(!f){try{input.value=''}catch(e){}return}
    return shrink(f).then(function(url){
     try{input.value=''}catch(e){}
     if(!url){toast(tl('อ่านไฟล์รูปไม่สำเร็จ','That image could not be read'));return}
     setPreview(block,url,name);
     toast(tl('เลือกรูปแล้ว — กดบันทึกเพื่อใช้งาน','Photo selected — press Save to apply'));
    });
   });
  });
  body.addEventListener('click',function(ev){
   var btn=ev.target&&ev.target.closest?ev.target.closest('[data-act="clear"]'):null;
   if(!btn)return;
   var block=btn.closest('.acctpic');
   if(!block)return;
   ev.preventDefault();
   setPreview(block,'',formName(block));
   toast(tl('เอารูปออกแล้ว — กดบันทึกเพื่อใช้งาน','Photo removed — press Save to apply'));
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wireBody,{once:true});
 else wireBody();
 /* #modalBody is replaced whenever a popup opens, so the listeners are re-attached then. */
 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(){
   var r=baseOpenModal.apply(this,arguments);
   setTimeout(function(){wireBody();watch()},0);
   return r;
  };
 }

 /* The mirrors are refreshed the moment a save lands, so the avatar in the list, in ทีมช่าง
    and in the sidebar changes without a reload. */
 var baseSave=window.imodeAccountSave;
 if(typeof baseSave==='function'){
  window.imodeAccountSave=function(){
   var res=baseSave.apply(this,arguments);
   if(res&&res.ok){
    applyAndSave();
    try{if(typeof renderAll==='function')renderAll()}catch(e){}
    try{if(typeof window.imodeRedrawLoginUsers==='function')window.imodeRedrawLoginUsers()}catch(e){}
   }
   return res;
  };
 }

 var st=document.createElement('style');
 st.id='v70ProfilePhotoStyle';
 st.textContent=''
 +'.acctpic{display:flex;align-items:center;gap:12px;margin-top:10px;padding:10px 11px;'
 +'border:1px solid #e2eaf7;border-radius:12px;background:#fff}'
 +'.acctpic-av{flex:none;width:62px;height:62px;border-radius:50%;overflow:hidden;display:flex;'
 +'align-items:center;justify-content:center;background:#0b63e5;color:#fff;font-weight:800;'
 +'font-size:19px;letter-spacing:.02em;border:2px solid #dbe6f8}'
 +'.acctpic-av.has-photo{background:#eef4fd}'
 +'.acctpic-av img{width:100%;height:100%;object-fit:cover;display:block}'
 +'.acctpic-side{flex:1;min-width:0}'
 +'.acctpic-side b{display:block;font-size:12.5px;color:#12356f}'
 +'.acctpic-side small{display:block;font-size:10.5px;color:#6f81a3;margin-top:2px;line-height:1.5}'
 +'.acctpic-btns{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}'
 +'.acctpic-pick{position:relative;overflow:hidden;cursor:pointer;display:inline-flex;align-items:center}'
 +'.acctpic-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}'
 +'@media(max-width:560px){.acctpic{flex-direction:column;align-items:flex-start}}';
 document.head.appendChild(st);
})();
