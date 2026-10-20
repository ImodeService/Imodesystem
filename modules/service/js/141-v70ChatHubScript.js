/* js/141-v70ChatHubScript.js — 2026-10-20 (ข้อ 6)
   "เพิ่มแชทในหน้าช่าง (แยกตามงานได้) และมีปุ่มแชทลอยด้านล่างขวา มีแชทส่วนตัวกับแชทของเคส"

   One floating 💬 button at the bottom right of the Service app (index.html only; the case page
   keeps its own แชททีม panel from js/138). It opens a drawer with two tabs:
     ส่วนตัว  one-to-one chats between staff — public.direct_messages (supabase/15-direct-chat.sql);
              only the two people in a conversation can read it, admins included.
     เคส/งาน  the team chat of each case — public.case_messages (14-case-chat.sql), the same
              messages the case page shows. A technician sees the jobs assigned to them; office
              staff see every open case. Read state is the case page's own key
              (imode.caseChat.seen), so reading on either page clears both.
   หน้างาน (the technician's job page, js/32) gets a "💬 แชทงานนี้" button that opens the drawer
   straight on that job's chat.

   Until 15-direct-chat.sql is run the personal tab says so and the case tab still works. Nothing
   here writes to localStorage business keys or to `settings`. */
(function(){
 'use strict';
 if(document.getElementById('scdMain'))return;            /* the case page has its own panel */

 var DM='direct_messages',CM='case_messages',LAST='case_message_last';
 var SEEN='imode.caseChat.seen';
 var CLOSED=['เสร็จสิ้น','ปิดเคส','ยกเลิก'];
 var MAX_PHOTOS=4,MAX_SIDE=1280,JPEG_Q=0.72;
 var COLORS=['#0b63e5','#0f8a5f','#b45309','#7c3aed','#be185d','#0e7490','#4d7c0f','#9a3412'];

 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function readJ(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
 function writeJ(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
 function db(){try{return (typeof supa!=='undefined'&&supa)?supa:null}catch(e){return null}}
 function user(){try{return currentUser||null}catch(e){return null}}
 function caseList(){try{return Array.isArray(cases)?cases:[]}catch(e){return []}}
 function missingTable(err){
  return /PGRST205|PGRST202|42P01|does not exist|Could not find/i.test(String(err&&(err.code+' '+err.message)||''));
 }
 function isCustomer(){
  var u=user();
  return document.body.classList.contains('customer-portal-mode')
   ||!!(u&&(u.accountType==='customer'||/^customer$/i.test(String(u.role||''))));
 }
 function initials(n){
  var p=String(n||'?').trim().split(/\s+/);
  return ((p[0]||'?').charAt(0)+(p[1]?p[1].charAt(0):'')).toUpperCase();
 }
 function color(n){var h=0,s=String(n||'');for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return COLORS[Math.abs(h)%COLORS.length]}
 function hhmm(t){var d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
 function dayKey(t){var d=new Date(t);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()}
 function dayLabel(t){
  var d=new Date(t),n=new Date();
  if(dayKey(d)===dayKey(n))return 'วันนี้';
  var y=new Date(n);y.setDate(n.getDate()-1);
  if(dayKey(d)===dayKey(y))return 'เมื่อวาน';
  return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
 }
 function when(t){
  if(!t)return '';
  var d=new Date(t);
  return dayKey(d)===dayKey(new Date())?hhmm(d):d.toLocaleDateString('th-TH',{day:'numeric',month:'short'});
 }

 /* ------------------------------------------------------------------- state ---- */
 var me={id:'',name:''},people=[],byPerson={};
 var dms=[],dmState='idle',caseLast={},caseState='idle';
 var view={tab:'dm',open:null};      /* open: {kind:'dm',id} | {kind:'case',id} */
 var thread=[],threadState='idle',pending=[],sending=false;
 var isOpen=false;

 /* ----------------------------------------------------------------- styles ---- */
 var css=document.createElement('style');css.id='chHubCss';
 css.textContent=[
  '.ch-fab{position:fixed;right:18px;bottom:18px;z-index:150;height:52px;padding:0 18px 0 16px;border-radius:26px;border:0;cursor:pointer;',
   'background:var(--imode-navy,#0c225e);color:#fff;font:inherit;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;box-shadow:0 10px 26px rgba(12,34,94,.3)}',
  '.ch-fab[hidden]{display:none}',
  '.ch-fab em{font-style:normal;min-width:20px;height:20px;border-radius:10px;background:var(--imode-orange,#f27a1a);font-size:11.5px;line-height:20px;padding:0 6px;text-align:center}',
  '.ch-fab em:empty{display:none}',
  '.ch-fab:focus-visible,.ch-panel button:focus-visible{outline:3px solid var(--imode-blue,#0b63e5);outline-offset:2px}',
  '.ch-shade{position:fixed;inset:0;z-index:10498;background:rgba(9,18,38,.35)}',
  '.ch-shade[hidden],.ch-panel[hidden]{display:none}',
  '.ch-panel{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);z-index:10499;background:#fff;display:flex;flex-direction:column;',
   'box-shadow:-12px 0 40px rgba(0,0,0,.18);font-size:14px;color:var(--ink,#12224a)}',
  '.ch-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#e2ecfb);flex:none}',
  '.ch-head b{font-size:15px;color:var(--imode-navy,#0c225e)}',
  '.ch-head small{display:block;color:var(--muted,#6b7d9e);font-size:12px;font-weight:400}',
  '.ch-head .ch-sp{flex:1;min-width:0}',
  '.ch-icon{width:36px;height:36px;flex:none;border:1px solid var(--line,#e2ecfb);border-radius:10px;background:#fff;cursor:pointer;font-size:16px;line-height:1;color:var(--imode-navy,#0c225e)}',
  '.ch-icon:hover{background:#f4f8ff}',
  '.ch-tabs{display:flex;gap:6px;padding:10px 12px 0;flex:none}',
  '.ch-tabs button{flex:1;height:40px;border-radius:11px;border:1px solid var(--line,#e2ecfb);background:#fff;font:inherit;font-weight:700;font-size:13.5px;color:#3a4a6b;cursor:pointer}',
  '.ch-tabs button[aria-selected="true"]{background:var(--imode-blue,#0b63e5);border-color:var(--imode-blue,#0b63e5);color:#fff}',
  '.ch-tabs em{font-style:normal;margin-left:6px;background:var(--imode-orange,#f27a1a);color:#fff;border-radius:9px;padding:0 6px;font-size:11px}',
  '.ch-tabs em:empty{display:none}',
  '.ch-search{margin:10px 12px 4px;flex:none}',
  '.ch-search input{width:100%;box-sizing:border-box;height:40px;border:1px solid var(--line-2,#dfe9f8);border-radius:11px;padding:0 12px;font:inherit;font-size:14px;background:#f8fbff;color:inherit}',
  '.ch-list{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 12px}',
  '.ch-row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;border:0;background:none;padding:9px 8px;border-radius:12px;cursor:pointer;text-align:left;font:inherit;color:inherit}',
  '.ch-row:hover{background:#f4f8ff}',
  '.ch-row b{display:block;font-size:14px;color:var(--imode-navy,#0c225e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ch-row small{display:block;font-size:12.5px;color:var(--muted,#6b7d9e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ch-row.is-unread b,.ch-row.is-unread small{color:#12224a;font-weight:700}',
  '.ch-row .ch-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:11.5px;color:var(--muted,#6b7d9e)}',
  '.ch-row .ch-meta em{font-style:normal;min-width:20px;height:20px;border-radius:10px;background:var(--imode-orange,#f27a1a);color:#fff;font-size:11px;line-height:20px;text-align:center;padding:0 6px}',
  '.ch-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px;flex:none}',
  '.ch-av.is-case{border-radius:12px;background:#eaf2ff!important;color:#0b3f9e;font-size:18px}',
  '.ch-sec{padding:12px 8px 4px;font-size:12px;font-weight:700;color:var(--muted,#6b7d9e)}',
  '.ch-empty{text-align:center;color:var(--muted,#6b7d9e);padding:34px 14px;font-size:13px;line-height:1.6}',
  '.ch-feed{flex:1;min-height:0;overflow-y:auto;padding:6px 14px 14px;overscroll-behavior:contain}',
  '.ch-day{display:flex;align-items:center;gap:10px;margin:14px 0 8px;color:var(--muted,#6b7d9e);font-size:12px;font-weight:700}',
  '.ch-day::before,.ch-day::after{content:"";flex:1;height:1px;background:var(--line,#e2ecfb)}',
  '.ch-msg{display:flex;margin:4px 0}',
  '.ch-msg.is-mine{justify-content:flex-end}',
  '.ch-bub{max-width:82%;background:#f1f5fb;border-radius:14px 14px 14px 4px;padding:7px 11px}',
  '.ch-msg.is-mine .ch-bub{background:#e3eeff;border-radius:14px 14px 4px 14px}',
  '.ch-bub .ch-who{display:block;font-size:12px;font-weight:700;color:var(--imode-navy,#0c225e);margin-bottom:1px}',
  '.ch-bub p{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.5}',
  '.ch-bub time{display:block;font-size:11px;color:var(--muted,#6b7d9e);text-align:right;margin-top:2px}',
  '.ch-msg.is-auto .ch-bub{background:#fff;border:1px solid var(--line,#e2ecfb);color:#3a4a6b;font-size:13px}',
  '.ch-ph{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}',
  '.ch-ph button{padding:0;border:1px solid var(--line,#e2ecfb);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in;line-height:0}',
  '.ch-ph img{display:block;width:110px;height:110px;object-fit:cover}',
  '.ch-compose{border-top:1px solid var(--line,#e2ecfb);padding:10px 12px calc(12px + env(safe-area-inset-bottom));flex:none;background:#fff}',
  '.ch-prev{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
  '.ch-prev:empty{display:none}',
  '.ch-prev span{position:relative;line-height:0}',
  '.ch-prev img{width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#e2ecfb)}',
  '.ch-prev button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:#12224a;color:#fff;font-size:12px;line-height:20px;cursor:pointer;padding:0}',
  '.ch-crow{display:flex;align-items:flex-end;gap:8px}',
  '.ch-crow textarea{flex:1;min-width:0;resize:none;border:1px solid var(--line-2,#dfe9f8);border-radius:12px;padding:9px 11px;font:inherit;font-size:14px;line-height:1.4;max-height:140px;min-height:42px;background:#f8fbff;color:inherit}',
  '.ch-crow textarea:focus{outline:none;border-color:var(--imode-blue,#0b63e5);background:#fff}',
  '.ch-send{flex:none;height:42px;border-radius:12px;border:0;background:var(--imode-blue,#0b63e5);color:#fff;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}',
  '.ch-send:disabled{opacity:.5;cursor:default}',
  '.ch-link{display:block;margin:8px 12px 0;text-align:center;font-size:13px;font-weight:700;color:var(--imode-blue,#0b63e5);text-decoration:none;flex:none}',
  '.ch-light{position:fixed;inset:0;z-index:12000;background:rgba(5,10,24,.88);display:grid;place-items:center;padding:20px;cursor:zoom-out}',
  '.ch-light img{max-width:100%;max-height:100%;border-radius:8px}',
  '.fw-chat{flex:none;border:1px solid #d3e0f4;background:#fff;color:#0b3f9e;border-radius:11px;padding:8px 13px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}',
  '.fw-chat:hover{border-color:#0b63e5}',
  '@media (max-width:900px){.ch-fab{bottom:calc(84px + env(safe-area-inset-bottom));right:14px;height:48px;padding:0 14px}.ch-fab span+span{display:none}}'
 ].join('');
 document.head.appendChild(css);

 /* ----------------------------------------------------------------- markup ---- */
 var fab=document.createElement('button');
 fab.type='button';fab.className='ch-fab';fab.id='chFab';fab.hidden=true;
 fab.setAttribute('aria-controls','chPanel');
 fab.innerHTML='<span aria-hidden="true">💬</span><span>แชท</span><em id="chFabN"></em>';
 var shade=document.createElement('div');shade.className='ch-shade';shade.hidden=true;
 var panel=document.createElement('aside');
 panel.className='ch-panel';panel.id='chPanel';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-label','แชท');
 document.body.appendChild(shade);document.body.appendChild(panel);document.body.appendChild(fab);
 var fileIn=document.createElement('input');
 fileIn.type='file';fileIn.accept='image/*';fileIn.multiple=true;fileIn.hidden=true;
 document.body.appendChild(fileIn);

 /* --------------------------------------------------------------- people ---- */
 function loadMe(c){
  if(me.id)return Promise.resolve(true);
  return c.auth.getSession().then(function(r){
   var s=r&&r.data&&r.data.session;
   me.id=s&&s.user?s.user.id:'';
   return !!me.id;
  },function(){return false});
 }
 function loadPeople(c){
  return Promise.resolve(c.from('profiles').select('id,username,full_name,role,is_active,technician_id').limit(500)).then(function(r){
   if(!r||r.error)return;
   people=(r.data||[]).filter(function(p){return p&&p.is_active!==false&&!/^customer$/i.test(String(p.role||''))})
    .map(function(p){return {id:p.id,name:String(p.full_name||'').trim()||String(p.username||'').trim(),role:String(p.role||''),tech:p.technician_id||''}})
    .filter(function(p){return p.name});
   byPerson={};
   people.forEach(function(p){byPerson[p.id]=p;if(p.id===me.id)me.name=p.name});
   people.sort(function(a,b){return a.name.localeCompare(b.name,'th')});
  },function(){});
 }

 /* ------------------------------------------------------------ personal ---- */
 function loadDms(c){
  return Promise.resolve(c.from(DM).select('id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at')
   .or('sender_id.eq.'+me.id+',recipient_id.eq.'+me.id).order('created_at',{ascending:false}).limit(1000)).then(function(r){
   if(r&&r.error){dmState=missingTable(r.error)?'nosql':'error';return}
   dms=(r&&r.data)||[];dmState='ok';
  },function(){dmState='error'});
 }
 function conversations(){
  var map={};
  dms.forEach(function(m){
   var other=m.sender_id===me.id?m.recipient_id:m.sender_id;
   var x=map[other]||(map[other]={id:other,last:null,unread:0});
   if(!x.last||m.created_at>x.last.created_at)x.last=m;
   if(m.recipient_id===me.id&&!m.read_at)x.unread++;
  });
  return map;
 }
 function dmUnread(){return dms.filter(function(m){return m.recipient_id===me.id&&!m.read_at}).length}

 /* --------------------------------------------------------------- cases ---- */
 function myTech(){var u=user();return (u&&u.technicianId)||''}
 function mine(c){
  var t=myTech();if(!t)return true;      /* office staff see every case */
  try{if(typeof window.imodeIsAssignedTo==='function')return !!window.imodeIsAssignedTo(c,t)}catch(e){}
  return String(c.assignee||'').split(',').map(function(x){return x.trim()}).indexOf(t)>=0;
 }
 function loadCaseLast(c){
  return Promise.resolve(c.from(LAST).select('case_id,last_at,messages').limit(10000)).then(function(r){
   if(r&&r.error){caseState=missingTable(r.error)?'nosql':'error';return}
   var m={};((r&&r.data)||[]).forEach(function(x){if(x&&x.case_id)m[x.case_id]=x});
   caseLast=m;caseState='ok';
  },function(){caseState='error'});
 }
 function seen(){return readJ(SEEN,{})||{}}
 function markCaseSeen(id){var o=seen();o[id]=new Date().toISOString();writeJ(SEEN,o)}
 function caseRows(){
  var s=seen(),out=[];
  caseList().forEach(function(c){
   if(!c||!c.id||!mine(c))return;
   var l=caseLast[c.id],closed=CLOSED.indexOf(String(c.status||''))>=0;
   if(closed&&!l)return;
   var at=l?l.last_at:'';
   out.push({c:c,at:at,count:l?l.messages:0,unread:!!(at&&(!s[c.id]||at>s[c.id])),closed:closed});
  });
  out.sort(function(a,b){
   var x=a.at||a.c.updatedAt||a.c.createdAt||'',y=b.at||b.c.updatedAt||b.c.createdAt||'';
   return x<y?1:x>y?-1:0;
  });
  return out;
 }
 function caseUnread(){
  var week=Date.now()-7*86400000;
  return caseRows().filter(function(r){return r.unread&&!r.closed&&Date.parse(r.at)>week}).length;
 }

 /* --------------------------------------------------------------- render ---- */
 function badge(){
  var n=dmUnread(),k=caseUnread();
  var f=document.getElementById('chFabN');if(f)f.textContent=(n+k)?String(n+k):'';
  var a=document.getElementById('chTabDmN');if(a)a.textContent=n?String(n):'';
  var b=document.getElementById('chTabCaseN');if(b)b.textContent=k?String(k):'';
 }
 function findCase(id){return caseList().filter(function(c){return c&&c.id===id})[0]||null}
 function render(){
  if(!isOpen)return;
  if(view.open)return renderThread();
  var q=(document.getElementById('chQ')||{}).value||'';
  panel.innerHTML='<div class="ch-head"><span aria-hidden="true">💬</span><div class="ch-sp"><b>แชท</b><small>คุยส่วนตัว และคุยในเคส/งาน</small></div>'
   +'<button type="button" class="ch-icon" data-ch="close" aria-label="ปิดแชท" title="ปิด">✕</button></div>'
   +'<div class="ch-tabs" role="tablist">'
   +'<button type="button" role="tab" data-ch-tab="dm" aria-selected="'+(view.tab==='dm')+'">👤 ส่วนตัว<em id="chTabDmN"></em></button>'
   +'<button type="button" role="tab" data-ch-tab="case" aria-selected="'+(view.tab==='case')+'">🛠 เคส / งาน<em id="chTabCaseN"></em></button></div>'
   +'<div class="ch-search"><input id="chQ" type="search" placeholder="'+(view.tab==='dm'?'ค้นหาชื่อคน':'ค้นหาเลขเคส / ลูกค้า')+'" value="'+esc(q)+'" aria-label="ค้นหา"></div>'
   +'<div class="ch-list" id="chList">'+(view.tab==='dm'?dmListHTML(q):caseListHTML(q))+'</div>';
  badge();
  var qi=document.getElementById('chQ');
  if(qi){qi.addEventListener('input',function(){document.getElementById('chList').innerHTML=view.tab==='dm'?dmListHTML(qi.value):caseListHTML(qi.value)});
   if(render.focusQ){render.focusQ=false;qi.focus();qi.setSelectionRange(qi.value.length,qi.value.length)}}
 }
 function match(q,s){q=String(q||'').trim().toLowerCase();return !q||String(s||'').toLowerCase().indexOf(q)>=0}
 function dmListHTML(q){
  if(dmState==='nosql')return '<div class="ch-empty">แชทส่วนตัวยังไม่พร้อมใช้<br>ต้องรันไฟล์ <b>supabase/15-direct-chat.sql</b> ในฐานข้อมูลก่อน</div>';
  if(dmState==='error')return '<div class="ch-empty">เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง</div>';
  if(dmState!=='ok'&&!people.length)return '<div class="ch-empty">กำลังโหลด...</div>';
  var conv=conversations(),talked=[],rest=[];
  people.forEach(function(p){
   if(p.id===me.id||!match(q,p.name+' '+p.role))return;
   (conv[p.id]?talked:rest).push(p);
  });
  talked.sort(function(a,b){return conv[a.id].last.created_at<conv[b.id].last.created_at?1:-1});
  function row(p){
   var x=conv[p.id],last=x&&x.last;
   var pre=last?((last.sender_id===me.id?'คุณ: ':'')+(last.body||'📷 รูปภาพ')):p.role;
   return '<button type="button" class="ch-row'+(x&&x.unread?' is-unread':'')+'" data-ch-dm="'+esc(p.id)+'">'
    +'<span class="ch-av" style="background:'+color(p.name)+'" aria-hidden="true">'+esc(initials(p.name))+'</span>'
    +'<span><b>'+esc(p.name)+'</b><small>'+esc(pre)+'</small></span>'
    +'<span class="ch-meta">'+(last?esc(when(last.created_at)):'')+(x&&x.unread?'<em>'+x.unread+'</em>':'')+'</span></button>';
  }
  var html='';
  if(talked.length)html+='<div class="ch-sec">ล่าสุด</div>'+talked.map(row).join('');
  if(rest.length)html+='<div class="ch-sec">ทุกคน</div>'+rest.map(row).join('');
  return html||'<div class="ch-empty">'+(q?'ไม่พบชื่อนี้':'ยังไม่มีรายชื่อพนักงาน')+'</div>';
 }
 function caseListHTML(q){
  if(caseState==='nosql')return '<div class="ch-empty">แชทเคสยังไม่พร้อมใช้<br>ต้องรันไฟล์ <b>supabase/14-case-chat.sql</b> ก่อน</div>';
  var rows=caseRows().filter(function(r){return match(q,[r.c.ticket,r.c.id,r.c.customer,r.c.machine].join(' '))});
  if(!rows.length)return '<div class="ch-empty">'+(q?'ไม่พบเคสนี้':(myTech()?'ยังไม่มีงานที่มอบหมายให้คุณ':'ยังไม่มีเคส'))+'</div>';
  return rows.slice(0,150).map(function(r){
   var c=r.c;
   return '<button type="button" class="ch-row'+(r.unread?' is-unread':'')+'" data-ch-case="'+esc(c.id)+'">'
    +'<span class="ch-av is-case" aria-hidden="true">🛠</span>'
    +'<span><b>'+esc(c.ticket||c.id)+' · '+esc(c.customer||'-')+'</b><small>'+esc((c.status||'-')+(r.count?' · '+r.count+' ข้อความ':' · ยังไม่มีข้อความ'))+'</small></span>'
    +'<span class="ch-meta">'+esc(when(r.at))+(r.unread?'<em>ใหม่</em>':'')+'</span></button>';
  }).join('');
 }

 /* ---------------------------------------------------------- one thread ---- */
 function threadTitle(){
  if(view.open.kind==='dm'){var p=byPerson[view.open.id];return {t:p?p.name:'แชทส่วนตัว',s:p?p.role:''}}
  var c=findCase(view.open.id);
  return {t:c?(c.ticket||c.id):'แชทเคส',s:c?((c.customer||'-')+' · '+(c.status||'-')):'แชททีมในเคสนี้'};
 }
 function renderThread(){
  var t=threadTitle(),isCase=view.open.kind==='case';
  panel.innerHTML='<div class="ch-head"><button type="button" class="ch-icon" data-ch="back" aria-label="กลับไปรายการแชท" title="กลับ">‹</button>'
   +'<div class="ch-sp"><b>'+esc(t.t)+'</b><small>'+esc(t.s)+'</small></div>'
   +'<button type="button" class="ch-icon" data-ch="close" aria-label="ปิดแชท" title="ปิด">✕</button></div>'
   +(isCase?'<a class="ch-link" href="./service-case-detail.html?caseId='+encodeURIComponent(view.open.id)+'">เปิดหน้าเคส ›</a>':'')
   +'<div class="ch-feed" id="chFeed" aria-live="polite">'+feedHTML()+'</div>'
   +'<form class="ch-compose" id="chForm" autocomplete="off"><div class="ch-prev" id="chPrev"></div>'
   +'<div class="ch-crow"><button type="button" class="ch-icon" data-ch="attach" aria-label="แนบรูป" title="แนบรูป (สูงสุด '+MAX_PHOTOS+' รูป)">📷</button>'
   +'<textarea id="chText" rows="1" placeholder="'+(isCase?'พิมพ์อัปเดตงาน... (ลูกค้าไม่เห็นแชทนี้)':'พิมพ์ข้อความ...')+'" aria-label="ข้อความ"></textarea>'
   +'<button type="submit" class="ch-send" id="chSend">ส่ง</button></div></form>';
  preview();badge();
  var ta=document.getElementById('chText');
  ta.addEventListener('input',function(){ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight+2)+'px'});
  ta.addEventListener('keydown',function(e){
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.matchMedia('(hover:hover)').matches){e.preventDefault();send()}
  });
  document.getElementById('chForm').addEventListener('submit',function(e){e.preventDefault();send()});
  var f=document.getElementById('chFeed');f.scrollTop=f.scrollHeight;
  if(window.matchMedia('(hover:hover)').matches)ta.focus();
 }
 var AUTO=/^(🔄|↩️|👷|🔧|🏭|📎|✏️)/;
 function feedHTML(){
  if(threadState==='loading')return '<div class="ch-empty">กำลังโหลด...</div>';
  if(threadState==='nosql')return '<div class="ch-empty">ยังใช้แชทนี้ไม่ได้ ต้องรันไฟล์ SQL ของแชทก่อน</div>';
  if(threadState==='error')return '<div class="ch-empty">เชื่อมต่อฐานข้อมูลไม่ได้</div>';
  if(!thread.length)return '<div class="ch-empty">ยังไม่มีข้อความ<br>เริ่มคุยได้เลย</div>';
  var html='',last='';
  thread.forEach(function(m){
   var t=Date.parse(m.created_at),dk=dayKey(t);
   if(dk!==last){html+='<div class="ch-day">'+esc(dayLabel(t))+'</div>';last=dk}
   var isMine=(m.sender_id||m.author_id)===me.id,name=m.sender_name||m.author_name||'พนักงาน';
   var ph=Array.isArray(m.photos)?m.photos.filter(function(p){return typeof p==='string'&&/^data:image\//.test(p)}):[];
   html+='<div class="ch-msg'+(isMine?' is-mine':'')+(AUTO.test(String(m.body||''))?' is-auto':'')+'" data-id="'+esc(m.id)+'"><div class="ch-bub">'
    +(!isMine&&view.open.kind==='case'?'<span class="ch-who">'+esc(name)+'</span>':'')
    +(m.body?'<p>'+esc(m.body)+'</p>':'')
    +(ph.length?'<div class="ch-ph">'+ph.map(function(p,i){return '<button type="button" data-ch-photo="'+i+'" aria-label="ดูรูปขนาดใหญ่"><img src="'+esc(p)+'" alt="รูปที่แนบ '+(i+1)+'" loading="lazy"></button>'}).join('')+'</div>':'')
    +'<time datetime="'+esc(m.created_at)+'">'+hhmm(t)+'</time></div></div>';
  });
  return html;
 }
 function repaintFeed(){
  var f=document.getElementById('chFeed');if(!f)return;
  var atEnd=f.scrollHeight-f.scrollTop-f.clientHeight<80;
  f.innerHTML=feedHTML();
  if(atEnd)f.scrollTop=f.scrollHeight;
 }
 function loadThread(){
  var c=db();if(!c||!view.open)return Promise.resolve();
  var o=view.open,q;
  if(o.kind==='dm'){
   q=c.from(DM).select('id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at')
    .or('and(sender_id.eq.'+me.id+',recipient_id.eq.'+o.id+'),and(sender_id.eq.'+o.id+',recipient_id.eq.'+me.id+')')
    .order('created_at',{ascending:true}).limit(500);
  }else{
   q=c.from(CM).select('id,case_id,body,photos,author_id,author_name,created_at').eq('case_id',o.id)
    .order('created_at',{ascending:true}).limit(500);
  }
  return Promise.resolve(q).then(function(r){
   if(!view.open||view.open!==o)return;
   if(r&&r.error){threadState=missingTable(r.error)?'nosql':'error';repaintFeed();return}
   thread=(r&&r.data)||[];threadState='ok';repaintFeed();markRead();
  },function(){threadState='error';repaintFeed()});
 }
 function markRead(){
  var o=view.open;if(!o)return;
  if(o.kind==='case'){markCaseSeen(o.id);badge();return}
  var c=db(),now=new Date().toISOString(),any=false;
  dms.forEach(function(m){if(m.sender_id===o.id&&m.recipient_id===me.id&&!m.read_at){m.read_at=now;any=true}});
  badge();
  if(!any||!c)return;
  Promise.resolve(c.from(DM).update({read_at:now}).eq('recipient_id',me.id).eq('sender_id',o.id).is('read_at',null)).then(function(){},function(){});
 }
 function openThread(kind,id){
  view.open={kind:kind,id:id};thread=[];threadState='loading';pending=[];
  renderThread();loadThread();
 }

 /* ------------------------------------------------------------- sending ---- */
 function shrink(file){
  return new Promise(function(res,rej){
   var r=new FileReader();
   r.onload=function(){
    var img=new Image();
    img.onload=function(){
     var s=Math.min(1,MAX_SIDE/Math.max(img.width,img.height)),cv=document.createElement('canvas');
     cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);
     cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
     res(cv.toDataURL('image/jpeg',JPEG_Q));
    };
    img.onerror=rej;img.src=r.result;
   };
   r.onerror=rej;r.readAsDataURL(file);
  });
 }
 function preview(){
  var b=document.getElementById('chPrev');if(!b)return;
  b.innerHTML=pending.map(function(p,i){return '<span><img src="'+esc(p)+'" alt="รูปที่จะส่ง '+(i+1)+'"><button type="button" data-ch-rm="'+i+'" aria-label="เอารูปนี้ออก">✕</button></span>'}).join('');
 }
 fileIn.addEventListener('change',function(){
  var files=[].slice.call(fileIn.files||[]).filter(function(f){return /^image\//.test(f.type)});
  fileIn.value='';
  files.slice(0,Math.max(0,MAX_PHOTOS-pending.length)).reduce(function(p,f){
   return p.then(function(){return shrink(f).then(function(d){pending.push(d)},function(){})});
  },Promise.resolve()).then(preview);
 });
 function send(){
  var c=db(),o=view.open,ta=document.getElementById('chText');
  if(!c||!o||sending||!ta)return;
  var body=ta.value.trim();
  if(!body&&!pending.length){ta.focus();return}
  sending=true;var btn=document.getElementById('chSend');btn.disabled=true;btn.textContent='กำลังส่ง...';
  var row=o.kind==='dm'?{recipient_id:o.id,body:body,photos:pending.slice()}:{case_id:o.id,body:body,photos:pending.slice()};
  var cols=o.kind==='dm'?'id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at':'id,case_id,body,photos,author_id,author_name,created_at';
  Promise.resolve(c.from(o.kind==='dm'?DM:CM).insert(row).select(cols)).then(function(r){
   sending=false;
   var b2=document.getElementById('chSend');if(b2){b2.disabled=false;b2.textContent='ส่ง'}
   if(r&&r.error){alert('ส่งไม่ได้: '+r.error.message);return}
   var got=(r&&r.data)||[];
   got.forEach(function(m){add(m)});
   if(o.kind==='dm')got.forEach(function(m){if(!dms.some(function(x){return x.id===m.id}))dms.unshift(m)});
   else{caseLast[o.id]={case_id:o.id,last_at:(got[0]||{}).created_at||new Date().toISOString(),messages:((caseLast[o.id]||{}).messages||0)+1};markCaseSeen(o.id)}
   var t2=document.getElementById('chText');if(t2){t2.value='';t2.style.height=''}
   pending=[];preview();repaintFeed();
   var f=document.getElementById('chFeed');if(f)f.scrollTop=f.scrollHeight;
  },function(err){
   sending=false;
   var b3=document.getElementById('chSend');if(b3){b3.disabled=false;b3.textContent='ส่ง'}
   alert('ส่งไม่ได้: '+(err&&err.message||'เชื่อมต่อไม่ได้'));
  });
 }
 function add(m){
  if(!m||thread.some(function(x){return x.id===m.id}))return false;
  thread.push(m);
  thread.sort(function(a,b){return a.created_at<b.created_at?-1:1});
  return true;
 }

 /* --------------------------------------------------------- open / close ---- */
 function open(){
  isOpen=true;panel.hidden=false;shade.hidden=false;fab.setAttribute('aria-expanded','true');
  if(!view.open)render();
  refresh();
 }
 function close(){
  isOpen=false;panel.hidden=true;shade.hidden=true;fab.setAttribute('aria-expanded','false');
  view.open=null;
  try{fab.focus()}catch(e){}
 }
 fab.addEventListener('click',function(){isOpen?close():open()});
 shade.addEventListener('click',close);
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&isOpen){e.preventDefault();close()}});
 panel.addEventListener('click',function(e){
  var t=e.target;
  var a=t.closest('[data-ch]');
  if(a){
   var k=a.getAttribute('data-ch');
   if(k==='close')close();
   else if(k==='back'){view.open=null;render();refresh()}
   else if(k==='attach'){if(pending.length>=MAX_PHOTOS)alert('แนบได้สูงสุด '+MAX_PHOTOS+' รูปต่อข้อความ');else fileIn.click()}
   return;
  }
  var tab=t.closest('[data-ch-tab]');
  if(tab){view.tab=tab.getAttribute('data-ch-tab');var qi=document.getElementById('chQ');if(qi)qi.value='';render();return}
  var dm=t.closest('[data-ch-dm]');if(dm){openThread('dm',dm.getAttribute('data-ch-dm'));return}
  var cs=t.closest('[data-ch-case]');if(cs){openThread('case',cs.getAttribute('data-ch-case'));return}
  var rm=t.closest('[data-ch-rm]');if(rm){pending.splice(Number(rm.getAttribute('data-ch-rm')),1);preview();return}
  var ph=t.closest('[data-ch-photo]');
  if(ph){
   var id=ph.closest('.ch-msg').getAttribute('data-id'),m=thread.filter(function(x){return x.id===id})[0];if(!m)return;
   var lb=document.createElement('div');lb.className='ch-light';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','รูปที่แนบ');
   lb.innerHTML='<img alt="รูปที่แนบ">';lb.firstChild.src=m.photos[Number(ph.getAttribute('data-ch-photo'))];
   lb.addEventListener('click',function(){lb.remove()});document.body.appendChild(lb);
  }
 });

 /* ---------------------------------------------------------------- data ---- */
 var busy=false,live=null;
 function refresh(){
  var c=db();
  if(busy||!c||!user()||isCustomer())return Promise.resolve();
  busy=true;
  return loadMe(c).then(function(ok){
   if(!ok){busy=false;return}
   fab.hidden=false;
   return Promise.all([people.length?null:loadPeople(c),loadDms(c),loadCaseLast(c)]).then(function(){
    busy=false;badge();
    if(isOpen&&!view.open)render();
    if(isOpen&&view.open&&view.open.kind==='dm')markRead();
    listen(c);
   });
  }).catch(function(){busy=false});
 }
 function listen(c){
  if(live||typeof c.channel!=='function')return;
  try{
   live=c.channel('chat-hub-'+Math.random().toString(36).slice(2,8))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:DM},function(p){
     var m=p&&p.new;if(!m||!m.id)return;
     if(!dms.some(function(x){return x.id===m.id}))dms.unshift(m);
     var o=view.open;
     if(isOpen&&o&&o.kind==='dm'&&(m.sender_id===o.id||m.recipient_id===o.id)){if(add(m))repaintFeed();markRead()}
     else if(isOpen&&!o)render();
     badge();
    })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:CM},function(p){
     var m=p&&p.new;if(!m||!m.case_id)return;
     var l=caseLast[m.case_id]||{case_id:m.case_id,messages:0};
     l.last_at=m.created_at;l.messages=(l.messages||0)+1;caseLast[m.case_id]=l;
     var o=view.open;
     if(isOpen&&o&&o.kind==='case'&&o.id===m.case_id){if(add(m))repaintFeed();markCaseSeen(o.id)}
     else if(isOpen&&!o)render();
     badge();
    })
    .subscribe();
  }catch(e){live=null}
 }

 /* ----------------------------------------------------- หน้างาน button ---- */
 function fieldButton(){
  var head=document.querySelector('#fwHead .fw-head'),rep=document.getElementById('fwReport');
  var id=rep&&rep.getAttribute('data-case');
  if(!head||!id||fab.hidden)return;
  var b=head.querySelector('.fw-chat');
  if(!b){
   b=document.createElement('button');b.type='button';b.className='fw-chat';
   b.innerHTML='💬 แชทงานนี้';
   b.addEventListener('click',function(){open();openThread('case',b.getAttribute('data-case'))});
   head.appendChild(b);
  }
  b.setAttribute('data-case',id);
 }
 function wrapField(){
  var base=window.renderFieldService;
  if(typeof base!=='function'||base.__chHub)return;
  var w=function(){var r=base.apply(this,arguments);try{fieldButton()}catch(e){}return r};
  w.__chHub=true;window.renderFieldService=w;
 }
 wrapField();
 window.addEventListener('load',wrapField,{once:true});
 var mo=new MutationObserver(function(){try{fieldButton()}catch(e){}});
 function observe(){var h=document.getElementById('fwHead');if(h&&!observe.on){observe.on=true;mo.observe(h,{childList:true})}}

 /* ---------------------------------------------------------------- boot ---- */
 window.imodeChatHub={
  open:open,close:close,refresh:refresh,
  openCase:function(id){open();openThread('case',id)},
  openPerson:function(id){open();openThread('dm',id)},
  state:function(){return {me:me.id,people:people.length,dms:dms.length,dmState:dmState,caseState:caseState,open:isOpen,view:view.open}}
 };
 var tries=0,t=setInterval(function(){
  observe();
  if((fab.hidden===false&&observe.on)||++tries>40){clearInterval(t);return}
  if(fab.hidden)refresh();               /* supa and currentUser appear once the app has signed in */
 },2000);
 setInterval(function(){if(!document.hidden)refresh()},60000);
 /* realtime is the fast path; this keeps an open conversation current without it */
 setInterval(function(){if(isOpen&&view.open&&!document.hidden&&!sending)loadThread()},20000);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
 refresh();
})();
