/* Beta 1.0 — ศูนย์แจ้งเตือน gets the same category filter and page size as ถังขยะ.

   Asked for: "เพิ่มตัวกรองแยกประเภท และปุ่มเลือกได้ว่าจะโชว์กี่อันๆ ในหน้าศูนย์แจ้งเตือน แบบในหน้าถังขยะก็ได้".

   renderNotifications() in js/03 is one line: it builds the list, writes the two badges and
   dumps every row into #notificationList. With a few dozen notices that is a wall of text
   with no way to say "show me only the appointments".

   NOTHING ABOUT THE NOTICES THEMSELVES CHANGES. The categories are read off the key each
   notice already carries — buildNotifications() prefixes them auto_visit_, auto_urgent_,
   auto_part_, auto_submit_, auto_warranty_ (js/03), auto_assigned_ and auto_intake_ (js/16),
   and a stored notice is n_ — so this file invents no field and writes nothing. The badge
   counts still come from the base function and still count everything, not the filtered view.

   The base function is wrapped rather than replaced, so the badges, the read/unread state
   and openNotificationDetail() all keep working exactly as they did. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function fmtAt(v){try{return fmt(v)}catch(e){return String(v||'')}}

 /* key prefix → what a person would call it */
 var CATS=[
  {id:'intake',   pre:'auto_intake_',   icon:'🆕', th:'เคสใหม่รอมอบหมาย', en:'New cases'},
  {id:'assigned', pre:'auto_assigned_', icon:'📌', th:'งานที่มอบหมาย',    en:'Assignments'},
  {id:'visit',    pre:'auto_visit_',    icon:'📅', th:'ใกล้ถึงเวลานัด',    en:'Appointments'},
  {id:'urgent',   pre:'auto_urgent_',   icon:'⚠️', th:'เคสด่วนมาก',       en:'Urgent'},
  {id:'part',     pre:'auto_part_',     icon:'📦', th:'รออะไหล่',         en:'Waiting parts'},
  {id:'submit',   pre:'auto_submit_',   icon:'📝', th:'รอส่งงาน',         en:'Waiting report'},
  {id:'warranty', pre:'auto_warranty_', icon:'🛡️', th:'ประกันใกล้หมด',    en:'Warranty'},
  {id:'saved',    pre:'n_',             icon:'🔔', th:'บันทึกไว้ในระบบ',   en:'Recorded'}
 ];
 function catOf(n){
  var k=String(n&&n.key||'');
  for(var i=0;i<CATS.length;i++)if(k.indexOf(CATS[i].pre)===0)return CATS[i].id;
  return 'other';
 }

 var state={cat:'all',limit:25,unreadOnly:false};   /* limit 0 = ทั้งหมด */
 window.imodeNotifyCat=function(c){state.cat=c||'all';paint()};
 window.imodeNotifyLimit=function(v){state.limit=Number(v)||0;paint()};
 window.imodeNotifyUnread=function(){state.unreadOnly=!state.unreadOnly;paint()};

 function all(){
  try{return (typeof window.buildNotifications==='function'?window.buildNotifications():[])||[]}
  catch(e){return []}
 }

 function rowHTML(n){
  return '<div class="notification-row '+(n.read?'':'unread')+'" style="cursor:pointer"'
   +' onclick="openNotificationDetail('+imodeJsArg(n.key)+')">'
   +'<span class="stack-icon">'+(n.icon||'🔔')+'</span>'
   +'<div><h4>'+esc2(n.title)+'</h4><p>'+esc2(n.message)+'</p></div>'
   +'<small>'+esc2(fmtAt(n.createdAt))+'</small></div>';
 }

 function toolbarHTML(list){
  var counts={};
  list.forEach(function(n){var c=catOf(n);counts[c]=(counts[c]||0)+1});
  function card(id,icon,label,n){
   return '<button type="button" class="module-kpi-card" aria-pressed="'+(state.cat===id)+'"'
    +' onclick="imodeNotifyCat('+imodeJsArg(id)+')">'
    +'<i class="nk-ico" aria-hidden="true">'+icon+'</i>'
    +'<small class="nk-name">'+esc2(label)+'</small>'
    +'<b>'+n+'</b><span>'+esc2(tl('รายการ','items'))+'</span></button>';
  }
  var cards=card('all','🔔',tl('ทั้งหมด','All'),list.length);
  CATS.forEach(function(c){
   if(!counts[c.id]&&state.cat!==c.id)return;      /* an empty kind is noise, not a filter */
   cards+=card(c.id,c.icon,tl(c.th,c.en),counts[c.id]||0);
  });
  if(counts.other||state.cat==='other')cards+=card('other','🗂',tl('อื่น ๆ','Other'),counts.other||0);

  var unread=list.filter(function(n){return !n.read}).length;
  return '<div class="ntf-kpi case-kpi-grid">'+cards+'</div>'
   +'<div class="ntf-ops">'
   +'<button type="button" class="soft-btn'+(state.unreadOnly?' is-on':'')+'" onclick="imodeNotifyUnread()">'
   +esc2(state.unreadOnly?tl('แสดงทั้งหมด','Show all'):tl('เฉพาะที่ยังไม่อ่าน','Unread only'))
   +' ('+unread+')</button>'
   +'<select class="ntf-limit" onchange="imodeNotifyLimit(this.value)" aria-label="'
   +esc2(tl('จำนวนที่แสดง','How many to show'))+'">'
   +[['10','10'],['25','25'],['50','50'],['100','100'],['0',tl('ทั้งหมด','All')]].map(function(o){
      return '<option value="'+o[0]+'"'+(String(state.limit)===o[0]?' selected':'')+'>'
       +esc2(tl('แสดง ','Show ')+o[1])+'</option>';
     }).join('')+'</select>'
   +'</div>';
 }

 /* Paints the toolbar above #notificationList and the filtered rows inside it. The list
    element itself is never replaced — js/03 and js/31 both address it by id. */
 function paint(){
  var host=document.getElementById('notificationList');
  if(!host)return;
  var list=all();
  var bar=document.getElementById('imodeNotifyBar');
  if(!bar){
   bar=document.createElement('div');
   bar.id='imodeNotifyBar';
   host.parentNode.insertBefore(bar,host);
  }
  bar.innerHTML=toolbarHTML(list);

  var shown=list.filter(function(n){
   if(state.unreadOnly&&n.read)return false;
   return state.cat==='all'||catOf(n)===state.cat;
  });
  var total=shown.length;
  if(state.limit)shown=shown.slice(0,state.limit);

  host.innerHTML=shown.length
   ? shown.map(rowHTML).join('')
     +(total>shown.length
       ?'<div class="ntf-more"><span>'+esc2(tl('แสดง ','Showing ')+shown.length+tl(' จาก ',' of ')+total)+'</span>'
        +'<button type="button" class="soft-btn" onclick="imodeNotifyLimit(0)">'
        +esc2(tl('แสดงทั้งหมด','Show all'))+'</button></div>'
       :'')
   : '<div class="empty">'+esc2(list.length
       ? tl('ไม่มีการแจ้งเตือนในหมวดนี้','Nothing in this category')
       : tl('ไม่มีการแจ้งเตือน','No notifications'))+'</div>';
 }
 window.imodeRenderNotifyFilters=paint;

 var base=window.renderNotifications;
 if(typeof base==='function'){
  window.renderNotifications=function(){
   var r=base.apply(this,arguments);     /* badges and read state stay the base function's job */
   try{paint()}catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70NotifyFilterStyle';
 st.textContent=''
 +'#imodeNotifyBar{display:block}'
 +'.ntf-kpi{display:grid;margin-bottom:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}'
 +'.ntf-kpi .module-kpi-card{padding:14px 12px 12px!important;gap:2px;text-align:center;'
 +'display:flex!important;flex-direction:column;align-items:center;justify-content:flex-start;min-height:118px}'
 +'.ntf-kpi .nk-ico{font-style:normal;font-size:26px;line-height:1.15;display:block}'
 +'.ntf-kpi .nk-name{font-size:13.5px!important;font-weight:700;color:#22355c;line-height:1.35;'
 +'margin-top:3px;white-space:normal;overflow-wrap:anywhere}'
 +'.ntf-kpi .module-kpi-card b{font-size:23px!important;line-height:1.15;margin-top:4px}'
 +'.ntf-kpi .module-kpi-card span{font-size:11px!important;color:#6f81a3}'
 +'.ntf-kpi .module-kpi-card[aria-pressed="true"] .nk-name{color:#0b3f9e}'
 +'.ntf-ops{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px}'
 +'.ntf-ops .soft-btn.is-on{border-color:#0b63e5;color:#0b63e5;background:#f2f7ff}'
 +'.ntf-limit{border:1px solid #d9e6fa;border-radius:11px;padding:8px 11px;background:#fff;'
 +'color:#0c225e;font-size:12.5px;font-weight:700;font-family:inherit;min-height:36px}'
 +'.ntf-limit:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.ntf-more{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 2px 0;'
 +'font-size:12.5px;color:#5b6b88}';
 document.head.appendChild(st);
})();
