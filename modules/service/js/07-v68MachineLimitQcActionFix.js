(function(){
  'use strict';

  /* ----- Machine list: display limit + pagination ----- */
  let machineDisplayLimit = 50;
  let machineCurrentPage = 1;
  let machineLastFilterSignature = '';

  function machinePageItems(current,total){
    if(total<=7) return Array.from({length:total},(_,i)=>i+1);
    const items=[1];
    let start=Math.max(2,current-1),end=Math.min(total-1,current+1);
    if(current<=4){start=2;end=Math.min(5,total-1)}
    if(current>=total-3){start=Math.max(2,total-4);end=total-1}
    if(start>2) items.push('…');
    for(let p=start;p<=end;p++) items.push(p);
    if(end<total-1) items.push('…');
    items.push(total);
    return items;
  }

  window.setMachineDisplayLimit = function(value){
    machineDisplayLimit = value === 'all' ? 'all' : Math.max(1, Number(value) || 50);
    machineCurrentPage = 1;
    const sel = document.getElementById('machineDisplayLimit');
    if(sel) sel.value = String(machineDisplayLimit);
    if(typeof window.renderMachines === 'function') window.renderMachines();
  };

  window.setMachineKpiFilter = function(kind,value){
    const sv=document.getElementById('machineServiceFilter'),wf=document.getElementById('machineWarrantyFilter');
    if(sv)sv.value=kind==='service'?value:'all';
    if(wf)wf.value=kind==='warranty'?value:'all';
    machineCurrentPage=1;
    if(typeof window.renderMachines==='function')window.renderMachines();
  };

  function renderMachineKpis(){
    const host=document.getElementById('machineStatusKpis');if(!host)return;
    const sv=(document.getElementById('machineServiceFilter')||{}).value||'all';
    const wf=(document.getElementById('machineWarrantyFilter')||{}).value||'all';
    const en=settings.language==='en',unit=en?'machines':'เครื่อง';
    const card=(kind,value,label,count)=>`<button type="button" class="module-kpi-card" aria-pressed="${kind==='all'?(sv==='all'&&wf==='all'):(kind==='service'?sv===value:wf===value)}" onclick="setMachineKpiFilter(${imodeJsArg(kind)},${imodeJsArg(value)})"><small>${esc(label)}</small><b>${count}</b><span>${unit}</span></button>`;
    host.innerHTML=
      card('all','all',en?'All machines':'เครื่องทั้งหมด',machines.length)+
      card('service','ต่อ Service',en?'Service contract':'ต่อ Service',machines.filter(m=>m.serviceStatus==='ต่อ Service').length)+
      card('service','ไม่ต่อ Service',en?'No contract':'ไม่ต่อ Service',machines.filter(m=>m.serviceStatus==='ไม่ต่อ Service').length)+
      card('warranty','อยู่ในประกัน',en?'In warranty':'อยู่ในประกัน',machines.filter(m=>m.warranty==='อยู่ในประกัน').length)+
      card('warranty','หมดประกัน',en?'Warranty expired':'หมดประกัน',machines.filter(m=>m.warranty==='หมดประกัน').length);
  }

  window.setMachinePage = function(page){
    machineCurrentPage = Math.max(1, Number(page) || 1);
    if(typeof window.renderMachines === 'function') window.renderMachines();
    const anchor=document.querySelector('#page-machines .demo-master-toolbar');
    if(anchor) setTimeout(()=>anchor.scrollIntoView({behavior:'smooth',block:'start'}),30);
  };

  window.renderMachines = function(){
    renderMachineKpis();
    const q=(typeof machineMasterSearch!=='undefined'?machineMasterSearch.value:'').trim().toLowerCase(),
          sf=(typeof machineServiceFilter!=='undefined'?machineServiceFilter.value:'all'),
          wf=(typeof machineWarrantyFilter!=='undefined'?machineWarrantyFilter.value:'all'),
          zf=(typeof machineSizeFilter!=='undefined'?machineSizeFilter.value:'all');

    const filterSignature=[q,sf,wf,zf].join('|');
    if(machineLastFilterSignature && machineLastFilterSignature!==filterSignature) machineCurrentPage=1;
    machineLastFilterSignature=filterSignature;

    const filtered=machines.filter(m=>{
      const cu=customerById(m.customerId),sz=normalizeMachineSize(m.size);
      return (!q||[machineNameTh(m),machineNameEn(m),m.model,m.serial,cu?.name].join(' ').toLowerCase().includes(q))&&
             (sf==='all'||m.serviceStatus===sf)&&
             (wf==='all'||m.warranty===wf)&&
             (zf==='all'||(zf==='confirm'?!sz:sz===zf));
    });

    const allMode=machineDisplayLimit==='all';
    const limit=allMode?Math.max(1,filtered.length):Math.max(1,Number(machineDisplayLimit||50));
    const pageCount=allMode?1:Math.max(1,Math.ceil(filtered.length/limit));
    machineCurrentPage=Math.min(Math.max(1,machineCurrentPage),pageCount);
    const startIndex=filtered.length?(machineCurrentPage-1)*limit:0;
    const list=allMode?filtered:filtered.slice(startIndex,startIndex+limit);
    const firstShown=filtered.length?startIndex+1:0;
    const lastShown=filtered.length?startIndex+list.length:0;

    const totalEl=document.getElementById('machineTotalCount');
    if(totalEl) totalEl.textContent=Number(machines.length||0).toLocaleString('th-TH');
    const limitEl=document.getElementById('machineDisplayLimit');
    if(limitEl && limitEl.value!==String(machineDisplayLimit)) limitEl.value=String(machineDisplayLimit);

    if(typeof machineTable!=='undefined') machineTable.innerHTML=list.length?list.map(m=>{
      const cu=customerById(m.customerId),cc=cases.filter(c=>c.machineId===m.id).length,sz=normalizeMachineSize(m.size);
      return `<tr><td>${machineMediaHTML(m)}</td><td><div class="machine-cell-name">${machinePairHTML(m)}<small>${esc(m.note||'')}</small></div></td><td>${esc(m.model||'-')}</td><td>${esc(m.serial||'-')}</td><td>${esc(cu?.name||'-')}</td><td>${esc(m.issueYear||'-')}</td><td><span class="machine-size-badge ${sz||'confirm'}" title="${esc(m.sizeStatus||'')}">${esc(sz||'Confirm')}</span></td><td><span class="service-contract-badge ${m.serviceStatus==='ต่อ Service'?'on':'off'}">${esc(m.serviceStatus||'ไม่ระบุ')}</span></td><td>${esc(m.warranty||'-')}</td><td>${cc}</td><td><button class="mini-btn" onclick="openMachineQR(${imodeJsArg(m.id)})">QR</button> <button class="mini-btn" onclick="openMachineDetail(${imodeJsArg(m.id)})">ดู</button> <button class="mini-btn" onclick="openQcModal('', ${imodeJsArg(m.id)})">QC</button> <button class="mini-btn" onclick="openMachineModal(${imodeJsArg(m.id)})">แก้ไข</button></td></tr>`;
    }).join(''):`<tr><td colspan="11"><div class="empty">ไม่พบข้อมูลเครื่องจักรตามเงื่อนไข</div></td></tr>`;

    if(typeof machineCards!=='undefined') machineCards.innerHTML=list.length?list.map(m=>{
      const sz=normalizeMachineSize(m.size);
      return `<div class="mobile-data-card"><div class="card-top"><div><h4>${esc(machinePrimaryName(m))}</h4><p class="machine-alt-mobile">${esc(machineSecondaryName(m))}</p><p>${esc(m.model||'-')} · S/N ${esc(m.serial||'-')}</p></div><div class="machine-mobile-meta"><span class="machine-size-badge ${sz||'confirm'}">${esc(sz||'Confirm')}</span><span class="badge">${esc(m.issueYear||'-')}</span></div></div>${machineMediaHTML(m)}<p style="margin-top:10px">${esc(customerById(m.customerId)?.name||'-')}</p><div class="machine-status-row"><span class="service-contract-badge ${m.serviceStatus==='ต่อ Service'?'on':'off'}">${esc(m.serviceStatus||'ไม่ระบุ')}</span><span>${esc(m.warranty||'-')}</span></div><div class="card-actions"><button class="soft-btn" onclick="openMachineQR(${imodeJsArg(m.id)})">QR</button><button class="soft-btn" onclick="openMachineDetail(${imodeJsArg(m.id)})">รายละเอียด</button><button class="soft-btn" onclick="openQcModal('', ${imodeJsArg(m.id)})">QC</button><button class="primary-btn" onclick="openMachineModal(${imodeJsArg(m.id)})">แก้ไข</button></div></div>`;
    }).join(''):'<div class="empty">ไม่พบข้อมูลเครื่องจักร</div>';

    const pager=document.getElementById('machinePagination');
    if(pager){
      const summary=`<div class="machine-page-summary">แสดง <b>${firstShown.toLocaleString('th-TH')}–${lastShown.toLocaleString('th-TH')}</b> จากทั้งหมด <b>${filtered.length.toLocaleString('th-TH')}</b> เครื่อง</div>`;
      if(filtered.length===0){
        pager.innerHTML=summary;
      }else if(pageCount<=1){
        pager.innerHTML=summary+`<div class="machine-page-controls"><span class="machine-page-one">หน้า 1 / 1</span></div>`;
      }else{
        const pages=machinePageItems(machineCurrentPage,pageCount).map(item=>item==='…'?`<span class="machine-page-ellipsis">…</span>`:`<button type="button" class="machine-page-btn ${item===machineCurrentPage?'active':''}" onclick="window.setMachinePage(${item})" aria-label="หน้า ${item}">${item}</button>`).join('');
        pager.innerHTML=summary+`<div class="machine-page-controls"><button type="button" class="machine-page-btn" onclick="window.setMachinePage(${machineCurrentPage-1})" ${machineCurrentPage<=1?'disabled':''}>← ก่อนหน้า</button>${pages}<button type="button" class="machine-page-btn" onclick="window.setMachinePage(${machineCurrentPage+1})" ${machineCurrentPage>=pageCount?'disabled':''}>ถัดไป →</button></div>`;
      }
    }
  };

  /* ----- QC Preview / Print: robust global actions ----- */
  function safeQcRecord(record){
    return {...record,
      checklist:Array.isArray(record?.checklist)?record.checklist:[],
      media:Array.isArray(record?.media)?record.media:[]
    };
  }

  window.openQcPreviewRecord = function(record,draft=false){
    try{
      const q=safeQcRecord(record||{});
      const title=draft?'ตัวอย่างเอกสาร QC':'QC '+(q.qcNo||'-');
      const subtitle=draft?'Preview เอกสารภาษาไทย 2 หน้า ก่อนบันทึก':`${typeof window.qcTypeThai==='function'?window.qcTypeThai(q.type):(q.type||'-')} · ${typeof window.qcResultThai==='function'?window.qcResultThai(q.status):(q.status||'-')}`;
      const docHtml=typeof window.qcDocHTML==='function'?window.qcDocHTML(q):'';
      openModal(title,subtitle,docHtml+`<div class="button-row" style="margin-top:12px"><button type="button" class="soft-btn" onclick="closeModal()">ปิด</button><button type="button" class="soft-btn" onclick="window.printQcCurrent()">🖨 พิมพ์ / บันทึก PDF</button>${!draft?`<button type="button" class="primary-btn" onclick="openQcModal(${imodeJsArg(q.id)})">แก้ไข QC</button>`:''}</div>`,true);
      if(typeof modalPanel!=='undefined' && modalPanel) modalPanel.classList.add('large');
    }catch(err){
      console.error('QC preview error',err);
      if(typeof toastMsg==='function') toastMsg('เปิดเอกสาร QC ไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  window.previewQc = function(id){
    try{
      const q=typeof qcRecord==='function'?qcRecord(id):null;
      if(!q){if(typeof toastMsg==='function')toastMsg('ไม่พบข้อมูล QC');return;}
      window.openQcPreviewRecord(q,false);
    }catch(err){
      console.error('QC view error',err);
      if(typeof toastMsg==='function')toastMsg('เปิด QC ไม่สำเร็จ');
    }
  };

  window.previewQcDraft = function(){
    try{
      const q=typeof qcDraftRecord==='function'?qcDraftRecord():null;
      if(q) window.openQcPreviewRecord(q,true);
    }catch(err){
      console.error('QC draft preview error',err);
      if(typeof toastMsg==='function')toastMsg('เปิด Preview QC ไม่สำเร็จ');
    }
  };

  window.printQcCurrent = function(){
    const doc=document.getElementById('qcPrintDoc');
    if(!doc){if(typeof toastMsg==='function')toastMsg('ไม่พบเอกสาร QC สำหรับพิมพ์');return;}
    try{
      const css=[
        document.getElementById('qcV66Style')?.textContent||'',
        document.getElementById('v67EnhanceStyle')?.textContent||'',
        document.getElementById('v671QcQrResponsiveFix')?.textContent||''
      ].join('\n');
      const frame=document.createElement('iframe');
      frame.setAttribute('aria-hidden','true');
      frame.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
      document.body.appendChild(frame);
      const fd=frame.contentDocument||frame.contentWindow.document;
      fd.open();
      fd.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เอกสาร QC</title><style>${css}</style></head><body>${doc.outerHTML}</body></html>`);
      fd.close();
      const doPrint=()=>setTimeout(()=>{
        try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){console.error(e);if(typeof toastMsg==='function')toastMsg('สั่งพิมพ์ไม่สำเร็จ');}
        setTimeout(()=>frame.remove(),1800);
      },250);
      const waitForImages=()=>{
        const pending=[...fd.images].filter(img=>!img.complete);
        if(!pending.length){doPrint();return;}
        let finished=false;
        const finish=()=>{if(finished)return;finished=true;doPrint()};
        let remaining=pending.length;
        pending.forEach(img=>{const done=()=>{remaining-=1;if(remaining<=0)finish()};img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true})});
        setTimeout(finish,1800);
      };
      if(frame.contentWindow.document.readyState==='complete') waitForImages(); else frame.onload=waitForImages;
    }catch(err){
      console.error('QC print error',err);
      if(typeof toastMsg==='function')toastMsg('พิมพ์ QC ไม่สำเร็จ');
    }
  };

  /* Make existing QC buttons call the explicit window functions. */
  const oldRenderQc = window.renderQc;
  if(typeof oldRenderQc==='function'){
    window.renderQc=function(){
      oldRenderQc();
      document.querySelectorAll('#page-qc button[onclick*="previewQc("]').forEach(btn=>{
        const raw=btn.getAttribute('onclick')||'';
        const m=raw.match(/previewQc\((['"])(.*?)\1\)/);
        if(m) btn.setAttribute('onclick',`window.previewQc(${JSON.stringify(m[2])})`);
      });
    };
  }

  setTimeout(()=>{
    try{window.renderMachines?.();window.renderQc?.();}catch(e){console.warn(e)}
  },0);
})();
