#!/bin/sh
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SPlayer Web] Starting Docker container..."

# Ensure default plugin exists in volume
if [ ! -f /app/plugins/npi.netease.source.js ] && [ -f /app/dist/plugins/npi.netease.source.js ]; then
  cp -f /app/dist/plugins/npi.netease.source.js /app/plugins/npi.netease.source.js 2>/dev/null || true
fi

# Start the web server
exec node /app/scripts/server.mjs
