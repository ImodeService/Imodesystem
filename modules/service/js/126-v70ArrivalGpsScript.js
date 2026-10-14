/* Version 1.0 — 2026-09-28: "ตอนช่างกดปุ่มขั้นตอนถัดไปในส่วนของถึงหน้างาน อยากให้เก็บพิกัดเหมือนปุ่ม check in".

   fieldCheckIn() (js/03) asks for GPS and writes latitude / longitude onto the ถึงหน้างาน entry of
   fieldStatusLog. Every OTHER way of reaching ถึงหน้างาน — js/32's step bar, js/26's stepper,
   js/91's save-and-advance, js/03's own status modal — goes through saveFieldStatus(), which
   records no position at all. This wraps it: when the status being saved is ถึงหน้างาน, the
   position is taken FIRST (at most 12 s) and then stamped onto the new entry at the moment js/03
   saves it, so the one saveLocal() and the one cloudUpsertCase() already in that function carry
   it — no second write of a row that can be over 1 MB.

   How the stamp gets in: saveFieldStatus() appends the entry and then calls saveLocal() and
   cloudUpsertCase() by bare name. saveLocal is a window property, so while the call runs it is
   briefly wrapped to stamp the NEW ถึงหน้างาน entry (one beyond the log length taken before)
   just before the real save. Idempotent: an entry that already has a position is left alone.

   GPS refused, unavailable or slow never blocks the status: it is saved without a position and
   the reason is kept on the entry (gpsError) so the office can see why. Stored fields:
   latitude, longitude, gpsAccuracy (metres) — field_status_log is a jsonb column already in
   cloudUpsertCase's whitelist, so nothing about the database changes.

   service-case-detail.html shows them in the step drawer. Loads after every other wrapper of
   saveFieldStatus (js/26, js/63, js/68, js/69, js/91), so it is the outermost one. */
(function(){
 'use strict';
 var ARRIVE='ถึงหน้างาน';
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function findCase(cid){try{return (cases||[]).filter(function(c){return c&&c.id===cid})[0]||null}catch(e){return null}}

 function position(){
  return new Promise(function(res){
   if(!navigator.geolocation)return res({err:'unsupported'});
   var done=false;
   var t=setTimeout(function(){if(!done){done=true;res({err:'timeout'})}},12000);
   try{
    navigator.geolocation.getCurrentPosition(function(p){
     if(done)return;done=true;clearTimeout(t);
     res({lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy||0)});
    },function(e){
     if(done)return;done=true;clearTimeout(t);
     res({err:e&&e.code===1?'denied':'unavailable'});
    },{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
   }catch(e){if(!done){done=true;clearTimeout(t);res({err:'unavailable'})}}
  });
 }
 var WHY={denied:'ช่างไม่ได้อนุญาตให้ใช้ GPS',unavailable:'หาพิกัดไม่ได้',timeout:'หาพิกัดไม่ทันเวลา',unsupported:'อุปกรณ์ไม่รองรับ GPS'};
 window.imodeGpsReason=function(code){return WHY[code]||''};

 function stamp(cid,from,pos){
  var c=findCase(cid);if(!c||!Array.isArray(c.fieldStatusLog))return;
  for(var i=c.fieldStatusLog.length-1;i>=from;i--){
   var e=c.fieldStatusLog[i];
   if(!e||e.status!==ARRIVE)continue;
   if(e.latitude!=null&&e.latitude!=='')return;
   if(pos.lat!=null){
    e.latitude=pos.lat;e.longitude=pos.lng;e.gpsAccuracy=pos.acc;
    if(!c.checkInLat){c.checkInLat=pos.lat;c.checkInLng=pos.lng}
   }else e.gpsError=pos.err;
   return;
  }
 }

 var base=window.saveFieldStatus;
 if(typeof base!=='function')return;
 var busy={};
 window.saveFieldStatus=function(cid){
  var self=this,args=arguments;
  var sel=document.getElementById('fieldStatusSelect');
  if(!sel||sel.value!==ARRIVE)return base.apply(self,args);
  if(busy[cid])return Promise.resolve();
  busy[cid]=true;
  toast('📍 กำลังบันทึกพิกัด GPS…');
  return position().then(function(pos){
   var c=findCase(cid),from=(c&&Array.isArray(c.fieldStatusLog))?c.fieldStatusLog.length:0;
   var real=window.saveLocal;
   window.saveLocal=function(){try{stamp(cid,from,pos)}catch(e){}return real.apply(this,arguments)};
   var restore=function(){if(window.saveLocal!==real)window.saveLocal=real;busy[cid]=false};
   var r;
   try{r=base.apply(self,args)}catch(e){restore();throw e}
   return Promise.resolve(r).then(function(v){
    restore();
    if(pos.err)setTimeout(function(){toast('บันทึกสถานะแล้ว แต่ไม่มีพิกัด — '+(WHY[pos.err]||''))},900);
    return v;
   },function(e){restore();throw e});
  });
 };
})();
