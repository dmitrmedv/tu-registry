import type { ApplicationDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeApplication, makeChange, makePdf } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({
  id: 'owner000000000000000001',
  fullName: 'Олена Коваль',
  role: 'USER',
  canManageRegistration: false,
});
const authorizedOwner = { ...owner, canManageRegistration: true };

/** Serves the application (each GET returns the next item of `versions`). */
function openEdit(user = owner, versions: ApplicationDto[] = [makeApplication()]) {
  let served = 0;
  const app = versions[0]!;
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${app.id}`, () =>
      HttpResponse.json(versions[Math.min(served++, versions.length - 1)]),
    ),
    mock.get(`*/api/v1/applications/${app.id}/history`, () => HttpResponse.json([makeChange()])),
    mock.get('*/api/v1/applications/manual/check', () =>
      HttpResponse.json({ regNumber: '15т/26-8', available: true, takenOn: null }),
    ),
  );
  return renderApp(`/applications/${app.id}/edit`);
}

function captureUpdates(
  response: () => Response = () => HttpResponse.json(makeApplication({ version: 4 })),
) {
  const sent: unknown[] = [];
  server.use(
    mock.patch('*/api/v1/applications/:id', async ({ request }) => {
      sent.push(await request.json());
      return response();
    }),
  );
  return sent;
}

describe('EditApplicationPage', () => {
  it('sends only the changed fields with the version, then returns to the card', async () => {
    const sent = captureUpdates();
    const { user, router } = openEdit();

    const customer = await screen.findByLabelText('Замовник');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
    await user.clear(customer);
    await user.type(customer, 'ТОВ «Нова назва»');
    await user.clear(screen.getByLabelText('Представник замовника (необовʼязково)'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([
      { customer: 'ТОВ «Нова назва»', customerRepresentative: '', version: 3 },
    ]);
    expect(router.state.location.pathname).toBe('/applications/app00000000000000000001');
  });

  it('shows date and number only to those allowed to change them', async () => {
    openEdit(owner);

    await screen.findByLabelText('Замовник');
    expect(screen.queryByLabelText('Порядковий номер')).not.toBeInTheDocument();
    expect(screen.getByText(/Змінювати дату й номер можуть лише уповноважені/)).toBeInTheDocument();
  });

  it('asks for confirmation before changing the registration number', async () => {
    const sent = captureUpdates();
    const { user } = openEdit(authorizedOwner);

    const seq = await screen.findByLabelText('Порядковий номер');
    await user.clear(seq);
    await user.type(seq, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    const dialog = await screen.findByRole('dialog', { name: 'Змінити реєстраційні дані?' });
    expect(dialog).toHaveTextContent('Номер: 14т/26-8 → 15т/26-8');
    expect(sent).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Змінити' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ regSeq: 15, version: 3 }]);
  });

  it('shows a taken number next to the field', async () => {
    captureUpdates(() => apiError(409, 'REG_NUMBER_TAKEN', 'Номер 15т/26-8 уже зайнятий'));
    const { user } = openEdit(authorizedOwner);

    const seq = await screen.findByLabelText('Порядковий номер');
    await user.clear(seq);
    await user.type(seq, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await user.click(await screen.findByRole('button', { name: 'Змінити' }));

    expect(await screen.findByText('Номер 15т/26-8 уже зайнятий')).toBeInTheDocument();
    expect(screen.getByLabelText('Порядковий номер')).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains a concurrent edit and reloads the latest data on request', async () => {
    captureUpdates(() => apiError(409, 'VERSION_CONFLICT', 'conflict'));
    const latest = makeApplication({ customer: 'Змінено колегою', version: 4 });
    const { user } = openEdit(owner, [makeApplication(), latest]);

    const customer = await screen.findByLabelText('Замовник');
    await user.clear(customer);
    await user.type(customer, 'Моя правка');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText(/Заяву щойно змінив інший користувач/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Завантажити актуальні дані' }));

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Замовник')).toHaveValue('Змінено колегою'),
    );
  });

  it('does not offer a form for an annulled application', async () => {
    openEdit(owner, [makeApplication({ status: 'ANNULLED' })]);

    expect(
      await screen.findByRole('heading', { name: 'Редагування недоступне' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Анульовану заяву не можна редагувати/)).toBeInTheDocument();
  });

  it('sends the category with its wording, and clears the comment with ""', async () => {
    const sent = captureUpdates();
    const { user } = openEdit(owner, [makeApplication({ comment: 'Старий коментар' })]);

    await user.click(await screen.findByRole('radio', { name: 'Інше' }));
    await user.type(screen.getByLabelText('Уточніть категорію'), 'Котельня');
    await user.clear(screen.getByLabelText('Коментар (необовʼязково)'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([
      { objectCategory: 'OTHER', objectCategoryOther: 'Котельня', comment: '', version: 3 },
    ]);
  });

  it('keeps a migrated "other" without wording editable until the category is touched', async () => {
    const sent = captureUpdates();
    const legacy = makeApplication({ objectCategory: 'OTHER', objectCategoryOther: null });
    const { user } = openEdit(owner, [legacy]);

    const phone = await screen.findByLabelText('Телефон');
    expect(screen.getByRole('radio', { name: 'Інше' })).toBeChecked();
    await user.clear(phone);
    await user.type(phone, '050 111 22 33');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ phone: '+380501112233', version: 3 }]);
  });

  it('sends the settlement and the area type', async () => {
    const sent = captureUpdates();
    const { user } = openEdit(owner);

    const settlement = await screen.findByLabelText('Населений пункт');
    await user.clear(settlement);
    await user.type(settlement, 'с. Гора');
    await user.click(screen.getByRole('radio', { name: 'Сільська' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ settlement: 'с. Гора', areaType: 'RURAL', version: 3 }]);
  });

  it('asks an older record without an area type to choose one before saving', async () => {
    const sent = captureUpdates();
    const { user } = openEdit(owner, [makeApplication({ areaType: null })]);

    const phone = await screen.findByLabelText('Телефон');
    await user.clear(phone);
    await user.type(phone, '050 111 22 33');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('Оберіть місцевість')).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.click(screen.getByRole('radio', { name: 'Міська' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ phone: '+380501112233', areaType: 'URBAN', version: 3 }]);
  });

  it('lets an admin move the application to another department, confirming the new number', async () => {
    const sent = captureUpdates();
    const { user } = openEdit(makeUser({ id: 'admin000000000000000001', role: 'ADMIN' }));

    const department = await screen.findByLabelText('Управління');
    await user.selectOptions(department, 'Ренійське');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    const dialog = await screen.findByRole('dialog', { name: 'Змінити реєстраційні дані?' });
    expect(dialog).toHaveTextContent('Номер: 14т/26-8 → 14т/26-11');
    expect(dialog).toHaveTextContent('Управління: Одеське → Ренійське');
    await user.click(within(dialog).getByRole('button', { name: 'Змінити' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ department: 'RENI', version: 3 }]);
  });

  it('does not offer the department to regular users', async () => {
    openEdit(authorizedOwner);

    await screen.findByLabelText('Порядковий номер');
    expect(screen.queryByLabelText('Управління')).not.toBeInTheDocument();
  });
});

describe('EditApplicationPage — scan', () => {
  const scan = {
    name: 'старий.pdf',
    size: 2048,
    uploadedAt: '2026-03-12T09:00:00.000Z',
    uploadedBy: { id: owner.id, fullName: owner.fullName },
  };

  it('replaces the scan only on «Зберегти», after the edits of the form', async () => {
    const calls: string[] = [];
    captureUpdates(() => {
      calls.push('patch');
      return HttpResponse.json(makeApplication({ version: 4, scan }));
    });
    const { user, router } = openEdit(owner, [makeApplication({ scan })]);
    server.use(
      mock.put('*/api/v1/applications/:id/scan', async ({ request }) => {
        calls.push(`put ${((await request.formData()).get('scan') as File).name}`);
        return HttpResponse.json(makeApplication({ scan: { ...scan, name: 'новий.pdf' } }));
      }),
    );

    const customer = await screen.findByLabelText('Замовник');
    await user.clear(customer);
    await user.type(customer, 'ТОВ «Нова назва»');
    await user.upload(screen.getByLabelText('PDF-файл скану'), makePdf('новий.pdf'));
    // The zone says only that a file is there; it can be taken back until «Зберегти».
    expect(screen.getByText('Скан додано')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Прибрати файл' })).toBeVisible();
    expect(screen.queryByText('новий.pdf')).toBeNull();
    expect(calls).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Зміни збережено')).toBeInTheDocument();
    expect(calls).toEqual(['patch', 'put новий.pdf']);
    expect(router.state.location.pathname).toBe('/applications/app00000000000000000001');
  });

  it('removes the scan only on «Зберегти», which needs no other change', async () => {
    const removed = vi.fn();
    const sent = captureUpdates();
    const { user, router } = openEdit(owner, [makeApplication({ scan })]);
    server.use(
      mock.delete('*/api/v1/applications/:id/scan', () => {
        removed();
        return HttpResponse.json(makeApplication());
      }),
    );

    const save = await screen.findByRole('button', { name: 'Зберегти' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Видалити скан' }));
    expect(screen.getByText('Скан буде видалено після збереження.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Не видаляти' }));
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Видалити скан' }));
    expect(removed).not.toHaveBeenCalled();
    await user.click(save);

    expect(await screen.findByText('Скан видалено')).toBeInTheDocument();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([]);
    expect(router.state.location.pathname).toBe('/applications/app00000000000000000001');
  });

  it('keeps the chosen file and says why when the upload fails', async () => {
    const { user, router } = openEdit(owner, [makeApplication({ scan })]);
    server.use(
      mock.put('*/api/v1/applications/:id/scan', () => apiError(400, 'SCAN_NOT_PDF', 'Це не PDF')),
    );

    await user.upload(await screen.findByLabelText('PDF-файл скану'), makePdf('новий.pdf'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Скан не завантажено: Це не PDF')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Прибрати файл' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/applications/app00000000000000000001/edit');
  });
});
