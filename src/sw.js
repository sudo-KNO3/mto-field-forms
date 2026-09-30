// Offline support: pre-cache the app shell and the geology map. With signal the latest
// version is loaded; without signal the cached copy is used.
// Bump CACHE when the file list changes.

const CACHE = 'mto-forms-v4';
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

// App code and data: network first (so a new version is used on the first open with signal),
// falling back to the cache when offline or the network is slow. Map tiles and icons never
// change between versions, so they come straight from the cache.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const key = req.mode === 'navigate' ? 'index.html' : req;
  const staticAsset = /\/(geology\/tiles|icons)\//.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (staticAsset && cached) return cached;
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    if (!cached) return network;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => cached), timeout]);
  }));
});
