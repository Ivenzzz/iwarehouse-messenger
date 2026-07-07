-- Ops Phase 3: Incidents module
CREATE TYPE "IncidentType" AS ENUM ('STOCK_VARIANCE', 'MISSING_UNIT', 'WRONG_IMEI', 'DELIVERY_DELAY', 'DELIVERY_DAMAGE', 'CASH_DISCREPANCY', 'FINANCING_DOC_MISSING', 'CUSTOMER_COMPLAINT', 'RMA_DELAY', 'DAMAGED_UNIT', 'SYSTEM_OUTAGE', 'SECURITY_CONCERN', 'OTHER');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED');
CREATE TYPE "IncidentPriority" AS ENUM ('P1', 'P2', 'P3');

CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "IncidentPriority" NOT NULL DEFAULT 'P2',
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "imei" TEXT,
    "erpRef" TEXT,
    "resolutionDeadline" TIMESTAMP(3),
    "conversationId" UUID,
    "sourceMessageId" UUID,
    "cardMessageId" UUID,
    "reporterId" UUID NOT NULL,
    "ownerId" UUID,
    "escalationId" UUID,
    "branchId" UUID,
    "departmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_activity" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incidents_ownerId_status_idx" ON "incidents"("ownerId", "status");
CREATE INDEX "incidents_reporterId_idx" ON "incidents"("reporterId");
CREATE INDEX "incidents_conversationId_status_idx" ON "incidents"("conversationId", "status");
CREATE INDEX "incidents_resolutionDeadline_idx" ON "incidents"("resolutionDeadline");
CREATE INDEX "incident_activity_incidentId_createdAt_idx" ON "incident_activity"("incidentId", "createdAt");

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_activity" ADD CONSTRAINT "incident_activity_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_activity" ADD CONSTRAINT "incident_activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
