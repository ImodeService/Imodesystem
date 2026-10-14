/* js/92-v70CaseUpdatedScript.js — 2026-09-21
   เคสทั้งหมด: THE ONES THAT MOVED COME TO THE TOP, AND SAY SO UNTIL THEY ARE OPENED.

   Reported: "ตรงเคสทั้งหมด … อยากให้โชว์เคสที่มีการอัพเดตล่างสุดขึ้นมาไว้บนๆก่อน และไฮไลท์ว่าอัพเดตล่าสุด
   พอเปิดดูก็เอาไฮไลท์ออก".

   renderCases() sorts by createdAt (js/03:504), so a case opened months ago and updated five
   minutes ago sits at the bottom of the list — exactly the one the coordinator wants to see.
   On the เคสทั้งหมด tab the order becomes updatedAt instead, and anything that has moved since
   this account last opened it is marked.

   ONLY THAT TAB, as asked. The other KPI cards are status queues and are left exactly as they
   were; `allTab()` is the single condition, so widening it later is one function.

   WHERE THE "SEEN" MARK LIVES, and why not on the case. It is per PERSON — what the coordinator
   has looked at says nothing about what the technician has — and a field added to a case never
   reaches service_cases unless cloudUpsertCase() names it (part 18's rule, learned by losing the
   customers' photos). So it is a device-local key of its own, `imode_v70_seen_cases`,
   {account: {caseId: the updatedAt that was seen}}. Losing it only lights the list up once.

   THE FIRST-RUN TRAP, straight from js/74. With an empty record every case would be "updated"
   on the day this ships, which is noise, not information. The first time an account is seen,
   every case it can already see is recorded as read; only what moves afterwards is marked.

   THE SORT IS DONE AT paginateList(), not by re-ordering the rendered rows. The pager slices
   the list, so re-ordering only the page on screen would be right until the day there is more
   than one page and the newest update is on the second. paginateList() is handed the WHOLE
   filtered list before the slice, which is the only place the order can be changed honestly. */
