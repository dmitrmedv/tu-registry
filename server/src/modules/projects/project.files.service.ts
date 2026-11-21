import type { Actor } from '../applications/application.access';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import {
  attachDocumentScan,
  documentScanFile,
  loadChangeable,
  loadDocument,
  removeDocumentScan,
} from '../documents/document.service';
import { PROJECT, projectDto } from './project.service';

type UploadedFile = { path: string; originalname: string; size: number };

async function loadEditable(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, current: await loadChangeable(PROJECT, app, id) };
}

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertEditable(applicationId: string, id: string, actor: Actor) {
  await loadEditable(applicationId, id, actor);
}

// The project's scan: replaced ones are kept, like the scans of technical conditions.

export async function attachScan(
  applicationId: string,
  id: string,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const app = await attachDocumentScan(
    PROJECT,
    () => loadEditable(applicationId, id, actor),
    file,
    actor,
    context,
  );
  return projectDto(app, id);
}

export async function removeScan(
  applicationId: string,
  id: string,
  actor: Actor,
  context: RequestContext,
) {
  const app = await removeDocumentScan(
    PROJECT,
    () => loadEditable(applicationId, id, actor),
    actor,
    context,
  );
  return projectDto(app, id);
}

export async function scanFile(
  applicationId: string,
  id: string,
  fileId: string | undefined,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  return documentScanFile(await loadDocument(PROJECT, app, id), fileId);
}
