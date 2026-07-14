# /var/www build fix — read this before rebuilding

Your 102 errors split into two very different groups:

## Group 1 (~95 errors): missing `prisma generate` — ONE command fixes them
Every "Prisma has no exported member 'TaskWhereInput' / 'UserSelect' /
'InputJsonValue'…" error means the Prisma CLIENT was never generated in
/var/www/iwarehouse-messenger. The Docker build runs this automatically;
a bare-metal `nest build` does NOT. The implicit-any errors (lines 178,
191) are downstream of the same cause and disappear with it.

## Group 2 (real code bugs — fixed in this zip)
- tasks.service.ts: `taskOrThrow` was called but never defined (my bug) —
  now implemented
- avatar.controller.ts: duplicate `adminUpload` implementation — older
  block removed, single clean version kept
- uploads.service.ts "Cannot find name 'Logger'": already fixed in the
  previous zip — its presence on your screen means /var/www has an older
  copy. IMPORTANT: replace the whole `apps/` folder from this zip; don't
  merge by hand.

## Build procedure on the server (bare metal, /var/www)
    cd /var/www/iwarehouse-messenger
    # replace apps/ entirely with the apps/ from this zip (keep your .env)
    cd apps/api
    npm install
    npx prisma generate        # ← the command that kills ~95 errors
    npx prisma migrate deploy  # applies new tables (polls, push, etc.)
    npm run build              # should now complete
Then restart however the api is served (pm2 restart / systemd / node dist/main).

## One question back to you
How is the app being SERVED on this box — pm2, systemd, or docker compose?
The documented path (SERVER_UPDATE_INSTRUCTIONS.md) is docker compose,
which does generate + migrate + build in one step:
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
If IT has deliberately moved to bare metal at /var/www, that's workable —
tell me and I'll write a proper BARE_METAL_DEPLOYMENT.md (nginx, pm2,
postgres/redis/minio as system services) so the runbook matches reality.
