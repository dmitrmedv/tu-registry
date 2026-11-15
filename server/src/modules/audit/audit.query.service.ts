import {
  type AuditListQueryData,
  type AuditLogDto,
  formatRegNumber,
  type Paginated,
} from '@tu-registry/shared';
import mongoose from 'mongoose';
import { kyivDayStart, nextIsoDate } from '../../utils/kyivDate';
import { Application } from '../applications/application.model';
import { findUserSummaries } from '../users/user.service';
import { AuditLog } from './auditLog.model';

/** The audit journal, newest first. Read-only: there is no API to change or delete entries. */
export async function listAuditLogs(query: AuditListQueryData): Promise<Paginated<AuditLogDto>> {
  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.actor) filter.actor = query.actor;
  if (query.dateFrom || query.dateTo) {
    // Kyiv calendar days, both inclusive.
    filter.createdAt = mongoose.trusted({
      ...(query.dateFrom && { $gte: kyivDayStart(query.dateFrom) }),
      ...(query.dateTo && { $lt: kyivDayStart(nextIsoDate(query.dateTo)) }),
    });
  }

  const [rows, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const idOf = (value: unknown) => (value ? String(value) : null);
  const userIds = rows.flatMap((row) => [
    idOf(row.actor),
    row.entityType === 'User' ? idOf(row.entityId) : null,
  ]);
  const applicationIds = rows
    .filter((row) => row.entityType === 'Application' && row.entityId)
    .map((row) => String(row.entityId));
  const [users, applications] = await Promise.all([
    findUserSummaries(userIds),
    applicationIds.length
      ? Application.find({ _id: mongoose.trusted({ $in: applicationIds }) })
          .select('regYear regSeq')
          .lean()
      : [],
  ]);
  const regNumbers = new Map(
    applications.map((app) => [String(app._id), formatRegNumber(app.regYear, app.regSeq)]),
  );

  return {
    data: rows.map((row) => {
      const actorId = idOf(row.actor);
      const entityId = idOf(row.entityId);
      const entityType = (row.entityType as AuditLogDto['entityType']) ?? null;
      return {
        id: String(row._id),
        createdAt: (row.createdAt as Date).toISOString(),
        action: row.action,
        actor: actorId ? (users.get(actorId) ?? { id: actorId, fullName: '—', login: '' }) : null,
        entityType,
        entityId,
        entityLabel: !entityId
          ? null
          : entityType === 'Application'
            ? (regNumbers.get(entityId) ?? null)
            : (users.get(entityId)?.login ?? null),
        details: (row.details as Record<string, unknown> | undefined) ?? null,
        ip: row.ip ?? null,
      };
    }),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
