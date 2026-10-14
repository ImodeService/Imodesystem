/* Beta 1.0 — one period filter, shared by ดูใบเสนอราคา and เงินสดย่อย.

   Asked for: a period filter by ปี / เดือน / สัปดาห์ whose totals follow it, with the owner
   choosing "pick year, month or week and step back with ‹ ›" over "this week / this month /
   this year only", so last month and last year can be looked at too.

   One control, two pages, so it is written once. A page registers a key and gets:
     imodePeriod.mount(key, hostId, defaultMode, rerender)  draw the control into hostId
     imodePeriod.contains(key, date)                         is this date inside the period?
     imodePeriod.label(key) / imodePeriod.sig(key)           text for headings / a cache key

   Dates. A bare 'YYYY-MM-DD' (petty cash stores that) is read as a LOCAL day: new Date() reads
   it as UTC midnight, which is 07:00 in Bangkok and would put an entry dated the 1st on the
   wrong side of a boundary on a device set to any timezone west of UTC. Weeks run Monday to
   Sunday. Years are labelled in the Buddhist era in Thai, as the rest of the app does. */
(function(){
 'use strict';
 function en(){try{return settings.language==='en'}catch(e){return false}}
 function tl(th,e){return en()?e:th}
 function esc2(v){try{return esc(v)}catch(e){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}}

 var MODES=[['all','ทั้งหมด','All'],['year','ปี','Year'],['month','เดือน','Month'],['week','สัปดาห์','Week']];
 var states={},renderers={};
 function today(){var d=new Date();d.setHours(0,0,0,0);return d}
 function st(key,def){
  if(!states[key])states[key]={mode:def||'all',anchor:today()};
  return states[key];
 }
 function toDate(v){
  if(!v)return null;
  if(v instanceof Date)return isNaN(v.getTime())?null:v;
  var s=String(v);
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  var d=new Date(s);
  return isNaN(d.getTime())?null:d;
 }
 function range(key){
  var s=st(key),a=s.anchor,from,to;
  if(s.mode==='year'){from=new Date(a.getFullYear(),0,1);to=new Date(a.getFullYear()+1,0,1)}
  else if(s.mode==='month'){from=new Date(a.getFullYear(),a.getMonth(),1);to=new Date(a.getFullYear(),a.getMonth()+1,1)}
  else if(s.mode==='week'){
   var back=(a.getDay()+6)%7;                     /* Monday = 0 */
   from=new Date(a.getFullYear(),a.getMonth(),a.getDate()-back);
   to=new Date(from.getFullYear(),from.getMonth(),from.getDate()+7);
  }else return null;
  return {from:from,to:to};
 }
 function contains(key,v){
  var r=range(key);
  if(!r)return true;
  var d=toDate(v);
  if(!d)return false;                              /* an undated record is outside every period */
  return d>=r.from&&d<r.to;
 }
 function yearText(y){return en()?String(y):String(y+543)}
 function dm(d){return d.toLocaleDateString(en()?'en-GB':'th-TH',{day:'numeric',month:'short'})}
 function label(key){
  var s=st(key),r=range(key);
  if(!r)return tl('ทุกช่วงเวลา','All time');
  if(s.mode==='year')return tl('ปี ','Year ')+yearText(r.from.getFullYear());
  if(s.mode==='month')return r.from.toLocaleDateString(en()?'en-GB':'th-TH',{month:'long'})+' '+yearText(r.from.getFullYear());
  var last=new Date(r.to.getFullYear(),r.to.getMonth(),r.to.getDate()-1);
  return dm(r.from)+' – '+dm(last)+' '+yearText(last.getFullYear());
 }
 function isNow(key){
  var r=range(key);
  if(!r)return true;
  var t=today();
  return t>=r.from&&t<r.to;
 }
 function sig(key){var s=st(key),r=range(key);return s.mode+'@'+(r?r.from.getTime():'')}
 function html(key){
  var s=st(key);
  return '<div class="imp" data-period="'+esc2(key)+'" role="group" aria-label="'+esc2(tl('ช่วงเวลา','Period'))+'">'
   +'<div class="imp-modes">'+MODES.map(function(m){
     var on=s.mode===m[0];
     return '<button type="button" class="imp-mode'+(on?' is-on':'')+'" aria-pressed="'+on+'"'
      +' onclick="imodePeriodSet('+imodeJsArg(key)+','+imodeJsArg(m[0])+')">'+esc2(tl(m[1],m[2]))+'</button>';
    }).join('')+'</div>'
   +(s.mode==='all'?'':'<div class="imp-step">'
     +'<button type="button" class="imp-arrow" onclick="imodePeriodStep('+imodeJsArg(key)+',-1)" aria-label="'+esc2(tl('ช่วงก่อนหน้า','Previous'))+'">‹</button>'
     +'<b class="imp-label">'+esc2(label(key))+'</b>'
     +'<button type="button" class="imp-arrow" onclick="imodePeriodStep('+imodeJsArg(key)+',1)" aria-label="'+esc2(tl('ช่วงถัดไป','Next'))+'">›</button>'
     +(isNow(key)?'':'<button type="button" class="imp-now" onclick="imodePeriodNow('+imodeJsArg(key)+')">'+esc2(tl('ปัจจุบัน','Now'))+'</button>')
     +'</div>')
   +'</div>';
 }
 function mount(key,hostId,defMode,rerender){
  st(key,defMode);
  if(typeof rerender==='function')renderers[key]=rerender;
  var host=document.getElementById(hostId);
  if(host)host.innerHTML=html(key);
 }
 function rerun(key){var fn=renderers[key];if(typeof fn==='function'){try{fn()}catch(e){}}}

 window.imodePeriodSet=function(key,mode){
  var s=st(key);
  s.mode=mode;
  s.anchor=today();                                /* a new kind of period starts at the current one */
  rerun(key);
 };
 window.imodePeriodStep=function(key,dir){
  var s=st(key),a=s.anchor;
  dir=dir<0?-1:1;
  if(s.mode==='year')s.anchor=new Date(a.getFullYear()+dir,a.getMonth(),1);
  else if(s.mode==='month')s.anchor=new Date(a.getFullYear(),a.getMonth()+dir,1);   /* 1st: no 31st overflow */
  else if(s.mode==='week')s.anchor=new Date(a.getFullYear(),a.getMonth(),a.getDate()+7*dir);
  rerun(key);
 };
 window.imodePeriodNow=function(key){st(key).anchor=today();rerun(key)};
 window.imodePeriod={mount:mount,html:html,contains:contains,label:label,range:range,sig:sig,state:st};

 var css=document.createElement('style');
 css.id='v70PeriodFilterStyle';
 css.textContent=''
 +'.imp{display:flex;flex-wrap:wrap;align-items:center;gap:8px}'
 +'.imp-modes{display:inline-flex;border:1px solid #d7e3f5;border-radius:999px;background:#fff;padding:3px;gap:2px}'
 +'.imp-mode{border:0;background:transparent;border-radius:999px;padding:6px 13px;font:inherit;font-size:12.5px;'
 +'font-weight:700;color:#41527a;cursor:pointer}'
 +'.imp-mode:hover{background:#eef5ff}'
 +'.imp-mode.is-on{background:#0b63e5;color:#fff}'
 +'.imp-mode:focus-visible,.imp-arrow:focus-visible,.imp-now:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.imp-step{display:inline-flex;align-items:center;gap:6px}'
 +'.imp-arrow{width:32px;height:32px;border:1px solid #d7e3f5;border-radius:10px;background:#fff;color:#0b63e5;'
 +'font:inherit;font-size:18px;line-height:1;cursor:pointer}'
 +'.imp-arrow:hover{background:#eef5ff;border-color:#0b63e5}'
 +'.imp-label{min-width:118px;text-align:center;font-size:13.5px;color:#0c225e}'
 +'.imp-now{border:1px solid #f3c98b;background:#fffaf2;color:#a8660c;border-radius:999px;padding:5px 11px;'
 +'font:inherit;font-size:11.5px;font-weight:800;cursor:pointer}'
 /* เงินสดย่อย: the period row above its toolbar, and the toolbar down to two columns — its
    month picker is hidden, and the qc-toolbar grid would otherwise leave an empty third cell. */
 +'.petty-period-row{padding:0 16px 10px}'
 +'.toolbar.qc-toolbar.petty-toolbar-2{grid-template-columns:minmax(0,2fr) minmax(0,1fr)!important}'
 +'@media (max-width:640px){.imp-modes{width:100%;justify-content:space-between}.imp-mode{flex:1;padding:7px 4px}'
 +'.imp-step{width:100%;justify-content:space-between}.imp-label{flex:1;min-width:0}'
 +'.toolbar.qc-toolbar.petty-toolbar-2{grid-template-columns:1fr!important}}';
 document.head.appendChild(css);
})();
