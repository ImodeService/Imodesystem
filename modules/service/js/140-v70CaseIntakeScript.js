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
   cs.value=nc?String(nc.name||''):s.values.fCustomerSearch;
   try{caseCustomerSearchChanged(false)}catch(e){}
   /* caseCustomerSearchChanged(true) would overwrite the contact the person typed; with
      false it only fills contact / phone that are still empty */
  }
  var m=s.newMachineId?machineList().filter(function(x){return x.id===s.newMachineId})[0]:null;
  var ms=$('fMachineSearch');
  if(ms&&m){
   try{ms.value=caseMachineSearchLabel(m)}catch(e){ms.value=m.nameTh||m.name||''}
   try{caseMachineSearchChanged(false)}catch(e){}
  }
  toast(m?tl('เพิ่มเครื่องแล้ว และเลือกให้ในเคสนี้แล้ว','Machine added and chosen for this case')
         :nc?tl('เพิ่มลูกค้าแล้ว และเลือกให้ในเคสนี้แล้ว','Customer added and chosen for this case')
         :tl('กลับมาที่เคสแล้ว ข้อมูลที่กรอกไว้ยังอยู่','Back to the case; what you typed is kept'));
 }

 function askPopup(text,onAdd){
  var old=$('cinAsk');if(old)old.remove();
  var box=document.createElement('div');
  box.id='cinAsk';box.className='cin-ask';
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="cin-ask-card"><div class="cin-ask-ic">⚠</div>'
   +'<h3>'+esc2(tl('ไม่พบเครื่องนี้ในรายการ','This machine is not in the list'))+'</h3>'
   +'<p>"'+esc2(text)+'" '+esc2(tl('ยังไม่มีในเครื่องจักรของลูกค้ารายนี้ ต้องการเพิ่มเครื่องใหม่หรือไม่',
      'is not one of this customer\'s machines. Add it as a new machine?'))+'</p>'
   +'<div class="cin-ask-btns"><button type="button" data-ask="close">'+esc2(tl('ปิด','Close'))+'</button>'
   +'<button type="button" class="is-primary" data-ask="add">＋ '+esc2(tl('เพิ่มเครื่อง','Add machine'))+'</button></div></div>';
  document.body.appendChild(box);
  box.addEventListener('click',function(e){
   var b=e.target.closest('[data-ask]');
   if(e.target===box||(b&&b.getAttribute('data-ask')==='close')){
    box.remove();
    var ms=$('fMachineSearch');if(ms){try{ms.focus();ms.select()}catch(x){}}
    return;
   }
   if(b&&b.getAttribute('data-ask')==='add'){box.remove();onAdd()}
  });
  box.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();box.remove()}});
  var add=box.querySelector('[data-ask="add"]');if(add)add.focus();
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
   var mid=($('fMachine')||{}).value;
   if(text&&!mid){
    if(!cu||!cu.value){toast(tl('กรุณาเลือกลูกค้าก่อน แล้วจึงเลือกเครื่อง','Choose the customer first'));return r}
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
 var baseSaveCustomer=window.saveCustomer;
 if(typeof baseSaveCustomer==='function'){
  window.saveCustomer=async function(){
   var before=customerList().map(function(c){return c.id});
   var r=await baseSaveCustomer.apply(this,arguments);
   var fresh=customerList().filter(function(c){return before.indexOf(c.id)<0})[0];
   if(fresh&&stash)stash.newCustomerId=fresh.id;
   return r;
  };
 }
 var baseOpenMachine=window.openMachineModal;
 if(typeof baseOpenMachine==='function'){
  window.openMachineModal=function(id,returnToCase){
   if(returnToCase===true&&!id&&caseFormOpen()&&!stash)stash=takeStash(String(($('fMachineSearch')||{}).value||''));
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
 +'.cin-ask-btns button.is-primary{background:#0b63e5;border-color:#0b63e5;color:#fff}';
 document.head.appendChild(st);
})();
