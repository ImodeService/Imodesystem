/* Beta — pick a photo, then choose the part of it you actually want.

   Asked for: "เวลากดปุ่มเพิ่มรูปเลือกรูปมาใส่เสร็จแล้วอยากให้เลือกครอบตัดรูปด้วยตัวเองได้".
   Until now a picked file went straight into a canvas that scaled the whole frame down —
   so a technician photographed at arm's length stayed a small head in a large room, and
   the only way to fix it was to crop in the phone's gallery first.

   THE ONE DESIGN DECISION THAT MATTERS

   This file never touches the variables the three pickers write to. pendingTechPhoto,
   pendingMachinePhoto and pendingLoginPhoto are top-level `let` in js/03 — lexical
   globals, absent from `window` — so a wrapper here cannot assign to them and must not
   try. Instead the cropped result is written back into the <input> as a real File through
   DataTransfer, and then the original handler is called with the same input. It reads
   input.files[0] exactly as it always did, does its own resize, and sets its own variable.
   Nothing downstream knows this file exists; delete it and the pickers behave as before.

   Where DataTransfer is missing the crop is skipped and the original runs untouched, so a
   browser that cannot do this loses the feature rather than the upload.

   Aspect ratios are per picker, not global: a person is a square avatar, a machine is not.
   The machine crop is free-form because the machine card renders with object-fit:contain
   and squaring a wide machine would add letterboxing to an image that had none.

   Cancel clears the input rather than leaving the file staged. Otherwise picking the same
   file again would fire no change event and the picker would appear dead. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}

 function canReplaceFiles(){
  try{
   var dt=new DataTransfer();
   dt.items.add(new File([new Blob([''],{type:'image/jpeg'})],'t.jpg',{type:'image/jpeg'}));
   return dt.files.length===1;
  }catch(e){return false}
 }

 /* ---------------------------------------------------------------- the dialog ---- */
 /* Its own overlay rather than openModal(): the tech and machine forms live in #modal,
    and js/29 gives that a history entry and a snapshot stack. Opening a second modal over
    a half-filled form would push the form onto that stack and hand it back as raw markup
    with the typing lost. This sits above #modal and owns nothing but itself. */
 function buildUI(){
  var root=document.createElement('div');
  root.className='icrop';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');
  root.innerHTML=''
   +'<div class="icrop-card">'
   +' <div class="icrop-head"><b class="icrop-title"></b>'
   +'  <small>'+tl('ลากกรอบเพื่อเลือกส่วนที่ต้องการ · ลากมุมเพื่อย่อขยาย',
                   'Drag the frame to choose the area · drag a corner to resize')+'</small></div>'
   +' <div class="icrop-stage"><img class="icrop-img" alt="">'
   +'  <div class="icrop-box">'
   +'   <i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i>'
   +'  </div>'
   +' </div>'
   +' <div class="icrop-foot">'
   +'  <button type="button" class="icrop-btn" data-act="reset">'+tl('เต็มรูป','Whole photo')+'</button>'
   +'  <span class="icrop-spacer"></span>'
   +'  <button type="button" class="icrop-btn" data-act="cancel">'+tl('ยกเลิก','Cancel')+'</button>'
   +'  <button type="button" class="icrop-btn is-primary" data-act="ok">'+tl('ใช้รูปนี้','Use this photo')+'</button>'
   +' </div>'
   +'</div>';
  return root;
 }

 /* Returns a Promise of {file, dataUrl} or null when cancelled. */
 window.imodeCropImage=function(file,opts){
  opts=opts||{};
  var aspect=(typeof opts.aspect==='number'&&opts.aspect>0)?opts.aspect:0;   /* 0 = free */
  var out=Number(opts.maxOut)||1400;
  return new Promise(function(resolve){
   var url;
   try{url=URL.createObjectURL(file)}catch(e){resolve(null);return}
   var root=buildUI();
   var img=root.querySelector('.icrop-img'),box=root.querySelector('.icrop-box'),
       stage=root.querySelector('.icrop-stage');
   root.querySelector('.icrop-title').textContent=opts.title||tl('ครอบตัดรูป','Crop the photo');
   document.body.appendChild(root);

   /* Crop rectangle in *displayed* pixels, relative to the rendered image. Kept in display
      space because that is what the pointer speaks; it is converted to natural pixels once,
      at the end, using the ratio the browser actually laid the image out at. */
   var cur={x:0,y:0,w:0,h:0},frame={x:0,y:0,w:0,h:0};

   function clampBox(){
    if(cur.w<40)cur.w=40;
    if(cur.h<40)cur.h=40;
    if(aspect)cur.h=cur.w/aspect;
    if(cur.w>frame.w){cur.w=frame.w;if(aspect)cur.h=cur.w/aspect}
    if(cur.h>frame.h){cur.h=frame.h;if(aspect)cur.w=cur.h*aspect}
    if(cur.x<0)cur.x=0;
    if(cur.y<0)cur.y=0;
    if(cur.x+cur.w>frame.w)cur.x=frame.w-cur.w;
    if(cur.y+cur.h>frame.h)cur.y=frame.h-cur.h;
   }
   function paint(){
    box.style.left=(frame.x+cur.x)+'px';
    box.style.top=(frame.y+cur.y)+'px';
    box.style.width=cur.w+'px';
    box.style.height=cur.h+'px';
   }
   function measure(){
    var s=stage.getBoundingClientRect(),i=img.getBoundingClientRect();
    frame={x:i.left-s.left,y:i.top-s.top,w:i.width,h:i.height};
   }
   function reset(){
    measure();
    /* The largest rectangle of the wanted shape that fits, centred. "Whole photo" is
       therefore the honest default: nothing is cut unless the shape forces it. */
    var w=frame.w,h=frame.h;
    if(aspect){ if(w/h>aspect)w=h*aspect; else h=w/aspect; }
    cur={x:(frame.w-w)/2,y:(frame.h-h)/2,w:w,h:h};
    clampBox();paint();
   }

   var drag=null;
   function point(e){return {x:e.clientX,y:e.clientY}}
   function down(e,handle){
    e.preventDefault();
    drag={handle:handle,start:point(e),box:{x:cur.x,y:cur.y,w:cur.w,h:cur.h}};
    try{(e.target.setPointerCapture)&&e.target.setPointerCapture(e.pointerId)}catch(x){}
   }
   function move(e){
    if(!drag)return;
    var p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y,b=drag.box;
    if(!drag.handle){cur.x=b.x+dx;cur.y=b.y+dy}
    else{
     var right=b.x+b.w,bottom=b.y+b.h;
     if(drag.handle==='se'){cur.w=b.w+dx;if(aspect)cur.h=cur.w/aspect;else cur.h=b.h+dy;cur.x=b.x;cur.y=b.y}
     if(drag.handle==='sw'){cur.w=b.w-dx;if(aspect)cur.h=cur.w/aspect;else cur.h=b.h+dy;cur.x=right-cur.w;cur.y=b.y}
     if(drag.handle==='ne'){cur.w=b.w+dx;if(aspect)cur.h=cur.w/aspect;else cur.h=b.h-dy;cur.x=b.x;cur.y=bottom-cur.h}
     if(drag.handle==='nw'){cur.w=b.w-dx;if(aspect)cur.h=cur.w/aspect;else cur.h=b.h-dy;cur.x=right-cur.w;cur.y=bottom-cur.h}
    }
    clampBox();paint();
   }
   function up(){drag=null}

   box.addEventListener('pointerdown',function(e){if(!e.target.dataset.h)down(e,null)});
   [].slice.call(box.querySelectorAll('i')).forEach(function(h){
    h.addEventListener('pointerdown',function(e){e.stopPropagation();down(e,h.dataset.h)});
   });
   window.addEventListener('pointermove',move);
   window.addEventListener('pointerup',up);
   window.addEventListener('pointercancel',up);
   window.addEventListener('resize',reset);

   function finish(val){
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',up);
    window.removeEventListener('pointercancel',up);
    window.removeEventListener('resize',reset);
    document.removeEventListener('keydown',key,true);
    try{URL.revokeObjectURL(url)}catch(e){}
    root.remove();
    resolve(val);
   }
   function key(e){
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();finish(null)}
   }
   /* Capture phase: js/29 closes the popup underneath on Escape, and this dialog is the
      thing on top, so it has to take the key first. */
   document.addEventListener('keydown',key,true);

   function crop(){
    /* naturalWidth / displayed width is the only scale that is true here — the image is
       laid out with max-width/max-height, so neither dimension can be assumed. */
    var sx=img.naturalWidth/frame.w, sy=img.naturalHeight/frame.h;
    var w=Math.max(1,Math.round(cur.w*sx)), h=Math.max(1,Math.round(cur.h*sy));
    var scale=Math.min(1,out/Math.max(w,h));
    var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
    var cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
    var ctx=cv.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);   /* PNG transparency would go black in JPEG */
    ctx.drawImage(img,Math.round(cur.x*sx),Math.round(cur.y*sy),w,h,0,0,cw,ch);
    var dataUrl=cv.toDataURL('image/jpeg',.92);
    cv.toBlob(function(blob){
     var name=String(file.name||'photo').replace(/\.[^.]+$/,'')+'-crop.jpg';
     var f;
     try{f=new File([blob],name,{type:'image/jpeg'})}
     catch(e){f=blob;try{f.name=name}catch(x){}}
     finish({file:f,dataUrl:dataUrl});
    },'image/jpeg',.92);
   }

   root.addEventListener('click',function(e){
    var a=e.target&&e.target.dataset?e.target.dataset.act:'';
    if(a==='cancel')finish(null);
    else if(a==='reset')reset();
    else if(a==='ok')crop();
    else if(e.target===root)finish(null);
   });

   img.onload=function(){reset()};
   img.onerror=function(){toast(tl('เปิดรูปนี้ไม่ได้','That image could not be opened'));finish(null)};
   img.src=url;
  });
 };

 /* ------------------------------------------------------------ the three pickers -- */
 function wrapPicker(name,opts){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(input){
   var self=this,args=arguments;
   var file=input&&input.files&&input.files[0];
   if(!file||String(file.type||'').indexOf('image/')!==0)return base.apply(self,args);
   if(!canReplaceFiles())return base.apply(self,args);
   window.imodeCropImage(file,opts).then(function(res){
    if(!res){try{input.value=''}catch(e){}return}
    try{
     var dt=new DataTransfer();
     dt.items.add(res.file);
     input.files=dt.files;
    }catch(e){/* keep the original file rather than losing the upload */}
    base.apply(self,args);
   });
  };
 }
 wrapPicker('previewTechPhoto',{aspect:1,title:tl('ครอบตัดรูปช่าง','Crop the technician photo')});
 wrapPicker('previewLoginPhoto',{aspect:1,title:tl('ครอบตัดรูปผู้ใช้งาน','Crop the user photo')});
 wrapPicker('previewMachinePhoto',{aspect:0,title:tl('ครอบตัดรูปเครื่องจักร','Crop the machine photo')});

 var st=document.createElement('style');
 st.id='v70ImageCropStyle';
 st.textContent=''
 /* Above #modal, which css/07 line 16 raises to 10000. Getting this wrong is invisible
    in a screenshot and only shows up under a real finger: the dialog paints on top but
    every pointer event lands on the form underneath, so the frame will not drag. */
 +'.icrop{position:fixed;inset:0;z-index:10050;background:rgba(8,20,44,.72);display:flex;'
 +'align-items:center;justify-content:center;padding:16px}'
 +'.icrop-card{width:min(560px,100%);max-height:92vh;display:flex;flex-direction:column;'
 +'background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 26px 60px rgba(6,20,50,.4)}'
 +'.icrop-head{padding:14px 16px 10px;border-bottom:1px solid #e6edf8}'
 +'.icrop-head b{display:block;font-size:15px;color:#12233f}'
 +'.icrop-head small{display:block;margin-top:3px;font-size:11.5px;color:#6f81a3;line-height:1.5}'
 +'.icrop-stage{position:relative;flex:1;min-height:180px;display:flex;align-items:center;'
 +'justify-content:center;background:#101a2e;overflow:hidden;padding:10px;touch-action:none}'
 +'.icrop-img{max-width:100%;max-height:56vh;display:block;user-select:none;-webkit-user-drag:none}'
 +'.icrop-box{position:absolute;border:2px solid #fff;border-radius:3px;cursor:move;'
 +'box-shadow:0 0 0 9999px rgba(8,18,38,.55);touch-action:none}'
 +'.icrop-box i{position:absolute;width:20px;height:20px;background:#fff;border-radius:50%;'
 +'box-shadow:0 2px 6px rgba(0,0,0,.35);touch-action:none}'
 +'.icrop-box i[data-h=nw]{left:-11px;top:-11px;cursor:nwse-resize}'
 +'.icrop-box i[data-h=ne]{right:-11px;top:-11px;cursor:nesw-resize}'
 +'.icrop-box i[data-h=sw]{left:-11px;bottom:-11px;cursor:nesw-resize}'
 +'.icrop-box i[data-h=se]{right:-11px;bottom:-11px;cursor:nwse-resize}'
 +'.icrop-foot{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #e6edf8;'
 +'background:#f7fafe}'
 +'.icrop-spacer{flex:1}'
 +'.icrop-btn{border:1px solid #cfe0fa;background:#fff;color:#12233f;border-radius:11px;'
 +'padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}'
 +'.icrop-btn:hover{background:#eef4ff}'
 +'.icrop-btn.is-primary{border-color:transparent;color:#fff;'
 +'background:linear-gradient(180deg,#ff9a4d,#f2711c);box-shadow:0 5px 0 #c9560f}'
 +'.icrop-btn.is-primary:active{box-shadow:0 1px 0 #c9560f;transform:translateY(4px)}'
 +'.icrop-btn:focus-visible{outline:2px solid #0b63e5;outline-offset:2px}'
 +'@media (max-width:640px){'
 +'.icrop{padding:0}.icrop-card{width:100%;height:100%;max-height:100%;border-radius:0}'
 +'.icrop-img{max-height:100%}.icrop-btn{padding:11px 12px;font-size:12.5px}'
 +'.icrop-box i{width:24px;height:24px}}';
 document.head.appendChild(st);
})();
