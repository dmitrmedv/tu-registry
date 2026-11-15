import type { ApplicationDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeApplication, makeChange } from '@/test/fixtures';
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
      HttpResponse.json({ regNumber: '15т/26', available: true, takenOn: null }),
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
    expect(dialog).toHaveTextContent('Номер: 14т/26 → 15т/26');
    expect(sent).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Змінити' }));

    await screen.findByText('Зміни збережено');
    expect(sent).toEqual([{ regSeq: 15, version: 3 }]);
  });

  it('shows a taken number next to the field', async () => {
    captureUpdates(() => apiError(409, 'REG_NUMBER_TAKEN', 'Номер 15т/26 уже зайнятий'));
    const { user } = openEdit(authorizedOwner);

    const seq = await screen.findByLabelText('Порядковий номер');
    await user.clear(seq);
    await user.type(seq, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await user.click(await screen.findByRole('button', { name: 'Змінити' }));

    expect(await screen.findByText('Номер 15т/26 уже зайнятий')).toBeInTheDocument();
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
});
