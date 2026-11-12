/* 2026-10-16: the Workshop case page reads QC from the QC & R&D module's database.

   service-case-detail.html decides "QC ผ่านแล้ว / ต้องทำ QC ก่อนส่งคืน" (wsQcPass, wsQcAny)
   from the localStorage list imode_v66_qc_records. QC now lives in Supabase qc_records
   (modules/qc-rnd), so a QC done on another device would never unlock the hand-back here.
   This file fetches the QC rows of the case on screen and writes them into that list, in the
   same shape (no photos). The page's own 10-second refresh then shows the result.
   Platform only (js/00 production env); does nothing if the table is not there yet.

   2026-10-20 to 2026-11-10 this file also hid the case page's QC buttons. 2026-11-11 they are
   back ("ใช้ปุ่ม QC เดิม"): "ทำ QC ก่อนส่งคืน" and "ดู / พิมพ์" open the QC & R&D module
   through index.html?page=qc (Service js/136). Since QC SQL 04, a QC counts as Pass only
   after Head QC approves it, so the hand-back unlocks after approval.

   2026-11-13 (tester A5: "ดู / พิมพ์" did not show the case's QC): the rows were written to
   localStorage but the case page kept its cached copy, so the QC list stayed empty until a
   full reload. When the case's QC rows change, the page is now refreshed and redrawn
   (waits while a side panel or popup is open). */
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
 var lastSig=null,pendingPaint=false;
 function sig(rows){return(rows||[]).map(function(x){return x.id+'|'+x.status+'|'+x.updated_at}).sort().join(',')}
 function busy(){return !!(document.querySelector('#scdPanel.is-open')||document.body.classList.contains('scd-modal-open')||document.querySelector('dialog[open]'))}
 function repaint(){
  if(typeof CaseDetailData==='undefined'||typeof load!=='function'||typeof renderPage!=='function'){pendingPaint=false;return}
  if(busy()){pendingPaint=true;setTimeout(repaint,5000);return}
  pendingPaint=false;
  try{if(CaseDetailData.refresh)CaseDetailData.refresh();
   Promise.resolve(load()).then(function(res){if(res&&!res.error)renderPage(res)}).catch(function(e){console.info('[qc-mirror] repaint',e&&e.message)})}catch(e){console.info('[qc-mirror] repaint',e&&e.message)}
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
    var now=sig(r.data);
    if(lastSig!==null&&now!==lastSig&&!pendingPaint)repaint();
    else if(lastSig===null&&(r.data||[]).length&&!pendingPaint)repaint();
    lastSig=now;
   });
 }
 pull();
 setInterval(pull,30000);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)pull()});
})();
