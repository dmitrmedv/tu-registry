import type { EngineerDto, EstimateDto, ProjectDto } from '@tu-registry/shared';
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
const ESTIMATE_ID = 'es0000000000000000000001';

const engineers: EngineerDto[] = [
  { id: 'e00000000000000000000001', fullName: 'Бойко Андрій', department: 'ODESA', isActive: true },
  { id: 'e00000000000000000000002', fullName: 'Ткач Ярослав', department: 'ODESA', isActive: true },
];

const project = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: PROJECT_ID,
  applicationId: APP.id,
  technicalConditionsId: 'tu000000000000000000001',
  approvalNumber: '125/П',
  designOrganization: 'ТОВ «Проєктбуд»',
  approvalDate: '2026-03-25',
  engineer: { id: engineers[0]!.id, fullName: 'Бойко Андрій' },
  scan: null,
  previousScans: [],
  cancellation: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-25T10:00:00.000Z',
  version: 1,
  ...overrides,
});

const estimate = (overrides: Partial<EstimateDto> = {}): EstimateDto => ({
  id: ESTIMATE_ID,
  applicationId: APP.id,
  projectId: PROJECT_ID,
  checkDate: '2026-03-26',
  amount: 12345.67,
  subcontractAmount: null,
  scan: null,
  imd: null,
  superseded: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-26T10:00:00.000Z',
  version: 1,
  ...overrides,
});

/** The card with its documents; the projects and estimates as given. */
const stubCard = (projects: ProjectDto[], estimates: { rows: EstimateDto[] }) =>
  server.use(
    signedInAs(owner),
    mock.get(BASE, () => HttpResponse.json(APP)),
    mock.get(`${BASE}/processing`, () => HttpResponse.json(makeProcessing())),
    mock.get(`${BASE}/history`, () => HttpResponse.json([])),
    mock.get(`${BASE}/responses`, () => HttpResponse.json([])),
    mock.get(`${BASE}/contracts`, () => HttpResponse.json([])),
    mock.get(`${BASE}/projects`, () => HttpResponse.json(projects)),
    mock.get(`${BASE}/estimates`, () => HttpResponse.json(estimates.rows)),
    mock.get(`${BASE}/invoices`, () => HttpResponse.json([])),
    mock.get(`${BASE}/technical-conditions`, () => HttpResponse.json([makeTechnicalConditions()])),
    mock.get('*/api/v1/engineers', () => HttpResponse.json(engineers)),
  );

describe('project in the application card', () => {
  it('adds a project by the TU engineer, without the estimate', async () => {
    const created: unknown[] = [];
    stubCard([], { rows: [] });
    server.use(
      mock.post(`${BASE}/projects`, async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(project(), { status: 201 });
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}`);

    await addModule(user, 'Проєкт');
    const dialog = await screen.findByRole('dialog', { name: 'Новий проєкт' });
    const engineer = await within(dialog).findByLabelText('Виконавець');
    expect(engineer).toHaveValue(engineers[0]!.id);
    expect(within(dialog).queryByLabelText('Дата перевірки кошторису')).toBeNull();
    await user.type(within(dialog).getByLabelText('№ узгодження'), '125/П');
    await user.type(within(dialog).getByLabelText('Проєктна організація'), 'ТОВ «Проєктбуд»');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(created).toEqual([
      {
        approvalNumber: '125/П',
        approvalDate: expect.any(String),
        designOrganization: 'ТОВ «Проєктбуд»',
        engineer: engineers[0]!.id,
      },
    ]);
  });

  it('adds the estimate beside the project: its sum, then the IMD check file', async () => {
    const estimates = { rows: [] as EstimateDto[] };
    const created: unknown[] = [];
    const uploads: string[] = [];
    stubCard([project()], estimates);
    server.use(
      mock.post(`${BASE}/estimates`, async ({ request }) => {
        created.push(await request.json());
        estimates.rows = [estimate()];
        return HttpResponse.json(estimate(), { status: 201 });
      }),
      mock.put(`${BASE}/estimates/${ESTIMATE_ID}/files/:kind`, async ({ params, request }) => {
        const form = await request.formData();
        uploads.push(`${String(params.kind)}:${(form.get('imd') as File).name}`);
        return HttpResponse.json(estimate());
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}?tab=project`);

    const frame = await screen.findByRole('region', { name: 'Кошторис до проєкту № 125/П' });
    await user.click(await within(frame).findByRole('button', { name: 'Додати кошторис' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новий кошторис' });
    await user.type(within(dialog).getByLabelText('Дата перевірки кошторису'), '2026-03-26');
    await user.type(within(dialog).getByLabelText('Сума кошторису, грн'), '12345,67');
    await user.type(within(dialog).getByLabelText('Сума по кошторису (субпідряд), грн'), '4000,5');
    await user.upload(
      within(dialog).getByLabelText('Файл IMD'),
      new File(['IMD'], 'Перевірка.imd', { type: '' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(uploads).toEqual(['imd:Перевірка.imd']));
    expect(created).toEqual([
      { checkDate: '2026-03-26', amount: 12345.67, subcontractAmount: 4000.5 },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const shown = await screen.findByRole('region', { name: 'Кошторис до проєкту № 125/П' });
    await waitFor(() => expect(shown).toHaveTextContent('26.03.2026'));
  });

  it('recalculates the estimate: the replaced one is paged to as «Перераховано»', async () => {
    const estimates = {
      rows: [
        estimate({
          amount: 1000,
          superseded: {
            at: '2026-04-10T09:00:00.000Z',
            by: { id: owner.id, fullName: 'Олена Коваль' },
          },
          imd: {
            name: 'Перший.imd',
            size: 3,
            uploadedAt: '2026-03-26T10:00:00.000Z',
            uploadedBy: { id: owner.id, fullName: 'Олена Коваль' },
          },
        }),
        estimate({ id: 'es0000000000000000000002', amount: 1500, checkDate: null }),
      ],
    };
    const created: unknown[] = [];
    stubCard([project()], estimates);
    server.use(
      mock.post(`${BASE}/estimates`, async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(estimate({ id: 'es0000000000000000000003' }), { status: 201 });
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}?tab=project`);

    const frame = await screen.findByRole('region', { name: 'Кошторис до проєкту № 125/П' });
    // The current one first: the last, so › is off.
    await waitFor(() => expect(frame).toHaveTextContent(/1\s500,00/));
    expect(frame).not.toHaveTextContent('Перераховано');
    expect(within(frame).getByRole('button', { name: 'Наступний кошторис' })).toBeDisabled();
    expect(within(frame).getByRole('button', { name: 'Редагувати кошторис' })).toBeEnabled();

    await user.click(within(frame).getByRole('button', { name: 'Попередній кошторис' }));
    expect(frame).toHaveTextContent('Перераховано');
    expect(frame).toHaveTextContent(/1\s000,00/);
    expect(
      within(frame).getByRole('button', { name: 'Завантажити файл перевірки кошторису (.imd)' }),
    ).toBeEnabled();
    expect(within(frame).queryByRole('button', { name: 'Редагувати кошторис' })).toBeNull();

    await user.click(within(frame).getByRole('button', { name: 'Перерахувати кошторис' }));
    const dialog = await screen.findByRole('dialog', { name: 'Перерахований кошторис' });
    expect(dialog).toHaveTextContent('проєкт не зміниться');
    await user.type(within(dialog).getByLabelText('Сума кошторису, грн'), '2000');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));
    // The subcontract sum is optional: left empty.
    await waitFor(() =>
      expect(created).toEqual([{ checkDate: null, amount: 2000, subcontractAmount: null }]),
    );
  });
});
