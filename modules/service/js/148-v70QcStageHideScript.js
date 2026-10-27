/* js/148-v70QcStageHideScript.js — 2026-10-27
   A machine that QC & R&D has received but not handed to a customer yet stays off เครื่องจักร.

   WHERE THE FLAG LIVES. machines.lifecycle, added by modules/qc-rnd/supabase/02-qc-core.sql:
   'qc' while it is being inspected, 'ready' once its QC passed, 'delivered' after QC hands it to
   a customer (qc_handover()). Older machines have no value and are shown as before.

   WHY ONLY THE LIST. The rows stay in the `machines` array so every sync, merge and outbox
   path (js/41, js/71, js/110) still sees them and nothing is deleted or re-pushed. Only
   renderMachines() looks at a subset, the same way js/142 does for its tabs. Loaded after
   js/142 and js/147, so this wrapper runs first and their tab counts leave these machines out. */
(function(){
 'use strict';
 function inQc(m){var s=m&&m.lifecycle;return s==='qc'||s==='ready'}
 window.imodeMachineInQc=inQc;
 var base=window.renderMachines;
 if(typeof base!=='function')return;
 window.renderMachines=function(){
  var full;try{full=Array.isArray(machines)?machines:null}catch(e){full=null}
  if(!full||!full.some(inQc))return base.apply(this,arguments);
  machines=full.filter(function(m){return !inQc(m)});
  try{return base.apply(this,arguments)}
  finally{machines=full}
 };
})();
