import type {
  CancelDocumentInput,
  CreateProjectData,
  ProjectDto,
  UpdateProjectData,
} from '@tu-registry/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import { type DocumentRecord, documentDtoParts, documentFileIds } from '../documents/document.dto';
import { assertDocumentDate, resolveEngineer } from '../documents/document.rules';
import {
  auditDocument,
  cancelDocument,
  changeDocuments,
  type DocumentKind,
  loadDocument,
  loadChangeable,
  restoreDocument,
  updateSeen,
  versionConflict,
} from '../documents/document.service';
import { Estimate } from '../estimates/estimate.model';
import { estimateFiles } from '../estimates/estimate.service';
import { deleteStoredFile } from '../scans/scan.storage';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { Project } from './project.model';

export type ProjectRecord = DocumentRecord & {
  technicalConditionsId: Types.ObjectId;
  approvalNumber: string;
  approvalDate: Date;
};

export const PROJECT: DocumentKind<ProjectRecord> = {
  model: Project,
  entityType: 'Project',
  actions: {
    updated: 'PROJECT_UPDATED',
    cancelled: 'PROJECT_CANCELLED',
    restored: 'PROJECT_RESTORED',
  },
  auditDetails: (project) => ({ approvalNumber: project.approvalNumber }),
  history: { kind: 'PROJECT', number: (project) => project.approvalNumber },
  messages: {
    notFound: 'Проєкт не знайдено',
    conflict: 'Проєкт щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
    cancelled: 'Проєкт скасовано: його не можна змінювати',
    notCancelled: 'Проєкт не скасовано',
    restoreTaken: 'У заяви вже є інший чинний проєкт: спершу скасуйте його.',
  },
  onCancel: { active: false },
  onRestore: { active: true },
};

const alreadyValid = () =>
  new ApiError(
    409,
    'DOCUMENT_TAKEN',
    'У заяви вже є чинний проєкт. Новий можна внести лише після скасування попереднього.',
  );

/** The stored files of `rows`, every version: for deleting them for good. */
export const projectFiles = (rows: Pick<ProjectRecord, 'scan' | 'previousScans'>[]) =>
  documentFileIds(rows).map((fileId) => ({ fileId, type: 'pdf' as const }));

/** The fields that hold a project's files: for loading only them. */
export const PROJECT_FILE_FIELDS = 'scan previousScans';

async function toDtos(rows: ProjectRecord[]): Promise<ProjectDto[]> {
  const common = await documentDtoParts(rows);
  return rows.map((row) => ({
    ...common(row),
    technicalConditionsId: String(row.technicalConditionsId),
    approvalNumber: row.approvalNumber,
    approvalDate: toIsoDate(row.approvalDate),
  }));
}

export async function projectDto(app: ApplicationDocument, id: string) {
  return (await toDtos([await loadDocument(PROJECT, app, id)]))[0]!;
}

/** Every project of a visible application, cancelled ones too, in the order approved. */
export async function listProjects(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await Project.find({ applicationId: app._id })
    .sort({ approvalDate: 1, createdAt: 1 })
    .lean<ProjectRecord[]>();
  return toDtos(rows);
}

export async function createProject(
  applicationId: string,
  input: CreateProjectData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  // The project is made under the valid technical conditions (agreed 2026-11-21).
  const tu = await TechnicalConditions.findOne({ applicationId: app._id, active: true }).lean();
  if (!tu) {
    throw new ApiError(
      409,
      'NO_TECHNICAL_CONDITIONS',
      'Проєкт вносять за чинними технічними умовами: спершу внесіть ТУ.',
    );
  }
  if (await Project.exists({ applicationId: app._id, active: true })) throw alreadyValid();
  assertDocumentDate(app, 'approvalDate', input.approvalDate, 'Дата узгодження');
  // By default, the engineer of the technical conditions, even if deactivated since.
  const engineer = await resolveEngineer(
    app,
    input.engineer ?? String(tu.engineer),
    String(tu.engineer),
  );
  let created;
  try {
    [created] = await changeDocuments(app, (session) =>
      Project.create(
        [
          {
            applicationId: app._id,
            technicalConditionsId: tu._id,
            approvalNumber: input.approvalNumber,
            approvalDate: fromIsoDate(input.approvalDate),
            engineer: engineer._id,
            engineerName: engineer.fullName,
            createdBy: actor.id,
          },
        ],
        { session },
      ),
    );
  } catch (error) {
    // Two users adding at once: the index lets one through.
    if (isDuplicateKey(error)) throw alreadyValid();
    throw error;
  }
  const record = created!.toObject() as unknown as ProjectRecord;
  await auditDocument(PROJECT, 'PROJECT_CREATED', actor, app, record, context, {
    approvalDate: input.approvalDate,
  });
  return projectDto(app, String(created!._id));
}

export async function updateProject(
  applicationId: string,
  id: string,
  input: UpdateProjectData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadChangeable(PROJECT, app, id, input.version);
  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  const $set: Record<string, unknown> = { updatedBy: actor.id };

  if (input.approvalNumber !== undefined && input.approvalNumber !== current.approvalNumber) {
    changes.push({
      field: 'approvalNumber',
      from: current.approvalNumber,
      to: input.approvalNumber,
    });
    $set.approvalNumber = input.approvalNumber;
  }
  const approvalDate = toIsoDate(current.approvalDate);
  if (input.approvalDate && input.approvalDate !== approvalDate) {
    assertDocumentDate(app, 'approvalDate', input.approvalDate, 'Дата узгодження');
    changes.push({ field: 'approvalDate', from: approvalDate, to: input.approvalDate });
    $set.approvalDate = fromIsoDate(input.approvalDate);
  }
  if (input.engineer && input.engineer !== String(current.engineer)) {
    const engineer = await resolveEngineer(app, input.engineer, String(current.engineer));
    changes.push({ field: 'engineer', from: current.engineerName, to: engineer.fullName });
    $set.engineer = engineer._id;
    $set.engineerName = engineer.fullName;
  }
  if (changes.length === 0) return projectDto(app, id);

  await changeDocuments(app, (session) =>
    updateSeen(PROJECT, current, { $set, $inc: { version: 1 } }, session),
  );
  await auditDocument(
    PROJECT,
    'PROJECT_UPDATED',
    actor,
    app,
    { ...current, approvalNumber: input.approvalNumber ?? current.approvalNumber },
    context,
    { changes },
  );
  return projectDto(app, id);
}

export async function cancelProject(
  applicationId: string,
  id: string,
  input: CancelDocumentInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await cancelDocument(PROJECT, app, id, input, actor, context);
  return projectDto(app, id);
}

export async function restoreProject(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await restoreDocument(PROJECT, app, id, version, actor, context);
  return projectDto(app, id);
}

/** For good, by an admin only, like technical conditions: the project, its estimates, all files. */
export async function deleteProject(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadDocument(PROJECT, app, id);
  if (version !== current.version) throw versionConflict(PROJECT);
  const estimates = await Estimate.find({ projectId: current._id }).select('scan imd').lean();
  await changeDocuments(app, async (session) => {
    const { deletedCount } = await Project.deleteOne({ _id: current._id, version }, { session });
    if (deletedCount === 0) throw versionConflict(PROJECT);
    await Estimate.deleteMany({ projectId: current._id }, { session });
    await auditDocument(PROJECT, 'PROJECT_DELETED', actor, app, current, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of a project still in place.
  await Promise.all(
    [...projectFiles([current]), ...estimateFiles(estimates)].map(({ fileId, type }) =>
      deleteStoredFile(fileId, type),
    ),
  );
}
