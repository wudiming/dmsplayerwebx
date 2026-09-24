#!/bin/sh
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SPlayer Web] Starting SPlayer Web server on port ${PORT:-5173}..."
exec node /app/scripts/server.mjs
