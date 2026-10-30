/* Beta 1.0 — every time picker is 24-hour.

   REPORTED: "เปลี่ยนการเลือกเวลาที่ยังเป็น PM/AM เปลี่ยนเป็น 24hr".

   WHY THE OBVIOUS FIX DOES NOT WORK. A native <input type="datetime-local"> or type="time"
   is formatted by CHROME, from the browser's UI locale, and `lang` is ignored. Measured
   side by side in a headless Chrome: the page is <html lang="th">, and `lang="th"` and
   `lang="en-GB"` written directly on the input both still rendered 02:30 PM. There is no
   attribute, no CSS and no setting that moves it; a machine whose Chrome is en-US shows
   AM/PM whatever the page says.

   So the visible control is ours. The NATIVE INPUT STAYS IN THE DOM, keeps its id and keeps
   its value — every save path in this application reads these by bare identifier
   (saveSchedule() does `sAppointment.value`, saveSla() does `slaStart.value`), so replacing
   the element would have meant editing all of them. This is the same shape as
   window.imodeCombo() in part 17: the original is the single source of truth, the visible
   control writes to it and dispatches a real `change` so inline onchange handlers still fire.

   THREE THINGS THAT WILL BREAK IT, all learned from the combo box:

   1. `required` must move to a visible control. A display:none input that is required and
      empty makes Chrome refuse the submit SILENTLY, with no message and no focus.
   2. openModal() replaces #modalBody wholesale, so upgrading once at boot is not enough —
      a MutationObserver re-scans, and it is disconnected around our own writes so the
      observer never records the elements we just inserted.
   3. The value formats are exact and are what the rest of the application parses:
      `HH:MM` for time and `YYYY-MM-DDTHH:MM` for datetime-local. Nothing here ever writes
      a localised string into them. */
