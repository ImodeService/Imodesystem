/* 2026-11-07 — the quotation is now three pages of its own (quote-service.html, quote-parts.html,
   quote-warranty.html, shared code js/quote-common.js). This file connects index.html to them.

     1. Opening a saved quotation (history list, row click, the ✏ in the paper popup — every one
        of them calls loadQuotation(id)) opens the page for that quotation's TYPE with ?id=.
     2. ทำใบเสนอราคา from a case (prepareQuotation(caseId), also reached by ?page=quotation&caseId=)
        opens quote-service.html?caseId=…, where the type buttons switch to parts / warranty.
     3. A quotation saved by the new pages keeps its extra data (qty, Stock switch, expense list,
        discount in baht, edited machine prices) in the `parts` jsonb (see js/quote-common.js).
        The paper drawn here — popup, customer portal (js/56), the copy js/80 stores for the case
        page — gets its rows, remark and VAT label from js/quote-common.js for those quotations,
        and imodeQuoteWithTotals() stops re-deriving travel / labour for them.
     4. 2026-11-09: the old quotation page is no longer reachable — every route lands on the new pages
        (owner: "ในเมื่อมีหน้าใหม่แล้วก็ทำให้มันทำงานได้"); คำขอจากลูกค้า prefill the new pages.

   Way back without a release: localStorage imode_v70_quote_old_page = '1' turns 1 and 2 off on
   that device. Remove this file and index.html behaves exactly as before. */
