// Service Worker minimalista para interapp.
//
// Objetivo: que la pantalla del guardia siga abierta y usable si se cae
// Internet. El service worker cachea el shell HTML y los assets estáticos.
// Los datos (padrón, cola de eventos) se manejan desde la app en IndexedDB.

const CACHE_NAME = "interapp-v1";
const SHELL = ["/", "/guard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let data = { title: "interapp", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "interapp-notification",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.endsWith(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Para navegaciones (HTML): network-first con fallback a cache. Asegura que
  // si hay Internet, ven la última versión; si no, ven el shell cacheado.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const guardCached = await caches.match("/guard");
          if (guardCached) return guardCached;
          return new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain" } });
        }),
    );
    return;
  }

  // Estáticos (JS/CSS/imágenes/font): cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return resp;
        });
      }),
    );
  }
});
