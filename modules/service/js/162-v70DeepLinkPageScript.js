/* 2026-11-22 — เปิดหน้าใน Service เดิมตรงจากหน้าเลือกโมดูล
   เช่น modules/service/index.html?page=quotation → เปิดหน้าใบเสนอราคาเลย
   ใช้ตอนแยกโมดูล (ใบเสนอราคา ลูกค้า เครื่องจักร ประกัน+PM ฯลฯ) ออกมาเป็นไอคอนของตัวเองบนหน้าหลัก
   รอให้ระบบเดิมโหลดข้อมูล/สิทธิ์เสร็จก่อน (ต่อท้าย initPortalFromUrl ของ js/03) แล้วค่อย goPage
   ถ้าไม่มีสิทธิ์หน้านั้น goPage เดิมจะแจ้งเตือนเอง · ถอดบรรทัดนี้ออกจาก index.html ก็กลับเป็นแบบเดิม
   2026-11-23 — โหมดหน้าเดียว (เจ้าของ: "เอาอันเก่าออก ใช้อันใหม่แทน แต่ flow ยังใช้ได้"):
   เปิดด้วย ?page= แล้ว ซ่อนเมนูซ้าย / ☰ / แถบล่าง / ปุ่มรับเคสเดิมของ Service เดิม
   (ไม่ให้เห็นโมดุลที่เลิกใช้) และมีปุ่ม "← กลับ" ไปหน้าที่มา (Service ใหม่ หรือหน้าเลือกโมดุล)
   ลูกค้า (portal) และการเปิดแบบไม่มี ?page= ไม่เปลี่ยน */
(function(){
 'use strict';
 var OK=['cases','field-service','quotation','customers','machines','qc','petty-cash','spare-parts',
  'technicians','calendar','warranty','documents','notifications','reports','settings','requests'];
 var page='';
 try{page=new URLSearchParams(location.search).get('page')||''}catch(e){}
 if(OK.indexOf(page)<0)return;

 /* โหมดหน้าเดียว */
 var css='body.v70-single .sidebar,body.v70-single #menuBtn,body.v70-single .bottom-nav,body.v70-single .v68-topbar-brand,'+
  'body.v70-single .v68-top-accept,body.v70-single .sidebar-overlay,body.v70-single .sidebar-backdrop{display:none!important}'+
  'body.v70-single .app-shell{display:block!important;grid-template-columns:1fr!important;padding-left:0!important}'+
  'body.v70-single .main{margin-left:0!important;width:auto!important;max-width:none!important;padding:0 16px 24px!important}'+
  'body.v70-single .topbar{left:0!important;width:auto!important}'+
  '.v70-back{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(127,127,127,.35);'+
  'background:transparent;color:inherit;font:inherit;font-weight:600;font-size:15px;text-decoration:none;white-space:nowrap}'+
  '.v70-back:hover{background:rgba(127,127,127,.12)}';
 var st=document.createElement('style');st.textContent=css;(document.head||document.documentElement).appendChild(st);
 function single(){
  if(!document.body||document.body.classList.contains('customer-portal-mode'))return;
  document.body.classList.add('v70-single');
  var left=document.querySelector('.topbar-left');
  if(left&&!left.querySelector('.v70-back')){
   var back='../../apps/launcher/index.html';
   try{var r=document.referrer?new URL(document.referrer):null;if(r&&r.origin===location.origin&&r.pathname.indexOf('/modules/service/')<0)back=r.href}catch(e){}
   var a=document.createElement('a');a.className='v70-back';a.href=back;a.textContent='← กลับ';
   left.insertBefore(a,left.firstChild);
  }
 }
 if(document.body)single();else document.addEventListener('DOMContentLoaded',single);

 var done=false;
 function open(){
  if(done)return;done=true;
  try{
   if(document.body.classList.contains('customer-portal-mode')){document.body.classList.remove('v70-single');return}
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
