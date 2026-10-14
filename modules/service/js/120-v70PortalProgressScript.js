/* Version 1.0 — 2026-09-25: the customer's case view shows every step of the job, live, and the
   customer can change their review once the job is done.

   Asked for (customer page → ประวัติ Service → one case): "อยากให้สถานะหน้างานที่ลูกค้าจะเห็น
   สามารถเช็คได้ Real time … โชว์ขั้นตอนให้ลูกค้าดูเลย … สามารถมาแก้รีวิวทีหลังในหน้านี้ได้ …
   เวลาสถานะอัพเดตอยากให้มีแบบหลอดสีเขียวเลื่อนไปหาสถานะต่อ". The owner chose: a vertical list of
   every step joined by a line; on an update the green bar flows down to the new step, which then
   pops with a ripple; and the review opens after the job is finished, shows the review the
   customer gave on the technician's ใบตรวจ (settings.caseFeedback, js/77 — the same record), and an
   edit made here is sent to the office.

   1. js/53 draws the case view and lists only the statuses that were logged. After it runs, its
      ความคืบหน้างาน section is replaced by the full ladder. The two work statuses a technician
      picks between (กำลัง PM / Maintenance, กำลังซ่อม Service) are ONE step for the customer, named
      after whichever was really logged, and รออะไหล่ — a branch, not a stage (CLAUDE.md) — is a
      badge on that step rather than a step every job passes through.
   2. Live: the view is redrawn when its case really changed — after every renderAll() (js/85
      calls it for each realtime row) and on a 3 s check — never otherwise, so it does not flicker.
      The step this phone last showed per case is kept in imode_v70_portal_step_seen (device-local;
      losing it only skips one animation), which is what lets the bar flow from the old step to
      the new one, also when the customer reopens the case later.
   3. Review: settings.caseFeedback[caseId] gains customerEditedAt / source:'portal' and keeps the
      previous version in `history` (5). settings travel whole and js/90 protects caseFeedback, so
      it reaches the office with no schema change. The office is told by a DERIVED notification
      (auto_review_<case>_<time>) — notifications are never uploaded, so a stored one would stay
      on the customer's phone. */
