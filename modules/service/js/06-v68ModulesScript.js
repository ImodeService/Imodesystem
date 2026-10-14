(function(){
 'use strict';
 const V68_PRICE_DEFAULT={
   levels:{
     S:{fee:500,title:'เครื่องเล็ก / ราคาประหยัด',bullets:['มูลค่าเครื่องไม่เกิน 5,000 บาท','งานพื้นฐาน ระบบไม่ซับซ้อน','ตัวอย่าง: Foredom, Micromotor, Handpiece']},
     M:{fee:1000,title:'เครื่องขนาดกลาง / Standard',bullets:['มูลค่าประมาณ 5,001–30,000 บาท','มี Motor / Heater / Pump / Controller','ตัวอย่าง: Ultrasonic, Tumbler, Steam Cleaner']},
     L:{fee:1500,title:'เครื่องใหญ่ / ระบบซับซ้อน',bullets:['มูลค่ามากกว่า 30,000 บาท หรือมีความเสี่ยงสูง','หลายระบบ / อาจใช้งานมากกว่า 1 คน','ตัวอย่าง: Oven, Casting, Laser, PVD']}
   },
   vatPct:7,
   note:'ราคาเครื่องเป็นเกณฑ์เบื้องต้น หากระบบซับซ้อน ความเสี่ยงสูง หรือใช้งานหลายคน สามารถปรับระดับขึ้นได้'
 };
 function v68Money(n){return '฿'+Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2})}
 function v68Config(){
   const raw=settings.onsitePricingConfig||{};
   const levels=raw.levels||{};
   return {...V68_PRICE_DEFAULT,...raw,levels:{S:{...V68_PRICE_DEFAULT.levels.S,...(levels.S||{})},M:{...V68_PRICE_DEFAULT.levels.M,...(levels.M||{})},L:{...V68_PRICE_DEFAULT.levels.L,...(levels.L||{})}}};
 }
 function ensureV68(){
   if(!settings.onsitePricingConfig)settings.onsitePricingConfig=JSON.parse(JSON.stringify(V68_PRICE_DEFAULT));
   if(!Array.isArray(settings.relatedEmployees))settings.relatedEmployees=[];
   settings.v68=true;
 }
 ensureV68();

 PAGE_INFO.th.onsite=['หน้างาน','จัด Service Level S / M / L ค่าเดินทาง และคำนวณราคาหน้างาน'];
 PAGE_INFO.en.onsite=['Onsite Service','Service Level S / M / L, travel zones and onsite price calculation'];
 PAGE_PERMISSION.onsite='field.view';

 function applyV68Labels(){
   const lang=settings.language==='en';
   const techBtn=document.querySelector('.nav-item[data-page="technicians"] b');if(techBtn)techBtn.textContent=lang?'Team':'ทีมงาน';
   const onsiteBtn=document.querySelector('.nav-item[data-page="onsite"] b');if(onsiteBtn)onsiteBtn.textContent=lang?'Onsite Service':'หน้างาน';
   const ver=document.querySelector('.sidebar-version b');if(ver)ver.textContent='Version 1.0';
   const verSub=document.querySelector('.sidebar-version span');if(verSub)verSub.remove();
   const heroLogo=document.querySelector('.v68-global-logo');if(heroLogo&&typeof IMODE_UI_LOGO!=='undefined')heroLogo.src=IMODE_UI_LOGO;
 }

 // Desktop hamburger collapses the module drawer; mobile opens it as an overlay.
 const menu=document.getElementById('menuBtn'),side=document.getElementById('sidebar');
 if(menu&&side){
   menu.onclick=function(e){e.stopPropagation();if(window.innerWidth<=900)side.classList.toggle('open');else document.body.classList.toggle('v68-nav-collapsed')};
   document.addEventListener('click',function(e){if(window.innerWidth<=900&&side.classList.contains('open')&&!side.contains(e.target)&&!menu.contains(e.target))side.classList.remove('open')});
 }

 window.renderOnsitePricing=function(){
   ensureV68();const cfg=v68Config();
   const sel=document.getElementById('onsiteMachineSelect');
   if(sel){const old=sel.value;sel.innerHTML='<option value="">— เลือกเครื่อง / ไม่ระบุ —</option>'+machines.map(m=>`<option value="${esc(m.id)}">${esc(machinePrimaryName(m))} · ${esc(m.model||'-')} · ${esc(m.serial||'-')}</option>`).join('');if([...sel.options].some(o=>o.value===old))sel.value=old;}
   const levelBox=document.getElementById('onsiteLevelCards');
   if(levelBox)levelBox.innerHTML=['S','M','L'].map(k=>{const x=cfg.levels[k];return `<article class="v68-level-card ${k}"><div class="head"><span class="v68-level-badge">${k}</span><div><div class="v68-level-price">${Number(x.fee||0).toLocaleString()} บาท</div><small>${esc(x.title||'')}</small></div></div><h4>${k==='S'?'Small':k==='M'?'Medium':'Large'} Service Level</h4><ul>${(x.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul></article>`}).join('');
   const zones=(settings.travelZones||defaults.travelZones||[]).slice().sort((a,b)=>Number(a.min||0)-Number(b.min||0));
   const noteByIndex=['พื้นที่ใกล้บริษัท','กรุงเทพฯ / ปริมณฑลใกล้','โรงงานปริมณฑลทั่วไป','พื้นที่ชานเมือง / ใกล้ปริมณฑล','ต่างจังหวัดใกล้','ต่างจังหวัดระยะกลาง','หรือเสนอราคาเป็นกรณี'];
   const zoneBody=document.getElementById('onsiteZoneRows');if(zoneBody)zoneBody.innerHTML=zones.map((z,i)=>`<tr><td>${esc(z.name||'Zone '+i)}</td><td>${Number(z.min||0)}${z.max==null||z.max===''?' km ขึ้นไป':'–'+Number(z.max)+' km'}</td><td><b style="color:#f05217">${Number(z.perKm)>0?Number(z.perKm).toLocaleString()+' บาท/กม.':Number(z.fee||0).toLocaleString()+' บาท'}</b></td><td>${noteByIndex[i]||'-'}</td></tr>`).join('');
   const displayZones=zones.filter(z=>Number(z.perKm||0)<=0).slice(0,6);
   const head=document.getElementById('onsiteBasePriceHead');if(head)head.innerHTML='<tr><th>Level</th>'+displayZones.map(z=>`<th>${esc(z.name||'Zone')}</th>`).join('')+'</tr>';
   const rows=document.getElementById('onsiteBasePriceRows');if(rows)rows.innerHTML=['S','M','L'].map(k=>`<tr><td><b>${k} ${Number(cfg.levels[k].fee||0).toLocaleString()}</b></td>${displayZones.map(z=>`<td>${Number((Number(cfg.levels[k].fee)||0)+(Number(z.fee)||0)).toLocaleString()} บาท</td>`).join('')}</tr>`).join('');
   calculateOnsitePricing();
   const empSummary=document.getElementById('setEmployeeSummary');if(empSummary){const active=settings.relatedEmployees.filter(x=>x.status!=='Inactive').length;empSummary.textContent=`${settings.relatedEmployees.length} คน · ใช้งาน ${active} คน`;}
   const priceSummary=document.getElementById('setOnsitePricingSummary');if(priceSummary)priceSummary.textContent=`S ${Number(cfg.levels.S.fee).toLocaleString()} · M ${Number(cfg.levels.M.fee).toLocaleString()} · L ${Number(cfg.levels.L.fee).toLocaleString()} + Travel Zone`;
 }

 window.v68OnsiteMachineChanged=function(){const id=document.getElementById('onsiteMachineSelect')?.value;if(id){const m=machineById(id);const size=(inferredMachineSize(m)?.size||'').toUpperCase();const level=document.getElementById('onsiteLevel');if(level&&['S','M','L'].includes(size))level.value=size;}calculateOnsitePricing()}
 window.calculateOnsitePricing=function(){
   const cfg=v68Config(),level=document.getElementById('onsiteLevel')?.value||'S',distance=Number(document.getElementById('onsiteDistance')?.value||0),parts=Number(document.getElementById('onsiteParts')?.value||0),actual=Number(document.getElementById('onsiteActual')?.value||0);
   const service=Number(cfg.levels[level]?.fee||0),travel=typeof getQuoteTravel==='function'?getQuoteTravel(distance):{name:'Z0',fee:0},subtotal=service+Number(travel.fee||0)+parts+actual,vatPct=Number(cfg.vatPct??7),vat=subtotal*vatPct/100,grand=subtotal+vat;
   const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};set('onsiteServiceFee',v68Money(service));set('onsiteTravelFee',v68Money(travel.fee));set('onsiteSubtotal',v68Money(subtotal));set('onsiteGrandTotal',v68Money(grand));set('onsiteVatAmount',`VAT ${vatPct}% · ${v68Money(vat)}`);set('onsiteLevelText',`${level} · ${cfg.levels[level]?.title||''}`);set('onsiteZoneText',`${travel.name||'Zone'} · ${distance.toLocaleString()} km`);set('onsiteVatHint',`ยังไม่รวม VAT ${vatPct}%`);
   const q=typeof quoteCfg==='function'?quoteCfg():{},same=Number(q.onsiteS)===Number(cfg.levels.S.fee)&&Number(q.onsiteM)===Number(cfg.levels.M.fee)&&Number(q.onsiteL)===Number(cfg.levels.L.fee);const st=document.getElementById('onsiteQuoteRateState');if(st){st.className='v68-rate-state'+(same?'':' diff');st.textContent=same?'Quotation ใช้ราคา S/M/L ชุดนี้แล้ว':'Quotation ยังใช้ราคา S/M/L คนละชุด';}
 }
 window.v68ApplyPricingToQuotation=function(){const cfg=v68Config(),c=quoteCfg();if(!confirm('นำราคา S / M / L ของโมดูลหน้างานไปใช้เป็น Onsite Rate ใน Quotation หรือไม่?'))return;settings.quoteConfig={...c,onsiteS:Number(cfg.levels.S.fee)||0,onsiteM:Number(cfg.levels.M.fee)||0,onsiteL:Number(cfg.levels.L.fee)||0};saveLocal();cloudSaveSettings();renderAll();toastMsg('อัปเดต Onsite Rate ใน Quotation แล้ว')}

 window.openOnsitePricingSettingModal=function(){
   const cfg=v68Config();openModal('ราคา Service Level หน้างาน','กำหนดอัตรา S / M / L ตามขนาด ความซับซ้อน และความเสี่ยง',`<form id="v68PricingForm"><div class="form-grid cols3"><div class="field"><label>Level S (บาท)</label><input id="v68PriceS" type="number" min="0" value="${Number(cfg.levels.S.fee)||0}"></div><div class="field"><label>Level M (บาท)</label><input id="v68PriceM" type="number" min="0" value="${Number(cfg.levels.M.fee)||0}"></div><div class="field"><label>Level L (บาท)</label><input id="v68PriceL" type="number" min="0" value="${Number(cfg.levels.L.fee)||0}"></div><div class="field"><label>VAT (%)</label><input id="v68Vat" type="number" min="0" value="${Number(cfg.vatPct??7)}"></div><div class="field full"><label>หมายเหตุการจัดระดับ</label><textarea id="v68PricingNote">${esc(cfg.note||'')}</textarea></div></div><div class="info-box">Travel Zone ยังแก้ไขแยกจากเมนู “โซนและค่าเดินทาง” เพื่อไม่ให้ข้อมูลระยะทางซ้ำกัน</div><div class="button-row"><button type="button" class="soft-btn" onclick="closeModal()">ยกเลิก</button><button class="primary-btn action-3d-orange">บันทึก S/M/L</button></div></form>`,true);setTimeout(()=>{v68PricingForm.onsubmit=e=>{e.preventDefault();settings.onsitePricingConfig={...cfg,vatPct:Number(v68Vat.value)||0,note:v68PricingNote.value.trim(),levels:{...cfg.levels,S:{...cfg.levels.S,fee:Number(v68PriceS.value)||0},M:{...cfg.levels.M,fee:Number(v68PriceM.value)||0},L:{...cfg.levels.L,fee:Number(v68PriceL.value)||0}}};saveLocal();cloudSaveSettings();closeModal();renderAll();toastMsg('บันทึกราคา Service Level แล้ว')}} ,20)}

 function employeeList(){ensureV68();return settings.relatedEmployees}
 function employeeById(id){return employeeList().find(x=>x.id===id)}
 function syncEmployeeTech(emp){
   if(!emp.linkService)return emp;
   let t=technicians.find(x=>x.employeeId===emp.id||x.id===emp.techId);const tid=t?.id||('T-EMP-'+emp.id.replace(/[^A-Za-z0-9]/g,''));
   const obj={...(t||{}),id:tid,employeeId:emp.id,name:emp.name,role:emp.position||'Service Technician',team:emp.team||'Technical',phone:emp.phone||'',email:emp.email||'',status:emp.status==='Inactive'?'ไม่พร้อม':(t?.status||'พร้อมรับงาน'),skills:t?.skills||'',color:t?.color||'blue',photo:t?.photo||''};
   if(t)technicians=technicians.map(x=>x.id===tid?obj:x);else technicians.push(obj);emp.techId=tid;return emp;
 }
 window.openEmployeeSettingModal=function(){
   const list=employeeList();openModal('พนักงานที่เกี่ยวข้อง','จัดการผู้ประสานงาน ผู้จัดการ R&D และพนักงานที่เกี่ยวข้องกับ Service',`<div class="button-row" style="justify-content:flex-end"><button class="primary-btn action-3d-orange" onclick="openEmployeeForm()">＋ เพิ่มพนักงาน</button></div><div class="v68-employee-table">${list.length?list.map(e=>`<div class="v68-employee-row"><div><b>${esc(e.name||'-')}</b><small>${esc(e.position||'-')} · ${esc(e.department||'-')} · ${esc(e.team||'-')}</small><small>${esc(e.phone||'-')} · ${esc(e.email||'-')}</small><span class="v68-employee-status ${e.status==='Inactive'?'off':''}">${e.status==='Inactive'?'ปิดใช้งาน':'ใช้งาน'}${e.linkService?' · Linked Service Maintenance':''}</span></div><div class="v68-employee-actions"><button class="soft-btn" onclick="openEmployeeForm(${imodeJsArg(e.id)})">แก้ไข</button><button class="danger-btn" onclick="deleteRelatedEmployee(${imodeJsArg(e.id)})">ลบ</button></div></div>`).join(''):'<div class="empty">ยังไม่มีพนักงานที่เกี่ยวข้อง</div>'}</div>`,true);const p=document.getElementById('modalPanel');if(p)p.classList.add('large')}
 window.openEmployeeForm=function(id=''){
   const old=employeeById(id)||{};openModal(old.id?'แก้ไขพนักงาน':'เพิ่มพนักงานที่เกี่ยวข้อง','ข้อมูลนี้อยู่ใน Settings และสามารถเชื่อมเข้า Service Maintenance ได้',`<form id="v68EmployeeForm"><div class="form-grid cols2"><div class="field"><label>ชื่อ-นามสกุล *</label><input id="v68EmpName" required value="${esc(old.name||'')}"></div><div class="field"><label>ตำแหน่ง</label><input id="v68EmpPosition" value="${esc(old.position||'')}"></div><div class="field"><label>ฝ่าย / Department</label><input id="v68EmpDept" value="${esc(old.department||'Service')}"></div><div class="field"><label>ทีม</label><select id="v68EmpTeam"><option value="Technical" ${(old.team||'Technical')==='Technical'?'selected':''}>Technical</option><option value="R&D" ${old.team==='R&D'?'selected':''}>R&D</option><option value="Admin" ${old.team==='Admin'?'selected':''}>Admin</option><option value="Management" ${old.team==='Management'?'selected':''}>Management</option></select></div><div class="field"><label>โทรศัพท์</label><input id="v68EmpPhone" value="${esc(old.phone||'')}"></div><div class="field"><label>Email</label><input id="v68EmpEmail" type="email" value="${esc(old.email||'')}"></div><div class="field"><label>System Role</label><select id="v68EmpRole"><option ${old.systemRole==='Technician'?'selected':''}>Technician</option><option ${old.systemRole==='Service Manager'?'selected':''}>Service Manager</option><option ${old.systemRole==='Admin / Coordinator'?'selected':''}>Admin / Coordinator</option><option ${old.systemRole==='R&D'?'selected':''}>R&D</option><option ${old.systemRole==='Other'?'selected':''}>Other</option></select></div><div class="field"><label>สถานะ</label><select id="v68EmpStatus"><option value="Active" ${old.status!=='Inactive'?'selected':''}>ใช้งาน</option><option value="Inactive" ${old.status==='Inactive'?'selected':''}>ปิดใช้งาน</option></select></div><div class="field full"><label class="toggle-row"><div><b>เชื่อมเข้า Service Maintenance</b><small>สร้าง/อัปเดตรายชื่อเพื่อใช้มอบหมายงานและปฏิทิน</small></div><span class="switch"><input id="v68EmpLink" type="checkbox" ${old.linkService?'checked':''}><span></span></span></label></div><div class="field full"><label>หมายเหตุ</label><textarea id="v68EmpNote">${esc(old.note||'')}</textarea></div></div><div class="button-row"><button type="button" class="soft-btn" onclick="openEmployeeSettingModal()">ย้อนกลับ</button><button class="primary-btn action-3d-orange">บันทึกพนักงาน</button></div></form>`,true);setTimeout(()=>{v68EmployeeForm.onsubmit=e=>{e.preventDefault();let emp={...old,id:old.id||('EMP-'+Date.now()),name:v68EmpName.value.trim(),position:v68EmpPosition.value.trim(),department:v68EmpDept.value.trim(),team:v68EmpTeam.value,phone:v68EmpPhone.value.trim(),email:v68EmpEmail.value.trim(),systemRole:v68EmpRole.value,status:v68EmpStatus.value,linkService:v68EmpLink.checked,note:v68EmpNote.value.trim(),createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};emp=syncEmployeeTech(emp);const list=employeeList();settings.relatedEmployees=old.id?list.map(x=>x.id===emp.id?emp:x):[emp,...list];saveLocal();cloudSaveSettings();renderAll();openEmployeeSettingModal();toastMsg('บันทึกพนักงานแล้ว')}} ,20)}
 window.deleteRelatedEmployee=function(id){const e=employeeById(id);if(!e||!confirm('ลบ '+(e.name||'พนักงาน')+' ออกจากรายการพนักงานที่เกี่ยวข้องหรือไม่?'))return;settings.relatedEmployees=employeeList().filter(x=>x.id!==id);saveLocal();cloudSaveSettings();renderAll();openEmployeeSettingModal();toastMsg('ลบรายการพนักงานแล้ว')}

 const prevRenderSettings=window.renderSettings;window.renderSettings=function(){prevRenderSettings();ensureV68();const cfg=v68Config(),emp=document.getElementById('setEmployeeSummary'),ps=document.getElementById('setOnsitePricingSummary');if(emp)emp.textContent=`${settings.relatedEmployees.length} คน · Service linked ${settings.relatedEmployees.filter(x=>x.linkService).length}`;if(ps)ps.textContent=`S ${Number(cfg.levels.S.fee).toLocaleString()} · M ${Number(cfg.levels.M.fee).toLocaleString()} · L ${Number(cfg.levels.L.fee).toLocaleString()} + Travel Zone`;applyV68Labels()}
 const prevRenderAll=window.renderAll;window.renderAll=function(){prevRenderAll();renderOnsitePricing();applyV68Labels()}

 window.openMoreSheet=function(){const en=settings.language==='en';openModal(en?'More modules':'เมนูเพิ่มเติม',en?'Choose a module':'เลือกโมดูลที่ต้องการ',`<div class="more-sheet-grid"><button onclick="closeModal();goPage('calendar')">📅<b>${en?'Calendar':'ปฏิทินงาน'}</b><small>${en?'Appointments and schedule':'นัดหมายและตารางงาน'}</small></button><button onclick="closeModal();goPage('onsite')">📍<b>${en?'Onsite Service':'หน้างาน'}</b><small>S / M / L + Travel Zone</small></button><button onclick="closeModal();goPage('technicians')">👨‍🔧<b>Service Maintenance</b><small>${en?'Service staff':'ทีม Service'}</small></button><button onclick="closeModal();goPage('quotation')">฿<b>${en?'Quotation Builder':'ทำใบเสนอราคา'}</b><small>Service + Travel + Parts</small></button><button onclick="closeModal();goPage('customers')">👥<b>${en?'Customers':'ลูกค้า'}</b><small>Customer Database</small></button><button onclick="closeModal();goPage('machines')">⚙<b>${en?'Machines':'เครื่องจักร'}</b><small>Machine Master</small></button><button onclick="closeModal();goPage('warranty')">🛡<b>${en?'Machine Warranty':'ระบบประกันเครื่อง'}</b><small>Warranty / Certificate</small></button><button onclick="closeModal();goPage('documents')">📁<b>${en?'Machine Documents':'เอกสารเครื่องจักร'}</b><small>Manual / Drawing / SOP</small></button><button onclick="closeModal();goPage('qc')">✅<b>${en?'Machine QC':'QC เครื่อง'}</b><small>${en?'Inspection and acceptance':'ตรวจรับและตรวจสอบเครื่อง'}</small></button><button onclick="closeModal();goPage('notifications')">🔔<b>${en?'Notifications':'แจ้งเตือน'}</b><small>${en?'Follow-up items':'งานที่ต้องติดตาม'}</small></button><button onclick="closeModal();goPage('reports')">📊<b>${en?'Reports':'รายงาน'}</b><small>KPI / Summary</small></button><button onclick="closeModal();goPage('settings')">⚙<b>${en?'Settings':'ตั้งค่า'}</b><small>System / Cloud</small></button></div>`,true)}

 // Backup continues to use the existing V6.7 implementation; its version metadata is patched to 6.8.
 // V6.8 employee/pricing data live inside settings, so they are included without changing the backup schema.

 // Persist only additive V6.8 settings; no Supabase URL/Anon Key changes are made here.
 try{saveLocal()}catch(e){}
 window.addEventListener('load',function(){ensureV68();applyV68Labels();renderOnsitePricing();calculateOnsitePricing()});
})();
