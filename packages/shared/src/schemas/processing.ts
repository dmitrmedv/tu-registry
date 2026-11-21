import type { ProcessingStage } from '../enums';
import type { DeadlineDto } from './calendar';

/** What happened in the processing of an application, in the order it happened. */
export const TIMELINE_EVENT_TYPES = [
  'REGISTERED',
  'RESPONSE',
  'DOCUMENTS_RECEIVED',
  'TECHNICAL_CONDITIONS',
  // The payment for the valid or cancelled TU (agreed 2026-11-19).
  'TU_INVOICE',
  'TU_PAID',
  'TU_ACT_TRANSFERRED',
  // The contract made up, then signed (2026-11-20); an annulled one is struck through.
  'CONTRACT',
  'CONTRACT_SIGNED',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineEventDto = {
  type: TimelineEventType;
  date: string;
  /** The registration, response or technical conditions number; none for documents received. */
  number: string | null;
  /** Who registered it, or the engineer of the document. */
  person: string | null;
  /** The response or technical conditions it belongs to (their scan opens through it). */
  documentId: string | null;
  scanName: string | null;
  /** Working days from the registration date (not counted) to this event. */
  workingDays: number;
  /** The term for this kind of document, if it has one. */
  norm: number | null;
  /** Working days past the term; 0 when within it or without one. */
  overdueBy: number;
  /** For technical conditions after the documents came: working days since they came. */
  sinceDocumentsReceived: number | null;
  /** A cancelled document stays where it was, struck through. */
  cancelled: boolean;
  /** An event known by its month only ("YYYY-MM"): the act handed to accounting. */
  month: string | null;
};

export type ProcessingDto = {
  stage: ProcessingStage;
  deadlines: {
    /** False for applications registered before deadlines were tracked: no warnings. */
    tracked: boolean;
    /** None once technical conditions came without any response: no response was needed. */
    response: DeadlineDto | null;
    tu: DeadlineDto;
  };
  events: TimelineEventDto[];
};
