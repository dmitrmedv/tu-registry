import type { TechnicalConditionsDto, TuPaymentDto, UserDto } from '@tu-registry/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makePdf, makeProcessing, makeTechnicalConditions } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });
const APP = makeApplication();
const TU = `*/api/v1/applications/${APP.id}/technical-conditions`;
const TU_ID = 'tu000000000000000000001';
const PAYMENT = `${TU}/${TU_ID}/payment`;

const makePayment = (overrides: Partial<TuPaymentDto> = {}): TuPaymentDto => ({
  id: 'pay00000000000000000001',
  invoiceNumber: '125/Б',
  invoiceDate: '2026-03-23',
  amount: 1234.5,
  paidDate: null,
  actTransferMonth: null,
  invoiceScan: null,
  receiptScan: null,
  actScan: null,
  createdBy: { id: owner.id, fullName: 'Олена Коваль' },
  createdAt: '2026-03-23T09:00:00.000Z',
  version: 1,
  ...overrides,
});
const scan = (name: string) => ({
  name,
  size: 2048,
  uploadedAt: '2026-03-24T09:00:00.000Z',
  uploadedBy: { id: owner.id, fullName: 'Олена Коваль' },
});

function openCard(payment: TuPaymentDto | null, user: UserDto = owner) {
  const current = { tu: makeTechnicalConditions({ payment }) };
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${APP.id}`, () => HttpResponse.json(APP)),
    mock.get(`*/api/v1/applications/${APP.id}/processing`, () =>
      HttpResponse.json(makeProcessing()),
    ),
    mock.get(`*/api/v1/applications/${APP.id}/history`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${APP.id}/responses`, () => HttpResponse.json([])),
    mock.get(TU, () => HttpResponse.json([current.tu])),
  );
  return { ...renderApp(`/applications/${APP.id}?tab=tu`), current };
}

const frame = () => screen.findByRole('region', { name: 'Оплата за технічні умови' });
const MONTH = 'Місяць здачі акта';
// user-event types into date fields only; a month field takes its value whole.
const setMonth = (dialog: HTMLElement, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(MONTH), { target: { value } });
const withPayment = (current: { tu: TechnicalConditionsDto }, payment: TuPaymentDto) => {
  current.tu = makeTechnicalConditions({ payment });
  return HttpResponse.json(current.tu);
};

