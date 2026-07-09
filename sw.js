const VERSION = 'v2.0.0';
const CACHE = 'openfield-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const offline = () => new Response('Offline', {
  status: 503,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // casi.json: sempre la versione più fresca, cache solo come rete di sicurezza
  if (url.pathname.endsWith('casi.json')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) || offline();
      }
    })());
    return;
  }

  // Navigazione e app shell: rete per prima, così gli aggiornamenti arrivano
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req))
            || (await caches.match('./index.html'))
            || (await caches.match('./'))
            || offline();
      }
    })());
    return;
  }

  // Tutto il resto: cache per prima
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && url.origin === self.location.origin) {
        (await caches.open(CACHE)).put(req, res.clone());
      }
      return res;
    } catch {
      return offline();
    }
  })());
});
