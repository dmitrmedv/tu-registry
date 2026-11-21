import type { InvoiceDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makeProcessing } from '@/test/fixtures';
import { addModule, renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const APP = makeApplication();
const BASE = `*/api/v1/applications/${APP.id}`;

const saved: InvoiceDto = {
  id: 'inv000000000000000000001',
  applicationId: APP.id,
  projectId: 'pr0000000000000000000001',
  invoiceNumber: '6442/1',
  invoiceDate: '2026-03-25',
  works: [],
  totals: { CONSTRUCTION: 0, TIE_IN: 0, WORK_PLAN: 0, total: 0 },
  workingDays: 3,
  overdueBy: 0,
  scan: null,
  basis: null,
  cancellation: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-25T10:00:00.000Z',
  version: 1,
};

describe('invoice in the application card', () => {
  it('adds works by group, keeps the sums up to date and sends them', async () => {
    const created: unknown[] = [];
    server.use(
      signedInAs(owner),
      mock.get(BASE, () => HttpResponse.json(APP)),
      mock.get(`${BASE}/processing`, () => HttpResponse.json(makeProcessing())),
      mock.get(`${BASE}/history`, () => HttpResponse.json([])),
      mock.get(`${BASE}/responses`, () => HttpResponse.json([])),
      mock.get(`${BASE}/technical-conditions`, () => HttpResponse.json([])),
      mock.get(`${BASE}/contracts`, () => HttpResponse.json([])),
      mock.get(`${BASE}/projects`, () => HttpResponse.json([])),
      mock.get(`${BASE}/invoices`, () => HttpResponse.json([])),
      mock.post(`${BASE}/invoices`, async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(saved, { status: 201 });
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}`);

    await addModule(user, 'Рахунок');
    const dialog = await screen.findByRole('dialog', { name: 'Новий рахунок' });
    await user.type(within(dialog).getByLabelText('№ рахунку'), '6442/1');
    // Without works the invoice is refused.
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));
    expect(await within(dialog).findByText('Додайте хоча б одну роботу')).toBeVisible();

    const addWork = async (group: string, name: string, amount: string) => {
      const section = within(dialog).getByRole('region', { name: group });
      await user.click(within(section).getByRole('button', { name: 'Додати роботу' }));
      const names = within(section).getAllByLabelText(/^Робота \d+$/);
      const amounts = within(section).getAllByLabelText('Вартість, грн');
      await user.type(names.at(-1)!, name);
      await user.type(amounts.at(-1)!, amount);
    };
    await addWork('Будівельно-монтажні роботи', 'За кошторисом', '2228653,20');
    await addWork('Врізання', 'Врізання', '121792,51');
    await addWork('ПВР', 'Витрати газу', '37152,36');
    await addWork('ПВР', 'Пуск та наладка ШРП', '188574,72');

    expect(within(dialog).getByRole('region', { name: 'ПВР' })).toHaveTextContent(
      /225\s727,08 грн/,
    );
    expect(
      within(dialog).getByText('Загальна вартість приєднання').parentElement,
    ).toHaveTextContent(/2\s576\s172,79 грн/);
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      invoiceNumber: '6442/1',
      works: [
        { group: 'CONSTRUCTION', name: 'За кошторисом', amount: 2228653.2 },
        { group: 'TIE_IN', name: 'Врізання', amount: 121792.51 },
        { group: 'WORK_PLAN', name: 'Витрати газу', amount: 37152.36 },
        { group: 'WORK_PLAN', name: 'Пуск та наладка ШРП', amount: 188574.72 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
