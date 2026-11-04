/* 2026-11-03 — หน้าหลัก Service: ลากจัดตำแหน่ง และเลือก "โมดูลที่ใช้บ่อย" เอง

   Owner: "ในหน้าหลักของservice ผมอยากให้ปรับตำแหน่งโมดุลได้เหมือนหน้าเลือกโมดุลหลักอะ และสามารถ
   ปรับเพิ่มโมดุลที่ใช้บ่อยด้วยตัวเองได้" (plan item 7, mockup 7-หน้าหลักService.png).

     ✎ จัดเรียง (or press and hold a tile) turns the board into edit mode:
       - drag a tile in โมดูลที่ใช้บ่อย to move it
       - ✕ on a tile takes it off the board, ＋ on any other module puts it on the end
       - คืนค่าเดิม goes back to the board js/10 builds by itself; เสร็จ saves
     The board is one list of page ids per person: kept in localStorage at once and, when the
     page has a Supabase session, in that person's account (user_metadata.imode_service_home),
     the same way the launcher keeps its order, so it follows them to another device.

   js/10 asks this file for the board through window.imodeHomeQuickPick(mods) and calls
   window.imodeHomeAfterRender(host) after drawing. Remove this file and js/10 draws the board
   it always has. Permissions still decide: a module the person cannot open never appears,
   whatever was saved. */
