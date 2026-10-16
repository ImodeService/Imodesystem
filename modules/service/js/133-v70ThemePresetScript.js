/* 2026-10-14: theme PRESETS in Settings → ธีมหน้าจอ.
   "ข้างบนเอาเป็นพรีเซ็ต กดแล้วจะปรับตามมาตรฐาน และมี custom ให้คนที่อยากเลือกเอง"

   The top of the dialog is now a row of presets; one tap sets the screen theme (js/127, shared
   with every module), the icon style (js/130), the sidebar colours and the sidebar movement
   (js/131) together. "กำหนดเอง" opens the four separate choices those files draw, unchanged,
   for anyone who wants to mix their own. Which card is ticked is worked out from the settings
   themselves: if they match a preset, that preset; otherwise กำหนดเอง.
   Staff screens only; the customer theme dialog is left as it was. */
(function(){
 'use strict';
 var CUSTOM_KEY='imode.servicePresetCustom';
 var PRESETS=[
  {id:'light',name:'เรียบ สว่าง',desc:'มาตรฐาน พื้นสว่าง แถบเมนูกรมท่า',set:{theme:'flat-light',icons:'emoji',side:'navy',motion:'normal'},
   pv:{bg:'#f3f3f3',side:'#0c225e',card:'#ffffff',line:'#e1e1e1',bar:'#c25e00'}},
  {id:'dark',name:'เรียบ มืด',desc:'พื้นสีเข้ม ถนอมสายตาตอนกลางคืน',set:{theme:'flat-dark',icons:'emoji',side:'navy',motion:'normal'},
   pv:{bg:'#1b1b1b',side:'#111111',card:'#262626',line:'#3a3a3a',bar:'#e07a1f'}},
  {id:'auto',name:'ตามระบบ',desc:'สว่างหรือมืดตามที่ตั้งไว้ในเครื่อง',set:{theme:'auto',icons:'emoji',side:'navy',motion:'normal'},
   pv:{bg:'linear-gradient(90deg,#f3f3f3 50%,#1b1b1b 50%)',side:'#0c225e',card:'transparent',line:'#8a8a8a',bar:'#c25e00'}},
  {id:'glass',name:'กระจก (Glass)',desc:'หน้าตาเดิมของระบบ มีไล่สีและเงา',set:{theme:'classic',icons:'emoji',side:'navy',motion:'normal'},
   pv:{bg:'#f6f8fc',side:'#0e3ba6',card:'#ffffff',line:'#e3e8f2',bar:'#ff5b14'}},
  {id:'gold',name:'ราตรีสีทอง',desc:'พื้นมืด เมนูสีทอง ไอคอนเส้น เมนูเลื่อนแบบสไลด์',set:{theme:'flat-dark',icons:'line',side:'game',motion:'rov'},
   pv:{bg:'#1b1b1b',side:'linear-gradient(180deg,#080e2e,#1a2a8a)',card:'#262626',line:'#3a3a3a',bar:'#ffc845'}}
 ];
 var root=document.documentElement;
 function now(){
  var T=window.imodeUiTheme,I=window.imodeIconStyle,S=window.imodeSidebarStyle;
  return {theme:T?T.current():'',icons:I?I.get():'',side:S?S.get():'',motion:S&&S.motion?S.motion():''};
 }
 function same(a,b){return a.theme===b.theme&&a.icons===b.icons&&a.side===b.side&&a.motion===b.motion}
 function customOn(){try{return localStorage.getItem(CUSTOM_KEY)==='1'}catch(e){return false}}
 function setCustom(on){try{localStorage.setItem(CUSTOM_KEY,on?'1':'0')}catch(e){}}
 /* the ticked card */
 function selected(){
  if(customOn())return 'custom';
  var n=now();
  for(var i=0;i<PRESETS.length;i++)if(same(n,PRESETS[i].set))return PRESETS[i].id;
  return 'custom';
 }
 function applyPreset(p){
  var s=p.set;
  if(window.imodeUiTheme)window.imodeUiTheme.set(s.theme);
  if(window.imodeIconStyle)window.imodeIconStyle.set(s.icons);
  if(window.imodeSidebarStyle){window.imodeSidebarStyle.set(s.side);if(window.imodeSidebarStyle.setMotion)window.imodeSidebarStyle.setMotion(s.motion)}
  setCustom(false);
 }
 function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

 var css=''
  +'.ui-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'
  +'.ui-preset{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px;border:1px solid var(--fx-line,#d0d7e6);border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}'
  +'.ui-preset:hover{border-color:#8fa6cc}'
  +'.ui-preset[aria-checked="true"]{border-color:#0b5cd6;box-shadow:inset 0 0 0 1px #0b5cd6}'
  +'.ui-preset .pp{display:flex;width:100%;height:58px;border:1px solid;border-radius:6px;overflow:hidden}'
  +'.ui-preset .pp i{width:24%;flex:none}'
  +'.ui-preset .pp span{flex:1;display:flex;flex-direction:column;gap:6px;padding:8px}'
  +'.ui-preset .pp em{display:block;height:7px;border-radius:3px}'
  +'.ui-preset .pp.custom{align-items:center;justify-content:center;gap:8px;border-style:dashed;border-color:#9aa6bd;background:transparent;color:#4a5d80}'
  +'.ui-preset .pn{display:flex;align-items:center;gap:6px;font-weight:600}'
  +'.ui-preset .pk{display:none;color:#0b5cd6}'
  +'.ui-preset[aria-checked="true"] .pk{display:inline}'
  +'.ui-preset small{font-size:13px;line-height:1.45;opacity:.8}'
  +'.ui-custom-panel{margin-top:16px;padding:4px 16px 16px;border:1px solid var(--fx-line,#d0d7e6);border-radius:10px}'
  +'.ui-custom-panel[hidden]{display:none!important}'
  +'.ui-custom-panel>h4:first-child{margin-top:12px}'
  +'html[data-ui="flat-dark"] .ui-preset .pp.custom{color:#c8c8c8;border-color:#5a5a5a}'
  +'@media (max-width:640px){.ui-presets{grid-template-columns:repeat(2,minmax(0,1fr))}}';
 var st=document.createElement('style');st.id='v70ThemePresetStyle';st.textContent=css;
 (document.head||root).appendChild(st);

 function preview(p){
  var v=p.pv;
  return '<span class="pp" style="background:'+v.bg+';border-color:'+v.line+'" aria-hidden="true"><i style="background:'+v.side+'"></i>'
   +'<span><em style="width:55%;background:'+v.bar+'"></em><em style="height:24px;background:'+v.card+';border:1px solid '+v.line+'"></em></span></span>';
 }
 function build(){
  var body=document.getElementById('modalBody');
  if(!body||body.querySelector('.ui-presets'))return;
  var themeBox=body.querySelector('.ui-theme-options');
  if(!themeBox||root.getAttribute('data-view')==='customer')return;
  /* everything js/127, 130 and 131 drew goes into the กำหนดเอง panel, untouched */
  var panel=document.createElement('div');
  panel.className='ui-custom-panel';
  var head=document.createElement('h4');head.textContent='ธีมหน้าจอ';
  panel.appendChild(head);
  while(body.firstChild)panel.appendChild(body.firstChild);
  var row=document.createElement('div');
  row.className='ui-presets';row.setAttribute('role','radiogroup');row.setAttribute('aria-label','พรีเซ็ตหน้าจอ');
  row.innerHTML=PRESETS.map(function(p){
   return '<button type="button" class="ui-preset" role="radio" data-preset="'+p.id+'" aria-checked="false">'+preview(p)
    +'<span class="pn">'+esc(p.name)+'<span class="pk" aria-hidden="true">✓</span></span><small>'+esc(p.desc)+'</small></button>';
  }).join('')
   +'<button type="button" class="ui-preset" role="radio" data-preset="custom" aria-checked="false">'
   +'<span class="pp custom" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg></span>'
   +'<span class="pn">กำหนดเอง<span class="pk" aria-hidden="true">✓</span></span><small>เลือกธีม ไอคอน สีและการเคลื่อนไหวของแถบเมนูเอง</small></button>';
  var note=document.createElement('p');
  note.className='muted';note.style.cssText='margin:12px 0 0;font-size:13px';
  note.textContent='กดพรีเซ็ตเพื่อตั้งค่ามาตรฐานทั้งหมดในครั้งเดียว ธีมสว่าง/มืดใช้ร่วมกับทุกโมดูล';
  body.appendChild(row);body.appendChild(note);body.appendChild(panel);

  function refresh(){
   var sel=selected(),n=now();
   row.querySelectorAll('.ui-preset').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-preset')===sel))});
   panel.hidden=sel!=='custom';
   /* keep the custom choices showing the real settings after a preset changed them */
   panel.querySelectorAll('.ui-theme-option[data-theme]').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-theme')===n.theme))});
   panel.querySelectorAll('.ui-icon-opt[data-icons]').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-icons')===n.icons))});
   panel.querySelectorAll('.ui-side-opt[data-sidebar-style]').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-sidebar-style')===n.side))});
   panel.querySelectorAll('.ui-side-opt[data-sidebar-motion]').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-sidebar-motion')===n.motion))});
  }
  row.addEventListener('click',function(e){
   var b=e.target.closest('.ui-preset');if(!b)return;
   var id=b.getAttribute('data-preset');
   if(id==='custom'){setCustom(true);refresh();return}
   var p=PRESETS.filter(function(x){return x.id===id})[0];
   applyPreset(p);refresh();
   if(typeof toast==='function')toast('ตั้งค่าเป็น '+p.name);
  });
  /* a change inside กำหนดเอง keeps the panel open */
  panel.addEventListener('click',function(e){
   if(e.target.closest('[role="radio"]')){setCustom(true);setTimeout(refresh,0)}
  });
  refresh();
 }
 function hook(){
  var base=window.openUiThemeSettingModal;
  if(typeof base!=='function'||base.__presets)return;
  var wrapped=function(){
   var r=base.apply(this,arguments);
   /* after js/130 (30 ms) and js/131 (60 ms) have added their parts */
   setTimeout(build,120);
   return r;
  };
  wrapped.__presets=true;
  window.openUiThemeSettingModal=wrapped;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
