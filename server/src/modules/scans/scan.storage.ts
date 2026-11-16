import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';

/**
 * Scans live on disk under UPLOADS_DIR: uploads land in tmp/ and move to scans/ only once
 * checked, under a generated name (never the user's). Back this folder up with the database.
 */
const root = () => path.resolve(env.UPLOADS_DIR);
export const uploadTmpDir = () => path.join(root(), 'tmp');
const scansDir = () => path.join(root(), 'scans');

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The stored file of a scan. The id comes from our database; checked anyway (path safety). */
export function scanPath(fileId: string) {
  if (!FILE_ID.test(fileId)) throw new Error(`Invalid scan file id: ${fileId}`);
  return path.join(scansDir(), `${fileId}.pdf`);
}

export async function ensureUploadDirs() {
  await mkdir(uploadTmpDir(), { recursive: true });
  await mkdir(scansDir(), { recursive: true });
}

/** A PDF starts with "%PDF-", whatever the browser claimed the type to be. */
export async function looksLikePdf(file: string) {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(5);
    const { bytesRead } = await handle.read(head, 0, 5, 0);
    return bytesRead === 5 && head.toString('latin1') === '%PDF-';
  } finally {
    await handle.close();
  }
}

/** Moves a checked upload into place; returns the new file id. */
export async function storeScan(uploadedFile: string) {
  await ensureUploadDirs();
  const fileId = randomUUID();
  await rename(uploadedFile, scanPath(fileId));
  return fileId;
}

/** Removing a file that is already gone is not an error. */
export async function removeFile(file: string) {
  await rm(file, { force: true });
}

export async function deleteScanFile(fileId: string) {
  await removeFile(scanPath(fileId));
}
