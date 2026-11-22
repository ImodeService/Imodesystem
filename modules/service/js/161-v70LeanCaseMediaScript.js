/* 2026-11-20 — ลดปริมาณดาวน์โหลดจาก Supabase (Egress เกินโควต้าแพ็กเกจฟรี)

   ปัญหาที่วัดได้: syncCloud() (js/03) ดึง service_cases ทั้งตารางด้วย select('*') ทุกครั้งที่เปิดหน้า
   ทั้งตาราง ~7.7 MB ในนั้น ~6.9 MB คือคอลัมน์ media (รูป/วิดีโอแบบ base64)

   ไฟล์นี้ทำ: "ไม่โหลดรูปตอนเปิดหน้า โหลดเฉพาะตอนเปิดดูเคส"
     1. syncCloud ดึงทุกคอลัมน์ยกเว้น media (js/03 อ่าน window.IMODE_CASE_COLS)
     2. ตอนแปลงแถวเป็นเคส ถ้าเคยเปิดดูเคสนี้แล้วและเคสไม่ได้ถูกแก้ (updated_at ตรง) ใช้รูปที่เก็บไว้ในเครื่อง
        ถ้าไม่ตรง ทิ้งไว้ว่าง (ยังไม่โหลด) ซึ่งทำให้ js/42 ไม่ส่งรูปเก่าขึ้นไปทับของใหม่
        (js/42 ส่ง media เฉพาะเมื่อในเครื่องมีรายการ)
     3. เปิดหน้ารายละเอียดเคส (openCaseDetail) หรือหน้างานของช่าง (renderFieldService)
        แล้วเคสนั้นยังไม่มีรูปในเครื่อง → โหลดรูปของเคสนั้นเคสเดียว แล้วแสดงในกล่องเดิมของ js/42
        เคสที่ในเครื่องเก็บแค่ป้ายแทนรูป (เครื่องเต็ม, js/72) ก็โหลดใหม่ตอนเปิดดูเหมือนกัน

   ไม่แก้ข้อมูลบนเซิร์ฟเวอร์ ถอดบรรทัดไฟล์นี้ออกจาก index.html ก็กลับเป็นแบบเดิมทันที */
(function(){
 'use strict';
 window.IMODE_CASE_COLS=[
  'id','ticket','created_at','updated_at','customer_id','customer','contact','phone','email','location','branch',
  'map_url','latitude','longitude','field_status','field_status_log','machine_id','machine','model','serial',
  'machine_size','warranty','channel','service_type','priority','issue','note','status','assignee','appointment',
  'responded_at','reported','deleted_at','deleted_by','deleted_by_name','deleted_reason',
  'stage','stage_before_hold','hold_since','stage_log'
 ].join(',');

 function allCases(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function localCase(id){return allCases().find(function(x){return x&&x.id===id})||null}
 function hasStub(list){return Array.isArray(list)&&list.some(function(x){return x&&x.offloaded&&!x.data})}
 function loaded(c){return !!c&&Array.isArray(c.media)&&!hasStub(c.media)}

 /* ---- 1-2. ตอน sync: ไม่เอารูปมา ใช้ของในเครื่องถ้ายังใช้ได้ ---- */
 var base=window.fromCaseDb;
 if(typeof base==='function'){
  window.fromCaseDb=function(row){
   var c=base.apply(this,arguments);
   try{
    if(row&&row.id&&!Object.prototype.hasOwnProperty.call(row,'media')){
     var old=localCase(row.id);
     if(loaded(old)&&old.updatedAt===row.updated_at)c.media=old.media;
     else delete c.media;
    }
   }catch(e){}
   return c;
  };
 }

 /* ---- 3. โหลดรูปของเคสเดียวตอนเปิดดู ---- */
 var inflight=Object.create(null);
 function fetchMedia(id){
  if(inflight[id])return inflight[id];
  var db=null;try{db=supa}catch(e){}
  if(!db)return Promise.resolve(false);
  inflight[id]=Promise.resolve(db.from('service_cases').select('id,media,updated_at').eq('id',id).maybeSingle()).then(function(r){
   delete inflight[id];
   if(!r||r.error||!r.data)return false;
   var c=localCase(id);
   if(!c)return false;
   c.media=Array.isArray(r.data.media)?r.data.media:[];
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   return true;
  },function(){delete inflight[id];return false});
  return inflight[id];
 }
 window.imodeLoadCaseMedia=fetchMedia;

 function html(c){try{return typeof window.imodeCaseMediaHTML==='function'?window.imodeCaseMediaHTML(c):''}catch(e){return ''}}
 var LOADING='<div class="cm-block cm-loading" style="font-size:13px;opacity:.7">&#128206; กำลังโหลดรูป…</div>';

 /* หน้ารายละเอียดเคส (popup) */
 var baseDetail=window.openCaseDetail;
 if(typeof baseDetail==='function'){
  window.openCaseDetail=function(cid,tab){
   var r=baseDetail.apply(this,arguments);
   try{
    var c=localCase(cid);
    if(!c||loaded(c)||(tab||'summary')!=='summary')return r;
    var grid=document.querySelector('#modalBody .detail-grid');
    if(!grid)return r;
    var box=grid.querySelector('.cm-detail-box');
    if(!box){box=document.createElement('div');box.className='detail-box full cm-detail-box';grid.appendChild(box)}
    box.innerHTML=LOADING;
    fetchMedia(cid).then(function(){
     if(!box.isConnected)return;
     var cc=localCase(cid),h=loaded(cc)?html(cc):'';
     if(h)box.innerHTML=h;else box.remove();
    });
   }catch(e){}
   return r;
  };
 }

 /* หน้างานของช่าง */
 var baseField=window.renderFieldService;
 if(typeof baseField==='function'){
  window.renderFieldService=function(){
   var r=baseField.apply(this,arguments);
   try{
    var id=typeof window.imodeFieldJobId==='function'?window.imodeFieldJobId():'';
    var c=id?localCase(id):null;
    if(c&&!loaded(c)){
     fetchMedia(id).then(function(){
      var issue=document.querySelector('#fwMachine .fw-issue');
      var cur=typeof window.imodeFieldJobId==='function'?window.imodeFieldJobId():'';
      if(!issue||cur!==id||issue.querySelector('.cm-block'))return;
      var h=html(localCase(id));
      if(h)issue.insertAdjacentHTML('beforeend',h);
     });
    }
   }catch(e){}
   return r;
  };
 }
})();
