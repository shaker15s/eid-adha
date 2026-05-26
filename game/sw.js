const CACHE_NAME = 'royal-ram-v3.1-20260526';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './favicon.svg',
  './manifest.json',
  './js/app.js',
  './js/audio.js',
  './js/characters.js',
  './js/controller.js',
  './js/loader.js',
  './js/scene.js',
  './js/victory.js',
  './js/world.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    ))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      return cachedResponse || fetch(e.request);
    })
  );
});
