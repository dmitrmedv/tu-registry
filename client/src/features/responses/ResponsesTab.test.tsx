import type { ApplicationDto, EngineerDto, ResponseDto, UserDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makePdf, makeProcessing, makeResponse } from '@/test/fixtures';
import { addModule, renderApp } from '@/test/renderApp';
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
  return { ...renderApp(`/applications/${app.id}?tab=response`), current };
}

const section = () => screen.findByRole('tabpanel', { name: 'Відповідь' });
/** The frames of the tab, in the order shown: the first response on the left. */
const frames = async () => (await section()).querySelectorAll<HTMLElement>('article');
const frameNames = async () =>
  [...(await frames())].map((frame) => frame.getAttribute('aria-label'));
const onlyFrame = () => screen.findByRole('article', { name: /^Відповідь/ });
/** The choices of the «Додати модуль» dialog: name and whether it can be added. */
async function moduleChoices(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Додати модуль' }));
  const dialog = screen.getByRole('dialog', { name: 'Додати модуль' });
  return within(within(dialog).getByRole('list', { name: 'Модулі' }))
    .getAllByRole('button')
    .map((choice) => [choice.textContent, (choice as HTMLButtonElement).disabled]);
}

describe('responses in the application card', () => {
  it('shows every response in its frame, side by side in date order', async () => {
    openCard([
      makeResponse({ workingDays: 4, documentsReceivedAt: '2026-03-20' }),
      makeResponse({
        id: 'resp0000000000000000003',
        outgoingNumber: 'помилкова',
        cancellation: {
          reason: 'Внесено помилково',
          at: '2026-03-17T10:00:00.000Z',
          by: { id: owner.id, fullName: 'Олена Коваль' },
        },
      }),
      makeResponse({
        id: 'resp0000000000000000002',
        outgoingNumber: '130/01-15',
        responseDate: '2026-03-25',
        workingDays: 9,
      }),
    ]);

    await waitFor(async () =>
      expect(await frameNames()).toEqual([
        'Відповідь № 125/01-15 від 16.03.2026',
        'Відповідь № помилкова від 16.03.2026',
        'Відповідь № 130/01-15 від 25.03.2026',
      ]),
    );
    const [first, wrong, latest] = [...(await frames())] as HTMLElement[];
    // Label and value per row, as on the mock-up; no deadline figures.
    for (const row of [
      'Відповідь№ 130/01-15',
      'Дата реєстрації25.03.2026',
      'ВиконавецьБойко А.',
      'Фактична дата отримання відповіді16.03.2026, 11:00',
    ]) {
      expect(latest).toHaveTextContent(row);
    }
    expect(latest).not.toHaveTextContent('робоч');
    expect(within(latest!).getByText('Бойко А.')).toHaveAttribute('title', 'Бойко Андрій');
    // Documents received through the API are still shown, but not entered in the card.
    expect(first).toHaveTextContent('Документи надійшли20.03.2026');
    expect(screen.queryByRole('button', { name: 'Документи надійшли' })).toBeNull();
    // Each frame has its own actions; a cancelled one only says why.
    expect(within(first!).getByRole('button', { name: 'Редагувати' })).toBeVisible();
    expect(wrong).toHaveTextContent('Скасовано');
    expect(wrong).toHaveTextContent('Скасував: Олена Коваль');
    expect(wrong).toHaveTextContent('Причина: Внесено помилково');
    expect(within(wrong!).queryByRole('button', { name: 'Редагувати' })).toBeNull();
  });

  it('has no tab until there is a response, and offers it in «Додати модуль»', async () => {
    const { user } = openCard([]);
    const tabs = await screen.findByRole('tablist', { name: 'Модулі заяви' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Заява']);
    expect(screen.getByRole('tab', { name: 'Заява' })).toHaveAttribute('aria-selected', 'true');
    expect(await moduleChoices(user)).toEqual([
      ['Відповідь', false],
      ['Технічні умови', false],
    ]);
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

    await addModule(user, 'Відповідь');
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
    // The new module's tab opens, and the module cannot be added again.
    expect(await onlyFrame()).toHaveAccessibleName('Відповідь № 125/01-15 від 16.03.2026');
    expect(screen.getByRole('tab', { name: 'Відповідь' })).toHaveAttribute('aria-selected', 'true');
    expect(await moduleChoices(user)).toEqual([
      ['Відповідьуже додано', true],
      ['Технічні умови', false],
    ]);
  });

  it('adds another response from the tab with ＋', async () => {
    const posted: unknown[] = [];
    const { user, current: rows } = openCard([makeResponse()]);
    server.use(
      mock.post(RESPONSES, async ({ request }) => {
        posted.push(await request.json());
        const second = makeResponse({
          id: 'resp0000000000000000002',
          outgoingNumber: '140/01-15',
          responseDate: '2026-03-30',
        });
        rows.rows = [makeResponse(), second];
        return HttpResponse.json(second, { status: 201 });
      }),
    );

    await user.click(
      await within(await section()).findByRole('button', { name: 'Додати відповідь' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Нова відповідь' });
    await user.type(within(dialog).getByLabelText('Номер вихідного'), '140/01-15');
    await user.clear(within(dialog).getByLabelText('Дата відповіді'));
    await user.type(within(dialog).getByLabelText('Дата відповіді'), '2026-03-30');
    await user.selectOptions(await within(dialog).findByLabelText('Інженер'), 'Бойко Андрій');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Відповідь № 140/01-15 додано')).toBeVisible();
    expect(posted).toHaveLength(1);
    // The new one to the right of the first.
    await waitFor(async () =>
      expect(await frameNames()).toEqual([
        'Відповідь № 125/01-15 від 16.03.2026',
        'Відповідь № 140/01-15 від 30.03.2026',
      ]),
    );
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

    await addModule(user, 'Відповідь');
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

  it('removes a wrong scan from the edit dialog, after confirming', async () => {
    const scan = {
      name: 'помилковий.pdf',
      size: 2048,
      uploadedAt: '2026-03-17T10:00:00.000Z',
      uploadedBy: { id: owner.id, fullName: 'Олена Коваль' },
    };
    let removed = 0;
    const { user } = openCard([makeResponse({ scan })]);
    server.use(
      mock.delete(`${RESPONSES}/resp0000000000000000001/scan`, () => {
        removed += 1;
        return HttpResponse.json(makeResponse({ scan: null }));
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Редагувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Відповідь № 125/01-15' });
    expect(within(dialog).getByText('помилковий.pdf')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Переглянути скан' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Видалити скан' }));
    const confirm = screen.getByRole('dialog', { name: 'Видалити скан?' });
    expect(confirm).toHaveTextContent('відповіді № 125/01-15 назавжди');
    await user.click(within(confirm).getByRole('button', { name: 'Видалити' }));

    expect(await within(dialog).findByText('Скан видалено')).toBeVisible();
    expect(removed).toBe(1);
    expect(screen.queryByRole('dialog', { name: 'Видалити скан?' })).toBeNull();
    expect(within(dialog).queryByText('помилковий.pdf')).toBeNull();
    expect(within(dialog).getByText('Скан відповіді (PDF, необовʼязково)')).toBeVisible();
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
    expect(await within(await onlyFrame()).findByText('Скасовано')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Відновити' })).toBeNull();
    // Another response can still be added in the tab.
    expect(screen.getByRole('button', { name: 'Додати відповідь' })).toBeVisible();
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
    await user.click(await within(await onlyFrame()).findByRole('button', { name: 'Відновити' }));
    expect(await screen.findByText('Відповідь № 125/01-15 відновлено')).toBeVisible();
    expect(restored).toEqual([{ version: 2 }]);
  });

  it('lets an admin delete a response for good, after confirming', async () => {
    const deleted: string[] = [];
    const { user, current: rows } = openCard([makeResponse()], admin);
    server.use(
      mock.delete(`${RESPONSES}/resp0000000000000000001`, ({ request }) => {
        deleted.push(new URL(request.url).search);
        rows.rows = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(await within(await onlyFrame()).findByRole('button', { name: 'Видалити' }));
    const dialog = screen.getByRole('dialog', { name: 'Видалити відповідь № 125/01-15?' });
    expect(dialog).toHaveTextContent('назавжди');
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));

    expect(await screen.findByText('Відповідь № 125/01-15 видалено')).toBeVisible();
    expect(deleted).toEqual(['?version=1']);
    expect(screen.queryByRole('dialog')).toBeNull();
    // It was the only one: the module's tab is gone, the card opens «Заява».
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Відповідь' })).toBeNull());
    expect(screen.getByRole('tab', { name: 'Заява' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers deleting to admins only', async () => {
    openCard([makeResponse()]);
    expect(
      await within(await onlyFrame()).findByRole('button', { name: 'Редагувати' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Видалити' })).toBeNull();
  });

  it('offers no changes on an annulled application, but still shows its responses', async () => {
    openCard([makeResponse()], owner, makeApplication({ status: 'ANNULLED' }));

    expect(await onlyFrame()).toBeVisible();
    const region = await section();
    expect(within(region).queryByRole('button', { name: 'Додати відповідь' })).toBeNull();
    expect(within(region).queryByRole('button', { name: 'Редагувати' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Додати модуль' })).toBeNull();
  });
});
