import type { ApplicationDto, EngineerDto, ResponseDto, UserDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makePdf, makeProcessing, makeResponse } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });
const APP = makeApplication();
const RESPONSES = `*/api/v1/applications/${APP.id}/responses`;

const engineers: EngineerDto[] = [
  { id: 'e00000000000000000000001', fullName: 'Бойко Андрій', department: 'ODESA', isActive: true },
  { id: 'e00000000000000000000002', fullName: 'Ткач Ярослав', department: 'ODESA', isActive: true },
  {
    id: 'e00000000000000000000003',
    fullName: 'Колишній Інженер',
    department: 'ODESA',
    isActive: false,
  },
];

/** The card with `responses`; GET answers with whatever `rows` holds at the time. */
function openCard(rows: ResponseDto[], user: UserDto = owner, app: ApplicationDto = APP) {
  const current = { rows };
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${app.id}`, () => HttpResponse.json(app)),
    mock.get(`*/api/v1/applications/${app.id}/processing`, () =>
      HttpResponse.json(makeProcessing()),
    ),
    mock.get(`*/api/v1/applications/${app.id}/history`, () => HttpResponse.json([])),
    mock.get(RESPONSES, () => HttpResponse.json(current.rows)),
    mock.get(`*/api/v1/applications/${app.id}/technical-conditions`, () => HttpResponse.json([])),
    mock.get('*/api/v1/engineers', () => HttpResponse.json(engineers)),
  );
  return { ...renderApp(`/applications/${app.id}`), current };
}

const section = () => screen.findByRole('region', { name: 'Відповіді' });

describe('responses in the application card', () => {
  it('lists responses with working days, the documents received and cancelled ones struck', async () => {
    openCard([
      makeResponse({ workingDays: 4, documentsReceivedAt: '2026-03-20' }),
      makeResponse({
        id: 'resp0000000000000000002',
        outgoingNumber: '130/01-15',
        responseDate: '2026-03-25',
        workingDays: 9,
      }),
      makeResponse({
        id: 'resp0000000000000000003',
        outgoingNumber: 'помилкова',
        cancellation: {
          reason: 'Внесено помилково',
          at: '2026-03-17T10:00:00.000Z',
          by: { id: owner.id, fullName: 'Олена Коваль' },
        },
      }),
    ]);

    const items = await within(await section()).findAllByRole('listitem', { name: /^Відповідь/ });
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Відповідь № 125/01-15 від 16.03.2026');
    expect(items[0]).toHaveTextContent('Інженер: Бойко Андрій');
    expect(items[0]).toHaveTextContent('4 робочі дні з 5');
    expect(items[0]).toHaveTextContent('Документи надійшли 20.03.2026');
    expect(items[0]).not.toHaveTextContent('строк перевищено');
    expect(items[1]).toHaveTextContent('9 робочих днів з 5 строк перевищено на 4 робочі дні');
    expect(items[2]).toHaveTextContent('Скасовано');
    expect(items[2]).toHaveTextContent('Внесено помилково');
    expect(within(items[2]!).queryByRole('button', { name: 'Редагувати' })).toBeNull();
  });

  it('says when there are none', async () => {
    openCard([]);
    expect(
      await within(await section()).findByText('Відповідей на заяву не надавали.'),
    ).toBeVisible();
  });

  it('adds a response with its scan, offering active engineers only', async () => {
    const { user, current } = openCard([]);
    const posted: unknown[] = [];
    let uploaded: File | null = null;
    server.use(
      mock.post(RESPONSES, async ({ request }) => {
        posted.push(await request.json());
        current.rows = [makeResponse()];
        return HttpResponse.json(makeResponse(), { status: 201 });
      }),
      mock.put(`${RESPONSES}/resp0000000000000000001/scan`, async ({ request }) => {
        uploaded = (await request.formData()).get('scan') as File;
        return HttpResponse.json(makeResponse({ scan: null }));
      }),
    );

    await user.click(within(await section()).getByRole('button', { name: 'Додати відповідь' }));
    const dialog = screen.getByRole('dialog', { name: 'Нова відповідь' });
    const engineer = await within(dialog).findByLabelText('Інженер');
    expect(
      within(engineer)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Оберіть інженера', 'Бойко Андрій', 'Ткач Ярослав']);

    await user.type(within(dialog).getByLabelText('Номер вихідного'), '125/01-15');
    await user.clear(within(dialog).getByLabelText('Дата відповіді'));
    await user.type(within(dialog).getByLabelText('Дата відповіді'), '2026-03-16');
    await user.selectOptions(engineer, 'Бойко Андрій');
    await user.upload(within(dialog).getByLabelText('PDF-файл скану'), makePdf('Відповідь.pdf'));
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Відповідь № 125/01-15 додано')).toBeVisible();
    expect(posted).toEqual([
      {
        outgoingNumber: '125/01-15',
        responseDate: '2026-03-16',
        engineer: 'e00000000000000000000001',
      },
    ]);
    expect(uploaded!.name).toBe('Відповідь.pdf');
    expect(
      await within(await section()).findByRole('listitem', { name: /^Відповідь/ }),
    ).toBeVisible();
  });

  it('keeps a saved response when only its scan fails, and sends just the file again', async () => {
    const { user } = openCard([]);
    let posts = 0;
    let uploads = 0;
    server.use(
      mock.post(RESPONSES, () => {
        posts += 1;
        return HttpResponse.json(makeResponse(), { status: 201 });
      }),
      mock.put(`${RESPONSES}/resp0000000000000000001/scan`, () => {
        uploads += 1;
        return uploads === 1
          ? apiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом')
          : HttpResponse.json(makeResponse());
      }),
    );

    await user.click(within(await section()).getByRole('button', { name: 'Додати відповідь' }));
    const dialog = screen.getByRole('dialog', { name: 'Нова відповідь' });
    await user.type(within(dialog).getByLabelText('Номер вихідного'), '125/01-15');
    await user.clear(within(dialog).getByLabelText('Дата відповіді'));
    await user.type(within(dialog).getByLabelText('Дата відповіді'), '2026-03-16');
    await user.selectOptions(await within(dialog).findByLabelText('Інженер'), 'Бойко Андрій');
    await user.upload(within(dialog).getByLabelText('PDF-файл скану'), makePdf());
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(
      await within(dialog).findByText(
        'Відповідь збережено, але скан не завантажено: Файл не є PDF-документом',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('Відповідь № 125/01-15 додано')).toBeVisible();
    expect([posts, uploads]).toEqual([1, 2]);
  });

  it('edits only what changed, keeping a deactivated engineer on offer', async () => {
    const patched: unknown[] = [];
    const { user } = openCard([
      makeResponse({ engineer: { id: 'e00000000000000000000003', fullName: 'Колишній Інженер' } }),
    ]);
    server.use(
      mock.patch(`${RESPONSES}/resp0000000000000000001`, async ({ request }) => {
        patched.push(await request.json());
        return HttpResponse.json(makeResponse({ outgoingNumber: '125/01-16' }));
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Редагувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Відповідь № 125/01-15' });
    expect(await within(dialog).findByLabelText('Інженер')).toHaveDisplayValue(
      'Колишній Інженер (неактивний)',
    );
    await user.clear(within(dialog).getByLabelText('Номер вихідного'));
    await user.type(within(dialog).getByLabelText('Номер вихідного'), '125/01-16');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Відповідь № 125/01-16 збережено')).toBeVisible();
    expect(patched).toEqual([{ version: 1, outgoingNumber: '125/01-16' }]);
  });

  it('records when the documents came, showing a refusal in the dialog', async () => {
    const patched: unknown[] = [];
    const { user } = openCard([makeResponse()]);
    server.use(
      mock.patch(`${RESPONSES}/resp0000000000000000001`, async ({ request }) => {
        patched.push(await request.json());
        return patched.length === 1
          ? HttpResponse.json(
              {
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Некоректні дані',
                  details: {
                    fieldErrors: {
                      documentsReceivedAt: ['Документи не можуть надійти раніше дати відповіді'],
                    },
                  },
                },
              },
              { status: 400 },
            )
          : HttpResponse.json(makeResponse({ documentsReceivedAt: '2026-03-20' }));
      }),
    );

    await user.click(
      await within(await section()).findByRole('button', { name: 'Документи надійшли' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Документи надійшли' });
    const date = within(dialog).getByLabelText('Дата надходження документів');
    await user.clear(date);
    await user.type(date, '2026-03-10');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));
    expect(
      await within(dialog).findByText('Документи не можуть надійти раніше дати відповіді'),
    ).toBeVisible();

    await user.clear(date);
    await user.type(date, '2026-03-20');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patched[1]).toEqual({ version: 1, documentsReceivedAt: '2026-03-20' });
  });

  it('cancels with a reason', async () => {
    const sent: unknown[] = [];
    const { user } = openCard([makeResponse()]);
    server.use(
      mock.post(`${RESPONSES}/resp0000000000000000001/cancel`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(makeResponse());
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Скасувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Скасувати відповідь № 125/01-15?' });
    await user.click(within(dialog).getByRole('button', { name: 'Скасувати документ' }));
    expect(within(dialog).getByText('Вкажіть причину скасування')).toBeVisible();
    await user.type(within(dialog).getByLabelText('Причина скасування'), 'Внесено помилково');
    await user.click(within(dialog).getByRole('button', { name: 'Скасувати документ' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toEqual([{ reason: 'Внесено помилково', version: 1 }]);
  });

  const cancelled = makeResponse({
    version: 2,
    cancellation: {
      reason: 'x',
      at: '2026-03-17T10:00:00.000Z',
      by: { id: owner.id, fullName: 'О' },
    },
  });

  it('does not let a user restore a cancelled response', async () => {
    openCard([cancelled]);
    expect(await within(await section()).findByText('Скасовано')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Відновити' })).toBeNull();
  });

  it('lets an admin restore a cancelled response', async () => {
    const restored: unknown[] = [];
    const { user } = openCard([cancelled], admin);
    server.use(
      mock.post(`${RESPONSES}/resp0000000000000000001/restore`, async ({ request }) => {
        restored.push(await request.json());
        return HttpResponse.json(makeResponse({ version: 3 }));
      }),
    );
    await user.click(await within(await section()).findByRole('button', { name: 'Відновити' }));
    expect(await screen.findByText('Відповідь № 125/01-15 відновлено')).toBeVisible();
    expect(restored).toEqual([{ version: 2 }]);
  });

  it('offers no changes on an annulled application, but still shows its responses', async () => {
    openCard([makeResponse()], owner, makeApplication({ status: 'ANNULLED' }));

    const region = await section();
    expect(await within(region).findByRole('listitem', { name: /^Відповідь/ })).toBeVisible();
    expect(within(region).queryByRole('button', { name: 'Додати відповідь' })).toBeNull();
    expect(within(region).queryByRole('button', { name: 'Редагувати' })).toBeNull();
  });
});
