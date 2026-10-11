// Framing suggestions, not garment recognition. All media stays in this session.
export function suggestFitRegions() {
  return [
    {category:'shirt',name:'Shirt',box:{x:.15,y:.2,w:.7,h:.34}},
    {category:'pants',name:'Pants',box:{x:.23,y:.52,w:.54,h:.35}},
    {category:'shoes',name:'Shoes',box:{x:.2,y:.86,w:.6,h:.14}}
  ];
}
export function clampBox(box) {
  const x=Math.max(0,Math.min(.95,box.x)),y=Math.max(0,Math.min(.95,box.y));
  return {x,y,w:Math.max(.05,Math.min(1-x,box.w)),h:Math.max(.05,Math.min(1-y,box.h))};
}
export function installFitVideo({nativeApp,pickVideo,onReview,toast}) {
  const $=id=>document.getElementById(id),panel=$('fit-video-dialog'),video=$('fit-video-player'),canvas=$('fit-frame');
  let mediaURL=null,frame=null,regions=[],active=0,busy=false,revision=0,drag=null;
  const status=text=>$('fit-video-status').textContent=text;
  function release(){revision++;video.pause();video.removeAttribute('src');video.load();if(mediaURL)URL.revokeObjectURL(mediaURL);mediaURL=null;frame=null;regions=[];drag=null;canvas.width=1;canvas.height=1;$('fit-video-stage').hidden=true;$('fit-time').hidden=false;$('fit-time-label').hidden=false;$('fit-video-file').value='';busy=false;}
  function open(){if(busy)return;release();status('Choose a full-body photo or film a short, steady clip with one person visible from head to shoes. Your photo or video stays on this device.');panel.showModal();}
  $('open-fit-video').onclick=open;$('close-fit-video').onclick=()=>panel.close();panel.addEventListener('close',release);
  $('fit-record').onclick=async()=>{if(nativeApp){try{const file=await pickVideo('camera');if(file)await load(file);}catch(e){if(!/cancel/i.test(e.message))status('Could not record. Check camera and microphone access in Settings.');}}else $('fit-video-record-file').click();};
  $('fit-photo').onclick=async()=>{if(nativeApp){try{const file=await pickVideo('photo');if(file)await loadPhoto(file);}catch(e){if(!/cancel/i.test(e.message))status('Could not open this photo. Try JPG or PNG.');}}else $('fit-photo-file').click();};
  $('fit-photo-file').onchange=async()=>{const file=$('fit-photo-file').files[0];if(file)await loadPhoto(file);$('fit-photo-file').value='';};
  async function loadPhoto(file){release();const token=revision;if(file.size>15*1024*1024){status('Choose an outfit photo under 15 MB.');return;}busy=true;status('Opening your outfit photo…');try{const image=await createImageBitmap(file);if(token!==revision){image.close();return;}const scale=Math.min(1,1200/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;frame.getContext('2d').drawImage(image,0,0,frame.width,frame.height);image.close();regions=suggestFitRegions();active=0;$('fit-time').hidden=true;$('fit-time-label').hidden=true;$('fit-video-stage').hidden=false;render();status('Adjust the suggested regions to each item. These are full-body framing guides, not automatic garment recognition.');}catch{status('Could not open this photo. Try JPG, PNG or WebP.');}finally{if(token===revision)busy=false;}}
  $('fit-choose').onclick=async()=>{if(nativeApp){try{const file=await pickVideo('gallery');if(file)await load(file);}catch(e){if(!/cancel/i.test(e.message))status('Could not open the video. Try choosing a shorter clip.');}}else $('fit-video-file').click();};
  for(const id of ['fit-video-file','fit-video-record-file'])$(id).onchange=async()=>{const file=$(id).files[0];if(file)await load(file);$(id).value='';};
  function eventOnce(target,event,action){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(new Error('Video took too long to load. Try an MP4 or MOV clip.')),20000);const done=error=>{clearTimeout(timer);target.removeEventListener(event,success);target.removeEventListener('error',failure);error?reject(error):resolve();};const success=()=>done(),failure=()=>done(new Error('This video cannot be played. Try MP4 or MOV.'));target.addEventListener(event,success,{once:true});target.addEventListener('error',failure,{once:true});action();});}
  async function load(file){release();const token=revision;if(file.size>150*1024*1024){status('Choose a short video under 150 MB.');return;}busy=true;status('Opening your video…');
    try{mediaURL=URL.createObjectURL(file);await eventOnce(video,'loadedmetadata',()=>{video.src=mediaURL;video.load();});if(token!==revision)return;if(video.readyState<2)await eventOnce(video,'loadeddata',()=>{});if(token!==revision)return;if(!Number.isFinite(video.duration)||!video.videoWidth||video.duration>120)throw new Error('Choose a video up to 2 minutes long.');$('fit-time').max=video.duration.toFixed(2);$('fit-time').value=Math.min(video.duration*.4,video.duration-.05);$('fit-video-stage').hidden=false;await capture(Number($('fit-time').value));status('Choose a clear frame. Suggested regions use full-body framing, so adjust them to your clothes. Nothing is saved until you review it.');}
    catch(e){if(token===revision){status(e.message);$('fit-video-stage').hidden=true;}}
    finally{if(token===revision)busy=false;}
  }
  async function capture(time){const token=revision;video.pause();if(Math.abs(video.currentTime-time)>.005)await eventOnce(video,'seeked',()=>video.currentTime=time);if(token!==revision)return;const scale=Math.min(1,1200/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;frame.getContext('2d').drawImage(video,0,0,frame.width,frame.height);regions=suggestFitRegions();active=0;render();$('fit-time-label').textContent=`Frame at ${time.toFixed(1)} seconds`;}
  $('fit-time').onchange=async()=>{if(busy)return;busy=true;try{await capture(Number($('fit-time').value));}catch(e){status(e.message);}finally{busy=false;}};
  function render(){if(!frame)return;const ctx=canvas.getContext('2d');ctx.drawImage(frame,0,0);for(let i=0;i<regions.length;i++){const r=regions[i],b=r.box;ctx.strokeStyle=i===active?'#de7044':'#708460';ctx.lineWidth=Math.max(3,canvas.width/150);ctx.strokeRect(b.x*canvas.width,b.y*canvas.height,b.w*canvas.width,b.h*canvas.height);ctx.fillStyle=ctx.strokeStyle;ctx.font=`${Math.max(18,canvas.width/35)}px sans-serif`;ctx.fillText(r.name,b.x*canvas.width+6,Math.max(22,b.y*canvas.height+24));}const list=$('fit-region-tabs');list.replaceChildren();regions.forEach((r,i)=>{const button=document.createElement('button');button.type='button';button.textContent=r.name;button.setAttribute('aria-pressed',String(i===active));button.onclick=()=>{active=i;render();};list.append(button);});$('fit-region-category').value=regions[active].category;for(const key of ['x','y','w','h'])$('fit-crop-'+key).value=Math.round(regions[active].box[key]*100);}
  function update(key,value){if(!frame)return;regions[active].box=clampBox({...regions[active].box,[key]:value/100});render();}
  for(const key of ['x','y','w','h'])$('fit-crop-'+key).oninput=e=>update(key,Number(e.target.value));
  $('fit-region-category').onchange=e=>{if(!regions.length)return;regions[active].category=e.target.value;regions[active].name={shirt:'Shirt',pants:'Pants',shoes:'Shoes',jacket:'Jacket'}[e.target.value];render();};
  canvas.onpointerdown=e=>{if(!frame||busy)return;const rect=canvas.getBoundingClientRect();drag={x:e.clientX/rect.width,y:e.clientY/rect.height,box:{...regions[active].box}};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag)return;const rect=canvas.getBoundingClientRect();regions[active].box=clampBox({...drag.box,x:drag.box.x+e.clientX/rect.width-drag.x,y:drag.box.y+e.clientY/rect.height-drag.y});render();};
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drag=null);
  $('fit-add-region').onclick=()=>{if(!frame)return;if(regions.length>=8){status('Review up to 8 items per clip.');return;}regions.push({category:'jacket',name:'Jacket',box:{x:.15,y:.2,w:.7,h:.34}});active=regions.length-1;render();};
  $('fit-remove-region').onclick=()=>{if(regions.length<=1){status('Keep at least one region to review.');return;}regions.splice(active,1);active=Math.min(active,regions.length-1);render();};
  $('fit-review').onclick=async()=>{if(!frame||busy)return;busy=true;$('fit-review').disabled=true;status('Preparing individual pieces…');const token=revision;
    try{const drafts=[];for(const region of regions){const b=region.box,out=document.createElement('canvas');out.width=Math.max(1,Math.round(b.w*frame.width));out.height=Math.max(1,Math.round(b.h*frame.height));out.getContext('2d').drawImage(frame,b.x*frame.width,b.y*frame.height,b.w*frame.width,b.h*frame.height,0,0,out.width,out.height);const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not prepare a piece. Try another frame.');drafts.push({category:region.category,name:region.name,file:new File([blob],'fit-piece.png',{type:'image/png'})});}if(token!==revision)return;panel.close();onReview(drafts);}
    catch(e){if(token===revision)status(e.message||'Could not prepare these pieces.');}
    finally{busy=false;$('fit-review').disabled=false;}
  };
}
