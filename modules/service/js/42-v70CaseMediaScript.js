/* Beta — the photos the customer attached actually reach the coordinator and the technician.

   Reported: "ในโมดุลหน้างาน เวลาลูกค้าแนบรูปมาด้วยแต่พอแอดมินหรือช่างดูกลับไม่มีรูป".

   Two separate faults, both real, and either one on its own is enough to lose the photos.

   1. NOTHING EVER DREW THEM. submitPortalIssue() (js/03) puts the attachments on the case
      as `c.media` — `{name,type,size,data}` with `data` a data URL — and then no screen in
      the application reads that field. Not the หน้างาน workspace, not openCaseDetail(), not
      the standalone case page, whose loadAttachments() walks fieldStatusLog and the service
      report and never the case itself. So even on the very device that reported the problem
      the photos were stored and invisible.

   2. THEY NEVER LEFT THE PHONE. cloudUpsertCase() writes an explicit column whitelist and
      `media` is not in it, and service_cases had no column to put it in — probed against the
      live project: `column service_cases.media does not exist`. So on the coordinator's PC
      the field was absent rather than empty.

   WHAT THIS FILE DOES

     * adds `media` to the case and the customer-request rows on the way up and reads it back
       on the way down, and SKIPS it, once, quietly, when the column is not there. Running
       supabase/06-v70-case-media.sql is what turns the transport on; not running it leaves
       case sync working exactly as it does today rather than breaking it. The probe is one
       select, run at most once per session and only when a case actually carries media.
     * draws the attachments wherever the problem the customer reported is already shown:
       the หน้างาน machine card and the case popup.
     * a lightbox, because a 92px thumbnail of a machine plate is not evidence.

   js/03 is not edited and no storage key is added. The media were always in localStorage;
   this is what shows them. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function isImage(x){return /^image\//i.test(String(x&&x.type||''))}
 function isVideo(x){return /^video\//i.test(String(x&&x.type||''))}

 /* ------------------------------------------------------------ 1. the data ---- */
 /* The case is the source. A case that predates this file — or that arrived from a device
    that could not send the column — may still have its attachments on the customer request
    row it was created from, so that is read as a fallback rather than showing nothing. */
 function mediaOf(c){
  if(!c)return [];
  var list=Array.isArray(c.media)?c.media:[];
  if(list.length)return list;
  try{
   if(!Array.isArray(lineRequests))return [];
   for(var i=0;i<lineRequests.length;i++){
    var r=lineRequests[i];
    if(r&&r.caseId===c.id&&Array.isArray(r.media)&&r.media.length)return r.media;
   }
  }catch(e){}
  return [];
 }
 window.imodeCaseMedia=mediaOf;

 /* ----------------------------------------------------------- 2. the wire ----- */
 /* One probe, cached for the session. `supa` is a top-level let in js/03 — a lexical global,
    absent from window — so it is read by bare identifier. */
 var probe=null;
 function mediaColumnReady(){
  if(probe)return probe;
  probe=new Promise(function(resolve){
   var db=null;
   try{db=supa}catch(e){db=null}
   if(!db){resolve(false);return}
   db.from('service_cases').select('media').limit(1).then(function(res){
    var ok=!(res&&res.error);
    if(!ok){
     console.warn('[imode] service_cases.media is missing - customer attachments will not '
      +'sync between devices. Run supabase/06-v70-case-media.sql once to enable it.');
    }
    resolve(ok);
   },function(){resolve(false)});
  });
  return probe;
 }
 window.imodeCaseMediaColumnReady=mediaColumnReady;

 /* ATTACHING media TO THE CASE OBJECT IS NOT ENOUGH, and the first version of this file
    did exactly that and silently sent nothing for weeks. cloudUpsertCase() (js/03:1630)
    does not forward the object it is handed — it builds an explicit snake_case payload,
    column by column, and `media` is not one of them, so a field added to its argument is
    dropped on the floor. Measured: a portal report with two attachments wrote media:[] to
    service_cases while localStorage held both files.

    So the value is injected into the PAYLOAD instead, at cloudUpsert() — the single funnel
    every table write goes through — keyed by the row id that the payload always carries.
    The id is registered immediately before the base call and removed immediately after;
    JavaScript is single threaded and cloudUpsertCase awaits cloudUpsert inside that window,
    so the entry cannot be read by an unrelated write.

    The alternative, restating js/03's whitelist here, is the thing that caused this bug in
    the first place. */
 var pendingMedia=Object.create(null);
 var MEDIA_TABLES={service_cases:1,line_customer_requests:1};
 var baseCloudUpsert=window.cloudUpsert;
 if(typeof baseCloudUpsert==='function'){
  window.cloudUpsert=function(table,obj){
   try{
    if(MEDIA_TABLES[table]&&obj&&obj.id&&pendingMedia[obj.id])obj.media=pendingMedia[obj.id];
   }catch(e){}
   return baseCloudUpsert.apply(this,arguments);
  };
 }
 function withMedia(id,list,run){
  pendingMedia[id]=list;
  var done=function(){delete pendingMedia[id]};
  try{
   return Promise.resolve(run()).then(function(v){done();return v},function(e){done();throw e});
  }catch(e){done();throw e}
 }

 /* js/38 already wraps cloudUpsertCase to fold a multi-technician crew into the assignee
    column. This wraps that, so both survive: js/38's copy travels on untouched and the
    attachments join the payload further down. Never the live case object — a screen that
    has just been taught to read the array must not suddenly see a wire value. */
 var baseUpsertCase=window.cloudUpsertCase;
 if(typeof baseUpsertCase==='function'){
  window.cloudUpsertCase=function(c){
   var self=this,args=arguments;
   var list=Array.isArray(c&&c.media)?c.media:[];
   if(!list.length||!c.id)return baseUpsertCase.apply(self,args);
   return mediaColumnReady().then(function(ok){
    if(!ok)return baseUpsertCase.apply(self,args);
    return withMedia(c.id,list,function(){return baseUpsertCase.apply(self,args)});
   });
  };
 }
 var baseFromCase=window.fromCaseDb;
 if(typeof baseFromCase==='function'){
  window.fromCaseDb=function(row){
   var c=baseFromCase.apply(this,arguments);
   try{if(Array.isArray(row&&row.media))c.media=row.media}catch(e){}
   return c;
  };
 }
 /* cloudUpsertLineRequest() whitelists its columns the same way, so the same route. */
 var baseUpsertReq=window.cloudUpsertLineRequest;
 if(typeof baseUpsertReq==='function'){
  window.cloudUpsertLineRequest=function(r){
   var self=this,args=arguments;
   var list=Array.isArray(r&&r.media)?r.media:[];
   if(!list.length||!r.id)return baseUpsertReq.apply(self,args);
   return mediaColumnReady().then(function(ok){
    if(!ok)return baseUpsertReq.apply(self,args);
    return withMedia(r.id,list,function(){return baseUpsertReq.apply(self,args)});
   });
  };
 }
 var baseFromReq=window.fromLineRequestDb;
 if(typeof baseFromReq==='function'){
  window.fromLineRequestDb=function(row){
   var r=baseFromReq.apply(this,arguments);
   try{if(Array.isArray(row&&row.media))r.media=row.media}catch(e){}
   return r;
  };
 }

 /* --------------------------------------------------------- 3. the lightbox ---- */
 /* The list is held here and addressed by index: a data URL is tens of thousands of
    characters and has no business inside an onclick attribute. */
 var viewing=[];
 function closeView(){
  var el=document.getElementById('cmLightbox');
  if(el&&el.parentNode)el.parentNode.removeChild(el);
  document.removeEventListener('keydown',onKey,true);
 }
 function onKey(e){
  if(e.key==='Escape'){e.preventDefault();closeView()}
 }
 window.imodeCloseCaseMedia=closeView;
 window.imodeViewCaseMedia=function(i){
  var item=viewing[Number(i)||0];
  if(!item||!item.data)return;
  closeView();
  var wrap=document.createElement('div');
  wrap.id='cmLightbox';
  wrap.className='cm-lightbox';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.innerHTML='<div class="cm-lightbox-inner">'
   +(isVideo(item)
     ?'<video src="'+esc2(item.data)+'" controls autoplay playsinline></video>'
     :'<img src="'+esc2(item.data)+'" alt="'+esc2(item.name||'')+'">')
   +'<div class="cm-lightbox-bar"><b>'+esc2(item.name||tl('ไฟล์แนบจากลูกค้า','Customer attachment'))+'</b>'
   +'<button type="button" class="cm-lightbox-close" onclick="imodeCloseCaseMedia()" aria-label="'
   +esc2(tl('ปิด','Close'))+'">&#10005;</button></div></div>';
  wrap.addEventListener('click',function(e){if(e.target===wrap)closeView()});
  document.body.appendChild(wrap);
  document.addEventListener('keydown',onKey,true);
  var btn=wrap.querySelector('.cm-lightbox-close');
  if(btn)btn.focus();
 };

 /* ------------------------------------------------------------ 4. the block ---- */
 function blockHTML(list){
  if(!list.length)return '';
  viewing=list;
  var photos=list.filter(isImage).length,clips=list.filter(isVideo).length;
  var tiles=list.map(function(x,i){
   var body=isImage(x)&&x.data
    ? '<img src="'+esc2(x.data)+'" alt="'+esc2(x.name||'')+'" loading="lazy">'
    : '<span>'+(isVideo(x)?'&#9654;':'&#128196;')+'</span>';
   return '<button type="button" class="cm-tile'+(isVideo(x)?' is-video':'')+'"'
    +' onclick="imodeViewCaseMedia('+i+')" title="'+esc2(x.name||'')+'"'
    +' aria-label="'+esc2(tl('เปิดไฟล์แนบ ','Open attachment ')+(i+1))+'">'+body+'</button>';
  }).join('');
  return '<div class="cm-block"><small>&#128206; '
   +esc2(tl('ไฟล์ที่ลูกค้าแนบมา','Files the customer attached'))
   +' &middot; '+photos+' '+esc2(tl('รูป','photos'))
   +(clips?' &middot; '+clips+' '+esc2(tl('วิดีโอ','videos')):'')
   +'</small><div class="cm-grid">'+tiles+'</div></div>';
 }
 window.imodeCaseMediaHTML=function(c){return blockHTML(mediaOf(c))};

 /* ------------------------------------------------- 5a. the หน้างาน workspace ---- */
 /* machineHTML() in js/32 writes #fwMachine and ends with the .fw-issue card — what the
    customer reported. The attachments belong on that card and nowhere else on the page.

    Injected from a MutationObserver rather than from a wrapper, because js/32 calls its own
    renderWorkspace() closure from three places (its renderFieldService wrapper, its goPage
    wrapper and its installer) and only one of them goes through window. Watching the element
    catches every path, including any added later.

    The observer is disconnected around its own write. A MutationObserver only queues records
    while it is observing, so our insertion is never recorded — the alternative, recording it
    and filtering it out, is what spun a nav-group observer into an infinite loop in part 17. */
 var fwObserver=null;
 function fillFieldWorkspace(){
  var host=document.getElementById('fwMachine');
  if(!host)return;
  var issue=host.querySelector('.fw-issue');
  if(!issue||issue.querySelector('.cm-block'))return;
  var id='';
  try{id=(typeof window.imodeFieldJobId==='function')?window.imodeFieldJobId():''}catch(e){}
  var c=null;
  try{c=(Array.isArray(cases)?cases:[]).filter(function(x){return x.id===id})[0]||null}catch(e){}
  var html=c?blockHTML(mediaOf(c)):'';
  if(!html)return;
  if(fwObserver)fwObserver.disconnect();
  issue.insertAdjacentHTML('beforeend',html);
  if(fwObserver)fwObserver.observe(host,{childList:true,subtree:true});
 }
 function watchFieldWorkspace(){
  var host=document.getElementById('fwMachine');
  if(!host||host.dataset.cmWatched)return;
  host.dataset.cmWatched='1';
  fwObserver=new MutationObserver(function(){fillFieldWorkspace()});
  fwObserver.observe(host,{childList:true,subtree:true});
  fillFieldWorkspace();
 }
 /* The workspace shell is created on demand, so the element may not exist yet. This runs
    after js/32's own render on every Field Service pass and starts watching the first time
    the element appears. */
 var baseRenderField=window.renderFieldService;
 if(typeof baseRenderField==='function'){
  window.renderFieldService=function(){
   var r=baseRenderField.apply(this,arguments);
   try{watchFieldWorkspace();fillFieldWorkspace()}catch(e){}
   return r;
  };
 }

 /* --------------------------------------------------- 5b. the case popup ------- */
 var baseDetail=window.openCaseDetail;
 if(typeof baseDetail==='function'){
  window.openCaseDetail=function(cid,tab){
   var r=baseDetail.apply(this,arguments);
   try{
    if((tab||'summary')!=='summary')return r;
    var c=(Array.isArray(cases)?cases:[]).filter(function(x){return x.id===cid})[0];
    var html=c?blockHTML(mediaOf(c)):'';
    if(!html)return r;
    var grid=document.querySelector('#modalBody .detail-grid');
    if(!grid)return r;
    var box=document.createElement('div');
    box.className='detail-box full cm-detail-box';
    box.innerHTML=html;
    grid.appendChild(box);
   }catch(e){}
   return r;
  };
 }

 /* ----------------------------------------------------------------- styles ---- */
 var st=document.createElement('style');
 st.id='v70CaseMediaStyle';
 st.textContent=''
 +'.cm-block{margin-top:11px}'
 +'.cm-block>small{display:block;font-size:11px;font-weight:800;color:#9a6516;margin-bottom:7px}'
 +'.cm-detail-box .cm-block>small{color:#5b6b88}'
 +'.cm-detail-box{padding:10px 12px}'
 +'.cm-grid{display:flex;flex-wrap:wrap;gap:9px}'
 +'.cm-tile{width:92px;height:70px;padding:0;overflow:hidden;border-radius:11px;cursor:pointer;'
 +'border:1px solid #e2ecfb;background:#f4f8ff;display:grid;place-items:center;'
 +'transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}'
 +'.cm-tile img{width:100%;height:100%;object-fit:cover;display:block}'
 +'.cm-tile span{font-size:22px;color:#5b7095}'
 +'.cm-tile:hover{transform:translateY(-2px);border-color:#0b63e5;box-shadow:0 6px 16px rgba(11,99,229,.16)}'
 +'.cm-tile:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 /* lightbox */
 +'.cm-lightbox{position:fixed;inset:0;z-index:12000;background:rgba(8,17,35,.86);'
 +'display:grid;place-items:center;padding:18px}'
 +'.cm-lightbox-inner{max-width:min(960px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px}'
 +'.cm-lightbox img,.cm-lightbox video{max-width:100%;max-height:calc(100vh - 110px);'
 +'border-radius:14px;background:#000;object-fit:contain}'
 +'.cm-lightbox-bar{display:flex;align-items:center;gap:12px}'
 +'.cm-lightbox-bar b{flex:1;min-width:0;color:#fff;font-size:13px;font-weight:700;'
 +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.cm-lightbox-close{flex:none;width:40px;height:40px;border-radius:50%;border:0;cursor:pointer;'
 +'background:rgba(255,255,255,.16);color:#fff;font-size:17px;font-weight:800}'
 +'.cm-lightbox-close:hover{background:rgba(255,255,255,.28)}'
 +'.cm-lightbox-close:focus-visible{outline:2px solid #fff;outline-offset:2px}'
 +'@media (max-width:640px){.cm-tile{width:78px;height:60px}}'
 +'@media (prefers-reduced-motion:reduce){.cm-tile{transition:none}.cm-tile:hover{transform:none}}';
 document.head.appendChild(st);

 function install(){
  try{watchFieldWorkspace()}catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
