// Runs the production SQL on PGlite (real PostgreSQL in WASM) with a stand-in for Supabase's
// auth schema and its anon / authenticated roles.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const D = (await import('url')).fileURLToPath(new URL('../../../production/database/', import.meta.url));
const db = await PGlite.create({ extensions: { pgcrypto } });
export const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);

const run = async (file) => {
  try { await db.exec(fs.readFileSync(D + file, 'utf8')); ok('runs: ' + file, true); }
  catch (e) { ok('runs: ' + file, false, e.message); throw e; }
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

await run('01-schema.sql');
await run('01-schema.sql');   // idempotent
const files = process.argv.slice(2);
for (const f of files) await run(f);

if (files.some(f => f.includes('03-real-data'))) {
  const c = await one(`select (select count(*) from customers)::int c,(select count(*) from machines)::int m,(select count(*) from machine_warranties)::int w,(select count(*) from machine_models)::int mm,(select count(*) from technicians)::int t`);
  ok('counts 152/353/341/105/4', c.c === 152 && c.m === 353 && c.w === 341 && c.mm === 105 && c.t === 4, JSON.stringify(c));
  const tok = await one(`select count(distinct "qrToken")::int d, count(*) filter (where "qrToken" like 'QR-%')::int derived, min(length("qrToken"))::int len from machines`);
  ok('every qrToken distinct, random, >= 22 chars', tok.d === 353 && tok.derived === 0 && tok.len >= 22, JSON.stringify(tok));
  const orphan = await one(`select count(*)::int n from machines m left join customers c on c.id=m."customerId" where c.id is null`);
  ok('every machine belongs to a customer', orphan.n === 0);
  const wo = await one(`select count(*)::int n from machine_warranties w left join machines m on m.id=w.machine_id where m.id is null or w.customer_id <> m."customerId"`);
  ok('every warranty points at its machine and that machine\'s customer', wo.n === 0);
  const s = await one(`select data from system_settings where id='main'`);
  ok('settings: roles present, no accounts, no hashes', s.data.roles.length === 11 && s.data.uatAccounts.length === 0 && !JSON.stringify(s.data).match(/[0-9a-f]{64}/), 'provider=' + s.data.authConfig.provider);
  const th = await one(`select name, model, serial, "serviceStatus", size, warranty from machines where id='M00001'`);
  ok('M00001 maps to hydrogen / L', th.name === 'เครื่องผลิตแก๊สไฮโดรเจน' && th.size === 'L' && th.serial === 'DEMO-HO500WT-0001', JSON.stringify(th));
  const w1 = await one(`select start_date,end_date,months from machine_warranties where id='W00001'`);
  ok('W00001 29/11/2022→28/11/2023 = 12 months', w1.start_date === '2022-11-29' && w1.end_date === '2023-11-28' && Number(w1.months) === 12, JSON.stringify(w1));
  await run(files.find(f => f.includes('03-real-data')));   // re-run is harmless
  const c2 = await one(`select count(*)::int m from machines`);
  ok('seed re-run adds nothing', c2.m === 353);
}
globalThis.__db = db;
export { db, ok, one };
if (!process.env.KEEP) { const f = results.filter(r => !r[0]).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); }
