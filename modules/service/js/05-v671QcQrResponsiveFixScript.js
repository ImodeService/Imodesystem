(function(){
  'use strict';
  const DOCUMENT_LOGO_REL='./assets/imode-document-logo.webp';
  const documentLogoUrl=()=>{try{return new URL(DOCUMENT_LOGO_REL,window.location.href).href}catch(e){return DOCUMENT_LOGO_REL}};
  const qcThaiDate=(v)=>{if(!v)return '-';try{return new Date(String(v).length===10?v+'T00:00:00':v).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})}catch(e){return String(v)}};
  const qcResultThai=(v)=>({Pending:'รอตรวจ',Draft:'รอตรวจ','In Progress':'กำลังตรวจ',Pass:'ผ่าน',Conditional:'ผ่านแบบมีเงื่อนไข',Fail:'ไม่ผ่าน','N/A':'ไม่เกี่ยวข้อง'})[v]||v||'-';
  const qcTypeThai=(v)=>({'Incoming Inspection':'ตรวจรับเข้า','Pre-Delivery QC':'ตรวจก่อนส่งมอบ','Post-Service QC':'ตรวจหลังซ่อม','Installation Acceptance':'ตรวจรับหลังติดตั้ง','PM Verification':'ตรวจยืนยัน PM'})[v]||v||'-';
  window.qcThaiDate=qcThaiDate;
  window.qcResultThai=qcResultThai;
  window.qcTypeThai=qcTypeThai;

  /* Data-entry modals close explicitly via X or after a completed action. */
  const modalEl=document.getElementById('modal');
  const modalPanelEl=document.getElementById('modalPanel');
  if(modalEl && !modalEl.dataset.v671CloseFix){
    modalEl.dataset.v671CloseFix='1';
    modalEl.addEventListener('click',function(e){if(e.target===modalEl && modalEl.classList.contains('open') && !modalHasDataEntry()) window.closeModal?.()});
    document.addEventListener('keydown',function(e){if(e.key==='Escape' && modalEl.classList.contains('open') && !modalHasDataEntry()){e.preventDefault();window.closeModal?.()}});
    modalPanelEl?.addEventListener('click',function(e){e.stopPropagation()});
  }

  /* QR popup: use official document logo and always provide a visible Close action. */
  window.openMachineQR=function(mid){
    const m=machineById(mid);if(!m)return;
    const url=machinePortalUrl(mid),logo=documentLogoUrl();
    openModal('QR Code ประจำเครื่อง',`${m.name} · ${m.model||'-'} · S/N ${m.serial||'-'}`,
      `<div class="qr-wrap v671-qr-wrap">
        <div>
          <div class="v671-qr-label-card">
            <img class="v671-qr-doc-logo" src="${esc(String(logo))}" alt="I-MODE">
            <div id="machineQRCode" class="qr-box"></div>
            <div class="v671-qr-label-title">สแกนเพื่อรับบริการ</div>
            <div class="v671-qr-label-sub">แจ้งปัญหา · ตรวจสอบ Warranty · ประวัติ Service · คู่มือเครื่อง</div>
            <b>${esc(machinePrimaryName(m)||m.name||'-')}</b>
            <div class="v671-qr-label-sub">${esc(m.model||'-')} · S/N ${esc(m.serial||'-')}</div>
          </div>
          <div class="button-row" style="justify-content:center;margin-top:10px">
            <button type="button" class="soft-btn" onclick="printMachineQR(${imodeJsArg(m.id)})">🖨 พิมพ์สติกเกอร์</button>
          </div>
        </div>
        <div class="qr-meta">
          <h3>Customer Service QR</h3>
          <p>QR ประจำเครื่องสำหรับเปิดหน้าบริการของเครื่องนั้นโดยตรง ทั้งแจ้งปัญหา ตรวจสอบ Warranty ประวัติ Service คู่มือ และคำขอบริการ</p>
          <div class="qr-url">${esc(url)}</div>
          <div class="info-box"><b>สำหรับระบบจริง:</b> ใช้ LIFF URL + Machine QR Token และให้ Backend ตรวจสิทธิ์ก่อนแสดงข้อมูลลูกค้า/เครื่อง</div>
          <div class="button-row" style="margin-top:12px">
            <button type="button" class="primary-btn" onclick="closeModal();openCustomerPortalForMachine(${imodeJsArg(m.id)})">📱 ดูหน้าหลักลูกค้า</button>
          </div>
        </div>
      </div>
      `
    );
    modalPanel?.classList.add('large');
    setTimeout(()=>renderQR('machineQRCode',url),60);
  };

  window.printMachineQR=function(mid){
    const m=machineById(mid);if(!m)return;
    const url=machinePortalUrl(mid),logo=documentLogoUrl();
    const w=window.open('','_blank','width=650,height=780');
    if(!w){toastMsg?.('Browser บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up');return}
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>QR Service - ${esc(m.serial||m.name||'')}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans Thai",sans-serif;text-align:center;padding:20px;color:#17233c}.label{width:360px;margin:auto;border:2px solid #173f8a;border-radius:18px;padding:18px;background:#fff}.logo{display:block;width:220px;height:90px;object-fit:contain;margin:0 auto 6px;background:#fff}.qr{display:flex;justify-content:center;margin:10px auto}.title{font-size:20px;font-weight:800;color:#173f8a}.small{font-size:12px;line-height:1.55;color:#52627d}.serial{margin:8px 0;font-weight:800}.machine{font-size:15px;font-weight:800;margin-top:5px}
      </style></head><body><div class="label"><img class="logo" src="${esc(String(logo))}" alt="I-MODE"><div class="title">สแกนเพื่อรับบริการ</div><div class="small">แจ้งปัญหา · ตรวจสอบ Warranty · ประวัติ Service · คู่มือเครื่อง</div><div id="q" class="qr"></div><div class="machine">${esc(machinePrimaryName(m)||m.name||'-')}</div><div>${esc(m.model||'-')}</div><div class="serial">S/N ${esc(m.serial||'-')}</div><div class="small">I-MODE Plus Service & Maintenance</div></div><script>window.onload=()=>{new QRCode(document.getElementById('q'),{text:${JSON.stringify(url)},width:210,height:210,colorDark:'#0b2f8f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});setTimeout(()=>window.print(),700)}<\/script></body></html>`);
    w.document.close();
  };

  /* Clearly label the existing media storage as page-2 QC evidence. No data schema changes. */
  const originalOpenQcModal=window.openQcModal;
  if(typeof originalOpenQcModal==='function'){
    window.openQcModal=function(id='',presetMachine=''){
      originalOpenQcModal(id,presetMachine);
      setTimeout(()=>{
        const form=document.getElementById('qcForm');if(!form)return;
        const fields=[...form.querySelectorAll('.field')];
        const checklistField=fields.find(f=>/Checklist QC|รายการตรวจสอบ QC/i.test(f.querySelector(':scope > label')?.textContent||''));
        const mediaField=fields.find(f=>/รูปภาพและวิดีโอประกอบ QC|รูปภาพปัญหา/i.test(f.querySelector(':scope > label')?.textContent||''));
        const findingsField=fields.find(f=>/สิ่งที่พบ/.test(f.querySelector(':scope > label')?.textContent||''));
        const correctiveField=fields.find(f=>/Corrective Action|การแก้ไข/.test(f.querySelector(':scope > label')?.textContent||''));
        const noteField=fields.find(f=>/Release Note|หมายเหตุ/.test(f.querySelector(':scope > label')?.textContent||''));
        if(checklistField && !form.querySelector('[data-qc-page="1"]')) checklistField.insertAdjacentHTML('beforebegin','<div class="v671-qc-page-editor-title" data-qc-page="1"><span>1</span> หน้า 1 — รายการตรวจสอบ QC</div>');
        if(findingsField && !form.querySelector('[data-qc-page="2"]')) findingsField.insertAdjacentHTML('beforebegin','<div class="v671-qc-page-editor-title" data-qc-page="2"><span>2</span> หน้า 2 — รูปปัญหา / อุปกรณ์ไม่ครบ</div>');
        if(checklistField?.querySelector(':scope > label')) checklistField.querySelector(':scope > label').textContent='รายการตรวจสอบ QC';
        if(findingsField?.querySelector(':scope > label')) findingsField.querySelector(':scope > label').textContent='สิ่งที่พบ / รายละเอียดปัญหา';
        if(correctiveField?.querySelector(':scope > label')) correctiveField.querySelector(':scope > label').textContent='การแก้ไข / แนวทางดำเนินการ';
        if(noteField?.querySelector(':scope > label')) noteField.querySelector(':scope > label').textContent='หมายเหตุเพิ่มเติม';
        if(mediaField){
          const label=mediaField.querySelector(':scope > label');if(label)label.textContent='รูปภาพปัญหา / อุปกรณ์ไม่ครบ (แสดงในเอกสารหน้า 2)';
          const box=mediaField.querySelector('.qc-media-box');
          if(box && !box.querySelector('.v671-qc-photo-note')) box.insertAdjacentHTML('afterbegin','<div class="v671-qc-photo-note"><b>รูปสำหรับเอกสารหน้า 2</b><br>หากพบเครื่องมีปัญหา, รอยเสียหาย หรืออุปกรณ์มาไม่ครบ ให้เพิ่มรูปที่นี่ รูปภาพจะเข้า Preview หน้า 2 อัตโนมัติ ส่วนวิดีโอจะเก็บไว้ในข้อมูล QC แต่ไม่พิมพ์ลงเอกสาร</div>');
          const uploadLabels=box?.querySelectorAll('.qc-media-tools > label');
          if(uploadLabels?.[0]){const input=uploadLabels[0].querySelector('input');uploadLabels[0].childNodes[0].textContent='📷 เพิ่มรูปหน้า 2 ';if(input)input.setAttribute('accept','image/*')}
          if(uploadLabels?.[1]) uploadLabels[1].childNodes[0].textContent='🎥 วิดีโอประกอบ ';
          const hint=box?.querySelector('.qc-hint');if(hint)hint.textContent='แนบรวมได้สูงสุด 8 ไฟล์ · เอกสารหน้า 2 แสดงรูปภาพสูงสุด 6 รูป';
        }
        const previewBtn=[...form.querySelectorAll('button')].find(b=>/ดูใบ QC/.test(b.textContent||''));if(previewBtn)previewBtn.textContent='🧾 ดูเอกสาร QC 2 หน้า';
      },80);
    };
  }

  window.qcDocHTML=function(q){
    const m=machineById(q.machineId)||{},cu=customerById(q.customerId)||{},c=cases.find(x=>x.id===q.caseId),st=qcChecklistStats(q);
    const pics=(q.media||[]).filter(x=>String(x.type||'').startsWith('image/')).slice(0,6);
    const rows=(q.checklist||[]).map((it,i)=>`<tr><td class="n">${i+1}</td><td>${esc(it.labelTh||it.labelEn||it.id)}</td><td class="result">${esc(qcResultThai(it.result))}</td><td class="remark">${esc(it.remark||'-')}</td></tr>`).join('');
    const company=esc(settings.companyNameTh||settings.companyName||'บริษัท ไอโมด พลัส จำกัด'),address=esc(settings.companyAddress||''),phone=esc(settings.companyPhone||'-'),email=esc(settings.companyEmail||'-'),logo=documentLogoUrl();
    const machineName=esc(machinePrimaryName(m)||'-'),model=esc(m.model||'-'),serial=esc(m.serial||'-'),customer=esc(cu.name||'-'),target=esc(q.targetCompany||'บริษัท ไอโมด พลัส จำกัด');
    const photoSlots=Array.from({length:6},(_,i)=>{const x=pics[i];return `<div class="qc-photo-slot"><div class="photo-stage">${x?`<img src="${esc(String(x.data))}" alt="รูปประกอบ QC ${i+1}">`:`<div class="photo-empty">ช่องรูปภาพ ${i+1}<br>ปัญหา / ความเสียหาย / อุปกรณ์ไม่ครบ</div>`}</div><div class="photo-caption">${x?`รูปที่ ${i+1} · ${esc(x.name||'รูปประกอบ QC')}`:`รูปที่ ${i+1} · ยังไม่มีรูป`}</div></div>`}).join('');
    return `<div class="qc-doc-stack" id="qcPrintDoc">
      <section class="qc-doc-page qc-doc-page-1">
        <div class="qc-doc-page-head"><img src="${esc(String(logo))}" alt="I-MODE"><div><h1>ใบตรวจสอบคุณภาพเครื่องจักร (QC)</h1><div class="page-name">หน้าที่ 1 / 2 — รายการตรวจสอบ</div><div class="qc-doc-company"><b>${company}</b><br>${address}<br>โทร. ${phone} · ${email}</div></div></div>
        <div class="qc-doc-info"><div><b>เลขที่ QC:</b> ${esc(q.qcNo||'-')}<br><b>ประเภทการตรวจ:</b> ${esc(qcTypeThai(q.type)||'-')}<br><b>วันที่ตรวจ:</b> ${qcThaiDate(q.qcDate)}<br><b>เลขที่งานบริการ:</b> ${esc(c?.ticket||'-')}</div><div><b>ลูกค้า:</b> ${customer}<br><b>เอกสารส่งให้:</b> ${target}<br><b>เครื่องจักร:</b> ${machineName}<br><b>รุ่น / หมายเลขเครื่อง:</b> ${model} / ${serial}</div></div>
        <table class="qc-doc-table"><thead><tr><th class="n">ลำดับ</th><th>รายการตรวจสอบ</th><th class="result">ผลการตรวจ</th><th class="remark">หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="qc-doc-summary"><div><b>สรุปรายการตรวจ:</b> ตรวจแล้ว ${st.done}/${st.total} รายการ · ผ่าน ${st.pass} รายการ · ไม่ผ่าน ${st.fail} รายการ</div><div><b>ผล QC:</b> ${esc(qcResultThai(q.status))}<br><b>ผู้ตรวจ:</b> ${esc(q.inspector||'-')}<br><b>ผู้อนุมัติ:</b> ${esc(q.reviewer||'-')}</div></div>
        <div class="qc-doc-sign"><div><b>ผู้ตรวจ QC</b><div>วันที่ ....................</div></div><div><b>ฝ่ายบริการ / เทคนิค</b><div>วันที่ ....................</div></div><div><b>ผู้อนุมัติ / ผู้รับมอบ</b><div>วันที่ ....................</div></div></div>
      </section>
      <section class="qc-doc-page qc-doc-page-2">
        <div class="qc-doc-page-head"><img src="${esc(String(logo))}" alt="I-MODE"><div><h1>ภาพประกอบปัญหา / อุปกรณ์ไม่ครบ</h1><div class="page-name">หน้าที่ 2 / 2 — หลักฐานประกอบการตรวจ QC</div><div class="qc-doc-company"><b>${company}</b><br>เลขที่ QC ${esc(q.qcNo||'-')} · ${machineName} · ${model} · S/N ${serial}</div></div></div>
        <div class="qc-doc-info"><div><b>ลูกค้า:</b> ${customer}<br><b>วันที่ตรวจ:</b> ${qcThaiDate(q.qcDate)}<br><b>ประเภทการตรวจ:</b> ${esc(qcTypeThai(q.type)||'-')}</div><div><b>ผู้ตรวจ:</b> ${esc(q.inspector||'-')}<br><b>ผล QC:</b> ${esc(qcResultThai(q.status))}<br><b>เลขที่งานบริการ:</b> ${esc(c?.ticket||'-')}</div></div>
        <div class="qc-doc-note-grid"><div class="qc-doc-note-box"><b>สิ่งที่พบ / รายละเอียดปัญหา</b>${esc(q.findings||'-')}</div><div class="qc-doc-note-box"><b>การแก้ไข / แนวทางดำเนินการ</b>${esc(q.correctiveAction||'-')}</div><div class="qc-doc-note-box full"><b>หมายเหตุเพิ่มเติม</b>${esc(q.note||'-')}</div></div>
        <div class="qc-doc-section-title">รูปภาพประกอบ</div><div class="qc-photo-sheet">${photoSlots}</div>${((q.media||[]).filter(x=>String(x.type||'').startsWith('image/')).length>6)?`<div class="qc-photo-extra">มีรูปเพิ่มเติมในข้อมูล QC อีก ${(q.media||[]).filter(x=>String(x.type||'').startsWith('image/')).length-6} รูป</div>`:''}
      </section>
    </div>`;
  };

  window.openQcPreviewRecord=function(q,draft=false){
    openModal(draft?'ตัวอย่างเอกสาร QC':'QC '+q.qcNo,draft?'Preview เอกสารภาษาไทย 2 หน้า ก่อนบันทึก':`${qcTypeThai(q.type)} · ${qcResultThai(q.status)}`,
      window.qcDocHTML(q)+`<div class="button-row" style="margin-top:12px"><button type="button" class="soft-btn" onclick="closeModal()">ปิด</button><button type="button" class="soft-btn" onclick="printQcCurrent()">🖨 พิมพ์ / บันทึก PDF</button>${!draft?`<button type="button" class="primary-btn" onclick="openQcModal(${imodeJsArg(q.id)})">แก้ไข QC</button>`:''}</div>`,true);
    modalPanel?.classList.add('large');
  };
  window.previewQc=function(id){const q=qcRecord(id);if(q)window.openQcPreviewRecord(q,false)};
  window.previewQcDraft=function(){window.openQcPreviewRecord(qcDraftRecord(),true)};
  window.printQcCurrent=function(){
    const doc=document.getElementById('qcPrintDoc');if(!doc)return;
    const css=[document.getElementById('qcV66Style')?.textContent||'',document.getElementById('v67EnhanceStyle')?.textContent||'',document.getElementById('v671QcQrResponsiveFix')?.textContent||''].join('\n');
    const w=window.open('','_blank','width=1200,height=900');if(!w){toastMsg?.('Browser บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up');return}
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เอกสาร QC ${esc((document.querySelector('#qcPrintDoc .qc-doc-company')?.textContent||'').trim())}</title><style>${css}</style></head><body>${doc.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    w.document.close();
  };
})();
