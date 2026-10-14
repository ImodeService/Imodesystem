/* Beta — the customer can open a case from ประวัติ Service and read it. View only.

   Reported: "หน้านี้คือประวัติการแจ้งเซอร์วิสของลูกค้า อยากให้เปิดดูประวัติ รายละเอียดของแต่ละเคส
   แต่ไม่สามารถแก้ไขได้ ดูได้อย่างเดียว".

   showPortalHistory() (js/03) printed one flat .portal-history-item per case — ticket, date,
   status and the issue line — and nothing opened. Everything a customer would want next is
   already stored on the case (the field status log) and on its service report (diagnosis,
   work performed, recommendation, parts, next PM); none of it had a surface here.

   WHAT THIS FILE DOES
     * the history rows become real buttons that open a read-only case view,
     * that view is built from the case and its service report, plus the files the customer
       themself attached (js/42's block, so one implementation serves both audiences),
     * the header's back arrow returns to the list rather than to the portal home while a
       case is open.

   READ ONLY, and that is a property of the code, not a promise: this file renders and
   nothing else. It defines no form, calls no save function, and never touches `cases`,
   `serviceReports`, localStorage or Supabase.

   js/03 is not edited. window.showPortalHistory is replaced at parse time, so js/08's
   install() — which runs at DOMContentLoaded — wraps THIS version and the view keeps the
   portal's detail-mode header, machine context strip and back arrow for free. */
