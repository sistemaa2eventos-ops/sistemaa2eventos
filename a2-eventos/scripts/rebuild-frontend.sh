#!/bin/bash
# Rebuild frontend container to fix PermissoesAcesso error
# This clears Docker cache and rebuilds the frontend image

set -e

echo "🔄 Rebuilding frontend container (clearing cache)..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Stop the admin-web container
echo "⏹️  Stopping admin-web container..."
docker-compose stop admin-web

# Rebuild with no cache
echo "🏗️  Building frontend image (no cache)..."
docker-compose build --no-cache admin-web

# Start the container
echo "▶️  Starting admin-web container..."
docker-compose up -d admin-web

# Wait for it to be ready
echo "⏳ Waiting for container to be ready..."
sleep 10

# Check health
echo "🔍 Checking container health..."
docker-compose ps admin-web

echo ""
echo "✅ Frontend rebuild complete!"
echo "🌐 Access at: https://painel.nzt.app.br"
echo ""
echo "Note: Clear your browser cache (Ctrl+Shift+Del) if you still see old content"
