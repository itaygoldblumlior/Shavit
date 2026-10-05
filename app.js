import { randomOutfit } from './random-outfit.js';
import { removeBackground } from '@imgly/background-removal';
import { garmentLayout, fitGarment } from './garment-layout.js';
import { shoeRegions } from './shoe-regions.js';
import { soleIsOnTop } from './shoe-orientation.js';

const $ = (id) => document.getElementById(id);
const demos = {
  shirt: [{id:'demo-blue',name:'Blue everyday tee',category:'shirt',color:'#7598b0'}, {id:'demo-black',name:'Black tee',category:'shirt',color:'#333a3e'}, {id:'demo-cream',name:'Cream tee',category:'shirt',color:'#e6d8bd'}],
  pants: [{id:'demo-jeans',name:'Black jeans',category:'pants',color:'#333a3e'}, {id:'demo-chinos',name:'Sand chinos',category:'pants',color:'#b9a485'}],
  shoes: [{id:'demo-sneakers',name:'Cream sneakers',category:'shoes',color:'#e6d8bd'}, {id:'demo-black-shoes',name:'Black sneakers',category:'shoes',color:'#333a3e'}],
  jacket: [{id:'demo-green-jacket',name:'Green jacket',category:'jacket',color:'#799777'}, {id:'demo-tan-jacket',name:'Tan jacket',category:'jacket',color:'#b9a485'}, {id:'no-jacket',name:'No jacket',category:'jacket',none:true,color:'transparent'}]
};
let db, clothes = [], selected = {shirt:null,pants:null,shoes:null,jacket:'no-jacket'}, processedPhoto = null, processing = false, photoVersion = 0;
let lastJacket = null;
let previewVersion=0,previewBusy=false,originalPhoto=null,cutoutPhoto=null,usingOriginal=false,draftShoePhotos=null;
let wardrobeCategory = 'all';
let savedFits = [];
const outfitCategories=['shirt','pants','shoes','jacket'];
function readPreference(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}}
function writePreference(key,value){localStorage.setItem(key,JSON.stringify(value));}
function shuffleOutfit(previous=selected){
  const choices=Object.fromEntries(outfitCategories.map(category=>{const owned=clothes.filter(item=>item.category===category);return [category,owned.length?(category==='jacket'?[...owned,demos.jacket[2]]:owned):category==='jacket'?[demos.jacket[2]]:[current(category)]];}));
  selected=randomOutfit(choices,previous);
}
function fitKey(fit){return JSON.stringify(outfitCategories.map(category=>fit[category]));}
function savedIndex(){return savedFits.findIndex(fit=>fitKey(fit)===fitKey(selected));}
function updateBookmark(){const saved=savedIndex()>=0;$('save-outfit').setAttribute('aria-pressed',String(saved));$('save-outfit').setAttribute('aria-label',saved?'Unsave outfit':'Save outfit');}
const fitCache = new Map();
const dialog = $('upload-dialog');
let toastTimer;
function toast(message){ $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').classList.remove('visible'),4500); }
function transaction(mode, action){return new Promise((resolve,reject)=>{const tx = db.transaction('clothes',mode);const request=action(tx.objectStore('clothes'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function init(){
  try {db = await new Promise((resolve,reject)=>{const request=indexedDB.open('daily-wardrobe',1); request.onupgradeneeded=()=>request.result.createObjectStore('clothes',{keyPath:'id'}); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);}); clothes = await transaction('readonly',s=>s.getAll()); savedFits=readPreference('shavit-saved-fits',[]);if(!Array.isArray(savedFits))savedFits=[];savedFits=savedFits.filter(fit=>fit&&outfitCategories.every(category=>options(category).some(item=>item.id===fit[category])));shuffleOutfit(readPreference('shavit-last-outfit',{})); await render();document.body.classList.add('wardrobe-ready');$('random-outfit').disabled=false;$('save-outfit').disabled=false;}
  catch {toast('Your browser could not open storage. Try a regular browser window.'); $('add-top').disabled=true;}
}
function options(category){const own=clothes.filter(c=>c.category===category);return own.length?(category==='jacket'?[...own,demos.jacket[2]]:own):demos[category];}
function current(category){const list=options(category);return list.find(c=>c.id===selected[category])||list[0];}
function render(){
  const pending=[];
  for(const category of ['shirt','pants','shoes','jacket']){
    const item=current(category); selected[category]=item.id; const image=$(category+'-photo');
    if(category==='shirt'||category==='pants')$(category+'-target').setAttribute('transform',item.photo?'':category==='shirt'?'translate(170 150) scale(1.15) translate(-170 -122)':'translate(170 365) scale(1.5 1.05) translate(-170 -256)');
    if(category==='shoes')$('shoes-photo-right').style.display='none';
    if(item.photo){image.setAttribute('href',item.photo);image.removeAttribute('clip-path');image.setAttribute('preserveAspectRatio','xMidYMid meet');for(const [key,value] of Object.entries(garmentLayout[category]))image.setAttribute(key,value);image.style.display='';pending.push(alignPhoto(item,image));}
    else {image.removeAttribute('href');image.style.display='none';}
    $(category+'-color').style.display=item.photo&&category!=='jacket'?'none':'';
    $(category+'-color').setAttribute('fill',item.photo&&category==='jacket'?'transparent':item.color||'#c1cab5');
    // Real cutouts retain their own silhouette rather than being cropped to a generic garment.
    $(category+'-target').lastElementChild.style.display=item.photo||item.none?'none':'';
    $(category+'-target').setAttribute('aria-label',`Switch ${category}: currently ${item.name}`);
  }
  const wearingJacket = !current('jacket').none;
  $('jacket-target').style.display=wearingJacket?'':'none';
  $('toggle-jacket').setAttribute('aria-pressed',String(wearingJacket));
  const figure=document.querySelector('.figure');
  figure.setAttribute('viewBox','0 0 340 700');
  requestAnimationFrame(positionJacket);
  pending.push(positionShoes());
  renderWardrobe();
  updateBookmark();
  try{writePreference('shavit-last-outfit',selected);}catch{}
  return Promise.all(pending);
}

function positionJacket(){
  const figure=document.querySelector('.figure');
  const rect=figure.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const figureScale=Math.min(rect.width/340,rect.height/700);
  const jacketLeft=270;
  const screenLeft=rect.left+rect.width/2+(jacketLeft-170)*figureScale;
  const availableWidth=Math.max(32,(window.innerWidth-18-screenLeft)/figureScale);
  const jacketScale=Math.min(1.35,availableWidth/140);
  const photo=Boolean(current('jacket').photo);
  const horizontalScale=photo?jacketScale:Math.min(1.35,availableWidth/208);
  const sourceTop=photo?150:119;
  // Move and size the outer layer independently; the face and outfit never shift.
  $('jacket-target').setAttribute('transform',`translate(${jacketLeft-66*horizontalScale} ${150-sourceTop*jacketScale}) scale(${horizontalScale} ${jacketScale})`);
}
window.addEventListener('resize',positionJacket);

async function alignPhoto(item, element){
  try {
    if(!fitCache.has(item.id))fitCache.set(item.id,measureWaist(item));
    const anchor=await fitCache.get(item.id);
    if(selected[item.category]!==item.id)return;
    if(anchor?.photo)element.setAttribute('href',anchor.photo);
    if(item.category==='shoes'){
      element.setAttribute('preserveAspectRatio','xMidYMid meet');
      const box={x:105,y:590,width:55,height:80};
      for(const [key,value] of Object.entries(box))element.setAttribute(key,value);
      const right=$('shoes-photo-right');right.style.display='';
      element.setAttribute('href',anchor?.shoes?.[0]||anchor?.photo||item.photo);
      right.setAttribute('href',anchor?.shoes?.[1]||anchor?.photo||item.photo);
      await positionShoes();
      return;
    }
    for(const [key,value] of Object.entries(fitGarment(item.category,anchor)))element.setAttribute(key,value);
  } catch { /* The fixed body anchors remain usable if a photo cannot be measured. */ }
}
async function trimShoeBody(src){
  const image=new Image();image.src=src;await image.decode();
  const sample=document.createElement('canvas');sample.width=100;sample.height=100;const ctx=sample.getContext('2d');ctx.drawImage(image,0,0,100,100);const data=ctx.getImageData(0,0,100,100).data;
  const rows=new Uint16Array(100),columns=new Uint16Array(100);
  for(let y=0;y<100;y++)for(let x=0;x<100;x++)if(data[(y*100+x)*4+3]>100){rows[y]++;columns[x]++;}
  const ys=Array.from(rows.keys()).filter(y=>rows[y]>=Math.max(2,Math.max(...rows)*.18)),xs=Array.from(columns.keys()).filter(x=>columns[x]>=Math.max(2,Math.max(...columns)*.18));
  if(!ys.length||!xs.length)return src;
  const left=Math.max(0,xs[0]-2),top=Math.max(0,ys[0]-2),right=Math.min(100,xs.at(-1)+3),bottom=Math.min(100,ys.at(-1)+3);
  const out=document.createElement('canvas');out.width=Math.max(1,Math.round((right-left)/100*image.naturalWidth));out.height=Math.max(1,Math.round((bottom-top)/100*image.naturalHeight));out.getContext('2d').drawImage(image,left/100*image.naturalWidth,top/100*image.naturalHeight,(right-left)/100*image.naturalWidth,(bottom-top)/100*image.naturalHeight,0,0,out.width,out.height);return out.toDataURL('image/png');
}
async function transformShoe(src,action){const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=action==='rotate'?image.naturalHeight:image.naturalWidth;canvas.height=action==='rotate'?image.naturalWidth:image.naturalHeight;const ctx=canvas.getContext('2d');if(action==='rotate'){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);}else{ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(image,0,0);return canvas.toDataURL('image/png');}
async function measureWaist(item){
  if(item.category==='shoes'&&item.shoePhotos?.length===2)return {photo:item.photo,shoes:await Promise.all(item.shoePhotos.map(trimShoeBody))};
  const image=new Image();image.src=item.photo;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,240,240);
  let pixels=context.getImageData(0,0,240,240).data;
  // Ignore isolated mask noise and faint shadows when finding visible edges.
  const rowCounts=new Uint16Array(240),columnCounts=new Uint16Array(240);
  for(let y=0;y<240;y++)for(let x=0;x<240;x++)if(pixels[(y*240+x)*4+3]>12){rowCounts[y]++;columnCounts[x]++;}
  const rowsWithClothes=Array.from(rowCounts.keys()).filter(y=>rowCounts[y]>0);
  const columnsWithClothes=Array.from(columnCounts.keys()).filter(x=>columnCounts[x]>0);
  if(!rowsWithClothes.length||!columnsWithClothes.length)return null;
  const top=rowsWithClothes[0],bottom=rowsWithClothes.at(-1),left=columnsWithClothes[0],right=columnsWithClothes.at(-1);
  const source={x:left/240*image.naturalWidth,y:top/240*image.naturalHeight,width:(right-left+1)/240*image.naturalWidth,height:(bottom-top+1)/240*image.naturalHeight};
  const trimmed=document.createElement('canvas');trimmed.width=Math.max(1,Math.round(source.width));trimmed.height=Math.max(1,Math.round(source.height));trimmed.getContext('2d').drawImage(image,source.x,source.y,source.width,source.height,0,0,trimmed.width,trimmed.height);
  const photo=trimmed.toDataURL('image/png');
  if(item.category==='shoes'){
    context.clearRect(0,0,240,240);context.drawImage(trimmed,0,0,240,240);
    const regions=item.shoeMode==='single'?null:shoeRegions(context.getImageData(0,0,240,240).data,240,240,item.shoeMode==='pair',trimmed.width/trimmed.height);
    const shoes=regions?.map(region=>{const out=document.createElement('canvas');out.width=Math.max(1,Math.round(region.width/240*trimmed.width));out.height=Math.max(1,Math.round(region.height/240*trimmed.height));out.getContext('2d').drawImage(trimmed,region.x/240*trimmed.width,region.y/240*trimmed.height,region.width/240*trimmed.width,region.height/240*trimmed.height,0,0,out.width,out.height);return out.toDataURL('image/png');});
    const cleanedPhoto=trimmed.toDataURL('image/png');
    const oriented=await Promise.all((shoes||[cleanedPhoto,cleanedPhoto]).map(async src=>{
      const shoe=new Image();shoe.src=await trimShoeBody(src);await shoe.decode();
      const upright=shoe.naturalHeight>shoe.naturalWidth*1.25;
      const out=document.createElement('canvas');out.width=upright?shoe.naturalHeight:shoe.naturalWidth;out.height=upright?shoe.naturalWidth:shoe.naturalHeight;
      const ctx=out.getContext('2d');
      if(upright){ctx.translate(out.width,0);ctx.rotate(Math.PI/2);}
      ctx.drawImage(shoe,0,0);
      const soleMask=document.createElement('canvas');soleMask.width=64;soleMask.height=64;const soleContext=soleMask.getContext('2d');soleContext.drawImage(out,0,0,64,64);
      if(soleIsOnTop(soleContext.getImageData(0,0,64,64).data,64,64)!==Boolean(item.shoeFlip)){
        const corrected=document.createElement('canvas');corrected.width=out.width;corrected.height=out.height;const correction=corrected.getContext('2d');correction.translate(0,out.height);correction.scale(1,-1);correction.drawImage(out,0,0);
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,out.width,out.height);ctx.drawImage(corrected,0,0);
      }
      // Normalize side-view photos so the toe extends right of the ankle.
      {const mask=document.createElement('canvas');mask.width=40;mask.height=40;const m=mask.getContext('2d');m.drawImage(out,0,0,40,40);const rgba=m.getImageData(0,0,40,40).data;let upper=0,lower=0,a=0,b=0;
        for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(rgba[(y*40+x)*4+3]>100){if(y<16){upper+=x;a++;}else if(y>22){lower+=x;b++;}}
        if(a&&b&&lower/b<upper/a){const flipped=document.createElement('canvas');flipped.width=out.width;flipped.height=out.height;const f=flipped.getContext('2d');f.translate(out.width,0);f.scale(-1,1);f.drawImage(out,0,0);return flipped.toDataURL('image/png');}
      }
      return out.toDataURL('image/png');
    }));
    return {photo,shoes:oriented};
  }
  return {photo,aspect:trimmed.width/trimmed.height};
}

async function positionShoes(){
  const pants=current('pants'),shoes=current('shoes');
  try{
    for(const item of [pants,shoes])if(item.photo&&!fitCache.has(item.id))fitCache.set(item.id,measureWaist(item));
    const [pantsFit,shoeFit]=await Promise.all([pants.photo?fitCache.get(pants.id):null,shoes.photo?fitCache.get(shoes.id):null]);
    if(current('pants').id!==pants.id||current('shoes').id!==shoes.id)return;
    const feet=[{x:132,y:590},{x:208,y:590}];
    for(const [index,id] of ['shoes-photo','shoes-photo-right'].entries()){
      const image=$(id),foot=feet[index];
      image.setAttribute('x',foot.x-35);image.setAttribute('y',foot.y);image.setAttribute('width',70);image.setAttribute('height',55);
      image.setAttribute('preserveAspectRatio','xMidYMid meet');
      image.setAttribute('transform',index===0?`translate(${foot.x*2} 0) scale(-1 1)`:'');
    }
    if(!shoes.photo){
      const shapes=feet.map((foot,index)=>{const sign=index===0?-1:1;return `M${foot.x-10} ${foot.y} L${foot.x+10} ${foot.y} L${foot.x+sign*30} ${foot.y+18} L${foot.x+sign*30} ${foot.y+24} L${foot.x-sign*12} ${foot.y+22} Z`;}).join(' ');
      $('shoes-color').setAttribute('d',shapes);$('shoes-target').lastElementChild.setAttribute('d',shapes);
    }
    const hit=$('shoes-target').querySelector('rect');hit.setAttribute('x',Math.min(feet[0].x,feet[1].x)-38);hit.setAttribute('y',Math.min(feet[0].y,feet[1].y));hit.setAttribute('width',Math.abs(feet[1].x-feet[0].x)+76);hit.setAttribute('height',Math.abs(feet[1].y-feet[0].y)+45);
  }catch{ /* Retain the last usable shoe positions if a photo cannot be read. */ }
}

const categoryNames = {shirt:'Shirts',pants:'Pants',shoes:'Shoes',jacket:'Jackets'};
function renderWardrobe(){
  const grid=$('wardrobe-grid');grid.replaceChildren();
  if(wardrobeCategory==='saved'){renderSavedFits(grid);return;}
  const visible=clothes.filter(item=>wardrobeCategory==='all'||item.category===wardrobeCategory);
  if(!visible.length){const empty=document.createElement('p');empty.className='wardrobe-empty';empty.textContent=wardrobeCategory==='all'?'No clothes added yet. Add your first piece!':`No ${categoryNames[wardrobeCategory].toLowerCase()} added yet.`;grid.append(empty);return;}
  for(const item of visible){
    const card=document.createElement('article');card.className='wardrobe-piece';
    const button=document.createElement('button');button.className='piece-wear';button.setAttribute('aria-label',`Wear ${item.name}`);button.setAttribute('aria-pressed',String(selected[item.category]===item.id));card.classList.toggle('is-worn',selected[item.category]===item.id);
    const photo=document.createElement('img');photo.src=item.photo;photo.alt=item.name;photo.loading='lazy';
    const name=document.createElement('strong');name.textContent=item.name;
    const category=document.createElement('span');category.textContent=categoryNames[item.category];
    button.append(photo,name,category);button.onclick=()=>{selected[item.category]=item.id;render();showOutfit();};
    const more=document.createElement('button');more.className='piece-more';more.textContent='⋯';more.setAttribute('aria-label',`Options for ${item.name}`);more.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.className='piece-menu';menu.hidden=true;
    const rename=document.createElement('button');rename.textContent='Change name';rename.onclick=()=>{closeItemMenus();renameItemId=item.id;$('rename-name').value=item.name;$('rename-error').textContent='';$('rename-dialog').showModal();$('rename-name').select();};
    const remove=document.createElement('button');remove.textContent='Remove';remove.className='remove-action';remove.onclick=async()=>{closeItemMenus();if(!confirm(`Remove “${item.name}” from your wardrobe?`))return;remove.disabled=true;try{await transaction('readwrite',store=>store.delete(item.id));clothes=clothes.filter(piece=>piece.id!==item.id);fitCache.delete(item.id);if(selected[item.category]===item.id)selected[item.category]=item.category==='jacket'?'no-jacket':null;render();toast('Removed from your wardrobe.');}catch{toast('Could not remove this item. Please try again.');}finally{remove.disabled=false;}};
    menu.append(rename);
    if(item.category==='shoes'){
      const flip=document.createElement('button');flip.textContent='Flip shoes upright';flip.onclick=async()=>{closeItemMenus();try{const updated={...item,shoeFlip:!item.shoeFlip};await transaction('readwrite',store=>store.put(updated));clothes=clothes.map(piece=>piece.id===item.id?updated:piece);fitCache.delete(item.id);render();toast('Shoe orientation updated.');}catch{toast('Could not update shoes. Please try again.');}};menu.append(flip);
    }
    menu.append(remove);more.onclick=()=>{const wasOpen=!menu.hidden;closeItemMenus();menu.hidden=wasOpen;more.setAttribute('aria-expanded',String(!wasOpen));};
    card.append(button,more,menu);grid.append(card);
  }
}
function showOutfit(){$('wardrobe-view').hidden=true;$('outfit-view').hidden=false;$('open-wardrobe').focus();requestAnimationFrame(positionJacket);}
$('open-wardrobe').onclick=()=>{$('outfit-view').hidden=true;$('wardrobe-view').hidden=false;renderWardrobe();$('back-to-outfit').focus();};
$('back-to-outfit').onclick=showOutfit;
document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{wardrobeCategory=button.dataset.category;document.querySelectorAll('[data-category]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));renderWardrobe();});
$('wardrobe-add').onclick=()=>openUpload();
$('export-wardrobe').onclick=()=>{
  const blob=new Blob([JSON.stringify({version:1,clothes})],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='shavit-wardrobe.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Wardrobe exported. Transfer this file to your phone.');
};
$('import-wardrobe').onclick=()=>$('wardrobe-backup').click();
$('wardrobe-backup').onchange=async()=>{
  const file=$('wardrobe-backup').files[0];if(!file||!db)return;
  try{
    if(file.size>200*1024*1024)throw new Error();
    const backup=JSON.parse(await file.text());if(backup.version!==1||!Array.isArray(backup.clothes)||backup.clothes.length>2000)throw new Error();
    const validPhoto=value=>typeof value==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value);
    const imported=backup.clothes.map(item=>{
      if(!categoryNames[item.category]||typeof item.name!=='string'||!item.name.trim()||!validPhoto(item.photo))throw new Error();
      return {id:crypto.randomUUID(),name:item.name.trim().slice(0,60),category:item.category,photo:item.photo,...(validPhoto(item.originalPhoto)?{originalPhoto:item.originalPhoto}:{}),...(item.category==='shoes'?{shoeMode:item.shoeMode==='pair'?'pair':'single',shoeFlip:Boolean(item.shoeFlip),...(Array.isArray(item.shoePhotos)&&item.shoePhotos.length===2&&item.shoePhotos.every(validPhoto)?{shoePhotos:item.shoePhotos}:{})}:{})};
    });
    await transaction('readwrite',store=>{for(const item of imported)store.put(item);});clothes.push(...imported);render();toast(`Imported ${imported.length} wardrobe pieces.`);
  }catch{toast('Could not import. Check the backup file and available device storage.');}
  finally{$('wardrobe-backup').value='';}
};
$('random-outfit').onclick=()=>{
  moodIndex=(moodIndex+1+Math.floor(Math.random()*(moods.length-1)))%moods.length;
  renderMood();
  const previous=fitKey(selected);
  shuffleOutfit();
  render();
  const dice=$('random-outfit');dice.classList.remove('rolling');
  requestAnimationFrame(()=>dice.classList.add('rolling'));
  toast(previous===fitKey(selected)?'New mood! Add more clothes for more outfit combinations.':'A new outfit and mood for Shavit.');
};

$('save-outfit').onclick=()=>{
  const index=savedIndex();
  const next=index>=0?savedFits.filter((_,i)=>i!==index):[...savedFits,{...selected}];
  try{writePreference('shavit-saved-fits',next);savedFits=next;updateBookmark();renderWardrobe();toast(index>=0?'Outfit unsaved.':'Outfit saved. Find it in Wardrobe → Saved fits.');}
  catch{toast('Could not save this outfit. Check your device storage.');}
};
function renderSavedFits(grid){
  const valid=savedFits.filter(fit=>outfitCategories.every(category=>options(category).some(item=>item.id===fit[category])));
  if(!valid.length){const empty=document.createElement('p');empty.className='wardrobe-empty';empty.textContent='Tap the bookmark next to Shavit to save a fit.';grid.append(empty);return;}
  for(const fit of valid){
    const card=document.createElement('article');card.className='wardrobe-piece saved-fit';
    const wear=document.createElement('button');wear.className='piece-wear';wear.setAttribute('aria-label','Wear saved outfit');
    const preview=document.createElement('div');preview.className='saved-fit-preview';
    for(const category of outfitCategories){const item=options(category).find(item=>item.id===fit[category]);if(item.none)continue;const piece=document.createElement(item.photo?'img':'span');if(item.photo){piece.src=item.photo;piece.alt=item.name;}else{piece.textContent=item.name;}preview.append(piece);}
    const label=document.createElement('strong');label.textContent='Wear this fit';wear.append(preview,label);wear.onclick=()=>{selected={...fit};render();showOutfit();};
    const remove=document.createElement('button');remove.className='layer-button';remove.textContent='Unsave';remove.onclick=()=>{const next=savedFits.filter(item=>fitKey(item)!==fitKey(fit));try{writePreference('shavit-saved-fits',next);savedFits=next;renderWardrobe();updateBookmark();}catch{toast('Could not unsave this outfit.');}};
    card.append(wear,remove);grid.append(card);
  }
}

$('random-outfit').addEventListener('animationend',()=>$('random-outfit').classList.remove('rolling'));
let renameItemId=null;
function closeItemMenus(){document.querySelectorAll('.piece-menu').forEach(menu=>menu.hidden=true);document.querySelectorAll('.piece-more').forEach(button=>button.setAttribute('aria-expanded','false'));}
document.addEventListener('click',event=>{if(!event.target.closest('.piece-menu,.piece-more'))closeItemMenus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const openMenu=document.querySelector('.piece-more[aria-expanded="true"]');closeItemMenus();openMenu?.focus();}});
$('close-rename').onclick=()=>$('rename-dialog').close();
$('rename-form').onsubmit=async event=>{event.preventDefault();const name=$('rename-name').value.trim();if(!name){$('rename-error').textContent='Please enter a name.';return;}const item=clothes.find(piece=>piece.id===renameItemId);if(!item){$('rename-dialog').close();return;}$('save-name').disabled=true;try{const updated={...item,name};await transaction('readwrite',store=>store.put(updated));clothes=clothes.map(piece=>piece.id===updated.id?updated:piece);render();$('rename-dialog').close();toast('Name updated.');}catch{$('rename-error').textContent='Could not save the name. Please try again.';}finally{$('save-name').disabled=false;}};

function cycle(category){const list=options(category);selected[category]=list[(list.findIndex(c=>c.id===selected[category])+1)%list.length].id;render();if(list.length===1)toast(`Add another ${category} to switch between pieces.`);}
for(const category of ['shirt','pants','shoes','jacket']){$(category+'-target').onclick=()=>cycle(category);$(category+'-target').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle(category);}};}
$('toggle-jacket').onclick=()=>{
  if(!current('jacket').none){lastJacket=selected.jacket;selected.jacket='no-jacket';}
  else {const jackets=options('jacket').filter(item=>!item.none);selected.jacket=jackets.find(item=>item.id===lastJacket)?.id||jackets[0].id;}
  render();
};
const moods = [
  {name:'happy', eyes:'M151 73 L151 77 M181 71 L182 75', mouth:'M155 90 Q170 103 184 87'},
  {name:'sad', eyes:'M151 73 L151 77 M181 71 L182 75', mouth:'M155 97 Q168 81 184 96'},
  {name:'surprised', eyes:'M151 71 L151 77 M181 69 L182 75', mouth:'M166 88 C157 88 157 102 167 102 C177 102 177 87 166 88Z'},
  {name:'sleepy', eyes:'M145 76 Q152 80 158 74 M176 74 Q182 78 188 72', mouth:'M160 94 L177 95'},
  {name:'cheeky', eyes:'M146 75 L157 75 M181 71 L182 75', mouth:'M155 89 Q168 102 184 86 M170 96 Q172 108 178 95'}
];
let moodIndex=0;
function renderMood(){const mood=moods[moodIndex];$('face-eyes').setAttribute('d',mood.eyes);$('face-mouth').setAttribute('d',mood.mouth);$('face-target').setAttribute('aria-label',`Change mood: currently ${mood.name}`);}
function changeMood(){moodIndex=(moodIndex+1)%moods.length;renderMood();}
$('face-target').onclick=changeMood;
$('face-target').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();changeMood();}};
function openUpload(){if(!db){toast('Storage is not ready. Please reload.');return;}if(!dialog.open)dialog.showModal();}
$('category').onchange=()=>{$('shoe-mode-field').hidden=$('category').value!=='shoes';updateUploadPreview();};
$('shoe-mode').onchange=updateUploadPreview;
document.querySelectorAll('[data-shoe-edit]').forEach(button=>button.onclick=async()=>{
  if(!draftShoePhotos||previewBusy||processing)return;previewBusy=true;$('save-piece').disabled=true;
  try{const index=Number(button.dataset.shoeEdit);draftShoePhotos[index]=await transformShoe(draftShoePhotos[index],button.dataset.action);$(index===0?'shoe-preview-left':'shoe-preview-right').src=draftShoePhotos[index];}
  finally{previewBusy=false;$('save-piece').disabled=false;}
});
$('original-toggle').onclick=async()=>{
  if(processing||!originalPhoto)return;
  usingOriginal=!usingOriginal;processedPhoto=usingOriginal?originalPhoto:cutoutPhoto;
  $('original-toggle').textContent=usingOriginal?'Use background-removed photo':'Use original photo (keep background)';
  await updateUploadPreview();$('form-error').textContent=usingOriginal?'Full photo preserved, including its background.':'Background-removed photo selected.';
};

