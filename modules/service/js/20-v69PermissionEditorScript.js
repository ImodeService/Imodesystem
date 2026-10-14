/* V6.9 — make Settings → ผู้ใช้งานและสิทธิ์ usable.

   The editor itself was never broken: saveRoles() writes settings.roles and
   settings.userPermissions correctly, and enforcement has been on since js/12. What was
   broken was reaching it. The modal rendered every role and every user as a full card of
   43 checkboxes at once — measured at 23,511 px tall on a 1440x1000 screen — with the
   save button at the very bottom. An admin had to scroll roughly 27 screens to save a
   single tick, which is why it read as "the permission page does not work".

   This script does not rewrite the editor. It reorganises the modal the base function
   already produced:

     1. One role at a time, chosen from a tab strip. Every card stays in the DOM, only
        hidden, because saveRoles() collects them with
        #roleList .role-card:not(.user-permission-card) — a card that is removed from the
        DOM is a role that is deleted on save.
     2. One user at a time, chosen from a dropdown, for the same reason.
     3. The real login accounts are added to the individual list. allLoginUsers() in js/03
        returns the eight hard-coded demoUsers plus whoever is signed in, so the accounts
        an admin actually manages — technician_test1, lead_technical … — could not be
        given an individual permission at all. Cards are cloned from the one the base
        function rendered, so there is one template, not two.
     4. A save bar that sticks to the bottom of the modal.
     5. A guard before saving: removing settings.manage from your own role locks you out
        of this screen, so it asks first.

   Nothing is written here. saveRoles(), canPermission() and the storage keys are the
   originals. */
