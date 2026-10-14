/* V6.8 UAT accounts & roles.
   Adds a username/password login on top of the existing user picker without
   replacing it. Staff passwords are stored as SHA-256 hashes. In this public repository every
   hash is left empty, so none of these accounts can sign in until a hash is set locally.
   This is a UAT-only client-side login: it is not real authentication. */
(function(){
 const K256=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 /* Synchronous SHA-256 so the login works from file:// too, where crypto.subtle is unavailable. */
 function sha256(msg){
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const b=Array.from(new TextEncoder().encode(String(msg))),bits=b.length*8;
  b.push(0x80);while(b.length%64!==56)b.push(0);
  for(let i=7;i>=0;i--)b.push(Math.floor(bits/Math.pow(2,i*8))&0xff);
  const rr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
  for(let i=0;i<b.length;i+=64){
   const w=new Array(64);
   for(let j=0;j<16;j++)w[j]=((b[i+j*4]<<24)|(b[i+j*4+1]<<16)|(b[i+j*4+2]<<8)|b[i+j*4+3])>>>0;
   for(let j=16;j<64;j++){
    const s0=(rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3))>>>0,s1=(rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10))>>>0;
    w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;
   }
   let a=H[0],c=H[1],d=H[2],e=H[3],f=H[4],g=H[5],h=H[6],k=H[7];
   for(let j=0;j<64;j++){
    const S1=(rr(f,6)^rr(f,11)^rr(f,25))>>>0,ch=((f&g)^(~f&h))>>>0,t1=(k+S1+ch+K256[j]+w[j])>>>0;
    const S0=(rr(a,2)^rr(a,13)^rr(a,22))>>>0,mj=((a&c)^(a&d)^(c&d))>>>0,t2=(S0+mj)>>>0;
    k=h;h=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0;
   }
   const v=[a,c,d,e,f,g,h,k];
   for(let j=0;j<8;j++)H[j]=(H[j]+v[j])>>>0;
  }
  return H.map(x=>x.toString(16).padStart(8,'0')).join('');
 }

 /* Staff accounts: password hashes only, so the plaintext is not in the source. The hashes
    are blank in this repository (an empty hash never matches); set them only in a local copy. */
 /* dev-only: the UAT logins and their hashes. The production build removes them — on the
    server every login is a Supabase Auth user (G:/ImodeService-production/database). */
 const STAFF=[
  /*@dev-only*/
  {username:'admin_test',hash:'',accountType:'staff',name:'ผู้ดูแลระบบ UAT',role:'Admin / Coordinator',team:'Admin'},
  {username:'technician_test1',hash:'',accountType:'technician',technicianId:'T001',role:'Technician',team:'Technical'},
  {username:'technician_test2',hash:'',accountType:'technician',technicianId:'T002',role:'Technician',team:'Technical'},
  /* Team leads. v69TeamScopeScript creates the two placeholder technician records these
     point at, and the two lead roles. */
  {username:'lead_technician',hash:'',accountType:'technician',technicianId:'T-LEAD-TECH',userId:'USR-003',name:'Example Tech Lead',role:'Technical Lead',team:'Technical'},
  /* 2026-09-23, on the owner's own mapping: หัวหน้า R&D ข = Example R&D Lead (USR-004), and he is
     to hold ONE account. lead_rd is that account, linked the same way lead_technician is
     linked to หัวหน้าช่าง ก; the duplicate `rd_demo` account js/96 had created is removed by the
     dedupe there, which also merges its technician record into T-LEAD-RD. */
  {username:'lead_rd',hash:'',accountType:'technician',technicianId:'T-LEAD-RD',userId:'USR-004',name:'Example R&D Lead',role:'R&D Lead',team:'R&D'},
  /* Beta test accounts. R&D holds exactly the technician module set — the role name is the
     only difference, which is why it points at the existing 'Technician - R&D' role rather
     than at a new permission list. The two technician records they point at are seeded by
     v70BetaScript. findAccount() lower-cases both sides, so 'R&D_test1' is matched however
     it is typed; the hash is of the exact string, so the password itself stays case
     sensitive. */
  /* 2026-09-20, at the owner's request and AFTER checking the live database first:
     T-TEST-1 and T-RD-1 were both deleted from `technicians` at some point, so these two
     accounts pointed at records that no longer exist. Measured: they signed in fine and
     then saw an empty งานของฉัน and an empty หน้างาน for ever, because every one of those
     screens resolves the work through currentUser.technicianId.
     tech_test1 now points at T003 (ช่าง ค), a real Technical technician who had no account.
     R&D_test1 is removed outright — the owner said to drop it rather than re-point it.
     The R&D ROLE and the T-RD-1 seed in js/25 are untouched; only the account is gone. */
  {username:'tech_test1',hash:'',accountType:'technician',technicianId:'T003',role:'Technician',team:'Technical'}
  /*@end-dev-only*/
 ];

 /* Every customer in the system gets an account. CUST-0001 -> customer_test1, and so on. */
 /* CUST-INTERNAL-IMODE is I-MODE's own record for QC / internal issue, not an external customer. */
 const INTERNAL_CUSTOMER_ID='CUST-INTERNAL-IMODE';
 /* The username follows the customer id, never the array position, so the mapping cannot shift. */
 function customerUsername(c){
  const id=String(c&&c.id||''),m=id.match(/(\d+)\s*$/);
  return m?'customer_test'+parseInt(m[1],10):'customer_'+id.toLowerCase().replace(/[^a-z0-9]+/g,'_');
 }
 /* Customers no longer hold accounts: they reach their machine through the LINE OA by
    scanning the QR or typing the serial, so there is nothing left for a customer login to
    do. Returning an empty list here removes them from the account registry itself, which
    is what findAccount(), verify() and the account list all read — not just from the
    window.uatAuth view of it. */
 function customerAccounts(){return []}
 function allAccounts(){return STAFF.concat(customerAccounts())}
 function findAccount(u){const k=String(u||'').trim().toLowerCase();return allAccounts().find(a=>a.username.toLowerCase()===k)||null}

 function accountToUser(acc){
  const base={id:'UAT-'+acc.username,username:acc.username,accountType:acc.accountType,role:acc.role,permissionRole:acc.role,team:acc.team||'',photo:''};
  if(acc.accountType==='technician'){
   const t=(Array.isArray(technicians)?technicians:[]).find(x=>x.id===acc.technicianId);
   /* Field Service matches the logged-in technician by name, so keep the technician's own name. */
   return {...base,name:t&&t.name||acc.username,technicianId:acc.technicianId,photo:t&&t.photo||''};
  }
  if(acc.accountType==='customer'){
   const c=(Array.isArray(customers)?customers:[]).find(x=>x.id===acc.customerId);
   return {...base,name:c&&c.name||acc.name,customerId:acc.customerId};
  }
  return {...base,name:acc.name};
 }

 /* renderFieldService() reads the existing fieldTechSelect value before fieldTechId, so
    point the select at this technician first when switching between technician accounts. */
 function openTechnicianWorkspace(tid){
  if(typeof openFieldService!=='function')return;
  const sel=document.getElementById('fieldTechSelect');
  if(sel&&Array.prototype.some.call(sel.options,o=>o.value===tid))sel.value=tid;
  openFieldService(tid);
 }
 function isCustomerSession(){return !!(currentUser&&currentUser.accountType==='customer')}
 function customerMachines(cid){return (Array.isArray(machines)?machines:[]).filter(m=>m.customerId===cid)}
 function machineToken(m){return m&&(m.qrToken||m.id)||''}

 function enterCustomerPortal(){
  const list=customerMachines(currentUser&&currentUser.customerId);
  const keep=list.some(m=>machineToken(m)===portalMachineToken);
  if(!keep)portalMachineToken=machineToken(list[0]);
  goPage('customer-portal');
  renderCustomerPortal();
 }
 window.uatPortalSelectMachine=function(token){
  if(!token)return;
  portalMachineToken=token;
  renderCustomerPortal();
 };

 /* Verify only: returns the account and the user object without touching the session,
    so the ImodeAuth provider layer can own session creation. */
 function verify(username,password){
  const acc=findAccount(username);
  if(!acc||sha256(password)!==acc.hash)return null;
  return {account:acc,user:accountToUser(acc)};
 }
 function login(username,password){
  const acc=findAccount(username);
  if(!acc||sha256(password)!==acc.hash)return null;
  currentUser=accountToUser(acc);
  saveLocal();
  return acc;
 }
 window.uatSubmitLogin=function(e){
  e.preventDefault();
  const uEl=document.getElementById('uatLoginUser'),pEl=document.getElementById('uatLoginPass'),errEl=document.getElementById('uatLoginError');
  const acc=login(uEl?uEl.value:'',pEl?pEl.value:'');
  if(!acc){
   if(errEl){errEl.textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';errEl.classList.add('show')}
   if(pEl){pEl.value='';pEl.focus()}
   return;
  }
  closeModal();
  renderAll();
  if(acc.accountType==='customer'){enterCustomerPortal();toastMsg('เข้าสู่ระบบลูกค้า: '+currentUser.name);return}
  /* The role Home Page script owns the staff destination when it is loaded. */
  const routed=typeof window.imodeRoleHomeAfterLogin==='function'&&window.imodeRoleHomeAfterLogin(acc);
  if(!routed&&acc.accountType==='technician')openTechnicianWorkspace(acc.technicianId);
  toastMsg('เข้าสู่ระบบเป็น '+currentUser.name);
 };
 function clearSession(){currentUser=null;saveLocal()}
 window.uatLogout=function(){
  clearSession();
  portalMachineToken='';
  document.body.classList.remove('customer-portal-mode');
  closeModal();
  goPage('dashboard');
  renderAll();
  toastMsg('ออกจากระบบแล้ว');
 };

 /* Shared with the role Home Page script so it reuses this login instead of adding one. */
 window.uatAuth={login,verify,findAccount,accountToUser,allAccounts,isCustomerSession,
  enterCustomerPortal,hash:sha256,setSessionUser(u){currentUser=u;saveLocal()},
  logout(silent){if(!silent){window.uatLogout();return}clearSession();renderAll()}};

 /* Customer sessions stay inside the portal. */
 const baseGoPage=window.goPage;
 window.goPage=function(name){
  if(isCustomerSession()&&name!=='customer-portal')return baseGoPage.call(this,'customer-portal');
  return baseGoPage.apply(this,arguments);
 };

 const basePortalRender=window.renderCustomerPortal;
 window.renderCustomerPortal=function(){
  const r=basePortalRender.apply(this,arguments);
  decoratePortal();
  return r;
 };
 function decoratePortal(){
  const close=document.querySelector('#page-customer-portal .portal-close');
  if(close){
   if(isCustomerSession()){close.textContent='ออก';close.title='ออกจากระบบ';close.setAttribute('onclick','uatLogout()')}
   else{close.textContent='×';close.title='';close.setAttribute('onclick','exitCustomerPortal()')}
  }
  const hero=document.getElementById('portalMachineHero');
  if(!hero||!isCustomerSession())return;
  const list=customerMachines(currentUser.customerId);
  if(!list.length){hero.innerHTML='<div class="portal-content"><b>ยังไม่มีเครื่องจักรผูกกับบริษัทของคุณ</b><p>กรุณาติดต่อ I-MODE Plus Service</p></div>';return}
  if(list.length<2)return;
  const cur=portalMachineToken;
  const opts=list.map(m=>`<option value="${esc(machineToken(m))}"${machineToken(m)===cur?' selected':''}>${esc(machinePrimaryName(m))} · S/N ${esc(m.serial||'-')}</option>`).join('');
  const box=document.createElement('div');
  box.className='uat-portal-picker';
  box.innerHTML=`<label>เครื่องจักรของบริษัท (${list.length} เครื่อง)</label><select onchange="uatPortalSelectMachine(this.value)">${opts}</select>`;
  hero.insertBefore(box,hero.firstChild);
 }

 /* Restore a customer session on reload, unless a machine QR token is in the URL. */
 const basePortalInit=window.initPortalFromUrl;
 window.initPortalFromUrl=async function(){
  const r=await basePortalInit.apply(this,arguments);
  if(isCustomerSession()&&!new URLSearchParams(location.search).get('machineToken'))enterCustomerPortal();
  return r;
 };

 const baseOpenLogin=window.openUserLoginModal;
 window.openUserLoginModal=function(){
  baseOpenLogin.apply(this,arguments);
  const body=document.getElementById('modalBody');
  if(!body)return;
  const accounts=allAccounts();
  const rows=accounts.map(a=>`<div><b>${esc(a.username)}</b><span>${esc(a.accountType==='technician'?'ช่างเทคนิค '+a.technicianId:a.accountType==='customer'?a.name:a.role)}</span></div>`).join('');
  const box=document.createElement('div');
  box.className='uat-login-box';
  box.innerHTML=`<form id="uatLoginForm" onsubmit="uatSubmitLogin(event)">
   <div class="uat-login-head"><b>เข้าสู่ระบบ</b><small>ใช้ชื่อผู้ใช้และรหัสผ่านของคุณ · Version 1.0</small></div>
   <div class="form-grid cols2">
    <div class="field"><label>ชื่อผู้ใช้</label><input id="uatLoginUser" autocomplete="username" placeholder="admin_test"></div>
    <div class="field"><label>รหัสผ่าน</label><input id="uatLoginPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
   </div>
   <div id="uatLoginError" class="uat-login-error"></div>
   <div class="button-row"><button type="submit" class="primary-btn action-3d-orange">เข้าสู่ระบบ</button>${currentUser?'<button type="button" class="soft-btn" onclick="uatLogout()">ออกจากระบบ</button>':''}</div>
   <details class="uat-account-hint"><summary>บัญชีทดสอบทั้งหมด (${accounts.length} บัญชี) · รหัสผ่าน = ชื่อผู้ใช้</summary><div class="uat-account-list">${rows}</div></details>
  </form>`;
  body.insertBefore(box,body.firstChild);
 };

 const style=document.createElement('style');
 style.id='v68UatAccountsStyle';
 style.textContent=`
 .uat-login-box{border:1px solid #d8e2f2;border-radius:14px;padding:14px;margin-bottom:14px;background:linear-gradient(180deg,#f7faff,#fff)}
 .uat-login-head{margin-bottom:10px}
 .uat-login-head b{display:block;color:#0c225e;font-size:14px}
 .uat-login-head small{color:var(--muted);font-size:11px}
 .uat-login-error{display:none;margin:8px 0 0;padding:8px 10px;border-radius:9px;background:#fdecec;color:#b32020;font-size:12px}
 .uat-login-error.show{display:block}
 .uat-account-hint{margin-top:10px;font-size:11px;color:var(--muted)}
 .uat-account-hint summary{cursor:pointer}
 .uat-account-list{margin-top:8px;max-height:180px;overflow:auto;display:grid;gap:4px}
 .uat-account-list>div{display:flex;justify-content:space-between;gap:10px;padding:4px 8px;border-radius:7px;background:#f3f7ff}
 .uat-account-list b{color:#123a80}
 .uat-account-list span{color:var(--muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .uat-portal-picker{margin-bottom:12px;padding:0 14px}
 @media (max-width:640px){.uat-portal-picker{padding:0 12px}}
 .uat-portal-picker label{display:block;font-size:11px;color:#69758d;margin-bottom:5px}
 .uat-portal-picker select{width:100%;padding:9px 11px;border:1px solid #d8e2f2;border-radius:10px;background:#fff;font-size:13px}
 `;
 document.head.appendChild(style);
})();
