import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { SCAN_MAX_BYTES } from '@tu-registry/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { scanPath, uploadTmpDir } from '../scans/scan.storage';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n');

describe('application scan (PDF)', () => {
  useTestDb();

  let owner: ApiSession;
  let colleague: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;

  beforeEach(async () => {
    owner = await signedInWithAuth(app, { login: 'owner' });
    colleague = await signedInWithAuth(app, { login: 'colleague' });
    elsewhere = await signedInWithAuth(app, { login: 'elsewhere', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    applicationId = (await registerApplication(app, owner)).id;
  });

  const upload = (
    who: ApiSession,
    content: Buffer = PDF,
    filename = 'Скан заяви.pdf',
    contentType = 'application/pdf',
    id = applicationId,
  ) =>
    request(app)
      .put(`${APPLICATIONS}/${id}/scan`)
      .set(who.auth)
      .attach('scan', content, { filename, contentType });
  const download = (who: ApiSession) =>
    request(app)
      .get(`${APPLICATIONS}/${applicationId}/scan`)
      .set(who.auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
  const removeScan = (who: ApiSession) =>
    request(app).delete(`${APPLICATIONS}/${applicationId}/scan`).set(who.auth);
  const storedFileId = async () => (await Application.findById(applicationId).lean())?.scan?.fileId;
  const leftoverUploads = async () => (await readdir(uploadTmpDir()).catch(() => [])).length;

  it('stores a PDF under a generated name and describes it in the card and the history', async () => {
    const res = await upload(owner);

    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({
      name: 'Скан заяви.pdf',
      size: PDF.length,
      uploadedBy: { id: owner.user.id },
    });
    // A scan does not bump the version: it never conflicts with an edit of the fields.
    expect(res.body.version).toBe(1);
    const fileId = await storedFileId();
    expect(fileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(scanPath(fileId!))).toBe(true);
    expect(await leftoverUploads()).toBe(0);
    const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
    expect(change!.changes).toEqual([
      { field: 'scan', oldValue: null, newValue: 'Скан заяви.pdf' },
    ]);
  });

  it('serves the PDF inline with its Ukrainian name and no caching', async () => {
    await upload(owner);

    const res = await download(colleague);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `inline; filename="____ _____.pdf"; filename*=UTF-8''${encodeURIComponent('Скан заяви.pdf')}`,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
  });

  it('replaces the scan and removes the previous file', async () => {
    await upload(owner, PDF, 'перший.pdf');
    const first = await storedFileId();

    const res = await upload(colleague, PDF, 'другий.pdf');

    expect(res.body.scan.name).toBe('другий.pdf');
    expect(existsSync(scanPath(first!))).toBe(false);
    expect(existsSync(scanPath((await storedFileId())!))).toBe(true);
    const change = await ApplicationChange.findOne({ action: 'UPDATED' }).sort({ _id: -1 }).lean();
    expect(change!.changes).toEqual([
      { field: 'scan', oldValue: 'перший.pdf', newValue: 'другий.pdf' },
    ]);
  });

  it('removes the scan', async () => {
    await upload(owner);
    const fileId = await storedFileId();

    const res = await removeScan(owner);

    expect(res.body.scan).toBeNull();
    expect(existsSync(scanPath(fileId!))).toBe(false);
    expect((await download(owner)).status).toBe(404);
    expect((await removeScan(owner)).status).toBe(404);
  });

  describe('refused uploads leave nothing behind', () => {
    it('a file that only claims to be a PDF', async () => {
      const res = await upload(owner, Buffer.from('MZ\x90\x00 not a pdf at all'), 'virus.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SCAN_NOT_PDF');
      expect(await storedFileId()).toBeUndefined();
      expect(await leftoverUploads()).toBe(0);
    });

    it('another file type', async () => {
      const res = await upload(owner, Buffer.from('hello'), 'notes.txt', 'text/plain');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SCAN_NOT_PDF');
      expect(await leftoverUploads()).toBe(0);
    });

    it('more than 50 MB', async () => {
      const tooLarge = Buffer.concat([PDF, Buffer.alloc(SCAN_MAX_BYTES - PDF.length + 1)]);

      const res = await upload(owner, tooLarge);

      expect(res.status).toBe(413);
      expect(res.body.error).toMatchObject({
        code: 'SCAN_TOO_LARGE',
        message: 'Скан більший за 50 МБ',
      });
      expect(await storedFileId()).toBeUndefined();
      expect(await leftoverUploads()).toBe(0);
    });

    it('no file at all', async () => {
      const res = await request(app)
        .put(`${APPLICATIONS}/${applicationId}/scan`)
        .set(owner.auth)
        .field('note', 'x');

      expect(res.status).toBe(400);
    });
  });

  it('takes the name without its path', async () => {
    const res = await upload(owner, PDF, '..\\..\\windows\\system.pdf');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.scan.name).toBe('system.pdf');
  });

  it('answers a malformed upload with 400, not a server error', async () => {
    // A control character in the part header: busboy refuses to parse it.
    const res = await upload(owner, PDF, 'sys\u0007tem.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_UPLOAD');
    expect(await leftoverUploads()).toBe(0);
  });

  describe('access', () => {
    it("hides another department's scan and refuses its changes as not found", async () => {
      await upload(owner);

      expect((await download(elsewhere)).status).toBe(404);
      expect((await upload(elsewhere)).status).toBe(404);
      expect((await removeScan(elsewhere)).status).toBe(404);
      expect(await storedFileId()).toBeDefined();
      expect((await download(admin)).status).toBe(200);
    });

    it('does not change the scan of an annulled application', async () => {
      await request(app)
        .post(`${APPLICATIONS}/${applicationId}/annul`)
        .set(owner.auth)
        .send({ reason: 'Помилка', version: 1 });

      const res = await upload(owner);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_ANNULLED');
      expect(await leftoverUploads()).toBe(0);
    });

    it('requires signing in', async () => {
      expect(
        (
          await request(app)
            .put(`${APPLICATIONS}/${applicationId}/scan`)
            .attach('scan', PDF, { filename: 'a.pdf', contentType: 'application/pdf' })
        ).status,
      ).toBe(401);
    });
  });

  it('deletes the file together with the application', async () => {
    await upload(owner);
    const fileId = await storedFileId();

    const res = await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version: 1 })
      .set(admin.auth);

    expect(res.status).toBe(204);
    expect(existsSync(scanPath(fileId!))).toBe(false);
  });
});
