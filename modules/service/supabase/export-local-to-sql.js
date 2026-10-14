/* I-MODE Plus Service & Maintenance — V6.8 Service focus
   export-local-to-sql.js — turn the data already in this browser into SQL INSERTs.

   WHY: connecting to an empty Supabase leaves the office PC as the only place the data
   exists. syncCloud() is download-only, and every line is guarded by `data.length`:

       if(!c.error && c.data.length) customers = c.data.map(fromCustomerDb)

   so an empty cloud does NOT wipe local data (an earlier version of this note said it did
   — checked on 2026-09-08, it does not). What it does mean is that connecting alone shares
   nothing: the phone still sees only the seeded demo rows until real rows are in the
   database. Seeding it with this file is what makes the customer's phone and the office PC
   see the same machines.

   qrToken is no longer a worry: js/21-v69StableQrScript.js derives it from the machine id
   (QR-<id>), so a machine that comes back from the cloud without one gets the same token
   every device computes, and printed labels keep working. This file still carries the
   tokens, which is harmless.

   HOW TO USE
   1. Open the application in the browser that holds the data you want to keep.
   2. F12 -> Console.
   3. Paste this whole file, press Enter.
   4. A .sql file downloads. Open it, copy everything, paste into
      Supabase -> SQL Editor (make sure the tab is a SQL query, not a Logs query) -> Run.
   5. Only then connect the app to Supabase.

   Run 00-tables.sql first: this file fills tables, it does not create them.

   Nothing is modified or deleted here. It only reads.
*/
(function(){
 'use strict';

 var out=[];
 var log=function(m){try{console.log('%c'+m,'color:#0b63e5')}catch(e){}};

 /* ---------- SQL helpers ---------- */
 function q(v){
  if(v===undefined||v===null||v==='')return 'NULL';
  return "'"+String(v).replace(/'/g,"''")+"'";
 }
 function num(v){
  if(v===undefined||v===null||v==='')return 'NULL';
  var n=Number(v);
  return isFinite(n)?String(n):'NULL';
 }
 function bool(v){return v?'true':'false'}
 function json(v){
  if(v===undefined||v===null)return 'NULL';
  return "'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
 }
 function ident(name){return /^[a-z_][a-z0-9_]*$/.test(name)?name:'"'+name+'"'}

 /* Emits INSERT ... ON CONFLICT (id) DO UPDATE so the file can be run again safely. */
 function block(table,columns,rows,title){
  if(!rows.length){out.push('-- '+table+': no rows to export');out.push('');return 0}
  out.push('-- '+(title||table)+' — '+rows.length+' rows');
  var cols=columns.map(ident).join(', ');
  var updates=columns.filter(function(c){return c!=='id'})
   .map(function(c){return ident(c)+' = excluded.'+ident(c)}).join(',\n    ');
  /* chunked so one very long statement does not hit editor limits */
  for(var i=0;i<rows.length;i+=50){
   var chunk=rows.slice(i,i+50);
   out.push('insert into public.'+table+' ('+cols+') values');
   out.push(chunk.map(function(r){return '  ('+r.join(', ')+')'}).join(',\n')+'');
   out.push('on conflict (id) do update set\n    '+updates+';');
   out.push('');
  }
  return rows.length;
 }

 function arr(name){
  try{
   var v=window[name];
   if(Array.isArray(v))return v;
   /* top-level `let` bindings are not on window; read them from the console scope */
   v=eval(name);
   return Array.isArray(v)?v:[];
  }catch(e){return []}
 }

 var counts={};

 /* ---------- customers ---------- */
 (function(){
  var cols=['id','name','branch','contact','phone','email','location','address','map_url',
            'latitude','longitude','note','line_user_id','line_display_name','line_linked_at'];
  var rows=arr('customers').map(function(c){
   return [q(c.id),q(c.name),q(c.branch),q(c.contact),q(c.phone),q(c.email),q(c.location),
           q(c.address),q(c.mapUrl),num(c.latitude),num(c.longitude),q(c.note),
           q(c.lineUserId),q(c.lineDisplayName),q(c.lineLinkedAt)];
  });
  counts.customers=block('customers',cols,rows,'customers');
 })();

 /* ---------- machines — raw object keys, so quoted camelCase ---------- */
 (function(){
  var cols=['id','customerId','name','nameTh','nameEn','model','serial','issueYear',
            'serviceStatus','size','sizeStatus','serviceSize','sizeBasis','warranty',
            'pmDue','note','photo','source','qrToken','sourceOrder'];
  var rows=arr('machines').map(function(m){
   return [q(m.id),q(m.customerId),q(m.name),q(m.nameTh),q(m.nameEn),q(m.model),q(m.serial),
           q(m.issueYear),q(m.serviceStatus),q(m.size),q(m.sizeStatus),q(m.serviceSize),
           q(m.sizeBasis),q(m.warranty),q(m.pmDue),q(m.note),q(m.photo),q(m.source),
           q(m.qrToken),q(m.sourceOrder)];
  });
  counts.machines=block('machines',cols,rows,'machines (keeps each existing qrToken)');
 })();

 /* ---------- technicians — raw object keys, all lowercase ---------- */
 (function(){
  var cols=['id','name','role','team','phone','email','status','skills','color','photo'];
  var rows=arr('technicians').map(function(t){
   return [q(t.id),q(t.name),q(t.role),q(t.team),q(t.phone),q(t.email),q(t.status),
           q(t.skills),q(t.color),q(t.photo)];
  });
  counts.technicians=block('technicians',cols,rows,'technicians');
 })();

 /* ---------- service_cases ---------- */
 (function(){
  var cols=['id','ticket','created_at','updated_at','customer_id','customer','contact','phone',
            'email','location','branch','map_url','latitude','longitude','field_status',
            'field_status_log','machine_id','machine','model','serial','machine_size','warranty',
            'channel','service_type','priority','issue','note','status','assignee','appointment'];
  var rows=arr('cases').map(function(c){
   return [q(c.id),q(c.ticket),q(c.createdAt),q(c.updatedAt),q(c.customerId),q(c.customer),
           q(c.contact),q(c.phone),q(c.email),q(c.location),q(c.branch),q(c.mapUrl),
           num(c.latitude),num(c.longitude),q(c.fieldStatus),json(c.fieldStatusLog||[]),
           q(c.machineId),q(c.machine),q(c.model),q(c.serial),q(c.machineSize),q(c.warranty),
           q(c.channel),q(c.serviceType),q(c.priority),q(c.issue),q(c.note),q(c.status),
           q(c.assignee),q(c.appointment)];
  });
  counts.service_cases=block('service_cases',cols,rows,'service_cases');
 })();

 /* ---------- machine_warranties ---------- */
 (function(){
  var cols=['id','warranty_no','customer_id','machine_id','purchase_date','install_date',
            'start_date','end_date','months','coverage','exclusions','note','issued_by',
            'attachment_name','attachment_type','attachment_data','created_at','updated_at'];
  var rows=arr('warranties').map(function(w){
   return [q(w.id),q(w.warrantyNo),q(w.customerId),q(w.machineId),q(w.purchaseDate),
           q(w.installDate),q(w.startDate),q(w.endDate),num(w.months),q(w.coverage),
           q(w.exclusions),q(w.note),q(w.issuedBy),q(w.attachmentName),q(w.attachmentType),
           q(w.attachmentData),q(w.createdAt),q(w.updatedAt)];
  });
  counts.machine_warranties=block('machine_warranties',cols,rows,'machine_warranties');
 })();

 /* ---------- machine_documents ---------- */
 (function(){
  var cols=['id','title','category','machine_id','customer_id','version','language','doc_date',
            'url','note','file_name','file_type','file_data','created_at','updated_at'];
  var rows=arr('machineDocuments').map(function(d){
   return [q(d.id),q(d.title),q(d.category),q(d.machineId),q(d.customerId),q(d.version),
           q(d.language),q(d.docDate),q(d.url),q(d.note),q(d.fileName),q(d.fileType),
           q(d.fileData),q(d.createdAt),q(d.updatedAt)];
  });
  counts.machine_documents=block('machine_documents',cols,rows,'machine_documents');
 })();

 /* ---------- line_customer_requests ---------- */
 (function(){
  var cols=['id','type','status','customer_id','machine_id','case_id','contact','phone',
            'priority','months','message','line_user_id','line_display_name','created_at'];
  var rows=arr('lineRequests').map(function(r){
   return [q(r.id),q(r.type),q(r.status),q(r.customerId),q(r.machineId),q(r.caseId),
           q(r.contact),q(r.phone),q(r.priority),num(r.months),q(r.message),
           q(r.lineUserId),q(r.lineDisplayName),q(r.createdAt)];
  });
  counts.line_customer_requests=block('line_customer_requests',cols,rows,'line_customer_requests');
 })();

 /* ---------- service_reports ---------- */
 (function(){
  var cols=['id','report_no','case_id','customer_id','machine_id','tech_id','service_type',
            'work_type','check_in_at','appointment','checklist','diagnosis','work_performed',
            'recommendation','parts','before_photos','after_photos','videos','status_log',
            'customer_accept','customer_signature','tech_signature','next_pm','line_sent_at',
            'line_send_status','status','created_at','updated_at'];
  var rows=arr('serviceReports').map(function(r){
   return [q(r.id),q(r.reportNo),q(r.caseId),q(r.customerId),q(r.machineId),q(r.techId),
           q(r.serviceType),q(r.workType),q(r.checkInAt),q(r.appointment),json(r.checklist||[]),
           q(r.diagnosis),q(r.workPerformed),q(r.recommendation),json(r.parts||[]),
           json(r.beforePhotos||[]),json(r.afterPhotos||[]),json(r.videos||[]),
           json(r.statusLog||[]),q(r.customerAccept),q(r.customerSignature),q(r.techSignature),
           q(r.nextPm),q(r.lineSentAt),q(r.lineSendStatus),q(r.status),q(r.createdAt),q(r.updatedAt)];
  });
  counts.service_reports=block('service_reports',cols,rows,'service_reports');
 })();

 /* ---------- quotations ---------- */
 (function(){
  var cols=['id','case_id','case_ticket','customer_id','customer','contact','location','service',
            'warranty_mode','warranty_months','distance','distance_source','route_duration_minutes',
            'pickup_mode','urgency','warranty','vat_on','delivery','payment','purchaser_name',
            'purchaser_date','prepared_by','prepared_date','authorized_by','authorized_date',
            'machine_ids','parts','extra_hours','extra_techs','diagnosis','toll','other_expense',
            'discount_pct','subtotal','vat','grand','status','created_at','updated_at'];
  var rows=arr('quotations').map(function(x){
   return [q(x.id),q(x.caseId),q(x.caseTicket),q(x.customerId),q(x.customer),q(x.contact),
           q(x.location),q(x.service),q(x.warrantyMode),num(x.warrantyMonths),num(x.distance),
           q(x.distanceSource),num(x.routeDurationMinutes),num(x.pickupMode),q(x.urgency),
           q(x.warranty),bool(x.vatOn),q(x.delivery),q(x.payment),q(x.purchaserName),
           q(x.purchaserDate),q(x.preparedBy),q(x.preparedDate),q(x.authorizedBy),
           q(x.authorizedDate),json(x.machineIds||[]),json(x.parts||[]),num(x.extraHours),
           num(x.extraTechs),num(x.diagnosis),num(x.toll),num(x.otherExpense),num(x.discountPct),
           num(x.subtotal),num(x.vat),num(x.grand),q(x.status),q(x.createdAt),q(x.updatedAt)];
  });
  counts.quotations=block('quotations',cols,rows,'quotations');
 })();

 /* ---------- system_settings — one row ---------- */
 (function(){
  var s=null;
  try{s=window.settings||eval('settings')}catch(e){}
  if(!s){out.push('-- system_settings: not available');out.push('');counts.system_settings=0;return}
  out.push('-- system_settings — 1 row');
  out.push('insert into public.system_settings (id, data, updated_at) values');
  out.push("  ('main', "+json(s)+", "+q(new Date().toISOString())+")");
  out.push('on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;');
  out.push('');
  counts.system_settings=1;
 })();

 /* ---------- assemble ---------- */
 var header=[
  '-- I-MODE Plus Service & Maintenance — data exported from a browser',
  '-- Generated: '+new Date().toISOString(),
  '-- Run 00-tables.sql first. Safe to run more than once (upsert on id).',
  '--',
  '-- Row counts: '+Object.keys(counts).map(function(k){return k+' '+counts[k]}).join(', '),
  '',
  'begin;',
  ''
 ];
 var footer=['commit;','',
  '-- Verify',
  'select \'customers\' t, count(*) from public.customers',
  'union all select \'machines\', count(*) from public.machines',
  'union all select \'technicians\', count(*) from public.technicians',
  'union all select \'service_cases\', count(*) from public.service_cases',
  'union all select \'machine_warranties\', count(*) from public.machine_warranties',
  'union all select \'machine_documents\', count(*) from public.machine_documents',
  'union all select \'quotations\', count(*) from public.quotations',
  'union all select \'service_reports\', count(*) from public.service_reports',
  'union all select \'line_customer_requests\', count(*) from public.line_customer_requests',
  'union all select \'system_settings\', count(*) from public.system_settings;'
 ];
 var sql=header.concat(out).concat(footer).join('\n');

 /* ---------- download ---------- */
 try{
  var blob=new Blob([sql],{type:'text/plain;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='imode-seed-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'.sql';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);
  log('Downloaded the .sql file. Row counts: '+JSON.stringify(counts));
 }catch(e){
  console.warn('Download failed, the SQL is returned below instead.',e);
 }
 log('Tip: window.__imodeSeedSQL holds the same text if you prefer to copy it by hand.');
 window.__imodeSeedSQL=sql;
 return counts;
})();
