/* Beta — the sidebar is sorted into named groups.

   Reported: "การเรียงลำดับโมดุลในหน้าสไลด์บาร์มันดูเยอะมาก". Eighteen nav items in one
   undifferentiated column, in the order they happened to be written into index.html and
   then inserted into by js/16 — เงินสดย่อย between QC เครื่อง and สต๊อกอะไหล่, หน้างาน
   between ทีมช่าง and ปฏิทินงาน. Nothing was wrong with it; there was simply no shape to
   read.

   HOW THIS IS DONE, AND WHY NOT THE OBVIOUS WAY

   The obvious way is to wrap each group in a <div>. That is exactly what must not happen:
   `.side-nav{display:grid;gap:5px}` in css/01 puts every nav item in its own grid cell, so
   a wrapper would collapse a whole group into one cell and five later stylesheets
   (css/06, 09, 10 …) would need re-checking. Instead the headers are inserted as *siblings*
   and the buttons are reordered in place. The DOM stays one flat list of grid children,
   every existing `.side-nav .nav-item` rule keeps matching, and removing this file leaves
   the sidebar exactly as it was.

   THE THREE THINGS THAT WILL BREAK THIS IF CHANGED

   1. A group whose every item is hidden must hide its header too. applyRoleVisibility()
      in js/03 sets `style.display` on `[data-page]` elements only — it knows nothing about
      headers — so a technician would otherwise see "ราคาและค่าใช้จ่าย" with nothing under
      it. It is wrapped rather than observed: it is a plain top-level function declaration
      in js/03, therefore a property of window, and every caller uses the bare identifier
      which resolves to that property.
   2. js/16 adds งานของฉัน and มอบหมายงาน from its own DOMContentLoaded listener. This file
      parses later, so its listener runs after js/16's and both are already there. A
      childList observer covers anything added later still.
   3. A page this file does not know about is not dropped — it collects at the end under
      อื่น ๆ, which only appears when it has something in it. So a future module shows up
      in the sidebar without being listed here first.

   Labels follow the language because the header text is rewritten on every sync, which
   runs on every applyRoleVisibility(). data-no-i18n keeps applyLanguageTo() from walking
   them, since these are our strings and it would translate them twice. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}

 /* Order inside a group is deliberate: the group reads as the sequence of the work.
    งานบริการ is intake -> assign -> the technician's own list -> the site -> the diary. */
 /* ORDER IS THE READING ORDER OF THE SIDEBAR. ราคาและค่าใช้จ่าย sits directly after
    งานบริการ because a quotation is part of taking a job in, not a back-office chore.
    รายงาน is its own group and holds สต๊อกอะไหล่ with it — both are things you go and look
    up rather than work in. That left คลังและทีมงาน with only ทีมช่าง in it, so it is named
    ทีมงาน now.
    THE ids ARE AN API: js/43, js/45 and js/49 insert their own page by group id
    ('service', 'money'), so an id may be re-ordered and renamed but never renumbered away. */
 var GROUPS=[
  {id:'alert',    th:'การแจ้งเตือน',          en:'Inbox',
   pages:['notifications','requests']},
  {id:'service',  th:'งานบริการ',            en:'Service work',
   pages:['cases','assign','my-work','field-service','calendar']},
  {id:'money',    th:'ราคาและค่าใช้จ่าย',      en:'Pricing & expenses',
   pages:['quotation','onsite','petty-cash']},
  {id:'assets',   th:'ลูกค้าและเครื่องจักร',   en:'Customers & machines',
   pages:['customers','machines','qc','warranty','documents']},
  {id:'stock',    th:'ทีมงาน',               en:'Team',
   pages:['technicians']},
  /* 2026-09-18, on the owner's instruction: "เพิ่มหมวดหมู่ใหม่ใน slide bar คือ ประวัติ และย้าย
     โมดุลประวัติไปไว้ในนั้น". The three modules that are a record of what already happened, rather
     than work in front of somebody, put themselves in here by id — ประวัติคำขอ (js/61),
     ประวัติใบเสนอราคา (js/43) and งานที่สำเร็จแล้ว (js/45). It sits next to รายงาน because both are
     places people go to look something up, not to do the day's work. */
  {id:'history',  th:'ประวัติ',               en:'History', pages:[]},
  {id:'report',   th:'รายงาน',               en:'Reports',
   pages:['reports','spare-parts']},
  {id:'system',   th:'ระบบ',                 en:'System',
   pages:['settings','trash']},
  {id:'other',    th:'อื่น ๆ',                en:'Other', pages:[]}
 ];

 function nav(){return document.querySelector('.sidebar .side-nav')}

 /* 2026-09-15: the groups open and close. The header stopped being decoration the moment it
    became the control, so it is a real <button> with aria-expanded and a caret — it can no
    longer be aria-hidden, and it takes the keyboard for free by being a button.
    Which groups are shut is remembered per device in its own key: it is a per-person view
    preference about one sidebar, it must not travel to everybody through `settings`, and
    losing it only means the sidebar opens fully expanded. */
 var COLLAPSE_KEY='imode_v70_nav_collapsed';
 function collapsedSet(){
  try{
   var raw=JSON.parse(localStorage.getItem(COLLAPSE_KEY)||'{}');
   return (raw&&typeof raw==='object')?raw:{};
  }catch(e){return {}}
 }
 function setCollapsed(id,on){
  var m=collapsedSet();
  if(on)m[id]=1; else delete m[id];
  try{localStorage.setItem(COLLAPSE_KEY,JSON.stringify(m))}catch(e){}
 }
 function header(g){
  var el=document.createElement('button');
  el.type='button';
  el.className='nav-group';
  el.setAttribute('data-navgroup',g.id);
  el.setAttribute('data-no-i18n','true');
  el.innerHTML='<span class="nav-group-label"></span><span class="nav-group-caret" aria-hidden="true">▾</span>';
  el.querySelector('.nav-group-label').textContent=tl(g.th,g.en);
  el.addEventListener('click',function(e){
   e.preventDefault();
   e.stopPropagation();
   toggleGroup(g.id);
  });
  return el;
 }

 /* The items of a group are its following siblings up to the next header — the same forward
    walk sync() does, because there is no containment to ask. Wrapping them in a real element
    would be cleaner to animate but would mean rebuilding the nav, and applyRoleVisibility()
    and three other scripts address .nav-item as a direct child of .side-nav. */
 function itemsOf(head){
  var out=[],el=head.nextElementSibling;
  while(el&&!(el.hasAttribute&&el.hasAttribute('data-navgroup'))){
   if(el.classList&&el.classList.contains('nav-item'))out.push(el);
   el=el.nextElementSibling;
  }
  return out;
 }
 /* Height cannot be animated from `auto`, so each item is given its own measured height and
    animates to 0 on a small stagger — which is what makes it read as a fold rather than a
    disappearance. The items are not hidden with [hidden] or display:none: an author display
    rule beats the UA [hidden] rule (the trap this project has hit four times), and a
    display change cannot be transitioned at all. */
 function applyCollapse(head,on,animate){
  var items=itemsOf(head);
  head.setAttribute('aria-expanded',on?'false':'true');
  head.classList.toggle('is-collapsed',!!on);
  items.forEach(function(it,i){
   it.classList.toggle('nav-item-collapsed',!!on);
   if(!animate){it.style.transitionDelay='';return}
   /* Opening reveals top-down, closing folds bottom-up, so the group collapses toward its
      own header instead of appearing to fall off the list. */
   var k=on?(items.length-1-i):i;
   it.style.transitionDelay=(k*22)+'ms';
   setTimeout(function(){it.style.transitionDelay=''},k*22+240);
  });
 }
 function toggleGroup(id){
  var n=nav();
  if(!n)return;
  var head=n.querySelector('[data-navgroup="'+id+'"]');
  if(!head)return;
  var on=!head.classList.contains('is-collapsed');
  setCollapsed(id,on);
  applyCollapse(head,on,true);
 }
 window.imodeToggleNavGroup=toggleGroup;

 /* Reorders whatever is there right now. Safe to run repeatedly: appendChild moves an
    existing node rather than copying it, so a second pass is a no-op on an already
    sorted list.

    THE OBSERVER MUST BE OFF WHILE THIS RUNS. Moving a node with appendChild is reported as
    an addedNode, so the childList observer below sees this function's own work as "a nav
    item arrived", calls it again, and the two spin forever — the tab locks up with no
    error. It did not show until js/40 added a nav item after start(), because until then
    nothing ever called layout() a second time. Disconnecting rather than using a flag is
    what actually works: a MutationObserver only queues records while it is observing, so
    records from our own moves are never created instead of being created and ignored. */
 var obs=null,laying=false;
 function layout(){
  if(laying)return;
  var n=nav();
  if(!n)return;
  laying=true;
  try{if(obs)obs.disconnect()}catch(e){}
  try{layoutInner(n)}
  finally{
   laying=false;
   try{if(obs)obs.observe(nav()||document.body,{childList:true})}catch(e){}
  }
 }
 function layoutInner(n){
  var items={},loose=[];
  [].slice.call(n.querySelectorAll('.nav-item[data-page]')).forEach(function(b){
   items[b.dataset.page]=b;
  });
  var known={};
  GROUPS.forEach(function(g){g.pages.forEach(function(p){known[p]=1})});
  Object.keys(items).forEach(function(p){if(!known[p])loose.push(p)});

  /* A page listed in two groups would be moved twice and end up under whichever group ran
     last — silently, and not where the earlier group says it is. First claim wins. */
  var placed={};
  GROUPS.forEach(function(g){
   var list=(g.id==='other')?loose:g.pages;
   var present=list.filter(function(p){return items[p]&&!placed[p]});
   present.forEach(function(p){placed[p]=1});
   var head=n.querySelector('[data-navgroup="'+g.id+'"]');
   if(!present.length){if(head)head.remove();return}
   if(!head)head=header(g);
   n.appendChild(head);
   present.forEach(function(p){n.appendChild(items[p])});
  });
  sync();
 }

 /* A header is only as visible as the buttons under it. Walking forward to the next
    header is what defines "under it" — there is no containment to ask. */
 function sync(){
  var n=nav();
  if(!n)return;
  var kids=[].slice.call(n.children),i,j;
  for(i=0;i<kids.length;i++){
   var el=kids[i];
   if(!el.hasAttribute||!el.hasAttribute('data-navgroup'))continue;
   var g=GROUPS.filter(function(x){return x.id===el.getAttribute('data-navgroup')})[0];
   /* textContent here would delete the caret and the label span with it — the header is a
      button with structure now, not a text node. */
   if(g){
    var lab=el.querySelector('.nav-group-label');
    if(lab)lab.textContent=tl(g.th,g.en);
    else el.textContent=tl(g.th,g.en);
   }
   var any=false;
   for(j=i+1;j<kids.length;j++){
    if(kids[j].hasAttribute&&kids[j].hasAttribute('data-navgroup'))break;
    if(kids[j].classList&&kids[j].classList.contains('nav-item')&&kids[j].style.display!=='none'){any=true;break}
   }
   el.style.display=any?'':'none';
   /* A relayout re-reads the stored state, so a group the person shut stays shut when a
      script adds a nav item later (js/40 and js/49 both do). No animation on this path: it
      is a restore, not an interaction. */
   if(g)applyCollapse(el,!!collapsedSet()[g.id],false);
  }
 }

 var baseApply=window.applyRoleVisibility;
 if(typeof baseApply==='function'){
  window.applyRoleVisibility=function(){
   var r=baseApply.apply(this,arguments);
   try{sync()}catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70NavGroupStyle';
 st.textContent=''
 /* The header is a button now. It keeps the look it had, plus a caret and a hit area. */
 +'.side-nav .nav-group{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;'
 +'font-family:inherit;text-align:left;cursor:pointer;border-radius:9px}'
 +'.side-nav .nav-group:hover{background:rgba(255,255,255,.08)}'
 +'.side-nav .nav-group:focus-visible{outline:2px solid rgba(255,255,255,.75);outline-offset:-2px}'
 +'.side-nav .nav-group-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.side-nav .nav-group-caret{flex:none;font-size:9px;opacity:.75;transition:transform .22s ease}'
 +'.side-nav .nav-group.is-collapsed .nav-group-caret{transform:rotate(-90deg)}'
 /* The fold. Height is animated from a measured value rather than auto, and display is never
    touched — an author display rule beats [hidden], and display cannot be transitioned. */
 /* THE TRANSITION MUST WIN. A later stylesheet sets transition on the nav buttons for the
    tactile press (transform / box-shadow / background / border-color / color) and, loading after
    this runtime <style>, replaced this list outright — max-height was not in it, so the group
    snapped shut in one frame. Measured: 55px → 0 on the first frame after the click.
    !important, and the five properties that rule animates are kept in the list so the press
    and hover feel is unchanged. */
 /* min-height is in the list too: css/01 gives nav items min-height 47px !important, and the
    collapsed rule takes it to 0 — left out, it snapped away in the first frame and the fold
    visibly jumped from 55px to 16px before anything animated. */
 +'.side-nav .nav-item{transition:max-height .34s cubic-bezier(.2,.8,.2,1),min-height .34s cubic-bezier(.2,.8,.2,1),opacity .26s ease,'
 +'margin .34s cubic-bezier(.2,.8,.2,1),padding .34s cubic-bezier(.2,.8,.2,1),'
 /* 2026-09-20: the press/hover feel was reported as too fast ("animation ของปุ่มใน Slide bar
    มันเร็วไปอะ"). transform .26s -> .42s and the colour/glow .2s -> .34s. The FOLD timings
    above (max-height / min-height / margin / padding .34s) are a different animation — the
    group opening and closing — and are deliberately left alone. css/01's .nav-item and its
    icon chip were moved to the same numbers, or the icon finishes before the button does. */
 +'transform .42s cubic-bezier(.2,.8,.2,1),box-shadow .34s,background .34s,border-color .34s,color .34s!important;'
 +'max-height:64px;overflow:hidden}'
 /* A small lift as each item folds away, so it reads as tucking under the header rather than
    being cut off. Collapsed items take no pointer events, so this never fights the hover lift. */
 +'.side-nav .nav-item.nav-item-collapsed{transform:translateY(-6px) scale(.97)}'
 /* min-height on .nav-item is declared !important twice in css/01 (lines 418 and 643), and a
    min-height beats max-height outright — without overriding it here the group would animate
    to 47px and stop, i.e. not close at all. Every collapsed property has to win the same way. */
 +'.side-nav .nav-item.nav-item-collapsed{max-height:0!important;min-height:0!important;opacity:0;'
 +'margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;'
 +'pointer-events:none;border-width:0!important}'
 /* Has to be !important too, or the transition above — now !important — would override it and
    animate for somebody who asked the system not to. */
 +'@media (prefers-reduced-motion:reduce){.side-nav .nav-item,.side-nav .nav-group-caret{transition:none!important}'
 +'.side-nav .nav-item.nav-item-collapsed{transform:none}}'
 +'.side-nav .nav-group{padding:13px 12px 4px;font-size:10.5px;font-weight:800;'
 +'letter-spacing:.09em;text-transform:uppercase;color:rgba(233,240,255,.52);'
 /* pointer-events was `none` here from when the header was decoration. It sits AFTER the
    button rules above at the same specificity, so it won — every real click fell straight
    through the header while element.click() in the test suite, which ignores pointer-events,
    passed. The header is the control now. */
 +'line-height:1.2;user-select:none;pointer-events:auto}'
 /* No rule above the first group — a divider against the brand block reads as a seam. */
 +'.side-nav .nav-group:first-child{padding-top:2px}'
 +'.side-nav .nav-group[style*="display: none"]{display:none!important}'
 +'@media (max-width:900px){.side-nav .nav-group{padding:11px 10px 3px;font-size:10px}}'
 +'@media (max-height:760px){.side-nav .nav-group{padding:9px 12px 2px}}';
 document.head.appendChild(st);

 function start(){
  try{
   obs=new MutationObserver(function(recs){
    /* Only a nav item arriving matters; our own appendChild churn must not re-enter. */
    var relevant=recs.some(function(r){
     return [].slice.call(r.addedNodes).some(function(x){
      return x.nodeType===1&&x.classList&&x.classList.contains('nav-item');
     });
    });
    if(relevant)layout();
   });
   obs.observe(nav()||document.body,{childList:true});
  }catch(e){}
  layout();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();

 window.imodeNavGroups={layout:layout,sync:sync,groups:GROUPS};
})();
