/* Beta 1.0 — requested intake, protected-note, white picker and machine-rate UX. */
(function(){
 'use strict';
 var draft={active:false,enabled:false,ids:[],appointment:''};
 function e(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function tech(id){try{return technicians.find(function(t){return t.id===id})}catch(x){return null}}
 function protectedNote(note){
  var m=/^(รับแจ้งจาก Customer Portal \/ Machine QR(?:\s*·\s*ลูกค้าเลือกประเภทเคส:\s*(?:Service|Maintenance|PM|Online|Workshop))?)(?:\s*·\s*|\n)?([\s\S]*)$/.exec(String(note||''));
  return m?{fixed:m[1],extra:m[2]||''}:{fixed:'',extra:String(note||'')};
 }
 function whitePicker(input,onPick){
  if(!input||input.dataset.whitePicker)return;
  var listId=input.getAttribute('list'),source=listId&&document.getElementById(listId);if(!source)return;
  input.dataset.whitePicker='1';input.removeAttribute('list');
  var menu=document.createElement('div');menu.className='case-white-picker';menu.hidden=true;input.parentNode.appendChild(menu);
  function hide(){menu.hidden=true}
  function draw(){var q=String(input.value||'').trim().toLowerCase(),opts=[].slice.call(source.options),hits=q?opts.filter(function(o){return String(o.value||'').toLowerCase().indexOf(q)>=0}):opts;menu.innerHTML=hits.slice(0,80).map(function(o){return '<button type="button" data-value="'+e(o.value)+'">'+e(o.value)+'</button>'}).join('')||'<small>ไม่พบรายการ</small>';menu.hidden=false}
  input.addEventListener('focus',draw);input.addEventListener('input',draw);input.addEventListener('blur',function(){setTimeout(hide,120)});
  menu.addEventListener('mousedown',function(ev){var b=ev.target.closest('[data-value]');if(!b)return;ev.preventDefault();input.value=b.getAttribute('data-value');hide();onPick()});
 }
 function summary(){var box=document.getElementById('caseDraftAssignSummary');if(!box)return;var names=draft.ids.map(function(id){var t=tech(id);return t?t.name:id}).join(', ');box.textContent=names?(names+' · '+(draft.appointment||'ยังไม่ระบุวันนัด')):'ยังไม่ได้เลือกช่าง'}
 function applyDraftFields(){var lead=tech(draft.ids[0]),team=document.getElementById('fServiceTeam'),assignee=document.getElementById('fAssignee'),when=document.getElementById('fAppointment');if(team&&lead){team.value=lead.team||'Technical';if(typeof window.refreshCaseAssignee==='function')window.refreshCaseAssignee()}if(assignee)assignee.value=draft.ids[0]||'';if(when)when.value=draft.appointment||'';summary()}
 window.toggleCaseDraftAssignment=function(cb){draft.enabled=!!cb.checked;var box=document.getElementById('caseDraftAssignActions');if(box)box.classList.toggle('is-open',draft.enabled);if(!draft.enabled){draft.ids=[];draft.appointment='';applyDraftFields()}};
 window.openCaseDraftAssignment=function(){
  var groups={};try{technicians.forEach(function(t){(groups[t.team||'Technical']||(groups[t.team||'Technical']=[])).push(t)})}catch(x){}
  var body=Object.keys(groups).map(function(teamName){return '<div class="assign-team"><div class="assign-team-head"><b>ทีม '+e(teamName)+'</b></div><div class="assign-members">'+groups[teamName].map(function(t){return '<label class="assign-member"><input type="checkbox" class="draft-assign-cb" value="'+e(t.id)+'" '+(draft.ids.indexOf(t.id)>=0?'checked':'')+'><span>'+e(t.name)+'</span><small>'+e(t.status||'พร้อมรับงาน')+'</small></label>'}).join('')+'</div></div>'}).join('');
  var dateHtml=typeof window.datetimeSplitHTML==='function'?window.datetimeSplitHTML('draftAppointment',draft.appointment||'',true):'<input id="draftAppointment" type="datetime-local" value="'+e(draft.appointment)+'">';
  openModal('นัดหมาย · มอบหมายช่าง','เลือกช่างและกำหนดวันนัดก่อนบันทึกเคส','<div class="assign-panel is-modal">'+body+'<div class="assign-when"><label>วันและเวลานัดหมาย <b>*</b></label>'+dateHtml+'</div><div class="assign-foot"><small>ช่างคนแรกที่เลือกเป็นผู้รับผิดชอบหลัก</small><button type="button" class="primary-btn" onclick="saveCaseDraftAssignment()">บันทึกการมอบหมาย</button></div></div>');
 };
 window.saveCaseDraftAssignment=function(){var ids=[].slice.call(document.querySelectorAll('.draft-assign-cb:checked')).map(function(x){return x.value}),when=document.getElementById('draftAppointment');when=when?String(when.value||''):'';if(!ids.length){toastMsg('กรุณาเลือกช่างอย่างน้อย 1 คน');return}if(!when){toastMsg('กรุณาระบุวันและเวลานัดหมาย');return}draft.ids=ids;draft.appointment=when;if(typeof window.imodeModalBack==='function')window.imodeModalBack();else closeModal();setTimeout(applyDraftFields,150)};
 function enhanceCaseForm(id){
  var note=document.getElementById('fNote');if(note){var p=protectedNote(note.value);if(p.fixed){note.dataset.lockedPrefix=p.fixed;note.value=p.extra;var lock=document.createElement('div');lock.className='case-note-locked';lock.textContent='🔒 '+p.fixed;note.parentNode.insertBefore(lock,note)}}
  whitePicker(document.getElementById('fCustomerSearch'),function(){caseCustomerSearchChanged(true)});whitePicker(document.getElementById('fMachineSearch'),function(){caseMachineSearchChanged(true)});
  if(id)return;var team=document.getElementById('fServiceTeam');if(!team)return;var section=team.closest('.modal-section'),grid=team.closest('.form-grid');if(!section||!grid)return;
  draft={active:true,enabled:false,ids:[],appointment:''};grid.classList.add('case-original-assign');var title=section.querySelector('.section-title');if(title)title.textContent='3. มอบหมาย / นัดหมาย (ไม่บังคับ)';var ui=document.createElement('div');ui.innerHTML='<label class="case-assign-toggle"><input type="checkbox" onchange="toggleCaseDraftAssignment(this)"><span>มอบหมายช่างและกำหนดวันนัดหมายตอนนี้</span></label><div id="caseDraftAssignActions" class="case-draft-actions"><button type="button" class="soft-btn" onclick="openCaseDraftAssignment()">👨‍🔧 เลือกช่างและวันนัดหมาย</button><small id="caseDraftAssignSummary">ยังไม่ได้เลือกช่าง</small></div>';section.insertBefore(ui,grid);
 }
 var baseOpenCase=window.openCaseModal;if(typeof baseOpenCase==='function')window.openCaseModal=function(id){draft.active=false;var r=baseOpenCase.apply(this,arguments);setTimeout(function(){enhanceCaseForm(id)},35);return r};
 var baseSaveCase=window.saveCase;if(typeof baseSaveCase==='function')window.saveCase=async function(){
  var idEl=document.getElementById('fCaseId'),existing=idEl&&idEl.value,note=document.getElementById('fNote');if(note&&note.dataset.lockedPrefix)note.value=[note.dataset.lockedPrefix,note.value.trim()].filter(Boolean).join(' · ');var staged=!existing&&draft.ids.length?{ids:draft.ids.slice(),appointment:draft.appointment}:null,r=await baseSaveCase.apply(this,arguments);
  if(staged&&staged.ids.length){var c=existing?cases.find(function(x){return x.id===existing}):cases[0];if(c){c.assignees=staged.ids;c.assignee=staged.ids[0];c.appointment=staged.appointment;c.serviceTeam=(tech(c.assignee)||{}).team||c.serviceTeam;if(['เคสใหม่','มอบหมายแล้ว'].indexOf(c.status)>=0)c.status='นัดหมายแล้ว';c.updatedAt=new Date().toISOString();saveLocal();await cloudUpsertCase(c);renderAll()}}return r;
 };
 window.openMachineRateGuide=function(){openModal('เกณฑ์ขนาดเครื่องและเรทราคา','ใช้เป็นแนวทางเลือกระดับ Service','<div class="machine-rate-guide"><article class="S"><b>S</b><strong>500 บาท</strong><span>เครื่องเล็ก / ราคาประหยัด</span><small>มูลค่าเครื่องไม่เกิน 5,000 บาท<br>งานพื้นฐาน ระบบไม่ซับซ้อน<br>เช่น Freedom, Micromotor, Handpiece</small></article><article class="M"><b>M</b><strong>1,000 บาท</strong><span>เครื่องขนาดกลาง / Standard</span><small>มูลค่าประมาณ 5,001–30,000 บาท<br>มี Motor / Heater / Pump / Controller<br>เช่น Ultrasonic, Tumbler, Steam Cleaner</small></article><article class="L"><b>L</b><strong>1,500 บาท</strong><span>เครื่องใหญ่ / ระบบซับซ้อน</span><small>มูลค่ามากกว่า 30,000 บาทหรือมีความเสี่ยงสูง<br>หลายระบบ / อาจใช้งานมากกว่า 1 คน<br>เช่น Oven, Casting, Laser, PVD</small></article></div>',true)};
 var baseMachine=window.openMachineModal;if(typeof baseMachine==='function')window.openMachineModal=function(){var r=baseMachine.apply(this,arguments);setTimeout(function(){var s=document.getElementById('maSize'),f=s&&s.closest('.field');if(f&&!f.querySelector('.machine-rate-link')){var b=document.createElement('button');b.type='button';b.className='machine-rate-link';b.textContent='ดูเกณฑ์ขนาดเครื่องและเรทราคา';b.onclick=window.openMachineRateGuide;f.appendChild(b)}},30);return r};
})();
