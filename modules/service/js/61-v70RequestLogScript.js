/* Beta 1.0 — ประวัติคำขอทั้งหมด, taken out from under the Customers page.

   Reported: "ในโมดูลลูกค้าที่ผมไปดูมามันมีคำขอลูกค้าอยู่ข้างล่าง ผมอยากให้เอาอันนั้นแยกออกมา
   และแก้เป็นประวัติคำขอทั้งหมด มีตัวกรองเหมือนในหน้าอื่นๆ หน้านี้จะไม่ลบข้อมูลเหมือนในหน้าคำขอ
   แต่จะเก็บประวัติไว้และสามารถลบประวัติคำขอได้".

   There were two lists of the same data and neither was an archive. The Customers page had a
   table buried below the customer table and its pager, where nobody looks; the คำขอจากลูกค้า
   page is an INBOX — part 21 made a request leave it the moment somebody picks the case up,
   which is right for an inbox and wrong for a record.

   So this page is the record: EVERY request ever received, including the ones the inbox has
   let go, with the same filter vocabulary as the rest of the application and the one thing an
   archive needs that an inbox must not have — a delete.

   WHAT IT IS NOT. It does not decide anything and it does not change a request's status: the
   inbox owns intake and the Service Cases page owns the work. This page reads, filters and
   deletes.

   DELETING GOES TO ถังขยะ. `request` is registered in js/40's TYPES, which is the only place
   a deletable thing may be registered — a type registered anywhere else goes into the bin and
   can never come out, because the fallback typeOf() returns a restore that answers false. The
   Supabase row goes too, or syncCloud() would put the record straight back.

   The old panel on the Customers page is HIDDEN, not removed: renderLineRequests() in js/03
   writes into #lineRequestTable by id on every render and would throw without it — the same
   reason #fieldQueue and #portalLineIdentity are still in the document.

   Uses the existing `line.view` permission key, so it registers nothing in
   PERMISSION_CATALOG and the "must load before js/20" rule does not apply. */
