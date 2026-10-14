// Minimal headless-Chrome driver over CDP (Node 24 has a global WebSocket).
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1440, height = 1000, mobile = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imode-cdp-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--host-resolver-rules=MAP *.imode.test 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch (e) { }
  }
  if (!port) throw new Error('chrome did not start');
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(t => t.type === 'page');
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${target.id}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = []; const consoleErrors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  };
  function send(method, params = {}, timeout = 20000) {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((res, rej) => {
      pending.set(i, { res, rej });
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)); } }, timeout);
    });
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*line-scdn.net*', '*cdnjs.cloudflare.com*', '*cdn.jsdelivr.net*', '*/realtime/v1/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const page = {
    send, errors, consoleErrors,
    async eval(expr, awaitPromise = true) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url, settle = 2500) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { await sleep(100); try { if (await page.eval('document.readyState') === 'complete') break; } catch (e) { } }
      await sleep(settle);
    },
    async waitFor(expr, ms = 8000) {
      for (let t = 0; t < ms; t += 150) { try { if (await page.eval(expr)) return true; } catch (e) { } await sleep(150); }
      return false;
    },
    async close() { try { ws.close(); } catch (e) { } proc.kill(); await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } },
    sleep
  };
  return page;
}
