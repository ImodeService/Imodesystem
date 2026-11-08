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
     4. The old quotation page stays (owner: keep it until the new pages pass their tests), with a
        bar on top linking to the new pages.

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
    if(q){closePopup();location.href=QC.pageUrl(q);return}
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

 /* ------------------------------------------------------------- 3. the paper ---- */
 var baseTotals=window.imodeQuoteWithTotals;
 if(typeof baseTotals==='function'){
  window.imodeQuoteWithTotals=function(q){
   if(!QC.isV2(q))return baseTotals.apply(this,arguments);
   var o={},k,meta=QC.metaOf(q)||{};
   for(k in q)if(Object.prototype.hasOwnProperty.call(q,k))o[k]=q[k];
   o.travel=QC.num(meta.travel);o.labor=QC.num(meta.labor);o.pickup=0;
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
   }catch(e){}
   return html;
  };
 }

 /* ------------------------------------------------- 4. a way to the new pages ---- */
 function ensureBar(){
  var p=document.getElementById('page-quotation');
  if(!p||document.getElementById('qpNewBar'))return;
  var anchor=document.getElementById('qmodeBar')||p.querySelector('.panel')||p.firstElementChild;
  if(!anchor)return;
  var t=QC.TYPES;
  anchor.insertAdjacentHTML('beforebegin','<div id="qpNewBar" class="qp-newbar" role="note"><b>หน้าใบเสนอราคาแบบใหม่</b>'
   +Object.keys(t).map(function(k){return '<a href="'+t[k].page+'">'+t[k].icon+' '+QC.esc(t[k].label)+'</a>'}).join('')
   +'<small>หน้านี้เป็นแบบเดิม ใช้ได้จนกว่าหน้าใหม่จะทดสอบเสร็จ</small></div>');
 }
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   var r=baseGo.apply(this,arguments);
   if(String(name||'')==='quotation')setTimeout(ensureBar,300);
   return r;
  };
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(ensureBar,400)},{once:true});
 else setTimeout(ensureBar,400);

 /* ------------------------------- 4b. the menu item ทำใบเสนอราคา opens the new page ---- */
 /* 2026-11-08 owner: "ปุ่มแบบเดิมก็ได้" — the sidebar item goes straight to the new quotation page
    (Service first; the type buttons at its top switch to อะไหล่ / ประกัน). The old page stays one
    link away (its footer link, and ?page=quotation, which this does not touch). */
 document.addEventListener('click',function(e){
  var it=e.target&&e.target.closest&&e.target.closest('#sidebar .nav-item[data-page="quotation"]');
  if(!it||QC.useOldPage())return;
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
