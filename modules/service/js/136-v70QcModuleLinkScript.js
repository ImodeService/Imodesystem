/* 2026-10-16: QC moved out of Service into the QC & R&D module (modules/qc-rnd).
   2026-10-20: the two modules are now fully separate — no way from Service into QC.
   "ในระบบQC ... มันยังลิงค์ไป service อยูู่ ซึ่งมันควรแยกกันตาม Flow ... มีแอดมิน 2 คน
    2 อันนี้ไม่ควรกดแล้วเข้าอีกอันครับเพราะว่ามันจะทำให้แอดมินสับสน"
   Org chart: Admin Technician > Supervisor > Tech runs Service; Admin QC,R&D > Supervisor
   QC,R&D > QC,R&D Technician runs QC & R&D. Each module is opened from the launcher only.

   Only when Service runs as a platform module (js/00 set IMODE_PLATFORM); the old standalone
   copy keeps its own QC page. In the platform:
     1. the "QC เครื่อง" menu item, role-home tile and quick-menu entry (data-page="qc",
        goPage('qc')) are hidden, and goPage('qc') goes nowhere;
     2. the machine list's QC buttons and every "ดู / พิมพ์ QC" (openQcModal, previewQc) are
        hidden and do nothing;
     3. imodeOpenCaseQc(caseId) — Workshop "ทำ QC ก่อนส่งคืน" in the หน้างาน screen (js/81) —
        only says the QC team does it;
     4. index.html?page=qc… (old bookmarks, the case page before 2026-10-20) just opens Service.
   The Workshop hand-back gate still reads the QC result: js/137 copies it from qc_records. */
(function(){
 'use strict';
 var P=window.IMODE_PLATFORM;
 if(!P)return;
 var MSG='งาน QC ทำในโมดูล QC & R&D โดยทีม QC — เปิดจากหน้ารวมโมดูล';
 function say(){
  if(typeof window.toastMsg==='function')window.toastMsg(MSG);
  else if(typeof window.toast==='function')window.toast(MSG);
 }

 /* 4 */
 var p=new URLSearchParams(location.search);
 if(p.get('page')==='qc'||/^qc-/.test(p.get('intent')||'')){
  ['page','intent','qcId'].forEach(function(k){p.delete(k)});
  var q=p.toString();
  history.replaceState(history.state,'',location.pathname+(q?'?'+q:'')+location.hash);
 }

 /* 1 + 2: hidden everywhere they are drawn, now and later */
 var st=document.createElement('style');
 st.id='imodeNoQcStyle';
 st.textContent='[data-page="qc"],[onclick*="goPage(\'qc\')"],[onclick*="openQcModal"],[onclick*="previewQc"]{display:none!important}';
 (document.head||document.documentElement).appendChild(st);

 /* 2 */
 window.openQcModal=function(){say()};
 window.previewQc=function(){say()};
 window.openQcPreviewRecord=function(){say()};

 /* 3 */
 window.imodeOpenCaseQc=function(){say();return true};

 /* 1 */
 var orig=window.goPage;
 if(typeof orig==='function'){
  window.goPage=function(name){
   if(name==='qc'){say();return}
   return orig.apply(this,arguments);
  };
 }
 /* belt and braces: handlers bound to the old goPage before this file ran */
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-page="qc"]'):null;
  if(!b||b.classList.contains('page'))return;
  e.preventDefault();e.stopPropagation();
  say();
 },true);
})();
