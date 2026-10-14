// A stand-in for Supabase in front of PGlite: static files for the two app hosts, and for the
// api host the parts of PostgREST the customer page and a signed-out staff page touch:
//   POST /rest/v1/rpc/<fn>   executed as role anon (or authenticated) with real request.headers
//   any  /rest/v1/<table>    executed as that role too, so RLS / grants answer, not this file
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import http from 'http';
import fs from 'fs';
import path from 'path';

const D = (await import('url')).fileURLToPath(new URL('../../../production/database/', import.meta.url));
export const ANON = 'test-anon-key';
const TYPES = { p_row: 'jsonb', p_patch: 'jsonb', p_id: 'uuid', p_is_active: 'boolean' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain' };

export async function start(port, webDir) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
      email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
      confirmation_token text, email_change text, email_change_token_new text, recovery_token text, last_sign_in_at timestamptz, banned_until timestamptz);
    create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;`);
  for (const f of ['01-schema.sql', 'seed/03-real-data.sql', '02-security.sql']) await db.exec(fs.readFileSync(D + f, 'utf8'));
  const log = [];

  async function asRole(req, fn) {
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const role = auth.startsWith('staff.') ? 'authenticated' : 'anon';
    const sub = auth.startsWith('staff.') ? auth.slice(6) : '';
    const headers = JSON.stringify({ 'x-forwarded-for': String(req.headers['x-test-ip'] || '127.0.0.1') });
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.headers', $2, true)`, [sub, headers]);
      return fn(tx);
    });
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS,PUT', 'Access-Control-Expose-Headers': '*' };
  const send = (res, code, body, extra) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors, extra || {})); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const pgErr = (res, e) => {
    const code = e.code || 'P0001';
    send(res, code === '42501' ? 401 : 400, { code, message: e.message, details: e.detail || null, hint: e.hint || null });
  };

  const server = http.createServer(async (req, res) => {
    const host = String(req.headers.host || '').split(':')[0];
    const url = new URL(req.url, 'http://x');
    if (host.startsWith('api.')) {
      if (req.method === 'OPTIONS') return send(res, 204);
      let body = '';
      for await (const c of req) body += c;
      log.push(req.method + ' ' + url.pathname);
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (m) {
        const args = body ? JSON.parse(body) : {};
        const keys = Object.keys(args);
        const sql = `select public.${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}::${TYPES[k] || 'text'}`).join(', ')})::text r`;
        const vals = keys.map(k => args[k] === null ? null : (TYPES[k] === 'jsonb' ? JSON.stringify(args[k]) : String(args[k])));
        try {
          const r = await asRole(req, tx => tx.query(sql, vals));
          const v = r.rows[0].r;
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(v == null ? 'null' : v);
        } catch (e) { return pgErr(res, e); }
      }
      const t = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (t) {
        try { await asRole(req, tx => tx.query(`select 1 from public.${t[1]} limit 0`)); return send(res, 200, []); }
        catch (e) { return pgErr(res, e); }
      }
      return send(res, 404, { error: 'not emulated: ' + url.pathname });
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(webDir, p);
    if (!file.startsWith(path.resolve(webDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { db, log, close: () => new Promise(r => server.close(r)) };
}
