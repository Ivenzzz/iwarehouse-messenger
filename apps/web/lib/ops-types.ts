// Typed domain models for the iWarehouse operations layer.
// Chat is for discussion. Tasks are for accountability. Incidents are for
// urgent operational problems. ERP records remain the source of truth.

export type OpsPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type IncidentPriority = 'P1' | 'P2' | 'P3';

export type TaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'CLOSED';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: OpsPriority;
  dueAt?: string | null;
  requiresIndependentVerifier: boolean;
  erpRef?: string | null;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  creator: { id: string; name: string };
  assignee: { id: string; name: string; avatarKey?: string | null } | null;
  verifier: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  activity?: TaskActivity[];
}

export interface TaskActivity {
  at: string;
  actorName: string;
  action: string;
  detail?: string;
}

export type IncidentType =
  | 'STOCK_VARIANCE'
  | 'MISSING_UNIT'
  | 'WRONG_IMEI'
  | 'DELIVERY_DELAY'
  | 'DELIVERY_DAMAGE'
  | 'CASH_DISCREPANCY'
  | 'FINANCING_DOC_MISSING'
  | 'CUSTOMER_COMPLAINT'
  | 'RMA_DELAY'
  | 'DAMAGED_UNIT'
  | 'SYSTEM_OUTAGE'
  | 'SECURITY_CONCERN'
  | 'OTHER';

export type IncidentStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CLOSED';

export interface Incident {
  id: string;
  type: IncidentType;
  typeLabel: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  description: string;
  sku?: string | null;
  imei?: string | null;
  erpRef?: string | null;
  resolutionDeadline?: string | null;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  reporter: { id: string; name: string };
  owner: { id: string; name: string; avatarKey?: string | null } | null;
  escalation: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  activity?: TaskActivity[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  attachmentIds?: string[];
  audience: { branchCodes?: string[]; departmentCodes?: string[]; roles?: string[]; all?: boolean };
  requiresAcknowledgment: boolean;
  acknowledgedCount: number;
  pendingCount: number;
  ackDueAt?: string;
  createdAt: string;
}

export type ERPRecordType =
  | 'TRANSFER'
  | 'PURCHASE_ORDER'
  | 'GRN'
  | 'SALES_INVOICE'
  | 'STOCK_ADJUSTMENT'
  | 'RMA'
  | 'CUSTOMER'
  | 'FINANCE_RECON'
  | 'CASHIER_TXN'
  | 'SKU'
  | 'IMEI';

export interface ERPLink {
  type: ERPRecordType;
  reference: string;
  branchCode?: string;
  status?: string;
  summary?: string;
  // Deep link into the ERP once integration lands.
  url?: string;
}

export type OpsRole =
  | 'EXECUTIVE'
  | 'ADMIN'
  | 'OPERATIONS_MANAGER'
  | 'OIC'
  | 'WAREHOUSE'
  | 'FINANCE'
  | 'AUDITOR'
  | 'HR'
  | 'SALES'
  | 'CUSTOMER_SERVICE'
  | 'EMPLOYEE';
