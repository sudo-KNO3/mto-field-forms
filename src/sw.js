// Offline support: pre-cache the app shell, then serve from cache and refresh
// in the background (stale-while-revalidate). A new deploy reaches the phone
// on the next launch after it has been online once.
// Bump CACHE when the file list changes.

const CACHE = 'mto-forms-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/docx.js',
  'js/export.js',
  'js/fields.js',
  'js/forms.js',
  'js/geo.js',
  'geology/geology.json',
  'geology/units.bin',
  'templates/salt.json',
  'templates/precon.json',
  'icons/logo.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// The geology map tiles are listed in geology.json; cache them all so the map works offline.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const meta = await (await cache.match('geology/geology.json')).json();
  await cache.addAll(meta.tiles.present.map((t) => `geology/tiles/${t}.jpg`));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    if (cached) { e.waitUntil(network); return cached; }
    return network;
  }));
});
