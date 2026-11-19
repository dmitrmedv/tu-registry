import type {
  AuditAction,
  ApplicationChangeAction,
  HistoryDocumentKind,
} from '@tu-registry/shared';
import type { ClientSession, Types } from 'mongoose';
import { ApplicationChange } from './applicationChange.model';

/** A change as the audit gets it: values may be missing for customer data. */
export type FieldChange = { field: string; from?: unknown; to?: unknown };

/** The audit action of a document → the entry of «Історія змін». */
function historyAction(action: AuditAction): ApplicationChangeAction {
  const verb = action.slice(action.lastIndexOf('_') + 1);
  switch (verb) {
    case 'CREATED':
    case 'UPDATED':
    case 'CANCELLED':
    case 'RESTORED':
    case 'DELETED':
      return verb;
    default:
      throw new Error(`No history entry for ${action}`);
  }
}

/**
 * Puts a change of a document into the application's «Історія змін» (agreed 2026-11-19):
 * the card shows what was done to its responses, technical conditions and payment, not only
 * to its own fields. Called by the audit of every document (`auditDocument`, `auditPayment`),
 * so a new module that journals its documents gets its history too.
 */
export async function recordDocumentChange(
  entry: {
    applicationId: Types.ObjectId | string;
    actorId: string;
    action: AuditAction;
    document: { kind: HistoryDocumentKind; id: Types.ObjectId | string; number: string };
    changes?: FieldChange[];
  },
  session?: ClientSession,
) {
  await ApplicationChange.create(
    [
      {
        applicationId: entry.applicationId,
        changedBy: entry.actorId,
        action: historyAction(entry.action),
        document: entry.document,
        changes: (entry.changes ?? []).map(({ field, from, to }) => ({
          field,
          oldValue: from ?? null,
          newValue: to ?? null,
        })),
      },
    ],
    { session },
  );
}
