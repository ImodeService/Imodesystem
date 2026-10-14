/* Beta 1.0 — field failures need to reach the office without disturbing the user.

   JavaScript errors are kept in a small device-local queue and sent best-effort to the
   Supabase `client_errors` table when the existing data client is available. The table is
   prepared by supabase/11-client-errors.sql; until that file is run, the queue simply stays
   local. Reporting is deliberately silent and every operation is guarded — an error reporter
   must never become a second source of errors.

   New localStorage key:
     imode_v70_client_errors          bounded queue, maximum BUFFER_CAP rows

   New sessionStorage key:
     imode_v70_client_error_session   per-tab count and duplicate-message set
*/
(function(){
 'use strict';

 var QUEUE_KEY='imode_v70_client_errors';
 var SESSION_KEY='imode_v70_client_error_session';
 var MAX_SESSION=10;
 var BUFFER_CAP=20;
 var sending=false;
 var queue=[];
 var session={count:0,seen:{}};

 function cut(value,max){
  try{return String(value==null?'':value).slice(0,max)}catch(e){return ''}
 }
 function scrub(value){
  try{
   return String(value==null?'':value)
    .replace(/(\b(?:machineToken|access_token|refresh_token|token|code)=)[^&#\s)]+/gi,'$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi,'$1[redacted]');
  }catch(e){return ''}
 }
 function safeJson(value,fallback){
  try{return JSON.parse(value)}catch(e){return fallback}
 }
 function load(){
  try{
   var q=safeJson(localStorage.getItem(QUEUE_KEY)||'[]',[]);
   if(Array.isArray(q))queue=q.slice(-BUFFER_CAP);
  }catch(e){queue=[]}
  try{
   var s=safeJson(sessionStorage.getItem(SESSION_KEY)||'{}',{});
   if(s&&typeof s==='object'){
    session.count=Math.max(0,Number(s.count)||0);
    session.seen=(s.seen&&typeof s.seen==='object'&&!Array.isArray(s.seen))?s.seen:{};
   }
  }catch(e){}
 }
 function persist(){
  try{localStorage.setItem(QUEUE_KEY,JSON.stringify(queue.slice(-BUFFER_CAP)))}catch(e){}
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch(e){}
 }
 function client(){
  try{return (typeof supa!=='undefined'&&supa&&typeof supa.from==='function')?supa:null}
  catch(e){return null}
 }
 function userLabel(){
  try{
   if(typeof currentUser==='undefined'||!currentUser)return '';
   return cut(currentUser.username||currentUser.name||currentUser.id||'',300);
  }catch(e){return ''}
 }
 function pageUrl(source){
  /* Query strings can carry machineToken or a password-reset token. Keep the useful file
     location without copying those credentials into an error table. */
  try{
   var u=new URL(source||location.href,location.href);
   return cut(u.origin+u.pathname,1500);
  }catch(e){
   try{return cut(location.origin+location.pathname,1500)}catch(x){return ''}
  }
 }
 function makeId(){
  try{if(crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID()}catch(e){}
  return 'CE-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 }
 function stackOf(reason){
  try{
   if(reason&&reason.stack)return cut(scrub(reason.stack),6000);
   if(reason&&typeof reason==='object')return cut(scrub(JSON.stringify(reason)),6000);
   return '';
  }catch(e){return ''}
 }
 function messageOf(reason,fallback){
  try{
   if(reason&&reason.message)return cut(scrub(reason.message),1200);
   if(typeof reason==='string')return cut(scrub(reason),1200);
  }catch(e){}
  return cut(scrub(fallback||'Unknown client error'),1200);
 }

 function remember(message,source,reason,line,column){
  try{
   var msg=messageOf(reason,message);
   var signature=msg.trim().toLowerCase();
   if(!signature||Object.prototype.hasOwnProperty.call(session.seen,signature)
      ||session.count>=MAX_SESSION)return;
   session.seen[signature]=1;
   session.count++;
   queue.push({
    id:makeId(),
    at:new Date().toISOString(),
    url:pageUrl(source),
    message:cut(msg+(line?' @ '+line+(column?':'+column:''):''),1200),
    stack:stackOf(reason),
    user:userLabel(),
    ua:(function(){try{return cut(navigator.userAgent||'',500)}catch(e){return ''}})()
   });
   if(queue.length>BUFFER_CAP)queue=queue.slice(-BUFFER_CAP);
   persist();
   flush();
  }catch(e){}
 }

 function flush(){
  try{
   if(sending||!queue.length)return;
   var c=client();
   if(!c)return;
   sending=true;
   var batch=queue.slice();
   var request;
   try{request=c.from('client_errors').insert(batch)}
   catch(e){sending=false;return}
   Promise.resolve(request).then(function(result){
    try{
     if(!result||!result.error){
      var sent={};
      batch.forEach(function(row){if(row&&row.id)sent[row.id]=1});
      queue=queue.filter(function(row){return !sent[row&&row.id]});
      persist();
     }
    }catch(e){}
    sending=false;
   },function(){sending=false});
  }catch(e){sending=false}
 }

 load();

 var previous=window.onerror;
 window.onerror=function(message,source,line,column,error){
  try{remember(message,source,error,line,column)}catch(e){}
  if(typeof previous==='function'){
   try{return previous.apply(this,arguments)}catch(e){}
  }
  return false;
 };

 window.addEventListener('unhandledrejection',function(event){
  try{remember('Unhandled promise rejection',location.href,event&&event.reason,0,0)}catch(e){}
 });

 /* initCloud() is a global function declaration, so wrapping window updates the binding that
    js/03's load handler calls. Flush only after the existing connection attempt settles. */
 var baseInit=window.initCloud;
 if(typeof baseInit==='function'){
  window.initCloud=async function(){
   var result;
   try{result=await baseInit.apply(this,arguments)}
   finally{try{flush()}catch(e){}}
   return result;
  };
 }

 window.addEventListener('online',flush);
 window.addEventListener('load',function(){setTimeout(flush,2000)});

 /* Diagnostic hooks only; the application does not depend on them. */
 window.imodeClientErrorState=function(){
  try{return {queued:queue.length,capturedThisSession:session.count,limit:MAX_SESSION}}
  catch(e){return {queued:0,capturedThisSession:0,limit:MAX_SESSION}}
 };
 window.imodeClientErrorFlush=flush;
})();