describe('payment for technical conditions', () => {
  it('enters the invoice, then the payment with its receipt, in one dialog', async () => {
    const { user, current } = openCard(null);
    const saved: unknown[] = [];
    let receipt: File | null = null;
    let invoiceScan: File | null = null;
    server.use(
      mock.put(`${PAYMENT}/scans/invoice`, async ({ request }) => {
        invoiceScan = (await request.formData()).get('scan') as File;
        return withPayment(current, makePayment({ invoiceScan: scan('рахунок.pdf') }));
      }),
      mock.put(PAYMENT, async ({ request }) => {
        saved.push(await request.json());
        return withPayment(current, makePayment());
      }),
      mock.put(`${PAYMENT}/scans/receipt`, async ({ request }) => {
        receipt = (await request.formData()).get('scan') as File;
        return withPayment(current, makePayment({ receiptScan: scan('квитанція.pdf') }));
      }),
    );

    await user.click(within(await frame()).getByRole('button', { name: 'Додати рахунок' }));
    const dialog = screen.getByRole('dialog', { name: 'Інформація про рахунок' });
    await user.type(within(dialog).getByLabelText('№ рахунку'), '125/Б');
    await user.clear(within(dialog).getByLabelText('Дата рахунку'));
    await user.type(within(dialog).getByLabelText('Дата рахунку'), '2026-03-23');
    await user.type(within(dialog).getByLabelText('Сума, грн'), '1 234,5');
    await user.type(within(dialog).getByLabelText('Дата оплати'), '2026-03-24');
    await user.upload(
      within(within(dialog).getByRole('region', { name: 'Скан рахунку' })).getByLabelText(
        'PDF-файл скану',
      ),
      makePdf('рахунок.pdf'),
    );
    const receiptPanel = within(dialog).getByRole('region', { name: 'Скан квитанції' });
    await user.upload(
      within(receiptPanel).getByLabelText('PDF-файл скану'),
      makePdf('квитанція.pdf'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Рахунок № 125/Б збережено')).toBeVisible();
    expect(saved).toEqual([
      {
        invoiceNumber: '125/Б',
        invoiceDate: '2026-03-23',
        amount: 1234.5,
        paidDate: '2026-03-24',
        actTransferMonth: null,
      },
    ]);
    expect(receipt!.name).toBe('квитанція.pdf');
    expect(invoiceScan!.name).toBe('рахунок.pdf');
    const shown = await frame();
    expect(await within(shown).findByText('№ 125/Б від 23.03.2026')).toBeVisible();
    expect(within(shown).getByText(/^1\s234,50 грн$/)).toBeVisible();
    expect(await within(shown).findByRole('button', { name: /^Квитанція/ })).toBeVisible();
  });

  it('groups the sum once it is typed and shows the act’s month', async () => {
    const { user } = openCard(makePayment({ amount: 2750, actTransferMonth: '2026-11' }));
    const shown = await frame();
    expect(within(shown).getByText(/^2\s750,00 грн$/)).toBeVisible();
    expect(within(shown).getByText('листопад 2026')).toBeVisible();

    await user.click(within(shown).getByRole('button', { name: 'Редагувати оплату' }));
    const dialog = screen.getByRole('dialog', { name: 'Рахунок № 125/Б' });
    const amount = within(dialog).getByLabelText<HTMLInputElement>('Сума, грн');
    await user.clear(amount);
    await user.type(amount, '12500');
    await user.tab();
    expect(amount.value).toMatch(/^12\s500,00$/);
    expect(within(dialog).getByLabelText(MONTH)).toHaveValue('2026-11');
  });

  it('checks the form and shows the server’s refusal next to its field', async () => {
    const { user } = openCard(null);
    server.use(
      mock.put(PAYMENT, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Некоректні дані',
              details: {
                fieldErrors: { invoiceDate: ['Дата рахунку не може бути в майбутньому'] },
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await user.click(within(await frame()).getByRole('button', { name: 'Додати рахунок' }));
    const dialog = screen.getByRole('dialog', { name: 'Інформація про рахунок' });
    await user.type(within(dialog).getByLabelText('Сума, грн'), '10,555');
    setMonth(dialog, '2026-03');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    for (const message of [
      'Вкажіть номер рахунку',
      'Не більше двох знаків після коми',
      'Спершу вкажіть дату оплати',
    ]) {
      expect(await within(dialog).findByText(message)).toBeVisible();
    }

    await user.type(within(dialog).getByLabelText('№ рахунку'), '125/Б');
    await user.clear(within(dialog).getByLabelText('Сума, грн'));
    await user.type(within(dialog).getByLabelText('Сума, грн'), '100');
    setMonth(dialog, '');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));
    expect(
      await within(dialog).findByText('Дата рахунку не може бути в майбутньому'),
    ).toBeVisible();
  });

  it('changes the payment with the version seen; the act is added on «Зберегти»', async () => {
    const { user, current } = openCard(
      makePayment({ paidDate: '2026-03-24', receiptScan: scan('квитанція.pdf'), version: 2 }),
    );
    const saved: unknown[] = [];
    let act: File | null = null;
    server.use(
      mock.put(PAYMENT, async ({ request }) => {
        saved.push(await request.json());
        return withPayment(current, makePayment({ paidDate: '2026-03-24', version: 3 }));
      }),
      mock.put(`${PAYMENT}/scans/act`, async ({ request }) => {
        act = (await request.formData()).get('scan') as File;
        return withPayment(current, makePayment({ actTransferMonth: '2026-03' }));
      }),
    );

    const shown = await frame();
    expect(within(shown).getByText('24.03.2026')).toBeVisible();
    await user.click(within(shown).getByRole('button', { name: 'Редагувати оплату' }));
    const dialog = screen.getByRole('dialog', { name: 'Рахунок № 125/Б' });
    expect(within(dialog).getByLabelText<HTMLInputElement>('Сума, грн').value).toMatch(
      /^1\s234,50$/,
    );
    const receiptPanel = within(dialog).getByRole('region', { name: 'Скан квитанції' });
    // Only that it is there: no file name, author or time.
    expect(within(receiptPanel).getByText('Скан додано')).toBeVisible();
    expect(within(dialog).queryByText('квитанція.pdf')).toBeNull();
    expect(within(receiptPanel).queryByRole('button', { name: 'Обрати файл' })).toBeNull();
    // A removal waits in the zone; it can be taken back.
    await user.click(within(receiptPanel).getByRole('button', { name: 'Видалити скан' }));
    expect(within(receiptPanel).getByText('Скан буде видалено після збереження.')).toBeVisible();
    await user.click(within(receiptPanel).getByRole('button', { name: 'Не видаляти' }));
    expect(within(receiptPanel).getByRole('button', { name: 'Переглянути скан' })).toBeVisible();
    setMonth(dialog, '2026-03');
    const actPanel = within(dialog).getByRole('region', { name: 'Скан акта' });
    await user.upload(within(actPanel).getByLabelText('PDF-файл скану'), makePdf('акт.pdf'));
    expect(within(actPanel).getByText('Скан додано')).toBeVisible();
    expect(within(dialog).queryByText('акт.pdf')).toBeNull();
    expect(act).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Рахунок № 125/Б збережено')).toBeVisible();
    expect(saved).toEqual([
      {
        version: 2,
        invoiceNumber: '125/Б',
        invoiceDate: '2026-03-23',
        amount: 1234.5,
        paidDate: '2026-03-24',
        actTransferMonth: '2026-03',
      },
    ]);
    expect(act!.name).toBe('акт.pdf');
  });

  it('lets an admin only delete the payment, after confirming', async () => {
    const { user, current } = openCard(makePayment({ version: 4 }), admin);
    let deleted: string | null = null;
    server.use(
      mock.delete(PAYMENT, ({ request }) => {
        deleted = new URL(request.url).searchParams.get('version');
        current.tu = makeTechnicalConditions({ payment: null });
        return HttpResponse.json(current.tu);
      }),
    );

    await user.click(within(await frame()).getByRole('button', { name: 'Видалити оплату' }));
    const confirm = screen.getByRole('dialog', { name: 'Видалити оплату?' });
    await user.click(within(confirm).getByRole('button', { name: 'Видалити' }));

    expect(await screen.findByText('Оплату за рахунком № 125/Б видалено')).toBeVisible();
    expect(deleted).toBe('4');
    expect(
      await within(await frame()).findByRole('button', { name: 'Додати рахунок' }),
    ).toBeVisible();
  });

  it('gives a user no delete button', async () => {
    openCard(makePayment());
    const shown = await frame();
    expect(within(shown).getByRole('button', { name: 'Редагувати оплату' })).toBeVisible();
    expect(within(shown).queryByRole('button', { name: 'Видалити оплату' })).toBeNull();
  });
});
