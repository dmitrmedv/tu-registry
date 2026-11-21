import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { SCAN_NAME_MAX } from '@tu-registry/shared';
import { env } from '../../config/env';

/**
 * Scans live on disk under UPLOADS_DIR: uploads land in tmp/ and move to scans/ only once
 * checked, under a generated name (never the user's). Back this folder up with the database.
 */
const root = () => path.resolve(env.UPLOADS_DIR);
export const uploadTmpDir = () => path.join(root(), 'tmp');
const scansDir = () => path.join(root(), 'scans');

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Scans are PDF; a contract is also kept as a Word document (agreed 2026-11-20). */
export type StoredFileType = 'pdf' | 'docx';

/** The stored file of a scan. The id comes from our database; checked anyway (path safety). */
export function scanPath(fileId: string, type: StoredFileType = 'pdf') {
  if (!FILE_ID.test(fileId)) throw new Error(`Invalid scan file id: ${fileId}`);
  return path.join(scansDir(), `${fileId}.${type}`);
}

export async function ensureUploadDirs() {
  await mkdir(uploadTmpDir(), { recursive: true });
  await mkdir(scansDir(), { recursive: true });
}

async function startsWith(file: string, signature: string) {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(signature.length);
    const { bytesRead } = await handle.read(head, 0, signature.length, 0);
    return bytesRead === signature.length && head.toString('latin1') === signature;
  } finally {
    await handle.close();
  }
}

/** A PDF starts with "%PDF-", whatever the browser claimed the type to be. */
export const looksLikePdf = (file: string) => startsWith(file, '%PDF-');

/** A .docx is a ZIP archive: it starts with a local file header, "PK\x03\x04". */
export const looksLikeDocx = (file: string) => startsWith(file, 'PK\x03\x04');

/** Moves a checked upload into place; returns the new file id. */
export async function storeScan(uploadedFile: string, type: StoredFileType = 'pdf') {
  await ensureUploadDirs();
  const fileId = randomUUID();
  await rename(uploadedFile, scanPath(fileId, type));
  return fileId;
}

/** Removing a file that is already gone is not an error. */
export async function removeFile(file: string) {
  await rm(file, { force: true });
}

export async function deleteScanFile(fileId: string) {
  await removeFile(scanPath(fileId));
}

export async function deleteStoredFile(fileId: string, type: StoredFileType) {
  await removeFile(scanPath(fileId, type));
}

/** The user's file name, made safe to show: no path, no control characters, bounded. */
export function scanDisplayName(originalName: string) {
  const base = path.posix.basename(originalName.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'скан.pdf').slice(0, SCAN_NAME_MAX);
}
