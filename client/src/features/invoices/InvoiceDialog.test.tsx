import type { EstimateDto, InvoiceDto, ProjectDto } from '@tu-registry/shared';
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

const saved: InvoiceDto = {
  id: 'inv000000000000000000001',
  applicationId: APP.id,
  projectId: PROJECT_ID,
  invoiceNumber: '6442/1',
  agreementNumber: 1,
  invoiceDate: '2026-03-25',
  comment: null,
  works: [],
  totals: { CONSTRUCTION: 0, TIE_IN: 0, WORK_PLAN: 0, EARTHWORKS: 0, total: 0 },
  workingDays: 3,
  overdueBy: 0,
  basis: null,
  cancellation: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-25T10:00:00.000Z',
  version: 1,
};

const project: ProjectDto = {
  id: PROJECT_ID,
  applicationId: APP.id,
  technicalConditionsId: 'tu000000000000000000001',
  approvalNumber: '86',
  approvalDate: '2026-03-20',
  designOrganization: 'ТОВ «Проєктбуд»',
  engineer: { id: 'e00000000000000000000001', fullName: 'Бойко Андрій' },
  scan: null,
  previousScans: [],
  cancellation: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-20T10:00:00.000Z',
  version: 1,
};

const estimate: EstimateDto = {
  id: 'es0000000000000000000001',
  applicationId: APP.id,
  projectId: PROJECT_ID,
  checkDate: null,
  amount: 2228653.2,
  subcontractAmount: null,
  scan: null,
  imd: null,
  superseded: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-21T10:00:00.000Z',
  version: 1,
};

/** The card with a valid project, its estimate and the invoices given; the TU as given. */
const stubCard = (
  connectionPoint: 'UNDERGROUND' | 'ABOVE_GROUND',
  created: unknown[],
  invoices: InvoiceDto[] = [],
) =>
  server.use(
    signedInAs(owner),
    mock.get(BASE, () => HttpResponse.json(APP)),
    mock.get(`${BASE}/processing`, () => HttpResponse.json(makeProcessing())),
    mock.get(`${BASE}/history`, () => HttpResponse.json([])),
    mock.get(`${BASE}/responses`, () => HttpResponse.json([])),
    mock.get(`${BASE}/technical-conditions`, () =>
      HttpResponse.json([makeTechnicalConditions({ connectionPoint })]),
    ),
    mock.get(`${BASE}/contracts`, () => HttpResponse.json([])),
    mock.get(`${BASE}/projects`, () => HttpResponse.json([project])),
    // The server's count from the approval of 20.03, both days counted.
    mock.get(`${BASE}/projects/${PROJECT_ID}/invoice-term`, ({ request }) => {
      const date = new URL(request.url).searchParams.get('date')!;
      const workingDays = { '2026-04-02': 10, '2026-04-03': 11 }[date] ?? 1;
      return HttpResponse.json({ workingDays, norm: 10, overdueBy: Math.max(0, workingDays - 10) });
    }),
    mock.get(`${BASE}/estimates`, () => HttpResponse.json([estimate])),
    mock.get(`${BASE}/invoices`, () => HttpResponse.json(invoices)),
    mock.post(`${BASE}/invoices`, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(saved, { status: 201 });
    }),
  );

const CONSTRUCTION = 'Будівельно-монтажні роботи та врізання';
const EARTHWORKS = 'Дозволи на земляні роботи';

/** The names a list offers. */
const suggestions = (section: HTMLElement) =>
  Array.from(section.querySelectorAll('datalist option')).map((option) =>
    option.getAttribute('value'),
  );