(function(){
 'use strict';

 var PAGE='request-log';

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function fmtAt(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}
 function reqList(){try{return Array.isArray(lineRequests)?lineRequests:[]}catch(e){return []}}
 function caseOf(r){
  try{return r&&r.caseId?((Array.isArray(cases)?cases:[]).filter(function(c){return c.id===r.caseId})[0]||null):null}
  catch(e){return null}
 }
 function customerOf(r){try{return (typeof customerById==='function')?customerById(r.customerId):null}catch(e){return null}}
 function machineOf(r){try{return (typeof machineById==='function')?machineById(r.machineId):null}catch(e){return null}}
 function can(k){try{return typeof canPermission==='function'?canPermission(k):true}catch(e){return true}}

 var TYPES=[['service','แจ้งปัญหา','Problem report'],
            ['service_quote','ขอราคา Service','Service quote'],
            ['warranty_quote','ขอราคา Warranty','Warranty quote'],
            ['warranty_check','เช็คประกัน','Warranty check']];
 function typeLabel(t){
  for(var i=0;i<TYPES.length;i++)if(TYPES[i][0]===t)return tl(TYPES[i][1],TYPES[i][2]);
  return t||tl('อื่น ๆ','Other');
 }

 /* ---------------------------------------------------------------- the page ---- */
 if(typeof PAGE_INFO!=='undefined'){
  PAGE_INFO.th[PAGE]=['ประวัติคำขอทั้งหมด','ทุกคำขอที่เคยส่งเข้ามา รวมรายการที่รับเรื่องไปแล้ว'];
  PAGE_INFO.en[PAGE]=['Request history','Every request ever received, including the ones already picked up'];
 }
 try{if(typeof PAGE_PERMISSION!=='undefined')PAGE_PERMISSION[PAGE]='line.view'}catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'🗂',th:'ประวัติคำขอ',en:'Request history',
   perm:'line.view'},'after:requests');
 }
 /* beside คำขอจากลูกค้า, under การแจ้งเตือน */
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  for(var gi=0;gi<groups.length;gi++){
   if(groups[gi].id!=='history')continue;   /* 2026-09-18: moved out of การแจ้งเตือน */
   if(groups[gi].pages.indexOf(PAGE)<0)groups[gi].pages.push(PAGE);
  }
 }catch(e){}

 function ensurePage(){
  var main=document.querySelector('main.main');
  if(!main||document.getElementById('page-'+PAGE))return;
  var sec=document.createElement('section');
  sec.id='page-'+PAGE;
  sec.className='page';
  main.appendChild(sec);
 }
 /* THE SELECTOR IS `.sidebar .side-nav`. Every module that adds a nav item uses it — js/40,
    js/43, js/45, js/49 — and the first version of this file invented `.sidebar-nav`, which
    matches nothing, so querySelector returned null, ensureNav() returned early and the menu
    entry was never created at all. The page worked; there was just no way to reach it.
    The markup is <span>icon</span><b>label</b>, matching the items already in the nav. */
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav||nav.querySelector('.nav-item[data-page="'+PAGE+'"]'))return;
  var b=document.createElement('button');
  b.className='nav-item';
  b.setAttribute('data-page',PAGE);
  b.innerHTML='<span>🗂</span><b>'+esc2(tl('ประวัติคำขอ','Request history'))+'</b>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="requests"]')
        ||nav.querySelector('.nav-item[data-page="cases"]');
  if(ref&&ref.parentNode)ref.parentNode.insertBefore(b,ref.nextSibling);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }

 /* -------------------------------------------------------------- filtering ---- */
 var state={q:'',type:'',status:'',limit:25};   /* limit 0 = ทั้งหมด */
 window.imodeReqLogSet=function(k,v){state[k]=v;if(k!=='limit')state.limit=state.limit;render()};
 window.imodeReqLogLimit=function(v){state.limit=Number(v)||0;render()};

 function matches(r){
  if(state.type&&String(r.type||'')!==state.type)return false;
  if(state.status&&String(r.status||'')!==state.status)return false;
  var s=state.q.trim().toLowerCase();
  if(!s)return true;
  var cu=customerOf(r),m=machineOf(r),c=caseOf(r);
  return [r.contact,r.phone,r.message,r.status,r.lineDisplayName,c&&c.ticket,
          cu&&cu.name,m&&m.name,m&&m.serial,m&&m.model]
   .some(function(v){return String(v||'').toLowerCase().indexOf(s)>=0});
 }

 /* ---------------------------------------------------------------- deleting ---- */
 window.imodeDeleteRequest=function(id){
  var r=reqList().filter(function(x){return x.id===id})[0];
  if(!r){if(typeof toastMsg==='function')toastMsg(tl('ไม่พบคำขอนี้','Request not found'));return {ok:false}}
  if(typeof requirePermission==='function'&&!requirePermission('line.manage'))return {ok:false};
  if(typeof window.imodeTrashPut!=='function'){
   if(typeof toastMsg==='function')toastMsg(tl('ถังขยะยังไม่พร้อม','The bin is not ready'));
   return {ok:false};
  }
  var days=25;
  try{days=Number(settings.trashRetentionDays)||30}catch(e){days=30}
  var cu=customerOf(r);
  /* The case a แจ้งปัญหา opened is a different record and is NOT deleted with the request —
     the work outlives the message that started it. Said out loud before anything moves. */
  var c=caseOf(r);
  if(!confirm(tl('ลบประวัติคำขอนี้ไปถังขยะ? กู้คืนได้ภายใน ','Move this request to the bin? Restorable within ')
    +days+tl(' วัน','days')
    +(c?tl('\n\nเคส '+(c.ticket||c.id)+' ที่เปิดจากคำขอนี้จะยังอยู่ ไม่ถูกลบไปด้วย',
           '\n\nCase '+(c.ticket||c.id)+' stays — it is not deleted with the request'):'')))return {ok:false};

  window.imodeTrashPut('request',r,{
   title:typeLabel(r.type)+' · '+((cu&&cu.name)||r.contact||r.id),
   sub:[String(r.message||'').slice(0,60),r.status,fmtAt(r.createdAt)].filter(Boolean).join(' · ')
  });
  try{lineRequests=lineRequests.filter(function(x){return x.id!==id})}catch(e){}
  /* js/40 keeps cloudDelete() to itself; same two lines, same reason — `supa` is a top-level
     let in js/03 and so absent from window. */
  try{
   var db=null;
   try{db=supa}catch(e){db=null}
   if(db)db.from('line_customer_requests').delete().eq('id',id).then(function(res){
    if(res&&res.error)console.warn('[imode] request cloud delete failed',res.error);
   },function(e){console.warn('[imode] request cloud delete threw',e)});
  }catch(e){}
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  render();
  if(typeof toastMsg==='function')toastMsg(tl('ย้ายประวัติคำขอไปถังขยะแล้ว','Request moved to the bin'));
  return {ok:true};
 };

 /* ---------------------------------------------------------------- the view ---- */
 function rowHTML(r){
  var cu=customerOf(r),m=machineOf(r),c=caseOf(r);
  var media=Array.isArray(r.media)?r.media.length:0;
  var acts='';
  if(c)acts+='<button type="button" class="rl-act" onclick="event.stopPropagation();'
   +'imodeOpenCase('+imodeJsArg(c.id)+')">'+esc2(tl('เปิดเคส','Open case'))+'</button>';
  if(r.type==='service_quote'&&can('quotation.create'))
   acts+='<button type="button" class="rl-act" onclick="event.stopPropagation();'
    +'prepareServiceQuoteFromRequest('+imodeJsArg(r.id)+')">'+esc2(tl('ทำใบเสนอราคา','Quote'))+'</button>';
  if(r.type==='warranty_quote'&&can('quotation.create'))
   acts+='<button type="button" class="rl-act" onclick="event.stopPropagation();'
    +'prepareWarrantyQuoteFromRequest('+imodeJsArg(r.id)+')">'+esc2(tl('ทำใบเสนอราคา','Quote'))+'</button>';
  if(can('line.manage'))
   acts+='<button type="button" class="rl-act is-danger" onclick="event.stopPropagation();'
    +'imodeDeleteRequest('+imodeJsArg(r.id)+')">🗑 '+esc2(tl('ลบประวัติ','Delete'))+'</button>';

  return '<tr data-req="'+esc2(r.id)+'">'
   +'<td>'+esc2(fmtAt(r.createdAt))+'</td>'
   +'<td><span class="rl-type rl-type-'+esc2(r.type||'other')+'">'+esc2(typeLabel(r.type))+'</span></td>'
   +'<td><b>'+esc2((cu&&cu.name)||r.contact||'-')+'</b>'
     +(r.phone?'<span class="subtext">'+esc2(r.phone)+'</span>':'')+'</td>'
   +'<td>'+esc2((m&&m.name)||'-')+(m&&m.serial?'<span class="subtext">S/N '+esc2(m.serial)+'</span>':'')+'</td>'
   +'<td class="rl-msg">'+esc2(String(r.message||'-').slice(0,120))
     +(media?'<span class="subtext">📷 '+media+' '+esc2(tl('ไฟล์','files'))+'</span>':'')+'</td>'
   +'<td>'+(c?'<b>'+esc2(c.ticket||c.id)+'</b><span class="subtext">'+esc2(c.status||'')+'</span>'
              :'<span class="subtext">'+esc2(tl('ไม่มีเคส','no case'))+'</span>')+'</td>'
   +'<td><span class="rl-status'+(r.status==='ใหม่'?' is-new':r.status==='เสร็จสิ้น'?' is-done':'')+'">'
     +esc2(r.status||'-')+'</span></td>'
   +'<td class="rl-ops">'+acts+'</td>'
   +'</tr>';
 }

 function render(){
  var host=document.getElementById('page-'+PAGE);
  if(!host)return;
  var all=reqList();
  var list=all.filter(matches).slice().sort(function(a,b){
   return new Date(b.createdAt||0)-new Date(a.createdAt||0);
  });
  var shown=state.limit?list.slice(0,state.limit):list.slice();
  var statuses=[];
  all.forEach(function(r){if(r.status&&statuses.indexOf(r.status)<0)statuses.push(r.status)});

  function card(id,icon,label,n){
   return '<button type="button" class="module-kpi-card" aria-pressed="'+(state.type===id)+'"'
    +' onclick="imodeReqLogSet(\'type\','+imodeJsArg(id)+')">'
    +'<i class="rl-ico" aria-hidden="true">'+icon+'</i>'
    +'<small class="rl-name">'+esc2(label)+'</small>'
    +'<b>'+n+'</b><span>'+esc2(tl('รายการ','items'))+'</span></button>';
  }
  var cards=card('','🗂',tl('ทั้งหมด','All'),all.length)
   +TYPES.map(function(t){
     var n=all.filter(function(r){return r.type===t[0]}).length;
     var icon=t[0]==='service'?'🔧':t[0]==='warranty_check'?'🛡':'💰';
     return card(t[0],icon,tl(t[1],t[2]),n);
    }).join('');

  host.innerHTML='<div class="rl-kpi case-kpi-grid">'+cards+'</div>'
   +'<div class="panel">'
   +'<div class="panel-head toolbar-head"><div>'
   +'<h3>'+esc2(tl('ประวัติคำขอทั้งหมด','Request history'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('เก็บทุกคำขอไว้ รวมรายการที่รับเรื่องไปแล้วและหายจากหน้าคำขอ',
       'Every request is kept here, including the ones already picked up and gone from the inbox'))+'</p>'
   +'</div>'
   +'<button class="soft-btn" onclick="goPage(\'requests\')">'+esc2(tl('ไปหน้าคำขอที่ยังไม่มีคนรับ','Open the inbox'))+'</button>'
   +'</div>'
   +'<div class="rl-filters">'
   +'<input type="search" placeholder="'+esc2(tl('ค้นหาลูกค้า เครื่อง เบอร์โทร เลขเคส หรือรายละเอียด',
       'Search customer, machine, phone, ticket or details'))+'" value="'+esc2(state.q)
   +'" oninput="imodeReqLogSet(\'q\',this.value)">'
   +'<select onchange="imodeReqLogSet(\'status\',this.value)"><option value="">'
   +esc2(tl('ทุกสถานะ','Every status'))+'</option>'
   +statuses.map(function(s){
      return '<option value="'+esc2(s)+'"'+(state.status===s?' selected':'')+'>'+esc2(s)+'</option>';
     }).join('')+'</select>'
   +'<select onchange="imodeReqLogLimit(this.value)" aria-label="'+esc2(tl('จำนวนที่แสดง','How many to show'))+'">'
   +[['25','25'],['50','50'],['100','100'],['0',tl('ทั้งหมด','All')]].map(function(o){
      return '<option value="'+o[0]+'"'+(String(state.limit)===o[0]?' selected':'')+'>'
       +esc2(tl('แสดง ','Show ')+o[1])+'</option>';
     }).join('')+'</select>'
   +'</div>'
   +'<div class="table-wrap"><table><thead><tr>'
   +['วันที่','ประเภท','ลูกค้า','เครื่อง','รายละเอียด','เคส','สถานะ','จัดการ']
     .map(function(h){return '<th>'+esc2(h)+'</th>'}).join('')
   +'</tr></thead><tbody>'
   +(shown.length?shown.map(rowHTML).join('')
      :'<tr><td colspan="8"><div class="empty">'
       +esc2(all.length?tl('ไม่พบคำขอตามเงื่อนไขนี้','No request matches this filter')
                       :tl('ยังไม่มีคำขอจากลูกค้า','No customer requests yet'))+'</div></td></tr>')
   +'</tbody></table></div>'
   +'<div class="rl-foot"><span>'+esc2(tl('แสดง ','Showing ')+shown.length+tl(' จาก ',' of ')+list.length
      +tl(' รายการ',' items'))+'</span>'
   +(list.length>shown.length?'<button type="button" class="soft-btn" onclick="imodeReqLogLimit(0)">'
      +esc2(tl('แสดงทั้งหมด','Show all'))+'</button>':'')+'</div>'
   +'</div>';
  wireRows(host);
 }

 /* THE ROW IS THE BUTTON, like every other list in the application. js/49 already owns the
    request detail popup and its reqList() is unfiltered, so it opens a picked-up request
    here just as happily as a waiting one — there is no second detail view to keep in step.
    Buttons inside the row keep their own jobs; a click on one never reaches this. */
 function wireRows(host){
  host.querySelectorAll('tbody tr[data-req]').forEach(function(row){
   if(row.dataset.rlWired)return;
   row.dataset.rlWired='1';
   row.classList.add('rl-rowlink');
   row.setAttribute('role','button');
   row.setAttribute('tabindex','0');
   var who=row.querySelector('td:nth-child(3) b');
   row.setAttribute('aria-label',tl('เปิดคำขอของ ','Open request from ')+((who&&who.textContent)||row.getAttribute('data-req')));
   var open=function(){
    if(typeof window.imodeOpenRequest==='function')window.imodeOpenRequest(row.getAttribute('data-req'));
   };
   row.addEventListener('click',function(e){
    if(e.target.closest('button,a,select,input,textarea,label'))return;
    open();
   });
   row.addEventListener('keydown',function(e){
    if(e.target!==row)return;
    if(['Enter',' ','Spacebar'].indexOf(e.key)<0)return;
    e.preventDefault();open();
   });
  });
 }
 window.imodeRenderRequestLog=render;

 var baseGo=window.goPage;
 if(typeof baseGo==='function'){
  window.goPage=function(name){
   if(name===PAGE)ensurePage();
   var r=baseGo.apply(this,arguments);
   if(name===PAGE)render();
   return r;
  };
 }
 var baseAll=window.renderAll;
 if(typeof baseAll==='function'){
  window.renderAll=function(){
   var r=baseAll.apply(this,arguments);
   try{
    var active=document.querySelector('main .page.active');
    if(active&&active.id==='page-'+PAGE)render();
   }catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70RequestLogStyle';
 st.textContent=''
 /* The old table under the Customers page. Hidden, not removed — renderLineRequests() in
    js/03 writes into #lineRequestTable by id on every render and would throw without it. */
 +'.line-request-panel{display:none!important}'
 +'.rl-kpi{display:grid;margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}'
 +'.rl-kpi .module-kpi-card{padding:14px 12px 12px!important;gap:2px;text-align:center;'
 +'display:flex!important;flex-direction:column;align-items:center;justify-content:flex-start;min-height:118px}'
 +'.rl-ico{font-style:normal;font-size:26px;line-height:1.15;display:block}'
 +'.rl-name{font-size:13.5px!important;font-weight:700;color:#22355c;line-height:1.35;margin-top:3px;'
 +'white-space:normal;overflow-wrap:anywhere}'
 +'.rl-kpi .module-kpi-card b{font-size:23px!important;line-height:1.15;margin-top:4px}'
 +'.rl-kpi .module-kpi-card span{font-size:11px!important;color:#6f81a3}'
 +'.rl-kpi .module-kpi-card[aria-pressed="true"] .rl-name{color:#0b3f9e}'
 +'.rl-filters{display:flex;flex-wrap:wrap;gap:9px;padding:0 14px 12px}'
 +'.rl-filters input,.rl-filters select{flex:1 1 190px;min-width:0;border:1px solid #d9e6fa;'
 +'border-radius:11px;padding:10px 12px;font-size:13px;font-family:inherit;color:#12233f;background:#fff}'
 +'.rl-filters select{flex:0 1 180px}'
 +'.rl-filters input:focus,.rl-filters select:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.rl-type{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;'
 +'background:#eef4ff;border:1px solid #cfe0fa;color:#0b3f9e;white-space:nowrap}'
 +'.rl-type-warranty_quote,.rl-type-warranty_check{background:#f3eeff;border-color:#ddd0fa;color:#5733a8}'
 +'.rl-type-service_quote{background:#fff3e2;border-color:#f3ddbd;color:#9a6516}'
 +'.rl-status{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;'
 +'background:#f2f6fc;border:1px solid #dde7f6;color:#5b6b88;white-space:nowrap}'
 +'.rl-status.is-new{background:#fdeee0;border-color:#f3d3b2;color:#b4600a}'
 +'.rl-status.is-done{background:#e9f8ef;border-color:#b6e6c9;color:#0a6b3d}'
 +'.rl-msg{max-width:320px;overflow-wrap:anywhere}'
 +'.rl-rowlink{cursor:pointer}'
 +'.rl-rowlink:hover td{background:#f4f8ff}'
 +'.rl-rowlink:focus-visible{outline:2px solid #0b63e5;outline-offset:-2px}'
 +'.rl-ops{white-space:nowrap}'
 +'.rl-act{border:1px solid #d9e6fa;border-radius:10px;padding:6px 11px;cursor:pointer;background:#fff;'
 +'color:#0c225e;font-size:12px;font-weight:700;margin:2px 3px 2px 0;font-family:inherit}'
 +'.rl-act:hover{border-color:#0b63e5;color:#0b63e5}'
 +'.rl-act.is-danger{color:#b3261e}'
 +'.rl-act.is-danger:hover{border-color:#e5a5a0;background:#fdf3f2;color:#8f1d17}'
 +'.rl-act:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.rl-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px 16px;'
 +'font-size:12.5px;color:#5b6b88}';
 document.head.appendChild(st);

 function start(){ensurePage();ensureNav()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
