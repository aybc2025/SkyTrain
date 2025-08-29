// Service Worker לאפליקציית מפת סקייטריין ונקובר לילדים
// גרסה 1.0 - אוגוסט 2025

const CACHE_NAME = 'skytrain-kids-v1.0';
const OFFLINE_CACHE_NAME = 'skytrain-offline-v1.0';

// קבצים לשמירה במטמון
const STATIC_CACHE_FILES = [
  './',
  './index.html',
  './map.html', 
  './calculator.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  // Tailwind CSS מCDN
  'https://cdn.tailwindcss.com',
  // גופנים מערכת
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// נתונים שמורים לשימוש offline
const OFFLINE_DATA = {
  message: 'האפליקציה פועלת במצב לא מקוון',
  routes: 'נתוני הקווים והתחנות זמינים',
  calculator: 'מחשבון המסלולים זמין'
};

// התקנת Service Worker
self.addEventListener('install', event => {
  console.log('🚇 Service Worker: התקנה החלה');
  
  event.waitUntil(
    Promise.all([
      // מטמון סטטי
      caches.open(CACHE_NAME).then(cache => {
        console.log('📦 Service Worker: שומר קבצים במטמון');
        return cache.addAll(STATIC_CACHE_FILES.filter(url => 
          !url.startsWith('http') // רק קבצים מקומיים בשלב זה
        ));
      }),
      // מטמון offline
      caches.open(OFFLINE_CACHE_NAME).then(cache => {
        console.log('💾 Service Worker: מכין נתונים לשימוש offline');
        return cache.put(
          new Request('/offline-data'),
          new Response(JSON.stringify(OFFLINE_DATA), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      })
    ]).then(() => {
      console.log('✅ Service Worker: התקנה הושלמה');
      self.skipWaiting(); // אקטיבציה מיידית
    })
  );
});

// אקטיבציה של Service Worker
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: אקטיבציה החלה');
  
  event.waitUntil(
    Promise.all([
      // ניקוי מטמון ישן
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE_NAME) {
              console.log('🗑️ Service Worker: מוחק מטמון ישן:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // השתלטות על כל הלקוחות
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker: אקטיבציה הושלמה');
    })
  );
});

// טיפול בבקשות רשת
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // דלג על בקשות שאינן GET
  if (request.method !== 'GET') {
    return;
  }
  
  // דלג על בקשות Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  event.respondWith(
    handleRequest(request)
  );
});

// פונקציה מרכזית לטיפול בבקשות
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // אסטרטגיה לפי סוג הקובץ
    
    // 1. קבצים סטטיים - Cache First
    if (isStaticFile(url)) {
      return await cacheFirst(request);
    }
    
    // 2. CDN (Tailwind) - Stale While Revalidate  
    if (isCDNResource(url)) {
      return await staleWhileRevalidate(request);
    }
    
    // 3. דפי HTML - Network First
    if (isHTMLPage(url)) {
      return await networkFirst(request);
    }
    
    // 4. ברירת מחדל - Cache First
    return await cacheFirst(request);
    
  } catch (error) {
    console.error('❌ Service Worker: שגיאה בטיפול בבקשה:', error);
    return await getOfflineResponse(request);
  }
}

// אסטרטגיית Cache First (מטמון קודם)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('📦 Service Worker: מוחזר מהמטמון:', request.url);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('🌐 Service Worker: נשמר במטמון:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    return await getOfflineResponse(request);
  }
}

// אסטרטגיית Network First (רשת קודם)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('🌐 Service Worker: עודכן במטמון:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('📦 Service Worker: רשת לא זמינה, מחפש במטמון:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return await getOfflineResponse(request);
  }
}

