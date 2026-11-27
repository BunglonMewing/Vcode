const VERSION = 'v4';
const CACHE = `codevideo-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './render.js',
  './gallery.js',
  './templates.js',
  './compiler.js',
  './remotion.js',
  './ai.js',
  './ai-page.js',
  './docs.md',
  './skills/index.json',
  './skills/remotion.md',
  './skills/remotion-timing.md',
  './skills/remotion-layout.md',
  './skills/remotion-scenes.md',
  './skills/canvas-2d.md',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Video API, AI proxy, and rendered files always come from the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/output/')) return;

  // Fonts and the mp4 muxer come from a CDN: cache them after the first load.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => hit))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
  );
});
