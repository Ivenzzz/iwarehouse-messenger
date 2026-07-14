# API build fix — compile errors from recent releases

Your IT's local TypeScript build caught 5 real errors that my web-only
verification could not (my environment cannot run the API's type generator).
All fixed in this package:

1. conversations.controller.ts — ValidateNested used but not imported
   (capture/erp DTOs)
2. announcements.service.ts — wrong field name: createdBy → createdById
   (the Prisma XOR<ConversationCreateInput…> error)
3. polls.service.ts — vote records have no user relation; voter names are
   now fetched in a separate query (two errors on lines 122/127/140)
4. push.service.ts — added @types/web-push so the web-push import
   type-checks
5. uploads.service.ts — Logger used but not imported (would have been the
   NEXT error after fixing the above)

Also swept every recently-added controller/service for the same patterns —
no other instances found. Web build + 18 auth logic tests re-verified.

## For IT
- This zip is cumulative (everything through the mobile fixes).
- Deploy per SERVER_UPDATE_INSTRUCTIONS.md steps 1–5, 7. The Docker build
  compiles the API with the full generated Prisma types — if it completes,
  these errors are gone for real.
- If any NEW TypeScript error appears during the Docker build, copy the
  exact error text (file:line + message) back to the developer channel —
  as you just did, which was exactly right.
