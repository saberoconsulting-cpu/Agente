#!/usr/bin/env bash
set -eu
cd /opt/sabero
cp nginx/default.conf nginx/default.conf.before-picker-header
cp /tmp/sabero-nginx-picker.conf nginx/default.conf
if ! docker compose -f docker-compose.production.yml exec -T nginx nginx -t; then
  cp nginx/default.conf.before-picker-header nginx/default.conf
  echo 'ERROR: configuracion restaurada; no se recargo nginx.'
  exit 1
fi
docker compose -f docker-compose.production.yml exec -T nginx nginx -s reload
echo 'PICKER_HEADER_UPDATED'
