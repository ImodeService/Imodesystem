/* 2026-11-04 — ใบเสนอราคาอะไหล่, the third kind of quotation (plan item 2, mockup 2a).
   Asked for: a third button next to "ทำใบเสนอราคา Service" and "ทำใบเสนอราคาประกัน" for a
   customer who only buys parts.

   Same idea as js/103: no new table and no new field. A parts quotation IS `q.service === 'SP'`,
   written into the ประเภทบริการ select that already exists, and the highlight is read back from
   it, so the button can never disagree with what is saved.

   In parts mode the form keeps ลูกค้า, อ้างอิงเคส (optional), Pickup / Delivery (ค่าจัดส่ง from
   the distance), VAT, 5. Spare อะไหล่ and 6. ค่าใช้จ่ายอื่น / ส่วนลด. Machines (3.) and labour (4.)
   are hidden and the machine lines are emptied, because js/03 machineRate() would otherwise
   charge a Diagnosis rate for each machine on an 'SP' quotation. Panels are hidden, never
   removed: calcQuote() reads their inputs as id globals.

   Not here yet: picking parts from an imported price list with photos (needs item 4a import). */
(function(){
 'use strict';

 var SP='SP';
 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function sel(){return document.getElementById('qService')}
 function isParts(){var s=sel();return !!(s&&String(s.value||'')===SP)}
 function fire(el){try{el.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}}

 function ensureOption(){
  var s=sel();
  if(!s||s.querySelector('option[value="'+SP+'"]'))return;
  var o=document.createElement('option');
  o.value=SP;
  o.textContent=tl('ขายอะไหล่ (Spare Parts)','Spare parts sale');
  s.appendChild(o);
  try{if(s.__comboRefresh)s.__comboRefresh()}catch(e){}
 }

 function btnHTML(){
  return '<button type="button" class="qmode-btn" data-qmode="parts">'
   +'<b>📦 '+esc2(tl('ทำใบเสนอราคาอะไหล่','Spare parts quotation'))+'</b>'
   +'<small>'+esc2(tl('ขายอะไหล่ / ชิ้นส่วน ไม่มีค่าแรง','Parts only, no labour'))+'</small>'
   +'</button>';
 }
 function ensureButton(){
  ensureOption();
  var bar=document.getElementById('qmodeBar');
  if(!bar||bar.querySelector('[data-qmode="parts"]'))return;
  var w=bar.querySelector('[data-qmode="warranty"]');
  if(w)w.insertAdjacentHTML('beforebegin',btnHTML());else bar.insertAdjacentHTML('beforeend',btnHTML());
  sync();
 }

 /* ------------------------------------------------------------- panels --- */
 var TITLES={};
 function panelFor(prefix){
  var p=document.getElementById('page-quotation');if(!p)return null;
  var found=null;
  [].forEach.call(p.querySelectorAll('.panel h3'),function(h){
   if(found)return;
   var t=String(h.textContent||'').trim();
   if(t.indexOf(prefix)===0)found=h.closest('.panel');
  });
  return found;
 }
 function setPanel(prefix,show){var p=panelFor(prefix);if(p)p.style.display=show?'':'none'}
 function setTitle(prefix,text){
  var p=panelFor(prefix);var h=p&&p.querySelector('h3');if(!h)return;
  if(!TITLES[prefix])TITLES[prefix]=h.textContent;
  if(text)h.textContent=text;
  else if(h.getAttribute('data-sp-title')==='1')h.textContent=TITLES[prefix];
  h.setAttribute('data-sp-title',text?'1':'0');
 }
 function fieldOf(id){var el=document.getElementById(id);return el?(el.closest('.field')||el.parentElement):null}
 function showField(id,show){var f=fieldOf(id);if(f)f.style.display=show?'':'none'}
 function setVal(id,v){var el=document.getElementById(id);if(!el||String(el.value)===String(v))return;el.value=v;fire(el)}

 var wasParts=false;
 function applyForm(on){
  setPanel('3.',!on);
  if(on){setPanel('4.',false);setPanel('5.',true)}
  else if(wasParts){setPanel('4.',true)}           /* js/103 owns 4./5. in the other two modes */
  setTitle('2.',on?tl('2. การส่งของ / VAT','2. Delivery / VAT'):null);
  var p2=panelFor('2.'),sub=p2&&p2.querySelector('.panel-head p');
  if(sub){
   if(!sub.hasAttribute('data-sp-orig'))sub.setAttribute('data-sp-orig',sub.textContent);
   sub.textContent=on?tl('ใส่ระยะทางถ้าต้องจัดส่ง ระบบคิดค่าส่งให้ตาม Pickup / Delivery','Distance is used for the delivery fee'):sub.getAttribute('data-sp-orig');
  }
  /* the type is set by the button, so the ประเภทบริการ select is only noise here */
  ['qService','qUrgency','qWarranty'].forEach(function(id){showField(id,!on)});
  if(on){
   setVal('qUrgency','normal');
   setVal('qWarranty','none');
   var wm=document.getElementById('qWarrantyMonthsWrap');if(wm)wm.style.display='none';
   /* js/03 machineRate() has no 'SP' branch and falls through to the Diagnosis price, so a
      parts quotation must carry no machine lines. */
   try{
    if(typeof quoteMachineLines!=='undefined'&&quoteMachineLines.length){
     quoteMachineLines.length=0;
     if(typeof renderQuoteMachineLines==='function')renderQuoteMachineLines();
    }
   }catch(e){}
  }
  /* js/03's default remark says the price does NOT include parts, which is the opposite of a
     parts quotation. Only the untouched default is swapped, never text somebody typed. */
  var n=document.getElementById('qNote');
  if(n){
   var cur=String(n.value||'').replace(/\r/g,'').trim();
   if(on&&(cur===''||cur===SVC_NOTE)){n.value=PARTS_NOTE;fire(n)}
   else if(!on&&wasParts&&cur===PARTS_NOTE){n.value=SVC_NOTE;fire(n)}
  }
  wasParts=on;
 }
 var SVC_NOTE='ราคาในใบเสนอราคานี้ไม่รวมอะไหล่\nรับประกันหลังงานซ่อม 30 วัน';
 var PARTS_NOTE='ราคารวมค่าอะไหล่ตามรายการ ไม่รวมค่าแรงติดตั้ง\nกรุณาตรวจสอบรุ่นเครื่องให้ตรงกับอะไหล่ก่อนยืนยัน';

 function sync(){
  var on=isParts();
  var s=sel();
  if(s)[].forEach.call(s.options,function(o){
   var v=String(o.value||'');if(!v)return;
   if(v===SP){o.hidden=!on;o.disabled=!on}
   else if(on){o.hidden=true;o.disabled=true}
  });
  var bar=document.getElementById('qmodeBar');
  if(bar)[].forEach.call(bar.querySelectorAll('[data-qmode]'),function(b){
   var m=b.getAttribute('data-qmode');
   var want=on?(m==='parts'):(m==='parts'?false:b.classList.contains('is-on'));
   if(on&&m!=='parts')want=false;
   b.classList.toggle('is-on',want);
   b.setAttribute('aria-pressed',want?'true':'false');
  });
  try{applyForm(on)}catch(e){}
 }

 /* js/103's switch only knows Service and WP: from SP, "Service" did nothing (it returns early
    when the value is not WP). Parts mode is handled here and the rest is passed on. */
 var baseMode=window.imodeQuoteMode;
 window.imodeQuoteMode=function(mode){
  ensureOption();
  var s=sel();
  if(mode==='parts'){
   if(s&&s.value!==SP){
    /* show the option before assigning, a hidden+disabled option still takes the value but
       some combo boxes skip it */
    var o=s.querySelector('option[value="'+SP+'"]');if(o){o.hidden=false;o.disabled=false}
    s.value=SP;fire(s);
   }
   sync();
   try{if(typeof quoteServiceChanged==='function')quoteServiceChanged()}catch(e){}
   try{if(typeof calcQuote==='function')calcQuote()}catch(e){}
   return;
  }
  if(s&&s.value===SP){
   /* leaving parts mode: un-hide the other options first (js/103 decides which stay) */
   [].forEach.call(s.options,function(o){o.hidden=false;o.disabled=false});
   s.value=mode==='warranty'?'WP':'';
   fire(s);
  }
  var r=typeof baseMode==='function'?baseMode.apply(this,arguments):undefined;
  sync();
  return r;
 };

 /* The bar's own click listener calls window.imodeQuoteMode, so the new button needs nothing
    extra. js/103 re-reads the mode on every change of qService (capture phase); this runs
    after it so the parts highlight and panels win. */
 document.addEventListener('change',function(e){
  if(e.target&&e.target.id==='qService')setTimeout(sync,0);
 });

 /* On the printed quotation js/03 shows the raw code for a type it does not know. */
 var baseDoc=window.quotationDocHTML;
 if(typeof baseDoc==='function'){
  window.quotationDocHTML=function(q){
   var html=baseDoc.apply(this,arguments);
   try{
    if(q&&String(q.service||'')===SP&&typeof html==='string'){
     html=html.replace(/(>|:\s*)SP(<|\s*-)/g,'$1Spare Parts$2');
    }
   }catch(e){}
   return html;
  };
 }

 function later(){setTimeout(function(){ensureButton();sync()},260)}
 ['prepareQuotation','prepareServiceQuoteFromRequest','prepareWarrantyQuoteFromRequest',
  'loadCaseIntoQuote','resetQuote','loadQuotation'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){var r=base.apply(this,arguments);later();return r};
 });
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   var r=baseGo.apply(this,arguments);
   if(String(name||'')==='quotation')later();
   return r;
  };
 }
 var st=document.createElement('style');
 st.id='v70PartsQuoteStyle';
 st.textContent='#qmodeBar{grid-template-columns:repeat(3,minmax(0,1fr))}'
  +'@media (max-width:760px){#qmodeBar{grid-template-columns:1fr}}';
 document.head.appendChild(st);

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',later,{once:true});
 else later();
})();
