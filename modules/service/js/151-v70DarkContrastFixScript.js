/* 2026-10-29 — โหมดมืด: พื้นสว่างที่หลุดมา ตัวอักษรอ่านไม่ออก

   css/24 บังคับสีตัวอักษรในหน้า/ป๊อปอัปเป็นสีสว่างของธีมมืด แต่การ์ด แท็บ และช่องกรอกจำนวนมาก
   (เช่น ผู้ใช้งานและสิทธิ์) ยังมีพื้นขาวหรือฟ้าอ่อนจาก css/01 ทำให้ตัวอักษรกลืนกับพื้น
   แทนที่จะไล่แก้ทีละคลาส ไฟล์นี้ตรวจพื้นหลังจริงของแต่ละองค์ประกอบใน .main และ .modal-panel
   เฉพาะตอน data-ui="flat-dark" และใส่คลาส fx-dark-fix ให้เฉพาะตัวที่พื้นสว่างจัด
   (เอกสารสำหรับพิมพ์ เช่น ใบเสนอราคา ใบตรวจงาน ไม่ถูกแตะ)
   ลบไฟล์นี้แล้วทุกอย่างกลับเป็นเหมือนเดิม */
(function(){
 'use strict';
 var SKIP='#quotePreviewDoc,#serviceReportPrint,#qcPrintDoc,#salesQuotePrintDoc,#warrantyCertificateDoc,.imode-a4-page';
 var CLS='fx-dark-fix';
 var timer=0;

 /* index.html sets data-ui; service-case-detail.html (a document of its own) only gets the
    platform's data-theme from shared/theme-pref.js, and has no .main / .modal-panel. */
 var root=document.documentElement;
 function isDark(){return root.getAttribute('data-ui')==='flat-dark'||root.getAttribute('data-theme')==='dark'}
 function scope(){return document.querySelector('.main,.modal-panel')?'.main *,.modal-panel *':'body *'}
 function lum(r,g,b){return (0.2126*r+0.7152*g+0.0722*b)/255}
 function parse(s){
  var m=/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/.exec(s||'');
  return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]==null?1:+m[4]}:null;
 }
 function lightBg(cs){
  var c=parse(cs.backgroundColor);
  if(c&&c.a>=0.6&&lum(c.r,c.g,c.b)>0.78)return true;
  var bi=cs.backgroundImage||'';
  if(bi.indexOf('gradient')>=0){
   var first=parse(bi.slice(bi.indexOf('rgb')));
   if(first&&first.a>=0.6&&lum(first.r,first.g,first.b)>0.78)return true;
  }
  return false;
 }
 function scan(root){
  if(!isDark())return;
  var list=root?[root].concat([].slice.call(root.querySelectorAll('*'))):document.querySelectorAll(scope());
  for(var i=0;i<list.length;i++){
   var el=list[i],tag=el.tagName;
   if(tag==='IMG'||tag==='SVG'||tag==='CANVAS'||tag==='VIDEO'||tag==='SCRIPT'||tag==='STYLE'||tag==='PATH')continue;
   if(el.closest(SKIP))continue;
   var on=lightBg(getComputedStyle(el));
   if(on&&!el.classList.contains(CLS))el.classList.add(CLS);
  }
 }
 var added=[],full=false;
 function later(muts){
  if(muts&&muts[0]&&muts[0].type==='childList'){
   muts.forEach(function(m){[].forEach.call(m.addedNodes,function(n){if(n.nodeType===1)added.push(n)})});
  }else full=true;
  /* no debounce: a MutationObserver callback runs before the next paint, so the light
     background is never drawn */
  var nodes=added;added=[];
  if(full){full=false;scan();return}
  nodes.forEach(function(n){if(n.isConnected&&(scope()==='body *'||n.closest('.main,.modal-panel')||n.querySelector('.main,.modal-panel')))scan(n)});
 }

 var st=document.createElement('style');
 st.id='v70DarkContrastFixStyle';

 /* :is(:root,#fx) matches css/24's own specificity, whose rules are !important too */
 st.textContent='html[data-ui="flat-dark"]:is(:root,#fx) .'+CLS+':not(img):not(svg),html[data-theme="dark"] .'+CLS+':not(img):not(svg){background-color:var(--fx-surface-2,#2e2e2e)!important;background-image:none!important;'
  +'border-color:var(--fx-line,#3a3a3a)!important;transition:none!important;color:var(--fx-text,#f1f1f1)!important}'
  +'html[data-ui="flat-dark"]:is(:root,#fx) .'+CLS+' small,html[data-theme="dark"] .'+CLS+' small{color:var(--fx-muted,#a9adb4)!important}';
 document.head.appendChild(st);

 function start(){
  scan();
  try{
   new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
   new MutationObserver(later).observe(document.documentElement,{attributes:true,attributeFilter:['data-ui','data-theme']});
  }catch(e){}
 }
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
