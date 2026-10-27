import {Capacitor} from '@capacitor/core';
import {Preferences} from '@capacitor/preferences';
const key='shavit-helper-v1';let db;
export const sandbox=import.meta.env.DEV&&new URLSearchParams(location.search).has('sandbox');
if(sandbox)document.documentElement.classList.add('qa-sandbox');
export const isNative=Capacitor.isNativePlatform();
export async function loadState(){
 if(isNative){const {value}=await Preferences.get({key});return value?JSON.parse(value):null;}
 db=await new Promise((resolve,reject)=>{const req=indexedDB.open(sandbox?'shavit-helper-disposable-qa':'shavit-helper',1);req.onupgradeneeded=()=>req.result.createObjectStore('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 return new Promise((resolve,reject)=>{const req=db.transaction('state').objectStore('state').get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});
}
let queue=Promise.resolve();
export function saveState(state){const copy=structuredClone(state);const work=()=>isNative?Preferences.set({key,value:JSON.stringify(copy)}):new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(copy,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});const result=queue.catch(()=>{}).then(work);queue=result;return result;}
