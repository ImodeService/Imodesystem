/* 2026-10-16: team chat inside a service case ("เพิ่มหน้าแชทในเคสเอาไว้ให้ทีมอัพเดตงาน").
   Like Odoo's chatter: a panel on the right of the case page where staff post updates and photos.
   - messages are grouped by day with a date line between days (วันนี้ / เมื่อวาน / date), as in
     Facebook Messenger; each one shows the time it was sent, hovering the time shows the full date
     and time;
   - an OPEN case with no chat update for N days (settings.caseChatRemindDays, default 1, 0 = off)
     shows a reminder on the case and in the bell, again every N days; a closed case never reminds;
   - status changes the page already records (settings.caseStatusLog) show in the feed as grey lines.
   2026-10-19 ("ทำให้แชทสามารถแท็กคนได้"): typing @ in the box lists the staff (public.profiles,
   which staff may read) and picking one inserts "@ชื่อ". Tags are highlighted in the feed (your own
   name in orange), and a message that tags you shows in the bell on index.html for 14 days, even on
   a case you are not assigned to. The tag is the text itself, matched against profiles.full_name
   (or username), the same name the server stamps as author_name, so no new column is needed.
   Messages live in Supabase public.case_messages (supabase/14-case-chat.sql): staff only, never
   customers. Until that SQL is run the panel says so and nothing else changes.

   One file for both documents:
     service-case-detail.html → the panel (its own Supabase client, the platform session, as js/137)
     index.html               → reminders in the bell + the "days" field in ตั้งค่าการแจ้งเตือน */
