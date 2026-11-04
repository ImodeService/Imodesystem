/* 2026-11-03 — รับเคสใหม่: เลือกประเภทงานก่อน แล้วค่อยกรอกฟอร์ม (แผน Service ข้อ 1)

   What the owner asked for, and approved on the mockups 1a-ใหม่ / 1c-ใหม่:

     - "＋ รับเคสใหม่" opens a step 1 first: one card per work type (Service, Maintenance, PM,
       ติดตั้งเครื่อง, Modify, plus types the admin added), and a card "อื่นๆ" to add a new type
       that is remembered for next time.
     - On the same step there is a tick "ผูกเครื่องจักรกับเคสนี้". The admin decides. Not ticked =
       the form asks for the customer only (a customer who just buys parts, asks for documents,
       training ...), and NO machine record is created for it.
     - Online is no longer its own kind of work: it is one of the three "ทำงานที่" choices
       (หน้างานลูกค้า / Workshop / Online), offered only for the work types that can be done remotely.
     - A card click slides to the form. ‹ goes back to step 1 with everything typed still there,
       because step 1 is a panel inside the same popup, not a second popup.

   HOW IT SITS ON WHAT IS THERE (js/03 is not edited)

     The work type and the place are the pair js/82 already keeps: fCaseCat = place
     (field / workshop / online), fWorkType = work type, saved in field_status_log as
     {caseCat:'set'} and mirrored in service_type. This file only adds work types to js/82's
     lists, hides js/82's two dropdowns and drives them from the cards and the ทำงานที่ buttons.

     A case without a machine: js/03 saveCase() refuses when machineById(fMachine) is empty. For
     that one call, and only while the tick is off, fMachine holds a marker and a blank machine
     with that id sits in `machines`; it is taken out again as soon as the call returns (before
     saveCase's first await finishes), the case's machineId is set to null, and the cloud write
     sends machine_id = null (the column has always been nullable).

   Remove this file (and its <script> tag) and the form is the previous one. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 var NO_MACHINE='__ctp_no_machine__';
 var LINK_KEY='imode.caseLinkMachine';
 var BASE_TYPES=[
  {name:'Service',        icon:'🛠', desc:'ซ่อม / แก้ไขอาการเสีย รวมงานแก้ไขทาง Online', where:['field','workshop','online']},
  {name:'Maintenance',    icon:'🔧', desc:'บำรุงรักษา / ปรับตั้งเครื่อง',                  where:['field','workshop','online']},
  {name:'PM',             icon:'🗓', desc:'บำรุงรักษาตามรอบ',                             where:['field','workshop']},
  {name:'ติดตั้งเครื่อง',   icon:'📦', desc:'ติดตั้ง / ส่งมอบเครื่องใหม่',                     where:['field']},
  {name:'Modify',         icon:'🧩', desc:'ดัดแปลง / ปรับปรุง / อัปเกรดเครื่อง',              where:['field','workshop'],isNew:true}
 ];
 var WHERE=[
  {v:'field',   th:'หน้างานลูกค้า'},
  {v:'workshop',th:'Workshop (ส่งเครื่องเข้าบริษัท)'},
  {v:'online',  th:'Online / ทางไกล'}
 ];
 var ICONS=['📚','🧪','🚚','📝','🔍','🧰','💡','📞'];

 function $(id){return document.getElementById(id)}
 function esc2(v){try{return typeof esc==='function'?esc(v):String(v==null?'':v)}catch(e){return String(v==null?'':v)}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
 function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
 function cc(){return window.imodeCaseCategory||null}

 /* ------------------------------------------------------------ work types ---- */
 function customTypes(){
  var l=Array.isArray(settings.customWorkTypes)?settings.customWorkTypes:[];
  return l.filter(function(t){return t&&t.name&&!t.hidden});
 }
 function allTypes(){
  var base=BASE_TYPES.map(function(t){return t});
  var names=base.map(function(t){return t.name});
  customTypes().forEach(function(t){
   if(names.indexOf(t.name)>=0)return;
   base.push({name:t.name,icon:t.icon||'📝',desc:t.desc||'',where:t.online?['field','workshop','online']:['field','workshop'],custom:true});
  });
  return base;
 }
 function typeOf(name){
  var l=allTypes();for(var i=0;i<l.length;i++)if(l[i].name===name)return l[i];
  return {name:name,icon:'📝',desc:'',where:['field','workshop','online']};
 }
 /* js/82's lists are the ones its dropdowns and readCase() use, so the new types go into them. */
 function extendCategories(){
  var m=cc();if(!m||!Array.isArray(m.CATS))return;
  allTypes().forEach(function(t){
   m.CATS.forEach(function(c){
    if(t.where.indexOf(c.v)>=0&&c.works.indexOf(t.name)<0)c.works.push(t.name);
   });
  });
 }
 extendCategories();

 function saveSettingsNow(){
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }

 /* ------------------------------------------------------------------ state ---- */
 var st={work:'Service',link:true,edit:false};
 var returning=null;     /* set when ＋ เพิ่มลูกค้า / ＋ เพิ่มเครื่อง leaves the form; js/140 brings it back */

 function defaultLink(){return lsGet(LINK_KEY)!=='0'}

 /* ---------------------------------------------------------------- markup ---- */
 function cardHTML(t){
  var on=t.name===st.work;
  return '<button type="button" class="ctp-card'+(on?' is-on':'')+'" data-work="'+esc2(t.name)+'">'
   +(on?'<span class="ctp-tag is-b">เลือกอยู่</span>':t.isNew?'<span class="ctp-tag">ใหม่</span>':t.custom?'<span class="ctp-tag is-g">เพิ่มเอง</span>':'')
   +'<span class="ctp-ic">'+esc2(t.icon)+'</span><b>'+esc2(t.name)+'</b><small>'+esc2(t.desc)+'</small></button>';
 }
 function panelHTML(){
  return '<div class="ctp-panel" id="ctpPanel" data-no-i18n>'
   +'<div class="ctp-steps"><i class="on">1</i>เลือกประเภทงาน<span></span><i>2</i>กรอกรายละเอียด</div>'
   +'<label class="ctp-link"><input type="checkbox" id="ctpLink"'+(st.link?' checked':'')+'>'
   +'<span class="ctp-box" aria-hidden="true">✓</span><span><b>ผูกเครื่องจักรกับเคสนี้</b>'
   +'<small>ติ๊กไว้ = ฟอร์มถัดไปมีช่องเลือกเครื่องจักร (S/N) และสถานะประกัน · ไม่ติ๊ก = กรอกแค่ลูกค้า เช่น ซื้ออะไหล่ ปรึกษา ขอเอกสาร อบรม</small></span></label>'
   +'<div class="ctp-cards" id="ctpCards">'+allTypes().map(cardHTML).join('')
   +'<button type="button" class="ctp-card is-add" data-add="1"><span class="ctp-plus">＋</span><b>อื่นๆ</b><small>เพิ่มประเภทงานใหม่</small></button></div>'
   +'<div class="ctp-addform" id="ctpAdd" hidden>'
   +'<b class="ctp-addhead">เพิ่มประเภทงานใหม่</b>'
   +'<div class="field"><label>ชื่อประเภทงาน *</label><input id="ctpAddName" maxlength="40" placeholder="เช่น อบรมการใช้งาน"></div>'
   +'<div class="field"><label>คำอธิบายสั้นๆ</label><input id="ctpAddDesc" maxlength="80" placeholder="เช่น สอนลูกค้าใช้เครื่อง"></div>'
   +'<div class="field"><label>ไอคอน</label><div class="ctp-icons" id="ctpIcons">'+ICONS.map(function(ic,i){
     return '<button type="button" data-ic="'+ic+'"'+(i===0?' class="is-on"':'')+'>'+ic+'</button>';
    }).join('')+'</div></div>'
   +'<label class="ctp-chk"><input type="checkbox" id="ctpAddOnline"> ทำแบบ Online ได้</label>'
   +'<div class="ctp-addbtns"><button type="button" class="soft-btn" data-addcancel="1">ยกเลิก</button>'
   +'<button type="button" class="primary-btn" data-addsave="1">บันทึกและเลือก</button></div></div>'
   +'<div class="ctp-foot"><small>ติ๊กก่อน แล้วกดการ์ด ระบบไปหน้าถัดไปทันที</small>'
   +'<button type="button" class="soft-btn" data-cancel="1">ยกเลิก</button></div></div>';
 }
 function chipsHTML(){
  var t=typeOf(st.work);
  return '<span class="ctp-chip">'+esc2(t.icon)+' '+esc2(t.name)+'</span>'
   +'<span class="ctp-chip'+(st.link?'':' is-off')+'">'+(st.link?'⚙ ผูกเครื่องจักร':'ไม่ผูกเครื่องจักร')+'</span>'
   +'<button type="button" class="ctp-change" data-back="1">· เปลี่ยน</button>';
 }
 function whereHTML(){
  var t=typeOf(st.work);
  return '<div class="field full ctp-where-f"><label>ทำงานที่</label><div class="ctp-where" id="ctpWhere">'
   +WHERE.map(function(w){
    var ok=t.where.indexOf(w.v)>=0;
    return '<button type="button" data-where="'+w.v+'"'+(ok?'':' disabled title="ไม่มีใน '+esc2(t.name)+'"')+'>'
     +esc2(w.th)+(ok?'':' (ไม่มีใน '+esc2(t.name)+')')+'</button>';
   }).join('')+'</div></div>';
 }

 /* ------------------------------------------------------------ the form ---- */
 function form(){return $('caseForm')}
 function body(){return $('modalBody')}
 function setSub(t){var s=$('modalSub');if(s)s.textContent=t}

 function fire(el){try{el.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}}

 /* The machine half of section 1, hidden or shown with the tick. */
 function applyLink(){
  var f=form();if(!f)return;
  f.dataset.ctpLink=st.link?'1':'0';
  var ms=$('fMachineSearch'),field=ms&&ms.closest('.field');
  if(field)field.hidden=!st.link;
  if(ms){if(st.link)ms.setAttribute('required','');else ms.removeAttribute('required')}
  var sec=ms&&ms.closest('.modal-section');
  if(sec){
   var title=sec.querySelector('.section-title');
   if(title){
    if(!title.dataset.ctpOrig)title.dataset.ctpOrig=title.textContent;
    title.textContent=st.link?title.dataset.ctpOrig:'1. ลูกค้า';
   }
   [].forEach.call(sec.querySelectorAll('button[onclick*="openMachineModal"]'),function(b){b.hidden=!st.link});
  }
  if(!st.link){var m=$('fMachine');if(m&&m.value===NO_MACHINE)m.value=''}
 }
 /* js/82's two dropdowns stay (saveCase and js/140 read them) but are driven from here. */
 function applyWork(){
  var cat=$('fCaseCat'),work=$('fWorkType');
  if(!cat||!work)return;
  var t=typeOf(st.work);
  if(t.where.indexOf(cat.value)<0){cat.value=t.where[0];fire(cat)}
  if(work.value!==st.work){
   var has=[].some.call(work.options,function(o){return o.value===st.work});
   if(!has){extendCategories();fire(cat)}
   work.value=st.work;fire(work);
  }
  [cat,work].forEach(function(s){var f=s.closest('.field');if(f){f.hidden=true;f.classList.add('ctp-hidden-f')}});
  var host=cat.closest('.field'),old=$('ctpWhere');
  if(old)old.closest('.ctp-where-f').remove();
  if(host)host.insertAdjacentHTML('beforebegin',whereHTML());
  syncWhere();
  var chips=$('ctpChips');
  if(!chips){
   var f=form();if(f){f.insertAdjacentHTML('afterbegin','<div class="ctp-chips" id="ctpChips" data-no-i18n></div>');chips=$('ctpChips')}
  }
  if(chips)chips.innerHTML=chipsHTML();
 }
 function syncWhere(){
  var cat=$('fCaseCat'),box=$('ctpWhere');if(!cat||!box)return;
  [].forEach.call(box.querySelectorAll('button[data-where]'),function(b){b.classList.toggle('is-on',b.getAttribute('data-where')===cat.value)});
 }

 function showPanel(dir){
  var b=body(),p=$('ctpPanel');if(!b)return;
  if(!p){b.insertAdjacentHTML('afterbegin',panelHTML());p=$('ctpPanel')}
  else{
   var cards=$('ctpCards');if(cards)cards.innerHTML=allTypes().map(cardHTML).join('')+'<button type="button" class="ctp-card is-add" data-add="1"><span class="ctp-plus">＋</span><b>อื่นๆ</b><small>เพิ่มประเภทงานใหม่</small></button>';
   var lk=$('ctpLink');if(lk)lk.checked=st.link;
  }
  b.classList.add('ctp-picking');
  anim(p,dir||'in');
  setSub('ขั้นที่ 1 · เลือกประเภทงาน แล้วค่อยกรอกรายละเอียด');
  try{b.scrollTop=0;var mp=$('modalPanel');if(mp)mp.scrollTop=0}catch(e){}
 }
 function showForm(){
  var b=body();if(!b)return;
  b.classList.remove('ctp-picking');
  applyLink();applyWork();
  anim(form(),'in');
  setSub('ขั้นที่ 2 · กรอกรายละเอียด');
  try{b.scrollTop=0;var mp=$('modalPanel');if(mp)mp.scrollTop=0}catch(e){}
  setTimeout(function(){var cs=$('fCustomerSearch');if(cs&&!cs.value)try{cs.focus({preventScroll:true})}catch(e){}},280);
 }
 function anim(el,dir){
  if(!el)return;
  el.classList.remove('ctp-in','ctp-back-in');void el.offsetWidth;
  el.classList.add(dir==='back'?'ctp-back-in':'ctp-in');
 }

 function pick(work){
  var lk=$('ctpLink');st.link=lk?!!lk.checked:st.link;
  if(!st.edit)lsSet(LINK_KEY,st.link?'1':'0');
  st.work=work;
  showForm();
 }
 function addType(){
  var name=String(($('ctpAddName')||{}).value||'').trim();
  if(!name){toast('กรุณาใส่ชื่อประเภทงาน');var n=$('ctpAddName');if(n)n.focus();return}
  var exist=allTypes().filter(function(t){return t.name.toLowerCase()===name.toLowerCase()})[0];
  if(exist){toast('มีประเภทงาน "'+exist.name+'" อยู่แล้ว เลือกจากการ์ดได้เลย');pick(exist.name);return}
  var icBtn=document.querySelector('#ctpIcons button.is-on');
  var t={name:name,desc:String(($('ctpAddDesc')||{}).value||'').trim(),icon:icBtn?icBtn.getAttribute('data-ic'):'📝',
   online:!!($('ctpAddOnline')||{}).checked,at:new Date().toISOString()};
  if(!Array.isArray(settings.customWorkTypes))settings.customWorkTypes=[];
  settings.customWorkTypes.push(t);
  saveSettingsNow();
  extendCategories();
  var cat=$('fCaseCat');if(cat)fire(cat);   /* js/82 refills fWorkType from the extended list */
  toast('เพิ่มประเภทงาน "'+name+'" แล้ว');
  pick(name);
 }

 /* ------------------------------------------------------------- events ---- */
 /* on #modalBody, not document: js/05 stops clicks at #modalPanel (see js/99) */
 function onClick(e){
  var b=e.target&&e.target.closest?e.target.closest('#modalBody [data-work],#modalBody [data-add],#modalBody [data-addsave],#modalBody [data-addcancel],#modalBody [data-cancel],#modalBody [data-back],#modalBody [data-where],#modalBody #ctpIcons button'):null;
  if(!b)return;
  if(b.hasAttribute('data-work')){pick(b.getAttribute('data-work'));return}
  if(b.hasAttribute('data-add')){var a=$('ctpAdd');if(a){a.hidden=false;var n=$('ctpAddName');if(n)n.focus()}return}
  if(b.hasAttribute('data-addcancel')){var a2=$('ctpAdd');if(a2)a2.hidden=true;return}
  if(b.hasAttribute('data-addsave')){addType();return}
  if(b.hasAttribute('data-cancel')){try{closeModal()}catch(x){}return}
  if(b.hasAttribute('data-back')){showPanel('back');return}
  if(b.hasAttribute('data-where')){
   if(b.disabled)return;
   var cat=$('fCaseCat');if(cat){cat.value=b.getAttribute('data-where');fire(cat);var w=$('fWorkType');if(w&&w.value!==st.work){w.value=st.work;fire(w)}}
   syncWhere();return;
  }
  if(b.parentNode&&b.parentNode.id==='ctpIcons'){
   [].forEach.call(b.parentNode.children,function(x){x.classList.toggle('is-on',x===b)});
  }
 }
 function hook(){var mb=$('modalBody');if(mb&&!mb.__ctpOn){mb.__ctpOn=true;mb.addEventListener('click',onClick)}}
 hook();
 /* Enter in the add-type box saves it instead of submitting the case form underneath. */
 document.addEventListener('keydown',function(e){
  if(e.key!=='Enter')return;
  var t=e.target;if(!t||!t.closest||!t.closest('#ctpAdd'))return;
  e.preventDefault();addType();
 },true);

 /* -------------------------------------------------- wrap the case popup ---- */
 function caseById(id){try{return (Array.isArray(cases)?cases:[]).filter(function(c){return c&&c.id===id})[0]||null}catch(e){return null}}

 var baseOpen=window.openCaseModal;
 if(typeof baseOpen==='function'){
  window.openCaseModal=function(id){
   extendCategories();
   var back=returning&&Date.now()-returning.at<30*60*1000?returning:null;
   returning=null;
   var r=baseOpen.apply(this,arguments);
   try{
    hook();
    if(!form())return r;
    if(id){
     var c=caseById(id),m=cc();
     st={edit:true,link:!!(c&&c.machineId),work:(m&&c)?m.read(c).workType:'Service'};
     showForm();
    }else if(back){
     st={edit:false,link:back.link,work:back.work};
     showForm();
    }else{
     st={edit:false,link:defaultLink(),work:'Service'};
     showPanel('in');
    }
    /* js/94 (35 ms) and js/140 (90 ms) rework the form after it opens; js/140 may put back
       fCaseCat / fWorkType from its stash. Re-apply once they are done. */
    setTimeout(function(){
     if(!form())return;
     if(back&&$('fWorkType')&&$('fWorkType').value)st.work=$('fWorkType').value;
     applyLink();
     if(!body().classList.contains('ctp-picking'))applyWork();
    },160);
   }catch(e){}
   return r;
  };
 }
 /* The popup's own ‹ (js/29, js/124) closes it. On step 2 of a NEW case it goes back to step 1,
    with what was typed kept, as the mockup promised. */
 var baseBack=window.imodeModalBack;
 window.imodeModalBack=function(){
  var b=body();
  if(b&&form()&&$('ctpPanel')&&!b.classList.contains('ctp-picking')&&!st.edit){showPanel('back');return}
  if(typeof baseBack==='function')return baseBack.apply(this,arguments);
  if(typeof window.closeModal==='function')window.closeModal();
 };
 function noteLeaving(){
  if(form()&&!(body()||{classList:{contains:function(){return true}}}).classList.contains('ctp-picking'))
   returning={work:st.work,link:st.link,at:Date.now()};
 }
 ['openCustomerModal','openMachineModal'].forEach(function(fn){
  var base=window[fn];if(typeof base!=='function')return;
  window[fn]=function(id,returnToCase){
   if(returnToCase===true&&!id)noteLeaving();
   return base.apply(this,arguments);
  };
 });

 /* ------------------------------------------- save without a machine ---- */
 /* No machine text either: js/03 ensureMasters() CREATES a machine for any case that has a
    machine name and no machineId — exactly the machine record the owner does not want. */
 function unlink(c){c.machineId=null;c.machine='';c.machineTh='';c.machineEn='';c.model='';c.serial='';c.machineSize='';c.warranty='-'}
 var BLANK={name:'ไม่ผูกเครื่องจักร',nameTh:'ไม่ผูกเครื่องจักร',nameEn:'No machine',model:'',serial:'',size:'',warranty:'-'};
 var baseSave=window.saveCase;
 if(typeof baseSave==='function'){
  window.saveCase=function(){
   var f=form();
   if(!f||f.dataset.ctpLink!=='0')return baseSave.apply(this,arguments);
   var m=$('fMachine'),ms=$('fMachineSearch');
   if(m)m.value=NO_MACHINE;
   if(ms)ms.value='';
   /* machineById is a const arrow in js/03, so the blank machine sits in `machines` for the
      length of this one synchronous call instead */
   var list=null;try{list=machines}catch(x){list=null}
   var blank=Object.assign({},BLANK,{id:NO_MACHINE});
   if(Array.isArray(list))list.push(blank);
   try{return baseSave.apply(this,arguments)}
   finally{
    if(Array.isArray(list)){var i=list.indexOf(blank);if(i>=0)list.splice(i,1)}
    if(m&&m.value===NO_MACHINE)m.value='';
    try{(Array.isArray(cases)?cases:[]).forEach(function(c){if(c&&c.machineId===NO_MACHINE)unlink(c)});saveLocal()}catch(x){}
   }
  };
 }
 /* the blank machine must never reach the server as a real id */
 var baseUpsert=window.cloudUpsertCase;
 if(typeof baseUpsert==='function'){
  window.cloudUpsertCase=function(c){
   if(c&&(c.machineId===NO_MACHINE||c.machineId===''))unlink(c);
   return baseUpsert.apply(this,arguments);
  };
 }

 /* ----------------------------------------------------------------- style ---- */
 var css=document.createElement('style');
 css.id='v70CaseTypePickStyle';
 css.textContent=''
 +'#modalBody.ctp-picking>#caseForm,#modalBody.ctp-picking>form#caseForm{display:none!important}'
 +'#modalBody:not(.ctp-picking)>#ctpPanel{display:none!important}'
 +'.ctp-panel{display:block}#caseForm [hidden],#ctpPanel [hidden]{display:none!important}'
 +'.ctp-steps{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#667085;margin:0 0 14px}'
 +'.ctp-steps i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:700;background:#eef1f6;color:#475467}'
 +'.ctp-steps i.on{background:#0b63e5;color:#fff}.ctp-steps span{width:30px;height:2px;background:#dfe4ee}'
 +'.ctp-link{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid #dfe4ee;border-radius:12px;background:#fafbfd;margin:0 0 14px;cursor:pointer}'
 +'.ctp-link input{position:absolute;opacity:0;width:1px;height:1px}'
 +'.ctp-link .ctp-box{width:22px;height:22px;border-radius:6px;border:2px solid #98a2b3;display:grid;place-items:center;color:transparent;font-weight:700;flex:none;margin-top:1px}'
 +'.ctp-link:has(input:checked){border-color:#0b63e5;background:#f3f7ff}'
 +'.ctp-link input:checked+.ctp-box{background:#0b63e5;border-color:#0b63e5;color:#fff}'
 +'.ctp-link input:focus-visible+.ctp-box{outline:3px solid rgba(11,99,229,.35);outline-offset:2px}'
 +'.ctp-link b{display:block;color:#0c225e;font-size:15px}.ctp-link small{display:block;color:#667085;font-size:12.5px;line-height:1.5}'
 +'.ctp-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'
 +'@media (max-width:640px){.ctp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 +'.ctp-card{position:relative;text-align:left;border:1.5px solid #dfe4ee;border-radius:14px;padding:14px;background:#fff;min-height:108px;cursor:pointer;font:inherit;color:inherit;transition:border-color .15s,box-shadow .15s,transform .15s}'
 +'.ctp-card:hover{border-color:#9ab8f5;transform:translateY(-1px)}'
 +'.ctp-card.is-on{border-color:#0b63e5;box-shadow:0 0 0 3px rgba(11,99,229,.15)}'
 +'.ctp-card .ctp-ic{font-size:24px;width:44px;height:44px;border-radius:12px;background:#eef3ff;display:grid;place-items:center;margin-bottom:8px}'
 +'.ctp-card b{display:block;font-size:15.5px;color:#0c225e}.ctp-card small{display:block;color:#667085;font-size:12.5px;line-height:1.45;margin-top:2px}'
 +'.ctp-card.is-add{border-style:dashed;background:#fafcff;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}'
 +'.ctp-card.is-add b{color:#0b63e5}.ctp-plus{font-size:24px;color:#0b63e5;line-height:1}'
 +'.ctp-tag{position:absolute;top:10px;right:10px;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600;background:#fff3e0;color:#b54708}'
 +'.ctp-tag.is-b{background:#e8f0fe;color:#0b63e5}.ctp-tag.is-g{background:#e7f6ee;color:#067647}'
 +'.ctp-addform{margin-top:14px;border:1.5px solid #bcd3fb;border-radius:14px;padding:14px;background:#f8fbff}'
 +'.ctp-addform .field{margin-bottom:10px}.ctp-addhead{display:block;color:#0c225e;margin-bottom:8px}'
 +'.ctp-icons{display:flex;flex-wrap:wrap;gap:6px}.ctp-icons button{width:40px;height:40px;border-radius:10px;border:1.5px solid #dfe4ee;background:#fff;font-size:19px;cursor:pointer}'
 +'.ctp-icons button.is-on{border-color:#0b63e5;background:#eef3ff}'
 +'.ctp-chk{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:4px 0 10px}'
 +'.ctp-addbtns{display:flex;gap:8px;justify-content:flex-end}'
 +'.ctp-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px}.ctp-foot small{color:#667085}'
 +'.ctp-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}'
 +'.ctp-chip{display:inline-flex;align-items:center;gap:6px;background:#eef3ff;color:#0c225e;border-radius:999px;padding:5px 12px;font-weight:600;font-size:13px}'
 +'.ctp-chip.is-off{background:#f2f4f7;color:#667085}'
 +'.ctp-back{width:34px;height:34px;border-radius:9px;border:1px solid #dfe4ee;background:#fff;font-size:20px;line-height:1;cursor:pointer;color:#344054}'
 +'.ctp-change{border:0;background:none;color:#0b63e5;font:inherit;font-size:13px;cursor:pointer;padding:4px 2px}'
 +'.ctp-where{display:flex;border:1px solid #cfd6e3;border-radius:10px;overflow:hidden}'
 +'.ctp-where button{flex:1;padding:9px 6px;border:0;border-right:1px solid #cfd6e3;background:#fff;font:inherit;font-size:13px;cursor:pointer;color:#344054}'
 +'.ctp-where button:last-child{border-right:0}.ctp-where button.is-on{background:#0b63e5;color:#fff;font-weight:600}'
 +'.ctp-where button:disabled{color:#b0b8c6;background:#f5f6f8;cursor:not-allowed}'
 +'@keyframes ctpIn{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}'
 +'@keyframes ctpBackIn{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}'
 +'.ctp-in{animation:ctpIn .26s cubic-bezier(.2,.8,.2,1)}.ctp-back-in{animation:ctpBackIn .26s cubic-bezier(.2,.8,.2,1)}'
 +'@media (prefers-reduced-motion:reduce){.ctp-in,.ctp-back-in{animation:none}.ctp-card{transition:none}}'
 /* dark theme follows css/24's greys */
 +'html[data-ui="flat-dark"]:is(:root,#fx) .ctp-card,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-back,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-where button,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-icons button{background:var(--fx-surface-2,#2e2e2e)!important;border-color:var(--fx-line-strong,#4d4d4d)!important;color:var(--fx-text,#f1f1f1)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .ctp-link,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-addform{background:var(--fx-surface,#262626)!important;border-color:var(--fx-line,#3a3a3a)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .ctp-card b,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-link b,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-addhead{color:var(--fx-head,#fff)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .ctp-where button.is-on,html[data-ui="flat-dark"]:is(:root,#fx) .ctp-card.is-on{border-color:#4d8ef7!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .ctp-where button.is-on{background:#0b63e5!important;color:#fff!important}';
 document.head.appendChild(css);

 window.imodeCaseTypePick={types:allTypes,state:function(){return {work:st.work,link:st.link,edit:st.edit}}};
})();
