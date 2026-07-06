# Backup and restore

## What to back up

1. **PostgreSQL** — all messages, users, groups, audit logs. Covered by `scripts/backup-postgres.sh` (gzipped `pg_dump` into `./backups/`, integrity-verified with `gzip -t`).
2. **MinIO volume** — uploaded files (from Phase 3 onward). Back up the `miniodata` Docker volume or use `mc mirror` to a second host: `mc mirror local/iwm-attachments /mnt/backup/attachments`.
3. **Configuration** — your `.env` and any TLS certificates. Store copies in a password manager or encrypted vault, never in git.

## Schedule

Daily database backup at 02:00 via cron; keep 14 daily, 8 weekly, 6 monthly. Copy backups off the host (rsync to a NAS or second server) — a backup on the same disk as the database is not a backup.

```
0 2 * * * /opt/iwarehouse-messenger/scripts/backup-postgres.sh >> /var/log/iwm-backup.log 2>&1
```

## Restore

```bash
make restore FILE=backups/iwm-20260703-020000.sql.gz
```

The script asks for confirmation before overwriting. For disaster recovery on a fresh server: install Docker, clone the repo, restore `.env` from your vault, `docker compose up -d`, run the restore script, restore the MinIO volume, then verify sign-in and `/api/health/ready`.

## Verifying backups

Monthly, restore the latest dump into a scratch database and count rows:

```bash
gunzip -c backups/<latest>.sql.gz | docker compose exec -T postgres psql -U iwm -d postgres -c 'CREATE DATABASE restore_test' && \
gunzip -c backups/<latest>.sql.gz | docker compose exec -T postgres psql -U iwm restore_test
docker compose exec postgres psql -U iwm restore_test -c 'SELECT count(*) FROM users;'
docker compose exec postgres psql -U iwm -d postgres -c 'DROP DATABASE restore_test'
```

A backup you have never restored is a hope, not a plan.
