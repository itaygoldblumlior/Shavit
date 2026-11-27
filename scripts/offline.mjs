import fs from 'node:fs';
import crypto from 'node:crypto';
const paths = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (e.name !== 'sw.js') paths.push('/' + p.slice(5));
  }
}
walk('dist');
const version = crypto
  .createHash('sha256')
  .update(paths.map((p) => fs.readFileSync('dist' + p)).join(''))
  .digest('hex')
  .slice(0, 12);
fs.writeFileSync(
  'dist/sw.js',
  `const CACHE='shavit-helper-${version}',FILES=${JSON.stringify(paths)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('shavit-helper-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('/index.html'):Response.error()))))});`,
);
