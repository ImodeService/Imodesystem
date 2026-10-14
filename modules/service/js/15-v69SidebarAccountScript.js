/* V6.9 account card moves to the foot of the sidebar.
   The card itself is not rebuilt: the existing #topbarUserCard element is relocated above
   .sidebar-version, so renderUserCard() keeps filling it by id and openUserLoginModal()
   keeps opening from it. Only the styling changes, because it now sits on the blue
   sidebar instead of the white topbar. */
(function(){
 'use strict';

 function move(){
  var card=document.getElementById('topbarUserCard');
  var side=document.querySelector('.sidebar');
  var version=side&&side.querySelector('.sidebar-version');
  if(!card||!side||!version)return false;
  if(card.parentNode&&card.parentNode.classList.contains('sidebar-account'))return true;
  var box=document.createElement('div');
  box.className='sidebar-account';
  version.parentNode.insertBefore(box,version);
  box.appendChild(card);
  card.classList.add('is-sidebar');
  return true;
 }

 /* renderUserCard() rewrites the element's className on every render, which would drop
    the sidebar styling, so it is re-applied afterwards. */
 if(typeof window.renderUserCard==='function'){
  var base=window.renderUserCard;
  window.renderUserCard=function(){
   var r=base.apply(this,arguments);
   var card=document.getElementById('topbarUserCard');
   if(card)card.classList.add('is-sidebar');
   move();
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v69SidebarAccountStyle';
 st.textContent=''
 /* The topbar keeps its own spacing; the gap the card used to fill is simply closed. */
 +'.sidebar-account{margin-top:auto;padding:8px 6px 0}'
 +'.sidebar-version{margin-top:0}'
 +'.topbar-user-card.is-sidebar{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;cursor:pointer;'
 +'border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(255,255,255,.12);color:#fff;text-align:left}'
 +'.topbar-user-card.is-sidebar:hover{background:rgba(255,255,255,.2)}'
 +'.topbar-user-card.is-sidebar:focus-visible{outline:2px solid #ffb066;outline-offset:2px}'
 +'.topbar-user-card.is-sidebar .top-user-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}'
 +'.topbar-user-card.is-sidebar .top-user-meta b{display:block;font-size:12px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
 +'.topbar-user-card.is-sidebar .top-user-meta small{display:block;font-size:10px;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
 +'.topbar-user-card.is-sidebar .top-user-avatar{width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;font-size:12px;font-weight:800;background:#ff8a3c;color:#fff}'
 +'.topbar-user-card.is-sidebar .top-user-photo{width:32px;height:32px;flex:none;border-radius:10px;object-fit:cover}'
 +'.topbar-user-card.is-sidebar .top-user-arrow{color:rgba(255,255,255,.7);font-size:12px}';
 document.head.appendChild(st);

 function install(){move()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
