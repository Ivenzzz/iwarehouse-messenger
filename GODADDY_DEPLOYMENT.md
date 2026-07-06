# GoDaddy VPS deployment runbook — chat.iwarehouse.ph

Follow top to bottom on deployment day. Assumes an Ubuntu 24.04 GoDaddy VPS
you can log into (username shown in the GoDaddy panel, e.g. mikeyap), with
nothing else using ports 80/443. Every command is typed on the SERVER unless
marked (PC).

## 0. Prerequisites
- VPS IP address (from the GoDaddy panel), login user + password.
- The latest project zip on your PC.
- GoDaddy DNS access for iwarehouse.ph.

## 1. Point the subdomain at the server
GoDaddy → iwarehouse.ph → DNS → Add record:
  Type A · Name: chat · Value: <YOUR-SERVER-IP> · TTL default
(If you created this earlier pointing at another IP, EDIT it to the right
server.) Verify after ~15 min (PC):  nslookup chat.iwarehouse.ph

## 2. Connect (PC)
  ssh mikeyap@<YOUR-SERVER-IP>
Type yes on first connect, then the password.

## 3. Install Docker on the server
  sudo apt update && sudo apt -y upgrade
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
Log out (exit) and ssh back in, then verify:  docker --version

## 4. Upload the project (PC, in the folder containing the zip)
  scp iwarehouse-messenger-*.zip mikeyap@<YOUR-SERVER-IP>:~
Back on the server:
  sudo apt -y install unzip
  mkdir -p ~/msg && unzip -o iwarehouse-messenger-*.zip -d ~/msg && cd ~/msg

## 5. Production .env (do NOT copy the laptop one — fresh secrets)
  cp .env.example .env
  nano .env
Set, at minimum:
  APP_URL=https://chat.iwarehouse.ph
  COOKIE_SECURE=true
  POSTGRES_PASSWORD / REDIS_PASSWORD / MINIO_ROOT_PASSWORD  → new strong values
  DATABASE_URL / REDIS_URL                                  → update passwords inside to match
  JWT_ACCESS_SECRET / JWT_REFRESH_SECRET → run: openssl rand -base64 48  (twice)
  SEED_ADMIN_PASSWORD → the real admin password
  GOOGLE_CLIENT_ID / SECRET → if using Google sign-in (add the
    https://chat.iwarehouse.ph/api/auth/google/callback redirect URI in
    Google Cloud too)
Save: Ctrl+O, Enter, Ctrl+X.

## 6. Get the HTTPS certificate (before first full start)
  sudo apt -y install certbot
  sudo certbot certonly --standalone -d chat.iwarehouse.ph
(Requires step 1 DNS to be live and port 80 free. Certificate lands in
/etc/letsencrypt/live/chat.iwarehouse.ph/.)

## 7. Start everything in production mode
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
First build takes ~10 minutes. Migrations apply automatically.

## 8. Seed the first data
  docker compose exec api npm run db:seed
Then open https://chat.iwarehouse.ph — you should get the login page WITH the
padlock. Sign in as the admin.

## 9. Firewall (recommended)
  sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443
  sudo ufw enable

## 10. Certificate auto-renewal
Certs last 90 days. Renewal needs port 80 briefly; simplest reliable setup:
  sudo crontab -e
Add this line (renews ~2:30am on the 1st of each month):
  30 2 1 * * certbot renew --pre-hook "docker compose -f /home/mikeyap/msg/docker-compose.yml -f /home/mikeyap/msg/docker-compose.prod.yml stop nginx" --post-hook "docker compose -f /home/mikeyap/msg/docker-compose.yml -f /home/mikeyap/msg/docker-compose.prod.yml start nginx"

## 11. Backups
  crontab -e   (as your user)
  0 2 * * * cd ~/msg && bash scripts/backup-postgres.sh
Backups land in ~/msg/backups; docs/BACKUP_AND_RESTORE.md covers restore.

## What lights up the moment HTTPS is live
- Live stamped camera with GPS on every phone (already in the code — it
  detects the secure connection and switches itself on)
- Google sign-in redirect for the production URL
- PWA install + push notifications (Phase 6, next build)

## Troubleshooting
- 502 → containers still starting, or: docker compose restart nginx
- Cert issuance fails → DNS not propagated yet, or something on port 80
  (check: sudo ss -ltnp | grep :80)
- Logs: docker compose logs api --tail 50   /   logs web   /   logs nginx
