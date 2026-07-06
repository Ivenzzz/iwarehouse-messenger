# Deployment

Target: a single Ubuntu Linux server (physical or VM) on the company network or private cloud. 4 GB RAM / 2 vCPU is a comfortable pilot size.

## First deployment

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone <your-git-remote> /opt/iwarehouse-messenger
cd /opt/iwarehouse-messenger
cp .env.example .env
```

Edit `.env` and change: `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (use `openssl rand -base64 48`), `SEED_ADMIN_PASSWORD`, and `APP_URL`. Then:

```bash
docker compose up -d --build   # the api container applies database migrations on start
docker compose exec api npm run db:seed
```

Browse to `http://<server-ip>/` and sign in as the seed admin.

## Enabling HTTPS (required for production and for PWA install)

1. Obtain a certificate for your internal hostname (company CA, or Let's Encrypt if the host is reachable).
2. Place `fullchain.pem` and `privkey.pem` in `docker/nginx/certs/`.
3. Uncomment the certs volume and port 443 in `docker-compose.yml`, add a 443 server block to `docker/nginx/nginx.conf` with `ssl_certificate` directives, and redirect port 80 to HTTPS.
4. Keep `COOKIE_SECURE=true` (the default) so auth cookies are HTTPS-only.
5. `docker compose restart nginx`.

Browsers only allow PWA installation, notifications, and microphone access on HTTPS origins, so treat TLS as mandatory before rollout.

## Upgrades

```bash
cd /opt/iwarehouse-messenger
./scripts/backup-postgres.sh          # always back up first
git pull
docker compose up -d --build          # api container runs `prisma migrate deploy` on start
docker compose logs -f api            # watch for a clean start
```

## Operations checklist

Daily: automated backup via cron (`0 2 * * * /opt/iwarehouse-messenger/scripts/backup-postgres.sh`). Weekly: check `/api/health/ready`, disk usage (`docker system df`, MinIO volume), and prune old images (`docker image prune -f`). Monthly: test a restore into a scratch database (see BACKUP_AND_RESTORE.md).