(function(){
 'use strict';
 var KEY='imode.svcHome.',META='imode_service_home';
 var editing=false,pulled={},drag=null,press=null,swallow=false;
 /* the board as it stands while arranging, so a re-render puts a removed tile back under its own heading */
 var draft=null;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function me(){try{return (typeof currentUser!=='undefined'&&currentUser)?currentUser:null}catch(e){return null}}
 function uname(){var u=me()||{};return String(u.username||u.id||u.name||'anon')}
 function client(){try{return (typeof supa!=='undefined'&&supa&&supa.auth)?supa:null}catch(e){return null}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 function clean(x){
  var o={quick:null,at:Number(x&&x.at)||0,user:String(x&&x.user||'')};
  if(x&&Array.isArray(x.quick))o.quick=x.quick.filter(function(p){return typeof p==='string'&&p}).slice(0,40);
  return o;
 }
 function load(){try{return clean(JSON.parse(localStorage.getItem(KEY+uname())||'null'))}catch(e){return clean(null)}}
 function store(st){try{localStorage.setItem(KEY+uname(),JSON.stringify(st))}catch(e){}}
 function push(st){
  var c=client();if(!c)return;
  c.auth.getSession().then(function(s){
   if(!s||!s.data||!s.data.session)return;
   var d={};d[META]={quick:st.quick,at:st.at,user:st.user};
   return c.auth.updateUser({data:d});
  }).catch(function(){});
 }
 function save(quick){
  var st={quick:quick,at:Date.now(),user:uname()};
  store(st);push(st);
 }
 /* Once per person per page load: a newer board saved from another device wins. */
 function pull(){
  var k=uname(),c=client();
  if(pulled[k]||!c)return;
  pulled[k]=1;
  c.auth.getSession().then(function(s){
   if(!s||!s.data||!s.data.session)return null;
   return c.auth.getUser();
  }).then(function(r){
   var u=r&&r.data&&r.data.user;if(!u||editing)return;
   var remote=clean((u.user_metadata||{})[META]),local=load();
   if(remote.user&&remote.user!==k)return;          /* another Service account on this login */
   if(remote.at>local.at){store(remote);rerender()}
   else if(local.at>remote.at)push(local);
  }).catch(function(){});
 }
 function rerender(){try{if(typeof window.imodeRenderRoleHome==='function')window.imodeRenderRoleHome()}catch(e){}}

 /* ---------------------------------------------------------------- the board ---- */
 window.imodeHomeQuickPick=function(mods){
  var st=load();
  if(editing&&draft&&draft.length)st={quick:draft};
  if(!st.quick)return null;
  var by={};mods.forEach(function(m){by[m.page]=m});
  var list=st.quick.map(function(p){return by[p]}).filter(Boolean);
  /* every saved module has been taken away from this person: fall back to the default board */
  if(!list.length&&st.quick.length)return null;
  return list;
 };

 function css(){
  if(document.getElementById('svcHomeArrangeCss'))return;
  var s=document.createElement('style');s.id='svcHomeArrangeCss';
  s.textContent=
   '#page-home .rhome-quickhead{position:relative}'+
   '#page-home .rhome-arrange-btn{border:0;background:none;font:inherit;font-size:12px;color:#5a6b8c;cursor:pointer;padding:2px 6px;border-radius:8px}'+
   '#page-home .rhome-arrange-btn:hover{color:#0b5cd6;background:rgba(11,92,214,.08)}'+
   /* floating bar at the bottom, same look as the launcher's (apps/launcher .edit-bar), user 2026-11-04 */
   /* centred without transform: another stylesheet sets transform:none on :hover, which made the bar jump away from the mouse */
   '#page-home .rhome-editbar{position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:20px;transform:none!important;transition:none!important;z-index:60;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;background:#fff;color:#0c225e;border:1px solid #dfe6f2;border-radius:16px;padding:10px 14px;box-shadow:0 8px 28px rgba(12,34,94,.2)}'+
   '#page-home .rhome-editbar span{font-size:14px;color:#5a6b8c}'+
   '#page-home .rhome-editbar button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #dfe6f2;background:transparent;color:#0c225e;font:inherit;font-size:15px;cursor:pointer}'+
   '#page-home .rhome-editbar button.is-primary{background:#0b63e5;border-color:#0b63e5;color:#fff;font-weight:600}'+
   '#page-home.rhome-editing{padding-bottom:96px}'+
   'html[data-ui="flat-dark"]:is(:root,#fx) #page-home .rhome-editbar{background:#262626!important;border-color:#3a3a3a!important;color:#f1f1f1!important;box-shadow:0 8px 28px rgba(0,0,0,.5)}'+
   'html[data-ui="flat-dark"]:is(:root,#fx) #page-home .rhome-editbar span{color:#b5b5b5!important}'+
   'html[data-ui="flat-dark"]:is(:root,#fx) #page-home .rhome-editbar button:not(.is-primary){border-color:#3a3a3a!important;color:#f1f1f1!important;background:transparent!important}'+
   '@media (max-width:760px){#page-home .rhome-editbar{bottom:calc(12px + env(safe-area-inset-bottom,0px));width:calc(100vw - 24px)}#page-home .rhome-editbar span{width:100%;text-align:center}#page-home.rhome-editing{padding-bottom:150px}}'+
   '#page-home .rhome-modcard{position:relative}'+
   '#page-home.rhome-editing .rhome-modcard{touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}'+
   '#page-home.rhome-editing .rhome-modgrid:not(.rhome-modgrid-rest) .rhome-modcard-icon{outline:2px dashed #0b63e5;outline-offset:3px;animation:rhomeWiggle .28s ease-in-out infinite alternate}'+
   '#page-home.rhome-editing .rhome-modgrid:not(.rhome-modgrid-rest) .rhome-modcard:nth-child(even) .rhome-modcard-icon{animation-direction:alternate-reverse}'+
   '#page-home.rhome-editing .rhome-modgrid-rest .rhome-modcard{cursor:pointer}'+
   '@keyframes rhomeWiggle{from{transform:rotate(-1.6deg)}to{transform:rotate(1.6deg)}}'+
   '@media (prefers-reduced-motion:reduce){#page-home.rhome-editing .rhome-modcard-icon{animation:none!important}}'+
   '#page-home .rhome-modcard.is-drag{opacity:.25}'+
   '.rhome-drag-ghost{position:fixed;z-index:9999;pointer-events:none;margin:0;transform:scale(1.08);filter:drop-shadow(0 10px 18px rgba(12,34,94,.3))}'+
   '.rhome-drag-ghost .rhome-modcard-icon{animation:none!important}'+
   '#page-home .rhome-tilebadge{position:absolute;top:-6px;right:calc(50% - 52px);z-index:3;width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;line-height:1;color:#fff;cursor:pointer;padding:0;box-shadow:0 2px 5px rgba(0,0,0,.2)}'+
   '#page-home .rhome-tilebadge.is-x{background:#667085}'+
   '#page-home .rhome-tilebadge.is-add{background:#12a06a}'+
   '#page-home.rhome-editing .rhome-more-btn{display:none!important}'+
   /* hide the notification count dots (js/115) while arranging, so they don't sit under ✕ / ＋ (user 2026-11-04) */
   '#page-home.rhome-editing .imode-cbadge,#page-home.rhome-editing .njb-navcount{display:none!important}'+
   '#page-home .rhome-emptyquick{grid-column:1/-1;color:#5a6b8c;font-size:13px;padding:10px 0}'+
   '@media (max-width:560px){#page-home .rhome-tilebadge{right:calc(50% - 40px)}}';
  document.head.appendChild(s);
 }

 function quickGrid(host){return host.querySelector('.rhome-modgrid:not(.rhome-modgrid-rest)')}
 function restGrid(host){return host.querySelector('.rhome-modgrid-rest')}
 function badge(card,kind){
  var old=card.querySelector('.rhome-tilebadge');if(old)old.remove();
  if(!kind)return;
  var b=document.createElement('span');
  b.className='rhome-tilebadge '+(kind==='x'?'is-x':'is-add');
  b.setAttribute('role','button');
  b.setAttribute('aria-label',kind==='x'?tl('เอาออกจากที่ใช้บ่อย','Remove from quick modules'):tl('เพิ่มเป็นโมดูลที่ใช้บ่อย','Add to quick modules'));
  b.textContent=kind==='x'?'✕':'＋';
  card.appendChild(b);
 }
 function emptyHint(host){
  var g=quickGrid(host);if(!g)return;
  var has=g.querySelector('.rhome-modcard'),hint=g.querySelector('.rhome-emptyquick');
  if(!has&&!hint)g.insertAdjacentHTML('beforeend','<p class="rhome-emptyquick">'+tl('กด ＋ ที่โมดูลด้านล่างเพื่อเพิ่มเป็นโมดูลที่ใช้บ่อย','Tap ＋ on a module below to add it')+'</p>');
  if(has&&hint)hint.remove();
 }
 function decorate(host){
  var q=quickGrid(host),r=restGrid(host);
  if(q)[].forEach.call(q.querySelectorAll('.rhome-modcard'),function(c){badge(c,editing?'x':null)});
  if(r)[].forEach.call(r.querySelectorAll('.rhome-modcard'),function(c){badge(c,editing?'add':null)});
  if(editing)emptyHint(host);
 }
 function currentQuick(host){
  var q=quickGrid(host);
  return q?[].map.call(q.querySelectorAll('.rhome-modcard[data-page]'),function(c){return c.getAttribute('data-page')}):[];
 }

 function setEditing(host,on){
  editing=!!on;
  host.classList.toggle('rhome-editing',editing);
  var bar=host.querySelector('.rhome-editbar');
  if(editing&&!bar){
   var head=host.querySelector('.rhome-quickhead');
   if(head)head.insertAdjacentHTML('beforebegin','<div class="rhome-editbar" role="region" aria-label="'+tl('จัดเรียงโมดูล','Arrange modules')+'">'
    +'<span>'+tl('ลากเพื่อย้าย · ✕ เอาออกจากที่ใช้บ่อย · ＋ เพิ่มเข้าที่ใช้บ่อย','Drag to move · ✕ remove · ＋ add')+'</span>'
    +'<button type="button" data-arr="reset">'+tl('คืนค่าเริ่มต้น','Reset')+'</button>'
    +'<button type="button" class="is-primary" data-arr="done">'+tl('เสร็จสิ้น','Done')+'</button></div>');
  }else if(!editing&&bar)bar.remove();
  var r=restGrid(host);
  if(r&&editing)r.hidden=false;
  var btn=host.querySelector('.rhome-arrange-btn');if(btn)btn.hidden=editing;
  decorate(host);
 }
 function finish(host){
  save(currentQuick(host));
  editing=false;draft=null;
  rerender();
  toast(tl('บันทึกการจัดเรียงแล้ว','Saved'));
 }
 function reset(){
  var st={quick:null,at:Date.now(),user:uname()};store(st);push(st);
  editing=false;draft=null;rerender();
  toast(tl('คืนค่าเริ่มต้นแล้ว','Back to the default board'));
 }

 /* ---------------------------------------------------------------- drag ---- */
 function endDrag(){
  if(!drag)return;
  if(drag.ghost)drag.ghost.remove();
  drag.card.classList.remove('is-drag');
  drag=null;
 }
 function moveGhost(e){
  drag.ghost.style.left=(e.clientX-drag.dx)+'px';
  drag.ghost.style.top=(e.clientY-drag.dy)+'px';
 }
 function startDrag(e){
  var r=drag.card.getBoundingClientRect();
  drag.dx=e.clientX-r.left;drag.dy=e.clientY-r.top;
  var g=drag.card.cloneNode(true);
  g.classList.add('rhome-drag-ghost');g.style.width=r.width+'px';
  var b=g.querySelector('.rhome-tilebadge');if(b)b.remove();
  document.body.appendChild(g);
  drag.ghost=g;drag.on=true;
  drag.card.classList.add('is-drag');
  moveGhost(e);
 }
 function dragOver(e){
  var el=document.elementFromPoint(e.clientX,e.clientY);
  var t=el&&el.closest?el.closest('.rhome-modcard'):null;
  var g=drag.grid;
  if(!t||t===drag.card||t.parentNode!==g)return;
  var r=t.getBoundingClientRect();
  var after=(e.clientX>r.left+r.width/2);
  g.insertBefore(drag.card,after?t.nextSibling:t);
 }

 function wire(host){
  if(host.__arrWired)return;
  host.__arrWired=true;
  /* in edit mode a tap on a tile must not open the module */
  host.addEventListener('click',function(e){
   if(swallow){swallow=false;e.stopPropagation();e.preventDefault();return}
   var act=e.target.closest&&e.target.closest('[data-arr]');
   if(act){e.preventDefault();if(act.getAttribute('data-arr')==='done')finish(host);else reset();return}
   if(e.target.closest&&e.target.closest('.rhome-arrange-btn')){e.preventDefault();draft=null;setEditing(host,true);return}
   if(!editing)return;
   var card=e.target.closest&&e.target.closest('.rhome-modcard');
   if(!card)return;
   e.stopPropagation();e.preventDefault();
   var q=quickGrid(host),r=restGrid(host),inQuick=card.parentNode===q;
   var onBadge=!!(e.target.closest&&e.target.closest('.rhome-tilebadge'));
   if(inQuick&&onBadge&&r){
    var left=currentQuick(host).filter(function(p){return p!==card.getAttribute('data-page')});
    /* re-draw so the tile goes back to its own group in โมดูลทั้งหมด; the last tile stays a DOM move
       because js/10 has no empty board to draw */
    if(left.length){draft=left;rerender();return}
    r.insertBefore(card,r.firstChild);badge(card,'add');emptyHint(host);
   }
   else if(!inQuick&&q){var h=q.querySelector('.rhome-emptyquick');if(h)h.remove();q.appendChild(card);badge(card,'x');draft=currentQuick(host);rerender()}
  },true);

  host.addEventListener('pointerdown',function(e){
   var card=e.target.closest&&e.target.closest('.rhome-modcard');
   if(!card||e.button>0)return;
   if(e.target.closest('.rhome-tilebadge'))return;
   if(editing){
    var q=quickGrid(host);
    if(card.parentNode!==q)return;
    drag={card:card,grid:q,x:e.clientX,y:e.clientY,on:false,id:e.pointerId};
    return;
   }
   /* press and hold opens edit mode, as on the launcher */
   press={x:e.clientX,y:e.clientY,t:setTimeout(function(){press=null;swallow=true;setEditing(host,true)},550)};
  });
  document.addEventListener('pointermove',function(e){
   if(press&&(Math.abs(e.clientX-press.x)+Math.abs(e.clientY-press.y)>10)){clearTimeout(press.t);press=null}
   if(!drag)return;
   if(!drag.on){
    if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)<6)return;
    startDrag(e);
   }
   e.preventDefault();
   moveGhost(e);dragOver(e);
  },{passive:false});
  function up(){
   if(press){clearTimeout(press.t);press=null}
   if(drag){if(drag.on)swallow=true;endDrag();setTimeout(function(){swallow=false},0)}
  }
  document.addEventListener('pointerup',up);
  document.addEventListener('pointercancel',up);
  host.addEventListener('contextmenu',function(e){if(editing||press)e.preventDefault()});
 }

 window.imodeHomeAfterRender=function(host,custom){
  if(!host||!quickGrid(host))return;
  css();
  wire(host);
  var head=host.querySelector('.rhome-quickhead');
  if(head&&!head.querySelector('.rhome-arrange-btn')){
   var small=head.querySelector('small');
   if(small&&custom)small.textContent=tl('จัดเรียงเองแล้ว','Arranged by you');
   head.insertAdjacentHTML('beforeend','<button type="button" class="rhome-arrange-btn" title="'+tl('จัดเรียงและเลือกโมดูลที่ใช้บ่อย','Arrange quick modules')+'">✎ '+tl('จัดเรียง','Arrange')+'</button>');
  }
  setEditing(host,editing);
  pull();
 };
})();