(function(){
 'use strict';
 var QC=window.QuoteCommon;
 if(!QC)return;
 function list(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return []}}
 function find(id){return list().filter(function(q){return q&&q.id===id})[0]||null}
 function closePopup(){try{var m=document.getElementById('modal');if(m&&m.classList.contains('open')&&typeof window.closeModal==='function')window.closeModal()}catch(e){}}

 /* ------------------------------------------------------------ 1 + 2. routing ---- */
 var baseLoad=window.loadQuotation;
 if(typeof baseLoad==='function'){
  window.loadQuotation=function(id){
   if(!QC.useOldPage()){
    var q=find(id);
    closePopup();
    /* not on this device yet: the Service page loads it from the cloud and moves to its type */
    location.href=q?QC.pageUrl(q):'quote-service.html?id='+encodeURIComponent(id);
    return;
   }
   return baseLoad.apply(this,arguments);
  };
 }
 var basePrep=window.prepareQuotation;
 if(typeof basePrep==='function'){
  window.prepareQuotation=function(cid){
   if(!QC.useOldPage()){
    closePopup();
    location.href='quote-service.html'+(cid?'?caseId='+encodeURIComponent(cid):'');
    return;
   }
   return basePrep.apply(this,arguments);
  };
 }

 /* 2026-11-09 owner: "ในเมื่อมีหน้าใหม่แล้วก็ทำให้มันทำงานได้" — the new pages replace the old one.
    คำขอจากลูกค้า → ทำใบเสนอราคา opens them with what js/03 used to fill into the old form. */
 [['prepareServiceQuoteFromRequest','quote-service.html'],['prepareWarrantyQuoteFromRequest','quote-warranty.html']].forEach(function(x){
  var base=window[x[0]];
  if(typeof base!=='function')return;
  window[x[0]]=function(id){
   if(QC.useOldPage())return base.apply(this,arguments);
   var r=null;try{r=(lineRequests||[]).filter(function(y){return y&&y.id===id})[0]}catch(e){}
   closePopup();
   location.href=x[1]+'?requestId='+encodeURIComponent(id)+(r&&r.months&&x[1]==='quote-warranty.html'?'&months='+encodeURIComponent(r.months):'');
  };
 });

 /* ------------------------------------------------------------- 3. the paper ---- */
 var baseTotals=window.imodeQuoteWithTotals;
 if(typeof baseTotals==='function'){
  window.imodeQuoteWithTotals=function(q){
   if(!QC.isV2(q))return baseTotals.apply(this,arguments);
   var o={},k,meta=QC.metaOf(q)||{};
   for(k in q)if(Object.prototype.hasOwnProperty.call(q,k))o[k]=q[k];
   o.travel=QC.num(meta.travel);o.labor=QC.num(meta.labor);o.pickup=QC.num(meta.pickup);
   o.emergency=QC.num(meta.emergency);o.diagnosis=QC.num(meta.diagnosis);
   o.other=QC.num(q.otherExpense);o.warranty=false;
   return o;
  };
 }
 var baseDoc=window.quotationDocHTML;
 if(typeof baseDoc==='function'){
  window.quotationDocHTML=function(q){
   var html=baseDoc.apply(this,arguments);
   if(!QC.isV2(q)||typeof html!=='string')return html;
   try{
    html=html.replace(/(<div class="quote-paper-table"><table>[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/,function(_,a,b){return a+QC.rowsHTML(q)+b});
    html=html.replace(/(<div class="quote-paper-remark"><div class="label">Remark :<\/div><div>)[\s\S]*?(<\/div><\/div>)/,function(_,a,b){return a+QC.esc(QC.remarkText(q))+b});
    var meta=QC.metaOf(q)||{};
    var vatLabel=q.vatOn?'VAT '+QC.num(meta.vatPct)+'%':'VAT -';
    html=html.replace(/(<div style="text-align:right">)VAT [0-9.]+%(<\/div>)/,'$1'+vatLabel+'$2');
    /* 2026-11-11 owner: Ref is what the quotation says (default the case number), the contact mobile
       under Tel, and a revision names the quotation it replaces */
    var ref=QC.refOf(q),mob=QC.mobileOf(q),from=QC.revOf(q);
    html=html.replace(/(<div class="label">Ref :<\/div><div class="value">)[\s\S]*?(<\/div>)/,function(_,a,b){return a+QC.esc(ref||'-')+b});
    if(mob)html=html.replace(/(<div class="row"><div class="label">Tel :<\/div><div class="value">[\s\S]*?<\/div><\/div>)/,function(r){return r+'<div class="row"><div class="label">Mobile :</div><div class="value">'+QC.esc(mob)+'</div></div>'});
    if(from)html=html.replace(/(<div class="label">No :<\/div><div class="value">)([\s\S]*?)(<\/div>)/,function(_,a,v,b){return a+v+' <span style="font-size:11px;color:#475467">(แก้ไขจาก '+QC.esc(from)+')</span>'+b});
   }catch(e){}
   return html;
  };
 }
 /* 2026-11-11 owner: no "Spare Part - " in front of a part's name, on every quotation's paper */
 var baseDoc2=window.quotationDocHTML;
 if(typeof baseDoc2==='function'){
  window.quotationDocHTML=function(){
   var html=baseDoc2.apply(this,arguments);
   if(typeof html!=='string')return html;
   return html.replace(/(<div class="quote-paper-table">[\s\S]*?<\/table>)/,function(t){return t.replace(/<td>Spare Part - /g,'<td>')});
  };
 }

 /* ------------------------------------------------ 3b. Revise + confirm send ---- */
 /* 2026-11-11 owner: แก้ไขใบเสนอราคา makes "<เลขเดิม>-REV01" on the quotation's own page; the
    original is never changed (js/quote-common.js page(), ?revise=). */
 window.imodeReviseQuote=function(id){
  var q=find(id);
  closePopup();
  location.href=(q?QC.TYPES[QC.typeOfQuote(q)]||QC.TYPES.service:QC.TYPES.service).page+'?revise='+encodeURIComponent(id);
 };
 /* ส่งให้ลูกค้า asks first (owner 2026-11-11): the customer sees the quotation as soon as it is sent */
 var baseSend=window.imodeSendQuoteToCustomer;
 if(typeof baseSend==='function'){
  window.imodeSendQuoteToCustomer=function(id,quiet){
   var self=this,args=arguments,q=find(id);
   var draft=q&&(typeof window.imodeQuoteIsDraft!=='function'||window.imodeQuoteIsDraft(q));
   if(!draft||quiet==='confirmed')return baseSend.apply(self,args);
   if(document.getElementById('qvConfirmSend'))return;
   var d=document.createElement('div');d.id='qvConfirmSend';d.className='qvc-shade';
   d.innerHTML='<div class="qvc-card" role="dialog" aria-modal="true" aria-labelledby="qvcT"><div class="qvc-ico" aria-hidden="true">📤</div>'
    +'<b id="qvcT">ยืนยันการส่งใบเสนอราคา?</b>'
    +'<p>'+QC.esc(q.id)+' · '+QC.esc(q.customer||'-')+' · '+QC.money(q.grand)+' บาท<br>ส่งแล้วลูกค้าจะเห็นใบนี้ในหน้าลูกค้า</p>'
    +'<div class="qvc-btns"><button type="button" class="qvc-no" data-qvc="no">ยกเลิก</button><button type="button" class="qvc-yes" data-qvc="yes">ส่ง</button></div></div>';
   function close(){d.remove();document.removeEventListener('keydown',key,true)}
   function key(e){if(e.key==='Escape'){e.stopPropagation();close()}}
   d.addEventListener('click',function(e){
    var b=e.target.closest('[data-qvc]');
    if(!b){if(e.target===d)close();return}
    close();
    if(b.getAttribute('data-qvc')==='yes')baseSend.call(self,id,quiet);
   });
   document.addEventListener('keydown',key,true);
   document.body.appendChild(d);
   try{d.querySelector('.qvc-no').focus()}catch(e){}
  };
  var st=document.createElement('style');
  st.textContent='.qvc-shade{position:fixed;inset:0;background:rgba(9,18,38,.45);z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px}'
   +'.qvc-card{background:var(--fx-surface,#fff);color:var(--fx-text,#1f1f1f);border-radius:8px;max-width:420px;width:100%;padding:22px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}'
   +'.qvc-ico{font-size:34px}.qvc-card b{display:block;font-size:18px;color:var(--fx-head,#0c225e);margin:6px 0}'
   +'.qvc-card p{margin:0;color:var(--fx-muted,#5f6672);line-height:1.6}'
   +'.qvc-btns{display:flex;gap:10px;margin-top:18px}.qvc-btns button{flex:1;min-height:44px;border-radius:4px;font:inherit;font-weight:700;cursor:pointer}'
   +'.qvc-no{border:1px solid var(--fx-line,#e1e1e1);background:transparent;color:inherit}'
   +'.qvc-yes{border:0;background:#c25e00;color:#fff}.qvc-btns button:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
  document.head.appendChild(st);
 }

 /* ------------------------------------------------- 4. the old page is gone ---- */
 /* 2026-11-09: every way onto the old in-app page (menu, Home card, ?page=quotation, code that calls
    goPage('quotation')) now lands on the new Service page. The old page's markup stays in index.html
    unused; localStorage imode_v70_quote_old_page = '1' brings it back on one device. */
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   if(String(name||'')==='quotation'&&!QC.useOldPage()){closePopup();location.href=QC.TYPES.service.page;return}
   return baseGo.apply(this,arguments);
  };
 }

 /* ------------------------------- 4b. the menu item ทำใบเสนอราคา opens the new page ---- */
 /* 2026-11-08 owner: "ปุ่มแบบเดิมก็ได้" — the sidebar item goes straight to the new quotation page
    (Service first; the type buttons at its top switch to อะไหล่ / ประกัน). The old page stays one
    link away (its footer link, and ?page=quotation, which this does not touch). */
 document.addEventListener('click',function(e){
  /* every way in that a person clicks: the sidebar, the Home board's card (quick and โมดูลทั้งหมด),
     the phone's bottom bar, the เมนูเพิ่มเติม sheet. Calls made by code (a request or a case being
     turned into a quotation, which then fill the old form) are not clicks and keep the old page. */
  var it=e.target&&e.target.closest&&e.target.closest('[data-page="quotation"]:not(.page),[onclick*="goPage(\'quotation\')"]');
  if(!it||QC.useOldPage())return;
  if(it.closest('.rhome-editing'))return;     /* the Home board is being rearranged (js/155) */
  e.preventDefault();e.stopImmediatePropagation();
  location.href=QC.TYPES.service.page;
 },true);

 /* ------------------------------------------ 5. the sidebar for the new pages ---- */
 /* 2026-11-08 owner (option A): the three quote pages show the same left menu as this app. They
    are separate documents and cannot run the dozens of scripts that build and role-filter the
    menu here, so this page leaves a snapshot of the menu AS IT IS SHOWN (role visibility, groups,
    labels, badges already applied) and quote-common.js draws it. Per account: another account's
    snapshot is never used. */
 var SIDE_KEY='imode_v70_side_menu',sideT=0;
 function shown(el){if(!el||el.hidden)return false;var cs=getComputedStyle(el);return cs.display!=='none'&&cs.visibility!=='hidden'}
 function snapSide(){
  try{
   var nav=document.querySelector('#sidebar .side-nav');if(!nav)return;
   var u=null;try{u=currentUser}catch(e){}
   if(!u)return;
   var items=[];
   [].forEach.call(nav.querySelectorAll('.nav-group, .nav-item[data-page]'),function(el){
    if(el.classList.contains('nav-group')){
     if(!shown(el))return;
     var l=el.querySelector('.nav-group-label');items.push({g:String((l||el).textContent||'').trim()});return;
    }
    /* role visibility sets style.display (applyRoleVisibility, js/44); a collapsed group only adds
       .nav-item-collapsed (js/36), and its items still belong in the menu */
    if(el.style.display==='none'||el.hidden)return;
    var ic=el.querySelector('span'),tx=el.querySelector('b'),bd=el.querySelector('.nav-badge');
    items.push({p:el.getAttribute('data-page'),i:ic?ic.textContent:'',t:tx?String(tx.textContent||'').trim():String(el.textContent||'').trim(),
     n:bd&&shown(bd)?String(bd.textContent||'').trim():''});
   });
   if(!items.some(function(x){return x.p}))return;
   localStorage.setItem(SIDE_KEY,JSON.stringify({u:String(u.username||u.id||u.name||''),at:Date.now(),items:items}));
  }catch(e){}
 }
 function queueSide(){clearTimeout(sideT);sideT=setTimeout(snapSide,700)}
 function watchSide(){
  var nav=document.querySelector('#sidebar .side-nav');
  if(!nav){setTimeout(watchSide,800);return}
  try{new MutationObserver(queueSide).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden','class'],characterData:true})}catch(e){}
  queueSide();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchSide,{once:true});else watchSide();
 /* leaving for a quote page right after load: take the latest menu with us */
 window.addEventListener('pagehide',snapSide);

 var st=document.createElement('style');
 st.id='v70QuotePagesStyle';
 st.textContent='.qp-newbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px;padding:10px 14px;'
  +'border:1px solid #f9c896;background:#fff6ec;border-radius:12px;font-size:13px}'
  +'.qp-newbar b{color:#b45309}.qp-newbar a{color:#0b63e5;font-weight:700;text-decoration:none}'
  +'.qp-newbar a:hover{text-decoration:underline}.qp-newbar small{color:#6f81a3;flex-basis:100%}';
 document.head.appendChild(st);
})();
