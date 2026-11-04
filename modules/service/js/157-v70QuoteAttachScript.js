/* 2026-11-03 — ใบเสนอราคา: รูปและไฟล์แนบท้ายฟอร์ม + หน้าเอกสารแนบ (แผน Service ข้อ 3)

   Owner: "ใบเสนอราคา Service เพิ่มรูป/ไฟล์ที่ด้านล่าง + ปุ่มดูตัวอย่าง ไฟล์แนบออกเป็นหน้าแยก"
   (mockup 3-แนบไฟล์ใบเสนอราคา.png, approved).

     - Section "9. รูปและไฟล์แนบ" is added under 8. ลายเซ็นฝั่งบริษัท: site photos, drawings or
       documents. Images are shrunk in the browser (longest side 1280 px, JPEG) and get a caption;
       PDF / Excel / Word are kept as files (2.5 MB each). Up to 10 per quotation.
     - The paper (quotationDocHTML) gets an extra page "เอกสารแนบ" AFTER the quotation, so page 1
       is never pushed down: the photos with their captions, then the list of attached files.
       Page 1 says how many attachments follow.
     - "ดูตัวอย่าง" in the section opens the same preview js/03 already has (previewQuotation).

   STORAGE (owner chose "Add SQL column", 2026-11-03): quotations.attachments jsonb, added by
   supabase/19-quote-attachments.sql. js/03's upsert column list is not touched: after it, this
   file writes `attachments` in a second, separate update. Until the SQL is run that update fails
   quietly (one console line), the files stay on this device, and a cloud sync does not wipe them
   (fromQuotationDb keeps the local list when the row has no such column).

   js/03 is not edited. Remove this file and the quotation behaves as before. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 var MAX=10,FILE_MAX=2.5*1024*1024,SIDE=1280;
 var list=[];                 /* the attachments of the quotation being edited */

 function $(id){return document.getElementById(id)}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function who(){try{return (currentUser&&(currentUser.name||currentUser.username))||''}catch(e){return ''}}
 function quotes(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return []}}
 function editingId(){try{return quoteEditingId||''}catch(e){return ''}}
 function locked(){try{return typeof quotePartsLocked==='function'&&quotePartsLocked()}catch(e){return false}}

 function kind(t,name){
  t=String(t||'');name=String(name||'').toLowerCase();
  if(/^image\//.test(t))return 'image';
  if(/pdf$/i.test(t)||/\.pdf$/.test(name))return 'pdf';
  if(/sheet|excel|csv/i.test(t)||/\.(xlsx?|csv)$/.test(name))return 'xlsx';
  if(/word|officedocument\.wordprocessing/i.test(t)||/\.docx?$/.test(name))return 'docx';
  return '';
 }
 var BADGE={pdf:['PDF','#b42318','#fdecea'],xlsx:['XLSX','#067647','#e7f6ee'],docx:['DOCX','#175cd3','#e8f0fe']};

 function shrink(file){
  return new Promise(function(resolve,reject){
   var url=URL.createObjectURL(file),img=new Image();
   img.onload=function(){
    var k=Math.min(1,SIDE/Math.max(img.width,img.height));
    var c=document.createElement('canvas');
    c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg',0.8));
   };
   img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('image'))};
   img.src=url;
  });
 }
 function asDataUrl(file){
  return new Promise(function(resolve,reject){
   var r=new FileReader();
   r.onload=function(){resolve(String(r.result||''))};
   r.onerror=function(){reject(r.error)};
   r.readAsDataURL(file);
  });
 }
 function addFiles(files){
  var by=who();
  return [].slice.call(files||[]).reduce(function(p,file){
   return p.then(function(){
    var k=kind(file.type,file.name);
    if(!k){toast(file.name+' — แนบได้เฉพาะรูป PDF Excel หรือ Word');return}
    if(list.length>=MAX){toast('แนบได้สูงสุด '+MAX+' ไฟล์');return}
    var job=k==='image'?shrink(file).then(function(d){return {data:d,type:'image/jpeg'}})
                       :asDataUrl(file).then(function(d){return {data:d,type:file.type||''}});
    return job.then(function(o){
     var size=Math.round((o.data.length-o.data.indexOf(',')-1)*0.75);
     if(size>FILE_MAX){toast(file.name+' ใหญ่เกิน 2.5 MB');return}
     list.push({id:'QA-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      name:file.name,type:o.type,kind:k,size:size,data:o.data,caption:'',by:by,at:new Date().toISOString()});
    },function(){toast('อ่านไฟล์ '+file.name+' ไม่ได้')});
   });
  },Promise.resolve()).then(function(){draw();recalc()});
 }
 function recalc(){try{if(typeof calcQuote==='function')calcQuote()}catch(e){}}
 function sizeLabel(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}

 /* ------------------------------------------------------------ the section ---- */
 function sectionHTML(){
  return '<div class="panel quote-section quote-attach-section" id="quoteAttachSection">'
   +'<div class="panel-head"><div><h3>9. รูปและไฟล์แนบ <span class="qat-new">ใหม่</span></h3>'
   +'<p>รูปหน้างาน แบบ หรือเอกสารประกอบ · รูป, PDF, Excel, Word · สูงสุด '+MAX+' ไฟล์ · ออกเป็นหน้าเอกสารแนบต่อจากใบเสนอราคา</p></div></div>'
   +'<div class="panel-body"><div class="qat-photos" id="qatPhotos"></div><div class="qat-files" id="qatFiles"></div>'
   +'<div class="qat-empty" id="qatEmpty">ยังไม่มีไฟล์แนบ</div>'
   +'<div class="qat-actions"><label class="soft-btn qat-add" id="qatAddBtn">📎 เพิ่มรูป / ไฟล์'
   +'<input type="file" id="qatInput" multiple hidden accept="image/*,application/pdf,.pdf,.xls,.xlsx,.csv,.doc,.docx"></label>'
   +'<button type="button" class="soft-btn" id="qatPreview">👁 ดูตัวอย่าง</button></div></div></div>';
 }
 function mount(){
  if($('quoteAttachSection'))return true;
  var after=document.querySelector('#page-quotation .quote-staff-sign-section');
  if(!after)return false;
  after.insertAdjacentHTML('afterend',sectionHTML());
  var sec=$('quoteAttachSection');
  $('qatInput').addEventListener('change',function(){var f=this.files;addFiles(f).then(function(){});this.value=''});
  $('qatPreview').addEventListener('click',function(){try{previewQuotation()}catch(e){}});
  sec.addEventListener('click',function(e){
   var rm=e.target.closest&&e.target.closest('[data-qat-rm]');
   if(rm){
    if(locked()){toast('ใบเสนอราคานี้ถูกล็อกแล้ว แก้ไฟล์แนบไม่ได้');return}
    var id=rm.getAttribute('data-qat-rm');list=list.filter(function(a){return a.id!==id});draw();recalc();return;
   }
   var op=e.target.closest&&e.target.closest('[data-qat-open]');
   if(op)openFile(op.getAttribute('data-qat-open'));
  });
  sec.addEventListener('input',function(e){
   var t=e.target;if(!t||!t.hasAttribute('data-qat-cap'))return;
   var a=list.filter(function(x){return x.id===t.getAttribute('data-qat-cap')})[0];
   if(a){a.caption=String(t.value||'').slice(0,80);recalc()}
  });
  draw();
  return true;
 }
 function draw(){
  var ph=$('qatPhotos'),fl=$('qatFiles'),em=$('qatEmpty');if(!ph||!fl)return;
  var imgs=list.filter(function(a){return a.kind==='image'}),docs=list.filter(function(a){return a.kind!=='image'});
  var lk=locked();
  ph.innerHTML=imgs.map(function(a){
   return '<figure class="qat-ph"><img src="'+esc2(a.data)+'" alt="" data-qat-open="'+esc2(a.id)+'">'
    +(lk?'':'<button type="button" class="qat-x" data-qat-rm="'+esc2(a.id)+'" aria-label="เอาออก">✕</button>')
    +'<input data-qat-cap="'+esc2(a.id)+'" maxlength="80" placeholder="คำอธิบายรูป" value="'+esc2(a.caption||'')+'"'+(lk?' disabled':'')+'></figure>';
  }).join('');
  fl.innerHTML=docs.map(function(a){
   var b=BADGE[a.kind]||['FILE','#475467','#f2f4f7'];
   return '<div class="qat-file"><span class="qat-badge" style="color:'+b[1]+';background:'+b[2]+'">'+b[0]+'</span>'
    +'<button type="button" class="qat-name" data-qat-open="'+esc2(a.id)+'">'+esc2(a.name)+'</button>'
    +'<small>'+sizeLabel(a.size)+'</small>'
    +(lk?'':'<button type="button" class="qat-x2" data-qat-rm="'+esc2(a.id)+'" aria-label="เอาออก">✕</button>')+'</div>';
  }).join('');
  if(em)em.hidden=!!list.length;
  var add=$('qatAddBtn');if(add)add.classList.toggle('is-disabled',lk||list.length>=MAX);
  var inp=$('qatInput');if(inp)inp.disabled=lk||list.length>=MAX;
 }
 function openFile(id){
  var all=list.slice();quotes().forEach(function(q){all=all.concat(Array.isArray(q.attachments)?q.attachments:[])});
  var a=all.filter(function(x){return x&&x.id===id})[0];
  if(!a||!a.data)return;
  try{
   var parts=a.data.split(','),bin=atob(parts[1]||''),u=new Uint8Array(bin.length);
   for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
   var url=URL.createObjectURL(new Blob([u],{type:a.type||'application/octet-stream'}));
   if(a.kind==='image'||a.kind==='pdf')window.open(url,'_blank');
   else{var l=document.createElement('a');l.href=url;l.download=a.name||'file';document.body.appendChild(l);l.click();l.remove()}
   setTimeout(function(){URL.revokeObjectURL(url)},60000);
  }catch(e){toast('เปิดไฟล์ไม่ได้')}
 }

 /* --------------------------------------------- carry it with the quotation ---- */
 var baseCalc=window.calcQuote;
 if(typeof baseCalc==='function'){
  window.calcQuote=function(){
   var q=baseCalc.apply(this,arguments);
   try{if(q&&typeof q==='object')q.attachments=list.slice()}catch(e){}
   return q;
  };
 }
 var baseLoad=window.loadQuotation;
 if(typeof baseLoad==='function'){
  window.loadQuotation=function(id){
   var q=quotes().filter(function(x){return x.id===id})[0];
   list=q&&Array.isArray(q.attachments)?q.attachments.slice():[];
   var r=baseLoad.apply(this,arguments);
   setTimeout(function(){mount();draw()},120);
   return r;
  };
 }
 var baseReset=window.resetQuote;
 if(typeof baseReset==='function'){
  window.resetQuote=function(){list=[];var r=baseReset.apply(this,arguments);draw();return r};
 }

 var warned=false;
 var baseUpsert=window.cloudUpsertQuotation;
 if(typeof baseUpsert==='function'){
  window.cloudUpsertQuotation=async function(q){
   var r=await baseUpsert.apply(this,arguments);
   try{
    if(q&&q.id&&Array.isArray(q.attachments)&&typeof supa!=='undefined'&&supa){
     var res=await supa.from('quotations').update({attachments:q.attachments}).eq('id',q.id);
     if(res&&res.error&&!warned){warned=true;console.warn('quotation attachments not on the server yet (run supabase/19-quote-attachments.sql):',res.error.message||res.error)}
    }
   }catch(e){if(!warned){warned=true;console.warn('quotation attachments:',e)}}
   return r;
  };
 }
 var baseFrom=window.fromQuotationDb;
 if(typeof baseFrom==='function'){
  window.fromQuotationDb=function(row){
   var q=baseFrom.apply(this,arguments);
   try{
    if(row&&Array.isArray(row.attachments))q.attachments=row.attachments;
    else{
     /* column not there yet: keep what this device holds */
     var local=quotes().filter(function(x){return x&&x.id===q.id})[0];
     if(local&&Array.isArray(local.attachments))q.attachments=local.attachments;
    }
   }catch(e){}
   return q;
  };
 }

 /* ------------------------------------------------------------- the paper ---- */
 /* inline styles only: printQuotation() (js/03) writes the paper into a new window with its own CSS */
 function attachPage(q){
  var a=(q&&Array.isArray(q.attachments))?q.attachments:[];
  if(!a.length)return '';
  var imgs=a.filter(function(x){return x.kind==='image'}),docs=a.filter(function(x){return x.kind!=='image'});
  var no=esc2(q.id||editingId()||'');
  return '<div class="quote-attach-page" style="break-before:page;page-break-before:always;margin-top:22px;padding-top:14px;border-top:2px dashed #c9d4ea">'
   +'<div style="font-weight:800;font-size:16px;color:#0c225e;margin-bottom:10px">เอกสารแนบ / Attachments'+(no?' · '+no:'')+'</div>'
   +(imgs.length?'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">'+imgs.map(function(x,i){
     return '<figure style="margin:0;break-inside:avoid;page-break-inside:avoid"><img src="'+esc2(x.data)+'" alt="" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#f5f7fb;border:1px solid #e3eaf5">'
      +'<figcaption style="font-size:11px;margin-top:4px;color:#33415c">'+(i+1)+'. '+esc2(x.caption||x.name||'')+'</figcaption></figure>';
    }).join('')+'</div>':'')
   +(docs.length?'<div style="margin-top:14px;font-size:12px;color:#1d232f"><b>ไฟล์ประกอบ / Attached files</b><ul style="margin:6px 0 0 18px;padding:0">'
     +docs.map(function(x){return '<li>'+esc2(x.name)+' ('+(BADGE[x.kind]||['FILE'])[0]+', '+sizeLabel(x.size)+')</li>'}).join('')
     +'</ul><div style="font-size:10.5px;color:#667085;margin-top:4px">ไฟล์เหล่านี้แนบมาพร้อมใบเสนอราคาในระบบ ขอรับไฟล์ได้จากเจ้าหน้าที่</div></div>':'')
   +'</div>';
 }
 var baseDoc=window.quotationDocHTML;
 if(typeof baseDoc==='function'){
  window.quotationDocHTML=function(q){
   var html=baseDoc.apply(this,arguments);
   try{
    var page=attachPage(q);
    if(page&&typeof html==='string'){
     var n=(q.attachments||[]).length;
     var note='<div style="font-size:11px;color:#475467;margin:8px 0">มีเอกสารแนบ '+n+' รายการ (ดูหน้าถัดไป)</div>';
     var at=html.indexOf('<div class="quote-paper-sign');
     if(at>=0)html=html.slice(0,at)+note+html.slice(at);
     var end=html.lastIndexOf('</div>');
     html=end>=0?html.slice(0,end)+page+html.slice(end):html+page;
    }
   }catch(e){}
   return html;
  };
 }

 /* ----------------------------------------------------------------- start ---- */
 function boot(){if(!mount())setTimeout(boot,400)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();

 var st=document.createElement('style');
 st.id='v70QuoteAttachStyle';
 st.textContent=''
  +'.qat-new{display:inline-block;margin-left:6px;background:#fff3e0;color:#b54708;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;vertical-align:middle}'
  +'.qat-photos{display:flex;flex-wrap:wrap;gap:10px}'
  +'.qat-ph{position:relative;margin:0;width:150px}'
  +'.qat-ph img{width:150px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line,#dfe9f8);display:block;cursor:zoom-in}'
  +'.qat-ph input{width:100%;margin-top:5px;font-size:12.5px;padding:5px 7px;border:1px solid var(--line,#dfe4ee);border-radius:8px}'
  +'.qat-x{position:absolute;top:5px;right:5px;width:24px;height:24px;border:0;border-radius:50%;background:#b42318;color:#fff;font-size:12px;cursor:pointer}'
  +'.qat-files{display:flex;flex-direction:column;gap:8px;margin-top:10px}'
  +'.qat-files:empty,.qat-photos:empty{display:none}'
  +'.qat-file{display:flex;align-items:center;gap:10px;border:1px solid var(--line,#dfe4ee);border-radius:11px;padding:8px 12px;background:#fff}'
  +'.qat-badge{font-weight:700;font-size:12px;border-radius:999px;padding:2px 10px;flex:none}'
  +'.qat-name{flex:1;min-width:0;text-align:left;border:0;background:none;font:inherit;color:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  +'.qat-file small{color:#667085;flex:none}'
  +'.qat-x2{border:0;background:none;color:#b42318;font-size:15px;cursor:pointer;flex:none}'
  +'.qat-empty{color:#98a2b3;font-size:13px;padding:6px 0}'
  +'.qat-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}'
  +'.qat-add{cursor:pointer}.qat-add.is-disabled{opacity:.5;pointer-events:none}'
  +'html[data-ui="flat-dark"]:is(:root,#fx) .qat-file{background:var(--fx-surface-2,#2e2e2e)!important;border-color:var(--fx-line-strong,#4d4d4d)!important}'
  +'html[data-ui="flat-dark"]:is(:root,#fx) .qat-ph input{background:var(--fx-surface-2,#2e2e2e);color:var(--fx-text,#f1f1f1);border-color:var(--fx-line-strong,#4d4d4d)}';
 document.head.appendChild(st);

 window.imodeQuoteAttach={list:function(){return list.slice()},open:openFile};
})();
