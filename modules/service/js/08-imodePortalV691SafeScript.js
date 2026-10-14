(function(){
  'use strict';

  var state={installed:false,originals:{}};

  function byId(id){return document.getElementById(id)}
  function safeEsc(value){
    if(typeof esc==='function')return esc(value==null?'':String(value));
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]});
  }
  function currentLanguage(){
    try{return typeof settings!=='undefined'&&settings&&settings.language==='en'?'en':'th'}catch(e){return'th'}
  }
  function tr(th,en){return currentLanguage()==='en'?en:th}
  function getShell(){return document.querySelector('#page-customer-portal .portal-shell')}
  function getContent(){return byId('portalContent')}
  function getActionGrid(){return document.querySelector('#page-customer-portal .portal-action-grid')}
  function getConfig(){
    try{return typeof settings!=='undefined'&&settings&&settings.lineConfig?settings.lineConfig:{}}catch(e){return{}}
  }
  function getCompany(){
    try{
      return {
        name:(settings.companyNameTh||settings.companyName||'I-MODE Plus'),
        phone:(settings.companyPhone||''),
        email:(settings.companyEmail||''),
        address:(settings.companyAddress||'')
      };
    }catch(e){return{name:'I-MODE Plus',phone:'',email:'',address:''}}
  }
  function getMachine(){
    try{return typeof portalMachine==='function'?portalMachine():null}catch(e){return null}
  }
  function lineOfficialUrl(){
    var cfg=getConfig();
    var add=safeUrl(String(cfg.addFriendUrl||'').trim());
    if(add)return add;
    var id=String(cfg.officialAccountId||'').trim();
    if(!id)return'';
    if(id.charAt(0)!=='@')id='@'+id;
    return 'https://line.me/R/ti/p/'+encodeURIComponent(id);
  }
  /* 2026-10-09 security: addFriendUrl is a stored, staff-editable link. A "javascript:" value
     must never be opened - and the location.href fallback below always runs, because
     window.open with 'noopener' returns null. js/03 imodeSafeUrl keeps http(s)/line/tel/mailto. */
  function safeUrl(u){
    if(typeof window.imodeSafeUrl==='function')return window.imodeSafeUrl(u);
    return /^https?:\/\//i.test(String(u||''))?String(u):'';
  }
  function openExternal(url){
    url=safeUrl(url);
    if(!url)return false;
    try{
      if(typeof liff!=='undefined'&&liff&&typeof liff.isInClient==='function'&&liff.isInClient()&&typeof liff.openWindow==='function'){
        liff.openWindow({url:url,external:true});
        return true;
      }
    }catch(e){}
    try{
      var opened=window.open(url,'_blank','noopener,noreferrer');
      if(!opened)window.location.href=url;
      return true;
    }catch(e){
      window.location.href=url;
      return true;
    }
  }
  function machineContextHtml(){
    var m=getMachine();
    if(!m)return'';
    var name=m.name||m.nameTh||m.nameEn||tr('เครื่องจักร','Machine');
    var model=m.model||'-';
    var serial=m.serial||'-';
    return '<div class="imode-portal-machine-context"><span>⚙</span><div><b>'+safeEsc(name)+'</b><small>'+safeEsc(model)+' · S/N '+safeEsc(serial)+'</small></div></div>';
  }
  function ensureMachineContext(){
    var content=getContent();
    if(!content||content.querySelector('.imode-portal-machine-context'))return;
    var html=machineContextHtml();
    if(html)content.insertAdjacentHTML('afterbegin',html);
  }
  function ensureToolbar(){
    var shell=getShell();
    if(!shell)return null;
    var toolbar=byId('imodePortalDetailToolbar');
    if(toolbar)return toolbar;
    toolbar=document.createElement('div');
    toolbar.id='imodePortalDetailToolbar';
    toolbar.className='imode-portal-detail-toolbar';
    toolbar.setAttribute('aria-hidden','true');
    toolbar.innerHTML='<button type="button" id="imodePortalBackButton" class="imode-portal-back-btn" aria-label="'+safeEsc(tr('กลับ','Back'))+'">‹</button>'+
      '<div class="imode-portal-detail-title"><b id="imodePortalDetailTitle">'+safeEsc(tr('รายละเอียดบริการ','Service Details'))+'</b><small id="imodePortalDetailSubtitle">'+safeEsc(tr('ข้อมูลอ้างอิงจาก QR ประจำเครื่อง','Linked to this machine QR'))+'</small></div>'+
      '<button type="button" id="imodePortalLineButton" class="imode-portal-line-btn">LINE</button>';
    var identity=byId('portalLineIdentity');
    if(identity&&identity.parentNode)identity.parentNode.insertBefore(toolbar,identity.nextSibling);
    else shell.insertBefore(toolbar,shell.firstChild);
    var back=byId('imodePortalBackButton');
    var line=byId('imodePortalLineButton');
    if(back)back.addEventListener('click',function(){window.imodePortalBackHome()});
    if(line)line.addEventListener('click',function(){window.openPortalLineOfficial()});
    return toolbar;
  }
  function setPortalMode(mode,title){
    var shell=getShell();
    var toolbar=ensureToolbar();
    if(!shell)return;
    var detail=mode==='detail';
    shell.classList.toggle('imode-portal-detail-mode',detail);
    if(toolbar)toolbar.setAttribute('aria-hidden',detail?'false':'true');
    var titleNode=byId('imodePortalDetailTitle');
    if(titleNode&&title)titleNode.textContent=title;
    var content=getContent();
    if(content)content.classList.toggle('imode-portal-detail-content',detail);
    try{window.scrollTo({top:0,behavior:'auto'})}catch(e){window.scrollTo(0,0)}
  }
  function updateLineIdentity(){
    var identity=byId('portalLineIdentity');
    if(!identity)return;
    var profile=null;
    try{profile=typeof portalLineProfile!=='undefined'?portalLineProfile:null}catch(e){}
    var label=profile&&profile.displayName?
      tr('LINE: ','LINE: ')+profile.displayName+tr(' · เชื่อมต่อหน้าหลักลูกค้าแล้ว',' · Customer Home connected'):
      tr('หน้าหลักลูกค้า · ใช้งานผ่าน QR หรือ LIFF','Customer Home · Available through QR or LIFF');
    identity.innerHTML='<div class="imode-line-identity-inner"><span>'+safeEsc(label)+'</span><button type="button" class="imode-line-mini-btn" id="imodePortalIdentityLineButton">LINE OA</button></div>';
    var btn=byId('imodePortalIdentityLineButton');
    if(btn)btn.addEventListener('click',function(){window.openPortalLineOfficial()});
  }
  function detailAfter(original,title,args){
    var result;
    if(typeof original==='function')result=original.apply(window,args||[]);
    setPortalMode('detail',title);
    ensureMachineContext();
    return result;
  }
  function wrapDetail(name,titleTh,titleEn){
    var original=window[name];
    if(typeof original!=='function')return;
    state.originals[name]=original;
    window[name]=function(){
      return detailAfter(original,tr(titleTh,titleEn),Array.prototype.slice.call(arguments));
    };
  }
  function renderContactPage(){
    var content=getContent();
    if(!content)return;
    var cfg=getConfig();
    var company=getCompany();
    var lineUrl=lineOfficialUrl();
    var phoneHref=String(company.phone||'').replace(/[^0-9+]/g,'');
    var oa=String(cfg.officialAccountId||'').trim();
    var lineStatus=lineUrl?
      (oa?tr('LINE OA: ','LINE OA: ')+oa:tr('พร้อมเปิด LINE Official Account','LINE Official Account is ready')):
      tr('ยังไม่ได้ตั้งค่า Add Friend URL หรือ LINE OA ID','Add Friend URL or LINE OA ID is not configured');
    var html=machineContextHtml()+
      '<h3 style="margin:0;color:#0c225e">💬 '+safeEsc(tr('ติดต่อ Service','Contact Service'))+'</h3>'+
      '<p style="font-size:11px;color:#69758d;line-height:1.6">'+safeEsc(tr('เลือกช่องทางที่สะดวก ทีม Service จะอ้างอิงเครื่องและ Serial จาก QR นี้','Choose a contact channel. Service will use the machine and serial from this QR.'))+'</p>'+
      '<div class="imode-portal-contact-grid">'+
        '<div class="imode-portal-contact-card"><strong>LINE Official Account</strong><small>'+safeEsc(lineStatus)+'</small><button type="button" id="imodePortalContactLine" class="imode-portal-contact-action line"'+(lineUrl?'':' disabled')+'>'+safeEsc(tr('เปิด LINE Service','Open LINE Service'))+'</button></div>'+
        '<div class="imode-portal-contact-card"><strong>'+safeEsc(tr('โทรศัพท์ Service','Service Phone'))+'</strong><small>'+safeEsc(company.phone||tr('ยังไม่ได้ตั้งค่าเบอร์โทร','Phone number is not configured'))+'</small>'+(phoneHref?'<a class="imode-portal-contact-action" href="tel:'+safeEsc(phoneHref)+'">'+safeEsc(tr('โทรหา Service','Call Service'))+'</a>':'<span class="imode-portal-contact-action soft">'+safeEsc(tr('ยังไม่มีเบอร์โทร','No phone number'))+'</span>')+'</div>'+
        '<div class="imode-portal-contact-card"><strong>'+safeEsc(tr('อีเมล Service','Service Email'))+'</strong><small>'+safeEsc(company.email||tr('ยังไม่ได้ตั้งค่าอีเมล','Email is not configured'))+'</small>'+(company.email?'<a class="imode-portal-contact-action soft" href="mailto:'+safeEsc(company.email)+'">'+safeEsc(tr('ส่งอีเมล','Send Email'))+'</a>':'')+'</div>'+
        '<div class="imode-portal-contact-card"><strong>'+safeEsc(company.name)+'</strong><small>'+safeEsc(company.address||tr('ข้อมูลที่อยู่บริษัท','Company address'))+'</small></div>'+
      '</div>';
    content.innerHTML=html;
    var lineBtn=byId('imodePortalContactLine');
    if(lineBtn&&lineUrl)lineBtn.addEventListener('click',function(){openExternal(lineUrl)});
    setPortalMode('detail',tr('ติดต่อ Service','Contact Service'));
  }
  function renderLineSetupNotice(){
    var content=getContent();
    if(!content)return;
    content.innerHTML=machineContextHtml()+
      '<h3 style="margin:0;color:#0c225e">LINE Official Account</h3>'+
      '<div class="info-box" style="margin-top:12px">'+safeEsc(tr('ยังไม่ได้กำหนด Add Friend URL หรือ LINE Official Account ID กรุณาเข้า Settings → LINE OA Customer Portal แล้วกรอก LIFF ID และ Add Friend URL','Add Friend URL or LINE Official Account ID is not configured. Open Settings → LINE OA Customer Portal and enter the LIFF ID and Add Friend URL.'))+'</div>'+
      '<button type="button" class="soft-btn" style="width:100%" id="imodePortalSetupBack">'+safeEsc(tr('กลับหน้าบริการ','Back to Services'))+'</button>';
    var back=byId('imodePortalSetupBack');
    if(back)back.addEventListener('click',function(){window.imodePortalBackHome()});
    setPortalMode('detail','LINE Official Account');
  }
  function install(){
    if(state.installed)return;
    var shell=getShell();
    if(!shell)return;
    state.installed=true;
    ensureToolbar();

    /* Keep the original renderer and only add view-state behavior. */
    var originalRender=window.renderCustomerPortal;
    if(typeof originalRender==='function'){
      state.originals.renderCustomerPortal=originalRender;
      window.renderCustomerPortal=function(){
        var result=originalRender.apply(window,arguments);
        setPortalMode('home');
        updateLineIdentity();
        return result;
      };
    }

    wrapDetail('openPortalIssueForm','แจ้งปัญหาเครื่อง','Report Machine Issue');
    wrapDetail('showPortalWarranty','เช็คประกัน','Warranty Status');
    wrapDetail('openPortalServiceQuoteRequest','ขอราคา Service','Service Quotation');
    wrapDetail('openPortalWarrantyRequest','ซื้อ / ต่อ Warranty','Purchase / Extend Warranty');
    wrapDetail('showPortalHistory','ประวัติ Service','Service History');
    wrapDetail('showPortalDocuments','คู่มือเครื่อง','Machine Documents');
    /* js/34 defines this at parse time, so it is already on window when install()
       runs at DOMContentLoaded and it gets the same back arrow, machine strip and
       detail-mode class as every other portal detail view. */
    wrapDetail('showPortalQuotations','ใบเสนอราคาของฉัน','My Quotations');

    state.originals.contactServiceFromPortal=window.contactServiceFromPortal;
    window.contactServiceFromPortal=renderContactPage;

    window.imodePortalBackHome=function(){
      if(typeof state.originals.renderCustomerPortal==='function'){
        state.originals.renderCustomerPortal.call(window);
      }
      setPortalMode('home');
      updateLineIdentity();
    };
    window.openPortalLineOfficial=function(){
      var url=lineOfficialUrl();
      if(url){openExternal(url);return}
      renderLineSetupNotice();
    };

    /* Existing inline onclick attributes remain unchanged and call these wrappers. */
    updateLineIdentity();
    setPortalMode('home');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  /* Re-install is intentionally idempotent and covers pages restored by browser cache. */
  window.addEventListener('pageshow',function(){if(!state.installed)install()});
})();
