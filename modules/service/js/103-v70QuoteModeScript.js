/* Beta 1.0 — 2026-09-23: ทำใบเสนอราคา is two jobs, and the page now says which one it is on.
   Asked for: two buttons at the top — Service and ประกัน — and whichever screen you arrived
   from picks the right one by itself.

   There is no new field and no new state. A warranty quotation in this system IS
   `q.service === 'WP'` — the test js/62 uses to decide which request a quotation closes and
   js/43 uses to split the list — so the buttons write that one value into the ประเภทบริการ
   select that already exists, and the highlight is READ back from it. That means the mode can
   never disagree with what will be saved, and changing ประเภทบริการ by hand moves the
   highlight too. */
(function(){
 'use strict';

 var WP='WP';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function page(){return document.getElementById('page-quotation')}
 function serviceSel(){return document.getElementById('qService')}
 function isWarranty(){
  var s=serviceSel();
  return !!(s&&String(s.value||'')===WP);
 }

 function barHTML(){
  return '<div id="qmodeBar" class="qmode" role="group" aria-label="'
   +esc2(tl('ประเภทใบเสนอราคา','Quotation type'))+'">'
   +'<button type="button" class="qmode-btn" data-qmode="service">'
   +'<b>🛠 '+esc2(tl('ทำใบเสนอราคา Service','Service quotation'))+'</b>'
   +'<small>'+esc2(tl('งานซ่อม PM ติดตั้ง และค่าเดินทาง','Repair, PM, installation and travel'))+'</small>'
   +'</button>'
   +'<button type="button" class="qmode-btn" data-qmode="warranty">'
   +'<b>🛡 '+esc2(tl('ทำใบเสนอราคาประกัน','Warranty quotation'))+'</b>'
   +'<small>'+esc2(tl('ขายหรือต่ออายุแพ็กเกจประกันเครื่อง','Sell or renew a warranty package'))+'</small>'
   +'</button></div>';
 }
 function ensureBar(){
  ensureOption();
  var p=page();
  if(!p||document.getElementById('qmodeBar'))return;
  /* Under the hero, above ส่วนที่ 1 — where the owner drew it. */
  var anchor=p.querySelector('.panel')||p.firstElementChild;
  if(!anchor)return;
  anchor.insertAdjacentHTML('beforebegin',barHTML());
  var bar=document.getElementById('qmodeBar');
  if(bar)bar.addEventListener('click',function(e){
   var b=e.target&&e.target.closest?e.target.closest('[data-qmode]'):null;
   if(!b)return;
   e.preventDefault();
   window.imodeQuoteMode(b.getAttribute('data-qmode'));
  });
  sync();
 }
 /* The dropdown belongs to the mode: a Service quotation must not offer แพ็กเกจประกัน, and a
    warranty quotation must not offer the three service types. The options are HIDDEN, never
    removed — saveQuotation() reads qService.value, and an option that is gone takes the value
    with it, which is how the WP value was being lost in the first place. `disabled` goes on
    with `hidden` because a hidden option is still reachable with the keyboard in some
    browsers. */
 function applyOptions(warranty){
  var sel=serviceSel();
  if(!sel)return;
  [].forEach.call(sel.options,function(o){
   var v=String(o.value||'');
   if(!v)return;                                   /* the "— เลือก —" placeholder always stays */
   /* WP belongs to the warranty mode; everything else — today OS / WS / DG, and anything
      added later — belongs to Service. */
   var mine=(v===WP)?warranty:!warranty;
   o.hidden=!mine;
   o.disabled=!mine;
  });
 }
 function sync(){
  var bar=document.getElementById('qmodeBar');
  var warranty=isWarranty();
  applyOptions(warranty);
  try{applyWarrantyForm(warranty)}catch(e){}
  if(!bar)return;
  [].forEach.call(bar.querySelectorAll('[data-qmode]'),function(b){
   var on=(b.getAttribute('data-qmode')==='warranty')===warranty;
   b.classList.toggle('is-on',on);
   b.setAttribute('aria-pressed',on?'true':'false');
  });
 }


 /* ---------------------------------------------- the WP option did not exist --- */
 /* Measured while building this: `qService` in index.html offers OS / WS / DG and NOTHING
    else, so js/03's own prepareWarrantyQuoteFromRequest() — `qService.value='WP'` — has
    always silently set the select to "" (a browser drops an assignment that matches no
    option). Every warranty quotation ever built from a customer request was therefore saved
    WITHOUT the WP marker, which is what js/43 filters on and what js/62 matches a request
    against. The option is added here so the value can actually be held.
    js/03 line 1467 already prices a WP quotation at 0 per machine, so the rest of the
    calculation has been waiting for this. */
 function ensureOption(){
  var sel=serviceSel();
  if(!sel||sel.querySelector('option[value="'+WP+'"]'))return;
  var o=document.createElement('option');
  o.value=WP;
  o.textContent=tl('แพ็กเกจประกัน (Warranty)','Warranty package');
  sel.appendChild(o);
  /* js/35 builds its combo list from the live options at open time, so a refresh is enough. */
  try{if(sel.__comboRefresh)sel.__comboRefresh()}catch(e){}
 }

 /* loadQuotation() reopens a saved quotation and maps WP back to 'OS' (js/03:1648), because
    until now there was no WP option to select. Re-applying it after that keeps an existing
    warranty quotation a warranty quotation instead of quietly turning it into Onsite Service
    the first time somebody edits it. */
 var baseLoad=window.loadQuotation;
 if(typeof baseLoad==='function'){
  window.loadQuotation=function(id){
   var was=null;
   try{was=(Array.isArray(quotations)?quotations:[]).filter(function(q){return q&&q.id===id})[0]}catch(e){}
   var r=baseLoad.apply(this,arguments);
   if(was&&String(was.service||'')===WP){
    setTimeout(function(){
     ensureOption();
     var sel=serviceSel();
     if(sel&&String(sel.value||'')!==WP){
      sel.value=WP;
      try{sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
     }
     sync();
     var t=document.getElementById('qWarrantyType');
     var saved='';
     try{saved=(settings.quoteWarrantyType||{})[id]||''}catch(e){}
     if(t&&saved)t.value=saved;
    },140);
   }
   return r;
  };
 }

 window.imodeQuoteMode=function(mode){
  ensureOption();
  var sel=serviceSel();
  if(!sel)return;
  var want=(mode==='warranty')?WP:'';
  /* Switching to Service clears WP and leaves the picker open on the placeholder, so the
     coordinator chooses หน้างาน / Workshop / Diagnosis deliberately rather than inheriting
     whatever was there. A quotation that is already a service one keeps its type. */
  if(mode!=='warranty'&&String(sel.value||'')!==WP){sync();return}
  if(String(sel.value||'')!==want){
   sel.value=want;
   /* js/35 shadows .value on a combo-boxed select so the visible box follows, and the inline
      onchange is what recalculates the total — a plain assignment fires neither. */
   try{sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
  }
  sync();
  try{if(typeof calcQuote==='function')calcQuote()}catch(e){}
 };


 /* ------------------------------------------- the warranty form is a different form --- */
 /* Asked for: in warranty mode drop ค่าแรงเพิ่มเติม / Diagnosis and Spare Parts, call ส่วนลด
    what it is, and turn เงื่อนไขบริการ into รายละเอียดประกัน with a package type.
    Every panel is HIDDEN, never removed: calcQuote() reads qExtraHours, qDiagnosisPaid,
    qToll and the part lines as id globals, and js/03 would throw the moment one of them is
    gone — the same reason #fieldQueue and #portalLineIdentity are still in the document. */
 var PANEL_TITLES={};
 function panelFor(prefix){
  var p=page();
  if(!p)return null;
  var found=null;
  [].forEach.call(p.querySelectorAll('.panel h3'),function(h){
   if(found)return;
   if(String(h.textContent||'').trim().indexOf(prefix)===0)found=h.closest('.panel');
  });
  return found;
 }
 function titleFor(prefix){
  var pane=panelFor(prefix);
  return pane?pane.querySelector('h3'):null;
 }
 function setPanel(prefix,show){
  var pane=panelFor(prefix);
  if(!pane)return;
  pane.style.display=show?'':'none';
 }
 function setTitle(prefix,text){
  var h=titleFor(prefix);
  if(!h)return;
  if(!PANEL_TITLES[prefix])PANEL_TITLES[prefix]=h.textContent;
  h.textContent=text||PANEL_TITLES[prefix];
 }
 function fieldOf(id){
  var el=document.getElementById(id);
  return el?(el.closest('.field')||el.parentElement):null;
 }
 function showField(id,show){
  var f=fieldOf(id);
  if(f)f.style.display=show?'':'none';
 }
 function zero(id,value){
  var el=document.getElementById(id);
  if(!el||String(el.value||'')===String(value))return;
  el.value=value;
  try{el.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
 }

 /* The package types. Kept here rather than in settings because they are a price-list
    decision the owner has not made yet — when they do, this list moves to ตั้งค่าระบบ. */
 var WTYPES=[
  {v:'standard',th:'ประกันมาตรฐาน (อะไหล่ + ค่าแรง)',en:'Standard (parts + labour)'},
  {v:'extended',th:'ต่ออายุ / ขยายเวลาประกัน',en:'Renewal / extension'},
  {v:'parts',th:'ประกันเฉพาะอะไหล่',en:'Parts only'},
  {v:'pm',th:'ประกัน + แผน PM',en:'Warranty + PM plan'}
 ];
 function typeSelectHTML(sel){
  return '<div class="field" id="qWarrantyTypeWrap"><label>'+esc2(tl('ประเภทประกัน','Warranty package'))+' *</label>'
   +'<select id="qWarrantyType">'
   +WTYPES.map(function(t){
      return '<option value="'+esc2(t.v)+'"'+(t.v===sel?' selected':'')+'>'+esc2(tl(t.th,t.en))+'</option>';
     }).join('')
   +'</select></div>';
 }
 function ensureTypeField(){
  if(document.getElementById('qWarrantyType'))return;
  var anchor=fieldOf('qService');
  if(!anchor)return;
  anchor.insertAdjacentHTML('afterend',typeSelectHTML(''));
 }

 /* Stored per quotation in settings.quoteWarrantyType — settings travel whole, while
    cloudUpsertQuotation() writes an explicit column list that would drop a new field on the
    quotation silently (part 18). js/90 protects the map from a settings push made by a device
    that has not seen it. */
 function typeMap(){
  if(!settings.quoteWarrantyType||typeof settings.quoteWarrantyType!=='object')settings.quoteWarrantyType={};
  return settings.quoteWarrantyType;
 }
 window.imodeQuoteWarrantyType=function(id){return typeMap()[id]||''};

 function applyWarrantyForm(warranty){
  ensureTypeField();
  setPanel('4.',!warranty);
  setPanel('5.',!warranty);
  setTitle('6.',warranty?tl('6. ส่วนลด','6. Discount'):null);
  setTitle('2.',warranty?tl('2. รายละเอียดประกัน','2. Warranty details'):null);
  showField('qWarrantyType',warranty);
  /* Out of scope for a package sale: travel, pickup, urgency, the "is this work covered by a
     warranty" question, and the extra-charge box under ส่วนลด. They are zeroed as they are
     hidden, so the summary can never include a charge nobody can see. */
  ['qDistance','qPickup','qUrgency','qWarranty','qOther','qToll'].forEach(function(id){
   showField(id,!warranty);
  });
  if(warranty){
   zero('qDistance','0');zero('qOther','0');zero('qToll','0');
   var pk=document.getElementById('qPickup'); if(pk&&pk.options.length)zero('qPickup',pk.options[0].value);
   var ug=document.getElementById('qUrgency'); if(ug&&ug.options.length)zero('qUrgency',ug.options[0].value);
  }
  /* js/03 shows ระยะเวลาประกัน only when การรับประกัน is set; a package sale always needs it,
     and that select is hidden here, so it is forced on. Service mode is handed back to
     js/03's own rule by clearing the inline value rather than guessing at it. */
  var wrap=document.getElementById('qWarrantyMonthsWrap');
  if(wrap){
   if(warranty)wrap.style.display='';
   else wrap.style.removeProperty('display');
  }
 }

 /* Save and restore the chosen package. quoteEditingId is a top-level let in js/03 that
    saveQuotation() sets to the record it just wrote, so it names the right quotation for
    both a new one and an edit. */
 var baseSaveQ=window.saveQuotation;
 if(typeof baseSaveQ==='function'){
  window.saveQuotation=async function(){
   var r=await baseSaveQ.apply(this,arguments);
   try{
    if(isWarranty()){
     var sel=document.getElementById('qWarrantyType');
     var id='';
     try{id=quoteEditingId||''}catch(e){}
     if(sel&&id){
      typeMap()[id]=sel.value;
      if(typeof saveLocal==='function')saveLocal();
      if(typeof cloudSaveSettings==='function')cloudSaveSettings();
     }
    }
   }catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------- arriving from somewhere else --- */
 /* Each of these fills the form on a timer of its own (js/03 uses setTimeout 80), so the
    highlight is read back after they have finished rather than guessed beforehand. */
 function refreshLater(){setTimeout(function(){ensureOption();ensureBar();sync()},160)}
 ['prepareQuotation','prepareServiceQuoteFromRequest','prepareWarrantyQuoteFromRequest',
  'loadCaseIntoQuote','resetQuote','renderQuotations'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   /* These are reached from inside a popup — the request detail, the case detail — and none
      of them closes it. js/03 calls goPage('quotation') while the modal is still open, so the
      page changes UNDERNEATH it and the visitor is left looking at the same popup, which
      reads as "the button did nothing". The popup is closed first. */
   if(/^prepare/.test(name)&&typeof window.closeModal==='function'){
    try{var m=document.getElementById('modal');
     if(m&&m.classList.contains('open'))window.closeModal()}catch(e){}
   }
   var r=base.apply(this,arguments);
   refreshLater();
   return r;
  };
 });
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   var r=baseGo.apply(this,arguments);
   if(String(name||'')==='quotation')refreshLater();
   return r;
  };
 }
 /* Changing ประเภทบริการ by hand must move the highlight, or the two would disagree. */
 document.addEventListener('change',function(e){
  if(e.target&&e.target.id==='qService')sync();
 },true);

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureBar,{once:true});
 else ensureBar();

 var st=document.createElement('style');
 st.id='v70QuoteModeStyle';
 st.textContent=''
 +'.qmode{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin:0 0 14px}'
 +'.qmode-btn{cursor:pointer;text-align:left;padding:13px 15px;border-radius:14px;'
 +'border:1px solid #d8e2f2;background:#fff;color:#12356f;transition:transform .18s ease,'
 +'box-shadow .18s ease,border-color .18s ease,background .18s ease}'
 +'.qmode-btn b{display:block;font-size:14px}'
 +'.qmode-btn small{display:block;margin-top:3px;font-size:11px;color:#6f81a3;line-height:1.5}'
 +'.qmode-btn:hover{border-color:#b9d3f5;background:#f6faff;transform:translateY(-1px)}'
 +'.qmode-btn.is-on{border-color:#0b63e5;background:linear-gradient(180deg,#0b63e5,#0a56c8);'
 +'color:#fff;box-shadow:0 5px 0 #073e93}'
 +'.qmode-btn.is-on small{color:#d6e6ff}'
 +'.qmode-btn.is-on:hover{transform:translateY(-1px)}'
 +'.qmode-btn.is-on:active{transform:translateY(3px);box-shadow:0 2px 0 #073e93}'
 +'@media(prefers-reduced-motion:reduce){.qmode-btn{transition:none}'
 +'.qmode-btn:hover,.qmode-btn.is-on:active{transform:none}}';
 document.head.appendChild(st);
})();
