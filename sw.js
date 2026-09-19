// Service worker minimal — cuma buat memenuhi syarat "installable PWA".
// Tidak ada tracking, iklan, atau push notification pihak ketiga.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through biasa, tidak melakukan caching khusus.
  event.respondWith(fetch(event.request));
});