import type { Actor } from '../applications/application.access';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import {
  attachDocumentScan,
  documentScanFile,
  removeDocumentScan,
  loadChangeable,
  loadDocument,
} from '../documents/document.service';
import { TECHNICAL_CONDITIONS, technicalConditionsDto } from './technicalConditions.service';

type UploadedFile = { path: string; originalname: string; size: number };

async function loadScanEditable(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, current: await loadChangeable(TECHNICAL_CONDITIONS, app, id) };
}

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertScanEditable(applicationId: string, id: string, actor: Actor) {
  await loadScanEditable(applicationId, id, actor);
}

export async function attachScan(
  applicationId: string,
  id: string,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const app = await attachDocumentScan(
    TECHNICAL_CONDITIONS,
    () => loadScanEditable(applicationId, id, actor),
    file,
    actor,
    context,
  );
  return technicalConditionsDto(app, id);
}

export async function removeScan(
  applicationId: string,
  id: string,
  actor: Actor,
  context: RequestContext,
) {
  const app = await removeDocumentScan(
    TECHNICAL_CONDITIONS,
    () => loadScanEditable(applicationId, id, actor),
    actor,
    context,
  );
  return technicalConditionsDto(app, id);
}

export async function scanFile(
  applicationId: string,
  id: string,
  fileId: string | undefined,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  return documentScanFile(await loadDocument(TECHNICAL_CONDITIONS, app, id), fileId);
}
