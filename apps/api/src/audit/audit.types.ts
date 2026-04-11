import type { UserRole } from '../generated/prisma/client';
import {
  AuditAction,
  AuditOutcome,
  AuditSource,
} from '../generated/prisma/enums';

export interface AuditLogInput {
  eventName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  note?: string | null;
  outcome?: AuditOutcome;
  source?: AuditSource;
  requestId?: string | null;
  traceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
}
