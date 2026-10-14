/* Version 1.0 — 2026-09-24: an orange dot on the customer's buttons when the office did
   something they have not looked at yet.

   Asked for: "หน้าของลูกค้าเวลามีการอัพเดตสถานะอะไรที่ส่งไปถึงลูกค้า เช่นใบเสนอราคา อยากให้มีจุด
   แจ้งเตือนสีส้มขึ้นมาที่ปุ่มนั้นๆ … หลังเปิดดูใบนั้นๆแล้วจุดนั้นจะหายไป — ทำแบบนี้กับอันที่มีการ
   Action กับแอดมินหรือช่าง". Four buttons carry something the office or a technician changes:

     ใบเสนอราคาของฉัน  a quotation sent to this machine, or its status / total changed
     ประวัติ Service    a case of this machine moved (status, field status, a report filed)
     เอกสารเครื่อง       a document added to this machine
     เช็คประกัน          the warranty record changed

   The dot is per item: opening that quotation or that case clears it, and the list rows carry the
   same dot, so the customer can see WHICH one is new. The button's dot goes when nothing under
   it is unseen.

   There is no customer account, so "seen" is per phone: imode_v70_portal_seen,
   {machineId: {q:{id:sig}, c:{id:sig}, d:sig, w:sig}}. A signature is only what the customer can
   see change, so an internal edit that bumps updatedAt does not light a dot.

   FIRST VISIT for a machine on a phone records everything as seen — otherwise every old case
   would light up — EXCEPT quotations still waiting for the customer's approval, because those are
   exactly what the customer has to act on. A case the customer reported themself (still เคสใหม่)
   is never new to them. */
