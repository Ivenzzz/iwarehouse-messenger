# iWarehouse Messenger

**One secure workspace for every iWarehouse team.**

A self-hosted, browser-first internal messaging platform for iWarehouse — headquarters, warehouse, branches, finance, auditors, RMA, e-commerce, HR, and management. Runs on your own server with Docker Compose. No third-party messaging service involved.

This repository currently contains **Phase 1 (Foundation)** of the seven-phase build plan: infrastructure, authentication, roles, organization structure, the base responsive UI, admin controls, audit logging, seed data, and a read-only view of seeded conversations. Realtime chat (Phase 2), uploads (Phase 3), and the rest follow on this foundation. See `docs/ARCHITECTURE.md` for the full roadmap.

## Stack

Next.js + TypeScript + Tailwind on the frontend; NestJS + Prisma + PostgreSQL on the API; Redis for realtime scale-out and jobs; MinIO for file storage; NGINX in front. Everything ships as one `docker compose up`.

## Quick start (pilot deployment)

Requirements: Docker and Docker Compose v2 on Ubuntu Linux (or any Docker host), Node 20+ only if you want to run without Docker.

```bash
git clone <your-git-remote> iwarehouse-messenger
cd iwarehouse-messenger

# 1. Configure secrets — change EVERY password and secret in .env
cp .env.example .env
openssl rand -base64 48   # run twice; paste into JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
nano .env

# 2. Build and start everything
make up          # or: docker compose up -d --build

# 3. Seed demo data (migrations are applied automatically when the api container starts)
make seed

# 4. Open the app
# http://<server-ip>/  → sign in with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

Demo accounts (all `<name>@iwarehouse.ph`, password `iWarehouse!2026` unless changed in `.env`): jean.yap, wh.supervisor, rma.specialist, auditor.one, auditor.two, ecom.lead, bacolod.oic, cadiz.oic, dumaguete.oic, hr.admin, it.admin. The super admin is `michael.yap@iwarehouse.ph` with `SEED_ADMIN_PASSWORD`. **Change or remove demo accounts before real use.**

API reference is served live at `http://<server>/api/docs` (Swagger / OpenAPI).

## Local development (without full Docker)

```bash
make dev   # starts postgres/redis/minio in Docker, then runs api + web with hot reload
```

Set `DATABASE_URL` and `REDIS_URL` in `.env` to point at `localhost` instead of the service names, set `COOKIE_SECURE=false`, then browse to http://localhost:3000. The Next.js dev server proxies `/api/*` to the NestJS API on port 4000.

## Repository layout

```
apps/api    NestJS API — auth, users, org, admin, audit, conversations (read), health
apps/web    Next.js app — login, chats, directory, admin, theme system, PWA manifest
docker/     NGINX reverse-proxy configuration
scripts/    PostgreSQL backup and restore
docs/       Architecture, deployment, security, backup guides
```

## Everyday commands

`make up` / `make down` / `make logs` / `make migrate` / `make seed` / `make backup` / `make restore FILE=…` / `make psql`. Health checks live at `/api/health/live` and `/api/health/ready`.

## Security posture (Phase 1)

TLS terminates at NGINX (bring your certificates — see `docs/DEPLOYMENT.md`). Passwords are hashed with Argon2. Sessions use short-lived access tokens in HTTP-only cookies with rotating refresh tokens and reuse detection; admins can revoke any session, and deactivating a user kills their sessions immediately. Login is rate-limited with automatic account lockout, and every security-relevant action lands in the audit log. Messages are encrypted in transit and at rest on the server, **not** end-to-end encrypted — the architecture leaves room to add E2EE later. Full details in `docs/SECURITY.md`.

## License and branding

Internal iWarehouse software. The name, mark, and visual identity are original to this project and intentionally do not imitate any third-party messenger.
