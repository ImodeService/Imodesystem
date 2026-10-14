// The production build, on its two addresses, against 02-security.sql running on PGlite.
import { start } from './fakesb.mjs';
import { launch } from './cdp.mjs';
const S = (await import('url')).fileURLToPath(new URL('./', import.meta.url));
const W = +(process.argv[2] || 390), H = W < 700 ? 844 : 1000;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const srv = await start(8765, S + 'webtest');
const db = srv.db;
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const tok = (await q1(`select "qrToken" t from machines where id='M00001'`)).t;
await db.exec(`
  insert into service_cases (id,ticket,customer_id,machine_id,status,note,contact,phone,issue,created_at,updated_at,field_status,field_status_log)
   values ('CASE-A','SRV-20260927-001','C0001','M00001','กำลังดำเนินการ','INTERNAL NOTE','คุณเอ','0812345678','เครื่องไม่ผลิตก๊าซ','2026-09-27T01:00:00Z','2026-09-27T01:00:00Z','ถึงหน้างาน','[]');
  insert into quotations (id,customer_id,customer,status,machine_ids,grand,subtotal,vat,created_at,updated_at,service,parts)
   values ('QT-SRV-202609-900','C0001','บริษัท ลูกค้าตัวอย่าง 1','ส่งแล้ว','["M00001"]',1070,1000,70,'2026-09-27T01:00:00Z','2026-09-27T01:00:00Z','OS','[]');`);

const page = await launch({ width: W, height: H, mobile: W < 700 });
const active = () => page.eval(`(document.querySelector('.page.active')||{}).id`);
const CUST = 'http://cust.imode.test:8765/', STAFF = 'http://app.imode.test:8765/';

// ---------------- the customer address ----------------
await page.goto(CUST, 3500);
ok('customer address root lands on the scan / serial page', await active() === 'page-customer-entry');
ok('…and the staff login door is not reachable', await page.eval(`(goPage('staff-login'),(document.querySelector('.page.active')||{}).id)`) === 'page-customer-entry');
ok('goPage("dashboard") stays on the customer pages', await page.eval(`(goPage('dashboard'),(document.querySelector('.page.active')||{}).id)`) === 'page-customer-entry');
ok('the phone holds nothing from the database (only I-MODE own record from the source)', await page.eval(`machines.length+cases.length+quotations.length+warranties.length`) === 0 && await page.eval(`customers.filter(c=>c.id!=='CUST-INTERNAL-IMODE').length`) === 0);

await page.eval(`(function(){var i=document.getElementById('centrySerial');i.value='DEMO-HO500WT-0001';i.form.onsubmit({preventDefault:function(){}})})()`);
ok('a serial typed in opens that machine', await page.waitFor(`(document.querySelector('.page.active')||{}).id==='page-customer-portal'`) && await page.eval(`portalMachine().id`) === 'M00001');
ok('…and only that machine came down', await page.eval(`machines.length`) === 1);
const own = await page.eval(`JSON.stringify(cases.filter(c=>c.id==='CASE-A').map(c=>({note:c.note||'',phone:c.phone||'',contact:c.contact||''})))`);
ok('its case arrived without the internal note or the reporter\'s phone', own === '[{"note":"","phone":"","contact":""}]', own);

await page.goto(CUST, 2500);
await page.eval(`(function(){var i=document.getElementById('centrySerial');i.value='20HO200WT-004';i.form.onsubmit({preventDefault:function(){}})})()`);
await page.sleep(1500);
const choice = await page.eval(`document.querySelectorAll('#centryError [data-machine]').length`);
ok('a shared serial asks which machine is meant', choice === 2, 'choices=' + choice);

await page.eval(`(function(){var i=document.getElementById('centrySerial');i.value='NO-SUCH-SERIAL-99';i.form.onsubmit({preventDefault:function(){}})})()`);
await page.sleep(1200);
ok('an unknown serial says so', /ไม่พบเครื่อง/.test(await page.eval(`document.getElementById('centryError').textContent`)));

// open by QR, report a problem
await page.goto(CUST + '?machineToken=' + encodeURIComponent(tok), 3500);
ok('a QR link opens the customer page', await active() === 'page-customer-portal' && await page.eval(`portalMachine().id`) === 'M00001');
await page.eval(`openPortalIssueForm()`);
await page.sleep(400);
await page.eval(`(function(){
  var f=document.getElementById('portalIssueForm');
  f.querySelectorAll('input,textarea,select').forEach(function(el){
    if(el.type==='file'||el.type==='hidden')return;
    if(el.tagName==='SELECT'){if(!el.value&&el.options.length>1)el.selectedIndex=1;return}
    if(el.type==='radio'){if(!f.querySelector('input[name="'+el.name+'"]:checked'))el.checked=true;return}
    if(el.type==='checkbox')return;
    if(!el.value)el.value=el.id==='piPhone'?'0899999999':'ทดสอบแจ้งปัญหา production';
  });
  f.requestSubmit();
})()`);
const landed = await (async () => { for (let i = 0; i < 40; i++) { const r = await q1(`select count(*)::int n from service_cases where issue like '%ทดสอบแจ้งปัญหา production%'`); if (r.n) return r.n; await page.sleep(250); } return 0; })();
ok('แจ้งปัญหา creates exactly one case on the server', landed === 1, 'n=' + landed);
const nc = await q1(`select status,channel,customer_id,machine_id,assignee from service_cases where issue like '%ทดสอบแจ้งปัญหา production%'`);
ok('…as เคสใหม่ / LINE OA / C0001 / M00001 / nobody assigned', nc && nc.status === 'เคสใหม่' && nc.channel === 'LINE OA' && nc.customer_id === 'C0001' && nc.machine_id === 'M00001' && !nc.assignee, JSON.stringify(nc));
const nr = await (async () => { for (let i = 0; i < 20; i++) { const r = await q1(`select count(*)::int n from line_customer_requests where message like '%ทดสอบแจ้งปัญหา production%'`); if (r.n) return r.n; await page.sleep(250); } return 0; })();
ok('…with its request row', nr === 1);