(function(){
 'use strict';
 var KEY='imode_v70_portal_seen';
 function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return {}}}
 function save(v){try{localStorage.setItem(KEY,JSON.stringify(v))}catch(e){}}
 function machine(){try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}}
 function arr(fn){try{var a=fn();return Array.isArray(a)?a:[]}catch(e){return []}}

 function quotesFor(m){
  return arr(function(){return quotations}).filter(function(q){
   if(!q||q.status==='ร่าง'||q.customerId!==m.customerId)return false;
   var ids=Array.isArray(q.machineIds)?q.machineIds:[];
   return !ids.length||ids.indexOf(m.id)>=0;
  });
 }
 function casesFor(m){return arr(function(){return cases}).filter(function(c){return c&&c.machineId===m.id})}
 function hasReport(cid){return arr(function(){return serviceReports}).some(function(r){return r&&r.caseId===cid})}
 function qSig(q){return [q.status||'',q.grand||'',q.updatedAt||q.createdAt||''].join('|')}
 function cSig(c){return [c.status||'',c.fieldStatus||'',hasReport(c.id)?'r':''].join('|')}
 function dSig(m){
  return arr(function(){return machineDocuments}).filter(function(d){return d&&d.machineId===m.id})
   .map(function(d){return d.id}).sort().join(',');
 }
 function wSig(m){
  try{var w=typeof latestWarrantyForMachine==='function'?latestWarrantyForMachine(m.id):null;
   return w?[w.id,w.startDate||'',w.endDate||'',w.status||''].join('|'):''}catch(e){return ''}
 }
 function approved(id){try{return typeof window.imodeQuoteApproved==='function'&&!!window.imodeQuoteApproved(id)}catch(e){return false}}

 /* The record for this machine, created — and baselined — the first time it is asked for. */
 function rec(m){
  var all=load(),r=all[m.id];
  if(!r){
   r={q:{},c:{},d:dSig(m),w:wSig(m)};
   quotesFor(m).forEach(function(q){if(approved(q.id))r.q[q.id]=qSig(q)});
   casesFor(m).forEach(function(c){r.c[c.id]=cSig(c)});
   all[m.id]=r;save(all);
  }
  return r;
 }
 function put(m,fn){var all=load(),r=all[m.id]||rec(m);fn(r);all[m.id]=r;save(all)}

 function unseen(m){
  var r=rec(m);
  var q=quotesFor(m).filter(function(x){return r.q[x.id]!==qSig(x)}).map(function(x){return x.id});
  var c=casesFor(m).filter(function(x){
   if(r.c[x.id]===cSig(x))return false;
   return !(r.c[x.id]===undefined&&x.status==='เคสใหม่');
  }).map(function(x){return x.id});
  return {q:q,c:c,d:dSig(m)!==(r.d||''),w:wSig(m)!==(r.w||'')};
 }
 window.imodePortalUnseen=function(){var m=machine();return m?unseen(m):null};

 /* ------------------------------------------------------------------ painting ---- */
 var BTN={q:'showPortalQuotations',c:'showPortalHistory',d:'showPortalDocuments',w:'showPortalWarranty'};
 function dot(el,on){
  if(!el)return;
  var d=el.querySelector(':scope > .pdot');
  if(!on){if(d)d.remove();return}
  if(!d){d=document.createElement('span');d.className='pdot';d.setAttribute('aria-label','มีอัปเดตใหม่');el.appendChild(d)}
 }
 function paint(){
  var m=machine(),page=document.getElementById('page-customer-portal');
  if(!m||!page)return;
  var u=unseen(m);
  Object.keys(BTN).forEach(function(k){
   var b=page.querySelector('button[onclick^="'+BTN[k]+'("]');
   dot(b,k==='q'||k==='c'?u[k].length>0:u[k]);
  });
  [].forEach.call(page.querySelectorAll('[data-pquote-open],[data-pquote-id]'),function(row){
   var id=row.getAttribute('data-pquote-open')||row.getAttribute('data-pquote-id');
   dot(row,u.q.indexOf(id)>=0);
  });
  [].forEach.call(page.querySelectorAll('[data-pcv-case]'),function(row){
   dot(row,u.c.indexOf(row.getAttribute('data-pcv-case'))>=0);
  });
 }
 window.imodePaintPortalDots=paint;

 /* ------------------------------------------------------------------ seeing ------ */
 function seeQuote(id){var m=machine();if(!m)return;var q=quotesFor(m).filter(function(x){return x.id===id})[0];if(q)put(m,function(r){r.q[id]=qSig(q)})}
 function seeCase(id){var m=machine();if(!m)return;var c=casesFor(m).filter(function(x){return x.id===id})[0];if(c)put(m,function(r){r.c[id]=cSig(c)})}
 function after(fn){setTimeout(function(){try{fn()}catch(e){}try{paint()}catch(e){}},0)}
 function wrap(name,fn){
  var base=window[name];if(typeof base!=='function')return;
  window[name]=function(){var args=arguments,r=base.apply(this,args);after(function(){fn.apply(null,args)});return r};
 }
 /* Wrapped at DOMContentLoaded, after the listeners js/08, js/53, js/56 and js/75 registered
    earlier: some of them (re)assign these names inside their own start-up, and a wrapper put on
    at parse time would be replaced. */
 function install(){
 wrap('imodePortalOpenQuote',function(id){seeQuote(id)});
 /* approving changes the quotation's status — the customer's own act, not news to them */
 wrap('imodePortalApproveQuote',function(id){seeQuote(id);setTimeout(function(){seeQuote(id);paint()},1500)});
 wrap('imodePortalOpenCase',function(id){seeCase(id)});
 wrap('showPortalDocuments',function(){var m=machine();if(m)put(m,function(r){r.d=dSig(m)})});
 wrap('showPortalWarranty',function(){var m=machine();if(m)put(m,function(r){r.w=wSig(m)})});
 ['showPortalQuotations','showPortalHistory','renderCustomerPortal'].forEach(function(n){wrap(n,function(){})});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();

 /* Data moves under an open page — a sync, a realtime event. Only while the portal is shown. */
 setInterval(function(){
  try{var p=document.getElementById('page-customer-portal');if(p&&p.classList.contains('active')&&!document.hidden)paint()}catch(e){}
 },4000);

 var st=document.createElement('style');
 st.textContent=[
  '#page-customer-portal .portal-action-grid > button,#page-customer-portal [data-pquote-open],#page-customer-portal [data-pquote-id],#page-customer-portal [data-pcv-case]{position:relative}',
  '.pdot{position:absolute;top:8px;right:8px;width:13px;height:13px;border-radius:50%;background:#f26a10;border:2px solid #fff;',
  '  box-shadow:0 0 0 0 rgba(242,106,16,.5);animation:pdotPulse 2s ease-in-out infinite;pointer-events:none;z-index:2}',
  '@keyframes pdotPulse{0%,100%{box-shadow:0 0 0 0 rgba(242,106,16,.45)}50%{box-shadow:0 0 0 7px rgba(242,106,16,0)}}',
  '@media (prefers-reduced-motion:reduce){.pdot{animation:none}}'
 ].join('\n');
 document.head.appendChild(st);
})();
