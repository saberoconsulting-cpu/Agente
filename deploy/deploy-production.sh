#!/usr/bin/env bash
# Production deploy for AGENT-AI (agent stack + platform multi-tenant).
# Usage: bash deploy-production.sh [/tmp/agente-plataforma.tar.gz] [/tmp/agente-plataforma.tar.gz.sha256]
# Run on the VPS as a user with docker permissions and sudo-free docker access.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sabero}"
PKG="${1:-/tmp/agente-plataforma.tar.gz}"
SHA="${2:-/tmp/agente-plataforma.tar.gz.sha256}"
DOMAIN_SUFFIX="${DOMAIN_SUFFIX:-saberoconsulting.com}"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "=== $* ==="; }

[ -f "$PKG" ] || die "Package not found: $PKG"
[ -f "$SHA" ] || die "Checksum file not found: $SHA"

step "1/8 Verifying package"
EXPECTED="$(awk '{print $1}' "$SHA" | head -1)"
ACTUAL="$(sha256sum "$PKG" | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || die "SHA256 mismatch (expected $EXPECTED, got $ACTUAL)"
echo "Checksum OK"

step "2/8 Preserving secrets and backing up"
mkdir -p "$APP_DIR"
BACKUP_ENV="$(mktemp -d)"
for f in backend/.env.production backend/.env frontend/.env.production frontend/.env.local \
         platform/.env platform/.env.runtime platform/.env.provisioner; do
  if [ -f "$APP_DIR/$f" ]; then mkdir -p "$BACKUP_ENV/$(dirname "$f")"; cp -a "$APP_DIR/$f" "$BACKUP_ENV/$f"; fi
done
[ -f "$APP_DIR/docker-compose.production.yml" ] && cp -a "$APP_DIR" "/opt/sabero.prev-$(date +%Y%m%d%H%M%S)" || true

step "3/8 Extracting code"
tar -xzf "$PKG" -C "$APP_DIR"
cp -a "$BACKUP_ENV/." "$APP_DIR/" 2>/dev/null || true
chmod +x "$APP_DIR/deploy/"*.sh 2>/dev/null || true

# The agent env file lives outside the tarball (secrets). Accept it from /tmp on first deploy.
if [ ! -f "$APP_DIR/backend/.env.production" ] && [ -f /tmp/backend.env.production ]; then
  cp /tmp/backend.env.production "$APP_DIR/backend/.env.production"; chmod 600 "$APP_DIR/backend/.env.production"
fi
[ -f "$APP_DIR/backend/.env.production" ] || die "backend/.env.production missing — scp your local backend/.env.production to /tmp/backend.env.production first"
# This public configuration ID belongs to the approved Sabero WhatsApp setup.
# Preserve every other production setting, including all server-only secrets.
ENV_TMP="$(mktemp "$APP_DIR/backend/.env.production.whatsapp.XXXXXX")"
awk '!/^WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=/' "$APP_DIR/backend/.env.production" > "$ENV_TMP"
printf '\nWHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=1813565349855807\n' >> "$ENV_TMP"
chmod --reference="$APP_DIR/backend/.env.production" "$ENV_TMP"
chown --reference="$APP_DIR/backend/.env.production" "$ENV_TMP"
mv "$ENV_TMP" "$APP_DIR/backend/.env.production"
# Frontend runtime env (proxy target is baked at build via compose args; this file satisfies env_file).
[ -f "$APP_DIR/frontend/.env.production" ] || printf 'NEXT_PUBLIC_API_PROXY_TARGET=http://backend:3001\n' > "$APP_DIR/frontend/.env.production"

step "4/8 Platform infrastructure (Postgres + Mongo + API + provisioner)"
cd "$APP_DIR/platform"

# First run: generate secrets and env files (existing files are preserved).
if [ ! -f .env.provisioner ]; then
  PG_PASS="$(openssl rand -hex 24)"; MG_PASS="$(openssl rand -hex 24)"
  ENC_KEY="$(openssl rand -hex 32)"; ADM_TOKEN="$(openssl rand -hex 32)"
  RT_PASS="$(openssl rand -hex 24)"
  cat > .env <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=sabero_control
MONGO_USER=platform
MONGO_PASSWORD=$MG_PASS
EOF
  cat > .env.provisioner <<EOF
