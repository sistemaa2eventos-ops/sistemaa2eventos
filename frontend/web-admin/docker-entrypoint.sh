#!/bin/sh
set -e

# Generate runtime config file from environment variables + auto-cleanup for legacy /sw.js cache
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
};
(function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      var hadLegacy = false;
      Promise.all(regs.map(function(r) {
        var u = (r.active && r.active.scriptURL) || (r.waiting && r.waiting.scriptURL) || (r.installing && r.installing.scriptURL) || '';
        if (u.indexOf('/sw.js') !== -1) {
          hadLegacy = true;
          return r.unregister();
        }
      })).then(function() {
        if (hadLegacy && window.caches) {
          caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(k) { return caches.delete(k); }));
          }).then(function() {
            window.location.reload();
          });
        }
      });
    });
  }
})();
EOF

# Legacy /sw.js self-destructor so any browser checking /sw.js immediately drops old caches
cat > /usr/share/nginx/html/sw.js <<'EOF'
self.addEventListener('install', function() {
  self.skipWaiting();
});
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});
EOF

# Start nginx
exec nginx -g "daemon off;"
