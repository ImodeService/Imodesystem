/* js/142-v70MachineOriginScript.js — 2026-10-20 (ข้อ 10)
   "หน้าเครื่องจักร แยกแท็บด้านบน (แบบหน้าตั้งค่า) สำหรับเครื่องที่ไม่ได้ซื้อจาก I-MODE"

   WHERE THE FLAG LIVES. machines.source — a text column that already exists in Supabase and that
   js/03 saveMachine() already carries over on every edit (source: old?.source). A machine not bought
   from I-MODE has source 'NON-IMODE'; anything else (empty, or the demo import's own text) is an
   I-MODE machine. No SQL, no new column: cloudUpsert('machines', obj) sends the whole object, so a
   new property would be refused by the server — this one is not new.

   WHAT CHANGES
   - two tabs over the machines list: เครื่องจาก I-MODE / เครื่องที่ไม่ได้ซื้อจาก I-MODE. The list,
     the KPI tiles, the counts and the pages all follow the tab.
   - the machine form has a tick box "เครื่องที่ไม่ได้ซื้อจาก I-MODE". It starts ticked when the form
     was opened from the "ไม่พบเครื่องนี้ในรายการ" popup (js/140) or from the second tab.

   HOW THE LIST IS FILTERED. js/07's renderMachines() filters the lexical global `machines` by bare
   name, so for the length of that one synchronous call `machines` is pointed at the tab's subset and
   put back in a finally. Nothing in that call saves or syncs. */
