#!/bin/sh
set -e

# Generate runtime config file from environment variables
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
};
EOF

# Start nginx
exec nginx -g "daemon off;"
