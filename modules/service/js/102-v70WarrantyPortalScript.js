/* Beta 1.0 — 2026-09-23: the customer side of the warranty flow.
   1. เช็คประกัน offers ต่ออายุประกัน when the warranty has run out (or was never registered).
   2. A warranty quote request appears in ประวัติ the moment it is sent — the owner's choice —
      not only once the office has issued a quotation.
   3. From that row the customer opens the quotation itself, where js/75 takes the signature.
   4. ประวัติ gains type filters.
   Plus: the portal repaints itself when data arrives, instead of needing a page reload.

   Nothing here writes. It renders over what js/03 and js/53 already produce, so the portal
   keeps one implementation of each screen. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function host(){return document.getElementById('portalContent')}
 function machineNow(){
  try{return (typeof portalMachine==='function')?portalMachine():null}catch(e){return null}
 }
 function when(v){
  try{if(typeof fmtDay==='function')return fmtDay(v);if(typeof fmt==='function')return fmt(v)}catch(e){}
  return String(v||'').slice(0,10);
 }

 /* ------------------------------------------------------------------ 1. ต่ออายุ --- */
 function renewButtonHTML(){
  return '<div class="pwr-renew">'
   +'<b>'+esc2(tl('ประกันของเครื่องนี้หมดอายุแล้ว','This machine is out of warranty'))+'</b>'
   +'<small>'+esc2(tl('ต่ออายุเพื่อให้ครอบคลุมค่าบริการและอะไหล่ตามเงื่อนไขประกัน',
                      'Renew to keep service and parts covered'))+'</small>'
   +'<button type="button" class="pwr-renew-btn" onclick="openPortalWarrantyRequest()">🛡 '
   +esc2(tl('ต่ออายุประกัน','Renew the warranty'))+'</button></div>';
 }
 function decorateWarranty(){
  var box=host();
  if(!box||box.querySelector('.pwr-renew'))return;
  var m=machineNow();
  if(!m)return;
  var w=null,state='none';
  try{w=(typeof latestWarrantyForMachine==='function')?latestWarrantyForMachine(m.id):null}catch(e){}
  try{if(w&&typeof warrantyState==='function')state=warrantyState(w)}catch(e){}
  /* 'expired' and a machine with no warranty at all are the two cases worth an offer.
     js/03 already puts its own ขอซื้อ Warranty button on the no-warranty screen, so that one
     is left alone rather than given a second button saying the same thing. */
  if(!w||state!=='expired')return;
  box.insertAdjacentHTML('beforeend',renewButtonHTML());
 }

 /* ------------------------------------------- 2+3+4. requests inside ประวัติ --- */
 var KINDS={
  warranty_quote:{label:'ขอใบเสนอราคาประกัน',en:'Warranty quotation request',icon:'🛡'},
  service_quote:{label:'ขอใบเสนอราคาบริการ',en:'Service quotation request',icon:'฿'}
 };
 function requestsFor(mid){
  var list=[];
  try{list=Array.isArray(lineRequests)?lineRequests:[]}catch(e){return []}
  return list.filter(function(r){return r&&r.machineId===mid&&KINDS[r.type]})
   .sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0)});
 }
 /* The quotation the office built from this request, if it has been sent. A draft is
    deliberately not offered: js/34 holds ร่าง back so a half-finished calculation never
    reads as an offer, and that rule is not weakened here. */
 function quoteForRequest(req){
  var list=[];
  try{list=Array.isArray(quotations)?quotations:[]}catch(e){return null}
  var link=null;
  try{link=(settings.quoteRequestLink||{})}catch(e){link={}}
  var byLink=Object.keys(link).filter(function(qid){return link[qid]===req.id})[0];
  var q=byLink?list.filter(function(x){return x.id===byLink})[0]:null;
  if(!q){
   var wantWarranty=req.type==='warranty_quote';
   q=list.filter(function(x){
    if(!x||x.customerId!==req.customerId)return false;
    if(wantWarranty!==(String(x.service||'')==='WP'))return false;
    return Array.isArray(x.machineIds)?x.machineIds.indexOf(req.machineId)>=0:true;
   })[0]||null;
  }
  if(!q||String(q.status||'')==='ร่าง')return null;
  return q;
 }
 function approved(qid){
  try{return !!(settings.quoteApprovals||{})[qid]}catch(e){return false}
 }
 function requestRowHTML(req){
  var k=KINDS[req.type]||{label:req.type,en:req.type,icon:'•'};
  var q=quoteForRequest(req);
  var chip=q
   ? (approved(q.id)?'<span class="pwr-chip is-ok">'+esc2(tl('อนุมัติแล้ว','Approved'))+'</span>'
                    :'<span class="pwr-chip is-new">'+esc2(tl('มีใบเสนอราคาแล้ว','Quotation ready'))+'</span>')
   : '<span class="pwr-chip">'+esc2(String(req.status||tl('ใหม่','New')))+'</span>';
  return '<div class="pwr-item" data-kind="request">'
   +'<div class="pwr-item-head"><b>'+k.icon+' '+esc2(tl(k.label,k.en))+'</b>'+chip+'</div>'
   +'<small>'+esc2(when(req.createdAt))
   +(req.months?' · '+esc2(req.months)+' '+esc2(tl('เดือน','months')):'')
   +(req.message?' · '+esc2(req.message):'')+'</small>'
   +(q?'<button type="button" class="pwr-open" data-quote="'+esc2(q.id)+'">'
       +esc2(tl('ดูใบเสนอราคา / เซ็นอนุมัติ','View and sign the quotation'))+' ›</button>':'')
   +'</div>';
 }
 function filterBarHTML(counts){
  function chip(kind,label,n){
   return '<button type="button" class="pwr-f" data-f="'+kind+'">'+esc2(label)
    +' <span>'+n+'</span></button>';
  }
  return '<div class="pwr-filters" role="group">'
   +chip('all',tl('ทั้งหมด','All'),counts.all)
   +chip('case',tl('งานบริการเครื่องจักร','Machine service'),counts.cases)
   +chip('request',tl('คำขอใบเสนอราคาประกัน','Warranty quotation requests'),counts.warranty)
   +'</div>';
 }
 function applyFilter(box,kind){
  [].forEach.call(box.querySelectorAll('.pwr-f'),function(b){
   b.classList.toggle('is-on',b.getAttribute('data-f')===kind);
  });
  [].forEach.call(box.querySelectorAll('[data-pcv-case],.portal-history-item'),function(el){
   el.style.display=(kind==='all'||kind==='case')?'':'none';
  });
  var sec=box.querySelector('.pwr-reqs');
  if(sec)sec.style.display=(kind==='all'||kind==='request')?'':'none';
 }
 function decorateHistory(){
  var box=host();
  if(!box||box.querySelector('.pwr-filters'))return;
  var m=machineNow();
  if(!m)return;
  var reqs=requestsFor(m.id);
  var caseCount=box.querySelectorAll('[data-pcv-case],.portal-history-item').length;
  var warranty=reqs.filter(function(r){return r.type==='warranty_quote'}).length;
  var counts={all:caseCount+reqs.length,cases:caseCount,warranty:reqs.length};
  if(reqs.length){
   box.insertAdjacentHTML('beforeend','<div class="pwr-reqs"><h4>'
    +esc2(tl('คำขอใบเสนอราคา','Quotation requests'))+'</h4>'
    +reqs.map(requestRowHTML).join('')+'</div>');
  }
  /* The heading js/03 and js/53 print stays first; the chips go directly under it. */
  var headEl=box.querySelector('h3')||box.firstElementChild;
  if(headEl)headEl.insertAdjacentHTML('afterend',filterBarHTML(counts));
  else box.insertAdjacentHTML('afterbegin',filterBarHTML(counts));
  applyFilter(box,'all');
  if(!warranty&&!reqs.length){
   var f=box.querySelector('.pwr-f[data-f="request"]');
   if(f)f.disabled=true;
  }
 }

 /* One delegated listener on #portalContent — it survives every re-render of its children. */
 function wire(){
  var box=host();
  if(!box||box.getAttribute('data-pwr-wired'))return;
  box.setAttribute('data-pwr-wired','1');
  box.addEventListener('click',function(e){
   var f=e.target&&e.target.closest?e.target.closest('.pwr-f'):null;
   if(f){applyFilter(box,f.getAttribute('data-f'));return}
   var open=e.target&&e.target.closest?e.target.closest('[data-quote]'):null;
   if(open&&typeof window.imodePortalOpenQuote==='function'){
    e.preventDefault();
    window.imodePortalOpenQuote(open.getAttribute('data-quote'));
   }
  });
 }

 /* ------------------------------------------------ the portal repaints itself --- */
 /* Only read-only screens are re-rendered. Re-running a form would throw away what the
    customer has typed, which is worse than showing them slightly old data. */
 var last=null,lastNode=null;
 function trackRead(name,after){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var r=base.apply(this,arguments);
   last=name;
   try{var b=host();lastNode=b?b.firstElementChild:null}catch(e){lastNode=null}
   wire();
   if(after)after();
   return r;
  };
 }
 function trackForm(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){last=null;return base.apply(this,arguments)};
 }
 function install(){
  trackRead('showPortalWarranty',decorateWarranty);
  trackRead('showPortalHistory',decorateHistory);
  trackRead('showPortalDocuments',null);
  ['openPortalWarrantyRequest','openPortalServiceQuoteRequest','openPortalIssueForm',
   'showPortalContact'].forEach(trackForm);

  /* js/85 calls renderAll() after a realtime row lands, and syncCloud() ends with it too, so
     this one hook covers both without a second subscription of its own. */
  var baseRender=window.renderAll;
  if(typeof baseRender==='function'){
   window.renderAll=function(){
    var r=baseRender.apply(this,arguments);
    try{repaint()}catch(e){}
    return r;
   };
  }
 }
 function portalVisible(){
  var p=document.getElementById('page-customer-portal');
  return !!(p&&p.classList.contains('active'));
 }
 function repaint(){
  if(!portalVisible())return;
  /* The machine card is outside #portalContent and is what "สถานะเครื่องจักร" means. */
  /* renderCustomerPortal() rewrites #portalContent too, so it may only run on the Home page —
     never over a case, a quotation or a half-filled form (detail mode). */
  var inDetail=!!document.querySelector('.imode-portal-detail-mode');
  if(!inDetail){try{if(typeof renderCustomerPortal==='function')renderCustomerPortal()}catch(e){}return}
  if(!last||typeof window[last]!=='function')return;
  var box=host();
  if(!box||!box.innerHTML)return;
  /* 2026-09-24 — BUG FIXED HERE. Reported: "พอสถานะงานอัพเดตปุ๊ป มันจะเด้งไปหน้าล่าสุดที่ลูกค้า
     เข้า". `last` was only ever cleared by a FORM, so after reading ประวัติ Service and going
     back to the Home page — or on into one case (js/53) or one quotation (js/56) — every
     realtime row re-ran showPortalHistory() and threw the customer back into it. Only redraw
     the screen that is still on screen: the detail view must still be open and #portalContent
     must still hold the very node that screen drew. Anything else put there since — the Home
     page, a case, a quotation — means that screen is gone, and so is the memory of it. */
  var shell=document.querySelector('.imode-portal-detail-mode');
  if(!shell||box.firstElementChild!==lastNode){last=null;lastNode=null;return}
  var keep=last;
  window[keep]();
  last=keep;
  try{lastNode=box.firstElementChild}catch(e){}
 }
 window.imodePortalRepaint=repaint;

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();

 /* ------------------------------------------------- 6. the office renews it --- */
 /* "ถ้าหากลูกค้าต่อประกันผ่านเซล อยากให้เราสามารถ Control ได้" — confirmed as: issue or renew a
    warranty for a machine directly, with no request from the customer.
    openWarrantyModal('', machineId) in js/03 already opens a blank registration prefilled with
    that machine and its customer, so nothing new is written here. What was missing is the
    renewal arithmetic: the new cover starts the day after the current one ends (or today, if
    it lapsed long ago) and runs for the same number of months as before. */
 function addMonthsLocal(iso,months){
  var d=new Date(String(iso)+'T00:00:00');
  if(isNaN(d))return '';
  var day=d.getDate();
  d.setMonth(d.getMonth()+months);
  if(d.getDate()<day)d.setDate(0);          /* 31 Jan + 1 month is 28/29 Feb, not 2/3 Mar */
  return [d.getFullYear(),('0'+(d.getMonth()+1)).slice(-2),('0'+d.getDate()).slice(-2)].join('-');
 }
 function todayLocal(){
  var d=new Date();
  return [d.getFullYear(),('0'+(d.getMonth()+1)).slice(-2),('0'+d.getDate()).slice(-2)].join('-');
 }
 window.imodeRenewWarranty=function(machineId){
  if(typeof window.openWarrantyModal!=='function')return;
  var prev=null;
  try{prev=(typeof latestWarrantyForMachine==='function')?latestWarrantyForMachine(machineId):null}catch(e){}
  window.openWarrantyModal('',machineId);
  /* js/03 binds this form on a timer, and the crop/photo patches rewrite the body, so the
     dates are filled after the modal has settled rather than in the same tick. */
  setTimeout(function(){
   var start=document.getElementById('wrStart'),end=document.getElementById('wrEnd'),
       months=document.getElementById('wrMonths'),note=document.getElementById('wrNote');
   if(!start||!end)return;
   var n=Number(prev&&prev.months)||12;
   var from=todayLocal();
   if(prev&&prev.endDate){
    var next=addMonthsLocal(prev.endDate,0);
    var d=new Date(String(prev.endDate)+'T00:00:00');
    if(!isNaN(d)){d.setDate(d.getDate()+1);
     next=[d.getFullYear(),('0'+(d.getMonth()+1)).slice(-2),('0'+d.getDate()).slice(-2)].join('-');}
    /* A cover that ran out long ago should start today, not backdated into a gap nobody sold. */
    if(next>from)from=next;
   }
   start.value=from;
   if(months)months.value=String(n);
   end.value=addMonthsLocal(from,n);
   if(note&&!note.value)note.value=tl('ต่ออายุประกัน','Warranty renewal');
   [start,end,months].forEach(function(el){
    if(el)el.dispatchEvent(new Event('change',{bubbles:true}));
   });
  },60);
 };

 /* The button sits in the machine popup, beside the QR and customer-page buttons, because
    that is where somebody already is when a customer rings to renew. */
 function decorateMachinePopup(){
  var body=document.getElementById('modalBody');
  if(!body||body.querySelector('[data-pwr-renew]'))return;
  var qr=body.querySelector('[onclick*="openCustomerPortalForMachine"]');
  if(!qr)return;
  var id='';
  try{id=(String(qr.getAttribute('onclick')).match(/openCustomerPortalForMachine\('([^']+)'\)/)||[])[1]||''}catch(e){}
  if(!id)return;
  qr.insertAdjacentHTML('afterend','<button type="button" class="soft-btn" data-pwr-renew '
   +'onclick="closeModal();imodeRenewWarranty('+imodeJsArg(id)+')">🛡 '
   +esc2(tl('ออก / ต่อประกัน','Issue or renew warranty'))+'</button>');
 }
 var baseModal=window.openModal;
 if(typeof baseModal==='function'){
  window.openModal=function(){
   var r=baseModal.apply(this,arguments);
   setTimeout(decorateMachinePopup,0);
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70WarrantyPortalStyle';
 st.textContent=''
 +'.pwr-renew{margin-top:16px;padding:14px;border:1px solid #f5c9c6;border-radius:14px;background:#fdeceb}'
 +'.pwr-renew b{display:block;font-size:14px;color:#9d2b26}'
 +'.pwr-renew small{display:block;font-size:11.5px;color:#a8544f;margin-top:3px;line-height:1.55}'
 +'.pwr-renew-btn{margin-top:11px;width:100%;padding:12px;border:0;border-radius:12px;cursor:pointer;'
 +'background:#e8641f;color:#fff;font-size:14px;font-weight:800;box-shadow:0 5px 0 #b34a12}'
 +'.pwr-renew-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #b34a12}'
 +'.pwr-filters{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 12px}'
 +'.pwr-f{cursor:pointer;border:1px solid #d7e3f5;background:#fff;border-radius:999px;'
 +'padding:7px 13px;font-size:12px;color:#33507e;font-weight:700}'
 +'.pwr-f span{display:inline-block;margin-left:5px;font-size:11px;color:#7d8fae}'
 +'.pwr-f.is-on{background:#0b63e5;border-color:#0b63e5;color:#fff}'
 +'.pwr-f.is-on span{color:#d6e6ff}'
 +'.pwr-f[disabled]{opacity:.45;cursor:default}'
 +'.pwr-reqs{margin-top:14px}'
 +'.pwr-reqs h4{margin:0 0 8px;font-size:12.5px;color:#12356f}'
 +'.pwr-item{border:1px solid #e2eaf7;border-radius:13px;padding:12px;margin-bottom:9px;background:#fff}'
 +'.pwr-item-head{display:flex;align-items:center;gap:8px;justify-content:space-between}'
 +'.pwr-item-head b{font-size:13px;color:#12356f}'
 +'.pwr-item small{display:block;margin-top:5px;font-size:11.5px;color:#6f81a3;line-height:1.55}'
 +'.pwr-chip{flex:none;font-size:10.5px;font-weight:700;border-radius:999px;padding:3px 9px;'
 +'background:#eef3fb;color:#41567c}'
 +'.pwr-chip.is-new{background:#fff3e6;color:#8a5a17}'
 +'.pwr-chip.is-ok{background:#e8f7ef;color:#0a7a46}'
 +'.pwr-open{margin-top:10px;width:100%;padding:10px;border-radius:11px;cursor:pointer;'
 +'border:1px solid #0b63e5;background:#f2f7ff;color:#0b63e5;font-size:12.5px;font-weight:700}'
 +'.pwr-open:hover{background:#e6f0ff}';
 document.head.appendChild(st);
})();
