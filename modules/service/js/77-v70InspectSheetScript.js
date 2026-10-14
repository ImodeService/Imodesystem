/* Beta 1.0 — the technician ticks instead of writing, PM date follows the work type, and the
   customer rates the job while they are signing for it.

   THREE REPORTED ITEMS, all on the ใบตรวจ (the technician's inspection sheet).

   14. "อันนี้เป็นหน้าช่างนะ ผมว่าจะเปลี่ยนจากเขียนรายละเอียดเครื่องที่เสีย เป็นเช็คลิสแทน
        มี 3 อันคือ ผ่าน พอใช้ แก้ไข และจะมีปุ่มหมายเหตุต่อท้าย พอกดแล้วจะมี POPUP ขึ้นมาให้พิมพ์
        พอพิมพ์เสร็จส่ง มีแจ้งเตือนว่าเพิ่มหมายเหตุแล้ว"

       A checklist comes BACK, which is worth saying plainly because part 22 took one out on
       the owner's own instruction. What went out was eleven rows of ปกติ / หมายเหตุ that
       stored a full pass whether or not anybody had looked — the complaint then was that it
       lied. This is the opposite: three explicit answers, nothing preselected, and a row with
       no answer stays empty and prints empty.

       IT REUSES js/03's OWN TEMPLATE. checklistTemplate(workType) already holds three
       properly written Thai lists — twelve points for PM, eleven each for Maintenance and
       Service — so the rows change with ประเภทใบตรวจ exactly as they always did. Only the
       control is new.

       IT ALSO REUSES js/03's SAVE PATH. saveServiceReport() reads `#src<i>` and `#srn<i>` as
       id globals (js/03 line 1061), so the buttons write into hidden inputs carrying those
       ids and the answers are stored, synced and printed by the code that already does that
       for `checklist` — which is a real jsonb column on `service_reports`, so nothing new has
       to reach the database and no SQL has to be run.

       js/63 needed two conditions and nothing else: it must not blank the template while a
       live editor is on screen, and it must not strip the printed table when the answers are
       the new vocabulary. An OLD report still prints without its checklist, as instructed.

   15. "สถานะของใบตรวจ เวลาสถานะเป็น Maintenance หรือ Service ให้ปิด PM ครั้งถัดไปไว้ ทำปุ่มเป็น
        สีเทาและกดไม่ได้ก็ได้ และถ้าสถานะเป็น PM เปิดให้สามารถใช้งานได้"

       #srNextPm is disabled and greyed unless ประเภทใบตรวจ is PM. Disabled, not removed: it
       keeps its id and its value, so saveServiceReport() still reads `srNextPm.value` and a
       date already on the report is preserved rather than blanked by a visit to the form.

   16. "เพิ่มประเมินความพึงพอใจ และคอมเมนต์ของลูกค้าไว้ข้างล่างลายเซ็น หลังเสร็จงานตอนที่ช่างให้
        ลูกค้าเซ็น ช่างจะให้ลูกค้าให้คะแนนและคอมเมนต์"

       Five faces and a comment box, directly under the two signature pads, which is where the
       customer already is at that moment.

       WHERE IT IS KEPT: `settings.caseFeedback` — `{caseId:{rating,comment,at,by}}`.
       service_reports has no column for it (checked against the live schema: 28 columns, none
       of them satisfaction), and cloudUpsertServiceReport() writes an explicit whitelist, so a
       field on the report would be dropped silently on the way out — the fault that lost the
       customers' photos in part 18. settings travels whole, so the score is on the
       coordinator's PC at their next sync with no schema change. It is also what
       service-case-detail.html's ประเมินความพึงพอใจ panel has been waiting for: its
       `feedback` was hard-coded to null and it said so on screen.

   The form markup is rewritten on its way through openModal(), the same seam js/63 uses, so
   js/03 keeps exactly one copy of the sheet. Remove this file and the sheet is what it was. */
