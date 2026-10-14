/* Version 1.0 — 2026-09-25: a customer's travel distance is entered ONCE, in ตั้งค่าระบบ,
   and every quotation for that customer starts with it filled in.

   Asked for: "เพิ่มตั้งค่าเข้าไปในโมดุลตั้งค่า อยากให้แอดมินกรอกระยะทางเองทีเดียว และเวลาสร้าง
   ใบเสนอราคามันก็จะขึ้นมาให้เลย". There is no Google Maps API key, so until now the distance
   had to be looked up and typed on every quotation.

   Where it lives: settings.customerDistances = {customerId: km}. Not on the customer record,
   because cloudUpsertCustomer() writes an explicit column list and a new field would be dropped
   on the way to Supabase (part 18's rule); settings travel whole. The key is registered in
   js/90's MAP_KEYS so a device that has not seen an entry cannot delete it on a settings push.
   For the same reason clearing a distance stores 0 rather than deleting the key — a deleted id
   would come back from the cloud copy. Only a value above 0 is ever applied.

   Applied after quoteCustomerChanged() and loadCaseIntoQuote(), the two places a quotation
   takes its customer — the customer dropdown, a case, and a customer request (js/03's
   prepareServiceQuoteFromRequest calls quoteCustomerChanged by name, which is this wrapper).
   loadQuotation() is deliberately NOT hooked: a saved quotation keeps the distance it was
   priced with. Typing into the distance box still overrides it for that quotation only. */
