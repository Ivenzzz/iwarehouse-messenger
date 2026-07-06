#!/usr/bin/env bash
# Dumps the messenger database to ./backups/iwm-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/iwm-${STAMP}.sql.gz"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
echo "Backup written to $OUT ($(du -h "$OUT" | cut -f1))"
# Verify the archive is readable:
gzip -t "$OUT" && echo "Backup archive verified."
