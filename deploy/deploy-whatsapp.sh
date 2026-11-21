#!/usr/bin/env bash
# Targeted release: does not touch platform infrastructure, databases or migrations.
set -euo pipefail
umask 077
APP_DIR="${APP_DIR:-/opt/sabero}"
PACKAGE="${1:-/tmp/sabero-whatsapp.tar.gz}"
CHECKSUM="${2:-/tmp/sabero-whatsapp.tar.gz.sha256}"
FILES=(backend/src/modules/whatsapp/whatsapp-connections.service.ts
       backend/src/modules/whatsapp/whatsapp-connections.controller.ts
       backend/src/modules/whatsapp/whatsapp.service.ts
       frontend/src/features/integrations/links.tsx)
for file in "$PACKAGE" "$CHECKSUM" "$APP_DIR/docker-compose.production.yml" "$APP_DIR/backend/.env.production"; do
  test -f "$file" || { echo "Missing required file: $file" >&2; exit 1; }
done
expected="$(awk 'NR==1 {print $1}' "$CHECKSUM")"
actual="$(sha256sum "$PACKAGE" | awk '{print $1}')"
test "$expected" = "$actual" || { echo 'Package checksum mismatch' >&2; exit 1; }
# Reject extra archive paths before extracting anything.
while IFS= read -r entry; do
  allowed=false
  for file in "${FILES[@]}"; do test "$entry" != "$file" || allowed=true; done
  test "$allowed" = true || { echo "Unexpected archive entry: $entry" >&2; exit 1; }
done < <(tar -tzf "$PACKAGE")
for file in "${FILES[@]}"; do
  test -f "$APP_DIR/$file" || { echo "Existing source missing: $file" >&2; exit 1; }
  tar -tzf "$PACKAGE" | grep -Fxq "$file" || { echo "Package missing: $file" >&2; exit 1; }
done
test -f "$APP_DIR/backend/src/modules/tenancy/tenant.service.ts" || { echo 'Deploy the tenant-enabled base release first' >&2; exit 1; }
backup="$(mktemp -d /opt/sabero-whatsapp-backup.XXXXXXXX)"
cd "$APP_DIR"
cp -p backend/.env.production "$backup/backend.env.production"
tar -czf "$backup/source.tar.gz" "${FILES[@]}"
compose=(docker compose -f docker-compose.production.yml)
old_backend="$("${compose[@]}" images -q backend | head -1)"
old_frontend="$("${compose[@]}" images -q frontend | head -1)"
old_worker="$("${compose[@]}" images -q worker | head -1)"
test -n "$old_backend" && test -n "$old_frontend" && test -n "$old_worker" || { echo 'Running images not found; no changes applied' >&2; exit 1; }
backend_tag="$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q backend)")"
frontend_tag="$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q frontend)")"
worker_tag="$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q worker)")"
rollback() {
  code=$?
  trap - ERR
  echo "Release failed. Restoring source, environment and images from $backup" >&2
  cp -p "$backup/backend.env.production" backend/.env.production
  tar -xzf "$backup/source.tar.gz" -C "$APP_DIR"
  docker tag "$old_backend" "$backend_tag"
  docker tag "$old_frontend" "$frontend_tag"
  docker tag "$old_worker" "$worker_tag"
  "${compose[@]}" up -d --no-build --no-deps --force-recreate backend worker frontend || true
  if test -n "$("${compose[@]}" ps -q nginx)"; then "${compose[@]}" restart nginx || true; fi
  exit "$code"
}
trap rollback ERR
tar -xzf "$PACKAGE" -C "$APP_DIR" --no-same-owner
env_tmp="$(mktemp backend/.env.production.whatsapp.XXXXXX)"
awk '!/^WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=/' backend/.env.production > "$env_tmp"
printf '\nWHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=1813565349855807\n' >> "$env_tmp"
chmod --reference=backend/.env.production "$env_tmp"
chown --reference=backend/.env.production "$env_tmp"
mv "$env_tmp" backend/.env.production
"${compose[@]}" build backend frontend worker
"${compose[@]}" up -d --no-build --no-deps --force-recreate backend worker frontend
ready=false
for attempt in {1..30}; do
  if "${compose[@]}" exec -T backend node -e 'Promise.all([fetch("http://127.0.0.1:3001/api/v1/health/ready",{signal:AbortSignal.timeout(5000)}),fetch("http://frontend:3000/",{signal:AbortSignal.timeout(5000)})]).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))'; then ready=true; break; fi
  sleep 2
done
test "$ready" = true
"${compose[@]}" exec -T backend node -e 'if(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID!=="1813565349855807"||!process.env.META_APP_SECRET)process.exit(1); console.log("Embedded Signup configuration loaded")'
"${compose[@]}" ps backend worker frontend
if test -n "$("${compose[@]}" ps -q nginx)"; then "${compose[@]}" restart nginx; fi
trap - ERR
echo "Release applied. Backup: $backup"
echo 'Next: two owners must authorize Meta and complete the live acceptance checks.'