// quotation: open (quoteViews) and sign (quoteApprovals + อนุมัติ)
await page.goto(CUST + '?machineToken=' + encodeURIComponent(tok), 3000);
const qShown = await page.eval(`quotations.map(q=>q.id).join(',')`);
ok('the sent quotation for this machine is on the phone', qShown === 'QT-SRV-202609-900', qShown);
await page.eval(`window.imodePortalOpenQuote('QT-SRV-202609-900')`);
await page.sleep(1500);
const viewed = await q1(`select data->'quoteViews' ? 'QT-SRV-202609-900' v from system_settings`);
ok('opening it records "customer opened" on the server', viewed.v === true);
const hasPad = await page.eval(`!!document.getElementById('pqaSignPad')`);
ok('the signature pad is there', hasPad);
if (hasPad) {
  await page.eval(`(function(){var c=document.getElementById('pqaSignPad'),x=c.getContext('2d');x.strokeStyle='#000';x.lineWidth=6;x.beginPath();x.moveTo(20,40);x.lineTo(c.width-20,c.height-30);x.moveTo(20,c.height-30);x.lineTo(c.width-30,30);x.stroke();document.getElementById('pqaName').value='คุณลูกค้า ทดสอบ';window.imodePortalApproveQuote('QT-SRV-202609-900')})()`);
  let appr = null;
  for (let i = 0; i < 30 && !(appr && appr.st === 'อนุมัติ'); i++) { await page.sleep(250); appr = await q1(`select (data->'quoteApprovals'->'QT-SRV-202609-900'->>'name') n, (data->'quoteApprovals'->'QT-SRV-202609-900'->>'by') b, (select status from quotations where id='QT-SRV-202609-900') st from system_settings`); }
  ok('signing stores the approval on the server, marked by the customer', appr && appr.n === 'คุณลูกค้า ทดสอบ' && appr.b === 'customer', JSON.stringify(appr));
  ok('…and the quotation moves to อนุมัติ', appr && appr.st === 'อนุมัติ');
}
const roles = await q1(`select jsonb_array_length(data->'roles') n from system_settings`);
ok('nothing the customer page sent touched the roles', roles.n === 11);

// staying current
await db.exec(`update service_cases set status='รออะไหล่', updated_at='2026-09-27T05:00:00Z' where id='CASE-A'`);
await page.eval(`syncCloud()`); await page.sleep(1200);
ok('a status change on the server reaches the open customer page', await page.eval(`(cases.filter(c=>c.id==='CASE-A')[0]||{}).status`) === 'รออะไหล่');

// direct access with the key the page carries
const direct = await page.eval(`fetch(IMODE_ENV.cloud.url+'/rest/v1/customers?select=*',{headers:{apikey:IMODE_ENV.cloud.key,Authorization:'Bearer '+IMODE_ENV.cloud.key}}).then(r=>r.status+' '+r.statusText)`);
ok('the key in the page cannot read the customers table', /^40[13]/.test(direct), direct);
const wide = await page.eval(`document.documentElement.scrollWidth<=innerWidth+1`);
ok('no sideways scroll on the customer page', wide);
ok('no page errors on the customer address', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

// ---------------- the staff address ----------------
page.errors.length = 0;
await page.goto(STAFF, 3500);
ok('staff address with no session shows the staff login', await active() === 'page-staff-login');
ok('the login is the server\'s only', await page.eval(`ImodeAuth.active()`) === 'supabase');
ok('the local UAT registry is empty', await page.eval(`(uatAuth.allAccounts?uatAuth.allAccounts():[]).length`) === 0);
ok('"กรอกชื่อเอง" cannot sign anyone in', await page.eval(`(saveManualUser({preventDefault(){}}),!currentUser)`));
ok('a person-picker row cannot sign anyone in', await page.eval(`(chooseUser('USR-001'),!currentUser)`));
const bad = await page.eval(`imodeSignIn('admin','whatever1').then(r=>r&&r.ok)`).catch(() => false);
ok('a local password does not open the app', !bad && await page.eval(`!currentUser`));
ok('the printed QR points at the customer address', /^http[s]?:\/\/cust\.imode\.test/.test(await page.eval(`(settings.lineConfig||{}).publicAppUrl||''`)) || /cust\.imode\.test/.test(await page.eval(`machinePortalUrl?'':''`) + (await page.eval(`(settings.lineConfig||{}).publicAppUrl||''`))), await page.eval(`(settings.lineConfig||{}).publicAppUrl||''`));
ok('no page errors on the staff address', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
await page.goto(STAFF + '?machineToken=' + encodeURIComponent(tok), 3000);
ok('a customer link opened on the staff address moves to the customer address', /cust\.imode\.test/.test(await page.eval(`location.host`)));

console.log(`\n${W}px: ${pass} passed, ${fail} failed`);
await page.close(); await srv.close();
process.exit(fail ? 1 : 0);
