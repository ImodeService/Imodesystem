/* V6.9 LINE add-friend QR beside the machine QR.
   The machine QR opens that machine's service page; this one adds the I-MODE Service
   Official Account, which is now the way a customer reaches the app at all. Both are
   drawn with the same QRCode library already loaded for the machine label, in LINE green
   so the two codes are never confused. */
(function(){
 'use strict';
 var LINE_ID='@imodeservice';

 function cfg(){
  try{
   settings.lineConfig=settings.lineConfig||{};
   return settings.lineConfig;
  }catch(e){return {}}
 }
 /* Fill the Official Account in once, so the portal exit and the "ติดต่อ Service" button
    have somewhere to go too. An id already configured is never overwritten. */
 function ensureConfig(){
  var c=cfg();
  var changed=false;
  if(!String(c.officialAccountId||'').trim()){c.officialAccountId=LINE_ID;changed=true}
  if(!String(c.addFriendUrl||'').trim()){c.addFriendUrl=addUrl();changed=true}
  if(changed&&typeof saveLocal==='function')saveLocal();
 }
 function oaId(){
  var id=String(cfg().officialAccountId||LINE_ID).trim();
  return id.charAt(0)==='@'?id:'@'+id;
 }
 function addUrl(){
  var c=cfg(),custom=String(c.addFriendUrl||'').trim();
  if(custom)return custom;
  return 'https://line.me/R/ti/p/'+encodeURIComponent(oaId());
 }
 window.imodeLineAddFriendUrl=addUrl;

 /* documentLogoUrl() is a const inside the v671 IIFE and never reaches window, so this
    always has to build the URL itself. It must be absolute: a print sheet is written into
    a window.open('') document whose base URL is about:blank, where './assets/…' resolves
    to nothing and the logo silently comes out broken. */
 function logoUrl(){
  var rel='./assets/imode-document-logo.webp';
  try{if(typeof documentLogoUrl==='function')return documentLogoUrl()}catch(e){}
  try{return new URL(rel,location.href).href}catch(e){return rel}
 }

 function drawLineQR(nodeId){
  var node=document.getElementById(nodeId);
  if(!node)return;
  node.innerHTML='';
  if(typeof QRCode==='undefined'){
   node.innerHTML='<div class="line-qr-fallback">'+addUrl()+'</div>';
   return;
  }
  new QRCode(node,{text:addUrl(),width:190,height:190,colorDark:'#06c755',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
 }
 window.imodeDrawLineQR=drawLineQR;

 function lineCardHTML(){
  return '<div>'
   +'<div class="v671-qr-label-card line-qr-card">'
   +'<div class="line-qr-brand">LINE</div>'
   +'<div id="lineAddFriendQR" class="qr-box"></div>'
   +'<div class="v671-qr-label-title">เพิ่มเพื่อนเพื่อรับบริการ</div>'
   +'<div class="v671-qr-label-sub">แจ้งงาน · ติดตามสถานะ · ติดต่อทีม Service</div>'
   +'<b>'+(typeof esc==='function'?esc(oaId()):oaId())+'</b>'
   +'<div class="v671-qr-label-sub">I-MODE Plus Service Official Account</div>'
   +'</div>'
   +'<div class="button-row" style="justify-content:center;margin-top:10px">'
   +'<button type="button" class="soft-btn" onclick="imodePrintLineQR()">🖨 พิมพ์ QR LINE</button>'
   +'</div></div>';
 }

 function bothRowHTML(){
  return '<div class="button-row line-qr-both-row">'
   +'<button type="button" class="primary-btn action-3d-orange" onclick="imodePrintBothQR()">'
   +'🖨 พิมพ์ QR ทั้งสอง (กระดาษแผ่นเดียว / PDF)</button>'
   +'</div>';
 }

 /* The machine QR popup gains the LINE card next to it. */
 var baseOpen=window.openMachineQR;
 var lastMid='';
 if(typeof baseOpen==='function'){
  window.openMachineQR=function(mid){
   lastMid=mid||lastMid;
   var r=baseOpen.apply(this,arguments);
   var wrap=document.querySelector('.v671-qr-wrap');
   if(wrap&&!document.getElementById('lineAddFriendQR')){
    wrap.classList.add('has-line-qr');
    var holder=document.createElement('div');
    holder.innerHTML=lineCardHTML();
    var card=holder.firstChild;
    wrap.insertBefore(card,wrap.children[1]||null);
    setTimeout(function(){drawLineQR('lineAddFriendQR')},70);
   }
   /* One sheet with both codes, appended across the whole grid so it reads as an action
      for the pair rather than for either card. */
   if(wrap&&!wrap.querySelector('.line-qr-both-row')){
    var row=document.createElement('div');
    row.innerHTML=bothRowHTML();
    wrap.appendChild(row.firstChild);
   }
   return r;
  };
 }


 /* Both codes on one sheet.
    The two images are lifted from the <canvas> elements the popup has already drawn
    instead of being generated again in the print window: the sheet then needs no CDN,
    prints exactly what is on screen, and cannot end up with one code missing because a
    library load lost a race. */
 function qrImage(nodeId){
  var n=document.getElementById(nodeId);
  if(!n)return '';
  var c=n.querySelector('canvas');
  if(c){try{return c.toDataURL('image/png')}catch(err){}}
  var i=n.querySelector('img');
  return i&&i.src?i.src:'';
 }

 window.imodePrintBothQR=function(mid){
  var machineImg=qrImage('machineQRCode'),lineImg=qrImage('lineAddFriendQR');
  if(!machineImg||!lineImg){
   if(typeof toastMsg==='function')toastMsg('QR ยังสร้างไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่');
   return;
  }
  var id=mid||lastMid;
  var m=null;
  try{if(typeof machineById==='function')m=machineById(id)}catch(err){}
  var e=(typeof esc==='function')?esc:function(v){return String(v==null?'':v)};
  var logo=logoUrl();
  var name=(m&&typeof machinePrimaryName==='function'&&machinePrimaryName(m))||(m&&m.name)||'-';
  var model=(m&&m.model)||'-',serial=(m&&m.serial)||'-';

  var w=window.open('','_blank','width=920,height=1040');
  if(!w){if(typeof toastMsg==='function')toastMsg('Browser บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up');return}
  w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8">'
   +'<title>QR Service + LINE OA - '+e(serial)+'</title><style>'
   +'@page{size:A4;margin:12mm}'
   +'*{box-sizing:border-box}'
   +'body{font-family:Arial,"Noto Sans Thai",sans-serif;color:#17233c;text-align:center;margin:0}'
   +'.head{margin-bottom:8mm}'
   +'.head img{width:52mm;height:20mm;object-fit:contain}'
   +'.head h1{font-size:16pt;margin:3mm 0 1mm;color:#173f8a}'
   +'.head p{font-size:10pt;margin:0;color:#52627d}'
   +'.sheet{display:flex;gap:8mm;justify-content:center;align-items:stretch;page-break-inside:avoid}'
   +'.label{width:80mm;border:2px solid #173f8a;border-radius:6mm;padding:6mm 5mm;background:#fff;'
   +'display:flex;flex-direction:column;align-items:center;justify-content:flex-start}'
   +'.label.line{border-color:#06c755}'
   +'.brand{font-size:15pt;font-weight:800;color:#173f8a;letter-spacing:1px;margin-bottom:2mm}'
   +'.label.line .brand{color:#06c755;font-size:18pt;letter-spacing:3px}'
   +'.qr{width:52mm;height:52mm;margin:3mm 0}'
   +'.title{font-size:12pt;font-weight:800;color:#173f8a}'
   +'.label.line .title{color:#0b7a41}'
   +'.small{font-size:8.5pt;line-height:1.5;color:#52627d}'
   +'.strong{font-size:11pt;font-weight:800;margin-top:2mm}'
   +'.foot{margin-top:8mm;font-size:8.5pt;color:#52627d}'
   +'</style></head><body>'
   +'<div class="head"><img src="'+logo+'" alt="I-MODE">'
   +'<h1>'+e(name)+'</h1>'
   +'<p>'+e(model)+' · S/N '+e(serial)+'</p></div>'
   +'<div class="sheet">'
   +'<div class="label"><div class="brand">SERVICE QR</div>'
   +'<img class="qr" src="'+machineImg+'" alt="Machine QR">'
   +'<div class="title">สแกนเพื่อรับบริการ</div>'
   +'<div class="small">แจ้งปัญหา · ตรวจสอบ Warranty · ประวัติ Service · คู่มือเครื่อง</div>'
   +'<div class="strong">'+e(name)+'</div>'
   +'<div class="small">'+e(model)+' · S/N '+e(serial)+'</div></div>'
   +'<div class="label line"><div class="brand">LINE</div>'
   +'<img class="qr" src="'+lineImg+'" alt="LINE add friend QR">'
   +'<div class="title">เพิ่มเพื่อนเพื่อรับบริการ</div>'
   +'<div class="small">แจ้งงาน · ติดตามสถานะ · ติดต่อทีม Service</div>'
   +'<div class="strong">'+e(oaId())+'</div>'
   +'<div class="small">I-MODE Plus Service Official Account</div></div>'
   +'</div>'
   +'<div class="foot">บริษัท ไอโมด พลัส จำกัด • I-MODE Plus Service &amp; Maintenance</div>'
   +'</body></html>');
  w.document.close();
  /* The logo is the only image that still has to load; the codes are data URLs. */
  try{w.onload=function(){setTimeout(function(){w.focus();w.print()},400)}}catch(err){}
 };

 window.imodePrintLineQR=function(){
  var w=window.open('','_blank','width=650,height=780');
  if(!w){if(typeof toastMsg==='function')toastMsg('Browser บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up');return}
  var logo=logoUrl();
  var url=addUrl();
  /* oaId() and addUrl() come from settings.lineConfig, which any staff role can write: escape the
     id for HTML, and keep the URL from closing the inline <script> (</script> -> <\/script>). */
  var e=(typeof esc==='function')?esc:function(v){return String(v==null?'':v)};
  var urlJs=JSON.stringify(String(url==null?'':url)).replace(/</g,'\\u003c');
  w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>LINE OA '+e(oaId())+'</title>'
   +'<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></scr'+'ipt>'
   +'<style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}'
   +'.label{width:340px;margin:auto;border:2px solid #06c755;border-radius:20px;padding:18px}'
   +'.logo{width:180px;height:70px;object-fit:contain}'
   +'.brand{font-size:26px;font-weight:800;color:#06c755;letter-spacing:2px;margin:6px 0}'
   +'#q{display:flex;justify-content:center;margin:12px}'
   +'.title{font-size:18px;font-weight:bold;color:#0b2f8f}'
   +'.small{font-size:12px;line-height:1.5;color:#333}'
   +'.id{margin:8px 0;font-weight:bold;font-size:16px}</style></head><body>'
   +'<div class="label"><img class="logo" src="'+logo+'"><div class="brand">LINE</div>'
   +'<div class="title">เพิ่มเพื่อนเพื่อรับบริการ</div>'
   +'<div class="small">แจ้งงาน • ติดตามสถานะ • ติดต่อทีม Service</div>'
   +'<div id="q"></div><div class="id">'+e(oaId())+'</div>'
   +'<div class="small">I-MODE Plus Service &amp; Maintenance</div></div>'
   +'<scr'+'ipt>window.onload=function(){new QRCode(document.getElementById("q"),{text:'+urlJs
   +',width:210,height:210,colorDark:"#06c755"});setTimeout(function(){window.print()},600)}</scr'+'ipt>'
   +'</body></html>');
  w.document.close();
 };

 var st=document.createElement('style');
 st.id='v69LineQrStyle';
 st.textContent=''
 +'.v671-qr-wrap.has-line-qr{display:grid;grid-template-columns:repeat(2,minmax(210px,260px)) minmax(240px,1fr);gap:16px;align-items:start}'
 +'.line-qr-card{border-color:#9fe7bf!important}'
 +'.line-qr-brand{font-size:24px;font-weight:800;letter-spacing:2px;color:#06c755;margin-bottom:6px}'
 +'.line-qr-fallback{font-size:11px;word-break:break-all;padding:16px;text-align:center}'
 +'.line-qr-both-row{grid-column:1/-1;justify-content:center;margin-top:2px}'
 +'@media (max-width:900px){.v671-qr-wrap.has-line-qr{grid-template-columns:1fr}}';
 document.head.appendChild(st);

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureConfig,{once:true});
 else ensureConfig();
})();