(function(){
 'use strict';

 var RESULTS=[
  {v:'ผ่าน', en:'Pass', cls:'ok',   icon:'✓'},
  {v:'พอใช้',en:'Fair', cls:'fair', icon:'~'},
  {v:'แก้ไข',en:'Fix',  cls:'fix',  icon:'!'}
 ];
 var RESULT_VALUES=RESULTS.map(function(r){return r.v});
 var FEEDBACK_FACES=[
  {v:1,icon:'😞',th:'ไม่พอใจมาก',en:'Very poor'},
  {v:2,icon:'🙁',th:'ไม่พอใจ',en:'Poor'},
  {v:3,icon:'😐',th:'พอใช้',en:'Fair'},
  {v:4,icon:'🙂',th:'พอใจ',en:'Good'},
  {v:5,icon:'😍',th:'พอใจมาก',en:'Excellent'}
 ];

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 /* A checklist written by THIS file, as opposed to one of the old ปกติ/OK rows. js/63 keeps
    stripping the old ones from the printed sheet, which is what part 22 asked for. */
 function isNewChecklist(list){
  return (Array.isArray(list)?list:[]).some(function(x){
   return x&&RESULT_VALUES.indexOf(String(x.result||''))>=0;
  });
 }
 window.imodeIsNewChecklist=isNewChecklist;

 /* ------------------------------------------------------ 1. the checklist ---- */
 /* THE POINT OF THIS FUNCTION IS THAT IT DOES NOT PRE-ANSWER.

    js/03's own checklistTemplate() returns {label,result:'OK',note:''} and
    reportChecklistForType() keeps that default, so building the rows from either of them
    would arrive with every point already ticked ผ่าน — precisely the lie that got the
    previous checklist removed in part 22. Caught by the suite, which asserted an empty
    #src0 and found 'ผ่าน'.

    So only the LABELS come from the template. An answer is carried over only when a real
    earlier report has one for that point, matched by label first and by position second,
    the way js/03's own reportChecklistForType does it. */
 function templateFor(type,old){
  var base=[];
  try{base=checklistTemplate(type)||[]}catch(e){base=[]}
  var prior=Array.isArray(old)?old:[];
  return base.map(function(x,i){
   var p=prior.filter(function(o){return o&&o.label===x.label})[0]||prior[i]||null;
   return {label:x.label,result:p?normalise(p.result):'',note:p?String(p.note||''):''};
  });
 }
 /* An old report answered OK / NG / N/A. Map what maps and leave the rest unanswered rather
    than guessing a pass, which is the whole reason the previous checklist was removed. */
 function normalise(v){
  var s=String(v||'');
  if(RESULT_VALUES.indexOf(s)>=0)return s;
  if(s==='OK')return 'ผ่าน';
  if(s==='NG')return 'แก้ไข';
  return '';
 }

 function rowHTML(x,i){
  var val=normalise(x.result),note=String(x.note||'');
  return '<div class="isp-row'+(val?'':' is-blank')+'" data-isp-row="'+i+'">'
   +'<div class="isp-label"><span class="isp-num">'+(i+1)+'</span><b>'+esc2(x.label||'')+'</b></div>'
   +'<div class="isp-choices" role="group" aria-label="'+esc2(x.label||'')+'">'
   +RESULTS.map(function(r){
     return '<button type="button" class="isp-pick is-'+r.cls+(val===r.v?' is-on':'')+'"'
      +' data-isp-set="'+i+'|'+esc2(r.v)+'" aria-pressed="'+(val===r.v?'true':'false')+'">'
      +'<i aria-hidden="true">'+r.icon+'</i>'+esc2(tl(r.v,r.en))+'</button>';
    }).join('')
   +'<button type="button" class="isp-note'+(note?' has-note':'')+'" data-isp-note="'+i+'"'
   +' aria-label="'+esc2(tl('หมายเหตุข้อ ','Note for point ')+(i+1))+'">📝 '
   +esc2(tl('หมายเหตุ','Note'))+'</button>'
   +'</div>'
   +'<div class="isp-notetext"'+(note?'':' hidden')+' data-isp-notetext="'+i+'">'+esc2(note)+'</div>'
   /* js/03's saveServiceReport() reads these two by id. They are the storage; the buttons
      above are only a way of setting them. */
   +'<input type="hidden" id="src'+i+'" value="'+esc2(val)+'">'
   +'<input type="hidden" id="srn'+i+'" value="'+esc2(note)+'">'
   +'</div>';
 }
 function blockHTML(type,old){
  var rows=templateFor(type,old);
  if(!rows.length)return '';
  return '<div class="section-title" style="margin-top:14px">'
   +esc2(tl('เช็คลิสต์ตรวจเครื่อง','Machine checklist'))
   +' <small class="isp-hint">'+esc2(tl('เลือก ผ่าน / พอใช้ / แก้ไข ในแต่ละข้อ และกดหมายเหตุถ้าต้องการอธิบาย',
       'Choose Pass / Fair / Fix for each point, and add a note where it needs one'))+'</small></div>'
   +'<div class="isp-block" id="ispBlock" data-isp-type="'+esc2(type)+'">'+rows.map(rowHTML).join('')+'</div>';
 }

 /* What the form is currently showing, so a work-type change can keep the answers that still
    apply instead of wiping the sheet. */
 function readBlock(){
  var out=[];
  var block=document.getElementById('ispBlock');
  if(!block)return out;
  [].slice.call(block.querySelectorAll('[data-isp-row]')).forEach(function(row,i){
   var lab=row.querySelector('.isp-label b');
   out.push({
    label:lab?lab.textContent:'',
    result:(document.getElementById('src'+i)||{}).value||'',
    note:(document.getElementById('srn'+i)||{}).value||''
   });
  });
  return out;
 }

 /* ------------------------------------------------------- 2. the note popup ---- */
 /* Its own overlay, NOT openModal(): the sheet is itself inside #modal on two of the three
    screens that reach it, and openModal() would replace the very form being filled in.
    z-index sits above #modal's 10000 — the trap part 17 §9 records for the crop overlay,
    which painted on top and still sent every pointer event to the form underneath. */
 var noteBox=null;
 function closeNote(){
  if(noteBox&&noteBox.parentNode)noteBox.parentNode.removeChild(noteBox);
  noteBox=null;
  document.removeEventListener('keydown',onNoteKey,true);
 }
 function onNoteKey(e){
  if(e.key==='Escape'){e.preventDefault();closeNote()}
 }
 function openNote(i){
  closeNote();
  var row=document.querySelector('[data-isp-row="'+i+'"]');
  var label=row?(row.querySelector('.isp-label b')||{}).textContent||'':'';
  var cur=(document.getElementById('srn'+i)||{}).value||'';
  noteBox=document.createElement('div');
  noteBox.className='isp-ovl';
  noteBox.innerHTML='<div class="isp-card" role="dialog" aria-modal="true" aria-label="'
   +esc2(tl('หมายเหตุ','Note'))+'">'
   +'<div class="isp-card-head"><b>📝 '+esc2(tl('หมายเหตุ','Note'))+'</b>'
   +'<button type="button" class="isp-x" data-isp-close="1" aria-label="'+esc2(tl('ปิด','Close'))+'">✕</button></div>'
   +'<p class="isp-card-sub">'+esc2(label)+'</p>'
   +'<textarea id="ispNoteText" rows="4" placeholder="'
   +esc2(tl('พิมพ์สิ่งที่พบ หรือสิ่งที่ต้องแก้ไข','What you found, or what needs fixing'))+'">'+esc2(cur)+'</textarea>'
   +'<div class="isp-card-acts">'
   +'<button type="button" class="isp-cancel" data-isp-close="1">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" class="isp-save" data-isp-save="'+i+'">'+esc2(tl('ส่ง','Submit'))+'</button>'
   +'</div></div>';
  document.body.appendChild(noteBox);
  document.addEventListener('keydown',onNoteKey,true);
  var ta=document.getElementById('ispNoteText');
  if(ta){ta.focus();try{ta.setSelectionRange(ta.value.length,ta.value.length)}catch(e){}}
 }
 function saveNote(i){
  var ta=document.getElementById('ispNoteText');
  var v=ta?String(ta.value||'').trim():'';
  var hidden=document.getElementById('srn'+i);
  if(hidden)hidden.value=v;
  var row=document.querySelector('[data-isp-row="'+i+'"]');
  if(row){
   var btn=row.querySelector('[data-isp-note]');
   if(btn)btn.classList.toggle('has-note',!!v);
   var text=row.querySelector('[data-isp-notetext]');
   if(text){text.textContent=v;text.hidden=!v}
  }
  closeNote();
  toast(v?tl('เพิ่มหมายเหตุแล้ว','Note added'):tl('ลบหมายเหตุแล้ว','Note removed'));
 }

 /* ---------------------------------------------- 3. PM date follows the type ---- */
 function syncNextPm(){
  var sel=document.getElementById('srWorkType');
  var inp=document.getElementById('srNextPm');
  if(!inp)return;
  var isPM=String((sel&&sel.value)||'')==='PM';
  inp.disabled=!isPM;
  inp.classList.toggle('isp-off',!isPM);
  var field=inp.closest?inp.closest('.field'):null;
  if(field){
   field.classList.toggle('isp-off-field',!isPM);
   var hint=field.querySelector('.isp-pm-hint');
   if(!isPM&&!hint){
    var s=document.createElement('small');
    s.className='isp-pm-hint';
    s.textContent=tl('ใช้ได้เฉพาะใบตรวจประเภท PM','Only available on a PM sheet');
    field.appendChild(s);
   }else if(isPM&&hint){hint.parentNode.removeChild(hint)}
  }
 }
 window.imodeSyncNextPm=syncNextPm;

 /* -------------------------------------------------- 4. the satisfaction block ---- */
 function feedbackStore(){
  try{
   if(!settings.caseFeedback||typeof settings.caseFeedback!=='object')settings.caseFeedback={};
   return settings.caseFeedback;
  }catch(e){return {}}
 }
 function feedbackOf(caseId){
  try{var r=feedbackStore()[caseId];return (r&&typeof r==='object')?r:null}catch(e){return null}
 }
 window.imodeCaseFeedback=feedbackOf;

 function feedbackHTML(caseId){
  var f=feedbackOf(caseId)||{};
  var rating=Number(f.rating)||0;
  return '<div class="section-title" style="margin-top:14px">'
   +esc2(tl('ความพึงพอใจของลูกค้า','Customer satisfaction'))
   +' <small class="isp-hint">'+esc2(tl('ให้ลูกค้าให้คะแนนและเขียนความเห็นหลังเซ็นรับงาน',
       'Ask the customer to rate the visit after signing'))+'</small></div>'
   +'<div class="isp-fb" id="ispFeedback">'
   +'<div class="isp-faces" role="group" aria-label="'+esc2(tl('คะแนนความพึงพอใจ','Satisfaction score'))+'">'
   +FEEDBACK_FACES.map(function(o){
     return '<button type="button" class="isp-face'+(rating===o.v?' is-on':'')+'"'
      +' data-isp-rate="'+o.v+'" aria-pressed="'+(rating===o.v?'true':'false')+'"'
      +' aria-label="'+esc2(tl(o.th,o.en))+'"><i aria-hidden="true">'+o.icon+'</i>'
      +'<span>'+esc2(tl(o.th,o.en))+'</span></button>';
    }).join('')
   +'</div>'
   +'<div class="field"><label for="ispComment">'+esc2(tl('ความเห็นของลูกค้า','Customer comment'))+'</label>'
   +'<textarea id="ispComment" rows="2" placeholder="'
   +esc2(tl('ความเห็นเพิ่มเติม (ถ้ามี)','Anything else they would like to say'))+'">'+esc2(f.comment||'')+'</textarea></div>'
   +'<input type="hidden" id="ispRating" value="'+(rating||'')+'">'
   +'</div>';
 }
 function saveFeedback(caseId){
  try{
   var rEl=document.getElementById('ispRating'),cEl=document.getElementById('ispComment');
   if(!rEl&&!cEl)return false;
   var rating=Number(rEl&&rEl.value)||0;
   var comment=cEl?String(cEl.value||'').trim():'';
   if(!rating&&!comment)return false;
   var all=feedbackStore();
   all[caseId]={rating:rating,comment:comment,at:new Date().toISOString(),
                by:(function(){try{return (currentUser&&currentUser.name)||''}catch(e){return ''}})()};
   return true;
  }catch(e){return false}
 }

 /* ------------------------------------------------------ 5. into the form ---- */
 function rewriteSheet(html){
  if(!html||html.indexOf('serviceReportForm')<0)return html;
  var box=document.createElement('div');
  box.innerHTML=html;

  var caseInput=box.querySelector('#srCaseId');
  var caseId=caseInput?caseInput.value:'';
  var typeSel=box.querySelector('#srWorkType');
  var type=typeSel?typeSel.value:'Service';
  if(typeSel){
   var chosen=typeSel.querySelector('option[selected]');
   if(chosen)type=chosen.value||chosen.textContent||type;
  }
  var old=[];
  try{
   var rep=(typeof reportForCase==='function')?reportForCase(caseId):null;
   if(rep&&Array.isArray(rep.checklist))old=rep.checklist;
  }catch(e){}

  /* 14 — the checklist goes where the old one was: directly above งานที่ดำเนินการ. */
  var block=blockHTML(type,old);
  if(block){
   var anchor=box.querySelector('#srDiagnosis');
   var sec=anchor?(anchor.closest('.field')||anchor.parentNode):null;
   var title=sec?sec.previousElementSibling:null;
   if(title&&title.classList&&title.classList.contains('section-title'))title.insertAdjacentHTML('beforebegin',block);
   else if(sec)sec.insertAdjacentHTML('beforebegin',block);
  }

  /* 16 — under the two pads. */
  var grid=box.querySelector('.signature-grid');
  if(grid&&caseId)grid.insertAdjacentHTML('afterend',feedbackHTML(caseId));

  return box.innerHTML;
 }

 var baseOpenModal=window.openModal;
 if(typeof baseOpenModal==='function'){
  window.openModal=function(title,sub,body,big){
   var args=[].slice.call(arguments);
   try{if(typeof body==='string')args[2]=rewriteSheet(body)}catch(e){}
   var r=baseOpenModal.apply(this,args);
   try{syncNextPm()}catch(e){}
   return r;
  };
 }

 /* ประเภทใบตรวจ changed: rebuild the rows for the new work type, keeping any answer whose
    point still exists, and re-apply the PM rule. */
 var baseChangeType=window.changeReportWorkType;
 if(typeof baseChangeType==='function'){
  window.changeReportWorkType=function(){
   var keep=readBlock();
   var r=baseChangeType.apply(this,arguments);
   try{
    var block=document.getElementById('ispBlock');
    var sel=document.getElementById('srWorkType');
    if(block&&sel){
     var rows=templateFor(sel.value,keep);
     block.setAttribute('data-isp-type',sel.value);
     block.innerHTML=rows.map(rowHTML).join('');
    }
   }catch(e){}
   try{syncNextPm()}catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------------------ 6. the save ---- */
 /* The satisfaction has to be read while the form is still on screen, so it is taken BEFORE
    the base call — which closes the modal — and persisted after it, in the same saveLocal()
    the report itself triggers. The checklist needs nothing here: it is already in #src<i> and
    #srn<i>, which js/03 reads itself. */
 /* AN UNANSWERED POINT MUST STAY UNANSWERED. js/03 line 1061 reads

      result: document.getElementById('src'+i)?.value || 'OK'

    so an empty answer becomes a PASS on the way into storage — the false pass that had the
    previous checklist removed in part 22, arriving by a different route. The suite caught it:
    twelve of twelve points came back answered when only three had been.

    It is repaired rather than worked around with a sentinel value, so what is stored stays
    exactly the three words the technician can choose plus an empty string. The answers are
    read from the DOM BEFORE the base call (which closes the popup) and written onto the saved
    report afterwards, in the same shape js/03 wrote — the pattern js/44 uses for the status. */
 function fixBlanks(caseId,answers){
  if(!caseId||!answers||!answers.length)return;
  var r=null;
  try{r=(typeof reportForCase==='function')?reportForCase(caseId):null}catch(e){}
  if(!r||!Array.isArray(r.checklist)||!r.checklist.length)return;
  var changed=false;
  r.checklist.forEach(function(row,i){
   var a=answers.filter(function(x){return x.label===row.label})[0]||answers[i];
   var want=a?String(a.result||''):'';
   if(String(row.result||'')!==want){row.result=want;changed=true}
  });
  if(!changed)return;
  r.updatedAt=new Date().toISOString();
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof cloudUpsertServiceReport==='function')cloudUpsertServiceReport(r)}catch(e){}
 }

 var baseSaveReport=window.saveServiceReport;
 if(typeof baseSaveReport==='function'){
  window.saveServiceReport=function(){
   /* saveServiceReport(false,true) is the ดูตัวอย่าง Report path (js/03 line 1050). It does
      not save the report, so it must not save the score either. */
   var preview=arguments[1]===true;
   var caseId='';
   try{caseId=(document.getElementById('srCaseId')||{}).value||''}catch(e){}
   var answers=[];
   try{answers=readBlock()}catch(e){}
   var wrote=false;
   try{if(caseId&&!preview)wrote=saveFeedback(caseId)}catch(e){}
   var r=baseSaveReport.apply(this,arguments);
   var persist=function(){
    if(!preview){try{fixBlanks(caseId,answers)}catch(e){}}
    if(!wrote)return;
    try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
    try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(persist,persist);
   else persist();
   return r;
  };
 }

 /* ----------------------------------------------------------- 7. the wiring ---- */
 /* TWO HOSTS, AND IT HAS TO BE TWO — the trap js/16 records and this file walked straight
    into. js/05 line 19 puts a click handler on #modalPanel that calls e.stopPropagation(),
    so NO click inside a popup ever reaches document. That guard is the "ต้องกดกากบาทเท่านั้น"
    rule and it must stay. Listeners on descendants of the panel still fire, so the sheet is
    also wired on #modalBody, which is inside it. On หน้างาน the sheet is rendered into the
    page instead, where the document listener is the one that fires — and because the panel
    swallows the event, exactly one of the two ever sees a given click, so there is no
    double handling.

    The symptom when this is got wrong is exact and was seen here: the buttons render, the
    clicks land, and nothing at all happens, with no error. */
 function onDocClick(e){
  if(!e.target||!e.target.closest)return;
  var pick=e.target.closest('[data-isp-set]');
  if(pick){
   e.preventDefault();
   var parts=String(pick.getAttribute('data-isp-set')||'').split('|');
   var i=parts[0],v=parts.slice(1).join('|');
   var hidden=document.getElementById('src'+i);
   var row=document.querySelector('[data-isp-row="'+i+'"]');
   if(!hidden||!row)return;
   /* Pressing the answer that is already on clears it — a point nobody looked at must be
      able to go back to unanswered rather than being stuck on a pass. */
   var next=hidden.value===v?'':v;
   hidden.value=next;
   row.classList.toggle('is-blank',!next);
   [].slice.call(row.querySelectorAll('[data-isp-set]')).forEach(function(b){
    var on=String(b.getAttribute('data-isp-set')||'').split('|').slice(1).join('|')===next&&!!next;
    b.classList.toggle('is-on',on);
    b.setAttribute('aria-pressed',on?'true':'false');
   });
   return;
  }
  var note=e.target.closest('[data-isp-note]');
  if(note){e.preventDefault();openNote(note.getAttribute('data-isp-note'));return}
  var save=e.target.closest('[data-isp-save]');
  if(save){e.preventDefault();saveNote(save.getAttribute('data-isp-save'));return}
  if(e.target.closest('[data-isp-close]')){e.preventDefault();closeNote();return}
  if(noteBox&&e.target===noteBox){e.preventDefault();closeNote();return}
  var rate=e.target.closest('[data-isp-rate]');
  if(rate){
   e.preventDefault();
   var val=rate.getAttribute('data-isp-rate');
   var store=document.getElementById('ispRating');
   if(!store)return;
   var now=store.value===val?'':val;
   store.value=now;
   var host=document.getElementById('ispFeedback');
   if(host){
    [].slice.call(host.querySelectorAll('[data-isp-rate]')).forEach(function(b){
     var on=b.getAttribute('data-isp-rate')===now&&!!now;
     b.classList.toggle('is-on',on);
     b.setAttribute('aria-pressed',on?'true':'false');
    });
   }
  }
 }
 function onDocChange(e){
  if(e.target&&e.target.id==='srWorkType'){try{syncNextPm()}catch(x){}}
 }
 document.addEventListener('click',onDocClick);
 document.addEventListener('change',onDocChange);
 /* #modalBody is replaced on every openModal(), but the ELEMENT is not — js/03 writes into
    it by innerHTML — so one listener on it lasts the life of the document. */
 function wireModal(){
  var body=document.getElementById('modalBody');
  if(!body||body.__ispWired)return;
  body.__ispWired=true;
  body.addEventListener('click',onDocClick);
  body.addEventListener('change',onDocChange);
 }
 wireModal();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wireModal,{once:true});
 else setTimeout(wireModal,0);

 /* ---------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70InspectSheetStyle';
 st.textContent=''
 +'.isp-hint{display:block;font-weight:500;font-size:11px;color:#6f81a3;margin-top:3px}'
 +'.isp-block{display:flex;flex-direction:column;gap:8px}'
 +'.isp-row{border:1px solid #e2ecfb;border-radius:13px;padding:10px 12px;background:#fff}'
 +'.isp-row.is-blank{border-style:dashed;border-color:#dfe7f3;background:#fcfdff}'
 +'.isp-label{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}'
 +'.isp-num{flex:0 0 auto;min-width:21px;height:21px;border-radius:7px;background:#eef3fb;color:#3d557f;'
 +'font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}'
 +'.isp-label b{font-size:12.5px;color:#0c225e;font-weight:700;line-height:1.5}'
 +'.isp-choices{display:flex;gap:6px;flex-wrap:wrap}'
 +'.isp-pick{flex:1 1 84px;min-width:78px;display:inline-flex;align-items:center;justify-content:center;gap:5px;'
 +'padding:8px 6px;border:1px solid #d9e4f5;border-radius:10px;background:#fff;color:#5b6b88;'
 +'font-size:12px;font-weight:700;cursor:pointer;transition:transform .1s ease,box-shadow .1s ease}'
 +'.isp-pick i{font-style:normal;font-weight:800}'
 +'.isp-pick:hover{border-color:#0b63e5}'
 +'.isp-pick:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.isp-pick:active{transform:translateY(1px)}'
 +'.isp-pick.is-ok.is-on{background:#e9f9f1;border-color:#0f9d58;color:#07603a;box-shadow:inset 0 0 0 1px #0f9d58}'
 +'.isp-pick.is-fair.is-on{background:#fff6e8;border-color:#e08c1a;color:#8a5a17;box-shadow:inset 0 0 0 1px #e08c1a}'
 +'.isp-pick.is-fix.is-on{background:#fdecec;border-color:#d13b3b;color:#a02020;box-shadow:inset 0 0 0 1px #d13b3b}'
 +'.isp-note{flex:0 0 auto;padding:8px 11px;border:1px dashed #cfd9ea;border-radius:10px;background:#fbfcff;'
 +'color:#3d557f;font-size:11.5px;font-weight:700;cursor:pointer}'
 +'.isp-note:hover{border-color:#0b63e5;border-style:solid}'
 +'.isp-note:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.isp-note.has-note{border-style:solid;border-color:#0b63e5;background:#eaf3ff;color:#0b3f9e}'
 +'.isp-notetext{margin-top:7px;padding:7px 10px;border-radius:9px;background:#f3f7fd;color:#3d557f;'
 +'font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}'
 +'.isp-notetext[hidden]{display:none!important}'
 /* the note popup */
 +'.isp-ovl{position:fixed;inset:0;z-index:12000;background:rgba(9,22,54,.5);display:flex;'
 +'align-items:center;justify-content:center;padding:18px}'
 +'.isp-card{width:100%;max-width:420px;background:#fff;border-radius:18px;padding:16px;'
 +'box-shadow:0 22px 60px rgba(9,22,54,.32)}'
 +'.isp-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}'
 +'.isp-card-head b{font-size:15px;color:#0c225e}'
 +'.isp-x{border:1px solid #e2ecfb;background:#fff;border-radius:9px;width:32px;height:32px;'
 +'cursor:pointer;color:#3d557f;font-size:14px}'
 +'.isp-x:hover{border-color:#0b63e5}'
 +'.isp-card-sub{margin:6px 0 10px;font-size:12px;color:#5b6b88;line-height:1.55}'
 +'.isp-card textarea{width:100%;padding:11px 12px;border:1px solid #d9e4f5;border-radius:12px;'
 +'font-size:13px;font-family:inherit;resize:vertical}'
 +'.isp-card textarea:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.isp-card-acts{display:flex;gap:9px;margin-top:12px}'
 +'.isp-cancel{flex:1;padding:11px;border:1px solid #d9e4f5;border-radius:12px;background:#fff;'
 +'color:#3d557f;font-size:13px;font-weight:700;cursor:pointer}'
 +'.isp-save{flex:1.4;padding:11px;border:0;border-radius:12px;color:#fff;font-size:13px;font-weight:800;'
 +'cursor:pointer;background:linear-gradient(180deg,#2f7bf0,#0b63e5);box-shadow:0 4px 0 #084bb0}'
 +'.isp-save:active{transform:translateY(2px);box-shadow:0 1px 0 #084bb0}'
 +'.isp-cancel:focus-visible,.isp-save:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* PM date off */
 +'.isp-off{background:#f1f3f7!important;color:#9aa7bd!important;cursor:not-allowed!important;'
 +'border-color:#e1e6ef!important}'
 +'.isp-off-field label{color:#9aa7bd}'
 +'.isp-pm-hint{display:block;margin-top:4px;font-size:10.5px;color:#9aa7bd}'
 /* satisfaction */
 +'.isp-fb{border:1px solid #e2ecfb;border-radius:14px;padding:12px;background:#fbfdff}'
 +'.isp-faces{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}'
 +'.isp-face{flex:1 1 84px;min-width:72px;display:flex;flex-direction:column;align-items:center;gap:3px;'
 +'padding:9px 5px;border:1px solid #d9e4f5;border-radius:12px;background:#fff;cursor:pointer;'
 +'color:#5b6b88;font-size:10.5px;font-weight:700}'
 +'.isp-face i{font-style:normal;font-size:23px;line-height:1}'
 +'.isp-face:hover{border-color:#0b63e5}'
 +'.isp-face:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.isp-face.is-on{background:#eaf3ff;border-color:#0b63e5;color:#0b3f9e;box-shadow:inset 0 0 0 1px #0b63e5}'
 +'@media (max-width:640px){.isp-pick{flex:1 1 calc(33% - 6px);min-width:0;font-size:11.5px}'
 +'.isp-note{flex:1 1 100%}.isp-face{flex:1 1 calc(20% - 6px);min-width:0}.isp-face span{display:none}'
 +'.isp-face i{font-size:26px}}'
 +'@media (prefers-reduced-motion:reduce){.isp-pick:active,.isp-save:active{transform:none}}';
 document.head.appendChild(st);
})();