describe('invoice in the application card', () => {
  it('starts empty under agreement 1; adds works to its three lists', async () => {
    const created: unknown[] = [];
    stubCard('UNDERGROUND', created);
    const { user } = renderApp(`/applications/${APP.id}`);

    await addModule(user, 'Розрахунок');
    const dialog = await screen.findByRole('dialog', { name: 'Новий розрахунок' });
    expect(within(dialog).getByLabelText('До додаткової угоди №')).toHaveValue('1');
    expect(within(dialog).getByLabelText('№ розрахунку')).toHaveValue('1');
    expect(within(dialog).getAllByText('Робіт ще не додано.')).toHaveLength(3);
    expect(suggestions(within(dialog).getByRole('region', { name: CONSTRUCTION }))).toEqual([
      'Будівельно-монтажні роботи за кошторисом',
      'Врізання',
    ]);
    expect(suggestions(within(dialog).getByRole('region', { name: EARTHWORKS }))).toEqual([
      'Нанесення геодезії',
      'Отримання дозволу на земляні роботи',
    ]);

    // Without any work the invoice is refused; the number may come later.
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));
    expect(await within(dialog).findByText('Додайте хоча б одну роботу')).toBeVisible();

    const addWork = async (title: string, name: string, amount?: string) => {
      const list = within(within(dialog).getByRole('region', { name: title }));
      await user.click(list.getByRole('button', { name: 'Додати роботу' }));
      await user.type(list.getAllByLabelText(/^Робота \d+$/).at(-1)!, name);
      if (amount) await user.type(list.getAllByLabelText('Вартість, грн').at(-1)!, amount);
    };
    // Chosen, the construction by the estimate takes the estimate's sum.
    await addWork(CONSTRUCTION, 'Будівельно-монтажні роботи за кошторисом');
    const constructionSum = within(
      within(dialog).getByRole('region', { name: CONSTRUCTION }),
    ).getByLabelText('Вартість, грн') as HTMLInputElement;
    expect(constructionSum.value).toMatch(/^2\s228\s653,20$/);
    await addWork(CONSTRUCTION, 'Врізання', '121792,51');
    await addWork('ПВР', 'Витрати газу', '37152,36');
    await addWork('ПВР', 'Пуск та наладка ШРП', '188574,72');
    await addWork(EARTHWORKS, 'Нанесення геодезії', '1000');

    await user.type(within(dialog).getByLabelText('Коментар (необовʼязково)'), 'Оплата частинами');
    expect(within(dialog).getByText('Загальна вартість').parentElement).toHaveTextContent(
      /2\s577\s172,79 грн/,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      invoiceNumber: '1',
      agreementNumber: 1,
      comment: 'Оплата частинами',
      works: [
        {
          group: 'CONSTRUCTION',
          name: 'Будівельно-монтажні роботи за кошторисом',
          amount: 2228653.2,
        },
        { group: 'TIE_IN', name: 'Врізання', amount: 121792.51 },
        { group: 'WORK_PLAN', name: 'Витрати газу', amount: 37152.36 },
        { group: 'WORK_PLAN', name: 'Пуск та наладка ШРП', amount: 188574.72 },
        { group: 'EARTHWORKS', name: 'Нанесення геодезії', amount: 1000 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('takes the next agreement; no earthworks above ground; says at once the date misses the term', async () => {
    stubCard(
      'ABOVE_GROUND',
      [],
      [saved, { ...saved, id: 'inv000000000000000000002', invoiceNumber: '7' }],
    );
    const { user } = renderApp(`/applications/${APP.id}?tab=invoice`);

    // The second invoice of the application, from its tab.
    await user.click(await screen.findByRole('button', { name: 'Додати розрахунок' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новий розрахунок' });
    // Agreement 1 is taken by the invoice already there.
    expect(within(dialog).getByLabelText('До додаткової угоди №')).toHaveValue('2');
    // The next after invoice 7; «6442/1» is not a plain number.
    expect(within(dialog).getByLabelText('№ розрахунку')).toHaveValue('8');
    // Above ground there are no earthworks: no list of their permits.
    expect(within(dialog).queryByRole('region', { name: EARTHWORKS })).toBeNull();
    const note = within(dialog).getByRole('status');
    const date = within(dialog).getByLabelText('Дата розрахунку');

    await user.clear(date);
    await user.type(date, '2026-04-02');
    await waitFor(() => expect(note).toHaveTextContent('Кількість днів з дня узгодження — 10'));
    expect(note.className).toMatch(/ok/);
    await user.clear(date);
    await user.type(date, '2026-04-03');
    await waitFor(() => expect(note).toHaveTextContent('Кількість днів з дня узгодження — 11'));
    expect(note.className).toMatch(/error/);
    // A Saturday: said at once, in the note's place (2026-11-22).
    await user.clear(date);
    await user.type(date, '2026-04-04');
    await waitFor(() =>
      expect(note).toHaveTextContent('Неробочий день за календарем (04.04.2026) — оберіть робочий'),
    );
    expect(note.className).toMatch(/error/);
    expect(date).toHaveAttribute('aria-invalid', 'true');
    await user.clear(date);
    await user.type(date, '2026-03-19');
    expect(note).toHaveTextContent('Раніше дати узгодження проєкту (20.03.2026)');
  });
});