// אסטרטגיית Stale While Revalidate (ישן תוך עדכון)
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  // עדכון ברקע (אל תחכה לתוצאה)
  const networkResponsePromise = fetch(request).then(response => {
    if (response.ok) {
      const cache = caches.open(CACHE_NAME);
      cache.then(c => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => {
    // אם הרשת נכשלת, אל תעשה כלום
  });
  
  // החזר מהמטמון אם יש, אחרת חכה לרשת
  return cachedResponse || networkResponsePromise || await getOfflineResponse(request);
}

// תגובה למצב offline
async function getOfflineResponse(request) {
  const url = new URL(request.url);
  
  // אם זה דף HTML, החזר דף offline מותאם אישית
  if (isHTMLPage(url)) {
    return new Response(getOfflineHTML(), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
  
  // אם זה JSON או נתונים, החזר נתונים offline
  if (request.headers.get('Accept')?.includes('application/json')) {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const offlineData = await cache.match('/offline-data');
    if (offlineData) {
      return offlineData;
    }
  }
  
  // ברירת מחדל - תגובת 503
  return new Response('השירות אינו זמין כרגע', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

// פונקציות עזר לזיהוי סוגי קבצים
function isStaticFile(url) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.pathname.includes(ext)) ||
         url.pathname.includes('/icons/') ||
         url.pathname === '/manifest.webmanifest';
}

function isCDNResource(url) {
  return url.hostname === 'cdn.tailwindcss.com' ||
         url.hostname === 'fonts.googleapis.com' ||
         url.hostname === 'fonts.gstatic.com';
}

function isHTMLPage(url) {
  return url.pathname.endsWith('.html') || 
         url.pathname === '/' ||
         !url.pathname.includes('.');
}

// HTML למצב offline
function getOfflineHTML() {
  return `
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>מצב לא מקוון - מפת סקייטריין ילדים</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial}
    .pulse{animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1} 50%{opacity:0.5}}
  </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <div class="text-6xl mb-6 pulse">🚇</div>
    
    <h1 class="text-2xl font-bold text-gray-800 mb-4">
      פועל במצב לא מקוון
    </h1>
    
    <p class="text-gray-600 mb-6">
      האפליקציה עובדת גם בלי אינטרנט! כל המפות והמחשבון זמינים.
    </p>
    
    <div class="space-y-4">
      <div class="bg-green-50 border-2 border-green-200 rounded-lg p-4">
        <div class="flex items-center justify-center gap-3">
          <span class="text-green-600">✅</span>
          <span class="font-medium text-green-800">המפה האינטראקטיבית זמינה</span>
        </div>
      </div>
      
      <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div class="flex items-center justify-center gap-3">
          <span class="text-blue-600">✅</span>
          <span class="font-medium text-blue-800">מחשבון המסלולים זמין</span>
        </div>
      </div>
      
      <div class="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
        <div class="flex items-center justify-center gap-3">
          <span class="text-yellow-600">✅</span>
          <span class="font-medium text-yellow-800">כל נתוני התחנות זמינים</span>
        </div>
      </div>
    </div>
    
    <div class="mt-8 space-y-3">
      <button onclick="window.location.href='./index.html'" 
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
        🏠 חזרה לעמוד הראשי
      </button>
      
      <button onclick="window.location.reload()" 
              class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors">
        🔄 נסה שוב
      </button>
    </div>
    
    <div class="mt-6 text-xs text-gray-500">
      💡 כשהאינטרנט יחזור, האפליקציה תתעדכן אוטומטית
    </div>
  </div>
</body>
</html>`;
}

// טיפול בהודעות מהדף הראשי
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({
        version: CACHE_NAME,
        offline: !navigator.onLine
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(cacheNames => {
        return Promise.all(cacheNames.map(name => caches.delete(name)));
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    default:
      console.log('📨 Service Worker: הודעה לא מוכרת:', type);
  }
});

// דיווח על מצב האפליקציה
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Service Worker: סנכרון ברקע');
  }
});

console.log('🚇 Service Worker: נטען בהצלחה - מפת סקייטריין ונקובר לילדים');
