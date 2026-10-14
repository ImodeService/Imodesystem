/* Beta 1.0 — เตือนลูกค้า stops claiming it sent something it could not send.

   Found while crawling every button in the application for the reference document, and
   worth fixing because it is the one button measured that tells the operator a thing
   happened when it did not.

   sendCustomerReminder() in js/03 does three things: it writes a local notification, and
   IF settings.lineConfig.backendEndpoint is set AND the customer has a lineUserId it POSTs
   to that endpoint. Then it toasts:

       cu?.lineUserId ? 'ส่งคำขอแจ้งเตือน LINE แล้ว'
                      : 'บันทึกการแจ้งเตือนแล้ว • ลูกค้ายังไม่เชื่อม LINE'

   The second branch is honest. The FIRST IS NOT when there is no backendEndpoint — and
   there is none configured today — because the POST never happened. A coordinator pressing
   the button on a customer who has linked LINE is told the reminder went out, and nothing
   went anywhere.

   THIS FILE DOES NOT HIDE THE BUTTON and does not change what is written. The feature is
   real and starts working the day ตั้งค่าระบบ → LINE OA gets an endpoint; what was wrong was
   only the sentence at the end. The function is reimplemented rather than wrapped for the
   same reason js/24 reimplements cloudUpsert: the message is produced inside the original,
   so a wrapper can correct it only by toasting a second, contradictory time.

   js/03 is not edited. Delete this file and the old message comes back. */
(function(){
 'use strict';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function cfg(){try{return settings.lineConfig||{}}catch(e){return {}}}

 var base=window.sendCustomerReminder;
 if(typeof base!=='function')return;

 window.sendCustomerReminder=async function(cid){
  var c=null,cu=null;
  try{c=(cases||[]).filter(function(x){return x.id===cid})[0]||null}catch(e){}
  if(!c)return;
  try{cu=(typeof customerById==='function')?customerById(c.customerId):null}catch(e){}

  var endpoint=String(cfg().backendEndpoint||'').trim();
  var linked=!!(cu&&cu.lineUserId);

  /* the record, exactly as before */
  try{
   notifications.unshift({id:uid(),icon:'🔔',title:tl('แจ้งเตือนนัดหมายลูกค้า','Customer appointment reminder'),
    message:(c.ticket||c.id)+' · '+(c.customer||'-')+' · '
      +((c.appointment&&typeof fmt==='function')?fmt(c.appointment):(c.appointment||tl('ยังไม่นัดหมาย','not scheduled'))),
    createdAt:new Date().toISOString(),read:false,caseId:c.id});
   if(typeof saveLocal==='function')saveLocal();
  }catch(e){}

  var sent=false;
  if(endpoint&&linked){
   try{
    await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'appointment_reminder',lineUserId:cu.lineUserId,case:c})});
    sent=true;
   }catch(e){sent=false}
  }
  try{if(typeof renderNotifications==='function')renderNotifications()}catch(e){}

  /* Say exactly which of the three things happened. */
  if(sent)toast(tl('ส่งคำขอแจ้งเตือน LINE ให้ลูกค้าแล้ว','Reminder sent to the customer on LINE'));
  else if(!endpoint)toast(tl('บันทึกเตือนไว้ในระบบแล้ว — ยังส่งหาลูกค้าไม่ได้ เพราะยังไม่ได้ตั้งค่าช่องทางส่ง LINE',
                            'Saved as an internal reminder — nothing was sent, the LINE send channel is not configured'));
  else if(!linked)toast(tl('บันทึกเตือนไว้ในระบบแล้ว • ลูกค้ายังไม่เชื่อม LINE',
                          'Saved as an internal reminder • the customer has not linked LINE'));
  else toast(tl('บันทึกเตือนไว้แล้ว แต่ส่ง LINE ไม่สำเร็จ กรุณาลองใหม่',
                'Saved, but the LINE send failed — please try again'));
 };

 /* The label promises a customer notification. While nothing can actually be sent it says
    what the press really does. The button lives in js/03's field-service card, which is
    re-rendered constantly, so this runs after each render rather than once. */
 function relabel(){
  if(String(cfg().backendEndpoint||'').trim())return;      /* configured — leave it alone */
  document.querySelectorAll('[onclick^="sendCustomerReminder"]').forEach(function(b){
   if(b.dataset.reminderLabel==='1')return;
   b.dataset.reminderLabel='1';
   b.textContent='🔔 '+tl('บันทึกเตือนนัดหมาย','Log a reminder');
   b.title=tl('บันทึกไว้ในระบบ ยังไม่ได้ส่งหาลูกค้า — ตั้งค่าช่องทางส่งได้ที่ ตั้งค่าระบบ → LINE OA',
              'Recorded in the system; nothing is sent to the customer until the LINE channel is configured');
  });
 }
 ['renderFieldService','renderAll'].forEach(function(name){
  var b=window[name];
  if(typeof b!=='function')return;
  window[name]=function(){var r=b.apply(this,arguments);try{relabel()}catch(e){}return r};
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){try{relabel()}catch(e){}},{once:true});
 else{try{relabel()}catch(e){}}
})();
