import {
  type AuditListQueryData,
  type AuditLogDto,
  formatRegNumber,
  type Paginated,
} from '@tu-registry/shared';
import mongoose from 'mongoose';
import { kyivDayStart, nextIsoDate } from '../../utils/kyivDate';
import { Application } from '../applications/application.model';
import { departmentDirectory } from '../departments/department.service';
import { findUserSummaries } from '../users/user.service';
import { AuditLog } from './auditLog.model';

/** The audit journal, newest first. Read-only: there is no API to change or delete entries. */
/** A string value from an entry's details, if present. */
function detailString(details: unknown, key: string) {
  const value = (details as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'string' ? value : null;
}

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
  const [users, applications, departments] = await Promise.all([
    findUserSummaries(userIds),
    applicationIds.length
      ? Application.find({ _id: mongoose.trusted({ $in: applicationIds }) })
          .select('regYear regSeq department')
          .lean()
      : [],
    departmentDirectory(),
  ]);
  const regNumbers = new Map(
    applications.map((app) => [
      String(app._id),
      formatRegNumber(app.regYear, app.regSeq, departments.get(app.department)?.code ?? 0),
    ]),
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
            ? // A deleted application is gone; its entries still carry the number in details.
              (regNumbers.get(entityId) ?? detailString(row.details, 'regNumber'))
            : entityType === 'Department'
              ? (departments.get(entityId)?.name ?? detailString(row.details, 'name'))
              : entityType === 'Engineer'
                ? // The name as it was then: the entries are few, a lookup is not worth it.
                  detailString(row.details, 'fullName')
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
