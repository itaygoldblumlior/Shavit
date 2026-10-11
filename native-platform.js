import {Capacitor} from '@capacitor/core';
import {Preferences} from '@capacitor/preferences';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {Camera,MediaTypeSelection,MediaType} from '@capacitor/camera';
import {Browser} from '@capacitor/browser';
import {App} from '@capacitor/app';
import {createNativeWardrobe} from './native-storage.js';
export const nativeApp = Capacitor.isNativePlatform();
const preferences = new Map();
let preferenceQueue = Promise.resolve();
export async function preparePlatform() {
  if(!nativeApp)return;
  const {keys} = await Preferences.keys();
  for(const key of keys.filter(key=>key.startsWith('shavit-') && key!=='shavit-wardrobe-manifest')) {
    const {value} = await Preferences.get({key});
    if(value!==null)preferences.set(key,value);
  }
  document.documentElement.classList.add('native-app');
}
export function readPreference(key,fallback) {
  try {return JSON.parse(nativeApp?preferences.get(key):localStorage.getItem(key))??fallback;}catch{return fallback;}
}
export function writePreference(key,value) {
  const data = JSON.stringify(value);
  if(!nativeApp){localStorage.setItem(key,data);return;}
  preferences.set(key,data);
  preferenceQueue = preferenceQueue.catch(()=>{}).then(()=>Preferences.set({key,value:data}));
  preferenceQueue.catch(()=>window.dispatchEvent(new Event('shavit-storage-error')));
}
export const flushPreferences = () => preferenceQueue;
export async function openNativeWardrobe() {
  const store = createNativeWardrobe({
    uuid:()=>crypto.randomUUID(),
    readManifest:async()=>{const {value}=await Preferences.get({key:'shavit-wardrobe-manifest'});return value===null?null:JSON.parse(value);},
    writeManifest:manifest=>Preferences.set({key:'shavit-wardrobe-manifest',value:JSON.stringify(manifest)}),
    readFile:async path=>(await Filesystem.readFile({path,directory:Directory.Data,encoding:Encoding.UTF8})).data,
    writeFile:(path,data)=>Filesystem.writeFile({path,data,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true}),
    deleteFile:path=>Filesystem.deleteFile({path,directory:Directory.Data})
  });
  await store.open();
  return store;
}
export async function pickClothingPhoto(source) {
  const options={quality:90,targetWidth:1600,targetHeight:1600,correctOrientation:true};
  const media=source==='camera'?await Camera.takePhoto({...options,saveToGallery:false}):(await Camera.chooseFromGallery({...options,allowMultipleSelection:false})).results[0];
  return clothingFileFromMedia(media);
}
export async function pickFitVideo(source) {
  if(source==='photo')return pickClothingPhoto('gallery');
  const media=source==='camera'?await Camera.recordVideo({saveToGallery:false,isPersistent:false}):(await Camera.chooseFromGallery({mediaType:MediaTypeSelection.Video,allowMultipleSelection:false,isPersistent:false})).results[0];
  if(!media)return null;
  const response=await fetch(media.webPath||Capacitor.convertFileSrc(media.uri));
  if(!response.ok)throw new Error('Could not read your video');
  const blob=await response.blob();
  if(blob.size>150*1024*1024)throw new Error('Choose a video under 150 MB');
  return new File([blob],'fit-video.mov',{type:blob.type||'video/quicktime'});
}
async function clothingFileFromMedia(media){
  if(!media)return null;
  const uri=media.webPath||Capacitor.convertFileSrc(media.uri);
  const response=await fetch(uri);
  if(!response.ok)throw new Error('Could not read your photo');
  const blob=await response.blob();
  return new File([blob],'clothing.jpg',{type:blob.type.startsWith('image/')?blob.type:'image/jpeg'});
}
export async function shareBackup(backup) {
  await flushPreferences();
  const path='shavit-wardrobe.json';
  await Filesystem.writeFile({path,data:JSON.stringify(backup),directory:Directory.Cache,encoding:Encoding.UTF8});
  const {uri}=await Filesystem.getUri({path,directory:Directory.Cache});
  await Share.share({title:'Shavit wardrobe backup',files:[uri],dialogTitle:'Save or share your wardrobe backup'});
}
export function installNativeNavigation(onBack,onRestoredPhoto) {
  if(!nativeApp)return;
  App.addListener('backButton',()=>{if(onBack()===false)App.minimizeApp();});
  App.addListener('appRestoredResult',async result=>{if(result.pluginId!=='Camera'||!result.success||!['takePhoto','chooseFromGallery'].includes(result.methodName))return;try{const media=result.methodName==='chooseFromGallery'?result.data?.results?.[0]:result.data;if(media?.type===MediaType.Video)return;const file=await clothingFileFromMedia(media);if(file)await onRestoredPhoto(file);}catch{window.dispatchEvent(new Event('shavit-photo-error'));}});
  App.addListener('appStateChange',({isActive})=>{if(!isActive)flushPreferences().catch(()=>{});});
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link || !/^https:\/\//.test(link.href))return;
    event.preventDefault();
    Browser.open({url:link.href}).catch(()=>window.dispatchEvent(new Event('shavit-link-error')));
  });
}
