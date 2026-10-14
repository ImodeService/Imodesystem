/* Beta — the customer sees a popup with a real percentage while a file is being prepared.

   Reported: "เวลาลูกค้าเพิ่มไฟล์อยากให้มีPop up โหลดเด้งขึ้นมาว่ากี่เปอร์เซ้นละ เพราะว่าแบบนี้
   ลูกค้าจะไม่รู้ว่าเพิ่มไฟล์แล้วแต่ทำไฟล์ไม่ขึ้น".

   What the customer had before this file: they tap 📷 / 🎥 เพิ่มไฟล์, pick a photo, and the
   form does not change for several seconds — js/30 shrinks the file first (a phone photo is
   4-8 MB, and a clip is re-encoded at playback speed), and only then does js/03 read it and
   draw the preview card. The only sign of life was one toast, which on a phone is a thin line
   at the edge of the screen that has usually gone by the time anyone looks. So the customer
   taps again, or decides it did not work — and when the file really is refused (over 3 MB
   after shrinking, or a fifth file when four is the limit) the notice is another toast that
   reads exactly like the first.

   WHAT THIS FILE DOES
     * a blocking popup opens the moment a file is chosen: one row per file with its own
       percentage, a big overall number, and a bar,
     * the percentage is real, not a timer — js/30 reports FileReader's own progress while the
       file is read, the encode pass for an image, and currentTime/duration for a video,
     * the last stretch (js/03 re-reading the shrunk file and drawing the preview) cannot be
       measured from out here, so the bar holds at 96% under กำลังบันทึกไฟล์… with a moving
       shimmer rather than claiming a number it does not have,
     * it ends by saying what actually happened — ✓ เพิ่มไฟล์แล้ว n ไฟล์ and closes itself, or
       stays open in red with a ปิด button when NOTHING was added, which is the half of the
       report that matters most.

   How the ending is decided: window.portalIssuePendingMedia is counted before and after. That
   array is what the preview and the submit both read, so its length is the truth about whether
   a file was added. Nothing here assumes why one was refused, so a future rule inside the base
   function is reported correctly for free.

   Blocking is deliberate. The backdrop swallows a second tap on เพิ่มไฟล์ while the first file
   is still being prepared, which is exactly what a customer does when nothing seems to happen.

   2026-09-21: อัปเดตสถานะงาน GETS THE SAME POPUP. The header used to say that the technician
   paths keep js/30's toast because they are not used by someone waiting on a phone — which was
   wrong about this one: a photo taken at the machine is exactly as slow to prepare as one taken
   by a customer, and บันทึกสถานะพร้อมรูป is used standing in front of it on a phone. The other two
   (addReportVideos on the ใบตรวจ, and the report photos) keep the toast.

   One popup, two doors: the wrapper below is a function of the counter and the wording, so
   there is no second copy of the progress UI to drift out of step with this one.

   js/03 and js/30's own wrapper are not edited. This file loads last, so it is the outermost
   wrapper and the promise it receives covers the whole operation, shrink and preview together. */
