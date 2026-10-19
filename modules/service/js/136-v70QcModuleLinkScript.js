/* 2026-10-16: QC moved out of Service into the QC & R&D module (modules/qc-rnd).
   "อยากจะแบ่งโมดุลใน service เอาไปแบ่งในโมดุล QC R&D" → "ลองย้ายดู"

   Only when Service runs as a platform module (js/00 set IMODE_PLATFORM); the old standalone
   copy keeps its own QC page. Every way into QC now opens the module instead:
     1. the sidebar / bottom-bar item "QC เครื่อง" (data-page="qc") and anything else calling
        goPage('qc');
     2. openQcModal(id, machineId) — the machine list's QC buttons (js/07) and edit buttons;
        previewQc(id) — view / print;
     3. imodeOpenCaseQc(caseId) — Workshop "ทำ QC ก่อนส่งคืน" in the หน้างาน screen (js/81);
     4. index.html?page=qc&caseId=…&intent=qc-predelivery — the same button on the standalone
        case page (service-case-detail.html wsQc()), and old bookmarks.
   QC records Service still holds in this browser are offered for upload on the module page. */
(function(){
 'use strict';
 var P=window.IMODE_PLATFORM;
 if(!P)return;
 var BASE=new URL('../qc-rnd/index.html',location.href).href;
 function qs(o){return Object.keys(o).filter(function(k){return o[k]}).map(function(k){return k+'='+encodeURIComponent(o[k])}).join('&')}
 function go(o){var q=qs(o||{});location.href=BASE+(q?'?'+q:'')}

 /* 4 */
 var p=new URLSearchParams(location.search);
 if(p.get('page')==='qc'){
  var cid=p.get('caseId')||p.get('case')||'';
  var pre=/qc-predelivery/.test(p.get('intent')||'');
  location.replace(BASE+'?'+qs({new:cid?'1':'',case:cid,type:pre?'Pre-Delivery QC':''}));
  return;
 }

 /* 2 */
 window.openQcModal=function(id,machineId){
  if(id)go({edit:id});else go({new:'1',machine:machineId||''});
 };
 window.previewQc=function(id){go({open:id})};
 window.openQcPreviewRecord=function(q){if(q&&q.id)go({open:q.id})};

 /* 3 */
 window.imodeOpenCaseQc=function(cid){
  var c=null;
  try{c=typeof caseById==='function'?caseById(cid):null}catch(e){}
  go({new:'1',case:cid,machine:(c&&c.machineId)||'',type:'Pre-Delivery QC'});
  return true;
 };

 /* 1 */
 var orig=window.goPage;
 if(typeof orig==='function'){
  window.goPage=function(name){
   if(name==='qc'){go();return}
   return orig.apply(this,arguments);
  };
 }
 /* belt and braces: handlers bound to the old goPage before this file ran */
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-page="qc"]'):null;
  if(!b)return;
  e.preventDefault();e.stopPropagation();
  go();
 },true);
 function label(){
  document.querySelectorAll('.nav-item[data-page="qc"] b').forEach(function(b){
   if(b.textContent!=='QC & R&D')b.textContent='QC & R&D';
  });
  document.querySelectorAll('.nav-item[data-page="qc"]').forEach(function(a){a.title='เปิดโมดูล QC & R&D'});
 }
 label();
 setTimeout(label,800);
})();
