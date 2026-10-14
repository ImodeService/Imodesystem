/* 2026-10-12: screen themes. Settings → ธีมหน้าจอ picks one of three looks, saved per device.
   flat-light (default) and flat-dark are the light-weight Windows 10 style in css/24-flat-ui.css;
   classic is the original look. The inline script in <head> applies the saved choice before the
   first paint; this file only draws the picker and switches live.
   Customer pages (QR / serial entry and the machine portal) keep their own choice under
   imode.customerTheme, default classic, picked from a round button at the bottom right. */
(function(){
 var STAFF_KEY='imode.serviceTheme',CUST_KEY='imode.customerTheme';
 var DEFAULTS={};DEFAULTS[STAFF_KEY]='flat-light';DEFAULTS[CUST_KEY]='classic';
 function isCustomer(){try{return typeof window.imodeCustomerSurface==='function'&&!!window.imodeCustomerSurface()}catch(e){return false}}
 function keyNow(){return isCustomer()?CUST_KEY:STAFF_KEY}
 var THEMES=[
  {id:'flat-light',name:'เรียบ สว่าง',desc:'แบบ Windows 10 สีพื้นเรียบ ไม่มีเงาและเอฟเฟกต์ เบาเครื่องที่สุด',side:'#0c225e',bg:'#f3f3f3',card:'#ffffff',bar:'#c25e00',line:'#e1e1e1'},
  {id:'flat-dark',name:'เรียบ มืด',desc:'แบบเรียบพื้นสีเข้ม ถนอมสายตาตอนกลางคืน',side:'#111111',bg:'#1b1b1b',card:'#262626',bar:'#e07a1f',line:'#3a3a3a'},
  {id:'auto',name:'ตามระบบ',desc:'สว่างหรือมืดตามที่ตั้งไว้ในมือถือหรือคอมพิวเตอร์ เปลี่ยนเองอัตโนมัติ',side:'#0c225e',bg:'linear-gradient(90deg,#f3f3f3 50%,#1b1b1b 50%)',card:'transparent',bar:'#c25e00',line:'#8a8a8a'},
  {id:'classic',name:'กระจก (Glass)',desc:'หน้าตาเดิมของระบบ แบบกระจก มีไล่สีและเงา ใช้ทรัพยากรเครื่องมากกว่า',side:'#0e3ba6',bg:'#f6f8fc',card:'#ffffff',bar:'#ff5b14',line:'#e3e8f2'}
 ];
 function valid(id){return THEMES.some(function(t){return t.id===id})}
 function current(key){
  key=key||keyNow();
  var v='';try{v=localStorage.getItem(key)||''}catch(e){}
  return valid(v)?v:DEFAULTS[key];
 }
 var darkMq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 /* 'auto' follows the phone / PC setting and resolves to one of the flat themes. */
 function resolve(id){return id==='auto'?(darkMq&&darkMq.matches?'flat-dark':'flat-light'):id}
 function themeOf(id){return THEMES.filter(function(t){return t.id===id})[0]||THEMES[0]}
 function apply(id){
  if(!valid(id))id=DEFAULTS[keyNow()];
  id=resolve(id);
  var root=document.documentElement;
  root.setAttribute('data-view',isCustomer()?'customer':'staff');
  if(root.getAttribute('data-ui')!==id)root.setAttribute('data-ui',id);
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',id==='flat-dark'?'#111111':id==='classic'?'#0b2f8f':'#0c225e');
  var sum=document.getElementById('setThemeSummary');
  if(sum)sum.textContent=themeOf(current(STAFF_KEY)).name;
 }
 function save(id){
  try{localStorage.setItem(keyNow(),id)}catch(e){}
  apply(id);
 }
 function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

 function openUiThemeSettingModal(){
  var cur=current();
  var html='<div class="ui-theme-options" role="radiogroup" aria-label="ธีมหน้าจอ">'+THEMES.map(function(t){
   return '<button type="button" class="ui-theme-option" role="radio" data-theme="'+t.id+'" aria-checked="'+(t.id===cur)+'">'
    +'<span class="ui-theme-preview" style="background:'+t.bg+';border-color:'+t.line+'" aria-hidden="true"><i style="background:'+t.side+'"></i>'
    +'<span><em style="width:55%;background:'+t.bar+'"></em><em style="background:'+t.card+';border:1px solid '+t.line+';height:30px"></em></span></span>'
    +'<span style="display:flex;align-items:center;gap:6px"><b>'+esc(t.name)+'</b><span class="ui-theme-check">✓</span></span>'
    +'<small>'+esc(t.desc)+'</small></button>';
  }).join('')+'</div>'
   +'<p class="muted" style="margin:14px 0 0;font-size:13px">เปลี่ยนทันทีและจำไว้ในเครื่องนี้</p>';
  var cust=isCustomer();
  openModal(cust?'ธีมหน้าจอ / Theme':'ธีมหน้าจอ',cust?'เลือกรูปแบบหน้าจอที่ชอบ':'เลือกรูปแบบหน้าจอของระบบ Service',html);
  setTimeout(function(){
   var box=document.querySelector('#modalBody .ui-theme-options');
   if(!box)return;
   box.addEventListener('click',function(e){
    var b=e.target.closest('.ui-theme-option');if(!b)return;
    save(b.getAttribute('data-theme'));
    box.querySelectorAll('.ui-theme-option').forEach(function(x){x.setAttribute('aria-checked',String(x===b))});
    if(typeof toast==='function')toast('เปลี่ยนเป็นธีม '+themeOf(b.getAttribute('data-theme')).name);
   });
  },0);
 }
 window.openUiThemeSettingModal=openUiThemeSettingModal;
 window.imodeUiTheme={current:current,set:save,list:THEMES.map(function(t){return t.id})};

 /* Round button at the bottom right of the customer pages; CSS shows it only there. */
 function addFab(){
  if(document.getElementById('uiThemeFab'))return;
  var b=document.createElement('button');
  b.type='button';b.id='uiThemeFab';b.className='ui-theme-fab';
  b.setAttribute('aria-label','เปลี่ยนธีมหน้าจอ / Change theme');b.title='เปลี่ยนธีม / Theme';
  b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
  b.addEventListener('click',openUiThemeSettingModal);
  document.body.appendChild(b);
 }

 apply(current());
 if(document.body)addFab();else document.addEventListener('DOMContentLoaded',addFab);
 /* Moving between staff and customer pages swaps to that side's theme. */
 function sync(){
  var r=document.documentElement,want=resolve(current()),view=isCustomer()?'customer':'staff';
  if(r.getAttribute('data-ui')!==want||r.getAttribute('data-view')!==view)apply(current());
 }
 try{new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']})}catch(e){}
 window.addEventListener('hashchange',sync);
 if(darkMq){var onMq=function(){sync()};if(darkMq.addEventListener)darkMq.addEventListener('change',onMq);else if(darkMq.addListener)darkMq.addListener(onMq)}
 // another tab changed the theme
 window.addEventListener('storage',function(e){if(e.key===STAFF_KEY||e.key===CUST_KEY)sync()});
})();
