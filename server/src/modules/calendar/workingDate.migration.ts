import { type HistoryDocumentKind, INVOICE_NO_NUMBER } from '@tu-registry/shared';
import { type Model, Types } from 'mongoose';
import { inTransaction } from '../../utils/db';
import { fromIsoDate, previousIsoDate, toIsoDate } from '../../utils/kyivDate';
import { ApplicationChange } from '../applications/applicationChange.model';
import { Application } from '../applications/application.model';
import { Contract } from '../contracts/contract.model';
import { regNumberOf } from '../documents/document.rules';
import { Estimate } from '../estimates/estimate.model';
import { Invoice } from '../invoices/invoice.model';
import { recomputeProcessing } from '../processing/processing.summary';
import { Project } from '../projects/project.model';
import { ApplicationResponse } from '../responses/response.model';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { TuPayment } from '../tuPayments/tuPayment.model';
import { CalendarDay } from './calendarDay.model';
import { type CalendarExceptions, isWorkingDay } from './workingDays';

/** The working day on or before `isoDate`. */
export function previousWorkingDay(isoDate: string, exceptions: CalendarExceptions) {
  let day = isoDate;
  while (!isWorkingDay(day, exceptions)) day = previousIsoDate(day);
  return day;
}

type Row = Record<string, unknown> & { _id: Types.ObjectId; applicationId: Types.ObjectId };

/** The document dates a user picks, with what names the document in «Історія змін». */
const DOCUMENTS: {
  model: Model<never>;
  kind: HistoryDocumentKind;
  fields: string[];
  number: (row: Row, projects: Map<string, string>) => string;
}[] = [
  {
    model: ApplicationResponse as unknown as Model<never>,
    kind: 'RESPONSE',
    fields: ['responseDate'],
    number: (row) => String(row.outgoingNumber),
  },
  {
    model: TechnicalConditions as unknown as Model<never>,
    kind: 'TECHNICAL_CONDITIONS',
    fields: ['preparedDate'],
    number: (row) => String(row.tuNumber),
  },
  {
    model: TuPayment as unknown as Model<never>,
    kind: 'TU_PAYMENT',
    fields: ['invoiceDate', 'contractDate', 'paidDate'],
    number: (row) => String(row.invoiceNumber),
  },
  {
    model: Contract as unknown as Model<never>,
    kind: 'CONTRACT',
    fields: ['contractDate', 'signedDate'],
    number: (row) => String(row.contractNumber),
  },
  {
    model: Project as unknown as Model<never>,
    kind: 'PROJECT',
    fields: ['approvalDate'],
    number: (row) => String(row.approvalNumber),
  },
  {
    model: Estimate as unknown as Model<never>,
    kind: 'ESTIMATE',
    fields: ['checkDate'],
    number: (row, projects) => projects.get(String(row.projectId)) ?? '—',
  },
  {
    model: Invoice as unknown as Model<never>,
    kind: 'INVOICE',
    fields: ['invoiceDate'],
    number: (row) => (row.invoiceNumber as string | null) ?? INVOICE_NO_NUMBER,
  },
];

export type DateMove = {
  applicationId: string;
  regNumber: string;
  /** The document's kind, or null for the application's registration date. */
  kind: HistoryDocumentKind | null;
  id: string;
  number: string;
  changes: { field: string; from: string; to: string }[];
  /** Why it is left as it is, when it is. */
  skipped?: string;
};

/**
 * Every saved date the user picked that falls on a day off by the calendar now (2026-11-22),
 * with the working day before it. Changes nothing.
 *
 * Moving back keeps the order of the dates: a document stays on or after its registration
 * date, an invoice on or after its approval. A registration date that would move into the
 * previous year is left (its number carries the year), and so are the documents it would
 * leave before it.
 */
export async function planWorkingDateMoves(): Promise<DateMove[]> {
  const exceptions: CalendarExceptions = new Map(
    (await CalendarDay.find().select('kind').lean()).map((day) => [day._id, day.kind]),
  );
  const moved = (date: unknown) => {
    if (!(date instanceof Date)) return null;
    const from = toIsoDate(date);
    const to = previousWorkingDay(from, exceptions);
    return to === from ? null : { from, to };
  };

  const apps = await Application.find()
    .select('regDate regYear regSeq department')
    .lean<
      { _id: Types.ObjectId; regDate: Date; regYear: number; regSeq: number; department: string }[]
    >();
  const regNumbers = new Map<string, string>();
  const regDates = new Map<string, string>();
  const moves: DateMove[] = [];
  for (const app of apps) {
    const id = String(app._id);
    regNumbers.set(id, await regNumberOf(app as never));
    const move = moved(app.regDate);
    regDates.set(id, toIsoDate(app.regDate));
    if (!move) continue;
    const skipped =
      move.to.slice(0, 4) === move.from.slice(0, 4)
        ? undefined
        : 'робочий день перед датою — у попередньому році, а номер заяви містить рік';
    if (!skipped) regDates.set(id, move.to);
    moves.push({
      applicationId: id,
      regNumber: regNumbers.get(id)!,
      kind: null,
      id,
      number: regNumbers.get(id)!,
      changes: [{ field: 'regDate', ...move }],
      ...(skipped && { skipped }),
    });
  }

  const projects = new Map(
    (await Project.find().select('approvalNumber').lean()).map((p) => [
      String(p._id),
      p.approvalNumber,
    ]),
  );
  for (const document of DOCUMENTS) {
    const rows = await document.model.find().lean<Row[]>();
    for (const row of rows) {
      const changes = document.fields.flatMap((field) => {
        const move = moved(row[field]);
        return move ? [{ field, ...move }] : [];
      });
      if (changes.length === 0) continue;
      const applicationId = String(row.applicationId);
      const regDate = regDates.get(applicationId);
      const early = changes.find((change) => regDate && change.to < regDate);
      moves.push({
        applicationId,
        regNumber: regNumbers.get(applicationId) ?? '—',
        kind: document.kind,
        id: String(row._id),
        number: document.number(row, projects),
        changes,
        ...(early && { skipped: 'робочий день перед датою — раніше дати реєстрації заяви' }),
      });
    }
  }
  return moves;
}

/**
 * Moves the dates planned, each document with its entry in «Історія змін» by `actorId`, and
 * recounts the processing of the applications touched. Returns how many records moved.
 */
export async function applyWorkingDateMoves(moves: DateMove[], actorId: string) {
  const touched = new Set<string>();
  let count = 0;
  for (const move of moves) {
    if (move.skipped) continue;
    const model =
      move.kind === null
        ? (Application as unknown as Model<never>)
        : DOCUMENTS.find((document) => document.kind === move.kind)!.model;
    await inTransaction(async (session) => {
      // The raw collection: the dates are set as they are, whatever the model's types.
      await model.collection.updateOne(
        { _id: new Types.ObjectId(move.id) },
        {
          $set: Object.fromEntries(move.changes.map((c) => [c.field, fromIsoDate(c.to)])),
          // Open forms then report a conflict instead of writing the old date back.
          $inc: { version: 1 },
        },
        { session },
      );
      await ApplicationChange.create(
        [
          {
            applicationId: move.applicationId,
            changedBy: actorId,
            action: 'UPDATED',
            document:
              move.kind === null ? null : { kind: move.kind, id: move.id, number: move.number },
            changes: move.changes.map((c) => ({
              field: c.field,
              oldValue: c.from,
              newValue: c.to,
            })),
          },
        ],
        { session },
      );
    });
    touched.add(move.applicationId);
    count += 1;
  }
  for (const id of touched) {
    await recomputeProcessing(new Types.ObjectId(id));
  }
  return count;
}
