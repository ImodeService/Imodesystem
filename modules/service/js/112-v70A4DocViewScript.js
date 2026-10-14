/* Beta 1.0 — 2026-09-24: a document you open to look at is an A4 page, at every width.

   REPORTED: "แบบฟอร์มอะผมอยากให้เวลากดดูให้มันเป็น A4 เสมอ ... เวลากดดูในมือถือขนาดมันเพี้ยน".

   MEASURED FIRST, at a 390px viewport, where A4 at 96dpi is 794px:

     ใบตรวจ / Service Report   paper 346px wide, its own content 882px  -> CUT OFF
     เอกสาร QC                  paper 346px, min-height:auto             -> not A4 at all
     ใบเสนอราคา                  fluid, never A4 on screen

   The papers were only ever A4 in the print window. On screen they were fluid, so on a phone
   a six-column table and a three-cell signature row were squeezed into 346px, and the service
   report was simply clipped — css/05 even sets `.qc-a4{width:min(100%,210mm)!important}`,
   which is what un-A4s the QC document below 794px.

   THE DECISION, the owner's: the page stays A4 and is SCALED DOWN to fit the screen, so what
   is on screen is what will come out of the printer, whole, at any width. A พอดีจอ / 100%
   toggle is there for reading the small print, and at 100% the page scrolls rather than
   reflowing.

   WHY A TRANSFORM AND NOT A MEDIA QUERY. Reflowing a document is what was wrong before: the
   layout stops matching the paper, so nobody can tell from the screen what will print.
   transform:scale() keeps one layout — the A4 one — and only changes how big it looks.

   WHY THE PRINT PATH IS NOT AFFECTED. Every print function does
   `window.open` + `doc.outerHTML` of the paper root and writes its own CSS
   (printQuotation, printServiceReport, printQcCurrent). The A4 width here is applied through
   a CLASS in the stylesheet below, never an inline style, so the outerHTML that travels into
   the print window carries a class name that document has never heard of. Adding the width
   inline would have followed it in and broken the printed sheet — checked, not assumed.

   The wrapper is inserted AROUND the paper, so it is outside outerHTML too. */