async function updateUploadPreview(){
  if(!processedPhoto)return;
  const version=++previewVersion;previewBusy=true;$('save-piece').disabled=true;
  try{
    let photo=processedPhoto;
    if($('category').value==='shoes'){
      const measured=await measureWaist({photo,category:'shoes',shoeMode:$('shoe-mode').value});
      if(version!==previewVersion)return;
      draftShoePhotos=measured?.shoes||[photo,photo];
      $('shoe-preview-left').src=draftShoePhotos[0];$('shoe-preview-right').src=draftShoePhotos[1];
      $('shoe-preview-controls').hidden=false;$('shoe-preview').hidden=false;$('photo-preview').hidden=true;$('upload-preview').hidden=true;
      $('form-error').textContent=$('shoe-mode').value==='pair'?'Pair split into two shoes. Ready to add.':'One shoe prepared for each foot. Ready to add.';

    }
    if(version===previewVersion&&$('category').value!=='shoes'){draftShoePhotos=null;$('shoe-preview-controls').hidden=true;$('shoe-preview').hidden=true;$('photo-preview').src=photo;$('photo-preview').hidden=false;$('upload-preview').hidden=true;}
  }catch{if(version===previewVersion)$('photo-preview').src=processedPhoto;}
  finally{if(version===previewVersion){previewBusy=false;$('save-piece').disabled=processing;}}
}
$('add-top').onclick=openUpload;$('close-dialog').onclick=()=>dialog.close();
async function cropCutout(blob){
  const image=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(maxX<0)throw new Error('Could not find clothing in this photo. Try a clearer photo.');
  const w=maxX-minX+1,h=maxY-minY+1,scale=Math.min(1,1000/Math.max(w,h));const out=document.createElement('canvas');out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));out.getContext('2d').drawImage(canvas,minX,minY,w,h,0,0,out.width,out.height);return out.toDataURL('image/png');
}
$('photo').onchange=async()=>{
  const version=++photoVersion;const file=$('photo').files[0];processedPhoto=null;originalPhoto=null;cutoutPhoto=null;usingOriginal=false;draftShoePhotos=null;$('shoe-preview-controls').hidden=true;$('shoe-preview').hidden=true;$('original-toggle').hidden=true;$('form-error').textContent='';$('photo-preview').hidden=true;$('upload-preview').hidden=false;
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){$('form-error').textContent='Choose a JPG, PNG or WebP under 15 MB.';$('photo').value='';return;}
  processing=true;$('save-piece').disabled=true;$('save-piece').textContent='Removing background…';$('photo').disabled=true;$('upload-preview').textContent='Removing background on your device…';
  try{
    if(!$('piece-name').value)$('piece-name').value=file.name.replace(/\.[^.]+$/,'').slice(0,60);
    // Downsize before inference to keep memory use reasonable on phones.
    const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const input=document.createElement('canvas');input.width=Math.round(bitmap.width*scale);input.height=Math.round(bitmap.height*scale);input.getContext('2d').drawImage(bitmap,0,0,input.width,input.height);bitmap.close();originalPhoto=input.toDataURL('image/png');const blob=await new Promise(resolve=>input.toBlob(resolve,'image/png'));
    const cutout=await removeBackground(blob,{model:'isnet_fp16',device:'cpu',output:{format:'image/png',type:'foreground'},progress:(key,loaded,total)=>{if(version!==photoVersion)return;if(key.startsWith('fetch:'))$('upload-preview').textContent=`Preparing background remover… ${total?Math.round(loaded/total*100):0}%\nFirst use downloads the model; your photo stays here.`;else $('upload-preview').textContent='Removing background on your device…';}});
    const photo=await cropCutout(cutout);if(version!==photoVersion)return;processedPhoto=photo;cutoutPhoto=photo;$('original-toggle').hidden=false;$('original-toggle').textContent='Use original photo (keep background)';await updateUploadPreview();if($('category').value!=='shoes')$('form-error').textContent='Background removed. Ready to add.';
  }catch(error){if(version===photoVersion){$('photo').value='';$('upload-preview').textContent='Choose a photo to try again';$('form-error').textContent='Background removal failed. Check your internet for the first model download, then select the photo again.';console.error(error);}}
  finally{if(version===photoVersion){processing=false;$('save-piece').disabled=previewBusy;$('save-piece').textContent='Add to wardrobe';$('photo').disabled=false;}}
};
$('upload-form').onsubmit=async e=>{e.preventDefault();if(processing||previewBusy)return;if(!processedPhoto){$('form-error').textContent='Choose a photo and wait for background removal first.';return;}const name=$('piece-name').value.trim();if(!name){$('form-error').textContent='Please name this piece.';return;}const item={id:crypto.randomUUID(),name,category:$('category').value,photo:processedPhoto,originalPhoto,...($('category').value==='shoes'?{shoeMode:$('shoe-mode').value,shoePhotos:draftShoePhotos}:{})};$('save-piece').disabled=true;try{await transaction('readwrite',s=>s.put(item));clothes.push(item);selected[item.category]=item.id;render();dialog.close();$('upload-form').reset();$('shoe-mode-field').hidden=true;processedPhoto=null;originalPhoto=null;cutoutPhoto=null;usingOriginal=false;draftShoePhotos=null;$('shoe-preview-controls').hidden=true;$('shoe-preview').hidden=true;$('original-toggle').hidden=true;$('photo-preview').hidden=true;$('upload-preview').hidden=false;$('upload-preview').textContent='＋ Choose a clothing photo';$('form-error').textContent='';toast('Added to your wardrobe.');}catch{$('form-error').textContent='Could not save. Your browser storage may be full. Please free some browser storage and try again.';}finally{$('save-piece').disabled=false;}};
init();
