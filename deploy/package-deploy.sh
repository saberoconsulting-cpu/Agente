#!/usr/bin/env bash
# Builds the production tarball from the working tree (includes uncommitted changes).
# Secrets (.env*, generated/) are NEVER included.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-deploy/agente-plataforma.tar.gz}"
mkdir -p deploy

tar -czf "$OUT" \
  --exclude='.git' \
  --exclude='.codex' \
  --exclude='.agents' \
  --exclude='.aws' \
  --exclude='deploy/*.tar.gz*' \
  --exclude='.next-dev*' \
  --exclude='.docker-config' \
  --exclude='*/.docker-config' \
  --exclude='*/.docker-config/*' \
  --exclude='.next-dev' \
  --exclude='*/.next-dev' \
  --exclude='*/.next-dev/*' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='*/node_modules/*' \
  --exclude='dist' \
  --exclude='*/dist' \
  --exclude='*/dist/*' \
  --exclude='.next' \
  --exclude='*/.next' \
  --exclude='*/.next/*' \
  --exclude='generated' \
  --exclude='*/generated' \
  --exclude='*/generated/*' \
  --exclude='.env*' \
  --exclude='*/.env*' \
  --exclude='*.log' \
  --exclude='deploy/*browser*.png' \
  --exclude='client_secret_*.json' \
  --exclude='*/client_secret_*.json' \
  --exclude='platform/nul' \
  .

( cd "$(dirname "$OUT")" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
echo "Package: $OUT"
echo "Hash:    $OUT.sha256"
ls -lh "$OUT"
