/* Beta 1.0 — the customer chooses what kind of case they are reporting.

   REPORTED 2026-09-17: "อยากให้เพิ่มปุ่มกดแล้วมี Drop down ลงมาให้ลูกค้าเลือกประเภทเคสที่สามารถแจ้งได้
   คือ 1. Service 2. Maintenance 3. PM 4. Online" — on แจ้งปัญหาเครื่อง, the customer page form.

   The form is js/03's window.openPortalIssueForm (the copy at line ~1880, which carries the
   file picker). A select is added to it after it renders; js/03 is not edited. js/08 wraps
   openPortalIssueForm at DOMContentLoaded, and this file is parsed before that, so js/08 ends
   up wrapping THIS version and keeps its detail-mode header.

   WHERE THE CHOICE GOES. submitPortalIssue() hard-codes serviceType 'เข้าบริการหน้างาน'. The
   choice is mapped onto the case's own serviceType, which is a real column and travels:

     Service      → เข้าบริการหน้างาน
     Maintenance  → เข้าบริการหน้างาน   (there is no maintenance type in settings.serviceTypes)
     PM           → PM / Preventive Maintenance
     Online       → แก้ไขออนไลน์

   Because Maintenance and Service would otherwise be indistinguishable, the customer's own word
   is also written into the case `note` (a column too), which the office reads on the case page
   and in ลงรายละเอียดเคส, where the coordinator can change the type.

   HOW, without copying the submit. The new case is created and pushed inside one async
   function. Everything up to its first await is synchronous — including `cases.unshift(c)` —
   and every wrapper outside it (js/19, js/54) calls straight through, so for the duration of
   that synchronous run `unshift` is shadowed on the one array instance and the case is amended
   before it is stored or uploaded. The shadow is removed in a finally. */
