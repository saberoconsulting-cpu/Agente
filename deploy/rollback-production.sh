#!/usr/bin/env bash
# Restores the previous deployment backup created by deploy-production.sh.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/sabero}"
PREV="$(ls -dt /opt/sabero.prev-* 2>/dev/null | head -1 || true)"
[ -n "$PREV" ] || { echo "No previous backup found in /opt"; exit 1; }
echo "Restoring from $PREV"
cd "$APP_DIR"
docker compose -f docker-compose.production.yml down || true
cd "$APP_DIR/platform" && docker compose down || true
mv "$APP_DIR" "${APP_DIR}.failed-$(date +%Y%m%d%H%M%S)"
mv "$PREV" "$APP_DIR"
cd "$APP_DIR"
docker compose -f docker-compose.production.yml up -d || true
cd platform && docker compose up -d || true
echo "Rollback complete. Verify health endpoints manually."
