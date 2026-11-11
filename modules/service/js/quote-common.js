/* js/quote-common.js — 2026-11-07: shared code for the three quotation pages
     quote-service.html   ใบเสนอราคา Service   number IM-QS + YYMM + ###
     quote-parts.html     ใบเสนอราคาอะไหล่     number IM-QP + YYMM + ###
     quote-warranty.html  ใบเสนอราคาประกัน     number IM-QW + YYMM + ###

   Outside the js/NN numbering on purpose: it is a LIBRARY. Loading it does nothing to the page;
   each page calls what it needs. index.html also loads it (before js/159) so the old screens,
   the customer portal and the paper stored for the case page draw these quotations the same way.

   STORAGE — no new column. A quotation from these pages is a normal row of public.quotations
   with the same explicit column list js/03 cloudUpsertQuotation() uses. What the old columns
   cannot hold travels in the `parts` jsonb that already exists:
     part rows   {v:2, name, qty, stock, cost, type, price, photos}
                 stock=true  → price = cost × (1 + markupStock%)   type 'stock'
                 stock=false → price typed by hand; cost = price    type 'manual'
                 so js/03 / js/153, which read cost × (1+markup(type)), still get the unit price.
     one meta    {kind:'meta', v:2, page, discount, vatPct, expenses:[{name,amount}],
                  machines:[{id,label,price}], travel, labor, warrantyType}
                 old code reads it as a part with no cost and skips it.
   other_expense = sum of the expenses, toll = 0, discount_pct = 0 (the amount is in meta).

   NUMBERS — public.next_quote_no(type) (supabase/20-quote-numbers.sql) when it exists; until
   that SQL is run, the browser computes max+1 from the quotations it can see plus a cloud
   lookup of the same prefix (the old way, js/03 quoteNo()).

   Company-wide expense names: settings.quoteExpenseOptions = {name: {name, at}}, merged into the
   settings row by a fresh read-modify-write (as the case page does for quoteStaffSigns) and
   protected by js/90 MAP_KEYS. */
