/* Version 1.0 — 2026-09-24: a customer has CONTACTS, not one contact.

   Asked for: "ระบบเพิ่มคอนแทคลูกค้าในโมดูลลูกค้า … ลิงก์เป็นเจ้าๆ … ตอนกดติดต่อลูกค้าในหน้าเคส
   ให้โชว์ด้วย … อยากให้มีปุ่มเพิ่มในหน้ารายละเอียดของลูกค้า". The owner chose: a real column,
   any number of channels per person (โทร / อีเมล / LINE / WhatsApp, the customer decides which
   to give), each one removable on its own, and the case page listing the whole company.

   SHAPE — customer.contacts = [{id, name, position, note, channels:[{id, type, value}]}]
   The first contact is the primary one. customer.contact / phone / email (the one-person fields
   every other screen reads — quotation header, case defaults, the case page) are kept in step
   with it, so nothing else had to change.

   A customer saved before this has no `contacts` array; its old one-person fields are shown as a
   single contact until somebody edits the list, after which the array is the truth and the old
   fields are only ever derived from it.

   TRANSPORT — cloudUpsertCustomer() (js/03) writes an explicit column list with no `contacts`, so
   the value is injected into the payload at cloudUpsert(), keyed by the row id, exactly as js/42
   does for case media. That needs `supabase/12-customer-contacts.sql` (customers.contacts jsonb).
   Until it is run the column is probed once, nothing extra is sent, and the list is kept in a
   device-local mirror (imode_v70_customer_contacts) that is put back after every sync — because
   syncCloud() replaces `customers` wholesale and would otherwise wipe it.

   The popup's listener is on #modalBody, not document: js/05 stops propagation at #modalPanel. */
