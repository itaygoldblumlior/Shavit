import { heroView } from './hero-view.js';
import { howView } from './how-view.js';
const face = `<img class="face" src="/helper-icon.svg" alt="Shavit’s smiling face">`;
const howPage = /how-it-works(?:\.html)?\/?$/.test(location.pathname);
document.getElementById('app').innerHTML = howPage ? howView(face) : heroView(face, false);
if (!howPage) {
  document.querySelector('.welcome').classList.add('welcome-motion');
  document.querySelector('.welcome-how').remove();
  const howLink = document.querySelector('.welcome-how-link');
  howLink.href = '/how-it-works.html';
  howLink.textContent = 'A little look at how it works →';
  document.getElementById('get-started').onclick = () => (location.href = '/');
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
