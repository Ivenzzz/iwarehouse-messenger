# Security

## Model

Transport encryption everywhere (TLS at NGINX, HTTPS-only cookies), encryption at rest via full-disk or volume encryption on the host (enable LUKS or your cloud provider's volume encryption — the application assumes the host handles this). **No end-to-end encryption in v1**, and the product must never claim it. The message pipeline is deliberately provider-shaped so client-side encryption can be introduced later without changing conversation or membership semantics.

## Authentication

Argon2id password hashing. Access tokens are 15-minute JWTs in `HttpOnly; Secure; SameSite=Lax` cookies; refresh tokens are 30-day JWTs scoped to the refresh route, stored server-side only as SHA-256 hashes, and **rotated on every use with reuse detection** — presenting a stale refresh token revokes the whole session. Repeated failed logins lock the account (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`). Deactivating a user or resetting a password revokes all their sessions immediately, and the JWT strategy re-checks session validity and account status on every request, so revocation takes effect within one request, not at token expiry.

## Authorization

Global role hierarchy (READ_ONLY < MEMBER < MANAGER < ADMIN < SUPER_ADMIN) enforced by a guard on every route; only SUPER_ADMIN can create or modify admin accounts. Conversation access is checked per membership on every conversation route. Phase 2 adds per-group member roles on top.

## Input and output

Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` rejects unknown fields; DTOs constrain lengths and formats. Helmet sets security headers. Message content renders as plain text in the UI (no HTML injection surface); when rich text arrives later it must pass through an HTML sanitizer before render.

## Logging discipline

Audit events record actor, action, target, IP, user agent, result, and metadata — never passwords, tokens, or file contents. Application logs must follow the same rule.

## Rate limiting

100 req/min per IP globally, 10/min on login. Phase 2 adds message and upload rate limits per user.

## Secrets

All secrets come from environment variables; `.env` is git-ignored and `.env.example` contains placeholders only. Rotate JWT secrets by updating `.env` and restarting — all users will simply re-authenticate.

## Hardening checklist before go-live

TLS enabled and port 80 redirecting · every default password changed · demo accounts removed or passwords rotated · database and MinIO ports not exposed beyond localhost (compose already binds them to 127.0.0.1) · host firewall allowing only 80/443/SSH · OS unattended security updates on · backups scheduled and restore tested.
