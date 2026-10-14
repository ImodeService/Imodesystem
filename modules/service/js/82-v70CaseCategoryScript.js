/* Beta 1.0 — งานบริการมีสองชั้น: หมวดหมู่ แล้วค่อยประเภทงาน

   REPORTED 2026-09-18: "ปกติแล้วเราจะมี Service, maintenance, PM, online, workshop ใช่มั้ย
   แต่ทีนี้มันจะมีหมวดหมู่อยู่ คือ 1. field service 2. workshop 3. online" — the owner chose the
   two-level model: the coordinator picks WHERE the work happens first, then WHAT the work is.

     Field Service  ช่างไปหาลูกค้า        → Service · Maintenance · PM · ติดตั้งเครื่อง
     Workshop       เครื่องเข้ามาที่บริษัท  → Service · Maintenance · PM
     Online         แก้ไขทางออนไลน์       → Service · Maintenance

   So Online and Workshop stop being work types and become categories; ติดตั้งเครื่อง is kept
   because settings.serviceTypes still holds it and no existing case may become unrepresentable.

   ------------------------------------------------------------------ WHERE THE PAIR LIVES

   No schema change, by the owner's instruction. Two columns that already exist carry it:

     service_type       the CATEGORY, as one of the five strings the system already stores, so
                        every existing reader keeps working untouched — in particular
                        WS_TYPE ('ลูกค้าส่งเครื่องเข้าบริษัท') in js/81 and on the case page, and
                        ONLINE_TYPE ('แก้ไขออนไลน์') in the case page's online section.
     field_status_log   the exact pair, as an entry {caseCat:'set', category, workType}. A real
                        jsonb column, so it travels; the newest entry carrying `caseCat` wins.
                        The same shape the online tick and the Workshop logistics already use.

   This is deliberate. js/79 writes c.caseType and NOTHING reads it — cloudUpsertCase() builds an
   explicit column list and has no case_type, so that value never leaves the device and the next
   syncCloud() wipes it. A second field of that kind would have died the same way.

   Reading a case that predates this file: the category comes from its service_type, and the work
   type from service_type (PM, ติดตั้งเครื่อง) else from the marker js/79 leaves in the note
   ("ลูกค้าเลือกประเภทเคส: X") else Service. Nothing is migrated in bulk — a case takes the new
   shape the first time somebody saves it from the form.

   ------------------------------------------------------------------ THE FORM

   #fServiceType IS KEPT, hidden, with its full option list and its id. saveCase() reads
   `fServiceType.value` as an id global (js/03 line 1116) and would throw without it — the same
   reason js/76 keeps #fStatus and js/03 keeps #fieldQueue. The two visible selects write into it,
   so js/03's save path is untouched.

   Loads after js/76 so it sees the renamed 'แก้ไขออนไลน์' option and rewrites the form that
   js/76 has already reworded. */
