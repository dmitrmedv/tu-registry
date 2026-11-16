import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { AuditLog } from '../audit/auditLog.model';
import { Engineer } from '../engineers/engineer.model';
import { scanPath, uploadTmpDir } from '../scans/scan.storage';
import { ApplicationResponse } from './response.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

describe('scans of responses', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let responseId: string;

  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-10T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    elsewhere = await signedInWithAuth(app, { login: 'elsewhere', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    applicationId = (await registerApplication(app, owner)).id;
    const engineer = await Engineer.create({
      fullName: 'Бойко Андрій',
      department: 'ODESA',
      createdBy: admin.user._id,
    });
    responseId = (
      await request(app)
        .post(`${APPLICATIONS}/${applicationId}/responses`)
        .set(owner.auth)
        .send({ outgoingNumber: '125', responseDate: '2026-11-10', engineer: String(engineer._id) })
    ).body.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const scanUrl = (id = responseId) => `${APPLICATIONS}/${applicationId}/responses/${id}/scan`;
  const upload = (who: ApiSession, content: Buffer, filename = 'Відповідь.pdf') =>
    request(app)
      .put(scanUrl())
      .set(who.auth)
      .attach('scan', content, { filename, contentType: 'application/pdf' });
  const download = (who: ApiSession, file?: string) =>
    request(app)
      .get(scanUrl())
      .query(file ? { file } : {})
      .set(who.auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('attaches a PDF and opens it for whoever sees the application', async () => {
    const res = await upload(owner, pdf('перша'));

    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({
      name: 'Відповідь.pdf',
      uploadedBy: { id: owner.user.id },
    });
    expect((await download(admin)).body.toString()).toContain('перша');
    expect((await download(elsewhere)).status).toBe(404);
    expect((await upload(elsewhere, pdf('чужа'))).status).toBe(404);
    // The file name may name the customer: it stays out of the journal.
    const entry = await AuditLog.findOne({ action: 'RESPONSE_UPDATED' }).lean();
    expect(JSON.stringify(entry)).not.toContain('Відповідь.pdf');
  });

  it('keeps the replaced scan, which opens by its id through this response only', async () => {
    await upload(owner, pdf('перша'), 'перша.pdf');
    const replaced = await upload(owner, pdf('друга'), 'друга.pdf');

    expect(replaced.body.scan.name).toBe('друга.pdf');
    expect(replaced.body.previousScans).toEqual([
      expect.objectContaining({ id: expect.any(String), name: 'перша.pdf' }),
    ]);
    const earlier = replaced.body.previousScans[0].id as string;
    expect(existsSync(scanPath(earlier))).toBe(true);
    expect((await download(owner)).body.toString()).toContain('друга');
    expect((await download(owner, earlier)).body.toString()).toContain('перша');
    expect((await download(owner, '0d4c7a52-6a35-4f5e-9f7a-1c2b3d4e5f60')).status).toBe(404);
    expect((await download(owner, '../../x')).status).toBe(400);
  });

  it('refuses a file that is not a PDF and leaves nothing in the upload folder', async () => {
    const res = await upload(owner, Buffer.from('not a pdf at all'));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SCAN_NOT_PDF');
    expect(await readdir(uploadTmpDir())).toEqual([]);
    expect((await ApplicationResponse.findById(responseId).lean())!.scan).toBeUndefined();
  });

  it('takes no scan for a cancelled response, and has none to open without one', async () => {
    expect((await download(owner)).status).toBe(404);
    await request(app)
      .post(`${APPLICATIONS}/${applicationId}/responses/${responseId}/cancel`)
      .set(owner.auth)
      .send({ version: 1, reason: 'Помилка' });

    const res = await upload(owner, pdf('пізно'));
    expect(res.body.error.code).toBe('DOCUMENT_CANCELLED');
  });

  it('removes every scan of its responses from disk when the application is deleted', async () => {
    await upload(owner, pdf('перша'));
    const { body } = await upload(owner, pdf('друга'));
    const stored = await ApplicationResponse.findById(responseId).lean();
    const files = [stored!.scan!.fileId, body.previousScans[0].id as string];
    const version = (await request(app).get(`${APPLICATIONS}/${applicationId}`).set(admin.auth))
      .body.version as number;

    await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version })
      .set(admin.auth);
    expect(files.map((file) => existsSync(scanPath(file)))).toEqual([false, false]);
  });
});
