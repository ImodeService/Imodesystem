/* Beta — ดูใบเสนอราคา: the coordinator gets a place to read, send and track quotations.

   Three requests that are one screen and one missing step:

     3 + 5. "สร้างโมดุลดูใบเสนอราคาให้กับแอดมิน" / "เพิ่มหน้าดูใบเสนอราคาของแอดมิน"
     4.     "หน้าดูใบเสนอราคาของลูกค้า เวลาแอดมินสร้างใบเสนอราคาเสร็จ ใบเสนอราคาไม่อัพเดตไปยังลูกค้า"

   WHY 4 HAPPENS — measured against the live database, not guessed. Both quotations in
   `quotations` are status "ร่าง". saveQuotation() in js/03 stamps `status: old?.status||'ร่าง'`
   on every new quotation, and js/34 deliberately holds ร่าง back from the customer page so a
   half-finished calculation never reads as an offer. So the delivery mechanism was fine —
   the quotation reached the customer's device through cloudUpsertQuotation() and syncCloud()
   exactly as designed — and then sat there hidden, because nothing in the application ever
   moved it off ร่าง except a status popup gated behind `quotation.approve` and buried two
   clicks into a row. Nobody would find it, so nobody did.

   The fix is the missing step, not a change to the rule: an explicit ส่งให้ลูกค้า, offered at
   the moment the coordinator finishes the quotation and again on every draft row here.

   A SECOND BUG, FOUND WHILE READING THE LIVE ROWS. `quotations.warranty` is a text column,
   so the boolean is stored as the STRING "false" — and fromQuotationDb() reads it as
   `!!q.warranty`, which for "false" is **true**. Every quotation that came back from the
   cloud therefore claimed to be under warranty, and quotationDocHTML() zeroes every machine
   line when it is: the document printed 0.00 for the work and a correct Grand Total under
   it. Same expression also drives the warrantyMode fallback. Repaired on the way in, so rows
   already in the database are read correctly without touching them.

   A THIRD, from the same read: cloudUpsertQuotation() has no column for the derived
   breakdown — serviceFee, emergency, travel, pickup, labor, partsTotal, other, discount are
   all dropped — so a quotation opened on any device other than the one that built it was
   missing its Travel, Pickup, Labor and Other lines while the total still counted them.
   Recomputed here from the inputs that ARE stored (distance, pickupMode, extraHours,
   extraTechs, toll, otherExpense) using js/03's own rate helpers, so the document adds up
   again. Nothing is written back and no schema changes.

   Read-and-send only. The calculator stays the one place a quotation is built; แก้ไข hands
   the visitor to it through the existing loadQuotation(). Uses the existing `quotation.view`
   permission key, so it registers nothing in PERMISSION_CATALOG and the "must load before
   js/20" rule does not apply. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function quoteList(){try{return Array.isArray(quotations)?quotations:[]}catch(e){return[]}}
 function money2(v){
  try{if(typeof window.money==='function')return window.money(v)}catch(e){}
  return (Number(v)||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' ฿';
 }
 function fmtAny(v){try{return v&&typeof fmt==='function'?fmt(v):(v||'-')}catch(e){return v||'-'}}
 function can(k){try{return typeof canPermission==='function'?canPermission(k):true}catch(e){return true}}

 /* ------------------------------------------------- 0. repair what comes back ---- */
 function truthy(v){
  if(typeof v==='boolean')return v;
  var s=String(v==null?'':v).trim().toLowerCase();
  return s==='true'||s==='t'||s==='1'||s==='yes';
 }
 var baseFromQuote=window.fromQuotationDb;
 if(typeof baseFromQuote==='function'){
  window.fromQuotationDb=function(row){
   var q=baseFromQuote.apply(this,arguments);
   try{
    var w=truthy(row&&row.warranty);
    q.warranty=w;
    /* The base fallback is `q.warranty_mode || (q.warranty ? 'repair' : 'none')` and uses
       the same raw string, so it has to be redone with the corrected value. */
    if(!(row&&row.warranty_mode))q.warrantyMode=w?'repair':'none';
   }catch(e){}
   return q;
  };
 }

 /* -------------------------------------------- 1. the breakdown, recomputed ---- */
 /* Exactly the rules in calcQuote(), applied only to fields the wire dropped. A quotation
    that still has its own numbers — the one just built on this device — is untouched. */
 function withTotals(q){
  var o={},k;
  for(k in q)if(Object.prototype.hasOwnProperty.call(q,k))o[k]=q[k];
  var has=function(f){return typeof o[f]==='number'&&isFinite(o[f])};
  if(has('travel')&&has('pickup')&&has('labor')&&has('other'))return o;

  var cfg={};
  try{cfg=(typeof quoteCfg==='function')?quoteCfg():{}}catch(e){cfg={}}
  var t={fee:0};
  try{if(typeof getQuoteTravel==='function')t=getQuoteTravel(o.distance||0)}catch(e){}
  var extend=o.warrantyMode==='extend', underWarranty=!!o.warranty;

  if(!has('travel'))o.travel=(o.service==='OS'&&!extend&&!underWarranty)?(Number(t.fee)||0):0;
  if(!has('pickup')){
   var pm=Number(o.pickupMode)||0;
   o.pickup=extend?0:(pm===3?(Number(t.fee)||0)*2:(pm===1||pm===2?(Number(t.fee)||0):0));
  }
  if(!has('labor')){
   var large=false;
   try{
    large=(o.machineIds||[]).some(function(mid){
     return inferredMachineSize(machineById(mid)).size==='L';
    });
   }catch(e){}
   o.labor=(extend||underWarranty)?0
    :(Number(o.extraHours)||0)*(Number(o.extraTechs)||0)*(large?(cfg.laborL||0):(cfg.laborS||0));
  }
  if(!has('other'))o.other=(Number(o.toll)||0)+(Number(o.otherExpense)||0);
  return o;
 }
 window.imodeQuoteWithTotals=withTotals;

 /* ------------------------------------------------------------- 2. sending ---- */
 var SENT_STATUS='ส่งแล้ว';
 function sendStatus(){
  /* settings.quotationStatuses is configurable; use the configured "sent" word if the
     default one was renamed, and fall back to the second entry (ร่าง is always first). */
  var list=[];
  try{list=settings.quotationStatuses||[]}catch(e){}
  if(list.indexOf(SENT_STATUS)>=0)return SENT_STATUS;
  return list[1]||SENT_STATUS;
 }
 function isDraft(q){
  var list=[];
  try{list=settings.quotationStatuses||[]}catch(e){}
  return String(q&&q.status||'')===(list[0]||'ร่าง');
 }
 window.imodeQuoteIsDraft=isDraft;

 /* One place does the sending, so the row button, the document popup and the prompt after
    saving all behave identically — including the push, which is what actually puts it in
    front of the customer. */
 /* ------------------------------------------------- what happens when it is sent ----
    2026-09-18, three things the owner reported together:

      "แอดมินกดส่งใบเสนอราคาไปแล้วแต่อัพเดตสถานะหลังลูกค้าส่ง และมันทำให้สถานะของลูกค้ากับใบเสนอราคา
       ไม่อัพเดต ... อยากให้หลังกดส่งใบเสนอราคา จากหน้าของเคส อัพเดตสถานะเคสนั้นเป็น นัดหมาย/มอบหมาย"
      "เวลากดทำใบเสนอราคาจากหน้าเคส พอทำเสร็จและกดส่งให้เด้งกลับไปที่เคสนั้นๆเลย แต่ถ้าไม่มี … ก็ให้อยู่
       ในโมดุลนั้นที่เดิม"
      "เพิ่มแจ้งเตือนเป็น pop up ด้วย ว่า ส่งใบเสนอราคาสำเร็จ หรือไม่สำเร็จ"

    The case is moved only out of เคสใหม่, and only to มอบหมายแล้ว — never straight to
    นัดหมายแล้ว. That status means a real date is on the case, the calendar filters on it, and
    a case put there without one disappears from the calendar; that is the repair part 25 had
    to do by hand for 19 cases. A case that already has an appointment, or that is further
    along, is left exactly where it is. */
 var EARLY_CASE='เคสใหม่',ASSIGNED='มอบหมายแล้ว';
 function advanceCaseForQuote(q){
  try{
   if(!q||!q.caseId||!Array.isArray(cases))return null;
   var c=cases.filter(function(x){return x&&x.id===q.caseId})[0];
   if(!c||String(c.status||'')!==EARLY_CASE)return null;
   if((settings.statuses||[]).indexOf(ASSIGNED)<0)return null;
   c.status=ASSIGNED;
   c.updatedAt=new Date().toISOString();
   try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
   try{if(typeof cloudUpsertCase==='function')cloudUpsertCase(c)}catch(e){}
   return c;
  }catch(e){return null}
 }
 /* cloudUpsertQuotation() builds the payload in js/03 and returns nothing, so the outcome is
    captured by standing in front of cloudUpsert for the duration of that one call — the same
    technique js/42 uses for the media column. JavaScript is single threaded and the base
    awaits inside this window, so no unrelated write can be mistaken for this one. */
 function pushQuote(q){
  var base=window.cloudUpsert,seen=null;
  if(typeof window.cloudUpsertQuotation!=='function')return Promise.resolve({ok:true,offline:true});
  if(typeof base!=='function')return Promise.resolve({ok:true,offline:true});
  window.cloudUpsert=function(table,obj){
   var r=base.apply(this,arguments);
   if(table==='quotations'){
    if(r&&typeof r.then==='function')return r.then(function(v){seen=v||{ok:true};return v});
    seen=r||{ok:true};
   }
   return r;
  };
  var done=function(){window.cloudUpsert=base;return seen||{ok:true,offline:true}};
  var out;
  try{out=window.cloudUpsertQuotation(q)}
  catch(e){window.cloudUpsert=base;return Promise.resolve({ok:false,error:e})}
  if(out&&typeof out.then==='function')return out.then(done,function(e){window.cloudUpsert=base;return {ok:false,error:e}});
  return Promise.resolve(done());
 }
 function sentPopup(q,res,thenGo){
  var offline=!!(res&&res.offline),ok=!res||res.ok!==false;
  var go=function(){try{thenGo&&thenGo()}catch(e){}};
  var msg=ok
   ? q.id+' · '+(q.customer||'-')+'\n'
     +(offline?tl('บันทึกแล้วในเครื่องนี้ · ยังไม่ได้ส่งขึ้นระบบกลาง จะส่งอัตโนมัติเมื่อเชื่อมต่อ',
                  'Saved on this device — it will go up on the next sync')
             :tl('ลูกค้าเห็นใบนี้ในหน้าหลักลูกค้าแล้ว','The customer can see it on their home page now'))
   : q.id+'\n'+tl('ส่งขึ้นระบบกลางไม่สำเร็จ ใบนี้ยังอยู่ในเครื่องนี้ กรุณาลองใหม่หรือตรวจการเชื่อมต่อ',
                  'Could not reach the server — the quotation is still on this device');
  if(typeof window.imodeNotice==='function'){
   window.imodeNotice({
    danger:!ok,
    title:ok?tl('ส่งใบเสนอราคาสำเร็จ','Quotation sent'):tl('ส่งใบเสนอราคาไม่สำเร็จ','Could not send'),
    message:msg,
    okText:ok?tl('ตกลง','OK'):tl('ปิด','Close')
   }).then(go,go);
   return;
  }
  toast(ok?tl('ส่งใบเสนอราคาแล้ว','Quotation sent'):tl('ส่งไม่สำเร็จ','Could not send'));
  go();
 }

 window.imodeSendQuoteToCustomer=function(id,quiet){
  var q=quoteList().filter(function(x){return x.id===id})[0];
  if(!q){toast(tl('ไม่พบใบเสนอราคา','Quotation not found'));return}
  if(!isDraft(q)){
   if(!quiet)toast(tl('ใบนี้ส่งให้ลูกค้าแล้ว','This quotation has already been sent'));
   render();
   return;
  }
  /* Where the visitor is standing when they press it decides where they end up: from the
     builder, back to the case the quotation belongs to; from this module, stay here. */
  var fromBuilder=false;
  try{fromBuilder=((document.querySelector('.page.active')||{}).id||'')==='page-quotation'}catch(e){}
  q.status=sendStatus();
  q.updatedAt=new Date().toISOString();
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  var movedCase=advanceCaseForQuote(q);
  pushQuote(q).then(function(res){
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
   render();
   sentPopup(q,res,function(){
    if(fromBuilder&&q.caseId&&typeof window.imodeOpenCase==='function'){
     /* No closeModal() before leaving: js/29 rewinds the history on the next macrotask
        unless the active PAGE changed, and that cancels a cross-document navigation
        (part 19, and measured again in js/88). */
     window.imodeOpenCase(q.caseId);
    }
   });
  });
  if(movedCase)toast(tl('อัปเดตสถานะเคสเป็น ','Case moved to ')+ASSIGNED);
  try{
   if(Array.isArray(notifications)){
    notifications.unshift({id:(typeof uid==='function'?uid():String(Date.now())),icon:'฿',
     title:tl('ส่งใบเสนอราคาให้ลูกค้า','Quotation sent to the customer'),
     message:q.id+' · '+(q.customer||'-')+' · '+money2(q.grand),
     createdAt:new Date().toISOString(),read:false,caseId:q.caseId||''});
   }
  }catch(e){}
  try{if(typeof renderQuotationList==='function')renderQuotationList()}catch(e){}
  try{if(typeof renderNotifications==='function')renderNotifications()}catch(e){}
  render();
  /* The old toast said "ส่งแล้ว" here, before the push had even been attempted. The popup
     above says it instead, once the answer is known. */
 };

 /* The prompt at the moment the coordinator finishes. saveQuotation() is a top-level
    declaration in js/03 and therefore a property of window; the page's onclick uses the bare
    identifier, which resolves to that property, so wrapping it is enough. */
 var baseSave=window.saveQuotation;
 if(typeof baseSave==='function'){
  window.saveQuotation=function(){
   var r=baseSave.apply(this,arguments);
   var after=function(){
    try{
     var id='';
     try{id=quoteEditingId||''}catch(e){id=''}
     var q=quoteList().filter(function(x){return x.id===id})[0];
     if(!q||!isDraft(q))return;
     if(typeof window.openModal!=='function')return;
     window.openModal(tl('ส่งใบเสนอราคาให้ลูกค้าไหม','Send this quotation to the customer?'),
      q.id+' · '+(q.customer||'-')+' · '+money2(q.grand),
      '<p style="margin:0 0 13px;font-size:13px;line-height:1.6;color:#4a5a78">'
      +esc2(tl('ใบเสนอราคาที่ยังเป็น “ร่าง” ลูกค้าจะยังไม่เห็นในหน้าหลักลูกค้า '
              +'กดส่งเมื่อพร้อมให้ลูกค้าดูได้แล้ว',
              'A quotation left as a draft does not appear on the customer home page. '
              +'Send it when it is ready for them to see.'))+'</p>'
      +'<div class="button-row"><button type="button" class="soft-btn" onclick="closeModal()">'
      +esc2(tl('เก็บเป็นร่างไว้ก่อน','Keep it as a draft'))+'</button>'
      +'<button type="button" class="primary-btn action-3d-orange" '
      +'onclick="closeModal();imodeSendQuoteToCustomer('+imodeJsArg(q.id)+')">'
      +esc2(tl('📤 ส่งให้ลูกค้า','📤 Send to the customer'))+'</button></div>',true);
    }catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(after,function(){});
   else setTimeout(after,60);
   return r;
  };
 }

 /* --------------------------------------------------- 3. page registration ---- */
 var PAGE='quote-view';
 try{PAGE_PERMISSION[PAGE]='quotation.view'}catch(e){}
 try{
  if(typeof PAGE_INFO!=='undefined'){
   PAGE_INFO.th[PAGE]=['ประวัติใบเสนอราคา','ใบเสนอราคาทั้งหมดที่เคยทำ สถานะ และการส่งให้ลูกค้า'];
   PAGE_INFO.en[PAGE]=['Quotation history','Every quotation, its status, and sending it to the customer'];
  }
 }catch(e){}
 if(typeof window.imodeRegisterHomeModule==='function'){
  window.imodeRegisterHomeModule({page:PAGE,icon:'📑',th:'ประวัติใบเสนอราคา',en:'Quotation history',
   perm:'quotation.view'},'after:quotation');
 }
 /* js/36 sorts the sidebar into named groups from a fixed page list; the new page has to be
    in one or it lands in อื่น ๆ at the bottom. Right after ทำใบเสนอราคา in ราคาและค่าใช้จ่าย. */
 try{
  var groups=(window.imodeNavGroups&&window.imodeNavGroups.groups)||[];
  for(var gi=0;gi<groups.length;gi++){
   if(groups[gi].id!=='history')continue;   /* 2026-09-18: moved out of ราคาและค่าใช้จ่าย */
   if(groups[gi].pages.indexOf(PAGE)<0)groups[gi].pages.push(PAGE);
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
  b.innerHTML='<span>📑</span><b>'+esc2(tl('ประวัติใบเสนอราคา','Quotation history'))+'</b>';
  b.onclick=function(){goPage(PAGE)};
  var ref=nav.querySelector('.nav-item[data-page="quotation"]');
  if(ref&&ref.nextSibling)nav.insertBefore(b,ref.nextSibling);
  else nav.appendChild(b);
  try{if(typeof applyRoleVisibility==='function')applyRoleVisibility()}catch(e){}
  try{if(window.imodeNavGroups&&window.imodeNavGroups.layout)window.imodeNavGroups.layout()}catch(e){}
 }

 /* 2026-09-18: the long list of every quotation ever made used to sit at the bottom of the
    ทำใบเสนอราคา page — "อันนี้ดูเหมือนจะเป็นประวัติใบเสนอราคานะ อยากให้แยกเป็นอีกโมดุลนึงขึ้นมา". It is
    this module's job now, so the builder page keeps only the calculator and gets a link.

    The panel is HIDDEN, never removed: renderQuotations() in js/03 fills #quotationTotalCount,
    #quotationCards, #quotationPagination and the table body as id globals on every render and
    would throw without them — the same reason #fieldQueue and #portalLineIdentity are still in
    the document. css/23's [hidden] rule is what actually hides it. */
 function tidyBuilderPage(){
  var panel=document.querySelector('#page-quotation .quote-history-panel');
  if(!panel||panel.dataset.qvMoved)return;
  panel.dataset.qvMoved='1';
  panel.hidden=true;
  var link=document.createElement('div');
  link.className='panel qv-history-link';
  link.innerHTML='<button type="button" class="soft-btn" data-qv-open="1">📑 '
   +esc2(tl('ดูประวัติใบเสนอราคาทั้งหมด','Open the quotation history'))+' ›</button>';
  link.querySelector('button').onclick=function(){goPage(PAGE)};
  panel.parentNode.insertBefore(link,panel);
 }

 /* ------------------------------------------------------------- 4. filters ---- */
 /* 2026-09-23: `kind` splits Service work from Warranty. A warranty quotation is marked by
    q.service==='WP' — the same test js/62 uses to decide which request a quotation closes, so
    there is one definition of "this is a warranty quotation" in the project, not two. */
 var state={q:'',status:'',customer:'',kind:'',limit:25};
 /* `service === 'WP'` is the marker, but it could not be SET until 2026-09-23: index.html's
    ประเภทบริการ select offered OS / WS / DG only, so js/03's `qService.value='WP'` was dropped
    by the browser and every warranty quotation built from a customer request was saved
    without it (js/103 adds the option). So a quotation built from a warranty REQUEST counts
    too — settings.quoteRequestLink records that pairing and is exact, not a guess.
    `warrantyMonths` is deliberately NOT used as evidence: js/03 stores it on every quotation
    with a default of 12, so it says nothing about what kind this is. */
 function isWarrantyQuote(q){
  if(!q)return false;
  if(String(q.service||'')==='WP')return true;
  try{
   var reqId=(settings.quoteRequestLink||{})[q.id];
   if(!reqId)return false;
   var r=(Array.isArray(lineRequests)?lineRequests:[]).filter(function(x){return x&&x.id===reqId})[0];
   return !!(r&&r.type==='warranty_quote');
  }catch(e){return false}
 }
 window.imodeQuoteViewSet=function(k,v){
  state[k]=v;
  if(k!=='limit')state.limit=25;
  render();
 };
 window.imodeQuoteViewMore=function(){state.limit+=25;render()};

 function matches(q){
  if(state.kind==='warranty'&&!isWarrantyQuote(q))return false;
  if(state.kind==='service'&&isWarrantyQuote(q))return false;
  if(state.status&&String(q.status||'')!==state.status)return false;
  if(state.customer&&String(q.customerId||'')!==state.customer)return false;
  var s=state.q.trim().toLowerCase();
  if(!s)return true;
  return [q.id,q.customer,q.caseTicket,q.contact,q.location,q.status]
   .some(function(v){return String(v||'').toLowerCase().indexOf(s)>=0});
 }
 function sorted(list){
  return list.slice().sort(function(a,b){
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
 }

 /* -------------------------------------------------------------- 5. render ---- */
 function pill(q){
  try{if(typeof quoteStatusPill==='function')return quoteStatusPill(q.status)}catch(e){}
  return '<span class="quote-status">'+esc2(q.status||'ร่าง')+'</span>';
 }
 function rowHTML(q){
  var draft=isDraft(q);
  var machines=(q.machineIds||[]).length;
  return '<div class="qv-row'+(draft?' is-draft':'')+'" data-quote="'+esc2(q.id)+'" role="button" tabindex="0"'
   +' aria-label="'+esc2(tl('เปิดใบเสนอราคา ','Open quotation ')+q.id)+'">'
   +'<div class="qv-row-main">'
   +'<div class="qv-row-top"><b>'+esc2(q.id)+'</b>'+pill(q)
   +(draft?'<span class="qv-unsent">'+esc2(tl('ลูกค้ายังไม่เห็น','Customer cannot see this'))+'</span>':'')
   +'</div>'
   +'<small>'+esc2(q.customer||'-')+(q.caseTicket?' · '+esc2(q.caseTicket):'')+'</small>'
   +'<small>'+esc2(tl('สร้าง','Created'))+' '+esc2(fmtAny(q.createdAt))
   +' · '+machines+' '+esc2(tl('เครื่อง','machines'))+'</small>'
   +'</div>'
   +'<div class="qv-row-side"><b class="qv-amount">'+money2(q.grand)+'</b>'
   +(draft&&can('quotation.create')
     ?'<button type="button" class="qv-send" onclick="event.stopPropagation();imodeSendQuoteToCustomer('+imodeJsArg(q.id)+')">'
      +esc2(tl('📤 ส่งให้ลูกค้า','📤 Send'))+'</button>'
     :'<span class="qv-go">'+esc2(tl('ดูใบ','Open'))+' ›</span>')
   +'</div></div>';
 }

 function render(){
  var host=document.getElementById('page-'+PAGE);
  if(!host)return;
  var all=quoteList();
  /* 2026-09-15: a ปี/เดือน/สัปดาห์ period filter (js/66, "all" by default as before) and the
     shared page-size control every other list uses, in place of "แสดงเพิ่ม". LIST_PAGER_CONFIG
     is js/03's top-level const — a lexical global, so it is reached by bare name; registering
     here is what lets setListLimit('quoteView',…) find this render. */
  try{if(!LIST_PAGER_CONFIG.quoteView)LIST_PAGER_CONFIG.quoteView={pageId:'page-'+PAGE,render:'imodeRenderQuoteView',unit:tl('ใบ','quotes')}}catch(e){}
  var inPeriod=function(q){return !window.imodePeriod||window.imodePeriod.contains('quoteView',q.createdAt||q.date||q.updatedAt)};
  var list=sorted(all.filter(matches).filter(inPeriod));
  var info=(typeof paginateList==='function')
   ? paginateList('quoteView',list,[state.q,state.status,state.customer,window.imodePeriod?window.imodePeriod.sig('quoteView'):''].join('|'))
   : {list:list.slice(0,state.limit),total:list.length};
  var shown=info.list;

  var statuses=[];
  try{statuses=(settings.quotationStatuses||[]).slice()}catch(e){}
  all.forEach(function(q){if(q.status&&statuses.indexOf(q.status)<0)statuses.push(q.status)});

  var custSeen={},custs=[];
  all.forEach(function(q){
   if(!q.customerId||custSeen[q.customerId])return;
   custSeen[q.customerId]=1;
   custs.push({id:q.customerId,name:q.customer||q.customerId});
  });
  custs.sort(function(a,b){return String(a.name).localeCompare(String(b.name),'th')});

  /* The totals follow EVERY filter — period, status, customer and search — on the owner's
     choice: what is listed is what is added up. They used to cover every quotation. */
  var drafts=list.filter(isDraft).length;
  var total=list.reduce(function(s,q){return s+(Number(q.grand)||0)},0);
  var sentTotal=list.filter(function(q){return !isDraft(q)})
   .reduce(function(s,q){return s+(Number(q.grand)||0)},0);

  host.innerHTML='<div class="panel">'
   +'<div class="panel-head toolbar-head"><div>'
   +'<h3>'+esc2(tl('ใบเสนอราคาทั้งหมด','All quotations'))+'</h3>'
   +'<p class="subtext">'+esc2(tl('ใบเสนอราคาทั้งหมดที่เคยทำ ตรวจสถานะ และส่งให้ลูกค้า',
                                  'Read a quotation, check its status, and send it to the customer'))+'</p></div>'
   +(can('quotation.create')
     ?'<button class="primary-btn action-3d-orange" onclick="goPage(\'quotation\')">＋ '
      +esc2(tl('ทำใบเสนอราคาใหม่','New quotation'))+'</button>':'')
   +'</div>'
   +'<div id="qvPeriodHost" class="qv-period"></div>'
   +'<div class="qv-kpi">'
   +'<div class="qv-kpi-box"><small>'+esc2(tl('ทั้งหมด','Total'))+'</small><b>'+list.length+'</b></div>'
   +'<div class="qv-kpi-box'+(drafts?' is-warn':'')+'"><small>'+esc2(tl('ร่าง · ยังไม่ส่ง','Draft'))+'</small><b>'+drafts+'</b></div>'
   +'<div class="qv-kpi-box"><small>'+esc2(tl('มูลค่าที่ส่งแล้ว','Sent value'))+'</small><b>'+money2(sentTotal)+'</b></div>'
   +'<div class="qv-kpi-box"><small>'+esc2(tl('มูลค่ารวม','All value'))+'</small><b>'+money2(total)+'</b></div>'
   +'</div>'
   +'<div class="qv-filters">'
   +'<input type="search" class="qv-search" placeholder="'+esc2(tl('ค้นหาเลขที่ ลูกค้า หรือเคส','Search number, customer or case'))
   +'" value="'+esc2(state.q)+'" oninput="imodeQuoteViewSet(\'q\',this.value)">'
   +'<select onchange="imodeQuoteViewSet(\'kind\',this.value)">'
   +'<option value="">'+esc2(tl('ทุกประเภท','Every type'))+'</option>'
   +'<option value="service"'+(state.kind==='service'?' selected':'')+'>'
   +esc2(tl('งานบริการเครื่องจักร','Machine service'))+'</option>'
   +'<option value="warranty"'+(state.kind==='warranty'?' selected':'')+'>'
   +esc2(tl('ประกันเครื่อง','Warranty'))+'</option>'
   +'</select>'
   +'<select onchange="imodeQuoteViewSet(\'status\',this.value)"><option value="">'
   +esc2(tl('ทุกสถานะ','Every status'))+'</option>'
   +statuses.map(function(s){
      return '<option value="'+esc2(s)+'"'+(state.status===s?' selected':'')+'>'+esc2(s)+'</option>';
     }).join('')+'</select>'
   +'<select onchange="imodeQuoteViewSet(\'customer\',this.value)"><option value="">'
   +esc2(tl('ทุกลูกค้า','Every customer'))+'</option>'
   +custs.map(function(c){
      return '<option value="'+esc2(c.id)+'"'+(state.customer===c.id?' selected':'')+'>'+esc2(c.name)+'</option>';
     }).join('')+'</select>'
   +'</div>'
   /* The page-size control every other list has — the same markup and ids renderListPager()
      looks for: <key>DisplayLimit, <key>TotalCount, <key>Pagination. */
   +'<div class="qv-meta machine-list-meta">'
   +'<label class="machine-display-control">'+esc2(tl('แสดง ','Show '))
   +'<select id="quoteViewDisplayLimit" onchange="setListLimit(\'quoteView\',this.value)">'
   +[['10','10'],['25','25'],['50','50'],['100','100'],['all',tl('ทั้งหมด','All')]].map(function(o){
      return '<option value="'+o[0]+'">'+esc2(o[1])+'</option>';
     }).join('')
   +'</select> '+esc2(tl('ใบ','quotes'))+'</label>'
   +'<span class="machine-total-chip">'+esc2(tl('ทั้งหมด ','Total '))+'<b id="quoteViewTotalCount">0</b> '+esc2(tl('ใบ','quotes'))+'</span>'
   +'</div>'
   +'<div class="qv-list">'+(shown.length?shown.map(rowHTML).join('')
      :'<div class="empty">'+esc2(all.length?tl('ไม่พบใบเสนอราคาตามเงื่อนไขนี้','No quotation matches this filter')
                                            :tl('ยังไม่มีใบเสนอราคา','No quotations yet'))+'</div>')+'</div>'
   +'<div id="quoteViewPagination" class="machine-pagination" aria-label="'+esc2(tl('แบ่งหน้าใบเสนอราคา','Quotation pages'))+'"></div>'
   +'</div>';
  /* After the markup exists: the period control draws into its host, and the shared pager sets
     the size select and the page buttons from the same state paginateList() used above. */
  try{if(window.imodePeriod)window.imodePeriod.mount('quoteView','qvPeriodHost','all',render)}catch(e){}
  try{if(typeof renderListPager==='function'&&info.pageCount!=null)renderListPager('quoteView',info,all.length)}catch(e){}

  host.querySelectorAll('.qv-row').forEach(function(row){
   var open=function(){window.imodeOpenQuoteDoc(row.getAttribute('data-quote'))};
   row.addEventListener('click',function(e){
    if(e.target.closest('button,a,select,input'))return;
    open();
   });
   row.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();open()}
   });
  });
 }
 window.imodeRenderQuoteView=render;

 /* ---------------------------------------------------------- 6. the document ---- */
 window.imodeOpenQuoteDoc=function(id){
  var q=quoteList().filter(function(x){return x.id===id})[0];
  if(!q){toast(tl('ไม่พบใบเสนอราคา','Quotation not found'));return}
  if(typeof window.quotationDocHTML!=='function'||typeof window.openModal!=='function')return;
  var draft=isDraft(q);
  var doc='';
  try{doc=window.quotationDocHTML(withTotals(q),q.id)}catch(e){
   doc='<div class="empty">'+esc2(tl('แสดงเอกสารไม่ได้','The document could not be drawn'))+'</div>';
  }
  var actions='<div class="button-row" style="margin-top:14px">'
   +'<button type="button" class="soft-btn" onclick="printQuotation()">🖨 '
   +esc2(tl('พิมพ์ / Save PDF','Print / Save PDF'))+'</button>'
   +(can('quotation.approve')
     ?'<button type="button" class="soft-btn" onclick="openQuotationStatus('+imodeJsArg(q.id)+')">'
      +esc2(tl('สถานะ','Status'))+'</button>':'')
   +(can('quotation.create')
     ?'<button type="button" class="soft-btn" onclick="closeModal();loadQuotation('+imodeJsArg(q.id)+')">✏ '
      +esc2(tl('แก้ไขในเครื่องคิดราคา','Edit in the calculator'))+'</button>':'')
   +(draft&&can('quotation.create')
     ?'<button type="button" class="primary-btn action-3d-orange" '
      +'onclick="closeModal();imodeSendQuoteToCustomer('+imodeJsArg(q.id)+')">📤 '
      +esc2(tl('ส่งให้ลูกค้า','Send to the customer'))+'</button>':'')
   +'</div>';
  window.openModal(tl('ใบเสนอราคา ','Quotation ')+q.id,
   (q.customer||'-')+' · '+(q.status||'ร่าง'),
   (draft?'<div class="qv-draftnote">'+esc2(tl('ใบนี้ยังเป็นร่าง ลูกค้าจะยังไม่เห็นในหน้าหลักลูกค้า',
     'This is still a draft — it does not appear on the customer home page yet'))+'</div>':'')
   +doc+actions);
 };

 /* ------------------------------------------------------------ 7. the wiring ---- */
 /* renderAll() does not know about this page — it is created here — so it is rendered by
    the goPage wrapper, the same way js/16 renders งานของฉัน and มอบหมายงาน. */
 var baseGoPage=window.goPage;
 if(typeof baseGoPage==='function'){
  window.goPage=function(name){
   var r=baseGoPage.apply(this,arguments);
   try{
    if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render();
   }catch(e){}
   return r;
  };
 }
 /* A cloud sync replaces the quotations array wholesale; redraw if this page is on screen. */
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var done=function(){
    try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
   };
   if(r&&typeof r.then==='function')r.then(done,done);
   else done();
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70QuoteViewStyle';
 st.textContent=''
 +'.qv-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;padding:0 14px 12px}'
 +'.qv-kpi-box{border:1px solid #e2ecfb;border-radius:13px;background:#f8fbff;padding:10px 13px}'
 +'.qv-kpi-box small{display:block;font-size:10.5px;color:#7385a5;margin-bottom:3px}'
 +'.qv-kpi-box b{font-size:17px;color:#0c225e}'
 +'.qv-kpi-box.is-warn{border-color:#f5d6b0;background:#fff8ef}'
 +'.qv-kpi-box.is-warn b{color:#9a6516}'
 +'.qv-filters{display:flex;flex-wrap:wrap;gap:9px;padding:0 14px 12px}'
 +'.qv-filters input,.qv-filters select{flex:1 1 180px;min-width:0;border:1px solid #d9e6fa;'
 +'border-radius:11px;padding:9px 11px;font-size:13px;background:#fff;color:#0c225e;min-height:38px}'
 +'.qv-filters input:focus,.qv-filters select:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.qv-list{display:flex;flex-direction:column;gap:9px;padding:0 14px 14px}'
 +'.qv-row{display:flex;align-items:center;gap:13px;border:1px solid #e2ecfb;border-radius:14px;'
 +'background:#fff;padding:12px 14px;cursor:pointer;'
 +'transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}'
 +'.qv-row:hover{border-color:#0b63e5;transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,99,229,.12)}'
 +'.qv-row:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.qv-row.is-draft{border-color:#f0dcc0;background:#fffdf9}'
 +'.qv-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}'
 +'.qv-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
 +'.qv-row-top b{font-size:14px;color:#0c225e}'
 +'.qv-row-main small{font-size:11.5px;color:#5b6b88}'
 +'.qv-unsent{font-size:10.5px;font-weight:800;color:#9a6516;background:#fff3e2;'
 +'border:1px solid #f3ddbd;border-radius:999px;padding:2px 9px}'
 +'.qv-row-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px}'
 +'.qv-amount{font-size:15px;color:#0c225e;white-space:nowrap}'
 +'.qv-go{font-size:12px;font-weight:800;color:#0b63e5;white-space:nowrap}'
 +'.qv-send{border:0;border-radius:11px;padding:7px 13px;cursor:pointer;white-space:nowrap;'
 +'background:#f2810c;color:#fff;font-size:12px;font-weight:800;box-shadow:0 4px 0 #c96a08}'
 +'.qv-send:hover{transform:translateY(-1px);box-shadow:0 5px 0 #c96a08}'
 +'.qv-send:active{transform:translateY(3px);box-shadow:0 1px 0 #c96a08}'
 +'.qv-send:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.qv-more{padding:0 14px 16px}'
 /* the period row above the totals, and the page-size row above the list */
 +'.qv-period{padding:0 14px 12px}'
 +'.qv-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:0 14px 10px}'
 +'#quoteViewPagination{padding:4px 14px 16px}'
 +'.qv-draftnote{margin-bottom:12px;padding:10px 13px;border-radius:12px;background:#fff8ef;'
 +'border:1px solid #f3ddbd;color:#9a6516;font-size:12.5px;font-weight:700}'
 +'@media (max-width:640px){'
 +'.qv-row{flex-direction:column;align-items:stretch;gap:9px}'
 +'.qv-row-side{flex-direction:row;align-items:center;justify-content:space-between}'
 +'.qv-filters input,.qv-filters select{flex:1 1 100%}'
 +'}'
 +'@media (prefers-reduced-motion:reduce){.qv-row,.qv-send{transition:none}'
 +'.qv-row:hover,.qv-send:hover,.qv-send:active{transform:none}}';
 document.head.appendChild(st);

 function install(){
  ensurePage();
  ensureNav();
  try{tidyBuilderPage()}catch(e){}
  try{if((document.querySelector('.page.active')||{}).id==='page-'+PAGE)render()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
