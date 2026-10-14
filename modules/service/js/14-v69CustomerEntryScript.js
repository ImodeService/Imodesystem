/* V6.9 customer entry without a login.
   New decision: customers are not given accounts at all. They add the LINE OA, tap the
   rich-menu link, and land on a page that asks for the machine — by QR or by serial —
   and go straight into the portal for that machine. The customer accounts, the customer
   login page and the portal's remember-me prompt are all removed, because none of them
   have anything left to do.
   Kept: the QR link with ?machineToken=, which now opens the portal directly again. */
(function(){
 'use strict';

 function tl(th,en){return typeof window.L==='function'?window.L(th,en):th}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}

 /* ---------- 1. no more customer accounts ---------- */
 if(window.uatAuth&&typeof window.uatAuth.allAccounts==='function'){
  var baseAll=window.uatAuth.allAccounts;
  window.uatAuth.allAccounts=function(){
   return baseAll.apply(this,arguments).filter(function(a){return a.accountType!=='customer'});
  };
 }

 /* ---------- 2. find a machine the way a customer would ----------
    A serial is what is printed on the machine plate; the QR carries a token. Accept
    either, plus the machine id, and ignore case and stray spaces or dashes. */
 function normalize(v){return String(v||'').trim().toLowerCase().replace(/[\s\-_]+/g,'')}
 function machineList(){try{return Array.isArray(machines)?machines:[]}catch(e){return[]}}
 /* Every match, so the caller can tell "not found" from "more than one". */
 function findMachines(input){
  var q=normalize(input);
  var list=machineList();
  if(!q||!list.length)return [];
  var byToken=list.filter(function(m){return normalize(m.qrToken)===q||normalize(m.id)===q});
  if(byToken.length)return byToken;
  var bySerial=list.filter(function(m){return normalize(m.serial)===q});
  if(bySerial.length)return bySerial;
  /* A plate is easy to mistype, so allow a serial that clearly contains the input. */
  if(q.length>=6)return list.filter(function(m){return normalize(m.serial).indexOf(q)>=0});
  return [];
 }
 function findMachine(input){
  var hits=findMachines(input);
  /* Never guess between two machines — two customers can end up with the same serial
     typed in, and picking the first would show one company another company's machine. */
  return hits.length===1?hits[0]:null;
 }
 window.imodeFindCustomerMachine=findMachine;
 window.imodeFindCustomerMachines=findMachines;

 function openMachinePortal(m){
  if(!m)return false;
  try{portalMachineToken=m.qrToken||m.id}catch(e){}
  if(typeof window.goPage==='function')window.goPage('customer-portal');
  if(typeof window.renderCustomerPortal==='function')window.renderCustomerPortal();
  return true;
 }
 window.imodeOpenMachinePortal=openMachinePortal;

 /* ---------- 3. the entry page ---------- */
 function ensureEntryPage(){
  var main=document.querySelector('main.main');
  if(!main||document.getElementById('page-customer-entry'))return;
  var sec=document.createElement('section');
  sec.className='page rhome-page';
  sec.id='page-customer-entry';
  main.appendChild(sec);
 }

 function inLineClient(){
  try{return typeof liff!=='undefined'&&liff&&typeof liff.isInClient==='function'&&liff.isInClient()}catch(e){return false}
 }
 /* LINE's own in-app browser, which is NOT the same thing as a LIFF app.
    A rich-menu link that is a plain https URL opens here. liff.init() is only ever called
    when settings.lineConfig.liffId is set (js/03 initLiffPortal), and no LIFF ID is
    configured, so liff.isInClient() is false, liff.scanCodeV2() is unavailable, and the
    code below falls through to getUserMedia — which this webview refuses outright with a
    NotAllowedError. That refusal is the reported "เบราว์เซอร์ไม่อนุญาตให้ใช้กล้อง": there
    is no permission prompt to accept, so "กดอนุญาตกล้อง" was advice nobody could follow.
    The way out that does work is LINE's own openExternalBrowser=1 parameter, which makes
    LINE hand the link to Chrome or Safari, where the camera prompt appears normally. */
 function inLineInApp(){
  try{return /\bLine\//i.test(navigator.userAgent||'')&&!inLineClient()}catch(e){return false}
 }
 function externalBrowserUrl(opts){
  var wantScan=!!(opts&&opts.scan===true);
  try{
   var u=new URL(location.href);
   u.searchParams.set('openExternalBrowser','1');
   if(wantScan)u.searchParams.set('scan','1');
   return u.href;
  }catch(e){
   return location.href+(location.href.indexOf('?')>=0?'&':'?')
    +'openExternalBrowser=1'+(wantScan?'&scan=1':'');
  }
 }
 /* Called both from a click handler and from scanInExternalBrowser(). A click passes the
    Event as the first argument, which has no `scan` property, so the strict ===true test
    is what keeps a plain "open in a browser" tap from silently arming the camera. */
 window.imodeOpenInExternalBrowser=function(opts){
  var url=externalBrowserUrl(opts);
  try{
   if(typeof liff!=='undefined'&&liff&&typeof liff.openWindow==='function'&&inLineClient()){
    liff.openWindow({url:url,external:true});
    return;
   }
  }catch(e){}
  location.href=url;
 };
 /* THE CAMERA IN ONE TAP FROM THE LINE RICH MENU.

    A rich-menu link that is a plain https URL lands in LINE's in-app browser, where
    getUserMedia is refused outright with NotAllowedError and no prompt is ever shown.
    The scan button therefore does not attempt a camera it cannot have: it hands the page
    to Chrome / Safari with scan=1, and the entry page there opens the camera by itself.
    One tap instead of tap -> error -> tap.

    Two ways this stops being needed, both of them configuration rather than code:
      - the rich menu URL itself carries openExternalBrowser=1, so LINE never opens the
        in-app browser in the first place; or
      - a LIFF ID is configured, and then inLineClient() is true and startScan() uses
        liff.scanCodeV2() — LINE's own scanner, in place, no browser switch. */
 function scanInExternalBrowser(){
  window.imodeOpenInExternalBrowser({scan:true});
 }
 var autoScanRan=false;
 function wantsAutoScan(){
  try{
   if(new URLSearchParams(location.search).get('scan')==='1')return true;
   return String(location.hash||'').indexOf('scan=1')>=0;
  }catch(e){return false}
 }
 function canScan(){
  /* Inside LINE the LIFF scanner is used. In a browser a camera scan needs a secure
     context — https, localhost, or a file:// page, all three of which Chrome treats as
     trustworthy — and a camera. It no longer needs BarcodeDetector: vendor/jsQR.min.js
     decodes the frames wherever that API is missing, which is every desktop browser on
     Windows, plus Safari and Firefox. If the device turns out to have no camera after
     all, startScan() says so and the photo path is still there. */
  if(inLineClient())return true;
  return !!(window.isSecureContext&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
 }
 /* Why the camera cannot be offered — said plainly, because "this device cannot scan" is
    not something the visitor can act on. */
 function noScanReason(){
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia))
   return tl('เบราว์เซอร์นี้เปิดกล้องไม่ได้ กรุณากรอกหมายเลขเครื่องด้านล่าง',
             'This browser cannot open a camera — please type the serial below.');
  if(!window.isSecureContext)
   /* An http:// LAN address is the usual case here — a phone opening 192.168.x.x. */
   return tl('เบราว์เซอร์เปิดกล้องได้เฉพาะหน้าเว็บที่เป็น https (หรือ localhost) เท่านั้น กรุณากรอกหมายเลขเครื่องด้านล่าง',
             'Browsers only allow the camera on https pages (or localhost). Please type the serial below.');
  return tl('อุปกรณ์นี้สแกน QR ไม่ได้ กรุณากรอกหมายเลขเครื่องด้านล่าง',
            'This device cannot scan a QR code — please type the serial below');
 }

 /* The customer module has its own wordmark. imodeBrandHeaderHTML() is shared with the
    staff login and the staff Home board, so it is left alone and the header is rebuilt
    here with the same markup and the customer logo. */
 var CUSTOMER_LOGO=new URL('./assets/imode-document-logo-removeBG.png',location.href).href;
 function customerBrand(){
  var lang='<b>TH</b> | EN';
  try{if(settings.language==='en')lang='TH | <b>EN</b>'}catch(e){}
  return '<div class="rhome-brand">'
   +'<img class="rhome-brand-mark centry-brand-mark" src="'+CUSTOMER_LOGO+'" alt="I-MODE service">'
   +'<button type="button" class="rhome-lang" onclick="toggleLanguage()">'+lang+'</button>'
   +'</div>';
 }

 function renderEntry(){
  var host=document.getElementById('page-customer-entry');
  if(!host)return;
  /* The render below replaces the whole card, video element included. Without this the
     MediaStream survives its own <video> — the camera light stays on and the decode loop
     keeps drawing a detached element. It was reachable before (goPage('customer-entry')
     while scanning) and is more so now that arriving with scan=1 starts a camera at
     render time. stopScan() is a no-op when nothing is running. */
  stopScan();
  var brand=customerBrand();
  host.innerHTML=brand+
   '<div class="rhome-body rhome-login-body"><div class="rhome-login-card centry-card">'
   +'<h2>'+esc2(tl('บริการลูกค้า I-MODE','I-MODE Customer Service'))+'</h2>'
   +'<p>'+esc2(tl('ระบุเครื่องของคุณเพื่อเข้าใช้บริการ','Tell us which machine you have'))+'</p>'
   +(canScan()?'<button type="button" class="centry-scan" id="centryScan">📷 '+esc2(tl('สแกน QR ที่ตัวเครื่อง','Scan the QR on the machine'))+'</button>'
              :'<div class="centry-scan-off">'+esc2(noScanReason())+'</div>')
   /* Inside LINE the scan button opens the camera through the phone's browser, so the
      separate "open in a browser" button that used to sit here is what that tap already
      does. A line of text in its place, so the browser switch is not a surprise. */
   +(inLineInApp()?'<div class="centry-scan-note">'
     +esc2(tl('การสแกนจะเปิดกล้องผ่านเบราว์เซอร์ของเครื่อง (LINE ไม่อนุญาตให้ใช้กล้องในแอป)',
              'Scanning opens the camera in your phone browser — LINE does not allow it in the app'))+'</div>':'')
   +'<div class="rhome-login-or">'+esc2(tl('หรือ','or'))+'</div>'
   +'<form id="centryForm" autocomplete="off">'
   +'<div class="rhome-field"><span aria-hidden="true">🔎</span><input id="centrySerial" placeholder="'+esc2(tl('หมายเลขเครื่อง (S/N)','Machine serial number'))+'" aria-label="'+esc2(tl('หมายเลขเครื่อง','Machine serial number'))+'"></div>'
   +'<div id="centryError" class="rhome-login-error" role="alert"></div>'
   +'<button type="submit" class="rhome-login-btn">'+esc2(tl('เข้าใช้บริการ','Continue'))+'</button>'
   +'</form>'
   +'<div id="centryScanBox" class="centry-scanbox" hidden><video id="centryVideo" playsinline muted></video>'
   +'<button type="button" class="centry-scan-stop" id="centryStop">'+esc2(tl('ปิดกล้อง','Stop camera'))+'</button></div>'
   +'<div class="rhome-login-note">'+esc2(tl('หมายเลขเครื่องอยู่บนป้ายข้างตัวเครื่อง ถ้าหาไม่พบ กรุณาติดต่อทีม Service ทาง LINE OA','The serial is on the plate on the machine. If you cannot find it, contact the service team on LINE.'))+'</div>'
   +'</div></div>';
  var form=document.getElementById('centryForm');
  if(form)form.onsubmit=submitSerial;
  var scan=document.getElementById('centryScan');
  if(scan)scan.onclick=inLineInApp()?scanInExternalBrowser:startScan;
  var stop=document.getElementById('centryStop');
  if(stop)stop.onclick=stopScan;
  var ext=document.getElementById('centryExternal');
  if(ext)ext.onclick=function(){window.imodeOpenInExternalBrowser()};
  /* Arriving from that hand-off. One attempt only: renderEntry() runs again on every
     goPage('customer-entry'), and a browser that wants a user gesture for getUserMedia
     would otherwise re-throw the same error on each of them. When it does refuse, the
     existing error path still offers the button, so nobody is stranded. */
  if(!autoScanRan&&wantsAutoScan()&&!inLineInApp()&&canScan()){
   autoScanRan=true;
   setTimeout(startScan,60);
  }
 }
 window.imodeRenderCustomerEntry=renderEntry;

 function entryError(msg){
  var box=document.getElementById('centryError');
  if(!box)return;
  box.textContent=msg||'';
  box.classList.toggle('show',!!msg);
 }
 /* An error the visitor can actually act on: the message plus the one button that fixes it. */
 function entryErrorWithExternal(msg){
  var box=document.getElementById('centryError');
  if(!box){entryError(msg);return}
  box.classList.add('show');
  box.innerHTML=esc2(msg)
   +'<button type="button" class="centry-external" id="centryExternalFix">🌐 '
   +esc2(tl('เปิดด้วยเบราว์เซอร์ (Chrome / Safari)','Open in a browser (Chrome / Safari)'))+'</button>';
  var b=document.getElementById('centryExternalFix');
  if(b)b.onclick=function(){window.imodeOpenInExternalBrowser({scan:true})};
 }
 function submitSerial(e){
  if(e&&e.preventDefault)e.preventDefault();
  var v=(document.getElementById('centrySerial')||{}).value||'';
  if(!String(v).trim()){entryError(tl('กรุณากรอกหมายเลขเครื่อง','Please enter the serial number'));return}
  var hits=findMachines(v);
  /* production customer address: the machine is fetched from the server (js/125) */
  if(!hits.length&&typeof window.imodePortalRemote==='function'){window.imodePortalRemote(v,'serial');return}
  if(hits.length>1){showMachineChoice(hits);return}
  var m=hits[0]||null;
  if(!m){entryError(tl('ไม่พบเครื่องนี้ในระบบ กรุณาตรวจหมายเลขอีกครั้ง หรือติดต่อทีม Service','No machine with that number. Please check it, or contact the service team.'));return}
  stopScan();
  openMachinePortal(m);
 }

 /* More than one machine answers to what was typed — ask instead of guessing. */
 function showMachineChoice(list){
  var box=document.getElementById('centryError');
  if(!box)return;
  box.classList.add('show');
  box.innerHTML=esc2(tl('พบหลายเครื่องที่ตรงกัน กรุณาเลือกเครื่องของคุณ','More than one machine matches — please pick yours'))
   +'<div class="centry-choice">'+list.slice(0,8).map(function(m){
     var cu=null;try{cu=customerById(m.customerId)}catch(e){}
     return '<button type="button" data-machine="'+esc2(m.id)+'"><b>'+esc2(m.name||m.id)+'</b>'
      +'<small>'+esc2((m.model||'-')+' · S/N '+(m.serial||'-'))+'</small>'
      +'<small>'+esc2((cu&&cu.name)||tl('ยังไม่ระบุลูกค้า','No customer on record'))+'</small></button>';
    }).join('')+'</div>';
  box.querySelectorAll('[data-machine]').forEach(function(b){
   b.onclick=function(){
    var id=b.getAttribute('data-machine');
    var m=machineList().filter(function(x){return x.id===id})[0];
    if(!m)return;
    stopScan();
    entryError('');
    openMachinePortal(m);
   };
  });
 }

 /* ---------- 4. QR scanning ---------- */
 var scanState={stream:null,raf:0,detector:null,tick:null,lastBad:''};
 function stopScan(){
  if(scanState.raf){cancelAnimationFrame(scanState.raf);scanState.raf=0}
  if(scanState.stream){scanState.stream.getTracks().forEach(function(t){try{t.stop()}catch(e){}});scanState.stream=null}
  scanState.tick=null;
  var box=document.getElementById('centryScanBox');
  if(box)box.hidden=true;
 }
 window.imodeStopCustomerScan=stopScan;

 function handleScanned(text){
  /* The QR carries the full portal URL, so pull the token out of it when present. */
  var v=String(text||'');
  var m=v.match(/machineToken=([^&#]+)/);
  var key=m?decodeURIComponent(m[1]):v;
  var machine=findMachine(key);
  if(machine){stopScan();openMachinePortal(machine);return}
  /* production customer address: the machine is fetched from the server (js/125) */
  if(typeof window.imodePortalRemote==='function'){
   window.imodePortalRemote(key,'token');
   /* keep the camera reading; the same code is not asked for twice */
   if(scanState.stream&&scanState.tick)scanState.raf=requestAnimationFrame(scanState.tick);
   return;
  }
  /* A code that does not match is no reason to shut the camera off — the visitor may have
     caught a neighbouring sticker or half a frame, and closing the preview on the first
     unreadable code is why scanning felt like the camera died on its own. Keep the stream
     alive so they can simply re-aim, and report the same bad code only once. */
  if(v!==scanState.lastBad){
   scanState.lastBad=v;
   entryError(tl('QR นี้ไม่ตรงกับเครื่องในระบบ ลองเล็งใหม่อีกครั้ง หรือกรอกหมายเลขเครื่องด้านล่าง','That QR does not match a machine in the system — try again, or type the serial below'));
  }
  /* Inside LINE there is no stream of our own to resume; liff.scanCodeV2() owns the camera. */
  if(scanState.stream&&scanState.tick)scanState.raf=requestAnimationFrame(scanState.tick);
 }

 /* ---------- 4b. the decoder ----------
    Chrome on Android has BarcodeDetector built in and it is the fastest path. Every other
    browser a customer might use — Chrome and Edge on Windows, Safari on iOS, Firefox
    anywhere — does not, which is why the scan button used to be hidden entirely and the
    camera could never be opened. vendor/jsQR.min.js fills that gap. It is loaded from the
    repo, not a CDN, and only on the first scan, so it works offline and costs nothing at
    boot. */
 var QR_DECODER_SRC=new URL('./vendor/jsQR.min.js',location.href).href;
 var decoderPromise=null;
 function loadJsQR(){
  if(typeof window.jsQR==='function')return Promise.resolve(window.jsQR);
  if(decoderPromise)return decoderPromise;
  decoderPromise=new Promise(function(res,rej){
   var s=document.createElement('script');
   s.src=QR_DECODER_SRC;
   s.onload=function(){typeof window.jsQR==='function'?res(window.jsQR):rej(new Error('jsQR missing'))};
   s.onerror=function(){decoderPromise=null;rej(new Error('jsQR load failed'))};
   document.head.appendChild(s);
  });
  return decoderPromise;
 }
 /* Both decoders answer the same question — "is there a QR in this frame?" — so the scan
    loop below never has to know which one it got. */
 function getDecoder(){
  if(typeof window.BarcodeDetector==='function'){
   try{
    var det=new window.BarcodeDetector({formats:['qr_code']});
    return Promise.resolve(function(source){
     return det.detect(source).then(function(codes){return codes&&codes.length?codes[0].rawValue:''},function(){return ''});
    });
   }catch(e){/* falls through to jsQR */}
  }
  return loadJsQR().then(function(jsQR){
   var cv=document.createElement('canvas'),ctx=cv.getContext('2d',{willReadFrequently:true});
   return function(source){
    var w=source.videoWidth||source.naturalWidth||source.width||0;
    var h=source.videoHeight||source.naturalHeight||source.height||0;
    if(!w||!h)return Promise.resolve('');
    /* Full-resolution frames are wasted work; ~640px across is plenty for a plate QR and
       keeps the loop smooth on a phone. */
    var scale=Math.min(1,640/Math.max(w,h));
    cv.width=Math.round(w*scale);cv.height=Math.round(h*scale);
    ctx.drawImage(source,0,0,cv.width,cv.height);
    var img;
    try{img=ctx.getImageData(0,0,cv.width,cv.height)}catch(e){return Promise.resolve('')}
    var got=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});
    return Promise.resolve(got&&got.data?got.data:'');
   };
  });
 }

 function startScan(){
  if(inLineClient()&&typeof liff.scanCodeV2==='function'){
   liff.scanCodeV2().then(function(res){handleScanned(res&&res.value)},function(){
    entryError(tl('สแกนไม่สำเร็จ กรุณากรอกหมายเลขเครื่องแทน','Scan failed — please type the serial instead'));
   });
   return;
  }
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){
   entryError(noScanReason());
   return;
  }
  var box=document.getElementById('centryScanBox'),video=document.getElementById('centryVideo');
  if(!box||!video)return;
  box.hidden=false;
  scanState.lastBad='';
  entryError(tl('กำลังเปิดกล้อง...','Opening the camera...'));
  Promise.all([
   navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}),
   getDecoder()
  ]).then(function(pair){
   var stream=pair[0],decode=pair[1];
   scanState.stream=stream;
   video.srcObject=stream;
   var p=video.play();if(p&&p.catch)p.catch(function(){});
   entryError('');
   var tick=function(){
    if(!scanState.stream)return;
    decode(video).then(function(text){
     if(text){handleScanned(text);return}
     scanState.raf=requestAnimationFrame(tick);
    },function(){scanState.raf=requestAnimationFrame(tick)});
   };
   /* handleScanned() resumes the loop after a code that did not match, so the tick has to
      outlive this closure. */
   scanState.tick=tick;
   scanState.raf=requestAnimationFrame(tick);
  },function(err){
   stopScan();
   var name=err&&err.name||'';
   if((name==='NotAllowedError'||name==='SecurityError')&&inLineInApp())
    /* Not a permission the visitor can grant — LINE's webview never asks. Say so, and
       give them the button that actually opens the camera. */
    entryErrorWithExternal(tl('เบราว์เซอร์ใน LINE ไม่อนุญาตให้ใช้กล้อง กรุณาเปิดหน้านี้ด้วยเบราว์เซอร์ หรือกรอกหมายเลขเครื่องด้านล่าง',
                              'The browser inside LINE does not allow the camera. Open this page in a browser, or type the serial below.'));
   else if(name==='NotAllowedError'||name==='SecurityError')
    entryError(tl('เบราว์เซอร์ไม่อนุญาตให้ใช้กล้อง กรุณากดอนุญาตกล้องแล้วลองใหม่ หรือกรอกหมายเลขเครื่อง','Camera permission was refused — allow the camera and try again, or type the serial'));
   else if(name==='NotFoundError'||name==='OverconstrainedError')
    entryError(tl('ไม่พบกล้องบนอุปกรณ์นี้ กรุณากรอกหมายเลขเครื่องด้านล่าง','No camera on this device — please type the serial below'));
   else
    entryError(tl('เปิดกล้องไม่สำเร็จ กรุณากรอกหมายเลขเครื่องด้านล่าง','Could not open the camera — please type the serial below'));
  });
 }

 /* ---------- 5. wire the page into navigation ---------- */
 var baseGoPage=window.goPage;
 window.goPage=function(name){
  /* The login page and the circle Home page are both gone: every customer route ends on
     the machine-entry page. Rename first, then build, so a redirected name still gets its
     section created before goPage() looks it up. */
  if(name==='customer-login'||name==='customer-home')name='customer-entry';
  if(name==='customer-entry')ensureEntryPage();
  var r=baseGoPage.call(this,name);
  if(name==='customer-entry'){
   document.body.classList.add('rhome-mode');
   renderEntry();
  }else{
   stopScan();
  }
  return r;
 };

 /* A machine QR opens the portal directly again: there is no login left to ask for. */
 var basePortalInit=window.initPortalFromUrl;
 window.initPortalFromUrl=async function(){
  var token=new URLSearchParams(location.search).get('machineToken');
  if(token){
   try{portalMachineToken=token}catch(e){}
   var m=findMachine(token);
   if(m){
    openMachinePortal(m);
    if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease();
    return;
   }
  }
  return basePortalInit.apply(this,arguments);
 };

 /* ---------- 6. the portal exit ----------
    Without customer accounts the visitor in the portal is either a customer with no
    session at all, or a staff member using the preview from the Customers page. Only the
    staff preview keeps the old behaviour of dropping back into the application. */
 function staffSession(){
  try{return !!(currentUser&&currentUser.name&&currentUser.accountType!=='customer')}catch(e){return false}
 }
 function decorateClose(){
  var b=document.querySelector('#page-customer-portal .portal-close');
  if(!b||staffSession())return;
  b.textContent='×';
  b.title=tl('ออกจากหน้าบริการ','Leave the service page');
  b.setAttribute('aria-label',tl('ออกจากหน้าบริการ','Leave the service page'));
  b.setAttribute('onclick','imodePortalExitPrompt()');
 }
 /* applyOfficialImodeLogo() in the core rewrites every .portal-header img on each
    renderAll(), so changing the src in pages/customer-home.html alone is silently undone.
    Re-point it after the core has had its say. The header keeps its I-MODE blue, so the
    blue wordmark is given a white chip to sit on (see .centry-portal-logo below). */
 function paintCustomerLogo(){
  var imgs=document.querySelectorAll('#page-customer-portal .portal-header img');
  for(var i=0;i<imgs.length;i++){
   imgs[i].src=CUSTOMER_LOGO;
   imgs[i].alt='I-MODE service';
   imgs[i].classList.add('centry-portal-logo');
  }
 }
 var baseApplyLogo=window.applyOfficialImodeLogo;
 if(typeof baseApplyLogo==='function'){
  window.applyOfficialImodeLogo=function(){
   var r=baseApplyLogo.apply(this,arguments);
   paintCustomerLogo();
   return r;
  };
 }

 var basePortalRender=window.renderCustomerPortal;
 if(typeof basePortalRender==='function'){
  window.renderCustomerPortal=function(){
   var r=basePortalRender.apply(this,arguments);
   decorateClose();
   paintCustomerLogo();
   return r;
  };
 }

 /* The × on the customer page.

    A customer reaches this page from our LINE Official Account — a rich-menu link or a
    machine QR they scanned inside LINE — so "close" means "go back to LINE", not "go to
    another page of a web app they never asked to be in".

    It used to call openPortalLineOfficial(), which does window.open() first. In LINE's
    in-app browser and in Safari a pop-up opened this way is commonly blocked, and the
    line right after it moved the page to the machine-entry form — so the visitor pressed
    × and simply landed on another screen of the same app. Navigating this tab straight to
    the OA cannot be blocked, and it is what "เด้งกลับไปที่ไลน์" asks for.

    Order: close the LIFF window if we are one; otherwise navigate to the Official Account;
    only when no OA is configured at all is there nothing to go back to, and the visitor is
    left on the entry page rather than on a dead screen. Staff previewing the portal never
    reach here — decorateClose() leaves their × alone. */
 window.imodePortalExitPrompt=function(){
  stopScan();
  if(inLineClient()&&typeof liff.closeWindow==='function'){
   try{liff.closeWindow();return}catch(e){}
  }
  var cfg={};try{cfg=settings.lineConfig||{}}catch(e){}
  var url=String(cfg.addFriendUrl||'').trim();
  /* 2026-10-09 security: never navigate to a stored javascript:/data: link (js/03 imodeSafeUrl) */
  if(url)url=typeof window.imodeSafeUrl==='function'?window.imodeSafeUrl(url):(/^https?:\/\//i.test(url)?url:'');
  if(!url){
   var id=String(cfg.officialAccountId||'').trim();
   if(id)url='https://line.me/R/ti/p/'+encodeURIComponent(id.charAt(0)==='@'?id:'@'+id);
  }
  try{portalMachineToken=''}catch(e){}
  if(url){location.href=url;return}
  window.goPage('customer-entry');
 };

 /* ---------- styles ---------- */
 var st=document.createElement('style');
 st.id='v69CustomerEntryStyle';
 st.textContent=''
 +'.centry-card{max-width:400px}'
 +'.centry-scan{width:100%;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(180deg,#ff9a4d,#f2711c);box-shadow:0 10px 22px rgba(242,113,28,.28)}'
 +'.centry-scan:hover{filter:brightness(1.05)}'
 +'.centry-choice{display:grid;gap:8px;margin-top:10px}'
 +'.centry-choice button{text-align:left;padding:10px 12px;border:1px solid #d7e3f5;border-radius:12px;background:#fff;cursor:pointer}'
 +'.centry-choice button:hover{border-color:#0b63e5}'
 +'.centry-choice b{display:block;font-size:13px;color:#0c225e}'
 +'.centry-choice small{display:block;font-size:11px;color:#68789a;margin-top:2px}'
 +'.centry-scan-note{margin-top:8px;padding:9px 11px;border-radius:10px;background:#eef4ff;border:1px solid #d5e4fb;color:#2b5fae;font-size:11.5px;line-height:1.5;text-align:center}'
 +'.centry-scan-off{padding:11px;border-radius:12px;background:#fff7ec;border:1px solid #f6dcb8;color:#8a5a17;font-size:12px;line-height:1.5}'
 +'.centry-external{display:block;width:100%;margin-top:9px;border:1px solid #cfe0fa;border-radius:12px;padding:11px;'
 +'font-size:12.5px;font-weight:700;color:#0b3f9e;background:#f2f7ff;cursor:pointer;line-height:1.4}'
 +'.centry-external:hover{background:#e7f0ff;border-color:#0b63e5}'
 +'.centry-external:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.centry-scanbox{margin-top:14px;border-radius:14px;overflow:hidden;background:#04122e;position:relative}'
 +'.centry-scanbox video{width:100%;display:block;max-height:320px;object-fit:cover}'
 +'.centry-scan-stop{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);border:none;border-radius:999px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.92);color:#0c225e}'
 /* The customer wordmark is a stacked lockup, so it carries a little more height than the
    single-line staff mark it replaces on this page. */
 +'.centry-brand-mark{height:56px}'
 +'@media(max-width:640px){.centry-brand-mark{height:44px}}'
 /* Blue wordmark on the blue portal header: it sits on a white chip inside the existing
    78x48 box (box-sizing is border-box globally, so the box does not grow). */
 +'.centry-portal-logo{background:#fff;border-radius:10px;padding:5px;box-shadow:0 2px 8px rgba(3,18,50,.28)}';
 document.head.appendChild(st);

 function install(){ensureEntryPage()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
