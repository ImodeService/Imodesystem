/* Beta 1.0 — a status changed on another device shows up here without a reload.

   REPORTED (2026-09-18): "ทำอัพเดตสถานะ realtime" — the owner chose Supabase Realtime (a push
   over the websocket the client already has) over polling.

   WHAT IT WAS BEFORE, measured: syncCloud() runs ONCE, from initCloud() inside js/03's `load`
   handler (js/03:1671). Nothing else ever calls it on a timer. So a case assigned on the
   coordinator's PC reached the technician's phone only when that phone reloaded the page —
   the data was shared, the screen was not.

   ------------------------------------------------------------------ WHAT THIS FILE DOES

   Subscribes to postgres_changes on two tables and applies each row as it arrives:

       service_cases            status, assignee, appointment — the thing people wait for
       line_customer_requests   a customer's report, the moment they send it

   It does NOT call syncCloud() on every event. syncCloud() downloads eleven tables and does
   `cases = a.data.map(...)` — a wholesale replacement — which would throw away a row this
   device has written but not yet pushed (the very thing js/71 exists to protect) and would
   re-render everything several times a minute. One row arrives, one row is applied.

   ------------------------------------------------------------------ THINGS THAT MATTER

   1. THE ARRAYS ARE MUTATED IN PLACE, never reassigned. `cases` and `lineRequests` are
      top-level `let` in js/03 — lexical globals, absent from window (part 17 §5) — and every
      render function closes over the same array object. splice/unshift keeps all of them in
      step; assigning a new array from here would be legal but would strand nobody knows how
      many other references.

   2. OUR OWN WRITES COME BACK TO US. Postgres does not know which browser made the change,
      so every write this device pushes returns as an event. `updated_at` is the guard: a row
      whose stamp is not NEWER than the copy in memory is dropped, which quietly swallows the
      echo and, as a bonus, any out-of-order delivery. line_customer_requests has no
      updated_at column at all, so those rows are compared by value instead.

   3. THE ROW IS MAPPED THROUGH window.fromCaseDb / window.fromLineRequestDb — the same
      functions syncCloud() uses, and the ones js/38 (the technician crew in one column),
      js/42 (the customer's photos) and js/48 (ตอบกลับแล้ว) have wrapped. Re-implementing the
      column mapping here would have lost all three the day one of them changed.

   4. A DELETE is honoured. It is how js/52's delete-to-bin reaches other devices, and until
      now that only happened on a reload.

   5. WITHOUT supabase/08-v70-realtime.sql NOTHING ARRIVES AND NOTHING BREAKS. The channel
      subscribes successfully either way — an unpublished table is not an error, it is simply
      silent — so this cannot be detected from the browser. The console line below says so,
      and imodeRealtimeState() reports what the socket is doing.

   6. service-case-detail.html IS A SEPARATE DOCUMENT and does not load js/*. It still reads
      its case once, at open. Not addressed here. */
