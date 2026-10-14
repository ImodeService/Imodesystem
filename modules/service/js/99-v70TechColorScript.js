/* Beta 1.0 — 2026-09-23: สีในปฏิทิน becomes a real colour picker.
   It was a <select> with four named colours, because js/03 renders the calendar chip as
   `class="job-chip ${t.color}"` — the colour is a CSS CLASS, not a value, so a hex typed into
   that field would have produced class="job-chip #1c1d22" and no styling at all.

   So a custom colour is stored as a class-safe token, `c-1c1d22`, and this file injects the
   matching rule for every token actually in use. js/03's template is then correct exactly as
   written and no render code is touched. The four original names still save as 'blue',
   'orange', 'green' and 'purple', so every existing record and the css/01 rules behind them
   keep working untouched. */
(function(){
 'use strict';
 if(typeof settings!=='object')return;

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* The preset hexes are READ from the theme rather than copied, so a change to css/01's
    --blue / --orange / --green cannot leave this file showing a stale swatch. */
 function cssVar(name,fallback){
  try{
   var v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
   return v||fallback;
  }catch(e){return fallback}
 }
 function presets(){
  return [{key:'blue',hex:cssVar('--blue','#0b63e5'),label:tl('น้ำเงิน','Blue')},
          {key:'orange',hex:cssVar('--orange','#f2751a'),label:tl('ส้ม','Orange')},
          {key:'green',hex:cssVar('--green','#079455'),label:tl('เขียว','Green')},
          {key:'purple',hex:'#8a5bc0',label:tl('ม่วง','Purple')}];
 }
 function isToken(v){return /^c-[0-9a-f]{6}$/i.test(String(v||''))}
 function toHex(v){
  v=String(v||'');
  if(isToken(v))return '#'+v.slice(2).toLowerCase();
  var p=presets().filter(function(x){return x.key===v})[0];
  if(p)return p.hex;
  if(/^#[0-9a-f]{6}$/i.test(v))return v.toLowerCase();
  return presets()[0].hex;
 }
 /* 2026-09-25: js/119 colours the month calendar by technician and needs the same answer. */
 window.imodeTechColorHex=toHex;
 function toValue(hex){
  hex=String(hex||'').toLowerCase();
  var p=presets().filter(function(x){return String(x.hex).toLowerCase()===hex})[0];
  return p?p.key:('c-'+hex.replace('#',''));
 }
 /* The chip is a 4px bar in the colour over a very light wash of it — the same recipe
    css/01 uses for its four, mixed here instead of guessed. */
 function wash(hex,amount){
  var n=parseInt(String(hex).replace('#',''),16);
  if(isNaN(n))return '#edf3ff';
  var r=(n>>16)&255,g=(n>>8)&255,b=n&255,k=amount;
  function mix(c){return Math.round(c+(255-c)*k)}
  return 'rgb('+mix(r)+','+mix(g)+','+mix(b)+')';
 }

 /* ------------------------------------------------------- the rules for tokens in use --- */
 var lastSig='';
 function ensureStyles(){
  var used=[];
  try{
   (Array.isArray(technicians)?technicians:[]).forEach(function(t){
    if(t&&isToken(t.color)&&used.indexOf(t.color)<0)used.push(t.color);
   });
  }catch(e){}
  var sig=used.sort().join(',');
  if(sig===lastSig)return;
  lastSig=sig;
  var el=document.getElementById('v70TechColorRules');
  if(!el){
   el=document.createElement('style');
   el.id='v70TechColorRules';
   document.head.appendChild(el);
  }
  el.textContent=used.map(function(tok){
   var hex=toHex(tok);
   return '.job-chip.'+tok+'{border-color:'+hex+';background:'+wash(hex,.88)+'}'
        + '.tech-color-dot.'+tok+'{background:'+hex+'}';
  }).join('');
 }
 ensureStyles();
 /* renderAll() is what repaints the calendar, and syncCloud() can bring in a technician whose
    colour this device has never seen. Both are cheap here because the signature check means
    nothing is rewritten unless the set of colours actually changed. */
 ['renderAll','syncCloud'].forEach(function(name){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(){
   var r=base.apply(this,arguments);
   if(r&&typeof r.then==='function')return r.then(function(v){ensureStyles();return v});
   ensureStyles();
   return r;
  };
 });

 /* ------------------------------------------------------------------ the picker --- */
 function widgetHTML(value){
  var hex=toHex(value);
  return '<div class="tcol">'
   +'<input type="hidden" id="tColor" value="'+esc2(value||'blue')+'">'
   +'<div class="tcol-row">'
   /* 2026-09-25: the browser's own colour popup has no OK button, so the chip opens the
      picker below instead; the native input stays, hidden, only because paint() writes it. */
   +'<button type="button" class="tcol-native" data-tcol-open="1" title="'+esc2(tl('เลือกสีอิสระ','Pick any colour'))+'">'
   +'<input type="color" id="tColorPick" value="'+esc2(hex)+'" hidden tabindex="-1">'
   +'<i class="tcol-chip" id="tColorChip" style="background:'+esc2(hex)+'"></i>'
   +'<span id="tColorHex">'+esc2(hex)+'</span></button>'
   +'<div class="tcol-swatches">'
   +presets().map(function(p){
     return '<button type="button" class="tcol-sw" data-hex="'+esc2(p.hex)+'" title="'+esc2(p.label)+'"'
      +' aria-label="'+esc2(p.label)+'" style="background:'+esc2(p.hex)+'"></button>';
    }).join('')
   +'</div></div></div>';
 }
 function paint(){
  var hid=document.getElementById('tColor'),pick=document.getElementById('tColorPick'),
      out=document.getElementById('tColorHex');
  if(!hid||!pick)return;
  var hex=toHex(hid.value);
  pick.value=hex;
  if(out)out.textContent=hex;
  var chip=document.getElementById('tColorChip');if(chip)chip.style.background=hex;
  [].forEach.call(document.querySelectorAll('.tcol-sw'),function(b){
   b.classList.toggle('is-on',String(b.getAttribute('data-hex')).toLowerCase()===hex);
  });
 }

 var baseOpen=window.openTechnicianModal;
 if(typeof baseOpen==='function'){
  window.openTechnicianModal=function(){
   var r=baseOpen.apply(this,arguments);
   try{
    var sel=document.getElementById('tColor');
    /* saveTech() reads tColor.value as an id global, so the id has to survive the swap —
       the hidden input inside the widget carries it, and it is the only thing that saves. */
    if(sel&&sel.tagName==='SELECT'){
     var current=sel.value||'blue';
     sel.insertAdjacentHTML('beforebegin',widgetHTML(current));
     sel.parentNode.removeChild(sel);
     paint();
    }
   }catch(e){}
   return r;
  };
 }

 /* One delegated listener on #modalBody, not on document: js/05 calls stopPropagation() on
    #modalPanel, so a document-level listener never fires inside a popup. */
 function wire(){
  var body=document.getElementById('modalBody');
  if(!body||body.getAttribute('data-tcol-wired'))return;
  body.setAttribute('data-tcol-wired','1');
  body.addEventListener('input',function(e){
   if(!e.target||e.target.id!=='tColorPick')return;
   var hid=document.getElementById('tColor');
   if(hid)hid.value=toValue(e.target.value);
   paint();
  });
  body.addEventListener('click',function(e){
   if(e.target&&e.target.closest&&e.target.closest('[data-tcol-open]')){e.preventDefault();openPicker();return}
   var sw=e.target&&e.target.closest?e.target.closest('.tcol-sw'):null;
   if(!sw)return;
   e.preventDefault();
   var hid=document.getElementById('tColor');
   if(hid)hid.value=toValue(sw.getAttribute('data-hex'));
   paint();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});
 else wire();
 var baseModal=window.openModal;
 if(typeof baseModal==='function'){
  window.openModal=function(){
   var r=baseModal.apply(this,arguments);
   setTimeout(wire,0);
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70TechColorStyle';
 st.textContent=''
 +'.tcol-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
 +'.tcol-native{display:inline-flex;align-items:center;gap:8px;padding:5px 10px 5px 5px;'
 +'border:1px solid #cfdcf0;border-radius:10px;background:#fff;cursor:pointer}'
 +'.tcol-native input[type=color]{width:34px;height:30px;padding:0;border:0;background:none;cursor:pointer}'
 +'.tcol-native span{font-size:12px;font-variant-numeric:tabular-nums;color:#12356f;letter-spacing:.02em}'
 +'.tcol-swatches{display:flex;gap:6px;flex-wrap:wrap}'
 +'.tcol-sw{width:28px;height:28px;border-radius:8px;border:2px solid #fff;cursor:pointer;'
 +'box-shadow:0 0 0 1px #cfdcf0}'
 +'.tcol-sw.is-on{box-shadow:0 0 0 2px #0b63e5}'
 +'.tcol-sw:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}';
 document.head.appendChild(st);

 /* ------------------------------------------- 2026-09-25: a picker with an OK button ---
    Asked for: "เพิ่มปุ่มกด ok ไปไว้ตอนเลือกสีเสร็จด้วย". The browser's colour popup cannot be given
    a button, so this is our own: a saturation/brightness square, a hue slider, the hex, a
    preview — and ยกเลิก / ตกลง. Nothing is applied until ตกลง; ยกเลิก or a click outside leaves
    the colour exactly as it was. */
 function hexToHsv(hex){
  var n=parseInt(String(hex).replace('#',''),16);if(isNaN(n))n=0x0b63e5;
  var r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0;
  if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}
  return {h:h,s:mx?d/mx:0,v:mx};
 }
 function hsvToHex(h,s,v){
  var c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,r=0,g=0,b=0;
  if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}
  function p(u){var t=Math.round((u+m)*255).toString(16);return t.length<2?'0'+t:t}
  return '#'+p(r)+p(g)+p(b);
 }
 function closePicker(){var p=document.getElementById('tcolPop');if(p&&p.parentNode)p.parentNode.removeChild(p)}
 function openPicker(){
  closePicker();
  var btn=document.querySelector('[data-tcol-open]'),hid=document.getElementById('tColor');if(!btn||!hid)return;
  var st=hexToHsv(toHex(hid.value));
  var pop=document.createElement('div');pop.id='tcolPop';pop.className='tcol-pop';
  pop.innerHTML='<div class="tcol-sv"><i class="tcol-sv-dot"></i></div>'
   +'<input type="range" class="tcol-hue" min="0" max="359" step="1" aria-label="'+esc2(tl('เฉดสี','Hue'))+'">'
   +'<div class="tcol-pop-row"><i class="tcol-prev"></i><input class="tcol-hexin" maxlength="7" aria-label="HEX"></div>'
   +'<div class="tcol-pop-acts"><button type="button" class="soft-btn" data-tcol-cancel="1">'+esc2(tl('ยกเลิก','Cancel'))+'</button>'
   +'<button type="button" class="primary-btn" data-tcol-ok="1">✓ '+esc2(tl('ตกลง','OK'))+'</button></div>';
  btn.parentNode.style.position='relative';
  btn.parentNode.appendChild(pop);
  var sv=pop.querySelector('.tcol-sv'),dot=pop.querySelector('.tcol-sv-dot'),hue=pop.querySelector('.tcol-hue'),
      prev=pop.querySelector('.tcol-prev'),hexIn=pop.querySelector('.tcol-hexin');
  function show(fromHex){
   var hx=hsvToHex(st.h,st.s,st.v);
   sv.style.background='linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl('+st.h+',100%,50%))';
   dot.style.left=(st.s*100)+'%';dot.style.top=((1-st.v)*100)+'%';dot.style.background=hx;
   hue.value=Math.round(st.h);prev.style.background=hx;if(!fromHex)hexIn.value=hx;
  }
  function fromPoint(e){
   var r=sv.getBoundingClientRect();
   st.s=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
   st.v=Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height));
   show();
  }
  sv.addEventListener('pointerdown',function(e){e.preventDefault();try{sv.setPointerCapture(e.pointerId)}catch(x){}fromPoint(e);
   sv.onpointermove=function(ev){fromPoint(ev)};});
  sv.addEventListener('pointerup',function(){sv.onpointermove=null});
  hue.addEventListener('input',function(){st.h=Number(hue.value)||0;show()});
  hexIn.addEventListener('input',function(){var v=hexIn.value.trim();if(v[0]!=='#')v='#'+v;if(/^#[0-9a-f]{6}$/i.test(v)){st=hexToHsv(v);show(true)}});
  pop.addEventListener('click',function(e){
   e.stopPropagation();
   if(e.target.closest('[data-tcol-cancel]')){closePicker();return}
   if(e.target.closest('[data-tcol-ok]')){hid.value=toValue(hsvToHex(st.h,st.s,st.v));paint();closePicker()}
  });
  show();
  try{pop.scrollIntoView({block:'nearest',behavior:'smooth'})}catch(e){}
 }
 window.imodeOpenTechColorPicker=openPicker;
 /* 2026-09-28: js/113 edits a technician's colour from the account card on ทีมงาน, now that
    the technician register is no longer on that page. Same widget, same picker. */
 window.imodeTechColorWidget=function(v){ensureStyles();return widgetHTML(v)};
 window.imodeTechColorPaint=paint;
 /* a click anywhere else in the form closes it without applying */
 document.addEventListener('pointerdown',function(e){
  var p=document.getElementById('tcolPop');
  if(p&&!p.contains(e.target)&&!(e.target.closest&&e.target.closest('[data-tcol-open]')))closePicker();
 },true);

 /* --------------------------------- 2026-09-25: the colour shows on the ทีมช่าง card ---
    Reported: "ลองเปลี่ยนสี ในหน้าข้อมูลช่างไม่เปลี่ยนแต่ในปฏิทินเปลี่ยน" — the card never showed
    the colour at all, so a change was visible only on the calendar. Each card now carries a
    bar in the technician's colour along its top and a สีปฏิทิน chip beside the team badge. */
 function paintCards(){
  var grid=document.getElementById('technicianGrid');if(!grid)return;
  [].forEach.call(grid.querySelectorAll('.person-card'),function(card){
   var b=card.querySelector('button[onclick*="openTechnicianModal("],button[onclick*="imodeTechCases("],button[onclick*="openFieldService("]');
   var id=b&&(String(b.getAttribute('onclick')).match(/\('([^']+)'\)/)||[])[1];if(!id)return;
   var t=null;try{t=technicians.filter(function(x){return x.id===id})[0]}catch(e){}
   if(!t)return;
   var hex=toHex(t.color);
   card.classList.add('tcol-card');card.style.setProperty('--tcol',hex);
   var badges=card.querySelector('.person-badges');
   if(badges){
    var chip=badges.querySelector('.tcol-badge');
    if(!chip){chip=document.createElement('span');chip.className='tcol-badge';badges.appendChild(chip)}
    chip.innerHTML='<i style="background:'+esc2(hex)+'"></i>'+esc2(tl('สีปฏิทิน','Calendar'));
    chip.title=hex;
   }
  });
 }
 var baseTechs=window.renderTechnicians;
 if(typeof baseTechs==='function')window.renderTechnicians=function(){
  var r=baseTechs.apply(this,arguments);
  try{paintCards()}catch(e){}
  return r;
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paintCards,{once:true});else paintCards();

 var st2=document.createElement('style');
 st2.id='v70TechColorPickerStyle';
 st2.textContent=''
 +'.tcol-chip{display:inline-block;width:26px;height:26px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}'
 +'.tcol-pop{position:absolute;left:0;top:calc(100% + 8px);z-index:30;width:236px;padding:12px;background:#fff;'
 +'border:1px solid #d6e1f2;border-radius:14px;box-shadow:0 14px 34px rgba(12,34,94,.22)}'
 +'.tcol-sv{position:relative;height:140px;border-radius:9px;cursor:crosshair;touch-action:none}'
 +'.tcol-sv-dot{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #fff;'
 +'box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none}'
 +'.tcol-pop .tcol-hue{display:block;width:100%!important;margin:12px 0 10px!important;height:12px!important;padding:0!important;border:0!important;box-shadow:none!important;-webkit-appearance:none;appearance:none;border-radius:999px!important;'
 +'background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)!important;outline:none}'
 +'.tcol-hue::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #52627e;cursor:pointer}'
 +'.tcol-hue::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #52627e;cursor:pointer}'
 +'.tcol-pop-row{display:flex;align-items:center;gap:8px}'
 +'.tcol-prev{flex:none;width:34px;height:34px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}'
 +'.tcol-hexin{flex:1;min-width:0;height:34px;padding:0 10px;border:1.5px solid #d6deeb;border-radius:9px;font:inherit;font-size:13px;text-transform:lowercase}'
 +'.tcol-pop-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}'
 +'.tcol-pop-acts button{min-height:36px;padding:0 14px}'
 +'.person-card.tcol-card{border-top:5px solid var(--tcol)}'
 +'.tcol-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#f3f6fb;'
 +'color:#41567c;font-size:11px;font-weight:600}'
 +'.tcol-badge i{width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}';
 document.head.appendChild(st2);
})();
