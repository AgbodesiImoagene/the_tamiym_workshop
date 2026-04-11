import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import { AuditOutcome, AuditSource } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestContext } from '../request-context/request-context.store';
import { trace } from '@opentelemetry/api';
import type { AuditLogInput } from './audit.types';

type AuditDbClient = PrismaService | Prisma.TransactionClient;

const REDACTED_VALUE = '[REDACTED]';
const REDACTED_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /refresh/i,
  /signature/i,
  /accountnumber/i,
  /iban/i,
  /routingnumber/i,
  /bankaccount/i,
  /cardnumber/i,
  /cvv/i,
  /pin\b/i,
  /apikey/i,
  /privatekey/i,
];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an immutable audit log entry.
   *
   * DB failures are caught and logged at ERROR level but NOT re-thrown.
   * An audit write must never abort the calling business transaction — the
   * caller should pass `db` (the active transaction client) when it needs the
   * write to be part of the same transaction; otherwise the log is best-effort.
   */
  async log(
    input: AuditLogInput,
    db: AuditDbClient = this.prisma,
  ): Promise<void> {
    const context = getRequestContext();
    const traceId =
      input.traceId ?? trace.getActiveSpan()?.spanContext().traceId ?? null;
    const source = input.source ?? this.resolveSource(context?.source);

    try {
      await db.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? context?.actorUserId ?? null,
          actorRole: input.actorRole ?? this.asUserRole(context?.actorRole),
          eventName: input.eventName,
          action: input.action,
          outcome: input.outcome ?? AuditOutcome.SUCCESS,
          source,
          requestId: input.requestId ?? context?.requestId ?? null,
          traceId,
          ipAddress: input.ipAddress ?? context?.ipAddress ?? null,
          userAgent: input.userAgent ?? context?.userAgent ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          before: this.toJsonValue(input.before),
          after: this.toJsonValue(input.after),
          metadata: this.toJsonValue(input.metadata),
          note: input.note ?? null,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `AuditService.log failed for event=${input.eventName} entity=${input.entityType}:${input.entityId} — ${err instanceof Error ? err.message : String(err)}`,
      );
      // Intentionally not re-thrown: audit failures must not abort business logic.
    }
  }

  private resolveSource(source?: string | null): AuditSource {
    switch (source) {
      case AuditSource.ADMIN_API:
        return AuditSource.ADMIN_API;
      case AuditSource.PUBLIC_API:
        return AuditSource.PUBLIC_API;
      case AuditSource.WEBHOOK:
        return AuditSource.WEBHOOK;
      case AuditSource.WORKER:
        return AuditSource.WORKER;
      case AuditSource.CRON:
        return AuditSource.CRON;
      default:
        return AuditSource.SYSTEM;
    }
  }

  private asUserRole(role?: string | null) {
    switch (role) {
      case UserRole.ADMIN:
        return UserRole.ADMIN;
      case UserRole.ORGANIZER:
        return UserRole.ORGANIZER;
      case UserRole.CUSTOMER:
        return UserRole.CUSTOMER;
      default:
        return null;
    }
  }

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    const sanitized = this.sanitizeValue(value, 0);
    return sanitized === null ? Prisma.JsonNull : sanitized;
  }

  private sanitizeValue(
    value: unknown,
    depth: number,
  ): Prisma.InputJsonValue | null {
    if (value === null) {
      return null;
    }
    if (depth > 6) {
      return '[Truncated]';
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeValue(entry, depth + 1));
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const next: Record<string, Prisma.InputJsonValue | null> = {};

      for (const [key, entry] of Object.entries(record)) {
        if (entry === undefined) {
          continue;
        }
        next[key] = this.shouldRedact(key)
          ? REDACTED_VALUE
          : this.sanitizeValue(entry, depth + 1);
      }

      return next;
    }

    return '[UnsupportedValue]';
  }

  private shouldRedact(key: string): boolean {
    return REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }
}
