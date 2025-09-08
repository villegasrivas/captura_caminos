const CACHE = 'captura-v8';
const ASSETS = [
  './',
  './index.html',
  './mapa_v6.html',  // <-- tu HTML real
  './captura_app_v6.js',              // <-- tu JS real
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // App shell: cache-first
  if (ASSETS.some(p => url.pathname.endsWith(p.replace('./','/')))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // Resto: network-first
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});








