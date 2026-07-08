#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/iwarehouse-messenger"
BRANCH="main"
COMPOSE_FILE="docker-compose.host-nginx.yml"
ENV_FILE=".env.docker"

cd "$APP_DIR"

echo "==> Checking local changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: You have local modified files."
    echo "Run: git status"
    exit 1
fi

echo "==> Fetching latest code..."
git fetch origin "$BRANCH"

echo "==> Updating to latest version..."
git merge --ff-only "origin/$BRANCH"

echo "==> Building and starting Docker services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "==> Checking Docker services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "==> Testing API health..."
curl -fsS http://127.0.0.1:4001/health/live > /dev/null

echo "==> Testing Web..."
curl -fsSI http://127.0.0.1:3001 > /dev/null

echo "Docker deployment completed successfully."