(function(){
 'use strict';
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function store(){try{if(!settings.customerDistances||typeof settings.customerDistances!=='object')settings.customerDistances={};return settings.customerDistances}catch(e){return {}}}
 function kmFor(cid){var v=Number(store()[cid]);return cid&&Number.isFinite(v)&&v>0?v:0}
 function fmtKm(v){return Number(v).toLocaleString('th-TH',{maximumFractionDigits:1})}
 function list(){try{return customers.filter(function(c){return c&&c.id&&c.id!=='CUST-INTERNAL-IMODE'})}catch(e){return []}}

 /* ------------------------------------------------ quotation side --- */
 function applyToQuote(){
  if(typeof qCustomer==='undefined'||typeof qDistance==='undefined')return;
  var cid=qCustomer.value,km=kmFor(cid),st=document.getElementById('qRouteStatus');
  if(!cid)return;
  if(km){
   qDistance.value=km;
   try{quoteDistanceSource='customer_setting';quoteRouteDurationMinutes=0}catch(e){}
   if(st)st.innerHTML='📍 ใช้ระยะทางที่ตั้งไว้ของลูกค้านี้: <b>'+fmtKm(km)+' km</b> (เที่ยวเดียว) · <button type="button" class="link-button" onclick="openCustomerDistanceModal('+imodeJsArg(cid)+')">แก้ในตั้งค่า</button>';
   try{calcQuote()}catch(e){}
  }else if(st){
   st.innerHTML='ยังไม่ได้ตั้งระยะทางของลูกค้านี้ · กรอกเองในช่อง (km) หรือ <button type="button" class="link-button" onclick="openCustomerDistanceModal('+imodeJsArg(cid)+')">ตั้งระยะทางถาวร</button>';
  }
 }
 ['quoteCustomerChanged','loadCaseIntoQuote'].forEach(function(name){
  var base=window[name];if(typeof base!=='function')return;
  window[name]=function(){var r=base.apply(this,arguments);try{applyToQuote()}catch(e){}return r};
 });
 window.imodeApplyCustomerDistance=applyToQuote;

 /* ------------------------------------------------ settings side --- */
 function summary(){
  var el=document.getElementById('setCustomerDistanceSummary');if(!el)return;
  var all=list(),n=all.filter(function(c){return kmFor(c.id)}).length;
  el.textContent='ตั้งแล้ว '+n+' / '+all.length+' ลูกค้า · ใบเสนอราคาเติมให้อัตโนมัติ';
 }
 function ensureCard(){
  if(document.getElementById('customerDistanceCard'))return summary();
  var anchor=document.querySelector('.setting-action-card[onclick^="openLocationSettingModal"]');
  if(!anchor||!anchor.parentNode)return;
  var b=document.createElement('button');
  b.id='customerDistanceCard';b.type='button';
  b.className='setting-action-card module-setting';
  b.setAttribute('onclick','openCustomerDistanceModal()');
  b.innerHTML='<span class="setting-icon">🚗</span><div><b>ระยะทางลูกค้า (Auto)</b><small id="setCustomerDistanceSummary">กรอกครั้งเดียว ใบเสนอราคาเติมให้</small></div><strong>›</strong>';
  anchor.parentNode.insertBefore(b,anchor.nextSibling);
  summary();
 }

 window.openCustomerDistanceModal=function(focusId){
  var rows=list().map(function(c){
   var km=kmFor(c.id),addr=c.address||[c.branch,c.location].filter(Boolean).join(' / ')||'';
   return '<tr data-cdist-row data-q="'+esc2((c.name+' '+c.id+' '+addr).toLowerCase())+'">'
    +'<td><b>'+esc2(c.name||c.id)+'</b><br><small style="color:#6b7890">'+esc2(c.id)+(addr?' · '+esc2(addr):'')+'</small></td>'
    +'<td class="cdist-cell"><div class="cdist-box"><input type="number" min="0" step="0.1" inputmode="decimal" data-cdist="'+esc2(c.id)+'" value="'+(km||'')+'" placeholder="—"><span>km</span></div>'
    +(mapUrl(c)?'<button type="button" class="cdist-map" title="เปิดเส้นทางใน Google Maps แล้วนำระยะทางมากรอก" onclick="imodeCustomerDistanceMap('+imodeJsArg(c.id)+')">📍 Maps</button>':'<span class="cdist-nomap">ไม่มีที่อยู่</span>')+'</td></tr>';
  }).join('');
  openModal('ระยะทางลูกค้า (Auto)','กรอกระยะทางเที่ยวเดียวจากบริษัทถึงลูกค้า (km) ครั้งเดียว — เวลาเลือกลูกค้าในใบเสนอราคา ระบบจะเติมให้เอง',
   '<div class="field"><input id="cdistSearch" placeholder="ค้นหาลูกค้า / รหัส / ที่อยู่" oninput="imodeFilterCustomerDistance(this.value)"></div>'
   +'<div class="cdist-wrap"><table style="min-width:0;width:100%"><thead><tr><th>ลูกค้า</th><th style="text-align:right">ระยะทาง (km)</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
   +'<p style="margin:8px 0 0;color:#6b7890;font-size:12.5px">เว้นว่างหรือใส่ 0 = ไม่ตั้ง (กรอกเองในใบเสนอราคา) · แก้ระยะทางในใบเสนอราคาใบใดใบหนึ่งได้เสมอ ไม่กระทบค่าที่ตั้งไว้</p>'
   +'<div class="button-row" style="margin-top:12px"><button type="button" class="soft-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" onclick="saveCustomerDistances()">💾 บันทึกระยะทาง</button></div>');
  if(focusId)setTimeout(function(){
   var inp=document.querySelector('[data-cdist="'+String(focusId).replace(/"/g,'')+'"]');
   if(inp){inp.scrollIntoView({block:'center'});inp.focus();}
  },120);
 };
 /* Same directions URL the quotation's 📍 button builds (js/03 quoteDirectionsUrl), for any customer:
    company origin → customer, driving. A customer's own mapUrl is only a fallback here, because it
    is a place link, not a route, and shows no distance. */
 function mapUrl(c){
  try{
   var dest=quoteMapsPoint(googleRouteDestination(c));
   if(dest)return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(quoteMapsPoint(googleRouteOrigin()))+'&destination='+encodeURIComponent(dest);
  }catch(e){}
  /* 2026-10-09 security: a stored mapUrl is opened only if it is http(s) (js/03 imodeSafeUrl) */
  var u=c&&c.mapUrl||'';
  return typeof window.imodeSafeUrl==='function'?window.imodeSafeUrl(u):(/^https?:\/\//i.test(u)?u:'');
 }
 window.imodeCustomerDistanceMap=function(id){
  var c=null;try{c=customerById(id)}catch(e){}
  var url=mapUrl(c);if(!url){toastMsg('ลูกค้ารายนี้ยังไม่มีที่อยู่หรือพิกัด');return}
  window.open(url,'_blank','noopener');
  var inp=document.querySelector('[data-cdist="'+String(id).replace(/"/g,'')+'"]');if(inp)inp.focus();
  toastMsg('เปิด Google Maps แล้ว · อ่านระยะทางแล้วกรอกในช่อง km');
 };
 var st=document.createElement('style');st.id='v70CustomerDistanceStyle';
 st.textContent=[
  '.cdist-cell{width:1%;white-space:nowrap;text-align:right;vertical-align:middle}',
  '.cdist-cell>*{vertical-align:middle}',
  '.cdist-box{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border:1.5px solid #d6deeb;border-radius:12px;background:#f8fafd;transition:border-color .15s,box-shadow .15s,background .15s}',
  '.cdist-box:focus-within{border-color:#1f5fd6;background:#fff;box-shadow:0 0 0 3px rgba(31,95,214,.14)}',
  '.cdist-box input{width:68px!important;min-width:0;height:auto!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;outline:none;text-align:right;font:inherit;font-weight:700;color:#12213f}',
  '.cdist-box span{color:#6b7890;font-size:12.5px;font-weight:600}',
  '.cdist-map{margin-left:8px;height:38px;padding:0 12px;border:1.5px solid #cfe0f7;border-radius:12px;background:#eef5ff;color:#1a4fae;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}',
  '.cdist-map:hover{background:#e0edff;border-color:#9fc0ef}',
  '.cdist-nomap{display:inline-block;margin-left:8px;width:84px;color:#98a3b8;font-size:12px;text-align:center}',
  '.cdist-wrap{flex:0 0 auto;min-height:0;max-height:58vh;overflow:auto}',
  '@media (max-width:640px){.cdist-wrap{max-height:none;overflow:visible}.cdist-wrap thead{display:none}.cdist-wrap tr{display:block;padding:10px 2px;border-bottom:1px solid #e8edf5}.cdist-wrap td{display:block;border:0!important;padding:3px 0!important}.cdist-wrap td.cdist-cell{width:auto;text-align:left;padding-top:8px!important}.cdist-box{padding:0 9px}.cdist-box input{width:54px!important}.cdist-map{padding:0 9px;font-size:12px}}'
 ].join('\n');
 if(!document.getElementById(st.id))document.head.appendChild(st);
 window.imodeFilterCustomerDistance=function(q){
  q=String(q||'').trim().toLowerCase();
  [].forEach.call(document.querySelectorAll('[data-cdist-row]'),function(tr){tr.style.display=!q||tr.getAttribute('data-q').indexOf(q)>=0?'':'none'});
 };
 window.saveCustomerDistances=async function(){
  if(typeof canPermission==='function'&&!canPermission('settings.manage')&&!canPermission('quotation.create')){toastMsg('คุณไม่มีสิทธิ์แก้ระยะทางลูกค้า');return}
  var s=store(),changed=0,ids={};
  [].forEach.call(document.querySelectorAll('[data-cdist]'),function(inp){
   var id=inp.getAttribute('data-cdist'),raw=String(inp.value||'').trim(),v=raw===''?0:Math.round(Number(raw)*10)/10;
   if(!Number.isFinite(v)||v<0)v=0;
   var old=Number(s[id])||0;
   if(v!==old){s[id]=v;changed++;ids[id]=1}
  });
  if(!changed){toastMsg('ไม่มีการเปลี่ยนแปลง');closeModal();return}
  try{saveLocal()}catch(e){}
  try{if(typeof cloudSaveSettings==='function')await cloudSaveSettings()}catch(e){console.warn(e)}
  closeModal();summary();
  /* the quotation open behind this popup picks the new value up straight away */
  try{if(document.getElementById('page-quotation')&&document.getElementById('page-quotation').classList.contains('active')&&ids[qCustomer.value])applyToQuote()}catch(e){}
  toastMsg('บันทึกระยะทาง '+changed+' ลูกค้าแล้ว');
 };

 var baseRS=window.renderSettings;
 if(typeof baseRS==='function')window.renderSettings=function(){var r=baseRS.apply(this,arguments);try{ensureCard()}catch(e){}return r};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureCard,{once:true});else ensureCard();
})();
