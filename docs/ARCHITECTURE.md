# Architecture

iWarehouse Messenger is a **modular monolith in a monorepo**: one NestJS API and one Next.js frontend, deployed as containers behind NGINX. This is a deliberate choice for a company-scale internal tool — one deployable, one database, simple operations — while keeping module boundaries clean enough to split services later if scale ever demands it.

## System diagram

```
Browser (desktop / mobile / installed PWA)
        │  HTTPS + WebSocket
        ▼
      NGINX ──────────────► /          Next.js (web)
        │                   /api/*     NestJS  (api)
        │                   /socket.io NestJS gateway (Phase 2)
        ▼
   NestJS API ── Prisma ──► PostgreSQL   (all relational data)
        │────── ioredis ──► Redis        (presence, socket adapter, BullMQ jobs)
        │────── S3 SDK ───► MinIO        (attachments; Phase 3)
```

## Backend modules

`auth` (login, refresh rotation, sessions), `users` (profiles, directory), `org` (branches, departments), `conversations` (read-only in Phase 1; full messaging in Phase 2), `admin` (user lifecycle, session revocation), `audit` (append-only event log, globally injectable), `health` (liveness/readiness). Each module owns its controllers, services, and DTOs; cross-module access goes through exported services, never direct table access from another module's controller.

Guards run globally in order: throttler → JWT auth → role check. Routes opt out of auth with `@Public()` and opt into role floors with `@Roles('ADMIN')` (roles are ranked, so `ADMIN` also admits `SUPER_ADMIN`).

## Data model

UUID primary keys throughout; soft deletes on users and messages (`deletedAt`); cursor-friendly composite index on `(conversationId, createdAt DESC, id)` for message pagination. The schema already includes the Phase 2–3 tables (conversations, messages, reactions, attachments, receipts, uploads, notifications) so later phases are additive migrations, not rewrites. Binary files never enter PostgreSQL — attachments store a MinIO `storageKey` plus metadata (name, MIME, size, SHA-256, scan status).

## Search strategy

Phase 4 search uses PostgreSQL full-text search behind a `SearchProvider` interface, so OpenSearch can replace it later without touching callers.

## Calls

Voice/video is isolated behind a future `CallProvider` interface with a feature-flagged LiveKit implementation (plus coturn for NAT traversal). Call buttons stay hidden until the flag is on; media infrastructure never blocks core messaging.

## Roadmap by phase

1. **Foundation (this codebase)** — infra, auth, roles, org, base UI, admin, audit, seeds
2. Chat core — Socket.IO gateway, send/edit/delete, receipts, typing, presence, pagination
3. Uploads & media — MinIO presigned flows, previews, shared-media panels, ClamAV hook
4. Operational features — announcements, pins, mentions, replies, reactions, saved, search
5. Admin & reliability — storage dashboard, system health, BullMQ jobs, monitoring
6. PWA — service worker, offline shell, queued outbox, push notifications
7. Optional calls — LiveKit provider behind the feature flag
