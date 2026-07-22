const CACHE_NAME = 'casagracia-v3';
const STATIC_SHELL = ['/manifest.json', '/favicon.ico', '/pwa/icon-192.png', '/pwa/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Los bundles de Expo llevan hash de contenido en el nombre (_expo/static/...): un
// cambio de contenido es una URL nueva, así que cache-first ahí es seguro y rápido.
// El HTML/navegación en cambio NO lleva hash — cachearlo agresivamente deja la PWA
// instalada apuntando para siempre a bundles de un deploy viejo que ya no existen
// (404) y la app nunca hidrata. Por eso navegación y HTML van siempre network-first.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isHashedAsset = url.pathname.startsWith('/_expo/static/');
  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Solo cachear navegaciones sanas: un 404/500 de un deploy a medias
          // quedaría como fallback offline permanente.
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        // respondWith exige una Response: si tampoco hay caché, un error de red
        // explícito en vez de resolver a undefined (que lanza TypeError).
        .catch(() => cached ?? Response.error());
      return cached || network;
    })
  );
});
