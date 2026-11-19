import type { AuditAction } from '@tu-registry/shared';
import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { AuditLog } from './auditLog.model';

export type RequestContext = { ip?: string; userAgent?: string };

export function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) };
}

type AuditEntry = {
  action: AuditAction;
  actor?: Types.ObjectId | string | null;
  entityType?:
    | 'User'
    | 'Application'
    | 'Department'
    | 'Engineer'
    | 'CalendarDay'
    | 'ApplicationResponse'
    | 'TechnicalConditions'
    | 'TuPayment';
  entityId?: Types.ObjectId | string;
  /** Never put passwords, tokens or personal data of customers here. */
  details?: Record<string, unknown>;
};

/** Records a refused action; the caller then throws 403. Never inside a transaction. */
export async function recordAccessDenied(
  actorId: string | null,
  details: Record<string, unknown>,
  context: RequestContext,
) {
  await recordAudit({ action: 'ACCESS_DENIED', actor: actorId, details }, context);
}

/** Pass `session` to make the audit entry part of a transaction (written only on commit). */
export async function recordAudit(
  entry: AuditEntry,
  context: RequestContext = {},
  session?: ClientSession,
) {
  await AuditLog.create(
    [{ ...entry, actor: entry.actor ?? null, ip: context.ip, userAgent: context.userAgent }],
    { session },
  );
}
