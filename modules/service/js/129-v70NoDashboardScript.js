/* 2026-10-13: the Dashboard is removed from Service ("ลบแดชบอร์ดออกจากระบบ Service").
   The page markup stays in index.html, hidden, because js/03's renderAll() still fills its
   elements by id and would throw if they were gone. Nothing links to it any more, and any
   goPage('dashboard') (logout, SSO landing, role fallbacks, old bookmarks) lands on Home, the
   role board, instead. No data or permission is touched: dashboard.view is still a stored
   permission, it just opens nothing.
   To bring the Dashboard back: restore the files in G:\imodeservice\_backup-ก่อนลบแดชบอร์ด-2026-10-13
   and delete this script and its <script> line in index.html. */
(function(){
 'use strict';
 var st=document.createElement('style');
 st.textContent='#page-dashboard,[data-page="dashboard"]{display:none!important}'
  +'html[data-ui]:is(:root,#fx) #page-home .rhome-profile{width:fit-content!important;max-width:100%;cursor:default}';
 document.head.appendChild(st);

 var base=window.goPage;
 if(typeof base!=='function')return;
 window.goPage=function(name){
  if(name==='dashboard'){
   var a=Array.prototype.slice.call(arguments);
   a[0]='home';
   return base.apply(this,a);
  }
  return base.apply(this,arguments);
 };

 /* index.html no longer ships a page as .active, so open Home once the boot splash is
    released (js/117 / js/22 do the same for technicians). Never override a page that was
    already chosen, such as a deep link or a customer QR page. */
 function settle(){
  try{
   if(document.documentElement.getAttribute('data-view')==='customer')return;
   var cur=document.querySelector('.page.active');
   if(!cur||cur.id==='page-dashboard')window.goPage('home');
  }catch(e){}
 }
 if(document.readyState==='complete')setTimeout(settle,0);
 else window.addEventListener('load',function(){setTimeout(settle,0)});
})();
