#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/iwarehouse-messenger"
BRANCH="main"

cd "$APP_DIR"

echo "==> Checking local changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: You have local modified files."
    echo "Run: git status"
    echo "Fix them first before deploying."
    exit 1
fi

echo "==> Fetching latest code..."
git fetch origin "$BRANCH"

echo "==> Updating to latest version..."
git merge --ff-only "origin/$BRANCH"

echo "==> Installing dependencies..."
npm ci

echo "==> Building API and Web..."
npm run build

echo "==> Applying database migrations..."
npm run db:deploy --workspace apps/api

echo "==> Restarting services..."
sudo systemctl restart iwm-api.service
sudo systemctl restart iwm-web.service

echo "==> Checking services..."
sudo systemctl is-active --quiet iwm-api.service
sudo systemctl is-active --quiet iwm-web.service

echo "==> Testing API health..."
curl -fsS http://127.0.0.1:4000/health/live > /dev/null

echo "==> Testing Web..."
curl -fsSI http://127.0.0.1:3000 > /dev/null

echo "Deployment completed successfully."