(function(){
 'use strict';
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function fmtAt(v){try{return fmt(v)}catch(e){return String(v||'')}}
 function box(){return document.getElementById('portalContent')}
 function caseById(id){try{return cases.filter(function(c){return c.id===id})[0]||null}catch(e){return null}}
 function fb(){try{if(!settings.caseFeedback||typeof settings.caseFeedback!=='object')settings.caseFeedback={};return settings.caseFeedback}catch(e){return {}}}
 function toast(m){try{toastMsg(m)}catch(e){}}
 var reduce=false;try{reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}

 var FACES=[{v:1,i:'😞',t:'ไม่พอใจมาก'},{v:2,i:'🙁',t:'ไม่พอใจ'},{v:3,i:'😐',t:'พอใช้'},{v:4,i:'🙂',t:'พอใจ'},{v:5,i:'😍',t:'พอใจมาก'}];
 var WORK=['กำลัง PM / Maintenance','กำลังซ่อม Service','รออะไหล่'];
 var DONE=['เสร็จสิ้น','ปิดเคส'];

 /* ---------------------------------------------------------------- the ladder --- */
 function lastAt(log,names){
  var hit=null;log.forEach(function(e){if(names.indexOf(e.status)>=0&&(!hit||new Date(e.createdAt||0)>=new Date(hit.createdAt||0)))hit=e});
  return hit;
 }
 function model(c){
  var log=(c.fieldStatusLog||[]).filter(function(e){return e&&!e.caseCat&&e.status});
  var pm=lastAt(log,['กำลัง PM / Maintenance']),sv=lastAt(log,['กำลังซ่อม Service']),wp=lastAt(log,['รออะไหล่']);
  var workLabel=sv&&(!pm||new Date(sv.createdAt)>=new Date(pm.createdAt))?'กำลังซ่อม Service':pm?'กำลัง PM / Maintenance':'กำลังดำเนินงาน (PM / ซ่อม)';
  var steps=[
   {k:'recv',label:'รับแจ้งปัญหาแล้ว',at:c.createdAt},
   {k:'appt',label:'นัดหมายช่างแล้ว',sub:c.appointment?'นัด '+fmtAt(c.appointment):''},
   {k:'go',label:'ช่างกำลังเดินทาง',names:['กำลังเดินทาง']},
   {k:'arr',label:'ช่างถึงหน้างาน',names:['ถึงหน้างาน']},
   {k:'chk',label:'เริ่มตรวจเช็กเครื่อง',names:['เริ่มตรวจเช็ก']},
   {k:'work',label:workLabel,names:WORK},
   {k:'test',label:'ทดสอบเครื่อง',names:['ทดสอบเครื่อง']},
   {k:'acc',label:'รอลูกค้าตรวจรับ',names:['รอลูกค้าตรวจรับ']},
   {k:'end',label:'จบงาน',names:['จบงาน']}
  ];
  steps.forEach(function(s){if(s.names){var e=lastAt(log,s.names);if(e){s.at=e.createdAt;s.note=e.note||''}}});
  var cur=0;
  if(c.appointment||c.assignee||(c.assignees&&c.assignees.length))cur=1;
  steps.forEach(function(s,i){if(s.names&&s.at)cur=Math.max(cur,i)});
  var fs=c.fieldStatus||'';
  steps.forEach(function(s,i){if(s.names&&s.names.indexOf(fs)>=0)cur=Math.max(cur,i)});
  var finished=DONE.indexOf(c.status)>=0||fs==='จบงาน';
  if(finished)cur=steps.length-1;
  var waiting=fs==='รออะไหล่'&&!finished;
  return {steps:steps,cur:cur,finished:finished,waiting:waiting,waitedAt:wp&&wp.createdAt};
 }
 function ladderHTML(c){
  var m=model(c);
  return '<div class="pcs-steps" data-pcs-case="'+esc2(c.id)+'" data-pcs-cur="'+m.cur+'"><div class="pcs-track"><i class="pcs-fill"></i></div>'
   +m.steps.map(function(s,i){
    var st=i<m.cur||(i===m.cur&&m.finished)?'done':i===m.cur?'now':'todo';
    var badge='';
    if(s.k==='work'&&m.waiting)badge='<span class="pcs-badge">⏳ รออะไหล่</span>';
    else if(s.k==='work'&&m.waitedAt&&st==='done')badge='<span class="pcs-badge soft">เคยรออะไหล่ '+esc2(fmtAt(m.waitedAt))+'</span>';
    return '<div class="pcs-step '+st+'" data-pcs-i="'+i+'"><span class="pcs-dot">'+(st==='done'?'✓':'')+'</span>'
     +'<div class="pcs-body"><b>'+esc2(s.label)+'</b>'+badge
     +(s.at?'<small>'+esc2(fmtAt(s.at))+'</small>':s.sub?'<small>'+esc2(s.sub)+'</small>':st==='todo'?'':'<small>&nbsp;</small>')
     +(s.note&&st!=='todo'?'<small class="pcs-note">'+esc2(s.note)+'</small>':'')
     +'</div></div>';
   }).join('')+'</div>';
 }

 /* ------------------------------------------------------------------- review --- */
 function reviewHTML(c){
  var m=model(c);
  if(!m.finished)return '';
  var r=fb()[c.id]||null,val=r&&Number(r.rating)||0;
  var from=r?(r.source==='portal'?'แก้ไขล่าสุด '+fmtAt(r.customerEditedAt||r.at):'รีวิวที่ให้ไว้ตอนเซ็นรับงานกับช่าง · '+fmtAt(r.at)):'ยังไม่ได้รีวิว';
  return '<div class="pcv-sec pcr" data-pcr-case="'+esc2(c.id)+'" data-pcr-val="'+val+'"><h4>รีวิวความพึงพอใจ</h4>'
   +'<p class="pcr-from">'+esc2(from)+'</p>'
   +'<div class="pcr-faces">'+FACES.map(function(f){
     return '<button type="button" class="pcr-face'+(f.v===val?' on':'')+'" data-pcr-face="'+f.v+'" aria-label="'+f.t+'"><span>'+f.i+'</span><small>'+f.t+'</small></button>';
    }).join('')+'</div>'
   +'<textarea class="pcr-text" rows="3" placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)">'+esc2(r&&r.comment||'')+'</textarea>'
   +'<button type="button" class="pcr-save" data-pcr-save="1">'+(r?'💾 บันทึกการแก้ไขรีวิว':'💾 ส่งรีวิว')+'</button>'
   +'<p class="pcr-hint">รีวิวจะถูกส่งให้ทีม Service ทันที</p></div>';
 }
 function saveReview(sec){
  var id=sec.getAttribute('data-pcr-case'),val=Number(sec.getAttribute('data-pcr-val'))||0;
  if(!val){toast('กรุณาเลือกระดับความพึงพอใจ');return}
  var comment=String((sec.querySelector('.pcr-text')||{}).value||'').trim();
  var all=fb(),old=all[id]||null,now=new Date().toISOString();
  if(old&&Number(old.rating)===val&&String(old.comment||'')===comment){toast('ไม่มีการเปลี่ยนแปลง');return}
  var hist=(old&&Array.isArray(old.history)?old.history.slice():[]);
  if(old)hist.unshift({rating:old.rating,comment:old.comment||'',at:old.at,by:old.by||''});
  all[id]=Object.assign({},old||{},{rating:val,comment:comment,at:now,by:'ลูกค้า (แก้ผ่านหน้าลูกค้า)',source:'portal',customerEditedAt:now,history:hist.slice(0,5)});
  try{saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
  toast('ส่งรีวิวให้ทีม Service แล้ว ขอบคุณครับ');
  redraw(true);
 }
 document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest?e.target:null;if(!t)return;
  var f=t.closest('[data-pcr-face]');
  if(f){var sec=f.closest('.pcr');sec.setAttribute('data-pcr-val',f.getAttribute('data-pcr-face'));
   [].forEach.call(sec.querySelectorAll('.pcr-face'),function(b){b.classList.toggle('on',b===f)});return}
  if(t.closest('[data-pcr-save]')){saveReview(t.closest('.pcr'))}
 });

 /* --------------------------------------------------------------- the office --- */
 var baseBuild=window.buildNotifications;
 if(typeof baseBuild==='function')window.buildNotifications=function(){
  var list=baseBuild.apply(this,arguments)||[];
  try{
   if(currentUser&&currentUser.technicianId)return list;
   if(typeof canPermission==='function'&&!canPermission('case.assign'))return list;
   var all=fb();
   Object.keys(all).forEach(function(id){
    var r=all[id];if(!r||r.source!=='portal'||!r.customerEditedAt)return;
    var c=caseById(id),face=FACES.filter(function(f){return f.v===Number(r.rating)})[0];
    list.unshift({key:'auto_review_'+id+'_'+String(r.customerEditedAt).replace(/\D/g,''),icon:'⭐',
     title:'ลูกค้าแก้ไขรีวิว',message:(c&&c.ticket||id)+' · '+(c&&c.customer||'')+' · '+(face?face.i+' '+face.t:r.rating)+(r.comment?' · '+r.comment:''),
     createdAt:r.customerEditedAt,caseId:id,read:false});
   });
  }catch(e){}
  return list;
 };

 /* --------------------------------------------------- draw, animate, keep live --- */
 var SEEN='imode_v70_portal_step_seen';
 function seenGet(id){try{var o=JSON.parse(localStorage.getItem(SEEN)||'{}');return id in o?Number(o[id]):null}catch(e){return null}}
 function seenSet(id,v){try{var o=JSON.parse(localStorage.getItem(SEEN)||'{}');o[id]=v;localStorage.setItem(SEEN,JSON.stringify(o))}catch(e){}}
 function centerOf(root,i){var el=root.querySelector('[data-pcs-i="'+i+'"] .pcs-dot');if(!el)return 0;var r=root.getBoundingClientRect(),d=el.getBoundingClientRect();return d.top+d.height/2-r.top}
 function place(root,animFrom){
  var fill=root.querySelector('.pcs-fill'),track=root.querySelector('.pcs-track');if(!fill||!track)return;
  var cur=Number(root.getAttribute('data-pcs-cur'))||0,last=root.querySelectorAll('.pcs-step').length-1;
  var top=centerOf(root,0),bot=centerOf(root,last);
  track.style.top=top+'px';track.style.height=Math.max(0,bot-top)+'px';
  var to=centerOf(root,cur)-top;
  if(animFrom==null||reduce){fill.style.transition='none';fill.style.height=to+'px';return}
  var from=centerOf(root,animFrom)-top;
  var step=root.querySelector('[data-pcs-i="'+cur+'"]');
  if(step)step.classList.add('pcs-wait');
  fill.style.transition='none';fill.style.height=from+'px';void fill.offsetHeight;
  fill.style.transition='height 1.1s cubic-bezier(.45,.05,.25,1)';fill.style.height=to+'px';
  setTimeout(function(){
   if(!step)return;step.classList.remove('pcs-wait');step.classList.add('pcs-pop');
   var dot=step.querySelector('.pcs-dot');if(dot){var rp=document.createElement('i');rp.className='pcs-ripple';dot.appendChild(rp);setTimeout(function(){if(rp.parentNode)rp.parentNode.removeChild(rp)},900)}
   toast('อัปเดตสถานะงานแล้ว: '+((step.querySelector('b')||{}).textContent||''));
  },1100);
 }
 function sig(c){
  var log=(c.fieldStatusLog||[]),e=log[log.length-1]||{},r=fb()[c.id]||{};
  return [c.status,c.fieldStatus,log.length,e.id,e.editedAt,e.note,c.appointment,r.at,r.rating].join('|');
 }
 var shownSig='',openingId='';
 function upgrade(){
  var b=box();if(!b||!b.querySelector('[data-pcv-back]'))return;
  if(b.querySelector('.pcs-steps'))return;
  var c=caseById(openingId);if(!c)return;
  /* js/53's own ความคืบหน้างาน section goes; the ladder takes its place (before ผลการให้บริการ). */
  var old=b.querySelector('.pcv-log');if(old&&old.closest('.pcv-sec'))old.closest('.pcv-sec').remove();
  var sec=document.createElement('div');sec.className='pcv-sec pcs-sec';
  sec.innerHTML='<h4>ขั้นตอนหน้างาน <span class="pcs-live">● อัปเดตอัตโนมัติ</span></h4>'+ladderHTML(c);
  var secs=[].filter.call(b.querySelectorAll('.pcv-sec'),function(s){return /ผลการให้บริการ/.test((s.querySelector('h4')||{}).textContent||'')});
  var note=b.querySelector('.pcv-note');
  b.insertBefore(sec,secs[0]||note||null);
  var rv=reviewHTML(c);
  if(rv){var tmp=document.createElement('div');tmp.innerHTML=rv;b.insertBefore(tmp.firstChild,note||null)}
  if(rv&&note)note.textContent='ข้อมูลเคสแสดงเพื่อดูอย่างเดียว · แก้ไขได้เฉพาะรีวิว หากต้องการแก้ข้อมูลอื่นกรุณาติดต่อทีม Service';
  shownSig=c.id+'#'+sig(c);
  var root=sec.querySelector('.pcs-steps'),cur=Number(root.getAttribute('data-pcs-cur')),prev=seenGet(c.id);
  requestAnimationFrame(function(){place(root,prev!=null&&prev<cur?prev:null)});
  seenSet(c.id,cur);
 }
 function openId(){var s=document.querySelector('#portalContent .pcs-steps');return s&&s.getAttribute('data-pcs-case')}
 function redraw(force){
  var id=openId();if(!id)return;
  var c=caseById(id);if(!c)return;
  if(!force&&shownSig===id+'#'+sig(c))return;
  var y=window.scrollY;
  window.imodePortalOpenCase(id);
  try{window.scrollTo(0,y)}catch(e){}
 }
 /* 2026-09-25 — the quotation track on the case page: "เวลาลูกค้ากดเปิดดูอัพเดตสถานะเป็นลูกค้ากำลังเซ็น".
    The first time the customer opens a sent quotation, settings.quoteViews[id] = {at} is written
    and pushed; service-case-detail.html then shows รอลูกค้าเซ็น as the current step (ลูกค้ากำลังเซ็น),
    where before it stayed on ส่งให้ลูกค้าแล้ว. Protected by js/90 and taken live by js/85 and the
    case page like quoteApprovals. Once per quotation — a later open writes nothing. */
 function recordQuoteView(id){
  var q=null;try{q=quotations.filter(function(x){return x.id===id})[0]}catch(e){}
  if(!q)return;
  var first=(settings.quotationStatuses||[])[0]||'ร่าง';if(String(q.status||first)===first)return;
  if(!settings.quoteViews||typeof settings.quoteViews!=='object')settings.quoteViews={};
  var v=settings.quoteViews[id],created=Date.parse(q.createdAt||'');
  if(v&&v.at&&!(Number.isFinite(created)&&Date.parse(v.at)<created))return;
  settings.quoteViews[id]={at:new Date().toISOString()};
  try{saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')cloudSaveSettings()}catch(e){}
 }
 var baseQuote=window.imodePortalOpenQuote;
 if(typeof baseQuote==='function')window.imodePortalOpenQuote=function(id){
  var r=baseQuote.apply(this,arguments);
  try{recordQuoteView(String(id||''))}catch(e){}
  return r;
 };

 var baseOpen=window.imodePortalOpenCase;
 if(typeof baseOpen==='function')window.imodePortalOpenCase=function(){
  openingId=String(arguments[0]||'');
  var r=baseOpen.apply(this,arguments);
  try{upgrade()}catch(e){console.warn(e)}
  return r;
 };
 var baseAll=window.renderAll;
 if(typeof baseAll==='function')window.renderAll=function(){
  var r=baseAll.apply(this,arguments);
  try{redraw(false)}catch(e){}
  return r;
 };
 setInterval(function(){try{if(!document.hidden)redraw(false)}catch(e){}},3000);
 window.addEventListener('resize',function(){var s=document.querySelector('#portalContent .pcs-steps');if(s)place(s,null)});
 window.imodePortalProgress={model:model,redraw:redraw};

 var st=document.createElement('style');st.id='v70PortalProgressStyle';
 st.textContent=[
  '.pcs-live{margin-left:6px;font-size:10.5px;font-weight:600;color:#079455;animation:pcsBlink 2.4s ease-in-out infinite}',
  '@keyframes pcsBlink{0%,100%{opacity:1}50%{opacity:.35}}',
  '.pcs-steps{position:relative;padding:2px 0}',
  '.pcs-track{position:absolute;left:13px;width:4px;margin-left:-2px;border-radius:4px;background:#e3e9f3}',
  '.pcs-fill{position:absolute;left:0;top:0;width:100%;height:0;border-radius:4px;background:linear-gradient(180deg,#22c55e,#079455);box-shadow:0 0 8px rgba(7,148,85,.45)}',
  '.pcs-step{position:relative;display:flex;gap:12px;align-items:flex-start;padding:7px 0;min-height:44px}',
  '.pcs-dot{position:relative;z-index:1;flex:0 0 26px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;background:#fff;border:3px solid #d5deeb;box-sizing:border-box;transition:background .3s,border-color .3s}',
  '.pcs-step.done .pcs-dot{background:#079455;border-color:#079455}',
  '.pcs-step.now .pcs-dot{background:#fff;border-color:#079455;box-shadow:0 0 0 5px rgba(7,148,85,.16)}',
  '.pcs-step.now .pcs-dot:after{content:"";width:10px;height:10px;border-radius:50%;background:#079455;animation:pcsBeat 1.6s ease-in-out infinite}',
  '@keyframes pcsBeat{0%,100%{transform:scale(1)}50%{transform:scale(.6)}}',
  '.pcs-step.pcs-wait .pcs-dot{border-color:#d5deeb;box-shadow:none}.pcs-step.pcs-wait .pcs-dot:after{opacity:0}',
  '.pcs-step.pcs-pop .pcs-dot{animation:pcsPop .55s cubic-bezier(.3,1.6,.5,1)}',
  '@keyframes pcsPop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}',
  '.pcs-ripple{position:absolute;inset:-3px;border-radius:50%;border:3px solid #22c55e;animation:pcsRipple .9s ease-out forwards;pointer-events:none}',
  '@keyframes pcsRipple{from{transform:scale(1);opacity:.9}to{transform:scale(2.6);opacity:0}}',
  '.pcs-body{display:flex;flex-direction:column;gap:1px;padding-top:2px;min-width:0}',
  '.pcs-body b{font-size:14px;color:#0c225e}',
  '.pcs-step.todo .pcs-body b{color:#98a3b8;font-weight:600}',
  '.pcs-step.now .pcs-body b{color:#067a46}',
  '.pcs-body small{font-size:11.5px;color:#6b7890}',
  '.pcs-note{color:#3d4b66!important;white-space:pre-wrap}',
  '.pcs-badge{align-self:flex-start;margin:2px 0;padding:2px 8px;border-radius:999px;background:#fff4e5;color:#b25e00;font-size:11px;font-weight:700}',
  '.pcs-badge.soft{background:#f2f4f8;color:#6b7890;font-weight:600}',
  '.pcr-from{margin:0 0 8px;font-size:12px;color:#6b7890}',
  '.pcr-faces{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}',
  '.pcr-face{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px;border:1.5px solid #e1e7f1;border-radius:12px;background:#fff;cursor:pointer;font:inherit}',
  '.pcr-face span{font-size:24px;filter:grayscale(.7);opacity:.7;transition:all .15s}',
  '.pcr-face small{font-size:10px;color:#6b7890;text-align:center;line-height:1.2}',
  '.pcr-face.on{border-color:#079455;background:#ecfbf3;box-shadow:0 0 0 3px rgba(7,148,85,.12)}',
  '.pcr-face.on span{filter:none;opacity:1;transform:scale(1.15)}',
  '.pcr-text{width:100%;box-sizing:border-box;margin-top:10px;padding:10px 12px;border:1.5px solid #d6deeb;border-radius:12px;font:inherit;font-size:13px;resize:vertical}',
  '.pcr-save{margin-top:10px;width:100%;height:44px;border:0;border-radius:12px;background:#079455;color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 0 #056b3d}',
  '.pcr-save:active{transform:translateY(3px);box-shadow:0 1px 0 #056b3d}',
  '.pcr-hint{margin:6px 0 0;font-size:11px;color:#98a3b8;text-align:center}',
  '@media (prefers-reduced-motion: reduce){.pcs-step.now .pcs-dot:after,.pcs-live{animation:none}}'
 ].join('\n');
 if(!document.getElementById(st.id))document.head.appendChild(st);
})();