(function(){
 'use strict';

 var MAXWAIT=120000;            /* a ceiling on the popup, however the work goes wrong */
 var HOLD=1100;                 /* how long ✓ stays on screen before it closes itself */
 var SHRINK_CEIL=94;            /* js/30's share of the bar; the rest belongs to js/03 */

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
 })}
 function kb(n){
  n=Number(n)||0;
  if(n>=1024*1024)return (n/1024/1024).toFixed(1)+' MB';
  return Math.max(1,Math.round(n/1024))+' KB';
 }
 function pending(){
  try{return (window.portalIssuePendingMedia||[]).length}catch(e){return 0}
 }

 /* ------------------------------------------------------------------ styles ---- */
 var STYLE_ID='imode-upload-progress-style';
 function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  var st=document.createElement('style');
  st.id=STYLE_ID;
  st.textContent=''
   /* Above js/42's lightbox (12000) and the crop overlay (10050), below the boot splash. */
   +'.uprog{position:fixed;inset:0;z-index:12600;display:flex;align-items:center;justify-content:center;'
   +'padding:18px;background:rgba(8,17,35,.62)}'
   +'.uprog-card{width:min(420px,100%);background:#fff;border-radius:18px;padding:20px 18px 18px;'
   +'box-shadow:0 26px 60px rgba(8,17,35,.34);border:1px solid rgba(11,99,229,.16);color:#0c225e;'
   +'animation:uprogIn 220ms cubic-bezier(.3,.9,.35,1)}'
   +'@keyframes uprogIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}'
   +'.uprog-head{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px}'
   +'.uprog-spin{width:18px;height:18px;border-radius:50%;flex:0 0 auto;'
   +'border:3px solid rgba(11,99,229,.22);border-top-color:#0B63E5;animation:uprogSpin 800ms linear infinite}'
   +'@keyframes uprogSpin{to{transform:rotate(360deg)}}'
   +'.uprog-pct{font-size:40px;font-weight:900;line-height:1.05;margin:12px 0 2px;letter-spacing:-.5px}'
   +'.uprog-phase{font-size:12.5px;color:#6b7d9e;min-height:17px}'
   +'.uprog-bar{height:10px;border-radius:99px;background:#e8eef9;overflow:hidden;margin:12px 0 4px}'
   +'.uprog-bar>i{display:block;height:100%;width:0;border-radius:99px;'
   +'background:linear-gradient(90deg,#0B63E5,#3b8bff);transition:width 220ms ease}'
   +'.uprog.is-saving .uprog-bar>i{background:linear-gradient(90deg,#0B63E5,#7cb2ff,#0B63E5);'
   +'background-size:220% 100%;animation:uprogShim 1.1s linear infinite}'
   +'@keyframes uprogShim{to{background-position:-220% 0}}'
   +'.uprog-files{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px;max-height:34vh;overflow:auto}'
   +'.uprog-files li{display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:8px;font-size:12.5px}'
   +'.uprog-files .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#33456b}'
   +'.uprog-files .nm small{display:block;color:#93a2bd;font-size:11px}'
   +'.uprog-files .v{font-variant-numeric:tabular-nums;font-weight:700;color:#0B63E5}'
   +'.uprog-files li.done .v{color:#079455}'
   +'.uprog-note{margin-top:12px;font-size:12.5px;line-height:1.5;padding:10px 12px;border-radius:12px;'
   +'background:#f2f6fd;color:#33456b}'
   +'.uprog-note.bad{background:#fdecee;color:#9b1c28}'
   +'.uprog-note.good{background:#e9f8f0;color:#05683e}'
   +'.uprog-close{margin-top:12px;width:100%;padding:12px;border-radius:12px;border:0;cursor:pointer;'
   +'font-weight:800;font-size:14px;background:#0B63E5;color:#fff}'
   +'.uprog-hint{margin-top:10px;font-size:11.5px;color:#93a2bd;text-align:center}'
   +'@media (max-width:420px){.uprog-pct{font-size:34px}.uprog-card{padding:16px 14px 14px}}'
   +'@media (prefers-reduced-motion:reduce){.uprog-card{animation:none}.uprog-spin{animation-duration:2.4s}'
   +'.uprog.is-saving .uprog-bar>i{animation:none}.uprog-bar>i{transition:none}}';
  document.head.appendChild(st);
 }

 /* -------------------------------------------------------------- the popup ---- */
 var box=null,shown=0,timer=0,closer=0;

 function open(files,title){
  ensureStyle();
  close(true);
  box=document.createElement('div');
  box.className='uprog';
  box.setAttribute('role','dialog');
  box.setAttribute('aria-modal','true');
  box.setAttribute('aria-label',title||tl('กำลังเตรียมไฟล์','Preparing files'));
  box.innerHTML=''
   +'<div class="uprog-card">'
   + '<div class="uprog-head"><span class="uprog-spin"></span><span data-head>'
   +  esc(title||tl('กำลังเตรียมไฟล์…','Preparing your files…'))+'</span></div>'
   + '<div class="uprog-pct" aria-live="polite">0%</div>'
   + '<div class="uprog-phase">'+esc(tl('กำลังอ่านและย่อขนาดไฟล์','Reading and shrinking'))+'</div>'
   + '<div class="uprog-bar"><i></i></div>'
   + '<ul class="uprog-files">'+files.map(function(f){
      return '<li><span>'+(String(f.type||'').indexOf('video/')===0?'🎬':'🖼')+'</span>'
       +'<span class="nm">'+esc(f.name||tl('ไฟล์','file'))+'<small>'+esc(kb(f.size))+'</small></span>'
       +'<span class="v">0%</span></li>';
     }).join('')+'</ul>'
   + '<div class="uprog-hint">'+esc(tl('อย่าปิดหน้านี้ระหว่างเตรียมไฟล์','Please keep this page open'))+'</div>'
   +'</div>';
  document.body.appendChild(box);
  shown=0;
  /* Nothing out here can cancel the work underneath, so this guard is a ceiling on the
     popup, not on the upload: whatever happens inside js/30, the customer gets an answer. */
  timer=setTimeout(function(){
   finish({bad:true,msg:tl('ใช้เวลานานผิดปกติ ลองเพิ่มไฟล์อีกครั้ง หรือเลือกไฟล์ที่เล็กลง',
                           'This is taking too long. Try again with a smaller file.')});
  },MAXWAIT);
 }

 function setPct(n){
  if(!box)return;
  n=Math.max(shown,Math.max(0,Math.min(100,Math.round(n))));
  shown=n;
  var t=box.querySelector('.uprog-pct'),b=box.querySelector('.uprog-bar>i');
  if(t)t.textContent=n+'%';
  if(b)b.style.width=n+'%';
 }
 function phase(txt,saving){
  if(!box)return;
  var p=box.querySelector('.uprog-phase');
  if(p)p.textContent=txt;
  box.classList.toggle('is-saving',!!saving);
 }

 /* The hook js/30 calls. It is installed only while the popup is up, which is also what
    tells js/30 to stand its own toast down. */
 function onProgress(info){
  if(!box||!info)return;
  var rows=box.querySelectorAll('.uprog-files li'),list=info.files||[];
  for(var i=0;i<rows.length&&i<list.length;i++){
   var v=Math.max(0,Math.min(100,Math.round(Number(list[i].percent)||0)));
   var cell=rows[i].querySelector('.v');
   if(cell)cell.textContent=v>=100?'✓':v+'%';
   if(v>=100)rows[i].classList.add('done');
  }
  var all=list.length&&list.every(function(f){return (Number(f.percent)||0)>=100});
  if(all){
   setPct(96);
   phase(tl('กำลังบันทึกไฟล์…','Saving the file…'),true);
  }else{
   setPct(Math.min(SHRINK_CEIL,Number(info.percent)||0));
  }
 }

 function finish(res){
  if(!box)return;
  if(timer){clearTimeout(timer);timer=0}
  var card=box.querySelector('.uprog-card'),spin=box.querySelector('.uprog-spin');
  box.classList.remove('is-saving');
  if(spin&&spin.parentNode)spin.parentNode.removeChild(spin);
  var head=box.querySelector('.uprog-head span[data-head]');
  if(res.bad){
   if(head)head.textContent=res.title||tl('เพิ่มไฟล์ไม่สำเร็จ','The file was not added');
  }else{
   setPct(100);
   if(head)head.textContent=res.title||tl('เพิ่มไฟล์เรียบร้อย','Files added');
  }
  phase('');
  var hint=box.querySelector('.uprog-hint');
  if(hint&&hint.parentNode)hint.parentNode.removeChild(hint);
  var note=document.createElement('div');
  note.className='uprog-note '+(res.bad?'bad':'good');
  note.textContent=res.msg;
  if(card)card.appendChild(note);

  if(res.bad){
   /* A refusal is the thing the customer never got to see, so it waits to be read. */
   var btn=document.createElement('button');
   btn.type='button';
   btn.className='uprog-close';
   btn.textContent=tl('ปิด','Close');
   btn.onclick=function(){close()};
   if(card)card.appendChild(btn);
   try{btn.focus()}catch(e){}
  }else{
   closer=setTimeout(function(){close()},res.holdMs||HOLD);
  }
 }

 function close(silent){
  if(timer){clearTimeout(timer);timer=0}
  if(closer){clearTimeout(closer);closer=0}
  if(box&&box.parentNode)box.parentNode.removeChild(box);
  box=null;
  if(!silent)shown=0;
 }
 function release(){
  try{delete window.imodeMediaProgress}catch(e){window.imodeMediaProgress=undefined}
 }
 window.imodeUploadProgressClose=close;
 window.imodeUploadProgressPopup={open:open,setPct:setPct,phase:phase,finish:finish,close:close};

 /* ------------------------------------------------------------- the wrappers ---- */
 /* The two forms keep their pending files in different places, so the counter is passed in:
    window.portalIssuePendingMedia for the customer, and pendingFieldStatusMedia for the
    technician — a top-level `let` in js/03, which makes it a lexical global that is never a
    property of window (part 17 §5), so it is read by bare identifier. */
 function fieldPending(){
  try{return (pendingFieldStatusMedia||[]).length}catch(e){return 0}
 }
 function attach(name,count,nothing){
  var base=window[name];
  if(typeof base!=='function')return;

  window[name]=function(input){
   var files=[];
   try{files=[].slice.call((input&&input.files)||[])}catch(e){files=[]}
   /* removePortalIssueMedia() and removeFieldStatusMedia() re-enter with {files:[]} purely to
      redraw the preview. That is not an upload and must not raise a popup. */
   if(!files.length)return base.apply(this,arguments);

   var before=count(),picked=files.length;
   open(files);
   window.imodeMediaProgress=onProgress;

   function failed(){
    release();
    finish({bad:true,msg:tl('เกิดข้อผิดพลาดระหว่างเพิ่มไฟล์ ลองใหม่อีกครั้ง',
                            'Something went wrong while adding the file. Please try again.')});
   }
   function settled(){
    release();
    var added=count()-before;
    if(added>0){
     finish({msg:tl('เพิ่มไฟล์แล้ว '+added+' ไฟล์'+(added<picked?' (ข้าม '+(picked-added)+' ไฟล์)':''),
                    'Added '+added+' file'+(added>1?'s':'')+(added<picked?' ('+(picked-added)+' skipped)':''))});
    }else{
     finish({bad:true,msg:nothing()});
    }
   }

   var out;
   try{out=base.apply(this,arguments)}
   catch(err){failed();throw err}
   if(out&&typeof out.then==='function')out.then(settled,failed);
   else settled();
   return out;
  };
 }

 attach('portalIssueMediaChanged',pending,function(){
  return tl('ยังไม่ได้เพิ่มไฟล์ — ไฟล์อาจใหญ่เกิน 3 MB หรือแนบครบ 4 ไฟล์แล้ว ลองเลือกไฟล์ที่เล็กลง',
            'Nothing was added — the file may be over 3 MB, or four files are already attached.');
 });
 /* js/30 already wraps addFieldStatusMedia and reports through window.imodeMediaProgress, so
    this path gets a real percentage for free — and js/30's own toast stands down by itself
    while the hook is installed, so nothing is said twice. This file loads after js/30, so the
    promise received here covers the shrink and the preview together. */
 attach('addFieldStatusMedia',fieldPending,function(){
  return tl('ยังไม่ได้เพิ่มไฟล์ — วิดีโอสูงสุด 2 ไฟล์ต่อสถานะ และขนาดไม่เกิน 2.5 MB ต่อไฟล์',
            'Nothing was added — up to 2 videos per status, each under 2.5 MB.');
 });
})();
