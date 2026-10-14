/* Beta 1.0 — the case popup opened from ศูนย์การแจ้งเตือน is for reading, with one way forward.

   REPORTED (2026-09-18, with a screenshot of that popup): "หน้านี้เป็นหน้าของการแจ้งเตือน อยากให้ลบ
   ปุ่มข้างล่างนี้ออกและเพิ่มปุ่มดูเคสเข้าไป" — the row of ทำใบเสนอราคา / มอบหมาย·นัดหมาย / แก้ไข /
   สถานะถัดไป / ลบเคส at the bottom goes, and a ดูเคส takes its place.

   SCOPE, ASKED BEFORE CHANGING ANYTHING. openCaseDetail() is not the notification centre's own
   popup: it is opened from the dashboard's schedule and latest-cases lists, the ดู button and
   the mobile card on the Service Cases page, all four calendar views and the agenda, the
   warranty detail, and งานที่สำเร็จแล้ว. Stripping its buttons everywhere would have taken the
   actions off all of those too, so the owner was asked and chose the notification centre only.

   HOW THE SCOPE IS DECIDED. The page that is on screen when the popup opens. Reaching a case
   from the notification centre means #page-notifications is the active page — the notice's own
   popup (openNotificationDetail) opens over it and hands off from there — and every other
   caller listed above sits on its own page. It is one test, it needs nothing passed through
   js/03, and a new entry point added to that page later is covered for free.

   openCaseDetail() calls openModal() again for each of its three tabs (สรุปเคส / ข้อมูลเชื่อมโยง /
   กิจกรรม), so this has to run on every call rather than once — which is what wrapping it does.

   js/03 is not edited. openCaseDetail is a top-level function declaration and therefore a
   window property, so replacing it is what the inline onclick attributes resolve to. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 function onNotificationsPage(){
  try{return ((document.querySelector('.page.active')||{}).id||'')==='page-notifications'}
  catch(e){return false}
 }

 /* The full case workspace — the page every one of the removed buttons now lives on.

    closeModal() IS NOT CALLED FIRST, and that is deliberate. js/29's wrapper schedules
    history.go(-depth) on the next macrotask unless the ACTIVE PAGE changed, and leaving for
    another document does not change it — so the rewind fires and cancels the navigation that
    was already pending. Measured: the popup closed and the browser stayed on index.html.
    This is the same trap part 19 recorded for closeModal() followed by a navigation; here
    there is nothing to close, because the whole document is being replaced. */
 window.imodeNotifyOpenCase=function(id){
  if(!id)return;
  if(typeof window.imodeOpenCase==='function'){window.imodeOpenCase(id);return}
  try{if(typeof closeModal==='function')closeModal()}catch(e){}
  try{if(typeof goPage==='function')goPage('cases')}catch(e){}
 };

 var base=window.openCaseDetail;
 if(typeof base!=='function')return;

 window.openCaseDetail=function(id,tab){
  var r=base.apply(this,arguments);
  if(!onNotificationsPage())return r;
  try{
   var body=document.getElementById('modalBody');
   if(!body)return r;
   var rows=body.querySelectorAll('.button-row');
   if(!rows.length)return r;
   /* The actions are the LAST button-row; the tab strip above them is not one. */
   var row=rows[rows.length-1];
   row.innerHTML='<button type="button" class="primary-btn" data-notify-case="'+esc2(id||'')+'">'
    +esc2(tl('🔎 ดูเคส','🔎 Open the case'))+'</button>';
   var btn=row.querySelector('[data-notify-case]');
   /* Wired directly rather than through a delegated listener: js/05 stops propagation at
      #modalPanel, so a document-level listener would never see this click (part 26). */
   if(btn)btn.onclick=function(){window.imodeNotifyOpenCase(id)};
  }catch(e){}
  return r;
 };
})();
