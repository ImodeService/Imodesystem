/* Beta 1.0 — คำขอจากลูกค้า as a page of its own.

   REPORTED: there should be a requests page in the admin's sidebar, and anything a
   customer sends should turn up in it.

   Everything a customer sends already lands in the `lineRequests` array — แจ้งปัญหา,
   ขอราคา Service, ขอราคา Warranty and เช็คประกัน are all written by submitPortal*() in
   js/03, they travel through `line_customer_requests`, and js/42 carries the photos.
   What was missing was somewhere to look at them: the only list in the application is the
   last panel at the bottom of the Customers page, under the customer table and its pager,
   which nobody sees. So this is a new surface over data that already exists, not a new
   store — no storage key, no table, no new field.

   PERMISSION. Keyed to `line.view`, which is deliberately an EXISTING key: a script that
   pushes a new key into PERMISSION_CATALOG has to load before js/20, which repairs roles
   against the catalog as it stands at that moment, and this file loads after it. Admin /
   Coordinator and Service Manager hold line.view; no technician role does, which is the
   requested scope.

   The nav entry carries a live count of คำขอใหม่, because "เวลามีคำขออะไรมาให้ขึ้นในนี้"
   is only true if the sidebar says so without being opened first. */
(function(){
 'use strict';
 if(typeof settings!=='object'||!settings)return;

 var PAGE='requests';

 function tl(th,en){return (settings.language==='en')?en:th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function can(k){try{return typeof canPermission==='function'?canPermission(k):true}catch(e){return true}}
 function reqList(){try{return Array.isArray(lineRequests)?lineRequests:[]}catch(e){return[]}}
 function customerOf(r){try{return typeof customerById==='function'?customerById(r.customerId):null}catch(e){return null}}
 function machineOf(r){try{return typeof machineById==='function'?machineById(r.machineId):null}catch(e){return null}}
 function fmtAny(v){try{return typeof fmt==='function'?fmt(v):String(v||'')}catch(e){return String(v||'')}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}

 var TYPES=[
  ['service',       'แจ้งปัญหา',        'Problem report'],
  ['service_quote', 'ขอราคา Service',   'Service quote request'],
  ['warranty_quote','ขอราคา Warranty',  'Warranty quote request'],
  ['warranty_check','เช็คประกัน',        'Warranty check']
 ];
 function typeLabel(t){
  for(var i=0;i<TYPES.length;i++)if(TYPES[i][0]===t)return tl(TYPES[i][1],TYPES[i][2]);
  return tl('คำขออื่น','Other request');
 }
 function isNew(r){return String(r.status||'')==='ใหม่'}
 function isDone(r){return String(r.status||'')==='เสร็จสิ้น'}
 /* The sidebar badge must say the same number as the ใหม่ · รอรับเรื่อง card, so it counts
    what this page actually LISTS — pickedUp() removed, exactly like render()'s `all`.
    Counting the raw list instead made the badge include every request whose case had long
    since been acted on: 23 in the sidebar beside a card reading 1. pickedUp() is a function
    declaration further down and hoists, so calling it from here is fine. */
 function newCount(){return reqList().filter(function(r){return isNew(r)&&!pickedUp(r)}).length}
 window.imodeNewRequestCount=newCount;

 /* ------------------------------------------------------ page registration ---- */
 try{PAGE_PERMISSION[PAGE]='line.view'}catch(e){}
 try{
  if(typeof PAGE_INFO!=='undefined'){
   PAGE_INFO.th[PAGE]=['คำขอจากลูกค้า','แจ้งปัญหา ขอราคา และเช็คประกันที่ส่งเข้ามาจาก LINE OA / QR เครื่อง'];
   PAGE_INFO.en[PAGE]=['Customer requests','Problem reports, quote requests and warranty checks from the LINE OA / machine QR'];
  }
 }catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'📥',th:'คำขอจากลูกค้า',en:'Customer requests',
   perm:'line.view'},'first');
 }
 /* js/36 sorts the sidebar into named groups from a fixed page list; a page that is in none
    of them lands in อื่น ๆ at the bottom. คำขอจากลูกค้า belongs with การแจ้งเตือน — both are
    things arriving that nobody has dealt with yet. js/36 already lists it there, so this is
    only a fallback for a build where that group is missing. */
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  var placed=groups.some(function(g){return g.pages.indexOf(PAGE)>=0});
  if(!placed){
   for(var gi=0;gi<groups.length;gi++){
    if(groups[gi].id!=='alert'&&groups[gi].id!=='service')continue;
    groups[gi].pages.unshift(PAGE);
    break;
   }
  }
 }catch(e){}

 function ensurePage(){
  var main=document.querySelector('main.main');
  if(!main||document.getElementById('page-'+PAGE))return;
  var sec=document.createElement('section');
  sec.className='page';
  sec.id='page-'+PAGE;
  main.appendChild(sec);
 }
 function ensureNav(){
  var nav=document.querySelector('.sidebar .side-nav');
  if(!nav||nav.querySelector('.nav-item[data-page="'+PAGE+'"]'))return;
  var b=document.createElement('button');
  b.className='nav-item';
  b.setAttribute('data-page',PAGE);
  b.innerHTML='<span>📥</span><b>'+esc2(tl('คำขอจากลูกค้า','Customer requests'))
   +'</b><i class="req-nav-badge" data-req-badge hidden>0</i>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="cases"]');
  if(ref)nav.insertBefore(b,ref);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }
 function paintBadge(){
  var n=newCount();
  document.querySelectorAll('[data-req-badge]').forEach(function(el){
   el.textContent=n>99?'99+':String(n);
   el.hidden=!n;
  });
 }
 window.imodePaintRequestBadge=paintBadge;

 /* ------------------------------------------------- picked up = off this page ---- */
 /* Every แจ้งปัญหา opens a real case the moment the customer sends it, so "has a case" is
    not the test — every one of them would vanish on arrival. The test is whether anybody
    has ACTED on that case: as long as it is still เคสใหม่ nobody has, and the request stays
    here waiting. Assign it, answer it or move its status and the row leaves for the Service
    Cases page. A request whose case was deleted stays, because it still needs attention. */
 function caseOf(r){
  if(!r||!r.caseId)return null;
  try{return (Array.isArray(cases)?cases:[]).filter(function(c){return c.id===r.caseId})[0]||null}
  catch(e){return null}
 }
 /* 2026-09-15: a request that is finished leaves too — "เวลาทำเสร็จแล้วคำขอนั้นจะหายไปจาก
    หน้าคำขอ". For a quote request that moment is the ส่งให้ลูกค้า press, which js/62 turns into
    status เสร็จสิ้น on this row; for anything else it is somebody marking it done by hand.
    Nothing is lost: ประวัติคำขอ (js/61) keeps every request ever received. */
 function pickedUp(r){
  if(isDone(r))return true;
  var c=caseOf(r);
  return !!(c&&String(c.status||'')!=='เคสใหม่');
 }

 /* ------------------------------------------------------------- filters ---- */
 /* limit 0 = ทั้งหมด */
 var state={q:'',type:'',status:'',limit:25};
 window.imodeRequestsSet=function(k,v){
  state[k]=v;
  if(k!=='limit')state.limit=25;
  render();
 };
 window.imodeRequestsMore=function(){state.limit=state.limit?state.limit+25:0;render()};
 window.imodeRequestsLimit=function(v){state.limit=Number(v)||0;render()};

 /* กำลังดำเนินการ is not one stored status — it is everything that is neither ใหม่ nor
    เสร็จสิ้น — so it is a filter value of its own rather than a string any request carries. */
 var PROGRESS='__progress';
 function kpiTile(label,n,cls,act,on,hint){
  return '<button type="button" class="req-kpi-box'+(cls||'')+(on?' is-active':'')+'"'
   +' aria-pressed="'+(on?'true':'false')+'" onclick="'+act+'"'
   +(hint?' title="'+esc2(hint)+'"':'')+'>'
   +'<small>'+esc2(label)+'</small><b>'+n+'</b>'
   +(hint?'<i class="req-kpi-go">'+esc2(hint)+' ›</i>':'')
   +'</button>';
 }
 window.imodeRequestsShowAll=function(){state.status='';state.type='';state.limit=25;render()};
 /* goPage first: js/61 draws the page as it opens, then the filter is applied to that page. */
 window.imodeRequestsOpenClosed=function(){
  if(typeof goPage==='function')goPage('request-log');
  if(typeof window.imodeReqLogSet==='function')window.imodeReqLogSet('status','เสร็จสิ้น');
 };
 function matches(r){
  if(state.type&&String(r.type||'')!==state.type)return false;
  if(state.status===PROGRESS){if(isNew(r)||isDone(r))return false}
  else if(state.status&&String(r.status||'')!==state.status)return false;
  var s=state.q.trim().toLowerCase();
  if(!s)return true;
  var cu=customerOf(r),m=machineOf(r);
  return [r.contact,r.phone,r.message,r.status,r.lineDisplayName,
          cu&&cu.name,m&&m.name,m&&m.serial,m&&m.model]
   .some(function(v){return String(v||'').toLowerCase().indexOf(s)>=0});
 }
 /* ---------------------------------------------------- 3. how long it has waited ---- */
 /* Written once into the row and then updated in place by one 1-second tick — the list is
    never re-rendered for the clock, the same way the 30-minute response clock works, so a
    half-typed search box and the scroll position survive. */
 /* THREE AGE BANDS on a request nobody has picked up yet.
    The stored status is business data and is NOT rewritten — a row is only ever labelled by
    how long it has been sitting, and only while it is still ใหม่. A request that somebody
    has started or finished keeps its real status, as it should.
      under a day   ใหม่          green
      into day one  1 วัน         orange
      past that     เกิน 1 วัน     red */
 var DAY=86400000;
 function ageBand(iso){
  var t=new Date(iso||0).getTime();
  if(!t||isNaN(t))return 'new';
  var ms=Date.now()-t;
  if(ms<DAY)return 'new';
  if(ms<2*DAY)return 'day1';
  return 'over';
 }
 function bandLabel(b){
  return b==='over'?tl('เกิน 1 วัน','Over a day')
       : b==='day1'?tl('1 วัน','1 day')
       : tl('ใหม่','New');
 }

 function ageText(iso){
  var t=new Date(iso||0).getTime();
  if(!t||isNaN(t))return '-';
  var s=Math.max(0,Math.floor((Date.now()-t)/1000));
  var d=Math.floor(s/86400), h=Math.floor(s%86400/3600),
      m=Math.floor(s%3600/60), sec=s%60;
  var p=function(n){return n<10?'0'+n:String(n)};
  if(d)return d+tl(' วัน ',' d ')+p(h)+':'+p(m)+':'+p(sec);
  return p(h)+':'+p(m)+':'+p(sec);
 }
 function tickAges(){
  var host=document.getElementById('page-'+PAGE);
  if(!host||host.classList.contains('active')===false)return;
  host.querySelectorAll('[data-req-since]').forEach(function(el){
   el.textContent=ageText(el.getAttribute('data-req-since'));
  });
  /* A page left open across midnight would otherwise keep yesterday's colour. Swapping two
     class names and one label is cheap enough to do on the same tick as the clock. */
  host.querySelectorAll('[data-band-since]').forEach(function(row){
   var band=ageBand(row.getAttribute('data-band-since'));
   if(row.dataset.band===band)return;
   row.dataset.band=band;
   ['new','day1','over'].forEach(function(b){row.classList.toggle('is-age-'+b,b===band)});
   row.querySelectorAll('.req-status.is-age,.req-age').forEach(function(el){
    ['new','day1','over'].forEach(function(b){el.classList.toggle('is-age-'+b,b===band)});
   });
   var chip=row.querySelector('.req-status.is-age');
   if(chip)chip.textContent=bandLabel(band);
  });
 }
 setInterval(function(){try{tickAges()}catch(e){}},1000);

 function sorted(list){
  return list.slice().sort(function(a,b){
   return new Date(b.createdAt||0)-new Date(a.createdAt||0);
  });
 }

 /* -------------------------------------------------------------- render ---- */
 function actionsHTML(r){
  var out='';
  if(r.caseId)out+='<button type="button" class="req-act" onclick="event.stopPropagation();'
   +'imodeOpenRequestCase('+imodeJsArg(r.caseId)+')">'+esc2(tl('เปิดเคส','Open case'))+'</button>';
  if(r.type==='service_quote'&&can('quotation.create'))
   out+='<button type="button" class="req-act" onclick="event.stopPropagation();'
    +'prepareServiceQuoteFromRequest('+imodeJsArg(r.id)+')">'+esc2(tl('ทำใบเสนอราคา','Quote'))+'</button>';
  if(r.type==='warranty_quote'&&can('quotation.create'))
   out+='<button type="button" class="req-act" onclick="event.stopPropagation();'
    +'prepareWarrantyQuoteFromRequest('+imodeJsArg(r.id)+')">'+esc2(tl('ทำใบเสนอราคา','Quote'))+'</button>';
  /* The สถานะ button is gone on purpose. A คำขอ is an inbox item, not a second place to
     track a job: once somebody picks the case up it leaves this page altogether and the
     Service Cases page is the one record of where the work stands. */
  /* 2026-09-25: "เพิ่มปุ่มลบคำขอ". The delete itself is js/61's imodeDeleteRequest — to the bin,
     restorable, the cloud row removed, the case it opened left alone — so this page and
     ประวัติคำขอ delete the same way. Same key js/61 checks: line.manage. */
  if(can('line.manage')&&typeof window.imodeDeleteRequest==='function')
   out+='<button type="button" class="req-act req-act-del" onclick="event.stopPropagation();'
    +'imodeRequestsDelete('+imodeJsArg(r.id)+')">🗑 '+esc2(tl('ลบ','Delete'))+'</button>';
  return out;
 }
 window.imodeRequestsDelete=function(id){
  try{var md=document.getElementById('modal');if(md&&md.classList.contains('open')&&typeof closeModal==='function')closeModal()}catch(e){}
  window.imodeDeleteRequest(id);
 };
 function rowHTML(r){
  var cu=customerOf(r),m=machineOf(r);
  var media=Array.isArray(r.media)?r.media.length:0;
  var band=isNew(r)?ageBand(r.createdAt):'';
  return '<div class="req-row'+(isNew(r)?' is-new is-age-'+band:'')+(isDone(r)?' is-done':'')+'"'
   +' data-req="'+esc2(r.id)+'"'+(isNew(r)?' data-band-since="'+esc2(r.createdAt||'')+'"':'')
   +' role="button" tabindex="0" aria-label="'+esc2(tl('เปิดคำขอ','Open request'))+'">'
   +'<div class="req-row-main">'
   +'<div class="req-row-top">'
   +'<span class="req-type req-type-'+esc2(r.type||'other')+'">'+esc2(typeLabel(r.type))+'</span>'
   +'<span class="req-status'+(isNew(r)?' is-age is-age-'+band:isDone(r)?' is-done':'')+'">'
   +esc2(isNew(r)?bandLabel(band):(r.status||'-'))+'</span>'
   +(media?'<span class="req-media">📷 '+media+'</span>':'')
   +'</div>'
   +'<b>'+esc2((cu&&cu.name)||r.contact||tl('ไม่ระบุลูกค้า','Unknown customer'))+'</b>'
   +'<small>'+esc2(m?((m.name||'-')+(m.serial?' · S/N '+m.serial:'')):tl('ไม่ระบุเครื่อง','No machine'))+'</small>'
   +'<p>'+esc2(String(r.message||'-').slice(0,180))+'</p>'
   +'<div class="req-foot">'
   +'<span class="req-age'+(isNew(r)?' is-age-'+band:'')+'">'+esc2(tl('รอมาแล้ว','Waiting'))
   +' <b data-req-since="'+esc2(r.createdAt||'')+'">'+esc2(ageText(r.createdAt))+'</b></span>'
   +'<small>'+esc2(fmtAny(r.createdAt))
   +(r.contact?' · '+esc2(r.contact):'')+(r.phone?' · '+esc2(r.phone):'')+'</small>'
   +'</div>'
   +'</div>'
   +'<div class="req-row-side">'+actionsHTML(r)+'</div>'
   +'</div>';
 }

 function render(){
  var host=document.getElementById('page-'+PAGE);
  if(!host)return;
  var everything=reqList();
  var moved=everything.filter(pickedUp).length;      /* now living on the Service Cases page */
  var all=everything.filter(function(r){return !pickedUp(r)});
  var list=sorted(all.filter(matches));
  var shown=state.limit?list.slice(0,state.limit):list.slice();

  var statuses=[];
  all.forEach(function(r){if(r.status&&statuses.indexOf(r.status)<0)statuses.push(r.status)});

  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div>'
   +'<h3>'+esc2(tl('คำขอที่ลูกค้าส่งเข้ามา','Requests from customers'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('แจ้งปัญหา ขอราคา และเช็คประกัน จาก LINE OA และ QR บนเครื่อง',
      'Problem reports, quote requests and warranty checks from the LINE OA and the machine QR'))+'</p>'
   +'</div>'
   +'<button class="soft-btn" onclick="imodeRequestsSet(\'status\',\'ใหม่\')">'
   +esc2(tl('ดูเฉพาะคำขอใหม่','New only'))+'</button></div>'
   /* 2026-09-15: the four tiles are buttons — "ผมอยากให้ปุ่มพวกนี้กดได้". Three of them filter
      this list; ปิดเรื่องแล้ว cannot, because a closed request has already left this page
      (pickedUp() drops it), so filtering here would always show nothing. That one opens
      ประวัติคำขอ, where closed requests live, already filtered to เสร็จสิ้น. */
   /* Order, on the owner's instruction: ทั้งหมด first on the left, the history door
      (ปิดเรื่องแล้ว → ประวัติคำขอ) last on the far right. */
   +'<div class="req-kpi">'
   +kpiTile(tl('ทั้งหมด','Total'),all.length,
            '',"imodeRequestsShowAll()",!state.status&&!state.type)
   +kpiTile(tl('ใหม่ · รอรับเรื่อง','New'),all.filter(isNew).length,
            newCount()?' is-new':'',"imodeRequestsSet('status','ใหม่')",state.status==='ใหม่')
   +kpiTile(tl('กำลังดำเนินการ','In progress'),all.filter(function(r){return !isNew(r)&&!isDone(r)}).length,
            '',"imodeRequestsSet('status','"+PROGRESS+"')",state.status===PROGRESS)
   +kpiTile(tl('ปิดเรื่องแล้ว','Closed'),everything.filter(isDone).length,
            ' is-link',"imodeRequestsOpenClosed()",false,
            tl('เปิดในประวัติคำขอ','Opens in the request history'))
   +'</div>'
   +'<div class="req-filters">'
   +'<input type="search" class="req-search" placeholder="'
   +esc2(tl('ค้นหาลูกค้า เครื่อง เบอร์โทร หรือรายละเอียด','Search customer, machine, phone or details'))
   +'" value="'+esc2(state.q)+'" oninput="imodeRequestsSet(\'q\',this.value)">'
   +'<select onchange="imodeRequestsSet(\'type\',this.value)"><option value="">'
   +esc2(tl('ทุกประเภท','Every type'))+'</option>'
   +TYPES.map(function(t){
      return '<option value="'+t[0]+'"'+(state.type===t[0]?' selected':'')+'>'+esc2(tl(t[1],t[2]))+'</option>';
     }).join('')+'</select>'
   +'<select onchange="imodeRequestsSet(\'status\',this.value)"><option value="">'
   +esc2(tl('ทุกสถานะ','Every status'))+'</option>'
   /* The กำลังดำเนินการ tile's filter, so the dropdown shows what the tile chose. */
   +'<option value="'+PROGRESS+'"'+(state.status===PROGRESS?' selected':'')+'>'
   +esc2(tl('กำลังดำเนินการ (ทุกสถานะที่ยังไม่ปิด)','In progress (anything not closed)'))+'</option>'
   +statuses.map(function(s){
      return '<option value="'+esc2(s)+'"'+(state.status===s?' selected':'')+'>'+esc2(s)+'</option>';
     }).join('')+'</select>'
   +'<select class="req-limit" onchange="imodeRequestsLimit(this.value)" aria-label="'
   +esc2(tl('จำนวนที่แสดง','How many to show'))+'">'
   +[['10','10'],['25','25'],['50','50'],['100','100'],['0',tl('ทั้งหมด','All')]].map(function(o){
      return '<option value="'+o[0]+'"'+(String(state.limit)===o[0]?' selected':'')+'>'
       +esc2(tl('แสดง ','Show ')+o[1])+'</option>';
     }).join('')+'</select>'
   +'</div>'
   +(moved?'<p class="req-moved">'+esc2(tl('รับเรื่อง / ปิดเรื่องแล้ว ','Handled: ')+moved
      +tl(' คำขอ — ออกจากกล่องคำขอแล้ว ดูต่อได้ที่หน้าเคสงานบริการหรือประวัติคำขอ',
          ' request(s) — out of the inbox; follow them on the Service Cases page or in the request history'))
      +' <button type="button" class="req-link" onclick="goPage(&quot;cases&quot;)">'
      +esc2(tl('ไปที่หน้าเคส','Go to cases'))+' ›</button>'
      +' <button type="button" class="req-link" onclick="goPage(&quot;request-log&quot;)">'
      +esc2(tl('ประวัติคำขอทั้งหมด','Full request history'))+' ›</button></p>':'')
   +'<div class="req-list">'+(shown.length?shown.map(rowHTML).join('')
      :'<div class="empty">'+esc2(all.length?tl('ไม่พบคำขอตามเงื่อนไขนี้','No request matches this filter')
                                            :tl('ยังไม่มีคำขอจากลูกค้า','No customer requests yet'))+'</div>')+'</div>'
   +(list.length
     ?'<div class="req-more"><span class="req-count">'
      +esc2(list.length>shown.length
        ?tl('แสดง ','Showing ')+shown.length+tl(' จาก ',' of ')+list.length
        :tl('แสดงครบ ','Showing all ')+list.length+tl(' รายการ',' items'))+'</span>'
      +(list.length>shown.length
        ?'<button type="button" class="soft-btn" onclick="imodeRequestsMore()">'
         +esc2(tl('แสดงเพิ่ม','Show more'))+' ('+(list.length-shown.length)+')</button>':'')
      +'</div>':'')
   +'</div>';

  host.querySelectorAll('.req-row').forEach(function(row){
   var open=function(){window.imodeOpenRequest(row.getAttribute('data-req'))};
   row.addEventListener('click',function(e){if(!e.target.closest('button,a,select,input'))open()});
   row.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();open()}
   });
  });
  paintBadge();
 }
 window.imodeRenderRequests=render;
 /* js/61 ends a delete with renderAll(), which does not draw this page — redraw it here when
    it is the page on screen, so the deleted row goes at once. */
 var baseAllReq=window.renderAll;
 if(typeof baseAllReq==='function')window.renderAll=function(){
  var r=baseAllReq.apply(this,arguments);
  try{var p=document.getElementById('page-'+PAGE);if(p&&p.classList.contains('active'))render()}catch(e){}
  return r;
 };

 /* ---------------------------------------------------------- the request ---- */
 /* The case a แจ้งปัญหา opened lives in the application; js/28 routes the seam to the
    standalone workspace, so use it rather than reopening the legacy popup. */
 window.imodeOpenRequestCase=function(cid){
  if(typeof window.imodeOpenCase==='function')window.imodeOpenCase(cid);
  else if(typeof openCaseDetail==='function')openCaseDetail(cid);
 };
 window.imodeOpenRequest=function(id){
  var r=reqList().filter(function(x){return x.id===id})[0];
  if(!r){toast(tl('ไม่พบคำขอ','Request not found'));return}
  if(typeof window.openModal!=='function')return;
  var cu=customerOf(r),m=machineOf(r);
  var rows=[
   [tl('ประเภท','Type'),typeLabel(r.type)],
   [tl('สถานะ','Status'),r.status||'-'],
   [tl('ส่งเมื่อ','Received'),fmtAny(r.createdAt)],
   [tl('ลูกค้า','Customer'),(cu&&cu.name)||'-'],
   [tl('เครื่อง','Machine'),m?((m.name||'-')+(m.model?' · '+m.model:'')):'-'],
   [tl('ซีเรียล','Serial'),(m&&m.serial)||'-'],
   [tl('ผู้ติดต่อ','Contact'),r.contact||'-'],
   [tl('โทรศัพท์','Phone'),r.phone||'-']
  ];
  if(r.priority)rows.push([tl('ความเร่งด่วน','Priority'),r.priority]);
  if(r.serviceMode)rows.push([tl('รูปแบบบริการ','Service mode'),
   r.serviceMode==='WS'?'Workshop Service':r.serviceMode==='DG'?'Diagnosis Only':'Onsite Service']);
  if(r.months)rows.push([tl('ระยะประกันที่ขอ','Months requested'),String(r.months)]);
  if(r.lineDisplayName)rows.push(['LINE',r.lineDisplayName]);

  var media='';
  try{if(typeof window.imodeCaseMediaHTML==='function')media=window.imodeCaseMediaHTML(r)||''}catch(e){}

  window.openModal(typeLabel(r.type),(cu&&cu.name)||r.contact||'',
   '<div class="detail-grid">'
   +rows.map(function(x){return '<div class="detail-box"><small>'+esc2(x[0])+'</small><b>'+esc2(x[1])+'</b></div>'}).join('')
   +'<div class="detail-box full"><small>'+esc2(tl('รายละเอียดจากลูกค้า','What the customer wrote'))
   +'</small><b>'+esc2(r.message||'-')+'</b></div></div>'
   +media
   +'<div class="button-row" style="margin-top:14px">'+actionsHTML(r)+'</div>');
 };

 /* --------------------------------------------------------------- wiring ---- */
 /* renderAll() does not know about this page — it is created here — so it is drawn by the
    goPage wrapper, the way js/16 draws งานของฉัน and js/43 draws ดูใบเสนอราคา. The badge
    is cheap and is repainted on every render so the sidebar is right without opening it. */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(){
   var r=baseGoPage.apply(this,arguments);
   try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
   return r;
  };
 }
 var baseRenderAll=window.renderAll;
 if(typeof baseRenderAll==='function'){
  window.renderAll=function(){
   var r=baseRenderAll.apply(this,arguments);
   try{
    ensureNav();
    paintBadge();
    if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render();
   }catch(e){}
   return r;
  };
 }
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{
     paintBadge();
     if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render();
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }
 /* Changing a request's status goes through js/03's saveLineRequestStatus(), which redraws
    only the Customers-page table. Redraw this page and the badge too. */
 var baseSaveStatus=window.saveLineRequestStatus;
 if(typeof baseSaveStatus==='function'){
  window.saveLineRequestStatus=function(){
   var r=baseSaveStatus.apply(this,arguments);
   try{paintBadge();render()}catch(e){}
   return r;
  };
 }

 /* --------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70RequestsStyle';
 st.textContent=''
 +'.req-nav-badge{margin-left:auto;font-style:normal;font-size:10.5px;font-weight:800;'
 +'background:#f2810c;color:#fff;border-radius:999px;padding:1px 7px;min-width:18px;text-align:center}'
 +'.nav-item .req-nav-badge[hidden]{display:none!important}'
 +'.req-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:0 14px 12px}'
 +'.req-kpi-box{border:1px solid #e2ecfb;border-radius:13px;background:#f8fbff;padding:10px 13px}'
 +'.req-kpi-box small{display:block;font-size:10.5px;color:#7385a5;margin-bottom:3px}'
 +'.req-kpi-box b{font-size:17px;color:#0c225e}'
 +'.req-kpi-box.is-new{border-color:#f5c9a6;background:#fff6ee}'
 +'.req-kpi-box.is-new b{color:#b4600a}'
 /* The tiles are buttons now. A <button> brings the UA font and centring with it, so those are
    reset, and the tile gets the press feel the rest of the app uses. */
 +'button.req-kpi-box{display:block;width:100%;font:inherit;text-align:left;cursor:pointer;'
 +'color:inherit;transition:border-color .15s,background .15s,box-shadow .15s,transform .12s}'
 +'button.req-kpi-box:hover{border-color:#b9d3f5;box-shadow:0 6px 14px rgba(16,54,128,.08)}'
 +'button.req-kpi-box:active{transform:translateY(1px)}'
 +'button.req-kpi-box:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'button.req-kpi-box.is-active{border-color:#0b63e5;background:#eef5ff;box-shadow:inset 0 0 0 1px #0b63e5}'
 +'button.req-kpi-box.is-new.is-active{border-color:#e07a14;background:#fff0e2;box-shadow:inset 0 0 0 1px #e07a14}'
 +'.req-kpi-go{display:block;margin-top:3px;font-style:normal;font-size:10px;font-weight:700;color:#0b63e5}'
 +'.req-filters{display:flex;flex-wrap:wrap;gap:9px;padding:0 14px 12px}'
 +'.req-filters input,.req-filters select{flex:1 1 180px;min-width:0;border:1px solid #d9e6fa;'
 +'border-radius:11px;padding:9px 11px;font-size:13px;background:#fff;color:#0c225e;min-height:38px}'
 +'.req-filters input:focus,.req-filters select:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.req-list{display:flex;flex-direction:column;gap:9px;padding:0 14px 14px}'
 +'.req-row{display:flex;align-items:flex-start;gap:13px;border:1px solid #e2ecfb;border-radius:14px;'
 +'background:#fff;padding:12px 14px;cursor:pointer;'
 +'transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}'
 +'.req-row:hover{border-color:#0b63e5;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,99,229,.12)}'
 +'.req-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* the three age bands — green while it is fresh, orange on day one, red past that */
 +'.req-row.is-new.is-age-new{border-color:#b6e6c9;background:#f5fdf8}'
 +'.req-row.is-new.is-age-day1{border-color:#f3d3b2;background:#fffaf4}'
 +'.req-row.is-new.is-age-over{border-color:#f0b4b4;background:#fff7f7}'
 +'.req-row.is-done{opacity:.72}'
 +'.req-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}'
 /* 9. the row text was too small to scan — every size here went up a step and the
    customer name now leads the row properly. */
 +'.req-row-main b{font-size:16.5px;line-height:1.45;color:#0c225e}'
 +'.req-row-main small{font-size:13px;color:#5b6b88}'
 +'.req-row-main p{margin:5px 0 3px;font-size:14.5px;color:#22355c;line-height:1.6;'
 +'overflow-wrap:anywhere}'
 /* 3. how long the request has been waiting */
 +'.req-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:4px}'
 +'.req-age{font-size:12.5px;font-weight:700;color:#5b6b88;border:1px solid #dde7f6;'
 +'background:#f5f9ff;border-radius:999px;padding:2px 11px;white-space:nowrap}'
 +'.req-age b{font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#0c225e;'
 +'font-variant-numeric:tabular-nums}'
 +'.req-age.is-age-new{border-color:#b6e6c9;background:#f2fbf6;color:#0a6b3d}'
 +'.req-age.is-age-new b{color:#07603a}'
 +'.req-age.is-age-day1{border-color:#f3d3b2;background:#fff6ec;color:#9a6516}'
 +'.req-age.is-age-day1 b{color:#b4600a}'
 +'.req-age.is-age-over{border-color:#f0b4b4;background:#fff4f4;color:#a3241f}'
 +'.req-age.is-age-over b{color:#b3261e}'
 /* 4. how many to show, and where the picked-up ones went */
 +'.req-limit{flex:0 1 150px!important}'
 +'.req-moved{margin:0 14px 10px;padding:9px 13px;border-radius:11px;background:#f2f7ff;'
 +'border:1px solid #cfe0fa;color:#0b3f9e;font-size:12.8px;line-height:1.55}'
 +'.req-link{border:0;background:none;padding:0;font:inherit;font-weight:800;color:#0b3f9e;'
 +'cursor:pointer;text-decoration:underline}'
 +'.req-count{font-size:12.5px;color:#5b6b88}'
 +'.req-row-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:2px}'
 +'.req-type{font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 9px;'
 +'background:#eef4ff;border:1px solid #cfe0fa;color:#0b3f9e}'
 +'.req-type-warranty_quote,.req-type-warranty_check{background:#f3eeff;border-color:#ddd0fa;color:#5733a8}'
 +'.req-type-service_quote{background:#fff3e2;border-color:#f3ddbd;color:#9a6516}'
 +'.req-status{font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 9px;'
 +'background:#f2f6fc;border:1px solid #dde7f6;color:#5b6b88}'
 +'.req-status.is-age-new{background:#e9f8ef;border-color:#b6e6c9;color:#0a6b3d}'
 +'.req-status.is-age-day1{background:#fdeee0;border-color:#f3d3b2;color:#b4600a}'
 +'.req-status.is-age-over{background:#fdecec;border-color:#f0b4b4;color:#b3261e}'
 +'.req-status.is-done{background:#e9f8ef;border-color:#b6e6c9;color:#0a6b3d}'
 +'.req-media{font-size:10.5px;font-weight:800;color:#0b3f9e}'
 +'.req-row-side{flex:none;display:flex;flex-direction:column;gap:7px;align-items:stretch}'
 +'.req-act.req-act-del{border-color:#f3c9c6;background:#fff5f4;color:#b42318}'
 +'.req-act{border:1px solid #d9e6fa;border-radius:11px;padding:7px 13px;cursor:pointer;'
 +'white-space:nowrap;background:#fff;color:#0c225e;font-size:12px;font-weight:800;min-height:32px}'
 +'.req-act:hover{border-color:#0b63e5;color:#0b63e5}'
 +'.req-act.is-primary{background:#0b63e5;border-color:#0b63e5;color:#fff}'
 +'.req-act.is-primary:hover{background:#0a54c4;color:#fff}'
 +'.req-act:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.req-more{padding:0 14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}'
 +'@media (max-width:640px){'
 +'.req-row{flex-direction:column;align-items:stretch}'
 +'.req-row-side{flex-direction:row;flex-wrap:wrap}'
 +'.req-act{flex:1 1 auto}'
 +'.req-filters input,.req-filters select{flex:1 1 100%}'
 +'}'
 +'@media (prefers-reduced-motion:reduce){.req-row{transition:none}.req-row:hover{transform:none}}';
 document.head.appendChild(st);

 function install(){
  ensurePage();
  ensureNav();
  paintBadge();
  try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
