/* Beta 1.0 — Workshop jobs: the machine comes to the company, usually for R&D.

   REQUESTED 2026-09-17. Decided with the owner:
     - the customer chooses Workshop on แจ้งปัญหา, and says whether they send the machine or we
       collect it, and whether they collect it back or we deliver it (js/79). Collecting and
       delivering are charged by distance; sending in and picking up yourself are free.
     - a field job can become a Workshop job in the same case (ลงรายละเอียดเคส, case page).
     - the admin assigns as before, to any team; mostly R&D.
     - the quotation always comes first, but the technician may start checking or repairing
       before it is signed.
     - QC is compulsory BEFORE the machine goes back (Pre-Delivery QC).

   The job itself is run on service-case-detail.html: receiving the machine, the R&D status
   track, QC and hand-back all live there, as entries in the case's fieldStatusLog tagged with
   `workshop`. This file is the application half:

     1. a Workshop job has no หน้างาน — GPS check-in and travelling mean nothing for a machine
        on our own bench — so opening it as a field job opens its case page instead;
     2. building the quotation from the case fills Pickup / Delivery from the customer's choice,
        so the distance charge is already on the line (qService is already WS for this type,
        js/03's loadCaseIntoQuote does that);
     3. intent=qc-predelivery (from the case page) opens a Pre-Delivery QC linked to the case. */
(function(){
 'use strict';

 var WS_TYPE='ลูกค้าส่งเครื่องเข้าบริษัท';
 function caseById(id){try{return (Array.isArray(cases)?cases:[]).filter(function(c){return c&&c.id===id})[0]||null}catch(e){return null}}
 function isWorkshop(c){return !!c&&String(c.serviceType||'')===WS_TYPE}
 function logistics(c){
  var log=(c&&c.fieldStatusLog)||[],last=null;
  for(var i=0;i<log.length;i++)if(log[i]&&log[i].workshop==='logistics')last=log[i];
  return last;
 }
 window.imodeIsWorkshopCase=function(id){return isWorkshop(caseById(id))};

 /* 1. ---------------------------------------------------------------------------- */
 function wrapFieldJob(){
  var base=window.imodeOpenFieldJob;
  if(typeof base!=='function'||base.__ws)return;
  var w=function(id){
   if(isWorkshop(caseById(id))&&typeof window.imodeOpenCase==='function')return window.imodeOpenCase(id);
   return base.apply(this,arguments);
  };
  w.__ws=true;
  window.imodeOpenFieldJob=w;
 }
 wrapFieldJob();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wrapFieldJob,{once:true});

 /* 2. ---------------------------------------------------------------------------- */
 var baseLoad=window.loadCaseIntoQuote;
 if(typeof baseLoad==='function'){
  window.loadCaseIntoQuote=function(cid){
   var r=baseLoad.apply(this,arguments);
   try{
    var c=caseById(cid),l=logistics(c),sel=document.getElementById('qPickup');
    if(isWorkshop(c)&&l&&sel){
     var mode=(l.inbound==='pickup'?1:0)+(l.outbound==='deliver'?2:0);   /* 1 Pickup, 2 Delivery, 3 both */
     sel.value=String(mode);
     if(typeof calcQuote==='function')calcQuote();
    }
   }catch(e){}
   return r;
  };
 }

 /* 3. ---------------------------------------------------------------------------- */
 window.imodeOpenCaseQc=function(cid){
  var c=caseById(cid);
  if(!c||typeof window.openQcModal!=='function')return false;
  window.openQcModal('',c.machineId||'');
  setTimeout(function(){
   try{
    var type=document.getElementById('qcType'),kase=document.getElementById('qcCase');
    if(type){type.value='Pre-Delivery QC';type.dispatchEvent(new Event('change',{bubbles:true}))}
    if(kase){
     if(![].some.call(kase.options,function(o){return o.value===cid})&&typeof qcCaseOptions==='function')
      kase.innerHTML=qcCaseOptions(c.customerId||'',c.machineId||'',cid);
     kase.value=cid;
     kase.dispatchEvent(new Event('change',{bubbles:true}));
    }
   }catch(e){}
  },120);
  return true;
 };
})();
