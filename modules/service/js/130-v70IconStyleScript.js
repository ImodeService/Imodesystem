/* 2026-10-14: Settings -> ธีมหน้าจอ also picks the ICON STYLE, saved per device
   (localStorage imode.serviceIcons): 'emoji' (default, the original look) or 'line' (drawn
   icons, one stroke weight). Applies to the sidebar, the bottom bar and the Home tiles.
   The emoji is both the lookup key and the fallback, so any module that registers itself later
   with an emoji just works. The emoji is kept in data-emoji so switching back is exact.
   Staff screens only; the customer pages are never touched. */
(function(){
 'use strict';
 var KEY='imode.serviceIcons';
 var P={
  '▦':'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  '📋':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  '฿':'<circle cx="12" cy="12" r="9"/><path d="M10 7v10M10 7h3.2a2.2 2.2 0 0 1 0 4.4H10m0 0h3.6a2.3 2.3 0 0 1 0 4.6H10M11.5 5.5V7m0 10v1.5"/>',
  '👥':'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2A5 5 0 0 1 21 19"/>',
  '⚙':'<circle cx="12" cy="12" r="3.2"/><path d="M10.3 3h3.4l.5 2.4 1.7.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.3 2.1-2.4 2.4-2.1-1.3-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.7L3 13.7v-3.4l2.4-.5.7-1.7-1.3-2.1 2.4-2.4 2.1 1.3 1.7-.7z"/>',
  '✅':'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  '📅':'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  '🧰':'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18M11 13v2h2v-2"/>',
  '👨‍🔧':'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 9.5-4.8"/><path d="M19.5 13.2a2.6 2.6 0 0 0-3.4 3.4L13 19.7l1.3 1.3 3.1-3.1a2.6 2.6 0 0 0 3.4-3.4l-1.5 1.5-1.2-.3-.3-1.2z"/>',
  '🛡':'<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15 10.5"/>',
  '📁':'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  '🔔':'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  '📊':'<path d="M4 20V4M4 20h16"/><rect x="8" y="12" width="3" height="5" rx=".6"/><rect x="13" y="8" width="3" height="9" rx=".6"/><rect x="18" y="14" width="2" height="3" rx=".5"/>',
  '🛠':'<path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-2.1-.6-.6-2.1z"/>',
  '📍':'<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  '📦':'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  '💵':'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  '🧾':'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  '📌':'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  '🗑':'<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  '📑':'<path d="M8 3h8l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M16 3v4h4M10 12h6M10 15h4"/>',
  '📗':'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 12.5l2.2 2.2L15 10.5"/>',
  '📥':'<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 2h6l1-2h5M12 4v6m-2.5-2.5L12 10l2.5-2.5"/>',
  '🗂':'<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
  '⌂':'<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>'
 };
 function norm(s){return String(s||'').replace(/️/g,'').trim()}
 function svg(k,size){
  var d=P[k];if(!d)return '';
  return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true" class="imode-ico">'+d+'</svg>';
 }
 function mode(){var v='';try{v=localStorage.getItem(KEY)||''}catch(e){}return v==='line'?'line':'emoji'}
 function isCustomer(){return document.documentElement.getAttribute('data-view')==='customer'}

 var SEL='.sidebar .nav-item > span:first-child, .bottom-nav button > span:first-child, #page-home .rhome-modcard-icon';
 var busy=false,queued=false;
 function sweep(){
  queued=false;busy=true;
  try{
   var line=mode()==='line'&&!isCustomer();
   document.querySelectorAll(SEL).forEach(function(el){
    if(line){
     if(el.querySelector('svg'))return;
     var k=norm(el.dataset.emoji||el.textContent),s=svg(k,el.classList.contains('rhome-modcard-icon')?40:20);
     if(s){el.dataset.emoji=k;el.innerHTML=s;el.classList.add('has-ico')}
    }else if(el.dataset.emoji){
     el.textContent=el.dataset.emoji;delete el.dataset.emoji;el.classList.remove('has-ico');
    }
   });
  }catch(e){}
  busy=false;
 }
 function schedule(){if(busy||queued)return;queued=true;(window.requestAnimationFrame||setTimeout)(sweep)}
 var st=document.createElement('style');
 st.textContent=':is(.nav-item,.bottom-nav button)>span.has-ico{display:inline-flex!important;align-items:center;justify-content:center;line-height:1}'
  +':is(.nav-item,.bottom-nav button)>span.has-ico .imode-ico{display:block;width:20px;height:20px}'
  +'.bottom-nav button>span.has-ico .imode-ico{width:22px;height:22px}'
  +'#page-home .rhome-modcard-icon .imode-ico{display:block;width:38px;height:38px}'
  +'.ui-icon-opts{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 0}'
  +'.ui-icon-opt{flex:1 1 180px;display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--fx-line,#d0d7e6);border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}'
  +'.ui-icon-opt[aria-checked="true"]{border-color:#0b5cd6;box-shadow:inset 0 0 0 1px #0b5cd6}'
  +'.ui-icon-opt .pv{display:flex;gap:8px;font-size:22px;line-height:1;color:#0b5cd6}'
  +'.ui-icon-opt .pv svg{width:22px;height:22px}';
 document.head.appendChild(st);

 function set(m){
  try{localStorage.setItem(KEY,m)}catch(e){}
  sweep();
 }
 window.imodeIconStyle={get:mode,set:set};

 /* Add the choice to the existing "ธีมหน้าจอ" dialog (js/127). */
 var base=window.openUiThemeSettingModal;
 if(typeof base==='function'){
  window.openUiThemeSettingModal=function(){
   var r=base.apply(this,arguments);
   if(isCustomer())return r;
   setTimeout(function(){
    var body=document.getElementById('modalBody');
    if(!body||body.querySelector('.ui-icon-opts'))return;
    var cur=mode();
    var wrap=document.createElement('div');
    wrap.innerHTML='<h4 style="margin:18px 0 4px">สไตล์ไอคอน</h4>'
     +'<div class="ui-icon-opts" role="radiogroup" aria-label="สไตล์ไอคอน">'
     +'<button type="button" class="ui-icon-opt" role="radio" data-icons="emoji" aria-checked="'+(cur==='emoji')+'"><span class="pv"><span>📋</span><span>👥</span><span>📅</span></span><span><b>Icon emoji</b><br><small>ไอคอนสีสันแบบอีโมจิ (ค่าเริ่มต้น)</small></span></button>'
     +'<button type="button" class="ui-icon-opt" role="radio" data-icons="line" aria-checked="'+(cur==='line')+'"><span class="pv">'+svg('📋',22)+svg('👥',22)+svg('📅',22)+'</span><span><b>แบบเส้น</b><br><small>ไอคอนเส้นสีเดียว เรียบ</small></span></button></div>';
    body.appendChild(wrap);
    wrap.addEventListener('click',function(e){
     var b=e.target.closest('.ui-icon-opt');if(!b)return;
     set(b.getAttribute('data-icons'));
     wrap.querySelectorAll('.ui-icon-opt').forEach(function(x){x.setAttribute('aria-checked',String(x===b))});
    });
   },30);
   return r;
  };
 }

 function start(){
  sweep();
  try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true})}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.addEventListener('storage',function(e){if(e.key===KEY)sweep()});
})();
