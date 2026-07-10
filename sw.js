/* OpenField Service Worker — v3.0.0
   REGOLA: bumpare VERSION a ogni modifica di index.html, sw.js o manifest.json.
   Cambiare VERSION cambia il nome cache → activate cancella tutte le vecchie. */
const VERSION = 'v3.1.0';
const CACHE = 'openfield-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
    /* Niente skipWaiting() qui: il nuovo SW resta in "waiting" finché l'app
       non lo autorizza, così non si sostituisce mentre il tecnico compila. */
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Unico comando che la pagina non puo' eseguire da se' */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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

  /* version.json: MAI dalla cache. E' il segnale di "esiste una versione nuova".
     Se lo cachiamo, l'app non scopre mai di essere vecchia. */
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => offline()));
    return;
  }

  /* casi.json: rete per prima, cache solo come rete di sicurezza offline.
     La chiave di cache ignora la querystring ?v=... del cache-bust,
     altrimenti la cache si riempie di una copia per ogni timestamp. */
  if (url.pathname.endsWith('casi.json')) {
    e.respondWith((async () => {
      const key = url.origin + url.pathname;
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch {
        return (await caches.match(key)) || offline();
      }
    })());
    return;
  }

  /* Navigazione e app shell: rete per prima */
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
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

  /* Tutto il resto: cache per prima */
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
