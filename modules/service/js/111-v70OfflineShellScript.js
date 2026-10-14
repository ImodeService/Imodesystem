/* Beta 1.0 — 2026-09-23: register the offline service worker, and tell it what to keep.

   The half of the offline question js/110 does not answer. js/110 stops work done with no
   signal from being destroyed by the next sync; this stops the app from being unopenable in
   the first place. Without it an open tab keeps working offline and a RELOAD gets a blank
   screen, because index.html, the 23 stylesheets and the 110 scripts are all fetched from the
   server every time.

   WHY THE FILE LIST IS BUILT HERE AND NOT IN sw.js. A hard-coded list in a project that adds
   a script almost every session goes stale immediately, and the symptom — a file that works
   online and is missing offline — is the kind nobody finds, because testing online never shows
   it. So the list is read from the document itself: whatever this page really loaded is
   exactly what it needs in order to load again. It cannot drift, because it is not a copy.

   It is sent AFTER `load`, so caching ~3 MB never competes with the boot the technician is
   waiting on, and only files not already held are fetched.

   `file://` has no service worker at all, and neither does an insecure origin, so both are
   skipped rather than throwing. The whole thing is removable with imodeDisableOffline(). */
(function(){
 'use strict';

 if(!('serviceWorker' in navigator))return;
 /* http: is allowed on localhost only, which is what the dev server is. Anywhere else a
    service worker needs https, and GitHub Pages is https. */
 if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return;

 /* Relative on purpose: the live site is served from a sub-path
    (https://imodeservice.github.io/ImodeService/), and './sw.js' both resolves and scopes
    correctly there and at a domain root. An absolute '/sw.js' would 404 on the real site. */
 var SW='./sw.js';

 function shellUrls(){
  var out=[],seen={};
  function add(u){
   if(!u)return;
   var abs;
   try{abs=new URL(u,location.href).href}catch(e){return}
   if(abs.indexOf(location.origin)!==0)return;      /* the CDNs look after themselves */
   if(abs.indexOf('supabase.co')>=0)return;
   abs=abs.split('#')[0];
   if(seen[abs])return;
   seen[abs]=1;out.push(abs);
  }
  try{
   [].forEach.call(document.querySelectorAll('script[src]'),function(s){add(s.getAttribute('src'))});
   [].forEach.call(document.querySelectorAll('link[rel="stylesheet"]'),function(l){add(l.getAttribute('href'))});
   [].forEach.call(document.querySelectorAll('link[rel~="icon"]'),function(l){add(l.getAttribute('href'))});
  }catch(e){}
  return out;
 }

 function tellWorker(){
  var sw=navigator.serviceWorker.controller;
  if(!sw)return false;
  try{sw.postMessage({type:'imode-precache',urls:shellUrls()});return true}
  catch(e){return false}
 }

 function start(){
  navigator.serviceWorker.register(SW).then(function(reg){
   window.imodeOfflineReady=true;
   /* On the very first visit nothing controls this page yet, so the list is sent when the
      new worker takes over. On every later visit the controller is there already. */
   if(!tellWorker()){
    navigator.serviceWorker.addEventListener('controllerchange',function(){tellWorker()},{once:true});
   }
   try{reg.update()}catch(e){}
  }).catch(function(e){
   try{console.warn('[imode] offline mode unavailable:',e&&e.message)}catch(x){}
  });
 }

 /* After load, never during it. */
 if(document.readyState==='complete')setTimeout(start,0);
 else window.addEventListener('load',function(){setTimeout(start,0)},{once:true});

 /* The way out, and it must exist: a service worker that serves the wrong thing is otherwise
    hard to get rid of from a phone. This unregisters it and throws the cache away; one reload
    afterwards and the site is exactly as it was before this file. */
 window.imodeDisableOffline=function(){
  try{
   navigator.serviceWorker.getRegistrations().then(function(rs){
    rs.forEach(function(r){r.unregister()});
   });
   if(window.caches&&caches.keys)caches.keys().then(function(ks){
    ks.forEach(function(k){if(k.indexOf('imode-offline-')===0)caches.delete(k)});
   });
   if(typeof toastMsg==='function')toastMsg('ปิดโหมดออฟไลน์แล้ว — รีเฟรชหนึ่งครั้ง');
  }catch(e){}
  return 'offline mode removed — reload once';
 };

 /* What is actually held, for checking this works rather than assuming it. */
 window.imodeOfflineStatus=function(){
  if(!window.caches)return Promise.resolve({supported:false});
  return caches.keys().then(function(ks){
   var mine=ks.filter(function(k){return k.indexOf('imode-offline-')===0});
   if(!mine.length)return {supported:true,cached:0,cache:null,
                           controlled:!!navigator.serviceWorker.controller};
   return caches.open(mine[0]).then(function(c){return c.keys()}).then(function(list){
    return {supported:true,cache:mine[0],cached:list.length,
            controlled:!!navigator.serviceWorker.controller};
   });
  });
 };
})();
