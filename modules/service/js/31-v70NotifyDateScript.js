/* Beta — the notification date sits beside the title, in bold.

   Reported with a screenshot: on a phone the date was the last line of the card, under
   the message, in 10 px grey — the least readable thing on a row whose whole point is
   "when did this happen".

   The cause is the row's own grid. js/03 renders

       <div class="notification-row"><span class="stack-icon">..</span>
            <div><h4>title</h4><p>message</p></div>
            <small>date</small></div>

   and css/01 lays it out as 42px | 1fr | auto on the desktop, but collapses to 42px | 1fr
   at <=640px with `.notification-row>small{grid-column:2}` — so the date drops onto its
   own row below the message.

   There is nowhere in that markup for the date to go except a new line beside the title,
   so the row is rebuilt after js/03 has rendered it: the <small> is moved into a flex
   header next to the <h4>. Nothing else about the row changes — the click target, the
   unread state, the icon and the message are the ones js/03 wrote, and if this file is
   removed the original layout comes back.

   renderNotifications() is a top-level declaration in js/03, so window.renderNotifications
   is that same binding and wrapping it catches every caller, renderAll() included. */
(function(){
 'use strict';

 function decorate(){
  var rows=document.querySelectorAll('#notificationList .notification-row');
  for(var i=0;i<rows.length;i++){
   var row=rows[i];
   if(row.querySelector('.noti-head'))continue;          /* already rebuilt */
   var body=row.querySelector('div');
   var h4=body&&body.querySelector('h4');
   var date=row.querySelector(':scope>small');
   if(!h4||!date)continue;
   var head=document.createElement('div');
   head.className='noti-head';
   h4.parentNode.insertBefore(head,h4);
   head.appendChild(h4);
   head.appendChild(date);                                /* moved, not copied */
   date.classList.add('noti-when');
  }
 }
 window.imodeDecorateNotifications=decorate;

 var base=window.renderNotifications;
 if(typeof base==='function'){
  window.renderNotifications=function(){
   var r=base.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70NotifyDateStyle';
 st.textContent=''
 /* The date now lives inside column 2, so the row never needs a third column and the
    <=640px rule that pushed it onto its own line has nothing left to move. */
 +'.notification-row .noti-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px}'
 +'.notification-row .noti-head h4{flex:1;min-width:0}'
 +'.notification-row .noti-when{flex:none;font-size:11.5px;font-weight:800;color:#0c225e;'
 +'background:#eef4ff;border:1px solid #dbe7f9;border-radius:999px;padding:2px 9px;white-space:nowrap}'
 +'.notification-row.unread .noti-when{background:#fff;border-color:#bfd0ff;color:#0b3f9e}'
 +'@media (max-width:640px){.notification-row .noti-when{font-size:11px;padding:2px 8px}}';
 document.head.appendChild(st);

 function install(){try{decorate()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
