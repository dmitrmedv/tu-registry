import type { AuditLogDto } from '@tu-registry/shared';
import { describe, expect, it } from 'vitest';
import { describeDetails } from './describeDetails';

const entry = (details: Record<string, unknown>): AuditLogDto =>
  ({
    id: 'a1',
    createdAt: '2026-11-17T10:00:00.000Z',
    action: 'TU_UPDATED',
    actor: null,
    entityType: 'TechnicalConditions',
    entityId: 'tu1',
    entityLabel: '0032/ТУ до заяви 1т/26-8',
    details,
  }) as AuditLogDto;

describe('describeDetails: changed technical conditions', () => {
  it('names a changed customer or address without values, other fields with them', () => {
    expect(
      describeDetails(
        entry({
          changes: [
            { field: 'customer' },
            { field: 'address' },
            { field: 'gasPressure', from: 'LOW', to: 'MEDIUM' },
          ],
        }),
      ),
    ).toBe('замовник за ТУ: змінено, адреса за ТУ: змінено, тиск: Низький → Середній');
  });
});
