#!/usr/bin/env bash
# Solo lectura: ultimos errores del agente de IA / WhatsApp.
cd /opt/sabero || exit 1
C="docker compose -f docker-compose.production.yml"
$C ps --format "table {{.Name}}\t{{.Status}}"
echo "== errores =="
$C logs --tail 1500 backend worker 2>&1 | grep -iE "Failed to process|deepseek|insufficient|402|401|429|timeout|ECONN|Meta|error" | tail -30
