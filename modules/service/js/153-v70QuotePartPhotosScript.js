/* 2026-10-30 — ใบเสนอราคา: a photo for each spare part.

   Admin (LINE, 2026-10-30): "อยากได้รูปสินค้า หรืออะไหล่แนบเข้าไปด้วย" and "ให้แนบไฟล์รูปไว้ตรงนี้" — the
   empty space beside ชื่ออะไหล่ in 5. Spare อะไหล่.

     1. Each part row gets a 📎 button after the name. Photos are shrunk in the browser (longest side
        1024 px, JPEG) and kept on the part as p.photos — up to 4. quotePartLines is copied whole into
        the quotation (parts: JSON copy of quotePartLines, js/03) and cloudUpsertQuotation() sends
        `parts` as one jsonb, so the photos travel with the quotation; nothing new on the server.
     2. The quotation paper (quotationDocHTML, js/03) gets "รูปอะไหล่ที่เสนอ" just BEFORE the signature
        block, so the customer signs below the photos. Parts priced at 0 are not on the paper and their
        photos are left out too.

   js/03 is not edited. Remove this file and the rows, the paper and the saved data behave as before
   (stored photos are simply not shown). */
(function(){
 'use strict';
 var MAX=4,SIDE=1024;
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function lines(){try{return Array.isArray(quotePartLines)?quotePartLines:null}catch(e){return null}}
 function locked(){try{return typeof quotePartsLocked==='function'&&quotePartsLocked()}catch(e){return false}}

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

 /* ---------------------------------------------------------------- the rows ---- */
 function decorate(){
  var box=document.getElementById('quotePartLines'),list=lines();
  if(!box||!list)return;
  var dis=locked();
  [].forEach.call(box.querySelectorAll('.quote-part-line'),function(row,i){
   if(row.querySelector('.qpp-btn'))return;
   var p=list[i]||{},ph=Array.isArray(p.photos)?p.photos:[];
   row.classList.add('has-photo-btn');
   var btn=document.createElement('label');
   btn.className='qpp-btn'+(dis?' is-disabled':'');
   btn.title='แนบรูปอะไหล่ (สูงสุด '+MAX+' รูป)';
   btn.innerHTML='📎'+(ph.length?'<b>'+ph.length+'</b>':'')
     +(dis?'':'<input type="file" accept="image/*" multiple hidden data-qpp="'+i+'">');
   var name=row.querySelector('input');
   if(name&&name.nextSibling)row.insertBefore(btn,name.nextSibling);else row.appendChild(btn);
   if(ph.length){
    var strip=document.createElement('div');
    strip.className='qpp-strip';
    strip.innerHTML=ph.map(function(src,k){
     return '<span class="qpp-thumb"><img src="'+esc2(src)+'" alt="">'
       +(dis?'':'<button type="button" data-qpp-del="'+i+'|'+k+'" aria-label="ลบรูปภาพ" title="ลบรูปภาพ">✕</button>')+'</span>';
    }).join('');
    row.appendChild(strip);
   }
  });
 }
 var baseRender=window.renderQuotePartLines;
 if(typeof baseRender==='function'){
  window.renderQuotePartLines=function(){
   var r=baseRender.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }
 document.addEventListener('change',function(e){
  var inp=e.target;
  if(!inp||!inp.matches||!inp.matches('input[data-qpp]'))return;
  var i=Number(inp.getAttribute('data-qpp')),list=lines(),p=list&&list[i];
  if(!p)return;
  var files=[].slice.call(inp.files||[]).filter(function(f){return /^image\//.test(f.type)});
  p.photos=Array.isArray(p.photos)?p.photos:[];
  var room=MAX-p.photos.length;
  if(room<=0){toast('แนบได้สูงสุด '+MAX+' รูปต่ออะไหล่');return}
  if(files.length>room)toast('แนบได้อีก '+room+' รูป');
  files.slice(0,room).reduce(function(pr,f){
   return pr.then(function(){return shrink(f).then(function(d){p.photos.push(d)},function(){toast('อ่านรูป '+f.name+' ไม่ได้')})});
  },Promise.resolve()).then(function(){
   try{window.renderQuotePartLines();if(typeof calcQuote==='function')calcQuote()}catch(x){}
  });
 });
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-qpp-del]'):null;
  if(!b)return;
  e.preventDefault();
  if(!confirm('ต้องการลบรูปภาพนี้หรือไม่?'))return;
  var a=b.getAttribute('data-qpp-del').split('|'),list=lines(),p=list&&list[Number(a[0])];
  if(p&&Array.isArray(p.photos))p.photos.splice(Number(a[1]),1);
  try{window.renderQuotePartLines();if(typeof calcQuote==='function')calcQuote()}catch(x){}
 });

 /* --------------------------------------------------------------- the paper ---- */
 function photoSection(q){
  if(!q||q.service==='DG')return '';
  var items=[];
  (q.parts||[]).forEach(function(p){
   var sale=0;try{sale=(Number(p.cost)||0)*(1+quoteMarkup(p.type))}catch(e){}
   if(!sale||!Array.isArray(p.photos)||!p.photos.length)return;
   p.photos.forEach(function(src){items.push({src:src,name:p.name||'อะไหล่'})});
  });
  if(!items.length)return '';
  /* inline styles: printQuotation() (js/03) writes the paper into a new window with its own CSS only */
  return '<div class="quote-paper-photos" style="margin:12px 0;border:1px solid #cfd8ea;padding:10px;break-inside:avoid;page-break-inside:avoid">'
   +'<div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#0c225e">รูปอะไหล่ที่เสนอ / Spare Part Photos</div>'
   +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'+items.map(function(it){
     return '<figure style="margin:0;text-align:center"><img src="'+esc2(it.src)+'" alt="" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#f5f7fb;border:1px solid #e3eaf5">'
       +'<figcaption style="font-size:10px;margin-top:3px;color:#33415c">'+esc2(it.name)+'</figcaption></figure>';
   }).join('')+'</div></div>';
 }
 var baseDoc=window.quotationDocHTML;
 if(typeof baseDoc==='function'){
  window.quotationDocHTML=function(q){
   var html=baseDoc.apply(this,arguments);
   try{
    var sec=photoSection(q);
    if(sec&&typeof html==='string'){
     var at=html.indexOf('<div class="quote-paper-sign');
     html=at>=0?html.slice(0,at)+sec+html.slice(at):html;
    }
   }catch(e){}
   return html;
  };
 }

 var st=document.createElement('style');
 st.id='v70QuotePartPhotosStyle';
 st.textContent=''
  +'.quote-part-line.has-photo-btn{grid-template-columns:minmax(150px,1fr) 46px 110px 150px 120px 38px}'
  +'.qpp-btn{display:inline-flex;align-items:center;justify-content:center;gap:3px;height:40px;border:1px solid var(--line,#dfe9f8);border-radius:10px;background:#fbfcff;cursor:pointer;font-size:16px}'
  +'.qpp-btn b{font-size:11px;background:#0b63e5;color:#fff;border-radius:999px;padding:1px 6px}'
  +'.qpp-btn.is-disabled{opacity:.5;cursor:not-allowed}'
  +'.qpp-strip{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}'
  +'.qpp-thumb{position:relative;width:64px;height:64px;border-radius:9px;overflow:hidden;border:1px solid var(--line,#dfe9f8)}'
  +'.qpp-thumb img{width:100%;height:100%;object-fit:cover;display:block}'
  +'.qpp-thumb button{position:absolute;top:3px;right:3px;width:20px;height:20px;border:0;border-radius:50%;background:#b42318;color:#fff;font-size:11px;line-height:20px;padding:0;cursor:pointer}'
  +'@media(max-width:760px){.quote-part-line.has-photo-btn{grid-template-columns:1fr 46px 85px}}'
  +'';
 document.head.appendChild(st);
})();
