import type { EngineerDto, ProjectDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makeProcessing, makeTechnicalConditions } from '@/test/fixtures';
import { addModule, renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const APP = makeApplication();
const BASE = `*/api/v1/applications/${APP.id}`;
const PROJECT_ID = 'pr0000000000000000000001';

const engineers: EngineerDto[] = [
  { id: 'e00000000000000000000001', fullName: 'Бойко Андрій', department: 'ODESA', isActive: true },
  { id: 'e00000000000000000000002', fullName: 'Ткач Ярослав', department: 'ODESA', isActive: true },
];

const project = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: PROJECT_ID,
  applicationId: APP.id,
  technicalConditionsId: 'tu000000000000000000001',
  approvalNumber: '125/П',
  approvalDate: '2026-03-25',
  engineer: { id: engineers[0]!.id, fullName: 'Бойко Андрій' },
  scan: null,
  previousScans: [],
  estimateCheckDate: null,
  estimateScan: null,
  estimateImd: null,
  cancellation: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-25T10:00:00.000Z',
  version: 1,
  ...overrides,
});

describe('project in the application card', () => {
  it('adds a project by the TU engineer, then its IMD check file', async () => {
    const created: unknown[] = [];
    const uploads: string[] = [];
    server.use(
      signedInAs(owner),
      mock.get(BASE, () => HttpResponse.json(APP)),
      mock.get(`${BASE}/processing`, () => HttpResponse.json(makeProcessing())),
      mock.get(`${BASE}/history`, () => HttpResponse.json([])),
      mock.get(`${BASE}/responses`, () => HttpResponse.json([])),
      mock.get(`${BASE}/contracts`, () => HttpResponse.json([])),
      mock.get(`${BASE}/projects`, () => HttpResponse.json([])),
      mock.get(`${BASE}/invoices`, () => HttpResponse.json([])),
      mock.get(`${BASE}/technical-conditions`, () =>
        HttpResponse.json([makeTechnicalConditions()]),
      ),
      mock.get('*/api/v1/engineers', () => HttpResponse.json(engineers)),
      mock.post(`${BASE}/projects`, async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(project(), { status: 201 });
      }),
      mock.put(`${BASE}/projects/${PROJECT_ID}/files/:kind`, async ({ params, request }) => {
        const form = await request.formData();
        uploads.push(`${String(params.kind)}:${(form.get('imd') as File).name}`);
        return HttpResponse.json(project({ estimateImd: null }));
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}`);

    await addModule(user, 'Проєкт');
    const dialog = await screen.findByRole('dialog', { name: 'Новий проєкт' });
    const engineer = await within(dialog).findByLabelText('Виконавець');
    expect(engineer).toHaveValue(engineers[0]!.id);
    await user.type(within(dialog).getByLabelText('№ узгодження'), '125/П');
    await user.upload(
      within(dialog).getByLabelText('Файл IMD'),
      new File(['IMD'], 'Перевірка.imd', { type: '' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(uploads).toEqual(['estimateImd:Перевірка.imd']));
    expect(created).toEqual([
      expect.objectContaining({
        approvalNumber: '125/П',
        engineer: engineers[0]!.id,
        estimateCheckDate: null,
      }),
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