(function(){
 'use strict';

 /* Every paper root in the project. Each one is the element a print function takes the
    outerHTML of, which is exactly the definition of "the document" here. */
 var PAPERS=[
  '#quotePreviewDoc',         /* ใบเสนอราคา — quotationDocHTML (js/03) */
  '#serviceReportPrint',      /* ใบตรวจ / Service Report — serviceReportHTML (js/03) */
  '#qcPrintDoc',              /* เอกสาร QC สองหน้า — qcDocHTML (js/03, js/04, js/05, js/07) */
  '#salesQuotePrintDoc',      /* ใบเสนอราคาขาย — salesQuoteDocHTML (js/03) */
  '#warrantyCertificateDoc'   /* ใบรับประกัน — js/03 */
 ];
 var A4_MM=210, MM_PX=96/25.4;                 /* CSS defines 1mm as exactly 96/25.4 px */
 var A4_PX=A4_MM*MM_PX;                        /* 793.7 */
 var FIT_KEY='imode_v70_a4_zoom';              /* 'fit' | 'full', per device */

 /* ------------------------------------------------------------------ the styles ---- */
 /* Injected at runtime rather than added as a stylesheet, because css/21 and css/23 have to
    stay the last two <link> tags (CLAUDE.md). Same pattern as js/10, js/16 and js/53. */
 function style(){
  if(document.getElementById('imodeA4Style'))return;
  var s=document.createElement('style');
  s.id='imodeA4Style';
  s.textContent=[
   /* The paper. !important because css/05 sets .qc-a4{width:min(100%,210mm)!important},
      which is the rule that stopped the QC document being A4 on a phone. */
   '.imode-a4-page{width:'+A4_MM+'mm!important;max-width:none!important;'
    +'min-height:297mm;box-sizing:border-box;margin:0!important;'
    +'background:#fff;box-shadow:0 10px 30px rgba(16,42,107,.13)}',
   /* css/01 line 21 sets `table{width:100%;min-width:860px}` on EVERY table in the app, so
      that the data tables stay readable inside .table-wrap{overflow:auto} on a phone. That is
      right for a data table and impossible inside a document: an A4 page is 794px wide, so a
      860px table can never fit and ~88px of every quotation and every ใบตรวจ was being cut
      off the right-hand edge — measured, both at 882px of content in a 794px page. Reset only
      inside the paper, so the application's own tables are untouched. .wide-table's 1160px is
      covered by the same selector, which outranks both without !important. */
   '.imode-a4-page table{min-width:0}',
   '.imode-a4-page img,.imode-a4-page canvas,.imode-a4-page svg{max-width:100%}',
   /* The window the paper is looked at through. It owns the height, because a scaled element
      still takes its unscaled space in the flow and would leave a tall gap underneath. */
   '.imode-a4-fit{position:relative;overflow:hidden;margin:0 0 10px}',
   '.imode-a4-fit.is-full{overflow:auto;-webkit-overflow-scrolling:touch}',
   '.imode-a4-stage{transform-origin:top left;will-change:transform}',
   /* The toggle. Small, and out of the way of the document itself. */
   '.imode-a4-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
    +'margin:0 0 9px;font-size:11px;color:#5a6b86}',
   '.imode-a4-bar .imode-a4-size{font-weight:700;color:#274a8c}',
   '.imode-a4-bar button{border:1px solid #ccd8ea;background:#fff;color:#274a8c;'
    +'border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;'
    +'min-height:32px}',
   '.imode-a4-bar button[aria-pressed="true"]{background:#1d55c9;border-color:#1d55c9;color:#fff}',
   '@media (prefers-reduced-motion: reduce){.imode-a4-stage{will-change:auto}}'
  ].join('');
  document.head.appendChild(s);
 }

 function zoom(){
  try{return localStorage.getItem(FIT_KEY)==='full'?'full':'fit'}catch(e){return 'fit'}
 }
 function setZoom(v){
  try{localStorage.setItem(FIT_KEY,v)}catch(e){}
 }

 /* ------------------------------------------------------------------ the fitting ---- */
 function measure(fit){
  var stage=fit.firstElementChild;
  if(!stage)return;
  var paper=stage.firstElementChild;
  if(!paper)return;
  var full=zoom()==='full';
  fit.classList.toggle('is-full',full);
  /* The available width is the window's own content box, so the padding of whatever holds
     it is already accounted for. */
  var avail=fit.clientWidth||fit.getBoundingClientRect().width;
  var paperW=paper.offsetWidth||A4_PX;
  var scale=full?1:Math.min(1,avail/paperW);
  if(!isFinite(scale)||scale<=0)scale=1;
  stage.style.transform='scale('+scale+')';
  /* offsetHeight is the UNSCALED height; the window has to reserve the scaled one or the
     popup ends with a large empty area below the page. */
  var h=paper.offsetHeight*scale;
  fit.style.height=full?'':Math.max(40,Math.round(h))+'px';
  var bar=fit.previousElementSibling;
  if(bar&&bar.classList.contains('imode-a4-bar')){
   var pct=Math.round(scale*100);
   var label=bar.querySelector('.imode-a4-size');
   if(label)label.textContent='A4 · 210 × 297 mm · '+pct+'%';
   var bFit=bar.querySelector('[data-a4="fit"]'),bFull=bar.querySelector('[data-a4="full"]');
   if(bFit)bFit.setAttribute('aria-pressed',String(!full));
   if(bFull)bFull.setAttribute('aria-pressed',String(full));
  }
 }

 function fitAll(){
  var list=document.querySelectorAll('.imode-a4-fit');
  for(var i=0;i<list.length;i++)measure(list[i]);
 }
 window.imodeA4Fit=fitAll;

 function bar(){
  var b=document.createElement('div');
  b.className='imode-a4-bar';
  /* A role name is data, not a UI label, and applyLanguageTo() walks every text node on a
     setTimeout after openModal — the same trap that translated a role name onto a tab in
     part 13. This bar is ours and must not be rewritten. */
  b.setAttribute('data-no-i18n','true');
  b.innerHTML='<span class="imode-a4-size">A4 · 210 × 297 mm</span>'
   +'<button type="button" data-a4="fit" aria-pressed="true">พอดีจอ</button>'
   +'<button type="button" data-a4="full" aria-pressed="false">100%</button>';
  return b;
 }

 function wrap(paper){
  if(!paper||!paper.parentNode)return null;
  var already=paper.closest('.imode-a4-stage');
  if(already)return already.parentNode;          /* a restored snapshot: already wrapped */
  paper.classList.add('imode-a4-page');
  var fit=document.createElement('div');
  fit.className='imode-a4-fit';
  var stage=document.createElement('div');
  stage.className='imode-a4-stage';
  paper.parentNode.insertBefore(fit,paper);
  fit.parentNode.insertBefore(bar(),fit);
  stage.appendChild(paper);
  fit.appendChild(stage);
  return fit;
 }

 /* A document's height changes after it is wrapped: the logo and the photographs load a
    moment later. One observer per window, disconnected with it. */
 function watch(fit){
  if(!window.ResizeObserver)return;
  var stage=fit.firstElementChild;
  if(!stage||stage.__a4Watched)return;
  stage.__a4Watched=true;
  var ro=new ResizeObserver(function(){
   /* Reading offsetHeight inside the callback and writing the wrapper's height is a write
      after a read on a DIFFERENT element, so it cannot loop on itself. */
   measure(fit);
  });
  ro.observe(stage.firstElementChild||stage);
 }

 function apply(root){
  var scope=root||document;
  var n=0;
  for(var i=0;i<PAPERS.length;i++){
   var list=scope.querySelectorAll?scope.querySelectorAll(PAPERS[i]):[];
   for(var k=0;k<list.length;k++){
    var fit=wrap(list[k]);
    if(!fit)continue;
    n++;
    measure(fit);
    watch(fit);
    /* Images move the height; measure again when each one lands. */
    var imgs=list[k].querySelectorAll('img');
    for(var j=0;j<imgs.length;j++){
     if(imgs[j].complete)continue;
     imgs[j].addEventListener('load',fitAll,{once:true});
     imgs[j].addEventListener('error',fitAll,{once:true});
    }
   }
  }
  return n;
 }
 window.imodeA4Apply=apply;

 /* ------------------------------------------------------------------ the wiring ---- */
 /* openModal() is the one funnel every on-screen document goes through — previewQuotation,
    previewServiceReportRecord, openQcPreviewRecord, the sales quote, the warranty
    certificate, and js/43's and js/56's quotation popups. It is a top-level function
    declaration in js/03 and therefore a window property, so replacing it changes what those
    callers' bare openModal(...) resolves to.

    This file loads last, so this wrapper is outside js/29's modal-history one: its snapshot
    of the OUTGOING popup is taken before ours runs, and a restored snapshot comes back
    already wrapped, which wrap() detects. */
 var baseOpen=window.openModal;
 if(typeof baseOpen==='function'){
  window.openModal=function(){
   var r=baseOpen.apply(this,arguments);
   try{
    style();
    var body=document.getElementById('modalBody');
    if(body&&apply(body)){
     /* The popup lays out over the next frame; measuring before that gives the old width. */
     requestAnimationFrame(function(){fitAll();
      requestAnimationFrame(fitAll);
     });
    }
   }catch(e){}
   return r;
  };
 }

 /* The toggle. #modalPanel calls stopPropagation() on click (js/05, the
    ต้องกดกากบาทเท่านั้น guard), so a listener on `document` never fires inside a popup —
    recorded in js/16 and walked into again in part 26. It goes on #modalBody. */
 function onClick(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-a4]'):null;
  if(!b)return;
  setZoom(b.getAttribute('data-a4')==='full'?'full':'fit');
  fitAll();
 }
 function install(){
  style();
  var body=document.getElementById('modalBody');
  if(body&&!body.__a4Click){body.__a4Click=true;body.addEventListener('click',onClick)}
  /* 2026-09-24 — and on the document, for a paper drawn into the page itself (the customer
     portal's quotation). Without it พอดีจอ / 100% did nothing there. A click inside a popup
     never reaches the document (js/05 stops it at #modalPanel), so it is never handled twice. */
  if(!document.__a4Click){document.__a4Click=true;document.addEventListener('click',onClick)}
  /* A document can also be drawn straight into the page rather than a popup (the portal's
     quotation view). The same treatment, once the page has settled. */
  apply(document);
  fitAll();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
 else install();

 window.addEventListener('resize',function(){clearTimeout(window.__a4T);
  window.__a4T=setTimeout(fitAll,120)});
 window.addEventListener('orientationchange',function(){setTimeout(fitAll,260)});
})();
