import {
  type AuditAction,
  type CancelDocumentInput,
  type ContractDraftDto,
  formatContractNumber,
  parseContractNumber,
  type SaveContractData,
} from '@tu-registry/shared';
import mongoose, { type ClientSession } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import { type FieldChange, recordDocumentChange } from '../applications/applicationChange.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { assertUsableDepartment, departmentCode } from '../departments/department.service';
import { assertDocumentDate, regNumberOf } from '../documents/document.rules';
import { deleteStoredFile } from '../scans/scan.storage';
import type { TechnicalConditionsRecord } from '../technicalConditions/technicalConditions.service';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { type ContractRecord, contractDtos, contractFiles } from './contract.dto';
import { Contract } from './contract.model';

export const contractConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Договір щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );
export const contractNotFound = () => ApiError.notFound('Договір не знайдено');
const noTechnicalConditions = () =>
  new ApiError(
    409,
    'NO_TECHNICAL_CONDITIONS',
    'Договір складається за чинними технічними умовами: спершу внесіть ТУ.',
  );
const numberTaken = (contractNumber: string) => {
  const message = `Договір № ${contractNumber} уже є в цьому управлінні`;
  return new ApiError(409, 'CONFLICT', message, {
    formErrors: [],
    fieldErrors: { contractNumber: [message] },
  });
};

/** Customer data: its values go to the application's history, never to the audit. */
const CUSTOMER_FIELDS = new Set(['customer', 'address', 'representative', 'comment']);

/**
 * Journals a change of a contract in the application's «Історія змін» (with the values) and in
 * the audit (our own numbers only).
 */
export async function auditContract(
  action: AuditAction,
  actor: Actor,
  app: ApplicationDocument,
  contract: Pick<ContractRecord, '_id' | 'contractNumber'>,
  context: RequestContext,
  { changes, ...extra }: { changes?: FieldChange[] } & Record<string, unknown> = {},
  session?: ClientSession,
) {
  await recordDocumentChange(
    {
      applicationId: app._id,
      actorId: actor.id,
      action,
      document: { kind: 'CONTRACT', id: contract._id, number: contract.contractNumber },
      changes,
    },
    session,
  );
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'Contract',
      entityId: contract._id,
      details: {
        applicationId: String(app._id),
        regNumber: await regNumberOf(app),
        contractNumber: contract.contractNumber,
        ...extra,
        ...(changes && {
          changes: changes.map((change) =>
            CUSTOMER_FIELDS.has(change.field) ? { field: change.field } : change,
          ),
        }),
      },
    },
    context,
    session,
  );
}

/** A contract of this application (another application's is "not found"). */
export async function loadContract(app: ApplicationDocument, id: string) {
  const contract = await Contract.findOne({
    _id: id,
    applicationId: app._id,
  }).lean<ContractRecord>();
  if (!contract) throw contractNotFound();
  return contract;
}

/** A contract open to changes: of an editable application, not cancelled. */
export async function loadChangeableContract(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  const contract = await loadContract(app, id);
  if (contract.cancellation) {
    throw new ApiError(409, 'DOCUMENT_CANCELLED', 'Скасований договір не змінюється');
  }
  return { app, contract };
}

export async function contractDto(app: ApplicationDocument, id: string) {
  return (await contractDtos([await loadContract(app, id)]))[0]!;
}

function validTechnicalConditions(app: ApplicationDocument) {
  return TechnicalConditions.findOne({
    applicationId: app._id,
    active: true,
  }).lean<TechnicalConditionsRecord>();
}

/** The department's largest number + 1, cancelled contracts included (agreed 2026-11-20). */
async function nextSequence(department: string) {
  const last = await Contract.findOne({
    department,
    // The index's own condition, so the query can use it.
    sequence: mongoose.trusted({ $gte: 1 }),
  })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean<{ sequence: number }>();
  return (last?.sequence ?? 0) + 1;
}

/** The place of the number in the department's sequence, when it is written our way. */
async function sequenceOf(contractNumber: string, department: string) {
  const parsed = parseContractNumber(contractNumber);
  return parsed && parsed.departmentCode === (await departmentCode(department))
    ? parsed.sequence
    : null;
}

/** Every contract of a visible application, cancelled ones too, in the order made. */
export async function listContracts(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await Contract.find({ applicationId: app._id })
    .sort({ contractDate: 1, createdAt: 1 })
    .lean<ContractRecord[]>();
  return contractDtos(rows);
}

/**
 * What the new contract's form starts with: the valid TU's date, customer and address, and the
 * next number of `department` (the application's by default). When the application already has
 * a valid contract, another one is numbered and dated by hand (agreed 2026-11-20).
 */
export async function contractDraft(
  applicationId: string,
  department: string | undefined,
  actor: Actor,
): Promise<ContractDraftDto> {
  const app = await loadEditableApplication(applicationId, actor);
  const tu = await validTechnicalConditions(app);
  if (!tu) throw noTechnicalConditions();
  const chosen = department ?? app.department;
  const another = await Contract.exists({ applicationId: app._id, cancellation: null });
  return {
    connectionType: tu.connectionType,
    contractNumber: another
      ? null
      : formatContractNumber(
          await nextSequence(chosen),
          await departmentCode(chosen),
          tu.connectionType === 'RECONSTRUCTION',
        ),
    contractDate: another ? null : toIsoDate(tu.preparedDate),
    department: chosen,
    customer: tu.customer,
    address: tu.address,
  };
}

