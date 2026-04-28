const CACHE_VERSION = '1.0.0'; // Updated via build/deploy or sync
const SHELL_CACHE = 'aiplex-shell-v1';
const APP_CACHE = 'aiplex-apps-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== SHELL_CACHE && cacheName !== APP_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

async function checkVersion() {
  try {
    const res = await fetch('https://gemmai-default-rtdb.firebaseio.com/config/sw_version.json');
    if (res.ok) {
      const remoteVersion = await res.json();
      if (remoteVersion && remoteVersion !== CACHE_VERSION) {
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'UPDATE_AVAILABLE', version: remoteVersion });
        });
      }
    }
  } catch (err) {
    console.error("SW version check failed:", err);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // App cache via a fake API URL or general strategy
  if (url.pathname.startsWith('/api/local-app/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || new Response('Not found', { status: 404 });
      })
    );
    return;
  }
  
  if (url.pathname === '/' || url.pathname === '/index.html') {
    // Check version silently on navigation requests
    event.waitUntil(checkVersion());
  }

  // Network-first with fallback for navigation and static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        if (response.status === 200) {
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
          return cached || caches.match('/index.html');
      }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_VERSION') {
    checkVersion();
  }
});


