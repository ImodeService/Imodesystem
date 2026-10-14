/* Beta — dropdowns you can type into, and a machine form that can take a new customer.

   Two requests, one mechanism:

     1. Settings -> ผู้ใช้งานและสิทธิ์ -> เลือกผู้ใช้งาน. Fifteen accounts in a plain
        <select>; finding one meant scrolling a native list.
     2. เพิ่มเครื่องจักร -> ลูกค้า *. A <select> built from the existing customers, so
        "กรณีที่ขายเครื่องให้ลูกค้าหน้าใหม่มันจะเพิ่มไม่ได้" — a machine for a customer who
        is not in the system yet could not be saved at all without leaving the form,
        creating the customer, and starting again.

   window.imodeCombo(select, opts) upgrades any <select> in place:

     - a text box that filters the list as you type, with a real listbox under it
     - keyboard: Down/Up to move, Enter to choose, Escape to cancel back to the current value
     - opts.allowCreate — an explicit "➕ เพิ่ม …" row appears when what you typed matches
       nothing, and choosing it calls opts.onCreate(text)

   THE ORIGINAL <select> IS KEPT, hidden, and stays the single source of truth. Every save
   path in this project reads these controls by id as bare globals — saveMachine() does
   `customerId: maCustomer.value` and saveRoles() collects the cards the picker switches
   between — so replacing the element would have meant editing those functions. Setting
   select.value and dispatching a real `change` event instead means nothing downstream
   knows this file exists. Remove it and both screens fall back to plain dropdowns.

   Two details that are not obvious and will break things if changed:

     * `required` is moved from the <select> to the visible input. A display:none control
       that is `required` and empty makes Chrome refuse the submit with "An invalid form
       control is not focusable" — and it refuses silently, so the Save button would simply
       have stopped working with nothing in the console.
     * The wrapper carries data-no-i18n. applyLanguageTo() walks every text node in the
       modal on a timeout after openModal(), and customer and account names are data, not
       UI labels — the same trap that translated a role name onto its tab in part 13. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc2(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v)}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 var seq=0;

 function norm(s){return String(s==null?'':s).toLowerCase().replace(/\s+/g,' ').trim()}

 window.imodeCombo=function(select,opts){
  if(!select||select.dataset.comboOn==='1')return null;
  opts=opts||{};
  select.dataset.comboOn='1';

  var id='cbx'+(++seq);
  var wrap=document.createElement('div');
  wrap.className='cbx';
  wrap.setAttribute('data-no-i18n','true');
  var input=document.createElement('input');
  input.type='text';
  input.className='cbx-input';
  input.id=id+'-input';
  input.autocomplete='off';
  input.setAttribute('role','combobox');
  input.setAttribute('aria-expanded','false');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls',id+'-list');
  if(opts.placeholder)input.placeholder=opts.placeholder;
  /* see the header — a hidden required <select> blocks submit with no visible error */
  if(select.required){select.required=false;input.required=true}
  var lbl=select.parentNode&&select.parentNode.querySelector('label');
  if(lbl&&!lbl.htmlFor)lbl.htmlFor=input.id;

  var caret=document.createElement('button');
  caret.type='button';
  caret.className='cbx-caret';
  caret.tabIndex=-1;
  caret.setAttribute('aria-label',tl('เปิดรายการ','Open the list'));
  caret.textContent='▾';

  var list=document.createElement('ul');
  list.className='cbx-list';
  list.id=id+'-list';
  list.setAttribute('role','listbox');
  list.hidden=true;

  select.parentNode.insertBefore(wrap,select);
  wrap.appendChild(input);
  wrap.appendChild(caret);
  wrap.appendChild(list);
  wrap.appendChild(select);
  select.classList.add('cbx-native');

  var open=false,active=-1,rows=[];

  function options(){
   return [].slice.call(select.options).filter(function(o){return o.value!==''||o.dataset.keep==='1'});
  }
  function currentLabel(){
   var o=select.options[select.selectedIndex];
   return (o&&o.value!=='')?o.textContent:'';
  }
  function syncInput(){input.value=currentLabel()}

 /* THE VISIBLE BOX HAS TO FOLLOW A PROGRAMMATIC `.value`.
    Reported: opening ทำใบเสนอราคา from a case filled in the customer but left อ้างอิง
    Service Case looking empty. Measured: the <select> really held the case id — it was the
    text box that was blank, and the same was true of ลูกค้า. Nothing here was ever told,
    because assigning `.value` fires no event: prepareQuotation() does `qCase.value=cid`,
    loadCaseIntoQuote() does `qCustomer.value=...`, resetQuote() clears a dozen fields and
    renderQuotations() re-selects both after rebuilding their options. Refreshing the combo
    at each of those call sites would mean editing js/03 in a dozen places and would miss
    the next one.
    So the seam is the property itself: `value` is shadowed on this one element, delegating
    to the prototype's own accessor and resyncing the input afterwards. Reads are unchanged,
    every present and future caller is covered, and nothing outside this element is touched.
    selectedIndex is not shadowed — nothing in this application assigns it. */
  try{
   var vd=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
   if(vd&&vd.get&&vd.set){
    Object.defineProperty(select,'value',{
     configurable:true,
     get:function(){return vd.get.call(this)},
     set:function(v){vd.set.call(this,v);try{syncInput()}catch(e){}}
    });
   }
  }catch(e){}

  /* 2026-09-15: OPENING SHOWS EVERYTHING; ONLY TYPING FILTERS.
     The box holds the current choice's full label, and build() filtered by it — so the list
     opened with exactly one row, the item already chosen, and nothing else could be picked.
     Reported on สิทธิ์รายบุคคล ("กดเลือกคนไม่ได้"), where a person is always selected; the same
     was true of every combo here whenever it already held a value. `typed` is set by the
     input event and cleared on open, and the text is selected on focus, so the first key
     replaces the label instead of being appended to it. */
  var typed=false;
  function build(){
   var q=typed?norm(input.value):'',all=options();
   /* data-search lets an option be found by text that is not on its face — the account
      picker labels a row "สมชาย ใจดี" but the admin is far more likely to type the
      username they sign in with. */
   var hits=q?all.filter(function(o){
    return norm(o.textContent+' '+(o.dataset.search||'')).indexOf(q)>=0;
   }):all;
   rows=[];
   list.innerHTML='';
   hits.forEach(function(o){
    var li=document.createElement('li');
    li.className='cbx-opt';
    li.setAttribute('role','option');
    li.textContent=o.textContent;
    if(o.value===select.value)li.classList.add('is-current');
    li.addEventListener('mousedown',function(e){e.preventDefault();pick(o.value)});
    list.appendChild(li);
    rows.push({el:li,value:o.value,create:false});
   });
   /* An explicit row, never an implicit create-on-blur: typing a name must not be enough
      to write a customer record, the same rule the quotation page follows. */
   var raw=String(input.value||'').trim();
   var exact=all.some(function(o){return norm(o.textContent)===norm(raw)});
   if(opts.allowCreate&&raw&&!exact){
    var add=document.createElement('li');
    add.className='cbx-opt cbx-add';
    add.setAttribute('role','option');
    add.textContent='➕ '+(opts.createLabel?opts.createLabel(raw):tl('เพิ่ม ','Add ')+raw);
    add.addEventListener('mousedown',function(e){e.preventDefault();create(raw)});
    list.appendChild(add);
    rows.push({el:add,value:null,create:true});
   }
   if(!rows.length){
    var em=document.createElement('li');
    em.className='cbx-empty';
    em.textContent=tl('ไม่พบรายการที่ตรงกัน','Nothing matches');
    list.appendChild(em);
   }
   active=rows.length?0:-1;
   paint();
  }
  function paint(){
   rows.forEach(function(r,i){r.el.classList.toggle('is-active',i===active)});
   if(active>=0&&rows[active]){
    var el=rows[active].el;
    if(el.offsetTop<list.scrollTop)list.scrollTop=el.offsetTop;
    else if(el.offsetTop+el.offsetHeight>list.scrollTop+list.clientHeight)
     list.scrollTop=el.offsetTop+el.offsetHeight-list.clientHeight;
   }
  }
  function show(){
   if(open)return;
   open=true;list.hidden=false;
   input.setAttribute('aria-expanded','true');
   wrap.classList.add('is-open');
   typed=false;
   build();
   /* The whole list is showing, so start on the item already chosen rather than the top —
      paint() scrolls it into view. */
   for(var i=0;i<rows.length;i++){
    if(rows[i].value===select.value){active=i;paint();break}
   }
  }
  function close(restore){
   if(!open)return;
   open=false;list.hidden=true;
   input.setAttribute('aria-expanded','false');
   wrap.classList.remove('is-open');
   if(restore!==false)syncInput();
  }
  function pick(value){
   select.value=value;
   /* a real event, so anything already listening — refreshMachines() and friends — runs */
   try{select.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){
    if(typeof select.onchange==='function')select.onchange();
   }
   close();
  }
  function create(text){
   if(typeof opts.onCreate!=='function'){close();return}
   Promise.resolve(opts.onCreate(text)).then(function(res){
    if(!res||!res.value){close();return}
    /* Add the option ourselves rather than re-rendering the form: the rest of the machine
       form is half filled in by this point and rebuilding it would throw that away. */
    if(!select.querySelector('option[value="'+String(res.value).replace(/"/g,'\\"')+'"]')){
     var o=document.createElement('option');
     o.value=res.value;o.textContent=res.label||text;
     select.appendChild(o);
    }
    pick(res.value);
   }).catch(function(){close()});
  }

  /* Focus selects the label so the first key replaces it. A click that focused the box would
     otherwise clear that selection on mouseup, placing a caret at the end — the next key
     would then be appended to the name and match nothing — so that one mouseup is cancelled. */
  var justFocused=false;
  input.addEventListener('focus',function(){
   show();
   justFocused=true;
   try{input.select()}catch(e){}
  });
  input.addEventListener('mouseup',function(e){if(justFocused){e.preventDefault();justFocused=false}});
  input.addEventListener('click',show);
  caret.addEventListener('click',function(){
   if(open){close()}else{input.focus();show()}
  });
  input.addEventListener('input',function(){if(!open)show();typed=true;build()});
  input.addEventListener('keydown',function(e){
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(!open){show();return}
    if(!rows.length)return;
    active=(active+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
    paint();
   }else if(e.key==='Enter'){
    if(!open)return;
    e.preventDefault();
    var r=rows[active];
    if(!r)return;
    if(r.create)create(String(input.value||'').trim());else pick(r.value);
   }else if(e.key==='Escape'){
    if(open){e.preventDefault();close()}
   }
  });
  input.addEventListener('blur',function(){setTimeout(function(){close()},0)});

  syncInput();
  return {input:input,select:select,refresh:syncInput};
 };

 /* ------------------------------------------------- 1. the account picker ------- */
 /* js/20 builds .permx-userpick when the roles modal opens, which is after this file has
    parsed, so it can call window.imodeCombo directly. Search only — accounts are created
    in the account screen, not here. */

 /* ------------------------------------------------- 2. the machine form --------- */
 function createCustomer(name){
  var nm=String(name||'').trim();
  if(!nm)return null;
  try{
   var dup=customers.filter(function(c){return norm(c.name)===norm(nm)})[0];
   if(dup)return {value:dup.id,label:dup.name};
   /* Same shape and the same uid() as saveCustomer(). A CUST-#### running number was
      considered and rejected: two devices offline would both mint the same number and the
      cloud upsert would merge two different companies into one row. */
   var obj={id:uid(),name:nm,branch:'',contact:'',phone:'',email:'',location:'',address:'',
    mapUrl:'',latitude:'',longitude:'',note:tl('เพิ่มจากฟอร์มเครื่องจักร','Added from the machine form'),
    lineUserId:'',lineDisplayName:'',lineLinkedAt:''};
   customers.push(obj);
   saveLocal();
   if(typeof window.cloudUpsertCustomer==='function')window.cloudUpsertCustomer(obj);
   toast(tl('เพิ่มลูกค้า "'+nm+'" แล้ว — กรอกที่อยู่/ผู้ติดต่อได้ที่หน้าลูกค้า',
            'Customer "'+nm+'" added — fill in the address and contact on the Customers page'));
   return {value:obj.id,label:obj.name};
  }catch(e){return null}
 }
 window.imodeCreateCustomerByName=createCustomer;

 var baseMachineModal=window.openMachineModal;
 if(typeof baseMachineModal==='function'){
  window.openMachineModal=function(){
   var r=baseMachineModal.apply(this,arguments);
   /* openModal() writes the body synchronously, so the select is already there. */
   try{
    var sel=document.getElementById('maCustomer');
    if(sel)window.imodeCombo(sel,{
     placeholder:tl('พิมพ์ชื่อลูกค้า หรือเลือกจากรายการ','Type a customer name, or pick one'),
     allowCreate:true,
     createLabel:function(t){return tl('เพิ่มลูกค้าใหม่: ','Add a new customer: ')+t},
     onCreate:createCustomer
    });
   }catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------- 3. the onsite machine picker -
    หน้างาน lists every machine in one native <select> — 41 of them, each row being
    name · model · serial — so finding one meant scrolling. Same upgrade, one difference
    that matters: renderOnsitePricing() in js/06 rebuilds sel.innerHTML on every
    renderAll(), and it keeps the element. So imodeCombo() is applied once (its own
    dataset.comboOn guard sees to that) and only the visible text is resynced afterwards;
    the list itself is built at open time from the live options, so a machine added while
    the page is open is already there.

    "— เลือกเครื่อง / ไม่ระบุ — " carries data-keep because options() drops the empty
    option by default. Here it is a real choice — the calculator works with no machine at
    all — so it has to stay pickable. */
 var onsiteCombo=null;
 var baseRenderOnsite=window.renderOnsitePricing;
 if(typeof baseRenderOnsite==='function'){
  window.renderOnsitePricing=function(){
   var r=baseRenderOnsite.apply(this,arguments);
   try{
    var sel=document.getElementById('onsiteMachineSelect');
    if(sel){
     if(sel.options[0]&&sel.options[0].value==='')sel.options[0].dataset.keep='1';
     if(sel.dataset.comboOn==='1'){if(onsiteCombo)onsiteCombo.refresh()}
     else onsiteCombo=window.imodeCombo(sel,{
      placeholder:tl('พิมพ์ชื่อเครื่อง รุ่น หรือซีเรียล','Type a machine name, model or serial')
     });
    }
   }catch(e){}
   return r;
  };
 }

 /* ------------------------------------------------- 4. the quotation page -------
    Two pickers on ทำใบเสนอราคา, both of them long lists of Thai company names:
    #qCase (every service case, ticket · customer · machine) and #qCustomer.

    Same shape as the onsite one — renderQuotations() in js/03 rebuilds both innerHTMLs on
    every render and keeps the elements — so the same apply-once / refresh-after pattern.
    Both keep their empty first row: "ไม่อ้างอิงเคส" is a real answer (a quotation need not
    come from a case), and "เลือกลูกค้า" is how the required field reads before a choice.

    No allowCreate on #qCustomer. The machine form has it because a machine cannot be saved
    without a customer, but a quotation for a company that is not in the system yet is a
    company that still has no address to print on the document. */
 var quoteCombos={};
 var baseRenderQuotations=window.renderQuotations;
 if(typeof baseRenderQuotations==='function'){
  window.renderQuotations=function(){
   var r=baseRenderQuotations.apply(this,arguments);
   try{
    [['qCase',tl('พิมพ์เลขที่เคส ชื่อลูกค้า หรือชื่อเครื่อง','Type a ticket, customer or machine')],
     ['qCustomer',tl('พิมพ์ชื่อลูกค้า','Type a customer name')]].forEach(function(pair){
     var sel=document.getElementById(pair[0]);
     if(!sel)return;
     if(sel.options[0]&&sel.options[0].value==='')sel.options[0].dataset.keep='1';
     if(sel.dataset.comboOn==='1'){if(quoteCombos[pair[0]])quoteCombos[pair[0]].refresh()}
     else quoteCombos[pair[0]]=window.imodeCombo(sel,{placeholder:pair[1]});
    });
   }catch(e){}
   return r;
  };
 }

 var st=document.createElement('style');
 st.id='v70ComboBoxStyle';
 st.textContent=''
 +'.cbx{position:relative;display:block}'
 +'select.cbx-native{display:none!important}'
 +'.cbx-input{width:100%;padding:10px 34px 10px 12px;border:1px solid #d3e0f4;border-radius:12px;'
 +'font-size:13.5px;background:#fff;color:#12233f;font-family:inherit}'
 +'.cbx-input:focus{outline:none;border-color:#0b63e5;box-shadow:0 0 0 3px rgba(11,99,229,.14)}'
 +'.cbx-caret{position:absolute;top:0;right:0;height:100%;width:32px;border:0;background:none;'
 +'color:#6f81a3;font-size:12px;cursor:pointer;line-height:1}'
 +'.cbx.is-open .cbx-caret{color:#0b63e5}'
 +'.cbx-list{position:absolute;z-index:60;left:0;right:0;top:calc(100% + 4px);margin:0;padding:4px;'
 +'list-style:none;max-height:246px;overflow:auto;background:#fff;border:1px solid #cfe0fa;'
 +'border-radius:12px;box-shadow:0 14px 30px rgba(16,54,128,.17)}'
 +'.cbx-list[hidden]{display:none!important}'
 +'.cbx-opt{padding:9px 11px;border-radius:9px;font-size:13px;color:#12233f;cursor:pointer;line-height:1.4}'
 +'.cbx-opt.is-active{background:#eaf3ff;color:#0b3f9e}'
 +'.cbx-opt.is-current{font-weight:700}'
 +'.cbx-opt.is-current::after{content:" ✓";color:#079455}'
 +'.cbx-add{color:#07603a;font-weight:700}'
 +'.cbx-add.is-active{background:#e9f9f1}'
 +'.cbx-empty{padding:10px 11px;font-size:12px;color:#7385a5}'
 +'@media (max-width:640px){.cbx-list{max-height:210px}}';
 document.head.appendChild(st);
})();
