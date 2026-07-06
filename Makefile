SHELL := /bin/bash

.PHONY: up down logs migrate seed backup restore psql build dev

up:            ## Start full stack (build if needed)
	docker compose up -d --build

down:          ## Stop stack
	docker compose down

logs:          ## Tail all logs
	docker compose logs -f --tail=200

migrate:       ## Apply database migrations inside the api container
	docker compose exec api npx prisma migrate deploy

seed:          ## Seed demo data (idempotent)
	docker compose exec api npm run db:seed

psql:          ## Open a psql shell
	docker compose exec postgres psql -U $${POSTGRES_USER:-iwm} $${POSTGRES_DB:-iwarehouse_messenger}

backup:        ## Dump PostgreSQL to ./backups
	./scripts/backup-postgres.sh

restore:       ## Restore PostgreSQL: make restore FILE=backups/xxx.sql.gz
	./scripts/restore-postgres.sh $(FILE)

dev:           ## Local dev without Docker (requires local pg/redis/minio or docker infra only)
	docker compose up -d postgres redis minio
	npm run dev
