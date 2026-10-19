/* 2026-10-15: Settings page in folder tabs ("แบ่งเป็นหมวด กดเลือกเพื่อใช้ตั้งค่าในหมวดนั้น
   เพิ่มแถบขึ้นมาข้างบน สไตล์แบบแบ่งเป็น Folder มีชื่อหมวดบอกในแต่ละปุ่ม"; mock-up OK'd the same day).
   The markup in index.html is left as it was: this file only MOVES the existing cards (with their
   onclick, data-perm and summary ids) into one panel per tab, so every settings window opens
   exactly as before. A card it does not know stays with the tab of the section it came from.
   Cards hidden by permissions (js/12) are not counted, and a tab with nothing to show is hidden.
   The chosen tab is remembered on this device (imode.settingsTab).
   2026-10-15 ("หน้าเวอร์ชั่นมือถือมันไม่พอดีสัดส่วน"): on a phone the same folder tabs use short names so
   more fit across, and the row scrolls sideways (the open tab is scrolled into view). */
(function(){
 'use strict';
 var KEY='imode.settingsTab';
 var TABS=[
  {id:'users',short:'ผู้ใช้/สิทธิ์',icon:'👥',name:'ผู้ใช้และสิทธิ์',desc:'บทบาท สิทธิ์ บัญชีเข้าสู่ระบบ และรายชื่อพนักงาน',fns:['openRolesSettingModal','openAccountAdminModal','openEmployeeSettingModal']},
  {id:'flow',short:'ขั้นตอนงาน',icon:'🧭',name:'ขั้นตอนงาน',desc:'SLA ประเภทงาน สถานะ และข้อมูลบริษัท',fns:['openSlaSettingModal','openMasterHubModal','openCompanySettingModal']},
  {id:'look',short:'หน้าตา/ภาษา',icon:'🎨',name:'หน้าตาและภาษา',desc:'ภาษา ธีมหน้าจอ และขนาดตัวอักษร',fns:['openLanguageSettingModal','openUiThemeSettingModal','openTypographySettingModal']},
  {id:'price',short:'ค่าบริการ',icon:'💰',name:'ค่าบริการและใบเสนอราคา',desc:'ค่าที่ใช้คำนวณบริการ ค่าเดินทาง ประกัน อะไหล่ และใบเสนอราคา',fns:['openServiceRateSettingModal','openOnsitePricingSettingModal','openTravelSettingModal','openEmergencySettingModal','openQuotationSettingModal']},
  {id:'field',short:'ภาคสนาม',icon:'🛠️',name:'งานภาคสนาม',desc:'ใบตรวจช่าง ตำแหน่งลูกค้า ประกันเครื่อง เอกสาร รูปภาพ และรายงาน',fns:['openFieldServiceSettingModal','openLocationSettingModal','openCustomerDistanceModal','openWarrantyModuleSettingModal','openDocumentModuleSettingModal','openMediaSettingModal','openReportExportSettingModal']},
  {id:'connect',short:'เชื่อมต่อ',icon:'🔗',name:'การเชื่อมต่อ',desc:'การแจ้งเตือน LINE OA การเชื่อมต่อระบบ และความปลอดภัย',fns:['openNotificationSettingModal','openIntegrationSettingModal','openLineOASettingModal','openSystemBehaviorSettingModal']},
  {id:'data',short:'ข้อมูล/สำรอง',icon:'💾',name:'ข้อมูลและสำรอง',desc:'ซิงก์ข้อมูล สำรอง/นำเข้า ฐานข้อมูล Cloud และสถานะระบบ',fns:['syncCloud','openDataBackupModal']},
  {id:'test',short:'ทดสอบ',icon:'🧪',name:'ทดสอบระบบ',desc:'เปิดหน้าที่ปกติเข้าได้จาก QR หรือ LINE OA เท่านั้น',fns:[],perm:'settings.manage'}
 ];
 /* the old sections, in page order, for cards this file does not know */
 var SECTION_TAB=['flow','price','field','connect','test'];

 function fnOf(card){var m=/^\s*([\w$]+)/.exec(card.getAttribute('onclick')||'');return m?m[1]:''}
 function tabFor(fn){for(var i=0;i<TABS.length;i++)if(TABS[i].fns.indexOf(fn)>=0)return TABS[i].id;return ''}
 function lsGet(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
 function lsSet(v){try{localStorage.setItem(KEY,v)}catch(e){}}
 function shown(el){return el.style.display!=='none'&&!el.hidden}

 function css(){
  if(document.getElementById('svcSettingsTabsCss'))return;
  var s=document.createElement('style');s.id='svcSettingsTabsCss';
  s.textContent=
   '.stab-wrap{--stab-bg:#e4e8ef;--stab-on:#fff;--stab-line:#d3d9e3;--stab-ink:#4a5568;--stab-ink-on:#0c225e;--stab-acc:#e8730c;--stab-num:#cfd6e1;--stab-num-on:#fde7d3;--stab-num-ink:#b85a07;--stab-sub:#6b7587;margin-top:14px}'+
   'html[data-ui="flat-dark"] .stab-wrap{--stab-bg:#1f1f1f;--stab-on:#262626;--stab-line:#3a3a3a;--stab-ink:#b5b5b5;--stab-ink-on:#f0f0f0;--stab-num:#3a3a3a;--stab-num-on:#4a3420;--stab-num-ink:#ffb26b;--stab-sub:#a8a8a8}'+
   '.stab-bar{display:flex;gap:4px;overflow-x:auto;padding:0 4px;margin-bottom:-1px;position:relative;z-index:2;scrollbar-width:none;-webkit-overflow-scrolling:touch}'+
   '.stab-bar::-webkit-scrollbar{display:none}'+
   '.stab{flex:none;display:flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid var(--stab-line);background:var(--stab-bg);color:var(--stab-ink);padding:10px 16px 9px;border-radius:12px 12px 0 0;font:inherit;font-size:14px;font-weight:500;cursor:pointer;position:relative;transition:background .15s,color .15s}'+
   '.stab:hover{color:var(--stab-ink-on)}'+
   '.stab:focus-visible{outline:2px solid var(--stab-acc);outline-offset:-2px}'+
   '.stab em{font-style:normal;font-size:11px;line-height:1.5;background:var(--stab-num);color:var(--stab-ink);border-radius:99px;padding:0 7px}'+
   '.stab[aria-selected="true"]{background:var(--stab-on);border-bottom-color:var(--stab-on);color:var(--stab-ink-on);font-weight:700;z-index:2}'+
   '.stab[aria-selected="true"]::before{content:"";position:absolute;left:-1px;right:-1px;top:-1px;height:3px;border-radius:12px 12px 0 0;background:var(--stab-acc)}'+
   '.stab[aria-selected="true"] em{background:var(--stab-num-on);color:var(--stab-num-ink)}'+
   '.stab-box{background:var(--stab-on);border:1px solid var(--stab-line);border-radius:0 12px 12px 12px;padding:20px;position:relative;z-index:1}'+
   '.stab-head{display:flex;align-items:center;gap:10px}'+
   '.stab-head b{font-size:18px;color:var(--stab-ink-on)}.stab-head span{font-size:20px}'+
   '.stab-head+p{margin:2px 0 16px;font-size:13px;color:var(--stab-sub)}'+
   '.stab-pane[hidden]{display:none}'+
   '.stab-pane>.settings-card-grid{margin-top:0}'+
   '.stab-pane .settings-cloud-grid{margin-top:16px}'+
   '.stab-wrap,.stab-bar,.stab-box{min-width:0;max-width:100%}'+
   '.stab-s{display:none}'+
   '@media (max-width:700px){'+
    '.stab{gap:6px;padding:9px 11px 8px;font-size:13px}'+
    '.stab-n{display:none}.stab-s{display:inline}'+
    '.stab em{font-size:10px;padding:0 6px}'+
    '.stab-box{padding:14px 12px;border-radius:0 0 12px 12px}'+
    '.stab-head b{font-size:16px}.stab-head+p{margin-bottom:12px}'+
   '}';
  document.head.appendChild(s);
 }

 var bar=null,box=null;
 function count(){
  if(!bar)return;
  var first='',cur=lsGet(),curOk=false;
  TABS.forEach(function(t){
   var b=bar.querySelector('[data-stab="'+t.id+'"]'),p=box.querySelector('[data-stab-pane="'+t.id+'"]');
   var n=[].filter.call(p.querySelectorAll('.setting-action-card'),shown).length;
   var extra=[].some.call(p.querySelectorAll('.settings-cloud-grid'),shown);
   b.querySelector('em').textContent=n;
   var permOk=!t.perm||(typeof canPermission!=='function')||canPermission(t.perm);
   b.hidden=!permOk||(!n&&!extra);
   if(!b.hidden){if(!first)first=t.id;if(t.id===cur)curOk=true}
  });
  var sel=bar.querySelector('.stab[aria-selected="true"]');
  if(!sel||sel.hidden)pick(curOk?cur:first,false);
 }
 function pick(id,remember){
  if(!bar||!id)return;
  bar.querySelectorAll('.stab').forEach(function(b){
   var on=b.getAttribute('data-stab')===id;
   b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;
   if(on){var l=b.offsetLeft-bar.offsetLeft,r=l+b.offsetWidth;if(l<bar.scrollLeft)bar.scrollLeft=l-8;else if(r>bar.scrollLeft+bar.clientWidth)bar.scrollLeft=r-bar.clientWidth+8}
  });
  box.querySelectorAll('.stab-pane').forEach(function(p){p.hidden=p.getAttribute('data-stab-pane')!==id});
  if(remember!==false)lsSet(id);
 }

 function build(){
  var page=document.getElementById('page-settings');
  if(!page||page.querySelector('.stab-wrap'))return;
  css();
  var wrap=document.createElement('div');wrap.className='stab-wrap';
  bar=document.createElement('div');bar.className='stab-bar';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','หมวดการตั้งค่า');
  box=document.createElement('div');box.className='stab-box';
  TABS.forEach(function(t){
   var b=document.createElement('button');
   b.type='button';b.className='stab';b.id='stab-'+t.id;b.setAttribute('role','tab');b.setAttribute('data-stab',t.id);
   b.setAttribute('aria-controls','stab-pane-'+t.id);b.setAttribute('aria-selected','false');
   b.innerHTML='<span class="stab-i" aria-hidden="true">'+t.icon+'</span><span class="stab-n">'+t.name+'</span><span class="stab-s">'+t.short+'</span><em>0</em>';b.title=t.name;
   bar.appendChild(b);
   var p=document.createElement('div');
   p.className='stab-pane';p.id='stab-pane-'+t.id;p.hidden=true;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby','stab-'+t.id);p.setAttribute('data-stab-pane',t.id);
   p.innerHTML='<div class="stab-head"><span aria-hidden="true">'+t.icon+'</span><b>'+t.name+'</b></div><p>'+t.desc+'</p><div class="settings-card-grid"></div>';
   box.appendChild(p);
  });
  wrap.appendChild(bar);wrap.appendChild(box);
  var intro=page.querySelector('.plain-module-intro');
  if(intro&&intro.parentNode===page)page.insertBefore(wrap,intro.nextSibling);else page.insertBefore(wrap,page.firstChild);

  /* move the cards, section by section */
  var grids=[].filter.call(page.querySelectorAll('.settings-card-grid'),function(g){return !box.contains(g)});
  grids.forEach(function(g,i){
   var fallback=g.hasAttribute('data-perm')?'test':(SECTION_TAB[i]||'data');
   [].slice.call(g.querySelectorAll('.setting-action-card')).forEach(function(card){
    var id=tabFor(fnOf(card))||fallback;
    box.querySelector('[data-stab-pane="'+id+'"] .settings-card-grid').appendChild(card);
   });
   var head=g.previousElementSibling;
   if(head&&head.classList.contains('settings-section-head'))head.remove();
   g.remove();
  });
  /* Cloud database, settings summary and system status belong with the data tab */
  var cloud=page.querySelector('.settings-cloud-grid');
  if(cloud&&!box.contains(cloud))box.querySelector('[data-stab-pane="data"]').appendChild(cloud);

  bar.addEventListener('click',function(e){var b=e.target.closest('.stab');if(b)pick(b.getAttribute('data-stab'))});
  bar.addEventListener('keydown',function(e){
   if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'&&e.key!=='Home'&&e.key!=='End')return;
   var tabs=[].filter.call(bar.querySelectorAll('.stab'),function(b){return !b.hidden});
   var i=tabs.indexOf(document.activeElement);if(i<0)return;
   e.preventDefault();
   i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
   tabs[i].focus();pick(tabs[i].getAttribute('data-stab'));
  });
  count();
  /* permissions (js/12) and late cards (js/118) change what is visible */
  try{new MutationObserver(function(){clearTimeout(build.t);build.t=setTimeout(count,50)}).observe(box,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']})}catch(e){}
  if(typeof window.applyRoleVisibility==='function'&&!window.applyRoleVisibility.__stabs){
   var base=window.applyRoleVisibility;
   window.applyRoleVisibility=function(){var r=base.apply(this,arguments);count();return r};
   window.applyRoleVisibility.__stabs=true;
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