(function(){
 'use strict';

 var KEY='imode_v70_seen_cases';

 function acct(){
  try{
   if(!currentUser)return 'guest';
   return String(currentUser.username||currentUser.id||currentUser.name||'guest');
  }catch(e){return 'guest'}
 }
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function ts(v){var n=new Date(v||0).getTime();return isNaN(n)?0:n}
 function readAll(){
  try{var v=JSON.parse(localStorage.getItem(KEY));return (v&&typeof v==='object')?v:{}}catch(e){return {}}
 }
 function writeAll(v){try{localStorage.setItem(KEY,JSON.stringify(v))}catch(e){}}

 /* The account's own record, created on first sight with everything already read. */
 function seen(){
  var all=readAll(),k=acct();
  if(!all[k]||typeof all[k]!=='object'){
   var fresh={};
   caseList().forEach(function(c){if(c&&c.id)fresh[c.id]=c.updatedAt||c.createdAt||''});
   all[k]=fresh;
   writeAll(all);
  }
  return all[k];
 }
 function isUpdated(c){
  if(!c||!c.id)return false;
  var s=seen()[c.id];
  if(s===undefined)return true;               /* opened after this account's first run */
  return ts(c.updatedAt||c.createdAt)>ts(s);
 }
 function markSeen(id){
  if(!id)return;
  var c=null,l=caseList();
  for(var i=0;i<l.length;i++)if(l[i]&&l[i].id===id){c=l[i];break}
  var all=readAll(),k=acct();
  if(!all[k]||typeof all[k]!=='object')all[k]=seen();
  all[k][id]=(c&&(c.updatedAt||c.createdAt))||new Date().toISOString();
  writeAll(all);
 }
 window.imodeMarkCaseSeen=markSeen;
 window.imodeCaseUpdatedCount=function(){
  var n=0;
  caseList().forEach(function(c){if(isUpdated(c))n++});
  return n;
 };

 function allTab(){
  var f=document.getElementById('caseStatusFilter');
  return !!f&&String(f.value||'')==='';
 }

 /* ------------------------------------------------------------- the order ---- */
 var basePaginate=window.paginateList;
 if(typeof basePaginate==='function'){
  window.paginateList=function(key,filtered,signature){
   if(key==='cases'&&allTab()&&Object.prototype.toString.call(filtered)==='[object Array]'){
    filtered=filtered.slice().sort(function(a,b){
     var d=ts(b&&(b.updatedAt||b.createdAt))-ts(a&&(a.updatedAt||a.createdAt));
     if(d)return d;
     return ts(b&&b.createdAt)-ts(a&&a.createdAt);   /* two updates in the same second */
    });
   }
   return basePaginate.call(this,key,filtered,signature);
  };
 }

 /* ------------------------------------------------------------ the marking ---- */
 function decorate(){
  if(!allTab()){
   /* leaving the tab takes the marks with it, rather than leaving them on a status queue */
   [].forEach.call(document.querySelectorAll('.is-case-updated'),function(el){
    el.classList.remove('is-case-updated');
    var chip=el.querySelector('.case-upd-chip');
    if(chip)chip.remove();
   });
   return;
  }
  var byId={};
  caseList().forEach(function(c){if(c&&c.id)byId[c.id]=c});
  var rows=document.querySelectorAll('#caseTable tr[data-case-id],#caseCards [data-case-id]');
  [].forEach.call(rows,function(row){
   var c=byId[row.getAttribute('data-case-id')];
   var on=!!(c&&isUpdated(c));
   var chip=row.querySelector('.case-upd-chip');
   row.classList.toggle('is-case-updated',on);
   if(!on){if(chip)chip.remove();return}
   if(chip)return;
   chip=document.createElement('span');
   chip.className='case-upd-chip';
   chip.textContent='อัปเดตใหม่';
   /* the ticket cell on a table row, the heading block on a mobile card */
   var host=row.querySelector('td .ticket')||row.querySelector('h4');
   if(host&&host.parentNode)host.parentNode.insertBefore(chip,host.nextSibling);
   else row.insertBefore(chip,row.firstChild);
  });
 }
 window.imodeDecorateCaseUpdates=decorate;

 var baseRender=window.renderCases;
 if(typeof baseRender==='function'){
  window.renderCases=function(){
   var r=baseRender.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 }

 /* --------------------------------------------------------------- opening ---- */
 /* Every list opens a case through one of these two: the row and the ดู button go to the
    detail page through js/28's seam, and openCaseDetail() is the popup several other paths
    still use. Both clear the mark, and the row is updated in place so the change is visible
    before the popup covers it. */
 function clearFor(id){
  try{markSeen(id)}catch(e){}
  try{
   var row=document.querySelector('[data-case-id="'+String(id).replace(/"/g,'\\"')+'"]');
   if(row){
    row.classList.remove('is-case-updated');
    var chip=row.querySelector('.case-upd-chip');
    if(chip)chip.remove();
   }
  }catch(e){}
 }
 ['imodeOpenCase','openCaseDetail'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(id){
   clearFor(id);
   return base.apply(this,arguments);
  };
 });

 /* the styles, injected at runtime: css/21 and css/23 must stay the last two <link> tags */
 var css=''
  +'#caseTable tr.is-case-updated>td{background:#fff8ec}'
  +'#caseTable tr.is-case-updated>td:first-child{box-shadow:inset 3px 0 0 #f6a11a}'
  +'#caseCards .is-case-updated{background:#fff8ec;box-shadow:inset 3px 0 0 #f6a11a}'
  +'.case-upd-chip{display:inline-block;margin-left:8px;vertical-align:middle;'
  +'font-size:10.5px;font-weight:800;line-height:1;padding:3px 8px;border-radius:999px;'
  +'background:#f6a11a;color:#fff;white-space:nowrap}'
  +'#caseCards .case-upd-chip{margin-left:0;margin-top:4px}';
 try{
  var st=document.createElement('style');
  st.setAttribute('data-from','js/92');
  st.textContent=css;
  document.head.appendChild(st);
 }catch(e){}
})();
