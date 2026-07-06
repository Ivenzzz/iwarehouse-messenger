#!/usr/bin/env bash
# Restores a backup created by backup-postgres.sh
# Usage: ./scripts/restore-postgres.sh backups/iwm-20260703-090000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
FILE="${1:?Usage: restore-postgres.sh <backup-file.sql.gz>}"
echo "This will OVERWRITE database '$POSTGRES_DB'. Press Enter to continue, Ctrl+C to abort."
read -r
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
echo "Restore complete."