CONTROL_DATABASE_URL=postgresql://postgres:$PG_PASS@postgres:5432/sabero_control
PROVISION_DATABASE_URL=postgresql://postgres:$PG_PASS@postgres:5432/postgres
MONGODB_URI=mongodb://platform:$MG_PASS@mongo:27017/?authSource=admin
PLATFORM_ENCRYPTION_KEY=$ENC_KEY
TENANT_POSTGRES_HOST=postgres
TENANT_POSTGRES_PORT=5432
TENANT_DOMAIN_SUFFIX=$DOMAIN_SUFFIX
EOF
  # Brevo settings for access-request emails (copied from the agent env when present).
  BREVO_KEY="$(grep -E '^BREVO_API_KEY=' ../backend/.env.production | cut -d= -f2- | tr -d '"' || true)"
  BREVO_FROM="$(grep -E '^BREVO_SENDER_EMAIL=' ../backend/.env.production | cut -d= -f2- | tr -d '"' || true)"
  BREVO_NAME="$(grep -E '^BREVO_SENDER_NAME=' ../backend/.env.production | cut -d= -f2- | tr -d '"' || true)"
  BREVO_REPLY="$(grep -E '^BREVO_REPLY_TO=' ../backend/.env.production | cut -d= -f2- | tr -d '"' || true)"
  cat > .env.runtime <<EOF
CONTROL_DATABASE_URL=postgresql://sabero_platform_runtime:$RT_PASS@postgres:5432/sabero_control
MONGODB_URI=mongodb://platform:$MG_PASS@mongo:27017/?authSource=admin
PLATFORM_ENCRYPTION_KEY=$ENC_KEY
PLATFORM_ADMIN_TOKEN=$ADM_TOKEN
PLATFORM_ADMIN_COMPANY_ID=sabero
PORT=3010
HOST=0.0.0.0
ACCESS_NOTIFICATIONS_ENABLED=true
BREVO_API_KEY=$BREVO_KEY
BREVO_SENDER_EMAIL=$BREVO_FROM
BREVO_SENDER_NAME=${BREVO_NAME:-SABERO Consulting}
BREVO_REPLY_TO=${BREVO_REPLY:-$BREVO_FROM}
EOF
  echo "Runtime DB password: $RT_PASS" > .env.runtime.password
  echo "Generated platform secrets (first run)."
else
  echo "Platform env files already exist — keeping them."
fi

docker compose up -d postgres mongo
sleep 5

# Control schema + runtime role + grants (idempotent).
docker compose run --rm --build provisioner node src/admin.mjs init
RT_PASS="$(cat .env.runtime.password 2>/dev/null | awk '{print $4}')"
[ -n "$RT_PASS" ] || RT_PASS="$(grep -oP 'sabero_platform_runtime:\K[^@]+' .env.runtime | head -1)"
docker compose exec -T postgres psql -U postgres -d sabero_control <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sabero_platform_runtime') THEN
    CREATE ROLE sabero_platform_runtime LOGIN PASSWORD '$RT_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE sabero_platform_runtime PASSWORD '$RT_PASS';
  END IF;
END \$\$;
GRANT CONNECT ON DATABASE sabero_control TO sabero_platform_runtime;
GRANT USAGE ON SCHEMA public TO sabero_platform_runtime;
GRANT SELECT ON platform_companies,platform_products,platform_service_credentials TO sabero_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON platform_access_requests,platform_access_notifications,platform_access_provisioning TO sabero_platform_runtime;
GRANT UPDATE(status,deleted_at) ON platform_companies TO sabero_platform_runtime;
SQL

docker compose up -d --build
sleep 3
docker compose ps

step "5/8 Registering sabero company in the platform registry"
# Points the admin company at its existing database (Supabase or VPS Postgres).
DBURL="$(grep -E '^DIRECT_DATABASE_URL=' ../backend/.env.production | cut -d= -f2- | tr -d '"' || true)"
[ -n "$DBURL" ] || DBURL="$(grep -E '^DATABASE_URL=' ../backend/.env.production | cut -d= -f2- | tr -d '"')"
DBNAME="$(echo "$DBURL" | sed -E 's|.*/([^/?]+).*|\1|')"
if [ "${SKIP_ATTACH:-0}" = "1" ]; then
  echo "SKIP_ATTACH=1 — skipping company registration (sabero is already registered)."