(function(){
 'use strict';
 var TABLE='case_messages',VIEW='case_message_last';
 var CLOSED=['เสร็จสิ้น','ปิดเคส','ยกเลิก'];
 var DAY=86400000;
 var MAX_PHOTOS=4,MAX_SIDE=1280,JPEG_Q=0.72;

 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function readJ(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
 function remindDays(s){
  var v=s&&s.caseChatRemindDays;
  if(v===0||v==='0')return 0;
  v=Number(v);return v>0?Math.min(v,60):1;
 }
 function isClosed(c){return !!c&&CLOSED.indexOf(String(c.status||''))>=0}
 /* the moment the case was last "updated": its newest message, or when it was opened */
 function staleInfo(c,lastAt,days){
  if(!c||!days||isClosed(c))return null;
  var base=Math.max(Date.parse(lastAt||'')||0,Date.parse(c.createdAt||'')||0);
  if(!base)return null;
  var el=Date.now()-base,period=days*DAY;
  if(el<period)return null;
  var n=Math.floor(el/period);
  return {base:base,days:Math.floor(el/DAY),n:n,dueAt:base+n*period};
 }
 function missingTable(err){
  return /PGRST205|PGRST202|42P01|does not exist|Could not find/i.test(String(err&&(err.code+' '+err.message)||''));
 }

 var onDetail=!!document.getElementById('scdMain');
 if(onDetail)detailPage();else mainApp();

 /* ====================================================================== index.html ===== */
 function mainApp(){
  function db(){try{return (typeof supa!=='undefined'&&supa)?supa:null}catch(e){return null}}
  function sett(){try{return settings||{}}catch(e){return {}}}
  function user(){try{return currentUser||null}catch(e){return null}}
  var last={},ready=false,missing=false,fetching=false;
  var mentions=[],meId='',meName='',mentionAt=0;
  function pullMentions(){
   var c=db();if(!c||missing||!user()||Date.now()-mentionAt<50000)return;
   mentionAt=Date.now();
   c.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;if(!s||!s.user){mentionAt=0;return null}
    if(meName&&meId===s.user.id)return meName;
    meId=s.user.id;
    return c.from('profiles').select('full_name,username').eq('id',meId).maybeSingle().then(function(p){
     var d=p&&p.data;meName=d?(String(d.full_name||'').trim()||String(d.username||'').trim()):'';return meName;
    });
   }).then(function(name){
    if(!name)return;
    var since=new Date(Date.now()-14*DAY).toISOString();
    var pat='%@'+name.replace(/[\\%_]/g,'\\$&')+'%';
    return c.from(TABLE).select('id,case_id,body,author_id,author_name,created_at').ilike('body',pat)
     .gt('created_at',since).neq('author_id',meId).order('created_at',{ascending:false}).limit(50).then(function(r){
      if(!r||r.error)return;mentions=r.data||[];repaint();
     });
   }).catch(function(){});
  }

  function pull(){
   var c=db();if(!c||fetching||missing||!user())return;
   pullMentions();
   fetching=true;
   try{
    c.from(VIEW).select('case_id,last_at').limit(10000).then(function(r){
     fetching=false;
     if(!r||r.error){if(r&&r.error&&missingTable(r.error)){missing=true;console.info('[case chat] '+VIEW+' missing — run supabase/14-case-chat.sql')}return}
     var m={};(r.data||[]).forEach(function(x){if(x&&x.case_id)m[x.case_id]=x.last_at});
     last=m;ready=true;repaint();
    },function(){fetching=false});
   }catch(e){fetching=false}
  }
  function repaint(){try{if(typeof renderNotifications==='function')renderNotifications()}catch(e){}}
  function mine(c){
   var u=user(),t=u&&u.technicianId;if(!t)return true;
   try{if(typeof window.imodeIsAssignedTo==='function')return !!window.imodeIsAssignedTo(c,t)}catch(e){}
   return String(c.assignee||'').split(',').map(function(x){return x.trim()}).indexOf(t)>=0;
  }
  function reads(){
   var u=user(),k=u&&(u.username||u.id);if(!k)return {};
   var o=readJ('imode_v70_notice_reads',{})||{};return o[k]||{};
  }
  function notices(){
   var list=[];try{list=Array.isArray(cases)?cases:[]}catch(e){}
   var rd=reads(),out=[],days=ready?remindDays(sett()):0;
   mentions.forEach(function(m){
    var key='chat_mention_'+m.id,c=null;
    for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===m.case_id){c=list[i];break}
    var body=String(m.body||'').replace(/\s+/g,' ').trim();
    out.push({key:key,icon:'💬',title:'มีคนแท็กคุณในแชทเคส',
     message:((c&&c.ticket)||m.case_id)+' · '+(m.author_name||'พนักงาน')+': '+(body.length>120?body.slice(0,120)+'…':body||'(รูปภาพ)'),
     createdAt:m.created_at,caseId:m.case_id,read:!!rd[key]});
   });
   if(days)list.forEach(function(c){
    if(!c||!c.id||!mine(c))return;
    var st=staleInfo(c,last[c.id],days);if(!st)return;
    var key='auto_chat_'+c.id+'_'+st.n;
    out.push({key:key,icon:'💬',title:'ถึงเวลาอัปเดตเคส',
     message:(c.ticket||c.id)+' · '+(c.customer||'-')+' · ไม่มีอัปเดตในแชทมา '+st.days+' วัน',
     createdAt:new Date(st.dueAt).toISOString(),caseId:c.id,read:!!rd[key]});
   });
   return out;
  }
  function install(){
   var base=window.buildNotifications;
   if(typeof base!=='function'||base.__caseChat)return false;
   var w=function(){
    var list=base.apply(this,arguments)||[];
    var extra=notices();if(!extra.length)return list;
    return list.concat(extra).sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0)});
   };
   w.__caseChat=true;w.__center=base.__center;
   window.buildNotifications=w;
   return true;
  }

  /* the number of days, in ตั้งค่า → การแจ้งเตือน */
  var baseOpen=window.openNotificationSettingModal;
  if(typeof baseOpen==='function')window.openNotificationSettingModal=function(){
   var r=baseOpen.apply(this,arguments);
   setTimeout(function(){
    var f=document.getElementById('notiForm');if(!f||f.querySelector('#ccRemindDays'))return;
    var d=remindDays(sett());
    var box=document.createElement('div');box.className='field';
    box.innerHTML='<label for="ccRemindDays">เตือนให้อัปเดตเคสในแชท เมื่อไม่มีอัปเดตกี่วัน (0 = ปิด)</label>'
     +'<input id="ccRemindDays" type="number" min="0" max="60" step="1" value="'+d+'">';
    var first=f.querySelector('.field');
    if(first&&first.nextSibling)f.insertBefore(box,first.nextSibling);else f.insertBefore(box,f.firstChild);
    var orig=f.onsubmit;
    f.onsubmit=function(e){
     var v=Math.max(0,Math.min(60,Math.floor(Number(document.getElementById('ccRemindDays').value)||0)));
     try{settings.caseChatRemindDays=v}catch(x){}
     return orig?orig.call(this,e):undefined;
    };
   },80);
   return r;
  };

  var baseSync=window.syncCloud;
  if(typeof baseSync==='function')window.syncCloud=function(){
   var r=baseSync.apply(this,arguments);
   var after=function(){setTimeout(pull,300)};
   if(r&&typeof r.then==='function')r.then(after,after);else after();
   return r;
  };
  if(!install())document.addEventListener('DOMContentLoaded',install,{once:true});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)pull()});
  setInterval(pull,60000);
  /* supa and currentUser appear once the app has booted and signed in */
  var tries=0,t=setInterval(function(){if(ready||missing||++tries>30){clearInterval(t);return}pull()},2000);
  pull();
  window.imodeCaseChatState=function(){return {ready:ready,missing:missing,cases:Object.keys(last).length,days:remindDays(sett())}};
 }

 /* ======================================================= service-case-detail.html ===== */
 function detailPage(){
  var E=window.IMODE_ENV;
  var param=(new URLSearchParams(location.search).get('caseId')||new URLSearchParams(location.search).get('case')||'').trim();
  if(!param)return;
  var appUser=readJ('imode_v5_current_user',null);
  if(appUser&&(appUser.accountType==='customer'||/^customer$/i.test(String(appUser.role||''))))return;

  var client=null;
  function db(){
   if(client)return client;
   var c=null;
   if(E&&E.cloud&&E.cloud.url&&E.cloud.key)c=E.cloud;
   else{var x=readJ('imode_v5_cloud',null);if(x&&x.url&&x.key)c=x}
   if(!c||!window.supabase)return null;
   try{client=window.supabase.createClient(c.url,c.key,window.IMODE_SB_OPTIONS)}catch(e){client=null}
   return client;
  }
  function findCase(){
   var list=readJ('imode_test_v532_cases',[])||[];
   for(var i=0;i<list.length;i++){var c=list[i];if(c&&(c.id===param||c.ticket===param))return c}
   return null;
  }
  var kase=findCase();
  var caseId=kase?kase.id:param;
  var msgs=[],byId={},state='loading',me={id:'',admin:false},lastAt='',errText='';
  var pending=[];   /* photos waiting to be sent: data URLs */
  var sending=false;
  var SEEN='imode.caseChat.seen',DOCK='imode.caseChat.docked';

  /* ---------------------------------------------------------------- styles ---- */
  var css=document.createElement('style');css.id='ccCss';
  css.textContent=[
   ':root{--cc-w:380px}',
   '.cc-panel{position:fixed;top:0;right:0;bottom:0;width:var(--cc-w);z-index:30;background:#fff;border-left:1px solid var(--line,#e2ecfb);',
    'display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(18,58,128,.06);font-size:14px;color:var(--ink,#12224a)}',
   'body.cc-docked{padding-right:var(--cc-w)}',
   '.cc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#e2ecfb);flex:none}',
   '.cc-head b{font-size:15px;color:var(--imode-navy,#0c225e)}',
   '.cc-head small{color:var(--muted,#6b7d9e);font-size:12px}',
   '.cc-head .cc-sp{flex:1}',
   '.cc-x{width:34px;height:34px;border:1px solid var(--line,#e2ecfb);border-radius:10px;background:#fff;cursor:pointer;font-size:16px;line-height:1;color:var(--imode-navy,#0c225e)}',
   '.cc-x:hover{background:#f4f8ff}',
   '.cc-x:focus-visible,.cc-send:focus-visible,.cc-attach:focus-visible,.cc-fab:focus-visible{outline:3px solid var(--imode-blue,#0b63e5);outline-offset:2px}',
   '.cc-remind{margin:10px 12px 0;padding:10px 12px;border-radius:12px;background:#fff6e8;border:1px solid #f9d39b;color:#8a4b00;font-size:13px;line-height:1.45;flex:none}',
   '.cc-remind b{color:#7a3d00}',
   '.cc-closed{margin:10px 12px 0;padding:8px 12px;border-radius:12px;background:#f1fbf6;border:1px solid #bfe5d1;color:#12643d;font-size:12.5px;flex:none}',
   '.cc-feed{flex:1;min-height:0;overflow-y:auto;padding:6px 14px 14px;overscroll-behavior:contain}',
   '.cc-day{display:flex;align-items:center;gap:10px;margin:16px 0 8px;color:var(--muted,#6b7d9e);font-size:12px;font-weight:700}',
   '.cc-day::before,.cc-day::after{content:"";flex:1;height:1px;background:var(--line,#e2ecfb)}',
   '.cc-msg{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;padding:7px 6px;border-radius:12px;position:relative}',
   '.cc-msg:hover{background:#f7faff}',
   '.cc-msg.is-mine .cc-name{color:var(--imode-blue,#0b63e5)}',
   '.cc-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px}',
   '.cc-top{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}',
   '.cc-name{font-weight:700;color:var(--imode-navy,#0c225e);font-size:13.5px}',
   '.cc-time{position:relative;color:var(--muted,#6b7d9e);font-size:12px;cursor:default;border-bottom:1px dotted transparent}',
   '.cc-time:hover{border-bottom-color:currentColor}',
   '.cc-time::after{content:attr(data-full);position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;',
    'background:#0c225e;color:#fff;font-size:12px;padding:5px 9px;border-radius:8px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5}',
   '.cc-time:hover::after,.cc-time:focus::after{opacity:1}',
   '.cc-body{white-space:pre-wrap;word-break:break-word;line-height:1.5;margin-top:1px}',
   '.cc-photos{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}',
   '.cc-photos button{padding:0;border:1px solid var(--line,#e2ecfb);border-radius:10px;overflow:hidden;background:#f4f8ff;cursor:zoom-in;line-height:0}',
   '.cc-photos img{display:block;width:120px;height:120px;object-fit:cover}',
   '.cc-photos.is-one img{width:auto;height:auto;max-width:100%;max-height:260px;object-fit:contain}',
   '.cc-del{position:absolute;top:6px;right:6px;border:0;background:#fff;border-radius:8px;padding:2px 7px;font-size:12px;color:#b42318;cursor:pointer;opacity:0;box-shadow:0 1px 4px rgba(0,0,0,.12)}',
   '.cc-msg:hover .cc-del,.cc-del:focus{opacity:1}',
   '.cc-sys{display:flex;gap:8px;align-items:baseline;padding:4px 6px 4px 50px;color:var(--muted,#6b7d9e);font-size:12.5px}',
   '.cc-sys b{color:#3a4a6b;font-weight:600}',
   '.cc-empty{text-align:center;color:var(--muted,#6b7d9e);padding:36px 12px;font-size:13px;line-height:1.6}',
   '.cc-compose{border-top:1px solid var(--line,#e2ecfb);padding:10px 12px 12px;flex:none;background:#fff}',
   '.cc-prev{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
   '.cc-prev:empty{display:none}',
   '.cc-prev span{position:relative;line-height:0}',
   '.cc-prev img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#e2ecfb)}',
   '.cc-prev button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:#12224a;color:#fff;font-size:12px;line-height:20px;cursor:pointer;padding:0}',
   '.cc-row{display:flex;align-items:flex-end;gap:8px}',
   '.cc-row textarea{flex:1;min-width:0;resize:none;border:1px solid var(--line-2,#dfe9f8);border-radius:12px;padding:9px 11px;font:inherit;font-size:14px;line-height:1.4;max-height:140px;min-height:40px;background:#f8fbff;color:inherit}',
   '.cc-row textarea:focus{outline:none;border-color:var(--imode-blue,#0b63e5);background:#fff}',
   '.cc-attach,.cc-send{flex:none;height:40px;min-width:40px;border-radius:12px;cursor:pointer;font-weight:700}',
   '.cc-attach{border:1px solid var(--line,#e2ecfb);background:#fff;font-size:17px}',
   '.cc-send{border:0;background:var(--imode-blue,#0b63e5);color:#fff;padding:0 14px}',
   '.cc-send:disabled{opacity:.5;cursor:default}',
   '.cc-hint{margin-top:6px;color:var(--muted,#6b7d9e);font-size:11.5px}',
   '.cc-at{color:var(--imode-blue,#0b63e5);font-weight:700;background:#eaf2ff;border-radius:6px;padding:0 3px}',
   '.cc-at.is-me{color:#9a4a00;background:#ffecd6}',
   '.cc-msg.is-tagged{background:#fff8ef;box-shadow:inset 3px 0 0 var(--imode-orange,#f27a1a)}',
   '.cc-compose{position:relative}',
   '.cc-pick{position:absolute;left:12px;right:12px;bottom:calc(100% - 4px);max-height:240px;overflow-y:auto;background:#fff;border:1px solid var(--line,#e2ecfb);',
    'border-radius:12px;box-shadow:0 -8px 28px rgba(12,34,94,.16);padding:4px;z-index:6}',
   '.cc-pick[hidden]{display:none}',
   '.cc-pick button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:7px 8px;border-radius:9px;cursor:pointer;font:inherit;font-size:13.5px;text-align:left;color:inherit}',
   '.cc-pick button[aria-selected="true"],.cc-pick button:hover{background:#eef4ff}',
   '.cc-pick .cc-av{width:28px;height:28px;font-size:11px;flex:none}',
   '.cc-pick small{display:block;color:var(--muted,#6b7d9e);font-size:11.5px}',
   '.cc-pick-none{padding:10px;color:var(--muted,#6b7d9e);font-size:13px}',
   '.cc-fab{position:fixed;right:18px;bottom:18px;z-index:40;height:52px;padding:0 18px 0 16px;border-radius:26px;border:0;cursor:pointer;',
    'background:var(--imode-navy,#0c225e);color:#fff;font:inherit;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;box-shadow:0 10px 26px rgba(12,34,94,.3)}',
   '.cc-fab em{font-style:normal;min-width:20px;height:20px;border-radius:10px;background:var(--imode-orange,#f27a1a);font-size:11.5px;line-height:20px;padding:0 6px}',
   '.cc-fab em:empty{display:none}',
   '.cc-fab.is-due{background:#b45309}',
   'body.cc-docked .cc-fab{display:none}',
   '.cc-panel[hidden]{display:none}',
   '.cc-shade{position:fixed;inset:0;z-index:10499;background:rgba(9,18,38,.4)}',
   '.cc-shade[hidden]{display:none}',
   '.cc-light{position:fixed;inset:0;z-index:12000;background:rgba(5,10,24,.88);display:grid;place-items:center;padding:20px;cursor:zoom-out}',
   '.cc-light img{max-width:100%;max-height:100%;border-radius:8px}',
   '@media (max-width:1199px){',
    'body.cc-docked{padding-right:0}',
    'body.cc-has-fab{padding-bottom:84px}',
    '.cc-panel{z-index:10500;width:min(420px,100%);box-shadow:-12px 0 40px rgba(0,0,0,.18)}',
   '}',
   '@media (prefers-reduced-motion:reduce){.cc-time::after{transition:none}}'
  ].join('');
  document.head.appendChild(css);

  /* ---------------------------------------------------------------- markup ---- */
  var panel=document.createElement('aside');
  panel.className='cc-panel';panel.id='ccPanel';panel.setAttribute('aria-label','แชททีมในเคสนี้');panel.hidden=true;
  panel.innerHTML='<div class="cc-head"><span aria-hidden="true">💬</span><div><b>แชททีม</b><br><small id="ccSub">อัปเดตงานในเคสนี้</small></div>'
   +'<span class="cc-sp"></span><button type="button" class="cc-x" id="ccClose" aria-label="ซ่อนแชท" title="ซ่อนแชท">✕</button></div>'
   +'<div id="ccBanner"></div>'
   +'<div class="cc-feed" id="ccFeed" aria-live="polite"><div class="cc-empty">กำลังโหลดแชท...</div></div>'
   +'<form class="cc-compose" id="ccForm" autocomplete="off">'
   +'<div class="cc-pick" id="ccPick" role="listbox" aria-label="เลือกคนที่จะแท็ก" hidden></div>'
   +'<div class="cc-prev" id="ccPrev"></div>'
   +'<div class="cc-row">'
   +'<button type="button" class="cc-attach" id="ccAttach" aria-label="แนบรูป" title="แนบรูป (สูงสุด '+MAX_PHOTOS+' รูป)">📷</button>'
   +'<input type="file" id="ccFile" accept="image/*" multiple hidden>'
   +'<button type="button" class="cc-attach" id="ccTag" aria-label="แท็กคน" title="แท็กคน (พิมพ์ @)">@</button>'
   +'<textarea id="ccText" rows="1" placeholder="พิมพ์อัปเดตงาน... @ เพื่อแท็กคน" aria-label="ข้อความ" aria-autocomplete="list" aria-controls="ccPick"></textarea>'
   +'<button type="submit" class="cc-send" id="ccSend">ส่ง</button>'
   +'</div><div class="cc-hint" id="ccHint">Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · @ แท็กคน · ลูกค้าไม่เห็นแชทนี้</div></form>';
  var shade=document.createElement('div');shade.className='cc-shade';shade.hidden=true;
  var fab=document.createElement('button');
  fab.type='button';fab.className='cc-fab';fab.id='ccFab';fab.setAttribute('aria-controls','ccPanel');
  fab.innerHTML='<span aria-hidden="true">💬</span><span>แชททีม</span><em id="ccFabN"></em>';
  document.body.appendChild(shade);document.body.appendChild(panel);document.body.appendChild(fab);
  document.body.classList.add('cc-has-fab');
  /* a phone has no Enter-to-send (Enter is a new line there), so the hint says less */
  if(!window.matchMedia('(hover:hover)').matches)document.getElementById('ccHint').textContent='@ แท็กคน · ลูกค้าไม่เห็นแชทนี้';
  var $=function(id){return document.getElementById(id)};

  /* ------------------------------------------------------- open / dock ---- */
  function wide(){return window.matchMedia('(min-width:1200px)').matches}
  function dockPref(){try{return localStorage.getItem(DOCK)!=='0'}catch(e){return true}}
  function setDockPref(v){try{localStorage.setItem(DOCK,v?'1':'0')}catch(e){}}
  var drawerOpen=false;
  function layout(){
   if(wide()){
    var on=dockPref();
    panel.hidden=!on;shade.hidden=true;drawerOpen=false;
    document.body.classList.toggle('cc-docked',on);
    if(on)markSeen();
   }else{
    document.body.classList.remove('cc-docked');
    panel.hidden=!drawerOpen;shade.hidden=!drawerOpen;
   }
   fabCount();
  }
  function open(){
   if(wide())setDockPref(true);else drawerOpen=true;
   layout();scrollEnd();markSeen();
   setTimeout(function(){try{$('ccText').focus()}catch(e){}},30);
  }
  function close(){
   if(wide())setDockPref(false);else drawerOpen=false;
   layout();
   try{fab.focus()}catch(e){}
  }
  fab.addEventListener('click',open);
  $('ccClose').addEventListener('click',close);
  shade.addEventListener('click',close);
  document.addEventListener('keydown',function(e){
   if(e.key!=='Escape')return;
   var lb=document.querySelector('.cc-light');if(lb){lb.remove();return}
   if(!$('ccPick').hidden)return;
   if(drawerOpen)close();
  });
  window.addEventListener('resize',function(){clearTimeout(layout.t);layout.t=setTimeout(layout,120)});

  /* -------------------------------------------------------------- unread ---- */
  function seenAt(){var o=readJ(SEEN,{})||{};return o[caseId]||''}
  function markSeen(){
   if(panel.hidden||!msgs.length)return;
   var o=readJ(SEEN,{})||{};o[caseId]=msgs[msgs.length-1].created_at;
   var keys=Object.keys(o);if(keys.length>300)delete o[keys[0]];
   try{localStorage.setItem(SEEN,JSON.stringify(o))}catch(e){}
   fabCount();
  }
  function fabCount(){
   var s=Date.parse(seenAt())||0,n=0;
   msgs.forEach(function(m){if(Date.parse(m.created_at)>s&&m.author_id!==me.id)n++});
   $('ccFabN').textContent=n?String(n):'';
   fab.classList.toggle('is-due',!!stale());
   fab.title=stale()?'ถึงเวลาอัปเดตเคสนี้':'';
  }

  /* --------------------------------------------------------------- format ---- */
  function dayKey(t){var d=new Date(t);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()}
  function dayLabel(t){
   var d=new Date(t),now=new Date();
   var today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
   var that=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
   if(that===today)return 'วันนี้';
   if(that===today-DAY)return 'เมื่อวาน';
   return d.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'short',year:'numeric'});
  }
  function hhmm(t){var d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
  function full(t){
   var d=new Date(t);
   return d.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' เวลา '+
    String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+' น.';
  }
  function initials(n){
   var s=String(n||'?').trim().split(/\s+/);
   return ((s[0]||'?').charAt(0)+(s[1]?s[1].charAt(0):'')).toUpperCase();
  }
  var COLORS=['#0b63e5','#0e7490','#7c3aed','#be185d','#b45309','#15803d','#4338ca','#c2410c'];
  function color(n){var h=0,s=String(n||'');for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return COLORS[Math.abs(h)%COLORS.length]}

  /* --------------------------------------------------------------- render ---- */
  function statusLog(){
   var s=readJ('imode_v5_settings',{})||{};
   var l=s.caseStatusLog&&s.caseStatusLog[caseId];
   return Array.isArray(l)?l:[];
  }
  /* re-read every minute, not on every call: the cases list can be large (photos) */
  var days=remindDays(readJ('imode_v5_settings',{})||{});
  function refreshCase(){kase=findCase()||kase;days=remindDays(readJ('imode_v5_settings',{})||{})}
  function stale(){return staleInfo(kase,lastAt,days)}
  function banner(){
   var b=$('ccBanner'),st=stale();
   if(state!=='ok'){b.innerHTML='';return}
   if(st){
    b.innerHTML='<div class="cc-remind" role="status">⏰ <b>ถึงเวلาอัปเดตเคสนี้</b> — ไม่มีอัปเดตในแชทมา '+st.days+' วัน พิมพ์ความคืบหน้าด้านล่างได้เลย</div>';
   }else if(isClosed(kase)){
    b.innerHTML='<div class="cc-closed">✓ เคสนี้ปิดแล้ว ระบบจะไม่เตือนให้อัปเดตอีก</div>';
   }else b.innerHTML='';
  }
  function render(){
   var feed=$('ccFeed'),atEnd=feed.scrollHeight-feed.scrollTop-feed.clientHeight<60;
   banner();
   var ro=state!=='ok';
   $('ccText').disabled=ro;$('ccAttach').disabled=ro;$('ccTag').disabled=ro;$('ccSend').disabled=ro||sending;
   if(state==='loading'){feed.innerHTML='<div class="cc-empty">กำลังโหลดแชท...</div>';return}
   if(state==='nosql'){feed.innerHTML='<div class="cc-empty">แชทยังไม่พร้อมใช้<br>ต้องรันไฟล์ <b>supabase/14-case-chat.sql</b> ในฐานข้อมูลก่อน</div>';return}
   if(state==='nologin'){feed.innerHTML='<div class="cc-empty">เข้าสู่ระบบก่อนจึงจะใช้แชทได้</div>';return}
   if(state==='offline'){feed.innerHTML='<div class="cc-empty">เชื่อมต่อฐานข้อมูลไม่ได้'+(errText?'<br><small>'+esc(errText)+'</small>':'')+'</div>';return}

   var items=msgs.map(function(m){return {t:Date.parse(m.created_at),m:m}});
   statusLog().forEach(function(e){var t=Date.parse(e.at);if(t)items.push({t:t,s:e})});
   items.sort(function(a,b){return a.t-b.t});
   if(!items.length){
    feed.innerHTML='<div class="cc-empty">ยังไม่มีข้อความในเคสนี้<br>เริ่มอัปเดตงานให้ทีมได้เลย</div>';fabCount();return;
   }
   var html='',lastDay='';
   items.forEach(function(it){
    var dk=dayKey(it.t);
    if(dk!==lastDay){html+='<div class="cc-day">'+esc(dayLabel(it.t))+'</div>';lastDay=dk}
    if(it.s){
     html+='<div class="cc-sys"><span>🔄</span><span>เปลี่ยนสถานะ '+esc(it.s.from||'-')+' → <b>'+esc(it.s.to||'-')+'</b>'
      +(it.s.by?' · '+esc(it.s.by):'')+' · <span class="cc-time" tabindex="0" data-full="'+esc(full(it.t))+'">'+hhmm(it.t)+'</span></span></div>';
     return;
    }
    var m=it.m,mine=!!me.id&&m.author_id===me.id,name=m.author_name||'พนักงาน';
    var ph=Array.isArray(m.photos)?m.photos.filter(function(p){return typeof p==='string'&&/^data:image\//.test(p)}):[];
    html+='<div class="cc-msg'+(mine?' is-mine':'')+(!mine&&tagsMe(m.body)?' is-tagged':'')+'" data-id="'+esc(m.id)+'">'
     +'<div class="cc-av" style="background:'+color(name)+'" aria-hidden="true">'+esc(initials(name))+'</div>'
     +'<div><div class="cc-top"><span class="cc-name">'+esc(name)+(mine?' (คุณ)':'')+'</span>'
     +'<span class="cc-time" tabindex="0" data-full="'+esc(full(it.t))+'" aria-label="'+esc(full(it.t))+'">'+hhmm(it.t)+'</span></div>'
     +(m.body?'<div class="cc-body">'+tagged(m.body)+'</div>':'')
     +(ph.length?'<div class="cc-photos'+(ph.length===1?' is-one':'')+'">'+ph.map(function(p,i){
       return '<button type="button" data-photo="'+i+'" aria-label="ดูรูปขนาดใหญ่"><img src="'+esc(p)+'" alt="รูปที่แนบ '+(i+1)+'" loading="lazy"></button>'}).join('')+'</div>':'')
     +'</div>'
     +((mine||me.admin)?'<button type="button" class="cc-del" data-del="'+esc(m.id)+'" title="ลบข้อความ">ลบ</button>':'')
     +'</div>';
   });
   feed.innerHTML=html;
   if(atEnd||render.first!==false){render.first=false;scrollEnd()}
   fabCount();
  }
  function scrollEnd(){var f=$('ccFeed');f.scrollTop=f.scrollHeight}

  /* ------------------------------------------------------------------ tags ---- */
  var people=[];   /* {id,name,role}, longest name first so "@สมชาย ใจดี" wins over "@สมชาย" */
  function loadPeople(c){
   return c.from('profiles').select('id,username,full_name,role,is_active').limit(500).then(function(r){
    if(!r||r.error)return;
    people=(r.data||[]).filter(function(p){return p&&p.is_active!==false&&!/^customer$/i.test(String(p.role||''))})
     .map(function(p){return {id:p.id,name:String(p.full_name||'').trim()||String(p.username||'').trim(),user:String(p.username||''),role:String(p.role||'')}})
     .filter(function(p){return p.name});
    people.sort(function(a,b){return b.name.length-a.name.length});
    people.forEach(function(p){if(p.id===me.id)me.name=p.name});
    if(state==='ok')render();
   },function(){});
  }
  function tagsMe(body){return !!me.name&&String(body||'').indexOf('@'+me.name)>=0}
  function tagged(body){
   var s=String(body||''),out='',i=0;
   while(i<s.length){
    var at=s.indexOf('@',i);if(at<0){out+=esc(s.slice(i));break}
    out+=esc(s.slice(i,at));
    var hit=null;
    for(var k=0;k<people.length;k++){if(s.substr(at+1,people[k].name.length)===people[k].name){hit=people[k];break}}
    if(!hit){out+='@';i=at+1;continue}
    out+='<span class="cc-at'+(hit.id===me.id?' is-me':'')+'" title="'+esc(hit.role)+'">@'+esc(hit.name)+'</span>';
    i=at+1+hit.name.length;
   }
   return out;
  }

  $('ccFeed').addEventListener('click',function(e){
   var p=e.target.closest('[data-photo]');
   if(p){
    var id=p.closest('.cc-msg').getAttribute('data-id'),m=byId[id];if(!m)return;
    var src=m.photos[Number(p.getAttribute('data-photo'))];
    var lb=document.createElement('div');lb.className='cc-light';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','รูปที่แนบ');
    lb.innerHTML='<img alt="รูปที่แนบ">';lb.firstChild.src=src;
    lb.addEventListener('click',function(){lb.remove()});
    document.body.appendChild(lb);return;
   }
   var d=e.target.closest('[data-del]');
   if(d){
    if(!confirm('ลบข้อความนี้?'))return;
    var did=d.getAttribute('data-del'),c=db();if(!c)return;
    c.from(TABLE).delete().eq('id',did).select('id').then(function(r){
     if(r&&r.error){alert('ลบไม่ได้: '+r.error.message);return}
     if(!r||!r.data||!r.data.length){alert('ลบไม่ได้: ลบได้เฉพาะข้อความของตัวเอง');return}
     drop(did);
    });
   }
  });

  /* ----------------------------------------------------------------- data ---- */
  var COLS='id,case_id,body,photos,author_id,author_name,created_at';
  function add(list){
   var changed=false;
   (list||[]).forEach(function(m){if(m&&m.id&&!byId[m.id]){byId[m.id]=m;msgs.push(m);changed=true}});
   if(changed){
    msgs.sort(function(a,b){return Date.parse(a.created_at)-Date.parse(b.created_at)});
    lastAt=msgs.length?msgs[msgs.length-1].created_at:'';
   }
   return changed;
  }
  function drop(id){
   if(!byId[id])return;
   delete byId[id];msgs=msgs.filter(function(m){return m.id!==id});
   lastAt=msgs.length?msgs[msgs.length-1].created_at:'';
   render();
  }
  function who(c){
   return c.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    me.id=s&&s.user?s.user.id:'';
    var role=String(appUser&&(appUser.permissionRole||appUser.role)||'');
    me.admin=/service manager|admin \/ coordinator/i.test(role);
    return !!me.id;
   },function(){return false});
  }
  function loadAll(){
   var c=db();
   if(!c){state='offline';errText='ไม่พบการตั้งค่าฐานข้อมูลบนเครื่องนี้';render();return}
   who(c).then(function(ok){
    if(!ok){state='nologin';render();return}
    c.from(TABLE).select(COLS).eq('case_id',caseId).order('created_at',{ascending:true}).limit(1000).then(function(r){
     if(r&&r.error){
      if(missingTable(r.error))state='nosql';else{state='offline';errText=r.error.message||''}
      render();return;
     }
     state='ok';msgs=[];byId={};add(r&&r.data);render();layout();listen();loadPeople(c);
    },function(e){state='offline';errText=String(e&&e.message||'');render()});
   });
  }
  function pullNew(){
   var c=db();if(!c||state!=='ok')return;
   var q=c.from(TABLE).select(COLS).eq('case_id',caseId).order('created_at',{ascending:true}).limit(200);
   if(lastAt)q=q.gt('created_at',lastAt);
   q.then(function(r){if(r&&!r.error&&add(r.data)){render();if(!panel.hidden)markSeen()}});
  }
  function pullIds(){
   var c=db();if(!c||state!=='ok')return;
   c.from(TABLE).select('id').eq('case_id',caseId).limit(2000).then(function(r){
    if(!r||r.error)return;
    var keep={};(r.data||[]).forEach(function(x){keep[x.id]=1});
    var gone=msgs.filter(function(m){return !keep[m.id]});
    if(gone.length){gone.forEach(function(m){delete byId[m.id]});msgs=msgs.filter(function(m){return keep[m.id]});
     lastAt=msgs.length?msgs[msgs.length-1].created_at:'';render()}
   });
  }
  var chan=null;
  function listen(){
   var c=db();if(!c||chan||typeof c.channel!=='function')return;
   try{
    chan=c.channel('case-chat-'+Math.random().toString(36).slice(2,8))
     .on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE,filter:'case_id=eq.'+caseId},function(p){
      if(p&&p.new&&add([p.new])){render();if(!panel.hidden)markSeen()}
     })
     .on('postgres_changes',{event:'DELETE',schema:'public',table:TABLE},function(p){
      if(p&&p.old&&p.old.id)drop(p.old.id);
     }).subscribe();
   }catch(e){}
  }

  /* ----------------------------------------------------------------- send ---- */
  function shrink(file){
   return new Promise(function(res,rej){
    if(!file||!/^image\//.test(file.type)){rej(new Error('ไม่ใช่ไฟล์รูป'));return}
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){
     var w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,MAX_SIDE/Math.max(w,h));
     var cv=document.createElement('canvas');cv.width=Math.round(w*k);cv.height=Math.round(h*k);
     var g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,cv.width,cv.height);
     URL.revokeObjectURL(url);res(cv.toDataURL('image/jpeg',JPEG_Q));
    };
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('เปิดรูปไม่ได้'))};
    img.src=url;
   });
  }
  function addFiles(files){
   var list=[].slice.call(files||[]).filter(function(f){return /^image\//.test(f.type)});
   var room=MAX_PHOTOS-pending.length;
   if(list.length>room){alert('แนบได้สูงสุด '+MAX_PHOTOS+' รูปต่อข้อความ');list=list.slice(0,Math.max(0,room))}
   list.forEach(function(f){shrink(f).then(function(d){if(pending.length<MAX_PHOTOS){pending.push(d);preview()}},function(e){alert(e.message)})});
  }
  function preview(){
   $('ccPrev').innerHTML=pending.map(function(d,i){
    return '<span><img src="'+esc(d)+'" alt="รูปที่จะส่ง '+(i+1)+'"><button type="button" data-rm="'+i+'" aria-label="เอารูปนี้ออก">×</button></span>'}).join('');
  }
  $('ccPrev').addEventListener('click',function(e){
   var b=e.target.closest('[data-rm]');if(!b)return;
   pending.splice(Number(b.getAttribute('data-rm')),1);preview();
  });
  $('ccAttach').addEventListener('click',function(){$('ccFile').click()});
  $('ccFile').addEventListener('change',function(){addFiles(this.files);this.value=''});
  var ta=$('ccText');
  function grow(){ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight+2)+'px'}
  ta.addEventListener('input',grow);
  ta.addEventListener('paste',function(e){
   var items=(e.clipboardData&&e.clipboardData.files)||[];
   if(items.length){e.preventDefault();addFiles(items)}
  });
  var pick=$('ccPick'),pickList=[],pickIdx=0,pickFrom=-1;
  function tagQuery(){
   var pos=ta.selectionStart,txt=ta.value.slice(0,pos),at=txt.lastIndexOf('@');
   if(at<0||(at>0&&!/\s/.test(txt.charAt(at-1))))return null;
   var q=txt.slice(at+1);
   if(q.length>30||/\n/.test(q))return null;
   return {at:at,q:q};
  }
  function closePick(){pick.hidden=true;pickList=[];pickFrom=-1;ta.removeAttribute('aria-activedescendant')}
  function drawPick(){
   pick.innerHTML=pickList.length?pickList.map(function(p,i){
    return '<button type="button" role="option" id="ccPick'+i+'" data-pick="'+i+'" aria-selected="'+(i===pickIdx)+'">'
     +'<span class="cc-av" style="background:'+color(p.name)+'" aria-hidden="true">'+esc(initials(p.name))+'</span>'
     +'<span><b>'+esc(p.name)+(p.id===me.id?' (คุณ)':'')+'</b><small>'+esc(p.role||p.user)+'</small></span></button>'}).join('')
    :'<div class="cc-pick-none">'+(people.length?'ไม่พบชื่อนี้':'กำลังโหลดรายชื่อ...')+'</div>';
   pick.hidden=false;
   if(pickList.length){ta.setAttribute('aria-activedescendant','ccPick'+pickIdx);var b=$('ccPick'+pickIdx);if(b&&b.scrollIntoView)b.scrollIntoView({block:'nearest'})}
  }
  function updatePick(){
   var t=tagQuery();if(!t||state!=='ok'){closePick();return}
   var q=t.q.toLowerCase().trim();
   pickList=people.filter(function(p){return !q||p.name.toLowerCase().indexOf(q)>=0||p.user.toLowerCase().indexOf(q)>=0})
    .sort(function(a,b){return a.name.localeCompare(b.name,'th')}).slice(0,8);
   if(pickFrom!==t.at)pickIdx=0;
   pickFrom=t.at;pickIdx=Math.min(pickIdx,Math.max(0,pickList.length-1));
   drawPick();
  }
  function choose(i){
   var p=pickList[i],t=tagQuery();if(!p||!t)return;
   var before=ta.value.slice(0,t.at),after=ta.value.slice(ta.selectionStart);
   var ins='@'+p.name+' ';
   ta.value=before+ins+after.replace(/^ /,'');
   var caret=before.length+ins.length;
   ta.setSelectionRange(caret,caret);closePick();grow();ta.focus();
  }
  pick.addEventListener('mousedown',function(e){e.preventDefault()});
  pick.addEventListener('click',function(e){var b=e.target.closest('[data-pick]');if(b)choose(Number(b.getAttribute('data-pick')))});
  ta.addEventListener('input',updatePick);
  ta.addEventListener('click',updatePick);
  ta.addEventListener('blur',function(){setTimeout(closePick,120)});
  $('ccTag').addEventListener('click',function(){
   if(ta.disabled)return;
   var pos=ta.selectionStart,v=ta.value,pre=pos>0&&!/\s/.test(v.charAt(pos-1))?' ':'';
   ta.value=v.slice(0,pos)+pre+'@'+v.slice(pos);
   var c=pos+pre.length+1;ta.focus();ta.setSelectionRange(c,c);updatePick();
  });
  ta.addEventListener('keydown',function(e){
   if(!pick.hidden&&pickList.length){
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();pickIdx=(pickIdx+(e.key==='ArrowDown'?1:-1)+pickList.length)%pickList.length;drawPick();return}
    if((e.key==='Enter'||e.key==='Tab')&&!e.isComposing){e.preventDefault();choose(pickIdx);return}
   }
   if(e.key==='Escape'&&!pick.hidden){e.preventDefault();e.stopPropagation();closePick();return}
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.matchMedia('(hover:hover)').matches){
    e.preventDefault();$('ccForm').requestSubmit?$('ccForm').requestSubmit():send();
   }
  });
  $('ccForm').addEventListener('submit',function(e){e.preventDefault();send()});
  function send(){
   if(sending||state!=='ok')return;
   var body=ta.value.trim();
   if(!body&&!pending.length){ta.focus();return}
   var c=db();if(!c)return;
   sending=true;$('ccSend').disabled=true;$('ccSend').textContent='กำลังส่ง...';
   c.from(TABLE).insert({case_id:caseId,body:body,photos:pending.slice()}).select(COLS).then(function(r){
    sending=false;$('ccSend').disabled=false;$('ccSend').textContent='ส่ง';
    if(r&&r.error){alert('ส่งไม่ได้: '+r.error.message);return}
    ta.value='';grow();pending=[];preview();closePick();
    add(r&&r.data);render();scrollEnd();markSeen();
   },function(err){
    sending=false;$('ccSend').disabled=false;$('ccSend').textContent='ส่ง';
    alert('ส่งไม่ได้: '+(err&&err.message||'เชื่อมต่อไม่ได้'));
   });
  }

  /* ------------------------------------------------------------------ boot ---- */
  layout();
  loadAll();
  setInterval(function(){if(state==='ok')pullNew()},15000);
  setInterval(function(){refreshCase();if(state==='ok'){pullIds();render()}},60000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){if(state==='ok')pullNew();else if(state!=='nosql')loadAll()}});
  window.imodeCaseChat={open:open,close:close,state:function(){return {state:state,caseId:caseId,messages:msgs.length,me:me.id,stale:stale()}}};
 }
})();