(function(){
 'use strict';

 var MIN_STEP=5;   /* appointment minutes; a value that is not a multiple is kept as its own option */

 function pad(n){return (n<10?'0':'')+n}
 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}

 /* ------------------------------------------------------------ the control ---- */
 function hourOptions(sel){
  var out='';
  for(var h=0;h<24;h++)out+='<option value="'+pad(h)+'"'+(sel===pad(h)?' selected':'')+'>'+pad(h)+'</option>';
  return out;
 }
 function minuteOptions(sel){
  var out='',seen={},m;
  for(m=0;m<60;m+=MIN_STEP){out+='<option value="'+pad(m)+'"'+(sel===pad(m)?' selected':'')+'>'+pad(m)+'</option>';seen[pad(m)]=1}
  /* A saved appointment at :07 must not be silently rounded to :05 just by being opened. */
  if(sel&&!seen[sel])out+='<option value="'+sel+'" selected>'+sel+'</option>';
  return out;
 }

 function splitValue(input){
  var v=String(input.value||'');
  if(input.type==='time')return {date:'',h:v.slice(0,2),m:v.slice(3,5)};
  var parts=v.split('T');
  return {date:parts[0]||'',h:(parts[1]||'').slice(0,2),m:(parts[1]||'').slice(3,5)};
 }

 function upgrade(input){
  if(!input||input.dataset.t24)return;
  var type=input.type;
  if(type!=='time'&&type!=='datetime-local')return;
  input.dataset.t24='1';

  var isDT=type==='datetime-local';
  var cur=splitValue(input);
  var wrap=document.createElement('div');
  wrap.className='t24'+(isDT?' is-dt':'');
  wrap.innerHTML=
   (isDT?'<span class="t24-dwrap"><input type="date" class="t24-date" value="'+(cur.date||'')+'" aria-label="'
        +(tl('วันที่','Date'))+'"><span class="t24-dtxt" aria-hidden="true"></span></span>':'')
   +'<span class="t24-clock" aria-hidden="true">🕒</span>'
   +'<select class="t24-h" aria-label="'+(tl('ชั่วโมง (24 ชม.)','Hour (24h)'))+'">'
   +'<option value="">--</option>'+hourOptions(cur.h)+'</select>'
   +'<b class="t24-colon">:</b>'
   +'<select class="t24-m" aria-label="'+(tl('นาที','Minute'))+'">'
   +'<option value="">--</option>'+minuteOptions(cur.m)+'</select>'
   +'<span class="t24-badge">24 ชม.</span>';

  /* The native control keeps the value; it is only taken out of the layout and out of the
     tab order. It is NOT removed, because the save paths read it by id. */
  input.style.display='none';
  input.setAttribute('tabindex','-1');
  input.setAttribute('aria-hidden','true');

  /* Rule 1: a hidden required input blocks the submit with no message. The requirement moves
     to the first visible control, which is the one the browser can actually focus. */
  var wasRequired=input.hasAttribute('required');
  if(wasRequired){
   input.removeAttribute('required');
   var first=wrap.querySelector(isDT?'.t24-date':'.t24-h');
   if(first)first.setAttribute('required','required');
   wrap.querySelector('.t24-h').setAttribute('required','required');
  }

  input.parentNode.insertBefore(wrap,input.nextSibling);

  var dEl=wrap.querySelector('.t24-date'),hEl=wrap.querySelector('.t24-h'),mEl=wrap.querySelector('.t24-m');
  /* A native date input writes its text in the order of the PC's language (month/day/year on an
     English Windows). The coordinator reads day/month/year, so the native text is made
     transparent and this overlay shows the date as วว/ดด/ปปปป; the calendar still comes from
     the native control underneath. */
  var dTxt=wrap.querySelector('.t24-dtxt');
  function showDate(){
   if(!dEl||!dTxt)return;
   var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dEl.value||'');
   dTxt.textContent=m?(m[3]+'/'+m[2]+'/'+m[1]):'วว/ดด/ปปปป';
   dTxt.classList.toggle('is-empty',!m);
  }
  showDate();
  function push(){
   var h=hEl.value,m=mEl.value;
   if(isDT){
    var d=dEl.value;
    /* Choosing a date before a time is the normal order, so default the clock rather than
       leaving the field empty and the form invalid. */
    if(d&&h&&!m){m='00';mEl.value='00'}
    input.value=(d&&h&&m)?(d+'T'+h+':'+m):'';
   }else{
    if(h&&!m){m='00';mEl.value='00'}
    input.value=(h&&m)?(h+':'+m):'';
   }
   /* The mirror listener below also runs on this dispatch. Without this flag it reads the
      half-finished value back — a date chosen before an hour makes input.value '' — and
      wipes the date the person just picked, so nothing could ever be entered. */
   input.__t24Self=true;
   try{input.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
   try{input.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}
   input.__t24Self=false;
  }
  if(dEl)dEl.addEventListener('change',function(){showDate();push()});
  hEl.addEventListener('change',push);
  mEl.addEventListener('change',push);

  /* 2026-09-15: tapping anywhere in the date box opens the calendar, not only the small icon
     at its right edge — "อยากให้กดตรงนี้และเลือกแผนที่ได้เลย … ตอนนี้มันยังต้องกด Icon อยู่".
     A native date input only opens its picker from that icon; showPicker() is the supported
     way to ask for it from anywhere else.

     It throws rather than returning false in two cases that both matter here — no user
     activation, and a browser that does not implement it (Safari, older Firefox) — so the
     call is guarded and the icon still works untouched if it fails. `click` is used rather
     than `focus` so that reaching the field by keyboard does not force a picker open over
     the keyboard user who is about to type the date. */
  if(dEl)dEl.addEventListener('click',function(e){
   /* A click on the icon itself is already opening the picker; calling showPicker() on top
      of that would open and immediately re-open it. */
   if(e.__t24Picker)return;
   e.__t24Picker=true;
   if(typeof dEl.showPicker!=='function')return;
   try{dEl.showPicker()}catch(err){}
  });

  /* Something else may write the native input after we are in place — loadCaseIntoQuote(),
     openScheduleModal() filling a form it just drew. Mirror it back. */
  input.addEventListener('change',function(){
   if(input.__t24Self)return;
   var v=splitValue(input);
   if(dEl)dEl.value=v.date||'';
   showDate();
   if(v.h&&!hEl.querySelector('option[value="'+v.h+'"]'))hEl.insertAdjacentHTML('beforeend','<option value="'+v.h+'">'+v.h+'</option>');
   if(v.m&&!mEl.querySelector('option[value="'+v.m+'"]'))mEl.insertAdjacentHTML('beforeend','<option value="'+v.m+'">'+v.m+'</option>');
   hEl.value=v.h||'';mEl.value=v.m||'';
  });
 }

 /* --------------------------------------------------------------- the sweep ---- */
 var observer=null;
 function sweep(root){
  var scope=root||document;
  var list;
  try{list=scope.querySelectorAll('input[type="time"]:not([data-t24]),input[type="datetime-local"]:not([data-t24])')}
  catch(e){return}
  if(!list.length)return;
  /* Rule 2: our own inserts are childList additions. A MutationObserver only queues records
     while it is observing, so disconnecting around the write means they are never recorded —
     rather than recorded and filtered, which is what spun a nav observer into an infinite
     loop in part 17 §11. */
  if(observer)observer.disconnect();
  try{[].slice.call(list).forEach(upgrade)}catch(e){}
  if(observer)start();
 }
 window.imodeTime24=sweep;

 /* The application mutates the DOM constantly — the response clock ticks every second and
    several decorators run on every render — and a querySelectorAll over the whole document
    on each of those would be real jank on a phone. The sweep is coalesced into one run per
    frame instead; a picker that appears is upgraded before it can be painted either way. */
 var queued=false;
 function schedule(){
  if(queued)return;
  queued=true;
  var run=function(){queued=false;sweep()};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);
  else setTimeout(run,16);
 }
 function start(){
  if(!observer){
   try{
    observer=new MutationObserver(schedule);
   }catch(e){observer=null}
  }
  if(!observer)return;
  try{observer.observe(document.body,{childList:true,subtree:true})}catch(e){}
 }

 var style=document.createElement('style');
 style.id='v70Time24Style';
 style.textContent=''
 +'.t24{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;'
 +'border:1px solid #d9e6fa;border-radius:11px;background:#fff;padding:5px 9px;min-height:40px}'
 +'.t24:focus-within{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.t24-date{flex:1 1 130px;min-width:0;border:0;background:transparent;color:#0c225e;'
 +'font-size:13px;padding:4px 2px}'
 +'.t24-date:focus{outline:none}'
 +'.t24-dwrap{position:relative;display:flex;flex:1 1 130px;min-width:0}'
 +'.t24-dwrap .t24-date{flex:1 1 auto;width:100%}'
 +'.t24-dwrap .t24-date::-webkit-datetime-edit{color:transparent}'
 +'.t24-dtxt{position:absolute;left:2px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:13px;color:#0c225e}'
 +'.t24-dtxt.is-empty{color:#7f8ba5}'
 /* dark theme (css/24 on the app, data-theme on the case page): the overlay is plain text on the
    dark field, so it takes the theme's text colours; never underlined */
 +'.t24-dtxt{text-decoration:none!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .t24-dtxt,html[data-theme="dark"] .t24-dtxt{color:var(--fx-text,#f1f1f1)!important}'
 +'html[data-ui="flat-dark"]:is(:root,#fx) .t24-dtxt.is-empty,html[data-theme="dark"] .t24-dtxt.is-empty{color:var(--fx-muted,#a9adb4)!important}'
 +'.t24-clock{font-size:13px;opacity:.55}'
 +'.t24-h,.t24-m{border:1px solid #e2ecfb;border-radius:8px;background:#f8fbff;color:#0c225e;'
 +'font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;padding:5px 4px;min-height:30px}'
 +'.t24-h:focus,.t24-m:focus{outline:2px solid #0b63e5;outline-offset:1px}'
 +'.t24-colon{color:#0c225e;font-weight:800}'
 +'.t24-badge{margin-left:auto;font-size:9.5px;font-weight:800;color:#5b6b88;background:#eef4ff;'
 +'border:1px solid #dbe7f9;border-radius:999px;padding:1px 7px;white-space:nowrap}'
 +'@media (max-width:640px){.t24{padding:5px 7px}.t24-badge{display:none}'
 +'.t24-date{flex:1 1 100%}}'
 // .field input/select (css/01) sets width:100% + its own box on every control, which stacked
 // hour and minute one per line. Higher specificity puts them back on one row: date on top,
 // 🕒 HH : MM underneath.
 +'.t24{row-gap:6px}'
 +'.t24 input.t24-date{flex:1 1 100%;width:auto;border:0;border-bottom:1px solid #eef3fb;'
 +'border-radius:0;background:transparent;padding:6px 2px}'
 +'.t24 select.t24-h,.t24 select.t24-m{flex:0 0 auto;width:auto;min-width:62px;padding:6px 8px;'
 +'border-radius:8px;font-size:15px;text-align:center}'
 +'.t24 .t24-colon{margin:0 -2px}';
 document.head.appendChild(style);

 function install(){sweep();start()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