(function(){
 'use strict';


 /* ---------- 0. repair the permissions mergeSettings() strips on every load ----------
    normalizeRoleSetting() -> migrateLegacyPermissions() runs inside mergeSettings() at
    js/03 line 140 and does

        text.filter(x => allPermissionKeys().includes(x))

    which silently drops every saved permission whose key is not in PERMISSION_CATALOG
    *at that moment*. js/12 registers onsite.view / parts.view / pettycash.view and js/16
    registers mywork.view, and both run after js/03 — so those four keys are stripped from
    every role on every single page load. Their migrations put them back, but each is
    guarded by a version flag, so only the *first* load repaired them; from the second load
    onward Onsite, Spare Parts, Petty Cash and งานของฉัน quietly became unreachable for
    everyone, Admin included. Measured: Admin 33 permissions on load #1, 30 on load #2.

    The fix reads what was actually saved and puts back only the keys the catalog now
    knows. A permission an admin genuinely unticked is not in storage either, so it stays
    off — this restores, it never grants.

    Any future script that pushes to PERMISSION_CATALOG must load BEFORE this one, or its
    keys will keep being stripped. */
 function repairStrippedRolePermissions(){
  /* The snapshot js/01 took before any script could save; localStorage is only a fallback
     for the case where that file did not run. Reading storage here is not enough on its
     own — several patch scripts call saveLocal() while booting, and by the time this runs
     storage can already hold the stripped set. */
  var raw=window.imodeSettingsSnapshot;
  if(!raw){try{raw=JSON.parse(localStorage.getItem('imode_v5_settings')||'{}')}catch(e){return 0}}
  var saved=Array.isArray(raw.roles)?raw.roles:[];
  if(!saved.length)return 0;
  var known={};
  try{allPermissionKeys().forEach(function(k){known[k]=1})}catch(e){return 0}
  var restored=0;
  (settings.roles||[]).forEach(function(r){
   var s=saved.filter(function(x){return String(x.name||'')===String(r.name||'')})[0];
   if(!s||!Array.isArray(s.permissions))return;
   r.permissions=Array.isArray(r.permissions)?r.permissions:[];
   s.permissions.forEach(function(k){
    if(known[k]&&r.permissions.indexOf(k)<0){r.permissions.push(k);restored++}
   });
  });
  if(restored&&typeof saveLocal==='function')saveLocal();
  return restored;
 }
 window.imodeRepairRolePermissions=repairStrippedRolePermissions;

 /* The same strip happens again every time mergeSettings() is called with a fresh raw
    object — syncCloud() does exactly that with the settings row pulled from Supabase, and
    importSystemBackup() does it with a backup file. The boot snapshot cannot help there:
    the roles came from somewhere else. So the restore is attached to mergeSettings itself,
    which fixes every present and future caller in one place.

    mergeSettings is a top-level function declaration in js/03, so this override is the
    binding its own callers resolve. */
 function restoreInto(merged,raw){
  if(!merged||!raw||!Array.isArray(raw.roles)||!Array.isArray(merged.roles))return merged;
  var known={};
  try{allPermissionKeys().forEach(function(k){known[k]=1})}catch(e){return merged}
  merged.roles.forEach(function(r){
   var src=raw.roles.filter(function(x){return String(x.name||'')===String(r.name||'')})[0];
   if(!src||!Array.isArray(src.permissions))return;
   r.permissions=Array.isArray(r.permissions)?r.permissions:[];
   src.permissions.forEach(function(k){
    if(known[k]&&r.permissions.indexOf(k)<0)r.permissions.push(k);
   });
  });
  return merged;
 }
 var baseMerge=window.mergeSettings;
 if(typeof baseMerge==='function'){
  window.mergeSettings=function(raw){
   return restoreInto(baseMerge.apply(this,arguments),raw);
  };
 }
 if(repairStrippedRolePermissions()){
  if(typeof applyRoleVisibility==='function')applyRoleVisibility();
 }

 function th(){try{return settings.language!=='en'}catch(e){return true}}
 function tl(t,e){return th()?t:e}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}

 /* ---------- accounts that can actually sign in ---------- */
 /* js/39's list first — it is exactly what การจัดการบัญชีผู้ใช้ draws (created accounts, renamed
    built-ins, deleted ones gone), so the per-person list and the account page cannot disagree. */
 function loginAccounts(){
  try{
   if(typeof window.imodeAccountList==='function')return window.imodeAccountList()||[];
  }catch(e){}
  try{
   if(window.uatAuth&&typeof window.uatAuth.allAccounts==='function')return window.uatAuth.allAccounts()||[];
  }catch(e){}
  return [];
 }
 function accountUser(a){
  /* Same shape allLoginUsers() hands userPermissionCard(), and the same key
     permissionUserKey() builds: id first, name second. */
  try{
   if(window.uatAuth&&typeof window.uatAuth.accountToUser==='function'){
    var u=window.uatAuth.accountToUser(a);
    if(u&&(u.id||u.name))return u;
   }
  }catch(e){}
  return {id:'UAT-'+a.username,name:a.name||a.username,role:a.role||'',team:a.team||''};
 }

 /* ---------- the one place that knows the card markup is the base function ---------- */
 function cloneUserCard(template,user,key){
  var card=template.cloneNode(true);
  card.dataset.userKey=key;
  var inputs=card.querySelectorAll('.role-card-head input[readonly]');
  if(inputs[0])inputs[0].value=user.name||user.id||key;
  if(inputs[1])inputs[1].value=user.permissionRole||user.role||'-';
  if(inputs[2])inputs[2].value=user.team||'-';
  var entry=null;
  try{entry=(settings.userPermissions||{})[key]||null}catch(e){}
  var perms=(entry&&Array.isArray(entry.permissions))?entry.permissions:[];
  var enabled=!!(entry&&entry.enabled);
  card.querySelectorAll('[data-user-perm]').forEach(function(cb){
   cb.checked=perms.indexOf(cb.dataset.userPerm)>=0;
  });
  var toggle=card.querySelector('[data-user-enable]');
  if(toggle)toggle.checked=enabled;
  var mode=card.querySelector('.role-auto-count b');
  if(mode)mode.textContent=enabled?tl('รายบุคคล','Individual'):tl('ตาม Role','By role');
  var count=card.querySelector('[data-user-perm-summary]');
  if(count)count.textContent=perms.length+'/'+card.querySelectorAll('[data-user-perm]').length+' '+tl('สิทธิ์','permissions');
  return card;
 }

 function addMissingAccounts(list){
  var template=list.querySelector('.user-permission-card');
  if(!template)return;
  var have={};
  [].slice.call(list.querySelectorAll('.user-permission-card')).forEach(function(c){have[c.dataset.userKey]=true});
  loginAccounts().forEach(function(a){
   var u=accountUser(a);
   var key=String(u.id||u.name||'').trim();
   if(!key||have[key])return;
   have[key]=true;
   list.appendChild(cloneUserCard(template,u,key));
  });
 }

 /* ---------- generic one-at-a-time switcher ---------- */
 function show(cards,i){
  cards.forEach(function(c,j){c.style.display=(j===i)?'':'none'});
 }

 function roleLabel(card,i){
  var n=card.querySelector('[data-k=name]');
  var name=(n&&String(n.value||'').trim())||tl('บทบาทที่ '+(i+1),'Role '+(i+1));
  var on=card.querySelectorAll('[data-perm]:checked').length;
  return {name:name,count:on};
 }

 /* ---------- role groups ----------
    Eight roles in one flat strip read as eight near-identical tiles — the five technician
    variants especially, which differ by one word and a permission count. They are sorted
    into three groups and only the selected group's roles are shown, so the strip is three
    tiles wide instead of eight and the variants sit together where they can be compared.

    Classification is by name, not by index, so a role an admin adds later lands somewhere
    sensible on its own. Order matters: "Technical Lead" and "R&D Lead" both contain a
    technician word as well as a lead word, so lead is tested first. Anything unrecognised
    falls into the first group, which is why that one is the catch-all. */
 var ROLE_GROUPS=[
  {id:'office',th:'ผู้ดูแลและสำนักงาน',en:'Admin & office'},
  {id:'tech',  th:'ช่างเทคนิค',        en:'Technicians'},
  {id:'lead',  th:'หัวหน้าทีมช่าง',     en:'Team leads'}
 ];
 function roleGroupId(name){
  var n=String(name||'').toLowerCase();
  if(/lead|หัวหน้า/.test(n))return 'lead';
  /* 'R&D' is a technician role with no technician word in its name; without r&d here it fell
     into the office catch-all. 'R&D Lead' is caught by the lead test above first. */
  if(/technician|ช่าง|r&d/.test(n))return 'tech';
  return 'office';
 }

 function buildRoleTabs(host,roleList,preferred){
  var cards=[].slice.call(roleList.querySelectorAll('.role-card:not(.user-permission-card)'));
  if(!cards.length){host.innerHTML='';return cards}
  /* The visible card is the state. Deriving it here rather than keeping a variable is what
     lets this function be re-run on every tick and every rename without losing the admin's
     place. `preferred` is the one case that cannot be derived — see the observer below. */
  var active=Math.max(0,cards.indexOf(cards.filter(function(c){return c.style.display!=='none'})[0]));
  if(typeof preferred==='number'&&preferred>=0&&preferred<cards.length)active=preferred;
  var info=cards.map(function(card,i){return roleLabel(card,i)});
  var groupOf=info.map(function(x){return roleGroupId(x.name)});
  var groups=ROLE_GROUPS.filter(function(g){return groupOf.indexOf(g.id)>=0});
  var activeGroup=groupOf[active];

  host.innerHTML='';
  var groupRow=document.createElement('div');
  groupRow.className='permx-groups';
  var tabRow=document.createElement('div');
  tabRow.className='permx-tabrow';
  host.appendChild(groupRow);
  host.appendChild(tabRow);

  function paintTabs(){
   tabRow.innerHTML='';
   cards.forEach(function(card,i){
    if(groupOf[i]!==activeGroup)return;
    var b=document.createElement('button');
    b.type='button';
    b.className='permx-tab';
    b.setAttribute('aria-pressed',String(i===active));
    b.innerHTML='<b>'+esc2(info[i].name)+'</b><small>'+info[i].count+' '+esc2(tl('สิทธิ์','perms'))+'</small>';
    b.onclick=function(){active=i;show(cards,i);paintTabs()};
    tabRow.appendChild(b);
   });
  }
  groups.forEach(function(g){
   var n=groupOf.filter(function(x){return x===g.id}).length;
   var b=document.createElement('button');
   b.type='button';
   b.className='permx-group';
   b.setAttribute('aria-pressed',String(g.id===activeGroup));
   b.innerHTML='<b>'+esc2(tl(g.th,g.en))+'</b><small>'+n+' '+esc2(tl('บทบาท','roles'))+'</small>';
   b.onclick=function(){
    activeGroup=g.id;
    /* Selecting a group selects its first role, so a card is always visible — an empty
       body would read as a broken screen. */
    var first=groupOf.indexOf(g.id);
    if(first>=0){active=first;show(cards,first)}
    /* Only the group buttons. The row also holds the 👤 สิทธิ์รายบุคคล button, and indexing
       every child against `groups` read groups[3] for it — undefined, so `.id` threw here,
       paintTabs() below never ran, and the tab row kept the previous group's roles while
       the card beneath had already changed. */
    [].slice.call(groupRow.querySelectorAll('.permx-group:not(.permx-userbtn)')).forEach(function(x,j){
     if(groups[j])x.setAttribute('aria-pressed',String(groups[j].id===activeGroup));
    });
    paintTabs();
   };
   groupRow.appendChild(b);
  });
  /* 2026-09-15: สิทธิ์รายบุคคล has a view of its own inside this popup, reached from here —
     the end of the group row, where the owner marked it. Built inside this function because
     groupRow is cleared and rebuilt on every call; a button added from outside would be wiped
     the next time a role is renamed or ticked. */
  var ulist=document.getElementById('userPermissionList');
  if(ulist){
   var ub=document.createElement('button');
   ub.type='button';
   ub.className='permx-group permx-userbtn';
   ub.innerHTML='<b>👤 '+esc2(tl('สิทธิ์รายบุคคล','Per-person'))+'</b><small>'
     +accountCards(ulist).length+' '+esc2(tl('บัญชี','accounts'))+' ›</small>';
   ub.onclick=function(){if(typeof window.imodePermView==='function')window.imodePermView('user')};
   groupRow.appendChild(ub);
  }
  paintTabs();
  show(cards,active);
  return cards;
 }

 /* 2026-09-15: the per-person view lists ACCOUNTS — the same rows การจัดการบัญชีผู้ใช้ shows —
    instead of a dropdown that also carried the eight hard-coded demo names, which have no
    login and which the owner had already removed from the sign-in picker. A card's key is
    'UAT-<username>', the same id a signed-in session carries, so a renamed account still
    matches its own permissions. */
 function accountRows(){var l=loginAccounts();return Array.isArray(l)?l:[]}
 function accountKeyMap(){
  var m={};
  accountRows().forEach(function(a){
   if(!a||!a.username)return;
   var u=accountUser(a);
   var k=String(u.id||u.name||'').trim();
   if(k)m[k]={acc:a,user:u};
  });
  return m;
 }
 function accountCards(list){
  if(!list)return [];
  var m=accountKeyMap();
  return [].slice.call(list.querySelectorAll('.user-permission-card')).filter(function(c){return !!m[c.dataset.userKey]});
 }
 function userModeLabel(card){
  var on=card.querySelectorAll('[data-user-perm]:checked').length;
  var ind=card.querySelector('[data-user-enable]');
  return (ind&&ind.checked)
   ? {txt:tl('รายบุคคล · ','Individual · ')+on+' '+tl('สิทธิ์','perms'),ind:true}
   : {txt:tl('ตาม Role','By role'),ind:false};
 }
 /* Built once. Rebuilding it on every tick would throw the admin out of the card they are
    editing; only the row that changed is redrawn. */
 function buildUserPicker(host,list){
  var m=accountKeyMap();
  var all=[].slice.call(list.querySelectorAll('.user-permission-card'));
  /* A card with no login account is hidden, NOT removed: saveRoles() rebuilds
     settings.userPermissions from every card still in the page, so removing one would delete
     its saved entry along with it. */
  all.forEach(function(c){
   if(!m[c.dataset.userKey]){c.style.display='none';c.dataset.noAccount='1'}
  });
  var order=accountRows().map(function(a){return String(accountUser(a).id||'')});
  var cards=all.filter(function(c){return !!m[c.dataset.userKey]}).sort(function(a,b){
   return order.indexOf(a.dataset.userKey)-order.indexOf(b.dataset.userKey);
  });
  if(!cards.length){
   host.insertAdjacentHTML('beforeend','<p class="permx-acc-empty">'+esc2(tl('ยังไม่มีบัญชีผู้ใช้','No accounts yet'))+'</p>');
   return;
  }
  var me='';
  try{me=String((currentUser&&currentUser.id)||'')}catch(e){}
  var box=document.createElement('div');
  box.className='permx-acclist';
  box.setAttribute('role','listbox');
  function rowHTML(card){
   var r=m[card.dataset.userKey],a=r.acc,u=r.user,md=userModeLabel(card);
   var team=a.team||u.team||'';
   try{if(team&&typeof teamLabel==='function')team=teamLabel(team)}catch(e){}
   return '<b>'+esc2(a.username)
    +(card.dataset.userKey===me?'<i>'+esc2(tl('ใช้งานอยู่','signed in'))+'</i>':'')+'</b>'
    +'<small>'+esc2(a.name||u.name||'-')+'</small>'
    +'<span>'+esc2(a.role||u.role||'-')+(team?' · '+esc2(team):'')+'</span>'
    +'<em class="'+(md.ind?'is-ind':'')+'">'+esc2(md.txt)+'</em>';
  }
  var btns=cards.map(function(card,i){
   var b=document.createElement('button');
   b.type='button';
   b.className='permx-acc';
   b.setAttribute('role','option');
   b.innerHTML=rowHTML(card);
   b.onclick=function(){pickAt(i,true)};
   box.appendChild(b);
   return b;
  });
  function pickAt(i,scroll){
   show(cards,i);
   btns.forEach(function(b,j){b.setAttribute('aria-selected',String(j===i));b.classList.toggle('is-on',j===i)});
   if(scroll){try{cards[i].scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}}
  }
  host.appendChild(box);
  pickAt(0,false);
  list.addEventListener('change',function(e){
   var card=e.target&&e.target.closest&&e.target.closest('.user-permission-card');
   if(!card)return;
   var i=cards.indexOf(card);
   if(i>=0)btns[i].innerHTML=rowHTML(card);
  });
 }

 /* ---------- the rearrangement ---------- */
 function enhance(){
  var bodyEl=document.getElementById('modalBody');
  var roleList=document.getElementById('roleList');
  if(!bodyEl||!roleList||bodyEl.querySelector('.permx-tabs'))return;

  /* role tabs */
  var tabs=document.createElement('div');
  tabs.className='permx-tabs';
  tabs.id='permxRoleTabs';
  /* A role name is data, not a UI label. applyLanguageTo() walks the modal on a timeout
     after openModal() and would translate "Technician" to "ช่าง" on the tab while the
     card it selects still says Technician. data-no-i18n is the opt-out it already has. */
  tabs.setAttribute('data-no-i18n','true');
  roleList.parentNode.insertBefore(tabs,roleList);
  var hint=document.createElement('div');
  hint.className='permx-hint';
  hint.textContent=tl('เลือกบทบาทที่ต้องการแก้ไข แล้วติ๊กสิทธิ์ด้านล่าง — แก้ได้ทีละบทบาท แต่กด "บันทึกสิทธิ์ทั้งหมด" ครั้งเดียวบันทึกทุกบทบาท',
                      'Pick a role, tick its permissions below. You edit one role at a time; one Save writes them all.');
  roleList.parentNode.insertBefore(hint,tabs);
  buildRoleTabs(tabs,roleList);

  /* the tab label has to follow the name field and the tick count */
  roleList.addEventListener('input',function(e){
   if(e.target&&e.target.matches('[data-k=name]'))buildRoleTabs(tabs,roleList);
  });
  roleList.addEventListener('change',function(e){
   if(e.target&&e.target.matches('[data-perm]'))buildRoleTabs(tabs,roleList);
  });
  /* Add Role inserts a card and the inline Delete button removes one; watching the list
     covers both without wrapping either.

     A new card must also be *selected*. Without grouping it merely appeared at the end of
     one flat strip, but a new role is named by the admin afterwards, so roleGroupId() puts
     it in the catch-all group — and an admin who was looking at the technician group would
     add a role and see nothing happen. Selecting it moves the group with it. */
  try{
   new MutationObserver(function(recs){
    var added=recs.some(function(r){return r.addedNodes&&r.addedNodes.length});
    var cards=roleList.querySelectorAll('.role-card:not(.user-permission-card)');
    buildRoleTabs(tabs,roleList,added?cards.length-1:undefined);
   }).observe(roleList,{childList:true});
  }catch(e){}

  /* individual permissions */
  var userList=document.getElementById('userPermissionList');
  if(userList){
   addMissingAccounts(userList);
   var pick=document.createElement('div');
   pick.className='permx-userpick-wrap';
   pick.setAttribute('data-no-i18n','true');
   pick.innerHTML='<label>👤 '+esc2(tl('เลือกบัญชีผู้ใช้ที่จะกำหนดสิทธิ์','Pick the account to set permissions for'))+'</label>';
   userList.parentNode.insertBefore(pick,userList);
   buildUserPicker(pick,userList);
   /* Counts accounts, not cards — the hidden demo-name cards are still in the list. */
   var badge=document.querySelector('.user-permission-badge');
   if(badge)badge.textContent=accountCards(userList).length+' '+tl('บัญชี','accounts');

   /* 2026-09-15: สิทธิ์รายบุคคล is a second VIEW of this popup, not a second popup.
      A second openModal() would replace this body — and saveRoles() collects the role cards
      from the DOM, so the roles would be saved as an empty list. Both sections stay in the
      document and only one is visible; the one save button still writes both.
      Hidden with the `hidden` attribute: css/23's global [hidden]{display:none!important}
      makes it win over any author display rule on these wrappers. */
   var userSec=userList.closest('.roles-split-grid > *')||userList.parentNode;
   var roleSec=roleList.closest('.roles-split-grid > *')||roleList.parentNode;
   var grid=bodyEl.querySelector('.roles-split-grid');
   if(grid)grid.classList.add('permx-single');
   var topNote=bodyEl.querySelector('.roles-top-note');
   var backBar=document.createElement('div');
   backBar.className='permx-backbar';
   backBar.innerHTML='<button type="button" class="permx-back">‹ '
     +esc2(tl('กลับไปสิทธิ์ตามบทบาท','Back to roles'))+'</button>';
   userSec.insertBefore(backBar,userSec.firstChild);
   backBar.querySelector('button').onclick=function(){window.imodePermView('role')};
   /* "+ เพิ่ม Role" means nothing on the per-person view. The role cards carry their own
      "ลบ Role" buttons, so only the footer row is searched. */
   function addRoleBtn(){
    return [].filter.call(bodyEl.querySelectorAll('.button-row button'),function(b){
     return !b.closest('.role-card')&&/Role/i.test(b.textContent)&&!/บันทึก|Save/i.test(b.textContent);
    })[0]||null;
   }
   window.imodePermView=function(v){
    var u=(v==='user');
    userSec.hidden=!u;
    roleSec.hidden=u;
    if(topNote)topNote.hidden=u;
    var add=addRoleBtn();
    if(add)add.hidden=u;
    try{
     bodyEl.scrollTop=0;
     var panel=bodyEl.closest('.modal-panel');
     if(panel)panel.scrollTop=0;
    }catch(e){}
   };
   window.imodePermView('role');
   /* addMissingAccounts() above added cards after the group row was first drawn, so its
      account count would read short. Redraw it now the list is complete. */
   buildRoleTabs(tabs,roleList);
  }

  /* the save bar */
  var row=bodyEl.querySelector('.button-row');
  if(row){
   var bar=document.createElement('div');
   bar.className='permx-savebar';
   row.parentNode.insertBefore(bar,row);
   bar.appendChild(row);
  }
 }

 var baseOpen=window.openRolesSettingModal;
 if(typeof baseOpen==='function'){
  window.openRolesSettingModal=function(){
   var r=baseOpen.apply(this,arguments);
   try{enhance()}catch(e){}
   return r;
  };
 }

 /* ---------- do not let an admin lock themselves out ---------- */
 var baseSave=window.saveRoles;
 if(typeof baseSave==='function'){
  window.saveRoles=function(){
   var roleList=document.getElementById('roleList');
   if(roleList){
    var mine='';
    try{mine=(typeof currentRoleConfig==='function'&&(currentRoleConfig()||{}).name)||''}catch(e){}
    if(mine){
     var card=[].slice.call(roleList.querySelectorAll('.role-card:not(.user-permission-card)'))
      .filter(function(c){var n=c.querySelector('[data-k=name]');return n&&String(n.value||'').trim()===mine})[0];
     if(card){
      var keep=card.querySelector('[data-perm="settings.manage"]');
      if(keep&&!keep.checked){
       var ok=window.confirm(tl(
        'บทบาท "'+mine+'" ของคุณกำลังจะไม่มีสิทธิ์ "แก้ไขตั้งค่าระบบ" (settings.manage)\nถ้าบันทึก คุณจะเปิดหน้าตั้งค่าและหน้ากำหนดสิทธิ์นี้ไม่ได้อีก\n\nต้องการบันทึกต่อหรือไม่?',
        'Your role "'+mine+'" is about to lose settings.manage.\nAfter saving you will not be able to open Settings, or this permission screen, again.\n\nSave anyway?'));
       if(!ok)return;
      }
     }
    }
   }
   return baseSave.apply(this,arguments);
  };
 }

 /* ---------- styles ---------- */
 var st=document.createElement('style');
 st.id='v69PermissionEditorStyle';
 st.textContent=''
 +'.permx-hint{margin:10px 0 8px;padding:9px 12px;border-radius:12px;background:#f2f7ff;border:1px solid #dae7fa;color:#3d557f;font-size:12px;line-height:1.5}'
 +'.permx-tabs{margin:0 0 12px}'
 +'.permx-groups{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}'
 /* 2026-09-15: the door to the per-person view — the same pill as a group, but dashed and in
    the accent colour so it reads as "somewhere else", not as a fourth kind of role. */
 +'.permx-group.permx-userbtn{border-style:dashed;border-color:#f0a44b;background:#fff8f0}'
 +'.permx-group.permx-userbtn b{color:#b45f0c}'
 +'.permx-group.permx-userbtn:hover{background:#fff0e0;border-color:#e07a14}'
 /* One section at a time, so the grid never leaves an empty column beside the visible one. */
 +'.roles-split-grid.permx-single{grid-template-columns:1fr!important}'
 +'.permx-backbar{margin:0 0 12px}'
 +'.permx-back{border:1px solid #d7e3f5;background:#fff;color:#0b63e5;border-radius:10px;'
 +'padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}'
 +'.permx-back:hover{background:#eef5ff;border-color:#0b63e5}'
 +'.permx-back:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.permx-tabrow{display:flex;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid #e2ecfb;border-radius:14px;background:#f7fbff}'
 +'.permx-group{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:140px;padding:9px 14px;border:1px solid #d7e3f5;border-radius:999px;background:#fff;cursor:pointer;text-align:left;transition:border-color .14s ease,background .14s ease}'
 +'.permx-group b{font-size:12.5px;color:#3d557f;font-weight:700}'
 +'.permx-group small{font-size:10.5px;color:#8496b5}'
 +'.permx-group:hover{border-color:#a9cdf7;background:#f3f8ff}'
 +'.permx-group[aria-pressed="true"]{border-color:#0b63e5;background:#0b63e5}'
 +'.permx-group[aria-pressed="true"] b,.permx-group[aria-pressed="true"] small{color:#fff}'
 +'.permx-group:focus-visible,.permx-tab:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.permx-tab{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:132px;padding:9px 13px;border:1px solid #d7e3f5;border-radius:12px;background:linear-gradient(180deg,#fff,#f3f7ff);cursor:pointer;text-align:left;box-shadow:0 3px 0 #e4ecf9;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}'
 +'.permx-tab b{font-size:13px;color:#0c225e;font-weight:700}'
 +'.permx-tab small{font-size:10.5px;color:#6f81a3}'
 +'.permx-tab:hover{transform:translateY(-2px);border-color:#a9cdf7;box-shadow:0 5px 0 #dce8f9}'
 +'.permx-tab:active{transform:translateY(2px);box-shadow:0 1px 0 #dce8f9}'
 +'.permx-tab[aria-pressed="true"]{border-color:#0b63e5;background:linear-gradient(180deg,#eaf3ff,#dcebff);box-shadow:0 3px 0 #b9d5fb}'
 +'.permx-tab[aria-pressed="true"] b{color:#0b63e5}'
 /* 2026-09-15: the account picker is the first thing on this view and has to read as such —
    a framed block in the brand blue, with the accounts as rows like การจัดการบัญชีผู้ใช้. */
 +'.permx-userpick-wrap{margin:10px 0 14px;padding:14px;border:2px solid #0b63e5;border-radius:16px;'
 +'background:linear-gradient(180deg,#f4f9ff,#fff);box-shadow:0 8px 20px rgba(11,99,229,.10)}'
 +'.permx-userpick-wrap label{display:block;font-size:14px;color:#0c225e;margin-bottom:10px;font-weight:800}'
 +'.permx-acclist{display:grid;gap:8px;max-height:46vh;overflow:auto;padding:2px}'
 +'.permx-acc{display:grid;grid-template-columns:1fr auto;grid-template-areas:"u m" "n m" "r m";gap:2px 10px;'
 +'align-items:center;width:100%;text-align:left;font:inherit;cursor:pointer;border:1px solid #dbe6f7;'
 +'border-radius:12px;background:#fff;padding:10px 12px;transition:border-color .14s,background .14s,box-shadow .14s}'
 +'.permx-acc b{grid-area:u;font-size:14px;color:#0c225e}'
 +'.permx-acc b i{font-style:normal;font-size:10px;font-weight:800;color:#0a6b3d;margin-left:6px}'
 +'.permx-acc small{grid-area:n;font-size:11.5px;color:#7385a5}'
 +'.permx-acc span{grid-area:r;font-size:12px;color:#41527a}'
 +'.permx-acc em{grid-area:m;font-style:normal;font-size:11px;font-weight:800;color:#5b6b88;background:#eef2f8;'
 +'border-radius:999px;padding:3px 10px;white-space:nowrap}'
 +'.permx-acc em.is-ind{color:#a8660c;background:#fff3e2}'
 +'.permx-acc:hover{border-color:#b9d3f5;background:#f6faff}'
 +'.permx-acc.is-on{border-color:#0b63e5;background:#eef5ff;box-shadow:inset 0 0 0 1px #0b63e5}'
 +'.permx-acc:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'.permx-acc-empty{margin:0;font-size:12px;color:#7385a5}'
 +'.permx-userpick{width:100%;max-width:420px;padding:10px 12px;border:1px solid #d3e0f4;border-radius:12px;font-size:13px;background:#fff}'
 +'.permx-savebar{position:sticky;bottom:0;z-index:5;margin:14px -4px -4px;padding:12px 4px;background:linear-gradient(180deg,rgba(255,255,255,.72),#fff 42%);border-top:1px solid #e2ecfb}'
 +'.permx-savebar .button-row{margin:0}'
 +'@media (max-width:640px){.permx-tab{min-width:calc(50% - 4px);flex:1 1 calc(50% - 4px)}.permx-group{min-width:calc(50% - 4px);flex:1 1 calc(50% - 4px);border-radius:14px}.permx-userpick{max-width:100%}}';
 document.head.appendChild(st);
})();
