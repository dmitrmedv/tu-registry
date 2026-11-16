import { z } from 'zod';
import { AUDIT_ACTIONS, type AuditAction } from '../enums';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const auditListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(10).max(100).default(50),
    action: z.preprocess(emptyToUndefined, z.enum(AUDIT_ACTIONS).optional()),
    actor: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-f\d]{24}$/i, 'Некоректний користувач')
        .optional(),
    ),
    /** Kyiv calendar dates, both inclusive. */
    dateFrom: z.preprocess(emptyToUndefined, z.iso.date('Некоректна дата').optional()),
    dateTo: z.preprocess(emptyToUndefined, z.iso.date('Некоректна дата').optional()),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    path: ['dateTo'],
    message: 'Кінець періоду раніше за початок',
  });

export type AuditListQuery = z.input<typeof auditListQuerySchema>;
export type AuditListQueryData = z.output<typeof auditListQuerySchema>;

export type AuditLogDto = {
  id: string;
  createdAt: string;
  action: AuditAction;
  actor: { id: string; fullName: string; login: string } | null;
  entityType: 'User' | 'Application' | 'Department' | 'Engineer' | 'CalendarDay' | null;
  entityId: string | null;
  /** Human-readable object: the application number or the user's login. */
  entityLabel: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
};
