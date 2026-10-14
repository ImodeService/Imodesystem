/* V6.9 — a machine QR that works on somebody else's phone.

   Reported from the real site: scanning a printed QR on a phone showed
   "ไม่พบข้อมูลเครื่องจาก QR Code".

   The cause is in ensureMasters() (js/03):

       machines.forEach(m=>{ if(!m.qrToken) m.qrToken='QR-'+uid()... })

   uid() is random, and there is no shared database yet, so every browser that opens the
   site invents its **own** token for the same machine. A QR printed from the office PC
   carried that PC's token; the customer's phone seeded its own machines with different
   tokens and matched nothing. Machine ids and serials, by contrast, come from
   js/02-demo-data.js and are identical everywhere — which is why typing the serial worked
   and scanning did not.

   So the token is now derived from the machine id: QR-<machine id>. Two devices compute
   the same value for the same machine without talking to each other, and the QR travels.

   Note for whoever reprints labels: a QR generated before this change carries a random
   token that no longer resolves. Reprint them. (No QR had ever worked on a second device,
   so nothing that used to work stops working.)

   The real fix for machines the office ADDS later is Supabase — a machine created on the
   office PC does not exist on the customer's phone at all, whatever its token. See
   supabase/README.md. */
(function(){
 'use strict';
 if(typeof machines==='undefined')return;

 function stableToken(m){
  var id=String(m&&m.id||'').trim();
  return id?'QR-'+id:'';
 }
 /* PRODUCTION: the token is the secret in the printed QR, and 'QR-<id>' is guessable — on the
    server anyone could open any machine by counting. There every machine carries a random
    token (the database seed made them; database/02-security.sql refuses anything under 16
    characters), so nothing is derived: a machine the office adds gets a fresh random one, and
    a token that already exists is never touched, because it is already printed on a label. */
 var PROD=!!(window.IMODE_ENV&&window.IMODE_ENV.production);
 function randomToken(){
  var b=new Uint8Array(16);
  (window.crypto||window.msCrypto).getRandomValues(b);
  var hex='';for(var i=0;i<b.length;i++)hex+=('0'+b[i].toString(16)).slice(-2);
  return 'Q'+hex;
 }
 if(PROD)window.imodeNewQrToken=randomToken;
 function applyStableTokens(){
  var changed=false;
  if(PROD){
   try{machines.forEach(function(m){if(!m.qrToken||String(m.qrToken).length<16){m.qrToken=randomToken();changed=true}})}catch(e){return false}
   if(changed&&typeof saveLocal==='function')saveLocal();
   return changed;
  }
  try{
   machines.forEach(function(m){
    var want=stableToken(m);
    if(want&&m.qrToken!==want){m.qrToken=want;changed=true}
   });
  }catch(e){return false}
  if(changed&&typeof saveLocal==='function')saveLocal();
  return changed;
 }
 window.imodeApplyStableQrTokens=applyStableTokens;

 /* ensureMasters() runs on every renderAll() and is where the random token was minted, so
    the normalisation is hung off the same call — a machine added on the Machines page gets
    a stable token the moment it is saved. */
 var baseEnsure=window.ensureMasters;
 if(typeof baseEnsure==='function'){
  window.ensureMasters=function(){
   /* production: mint before js/03's ensureMasters, which would otherwise hand a new machine
      its own weaker 'QR-'+uid() token first */
   if(PROD)applyStableTokens();
   var r=baseEnsure.apply(this,arguments);
   applyStableTokens();
   return r;
  };
 }
 applyStableTokens();

 /* ---------- the URL a LINE rich menu can point at ----------
    initPortalFromUrl() in js/03 understands ?machineToken= and #/customer-portal, both of
    which need a machine already chosen. The rich-menu link needs the page BEFORE that —
    the one that asks for a QR scan or a serial — and there was no URL for it at all.

      #/customer-entry            ask for the QR / serial
      ?page=customer-entry        the same, for menus that dislike fragments
      ?serial=<serial>            skip the asking and open that machine's Home page

    js/11's bootRoute() sends a visitor with no session to the staff login door, so this
    runs on DOMContentLoaded after it (js/21 registers its listener later than js/11) and
    routes back. */
 function wantsEntry(){
  try{
   if(/#\/(customer-entry|scan)/.test(location.hash))return true;
   var p=new URLSearchParams(location.search).get('page');
   return p==='customer-entry'||p==='scan';
  }catch(e){return false}
 }
 function urlSerial(){
  try{
   var v=new URLSearchParams(location.search).get('serial');
   return v?String(v).trim():'';
  }catch(e){return ''}
 }

 function route(){
  try{
   /* A machine QR wins: that visitor has already told us which machine. */
   if(new URLSearchParams(location.search).get('machineToken'))return;

   var serial=urlSerial();
   if(serial&&typeof window.imodeFindCustomerMachine==='function'){
    var m=window.imodeFindCustomerMachine(serial);
    if(m&&typeof window.imodeOpenMachinePortal==='function'){
     window.imodeOpenMachinePortal(m);
     if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease();
     return;
    }
    /* production customer address: the machine is fetched from the server (js/125) */
    if(!m&&typeof window.imodePortalRemote==='function'){
     if(typeof window.goPage==='function')window.goPage('customer-entry');
     window.imodePortalRemote(serial,'serial');
     if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease();
     return;
    }
   }
   if(!wantsEntry()&&!serial)return;

   if(typeof window.goPage==='function')window.goPage('customer-entry');
   /* A serial that matched nothing lands on the entry page with the box filled in, so the
      visitor can see what was tried instead of an empty form. */
   if(serial){
    var input=document.getElementById('centrySerial');
    if(input)input.value=serial;
   }
   if(typeof window.imodeQrBootRelease==='function')window.imodeQrBootRelease();
  }catch(e){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',route,{once:true});
 else route();
})();
