import {preparePlatform} from './native-platform.js';
try {
  await preparePlatform();
  await import('./app.js');
} catch(error) {
  console.error('Shavit could not start',error);
  const notice=document.createElement('p');
  notice.textContent='Shavit could not open your saved data. Close and reopen the app to try again. Your data has not been reset.';
  notice.setAttribute('role','alert');
  notice.style.cssText='padding:24px;font:16px/1.5 system-ui';
  document.body.prepend(notice);
}
