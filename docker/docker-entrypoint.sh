#!/bin/sh
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SPlayer WebX] Starting Docker container..."

# Initial plugin verification/update
if [ -x /app/scripts/update-plugins.sh ]; then
  /app/scripts/update-plugins.sh || true
fi

# Background daily updater (runs every 24 hours / 86400 seconds)
if [ "${AUTO_UPDATE_PLUGINS:-true}" = "true" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SPlayer WebX] Background daily plugin updater enabled (interval: 24h)."
  (
    while true; do
      sleep 86400
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SPlayer WebX] Running daily plugin update check..."
      /app/scripts/update-plugins.sh || true
    done
  ) &
fi

# Start the web server
exec node /app/scripts/server.mjs
