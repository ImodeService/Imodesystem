/* Beta — every uploaded photo and video is shrunk before it is stored.

   Reported: "เวลาเพิ่มไฟล์รูปภาพหรือวิดีโอมันมักจะใหญ่เกินไป".

   Why it matters more here than in a normal app: every attachment is kept as a base64
   data URL inside localStorage (and pushed to Supabase in the same form). Base64 is 4/3
   of the bytes, and the whole origin only gets ~5 MB, so one phone photo straight off the
   camera (3-8 MB) can fill the quota on its own.

   What the four upload paths did before this file:

     addReportPhotos      -> compressPhoto(): 1000 px, JPEG q.78, fixed. No size target, so
                             a detailed 12 MP photo still landed at 1.5-2 MB.
     addFieldStatusMedia  -> compressPhoto() for images; videos rejected over 2.5 MB.
     addReportVideos      -> videos rejected over 2.5 MB.
     portalIssueMediaChanged (the customer's own แจ้งปัญหา form)
                          -> no compression at all. Raw readAsDataURL, rejected over 3 MB.
                             This is the path a customer uses on a phone, so it was the
                             one that failed most.

   What happens now:

     images  a real target-size loop — scale down, then step the JPEG quality down, until
             the encoded result is under the target. A 6 MB phone photo comes out around
             150-400 KB and still reads a machine plate.
     videos  re-encoded through canvas -> MediaRecorder at a bitrate computed from the
             clip's own duration, so a clip lands near the configured MB limit instead of
             being refused. The original audio track is carried over, because motor noise
             is evidence.

   Everything here degrades to the old behaviour rather than failing: a browser with no
   MediaRecorder, a codec that will not encode, a clip longer than the cap, or an encode
   that ends up bigger than the source, all hand the original file back and the existing
   size rule applies to it exactly as before.

   No storage key, no schema and no existing function body is changed. The three video
   callers are wrapped by handing the untouched original function a {files:[...]} object
   holding the shrunk files, so their previews, counters and limits keep working.

   2026-09-15: the work above takes seconds on a phone and said almost nothing while it ran,
   so shrinkList now reports a real fraction per file through window.imodeMediaProgress —
   FileReader's own progress events while the file is read, the encode pass for an image, and
   currentTime/duration for a video, which is exact because MediaRecorder encodes at playback
   speed. It is a plain hook, not an event: with no consumer installed it costs one typeof,
   and js/67 (the customer's popup) is the only consumer today. */