(function(){
 'use strict';
 var OTHER='NON-IMODE';
 var KEY='imode.machines.tab';
 function isOther(m){return !!m&&String(m.source||'')===OTHER}
 window.imodeMachineIsNonImode=isOther;
 function all(){try{return Array.isArray(machines)?machines:[]}catch(e){return []}}
 var tab='imode';
 try{if(localStorage.getItem(KEY)==='other')tab='other'}catch(e){}

 /* ---------------------------------------------------------------- tabs ---- */
 function counts(){
  var n=0,list=all();
  for(var i=0;i<list.length;i++)if(isOther(list[i]))n++;
  return {imode:list.length-n,other:n};
 }
 function bar(){
  var page=document.getElementById('page-machines');
  if(!page)return null;
  var b=document.getElementById('moTabs');
  if(!b){
   b=document.createElement('div');
   b.id='moTabs';b.className='mo-tabs';b.setAttribute('role','tablist');b.setAttribute('aria-label','แหล่งที่มาของเครื่อง');
   page.insertBefore(b,page.firstChild);
   b.addEventListener('click',function(e){
    var t=e.target.closest('[data-mo-tab]');if(!t)return;
    tab=t.getAttribute('data-mo-tab');
    try{localStorage.setItem(KEY,tab)}catch(x){}
    try{machineCurrentPage=1}catch(x){}
    if(typeof window.renderMachines==='function')window.renderMachines();
   });
  }
  var c=counts();
  b.innerHTML='<button type="button" role="tab" class="mo-tab" data-mo-tab="imode" aria-selected="'+(tab==='imode')+'">'
   +'<span aria-hidden="true">🏭</span> เครื่องจาก I-MODE <em>'+c.imode+'</em></button>'
   +'<button type="button" role="tab" class="mo-tab" data-mo-tab="other" aria-selected="'+(tab==='other')+'">'
   +'<span aria-hidden="true">🔧</span> เครื่องที่ไม่ได้ซื้อจาก I-MODE <em>'+c.other+'</em></button>';
  return b;
 }
 var base=window.renderMachines;
 if(typeof base==='function'){
  window.renderMachines=function(){
   bar();
   var full=all(),out;
   var part=full.filter(function(m){return tab==='other'?isOther(m):!isOther(m)});
   machines=part;
   try{out=base.apply(this,arguments)}
   finally{machines=full}
   return out;
  };
 }

 /* ---------------------------------------------------------------- form ---- */
 /* js/140 sets this before it opens the form from the "not in the list" popup */
 window.imodeMachineOriginNext='';
 var baseOpen=window.openMachineModal;
 if(typeof baseOpen==='function'){
  window.openMachineModal=function(mid){
   var preset=window.imodeMachineOriginNext;window.imodeMachineOriginNext='';
   var r=baseOpen.apply(this,arguments);
   setTimeout(function(){
    var note=document.getElementById('maNote');
    if(!note||document.getElementById('maNonImode'))return;
    var m=null;all().forEach(function(x){if(x&&x.id===mid)m=x});
    var on=m?isOther(m):(preset==='other'||(!mid&&tab==='other'&&isPageMachines()));
    var f=document.createElement('div');f.className='field full mo-origin';
    f.innerHTML='<label class="mo-check"><input type="checkbox" id="maNonImode"'+(on?' checked':'')+'>'
     +'<span><b>เครื่องที่ไม่ได้ซื้อจาก I-MODE</b><small>ลูกค้าซื้อจากที่อื่น แต่ให้ I-MODE ดูแล / ซ่อม · จะแสดงในแท็บแยก</small></span></label>';
    var box=note.closest('.field');
    if(box&&box.parentNode)box.parentNode.insertBefore(f,box.nextSibling);
   },30);
   return r;
  };
 }
 function isPageMachines(){var p=document.getElementById('page-machines');return !!(p&&p.classList.contains('active'))}
 var baseSave=window.saveMachine;
 if(typeof baseSave==='function'){
  window.saveMachine=function(){
   var box=document.getElementById('maNonImode'),want=box?(box.checked?OTHER:null):undefined;
   var idEl=document.getElementById('maId'),id=idEl?idEl.value:'';
   var before={};all().forEach(function(m){if(m&&m.id)before[m.id]=1});
   /* an edit: js/03 copies old.source into the saved object, so set it on the record first */
   var old=null;if(id)all().forEach(function(m){if(m&&m.id===id)old=m});
   var prev=old?old.source:undefined;
   if(old&&want!==undefined)old.source=want===OTHER?OTHER:(isOther(old)?'':old.source);
   var out;
   try{out=baseSave.apply(this,arguments)}
   catch(e){if(old)old.source=prev;throw e}
   if(!old&&want===OTHER){
    var fix=function(){
     var made=all().filter(function(m){return m&&m.id&&!before[m.id]});
     made.forEach(function(m){
      m.source=OTHER;
      try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
      try{if(typeof window.cloudUpsert==='function')window.cloudUpsert('machines',m)}catch(e){}
     });
     if(made.length&&typeof window.renderMachines==='function')try{window.renderMachines()}catch(e){}
    };
    if(out&&typeof out.then==='function')out.then(fix,fix);else fix();
   }
   return out;
  };
 }

 /* -------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');st.id='v70MachineOriginStyle';
 st.textContent=''
 +'.mo-tabs{display:flex;gap:4px;overflow-x:auto;padding:0 4px;margin:0 0 12px;border-bottom:1px solid #d3d9e3;scrollbar-width:none}'
 +'.mo-tabs::-webkit-scrollbar{display:none}'
 +'.mo-tab{flex:none;display:flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid #d3d9e3;border-bottom:0;background:#e4e8ef;color:#4a5568;'
 +'padding:10px 16px 9px;border-radius:12px 12px 0 0;font:inherit;font-size:14px;font-weight:500;cursor:pointer;position:relative;margin-bottom:-1px}'
 +'.mo-tab:hover{color:#0c225e}'
 +'.mo-tab:focus-visible{outline:2px solid #e8730c;outline-offset:-2px}'
 +'.mo-tab em{font-style:normal;font-size:11px;line-height:1.5;background:#cfd6e1;color:#4a5568;border-radius:99px;padding:0 7px}'
 +'.mo-tab[aria-selected="true"]{background:#fff;color:#0c225e;font-weight:700}'
 +'.mo-tab[aria-selected="true"]::before{content:"";position:absolute;left:-1px;right:-1px;top:-1px;height:3px;border-radius:12px 12px 0 0;background:#e8730c}'
 +'.mo-tab[aria-selected="true"] em{background:#fde7d3;color:#b85a07}'
 +'html[data-ui="flat-dark"] .mo-tab{background:#1f1f1f;border-color:#3a3a3a;color:#b5b5b5}'
 +'html[data-ui="flat-dark"] .mo-tab[aria-selected="true"]{background:#262626;color:#f0f0f0}'
 +'.mo-check{display:flex!important;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #f3c9a3;background:#fffaf4;border-radius:12px;cursor:pointer}'
 +'.mo-check input{width:18px;height:18px;margin-top:2px;flex:none}'
 +'.mo-check b{display:block;color:#7a3a00}'
 +'.mo-check small{display:block;color:#6b7587;font-weight:400;margin-top:2px}'
 +'@media (max-width:700px){.mo-tab{padding:9px 11px 8px;font-size:13px;gap:6px}}';
 document.head.appendChild(st);
})();
