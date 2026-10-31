import {heroView} from './hero-view.js';
import {howView} from './how-view.js';
const face=`<img class="face" src="/helper-icon.svg" alt="Shavit’s smiling face">`;
const howPage=/how-it-works(?:\.html)?\/?$/.test(location.pathname);
document.getElementById('app').innerHTML=howPage?howView(face):heroView(face,false);
if(!howPage){
document.querySelector('.welcome').classList.add('welcome-motion');
document.querySelector('.welcome-how').remove();
const howLink=document.querySelector('.welcome-how-link');howLink.href='/how-it-works.html';howLink.textContent='A little look at how it works →';
const cta=document.getElementById('get-started');cta.outerHTML='<div class="app-coming"><span class="pill">iPHONE APP IN DEVELOPMENT</span><p>Your cool friend is moving to the app.</p><a class="text-button" href="mailto:itay200855@gmail.com?subject=Shavit%20app">Questions? Say hello ↗</a></div>';
document.querySelector('.welcome-reassurance').textContent='Private by design. Your routine stays on your device.';
document.querySelector('.welcome-footer').insertAdjacentHTML('beforeend','<button class="text-button" id="old-backup">Export my previous website data</button>');
document.getElementById('old-backup').onclick=async()=>{const button=document.getElementById('old-backup');try{const {loadState}=await import('./helper-store.js');const state=await loadState();if(!state){button.textContent='No saved website data on this browser';return;}const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='shavit-website-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{button.textContent='Could not export. Please try again.';}};
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
