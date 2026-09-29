/* Genograma Free — modo sin conexión.
 * - Páginas (HTML): red primero; si no hay internet, la última copia guardada.
 * - Archivos /assets/* (llevan hash en el nombre): caché primero.
 * - Tipografías de Google: usa la copia guardada y la refresca en segundo plano.
 * Los datos del genograma viven en localStorage, así que ya funcionan sin conexión.
 */
const CACHE = "genograma-free-v1";
const PAGES = ["/", "/guia-genograma"];
const ASSET_RE = /\/assets\/[\w.-]+\.(?:js|css)/g;

const key = (url) => new URL(url, self.location.origin).pathname;

async function cacheAssetsOf(html) {
  const cache = await caches.open(CACHE);
  const files = new Set(html.match(ASSET_RE) ?? []);
  await Promise.all(
    [...files].map(async (f) => {
      if (await cache.match(f)) return;
      try {
        const res = await fetch(f);
        if (res.ok) await cache.put(f, res);
      } catch {
        /* sin conexión: se intenta la próxima vez */
      }
    }),
  );
}

async function cachePage(path) {
  const res = await fetch(path, { cache: "no-store", headers: { Accept: "text/html" } });
  if (!res.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(path, res.clone());
  await cacheAssetsOf(await res.text());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(PAGES.map((p) => cachePage(p).catch(() => {}))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // la generación con IA (POST) siempre va a la red
  const url = new URL(req.url);

  // Tipografías de Google
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? fresh;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Archivos con hash: no cambian nunca con el mismo nombre
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Páginas
  const wantsHtml = req.mode === "navigate" || (req.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
            cache.put(key(req.url), res.clone());
            res.clone().text().then(cacheAssetsOf);
          }
          return res;
        } catch {
          return (
            (await cache.match(key(req.url))) ??
            (await cache.match("/")) ??
            new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
          );
        }
      })(),
    );
  }
});
