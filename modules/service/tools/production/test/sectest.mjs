// 02-security.sql on PGlite: what anon, a technician, an Admin, a Dev can and cannot do.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const D = (await import('url')).fileURLToPath(new URL('../../../production/database/', import.meta.url));
const db = await PGlite.create({ extensions: { pgcrypto } });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text, last_sign_in_at timestamptz, banned_until timestamptz);
  create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['01-schema.sql', 'seed/03-real-data.sql', '02-security.sql', '02-security.sql']) {
  try { await db.exec(fs.readFileSync(D + f, 'utf8')); ok('runs ' + f, true); }
  catch (e) { ok('runs ' + f, false, e.message); process.exit(1); }
}

// fixtures, as the database owner
const tok = (await db.query(`select "qrToken" t from machines where id='M00001'`)).rows[0].t;
const tokOther = (await db.query(`select "qrToken" t from machines where "customerId"<>'C0001' limit 1`)).rows[0].t;
await db.exec(`
  insert into service_cases (id,ticket,customer_id,machine_id,status,note,contact,phone) values
   ('CASE-A','SRV-1','C0001','M00001','กำลังดำเนินการ','INTERNAL NOTE','คุณเอ','0812345678'),
   ('CASE-OTHER','SRV-2','C0002','M00020','เคสใหม่','x','y','z');
  insert into quotations (id,customer_id,status,machine_ids) values
   ('QT-1','C0001','ส่งแล้ว','["M00001"]'),('QT-DRAFT','C0001','ร่าง','["M00001"]'),
   ('QT-OTHERMACH','C0001','ส่งแล้ว','["M00002"]'),('QT-OTHERCUST','C0002','ส่งแล้ว','[]');
  insert into service_reports (id,case_id,diagnosis,customer_signature) values ('R-1','CASE-A','ok','data:image/png;base64,SIG');
`);