(function(){
 'use strict';

 var TYPES=[
  {v:'Service',     th:'Service · ซ่อม / แก้ไขอาการเสีย', st:'เข้าบริการหน้างาน'},
  {v:'Workshop',    th:'Workshop · ส่งเครื่องซ่อมที่บริษัท',  st:'ลูกค้าส่งเครื่องเข้าบริษัท'}
 ];
 /* 2026-09-17, Workshop: the customer also says how the machine gets to us and back. Kept as
    an entry in the case's fieldStatusLog — {workshop:'logistics', inbound, outbound} — because
    field_status_log is a real column and travels with the case; the case page reads it, and
    js/81 turns it into the Pickup / Delivery line when the admin builds the quotation. */
 var INBOUND=[{v:'send',th:'📦 ส่งเครื่องมาที่บริษัทเอง',hint:'ไม่มีค่ารับเครื่อง'},
              {v:'pickup',th:'🚚 ให้บริษัทไปรับเครื่อง',hint:'มีค่ารับเครื่อง คิดตามระยะทาง'}];
 var OUTBOUND=[{v:'self',th:'🏢 มารับเครื่องคืนเอง',hint:'ไม่มีค่าส่ง'},
               {v:'deliver',th:'🚚 ให้บริษัทไปส่งคืน',hint:'มีค่าส่ง คิดตามระยะทาง'}];
 function choiceHTML(name,label,list){
  return '<div class="field pict-ws-group" role="radiogroup" aria-label="'+esc2(label)+'"><label>'+esc2(label)+' *</label>'
   +'<div class="pict-ws-opts">'+list.map(function(o){
     return '<label class="pict-ws-opt"><input type="radio" name="'+name+'" value="'+o.v+'">'
      +'<span><b>'+esc2(o.th)+'</b><small>'+esc2(o.hint)+'</small></span></label>';
    }).join('')+'</div></div>';
 }
 function radioValue(name){
  var r=document.querySelector('input[name="'+name+'"]:checked');
  return r?r.value:'';
 }
 function typeOf(v){return TYPES.filter(function(t){return t.v===v})[0]||null}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* ---------------------------------------------------------------- the field ---- */
 function addField(){
  var form=document.getElementById('portalIssueForm');
  if(!form||form.querySelector('#piCaseType'))return;
  var html='<div class="field pict-field"><label for="piCaseType">ประเภทเคส *</label>'
   +'<select id="piCaseType" required>'
   +'<option value="">— เลือกประเภทเคส —</option>'
   +TYPES.map(function(t){return '<option value="'+esc2(t.v)+'">'+esc2(t.th)+'</option>'}).join('')
   +'</select></div>';
  /* First question on the form: what kind of help is this. */
  var first=form.querySelector('.field');
  if(first)first.insertAdjacentHTML('beforebegin',html);
  else form.insertAdjacentHTML('afterbegin',html);
  var sel=form.querySelector('#piCaseType');
  var type=sel&&sel.closest('.field');
  if(type)type.insertAdjacentHTML('afterend','<div id="piWorkshop" class="pict-ws" hidden>'
   +choiceHTML('piInbound','การนำเครื่องเข้าบริษัท',INBOUND)
   +choiceHTML('piOutbound','การรับเครื่องคืน',OUTBOUND)+'</div>');
  if(sel)sel.addEventListener('change',function(){
   var box=document.getElementById('piWorkshop');
   if(box)box.hidden=sel.value!=='Workshop';
  });
 }
 var baseOpen=window.openPortalIssueForm;
 if(typeof baseOpen==='function'){
  window.openPortalIssueForm=function(){
   var r=baseOpen.apply(this,arguments);
   try{addField()}catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------------------- the submit ---- */
 var baseSubmit=window.submitPortalIssue;
 if(typeof baseSubmit==='function'){
  window.submitPortalIssue=function(ev){
   var sel=document.getElementById('piCaseType');
   var t=sel?typeOf(sel.value):null;
   if(sel&&!t){
    /* A required <select> is normally stopped by the browser before `submit` fires; this is
       the guard for a submit that reaches us anyway. */
    if(ev&&typeof ev.preventDefault==='function')ev.preventDefault();
    try{sel.focus()}catch(e){}
    try{if(typeof toastMsg==='function')toastMsg('กรุณาเลือกประเภทเคส')}catch(e){}
    return;
   }
   if(!t)return baseSubmit.apply(this,arguments);
   var inbound='',outbound='';
   if(t.v==='Workshop'){
    inbound=radioValue('piInbound');outbound=radioValue('piOutbound');
    if(!inbound||!outbound){
     if(ev&&typeof ev.preventDefault==='function')ev.preventDefault();
     try{if(typeof toastMsg==='function')toastMsg(!inbound?'กรุณาเลือกวิธีนำเครื่องเข้าบริษัท':'กรุณาเลือกวิธีรับเครื่องคืน')}catch(e){}
     var g=document.querySelector(!inbound?'input[name="piInbound"]':'input[name="piOutbound"]');
     if(g)try{g.focus()}catch(e){}
     return;
    }
   }

   var arr=null,shadowed=false;
   try{
    arr=cases;
    arr.unshift=function(){
     for(var i=0;i<arguments.length;i++){
      var c=arguments[i];
      if(c&&typeof c==='object'&&c.status==='เคสใหม่'){
       c.serviceType=t.st;
       c.caseType=t.v;
       c.note=(c.note?c.note+' · ':'')+'ลูกค้าเลือกประเภทเคส: '+t.v;
       if(t.v==='Workshop'){
        var inb=INBOUND.filter(function(o){return o.v===inbound})[0],outb=OUTBOUND.filter(function(o){return o.v===outbound})[0];
        c.note+=' · นำเครื่องเข้า: '+(inbound==='pickup'?'ให้บริษัทไปรับ':'ลูกค้าส่งมาเอง')
         +' · รับเครื่องคืน: '+(outbound==='deliver'?'ให้บริษัทไปส่ง':'ลูกค้ามารับเอง');
        c.fieldStatusLog=(Array.isArray(c.fieldStatusLog)?c.fieldStatusLog:[]).concat([{
         id:'WS-'+Date.now().toString(36),workshop:'logistics',inbound:inbound,outbound:outbound,
         status:'Workshop · '+(inb?inb.th.replace(/^\S+\s/,''):'')+' / '+(outb?outb.th.replace(/^\S+\s/,''):''),
         note:'',media:[],createdAt:c.createdAt||new Date().toISOString(),by:'customer'}]);
       }
      }
     }
     return Array.prototype.unshift.apply(this,arguments);
    };
    shadowed=true;
   }catch(e){}
   try{
    return baseSubmit.apply(this,arguments);
   }finally{
    if(shadowed){try{delete arr.unshift}catch(e){}}
   }
  };
 }

 var st=document.createElement('style');
 st.id='v70IssueCaseTypeStyle';
 st.textContent=''
 +'.pict-field select{font-weight:700;color:#0c225e}'
 +'.pict-field select:invalid{color:#6b7d9e;font-weight:400}'
 +'.pict-ws{display:flex;flex-direction:column;gap:4px}'
 +'.pict-ws-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}'
 +'.pict-ws-opt{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border:1px solid #d9e4f5;border-radius:12px;background:#fff;cursor:pointer;min-width:0}'
 +'.pict-ws-opt input{margin-top:3px;accent-color:#0b63e5;flex:0 0 auto}'
 +'.pict-ws-opt b{display:block;font-size:13px;color:#0c225e}'
 +'.pict-ws-opt small{display:block;font-size:11.5px;color:#6b7d9e;margin-top:2px}'
 +'.pict-ws-opt:has(input:checked){border-color:#0b63e5;background:#eef4ff;box-shadow:inset 0 0 0 1px #0b63e5}'
 +'@media (max-width:520px){.pict-ws-opts{grid-template-columns:minmax(0,1fr)}}';
 document.head.appendChild(st);
})();