(function(){
 'use strict';

 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 /* fmt and fmtDay are `const` arrow functions in js/03 (line 254) — lexical globals, so
    window.fmt is undefined and a window.fmt check silently prints the raw ISO string, which
    is exactly what the first version of this file did. Read by bare identifier. */
 function fmtAt(v){try{return fmt(v)}catch(e){return String(v||'')}}
 function fmtDay2(v){try{return fmtDay(v)}catch(e){return String(v||'')}}
 function content(){return document.getElementById('portalContent')}

 /* The portal arrays are top-level `let` in js/03 — lexical globals, absent from window —
    so they are read by bare identifier. Read, never assigned. */
 function allCases(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function allReports(){try{return Array.isArray(serviceReports)?serviceReports:[]}catch(e){return []}}
 function theMachine(){try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}}

 /* ------------------------------------------------------------- 1. styles ---- */
 /* Appended at runtime like js/10 and js/16 do, rather than as a new stylesheet: css/21 and
    css/23 have to stay the last two <link>s, and a new one would have to go after them. */
 (function(){
  var css=''
   +'.pcv-row{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;'
     +'padding:11px 8px;border:0;border-bottom:1px solid var(--line);background:transparent;cursor:pointer;border-radius:10px}'
   +'.pcv-row:last-of-type{border-bottom:0}'
   +'.pcv-row:hover{background:#f4f8ff}'
   +'.pcv-row:focus-visible{outline:2px solid var(--blue3,#1549bb);outline-offset:2px}'
   +'.pcv-row .pcv-main{flex:1;min-width:0}'
   +'.pcv-row b{display:block;font-size:12px;color:var(--blue3,#1549bb)}'
   +'.pcv-row small{display:block;font-size:10px;color:var(--muted,#69758d);margin-top:3px}'
   +'.pcv-row i{font-style:normal;color:#9fb0cc;font-size:17px;line-height:1}'
   +'.pcv-chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;'
     +'background:#eaf1ff;color:#2b5fae}'
   +'.pcv-chip.is-done{background:#e7f6ec;color:#1f7a45}'
   +'.pcv-chip.is-wait{background:#fdf0e2;color:#9a5a12}'
   +'.pcv-back{border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 11px;'
     +'font-size:11px;font-weight:700;color:var(--blue3,#1549bb);cursor:pointer;margin-bottom:10px}'
   +'.pcv-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px}'
   +'.pcv-head h3{margin:0;font-size:15px;color:var(--blue3,#1549bb)}'
   +'.pcv-sec{margin-top:14px}'
   +'.pcv-sec>h4{margin:0 0 7px;font-size:11.5px;color:#0c225e}'
   +'.pcv-kv{display:grid;grid-template-columns:96px 1fr;gap:5px 10px;font-size:11.5px;color:#33415c;margin:0}'
   +'.pcv-kv dt{color:var(--muted,#69758d)}'
   +'.pcv-kv dd{margin:0;font-weight:600}'
   +'.pcv-sub{margin:10px 0 4px;font-size:11.5px;color:#0c225e}'
   +'.pcv-text{margin:0;font-size:12px;line-height:1.65;color:#33415c;white-space:pre-wrap;word-break:break-word}'
   +'.pcv-log{list-style:none;margin:0;padding:0}'
   +'.pcv-log li{padding:8px 0 8px 14px;border-left:2px solid #dbe5f7;position:relative}'
   +'.pcv-log li:before{content:"";position:absolute;left:-5px;top:13px;width:8px;height:8px;border-radius:50%;background:#2b5fae}'
   +'.pcv-log b{display:block;font-size:11.5px;color:#0c225e}'
   +'.pcv-log small{display:block;font-size:10px;color:var(--muted,#69758d);margin-top:2px}'
   +'.pcv-parts{list-style:none;margin:0;padding:0;font-size:11.5px;color:#33415c}'
   +'.pcv-parts li{padding:5px 0;border-bottom:1px dashed var(--line)}'
   +'.pcv-parts li:last-child{border-bottom:0}'
   +'.pcv-note{margin:16px 0 0;font-size:10px;color:var(--muted,#69758d);text-align:center}';
  try{
   var s=document.createElement('style');
   s.id='pcvStyles';
   s.textContent=css;
   document.head.appendChild(s);
  }catch(e){}
 })();

 /* -------------------------------------------------------------- 2. the list ---- */
 function statusClass(s){
  s=String(s||'');
  if(s.indexOf('เสร็จ')>=0||s.indexOf('ปิดเคส')>=0)return ' is-done';
  if(s.indexOf('รอ')>=0)return ' is-wait';
  return '';
 }
 function casesOfMachine(mid){
  return allCases().filter(function(c){return c.machineId===mid})
   .sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0)});
 }

 window.showPortalHistory=function(){
  var box=content(),m=theMachine();
  if(!box||!m)return;
  var list=casesOfMachine(m.id);
  box.innerHTML='<h3>🕘 ประวัติ Service</h3>'
   +(list.length
     ? list.map(function(c){
        return '<button type="button" class="pcv-row" data-pcv-case="'+esc2(c.id)+'">'
         +'<span class="pcv-main"><b>'+esc2(c.ticket||c.id)+' · '+esc2(c.serviceType||'Service')+'</b>'
         +'<small>'+esc2(fmtAt(c.createdAt))+'</small>'
         +'<small>'+esc2(String(c.issue||'').slice(0,90))+'</small>'
         +'<small style="margin-top:5px"><span class="pcv-chip'+statusClass(c.status)+'">'
           +esc2(c.status||'-')+'</span></small></span>'
         +'<i aria-hidden="true">&rsaquo;</i></button>';
       }).join('')
     : '<p>ยังไม่มีประวัติ Service</p>')
   +(list.length?'<p class="pcv-note">แตะที่รายการเพื่อดูรายละเอียด · ข้อมูลนี้ดูได้อย่างเดียว</p>':'');
 };

 /* ------------------------------------------------------------ 3. the case ---- */
 function section(title,body){
  if(!body)return '';
  return '<div class="pcv-sec"><h4>'+esc2(title)+'</h4>'+body+'</div>';
 }
 function textBlock(v){
  v=String(v==null?'':v).trim();
  return v?'<p class="pcv-text">'+esc2(v)+'</p>':'';
 }

 window.imodePortalOpenCase=function(id){
  var box=content();
  if(!box)return;
  var c=allCases().filter(function(x){return x.id===id})[0];
  if(!c){
   box.innerHTML='<button type="button" class="pcv-back" data-pcv-back="1">&lsaquo; กลับไปรายการ</button>'
    +'<p>ไม่พบข้อมูลเคสนี้</p>';
   return;
  }
  var rep=allReports().filter(function(r){return r.caseId===c.id})
   .sort(function(a,b){return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)})[0];

  var facts='<dl class="pcv-kv">'
   +'<dt>วันที่แจ้ง</dt><dd>'+esc2(fmtAt(c.createdAt))+'</dd>'
   +'<dt>สถานะ</dt><dd><span class="pcv-chip'+statusClass(c.status)+'">'+esc2(c.status||'-')+'</span></dd>'
   +'<dt>ประเภทงาน</dt><dd>'+esc2(c.serviceType||'-')+'</dd>'
   +'<dt>ความเร่งด่วน</dt><dd>'+esc2(c.priority||'-')+'</dd>'
   +'<dt>ช่องทาง</dt><dd>'+esc2(c.channel||'-')+'</dd>'
   +(c.appointment?'<dt>นัดหมาย</dt><dd>'+esc2(fmtAt(c.appointment))+'</dd>':'')
   +'</dl>';

  /* js/82's หมวดหมู่งาน entry is an internal classification, not a step the customer is
     waiting on, so it never reaches this list. */
  var log=(c.fieldStatusLog||[]).filter(function(e){return e&&!e.caseCat}).sort(function(a,b){
   return new Date(a.createdAt||0)-new Date(b.createdAt||0);
  });
  var logHtml=log.length?'<ul class="pcv-log">'+log.map(function(e){
   return '<li><b>'+esc2(e.status||'-')+'</b><small>'+esc2(fmtAt(e.createdAt))+'</small>'
    +(e.note?'<small>'+esc2(e.note)+'</small>':'')+'</li>';
  }).join('')+'</ul>':'';

  /* js/42 owns the attachment block and its lightbox — one implementation, both audiences. */
  var media='';
  try{if(typeof window.imodeCaseMediaHTML==='function')media=window.imodeCaseMediaHTML(c)||''}catch(e){}

  var result='';
  if(rep){
   var parts=(rep.parts||[]).filter(function(p){return p&&(p.name||p.code)});
   result=''
    +'<dl class="pcv-kv"><dt>เลขที่ใบตรวจ</dt><dd>'+esc2(rep.reportNo||'-')+'</dd>'
      +'<dt>ประเภท</dt><dd>'+esc2(rep.workType||'-')+'</dd>'
      +(rep.nextPm?'<dt>PM ครั้งถัดไป</dt><dd>'+esc2(fmtDay2(rep.nextPm))+'</dd>':'')
    +'</dl>'
    +(rep.diagnosis?'<h4 class="pcv-sub">สิ่งที่ตรวจพบ</h4>'+textBlock(rep.diagnosis):'')
    +(rep.workPerformed?'<h4 class="pcv-sub">งานที่ดำเนินการ</h4>'+textBlock(rep.workPerformed):'')
    +(rep.recommendation?'<h4 class="pcv-sub">คำแนะนำ</h4>'+textBlock(rep.recommendation):'')
    +(parts.length?'<h4 class="pcv-sub">อะไหล่ที่ใช้</h4>'
       +'<ul class="pcv-parts">'+parts.map(function(p){
          return '<li>'+esc2(p.name||p.code||'-')+' &times; '+esc2(p.qty||1)+'</li>';
        }).join('')+'</ul>':'');
  }

  box.innerHTML='<button type="button" class="pcv-back" data-pcv-back="1">&lsaquo; กลับไปรายการ</button>'
   +'<div class="pcv-head"><h3>'+esc2(c.ticket||c.id)+'</h3></div>'
   +facts
   +section('ปัญหาที่แจ้ง',textBlock(c.issue)||'<p class="pcv-text">-</p>')
   +section('ไฟล์ที่แนบมาตอนแจ้ง',media)
   +section('ความคืบหน้างาน',logHtml)
   +section('ผลการให้บริการ',result)
   +'<p class="pcv-note">ข้อมูลนี้แสดงเพื่อดูอย่างเดียว หากต้องการแก้ไขกรุณาติดต่อทีม Service</p>';
 };

 /* One delegated listener, so a row rendered by any later patch still works. */
 document.addEventListener('click',function(e){
  if(!e.target||!e.target.closest)return;
  var back=e.target.closest('[data-pcv-back]');
  if(back){e.preventDefault();window.showPortalHistory();return}
  var row=e.target.closest('[data-pcv-case]');
  if(row){e.preventDefault();window.imodePortalOpenCase(row.getAttribute('data-pcv-case'))}
 });

 /* While a case is open the header's back arrow belongs to the list, not to the portal home.
    Derived from the DOM rather than from a flag, so it cannot go stale. js/08 defines
    imodePortalBackHome inside its own DOMContentLoaded install() and js/22 wraps it in its
    own listener, so this one is registered last and ends up outermost. */
 document.addEventListener('DOMContentLoaded',function(){
  if(typeof window.imodePortalBackHome!=='function')return;
  var base=window.imodePortalBackHome;
  window.imodePortalBackHome=function(){
   var box=content();
   if(box&&box.querySelector('[data-pcv-back]')){window.showPortalHistory();return}
   return base.apply(this,arguments);
  };
 });
})();
