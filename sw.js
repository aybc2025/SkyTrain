// sw.js
const CACHE_NAME = 'skytrain-cache-v3';
const ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-maskable.svg'
  // הוסף כאן גם schema.png אם הוספת תמונה למעלה בעמוד:
  // 'schema.png'
];

// התקנה — נקלט כל פריט בנפרד כדי ש-404 לא יפיל את ההתקנה
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
      } catch (e) {
        // מתעלמים מפריטים שנכשלו כדי לא להפיל את ההתקנה
        // console.warn('Skip caching:', url, e);
      }
    }));
  })());
  self.skipWaiting();
});

// אקטיבציה — ניקוי קאש ישן
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)));
  })());
  self.clients.claim();
});

// Cache-first; ניווטים נופלים ל-index.html (SPA-like)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ניווטי דף: fallback ל-index.html אם אופליין
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        return net;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('index.html');
        return cachedIndex || Response.error();
      }
    })());
    return;
  }

  // שאר הבקשות: cache-first, נפילה לרשת, ואז שמירה בקאש ממקור מקומי בלבד
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const url = new URL(req.url);
      if (url.origin === location.origin) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});
