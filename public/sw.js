self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through for online-only apps
  event.respondWith(fetch(event.request));
});