(function(){
 'use strict';

 var DEBOUNCE=250;          /* one repaint per burst, not one per row */
 var RETRY=[2000,5000,15000,30000];

 function tl(th,en){try{return settings.language==='en'?en:th}catch(e){return th}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function client(){try{return (typeof supa!=='undefined')?supa:null}catch(e){return null}}

 var state={on:false,status:'',events:0,applied:0,tables:[],tries:0};
 window.imodeRealtimeState=function(){return JSON.parse(JSON.stringify(state))};

 /* ------------------------------------------------------------------ the tables ---- */
 /* Each entry says how to reach the live array, how to turn a database row into one of its
    members, and how to tell whether an incoming row is newer than the one in memory. */
 var TABLES=[
  {
   name:'service_cases',
   list:function(){try{return Array.isArray(cases)?cases:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromCaseDb==='function')?window.fromCaseDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    var a=String(incoming&&incoming.updatedAt||''),b=String(local&&local.updatedAt||'');
    return !b||(a&&a>b);
   },
   describe:function(c){
    return (c.ticket||c.id)+(c.status?' → '+c.status:'');
   }
  },
  /* 2026-09-18: "ลูกค้าเซ็นใบเสนอราคาแล้ว ส่งแล้วแต่สถานะไม่อัพเดต ... อยากให้สถานะอัพเดตเรียลไทม์
     ทุกอันเลย". Measured on the live project first: QT-SRV-202609-016 really was 'อนุมัติ' in the
     database with its signature recorded — the customer's side had worked and reached the
     cloud. What had not happened was the office SCREEN, because this file listened to two
     tables. So every table that carries a state somebody waits on is here now. */
  {
   name:'quotations',
   list:function(){try{return Array.isArray(quotations)?quotations:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromQuotationDb==='function')?window.fromQuotationDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    var a=String(incoming&&incoming.updatedAt||''),b=String(local&&local.updatedAt||'');
    return !b||(a&&a>b);
   },
   describe:function(q){return (q.id||'')+(q.status?' → '+q.status:'')}
  },
  {
   name:'service_reports',
   list:function(){try{return Array.isArray(serviceReports)?serviceReports:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromServiceReportDb==='function')?window.fromServiceReportDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(){return tl('มีใบตรวจใหม่จากหน้างาน','A new inspection sheet arrived')}
  },
  {
   name:'machines',
   list:function(){try{return Array.isArray(machines)?machines:null}catch(e){return null}},
   /* js/03 pushes this table as the raw object, so there is no fromMachineDb to mirror. */
   map:function(row){
    try{var m={photo:''};Object.keys(row||{}).forEach(function(k){m[k]=row[k]});return m}
    catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(m){return tl('อัปเดตเครื่องจักร ','Machine updated ')+(m.name||m.id||'')}
  },
  {
   name:'customers',
   list:function(){try{return Array.isArray(customers)?customers:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromCustomerDb==='function')?window.fromCustomerDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(c){return tl('อัปเดตลูกค้า ','Customer updated ')+(c.name||c.id||'')}
  },
  {
   name:'machine_warranties',
   list:function(){try{return Array.isArray(warranties)?warranties:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromWarrantyDb==='function')?window.fromWarrantyDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(){return tl('อัปเดตข้อมูลประกัน','Warranty updated')}
  },
  {
   name:'machine_documents',
   list:function(){try{return Array.isArray(machineDocuments)?machineDocuments:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromMachineDocumentDb==='function')?window.fromMachineDocumentDb(row):null}
    catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(){return tl('อัปเดตเอกสารเครื่องจักร','Machine document updated')}
  },
  {
   name:'technicians',
   list:function(){try{return Array.isArray(technicians)?technicians:null}catch(e){return null}},
   map:function(row){
    try{
     var t={photo:'',status:'พร้อมรับงาน',skills:'',team:'Technical'};
     Object.keys(row||{}).forEach(function(k){t[k]=row[k]});
     return t;
    }catch(e){return null}
   },
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(t){return tl('อัปเดตทีมช่าง ','Technician updated ')+(t.name||t.id||'')}
  },
  {
   name:'line_customer_requests',
   list:function(){try{return Array.isArray(lineRequests)?lineRequests:null}catch(e){return null}},
   map:function(row){
    try{return (typeof window.fromLineRequestDb==='function')?window.fromLineRequestDb(row):null}
    catch(e){return null}
   },
   /* No updated_at on this table, so "newer" means "different at all". */
   newer:function(incoming,local){
    try{return JSON.stringify(incoming)!==JSON.stringify(local)}catch(e){return true}
   },
   describe:function(r){
    return tl('คำขอใหม่จากลูกค้า','New customer request')+(r.type?' · '+r.type:'');
   }
  }
 ];

 /* ------------------------------------------------------------------ applying ---- */
 var dirty=false,timer=null,lastNote='';

 function apply(cfg,payload){
  state.events++;
  var list=cfg.list();
  if(!list)return;
  var ev=String(payload&&payload.eventType||'').toUpperCase();
  var row=(ev==='DELETE')?(payload&&payload.old):(payload&&payload.new);
  var id=row&&row.id;
  if(!id)return;

  /* 2026-09-25: a row that arrives from the cloud is one the cloud has — tell js/71, so a later
     delete elsewhere is read as a delete and not as unsent work (the "mystery requests"). */
  if(ev!=='DELETE'){try{if(typeof window.imodeSyncAck==='function')window.imodeSyncAck(cfg.name,id)}catch(e){}}
  var at=-1;
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id){at=i;break}

  if(ev==='DELETE'){
   if(at<0)return;
   list.splice(at,1);
   mark(tl('มีรายการถูกลบจากอีกเครื่อง','A record was deleted on another device'));
   return;
  }

  /* 2026-09-28: "สถานะช่าง รายละเอียดไม่เรียลไทม์ เช่นรูป ข้อความ ต้องรีหน้าเว็บก่อน". Realtime
     sends at most ~1 MB per row; above that Supabase drops every column over 64 bytes and marks
     the payload with errors (413). A case with the customer's photos is past that — measured:
     SRV-20260928-002 is 1.4 MB — so field_status_log arrived missing, and mapping that row
     REPLACED the case on screen with an empty track. A cut row is never applied; the full row
     is read back by id instead, one row, and applied through this same function. */
  if(truncated(cfg,payload,row)){refetch(cfg,id);return}
  var mapped=cfg.map(row);
  if(!mapped||!mapped.id)return;
  if(at>=0){
   if(!cfg.newer(mapped,list[at]))return;      /* our own echo, or an older copy */
   list[at]=mapped;
  }else{
   list.unshift(mapped);
  }
  mark(cfg.describe(mapped));
 }

 /* The columns a cut row loses first are the big jsonb ones; service_cases always writes
    field_status_log, so its absence is itself proof the row was cut. */
 var BIG={service_cases:['field_status_log']};
 function truncated(cfg,payload,row){
  if(payload&&Array.isArray(payload.errors)&&payload.errors.length)return true;
  return (BIG[cfg.name]||[]).some(function(k){return !(k in row)});
 }
 var fetching={};
 function refetch(cfg,id){
  var c=client(),key=cfg.name+':'+id;
  if(!c||fetching[key])return;
  fetching[key]=true;
  Promise.resolve(c.from(cfg.name).select('*').eq('id',id).maybeSingle()).then(function(r){
   fetching[key]=false;
   if(r&&!r.error&&r.data)apply(cfg,{eventType:'UPDATE',new:r.data,refetched:true});
  },function(){fetching[key]=false});
 }

 function mark(note){
  state.applied++;
  if(note)lastNote=note;
  dirty=true;
  if(timer)return;
  timer=setTimeout(flush,DEBOUNCE);
 }

 /* One save and one repaint per burst. renderAll() is what every other write in this project
    calls; the patch pages are not in it — they are drawn by their own goPage wrappers — so the
    active one is redrawn by name, exactly the way js/26 does it. */
 function flush(){
  timer=null;
  if(!dirty)return;
  dirty=false;
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  var active=(document.querySelector('.page.active')||{}).id||'';
  var pages={
   'page-my-work':'imodeRenderMyWork','page-assign':'imodeRenderAssign',
   'page-quote-view':'imodeRenderQuoteView','page-done-jobs':'imodeRenderDoneJobs',
   'page-requests':'imodeRenderRequests','page-field-all':'imodeRenderFieldAll'
  };
  var fn=pages[active];
  if(fn&&typeof window[fn]==='function'){try{window[fn]()}catch(e){}}
  /* NOT ON A CUSTOMER SURFACE. Every device that opens the app subscribes, including the
     phone a customer scanned a QR with — and every case any coordinator touches anywhere
     was popping "🔄 SRV-… → มอบหมายแล้ว" over that customer's screen. Reported as
     "หน้าของลูกค้าอะมันมักจะมีแจ้งเตือนของแอดมินโผล่มา". The data is still applied; only the
     announcement, which is written for staff, is held back. */
  var quiet=false;
  try{quiet=typeof window.imodeCustomerSurface==='function'&&window.imodeCustomerSurface()}catch(e){}
  if(lastNote&&!quiet)toast('🔄 '+lastNote);
  lastNote='';
 }

 /* ------------------------------------------------ system_settings, carefully ----
    The customer's signature is not on the quotation — js/75 keeps it in
    settings.quoteApprovals, because cloudUpsertQuotation() writes a column whitelist and
    would drop a new field. So the approval only reaches the office through system_settings,
    which is why "ลูกค้าเซ็นแล้วแต่สถานะไม่อัพเดต" could happen with the quotation row itself
    already correct in the database.

    ONLY THESE KEYS ARE TAKEN. syncCloud() replaces `settings` wholesale, which is right at
    boot and wrong in the middle of a session: an admin with the roles editor open would have
    their work replaced under them, and every repair in js/12, js/20, js/29 and js/47 would
    re-run against someone else's copy. These are the shared operational records — things one
    device writes for the others to see — and nothing about configuration. */
 var SETTING_KEYS=['quoteApprovals','quoteAccepts','quoteViews','quoteRequestLink','caseStatusLog',
                   'caseFeedback','trash','portalNews','uatAccounts','uatAccountEdits',
                   /* 2026-09-21 — quoteStaffSigns WAS MISSING, and that made a loss certain
                      rather than merely likely. service-case-detail.html writes the two staff
                      signature images there; a running application could never learn they
                      existed, so js/80's fingerprint stayed wrong and the next
                      cloudSaveSettings() pushed a blob without them and deleted them from the
                      database. Measured — see js/90's header. quoteDocs joins it so the paper
                      another device re-bakes is picked up too. */
                   'quoteStaffSigns','quoteDocs',
                   /* 2026-09-24 — roles and permissions, so an open tab learns about a role
                      change at once instead of pushing its stale copy back over it. Taken only
                      when the incoming permStamp is not older than ours (see js/90). */
                   'roles','userPermissions','rolePresetOptOut','systemBehavior','permStamp'];
 var PERM_RT={roles:1,userPermissions:1,rolePresetOptOut:1,systemBehavior:1,permStamp:1};
 /* Keys that are {id: record} and only ever grow. An incoming copy that has lost an id this
    device holds must not delete it: the writer may simply not have seen it yet. Same rule as
    js/90 applies to the push and the sync, and as CaseLive applies on the case page.
    quoteDocs is taken but NOT unioned: it is a cache js/80 re-bakes on a fingerprint change
    and caps at 25, so keeping entries another device just trimmed would only grow the row. */
 var ADDITIVE={quoteApprovals:1,quoteAccepts:1,quoteRequestLink:1,caseStatusLog:1,
               caseFeedback:1,quoteStaffSigns:1};
 function unionById(local,incoming){
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))return local;
  if(!local||typeof local!=='object'||Array.isArray(local))return incoming;
  var out={},k,own=Object.prototype.hasOwnProperty;
  for(k in incoming)if(own.call(incoming,k))out[k]=incoming[k];
  for(k in local)if(own.call(local,k)&&!own.call(out,k))out[k]=local[k];
  return out;
 }
 function applySettings(payload){
  state.events++;
  var data=payload&&payload.new&&payload.new.data;
  if(!data||typeof data!=='object')return;
  var moved=[];
  var permOk=false;
  try{permOk=!!data.permStamp&&(!settings.permStamp||data.permStamp>=settings.permStamp)}catch(e){}
  SETTING_KEYS.forEach(function(k){
   if(!(k in data))return;
   if(PERM_RT[k]&&!permOk)return;
   var incoming='',local='',next;
   try{next=ADDITIVE[k]?unionById(settings[k],data[k]):data[k]}catch(e){next=data[k]}
   try{incoming=JSON.stringify(next)}catch(e){return}
   try{local=JSON.stringify(settings[k])}catch(e){local=''}
   if(incoming===local)return;              /* our own echo, or nothing new */
   try{settings[k]=next;moved.push(k)}catch(e){}
  });
  if(!moved.length)return;
  /* The quotation list and the case page read the approval through js/75's helpers, so the
     re-render below is all that is needed for the chip and the track to catch up. */
  mark(moved.indexOf('quoteApprovals')>=0
    ? tl('ลูกค้าเซ็นอนุมัติใบเสนอราคาแล้ว','A customer approved a quotation')
    : tl('ข้อมูลอัปเดตจากอีกเครื่อง','Updated from another device'));
 }

 /* ------------------------------------------------------------------ the channel ---- */
 var channel=null;

 function stop(){
  if(!channel)return;
  try{var c=client();if(c&&c.removeChannel)c.removeChannel(channel)}catch(e){}
  channel=null;
  state.on=false;state.status='closed';state.tables=[];
 }

 function start(){
  var c=client();
  if(!c||channel)return;
  if(typeof c.channel!=='function'){
   state.status='unsupported';           /* an older supabase-js without realtime */
   return;
  }
  try{
   channel=c.channel('imode-live-'+Math.random().toString(36).slice(2,8));
   TABLES.forEach(function(cfg){
    channel.on('postgres_changes',{event:'*',schema:'public',table:cfg.name},function(p){
     try{apply(cfg,p)}catch(e){}
    });
    state.tables.push(cfg.name);
   });
   channel.on('postgres_changes',{event:'*',schema:'public',table:'system_settings'},function(p){
    try{applySettings(p)}catch(e){}
   });
   state.tables.push('system_settings');
   channel.subscribe(function(status){
    state.status=String(status||'');
    if(status==='SUBSCRIBED'){
     state.on=true;state.tries=0;
     /* Subscribing succeeds whether or not the table is actually published, so this is the
        one place that can tell somebody how to check. */
     try{console.info('[imode] realtime on:',state.tables.join(', '),
       '— if nothing ever arrives, run supabase/08-v70-realtime.sql')}catch(e){}
     return;
    }
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
     state.on=false;
     retry();
    }
   });
  }catch(e){
   state.status='error';
   channel=null;
   retry();
  }
 }

 function retry(){
  if(state.tries>=RETRY.length)return;
  var wait=RETRY[state.tries++];
  setTimeout(function(){
   if(state.on)return;
   stop();
   start();
  },wait);
 }

 /* ------------------------------------------------------------------ wiring ---- */
 /* `supa` is created inside initCloud(), which js/03's load handler awaits. initCloud is a
    top-level async function and therefore a window property, so this starts the moment the
    connection really exists rather than guessing at a delay. */
 var baseInit=window.initCloud;
 if(typeof baseInit==='function'){
  window.initCloud=async function(){
   var r=await baseInit.apply(this,arguments);
   try{if(client())start();else stop()}catch(e){}
   return r;
  };
 }
 /* Connecting or disconnecting from ตั้งค่าระบบ → ฐานข้อมูล Cloud. */
 ['saveCloudSettings','disconnectCloud'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var r=base.apply(this,arguments);
   var done=function(){try{stop();if(client())start()}catch(e){}};
   if(r&&typeof r.then==='function')r.then(done,done);else setTimeout(done,300);
   return r;
  };
 });
 /* A tab that was asleep may have missed events while the socket was down; the row it is
    looking at is redrawn from what did arrive, and anything older is still caught by the next
    reload, exactly as before this file existed. */
 document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible')return;
  if(!client()||state.on)return;
  state.tries=0;stop();start();
 });
 window.addEventListener('load',function(){setTimeout(function(){if(client()&&!channel)start()},1500)});
 window.imodeRealtimeStart=start;
 window.imodeRealtimeStop=stop;
})();
