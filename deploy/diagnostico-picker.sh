#!/usr/bin/env bash
# Read-only diagnostics. Never print environment values, cookies, or tokens.
set -eu
cd /opt/sabero
echo '== Estado de los contenedores =='
docker compose -f docker-compose.production.yml ps
echo '== Correccion de Google en el archivo de nginx =='
if grep -q 'Cross-Origin-Opener-Policy.*same-origin-allow-popups' nginx/default.conf; then
  echo 'Archivo: actualizado'
else
  echo 'Archivo: ANTERIOR, falta la correccion'
fi
echo '== Correccion dentro del contenedor nginx =='
if docker compose -f docker-compose.production.yml exec -T nginx cat /etc/nginx/conf.d/default.conf | grep -q 'Cross-Origin-Opener-Policy.*same-origin-allow-popups'; then
  echo 'Contenedor: actualizado'
else
  echo 'Contenedor: ANTERIOR, falta la correccion'
fi
echo '== Cabeceras publicadas =='
curl -fsSI --max-time 20 https://agente.saberoconsulting.com | tr -d '\r' | grep -iE '^(HTTP/|date:|cross-origin-opener-policy:|etag:)' || true
echo '== Codigo y configuracion del backend en ejecucion =='
docker compose -f docker-compose.production.yml exec -T backend node -e '
const fs = require("fs");
const path = "/app/dist/src/modules/integrations/google/google-integration.controller.js";
const source = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
console.log("Picker solo Drive:", /scopes:\s*\[\s*[\x22\x27]https:\/\/www.googleapis.com\/auth\/drive.file/.test(source));
const client = (process.env.GOOGLE_CLIENT_ID || "").trim();
const app = (process.env.GOOGLE_APP_ID || "").trim();
console.log("Client ID configurado:", Boolean(client));
console.log("Picker API key configurada:", Boolean((process.env.GOOGLE_PICKER_API_KEY || "").trim()));
console.log("App ID coincide con proyecto OAuth:", Boolean(app && client.match(/^(\d+)-/)?.[1] === app));
'