(function(){
 'use strict';

 var LOG_MARK='set';

 var FIELD='field',WORKSHOP='workshop',ONLINE='online';
 var ST_FIELD='เข้าบริการหน้างาน',ST_WS='ลูกค้าส่งเครื่องเข้าบริษัท',
     ST_ONLINE='แก้ไขออนไลน์',ST_PM='PM / Preventive Maintenance',ST_INSTALL='ติดตั้งเครื่อง';

 var CATS=[
  {v:FIELD,    label:'Field Service', th:'Field Service · ช่างไปหน้างานลูกค้า',
   works:['Service','Maintenance','PM',ST_INSTALL]},
  {v:WORKSHOP, label:'Workshop',      th:'Workshop · ลูกค้าส่งเครื่องเข้าบริษัท',
   works:['Service','Maintenance','PM']},
  {v:ONLINE,   label:'Online',        th:'Online · แก้ไขทางออนไลน์',
   works:['Service','Maintenance']}
 ];
 var WORK_TH={
  'Service':'Service · ซ่อม / แก้ไขอาการเสีย',
  'Maintenance':'Maintenance · บำรุงรักษา / ปรับตั้ง',
  'PM':'PM · บำรุงรักษาตามรอบ'
 };
 WORK_TH[ST_INSTALL]='ติดตั้งเครื่อง · ติดตั้ง / ส่งมอบใหม่';

 function catByV(v){for(var i=0;i<CATS.length;i++)if(CATS[i].v===v)return CATS[i];return CATS[0]}
 function workLabel(w){return WORK_TH[w]||w}
 function esc2(v){try{return typeof esc==='function'?esc(v):String(v==null?'':v)}catch(e){return String(v==null?'':v)}}

 /* ------------------------------------------------------------------ the model ---- */
 /* The one string service_type must hold for this pair, so every existing reader still sees a
    value it knows. The category decides it; PM and ติดตั้งเครื่อง keep their own string while
    the category is Field Service, because that is what those two strings have always meant. */
 function serviceTypeFor(cat,work){
  if(cat===ONLINE)return ST_ONLINE;
  if(cat===WORKSHOP)return ST_WS;
  if(work==='PM')return ST_PM;
  if(work===ST_INSTALL)return ST_INSTALL;
  return ST_FIELD;
 }
 function categoryOfServiceType(st){
  st=String(st||'');
  if(st===ST_WS)return WORKSHOP;
  if(st===ST_ONLINE||st==='Remote Support')return ONLINE;
  return FIELD;
 }
 function lastEntry(c){
  var log=(c&&c.fieldStatusLog)||[],hit=null;
  for(var i=0;i<log.length;i++){if(log[i]&&log[i].caseCat===LOG_MARK)hit=log[i]}
  return hit;
 }
 /* js/79's own marker, the only record of what the customer actually asked for. */
 function workFromNote(note){
  var m=/ลูกค้าเลือกประเภทเคส:\s*(Service|Maintenance|PM|Online|Workshop)/.exec(String(note||''));
  if(!m)return '';
  if(m[1]==='PM')return 'PM';
  if(m[1]==='Maintenance')return 'Maintenance';
  return 'Service';
 }
 function readCase(c){
  c=c||{};
  var e=lastEntry(c);
  if(e&&e.category&&e.workType)return {category:e.category,workType:e.workType,fromLog:true};
  var cat=categoryOfServiceType(c.serviceType);
  var st=String(c.serviceType||''),work='';
  if(st===ST_PM)work='PM';
  else if(st===ST_INSTALL)work=ST_INSTALL;
  else work=workFromNote(c.note)||'Service';
  /* A work type the category does not offer (ติดตั้งเครื่อง under Workshop, PM under Online)
     falls back to the first one it does, so the picker can never open on an impossible pair. */
  if(catByV(cat).works.indexOf(work)<0)work=catByV(cat).works[0];
  return {category:cat,workType:work,fromLog:false};
 }
 function whoAmI(){
  try{if(currentUser&&(currentUser.name||currentUser.username))return currentUser.name||currentUser.username}catch(e){}
  return 'ระบบ';
 }
 /* The log entry. Its `status` never matches one of the technician's nine field-status words,
    so the field track ignores it exactly as it ignores the online and Workshop entries. */
 function logEntry(cat,work){
  return {id:'CT-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
   caseCat:LOG_MARK,category:cat,workType:work,
   status:'หมวดงาน: '+catByV(cat).label+' · '+work,
   note:'',media:[],createdAt:new Date().toISOString(),by:whoAmI()};
 }
 /* What a save should change, or null when the pair is already what the case says. */
 function changesFor(c,cat,work){
  var cur=readCase(c);
  if(cur.fromLog&&cur.category===cat&&cur.workType===work)return null;
  var log=((c&&c.fieldStatusLog)||[]).slice().concat([logEntry(cat,work)]);
  return {fieldStatusLog:log,serviceType:serviceTypeFor(cat,work)};
 }
 function labelOf(c){var p=readCase(c);return catByV(p.category).label+' · '+p.workType}

 /* ------------------------------------------------------------------ the markup ---- */
 function pickerHTML(idCat,idWork,cat,work){
  var c=catByV(cat);
  return '<div class="field ccat-f"><label for="'+idCat+'">หมวดหมู่งาน</label>'
   +'<select id="'+idCat+'" class="ccat-sel">'+CATS.map(function(x){
     return '<option value="'+x.v+'"'+(x.v===cat?' selected':'')+'>'+esc2(x.th)+'</option>';
    }).join('')+'</select></div>'
   +'<div class="field ccat-f"><label for="'+idWork+'">ประเภทงาน</label>'
   +'<select id="'+idWork+'" class="ccat-sel">'+c.works.map(function(w){
     return '<option value="'+esc2(w)+'"'+(w===work?' selected':'')+'>'+esc2(workLabel(w))+'</option>';
    }).join('')+'</select></div>';
 }
 function fillWorkOptions(sel,cat,keep){
  var works=catByV(cat).works,want=works.indexOf(keep)>=0?keep:works[0];
  sel.innerHTML=works.map(function(w){
   return '<option value="'+esc2(w)+'"'+(w===want?' selected':'')+'>'+esc2(workLabel(w))+'</option>';
  }).join('');
  sel.value=want;
 }

 /* ------------------------------------------------- the case modal in the app ---- */
 /* The form body is rewritten on its way through openModal(), the seam js/63 and js/76 use, so
    js/03 keeps exactly one copy of the form and deleting this file restores the old one. */
 function rewrite(html){
  if(!html||html.indexOf('fServiceType')<0||html.indexOf('fIssue')<0)return html;
  var box=document.createElement('div');
  box.innerHTML=html;
  var sel=box.querySelector('#fServiceType');
  if(!sel)return html;
  var field=sel.closest('.field');
  if(!field)return html;
  if(box.querySelector('#fCaseCat'))return html;
  /* The case being edited, read back from the option the base form marked selected — the modal
     body is a string and the case object is not passed through this seam. */
  var cur=sel.querySelector('option[selected]'),st=cur?(cur.value||cur.textContent||''):'';
  var pair=readCase(editingCase()||{serviceType:st});
  field.insertAdjacentHTML('beforebegin',pickerHTML('fCaseCat','fWorkType',pair.category,pair.workType));
  field.style.display='none';
  field.setAttribute('aria-hidden','true');
  return box.innerHTML;
 }
 /* Wired after the body is in the document. The hidden <select> is the value saveCase() reads,
    so the two visible ones only ever write into it. */
 function wire(){
  var cat=document.getElementById('fCaseCat'),work=document.getElementById('fWorkType'),
      type=document.getElementById('fServiceType');
  if(!cat||!work||!type||cat.dataset.ccatOn)return;
  cat.dataset.ccatOn='1';
  var push=function(){
   var want=serviceTypeFor(cat.value,work.value);
   /* settings.serviceTypes is editable master data; only write a value the list really has, so
      saveCase() can never store a type no dropdown in the system offers. */
   var ok=false;
   for(var i=0;i<type.options.length;i++){
    if(type.options[i].value===want||type.options[i].textContent===want){type.selectedIndex=i;ok=true;break}
   }
   if(!ok)type.value=want;
  };
  cat.addEventListener('change',function(){fillWorkOptions(work,cat.value,work.value);push()});
  work.addEventListener('change',push);
  push();
 }

 /* openCaseModal(id) is the only place the real case object is in hand; remembering it lets the
    picker open on the pair in the log rather than on what the type alone can suggest. */
 var editing=null;
 function editingCase(){return editing}
 function caseById(id){
  var list=null;
  try{list=cases}catch(e){list=window.cases}
  if(!Array.isArray(list)||!id)return null;
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list[i];
  return null;
 }

 /* applyLanguageTo() runs on a setTimeout after openModal() and translates every <option> in a
    SEPARATE pass that does not honour data-no-i18n — that attribute only guards the text-node
    walker. So "Field Service" came back as "หน้างานช่าง". A category name is data, not a UI
    label, and the case page (which has no i18n at all) says Field Service, so the two documents
    would have disagreed. The option VALUE is safe either way: that pass restores it from
    dataset.i18nValue. Only the visible text is put back here. */
 function relabel(){
  var cat=document.getElementById('fCaseCat'),work=document.getElementById('fWorkType');
  if(cat)[].forEach.call(cat.options,function(o){
   var c=catByV(o.value);
   if(c&&c.v===o.value&&o.textContent!==c.th)o.textContent=c.th;
  });
  if(work)[].forEach.call(work.options,function(o){
   var t=workLabel(o.value);
   if(t&&o.textContent!==t)o.textContent=t;
  });
 }
 var baseLang=window.applyLanguageTo;
 if(typeof baseLang==='function'){
  window.applyLanguageTo=function(){
   var r=baseLang.apply(this,arguments);
   try{relabel()}catch(e){}
   return r;
  };
 }

 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title,sub,body,big){
   var args=[].slice.call(arguments);
   try{if(typeof body==='string')args[2]=rewrite(body)}catch(e){}
   var r=baseOpenModal.apply(this,args);
   try{wire()}catch(e){}
   return r;
  };
 }
 var baseCaseModal=window.openCaseModal;
 if(typeof baseCaseModal==='function'){
  window.openCaseModal=function(id){
   try{editing=caseById(id)}catch(e){editing=null}
   try{return baseCaseModal.apply(this,arguments)}
   finally{editing=null}
  };
 }
 /* saveCase() writes serviceType from the hidden select; the pair itself goes into the log here,
    around that same save, so both land in one write and one cloud push. */
 var baseSaveCase=window.saveCase;
 if(typeof baseSaveCase==='function'){
  window.saveCase=function(){
   var cat=document.getElementById('fCaseCat'),work=document.getElementById('fWorkType'),
       id=document.getElementById('fCaseId');
   var pending=(cat&&work)?{cat:cat.value,work:work.value,id:id?id.value:''}:null;
   var r=baseSaveCase.apply(this,arguments);
   if(pending)try{stampPair(pending)}catch(e){}
   return r;
  };
 }
 function stampPair(p){
  var list=null;
  try{list=cases}catch(e){list=window.cases}
  if(!Array.isArray(list))return;
  /* A brand-new case is unshifted to the front of `cases` by saveCase(), so with no id in the
     form the case just written is list[0]. */
  var c=(p.id?caseById(p.id):null)||list[0];
  if(!c)return;
  var ch=changesFor(c,p.cat,p.work);
  if(!ch)return;
  c.fieldStatusLog=ch.fieldStatusLog;
  c.serviceType=ch.serviceType;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
 }

 var st=document.createElement('style');
 st.id='v70CaseCategoryStyle';
 st.textContent='.ccat-sel{font-weight:600}';
 document.head.appendChild(st);

 window.imodeCaseCategory={
  CATS:CATS,read:readCase,label:labelOf,serviceTypeFor:serviceTypeFor,changesFor:changesFor,
  categoryOfServiceType:categoryOfServiceType,worksOf:function(v){return catByV(v).works.slice()}
 };
})();