async function assertDates(app: ApplicationDocument, input: SaveContractData) {
  await assertDocumentDate(app, 'contractDate', input.contractDate, 'Дата договору');
  if (input.signedDate) {
    await assertDocumentDate(app, 'signedDate', input.signedDate, 'Дата укладання договору');
  }
}

const valuesOf = async (input: SaveContractData) => ({
  contractNumber: input.contractNumber,
  sequence: await sequenceOf(input.contractNumber, input.department),
  contractDate: fromIsoDate(input.contractDate),
  department: input.department,
  customer: input.customer,
  address: input.address,
  signedDate: input.signedDate ? fromIsoDate(input.signedDate) : null,
  representative: input.representative,
  comment: input.comment,
});

/** Adds a contract after the valid technical conditions (`version` is ignored). */
export async function createContract(
  applicationId: string,
  input: SaveContractData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const tu = await validTechnicalConditions(app);
  if (!tu) throw noTechnicalConditions();
  await assertUsableDepartment(input.department);
  await assertDates(app, input);
  let created;
  try {
    created = await Contract.create({
      ...(await valuesOf(input)),
      applicationId: app._id,
      technicalConditionsId: tu._id,
      connectionType: tu.connectionType,
      createdBy: actor.id,
    });
  } catch (error) {
    // The same number twice in a department, or two users taking the next one at once.
    if (isDuplicateKey(error)) throw numberTaken(input.contractNumber);
    throw error;
  }
  await auditContract('CONTRACT_CREATED', actor, app, created, context, {
    contractDate: input.contractDate,
  });
  return contractDto(app, String(created._id));
}

/** Changes the contract the user saw (`version`). */
export async function updateContract(
  applicationId: string,
  id: string,
  input: SaveContractData & { version: number },
  actor: Actor,
  context: RequestContext,
) {
  const { app, contract } = await loadChangeableContract(applicationId, id, actor);
  if (input.version !== contract.version) throw contractConflict();
  if (input.department !== contract.department) await assertUsableDepartment(input.department);
  await assertDates(app, input);
  const shown = {
    contractNumber: contract.contractNumber,
    contractDate: toIsoDate(contract.contractDate),
    department: contract.department,
    customer: contract.customer,
    address: contract.address,
    signedDate: contract.signedDate ? toIsoDate(contract.signedDate) : null,
    representative: contract.representative,
    comment: contract.comment,
  };
  const changes = (Object.keys(shown) as (keyof typeof shown)[])
    .filter((field) => shown[field] !== input[field])
    .map((field) => ({ field, from: shown[field], to: input[field] }));
  if (changes.length === 0) return contractDto(app, id);

  try {
    const { matchedCount } = await Contract.updateOne(
      { _id: contract._id, version: contract.version },
      { $set: { ...(await valuesOf(input)), updatedBy: actor.id }, $inc: { version: 1 } },
    );
    if (matchedCount === 0) throw contractConflict();
  } catch (error) {
    if (isDuplicateKey(error)) throw numberTaken(input.contractNumber);
    throw error;
  }
  await auditContract(
    'CONTRACT_UPDATED',
    actor,
    app,
    { _id: contract._id, contractNumber: input.contractNumber },
    context,
    { changes },
  );
  return contractDto(app, id);
}

/** A cancelled contract stays in the card (red frame); its number stays taken. */
export async function cancelContract(
  applicationId: string,
  id: string,
  input: Required<CancelDocumentInput>,
  actor: Actor,
  context: RequestContext,
) {
  const { app, contract } = await loadChangeableContract(applicationId, id, actor);
  if (input.version !== contract.version) throw contractConflict();
  const { matchedCount } = await Contract.updateOne(
    { _id: contract._id, version: contract.version },
    {
      $set: { cancellation: { reason: input.reason, at: clock.now(), by: actor.id } },
      $inc: { version: 1 },
    },
  );
  if (matchedCount === 0) throw contractConflict();
  await auditContract('CONTRACT_CANCELLED', actor, app, contract, context);
  return contractDto(app, id);
}

/**
 * Admin only (enforced by the route): removes the contract with its files for good, cancelled
 * or not (a mistake is a mistake). The audit keeps the number.
 */
export async function deleteContract(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const contract = await loadContract(app, id);
  if (version !== contract.version) throw contractConflict();
  await inTransaction(async (session) => {
    const { deletedCount } = await Contract.deleteOne({ _id: contract._id, version }, { session });
    if (deletedCount === 0) throw contractConflict();
    await auditContract('CONTRACT_DELETED', actor, app, contract, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of a contract still in place.
  await Promise.all(
    contractFiles([contract]).map(({ fileId, type }) => deleteStoredFile(fileId, type)),
  );
}
