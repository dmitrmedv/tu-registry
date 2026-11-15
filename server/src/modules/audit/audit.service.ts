import type { AuditAction } from '@tu-registry/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AuditLog } from './auditLog.model';

export type RequestContext = { ip?: string; userAgent?: string };

export function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) };
}

type AuditEntry = {
  action: AuditAction;
  actor?: Types.ObjectId | string | null;
  entityType?: 'User' | 'Application';
  entityId?: Types.ObjectId | string;
  /** Never put passwords, tokens or personal data of customers here. */
  details?: Record<string, unknown>;
};

export async function recordAudit(entry: AuditEntry, context: RequestContext = {}) {
  await AuditLog.create({
    ...entry,
    actor: entry.actor ?? null,
    ip: context.ip,
    userAgent: context.userAgent,
  });
}
