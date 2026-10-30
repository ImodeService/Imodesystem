/* 2026-10-20 — รับเคสใหม่: files on the case, and a machine that is not in the list yet.

   Two requests from the same list (ข้อ 4 and ข้อ 10):

     4. "ตอนเปิดเคสเองอะเราเพิ่มรูปไม่ได้ ทำให้เพิ่มรูปได้หน่อย" — the รับเคสใหม่ popup had no way
        to attach anything. A ไฟล์แนบ section is added under รายละเอียดเคส. The files go into
        c.media, the very list a customer's แจ้งปัญหา photos are in (js/42 carries it in
        service_cases.media), tagged from:'staff' with who added them, so the case page draws
        them together with the customer's under ปัญหาที่ลูกค้าแจ้ง.

     10. "ตอนเปิดเคส ... ใส่เครื่องจักรที่ไม่มีอยู่ในรายการ อยากให้แจ้งเตือนเป็น Popup ... 2 ปุ่ม
        คือ ปิด และ เพิ่มเครื่อง". Leaving เครื่องจักร with text that matches none of the
        customer's machines used to toast "กรุณาเลือกเครื่องจากรายการค้นหา". It now asks. เพิ่มเครื่อง
        opens the machine form with the customer and the typed name filled in; after saving,
        the รับเคสใหม่ popup comes back with everything that was typed in it and the new
        machine chosen — openMachineModal(...,returnToCase) used to reopen it EMPTY.

        The case page (service-case-detail.html) asks the same question in ลงรายละเอียดเคส and
        hands off here with ?intent=add-machine&customerId=&machineName=&returnCase=; this file
        opens the form and, after the save, goes back to the case with ?pickMachine=<id>.

   js/03 is not edited. Remove this file and both screens behave as before. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function $(id){return document.getElementById(id)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return[]}}
 function machineList(){try{return Array.isArray(machines)?machines:[]}catch(e){return[]}}
 function customerList(){try{return Array.isArray(customers)?customers:[]}catch(e){return[]}}
 /* 2026-10-30: one company, several branches, each its own customer. The list and the box show
    "name · สาขา X" so the branches can be told apart and the right one is chosen. */
 function custLabel(c){
  if(!c)return '';
  var b=String(c.branch||'').trim();
  return String(c.name||'')+(b?' · '+(/^สาขา/.test(b)?b:'สาขา '+b):'');
 }
 window.imodeCustomerLabel=custLabel;
 function lowSp(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim()}
 var baseResolve=window.resolveCustomerSearchValue;
 if(typeof baseResolve==='function'){
  window.resolveCustomerSearchValue=function(v){
   var q=lowSp(v);if(!q)return null;
   var list=customerList();
   var byLabel=list.filter(function(c){return lowSp(custLabel(c))===q});
   if(byLabel.length)return byLabel[0];
   var byName=list.filter(function(c){return lowSp(c.name)===q});
   if(byName.length===1)return byName[0];
   if(byName.length>1)return null;          /* same name in several branches: the branch must be chosen */
   return baseResolve.apply(this,arguments);
  };
 }
 function relabelCustomerBox(){
  var dl=$('caseCustomerList');
  if(dl){
   dl.innerHTML=customerList().map(function(c){return '<option value="'+esc2(custLabel(c))+'"></option>'}).join('');
  }
  var cs=$('fCustomerSearch'),cid=($('fCustomer')||{}).value;
  if(cs&&cid){
   var c=customerList().filter(function(x){return x.id===cid})[0];
   if(c&&lowSp(cs.value)===lowSp(c.name))cs.value=custLabel(c);
  }
 }
 function who(){try{return (currentUser&&(currentUser.name||currentUser.username))||''}catch(e){return''}}

 /* ============================================================ 4. files ==== */
 var FILE_MAX=2.5*1024*1024,FILE_COUNT=20;
 var pending=[];

 function kindOf(t){
  t=String(t||'');
  return /^image\//.test(t)?'image':/^video\//.test(t)?'video':/^audio\//.test(t)?'audio':/pdf$/i.test(t)?'file':'';
 }
 function shrink(file){
  return new Promise(function(resolve,reject){
   var url=URL.createObjectURL(file),img=new Image();
   img.onload=function(){
    var k=Math.min(1,1280/Math.max(img.width,img.height));
    var c=document.createElement('canvas');
    c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg',0.82));
   };
   img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('image'))};
   img.src=url;
  });
 }
 function dataUrl(file){
  return new Promise(function(resolve,reject){
   var r=new FileReader();
   r.onload=function(){resolve(String(r.result||''))};
   r.onerror=function(){reject(r.error)};
   r.readAsDataURL(file);
  });
 }
 function readFiles(list){
  var out=[],by=who();
  return [].slice.call(list||[]).reduce(function(p,file){
   return p.then(function(){
    var t=String(file.type||''),kind=kindOf(t);
    if(!kind){toast(file.name+tl(' — แนบได้เฉพาะรูป วิดีโอ ไฟล์เสียง หรือ PDF',' — images, video, audio or PDF only'));return}
    if(pending.length+out.length>=FILE_COUNT){toast(tl('แนบได้สูงสุด '+FILE_COUNT+' ไฟล์','Up to '+FILE_COUNT+' files'));return}
    var job=kind==='image'?shrink(file).then(function(d){return {data:d,type:'image/jpeg'}})
                          :dataUrl(file).then(function(d){return {data:d,type:t}});
    return job.then(function(o){
     var size=Math.round((o.data.length-o.data.indexOf(',')-1)*0.75);
     if(size>FILE_MAX){toast(file.name+tl(' ใหญ่เกิน 2.5 MB',' is over 2.5 MB'));return}
     out.push({name:file.name,type:o.type,size:size,data:o.data,from:'staff',by:by,at:new Date().toISOString()});
    },function(){toast(tl('อ่านไฟล์ ','Could not read ')+file.name+tl(' ไม่ได้',''))});
   });
  },Promise.resolve()).then(function(){return out});
 }
 function drawFiles(){
  var box=$('caseIntakeFiles');if(!box)return;
  box.innerHTML=pending.map(function(f,i){
   return '<span class="cin-file">'
    +(/^image\//.test(f.type)?'<img src="'+esc2(f.data)+'" alt="">':'<i aria-hidden="true">'+(/^video/.test(f.type)?'🎬':/^audio/.test(f.type)?'🎵':'📄')+'</i>')
    +'<span>'+esc2(f.name)+'</span>'
    +'<button type="button" aria-label="'+esc2(tl('เอาออก','Remove'))+'" onclick="imodeCaseIntakeDrop('+i+')">✕</button></span>';
  }).join('');
 }
 window.imodeCaseIntakeDrop=function(i){pending.splice(i,1);drawFiles()};
 window.imodeCaseIntakePick=function(input){
  readFiles(input&&input.files).then(function(items){
   pending=pending.concat(items);
   drawFiles();
   try{input.value=''}catch(e){}
  });
 };
 function filesSectionHTML(existing){
  return '<div class="modal-section cin-files-sec"><div class="section-title">'+esc2(tl('ไฟล์แนบ (รูป / วิดีโอ / PDF)','Attachments (photo / video / PDF)'))+'</div>'
   +'<p class="setting-help" style="margin:0 0 8px">'+esc2(tl('แนบรูปอาการเสีย วิดีโอ หรือเอกสารที่ได้จากลูกค้า ไม่เกิน 2.5 MB ต่อไฟล์',
      'Photos, video or documents from the customer, up to 2.5 MB each'))
   +(existing?' · '+esc2(tl('มีอยู่แล้ว ','Already attached: '))+existing+tl(' ไฟล์',' file(s)'):'')+'</p>'
   +'<div class="cin-files-row"><label class="soft-btn cin-pick">📎 '+esc2(tl('เลือกไฟล์','Choose files'))
   +'<input type="file" multiple accept="image/*,video/*,audio/*,application/pdf" style="display:none" onchange="imodeCaseIntakePick(this)"></label>'
   +'<div id="caseIntakeFiles" class="cin-files"></div></div></div>';
 }
 function mediaOf(c){
  if(typeof window.imodeCaseMedia==='function'){try{return window.imodeCaseMedia(c).slice()}catch(e){}}
  return Array.isArray(c&&c.media)?c.media.slice():[];
 }
 function addFilesSection(id){
  var form=$('caseForm');
  if(!form||form.querySelector('.cin-files-sec'))return;
  var c=id?caseList().filter(function(x){return x.id===id})[0]:null;
  var issue=$('fIssue'),sec=issue&&issue.closest('.modal-section');
  if(!sec)return;
  sec.insertAdjacentHTML('afterend',filesSectionHTML(c?mediaOf(c).length:0));
  drawFiles();
 }

 /* ===================================================== 10. missing machine ==== */
 /* What was typed into the รับเคสใหม่ popup, kept across a trip to the machine form. */
 var stash=null;
 var FIELDS=['fCustomerSearch','fContact','fPhone','fChannel','fCaseCat','fWorkType','fServiceType','fPriority','fIssue','fNote'];
 function takeStash(text){
  var s={at:Date.now(),values:{},files:pending.slice(),machineText:text,customerId:($('fCustomer')||{}).value||'',caseId:($('fCaseId')||{}).value||''};
  FIELDS.forEach(function(k){var e=$(k);if(e)s.values[k]=e.value});
  return s;
 }
 function restoreStash(s){
  if(!s)return;
  pending=s.files||[];
  drawFiles();
  FIELDS.forEach(function(k){
   var e=$(k);
   if(e&&s.values[k]!=null&&k!=='fCustomerSearch')e.value=s.values[k];
  });
  var cat=$('fCaseCat');if(cat)try{cat.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
  var work=$('fWorkType');if(work&&s.values.fWorkType!=null){work.value=s.values.fWorkType;try{work.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}}
  var cs=$('fCustomerSearch');
  /* 2026-10-30: a customer added from ＋ เพิ่มลูกค้า is chosen for the case straight away */
  var nc=s.newCustomerId?customerList().filter(function(x){return x.id===s.newCustomerId})[0]:null;
  if(cs&&(nc||s.values.fCustomerSearch!=null)){
   cs.value=nc?custLabel(nc):s.values.fCustomerSearch;
   try{caseCustomerSearchChanged(false)}catch(e){}
   /* caseCustomerSearchChanged(true) would overwrite the contact the person typed; with
      false it only fills contact / phone that are still empty */
  }
  var m=s.newMachineId?machineList().filter(function(x){return x.id===s.newMachineId})[0]:null;
  var ms=$('fMachineSearch');
  /* ＋ เพิ่มเครื่อง pressed before any customer was chosen: the machine form asks for the
     customer, so the case takes that customer too, then the machine */
  if(m&&m.customerId&&cs&&!(($('fCustomer')||{}).value)){
   var mc=customerList().filter(function(x){return x.id===m.customerId})[0];
   if(mc){cs.value=custLabel(mc);try{caseCustomerSearchChanged(false)}catch(e){}}
  }
  if(ms&&m){
   try{ms.value=caseMachineSearchLabel(m)}catch(e){ms.value=m.nameTh||m.name||''}
   try{caseMachineSearchChanged(false)}catch(e){}
  }else if(ms&&nc&&s.machineText){
   /* the pair: a brand-new customer has no machines yet, so the machine typed earlier is
      offered as a new one for this customer */
   ms.value=s.machineText;
   setTimeout(function(){try{window.caseMachineSearchChanged(true)}catch(e){}},400);
  }
  toast(m?tl('เพิ่มเครื่องแล้ว และเลือกให้ในเคสนี้แล้ว','Machine added and chosen for this case')
         :nc?tl('เพิ่มลูกค้าแล้ว และเลือกให้ในเคสนี้แล้ว','Customer added and chosen for this case')
         :tl('กลับมาที่เคสแล้ว ข้อมูลที่กรอกไว้ยังอยู่','Back to the case; what you typed is kept'));
 }

 function askPopup(text,onAdd,kind){
  var cust=kind==='customer';
  var old=$('cinAsk');if(old)old.remove();
  var box=document.createElement('div');
  box.id='cinAsk';box.className='cin-ask';
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="cin-ask-card"><div class="cin-ask-ic">⚠</div>'
   +'<h3>'+esc2(cust?tl('ไม่มีข้อมูลลูกค้านี้','This customer is not on file')
                    :tl('ไม่พบเครื่องนี้ในรายการ','This machine is not in the list'))+'</h3>'
   +'<p>"'+esc2(text)+'" '+esc2(cust
      ?tl('ยังไม่มีในข้อมูลลูกค้า ต้องการเพิ่มเป็นลูกค้าใหม่หรือไม่','is not in the customer list. Add it as a new customer?')
      :tl('ยังไม่มีในเครื่องจักรของลูกค้ารายนี้ ต้องการเพิ่มเครื่องใหม่หรือไม่','is not one of this customer\'s machines. Add it as a new machine?'))+'</p>'
   +'<div class="cin-ask-btns"><button type="button" data-ask="close">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" class="is-primary" data-ask="add">＋ '+esc2(cust?tl('เพิ่มลูกค้า','Add customer'):tl('เพิ่มเครื่อง','Add machine'))+'</button></div></div>';
  document.body.appendChild(box);
  box.addEventListener('click',function(e){
   var b=e.target.closest('[data-ask]');
   if(e.target===box||(b&&b.getAttribute('data-ask')==='close')){
    box.remove();
    var ms=$(cust?'fCustomerSearch':'fMachineSearch');if(ms){try{ms.focus();ms.select()}catch(x){}}
    return;
   }
   if(b&&b.getAttribute('data-ask')==='add'){box.remove();onAdd()}
  });
  box.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();box.remove()}});
  var add=box.querySelector('[data-ask="add"]');if(add)add.focus();
 }
 /* one OK button, same look: "choose the customer first" */
 function noticePopup(title,text,onOk){
  var old=$('cinAsk');if(old)old.remove();
  var box=document.createElement('div');
  box.id='cinAsk';box.className='cin-ask';
  box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="cin-ask-card"><div class="cin-ask-ic">⚠</div>'
   +'<h3>'+esc2(title)+'</h3><p>'+esc2(text)+'</p>'
   +'<div class="cin-ask-btns"><button type="button" class="is-primary" data-ask="ok">'+esc2(tl('ตกลง','OK'))+'</button></div></div>';
  document.body.appendChild(box);
  function done(){box.remove();if(onOk)onOk()}
  box.addEventListener('click',function(e){if(e.target===box||e.target.closest('[data-ask]'))done()});
  box.addEventListener('keydown',function(e){if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();done()}});
  var ok=box.querySelector('[data-ask]');if(ok)ok.focus();
 }
 function machineFormFor(customerId,name,after){
  if(typeof window.openMachineModal!=='function')return;
  window.openMachineModal('',after==='case',customerId);
  setTimeout(function(){
   var n=$('maNameTh');
   /* the new-machine form opens with the word เครื่องจักร in it, not empty */
   if(n&&name&&(!n.value||n.value==='เครื่องจักร')){n.value=name;try{n.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}}
   var sel=$('maCustomer');
   if(sel&&customerId&&sel.value!==customerId){sel.value=customerId;try{sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}}
  },60);
 }

 var baseMachineSearch=window.caseMachineSearchChanged;
 if(typeof baseMachineSearch==='function'){
  window.caseMachineSearchChanged=function(force){
   if(!force)return baseMachineSearch.apply(this,arguments);
   var ms=$('fMachineSearch'),cu=$('fCustomer');
   var text=String(ms&&ms.value||'').trim();
   var r=baseMachineSearch.call(this,false);   /* the toast is replaced by the popup below */
   /* 2026-10-30 (owner): as with the customer, a few letters that match one machine are not
      that machine — only its full label, name, model or serial (or a pick from the list) */
   var mid=($('fMachine')||{}).value;
   if(text&&mid){
    var pm=machineList().filter(function(x){return x.id===mid})[0];
    var low=function(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim()};
    var lab='';try{lab=caseMachineSearchLabel(pm)}catch(e){}
    var ok=pm&&[lab,pm.nameTh,pm.name,pm.nameEn,pm.model,pm.serial].some(function(v){return v&&low(v)===low(text)});
    if(!ok){$('fMachine').value='';mid=''}
   }
   if(text&&!mid){
    /* no customer yet: say so in a popup and go back to the customer box, rather than a toast
       while the cursor moves on to ผู้ติดต่อ */
    if(!cu||!cu.value){
     setTimeout(function(){
      if(($('fCustomer')||{}).value||!$('fMachineSearch')||$('cinAsk'))return;
      noticePopup(tl('ยังไม่ได้เลือกลูกค้า','No customer chosen'),
       tl('เลือกหรือเพิ่มลูกค้าก่อน แล้วจึงเลือกเครื่องจักร','Choose or add the customer first, then the machine'),
       function(){var c=$('fCustomerSearch');if(c)try{c.focus();c.select()}catch(x){}});
     },160);
     return r;
    }
    /* blur also fires when the person clicks one of the picker's own rows on some browsers;
       let that pick land first, then decide */
    setTimeout(function(){
     if(($('fMachine')||{}).value||!$('fMachineSearch'))return;
     if(String($('fMachineSearch').value||'').trim()!==text)return;
     askPopup(text,function(){
      stash=takeStash(text);
      stash.before=machineList().map(function(m){return m.id});
      machineFormFor(stash.customerId,text,'case');
     });
    },160);
   }
   return r;
  };
 }

 /* 2026-10-30 (owner): "เมื่อใส่ชื่อลูกค้าหรือบริษัทที่ไม่มีจะมีแจ้งเตือนขึ้นมาว่าไม่มีข้อมูลลูกค้า
    แล้วก็จะมีปุ่มให้เลือกว่า ยกเลิก กับ เพิ่มลูกค้า ... ต้องทำงานคู่กับเครื่องจักรด้วย". Leaving the
    customer field with a name that matches nobody asks; เพิ่มลูกค้า opens the customer form with the
    name filled in, and after the save the case comes back with everything typed and the new
    customer chosen. A machine typed before that is then asked about in turn (restoreStash). */
 var baseCustomerSearch=window.caseCustomerSearchChanged;
 if(typeof baseCustomerSearch==='function'){
  window.caseCustomerSearchChanged=function(force){
   if(!force)return baseCustomerSearch.apply(this,arguments);
   var cs=$('fCustomerSearch');
   var text=String(cs&&cs.value||'').trim();
   /* refreshMachines() inside the base call empties the machine field when the customer is
      unknown, so what was typed there is read first */
   var mtext=String(($('fMachineSearch')||{}).value||'').trim();
   var r=baseCustomerSearch.call(this,false);   /* the toast is replaced by the popup below */
   /* 2026-10-30 (owner): one letter + Enter was taken as whichever single customer contained
      it. On leaving the field only the customer's full name (or a pick from the list, which
      writes the full name) counts; anything else is treated as not on file. */
   var picked=($('fCustomer')||{}).value;
   if(text&&picked){
    var pc=customerList().filter(function(c){return c.id===picked})[0];
    var same=function(a,b){return String(a||'').toLowerCase().replace(/\s+/g,' ').trim()===String(b||'').toLowerCase().replace(/\s+/g,' ').trim()};
    if(!pc||!(same(pc.name,text)||same(custLabel(pc),text))){
     $('fCustomer').value='';
     try{if(typeof refreshMachines==='function')refreshMachines()}catch(e){}
    }
   }
   if(text&&!($('fCustomer')||{}).value){
    setTimeout(function(){
     if(($('fCustomer')||{}).value||!$('fCustomerSearch')||$('cinAsk'))return;
     if(String($('fCustomerSearch').value||'').trim()!==text)return;
     /* the company is on file in more than one branch: ask for the branch, not "not on file" */
     var branches=customerList().filter(function(c){return lowSp(c.name)===lowSp(text)});
     if(branches.length>1){
      noticePopup(tl('บริษัทนี้มีหลายสาขา','This company has several branches'),
       tl('เลือกสาขาจากรายการ ('+branches.length+' สาขา)','Choose the branch from the list ('+branches.length+')'),
       function(){var c=$('fCustomerSearch');if(c){try{c.focus();c.dispatchEvent(new Event('input',{bubbles:true}))}catch(x){}}});
      return;
     }
     askPopup(text,function(){
      stash=takeStash(mtext||String(($('fMachineSearch')||{}).value||'').trim());
      if(typeof window.openCustomerModal==='function')window.openCustomerModal('',true);
      setTimeout(function(){
       var n=$('cuName');
       if(n&&!n.value){n.value=text;try{n.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}}
      },60);
     },'customer');
    },160);
   }
   return r;
  };
 }

 /* Enter in the customer / machine box checks it right away (the same as leaving the box),
    instead of submitting the case form or silently keeping a partial match. */
 document.addEventListener('keydown',function(e){
  if(e.key!=='Enter'||e.isComposing)return;
  var t=e.target,id=t&&t.id;
  if(id!=='fCustomerSearch'&&id!=='fMachineSearch')return;
  if(!t.closest||!t.closest('#caseForm'))return;
  if(t.getAttribute('data-pick-active'))return;   /* js/94: a highlighted row takes the Enter */
  e.preventDefault();
  try{
   if(id==='fCustomerSearch')window.caseCustomerSearchChanged(true);
   else window.caseMachineSearchChanged(true);
  }catch(x){}
 },true);

 /* saveMachine(e,returnToCase) reopens the case popup 100 ms after its own save. */
 var handoff=null;   /* from the case page: {customerId, name, returnCase} */
 var baseSaveMachine=window.saveMachine;
 if(typeof baseSaveMachine==='function'){
  window.saveMachine=async function(){
   var before=machineList().map(function(m){return m.id});
   var r=await baseSaveMachine.apply(this,arguments);
   var fresh=machineList().filter(function(m){return before.indexOf(m.id)<0})[0];
   if(fresh&&stash)stash.newMachineId=fresh.id;
   if(fresh&&handoff&&handoff.returnCase){
    var back=handoff.returnCase;handoff=null;
    setTimeout(function(){
     location.href='./service-case-detail.html?caseId='+encodeURIComponent(back)+'&pickMachine='+encodeURIComponent(fresh.id);
    },400);
   }
   return r;
  };
 }

 /* ============================================ ＋ เพิ่มลูกค้า / ＋ เพิ่มเครื่อง ==== */
 /* 2026-10-30 (admin): "เวลาแอดมินกรอกข้อมูลไปแล้วนึกขึ้นได้ว่าลูกค้าไม่ได้มีในฐานข้อมูล ... กด
    เพิ่มใหม่เสร็จข้อมูลที่กรอกไปตอนแรกหาย". Both buttons in รับเคสใหม่ call the forms with
    returnToCase, and js/03 then reopened an EMPTY case popup. What was typed is kept the same way
    the missing-machine popup above keeps it, and the new customer / machine is chosen. */
 function caseFormOpen(){return !!$('caseForm')}
 var baseOpenCustomer=window.openCustomerModal;
 if(typeof baseOpenCustomer==='function'){
  window.openCustomerModal=function(cid,returnToCase){
   if(returnToCase&&!cid&&caseFormOpen()&&!stash)stash=takeStash(String(($('fMachineSearch')||{}).value||''));
   return baseOpenCustomer.apply(this,arguments);
  };
 }
 /* 2026-10-30 (owner): "ไม่มีระบบป้องกันการเพิ่มลูกค้าซ้ำ". A NEW customer whose name (ignoring
    case, spaces and the company words) or phone number is already on file IN THE SAME BRANCH
    (สาขา — one company may have several, each its own customer record) is stopped with a
    popup: แก้ไขข้อมูล goes back to the form, ใช้ลูกค้าที่มีอยู่ picks the existing one — and, when
    the form came from รับเคสใหม่, chooses it for the case. Editing an existing customer is not
    checked. */
 function nameKey(v){
  return String(v||'').toLowerCase()
   .replace(/บริษัท|จำกัด|\(มหาชน\)|มหาชน|ห้างหุ้นส่วน|หจก\.?|บจก\.?|co\.?|ltd\.?|limited|company|inc\.?|\./g,'')
   .replace(/[\s,()\-]/g,'');
 }
 function phoneKey(v){return String(v||'').replace(/\D/g,'')}
 function branchKey(v){return String(v||'').toLowerCase().replace(/สาขา|branch|[\s,()\-.]/g,'')}
 function findDupCustomer(name,phone,branch){
  var nk=nameKey(name),pk=phoneKey(phone),bk=branchKey(branch);
  return customerList().filter(function(c){
   if(branchKey(c.branch)!==bk)return false;          /* another branch is another customer */
   if(nk&&nameKey(c.name)===nk)return true;
   return pk.length>=9&&phoneKey(c.phone)===pk;
  })[0]||null;
 }
 function askDupCustomer(dup,onUse){
  var old=$('cinAsk');if(old)old.remove();
  var box=document.createElement('div');
  box.id='cinAsk';box.className='cin-ask';
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="cin-ask-card"><div class="cin-ask-ic">⚠</div>'
   +'<h3>'+esc2(tl('มีลูกค้ารายนี้อยู่แล้ว','This customer already exists'))+'</h3>'
   +'<p>"'+esc2(dup.name||'')+'"'+(dup.branch?' · '+esc2(tl('สาขา ','Branch '))+esc2(dup.branch):'')+(dup.phone?' · '+esc2(dup.phone):'')+'<br>'
   +esc2(tl('อยู่ในฐานข้อมูลแล้ว จะใช้รายที่มีอยู่ หรือกลับไปแก้ข้อมูล','is already on file. Use it, or go back and change the details?'))+'</p>'
   +'<div class="cin-ask-btns"><button type="button" data-ask="close">'+esc2(tl('แก้ไขข้อมูล','Edit details'))+'</button>'
   +'<button type="button" class="is-primary" data-ask="use">'+esc2(tl('ใช้ลูกค้าที่มีอยู่','Use existing'))+'</button></div></div>';
  document.body.appendChild(box);
  box.addEventListener('click',function(e){
   var b=e.target.closest('[data-ask]');
   if(e.target===box||(b&&b.getAttribute('data-ask')==='close')){box.remove();var n=$('cuName');if(n)try{n.focus()}catch(x){}return}
   if(b&&b.getAttribute('data-ask')==='use'){box.remove();onUse()}
  });
  box.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();box.remove()}});
  var use=box.querySelector('[data-ask="use"]');if(use)use.focus();
 }
 var baseSaveCustomer=window.saveCustomer;
 if(typeof baseSaveCustomer==='function'){
  window.saveCustomer=async function(e,returnToCase){
   var isNew=!String(($('cuId')||{}).value||'').trim()||!customerList().some(function(c){return c.id===($('cuId')||{}).value});
   if(isNew){
    var dup=findDupCustomer(($('cuName')||{}).value,($('cuPhone')||{}).value,($('cuBranch')||{}).value);
    if(dup){
     if(e&&e.preventDefault)e.preventDefault();
     askDupCustomer(dup,function(){
      try{closeModal()}catch(x){}
      if(stash){stash.newCustomerId=dup.id}
      if(returnToCase||stash)setTimeout(function(){window.openCaseModal()},100);
      else toast(tl('ใช้ลูกค้าเดิม: ','Using existing customer: ')+(dup.name||''));
     });
     return;
    }
   }
   var before=customerList().map(function(c){return c.id});
   var r=await baseSaveCustomer.apply(this,arguments);
   var fresh=customerList().filter(function(c){return before.indexOf(c.id)<0})[0];
   if(fresh&&stash)stash.newCustomerId=fresh.id;
   return r;
  };
 }
 var baseOpenMachine=window.openMachineModal;
 if(typeof baseOpenMachine==='function'){
  window.openMachineModal=function(id,returnToCase,customerPreset){
   if(returnToCase===true&&!id&&caseFormOpen()){
    if(!stash)stash=takeStash(String(($('fMachineSearch')||{}).value||''));
    /* 2026-10-30: the two buttons work as a pair — the customer chosen in the case form is
       already filled in on the new machine */
    var cu=($('fCustomer')||{}).value||'';
    if(cu&&!customerPreset)return baseOpenMachine.call(this,id,returnToCase,cu);
   }
   return baseOpenMachine.apply(this,arguments);
  };
 }

 /* ======================================================== the case popup ==== */
 var baseOpenCase=window.openCaseModal;
 if(typeof baseOpenCase==='function'){
  window.openCaseModal=function(id){
   var keep=stash;stash=null;
   /* a stash left by a form that was cancelled long ago is not brought back into a later case */
   if(keep&&keep.at&&Date.now()-keep.at>30*60*1000)keep=null;
   if(!keep)pending=[];
   var r=baseOpenCase.apply(this,arguments);
   /* js/94 rebuilds section 3 at 35 ms; this runs after it */
   setTimeout(function(){
    addFilesSection(id||(keep&&keep.caseId)||'');
    relabelCustomerBox();
    if(keep)restoreStash(keep);
   },90);
   return r;
  };
 }
 var baseSaveCase=window.saveCase;
 if(typeof baseSaveCase==='function'){
  window.saveCase=async function(){
   var files=pending.slice();
   var idEl=$('fCaseId'),existing=idEl&&idEl.value;
   var before=caseList().map(function(c){return c.id});
   var r=await baseSaveCase.apply(this,arguments);
   if(!files.length)return r;
   var c=existing?caseList().filter(function(x){return x.id===existing})[0]
                 :caseList().filter(function(x){return before.indexOf(x.id)<0})[0];
   if(!c)return r;          /* the save itself refused (missing customer / machine) */
   pending=[];
   var list=mediaOf(c);
   if(list.length+files.length>FILE_COUNT)files=files.slice(0,Math.max(0,FILE_COUNT-list.length));
   c.media=list.concat(files);
   c.updatedAt=new Date().toISOString();
   try{saveLocal()}catch(e){toast(tl('พื้นที่ในเครื่องเต็ม บันทึกไฟล์แนบไม่ได้','Storage is full; attachments not saved'))}
   try{if(typeof cloudUpsertCase==='function')await cloudUpsertCase(c)}catch(e){}
   try{renderAll()}catch(e){}
   toast(tl('แนบไฟล์กับเคสแล้ว ','Attached ')+files.length+tl(' ไฟล์',' file(s)'));
   return r;
  };
 }

 /* ================================================ hand-off from the case page ==== */
 (function(){
  var p=new URLSearchParams(location.search);
  if(p.get('intent')!=='add-machine')return;
  handoff={customerId:String(p.get('customerId')||''),name:String(p.get('machineName')||''),returnCase:String(p.get('returnCase')||'')};
  try{
   var u=new URL(location.href);
   ['customerId','machineName','returnCase'].forEach(function(k){u.searchParams.delete(k)});
   history.replaceState(history.state||null,'',u.pathname+u.search+u.hash);
  }catch(e){}
  /* js/28 routes ?page=machines on load + 380 ms; open the form after it */
  function go(){setTimeout(function(){machineFormFor(handoff&&handoff.customerId,handoff&&handoff.name,'')},900)}
  if(document.readyState==='complete')go();else window.addEventListener('load',go,{once:true});
 })();

 /* ---------- ข้อ 7: มอบหมายก่อนจึงไปขั้นถัดไปได้ (2026-10-20) ----------
    สถานะถัดไป in the case popup (js/03 advanceCase) moved a case on with nobody assigned. Any move
    into มอบหมาย/นัดหมาย or beyond now needs a technician on the case first; without one the
    assign picker opens instead, and saving it moves the case itself (js/16). ปิดเคส is not gated:
    a duplicate or cancelled case must still be closable. service-case-detail.html has the same
    gate on its circles. */
 var NEEDS_CREW=['มอบหมายแล้ว','นัดหมายแล้ว','กำลังดำเนินการ','รออะไหล่','รอส่งงาน','เสร็จสิ้น'];
 function hasCrew(c){
  if(Array.isArray(c.assignees)&&c.assignees.filter(Boolean).length)return true;
  return !!String(c.assignee||'').split(',').filter(function(x){return x.trim()}).length;
 }
 var baseAdvance=window.advanceCase;
 if(typeof baseAdvance==='function'){
  window.advanceCase=function(cid){
   try{
    var c=(Array.isArray(cases)?cases:[]).filter(function(x){return x&&x.id===cid})[0];
    var list=(settings&&settings.statuses)||[],i=c?list.indexOf(c.status):-1;
    var next=i>=0?list[i+1]:'';
    if(c&&next&&NEEDS_CREW.indexOf(next)>=0&&!hasCrew(c)){
     if(typeof toastMsg==='function')toastMsg('ยังไม่ได้มอบหมายช่าง — มอบหมายงานก่อนจึงไปขั้นถัดไปได้');
     if(typeof window.imodeOpenAssignPicker==='function')window.imodeOpenAssignPicker(cid);
     return;
    }
   }catch(e){}
   return baseAdvance.apply(this,arguments);
  };
 }

 var st=document.createElement('style');
 st.id='v70CaseIntakeStyle';
 st.textContent=''
 +'.cin-files-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}'
 +'.cin-pick{cursor:pointer}'
 +'.cin-files{display:flex;flex-wrap:wrap;gap:8px}'
 +'.cin-file{display:inline-flex;align-items:center;gap:7px;border:1px solid #d9e6fa;border-radius:11px;'
 +'padding:5px 9px;background:#fff;font-size:12.5px;max-width:260px}'
 +'.cin-file img{width:38px;height:38px;object-fit:cover;border-radius:7px;flex:none}'
 +'.cin-file i{font-style:normal;font-size:20px}'
 +'.cin-file span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.cin-file button{border:0;background:none;color:#b42318;cursor:pointer;font-size:14px;padding:0 2px;flex:none}'
 +'.cin-ask{position:fixed;inset:0;z-index:12550;background:rgba(9,22,52,.45);display:flex;align-items:center;justify-content:center;padding:16px}'
 +'.cin-ask-card{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:22px 20px 18px;text-align:center;box-shadow:0 24px 60px rgba(9,22,52,.35)}'
 +'.cin-ask-ic{font-size:30px;line-height:1;margin-bottom:6px;color:#d97706}'
 +'.cin-ask-card h3{margin:0 0 6px;font-size:18px;color:#0c225e}'
 +'.cin-ask-card p{margin:0 0 16px;font-size:14px;color:#3b4d6e;line-height:1.6;overflow-wrap:anywhere}'
 +'.cin-ask-btns{display:flex;gap:10px}'
 +'.cin-ask-btns button{flex:1;min-height:46px;border-radius:12px;border:1.5px solid #cfe0fb;background:#fff;color:#0c225e;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}'
 +'.cin-ask-btns button.is-primary{background:#0b63e5;border-color:#0b63e5;color:#fff}'
 /* dark theme: the card follows css/24's greys */
 +'html[data-ui="flat-dark"]:is(:root,#fx) .cin-ask-card{background:var(--fx-surface,#262626)!important;border:1px solid var(--fx-line,#3a3a3a)}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .cin-ask-card h3{color:var(--fx-head,#fff)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .cin-ask-card p{color:var(--fx-text,#f1f1f1)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .cin-ask-btns button:not(.is-primary){background:var(--fx-surface-2,#2e2e2e)!important;border-color:var(--fx-line-strong,#4d4d4d)!important;color:var(--fx-text,#f1f1f1)!important}';
 document.head.appendChild(st);
})();
