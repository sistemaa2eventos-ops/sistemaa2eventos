// Service Worker minimalista (Obrigatório para PWA Install Prompt)
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Pass-through fetch (Network first, no cache for dynamic Next.js routes)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return new Response('Network Error. Conecte-se à internet para usar o A2 Eventos.');
        })
    );
});