(function(){
 'use strict';

 var K={
  cases:'imode_test_v532_cases',customers:'imode_test_v532_customers',machines:'imode_test_v532_machines',
  tech:'imode_v5_tech',quotes:'imode_test_v532_quotes',settings:'imode_v5_settings',
  user:'imode_v5_current_user',session:'imode_v69_session',cloud:'imode_v5_cloud',
  oldPage:'imode_v70_quote_old_page',requests:'imode_test_v532_line_requests'
 };
 var TYPES={
  service:{code:'QS',page:'quote-service.html',icon:'🛠',label:'ใบเสนอราคา Service',sub:'ซ่อม PM ติดตั้ง ค่าเดินทาง'},
  parts:{code:'QP',page:'quote-parts.html',icon:'📦',label:'ใบเสนอราคาอะไหล่',sub:'ขายอะไหล่ / ชิ้นส่วน'},
  warranty:{code:'QW',page:'quote-warranty.html',icon:'🛡',label:'ใบเสนอราคาประกัน',sub:'ขาย / ต่อแพ็กเกจประกัน'}
 };
 var DEF_CFG={onsiteS:0,onsiteL:0,workshopS:0,workshopL:0,diagnosisS:0,diagnosisL:0,nextS:0,nextL:0,
  laborS:0,laborL:0,urgentPct:30,emergencyPct:50,vatPct:7,validityDays:30,
  markupStock:22.5,markupSpecial:27.5,markupImported:32.5,markupHigh:17.5};
 var DEF_ZONES=[{name:'Z0',min:0,max:15,fee:250,perKm:0}];
 var SERVICE_NAMES={OS:'Onsite Service',WS:'Workshop Service',DG:'Diagnosis Only',SP:'Spare Parts',WP:'Warranty Package'};

 /* ------------------------------------------------------------------ helpers ---- */
 function readJ(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
 function writeJ(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function num(v){var n=Number(v);return isFinite(n)?n:0}
 function r2(n){return Math.round((num(n)+Number.EPSILON)*100)/100}
 function money(n){return num(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
 function pad(n){return String(n).padStart(2,'0')}
 function todayISO(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
 function param(name){try{return new URLSearchParams(location.search).get(name)||''}catch(e){return ''}}
 function $(id){return document.getElementById(id)}

 /* ------------------------------------------------------------------- data ---- */
 function settings(){return readJ(K.settings,{})||{}}
 function cfg(){var s=settings(),c=s.quoteConfig||{},o={},k;for(k in DEF_CFG)o[k]=DEF_CFG[k];for(k in c)if(c[k]!==''&&c[k]!=null)o[k]=c[k];return o}
 function user(){
  var u=readJ(K.user,null);
  if(!u){var s=readJ(K.session,null);u=s&&s.user||null}
  return u||{};
 }
 function userName(){var u=user();return String(u.name||u.fullName||u.username||'').trim()}
 var mem={customers:null,cases:null,machines:null,quotes:null,staff:null};
 function customers(){return mem.customers||(readJ(K.customers,[])||[])}
 function cases(){return mem.cases||(readJ(K.cases,[])||[])}
 function machines(){return mem.machines||(readJ(K.machines,[])||[])}
 function quotes(){return readJ(K.quotes,[])||[]}
 function byId(list,id){id=String(id||'');for(var i=0;i<list.length;i++)if(list[i]&&String(list[i].id)===id)return list[i];return null}
 function customer(id){return byId(customers(),id)}
 function caseById(id){return byId(cases(),id)}
 function machine(id){return byId(machines(),id)}
 function machineLabel(m){
  if(!m)return '';
  var name=String(m.nameTh||m.name||m.nameEn||m.model||m.id||'').trim();
  return name+(m.model&&m.model!==name?' / '+m.model:'')+(m.serial?' · S/N '+m.serial:'');
 }

 /* the same connection the case page uses (service-case-detail.html CaseWrite.cfg) */
 var client=null,triedClient=false;
 function cloudCfg(){
  var E=window.IMODE_ENV;if(E&&E.cloud&&E.cloud.url&&E.cloud.key)return {url:E.cloud.url,key:E.cloud.key};
  var c=readJ(K.cloud,null);return (c&&c.url&&c.key)?c:null;
 }
 function db(){
  if(triedClient)return client;triedClient=true;
  var c=cloudCfg();
  try{if(c&&window.supabase&&window.supabase.createClient)client=window.supabase.createClient(c.url,c.key,window.IMODE_SB_OPTIONS)}catch(e){client=null}
  return client;
 }
 function withTimeout(p,ms){
  return Promise.race([Promise.resolve(p),new Promise(function(res){setTimeout(function(){res({error:{message:'timeout'}})},ms||12000)})]);
 }

 /* row → app shape, the same mapping as js/03 fromCustomerDb / fromCaseDb / fromQuotationDb */
 function fromCustomerDb(c){return{id:c.id,name:c.name,branch:c.branch||'',contact:c.contact||'',phone:c.phone||'',email:c.email||'',location:c.location||'',address:c.address||'',mapUrl:c.map_url||'',latitude:c.latitude==null?'':c.latitude,longitude:c.longitude==null?'':c.longitude}}
 function fromCaseDb(c){return{id:c.id,ticket:c.ticket,customerId:c.customer_id,customer:c.customer,contact:c.contact,phone:c.phone,location:c.location,branch:c.branch,machineId:c.machine_id,machine:c.machine,model:c.model,serial:c.serial,serviceType:c.service_type,priority:c.priority,warranty:c.warranty,status:c.status,createdAt:c.created_at,updatedAt:c.updated_at}}
 function fromQuotationDb(q){
  return {id:q.id,caseId:q.case_id||'',caseTicket:q.case_ticket||'',customerId:q.customer_id||'',customer:q.customer||'',contact:q.contact||'',location:q.location||'',service:q.service||'OS',warrantyMode:q.warranty_mode||(q.warranty?'repair':'none'),warrantyMonths:q.warranty_months||12,distance:q.distance||0,distanceSource:q.distance_source||'manual',routeDurationMinutes:q.route_duration_minutes||0,pickupMode:q.pickup_mode||0,urgency:q.urgency||'normal',warranty:!!q.warranty,vatOn:q.vat_on!==false,delivery:q.delivery||'',note:q.delivery||'',payment:q.payment||'',purchaserName:q.purchaser_name||'',purchaserDate:q.purchaser_date||'',preparedBy:q.prepared_by||'',preparedDate:q.prepared_date||'',authorizedBy:q.authorized_by||'',authorizedDate:q.authorized_date||'',machineIds:q.machine_ids||[],parts:q.parts||[],extraHours:q.extra_hours||0,extraTechs:q.extra_techs||0,diagnosis:q.diagnosis||0,toll:q.toll||0,otherExpense:q.other_expense||0,discountPct:q.discount_pct||0,subtotal:q.subtotal||0,vat:q.vat||0,grand:q.grand||0,status:q.status||'ร่าง',createdAt:q.created_at,updatedAt:q.updated_at,
   attachments:Array.isArray(q.attachments)?q.attachments:undefined};
 }
 function toQuotationDb(q){
  return {id:q.id,case_id:q.caseId||null,case_ticket:q.caseTicket||'',customer_id:q.customerId||null,customer:q.customer||'',contact:q.contact||'',location:q.location||'',service:q.service,warranty_mode:q.warrantyMode||'none',warranty_months:q.warrantyMonths||12,distance:q.distance||0,distance_source:q.distanceSource||'manual',route_duration_minutes:q.routeDurationMinutes||0,pickup_mode:q.pickupMode||0,urgency:q.urgency||'normal',warranty:!!q.warranty,vat_on:!!q.vatOn,delivery:q.delivery||'',payment:q.payment||'',purchaser_name:q.purchaserName||'',purchaser_date:q.purchaserDate||null,prepared_by:q.preparedBy||'',prepared_date:q.preparedDate||null,authorized_by:q.authorizedBy||'',authorized_date:q.authorizedDate||null,machine_ids:q.machineIds||[],parts:q.parts||[],extra_hours:q.extraHours||0,extra_techs:q.extraTechs||0,diagnosis:q.diagnosis||0,toll:q.toll||0,other_expense:q.otherExpense||0,discount_pct:q.discountPct||0,subtotal:q.subtotal||0,vat:q.vat||0,grand:q.grand||0,status:q.status||'ร่าง',created_at:q.createdAt,updated_at:q.updatedAt};
 }

 /* Fresh lists from the cloud; the cached ones from index.html are shown first. */
 function refresh(){
  var c=db();
  if(!c)return Promise.resolve(false);
  return Promise.all([
   withTimeout(c.from('customers').select('id,name,branch,contact,phone,email,location,address,map_url,latitude,longitude')),
   withTimeout(c.from('service_cases').select('id,ticket,customer_id,customer,contact,phone,location,branch,machine_id,machine,model,serial,service_type,priority,warranty,status,created_at,updated_at')),
   withTimeout(c.from('machines').select('*'))
  ]).then(function(r){
   if(r[0]&&!r[0].error&&r[0].data&&r[0].data.length)mem.customers=r[0].data.map(fromCustomerDb);
   if(r[1]&&!r[1].error&&r[1].data&&r[1].data.length)mem.cases=r[1].data.map(fromCaseDb);
   if(r[2]&&!r[2].error&&r[2].data&&r[2].data.length)mem.machines=r[2].data;
   return true;
  },function(){return false});
 }
 function settingsFresh(){
  var c=db();if(!c)return Promise.resolve(null);
  return withTimeout(c.from('system_settings').select('data').eq('id','main').maybeSingle()).then(function(r){
   if(!r||r.error||!r.data||!r.data.data)return null;
   var local=settings(),fresh=r.data.data;
   /* keep only what this page reads, never replace the app's copy wholesale */
   ['quoteConfig','travelZones','warrantyConfig','mapConfig','quoteExpenseOptions','companyName','companyNameTh',
    'companyAddress','companyPhone','companyEmail','companyTaxId','quotationStatuses'].forEach(function(k){
    if(Object.prototype.hasOwnProperty.call(fresh,k))local[k]=fresh[k];
   });
   writeJ(K.settings,local);
   return fresh;
  },function(){return null});
 }
 function loadQuote(id){
  var local=byId(quotes(),id);
  var c=db();
  if(!c)return Promise.resolve(local);
  return withTimeout(c.from('quotations').select('*').eq('id',id).maybeSingle()).then(function(r){
   if(r&&!r.error&&r.data)return fromQuotationDb(r.data);
   return local;
  },function(){return local});
 }
 function staff(){
  if(mem.staff)return Promise.resolve(mem.staff);
  var fallback=function(){
   var list=(readJ(K.tech,[])||[]).map(function(t){return {id:t.id,name:String(t.name||'').trim(),role:t.team||''}});
   var me=userName();if(me&&!list.some(function(p){return p.name===me}))list.unshift({id:'me',name:me,role:''});
   return list.filter(function(p){return p.name});
  };
  var c=db();
  if(!c){mem.staff=fallback();return Promise.resolve(mem.staff)}
  return withTimeout(c.from('profiles').select('id,username,full_name,role,is_active').limit(500)).then(function(r){
   if(!r||r.error||!r.data||!r.data.length){mem.staff=fallback();return mem.staff}
   mem.staff=r.data.filter(function(p){return p&&p.is_active!==false&&!/^customer$/i.test(String(p.role||''))})
    .map(function(p){return {id:p.id,name:String(p.full_name||'').trim()||String(p.username||'').trim(),role:String(p.role||'')}})
    .filter(function(p){return p.name})
    .sort(function(a,b){return a.name.localeCompare(b.name,'th')});
   return mem.staff;
  },function(){mem.staff=fallback();return mem.staff});
 }

 /* ----------------------------------------------------------------- numbers ---- */
 /* 2026-11-07 owner: the number must show it is I-MODE's → IM-QP2611001 (choice A) */
 var BRAND='IM-';
 function ym(){var d=new Date(Date.now()+7*3600000);return String(d.getUTCFullYear()).slice(2)+pad(d.getUTCMonth()+1)}
 function localNumber(code,extra){
  var p=BRAND+code+ym(),n=0,s=settings();
  var ids=quotes().map(function(q){return q&&q.id}).concat(extra||[]);
  ['quoteApprovals','quoteStaffSigns','quoteAccepts','quoteDocs'].forEach(function(k){
   var m=s[k];if(m&&typeof m==='object')ids=ids.concat(Object.keys(m));
  });
  ids.forEach(function(id){
   id=String(id||'');
   if(id.indexOf(p)===0){var v=parseInt(id.slice(p.length),10);if(v>n)n=v}
  });
  return p+String(n+1).padStart(3,'0');
 }
 function issueNumber(type){
  var code=(TYPES[type]||TYPES.service).code,c=db();
  if(!c)return Promise.resolve({id:localNumber(code),server:false});
  return withTimeout(c.rpc('next_quote_no',{p_type:code}),10000).then(function(r){
   if(r&&!r.error&&typeof r.data==='string'&&r.data)return {id:r.data,server:true};
   /* function not installed yet (or refused): compute from what the cloud and this device hold */
   return withTimeout(c.from('quotations').select('id').like('id',BRAND+code+ym()+'%')).then(function(x){
    var ids=(x&&!x.error&&x.data||[]).map(function(o){return o.id});
    return {id:localNumber(code,ids),server:false};
   },function(){return {id:localNumber(code),server:false}});
  },function(){return {id:localNumber(code),server:false}});
 }

 /* 2026-11-11 owner: แก้ไขใบเสนอราคา = a new copy "<เลขเดิม>-REV01", "-REV02" …; the original stays
    as it was. Works with any base format (IM-QP2611001, a future QUO202611001 …): a revision of a
    revision counts on from the same base, never "-REV01-REV01". */
 function revBase(id){return String(id||'').replace(/-REV\d+$/i,'')}
 function revNumber(src){
  var base=revBase(src),p=base+'-REV',s=settings();
  function next(ids){
   var n=0;
   ids.forEach(function(id){id=String(id||'');if(id.indexOf(p)===0){var v=parseInt(id.slice(p.length),10);if(v>n)n=v}});
   return p+String(n+1).padStart(2,'0');
  }
  var ids=quotes().map(function(q){return q&&q.id});
  ['quoteApprovals','quoteStaffSigns','quoteAccepts','quoteDocs'].forEach(function(k){var m=s[k];if(m&&typeof m==='object')ids=ids.concat(Object.keys(m))});
  var c=db();
  if(!c)return Promise.resolve({id:next(ids),server:false});
  return withTimeout(c.from('quotations').select('id').like('id',p+'%')).then(function(x){
   return {id:next(ids.concat((x&&!x.error&&x.data||[]).map(function(o){return o.id}))),server:false};
  },function(){return {id:next(ids),server:false}});
 }
 function revOf(q){var m=metaOf(q);return String((m&&m.revOf)||(q&&q.revOf)||'')}
 /* Ref on the paper: what the person typed, else the case number (owner 2026-11-11) */
 function refOf(q){var m=metaOf(q);if(m&&typeof m.ref==='string')return m.ref;return String(q&&q.caseTicket||'')}
 function mobileOf(q){var m=metaOf(q);return String((m&&m.mobile)||'')}
 /* the creator's own mobile: their account, else their technician record */
 function myMobile(name){
  var u=user(),v=String(u.mobile||u.phone||u.tel||'').trim();if(v)return v;
  name=String(name||userName()).trim();if(!name)return '';
  var t=(readJ(K.tech,[])||[]).filter(function(x){return x&&String(x.name||'').trim()===name})[0];
  return t?String(t.phone||t.mobile||'').trim():'';
 }

 /* --------------------------------------------------------------- the model ---- */
 function typeOfQuote(q){
  var s=String(q&&q.service||'');
  if(s==='SP')return 'parts';
  if(s==='WP'||(q&&q.warrantyMode==='extend'))return 'warranty';
  return 'service';
 }
 function metaOf(q){
  var list=Array.isArray(q&&q.parts)?q.parts:[];
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].kind==='meta')return list[i];
  return null;
 }
 function isV2(q){return !!metaOf(q)}
 function markup(type,c){c=c||cfg();return num({stock:c.markupStock,special:c.markupSpecial,imported:c.markupImported,high:c.markupHigh}[type])/100}
 function unitPrice(p,c){
  if(p.stock)return r2(num(p.cost)*(1+num((c||cfg()).markupStock)/100));
  return r2(p.price);
 }
 function normPart(p,c){
  if(!p||p.kind)return null;
  if(p.v===2)return {name:p.name||'',qty:Math.max(1,num(p.qty)||1),stock:!!p.stock,cost:num(p.stock?p.cost:0),price:num(p.price),photos:Array.isArray(p.photos)?p.photos:[]};
  var stock=(p.type||'stock')==='stock';
  return {name:p.name||'',qty:Math.max(1,num(p.qty)||1),stock:stock,cost:stock?num(p.cost):0,
   price:r2(num(p.cost)*(1+markup(p.type||'stock',c))),photos:Array.isArray(p.photos)?p.photos:[]};
 }
 function blankModel(type){
  var c=cfg();
  return {type:type,id:'',status:'ร่าง',createdAt:'',caseId:'',customerId:'',contact:'',location:'',
   service:type==='parts'?'SP':type==='warranty'?'WP':'OS',urgency:'normal',
   machines:[],distance:0,distanceSource:'manual',travel:0,labor:0,parts:[],expenses:[],discount:0,
   vatOn:true,vatPct:num(c.vatPct)||7,note:'',payment:'ตามเงื่อนไข',
   preparedBy:userName(),preparedDate:todayISO(),authorizedBy:'',authorizedDate:todayISO(),
   warrantyMonths:12,warrantyType:'standard',attachments:[],
   /* 2026-11-09 owner: the Service page does everything the old page did (js/03 calcQuote) */
   pickupMode:0,coverage:'none',extraHours:0,extraTechs:0,diagnosis:0,purchaserName:'',purchaserDate:'',
   /* 2026-11-11: Ref (null = the case number), the contact mobile on the paper, the quotation this revises */
   ref:null,mobile:myMobile(),revOf:''};
 }
 /* the old page's rules (js/03 calcQuote), shared by the Service page and totals() */
 var URGENCY={normal:['ปกติ 0%',0],urgent:['เร่งด่วน','urgentPct'],emergency:['ฉุกเฉิน','emergencyPct'],critical:['Critical • เสนอราคาเป็นกรณี',0]};
 function urgencyPct(u,c){var x=URGENCY[u];return x&&typeof x[1]==='string'?num((c||cfg())[x[1]]):0}
 function isLargeJob(m){return (m.machines||[]).some(function(x){var mc=machine(x.id);return String(mc&&(mc.size||mc.machineSize)||'').toUpperCase()==='L'})}
 function laborRate(m,c){c=c||cfg();return num(isLargeJob(m)?c.laborL:c.laborS)}
 function laborFromHours(m,c){return r2(num(m.extraHours)*num(m.extraTechs)*laborRate(m,c))}
 function pickupFee(m){var mode=num(m.pickupMode),f=travelFee(m.distance);return r2(mode===3?f*2:(mode===1||mode===2)?f:0)}
 function covered(m){return m.type==='service'&&(m.coverage==='existing'||m.coverage==='repair')}
 /* ตั้งค่าระบบ → ระยะทางลูกค้า (js/118, settings.customerDistances) */
 function customerKm(cid){var d=(settings().customerDistances||{})[cid];d=Number(d);return cid&&isFinite(d)&&d>0?d:0}
 /* The old page saved its breakdown (serviceFee, emergency, travel, pickup, labor…) on the record it
    kept on this device; the cloud row has only the totals. Either copy may come in. */
 function legacyBreakdown(q){
  if(!q||metaOf(q))return null;
  var b=('serviceFee' in q&&q.serviceFee!=null)?q:null;
  if(!b){var l=byId(quotes(),q.id);if(l&&!metaOf(l)&&'serviceFee' in l&&l.serviceFee!=null)b=l}
  if(!b)return null;
  /* trust it only when it adds up to the total the customer saw */
  var gross=num(b.serviceFee)+num(b.emergency)+num(b.travel)+num(b.pickup)+num(b.labor)+num(b.partsTotal)+num(b.toll)+num(b.otherExpense)-num(b.diagnosis);
  var sub=r2(Math.max(0,gross)*(1-Math.min(100,num(b.discountPct))/100));
  return Math.abs(sub-num(q.subtotal))<0.05?b:null;
 }
 /* any quotation (from these pages or the old one) → the page model */
 function fromRecord(q){
  var c=cfg(),type=typeOfQuote(q),m=blankModel(type),meta=metaOf(q)||{};
  m.id=q.id||'';m.status=q.status||'ร่าง';m.createdAt=q.createdAt||'';
  m.caseId=q.caseId||'';m.customerId=q.customerId||'';m.contact=q.contact||'';m.location=q.location||'';
  m.service=q.service||m.service;m.urgency=q.urgency||'normal';
  m.distance=num(q.distance);m.distanceSource=q.distanceSource||'manual';
  m.vatOn=q.vatOn!==false;m.vatPct=meta.vatPct!=null?num(meta.vatPct):num(c.vatPct)||7;
  m.note=q.note||q.delivery||'';m.payment=q.payment||'ตามเงื่อนไข';
  m.preparedBy=q.preparedBy||'';m.preparedDate=q.preparedDate||todayISO();
  m.authorizedBy=q.authorizedBy||'';m.authorizedDate=q.authorizedDate||todayISO();
  m.warrantyMonths=num(q.warrantyMonths)||12;
  m.warrantyType=meta.warrantyType||((settings().quoteWarrantyType||{})[q.id])||'standard';
  m.parts=(q.parts||[]).map(function(p){return normPart(p,c)}).filter(Boolean);
  m.attachments=Array.isArray(q.attachments)?q.attachments.slice():[];
  m.purchaserName=q.purchaserName||'';m.purchaserDate=q.purchaserDate||'';
  m.ref=typeof meta.ref==='string'?meta.ref:null;m.mobile=typeof meta.mobile==='string'?meta.mobile:'';m.revOf=revOf(q);
  if(metaOf(q)){
   m.expenses=(meta.expenses||[]).map(function(e){return {name:e.name||'',amount:num(e.amount)}});
   m.discount=num(meta.discount);m.travel=num(meta.travel);m.labor=num(meta.labor);
   m.machines=(meta.machines||[]).map(function(x){return {id:x.id||'',label:x.label||machineLabel(machine(x.id)),price:num(x.price)}});
   m.urgency=URGENCY[q.urgency]?q.urgency:'normal';m.pickupMode=num(meta.pickupMode||q.pickupMode);
   m.coverage=meta.coverage||'none';m.extraHours=num(meta.extraHours);m.extraTechs=num(meta.extraTechs);m.diagnosis=num(meta.diagnosis);
  }else if(legacyBreakdown(q)){
   /* an old-page quotation whose breakdown this device still holds: every component as it was priced,
      so the total comes out exactly the same and the urgency / pickup / labour / diagnosis show */
   var b=legacyBreakdown(q);
   m.urgency=URGENCY[b.urgency]?b.urgency:'normal';m.pickupMode=num(b.pickupMode);
   m.coverage=(b.warrantyMode==='existing'||b.warrantyMode==='repair')?b.warrantyMode:'none';
   m.extraHours=num(b.extraHours);m.extraTechs=num(b.extraTechs);m.diagnosis=num(b.diagnosis);
   m.travel=num(b.travel);m.labor=num(b.labor);
   if(num(b.toll))m.expenses.push({name:'ค่าทางด่วน',amount:num(b.toll)});
   if(num(b.otherExpense))m.expenses.push({name:'ค่าใช้จ่ายอื่น',amount:num(b.otherExpense)});
   var ids0=b.machineIds||q.machineIds||[],fee=num(b.serviceFee),each0=ids0.length?r2(fee/ids0.length):0;
   m.machines=ids0.map(function(id,i){return {id:id,label:machineLabel(machine(id)),price:i===ids0.length-1?r2(fee-each0*(ids0.length-1)):each0}});
   var gross0=num(b.serviceFee)+num(b.emergency)+num(b.travel)+num(b.pickup)+num(b.labor)+num(b.partsTotal!=null?b.partsTotal:0)+num(b.toll)+num(b.otherExpense)-num(b.diagnosis);
   m.discount=r2(gross0*Math.min(100,num(b.discountPct))/100);
   m.legacyFixed={emergency:num(b.emergency),pickup:num(b.pickup)};
  }else{
   /* an old quotation: the stored totals are the truth; spread them onto lines the user can edit */
   /* a cloud row of an old-page quotation keeps only its totals: they are spread onto lines the user
      can edit, so the grand total stays exactly what the customer was quoted */
   var other=num(q.toll)+num(q.otherExpense);
   if(num(q.toll))m.expenses.push({name:'ค่าทางด่วน',amount:num(q.toll)});
   if(num(q.otherExpense))m.expenses.push({name:'ค่าใช้จ่ายอื่น',amount:num(q.otherExpense)});
   var ids=q.machineIds||[];
   m.machines=ids.map(function(id){return {id:id,label:machineLabel(machine(id)),price:0}});
   var partsSum=m.parts.reduce(function(s,p){return s+p.qty*p.price},0);
   var before=num(q.subtotal)/(1-Math.min(99,num(q.discountPct))/100);
   m.discount=r2(before-num(q.subtotal));
   var rest=r2(before-partsSum-other);
   if(m.machines.length&&rest>0){var each=r2(rest/m.machines.length);m.machines.forEach(function(x){x.price=each})}
   else if(rest>0&&type==='service')m.travel=rest;
  }
  return m;
 }
 function totals(m){
  var machinesSum=(m.machines||[]).reduce(function(s,x){return s+num(x.price)},0);
  var partsSum=(m.service==='DG')?0:(m.parts||[]).reduce(function(s,p){return s+Math.max(1,num(p.qty)||1)*unitPrice(p)},0);
  var expSum=(m.expenses||[]).reduce(function(s,e){return s+num(e.amount)},0);
  var travel=num(m.travel),labor=num(m.labor);
  /* js/03 calcQuote: urgency on the machine fee; pickup / delivery by distance zone; a covered job
     (existing warranty / repeat repair) charges no service, urgency, travel or labour */
  var emergency=m.legacyFixed?num(m.legacyFixed.emergency):r2(machinesSum*urgencyPct(m.urgency)/100);
  var pickup=m.legacyFixed?num(m.legacyFixed.pickup):pickupFee(m);
  if(m.type!=='service'){emergency=0;pickup=0}
  if(covered(m)){machinesSum=0;emergency=0;travel=0;labor=0}
  var diagnosis=m.type==='service'?Math.max(0,num(m.diagnosis)):0;
  var gross=r2(Math.max(0,machinesSum+emergency+travel+pickup+labor+partsSum+expSum-diagnosis));
  var discount=Math.min(gross,Math.max(0,num(m.discount)));
  var subtotal=r2(gross-discount);
  var vat=m.vatOn?r2(subtotal*num(m.vatPct)/100):0;
  return {machines:r2(machinesSum),parts:r2(partsSum),expenses:r2(expSum),travel:r2(travel),labor:r2(labor),
   emergency:r2(emergency),pickup:r2(pickup),diagnosis:r2(diagnosis),
   gross:gross,discount:r2(discount),subtotal:subtotal,vat:vat,grand:r2(subtotal+vat)};
 }
 /* page model → the quotation record every other screen reads */
 function toRecord(m){
  var c=cfg(),t=totals(m),cu=customer(m.customerId)||{},cs=caseById(m.caseId)||{},now=new Date().toISOString();
  var parts=(m.parts||[]).filter(function(p){return String(p.name||'').trim()||unitPrice(p)}).map(function(p){
   var unit=unitPrice(p,c);
   var o={v:2,name:String(p.name||'').trim(),qty:Math.max(1,num(p.qty)||1),stock:!!p.stock,
    cost:p.stock?num(p.cost):unit,type:p.stock?'stock':'manual',price:unit};
   if(p.photos&&p.photos.length)o.photos=p.photos.slice(0,4);
   return o;
  });
  var expenses=(m.expenses||[]).filter(function(e){return String(e.name||'').trim()||num(e.amount)})
   .map(function(e){return {name:String(e.name||'').trim()||'ค่าใช้จ่ายอื่น',amount:r2(e.amount)}});
  parts.push({kind:'meta',v:2,page:m.type,discount:t.discount,vatPct:num(m.vatPct),expenses:expenses,
   machines:(m.machines||[]).map(function(x){return {id:x.id,label:x.label||machineLabel(machine(x.id)),price:r2(x.price)}}),
   travel:t.travel,labor:t.labor,warrantyType:m.type==='warranty'?m.warrantyType:'',
   emergency:t.emergency,pickup:t.pickup,pickupMode:num(m.pickupMode),coverage:m.coverage||'none',
   extraHours:num(m.extraHours),extraTechs:num(m.extraTechs),diagnosis:t.diagnosis,
   ref:m.ref==null?(cs.ticket||''):String(m.ref),mobile:String(m.mobile||'').trim(),revOf:m.revOf||''});
  return {id:m.id,caseId:m.caseId||'',caseTicket:cs.ticket||'',customerId:m.customerId||'',customer:cu.name||'',
   contact:m.contact||'',location:m.location||'',service:m.service,
   warrantyMode:m.type==='warranty'?'extend':(covered(m)?m.coverage:'none'),warrantyMonths:num(m.warrantyMonths)||12,
   distance:num(m.distance),distanceSource:m.distanceSource||'manual',routeDurationMinutes:0,pickupMode:m.type==='service'?num(m.pickupMode):0,
   urgency:m.type==='service'?(m.urgency||'normal'):'normal',warranty:covered(m),vatOn:!!m.vatOn,note:m.note||'',delivery:m.note||'',
   payment:m.payment||'',purchaserName:m.purchaserName||'',purchaserDate:m.purchaserDate||'',preparedBy:m.preparedBy||'',preparedDate:m.preparedDate||'',
   authorizedBy:m.authorizedBy||'',authorizedDate:m.authorizedDate||'',
   machineIds:(m.machines||[]).map(function(x){return x.id}).filter(Boolean),parts:parts,
   extraHours:num(m.extraHours),extraTechs:num(m.extraTechs),diagnosis:t.diagnosis,toll:0,otherExpense:t.expenses,discountPct:0,
   serviceFee:t.machines,emergency:t.emergency,travel:t.travel,pickup:t.pickup,labor:t.labor,partsTotal:t.parts,other:t.expenses,
   discount:t.discount,subtotal:t.subtotal,vat:t.vat,grand:t.grand,
   revOf:m.revOf||'',status:m.status||'ร่าง',createdAt:m.createdAt||now,updatedAt:now,
   attachments:(m.attachments||[]).slice(0,ATT_MAX)};
 }

 /* ------------------------------------------------------------------- save ---- */
 function saveLocal(rec){
  var list=quotes(),hit=false;
  list=list.map(function(q){if(q&&q.id===rec.id){hit=true;return rec}return q});
  if(!hit)list.unshift(rec);
  return writeJ(K.quotes,list);
 }
 /* resolves {ok, cloud, id, rec, message} */
 function save(m){
  if(!m.customerId)return Promise.resolve({ok:false,message:'กรุณาเลือกลูกค้า'});
  var first=!m.id;
  var numP=first?(m.revOf?revNumber(m.revOf):issueNumber(m.type)):Promise.resolve({id:m.id});
  return numP.then(function(n){
   m.id=n.id;
   var rec=toRecord(m);
   if(first)m.createdAt=rec.createdAt;
   saveLocal(rec);
   var c=db();
   if(!c)return {ok:true,cloud:false,id:rec.id,rec:rec,first:first,message:'บันทึกในเครื่องนี้แล้ว (ยังไม่ได้เชื่อมต่อ Cloud)'};
   return withTimeout(c.from('quotations').upsert(toQuotationDb(rec))).then(function(r){
    if(r&&r.error)return {ok:true,cloud:false,id:rec.id,rec:rec,first:first,message:'บันทึกในเครื่องแล้ว แต่ส่งขึ้น Cloud ไม่สำเร็จ: '+r.error.message};
    /* 2026-11-08: photos / files ride in quotations.attachments (supabase/19-quote-attachments.sql),
       written in a second update exactly like js/157 so a database without the column still saves */
    return withTimeout(c.from('quotations').update({attachments:rec.attachments||[]}).eq('id',rec.id)).then(function(a){
     if(a&&a.error){
      try{console.warn('quotation attachments not on the server (run supabase/19-quote-attachments.sql):',a.error.message)}catch(e){}
      if((rec.attachments||[]).length)return {ok:true,cloud:true,id:rec.id,rec:rec,first:first,message:'บันทึก '+rec.id+' แล้ว แต่ไฟล์แนบยังอยู่ในเครื่องนี้เท่านั้น'};
     }
     return {ok:true,cloud:true,id:rec.id,rec:rec,first:first,message:'บันทึก '+rec.id+' แล้ว'};
    },function(){return {ok:true,cloud:true,id:rec.id,rec:rec,first:first,message:'บันทึก '+rec.id+' แล้ว'}});
   },function(e){return {ok:true,cloud:false,id:rec.id,rec:rec,first:first,message:'บันทึกในเครื่องแล้ว แต่ส่งขึ้น Cloud ไม่สำเร็จ'}});
  });
 }

 /* ------------------------------------------------ company-wide expense names ---- */
 function expenseOptions(){
  var m=settings().quoteExpenseOptions,out=['ค่าจัดส่ง','ค่าที่พัก','ค่าเบี้ยเลี้ยง'];
  if(m&&typeof m==='object')Object.keys(m).forEach(function(k){var v=m[k],n=String(v&&v.name||k).trim();if(n&&!(v&&v.off)&&out.indexOf(n)<0)out.push(n)});
  return out;
 }
 function addExpenseOptions(names){
  names=(names||[]).map(function(n){return String(n||'').trim()}).filter(Boolean);
  var known=expenseOptions(),add=names.filter(function(n,i){return known.indexOf(n)<0&&names.indexOf(n)===i});
  if(!add.length)return Promise.resolve(0);
  var at=new Date().toISOString();
  var s=settings();if(!s.quoteExpenseOptions||typeof s.quoteExpenseOptions!=='object')s.quoteExpenseOptions={};
  add.forEach(function(n){s.quoteExpenseOptions[n]={name:n,at:at}});
  writeJ(K.settings,s);
  var c=db();if(!c)return Promise.resolve(add.length);
  /* fresh read, change one key, write back — never this page's whole copy */
  return withTimeout(c.from('system_settings').select('data').eq('id','main').maybeSingle()).then(function(r){
   if(!r||r.error||!r.data||!r.data.data)return add.length;
   var data=r.data.data;
   if(!data.quoteExpenseOptions||typeof data.quoteExpenseOptions!=='object')data.quoteExpenseOptions={};
   add.forEach(function(n){if(!data.quoteExpenseOptions[n])data.quoteExpenseOptions[n]={name:n,at:at}});
   return withTimeout(c.from('system_settings').update({data:data,updated_at:at}).eq('id','main')).then(function(){return add.length});
  },function(){return add.length});
 }

 /* ------------------------------------------------------------- case chat ---- */
 function chatPost(caseId,text){
  var c=db();
  if(!c||!caseId||!text)return Promise.resolve({ok:false,message:'ยังไม่ได้เชื่อมต่อ Cloud'});
  return withTimeout(c.from('case_messages').insert({case_id:caseId,body:String(text).slice(0,4000),photos:[]})).then(function(r){
   if(r&&r.error)return {ok:false,message:r.error.message};
   return {ok:true};
  },function(e){return {ok:false,message:(e&&e.message)||'ส่งไม่ได้'}});
 }

 /* ------------------------------------------------------------- the paper ---- */
 function rows(q){
  var meta=metaOf(q)||{},type=typeOfQuote(q),out=[],n=0,c=cfg();
  var svc=SERVICE_NAMES[q.service]||q.service||'';
  (meta.machines||[]).forEach(function(x){
   var desc=type==='warranty'
    ?'Extended Warranty '+(q.warrantyMonths||12)+' Months - '+(x.label||'-')+' (ต่อประกันเครื่อง '+(q.warrantyMonths||12)+' เดือน)'
    :svc+' - '+(x.label||'-');
   out.push({no:++n,desc:desc,qty:1,unit:num(x.price),amount:num(x.price)});
  });
  if(num(meta.emergency)){var up=URGENCY[q.urgency];out.push({no:++n,desc:'Urgent Service Surcharge (ค่าบริการเร่งด่วน'+(up&&typeof up[1]==='string'?' +'+num(c[up[1]])+'%':'')+')',qty:1,unit:num(meta.emergency),amount:num(meta.emergency)})}
  if(num(meta.travel))out.push({no:++n,desc:'Travel & Fuel Charge (ค่าเดินทางและค่าน้ำมัน)',qty:1,unit:num(meta.travel),amount:num(meta.travel)});
  if(num(meta.pickup)){var pm=num(meta.pickupMode);out.push({no:++n,desc:(pm===3?'Pickup + Delivery':pm===1?'Pickup':'Delivery')+' (ค่ารับ-ส่งเครื่อง)',qty:1,unit:num(meta.pickup),amount:num(meta.pickup)})}
  if(num(meta.labor))out.push({no:++n,desc:'Additional Labor (ค่าแรงเพิ่มเติม)',qty:1,unit:num(meta.labor),amount:num(meta.labor)});
  (q.parts||[]).forEach(function(p){
   var x=normPart(p,c);if(!x)return;
   var unit=x.stock?unitPrice(x,c):num(x.price);if(!unit&&!x.name)return;
   out.push({no:++n,desc:(x.name||'อะไหล่')+' (ค่าอะไหล่)',qty:x.qty,unit:unit,amount:r2(unit*x.qty)});
  });
  (meta.expenses||[]).forEach(function(e){
   if(!num(e.amount))return;
   out.push({no:++n,desc:(e.name||'ค่าใช้จ่ายอื่น'),qty:1,unit:num(e.amount),amount:num(e.amount)});
  });
  if(num(meta.diagnosis))out.push({no:'',desc:'หัก Diagnosis ที่ชำระแล้ว / Diagnosis paid',qty:'',unit:'',amount:-num(meta.diagnosis)});
  if(num(meta.discount))out.push({no:'',desc:'ส่วนลด / Discount',qty:'',unit:'',amount:-num(meta.discount)});
  return out;
 }
 function rowsHTML(q){
  var list=rows(q);
  if(!list.length)return '<tr><td style="text-align:center">1</td><td>-</td><td style="text-align:center">1</td><td class="right">0.00</td><td class="right">0.00</td></tr>';
  return list.map(function(r){
   var neg=r.amount<0;
   return '<tr><td style="text-align:center">'+esc(r.no)+'</td><td>'+esc(r.desc)+'</td><td style="text-align:center">'+esc(r.qty)+'</td>'
    +'<td class="right">'+(r.unit===''?'':money(r.unit))+'</td><td class="right">'+(neg?'-':'')+money(Math.abs(r.amount))+'</td></tr>';
  }).join('');
 }
 function remarkText(q){
  var c=cfg(),type=typeOfQuote(q),meta=metaOf(q)||{};
  var valid=new Date(Date.parse(q.createdAt||'')||Date.now());valid=new Date(valid.getTime()+num(c.validityDays||30)*86400000);
  var bits=[];
  if(q.caseTicket)bits.push('อ้างอิงเคส '+q.caseTicket);
  if(type==='service'&&num(q.distance))bits.push('ระยะทาง '+num(q.distance).toLocaleString('th-TH')+' km');
  if(type==='warranty')bits.push('ต่อประกัน '+(q.warrantyMonths||12)+' เดือน');
  bits.push(q.vatOn?'ราคารวม VAT '+num(meta.vatPct!=null?meta.vatPct:c.vatPct)+'%':'ราคาไม่รวม VAT');
  bits.push('ใบเสนอราคามีอายุถึง '+valid.toLocaleDateString('th-TH',{day:'2-digit',month:'long',year:'numeric'}));
  return bits.join(' • ');
 }
 function thDate(v){if(!v)return '...............';var d=new Date(String(v).slice(0,10)+'T00:00:00');return isNaN(d)?String(v):d.toLocaleDateString('th-TH',{day:'2-digit',month:'long',year:'numeric'})}
 function paperHTML(q,logo){
  var s=settings(),c=cfg(),meta=metaOf(q)||{};
  var signs=(s.quoteStaffSigns||{})[q.id]||{},appr=(s.quoteApprovals||{})[q.id]||null;
  var created=Date.parse(q.createdAt||'');
  function mine(r){if(!r)return null;var t=Date.parse(r.at||'');return (!isFinite(created)||!isFinite(t)||t>=created)?r:null}
  var au=mine(signs.authorized),pr=mine(signs.prepared);appr=mine(appr);
  function cell(th,en,sig,name,date){
   return '<div class="quote-sign-cell"><div style="height:60px;display:flex;align-items:flex-end;justify-content:center;margin-top:8px">'
    +(sig?'<img src="'+esc(sig)+'" alt="" style="max-width:100%;max-height:56px;object-fit:contain">':'')+'</div>'
    +'<div class="sign-line" style="margin-top:0;border-top:1px dotted #777;padding-top:4px">'+th+' / '+en+'</div>'
    +'<div style="text-align:center;margin-top:4px">'+(esc(name||'')||'&nbsp;')+'</div><div style="text-align:center">Date '+date+'</div></div>';
  }
  var note=esc(q.note||q.delivery||'').replace(/\n/g,'<br>')||'-';
  return '<div id="quotePreviewDoc" class="quote-doc official">'
   +'<div class="quote-paper-header"><div><img src="'+esc(logo||'./assets/imode-document-logo.webp')+'" class="quote-paper-logo" alt="I-MODE"></div>'
   +'<div class="quote-paper-company"><b>'+esc(s.companyNameTh||'บริษัท ไอโมด พลัส จำกัด')+'</b><br>'+esc(s.companyName||'I-MODE Plus Co., Ltd.')
   +'<br>'+esc(s.companyAddress||'')+'<br>Tel. '+esc(s.companyPhone||'-')+' &nbsp; E-mail : '+esc(s.companyEmail||'-')+' &nbsp; URL : www.imode.co.th'
   +'<br>สำนักงานใหญ่ / เลขประจำตัวผู้เสียภาษีอากร : '+esc(s.companyTaxId||'-')+'</div></div>'
   +'<div class="quote-paper-title">QUOTATION</div>'
   +'<div class="quote-paper-meta"><div class="quote-paper-block">'
   +'<div class="row"><div class="label">Customer Name :</div><div class="value">'+esc(q.contact||'-')+'</div></div>'
   +'<div class="row"><div class="label">Company Name :</div><div class="value">'+esc(q.customer||'-')+'</div></div>'
   +'<div class="row"><div class="label">Address :</div><div class="value">'+esc(q.location||'-')+'</div></div></div>'
   +'<div class="quote-paper-block"><div class="row"><div class="label">No :</div><div class="value">'+esc(q.id||'DRAFT')+(revOf(q)?' <span style="font-size:11px;color:#475467">(แก้ไขจาก '+esc(revOf(q))+')</span>':'')+'</div></div>'
   +'<div class="row"><div class="label">Date :</div><div class="value">'+thDate(q.preparedDate)+'</div></div>'
   +'<div class="row"><div class="label">Ref :</div><div class="value">'+esc(refOf(q)||'-')+'</div></div>'
   +'<div class="row"><div class="label">Tel :</div><div class="value">'+esc(s.companyPhone||'-')+'</div></div>'
   +(mobileOf(q)?'<div class="row"><div class="label">Mobile :</div><div class="value">'+esc(mobileOf(q))+'</div></div>':'')+'</div></div>'
   +'<div class="quote-paper-table"><table><thead><tr><th style="width:56px">No.</th><th>Description</th><th style="width:70px">Qty</th><th style="width:150px">Unit Price</th><th style="width:160px">Amount Total</th></tr></thead>'
   +'<tbody>'+rowsHTML(q)+'</tbody></table></div>'
   +'<div class="quote-paper-remark"><div class="label">Remark :</div><div>'+esc(remarkText(q))+'</div></div>'
   +'<div class="quote-paper-summary"><div class="sum-row"><div style="text-align:right">Total</div><div><b>'+money(q.subtotal)+'</b></div></div>'
   +'<div class="sum-row"><div style="text-align:right">VAT '+(q.vatOn?num(meta.vatPct!=null?meta.vatPct:c.vatPct)+'%':'-')+'</div><div><b>'+money(q.vat)+'</b></div></div>'
   +'<div class="sum-row total"><div style="text-align:right">Grand Total</div><div><b>'+money(q.grand)+'</b></div></div></div>'
   +paperPartPhotos(q)
   +((q.attachments||[]).length?'<div style="font-size:11px;color:#475467;margin:8px 0">มีเอกสารแนบ '+q.attachments.length+' รายการ (ดูหน้าถัดไป)</div>':'')
   +'<div class="quote-paper-sign"><div><b>หมายเหตุเพิ่มเติม</b><div style="margin-top:7px;line-height:1.55">'+note+'</div></div>'
   +cell('ผู้อนุมัติ','Authorized by',au&&au.sig,(au&&au.name)||q.authorizedBy,thDate(q.authorizedDate))
   +cell('ผู้จัดทำ','Prepared by',pr&&pr.sig,(pr&&pr.name)||q.preparedBy,thDate(q.preparedDate))
   +cell('ลูกค้า','Customer',appr&&appr.sig,appr&&appr.name,appr&&appr.at?thDate(String(appr.at).slice(0,10)):'...............')
   +'</div><div class="quote-paper-footer">กรุณาลงนามและส่งกลับมายัง '+esc(s.companyEmail||'-')+' เพื่อยืนยันใบเสนอราคานี้</div>'
   +paperAttachPage(q)+'</div>';
 }
 /* inline styles only: print() writes the paper into a new window with PRINT_CSS alone */
 function paperPartPhotos(q){
  var items=[];
  (q.parts||[]).forEach(function(p){
   if(!p||p.kind||!Array.isArray(p.photos)||!p.photos.length)return;
   p.photos.forEach(function(src){items.push({src:src,name:p.name||'อะไหล่'})});
  });
  if(!items.length)return '';
  return '<div class="quote-paper-photos" style="margin:12px 0;border:1px solid #cfd8ea;padding:10px;break-inside:avoid;page-break-inside:avoid">'
   +'<div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#0c225e">รูปอะไหล่ที่เสนอ / Spare Part Photos</div>'
   +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'+items.map(function(it){
     return '<figure style="margin:0;text-align:center"><img src="'+esc(it.src)+'" alt="" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#f5f7fb;border:1px solid #e3eaf5">'
      +'<figcaption style="font-size:10px;margin-top:3px;color:#33415c">'+esc(it.name)+'</figcaption></figure>';
    }).join('')+'</div></div>';
 }
 function paperAttachPage(q){
  var a=Array.isArray(q.attachments)?q.attachments:[];
  if(!a.length)return '';
  var imgs=a.filter(function(x){return x.kind==='image'}),docs=a.filter(function(x){return x.kind!=='image'});
  return '<div class="quote-attach-page" style="break-before:page;page-break-before:always;margin-top:22px;padding-top:14px;border-top:2px dashed #c9d4ea">'
   +'<div style="font-weight:800;font-size:16px;color:#0c225e;margin-bottom:10px">เอกสารแนบ / Attachments'+(q.id?' · '+esc(q.id):'')+'</div>'
   +(imgs.length?'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">'+imgs.map(function(x,i){
     return '<figure style="margin:0;break-inside:avoid;page-break-inside:avoid"><img src="'+esc(x.data)+'" alt="" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#f5f7fb;border:1px solid #e3eaf5">'
      +'<figcaption style="font-size:11px;margin-top:4px;color:#33415c">'+(i+1)+'. '+esc(x.caption||x.name||'')+'</figcaption></figure>';
    }).join('')+'</div>':'')
   +(docs.length?'<div style="margin-top:14px;font-size:12px;color:#1d232f"><b>ไฟล์ประกอบ / Attached files</b><ul style="margin:6px 0 0 18px;padding:0">'
     +docs.map(function(x){return '<li>'+esc(x.name)+' ('+(BADGE[x.kind]||'FILE')+', '+sizeLabel(x.size)+')'+(x.caption?' — '+esc(x.caption):'')+'</li>'}).join('')
     +'</ul><div style="font-size:10.5px;color:#667085;margin-top:4px">ไฟล์เหล่านี้แนบมาพร้อมใบเสนอราคาในระบบ ขอรับไฟล์ได้จากเจ้าหน้าที่</div></div>':'')
   +'</div>';
 }
 var PRINT_CSS='body{font-family:Arial,Tahoma,sans-serif;padding:18px;color:#1d232f}.quote-doc.official{max-width:1020px;margin:auto;border:1px solid #dadce8;padding:18px 22px;background:#fff}.quote-paper-header{display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:start;padding-bottom:10px;border-bottom:2px solid #1748a5}.quote-paper-logo{width:210px;height:92px;object-fit:contain}.quote-paper-company{font-size:12px;line-height:1.5;color:#222}.quote-paper-company b{font-size:14px;color:#000}.quote-paper-title{text-align:center;font-size:22px;font-weight:800;margin:6px 0 10px;color:#111}.quote-paper-meta{display:grid;grid-template-columns:1.2fr .9fr;gap:18px;margin-bottom:8px}.quote-paper-block .row{display:grid;grid-template-columns:140px 1fr;gap:8px;margin-bottom:6px;font-size:13px}.quote-paper-block .label{font-weight:700;color:#21306e}.quote-paper-table table{width:100%;border-collapse:collapse;border:1px solid #444}.quote-paper-table th,.quote-paper-table td{border:1px solid #444;padding:7px 8px;font-size:12px;vertical-align:top}.quote-paper-table th{background:#f7f7fb;text-align:center}.quote-paper-table td.right{text-align:right}.quote-paper-remark{display:grid;grid-template-columns:90px 1fr;border:1px solid #444;border-top:0}.quote-paper-remark div{padding:8px;font-size:12px}.quote-paper-remark .label{font-weight:700;color:#21306e;border-right:1px solid #444}.quote-paper-summary{margin-left:auto;width:340px;border:1px solid #444;border-top:0}.quote-paper-summary .sum-row{display:grid;grid-template-columns:1fr 140px}.quote-paper-summary .sum-row>div{padding:6px 8px;border-top:1px solid #444;font-size:12px}.quote-paper-summary .sum-row b{text-align:right;display:block}.quote-paper-summary .sum-row.total{font-weight:800;color:#21306e}.quote-paper-sign{display:grid;grid-template-columns:1.1fr .9fr .9fr .9fr;border:1px solid #444;margin-top:12px}.quote-paper-sign>div{min-height:122px;padding:10px;border-right:1px solid #444;font-size:12px}.quote-paper-sign>div:last-child{border-right:0}.quote-paper-sign .sign-line{text-align:center;font-weight:700}.quote-paper-footer{margin-top:8px;font-size:11px;line-height:1.55;color:#333}@media print{body{padding:0}.quote-doc.official{border:0;max-width:none;margin:0}}';
 function print(q){
  var logo=new URL('./assets/imode-document-logo.webp',location.href).href;
  var w=window.open('','_blank','width=1100,height=860');
  if(!w)return false;
  w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>'+esc(q.id||'Quotation')+'</title><style>'+PRINT_CSS+'</style></head><body>'
   +paperHTML(q,logo)+'<script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
  return true;
 }

 /* ------------------------------------------------------------- the maps ---- */
 function mapsUrl(cu,typed){
  var s=settings(),m=s.mapConfig||{};
  if(cu&&/^https:\/\//i.test(String(cu.mapUrl||'')))return cu.mapUrl;
  var dest='';
  if(cu&&m.useCoordinatesFirst&&cu.latitude!==''&&cu.longitude!==''&&isFinite(Number(cu.latitude))&&isFinite(Number(cu.longitude))&&cu.latitude!=null)dest=cu.latitude+','+cu.longitude;
  if(!dest)dest=String(typed||'').trim()||(cu&&(cu.address||cu.location))||'';
  if(!dest)return '';
  var origin=(m.useCoordinatesFirst&&m.originLat!==''&&m.originLat!=null&&m.originLng!==''&&m.originLng!=null)?(m.originLat+','+m.originLng):(m.originAddress||s.companyAddress||'');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(dest)+(origin?'&origin='+encodeURIComponent(origin):'');
 }
 function travelFee(km){
  var zones=(settings().travelZones||DEF_ZONES).slice().sort(function(a,b){return num(a.min)-num(b.min)});
  var d=Math.max(0,num(km));
  var z=null;for(var i=0;i<zones.length;i++){var x=zones[i];if(x.max===null||x.max===''||x.max===undefined||d<=num(x.max)){z=x;break}}
  z=z||zones[zones.length-1]||{fee:0,perKm:0};
  var fee=num(z.perKm)>0?d*num(z.perKm):num(z.fee);
  if(num(z.perKm)>0){var zi=zones.indexOf(z),prev=zi>0?num(zones[zi-1].fee):0;if(prev>fee)fee=prev}
  return r2(fee);
 }

 /* ------------------------------------------------------------------- UI ---- */
 function toast(msg,ms){
  var t=$('qcToast');
  if(!t){t=document.createElement('div');t.id='qcToast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('show')},ms||2800);
 }
 function pageUrl(q){return (TYPES[typeOfQuote(q)]||TYPES.service).page+'?id='+encodeURIComponent(q.id)}
 /* The three type buttons, on every page. On a quotation that is already saved, another type is
    a NEW quotation (the number prefix belongs to the type), carrying the customer and case. */
 function typeBar(el,current,getCtx){
  if(!el)return;
  el.innerHTML=Object.keys(TYPES).map(function(k){
   var t=TYPES[k],on=k===current;
   return '<a class="qc-type'+(on?' is-on':'')+'" data-qc-type="'+k+'" href="'+t.page+'"'+(on?' aria-current="page"':'')+'>'
    +'<b>'+t.icon+' '+esc(t.label)+'</b><small>'+esc(t.sub)+'</small></a>';
  }).join('');
  el.addEventListener('click',function(e){
   var a=e.target.closest&&e.target.closest('[data-qc-type]');if(!a)return;
   var k=a.getAttribute('data-qc-type');
   e.preventDefault();
   if(k===current)return;
   var ctx=(getCtx&&getCtx())||{},qs=[];
   if(ctx.id&&!confirm('ใบเสนอราคา '+ctx.id+' เป็นประเภท '+TYPES[current].label+'\nเปลี่ยนประเภท = เริ่มใบเสนอราคาใหม่ (ใช้ลูกค้า/เคสเดิม) ต้องการไปต่อหรือไม่?'))return;
   if(ctx.dirty&&!ctx.id&&!confirm('ข้อมูลที่ยังไม่บันทึกในหน้านี้จะไม่ถูกนำไปด้วย (ยกเว้นลูกค้าและเคส) ต้องการไปต่อหรือไม่?'))return;
   if(ctx.caseId)qs.push('caseId='+encodeURIComponent(ctx.caseId));
   if(ctx.customerId)qs.push('customerId='+encodeURIComponent(ctx.customerId));
   location.href=TYPES[k].page+(qs.length?'?'+qs.join('&'):'');
  });
 }
 function combo(sel,opts){try{if(typeof window.imodeCombo==='function')window.imodeCombo(sel,opts||{})}catch(e){}}
 function refreshCombo(sel){try{if(sel&&sel.__comboRefresh)sel.__comboRefresh()}catch(e){}}

 /* Case + customer + contact + location (typeable) + Google Maps. Fills `m` in place and calls
    onChange(). Saving never requires a case or a machine — only a customer. */
 function picker(el,m,onChange){
  el.innerHTML=''
   +'<div class="qc-grid">'
   +'<div class="qc-field"><label for="qcCase">อ้างอิงเคส (ไม่บังคับ)</label><select id="qcCase"></select></div>'
   +'<div class="qc-field"><label for="qcCustomer">ลูกค้า <span class="req">*</span></label><select id="qcCustomer"></select></div>'
   +'<div class="qc-field"><label for="qcContact">ผู้ติดต่อ</label><input id="qcContact" autocomplete="off"></div>'
   +'<div class="qc-field qc-span2"><label for="qcLocation">สถานที่ / ที่อยู่จัดส่ง</label>'
   +'<div class="qc-inline"><input id="qcLocation" autocomplete="off" placeholder="พิมพ์ที่อยู่ หรือเลือกลูกค้าเพื่อดึงที่อยู่">'
   +'<button type="button" class="qc-btn" id="qcMaps">📍 Google Maps</button></div><small class="qc-help" id="qcMapsHelp"></small></div>'
   +'</div>';
  var sc=$('qcCase'),su=$('qcCustomer');
  function fill(){
   sc.innerHTML='<option value="">ไม่อ้างอิงเคส</option>'+cases().slice().sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))})
    .map(function(c){return '<option value="'+esc(c.id)+'">'+esc((c.ticket||c.id)+' · '+(c.customer||'')+(c.machine?' · '+c.machine:''))+'</option>'}).join('');
   su.innerHTML='<option value="">เลือกลูกค้า</option>'+customers().slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'th')})
    .map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.name+(c.branch?' ('+c.branch+')':''))+'</option>'}).join('');
   sc.value=m.caseId||'';su.value=m.customerId||'';
   if(m.caseId&&sc.value!==m.caseId){sc.insertAdjacentHTML('beforeend','<option value="'+esc(m.caseId)+'">'+esc(m.caseId)+'</option>');sc.value=m.caseId}
   if(m.customerId&&su.value!==m.customerId){su.insertAdjacentHTML('beforeend','<option value="'+esc(m.customerId)+'">'+esc(m.customerId)+'</option>');su.value=m.customerId}
   $('qcContact').value=m.contact||'';$('qcLocation').value=m.location||'';
   refreshCombo(sc);refreshCombo(su);
  }
  fill();
  combo(sc);combo(su);
  function applyCustomer(id,fromCase){
   var cu=customer(id);
   m.customerId=id||'';
   if(cu){
    if(!fromCase||!m.contact)m.contact=cu.contact||m.contact||'';
    m.location=cu.address||[cu.branch,cu.location].filter(Boolean).join(' / ')||m.location||'';
    $('qcContact').value=m.contact;$('qcLocation').value=m.location;
   }
   onChange&&onChange('customer');
  }
  su.addEventListener('change',function(){applyCustomer(su.value,false)});
  sc.addEventListener('change',function(){
   m.caseId=sc.value||'';
   var c=caseById(m.caseId);
   if(c){
    if(c.contact)m.contact=c.contact;
    if(c.customerId){su.value=c.customerId;refreshCombo(su);applyCustomer(c.customerId,true);}
    onChange&&onChange('case',c);
   }else onChange&&onChange('case',null);
  });
  $('qcContact').addEventListener('input',function(){m.contact=this.value;onChange&&onChange('contact')});
  $('qcLocation').addEventListener('input',function(){m.location=this.value;onChange&&onChange('location')});
  $('qcMaps').addEventListener('click',function(){
   var url=mapsUrl(customer(m.customerId),$('qcLocation').value);
   var help=$('qcMapsHelp');
   if(!url){help.textContent='พิมพ์ที่อยู่ หรือเลือกลูกค้าที่มีที่อยู่/พิกัดก่อน';return}
   var w=window.open(url,'_blank','noopener');
   help.textContent=w===null?'เปิด Google Maps ไม่ได้ กรุณาอนุญาต Pop-up':'เปิด Google Maps ในแท็บใหม่แล้ว';
  });
  return {refill:fill};
 }
 function staffSelect(sel,value){
  return staff().then(function(list){
   var names=list.map(function(p){return p.name});
   if(value&&names.indexOf(value)<0)names.unshift(value);
   sel.innerHTML='<option value="">— เลือกพนักงาน —</option>'+names.map(function(n){return '<option'+(n===value?' selected':'')+'>'+esc(n)+'</option>'}).join('');
   sel.value=value||'';
   return list;
  });
 }

 /* After a quotation for a case is created: a notice in the case chat with its number. People are
    added one by one (or all at once) as @tags, which js/138 already turns into a bell entry. */
 function chatDialog(rec){
  if(!rec||!rec.caseId)return;
  var old=$('qcChatDlg');if(old)old.remove();
  var picked=[];
  var base='🧾 สร้างใบเสนอราคา '+rec.id+' · '+(rec.customer||'')+' · ยอดรวม '+money(rec.grand)+' บาท';
  var d=document.createElement('div');
  d.id='qcChatDlg';d.className='qc-dlg';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','qcChatTitle');
  d.innerHTML='<div class="qc-dlg-card"><h3 id="qcChatTitle">แจ้งในแชทเคส '+esc(rec.caseTicket||rec.caseId)+'</h3>'
   +'<p class="qc-help">ข้อความนี้จะโพสต์ในแชทของเคส แท็กทีละคน หรือกด @ทุกคน = ทุกคนที่เกี่ยวกับเคสนี้</p>'
   +'<div class="qc-chat-msg" id="qcChatMsg"></div>'
   +'<div class="qc-inline"><select id="qcChatPerson"><option value="">กำลังโหลดรายชื่อ…</option></select>'
   +'<button type="button" class="qc-btn" id="qcChatAdd">＋ เพิ่ม</button><button type="button" class="qc-btn" id="qcChatAll" title="ทุกคนที่เคยคุยในแชทเคสนี้ + ช่างที่ได้รับมอบหมาย">👥 @ทุกคน</button></div>'
   +'<div class="qc-chips" id="qcChatChips"></div>'
   +'<div class="qc-dlg-acts"><button type="button" class="qc-btn" id="qcChatSkip">ไม่ส่ง</button>'
   +'<button type="button" class="qc-btn is-primary" id="qcChatSend">ส่งเข้าแชทเคส</button></div></div>';
  document.body.appendChild(d);
  var list=[];
  function text(){return base+(picked.length?'\n'+picked.map(function(n){return '@'+n}).join(' '):'')}
  function draw(){
   $('qcChatMsg').textContent=text();
   $('qcChatChips').innerHTML=picked.map(function(n,i){return '<span class="qc-chip">@'+esc(n)+' <button type="button" aria-label="เอาออก" data-i="'+i+'">×</button></span>'}).join('');
   $('qcChatPerson').innerHTML='<option value="">— เลือกคน —</option>'+list.filter(function(p){return picked.indexOf(p.name)<0})
    .map(function(p){return '<option>'+esc(p.name)+'</option>'}).join('');
  }
  staff().then(function(l){list=l;draw()});
  draw();
  $('qcChatAdd').onclick=function(){var v=$('qcChatPerson').value;if(v&&picked.indexOf(v)<0){picked.push(v);draw()}};
  /* 2026-11-07 (owner, choice A): "all" = @ทุกคน, which js/138 resolves to the people involved in
     the case (posted in its chat or assigned) — not every staff account */
  $('qcChatAll').onclick=function(){if(picked.indexOf('ทุกคน')<0)picked.unshift('ทุกคน');draw()};
  $('qcChatChips').onclick=function(e){var b=e.target.closest('button[data-i]');if(!b)return;picked.splice(Number(b.getAttribute('data-i')),1);draw()};
  $('qcChatSkip').onclick=function(){d.remove()};
  $('qcChatSend').onclick=function(){
   var btn=this;btn.disabled=true;btn.textContent='กำลังส่ง…';
   chatPost(rec.caseId,text()).then(function(r){
    if(r.ok){toast('ส่งเข้าแชทเคสแล้ว');d.remove()}
    else{btn.disabled=false;btn.textContent='ส่งเข้าแชทเคส';toast('ส่งเข้าแชทไม่ได้: '+r.message,4000)}
   });
  };
  d.addEventListener('keydown',function(e){if(e.key==='Escape')d.remove()});
  setTimeout(function(){try{$('qcChatPerson').focus()}catch(e){}},30);
 }

 /* ------------------------------------------------ photos and attached files ---- */
 /* 2026-11-08 owner (checklist 23): the new pages get what the old page has — a 📷 per part row
    (js/153: up to 4, longest side 1024 px) and "รูปและไฟล์แนบ" (js/157: images 1280 px, PDF / Excel /
    Word up to 2.5 MB, 10 per quotation). Same shapes, so index.html's paper shows them too. */
 var ATT_MAX=10,ATT_FILE_MAX=2.5*1024*1024,PART_PH_MAX=4;
 function shrinkImage(file,side){
  return new Promise(function(resolve,reject){
   var url=URL.createObjectURL(file),img=new Image();
   img.onload=function(){
    var k=Math.min(1,side/Math.max(img.width,img.height)),cv=document.createElement('canvas');
    cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    URL.revokeObjectURL(url);resolve(cv.toDataURL('image/jpeg',0.8));
   };
   img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('image'))};
   img.src=url;
  });
 }
 function readDataUrl(file){
  return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(String(r.result||''))};r.onerror=function(){reject(r.error)};r.readAsDataURL(file)});
 }
 function fileKind(t,name){
  t=String(t||'');name=String(name||'').toLowerCase();
  if(/^image\//.test(t))return 'image';
  if(/pdf$/i.test(t)||/\.pdf$/.test(name))return 'pdf';
  if(/sheet|excel|csv/i.test(t)||/\.(xlsx?|csv)$/.test(name))return 'xlsx';
  if(/word|officedocument\.wordprocessing/i.test(t)||/\.docx?$/.test(name))return 'docx';
  return '';
 }
 var BADGE={pdf:'PDF',xlsx:'XLSX',docx:'DOCX'};
 function sizeLabel(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
 function bytesOf(data){var bin=atob(String(data||'').split(',')[1]||''),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
 /* an image opens large on the page; a PDF in a new tab; Excel / Word download */
 function openAttachment(a){
  if(!a||!a.data)return;
  if(a.kind==='image'||/^data:image\//.test(String(a.data))){
   var lb=document.createElement('div');lb.className='qc-light';lb.setAttribute('role','dialog');lb.setAttribute('aria-label',a.name||'รูป');
   lb.innerHTML='<img alt="">';lb.firstChild.src=a.data;lb.addEventListener('click',function(){lb.remove()});
   document.body.appendChild(lb);return;
  }
  try{
   var url=URL.createObjectURL(new Blob([bytesOf(a.data)],{type:a.type||'application/octet-stream'}));
   if(a.kind==='pdf'){window.open(url,'_blank','noopener')}
   else{var l=document.createElement('a');l.href=url;l.download=a.name||'file';document.body.appendChild(l);l.click();l.remove()}
   setTimeout(function(){URL.revokeObjectURL(url)},60000);
  }catch(e){toast('เปิดไฟล์ไม่ได้')}
 }
 function attachEditor(el,m,onChange){
  if(!el)return {render:function(){}};
  function by(){return userName()}
  function html(){
   var list=m.attachments||[],imgs=list.filter(function(a){return a.kind==='image'}),docs=list.filter(function(a){return a.kind!=='image'});
   return (imgs.length?'<div class="qc-att-photos">'+imgs.map(function(a){
     return '<figure class="qc-att-ph"><button type="button" class="qc-att-img" data-att-open="'+esc(a.id)+'" aria-label="ดูรูป '+esc(a.name)+'"><img src="'+esc(a.data)+'" alt=""></button>'
      +'<button type="button" class="qc-att-x" data-att-rm="'+esc(a.id)+'" aria-label="เอารูปออก">✕</button>'
      +'<input data-att-cap="'+esc(a.id)+'" maxlength="80" placeholder="คำอธิบายรูป" value="'+esc(a.caption||'')+'" aria-label="คำอธิบายรูป"></figure>';
    }).join('')+'</div>':'')
    +(docs.length?'<div class="qc-att-files">'+docs.map(function(a){
     return '<div class="qc-att-file"><span class="qc-att-badge is-'+esc(a.kind)+'">'+(BADGE[a.kind]||'FILE')+'</span>'
      +'<div class="qc-att-fmain"><button type="button" class="qc-att-name" data-att-open="'+esc(a.id)+'">'+esc(a.name)+'</button>'
      +'<input data-att-cap="'+esc(a.id)+'" maxlength="80" placeholder="คำอธิบายไฟล์ (ถ้ามี)" value="'+esc(a.caption||'')+'" aria-label="คำอธิบายไฟล์"></div>'
      +'<small>'+sizeLabel(a.size)+'</small><button type="button" class="qc-att-x2" data-att-rm="'+esc(a.id)+'" aria-label="เอาไฟล์ออก">✕</button></div>';
    }).join('')+'</div>':'')
    +(list.length?'':'<div class="qc-empty">ยังไม่มีไฟล์แนบ</div>')
    +'<label class="qc-btn is-add qc-addrow qc-att-add'+(list.length>=ATT_MAX?' is-off':'')+'">📎 เพิ่มรูป / ไฟล์'
    +'<input type="file" class="qc-att-input" multiple hidden accept="image/*,application/pdf,.pdf,.xls,.xlsx,.csv,.doc,.docx"'+(list.length>=ATT_MAX?' disabled':'')+'></label>'
    +'<small class="qc-att-hint">รูป, PDF, Excel, Word · สูงสุด '+ATT_MAX+' ไฟล์ · ไฟล์ละไม่เกิน 2.5 MB · ออกเป็นหน้าเอกสารแนบต่อจากใบเสนอราคา</small>';
  }
  function render(){el.innerHTML=html()}
  function add(files){
   m.attachments=m.attachments||[];
   return [].slice.call(files||[]).reduce(function(pr,file){
    return pr.then(function(){
     var k=fileKind(file.type,file.name);
     if(!k){toast(file.name+' — แนบได้เฉพาะรูป PDF Excel หรือ Word');return}
     if(m.attachments.length>=ATT_MAX){toast('แนบได้สูงสุด '+ATT_MAX+' ไฟล์');return}
     var job=k==='image'?shrinkImage(file,1280).then(function(d){return {data:d,type:'image/jpeg'}})
                        :readDataUrl(file).then(function(d){return {data:d,type:file.type||''}});
     return job.then(function(o){
      var size=Math.round((o.data.length-o.data.indexOf(',')-1)*0.75);
      if(size>ATT_FILE_MAX){toast(file.name+' ใหญ่เกิน 2.5 MB');return}
      m.attachments.push({id:'QA-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
       name:file.name,type:o.type,kind:k,size:size,data:o.data,caption:'',by:by(),at:new Date().toISOString()});
     },function(){toast('อ่านไฟล์ '+file.name+' ไม่ได้')});
    });
   },Promise.resolve()).then(function(){render();onChange()});
  }
  el.addEventListener('change',function(e){var t=e.target;if(t&&t.classList.contains('qc-att-input')){add(t.files);t.value=''}});
  el.addEventListener('click',function(e){
   var rm=e.target.closest('[data-att-rm]');
   if(rm){
    var id=rm.getAttribute('data-att-rm'),a=(m.attachments||[]).filter(function(x){return x.id===id})[0];
    if(a&&!confirm('เอา “'+(a.name||'ไฟล์')+'” ออก?'))return;
    m.attachments=(m.attachments||[]).filter(function(x){return x.id!==id});render();onChange();return;
   }
   var op=e.target.closest('[data-att-open]');
   if(op){var oid=op.getAttribute('data-att-open');openAttachment((m.attachments||[]).filter(function(x){return x.id===oid})[0])}
  });
  el.addEventListener('input',function(e){
   var t=e.target;if(!t||!t.hasAttribute('data-att-cap'))return;
   var a=(m.attachments||[]).filter(function(x){return x.id===t.getAttribute('data-att-cap')})[0];
   if(a){a.caption=String(t.value||'').slice(0,80);onChange(true)}
  });
  return {render:render};
 }

 /* -------------------------------------------------------- row editors ---- */
 function mkPct(){return num(cfg().markupStock)}
 /* Spare parts: name, quantity, a Stock switch PER ROW (on = cost + markupStock %, off = type the
    sale price), the line total, remove. */
 function partsEditor(el,addBtn,m,onChange){
  function html(p,i){
   var unit=unitPrice(p),line=unit*Math.max(1,num(p.qty)||1),mk=mkPct();
   var price=p.stock
    ?'<div class="qc-field"><label for="pc'+i+'">ต้นทุน/หน่วย</label><input id="pc'+i+'" data-k="cost" data-i="'+i+'" type="number" min="0" step="0.01" inputmode="decimal" value="'+esc(p.cost||'')+'" placeholder="0.00"><small class="qc-unit" data-unit="'+i+'">ขาย '+money(unit)+' / หน่วย</small></div>'
    :'<div class="qc-field"><label for="pp'+i+'">ราคาขาย/หน่วย</label><input id="pp'+i+'" data-k="price" data-i="'+i+'" type="number" min="0" step="0.01" inputmode="decimal" value="'+esc(p.price||'')+'" placeholder="0.00"><small class="qc-unit">พิมพ์ราคาขายเอง</small></div>';
   return '<div class="qc-line qc-part">'
    +'<div class="qc-field qc-f-name"><label for="pn'+i+'">ชื่ออะไหล่ / รหัส</label><input id="pn'+i+'" data-k="name" data-i="'+i+'" value="'+esc(p.name)+'" placeholder="เช่น สายพาน, หัวพ่น" autocomplete="off"></div>'
    +'<div class="qc-field"><label for="pq'+i+'">จำนวน</label><input id="pq'+i+'" data-k="qty" data-i="'+i+'" type="number" min="1" step="1" inputmode="numeric" value="'+esc(p.qty||1)+'"></div>'
    +'<div class="qc-field"><label>ประเภทราคา</label><label class="qc-switch is-box" title="Stock = ต้นทุน + '+mk+'%"><input type="checkbox" data-k="stock" data-i="'+i+'"'+(p.stock?' checked':'')+'><span class="trk" aria-hidden="true"></span>Stock '+mk+'%</label></div>'
    +price
    +'<div class="qc-field"><label>รวม</label><div class="qc-amount" data-line="'+i+'">'+money(line)+'</div></div>'
    +'<button type="button" class="qc-x" data-del="'+i+'" aria-label="ลบอะไหล่แถว '+(i+1)+'">×</button>'
    +photoStrip(p,i)+'</div>';
  }
  /* 📷 per part, up to PART_PH_MAX (js/153's rule); the photos go on the quotation paper */
  function photoStrip(p,i){
   var ph=Array.isArray(p.photos)?p.photos:[];
   return '<div class="qc-pph">'
    +ph.map(function(src,k){return '<span class="qc-pph-th"><button type="button" class="qc-pph-img" data-pph-open="'+i+'|'+k+'" aria-label="ดูรูปอะไหล่"><img src="'+esc(src)+'" alt=""></button>'
      +'<button type="button" class="qc-pph-x" data-pph-del="'+i+'|'+k+'" aria-label="ลบรูปอะไหล่">✕</button></span>'}).join('')
    +(ph.length<PART_PH_MAX?'<label class="qc-pph-add" title="แนบรูปอะไหล่ (สูงสุด '+PART_PH_MAX+' รูป)">📷 รูปอะไหล่'+(ph.length?' <b>'+ph.length+'</b>':'')
      +'<input type="file" accept="image/*" multiple hidden data-pph="'+i+'"></label>':'<small class="qc-unit">ครบ '+PART_PH_MAX+' รูปแล้ว</small>')
    +'</div>';
  }
  function render(){el.innerHTML=m.parts.length?m.parts.map(html).join(''):'<div class="qc-empty">ยังไม่มีรายการอะไหล่</div>'}
  function lines(){
   m.parts.forEach(function(p,i){
    var unit=unitPrice(p),u=el.querySelector('[data-unit="'+i+'"]'),l=el.querySelector('[data-line="'+i+'"]');
    if(u)u.textContent='ขาย '+money(unit)+' / หน่วย';
    if(l)l.textContent=money(unit*Math.max(1,num(p.qty)||1));
   });
  }
  el.addEventListener('input',function(e){
   var t=e.target,i=Number(t.getAttribute('data-i')),k=t.getAttribute('data-k'),p=m.parts[i];
   if(!p||!k||k==='stock')return;
   if(k==='name')p.name=t.value;else if(k==='qty')p.qty=Math.max(1,Math.floor(num(t.value))||1);else p[k]=num(t.value);
   lines();onChange();
  });
  el.addEventListener('change',function(e){
   var t=e.target;
   if(t.hasAttribute('data-pph')){
    var pi=Number(t.getAttribute('data-pph')),pp=m.parts[pi];if(!pp)return;
    pp.photos=Array.isArray(pp.photos)?pp.photos:[];
    var room=PART_PH_MAX-pp.photos.length,files=[].slice.call(t.files||[]).filter(function(f){return /^image\//.test(f.type)});
    if(files.length>room)toast('แนบได้อีก '+room+' รูป');
    files.slice(0,room).reduce(function(pr,f){return pr.then(function(){return shrinkImage(f,1024).then(function(d){pp.photos.push(d)},function(){toast('อ่านรูป '+f.name+' ไม่ได้')})})},Promise.resolve())
     .then(function(){render();onChange()});
    t.value='';return;
   }
   var i=Number(t.getAttribute('data-i')),p=m.parts[i];
   if(t.getAttribute('data-k')!=='stock'||!p)return;
   var was=unitPrice(p);p.stock=t.checked;
   if(!p.stock&&!p.price)p.price=was;              /* switching off keeps the price it had */
   render();onChange();
   var f=$((p.stock?'pc':'pp')+i);if(f)f.focus();
  });
  el.addEventListener('click',function(e){
   var po=e.target.closest('[data-pph-open]');
   if(po){var a=po.getAttribute('data-pph-open').split('|'),pa=m.parts[Number(a[0])];if(pa&&pa.photos)openAttachment({kind:'image',data:pa.photos[Number(a[1])],name:pa.name});return}
   var pd=e.target.closest('[data-pph-del]');
   if(pd){
    if(!confirm('ต้องการลบรูปอะไหล่นี้หรือไม่?'))return;
    var d=pd.getAttribute('data-pph-del').split('|'),pq=m.parts[Number(d[0])];
    if(pq&&Array.isArray(pq.photos))pq.photos.splice(Number(d[1]),1);
    render();onChange();return;
   }
   var b=e.target.closest('[data-del]');if(!b)return;
   var i=Number(b.getAttribute('data-del')),p=m.parts[i];
   if(p&&(p.name||p.cost||p.price)&&!confirm('ลบ “'+(p.name||'แถวที่ '+(i+1))+'” ?'))return;
   m.parts.splice(i,1);render();onChange();
  });
  if(addBtn)addBtn.addEventListener('click',function(){
   m.parts.push({name:'',qty:1,stock:false,cost:0,price:0,photos:[]});render();onChange();
   var f=$('pn'+(m.parts.length-1));if(f)f.focus();
  });
  return {render:render};
 }
 /* Other expenses: several rows; the name field offers the company-wide saved names. */
 function expensesEditor(el,addBtn,m,onChange){
  var dl=document.createElement('datalist');dl.id='qcExpOptions';el.parentNode.appendChild(dl);
  function options(){dl.innerHTML=expenseOptions().map(function(n){return '<option value="'+esc(n)+'">'}).join('')}
  function html(x,i){
   return '<div class="qc-line qc-exp">'
    +'<div class="qc-field"><label for="en'+i+'">รายการ</label><input id="en'+i+'" list="qcExpOptions" data-k="name" data-i="'+i+'" value="'+esc(x.name)+'" placeholder="เลือกหรือพิมพ์ชื่อ" autocomplete="off"></div>'
    +'<div class="qc-field"><label for="ea'+i+'">จำนวนเงิน</label><input id="ea'+i+'" data-k="amount" data-i="'+i+'" type="number" min="0" step="0.01" inputmode="decimal" value="'+esc(x.amount||'')+'" placeholder="0.00"></div>'
    +'<button type="button" class="qc-x" data-del="'+i+'" aria-label="ลบค่าใช้จ่ายแถว '+(i+1)+'">×</button></div>';
  }
  function render(){options();el.innerHTML=m.expenses.length?m.expenses.map(html).join(''):'<div class="qc-empty">ไม่มีค่าใช้จ่ายอื่น</div>'}
  el.addEventListener('input',function(e){
   var t=e.target,i=Number(t.getAttribute('data-i')),k=t.getAttribute('data-k'),x=m.expenses[i];
   if(!x||!k)return;x[k]=k==='amount'?num(t.value):t.value;onChange();
  });
  el.addEventListener('click',function(e){
   var b=e.target.closest('[data-del]');if(!b)return;
   m.expenses.splice(Number(b.getAttribute('data-del')),1);render();onChange();
  });
  if(addBtn)addBtn.addEventListener('click',function(){
   m.expenses.push({name:'',amount:0});render();onChange();
   var f=$('en'+(m.expenses.length-1));if(f)f.focus();
  });
  return {render:render,options:options};
 }
 /* Machines with an editable price. priceFor(machine, index) gives the suggested price when a
    machine is picked; a price typed by hand is kept until the machine changes. */
 function machinesEditor(el,addBtn,m,priceFor,onChange){
  function own(){return machines().filter(function(x){return !m.customerId||String(x.customerId)===String(m.customerId)})}
  function html(x,i){
   var opts=own();
   if(x.id&&!opts.some(function(o){return String(o.id)===String(x.id)}))opts=[machine(x.id)||{id:x.id,name:x.label||x.id}].concat(opts);
   return '<div class="qc-line qc-mach">'
    +'<div class="qc-field"><label for="mm'+i+'">เครื่อง '+(i+1)+'</label><select id="mm'+i+'" data-k="id" data-i="'+i+'">'
    +'<option value="">— เลือกเครื่อง —</option>'+opts.map(function(o){return '<option value="'+esc(o.id)+'"'+(String(o.id)===String(x.id)?' selected':'')+'>'+esc(machineLabel(o))+'</option>'}).join('')+'</select></div>'
    +'<div class="qc-field"><label for="mp'+i+'">ราคา (บาท)</label><input id="mp'+i+'" data-k="price" data-i="'+i+'" type="number" min="0" step="0.01" inputmode="decimal" value="'+esc(x.price||'')+'" placeholder="0.00"></div>'
    +'<button type="button" class="qc-x" data-del="'+i+'" aria-label="ลบเครื่องแถว '+(i+1)+'">×</button></div>';
  }
  function render(){el.innerHTML=m.machines.length?m.machines.map(html).join(''):'<div class="qc-empty">ยังไม่มีเครื่องในใบเสนอราคา</div>'}
  el.addEventListener('change',function(e){
   var t=e.target,i=Number(t.getAttribute('data-i')),x=m.machines[i];
   if(!x||t.getAttribute('data-k')!=='id')return;
   x.id=t.value;x.label=machineLabel(machine(x.id));x.price=priceFor(machine(x.id),i);
   render();onChange();
  });
  el.addEventListener('input',function(e){
   var t=e.target,i=Number(t.getAttribute('data-i')),x=m.machines[i];
   if(!x||t.getAttribute('data-k')!=='price')return;x.price=num(t.value);onChange();
  });
  el.addEventListener('click',function(e){
   var b=e.target.closest('[data-del]');if(!b)return;
   m.machines.splice(Number(b.getAttribute('data-del')),1);render();onChange();
  });
  if(addBtn)addBtn.addEventListener('click',function(){
   var used=m.machines.map(function(x){return String(x.id)});
   var next=own().filter(function(o){return used.indexOf(String(o.id))<0})[0];
   var i=m.machines.length;
   m.machines.push({id:next?next.id:'',label:next?machineLabel(next):'',price:next?priceFor(next,i):0});
   render();onChange();
   var f=$('mm'+i);if(f)f.focus();
  });
  return {render:render,reprice:function(){m.machines.forEach(function(x,i){if(x.id)x.price=priceFor(machine(x.id),i)});render()}};
 }

 /* ---------------------------------------------------------- page controller ---- */
 /* Everything the three pages share: loading ?id= / ?caseId= / ?customerId=, the type buttons,
    the customer picker, discount / VAT / note / signers, the summary, save / print / new /
    chat. Element ids are the same on every page (qcSave, qcDiscount, sGrand …). The page passes
    its own editors and summary rows. */
 function page(o){
  var type=o.type,m=blankModel(type),dirty=false,saving=false,lastRec=null,pick=null,att=null;
  function set(id,v){var e=$(id);if(e)e.textContent=v}
  function sums(){
   var t=totals(m);
   set('sMach',money(t.machines));set('sTravel',money(t.travel));set('sLabor',money(t.labor));
   set('sParts',money(t.parts));set('sExp',money(t.expenses));
   set('sDisc','-'+money(t.discount));set('sSub',money(t.subtotal));set('sVat',money(t.vat));set('sGrand',money(t.grand));
   set('sGrandBig','฿'+money(t.grand));set('sGrandBar','฿'+money(t.grand));
   var d=$('qcDiscount');if(d)d.setCustomValidity(num(m.discount)>t.gross?'ส่วนลดมากกว่ายอดรวม':'');
   if(o.onSums)o.onSums(t);
  }
  function touch(textOnly){dirty=true;if(!textOnly)sums()}
  function head(){
   var el=$('qcNo');
   if(m.id){el.textContent=m.id+' · '+(m.status||'ร่าง')+(m.revOf?' · แก้ไขจาก '+m.revOf:'');el.classList.add('is-saved');document.title=m.id+' · '+TYPES[type].label+' · I-MODE'}
   else if(m.revOf){el.textContent='ฉบับแก้ของ '+m.revOf+' · ได้เลข '+revBase(m.revOf)+'-REVxx เมื่อบันทึก';el.classList.remove('is-saved')}
   else{el.textContent='ใบใหม่ · ยังไม่มีเลขที่';el.classList.remove('is-saved')}
   var c=$('qcChat');if(c)c.hidden=!(m.id&&m.caseId);
  }
  var api={get model(){return m},touch:touch,sums:sums};
  function fillAll(){
   if(pick)pick.refill();
   $('qcDiscount').value=m.discount||0;$('qcNote').value=m.note||'';
   $('qcVatOn').checked=!!m.vatOn;$('qcVatPct').value=m.vatPct;$('qcVatPct').disabled=!m.vatOn;
   if(o.fill)o.fill(m,api);
   if(att)att.render();
   sums();head();
   if($('qcPrepared'))staffSelect($('qcPrepared'),m.preparedBy);
   if($('qcAuthorized'))staffSelect($('qcAuthorized'),m.authorizedBy);
   fillRef();
  }
  /* 2026-11-11 owner: Ref (อ้างอิง) and the contact mobile, both printed on the paper and editable */
  (function(){
   var note=$('qcNote'),f=note&&note.closest('.qc-field');if(!f||$('qcRef'))return;
   f.insertAdjacentHTML('beforebegin','<div class="qc-field"><label for="qcRef">Ref (อ้างอิง)</label><input id="qcRef" maxlength="80" autocomplete="off">'
    +'<small class="qc-help">ว่างไว้ = ใช้เลขเคส · พิมพ์แก้เองได้ เช่น เลข PO ของลูกค้า</small></div>'
    +'<div class="qc-field"><label for="qcMobile">เบอร์มือถือผู้ติดต่อ (บนใบ)</label><input id="qcMobile" type="tel" maxlength="40" autocomplete="off">'
    +'<small class="qc-help">ดึงจากบัญชีคนทำใบ แก้ได้ · ว่างไว้ = ไม่พิมพ์บรรทัดนี้</small></div>');
  })();
  function caseRef(){var cs=caseById(m.caseId);return (cs&&cs.ticket)||''}
  function fillRef(){
   var r=$('qcRef'),mo=$('qcMobile');if(!r)return;
   r.value=m.ref==null?caseRef():m.ref;r.placeholder=caseRef()||'—';
   mo.value=m.mobile||'';
  }
  if($('qcRef')){
   $('qcRef').addEventListener('input',function(){var v=this.value.trim();m.ref=(!v||v===caseRef())?null:v;touch(true)});
   $('qcMobile').addEventListener('input',function(){m.mobile=this.value;touch(true)});
  }
  $('qcDiscount').addEventListener('input',function(){m.discount=Math.max(0,num(this.value));touch()});
  $('qcNote').addEventListener('input',function(){m.note=this.value;touch(true)});
  if($('qcPrepared'))$('qcPrepared').addEventListener('change',function(){m.preparedBy=this.value;touch(true)});
  if($('qcAuthorized'))$('qcAuthorized').addEventListener('change',function(){m.authorizedBy=this.value;touch(true)});
  $('qcVatOn').addEventListener('change',function(){m.vatOn=this.checked;$('qcVatPct').disabled=!m.vatOn;touch()});
  $('qcVatPct').addEventListener('input',function(){m.vatPct=Math.max(0,num(this.value));touch()});
  $('qcSave').addEventListener('click',function(){
   if(saving)return;
   if(!m.customerId){toast('กรุณาเลือกลูกค้าก่อนบันทึก');try{var cs=$('qcCustomer');((cs.parentNode&&cs.parentNode.querySelector('.cbx-input'))||cs).focus()}catch(e){}return}
   if(num(m.discount)>totals(m).gross){toast('ส่วนลดมากกว่ายอดรวม');$('qcDiscount').focus();return}
   if(o.validate){var msg=o.validate(m);if(msg){toast(msg,4000);return}}
   saving=true;var b=this,label=b.innerHTML;b.disabled=true;b.textContent='กำลังบันทึก…';
   save(m).then(function(r){
    saving=false;b.disabled=false;b.innerHTML=label;
    if(!r.ok){toast(r.message);return}
    dirty=false;lastRec=r.rec;head();
    try{history.replaceState(null,'','?id='+encodeURIComponent(r.id))}catch(e){}
    toast(r.message,r.cloud?2800:5000);
    addExpenseOptions(m.expenses.map(function(x){return x.name})).then(function(n){if(n&&o.onOptions)o.onOptions()});
    if(r.first&&m.caseId)chatDialog(r.rec);
   },function(){saving=false;b.disabled=false;b.innerHTML=label;toast('บันทึกไม่สำเร็จ')});
  });
  $('qcPrint').addEventListener('click',function(){
   if(!m.customerId){toast('กรุณาเลือกลูกค้าก่อน');return}
   var rec=toRecord(m);if(!m.id)rec.id='DRAFT';
   if(!print(rec))toast('เปิดหน้าพิมพ์ไม่ได้ กรุณาอนุญาต Pop-up');
  });
  if($('qcChat'))$('qcChat').addEventListener('click',function(){chatDialog(lastRec||toRecord(m))});
  $('qcNew').addEventListener('click',function(){
   if(dirty&&!confirm('ข้อมูลที่ยังไม่บันทึกจะหายไป เริ่มใบใหม่หรือไม่?'))return;
   dirty=false;location.href=TYPES[type].page;
  });
  window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=''}});
  typeBar($('qcTypes'),type,function(){return {id:m.id,caseId:m.caseId,customerId:m.customerId,dirty:dirty}});

  function start(){
   pick=picker($('qcPicker'),m,function(what,c){if(o.onPick)o.onPick(what,c,m,api);touch(true);head()});
   att=attachEditor($('qcAttach'),m,touch);
   if(o.init)o.init(m,api);
   fillAll();
   refresh().then(function(ok){if(ok){if(pick)pick.refill();if(o.onRefresh)o.onRefresh(m,api)}});
   settingsFresh().then(function(s){if(s&&o.onSettings)o.onSettings(m,api);if(s)sums()});
  }
  var id=param('id'),rev=param('revise');
  if(rev&&!id){
   /* 2026-11-11 owner: แก้ไขใบเสนอราคา — a copy of the quotation to edit; it gets <base>-REVnn when
      saved and the original is never written. Signatures / customer approval belong to a number, so
      the copy starts unsigned. */
   loadQuote(rev).then(function(q){
    if(!q){toast('ไม่พบใบเสนอราคา '+rev,5000);if(o.blank)o.blank(m);start();return}
    if(typeOfQuote(q)!==type){location.replace((TYPES[typeOfQuote(q)]||TYPES.service).page+'?revise='+encodeURIComponent(q.id));return}
    m=fromRecord(q);m.revOf=q.id;m.id='';m.status='ร่าง';m.createdAt='';
    m.preparedBy=userName()||m.preparedBy;m.preparedDate=todayISO();m.authorizedDate=todayISO();
    if(!m.mobile)m.mobile=myMobile();
    if(m.ref==null&&q.caseTicket)m.ref=q.caseTicket;
    start();dirty=true;
    toast('กำลังแก้ไขจาก '+q.id+' · ใบเดิมจะไม่ถูกเปลี่ยน กดบันทึกเพื่อออกเลขใหม่',4500);
   });
  }else if(id){
   loadQuote(id).then(function(q){
    if(!q){toast('ไม่พบใบเสนอราคา '+id,5000);if(o.blank)o.blank(m);start();return}
    if(typeOfQuote(q)!==type){location.replace(pageUrl(q));return}
    m=fromRecord(q);lastRec=q;start();
   });
  }else{
   var cid=param('caseId'),cu=param('customerId'),rid=param('requestId'),from=caseById(cid);
   if(cid){var c=caseById(cid);m.caseId=cid;if(c){m.customerId=c.customerId||'';m.contact=c.contact||''}}
   /* 2026-11-09: คำขอจากลูกค้า → ทำใบเสนอราคา (js/159) arrives here with the request's customer,
      machine, service and contact — what js/03 prepareService/WarrantyQuoteFromRequest filled in */
   if(rid&&!cid){
    var rq=byId(readJ(K.requests,[])||[],rid);
    if(rq){
     m.customerId=rq.customerId||'';m.contact=rq.contact||'';
     from={customerId:rq.customerId,machineId:rq.machineId||'',machine:rq.machine||'',
      serviceType:{WS:'workshop',DG:'diagnosis'}[rq.serviceMode]||'onsite',priority:rq.priority||''};
     if(type==='warranty'&&num(param('months')||rq.months))m.warrantyMonths=num(param('months')||rq.months);
    }
   }
   if(cu&&!m.customerId)m.customerId=cu;
   var x=customer(m.customerId);
   if(x){if(!m.contact)m.contact=x.contact||'';m.location=x.address||[x.branch,x.location].filter(Boolean).join(' / ')}
   if(o.blank)o.blank(m,from);
   start();
  }
  return api;
 }

 /* ------------------------------------------------------------ left menu ---- */
 /* 2026-11-08 owner (option A): the same left menu as the Service app. index.html leaves a snapshot
    of its menu as shown to this account (js/159 §5, localStorage imode_v70_side_menu); without one
    (first visit, another account) a plain list is shown. Every item opens that page of index.html;
    ทำใบเสนอราคา opens the new Service quotation page (owner 2026-11-08). Desktop: always shown. Phone / tablet: ☰. */
 var SIDE_KEY='imode_v70_side_menu';
 var SIDE_DEFAULT=[['cases','📋','เคสงานบริการ'],['quotation','฿','ทำใบเสนอราคา'],['customers','👥','ลูกค้า'],['machines','⚙','เครื่องจักร'],
  ['qc','✅','QC เครื่อง'],['calendar','📅','ปฏิทินงาน'],['warranty','🛡','ระบบประกันเครื่อง'],['documents','📁','เอกสารเครื่องจักร'],
  ['notifications','🔔','การแจ้งเตือน'],['reports','📊','รายงาน']];
 function sideItems(){
  var u=user(),me=String(u.username||u.id||u.name||''),snap=readJ(SIDE_KEY,null);
  if(snap&&Array.isArray(snap.items)&&me&&snap.u===me)return snap.items;
  return SIDE_DEFAULT.map(function(x){return {p:x[0],i:x[1],t:x[2]}});
 }
 function sidebar(){
  var top=document.querySelector('.qc-top');
  if(!top||document.getElementById('qcSide'))return;
  var u=user(),nm=userName()||'ผู้ใช้',role=String(u.permissionRole||u.role||'');
  var ini=nm.split(/\s+/).slice(0,2).map(function(w){return w.charAt(0)}).join('');
  var html='<aside class="qc-side" id="qcSide" aria-label="เมนูหลัก">'
   +'<a class="qc-side-brand" href="./index.html"><img src="./assets/imode-ui-logo-v532.png" alt="I-MODE"><b>I-MODE Plus <span>Service &amp; Maintenance</span></b></a>'
   +'<nav class="qc-side-nav"><a class="qc-side-item" href="./index.html?page=home"><span>▦</span><b>หน้าเลือกโมดูลหลัก</b></a>'
   +sideItems().map(function(x){
     if(x.g)return '<div class="qc-side-group">'+esc(x.g)+'</div>';
     if(!x.p||x.p==='home')return '';
     var href=x.p==='quotation'?TYPES.service.page:'./index.html?page='+encodeURIComponent(x.p);
     return '<a class="qc-side-item'+(x.p==='quotation'?' is-on':'')+'" href="'+href+'"'+(x.p==='quotation'?' aria-current="page"':'')+'>'
      +'<span>'+esc(x.i||'•')+'</span><b>'+esc(x.t||x.p)+'</b>'+(x.n&&x.n!=='0'?'<i>'+esc(x.n)+'</i>':'')+'</a>';
    }).join('')+'</nav>'
   +'<div class="qc-side-user"><span class="qc-side-av">'+esc(ini||'--')+'</span><span><b>'+esc(nm)+'</b><small>'+esc(role)+'</small></span></div>'
   +'<div class="qc-side-ver">Version 1.0</div></aside><div class="qc-side-shade" id="qcSideShade" hidden></div>';
  document.body.insertAdjacentHTML('afterbegin',html);
  document.body.classList.add('qc-has-side');
  /* 2026-11-08 owner (option A, pictures approved): the app's own top bar and page heading
     (index.html .topbar.v68-topbar + .v68-global-hero) instead of the page's blue bar. */
  var bell='';sideItems().forEach(function(x){if(x.p==='notifications'&&x.n&&x.n!=='0')bell=x.n});
  var fp=readJ('imode_v5_font_preferences',{})||{},pct=Number(fp[u.id||'guest'])||115;
  var shell=document.createElement('header');shell.className='qs-top';
  shell.innerHTML='<button type="button" class="qs-menu qc-side-btn" id="qcSideBtn" aria-label="เปิด/ปิดเมนู" aria-controls="qcSide" aria-expanded="false">☰</button>'
   +'<div class="qs-brand"><b>I-MODE SERVICE</b><small>Version 1.0</small></div><span class="qs-sp"></span>'
   +'<a class="qs-accept" href="./index.html?page=cases">＋ รับเคสใหม่</a>'
   +'<a class="qs-search" href="./index.html">⌕ ค้นหา...</a>'
   +'<span class="qs-chip" title="ภาษาไทย">TH</span>'
   +'<a class="qs-chip qs-aa" href="./index.html" title="ขนาดตัวอักษร (ปรับในระบบหลัก)">Aa<b>'+esc(pct)+'%</b></a>'
   +'<a class="qs-icon" href="./index.html?page=home" aria-label="หน้าเลือกโมดูลหลัก" title="หน้าเลือกโมดูลหลัก">⌂</a>'
   +'<a class="qs-icon" href="./index.html?page=notifications" aria-label="การแจ้งเตือน" title="การแจ้งเตือน">🔔'+(bell?'<i>'+esc(bell)+'</i>':'')+'</a>';
  var hero=document.createElement('section');hero.className='qs-hero';
  hero.innerHTML='<h2>ทำใบเสนอราคา</h2><p>ใบเสนอราคา Service / อะไหล่ / ประกัน · บันทึก พิมพ์ และส่งเข้าแชทเคส</p>';
  top.hidden=true;
  top.parentNode.insertBefore(shell,top.nextSibling);
  var wrap=document.querySelector('.qc-wrap');
  if(wrap)wrap.parentNode.insertBefore(hero,wrap);else shell.parentNode.insertBefore(hero,shell.nextSibling);
  var btn=$('qcSideBtn');
  var side=$('qcSide'),shade=$('qcSideShade');
  function open(on){document.body.classList.toggle('qc-side-open',on);shade.hidden=!on;btn.setAttribute('aria-expanded',String(on))}
  /* same as the app's ☰ (js/06): on a desktop it folds the menu away and back, on a phone it opens it */
  btn.addEventListener('click',function(){
   if(window.innerWidth>1100){var c=document.body.classList.toggle('qc-side-collapsed');btn.setAttribute('aria-expanded',String(!c));return}
   open(!document.body.classList.contains('qc-side-open'));
  });
  if(window.innerWidth>1100)btn.setAttribute('aria-expanded','true');
  shade.addEventListener('click',function(){open(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('qc-side-open'))open(false)});
  side.addEventListener('click',function(e){if(e.target.closest('a'))open(false)});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sidebar,{once:true});else sidebar();

 /* the phone bottom bar's buttons press the real ones */
 document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('[data-proxy]');if(!b)return;
  var t=$(b.getAttribute('data-proxy'));if(t&&!t.disabled)t.click();
 });

 window.QuoteCommon={
  K:K,TYPES:TYPES,esc:esc,num:num,r2:r2,money:money,todayISO:todayISO,param:param,readJ:readJ,
  settings:settings,cfg:cfg,user:user,userName:userName,customers:customers,cases:cases,machines:machines,quotes:quotes,
  customer:customer,caseById:caseById,machine:machine,machineLabel:machineLabel,
  db:db,refresh:refresh,settingsFresh:settingsFresh,loadQuote:loadQuote,staff:staff,issueNumber:issueNumber,
  typeOfQuote:typeOfQuote,isV2:isV2,revBase:revBase,revNumber:revNumber,revOf:revOf,refOf:refOf,mobileOf:mobileOf,metaOf:metaOf,blankModel:blankModel,fromRecord:fromRecord,toRecord:toRecord,
  totals:totals,unitPrice:unitPrice,save:save,expenseOptions:expenseOptions,addExpenseOptions:addExpenseOptions,
  chatPost:chatPost,chatDialog:chatDialog,rows:rows,rowsHTML:rowsHTML,remarkText:remarkText,paperHTML:paperHTML,print:print,
  mapsUrl:mapsUrl,travelFee:travelFee,toast:toast,pageUrl:pageUrl,typeBar:typeBar,picker:picker,staffSelect:staffSelect,
  URGENCY:URGENCY,urgencyPct:urgencyPct,laborFromHours:laborFromHours,laborRate:laborRate,pickupFee:pickupFee,covered:covered,customerKm:customerKm,legacyBreakdown:legacyBreakdown,
  partsEditor:partsEditor,expensesEditor:expensesEditor,machinesEditor:machinesEditor,attachEditor:attachEditor,openAttachment:openAttachment,page:page,
  combo:combo,useOldPage:function(){try{return localStorage.getItem(K.oldPage)==='1'}catch(e){return false}}
 };
})();
