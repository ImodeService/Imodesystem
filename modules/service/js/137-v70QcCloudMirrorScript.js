/* 2026-10-16: the Workshop case page reads QC from the QC & R&D module's database.

   service-case-detail.html decides "QC ผ่านแล้ว / ต้องทำ QC ก่อนส่งคืน" (wsQcPass, wsQcAny)
   from the localStorage list imode_v66_qc_records. QC now lives in Supabase qc_records
   (modules/qc-rnd), so a QC done on another device would never unlock the hand-back here.
   This file fetches the QC rows of the case on screen and writes them into that list, in the
   same shape (no photos). The page's own 10-second refresh then shows the result.
   Platform only (js/00 production env); does nothing if the table is not there yet.

   2026-10-20: Service and QC & R&D are separate modules with separate admins (Service js/136).
   The case page keeps showing the QC result and keeps the hand-back locked until QC passes,
   but its "ทำ QC ก่อนส่งคืน ›" and "ดู / พิมพ์ในหน้า QC ›" buttons no longer leave Service:
   they are replaced by a note that the QC team does it in its own module. */
(function(){
 'use strict';
 if(!window.IMODE_PLATFORM)return;
 var NOTE='⏳ รอทีม QC & R&D ตรวจ Pre-Delivery QC ในโมดูลของทีม QC — ผลจะขึ้นที่หน้านี้เอง';
 var st=document.createElement('style');
 st.textContent='[data-qc-open]{display:none!important}';
 (document.head||document.documentElement).appendChild(st);
 function swap(){
  document.querySelectorAll('[data-action="ws-qc"]').forEach(function(b){
   var n=document.createElement('span');
   n.className='sd-wait imode-qc-note';
   n.textContent=NOTE;
   b.replaceWith(n);
  });
 }
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-action="ws-qc"],[data-qc-open]'):null;
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
 function watch(){
  swap();
  new MutationObserver(function(){if(document.querySelector('[data-action="ws-qc"]'))swap()})
   .observe(document.body,{childList:true,subtree:true});
 }
 if(document.body)watch();else document.addEventListener('DOMContentLoaded',watch);
})();
(function(){
 'use strict';
 var E=window.IMODE_ENV;
 if(!E||!E.platform||!E.cloud||!window.supabase)return;
 var KEY='imode_v66_qc_records';
 var caseId=(new URLSearchParams(location.search).get('caseId')||new URLSearchParams(location.search).get('case')||'').trim();
 if(!caseId)return;
 var client=null;
 function db(){
  if(!client){try{client=window.supabase.createClient(E.cloud.url,E.cloud.key,window.IMODE_SB_OPTIONS)}catch(e){client=null}}
  return client;
 }
 function pull(){
  var c=db();if(!c)return;
  c.from('qc_records').select('id,qc_no,type,qc_date,status,customer_id,machine_id,case_id,inspector,reviewer,created_at,updated_at')
   .eq('case_id',caseId).then(function(r){
    if(!r||r.error){if(r&&r.error)console.info('[qc-mirror]',r.error.message);return}
    var list=[];try{list=JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch(e){}
    var byId={};list.forEach(function(q,i){if(q&&q.id)byId[q.id]=i});
    (r.data||[]).forEach(function(x){
     var q={id:x.id,qcNo:x.qc_no,type:x.type,qcDate:x.qc_date||'',status:x.status,customerId:x.customer_id||'',
      machineId:x.machine_id||'',caseId:x.case_id||'',inspector:x.inspector||'',reviewer:x.reviewer||'',
      checklist:[],media:[],createdAt:x.created_at,updatedAt:x.updated_at,cloud:true};
     if(byId[x.id]!=null)list[byId[x.id]]=Object.assign({},list[byId[x.id]],q);else list.push(q);
    });
    try{localStorage.setItem(KEY,JSON.stringify(list))}catch(e){}
   });
 }
 pull();
 setInterval(pull,30000);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)pull()});
})();