(function(){
 'use strict';

 function tl(th,en){try{return (settings.language==='en')?en:th}catch(e){return th}}
 function toast(m){if(typeof window.toastMsg==='function')window.toastMsg(m)}
 function mediaCfg(){
  var c={};
  try{c=settings.mediaConfig||{}}catch(e){}
  return c;
 }
 function maxVideoBytes(){return (Number(mediaCfg().maxVideoMB)||2.5)*1024*1024}

 /* ---------------------------------------------------------------- images ---- */
 var IMG_MAX_EDGE=1400;      /* enough to read a serial plate */
 var IMG_MIN_EDGE=640;       /* never shrink past something a person can judge */
 var IMG_TARGET=420*1024;    /* bytes of encoded JPEG */
 var IMG_QUALITIES=[0.82,0.72,0.62,0.52,0.44];

 function readDataURL(file,onp){
  return new Promise(function(res,rej){
   var r=new FileReader();
   r.onload=function(){res(String(r.result||''))};
   r.onerror=function(){rej(new Error('read failed'))};
   if(typeof onp==='function'){
    r.onprogress=function(e){if(e&&e.lengthComputable&&e.total)onp(e.loaded/e.total)};
   }
   r.readAsDataURL(file);
  });
 }
 function loadImage(src){
  return new Promise(function(res,rej){
   var img=new Image();
   img.onload=function(){res(img)};
   img.onerror=function(){rej(new Error('decode failed'))};
   img.src=src;
  });
 }
 /* The encoded byte count, without allocating a Blob for every attempt. */
 function dataUrlBytes(u){
  var i=String(u||'').indexOf(',');
  if(i<0)return String(u||'').length;
  var body=u.length-i-1,pad=0;
  if(u.slice(-2)==='==')pad=2;else if(u.slice(-1)==='=')pad=1;
  return Math.max(0,Math.floor(body*3/4)-pad);
 }
 function drawTo(img,edge){
  var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  var s=Math.min(1,edge/Math.max(w,h));
  var cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(w*s));
  cv.height=Math.max(1,Math.round(h*s));
  var ctx=cv.getContext('2d');
  /* A white ground, so a PNG with transparency does not come out of JPEG as black. */
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(img,0,0,cv.width,cv.height);
  return cv;
 }

 /* Replaces compressPhoto() in js/03. It is a top-level function declaration there, so
    window.compressPhoto and the binding addReportPhotos() calls are the same property —
    assigning here really does redirect every caller. Same contract: a File in, a JPEG
    data URL out, so nothing downstream changes. */
 function shrinkImage(file,onp){
  var p=typeof onp==='function'?onp:function(){};
  return readDataURL(file,function(f){p(f*0.35)}).then(function(u){
   p(0.4);
   return loadImage(u);
  }).then(function(img){
   var edge=IMG_MAX_EDGE,best='';
   for(var pass=0;pass<4;pass++){
    p(0.45+pass*0.12);
    var cv=drawTo(img,edge);
    for(var q=0;q<IMG_QUALITIES.length;q++){
     var out=cv.toDataURL('image/jpeg',IMG_QUALITIES[q]);
     if(!best||dataUrlBytes(out)<dataUrlBytes(best))best=out;
     if(dataUrlBytes(out)<=IMG_TARGET){p(0.98);return out}
    }
    if(edge<=IMG_MIN_EDGE)break;
    edge=Math.max(IMG_MIN_EDGE,Math.round(edge*0.72));
   }
   p(0.98);
   return best;
  }).catch(function(){
   /* An image the browser cannot decode (HEIC on a desktop, a corrupt file) is passed
      through untouched rather than lost. */
   return readDataURL(file);
  });
 }
 window.imodeShrinkImage=shrinkImage;
 if(typeof window.compressPhoto==='function')window.compressPhoto=shrinkImage;

 /* ---------------------------------------------------------------- videos ---- */
 var VIDEO_MAX_SECONDS=120;   /* beyond this the encode costs more than it saves */
 var VIDEO_MAX_EDGE=640;

 function canEncodeVideo(){
  try{
   return typeof window.MediaRecorder==='function'
    && typeof HTMLCanvasElement.prototype.captureStream==='function';
  }catch(e){return false}
 }
 function pickMime(){
  var list=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
  for(var i=0;i<list.length;i++){
   try{if(window.MediaRecorder.isTypeSupported(list[i]))return list[i]}catch(e){}
  }
  return '';
 }
 function fileFrom(blob,name,type){
  try{return new File([blob],name,{type:type||blob.type})}catch(e){}
  try{blob.name=name}catch(e){}
  return blob;
 }

 /* Re-encode one clip. Resolves with the original file whenever the shrunk copy would not
    actually be an improvement, so a caller never has to ask whether it worked. */
 function shrinkVideo(file,onp){
  var prog=typeof onp==='function'?onp:function(){};
  if(!canEncodeVideo())return Promise.resolve(file);
  var mime=pickMime();
  if(!mime)return Promise.resolve(file);
  var target=maxVideoBytes()*0.85;
  if(file.size<=target)return Promise.resolve(file);

  return new Promise(function(resolve){
   var url=URL.createObjectURL(file);
   var v=document.createElement('video');
   var done=false,rec=null,raf=0,timer=0;
   function finish(result){
    if(done)return;
    done=true;
    if(raf)cancelAnimationFrame(raf);
    if(timer)clearTimeout(timer);
    try{if(rec&&rec.state!=='inactive')rec.stop()}catch(e){}
    try{v.pause()}catch(e){}
    try{URL.revokeObjectURL(url)}catch(e){}
    resolve(result||file);
   }
   v.muted=true;               /* required for programmatic play() */
   v.playsInline=true;
   v.preload='auto';
   v.src=url;

   v.onerror=function(){finish(null)};
   v.onloadedmetadata=function(){
    var dur=Number(v.duration)||0;
    if(!isFinite(dur)||dur<=0||dur>VIDEO_MAX_SECONDS){finish(null);return}

    var w=v.videoWidth||0,h=v.videoHeight||0;
    if(!w||!h){finish(null);return}
    var s=Math.min(1,VIDEO_MAX_EDGE/Math.max(w,h));
    var cv=document.createElement('canvas');
    cv.width=Math.max(2,Math.round(w*s/2)*2);      /* even dimensions: some encoders insist */
    cv.height=Math.max(2,Math.round(h*s/2)*2);
    var ctx=cv.getContext('2d');

    /* Bitrate straight from the clip's own length, so a long clip is encoded harder than
       a short one and both land near the same file size. */
    var bits=Math.round(target*8/dur);
    var videoBits=Math.min(1600000,Math.max(140000,bits-48000));

    var stream;
    try{stream=cv.captureStream(15)}catch(e){finish(null);return}
    /* Motor noise is diagnostic evidence, so the original audio rides along when the
       browser will give it to us. */
    try{
     if(typeof v.captureStream==='function'){
      v.captureStream().getAudioTracks().forEach(function(t){stream.addTrack(t)});
     }else if(typeof v.mozCaptureStream==='function'){
      v.mozCaptureStream().getAudioTracks().forEach(function(t){stream.addTrack(t)});
     }
    }catch(e){}

    var chunks=[];
    try{
     rec=new window.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:videoBits,audioBitsPerSecond:48000});
    }catch(e){
     try{rec=new window.MediaRecorder(stream,{mimeType:mime})}catch(e2){finish(null);return}
    }
    rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
    rec.onerror=function(){finish(null)};
    rec.onstop=function(){
     var blob=new Blob(chunks,{type:mime.split(';')[0]});
     /* Only keep it if it is genuinely smaller and not empty. */
     if(!blob.size||blob.size>=file.size){finish(null);return}
     var ext=blob.type.indexOf('mp4')>=0?'.mp4':'.webm';
     var base=String(file.name||'video').replace(/\.[^.]+$/,'');
     finish(fileFrom(blob,base+ext,blob.type));
    };

    /* A hard ceiling on the whole operation: whatever goes wrong inside the encoder, the
       upload falls back to the original instead of hanging the form. */
    timer=setTimeout(function(){
     if(rec&&rec.state==='recording'){try{rec.stop()}catch(e){finish(null)}}
     else finish(null);
    },Math.round(dur*1000*1.6)+9000);

    var paint=function(){
     if(done)return;
     try{ctx.drawImage(v,0,0,cv.width,cv.height)}catch(e){}
     /* A real percentage: the encode runs at playback speed, so how far the clip has
        played is how far the encode has got. */
     try{prog(0.05+0.9*Math.min(1,(Number(v.currentTime)||0)/dur))}catch(e){}
     raf=requestAnimationFrame(paint);
    };
    v.onended=function(){
     setTimeout(function(){
      try{if(rec&&rec.state==='recording')rec.stop()}catch(e){finish(null)}
     },120);
    };
    try{rec.start(400)}catch(e){finish(null);return}
    var p=v.play();
    if(p&&p.catch)p.catch(function(){finish(null)});
    raf=requestAnimationFrame(paint);
   };
  });
 }
 window.imodeShrinkVideo=shrinkVideo;

 /* -------------------------------------------------- wrapping the callers ---- */
 /* Every caller reads input.files and then clears input.value. Handing it a plain object
    with the same two members lets the original function run untouched over shrunk files —
    its previews, its per-type counters and its MB rule all stay exactly where they are. */
 function shrinkList(files,opts){
  /* One fraction per file. The jobs run in parallel, so there is no single "current file"
     to name — the consumer is handed every file's own share and the mean of them. */
  var parts=files.map(function(){return 0});
  function step(i,v){
   var n=Math.max(0,Math.min(1,Number(v)||0));
   if(n<=parts[i])return;
   parts[i]=n;
   emitProgress(files,parts);
  }
  function settle(i,out){parts[i]=1;emitProgress(files,parts);return out}
  var jobs=files.map(function(f,i){
   var t=String(f.type||'');
   var on=function(v){step(i,v)};
   if(opts.video&&t.indexOf('video/')===0){
    return shrinkVideo(f,on).then(function(out){return settle(i,out)},function(){return settle(i,f)});
   }
   if(opts.image&&t.indexOf('image/')===0){
    return shrinkImage(f,on).then(function(data){
     var blob=dataUrlToBlob(data);
     if(!blob||blob.size>=f.size)return settle(i,f);
     return settle(i,fileFrom(blob,String(f.name||'photo').replace(/\.[^.]+$/,'')+'.jpg','image/jpeg'));
    },function(){return settle(i,f)});
   }
   return Promise.resolve(settle(i,f));
  });
  return Promise.all(jobs);
 }
 /* The progress hook. Nothing here depends on a consumer existing: with no overlay
    installed this costs one typeof per step. js/67 is the only consumer today, and it
    installs the hook only while its own popup is on screen. */
 function emitProgress(files,parts){
  var fn=window.imodeMediaProgress;
  if(typeof fn!=='function')return;
  var total=0,i;
  for(i=0;i<parts.length;i++)total+=parts[i];
  try{
   fn({
    percent:parts.length?Math.round(total/parts.length*100):0,
    files:files.map(function(f,k){
     return {name:String(f.name||''),size:Number(f.size)||0,type:String(f.type||''),percent:Math.round(parts[k]*100)};
    })
   });
  }catch(e){}
 }
 function dataUrlToBlob(u){
  try{
   var i=String(u||'').indexOf(',');
   if(i<0)return null;
   var meta=u.slice(0,i),body=u.slice(i+1);
   if(meta.indexOf('base64')<0)return null;
   var bin=atob(body),len=bin.length,arr=new Uint8Array(len);
   for(var k=0;k<len;k++)arr[k]=bin.charCodeAt(k);
   return new Blob([arr],{type:(meta.match(/data:([^;]+)/)||[])[1]||'image/jpeg'});
  }catch(e){return null}
 }

 var BUSY_MSG=tl('กำลังลดขนาดไฟล์...','Shrinking the file...');
 function wrapUpload(name,opts){
  var base=window[name];
  if(typeof base!=='function')return;
  window[name]=function(input){
   var files=[];
   try{files=[].slice.call((input&&input.files)||[])}catch(e){files=[]}
   if(!files.length)return base.call(this,input);
   var heavy=files.some(function(f){
    return (opts.video&&String(f.type||'').indexOf('video/')===0)||f.size>1200*1024;
   });
   /* The toast is the fallback notice. When a progress popup is listening it says the
      same thing twice, and worse than the popup does, so it stands down. */
   if(heavy&&typeof window.imodeMediaProgress!=='function')toast(BUSY_MSG);
   var self=this;
   return shrinkList(files,opts).then(function(out){
    try{if(input)input.value=''}catch(e){}
    return base.call(self,{files:out,value:''});
   });
  };
 }
 /* addReportPhotos is not wrapped: it already calls compressPhoto(), which is now the
    target-size version above, so its images are covered at the source. */
 wrapUpload('addReportVideos',{video:true});
 wrapUpload('addFieldStatusMedia',{video:true});
 wrapUpload('portalIssueMediaChanged',{video:true,image:true});
})();
