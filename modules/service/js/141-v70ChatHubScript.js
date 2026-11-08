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
     กลุ่ม    (2026-11-08) staff group chats — public.chat_groups / chat_group_members /
              group_messages (supabase/22-group-chat.sql); members only, admins included.
   หน้างาน (the technician's job page, js/32) gets a "💬 แชทงานนี้" button that opens the drawer
   straight on that job's chat.

   Until 15-direct-chat.sql is run the personal tab says so and the case tab still works. Nothing
   here writes to localStorage business keys or to `settings`. */
(function(){
 'use strict';
 if(document.getElementById('scdMain'))return;            /* the case page has its own panel */

 var DM='direct_messages',CM='case_messages',LAST='case_message_last';
 /* 2026-11-08 กลุ่ม: staff group chats (supabase/22-group-chat.sql). Rules agreed with the owner:
    anyone creates a group; the creator / admins rename it and add or remove members; any member can
    leave; only members read it (admins included); @ชื่อ and @ทุกคน (= every member) tags. */
 var GT='chat_groups',GM='chat_group_members',GX='group_messages',ALL_TAG='@ทุกคน';
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
 /* 2026-10-21 ข้อ 11 "ลูกค้าเห็นแชท เอาออกก่อน": every customer surface (QR scan, portal,
    customer home) counts, not only a signed-in customer account — js/01 knows them all. */
 function isCustomer(){
  var u=user();
  try{if(typeof window.imodeCustomerSurface==='function'&&window.imodeCustomerSurface())return true}catch(e){}
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
 var groups=[],gMembers={},gRead={},gAdded={},gMsgs=[],groupState='idle';
 var view={tab:'dm',open:null};      /* open: {kind:'dm'|'case'|'group',id} | {kind:'gform',id} */
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
  '.ch-av.is-group{border-radius:12px}',
  '.ch-new{display:flex;align-items:center;gap:10px;width:100%;border:1px dashed #b9d3f5;background:#f6faff;border-radius:12px;padding:10px;margin:6px 0 4px;cursor:pointer;font:inherit;font-weight:700;color:#0b63e5}',
  '.ch-at{color:#0b63e5;font-weight:700}.ch-at.is-me{background:#fff1e6;color:#c2410c;border-radius:6px;padding:0 3px}',
  '.ch-msg.is-tagged .ch-bub{box-shadow:inset 3px 0 0 #f27a1a}',
  '.ch-form{flex:1;min-height:0;overflow-y:auto;padding:12px 14px}',
  '.ch-form label.ch-lb{display:block;font-size:12.5px;font-weight:700;color:var(--muted,#6b7d9e);margin:10px 0 4px}',
  '.ch-form input[type=text]{width:100%;box-sizing:border-box;height:42px;border:1px solid var(--line-2,#dfe9f8);border-radius:11px;padding:0 12px;font:inherit;background:#f8fbff;color:inherit}',
  '.ch-mem{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:10px;cursor:pointer}',
  '.ch-mem:hover{background:#f4f8ff}.ch-mem input{width:18px;height:18px;flex:none}',
  '.ch-mem .ch-av{width:32px;height:32px;font-size:12px}',
  '.ch-mem small{display:block;color:var(--muted,#6b7d9e);font-size:12px}',
  '.ch-fbar{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}',
  '.ch-rename{display:flex;gap:8px;align-items:center}.ch-rename input{flex:1;min-width:0}',
  '.ch-owner-note{margin:10px 0 0;font-size:12.5px;color:var(--muted,#6b7d9e);line-height:1.5}',
  '.ch-sys{display:flex;justify-content:center;margin:8px 0}',
  '.ch-sys span{background:#eef3fb;color:#4a5b7d;border-radius:999px;padding:4px 12px;font-size:12px;text-align:center;max-width:90%}',
  '.ch-btn{height:38px;border-radius:10px;border:1px solid var(--line,#e2ecfb);background:#fff;font:inherit;font-weight:700;font-size:13px;color:var(--imode-navy,#0c225e);padding:0 12px;cursor:pointer}',
  '.ch-btn.is-primary{background:var(--imode-orange,#f27a1a);border-color:var(--imode-orange,#f27a1a);color:#fff}',
  '.ch-btn.is-danger{color:#c0262d;border-color:#f3c4c6}',
  '.ch-btn:disabled{opacity:.6;cursor:default}',
  '.ch-ffoot{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:10px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line,#e2ecfb);flex:none}',
  '.ch-tagpop{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
  '.ch-tagpop button{border:1px solid #cfe0fb;background:#f4f8ff;border-radius:999px;padding:4px 10px;font:inherit;font-size:12.5px;color:#0b3f9e;cursor:pointer}',
  '.ch-tagpop:empty{display:none}',
  '.ch-sec{padding:12px 8px 4px;font-size:12px;font-weight:700;color:var(--muted,#6b7d9e)}',
  '.ch-empty{text-align:center;color:var(--muted,#6b7d9e);padding:34px 14px;font-size:13px;line-height:1.6}',
  '.ch-feed{flex:1;min-height:0;overflow-y:auto;padding:6px 14px 14px;overscroll-behavior:contain}',
  '.ch-day{display:flex;align-items:center;gap:10px;margin:14px 0 8px;color:var(--muted,#6b7d9e);font-size:12px;font-weight:700}',
  '.ch-day::before,.ch-day::after{content:"";flex:1;height:1px;background:var(--line,#e2ecfb)}',
  '.ch-msg{display:flex;flex-direction:column;align-items:flex-start;margin:4px 0}',
  '.ch-msg.is-mine{align-items:flex-end}',
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
  '.ch-prev img{width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#e2ecfb);cursor:zoom-in}',
  '.ch-prev button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:#12224a;color:#fff;font-size:12px;line-height:20px;cursor:pointer;padding:0}',
  '.ch-crow{display:flex;align-items:flex-end;gap:8px}',
  '.ch-crow textarea{flex:1;min-width:0;resize:none;border:1px solid var(--line-2,#dfe9f8);border-radius:12px;padding:9px 11px;font:inherit;font-size:14px;line-height:1.4;max-height:140px;min-height:42px;background:#f8fbff;color:inherit}',
  '.ch-crow textarea:focus{outline:none;border-color:var(--imode-blue,#0b63e5);background:#fff}',
  '.ch-send{flex:none;height:42px;border-radius:12px;border:0;background:var(--imode-blue,#0b63e5);color:#fff;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}',
  '.ch-send:disabled{opacity:.5;cursor:default}',
  '.ch-links{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 12px 0;flex:none}',
  '.ch-link{display:block;text-align:center;font-size:13px;font-weight:700;color:var(--imode-blue,#0b63e5);text-decoration:none;background:none;border:0;padding:4px 6px;cursor:pointer;font-family:inherit}',
  '.ch-link.is-field{border:1px solid currentColor;border-radius:999px;padding:4px 12px}',
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
  /* 2026-10-21 ข้อ 14 "แชทที่มีข้อความใหม่ให้ขึ้นมาบนสุด": a conversation is placed by its
     last message, and every case that has one comes before a case nobody has written in —
     a case merely edited a minute ago no longer pushes a live conversation down. */
  out.sort(function(a,b){
   if(!!a.at!==!!b.at)return a.at?-1:1;
   var x=a.at||a.c.updatedAt||a.c.createdAt||'',y=b.at||b.c.updatedAt||b.c.createdAt||'';
   return x<y?1:x>y?-1:0;
  });
  return out;
 }
 function caseUnread(){
  var week=Date.now()-7*86400000;
  return caseRows().filter(function(r){return r.unread&&!r.closed&&Date.parse(r.at)>week}).length;
 }

 /* -------------------------------------------------------------- groups ---- */
 function loadGroups(c){
  return Promise.all([
   Promise.resolve(c.from(GT).select('id,name,created_by,owner_id,created_at,updated_at').limit(500)),
   Promise.resolve(c.from(GM).select('group_id,user_id,added_at,last_read_at').limit(5000))
  ]).then(function(rs){
   var g=rs[0],m=rs[1];
   if((g&&g.error)||(m&&m.error)){groupState=missingTable((g&&g.error)||(m&&m.error))?'nosql':'error';return}
   gMembers={};gRead={};gAdded={};
   ((m&&m.data)||[]).forEach(function(x){
    (gMembers[x.group_id]=gMembers[x.group_id]||[]).push(x.user_id);
    (gAdded[x.group_id]=gAdded[x.group_id]||{})[x.user_id]=x.added_at||'';
    if(x.user_id===me.id)gRead[x.group_id]=x.last_read_at||'';
   });
   /* only the groups I am in; an admin also sees the others in the database, not listed here */
   groups=((g&&g.data)||[]).filter(function(x){return Object.prototype.hasOwnProperty.call(gRead,x.id)});
   var ids=groups.map(function(x){return x.id});
   if(!ids.length){gMsgs=[];groupState='ok';return}
   return Promise.resolve(c.from(GX).select('id,group_id,sender_id,sender_name,body,kind,created_at').in('group_id',ids)
    .order('created_at',{ascending:false}).limit(1000)).then(function(r){
    if(r&&r.error){groupState=missingTable(r.error)?'nosql':'error';return}
    gMsgs=(r&&r.data)||[];groupState='ok';
   });
  },function(){groupState='error'});
 }
 function findGroup(id){return groups.filter(function(g){return g.id===id})[0]||null}
 /* 2026-11-08 owner (checklist 32): only the group's owner adds / removes people, renames and
    deletes — a system admin who is not the owner cannot. The database (chat_can_manage in
    22-group-chat.sql) is what actually decides; this only decides what to show. */
 function ownerOf(g){return g?(g.owner_id||g.created_by||''):''}
 function canManage(g){return !!g&&ownerOf(g)===me.id}
 /* who takes over when the owner leaves: the member who has been in the group longest (same
    order as the server's trigger) */
 function nextOwner(gid,leaving){
  var ad=gAdded[gid]||{};
  return (gMembers[gid]||[]).filter(function(u){return u!==leaving}).sort(function(a,b){
   var x=ad[a]||'',y=ad[b]||'';return x<y?-1:x>y?1:(a<b?-1:a>b?1:0);
  })[0]||'';
 }
 function personName(u){return (byPerson[u]||{}).name||'สมาชิก'}
 function groupRows(){
  return groups.map(function(g){
   var last=null,unread=0,since=gRead[g.id]||'';
   gMsgs.forEach(function(m){
    if(m.group_id!==g.id)return;
    if(!last||m.created_at>last.created_at)last=m;
    if(m.sender_id!==me.id&&(!since||m.created_at>since))unread++;
   });
   return {g:g,last:last,unread:unread,at:last?last.created_at:(g.updated_at||g.created_at||'')};
  }).sort(function(a,b){return a.at<b.at?1:a.at>b.at?-1:0});
 }
 function groupUnread(){return groupRows().reduce(function(n,r){return n+r.unread},0)}
 function tagsMe(body,gid){
  body=String(body||'');
  return (!!me.name&&body.indexOf('@'+me.name)>=0)||(body.indexOf(ALL_TAG)>=0&&(gMembers[gid]||[]).indexOf(me.id)>=0);
 }
 /* message text with @tags highlighted (the group's members and @ทุกคน) */
 function tagged(body,gid){
  var names=['ทุกคน'].concat((gMembers[gid]||[]).map(function(id){return (byPerson[id]||{}).name}).filter(Boolean))
   .sort(function(a,b){return b.length-a.length});
  var s=String(body||''),out='',i=0;
  while(i<s.length){
   var at=s.indexOf('@',i);if(at<0){out+=esc(s.slice(i));break}
   out+=esc(s.slice(i,at));
   var hit='';for(var k=0;k<names.length;k++)if(s.substr(at+1,names[k].length)===names[k]){hit=names[k];break}
   if(!hit){out+='@';i=at+1;continue}
   out+='<span class="ch-at'+((hit===me.name||hit==='ทุกคน')?' is-me':'')+'">@'+esc(hit)+'</span>';
   i=at+1+hit.length;
  }
  return out;
 }
 function groupNotices(){
  var since14=Date.now()-14*86400000,out=[];
  gMsgs.forEach(function(m){
   if(m.sender_id===me.id||Date.parse(m.created_at)<since14||!tagsMe(m.body,m.group_id))return;
   var g=findGroup(m.group_id);if(!g)return;
   var body=String(m.body||'').replace(/\s+/g,' ').trim(),since=gRead[g.id]||'';
   out.push({key:'group_mention_'+m.id,icon:'👥',title:'มีคนแท็กคุณในกลุ่ม '+g.name,
    message:(m.sender_name||'พนักงาน')+': '+(body.length>120?body.slice(0,120)+'…':body),
    createdAt:m.created_at,caseId:'',read:!!(since&&m.created_at<=since)});
  });
  return out;
 }
 /* tags in a group show in the bell (index.html), like a tag in a case chat (js/138) */
 (function installBell(){
  var tries=0;
  (function go(){
   var base=window.buildNotifications;
   if(typeof base!=='function'){if(++tries<30)setTimeout(go,1000);return}
   if(base.__groupChat)return;
   var w=function(){
    var list=base.apply(this,arguments)||[];
    var extra=groupNotices();if(!extra.length)return list;
    return list.concat(extra).sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0)});
   };
   for(var k in base)if(Object.prototype.hasOwnProperty.call(base,k))w[k]=base[k];
   w.__groupChat=true;window.buildNotifications=w;
  })();
 })();

 /* --------------------------------------------------------------- render ---- */
 function badge(){
  var n=dmUnread(),k=caseUnread(),g=groupUnread();
  var f=document.getElementById('chFabN');if(f)f.textContent=(n+k+g)?String(n+k+g):'';
  var gg=document.getElementById('chTabGrpN');if(gg)gg.textContent=g?String(g):'';
  var a=document.getElementById('chTabDmN');if(a)a.textContent=n?String(n):'';
  var b=document.getElementById('chTabCaseN');if(b)b.textContent=k?String(k):'';
 }
 function fieldOk(id){
  var c=findCase(id);
  return !!(c&&myTech()&&mine(c)&&typeof window.imodeOpenFieldJob==='function'&&CLOSED.indexOf(String(c.status||''))<0);
 }
 function findCase(id){return caseList().filter(function(c){return c&&c.id===id})[0]||null}
 function render(){
  if(!isOpen)return;
  if(view.open)return view.open.kind==='gform'?renderGroupForm():renderThread();
  var q=(document.getElementById('chQ')||{}).value||'';
  panel.innerHTML='<div class="ch-head"><span aria-hidden="true">💬</span><div class="ch-sp"><b>แชท</b><small>คุยส่วนตัว และคุยในเคส/งาน</small></div>'
   +'<button type="button" class="ch-icon" data-ch="close" aria-label="ปิดแชท" title="ปิด">✕</button></div>'
   +'<div class="ch-tabs" role="tablist">'
   +'<button type="button" role="tab" data-ch-tab="dm" aria-selected="'+(view.tab==='dm')+'">👤 ส่วนตัว<em id="chTabDmN"></em></button>'
   +'<button type="button" role="tab" data-ch-tab="group" aria-selected="'+(view.tab==='group')+'">👥 กลุ่ม<em id="chTabGrpN"></em></button>'
   +'<button type="button" role="tab" data-ch-tab="case" aria-selected="'+(view.tab==='case')+'">🛠 เคส / งาน<em id="chTabCaseN"></em></button></div>'
   +'<div class="ch-search"><input id="chQ" type="search" placeholder="'+(view.tab==='dm'?'ค้นหาชื่อคน':view.tab==='group'?'ค้นหาชื่อกลุ่ม':'ค้นหาเลขเคส / ลูกค้า')+'" value="'+esc(q)+'" aria-label="ค้นหา"></div>'
   +'<div class="ch-list" id="chList">'+listHTML(q)+'</div>';
  badge();
  var qi=document.getElementById('chQ');
  if(qi){qi.addEventListener('input',function(){document.getElementById('chList').innerHTML=listHTML(qi.value)});
   if(render.focusQ){render.focusQ=false;qi.focus();qi.setSelectionRange(qi.value.length,qi.value.length)}}
 }
 function listHTML(q){return view.tab==='dm'?dmListHTML(q):view.tab==='group'?groupListHTML(q):caseListHTML(q)}
 function groupListHTML(q){
  if(groupState==='nosql')return '<div class="ch-empty">กลุ่มแชทยังไม่พร้อมใช้<br>ต้องรันไฟล์ <b>supabase/22-group-chat.sql</b> ในฐานข้อมูลก่อน</div>';
  if(groupState==='error')return '<div class="ch-empty">เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง</div>';
  var html='<button type="button" class="ch-new" data-ch="gnew"><span class="ch-av is-group" style="background:#0b63e5" aria-hidden="true">＋</span>สร้างกลุ่มใหม่</button>';
  if(groupState!=='ok')return html+'<div class="ch-empty">กำลังโหลด...</div>';
  var rows=groupRows().filter(function(r){return match(q,r.g.name)});
  if(!rows.length)return html+'<div class="ch-empty">'+(q?'ไม่พบกลุ่มนี้':'ยังไม่มีกลุ่ม<br>กด "สร้างกลุ่มใหม่" เพื่อเริ่ม')+'</div>';
  return html+rows.map(function(r){
   var g=r.g,n=(gMembers[g.id]||[]).length,l=r.last;
   var pre=l?((l.sender_id===me.id?'คุณ: ':(l.sender_name?l.sender_name+': ':''))+(l.body||'📷 รูปภาพ')):n+' คน · ยังไม่มีข้อความ';
   return '<button type="button" class="ch-row'+(r.unread?' is-unread':'')+'" data-ch-group="'+esc(g.id)+'">'
    +'<span class="ch-av is-group" style="background:'+color(g.name)+'" aria-hidden="true">'+esc(initials(g.name))+'</span>'
    +'<span><b>'+esc(g.name)+'</b><small>'+esc(pre)+'</small></span>'
    +'<span class="ch-meta">'+(l?esc(when(l.created_at)):'')+(r.unread?'<em>'+r.unread+'</em>':'')+'</span></button>';
  }).join('');
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
  if(view.open.kind==='group'){var g=findGroup(view.open.id);return {t:g?g.name:'กลุ่ม',s:(gMembers[view.open.id]||[]).length+' คน · เฉพาะสมาชิกเห็นข้อความ'}}
  var c=findCase(view.open.id);
  return {t:c?(c.ticket||c.id):'แชทเคส',s:c?((c.customer||'-')+' · '+(c.status||'-')):'แชททีมในเคสนี้'};
 }
 function renderThread(){
  var t=threadTitle(),isCase=view.open.kind==='case',isGroup=view.open.kind==='group';
  panel.innerHTML='<div class="ch-head"><button type="button" class="ch-icon" data-ch="back" aria-label="กลับไปรายการแชท" title="กลับ">‹</button>'
   +'<div class="ch-sp"><b>'+esc(t.t)+'</b><small>'+esc(t.s)+'</small></div>'
   +(isGroup?'<button type="button" class="ch-icon" data-ch="gmanage" aria-label="สมาชิกและตั้งค่ากลุ่ม" title="สมาชิก / ตั้งค่ากลุ่ม">👥</button>':'')
   +'<button type="button" class="ch-icon" data-ch="close" aria-label="ปิดแชท" title="ปิด">✕</button></div>'
   +(isCase?'<div class="ch-links">'
     /* 2026-10-21 ข้อ 5: a technician goes from the case chat straight to this job on หน้างาน */
     +(fieldOk(view.open.id)?'<button type="button" class="ch-link is-field" data-ch="field">🔧 ไปหน้างานของงานนี้</button>':'')
     +'<a class="ch-link" href="./service-case-detail.html?caseId='+encodeURIComponent(view.open.id)+'">เปิดหน้าเคส ›</a></div>':'')
   +'<div class="ch-feed" id="chFeed" aria-live="polite">'+feedHTML()+'</div>'
   +'<form class="ch-compose" id="chForm" autocomplete="off"><div class="ch-tagpop" id="chTagPop"></div><div class="ch-prev" id="chPrev"></div>'
   +'<div class="ch-crow"><button type="button" class="ch-icon" data-ch="attach" aria-label="แนบรูป" title="แนบรูป (สูงสุด '+MAX_PHOTOS+' รูป)">📷</button>'
   +(isGroup?'<button type="button" class="ch-icon" data-ch="tag" aria-label="แท็กคน" title="แท็กคน / @ทุกคน">@</button>':'')
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
 function RX(){return window.imodeChatReactions||null}
 function feedHTML(){
  if(threadState==='loading')return '<div class="ch-empty">กำลังโหลด...</div>';
  if(threadState==='nosql')return '<div class="ch-empty">ยังใช้แชทนี้ไม่ได้ ต้องรันไฟล์ SQL ของแชทก่อน</div>';
  if(threadState==='error')return '<div class="ch-empty">เชื่อมต่อฐานข้อมูลไม่ได้</div>';
  if(!thread.length)return '<div class="ch-empty">ยังไม่มีข้อความ<br>เริ่มคุยได้เลย</div>';
  var html='',last='';
  thread.forEach(function(m){
   var t=Date.parse(m.created_at),dk=dayKey(t);
   if(dk!==last){html+='<div class="ch-day">'+esc(dayLabel(t))+'</div>';last=dk}
   if(m.kind==='system'){html+='<div class="ch-sys" data-id="'+esc(m.id)+'"><span>'+esc(m.body)+' · '+hhmm(t)+'</span></div>';return}
   var isMine=(m.sender_id||m.author_id)===me.id,name=m.sender_name||m.author_name||'พนักงาน';
   var ph=Array.isArray(m.photos)?m.photos.filter(function(p){return typeof p==='string'&&/^data:image\//.test(p)}):[];
   var isG=view.open.kind==='group';
   html+='<div class="ch-msg'+(isMine?' is-mine':'')+(AUTO.test(String(m.body||''))?' is-auto':'')+(isG&&!isMine&&tagsMe(m.body,m.group_id)?' is-tagged':'')+'" data-id="'+esc(m.id)+'"><div class="ch-bub">'
    +(!isMine&&view.open.kind!=='dm'?'<span class="ch-who">'+esc(name)+'</span>':'')
    +(m.body?'<p>'+(isG?tagged(m.body,m.group_id):esc(m.body))+'</p>':'')
    +(ph.length?'<div class="ch-ph">'+ph.map(function(p,i){return '<button type="button" data-ch-photo="'+i+'" aria-label="ดูรูปขนาดใหญ่"><img src="'+esc(p)+'" alt="รูปที่แนบ '+(i+1)+'" loading="lazy"></button>'}).join('')+'</div>':'')
    +'<time datetime="'+esc(m.created_at)+'">'+hhmm(t)+'</time></div>'
    +(RX()&&!isG&&!AUTO.test(String(m.body||''))?RX().bar(view.open.kind,m.id):'')     /* ข้อ 13, js/144 (not groups yet) */
    +'</div>';
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
  }else if(o.kind==='group'){
   q=c.from(GX).select('id,group_id,body,photos,kind,sender_id,sender_name,created_at').eq('group_id',o.id)
    .order('created_at',{ascending:true}).limit(500);
  }else{
   q=c.from(CM).select('id,case_id,body,photos,author_id,author_name,created_at').eq('case_id',o.id)
    .order('created_at',{ascending:true}).limit(500);
  }
  return Promise.resolve(q).then(function(r){
   if(!view.open||view.open!==o)return;
   if(r&&r.error){threadState=missingTable(r.error)?'nosql':'error';repaintFeed();return}
   thread=(r&&r.data)||[];threadState='ok';repaintFeed();markRead();
   if(RX()&&o.kind!=='group'){RX().use(c,me.id);RX().load(o.kind,thread.map(function(m){return m.id}))}
  },function(){threadState='error';repaintFeed()});
 }
 function markRead(){
  var o=view.open;if(!o)return;
  if(o.kind==='case'){markCaseSeen(o.id);badge();return}
  if(o.kind==='group'){
   var gc=db(),nowG=new Date().toISOString();
   gRead[o.id]=nowG;badge();
   if(gc)Promise.resolve(gc.from(GM).update({last_read_at:nowG}).eq('group_id',o.id).eq('user_id',me.id)).then(function(){},function(){});
   return;
  }
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
  b.innerHTML=pending.map(function(p,i){return '<span><img src="'+esc(p)+'" alt="รูปที่จะส่ง '+(i+1)+'" data-ch-big="'+i+'" title="กดเพื่อดูรูปเต็ม"><button type="button" data-ch-rm="'+i+'" aria-label="เอารูปนี้ออก">✕</button></span>'}).join('');
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
  var row=o.kind==='dm'?{recipient_id:o.id,body:body,photos:pending.slice()}:o.kind==='group'?{group_id:o.id,body:body,photos:pending.slice()}:{case_id:o.id,body:body,photos:pending.slice()};
  var cols=o.kind==='dm'?'id,sender_id,sender_name,recipient_id,body,photos,created_at,read_at':o.kind==='group'?'id,group_id,body,photos,sender_id,sender_name,created_at':'id,case_id,body,photos,author_id,author_name,created_at';
  Promise.resolve(c.from(o.kind==='dm'?DM:o.kind==='group'?GX:CM).insert(row).select(cols)).then(function(r){
   sending=false;
   var b2=document.getElementById('chSend');if(b2){b2.disabled=false;b2.textContent='ส่ง'}
   if(r&&r.error){alert('ส่งไม่ได้: '+r.error.message);return}
   var got=(r&&r.data)||[];
   got.forEach(function(m){add(m)});
   if(o.kind==='dm')got.forEach(function(m){if(!dms.some(function(x){return x.id===m.id}))dms.unshift(m)});
   else if(o.kind==='group'){got.forEach(function(m){if(!gMsgs.some(function(x){return x.id===m.id}))gMsgs.unshift(m)});gRead[o.id]=(got[0]||{}).created_at||gRead[o.id]}
   else{caseLast[o.id]={case_id:o.id,last_at:(got[0]||{}).created_at||new Date().toISOString(),messages:((caseLast[o.id]||{}).messages||0)+1};markCaseSeen(o.id)}
   var t2=document.getElementById('chText');if(t2){t2.value='';t2.style.height=''}
   pending=[];preview();repaintFeed();var tp=document.getElementById('chTagPop');if(tp)tp.innerHTML='';
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
 document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var lb=document.querySelector('.ch-light');if(lb){e.preventDefault();lb.remove();return}
  if(isOpen){e.preventDefault();close()}
 });
 panel.addEventListener('click',function(e){
  var t=e.target;
  var a=t.closest('[data-ch]');
  if(a){
   var k=a.getAttribute('data-ch');
   if(k==='close')close();
   else if(k==='back'){
    if(view.open&&view.open.kind==='gform'&&view.open.id&&findGroup(view.open.id))openThread('group',view.open.id);
    else{view.open=null;render();refresh()}
   }
   else if(k==='gnew'){view.open={kind:'gform',id:'',pick:{}};view.open.pick[me.id]=true;renderGroupForm()}
   else if(k==='gmanage'&&view.open){var gid=view.open.id,pk={};(gMembers[gid]||[]).forEach(function(u){pk[u]=true});view.open={kind:'gform',id:gid,pick:pk};renderGroupForm()}
   else if(k==='gall'){people.forEach(function(p){view.open.pick[p.id]=true});keepName();renderGroupForm()}
   else if(k==='gnone'){view.open.pick={};view.open.pick[me.id]=true;keepName();renderGroupForm()}
   else if(k==='gsave')saveGroup();
   else if(k==='gleave')leaveGroup();
   else if(k==='grename')renameGroup();
   else if(k==='gdelete')deleteGroup();
   else if(k==='tag')tagPop();
   else if(k==='tagins')insertTag(a.getAttribute('data-name'));
   else if(k==='field'&&view.open){var fid=view.open.id;close();try{window.imodeOpenFieldJob(fid)}catch(e){}}
   else if(k==='attach'){if(pending.length>=MAX_PHOTOS)alert('แนบได้สูงสุด '+MAX_PHOTOS+' รูปต่อข้อความ');else fileIn.click()}
   return;
  }
  var tab=t.closest('[data-ch-tab]');
  if(tab){view.tab=tab.getAttribute('data-ch-tab');var qi=document.getElementById('chQ');if(qi)qi.value='';render();return}
  var dm=t.closest('[data-ch-dm]');if(dm){openThread('dm',dm.getAttribute('data-ch-dm'));return}
  var cs=t.closest('[data-ch-case]');if(cs){openThread('case',cs.getAttribute('data-ch-case'));return}
  var gr=t.closest('[data-ch-group]');if(gr){openThread('group',gr.getAttribute('data-ch-group'));return}
  /* 2026-10-21 ข้อ 12: full size before sending too */
  var big=t.closest('[data-ch-big]');
  if(big){
   var lb0=document.createElement('div');lb0.className='ch-light';lb0.setAttribute('role','dialog');lb0.setAttribute('aria-label','รูปที่จะส่ง');
   lb0.innerHTML='<img alt="รูปที่จะส่ง">';lb0.firstChild.src=pending[Number(big.getAttribute('data-ch-big'))]||'';
   lb0.addEventListener('click',function(){lb0.remove()});document.body.appendChild(lb0);return;
  }
  var rm=t.closest('[data-ch-rm]');if(rm){pending.splice(Number(rm.getAttribute('data-ch-rm')),1);preview();return}
  var ph=t.closest('[data-ch-photo]');
  if(ph){
   var id=ph.closest('.ch-msg').getAttribute('data-id'),m=thread.filter(function(x){return x.id===id})[0];if(!m)return;
   var lb=document.createElement('div');lb.className='ch-light';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','รูปที่แนบ');
   lb.innerHTML='<img alt="รูปที่แนบ">';lb.firstChild.src=m.photos[Number(ph.getAttribute('data-ch-photo'))];
   lb.addEventListener('click',function(){lb.remove()});document.body.appendChild(lb);
  }
 });

 /* ----------------------------------------------------- group create / edit ---- */
 function keepName(){var n=document.getElementById('chGName');if(n&&view.open)view.open.name=n.value}
 function pickedCount(o){return Object.keys(o.pick).filter(function(k){return o.pick[k]}).length}
 function renderGroupForm(){
  var o=view.open,g=o.id?findGroup(o.id):null,manage=!g||canManage(g),fq=o.fq||'';
  if(o.name==null)o.name=g?g.name:'';
  var list=people.filter(function(p){return match(fq,p.name+' '+p.role)});
  var owner=ownerOf(g);
  panel.innerHTML='<div class="ch-head"><button type="button" class="ch-icon" data-ch="back" aria-label="กลับ" title="กลับ">‹</button>'
   +'<div class="ch-sp"><b>'+(g?(manage?'ตั้งค่ากลุ่ม':'สมาชิกกลุ่ม'):'สร้างกลุ่มใหม่')+'</b><small id="chGCount">'+pickedCount(o)+' คนในกลุ่ม · เฉพาะสมาชิกเห็นข้อความ</small></div>'
   +'<button type="button" class="ch-icon" data-ch="close" aria-label="ปิดแชท" title="ปิด">✕</button></div>'
   +'<div class="ch-form">'
   +'<label class="ch-lb" for="chGName">ชื่อกลุ่ม</label>'
   /* 2026-11-08 (checklist 32): renaming has its own button at the top, so it is not hidden in the save */
   +(g&&manage
     ?'<div class="ch-rename"><input type="text" id="chGName" maxlength="80" value="'+esc(o.name)+'"><button type="button" class="ch-btn" data-ch="grename" id="chGRename">✏ เปลี่ยนชื่อ</button></div>'
     :'<input type="text" id="chGName" maxlength="80" placeholder="เช่น ทีมช่างภาคตะวันออก" value="'+esc(o.name)+'"'+(manage?'':' disabled')+'>')
   +(g&&!manage?'<p class="ch-owner-note">เฉพาะเจ้าของกลุ่ม ('+esc(personName(owner))+') เพิ่มคน เอาคนออก และเปลี่ยนชื่อกลุ่มได้</p>':'')
   +'<label class="ch-lb" for="chGQ">สมาชิก'+(manage?' (เลือกทีละคน หรือเลือกทั้งหมด)':'')+'</label>'
   +(manage?'<div class="ch-fbar"><button type="button" class="ch-btn" data-ch="gall">เลือกทั้งหมด</button><button type="button" class="ch-btn" data-ch="gnone">ล้าง</button></div>':'')
   +'<input type="text" id="chGQ" placeholder="ค้นหาชื่อคน" value="'+esc(fq)+'" aria-label="ค้นหาชื่อคน">'
   +'<div id="chGList">'+list.map(function(p){
     var on=!!o.pick[p.id],self=p.id===me.id;
     if(!manage&&!on)return '';
     return '<label class="ch-mem"><input type="checkbox" data-ch-pick="'+esc(p.id)+'"'+(on?' checked':'')+((!manage||self)?' disabled':'')+'>'
      +'<span class="ch-av" style="background:'+color(p.name)+'" aria-hidden="true">'+esc(initials(p.name))+'</span>'
      +'<span><b>'+esc(p.name)+(self?' (คุณ)':'')+(g&&owner===p.id?' · เจ้าของกลุ่ม':'')+'</b><small>'+esc(p.role)+'</small></span></label>';
    }).join('')+'</div></div>'
   +'<div class="ch-ffoot"><span>'
   +(g?'<button type="button" class="ch-btn is-danger" data-ch="gleave">ออกจากกลุ่ม</button>':'')
   +(g&&manage?' <button type="button" class="ch-btn is-danger" data-ch="gdelete">ลบกลุ่ม</button>':'')+'</span>'
   +(manage?'<button type="button" class="ch-btn is-primary" data-ch="gsave" id="chGSave">'+(g?'บันทึกสมาชิก':'สร้างกลุ่ม')+'</button>':'')+'</div>';
  var gq=document.getElementById('chGQ');
  gq.addEventListener('input',function(){keepName();o.fq=gq.value;renderGroupForm();var x=document.getElementById('chGQ');x.focus();x.setSelectionRange(x.value.length,x.value.length)});
  document.getElementById('chGList').addEventListener('change',function(e){
   var cb=e.target.closest('[data-ch-pick]');if(!cb)return;
   o.pick[cb.getAttribute('data-ch-pick')]=cb.checked;keepName();
   var sm=document.getElementById('chGCount');if(sm)sm.textContent=pickedCount(o)+' คนในกลุ่ม · เฉพาะสมาชิกเห็นข้อความ';
  });
  if(!g&&!o.fq)setTimeout(function(){var n=document.getElementById('chGName');if(n&&!n.value)n.focus()},30);
 }
 function saveGroup(){
  var c=db(),o=view.open;if(!c||!o)return;
  keepName();
  var name=String(o.name||'').trim();
  if(!name){alert('กรุณาตั้งชื่อกลุ่ม');var n=document.getElementById('chGName');if(n)n.focus();return}
  var want=Object.keys(o.pick).filter(function(k){return o.pick[k]&&k!==me.id});
  var btn=document.getElementById('chGSave');if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก...'}
  function fail(msg){if(btn){btn.disabled=false;btn.textContent=o.id?'บันทึกสมาชิก':'สร้างกลุ่ม'}alert(msg)}
  var step;
  if(!o.id){
   step=Promise.resolve(c.from(GT).insert({name:name}).select('id,name,created_by,created_at,updated_at')).then(function(r){
    if(r&&r.error)throw r.error;
    var g=(r&&r.data||[])[0];if(!g)throw new Error('สร้างกลุ่มไม่สำเร็จ');
    groups.unshift(g);gMembers[g.id]=[me.id];gRead[g.id]=new Date().toISOString();o.id=g.id;
    gAdded[g.id]={};gAdded[g.id][me.id]=gRead[g.id];
    return want.length?Promise.resolve(c.from(GM).insert(want.map(function(u){return {group_id:g.id,user_id:u}}))).then(function(x){if(x&&x.error)throw x.error;gMembers[g.id]=[me.id].concat(want)}):null;
   });
  }else{
   var had=(gMembers[o.id]||[]).filter(function(u){return u!==me.id});
   var add=want.filter(function(u){return had.indexOf(u)<0}),drop=had.filter(function(u){return want.indexOf(u)<0});
   var g0=findGroup(o.id);
   /* 2026-11-08 (checklist 32): ask before anyone is taken out */
   if(drop.length&&!confirm('เอาคนเหล่านี้ออกจากกลุ่ม?\n\n'+drop.map(function(u){return '• '+personName(u)}).join('\n')+'\n\nเขาจะไม่เห็นกลุ่มและข้อความอีก จนกว่าจะเพิ่มกลับเข้ามา')){
    if(btn){btn.disabled=false;btn.textContent='บันทึกสมาชิก'}return;
   }
   step=Promise.all([
    g0&&g0.name!==name?Promise.resolve(c.from(GT).update({name:name}).eq('id',o.id)).then(function(r){if(r&&r.error)throw r.error;g0.name=name}):null,
    add.length?Promise.resolve(c.from(GM).insert(add.map(function(u){return {group_id:o.id,user_id:u}}))).then(function(r){if(r&&r.error)throw r.error}):null,
    drop.length?Promise.resolve(c.from(GM).delete().eq('group_id',o.id).in('user_id',drop)).then(function(r){if(r&&r.error)throw r.error}):null
   ]).then(function(){
    gMembers[o.id]=[me.id].concat(want);
    var ad=gAdded[o.id]=gAdded[o.id]||{},now=new Date().toISOString();
    add.forEach(function(u){ad[u]=now});drop.forEach(function(u){delete ad[u]});
   });
  }
  step.then(function(){openThread('group',o.id)},function(e){fail('บันทึกกลุ่มไม่ได้: '+((e&&e.message)||'เชื่อมต่อไม่ได้'))});
 }
 function renameGroup(){
  var c=db(),o=view.open;if(!c||!o||!o.id)return;
  var g=findGroup(o.id),n=document.getElementById('chGName'),name=String(n?n.value:'').trim();
  if(!name){alert('กรุณาตั้งชื่อกลุ่ม');if(n)n.focus();return}
  if(g&&g.name===name){alert('ชื่อกลุ่มยังเหมือนเดิม');return}
  var b=document.getElementById('chGRename');if(b){b.disabled=true;b.textContent='กำลังบันทึก...'}
  Promise.resolve(c.from(GT).update({name:name}).eq('id',o.id).select('id,name')).then(function(r){
   if(b){b.disabled=false;b.textContent='✏ เปลี่ยนชื่อ'}
   if(r&&r.error){alert('เปลี่ยนชื่อไม่ได้: '+r.error.message);return}
   if(!r||!r.data||!r.data.length){alert('เปลี่ยนชื่อไม่ได้: เปลี่ยนได้เฉพาะเจ้าของกลุ่ม');return}
   if(g)g.name=r.data[0].name;o.name=r.data[0].name;
   alert('เปลี่ยนชื่อกลุ่มเป็น "'+o.name+'" แล้ว');
  },function(){if(b){b.disabled=false;b.textContent='✏ เปลี่ยนชื่อ'}alert('เปลี่ยนชื่อไม่ได้: เชื่อมต่อไม่ได้')});
 }
 function leaveGroup(){
  var c=db(),o=view.open;if(!c||!o||!o.id)return;
  var g=findGroup(o.id),others=(gMembers[o.id]||[]).filter(function(u){return u!==me.id});
  /* 2026-11-08 owner (a/b): the last one out deletes the group; the owner leaving hands it over */
  var msg='ออกจากกลุ่ม "'+(g?g.name:'')+'"?\nคุณจะไม่เห็นข้อความในกลุ่มนี้อีก จนกว่าจะมีคนเพิ่มกลับเข้ามา';
  if(!others.length)msg='คุณเป็นสมาชิกคนสุดท้ายของกลุ่ม "'+(g?g.name:'')+'"\nถ้าออก กลุ่มและข้อความทั้งหมดจะถูกลบ กู้คืนไม่ได้\n\nออกจากกลุ่มและลบกลุ่ม?';
  else if(canManage(g))msg='ออกจากกลุ่ม "'+(g?g.name:'')+'"?\nคุณเป็นเจ้าของกลุ่ม สิทธิ์ดูแลกลุ่มจะโอนให้ '+personName(nextOwner(o.id,me.id))+' (อยู่ในกลุ่มนานที่สุด)\nคุณจะไม่เห็นข้อความในกลุ่มนี้อีก';
  if(!confirm(msg))return;
  Promise.resolve(c.from(GM).delete().eq('group_id',o.id).eq('user_id',me.id)).then(function(r){
   if(r&&r.error){alert('ออกจากกลุ่มไม่ได้: '+r.error.message);return}
   groups=groups.filter(function(x){return x.id!==o.id});delete gRead[o.id];
   view.open=null;view.tab='group';render();badge();
  });
 }
 function deleteGroup(){
  var c=db(),o=view.open;if(!c||!o||!o.id)return;
  var g=findGroup(o.id);
  if(!confirm('ลบกลุ่ม "'+(g?g.name:'')+'" และข้อความทั้งหมดในกลุ่ม?\nลบแล้วกู้คืนไม่ได้'))return;
  Promise.resolve(c.from(GT).delete().eq('id',o.id).select('id')).then(function(r){
   if(r&&r.error){alert('ลบกลุ่มไม่ได้: '+r.error.message);return}
   if(!r||!r.data||!r.data.length){alert('ลบกลุ่มไม่ได้: ลบได้เฉพาะเจ้าของกลุ่ม');return}
   groups=groups.filter(function(x){return x.id!==o.id});gMsgs=gMsgs.filter(function(m){return m.group_id!==o.id});delete gRead[o.id];
   view.open=null;view.tab='group';render();badge();
  });
 }
 /* the @ button in a group: @ทุกคน and each member */
 function tagPop(){
  var b=document.getElementById('chTagPop'),o=view.open;if(!b||!o)return;
  if(b.innerHTML){b.innerHTML='';return}
  var names=(gMembers[o.id]||[]).filter(function(u){return u!==me.id}).map(function(u){return (byPerson[u]||{}).name}).filter(Boolean)
   .sort(function(a,c){return a.localeCompare(c,'th')});
  b.innerHTML=['ทุกคน'].concat(names).map(function(n){return '<button type="button" data-ch="tagins" data-name="'+esc(n)+'">@'+esc(n)+'</button>'}).join('');
 }
 function insertTag(n){
  var ta=document.getElementById('chText');if(!ta||!n)return;
  var pos=ta.selectionStart==null?ta.value.length:ta.selectionStart,v=ta.value;
  var pre=pos>0&&!/\s/.test(v.charAt(pos-1))?' ':'';
  var ins=pre+'@'+n+' ';
  ta.value=v.slice(0,pos)+ins+v.slice(pos);
  var cpos=pos+ins.length;ta.focus();ta.setSelectionRange(cpos,cpos);
  document.getElementById('chTagPop').innerHTML='';
 }

 /* ---------------------------------------------------------------- data ---- */
 var busy=false,live=null;
 function refresh(){
  var c=db();
  if(isCustomer()){hideForCustomer();return Promise.resolve()}
  if(busy||!c||!user())return Promise.resolve();
  busy=true;
  return loadMe(c).then(function(ok){
   if(!ok){busy=false;return}
   fab.hidden=false;
   return Promise.all([people.length?null:loadPeople(c),loadDms(c),loadCaseLast(c),loadGroups(c)]).then(function(){
    busy=false;badge();
    if(isOpen&&!view.open)render();
    if(isOpen&&view.open&&(view.open.kind==='dm'||view.open.kind==='group'))markRead();
    listen(c);
   });
  }).catch(function(){busy=false});
 }
 /* The same device can go from staff to a customer page without a reload (the portal, a
    scanned QR), so the button is taken away again, not only never shown. */
 function hideForCustomer(){
  fab.hidden=true;
  try{if(isOpen)close()}catch(e){}
 }
 setInterval(function(){if(!fab.hidden&&isCustomer())hideForCustomer()},1500);
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
    .on('postgres_changes',{event:'INSERT',schema:'public',table:GX},function(p){
     var m=p&&p.new;if(!m||!m.id||!findGroup(m.group_id))return;
     if(!gMsgs.some(function(x){return x.id===m.id}))gMsgs.unshift(m);
     var o=view.open;
     if(isOpen&&o&&o.kind==='group'&&o.id===m.group_id){if(add(m))repaintFeed();markRead()}
     else if(isOpen&&!o)render();
     badge();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:GM},function(){
     /* someone added me to a group, or took me out: reload the list */
     var c2=db();if(c2)loadGroups(c2).then(function(){if(isOpen&&!view.open)render();badge()});
    })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:CM},function(p){
     var m=p&&p.new;if(!m||!m.case_id)return;
     if(/^(🔄|↩️|👷|🔧|🏭)/.test(String(m.body||''))&&typeof window.imodeRealtimeRefetch==='function'){
      try{window.imodeRealtimeRefetch('service_cases',m.case_id)}catch(e){}
     }
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
  openGroup:function(id){open();view.tab='group';openThread('group',id)},
  state:function(){return {me:me.id,people:people.length,dms:dms.length,dmState:dmState,caseState:caseState,groupState:groupState,groups:groups.length,open:isOpen,view:view.open}}
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
