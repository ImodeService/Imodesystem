/* Beta Service focus — the row is the button.

   Every master list ended in a column of small buttons (ดู / แก้ไข / QR / QC / ลบ …).
   They are removed from the rows: the row itself opens the record, and the buttons that
   were in it are moved into the popup that opens.

   How it works, and why it is done this way rather than by editing the row templates:

   The templates live in js/03-app-core.js and are rebuilt with innerHTML on every render,
   from several places (renderAll, the shared pager, the machines pager, each page's own
   search box). Rewriting ten of them would mean touching the original application in ten
   places and keeping the permission-dependent buttons — the quotation button only exists
   when the role may quote — in step by hand. Instead each rendered row is read after the
   fact: the button whose onclick matches the list's "open" action becomes the row's
   activation, the rest are cloned into the popup, and the cell they lived in is hidden.
   Nothing is invented and nothing is lost, including buttons a later patch adds.

   A moved button is skipped when the popup already offers the same onclick, so the case
   popup does not end up with two แก้ไข buttons. */
(function(){
 'use strict';

 /* container -> the onclick that means "open this record". Everything else in the cell is
    an extra action and travels to the popup. */
 var LISTS=[
  /* `via` sends the row through a named global instead of re-running its own onclick.
     A case row opens the full-page workspace (v70CaseDetailLink), not the popup. */
  {sel:'#caseTable',            open:/^openCaseDetail\(/, via:'imodeOpenCase'},
  {sel:'#caseCards',            open:/^openCaseDetail\(/, via:'imodeOpenCase'},
  {sel:'#customerTable',        open:/^openCustomerDetail\(/},
  {sel:'#customerCards',        open:/^openCustomerDetail\(/},
  {sel:'#machineTable',         open:/^openMachineDetail\(/},
  {sel:'#machineCards',         open:/^openMachineDetail\(/},
  {sel:'#qcTable',              open:/^previewQc\(/},
  {sel:'#qcCards',              open:/^previewQc\(/},
  {sel:'#warrantyTable',        open:/^openWarrantyDetail\(/},
  {sel:'#warrantyCards',        open:/^openWarrantyDetail\(/},
  {sel:'#pettyTable',           open:/^openPettyCashPreview\(/},
  {sel:'#pettyCards',           open:/^openPettyCashPreview\(/},
  {sel:'#machineDocumentTable', open:/^openMachineDocumentModal\(/},
  {sel:'#machineDocumentCards', open:/^openMachineDocumentModal\(/},
  {sel:'#sparePartTable',       open:/^openSparePartModal\(/},
  {sel:'#sparePartCards',       open:/^openSparePartModal\(/},
  {sel:'#quotationTable',       open:/^loadQuotation\(/},
  {sel:'#quotationCards',       open:/^loadQuotation\(/},
  {sel:'#serviceReportTable',   open:/^previewServiceReport\(/},
  {sel:'#serviceReportCards',   open:/^previewServiceReport\(/},
  {sel:'#purchaseOrderTable',   open:/^openPurchaseOrderModal\(/}
 ];
 var ROW='tr,.mobile-data-card';

 var pending=null;   /* buttons waiting to be put into the popup that is opening */

 function actionHost(row){
  if(row.matches('tr')){
   var cells=row.querySelectorAll(':scope > td');
   for(var i=cells.length-1;i>=0;i--){
    if(cells[i].querySelector('button'))return cells[i];
   }
   return null;
  }
  return row.querySelector('.card-actions');
 }

 function decorateList(cfg){
  var host=document.querySelector(cfg.sel);
  if(!host)return;
  host.querySelectorAll(ROW).forEach(function(row){
   if(row.dataset.v70row==='1')return;
   var cell=actionHost(row);
   if(!cell)return;                                   /* empty-state row */
   var buttons=[].slice.call(cell.querySelectorAll('button'));
   if(!buttons.length)return;
   var openAttr='',extras=[];
   buttons.forEach(function(btn){
    var on=(btn.getAttribute('onclick')||'').trim();
    if(!openAttr&&cfg.open.test(on)){openAttr=on;return}
    extras.push(btn.cloneNode(true));
   });
   /* No open action in this row (a later patch changed the buttons): fall back to the
      first one so the row still does something rather than becoming dead. */
   if(!openAttr&&buttons.length){
    openAttr=(buttons[0].getAttribute('onclick')||'').trim();
    extras.shift();
   }
   if(!openAttr)return;

   row.dataset.v70row='1';
   row._v70extras=extras;
   row._v70open=openAttr;
   row._v70via=cfg.via||'';
   cell.classList.add('v70-actions-hidden');
   markHeader(host,cell);
   row.classList.add('v70-clickable');
   if(!row.hasAttribute('tabindex'))row.setAttribute('tabindex','0');
   if(!row.hasAttribute('role')&&row.matches('tr'))row.setAttribute('role','button');
   row.addEventListener('click',activate);
   row.addEventListener('keydown',activate);
  });
 }

 /* The header cell of the column that is now empty. Only the <tbody> is rewritten by the
    render functions, so marking the <th> once is enough and it survives every re-render. */
 function markHeader(host,cell){
  var table=host.closest?host.closest('table'):null;
  if(!table)return;
  var head=table.querySelector('thead tr');
  if(!head)return;
  var th=head.children[cell.cellIndex];
  if(th)th.classList.add('v70-actions-hidden');
 }

 function activate(e){
  var row=e.currentTarget;
  if(e.type==='keydown'){
   if(e.target!==row||['Enter',' '].indexOf(e.key)<0)return;
   e.preventDefault();
  }else if(e.target.closest('button,a,input,select,textarea,label')){
   return;                                           /* a real control inside the row wins */
  }
  run(row);
 }

 function run(row){
  pending=row._v70extras&&row._v70extras.length?row._v70extras:null;
  try{
   var via=row._v70via&&window[row._v70via];
   if(typeof via==='function'){
    /* The id the row's own onclick carries: openCaseDetail('SRV-…'). */
    var m=/\(\s*'([^']*)'/.exec(row._v70open);
    via(m?m[1]:'');
   }else{
    /* The row's own inline handler, run as written. These strings come from this
       application's own row templates, never from stored data. */
    (new Function(row._v70open)).call(row);
   }
  }catch(err){pending=null;return}
  if(pending){
   requestAnimationFrame(placeExtras);
   setTimeout(placeExtras,140);
  }
 }

 /* Put the moved buttons at the bottom of whatever popup just opened, skipping any the
    popup already offers. */
 function placeExtras(){
  if(!pending)return;
  var modal=document.getElementById('modal'),body=document.getElementById('modalBody');
  if(!modal||!body||!modal.classList.contains('open'))return;
  if(body.querySelector('.v70-moved-actions'))return;
  var already={};
  body.querySelectorAll('button[onclick]').forEach(function(b){
   already[(b.getAttribute('onclick')||'').trim()]=true;
  });
  var add=pending.filter(function(b){return !already[(b.getAttribute('onclick')||'').trim()]});
  pending=null;
  if(!add.length)return;
  var wrap=document.createElement('div');
  wrap.className='v70-moved-actions';
  add.forEach(function(b){
   b.classList.remove('mini-btn');
   if(!b.classList.contains('primary-btn'))b.classList.add('soft-btn');
   wrap.appendChild(b);
  });
  body.appendChild(wrap);
 }

 function decorate(){LISTS.forEach(decorateList)}
 window.imodeDecorateRows=decorate;

 /* Every path that rewrites one of these lists. The window function is wrapped, so a
    renderer a later patch already overrode is the one that gets wrapped. */
 ['renderAll','renderCases','renderCustomers','renderMachines','renderQc','renderWarranties',
  'renderMachineDocuments','renderQuotations','renderServiceReports','renderPettyCash',
  'renderSpareParts','renderPurchaseOrders','listPagerRerender'].forEach(function(fn){
  var base=window[fn];
  if(typeof base!=='function')return;
  window[fn]=function(){
   var r=base.apply(this,arguments);
   try{decorate()}catch(e){}
   return r;
  };
 });

 var style=document.createElement('style');
 style.id='v70RowClickStyle';
 style.textContent=''
 +'.v70-actions-hidden{display:none!important}'
 +'.v70-clickable{cursor:pointer}'
 +'tr.v70-clickable:hover>td{background:#f4f8ff}'
 +'tr.v70-clickable:focus-visible{outline:3px solid #0b63e5;outline-offset:-3px}'
 +'.mobile-data-card.v70-clickable:hover{border-color:#b9d2f4}'
 +'.mobile-data-card.v70-clickable:focus-visible{outline:3px solid #0b63e5;outline-offset:2px}'
 +'.v70-moved-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px;padding-top:14px;border-top:1px solid #e6eefb}';
 document.head.appendChild(style);

 function install(){try{decorate()}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