// session helpers
const setHeaders = ip => db.exec(`select set_config('request.headers', '${JSON.stringify({ 'x-forwarded-for': ip + ', 10.0.0.1' })}', false)`);
async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
  try { return await fn(); } finally { await db.exec(`reset role`); }
}
const tryq = async (sql, p) => { try { return { rows: (await db.query(sql, p)).rows }; } catch (e) { return { err: e.message }; } };
const rpc = async (fn, args) => {
  const r = await tryq(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) r`, args);
  return r.err ? { err: r.err } : r.rows[0].r;
};

// ---------------- anon ----------------
await setHeaders('1.1.1.1');
await as('anon', '', async () => {
  const tables = ['service_cases','technicians','customers','machines','notifications','system_settings','quotations','machine_warranties','machine_documents','line_customer_requests','service_reports','qc_records','petty_cash','spare_parts','purchase_orders','machine_models','profiles','notification_reads','auth_audit'];
  let blocked = 0;
  for (const t of tables) { const r = await tryq(`select * from ${t} limit 1`); if (r.err && /permission denied/.test(r.err)) blocked++; }
  ok('anon cannot SELECT any of the ' + tables.length + ' tables', blocked === tables.length, blocked + '/' + tables.length);
  const ins = await tryq(`insert into service_cases (id,status) values ('X','เคสใหม่')`);
  ok('anon cannot INSERT into service_cases directly', !!ins.err);
  const upd = await tryq(`update machines set serial='hacked'`);
  ok('anon cannot UPDATE machines', !!upd.err);
  const ce = await tryq(`insert into client_errors (id,at,message) values ('err-12345',now(),'boom')`);
  ok('anon CAN report a client error', !ce.err, ce.err || '');
  const adm = await rpc('admin_list_staff', []);
  ok('anon cannot list staff', !!adm.err);

  const o = await rpc('portal_open', [tok]);
  ok('portal_open with the QR token opens M00001', o.ok && o.snapshot.machine.id === 'M00001');
  ok('snapshot: the customer is only id/name/branch', JSON.stringify(Object.keys(o.snapshot.customer).sort()) === '["branch","id","name"]');
  const ca = o.snapshot.cases.find(c => c.id === 'CASE-A');
  ok('snapshot: own case present, internal note and contact removed', ca && !('note' in ca) && !('phone' in ca) && !('contact' in ca));
  ok('snapshot: no other machine\'s case', !o.snapshot.cases.some(c => c.id === 'CASE-OTHER'));
  ok('snapshot: report without signatures', o.snapshot.reports.length === 1 && !('customer_signature' in o.snapshot.reports[0]));
  const qs = o.snapshot.quotations.map(q => q.id).sort().join(',');
  ok('snapshot: only the sent quotation for THIS machine', qs === 'QT-1', qs);
  ok('snapshot: warranties without attachments', o.snapshot.warranties.length >= 1 && !('attachment_data' in o.snapshot.warranties[0]));
  ok('snapshot: settings carry no accounts / roles', !('roles' in o.snapshot.settings) && !('uatAccounts' in o.snapshot.settings) && !!o.snapshot.settings.companyName);
  ok('the old guessable token QR-M00001 opens nothing', (await rpc('portal_open', ['QR-M00001'])).ok === false);
  ok('the machine id M00001 opens nothing', (await rpc('portal_open', ['M00001'])).ok === false);

  const f1 = await rpc('portal_find', ['DEMO-HO500WT-0001']);
  ok('portal_find by serial', f1.ok && f1.hits.length === 1 && f1.hits[0].snapshot.machine.id === 'M00001');
  const f2 = await rpc('portal_find', [' 22 11 ho500wt_0023 ']);
  ok('portal_find ignores case, spaces, dashes', f2.hits.length === 1);
  const f3 = await rpc('portal_find', ['HO500WT']);
  ok('portal_find does not match partially', f3.hits.length === 0);
  const dup = await rpc('portal_find', ['20HO200WT-004']);
  ok('a shared serial returns both machines', dup.hits.length === 2);
});

// rate limit: 20 finds per 10 minutes per IP (5 used above)
await setHeaders('2.2.2.2');
await as('anon', '', async () => {
  let last;
  for (let i = 0; i < 21; i++) last = await rpc('portal_find', ['nothing-' + i]);
  ok('the 21st serial search from one IP is refused', last.err && /rate_limited/.test(last.err), last.err || JSON.stringify(last));
});
await setHeaders('3.3.3.3');
await as('anon', '', async () => {
  const r = await rpc('portal_find', ['DEMO-HO500WT-0001']);
  ok('another IP is not affected', r.ok === true);

  // submit
  const bad = { id: 'CASE-NEW-001', ticket: 'SRV-9', status: 'ปิดเคส', assignee: 'T-LEAD-TECH', customer_id: 'C0002', machine_id: 'M00020', issue: 'เครื่องไม่ทำงาน', field_status: 'จบงาน', media: [{ name: 'a.jpg', type: 'image/jpeg', data: 'data:x' }] };
  const s1 = await rpc('portal_submit', [tok, 'service_cases', JSON.stringify(bad)]);
  ok('portal_submit creates the case', s1.ok === true, JSON.stringify(s1));
  const s2 = await rpc('portal_submit', [tok, 'service_cases', JSON.stringify(bad)]);
  ok('a retry of the same case is harmless', s2.ok === true && s2.existed === true);
  const s3 = await rpc('portal_submit', [tok, 'line_customer_requests', JSON.stringify({ id: 'REQ-NEW-001', type: 'service', status: 'เสร็จสิ้น', case_id: 'CASE-OTHER' })]);
  ok('a request pointing at another machine\'s case is refused', s3.ok === false && s3.reason === 'bad_case');
  const s4 = await rpc('portal_submit', [tok, 'line_customer_requests', JSON.stringify({ id: 'REQ-NEW-002', type: 'service', status: 'เสร็จสิ้น', case_id: 'CASE-NEW-001', message: 'hi' })]);
  ok('a request for its own new case is accepted', s4.ok === true, JSON.stringify(s4));
  const s5 = await rpc('portal_submit', [tok, 'quotations', JSON.stringify({ id: 'QT-EVIL' })]);
  ok('any other table is refused', s5.ok === false);
  const big = await rpc('portal_submit', [tok, 'service_cases', JSON.stringify({ id: 'CASE-BIG-01', media: [1, 2, 3, 4, 5] })]);
  ok('more than 4 attachments is refused', big.ok === false && big.reason === 'media_too_large');

  // settings patch
  const p1 = await rpc('portal_settings_patch', [tok, JSON.stringify({
    quoteApprovals: { 'QT-1': { at: 'now', name: 'ลูกค้า', sig: 'data:image/png;base64,AAA', by: 'hacker' }, 'QT-OTHERCUST': { at: 'x' }, 'QT-DRAFT': { at: 'x' }, 'QT-OTHERMACH': { at: 'x' } },
    quoteViews: { 'QT-1': { at: 'now' } },
    caseFeedback: { 'CASE-A': { rating: 5, comment: 'ดีมาก' }, 'CASE-OTHER': { rating: 1 } },
    roles: [], uatAccounts: [{ username: 'evil' }] })]);
  ok('settings patch applies exactly the 3 entries that belong to this machine', p1.ok && p1.applied === 3, JSON.stringify(p1));
  const p2 = await rpc('portal_settings_patch', [tok, JSON.stringify({ quoteApprovals: { 'QT-1': { at: 'again', sig: 'OTHER' } } })]);
  ok('a signed quotation cannot be signed over', p2.applied === 0);
  const q1 = await rpc('portal_quote_status', [tok, 'QT-1']);
  ok('the signed quotation moves to อนุมัติ', q1.updated === 1);
  const q2 = await rpc('portal_quote_status', [tokOther, 'QT-1']);
  ok('another machine\'s token cannot move it', q2.updated === 0 || q2.ok === false);
});

// verify as owner
{
  const c = (await db.query(`select * from service_cases where id='CASE-NEW-001'`)).rows[0];
  ok('forced: status เคสใหม่, no assignee, own customer/machine, LINE OA', c.status === 'เคสใหม่' && c.assignee === null && c.customer_id === 'C0001' && c.machine_id === 'M00001' && c.channel === 'LINE OA' && c.field_status === '' && c.media.length === 1);
  const r = (await db.query(`select * from line_customer_requests where id='REQ-NEW-002'`)).rows[0];
  ok('forced: request status ใหม่', r.status === 'ใหม่' && r.customer_id === 'C0001');
  const s = (await db.query(`select data from system_settings`)).rows[0].data;
  ok('approval stored, marked by customer, not overwritten', s.quoteApprovals['QT-1'].sig === 'data:image/png;base64,AAA' && s.quoteApprovals['QT-1'].by === 'customer' && !s.quoteApprovals['QT-OTHERCUST']);
  ok('feedback stored with source=portal; the other case untouched', s.caseFeedback['CASE-A'].source === 'portal' && !s.caseFeedback['CASE-OTHER']);
  ok('roles and accounts untouched by the patch', s.roles.length === 11 && s.uatAccounts.length === 0);
  ok('quotation status', (await db.query(`select status from quotations where id='QT-1'`)).rows[0].status === 'อนุมัติ');
}

// ---------------- staff ----------------
const mk = async (u, role, tech) => (await db.query(`select imode_private.create_staff($1,'Passw0rd99',$2,$3,'',$4) id`, [u, u + ' name', role, tech || null])).rows[0].id;
const dev = await mk('dev_demo', 'Dev');
const mgr = await mk('manager_demo', 'Service Manager');
const adm = await mk('admin', 'Admin');
const tech = await mk('tech_demo1', 'Technician', 'T1790314003490');
{
  const u = (await db.query(`select email, encrypted_password, raw_user_meta_data from auth.users where id=$1`, [dev])).rows[0];
  ok('login created: username@imode.local, bcrypt password', u.email === 'dev_demo@imode.local' && /^\$2[aby]\$/.test(u.encrypted_password));
  const chk = (await db.query(`select crypt('Passw0rd99', $1) = $1 ok`, [u.encrypted_password])).rows[0].ok;
  ok('the password verifies', chk === true);
  const dupe = await tryq(`select imode_private.create_staff('DEV_DEMO','Passw0rd99','x','Dev')`);
  ok('a username is unique whatever its case', /username_taken/.test(dupe.err || ''));
  const weak = await tryq(`select imode_private.create_staff('newbie','short','x','Dev')`);
  ok('a weak password is refused', /weak_password/.test(weak.err || ''));
}
await as('authenticated', tech, async () => {
  const c = await tryq(`select count(*)::int n from customers`);
  ok('a signed-in technician reads the data', c.rows && c.rows[0].n === 152);
  const r = await rpc('admin_create_staff', ['hacker', 'Passw0rd99', 'x', 'Dev', '', null]);
  ok('a technician cannot create a login', /not_allowed/.test(r.err || ''));
  const up = await tryq(`update profiles set role='Dev' where id=$1`, [tech]);
  ok('a technician cannot promote themselves', !!up.err || (await db.query(`select role from profiles where id=$1`, [tech])).rows[0].role === 'Technician');
  const nr = await tryq(`insert into notification_reads (id,user_key,notice_key) values ('admin|x','admin','x')`);
  ok('a technician cannot write another account\'s read marks', !!nr.err);
  const nr2 = await tryq(`insert into notification_reads (id,user_key,notice_key) values ('tech_demo1|x','tech_demo1','x')`);
  ok('…but can write their own', !nr2.err, nr2.err || '');
  const ce = await tryq(`select * from client_errors`);
  ok('a technician cannot read the error inbox', (ce.rows || []).length === 0);
});
await as('authenticated', adm, async () => {
  const r = await rpc('admin_set_password', [tech, 'NewPass123']);
  ok('role Admin cannot reset passwords (owner\'s rule)', /not_allowed/.test(r.err || ''));
  const l = await rpc('admin_list_staff', []);
  ok('Admin can see the staff list', Array.isArray(l) && l.length === 4);
});
await as('authenticated', mgr, async () => {
  const r = await rpc('admin_set_password', [tech, 'NewPass123']);
  ok('Service Manager can reset a password', r.ok === true, r.err || '');
  const c = await rpc('admin_create_staff', ['tech_demo2', 'Passw0rd11', 'Tech Demo2', 'Technician', 'Technical', 'T1790314031354']);
  ok('Service Manager can create a login', c.ok === true, c.err || '');
  const self = await rpc('admin_update_staff', [mgr, null, null, null, null, false, null]);
  ok('nobody can disable themselves', /cannot_disable_self/.test(self.err || ''));
});
await as('authenticated', dev, async () => {
  const d = await rpc('admin_update_staff', [mgr, null, 'Technician', null, null, null, null]);
  ok('Dev can change a role', d.ok === true, d.err || '');
  const last = await rpc('admin_update_staff', [dev, null, 'Admin', null, null, null, null]);
  ok('the last Dev/Service Manager cannot demote themselves', /last_account_admin/.test(last.err || ''));
  const off = await rpc('admin_update_staff', [tech, null, null, null, null, false, null]);
  ok('Dev can disable an account', off.ok === true);
});
{
  const b = (await db.query(`select banned_until from auth.users where id=$1`, [tech])).rows[0].banned_until;
  ok('a disabled account is banned in auth too', b !== null);
}
await as('authenticated', tech, async () => {
  const c = await tryq(`select count(*)::int n from customers`);
  ok('a disabled account reads nothing', c.rows && c.rows[0].n === 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