elif [ -n "$DBURL" ]; then
  # A stuck database connection must not block the whole deploy: give up after 60s (sabero is already registered on re-deploys).
  timeout 60 docker compose run --rm -T provisioner node src/attach-company.mjs sabero "SABERO" real-estate "$DBURL" sabero agent || \
    echo "WARN: could not attach sabero automatically (timeout or error) — continuing; register it manually with attach-company.mjs if it is new"
  docker ps -aq --filter "name=provisioner-run" | xargs -r docker rm -f >/dev/null 2>&1 || true
else
  echo "WARN: no DATABASE_URL found in backend/.env.production — sabero not registered in platform"
fi

step "6/8 Agent stack"
cd "$APP_DIR"
# Bootstrap: without TLS certificates the production nginx conf fails. Use the HTTP-only dev conf until certbot runs.
mkdir -p certbot/www certbot/conf certbot/work certbot/logs
# nginx.conf references these Lets Encrypt helper files inside the container's /etc/letsencrypt mount.
[ -f certbot/conf/options-ssl-nginx.conf ] || cat > certbot/conf/options-ssl-nginx.conf <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF
[ -f certbot/conf/ssl-dhparams.pem ] || openssl dhparam -out certbot/conf/ssl-dhparams.pem 2048 2>/dev/null || true
DOMAIN_LIVE="$(grep -oP 'server_name \K[\w.-]+' nginx/default.conf | head -1)"
if [ ! -f "certbot/conf/live/$DOMAIN_LIVE/fullchain.pem" ]; then
  [ -f nginx/default.conf.prod ] || cp nginx/default.conf nginx/default.conf.prod
  cp nginx/default.dev.conf nginx/default.conf
  echo "No TLS certs yet — nginx running HTTP-only. Run certbot, then: cp nginx/default.conf.prod nginx/default.conf && docker compose -f docker-compose.production.yml exec nginx nginx -s reload"
fi
# Build first, apply additive migrations, then start the new application code.
docker compose -f docker-compose.production.yml build backend worker frontend
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run db:migrate:prod
docker compose -f platform/compose.yml run --rm --no-deps provisioner node src/migrate-agent-tenants.mjs sabero
docker compose -f docker-compose.production.yml up -d

step "7/8 Wiring backend to the platform API"
# Adds PLATFORM_* vars to backend/.env.production without touching existing values.
ENVPROD="$APP_DIR/backend/.env.production"
ADMIN_TOKEN="$(grep -oP 'PLATFORM_ADMIN_TOKEN=\K.*' platform/.env.runtime | tr -d '"' | head -1)"
ADMIN_EMAIL="$(grep -E '^ADMIN_EMAIL=' "$ENVPROD" | cut -d= -f2- | tr -d '"' | head -1)"
upsert() { grep -q "^$1=" "$ENVPROD" || echo "$1=$2" >> "$ENVPROD"; }
upsert PLATFORM_API_URL "http://platform:3010"
upsert PLATFORM_ADMIN_TOKEN "$ADMIN_TOKEN"
upsert PLATFORM_ADMIN_COMPANY_ID "sabero"
upsert PLATFORM_ADMIN_EMAILS "$ADMIN_EMAIL"
upsert PUBLIC_ACCESS_REQUESTS_ENABLED "true"
# Recreate backend/worker so they pick up the new PLATFORM_* variables.
docker compose -f docker-compose.production.yml up -d backend worker
# nginx resolves upstream addresses at start; recreated containers get new IPs, so reload it or the site answers 502.
sleep 8
docker compose -f docker-compose.production.yml restart nginx

step "8/8 Health checks"
sleep 10
docker compose -f platform/compose.yml exec -T platform node -e 'fetch("http://127.0.0.1:3010/health", {signal: AbortSignal.timeout(10000)}).then(r => {if (!r.ok) process.exit(1); console.log("platform OK");}).catch(() => process.exit(1))' || die "platform health failed"
docker compose -f docker-compose.production.yml exec -T backend node -e 'fetch("http://127.0.0.1:3001/api/v1/health", {signal: AbortSignal.timeout(10000)}).then(r => {if (!r.ok) process.exit(1); console.log("agent OK");}).catch(() => process.exit(1))' || die "agent health failed"

if [ "${VERIFY_KNOWLEDGE_DELETION:-0}" = "1" ]; then
  docker compose -f docker-compose.production.yml exec -T backend node scripts/verify-knowledge-deletion.cjs
fi

echo
echo "=== Deploy finished ==="
echo "Platform admin token: see $APP_DIR/platform/.env.runtime"
echo "Next: verify https://agente.$DOMAIN_SUFFIX and the access-request panel."
