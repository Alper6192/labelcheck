const CACHE_NAME = "labelcheck-shell-v0.2.3";
const APP_SHELL = ["./", "./editor.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const pathname = new URL(request.url).pathname;
  if (pathname.includes("/models/") || pathname.includes("/config/")) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (!response || response.status !== 200 || response.type === "opaque") return response;
    const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); return response;
  })));
});
