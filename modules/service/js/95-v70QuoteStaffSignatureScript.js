/* Beta 1.0 — company signatures inside the quotation module. */
(function(){
  'use strict';
  var roles={
    authorized:{pad:'quoteAuthorizedSignPad',name:'quoteAuthorizedSignName',nameKey:'authorizedBy',dateKey:'authorizedDate'},
    prepared:{pad:'quotePreparedSignPad',name:'quotePreparedSignName',nameKey:'preparedBy',dateKey:'preparedDate'}
  };
  /* 2026-09-25 — signing no longer waits for the quotation to be saved. Signatures made on an unsaved
     quotation are held here and written under its id by the saveQuotation wrapper below; the preview
     shows whatever is on the pads right now, saved or not. */
  var pending={};
  function quote(){try{return quotations.find(function(q){return q.id===quoteEditingId})||null}catch(e){return null}}
  function record(key,q){var all=(settings.quoteStaffSigns||{})[q.id]||{},r=all[key]||null,created=Date.parse(q.createdAt||''),signed=Date.parse(r&&r.at||'');return r&&(!Number.isFinite(created)||!Number.isFinite(signed)||signed>=created)?r:null}
  function hasInk(canvas){if(!canvas)return false;var d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>20&&++n>20)return true;return false}
  function imageData(canvas){var w=300,h=Math.max(1,Math.round(canvas.height*w/canvas.width)),out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d').drawImage(canvas,0,0,w,h);return out.toDataURL('image/png')}
  function setPad(id,src){var canvas=document.getElementById(id);if(!canvas)return;if(!canvas.dataset.quoteSignReady&&typeof initSignaturePad==='function'){initSignaturePad(id);canvas.dataset.quoteSignReady='1'}var ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(src){var img=new Image();img.onload=function(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height)};img.src=src}}
  function updateHint(){var h=document.getElementById('quoteStaffSignHint'),q=quote();if(h)h.textContent=q?'ลายเซ็นจะเชื่อมกับ '+q.id+' และแสดงในตัวอย่าง/PDF':(Object.keys(pending).length?'เก็บลายเซ็นไว้แล้ว '+Object.keys(pending).length+' รายการ · จะบันทึกพร้อมใบเสนอราคา':'ลงลายเซ็นได้เลย · ระบบจะบันทึกพร้อมใบเสนอราคา')}
  function loadPads(){var q=quote();Object.keys(roles).forEach(function(key){var x=roles[key],name=document.getElementById(x.name),r=q?record(key,q):(pending[key]||null);if(name)name.value=(r&&r.name)||(q&&q[x.nameKey])||(currentUser&&currentUser.name)||'';setPad(x.pad,(r&&r.sig)||'')});updateHint()}
  function roleJob(key,required){var x=roles[key],q=quote(),name=document.getElementById(x.name),canvas=document.getElementById(x.pad),value=String(name&&name.value||'').trim(),ink=hasInk(canvas);if(!value&&!ink&&!required)return false;if(!value){toastMsg('กรุณาระบุชื่อผู้ลงลายเซ็น');return null}if(!ink){toastMsg('กรุณาลงลายเซ็นหรือแนบรูปลายเซ็น');return null}return {key:key,x:x,q:q,name:value,sig:imageData(canvas)}}
  async function persist(jobs){if(!jobs.length)return;if(!jobs[0].q){var at=new Date().toISOString();jobs.forEach(function(j){pending[j.key]={name:j.name,sig:j.sig,at:at};var linked=document.getElementById(j.key==='authorized'?'qAuthorizedBy':'qPreparedBy');if(linked)linked.value=j.name});updateHint();toastMsg('เก็บลายเซ็นไว้แล้ว · จะบันทึกพร้อมใบเสนอราคา');return}var q=jobs[0].q,now=new Date().toISOString(),day=now.slice(0,10);settings.quoteStaffSigns=settings.quoteStaffSigns||{};settings.quoteStaffSigns[q.id]=settings.quoteStaffSigns[q.id]||{};jobs.forEach(function(j){settings.quoteStaffSigns[q.id][j.key]={name:j.name,sig:j.sig,at:now};q[j.x.nameKey]=j.name;q[j.x.dateKey]=day;var linked=document.getElementById(j.key==='authorized'?'qAuthorizedBy':'qPreparedBy');if(linked)linked.value=j.name});q.updatedAt=now;saveLocal();await cloudUpsertQuotation(q);if(typeof cloudSaveSettings==='function')await cloudSaveSettings();renderQuotationList();updateHint();toastMsg('บันทึกลายเซ็นเรียบร้อย')}
  window.clearQuoteStaffSign=function(key){var x=roles[key];if(x&&typeof clearSignaturePad==='function')clearSignaturePad(x.pad)};
  window.attachQuoteStaffSign=function(key,input){var x=roles[key],file=input&&input.files&&input.files[0],canvas=x&&document.getElementById(x.pad);if(!file||!canvas)return;var reader=new FileReader();reader.onload=function(){var img=new Image();img.onload=function(){var ctx=canvas.getContext('2d'),scale=Math.min(canvas.width/img.width,canvas.height/img.height),w=img.width*scale,h=img.height*scale;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,(canvas.width-w)/2,(canvas.height-h)/2,w,h)};img.src=reader.result};reader.readAsDataURL(file);input.value=''};
  window.saveQuoteStaffSign=async function(key){var job=roleJob(key,true);if(job)await persist([job])};
  window.saveQuoteStaffSigns=async function(){var jobs=[];for(var key of Object.keys(roles)){var job=roleJob(key,false);if(job===null)return;if(job)jobs.push(job)}if(!jobs.length){toastMsg('กรุณาลงลายเซ็นอย่างน้อย 1 รายการ');return}await persist(jobs)};
  window.previewSignedQuotation=function(){
   /* What is on the pads now, saved or not, goes on the preview; the stored record is put back at once. */
   var q=quote(),id=q?q.id:'DRAFT',at=new Date().toISOString(),tmp={};
   if(!q)Object.keys(pending).forEach(function(k){tmp[k]=pending[k]});
   Object.keys(roles).forEach(function(key){var x=roles[key],c=document.getElementById(x.pad),n=document.getElementById(x.name),v=String(n&&n.value||'').trim();if(c&&hasInk(c))tmp[key]={name:v,sig:imageData(c),at:at}});
   settings.quoteStaffSigns=settings.quoteStaffSigns||{};var had=Object.prototype.hasOwnProperty.call(settings.quoteStaffSigns,id),old=settings.quoteStaffSigns[id];
   settings.quoteStaffSigns[id]=Object.assign({},old||{},tmp);
   try{previewQuotation()}finally{if(had)settings.quoteStaffSigns[id]=old;else delete settings.quoteStaffSigns[id]}
  };
  var baseGo=window.goPage;if(typeof baseGo==='function')window.goPage=function(name){var r=baseGo.apply(this,arguments);if(name==='quotation')setTimeout(loadPads,80);return r};
  var baseLoad=window.loadQuotation;if(typeof baseLoad==='function')window.loadQuotation=function(){pending={};var r=baseLoad.apply(this,arguments);setTimeout(loadPads,180);return r};
  var baseReset=window.resetQuote;if(typeof baseReset==='function')window.resetQuote=function(){pending={};var r=baseReset.apply(this,arguments);setTimeout(loadPads,20);return r};
  var baseSave=window.saveQuotation;if(typeof baseSave==='function')window.saveQuotation=async function(){var r=await baseSave.apply(this,arguments);var q=quote(),keys=Object.keys(pending);if(q&&keys.length){var jobs=keys.map(function(k){return {key:k,x:roles[k],q:q,name:pending[k].name,sig:pending[k].sig}});pending={};try{await persist(jobs)}catch(e){console.warn(e)}}updateHint();return r};
})();
