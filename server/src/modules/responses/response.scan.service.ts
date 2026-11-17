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
import { RESPONSE, responseDto } from './response.service';

type UploadedFile = { path: string; originalname: string; size: number };

async function loadScanEditable(applicationId: string, responseId: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, current: await loadChangeable(RESPONSE, app, responseId) };
}

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertResponseScanEditable(
  applicationId: string,
  responseId: string,
  actor: Actor,
) {
  await loadScanEditable(applicationId, responseId, actor);
}

export async function attachResponseScan(
  applicationId: string,
  responseId: string,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const app = await attachDocumentScan(
    RESPONSE,
    () => loadScanEditable(applicationId, responseId, actor),
    file,
    actor,
    context,
  );
  return responseDto(app, responseId);
}

export async function removeResponseScan(
  applicationId: string,
  responseId: string,
  actor: Actor,
  context: RequestContext,
) {
  const app = await removeDocumentScan(
    RESPONSE,
    () => loadScanEditable(applicationId, responseId, actor),
    actor,
    context,
  );
  return responseDto(app, responseId);
}

export async function responseScanFile(
  applicationId: string,
  responseId: string,
  fileId: string | undefined,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  return documentScanFile(await loadDocument(RESPONSE, app, responseId), fileId);
}
