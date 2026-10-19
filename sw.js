/* Service Worker — Dashboard offline verfügbar halten.
   Bei jeder Änderung an den Dateien CACHE hochzählen. */
const CACHE = 'dashboard-v2';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

/* Nur diese Adressen fasst der Worker an. Alle Deine Apps liegen auf derselben
   Domain: Icons anderer Apps, die das Dashboard als Kachelbild lädt, sind
   „same origin“ und kämen sonst hier vorbei und landeten im Cache. */
const OWN = new Set(ASSETS.map((u) => new URL(u, self.location).href));

self.addEventListener('install', (e) => {
  // cache:'reload' erzwingt frische Dateien vom Server. Ohne das würden sie aus
  // dem HTTP-Cache des Browsers geholt (GitHub Pages sendet max-age=600) — der
  // neue Cache enthielte dann die alte Version.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Nur eigene alte Caches löschen: Der Cache-Speicher gehört der ganzen Domain,
  // die anderen Apps auf <name>.github.io legen ihre Caches daneben ab.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('dashboard-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache zuerst, im Hintergrund auffrischen (stale-while-revalidate): die App
   startet sofort aus dem Cache, auch offline, und die nächste Öffnung hat den
   neuen Stand. Seitenaufrufe mit Query (z. B. ?source=pwa) bekommen die
   gecachte Startseite. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = ''; url.hash = '';
  /* Nur die eigenen Dateien, Query weg (start_url kann ?source=… tragen).
     Bewusst KEIN „jeder Seitenaufruf im Scope ist die Startseite“: eine
     andere App in einem Unterordner (…/dashboard/vorschau/) bekäme sonst
     beim ersten Aufruf die index.html des Dashboards. */
  const key = url.href;
  if (!OWN.has(key)) return;              // fremde Adressen: der Browser macht das selbst

  e.respondWith(
    caches.open(CACHE).then((c) => c.match(key).then((hit) => {
      const net = fetch(req).then((res) => {
        // Umgeleitete Antworten nicht cachen: Chrome lehnt sie für Seitenaufrufe ab
        if (res && res.ok && !res.redirected) c.put(key, res.clone());
        return res;
      });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }))
  );
});
