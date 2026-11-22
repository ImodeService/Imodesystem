/* 2026-11-22 — เปิดหน้าใน Service เดิมตรงจากหน้าเลือกโมดูล
   เช่น modules/service/index.html?page=quotation → เปิดหน้าใบเสนอราคาเลย
   ใช้ตอนแยกโมดูล (ใบเสนอราคา ลูกค้า เครื่องจักร ประกัน+PM ฯลฯ) ออกมาเป็นไอคอนของตัวเองบนหน้าหลัก
   รอให้ระบบเดิมโหลดข้อมูล/สิทธิ์เสร็จก่อน (ต่อท้าย initPortalFromUrl ของ js/03) แล้วค่อย goPage
   ถ้าไม่มีสิทธิ์หน้านั้น goPage เดิมจะแจ้งเตือนเอง · ถอดบรรทัดนี้ออกจาก index.html ก็กลับเป็นแบบเดิม */
(function(){
 'use strict';
 var OK=['cases','field-service','quotation','customers','machines','qc','petty-cash','spare-parts',
  'technicians','calendar','warranty','documents','notifications','reports','settings'];
 var page='';
 try{page=new URLSearchParams(location.search).get('page')||''}catch(e){}
 if(OK.indexOf(page)<0)return;
 var done=false;
 function open(){
  if(done)return;done=true;
  try{
   if(document.body.classList.contains('customer-portal-mode'))return;
   if(!document.getElementById('page-'+page)||typeof window.goPage!=='function')return;
   window.goPage(page);
  }catch(e){}
 }
 var base=window.initPortalFromUrl;
 if(typeof base==='function'){
  window.initPortalFromUrl=function(){
   var r;try{r=base.apply(this,arguments)}catch(e){}
   return Promise.resolve(r).then(open,open);
  };
 }
 /* กันพลาด: ถ้าไม่มีจังหวะข้างบน เปิดหลังโหลดหน้าเสร็จ */
 window.addEventListener('load',function(){setTimeout(open,typeof base==='function'?8000:600)});
})();
