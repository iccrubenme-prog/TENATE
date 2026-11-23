// Service Worker - Logística TENATE
// - Archivos propios (index.html, etc.): primero la red (así siempre llega la versión nueva y el aviso
//   "Nueva versión disponible" funciona); si no hay red, se usa la copia guardada.
// - Librerías externas (Leaflet) y mapa (tiles): se guardan al usarse y se sirven desde el teléfono.
// - Google Sheets/Apps Script y rutas (OSRM): nunca se guardan.
const VERSION = "tenate-pwa-1";
const SHELL = "shell-" + VERSION;
const LIBS = "libs-" + VERSION;
const TILES = "tiles-" + VERSION;
const MAX_TILES = 600;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"].map(u => new Request(u, { cache: "reload" }))).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== LIBS && k !== TILES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function recortar(c) {
  const ks = await c.keys();
  if (ks.length > MAX_TILES) await Promise.all(ks.slice(0, ks.length - MAX_TILES).map(k => c.delete(k)));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const host = url.hostname;

  // Backend y rutas: directo a la red, sin caché
  if (host.indexOf("script.google") !== -1 || host.indexOf("googleusercontent") !== -1 || host.indexOf("project-osrm") !== -1) return;

  // Mapa: caché primero, si no, red y se guarda
  if (host.indexOf("tile.openstreetmap.org") !== -1 || host.indexOf("cartocdn.com") !== -1) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === "opaque")) { c.put(req, r.clone()); recortar(c); }
        return r;
      } catch (err) { return new Response("", { status: 504 }); }
    }));
    return;
  }

  // Librerías externas (Leaflet, etc.): caché primero
  if (url.origin !== location.origin) {
    e.respondWith(caches.open(LIBS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
        return r;
      } catch (err) { return new Response("", { status: 504 }); }
    }));
    return;
  }

  // Archivos propios: red primero; sin red, la copia guardada
  e.respondWith(caches.open(SHELL).then(async c => {
    try {
      const r = await fetch(req);
      if (r && r.ok && !url.search) c.put(req.mode === "navigate" ? "index.html" : req, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(req.mode === "navigate" ? "index.html" : req, { ignoreSearch: true });
      return hit || new Response("Sin conexión. Vuelve a intentar.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }));
});
