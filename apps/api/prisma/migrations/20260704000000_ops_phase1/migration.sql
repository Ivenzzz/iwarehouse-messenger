-- Ops Phase 1: conversation priority + per-user pinned conversations
ALTER TABLE "conversations" ADD COLUMN "priority" TEXT;
ALTER TABLE "conversation_members" ADD COLUMN "pinnedAt" TIMESTAMP(3);