(function(){
 'use strict';
 var MIRROR='imode_v70_customer_contacts';
 var TYPES={
  phone:{th:'โทร',icon:'📞',ph:'เช่น 081-234-5678'},
  email:{th:'อีเมล',icon:'✉️',ph:'name@company.com'},
  line:{th:'LINE',icon:'💬',ph:'LINE ID หรือลิงก์ line.me'},
  whatsapp:{th:'WhatsApp',icon:'🟢',ph:'เช่น 081-234-5678'}
 };

 function esc2(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function uid(p){return (p||'cc')+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
 function can(){try{return typeof canPermission==='function'?!!canPermission('customer.edit'):true}catch(e){return false}}
 function toast(m){try{if(typeof toastMsg==='function')toastMsg(m)}catch(e){}}
 function custById(id){try{return (customers||[]).filter(function(c){return c&&c.id===id})[0]||null}catch(e){return null}}

 /* ------------------------------------------------------------------ the model ---- */
 function legacy(cu){
  var ch=[];
  if(cu.phone)String(cu.phone).split(/[,\/]+/).map(function(s){return s.trim()}).filter(Boolean)
   .forEach(function(v,i){ch.push({id:'lp'+i,type:'phone',value:v})});
  if(cu.email)ch.push({id:'le',type:'email',value:String(cu.email).trim()});
  if(!cu.contact&&!ch.length)return [];
  return [{id:'legacy',name:cu.contact||'ผู้ติดต่อหลัก',position:'',note:'',channels:ch}];
 }
 function contactsOf(cu){
  if(!cu)return [];
  return Array.isArray(cu.contacts)?cu.contacts:legacy(cu);
 }
 window.imodeCustomerContacts=function(cid){return contactsOf(custById(cid))};

 function readMirror(){try{return JSON.parse(localStorage.getItem(MIRROR)||'{}')||{}}catch(e){return {}}}
 function writeMirror(m){try{localStorage.setItem(MIRROR,JSON.stringify(m))}catch(e){}}

 /* The primary contact feeds the one-person fields everything else reads. */
 function syncLegacy(cu){
  var p=cu.contacts[0];
  var first=function(t){if(!p)return '';var c=(p.channels||[]).filter(function(x){return x.type===t})[0];return c?c.value:''};
  cu.contact=p?p.name:'';
  cu.phone=first('phone');
  cu.email=first('email');
 }
 function persist(cu){
  syncLegacy(cu);
  var m=readMirror();m[cu.id]=cu.contacts;writeMirror(m);
  try{if(typeof saveLocal==='function')saveLocal()}catch(e){}
  try{if(typeof window.cloudUpsertCustomer==='function')window.cloudUpsertCustomer(cu)}catch(e){}
 }

 /* ------------------------------------------------------------------ transport ---- */
 var colOk=null,probing=null,pending={};
 function probe(){
  if(colOk!==null)return Promise.resolve(colOk);
  if(probing)return probing;
  try{if(typeof supa==='undefined'||!supa)return Promise.resolve(false)}catch(e){return Promise.resolve(false)}
  probing=supa.from('customers').select('contacts').limit(1).then(function(r){
   colOk=!r.error;
   if(!colOk)console.warn('[contacts] customers.contacts is missing — run supabase/12-customer-contacts.sql; contacts stay on this device until then');
   return colOk;
  },function(){colOk=false;return false});
  return probing;
 }
 var baseUpsertCustomer=window.cloudUpsertCustomer;
 if(typeof baseUpsertCustomer==='function'){
  window.cloudUpsertCustomer=function(c){
   var self=this,args=arguments;
   if(!c||!Array.isArray(c.contacts))return baseUpsertCustomer.apply(self,args);
   return probe().then(function(ok){
    if(ok)pending[c.id]=c.contacts;
    var r;
    try{r=baseUpsertCustomer.apply(self,args)}catch(e){delete pending[c.id];throw e}
    return Promise.resolve(r).then(function(v){delete pending[c.id];return v},function(e){delete pending[c.id];throw e});
   });
  };
 }
 var baseUpsert=window.cloudUpsert;
 if(typeof baseUpsert==='function'){
  window.cloudUpsert=function(table,obj){
   if(table==='customers'&&obj&&pending.hasOwnProperty(obj.id))obj.contacts=pending[obj.id];
   return baseUpsert.apply(this,arguments);
  };
 }
 var baseFrom=window.fromCustomerDb;
 if(typeof baseFrom==='function'){
  window.fromCustomerDb=function(row){
   var out=baseFrom.apply(this,arguments);
   if(out&&row&&Array.isArray(row.contacts))out.contacts=row.contacts;
   return out;
  };
 }
 /* A row that came down WITH a list is the truth and its mirror entry is spent; a row that came
    down without one (column not there yet) gets this device's list back. */
 function reapply(){
  var m=readMirror(),changed=false;
  try{(customers||[]).forEach(function(cu){
   if(!cu||!m.hasOwnProperty(cu.id))return;
   if(Array.isArray(cu.contacts)&&colOk){delete m[cu.id];changed=true;return}
   if(!Array.isArray(cu.contacts)){cu.contacts=m[cu.id];syncLegacy(cu)}
  })}catch(e){}
  if(changed)writeMirror(m);
 }
 var baseSync=window.syncCloud;
 if(typeof baseSync==='function'){
  window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   Promise.resolve(r).then(function(){return probe()}).then(reapply,reapply);
   return r;
  };
 }
 reapply();

 /* ------------------------------------------------------------------ the view ------ */
 function href(ch){
  var v=String(ch.value||'').trim();
  if(ch.type==='phone')return 'tel:'+v.replace(/[^0-9+]/g,'');
  if(ch.type==='email')return 'mailto:'+v;
  /* a personal LINE ID opens as ~id; an official account (@name) opens through /R/ti/p/@name */
  if(ch.type==='line')return /^https?:/i.test(v)?v:(v.charAt(0)==='@'?'https://line.me/R/ti/p/'+encodeURIComponent(v):'https://line.me/ti/p/~'+encodeURIComponent(v));
  if(ch.type==='whatsapp'){var d=v.replace(/[^0-9]/g,'');if(d.charAt(0)==='0')d='66'+d.slice(1);return 'https://wa.me/'+d}
  return '#';
 }
 window.imodeContactHref=href;

 function sectionHTML(cid){
  var cu=custById(cid),list=contactsOf(cu),edit=can();
  var cards=list.map(function(p,i){
   var chs=(p.channels||[]).map(function(ch){
    var t=TYPES[ch.type]||TYPES.phone;
    return '<span class="cc-ch cc-'+esc2(ch.type)+'">'
     +'<a href="'+esc2(href(ch))+'" target="'+(ch.type==='phone'||ch.type==='email'?'_self':'_blank')+'" rel="noopener">'
     +t.icon+' <small>'+esc2(t.th)+'</small> '+esc2(ch.value)+'</a>'
     +(edit?'<button type="button" class="cc-x" title="ลบช่องทางนี้" data-cc="chdel" data-p="'+esc2(p.id)+'" data-ch="'+esc2(ch.id)+'">✕</button>':'')
     +'</span>';
   }).join('')||'<span class="cc-none">ยังไม่มีช่องทางติดต่อ</span>';
   return '<div class="cc-card">'
    +'<div class="cc-top"><div><b>'+esc2(p.name||'-')+'</b>'+(i===0?' <span class="cc-main">ผู้ติดต่อหลัก</span>':'')
    +(p.position?'<small>'+esc2(p.position)+'</small>':'')+'</div>'
    +(edit?'<div class="cc-acts">'+(i>0?'<button type="button" data-cc="main" data-p="'+esc2(p.id)+'">★ ตั้งเป็นหลัก</button>':'')
      +'<button type="button" data-cc="edit" data-p="'+esc2(p.id)+'">✏ แก้ไข</button>'
      +'<button type="button" class="is-danger" data-cc="del" data-p="'+esc2(p.id)+'">🗑</button></div>':'')
    +'</div><div class="cc-chs">'+chs+'</div>'
    +(p.note?'<p class="cc-note">'+esc2(p.note)+'</p>':'')
    +'</div>';
  }).join('');
  return '<div class="section-title cc-title"><span>ผู้ติดต่อ ('+list.length+')</span>'
   +(edit?'<button type="button" class="soft-btn cc-add" data-cc="add">＋ เพิ่มผู้ติดต่อ</button>':'')+'</div>'
   +'<div class="cc-list">'+(cards||'<div class="empty">ยังไม่มีผู้ติดต่อ</div>')+'</div>';
 }
 function chRow(ch){
  var opts=Object.keys(TYPES).map(function(k){return '<option value="'+k+'"'+(ch.type===k?' selected':'')+'>'+TYPES[k].icon+' '+TYPES[k].th+'</option>'}).join('');
  return '<div class="cc-frow" data-chid="'+esc2(ch.id||uid('ch'))+'"><select>'+opts+'</select>'
   +'<input type="text" value="'+esc2(ch.value||'')+'" placeholder="'+esc2((TYPES[ch.type]||TYPES.phone).ph)+'">'
   +'<button type="button" class="cc-x" data-cc="frm" title="ลบช่องทางนี้">✕</button></div>';
 }
 function formHTML(cid,pid){
  var p=contactsOf(custById(cid)).filter(function(x){return x.id===pid})[0]||{channels:[{type:'phone',value:''}]};
  return '<div class="section-title cc-title"><span>'+(pid?'แก้ไขผู้ติดต่อ':'เพิ่มผู้ติดต่อ')+'</span></div>'
   +'<div class="cc-form" data-p="'+esc2(pid||'')+'">'
   +'<label>ชื่อผู้ติดต่อ *<input type="text" class="cc-name" value="'+esc2(p.name||'')+'" placeholder="เช่น คุณสมชาย"></label>'
   +'<label>ตำแหน่ง / แผนก<input type="text" class="cc-pos" value="'+esc2(p.position||'')+'" placeholder="เช่น ฝ่ายซ่อมบำรุง"></label>'
   +'<div class="cc-flabel">ช่องทางติดต่อ <small>ลูกค้าให้ช่องทางไหนก็เพิ่มเฉพาะช่องทางนั้น</small></div>'
   +'<div class="cc-frows">'+(p.channels||[]).map(chRow).join('')+'</div>'
   +'<button type="button" class="soft-btn cc-addch" data-cc="addch">＋ เพิ่มช่องทาง</button>'
   +'<label>หมายเหตุ<input type="text" class="cc-notei" value="'+esc2(p.note||'')+'" placeholder="เช่น ติดต่อได้ 8:00-17:00"></label>'
   +'<div class="button-row"><button type="button" class="soft-btn" data-cc="cancel">ยกเลิก</button>'
   +'<button type="button" class="primary-btn" data-cc="save">💾 บันทึกผู้ติดต่อ</button></div></div>';
 }

 function host(){return document.getElementById('ccSection')}
 function draw(cid,pid,form){
  var h=host();if(!h)return;
  h.innerHTML=form?formHTML(cid,pid):sectionHTML(cid);
  if(form){var n=h.querySelector('.cc-name');if(n)try{n.focus()}catch(e){}}
 }
 /* After a save the whole popup is redrawn, so the ผู้ติดต่อ / โทรศัพท์ / อีเมล boxes js/03 prints
    at the top follow the new primary contact. Same title, so js/29 treats it as a re-render and
    adds no history entry. */
 function redraw(cid){try{window.openCustomerDetail(cid)}catch(e){draw(cid)}}

 function onClick(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-cc]'):null;
  var h=host();
  if(!b||!h||!h.contains(b))return;
  var cid=h.getAttribute('data-cid'),cu=custById(cid),act=b.getAttribute('data-cc');
  if(!cu)return;
  if(act!=='add'&&act!=='edit'&&act!=='cancel'&&act!=='addch'&&act!=='frm'&&!can())return;
  var list=contactsOf(cu).map(function(p){return JSON.parse(JSON.stringify(p))});
  var pid=b.getAttribute('data-p');
  if(act==='add'){if(can())draw(cid,'',true);return}
  if(act==='edit'){if(can())draw(cid,pid,true);return}
  if(act==='cancel'){draw(cid);return}
  if(act==='addch'){h.querySelector('.cc-frows').insertAdjacentHTML('beforeend',chRow({type:'phone',value:''}));return}
  if(act==='frm'){var row=b.closest('.cc-frow');if(row)row.remove();return}
  if(act==='chdel'){
   var p=list.filter(function(x){return x.id===pid})[0];if(!p)return;
   var ch=(p.channels||[]).filter(function(x){return x.id===b.getAttribute('data-ch')})[0];if(!ch)return;
   if(!window.confirm('ลบช่องทาง '+(TYPES[ch.type]||{}).th+' '+ch.value+' ของ '+p.name+' ?'))return;
   p.channels=p.channels.filter(function(x){return x!==ch});
   cu.contacts=list;persist(cu);redraw(cid);toast('ลบช่องทางแล้ว');return;
  }
  if(act==='del'){
   var q=list.filter(function(x){return x.id===pid})[0];if(!q)return;
   if(!window.confirm('ลบผู้ติดต่อ '+q.name+' พร้อมทุกช่องทาง ?'))return;
   cu.contacts=list.filter(function(x){return x.id!==pid});persist(cu);redraw(cid);toast('ลบผู้ติดต่อแล้ว');return;
  }
  if(act==='main'){
   var i=list.findIndex(function(x){return x.id===pid});if(i<1)return;
   list.unshift(list.splice(i,1)[0]);cu.contacts=list;persist(cu);redraw(cid);toast('ตั้งเป็นผู้ติดต่อหลักแล้ว');return;
  }
  if(act==='save'){
   var f=h.querySelector('.cc-form');
   var name=(f.querySelector('.cc-name').value||'').trim();
   if(!name){toast('กรุณาใส่ชื่อผู้ติดต่อ');f.querySelector('.cc-name').focus();return}
   var chs=[].slice.call(f.querySelectorAll('.cc-frow')).map(function(r){
    return {id:r.getAttribute('data-chid')||uid('ch'),type:r.querySelector('select').value,value:(r.querySelector('input').value||'').trim()};
   }).filter(function(c){return c.value});
   var id=f.getAttribute('data-p');
   var rec={id:(id&&id!=='legacy')?id:uid(),name:name,position:(f.querySelector('.cc-pos').value||'').trim(),
    note:(f.querySelector('.cc-notei').value||'').trim(),channels:chs};
   var at=list.findIndex(function(x){return x.id===id});
   if(id&&at>=0)list[at]=rec;else list.push(rec);
   cu.contacts=list;persist(cu);redraw(cid);toast('บันทึกผู้ติดต่อแล้ว');
  }
 }
 /* The placeholder follows the type picked, so the box says what to type. */
 function onChange(e){
  var s=e.target;if(!s||s.tagName!=='SELECT'||!s.closest('.cc-frow'))return;
  var i=s.parentNode.querySelector('input');if(i)i.placeholder=(TYPES[s.value]||TYPES.phone).ph;
 }

 /* ------------------------------------------------------------------ the popup ----- */
 var baseDetail=window.openCustomerDetail;
 if(typeof baseDetail==='function'){
  window.openCustomerDetail=function(cid){
   var r=baseDetail.apply(this,arguments);
   try{
    var body=document.getElementById('modalBody');
    if(body&&custById(cid)){
     var box=document.createElement('div');
     box.id='ccSection';box.className='cc-section';box.setAttribute('data-cid',cid);
     var grid=body.querySelector('.detail-grid');
     if(grid&&grid.parentNode)grid.parentNode.insertBefore(box,grid.nextSibling);else body.insertBefore(box,body.firstChild);
     draw(cid);
     if(!body.__ccWired){body.__ccWired=true;body.addEventListener('click',onClick);body.addEventListener('change',onChange)}
    }
   }catch(e){console.warn('[contacts]',e)}
   return r;
  };
 }

 var st=document.createElement('style');
 st.textContent=[
  '.cc-section{margin-top:14px}',
  '.cc-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
  '.cc-title .cc-add{padding:6px 12px;font-size:12.5px}',
  '.cc-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:8px}',
  '.cc-card{border:1px solid #dde7f5;border-radius:14px;padding:11px 12px;background:#fbfdff;min-width:0}',
  '.cc-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}',
  '.cc-top b{color:#0c225e;font-size:14px}.cc-top small{display:block;color:#6b7d9e;font-size:11.5px;margin-top:2px}',
  '.cc-main{display:inline-block;font-size:10px;font-weight:800;color:#087a45;background:#e8f7ef;border-radius:999px;padding:2px 7px;vertical-align:middle}',
  '.cc-acts{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}',
  '.cc-acts button{border:1px solid #d6e2f3;background:#fff;color:#274a8c;border-radius:8px;padding:4px 7px;font-size:11px;font-weight:700;cursor:pointer}',
  '.cc-acts button.is-danger{color:#b42318;border-color:#f3c9c4}',
  '.cc-chs{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}',
  '.cc-ch{display:inline-flex;align-items:center;gap:2px;border:1px solid #d6e2f3;border-radius:999px;background:#fff;max-width:100%}',
  '.cc-ch a{padding:5px 4px 5px 10px;color:#0c225e;text-decoration:none;font-size:12.5px;font-weight:600;overflow-wrap:anywhere}',
  '.cc-ch a small{color:#6b7d9e;font-weight:700}',
  '.cc-ch.cc-line{border-color:#b6e8c9}.cc-ch.cc-whatsapp{border-color:#b6ebc7}.cc-ch.cc-email{border-color:#f6d7a6}',
  '.cc-x{border:0;background:transparent;color:#b42318;font-size:12px;cursor:pointer;padding:4px 8px 4px 2px;min-width:28px;min-height:28px}',
  '.cc-none{color:#93a4c1;font-size:12px}',
  '.cc-note{margin:7px 0 0;font-size:11.5px;color:#56698c}',
  '.cc-form{display:grid;gap:9px;border:1px solid #dde7f5;border-radius:14px;padding:12px;background:#fbfdff;margin-top:8px}',
  '.cc-form label{display:grid;gap:4px;font-size:12px;font-weight:700;color:#274a8c}',
  '.cc-form input,.cc-form select{width:100%;box-sizing:border-box;border:1px solid #ccd8ea;border-radius:10px;padding:9px 10px;font:inherit;font-size:13px;background:#fff}',
  '.cc-flabel{font-size:12px;font-weight:700;color:#274a8c}.cc-flabel small{font-weight:500;color:#6b7d9e}',
  '.cc-frows{display:grid;gap:7px}',
  '.cc-frow{display:grid;grid-template-columns:minmax(110px,140px) minmax(0,1fr) auto;gap:6px;align-items:center}',
  '.cc-addch{justify-self:start;padding:6px 12px;font-size:12.5px}',
  '@media (max-width:480px){.cc-frow{grid-template-columns:minmax(0,1fr) auto}.cc-frow select{grid-column:1/-1}.cc-list{grid-template-columns:1fr}}'
 ].join('\n');
 document.head.appendChild(st);
})();
