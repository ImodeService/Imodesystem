/* Beta 1.0 — two things that looked clickable and were not.

   4. THE REPORT POPUPS. openReportPopup() in js/03 renders each bucket as
      `<div class="related-item"><b>ชื่อ</b><small>N รายการ</small></div>` — no onclick, no
      cursor, no href. Next to it in the same file, runGlobalSearch() renders the same class
      WITH an onclick and `cursor:pointer`, so the two read identically on screen and only one
      of them does anything. Reported as "ตัวกรองที่อยู่ในตัวกรองอีกที ในหน้ารายงาน กดไม่ได้".
      A bucket now opens a second popup listing the cases behind it, and a case there opens
      the case. Popups stack (js/29), so ‹ steps back to the report and × closes the lot.

   6. THE TECHNICIAN'S JOB CARDS on หน้างานช่าง. js/32 already made the bars on งานของฉัน the
      button; the cards on the field-service page itself were never wired, so a card full of
      information could only be entered through one of its small buttons.

   js/03 is not edited. openReportPopup is replaced (its whole body is the thing being
   changed) and the cards are wired after each render, the same way js/27 and js/32 decorate
   rows they did not build. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function openCasesOf(){try{return (typeof openCases==='function')?openCases():caseList()}catch(e){return caseList()}}
 function fmtAt(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}

 /* ============================================================ 4. report drill-down ==== */
 /* Each bucket keeps the test that produced it, so the drill-down lists exactly the rows the
    number counted — it is not a second, similar query that could disagree with the figure. */
 function buckets(type){
  var out=[];
  try{
   if(type==='status'){
    (settings.statuses||[]).forEach(function(s){
     out.push({key:s,label:s,match:function(c){return c.status===s},all:true});
    });
   }else if(type==='technician'){
    (technicians||[]).forEach(function(t){
     /* the whole crew, not only the lead (js/38 keeps them in one comma column) */
     out.push({key:t.id,label:t.name,match:function(c){
      return (typeof window.imodeIsAssignedTo==='function')
       ? window.imodeIsAssignedTo(c,t.id) : c.assignee===t.id;
     },all:false});
    });
   }else if(type==='customer'){
    (customers||[]).forEach(function(cu){
     out.push({key:cu.id,label:cu.name,match:function(c){return c.customerId===cu.id},all:true});
    });
   }else if(type==='machine'){
    (machines||[]).forEach(function(m){
     out.push({key:m.id,label:(typeof machinePrimaryName==='function'?machinePrimaryName(m):m.name)||m.id,
               match:function(c){return c.machineId===m.id},all:true});
    });
   }
  }catch(e){}
  out.forEach(function(b){
   b.rows=(b.all?caseList():openCasesOf()).filter(b.match);
   b.n=b.rows.length;
  });
  if(type==='customer'||type==='machine')out.sort(function(a,b){return b.n-a.n});
  return out;
 }
 var TITLES={status:'เคสตามสถานะ',technician:'ภาระงาน Service Maintenance',
             customer:'เคสตามลูกค้า',machine:'เคสตามเครื่อง'};

 window.imodeReportDrill=function(type,key){
  var b=buckets(type).filter(function(x){return String(x.key)===String(key)})[0];
  if(!b)return;
  var rows=b.rows.slice().sort(function(x,y){
   return new Date(y.updatedAt||y.createdAt||0)-new Date(x.updatedAt||x.createdAt||0);
  });
  var body=rows.length
   ? '<div class="related-list">'+rows.map(function(c){
       return '<div class="related-item" style="cursor:pointer"'
        +' onclick="closeModal();imodeOpenCase('+imodeJsArg(c.id)+')">'
        +'<b>📋 '+esc2(c.ticket||c.id)+' · '+esc2(c.status||'-')+'</b>'
        +'<small>'+esc2(c.customer||'-')+' · '+esc2(c.machine||'-')+' · '+esc2(fmtAt(c.createdAt))+'</small>'
        +'</div>';
      }).join('')+'</div>'
   : '<div class="empty">'+esc2(tl('ไม่มีเคสในกลุ่มนี้','No cases in this group'))+'</div>';
  if(typeof openModal==='function'){
   openModal(b.label,(TITLES[type]||'')+' · '+b.n+' '+tl('รายการ','items'),body,true);
  }
 };

 if(typeof window.openReportPopup==='function'){
  window.openReportPopup=function(type){
   var list=buckets(type);
   var body=list.length
    ? '<div class="related-list">'+list.map(function(b){
        return '<div class="related-item'+(b.n?'':' is-muted')+'"'
         +(b.n?' style="cursor:pointer" onclick="imodeReportDrill('+imodeJsArg(type)+',&quot;'
               +esc2(b.key)+'&quot;)"':'')
         +'><b>'+esc2(b.label)+'</b><small>'+b.n+' '+esc2(tl('รายการ','items'))
         +(b.n?' · '+esc2(tl('กดเพื่อดูรายชื่อเคส','tap for the cases')):'')+'</small></div>';
       }).join('')+'</div>'
    : '<div class="empty">'+esc2(tl('ยังไม่มีข้อมูล','Nothing yet'))+'</div>';
   openModal(TITLES[type]||'รายงาน',tl('สรุปข้อมูลจากระบบ · กดแต่ละแถวเพื่อดูเคสข้างใน',
                                        'From the system · tap a row for the cases behind it'),body,true);
  };
 }

 /* ============================================================ 6. the job card is a button ==== */
 /* js/03 builds these cards and rewrites them on every render, and they carry no case id —
    it is only inside the onclick of their own buttons. Reading it back from there is the
    same trick js/27 uses on the master lists, and it means a button a later patch adds is
    picked up for free. */
 function cardCaseId(card){
  var b=card.querySelector('[onclick*="openFieldStatusModal"],[onclick*="fieldCheckIn"],[onclick*="openServiceReport"]');
  var m=b&&/\(\s*'([^']+)'/.exec(b.getAttribute('onclick')||'');
  return m?m[1]:'';
 }
 function wireCards(){
  var host=document.getElementById('page-field-service');
  if(!host)return;
  [].slice.call(host.querySelectorAll('.field-job-card')).forEach(function(card){
   if(card.dataset.barWired)return;
   var id=cardCaseId(card);
   if(!id)return;
   card.dataset.barWired='1';
   card.dataset.case=id;
   card.classList.add('fjc-link');
   card.setAttribute('role','button');
   card.setAttribute('tabindex','0');
   var t=card.querySelector('h4');
   card.setAttribute('aria-label',tl('เปิดหน้างาน ','Open field job ')+((t&&t.textContent)||id));
   card.addEventListener('click',function(e){
    if(e.target.closest('button,a,select,input,textarea,label'))return;
    open(this.dataset.case);
   });
   card.addEventListener('keydown',function(e){
    if(e.target!==this)return;
    if(['Enter',' ','Spacebar'].indexOf(e.key)<0)return;
    e.preventDefault();
    open(this.dataset.case);
   });
  });
 }
 /* Opening a job means the technician's workspace when js/32 is there, and the status modal
    when it is not — that is the one action every one of these cards leads to. */
 function open(id){
  if(!id)return;
  if(typeof window.imodeOpenFieldJob==='function'){window.imodeOpenFieldJob(id);return}
  if(typeof window.openFieldStatusModal==='function')window.openFieldStatusModal(id);
 }

 ['renderFieldService','renderAll'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var r=base.apply(this,arguments);
   try{wireCards()}catch(e){}
   return r;
  };
 });
 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(n){
   var r=baseGo.apply(this,arguments);
   if(n==='field-service')setTimeout(function(){try{wireCards()}catch(e){}},60);
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70DrillAndBarsStyle';
 st.textContent=''
 +'.related-item.is-muted{opacity:.55}'
 +'.fjc-link{cursor:pointer;transition:border-color .12s ease,box-shadow .12s ease,transform .12s ease}'
 +'.fjc-link:hover{border-color:#0b63e5;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,99,229,.14)}'
 +'.fjc-link:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
 document.head.appendChild(st);

 function start(){try{wireCards()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
