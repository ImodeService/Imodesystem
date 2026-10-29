/* 2026-10-29 — ปัญหาที่ลูกค้าแจ้ง: two tabs, what was reported first and what staff detailed.

   service-case-detail.html keeps a copy of the case's first problem text in c.reported before
   "ลงรายละเอียดเคส" overwrites it. This file carries that copy to and from service_cases.reported
   (supabase/17-case-reported.sql) the same way js/42 carries media:
     - cloudUpsert() gets it injected into the payload, only once the column is known to exist;
     - fromCaseDb() reads it back onto the case;
     - saveCase() builds a brand-new object field by field, so the copy is put back after it.
   Without the column everything stays as it was and the copy lives on this device only.
   Remove this file and the page still works; the tabs just show up on that device alone. */
(function(){
 'use strict';
 var probe=null;
 function columnReady(){
  if(probe)return probe;
  probe=new Promise(function(resolve){
   var db=null;
   try{db=supa}catch(e){db=null}
   if(!db){resolve(false);return}
   db.from('service_cases').select('reported').limit(1).then(function(res){resolve(!(res&&res.error))},function(){resolve(false)});
  });
  return probe;
 }
 window.imodeCaseReportedColumnReady=columnReady;

 var pending=Object.create(null);
 var baseUpsert=window.cloudUpsert;
 if(typeof baseUpsert==='function'){
  window.cloudUpsert=function(table,obj){
   try{if(table==='service_cases'&&obj&&obj.id&&pending[obj.id])obj.reported=pending[obj.id]}catch(e){}
   return baseUpsert.apply(this,arguments);
  };
 }
 var baseCase=window.cloudUpsertCase;
 if(typeof baseCase==='function'){
  window.cloudUpsertCase=function(c){
   var self=this,args=arguments;
   if(!c||!c.id||!c.reported)return baseCase.apply(self,args);
   return columnReady().then(function(ok){
    if(!ok)return baseCase.apply(self,args);
    pending[c.id]=c.reported;
    var done=function(){delete pending[c.id]};
    try{return Promise.resolve(baseCase.apply(self,args)).then(function(v){done();return v},function(e){done();throw e})}
    catch(e){done();throw e}
   });
  };
 }
 var baseFrom=window.fromCaseDb;
 if(typeof baseFrom==='function'){
  window.fromCaseDb=function(row){
   var c=baseFrom.apply(this,arguments);
   try{if(row&&row.reported&&typeof row.reported==='object')c.reported=row.reported}catch(e){}
   return c;
  };
 }
 var baseSave=window.saveCase;
 if(typeof baseSave==='function'){
  window.saveCase=async function(){
   var idEl=document.getElementById('fCaseId'),id=idEl&&idEl.value,kept=null;
   try{var old=id&&cases.filter(function(x){return x.id===id})[0];kept=old&&old.reported}catch(e){}
   var r=await baseSave.apply(this,arguments);
   try{
    if(kept){
     var now=cases.filter(function(x){return x.id===id})[0];
     if(now&&!now.reported){now.reported=kept;saveLocal()}
    }
   }catch(e){}
   return r;
  };
 }
})();
