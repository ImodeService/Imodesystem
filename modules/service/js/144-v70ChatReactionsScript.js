/* js/144-v70ChatReactionsScript.js — 2026-10-21 (ข้อ 13)
   "อยากให้กดอีโมจิได้แบบในแชทเฟส ไอจี"

   Emoji reactions under chat messages, for both chats:
     js/138 — the team chat on service-case-detail.html   (kind 'case')
     js/141 — the 💬 chat button in the app                (kind 'case' and 'dm')
   Data: public.chat_reactions (supabase/16-chat-reactions.sql). Until that file has been run
   the table is missing, every bar draws nothing, and the chats work exactly as before.

   HOW A CHAT USES IT
     R.use(client, myUserId)          once the chat knows who is signed in
     R.bar(kind, messageId)           HTML placed under a message; it fills itself in
     R.load(kind, [messageIds])       after the chat has loaded its messages
   Everything else (the picker, toggling, live updates from other people) lives here, and a
   change repaints only the bars of that one message, never the chat's whole feed. */
(function(){
 'use strict';
 if(window.imodeChatReactions)return;
 var TABLE='chat_reactions';
 var EMOJI=['👍','❤️','😂','😮','😢','🙏','✅'];   /* the same seven as the SQL check */
 var client=null,meId='',state='unknown',chan=null;
 var byMsg={},byId={};                         /* 'kind:id' -> [row], id -> row */

 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function key(kind,mid){return kind+':'+mid}
 function missingTable(err){
  return /PGRST205|PGRST202|42P01|does not exist|Could not find/i.test(String(err&&(err.code+' '+err.message)||''));
 }

 function style(){
  if(document.getElementById('rxStyle'))return;
  var st=document.createElement('style');st.id='rxStyle';
  st.textContent=[
   '.rx{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center}',
   '.rx:empty{display:none}',
   '.rx button{font:inherit;cursor:pointer;line-height:1}',
   '.rx-chip{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 8px;border-radius:12px;font-size:13px;',
   ' background:rgba(127,140,160,.14);border:1px solid rgba(127,140,160,.3);color:inherit}',
   '.rx-chip b{font-size:11.5px;font-weight:700}',
   '.rx-chip.is-mine{border-color:var(--imode-blue,#0b63e5);background:rgba(11,99,229,.14)}',
   '.rx-add{height:24px;padding:0 7px;white-space:nowrap;border-radius:12px;border:1px dashed rgba(127,140,160,.5);background:transparent;color:inherit;font-size:13px;opacity:.55}',
   '.rx-add:hover,.rx-add:focus-visible{opacity:1}',
   '.rx-chip:focus-visible,.rx-add:focus-visible,.rx-pick button:focus-visible{outline:3px solid var(--imode-blue,#0b63e5);outline-offset:2px}',
   '.rx-pick{position:fixed;z-index:12500;display:flex;gap:2px;padding:6px;border-radius:24px;',
   ' background:var(--fx-surface,#fff);color:var(--fx-text,#0c225e);border:1px solid var(--fx-line,rgba(127,140,160,.35));box-shadow:0 10px 30px rgba(0,0,0,.25)}',
   '.rx-pick button{width:38px;height:38px;border-radius:50%;border:0;background:transparent;font-size:22px;cursor:pointer;transition:transform .12s}',
   '.rx-pick button:hover{transform:scale(1.2)}',
   '.rx-pick button.is-mine{background:rgba(11,99,229,.16)}',
   '@media (prefers-reduced-motion:reduce){.rx-pick button{transition:none}.rx-pick button:hover{transform:none}}'
  ].join('');
  document.head.appendChild(st);
 }

 /* ------------------------------------------------------------ drawing ---- */
 function inner(kind,mid){
  if(state==='nosql'||state==='off')return '';
  var rows=byMsg[key(kind,mid)]||[],groups={},order=[];
  rows.forEach(function(r){
   if(!groups[r.emoji]){groups[r.emoji]={n:0,mine:false,names:[]};order.push(r.emoji)}
   var g=groups[r.emoji];g.n++;if(r.user_id===meId)g.mine=true;
   g.names.push(r.user_id===meId?'คุณ':(r.user_name||'พนักงาน'));
  });
  order.sort(function(a,b){return EMOJI.indexOf(a)-EMOJI.indexOf(b)});
  var html=order.map(function(e){
   var g=groups[e];
   return '<button type="button" class="rx-chip'+(g.mine?' is-mine':'')+'" data-rx-emoji="'+esc(e)+'" title="'+esc(g.names.join(', '))+'"'
    +' aria-label="'+esc(e+' '+g.n+' คน: '+g.names.join(', ')+(g.mine?' — กดเพื่อเอาออก':''))+'" aria-pressed="'+g.mine+'">'
    +'<span aria-hidden="true">'+e+'</span><b aria-hidden="true">'+g.n+'</b></button>';
  }).join('');
  return html+(meId?'<button type="button" class="rx-add" data-rx-add aria-label="กดอีโมจิ" title="กดอีโมจิ">☺︎+</button>':'');
 }
 function bar(kind,mid){
  if(!mid||state==='nosql'||state==='off')return '';
  style();
  return '<div class="rx" data-rx-kind="'+esc(kind)+'" data-rx-mid="'+esc(mid)+'">'+inner(kind,mid)+'</div>';
 }
 function paint(kind,mid){
  var sel='.rx[data-rx-kind="'+kind+'"][data-rx-mid="'+String(mid).replace(/"/g,'')+'"]';
  [].forEach.call(document.querySelectorAll(sel),function(el){el.innerHTML=inner(kind,mid)});
 }
 function paintAll(){
  [].forEach.call(document.querySelectorAll('.rx[data-rx-mid]'),function(el){
   el.innerHTML=inner(el.getAttribute('data-rx-kind'),el.getAttribute('data-rx-mid'));
  });
 }

 /* --------------------------------------------------------------- data ---- */
 function put(r){
  if(!r||!r.id||byId[r.id])return false;
  byId[r.id]=r;
  var k=key(r.message_kind,r.message_id);(byMsg[k]=byMsg[k]||[]).push(r);
  return true;
 }
 function drop(id){
  var r=byId[id];if(!r)return null;
  delete byId[id];
  var k=key(r.message_kind,r.message_id);
  byMsg[k]=(byMsg[k]||[]).filter(function(x){return x.id!==id});
  return r;
 }
 var COLS='id,message_kind,message_id,user_id,user_name,emoji,created_at';
 function load(kind,ids){
  var c=client;ids=(ids||[]).filter(Boolean);
  if(!c||!ids.length||state==='nosql')return Promise.resolve();
  var parts=[];for(var i=0;i<ids.length;i+=150)parts.push(ids.slice(i,i+150));
  return Promise.all(parts.map(function(p){
   return Promise.resolve(c.from(TABLE).select(COLS).eq('message_kind',kind).in('message_id',p).limit(5000)).then(function(r){
    if(r&&r.error){if(missingTable(r.error)){state='nosql';paintAll()}return}
    state='ok';
    /* a reload replaces what this device held for those messages */
    p.forEach(function(mid){(byMsg[key(kind,mid)]||[]).forEach(function(x){delete byId[x.id]});byMsg[key(kind,mid)]=[]});
    ((r&&r.data)||[]).forEach(put);
    p.forEach(function(mid){paint(kind,mid)});
   },function(){});
  }));
 }
 function listen(){
  var c=client;
  if(!c||chan||state==='nosql'||typeof c.channel!=='function')return;
  try{
   chan=c.channel('chat-rx-'+Math.random().toString(36).slice(2,8))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE},function(p){
     var r=p&&p.new;
     if(r&&put(r))paint(r.message_kind,r.message_id);
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:TABLE},function(p){
     /* with RLS on, a DELETE carries only the id — which is why rows are kept by id */
     var r=drop(p&&p.old&&p.old.id);
     if(r)paint(r.message_kind,r.message_id);
    })
    .subscribe();
  }catch(e){chan=null}
 }

 var busy={};
 function toggle(kind,mid,emoji){
  var c=client;
  if(!c||!meId||EMOJI.indexOf(emoji)<0)return;
  var k=key(kind,mid)+':'+emoji;if(busy[k])return;busy[k]=true;
  var mine=(byMsg[key(kind,mid)]||[]).filter(function(r){return r.user_id===meId&&r.emoji===emoji})[0];
  var done=function(){delete busy[k];paint(kind,mid)};
  if(mine){
   drop(mine.id);paint(kind,mid);                         /* at once; put back if refused */
   Promise.resolve(c.from(TABLE).delete().eq('id',mine.id)).then(function(r){
    if(r&&r.error)put(mine);done();
   },function(){put(mine);done()});
  }else{
   var tmp={id:'tmp-'+Date.now(),message_kind:kind,message_id:mid,user_id:meId,user_name:'',emoji:emoji};
   put(tmp);paint(kind,mid);
   Promise.resolve(c.from(TABLE).insert({message_kind:kind,message_id:mid,emoji:emoji}).select(COLS)).then(function(r){
    drop(tmp.id);
    if(r&&r.error){if(missingTable(r.error)){state='nosql';paintAll()}}
    else{var got=r&&r.data;(Array.isArray(got)?got:[got]).forEach(put)}
    done();
   },function(){drop(tmp.id);done()});
  }
 }

 /* ------------------------------------------------------------- picker ---- */
 var pick=null;
 function closePick(back){
  if(!pick)return;
  var from=pick.from;pick.el.remove();pick=null;
  if(back&&from)try{from.focus()}catch(e){}
 }
 function openPick(btn){
  closePick();
  var box=btn.closest('.rx');if(!box)return;
  var kind=box.getAttribute('data-rx-kind'),mid=box.getAttribute('data-rx-mid');
  var mineSet={};(byMsg[key(kind,mid)]||[]).forEach(function(r){if(r.user_id===meId)mineSet[r.emoji]=1});
  var el=document.createElement('div');el.className='rx-pick';el.setAttribute('role','menu');el.setAttribute('aria-label','เลือกอีโมจิ');
  el.innerHTML=EMOJI.map(function(e){
   return '<button type="button" role="menuitemcheckbox" aria-checked="'+!!mineSet[e]+'" class="'+(mineSet[e]?'is-mine':'')+'" data-rx-pick="'+esc(e)+'">'+e+'</button>';
  }).join('');
  document.body.appendChild(el);
  var r=btn.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
  var left=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2));
  var top=r.top-h-6;if(top<8)top=r.bottom+6;
  el.style.left=left+'px';el.style.top=top+'px';
  pick={el:el,kind:kind,mid:mid,from:btn};
  var first=el.querySelector('button');if(first)first.focus();
 }
 document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  var p=t.closest('[data-rx-pick]');
  if(p&&pick){var k=pick.kind,m=pick.mid;closePick(true);toggle(k,m,p.getAttribute('data-rx-pick'));e.stopPropagation();return}
  if(pick&&!t.closest('.rx-pick'))closePick();
  var a=t.closest('[data-rx-add]');
  if(a){e.stopPropagation();openPick(a);return}
  var chip=t.closest('.rx-chip');
  if(chip){
   e.stopPropagation();
   var box=chip.closest('.rx');
   toggle(box.getAttribute('data-rx-kind'),box.getAttribute('data-rx-mid'),chip.getAttribute('data-rx-emoji'));
  }
 },true);
 document.addEventListener('keydown',function(e){
  if(!pick)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePick(true);return}
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
   var bs=[].slice.call(pick.el.querySelectorAll('button')),i=bs.indexOf(document.activeElement);
   if(i<0)return;e.preventDefault();
   bs[(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length].focus();
  }
 },true);
 window.addEventListener('resize',function(){closePick()});
 document.addEventListener('scroll',function(){closePick()},true);

 window.imodeChatReactions={
  use:function(c,id){
   if(c&&c!==client){client=c;chan=null}
   if(id&&id!==meId){meId=id;paintAll()}
   listen();
  },
  bar:bar,load:load,toggle:toggle,
  state:function(){return {state:state,rows:Object.keys(byId).length,me:meId,live:!!chan}}
 };
})();
