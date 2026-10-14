// The development build (what GitHub Pages serves): no js/00-env.js, so every production
// branch must stay inert and the app must behave exactly as it did before today.
import { start } from './fakesb.mjs';
import { launch } from './cdp.mjs';
const W = +(process.argv[2] || 1440), H = W < 700 ? 844 : 1000;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const srv = await start(8766, JSON.parse((await import('fs')).readFileSync(new URL('./test.config.json', import.meta.url))).source);
const page = await launch({ width: W, height: H, mobile: W < 700 });
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('imode_v69_cloud_optout','1')}catch(e){}" });
await page.send('Network.setBlockedURLs', { urls: ['*supabase.co*', '*fonts.googleapis.com*', '*fonts.gstatic.com*', '*line-scdn.net*', '*/realtime/v1/*'] });
const BASE = 'http://app.imode.test:8766/';
const active = () => page.eval(`(document.querySelector('.page.active')||{}).id`);

await page.goto(BASE, 4000);
ok('no IMODE_ENV in the development build', await page.eval(`typeof window.IMODE_ENV`) === 'undefined');
ok('production files are inert', await page.eval(`!window.imodeIsCustomerHost && typeof window.imodePortalRemote==='undefined' && typeof window.imodeRefreshStaffList==='undefined'`));
ok('cold start lands on the staff door', await active() === 'page-staff-login');
ok('the local UAT login is still the provider', await page.eval(`(settings.authConfig||{}).provider`) === 'local');
ok('the test database config still ships in dev', /ywlrlfudlxsallanoroq/.test(await (await fetch('http://127.0.0.1:8766/js/23-v69CloudConfigScript.js',{headers:{host:'app.imode.test'}})).text()));
ok('demo machines are still seeded in dev', await page.eval(`machines.length`) >= 40);
ok('dev QR tokens are still QR-<id>', await page.eval(`machines[0].qrToken`) === 'QR-' + await page.eval(`machines[0].id`));
const r = await page.eval(`imodeSignIn('lead_technician','lead_technician').then(r=>!!(r&&r.ok!==false))`);
ok('a UAT account still signs in', r && await page.eval(`!!currentUser`));
await page.sleep(800);
const pages = await page.eval(`Array.from(document.querySelectorAll('.side-nav [data-page]')).map(a=>a.getAttribute('data-page')).filter((v,i,a)=>a.indexOf(v)===i)`);
let opened = 0;
for (const p of pages) { const ok2 = await page.eval(`(function(){try{goPage(${JSON.stringify(p)});return true}catch(e){return false}})()`); if (ok2) opened++; }
ok('every sidebar page opens', opened === pages.length && pages.length > 5, opened + '/' + pages.length);
ok('version string unchanged', /Version 1\.0/.test(await page.eval(`document.title`)));
await page.eval(`imodeSignOut&&imodeSignOut()`); await page.sleep(500);

page.errors.length = 0;
await page.goto(BASE + '?serial=DEMO-HO500WT-0001', 4000);
ok('?serial= still opens the customer page from local data', await active() === 'page-customer-portal' && await page.eval(`portalMachine().id`) === 'MCH-0001');
const tok = await page.eval(`machines.find(m=>m.id==='MCH-0002').qrToken`);
await page.goto(BASE + '?machineToken=' + encodeURIComponent(tok), 4000);
ok('?machineToken= still opens the customer page', await active() === 'page-customer-portal' && await page.eval(`portalMachine().id`) === 'MCH-0002');
await page.goto(BASE + '#/customer-entry', 3000);
await page.eval(`(function(){var i=document.getElementById('centrySerial');i.value='NOPE-0000';i.form.onsubmit({preventDefault:function(){}})})()`);
await page.sleep(400);
ok('an unknown serial is answered locally, as before', /ไม่พบเครื่อง/.test(await page.eval(`(document.getElementById('centryError')||{}).textContent||''`)));
ok('no page errors in dev', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
console.log(`\ndev ${W}px: ${pass} passed, ${fail} failed`);
await page.close(); await srv.close();
process.exit(fail ? 1 : 0);
