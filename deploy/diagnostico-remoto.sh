#!/usr/bin/env bash
# Read-only checks run on the VPS (via diagnostico.bat). Changes nothing.
cd /opt/sabero || { echo "No existe /opt/sabero"; exit 1; }
C="docker compose -f docker-compose.production.yml"
echo "== 1. DNS de Meta desde el servidor =="
getent hosts graph.facebook.com | head -2 || echo "El servidor no resuelve graph.facebook.com"
echo
echo "== 2. Alcance a Meta desde el servidor =="
curl -sS -m 10 -o /dev/null -w "graph.facebook.com -> HTTP %{http_code} en %{time_total}s\n" https://graph.facebook.com/ || echo "SIN CONEXION con Meta desde el servidor"
echo
echo "== 3. Alcance a Meta desde el contenedor backend =="
$C exec -T backend node -e "const t=Date.now();fetch('https://graph.facebook.com/',{signal:AbortSignal.timeout(10000)}).then(r=>console.log('HTTP',r.status,(Date.now()-t)+'ms')).catch(e=>console.log('ERROR',(e.cause&&e.cause.code)||e.message))"
echo
echo "== 4. Contenedores =="
$C ps --format "table {{.Name}}\t{{.Status}}"
echo
echo "== 5. Ultimos errores reales de plantillas, Google y WhatsApp (sin claves) =="
$C logs --tail 600 backend 2>&1 | grep -E "Meta template|Google calendars|Failed to process WhatsApp" | tail -12
echo
echo "== 6. Variables de Meta configuradas (solo si tienen valor, sin mostrarlo) =="
for k in META_APP_ID META_APP_SECRET META_WABA_ID META_PHONE_NUMBER_ID META_ACCESS_TOKEN WHATSAPP_ACCESS_TOKEN WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID META_GRAPH_API_VERSION VISION_PROVIDER VISION_API_KEY; do
  if grep -qE "^$k=.+" backend/.env.production; then echo "  $k: configurada"; else echo "  $k: VACIA"; fi
done
