import type { ConnectionType, ProcessingStage } from '@tu-registry/shared';
import type { ClientSession, Types } from 'mongoose';
import mongoose from 'mongoose';
import { Application } from '../applications/application.model';
import { Contract } from '../contracts/contract.model';
import { ApplicationResponse } from '../responses/response.model';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';

type ResponseFacts = {
  outgoingNumber: string;
  responseDate: Date;
  createdAt: Date;
  documentsReceivedAt?: Date | null;
  engineer: Types.ObjectId;
  engineerName: string;
};
type TechnicalConditionsFacts = {
  tuNumber: string;
  preparedDate: Date;
  gasFlow: number;
  connectionType: ConnectionType;
  engineer: Types.ObjectId;
  engineerName: string;
};

/** In the order given: by date, then by when they were entered. */
export const byResponseOrder = <R extends Pick<ResponseFacts, 'responseDate' | 'createdAt'>>(
  a: R,
  b: R,
) =>
  a.responseDate.getTime() - b.responseDate.getTime() ||
  a.createdAt.getTime() - b.createdAt.getTime();

/**
 * The stage from the documents in force (not cancelled): technical conditions decide; else the
 * last response — with the documents it asked for already in, processing goes on.
 */
export function stageOf(
  responses: Pick<ResponseFacts, 'responseDate' | 'createdAt' | 'documentsReceivedAt'>[],
  technicalConditions: unknown | null,
): ProcessingStage {
  if (technicalConditions) return 'TU_PREPARED';
  const last = [...responses].sort(byResponseOrder).at(-1);
  if (!last) return 'REGISTERED';
  return last.documentsReceivedAt ? 'IN_PROGRESS' : 'RESPONDED';
}

/**
 * What the application keeps about its documents in force. `contractNumbers` — of its contracts
 * not cancelled: the search box finds them too (2026-11-22).
 */
export function summarize(
  responses: ResponseFacts[],
  tu: TechnicalConditionsFacts | null,
  contractNumbers: string[] = [],
) {
  const ordered = [...responses].sort(byResponseOrder);
  const last = ordered.at(-1);
  const engineerIds = [
    ...new Map(
      [...ordered, ...(tu ? [tu] : [])].map((doc) => [String(doc.engineer), doc.engineer]),
    ).values(),
  ];
  return {
    stage: stageOf(ordered, tu),
    lastResponseDate: last?.responseDate,
    lastResponseNumber: last?.outgoingNumber,
    tuDate: tu?.preparedDate,
    tuNumber: tu?.tuNumber,
    gasFlow: tu?.gasFlow,
    connectionType: tu?.connectionType,
    engineerName: (tu ?? last)?.engineerName,
    engineerIds,
    contractNumber: contractNumbers.at(-1),
    documentNumbers: [
      ...ordered.map((r) => r.outgoingNumber),
      ...(tu ? [tu.tuNumber] : []),
      ...contractNumbers,
    ],
  };
}

/**
 * Rewrites the application's summary from its documents. Called in the transaction of every
 * change of them (and by `db:migrate`); does not touch the application's version or
 * updatedAt — documents never conflict with an edit of its fields.
 */
export async function recomputeProcessing(applicationId: Types.ObjectId, session?: ClientSession) {
  const notCancelled = { applicationId, cancellation: mongoose.trusted({ $exists: false }) };
  const [responses, tu, contracts] = await Promise.all([
    ApplicationResponse.find(notCancelled)
      .session(session ?? null)
      .lean<ResponseFacts[]>(),
    TechnicalConditions.findOne({ applicationId, active: true })
      .session(session ?? null)
      .lean<TechnicalConditionsFacts>(),
    Contract.find(notCancelled)
      .select('contractNumber')
      .sort({ contractDate: 1, createdAt: 1 })
      .session(session ?? null)
      .lean<{ contractNumber: string }[]>(),
  ]);
  const summary = summarize(
    responses,
    tu,
    contracts.map((contract) => contract.contractNumber),
  );
  // Unset what is absent, so nothing stale survives (a cancelled TU's number, say).
  const processing = Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined),
  );
  await Application.updateOne(
    { _id: applicationId },
    { $set: { processing } },
    { session, timestamps: false },
  );
  return summary;
}
