import type { ApplicationDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeApplication, makeChange } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({
  id: 'owner000000000000000001',
  fullName: 'Олена Коваль',
  role: 'USER',
  canManageRegistration: false,
});
const stranger = makeUser({
  id: 'other000000000000000001',
  role: 'USER',
  canManageRegistration: false,
});
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });

function openCard(user = owner, app: ApplicationDto = makeApplication()) {
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${app.id}`, () => HttpResponse.json(app)),
    mock.get(`*/api/v1/applications/${app.id}/history`, () =>
      HttpResponse.json([
        makeChange({
          id: 'c2',
          action: 'UPDATED',
          changedAt: '2026-03-13T10:00:00.000Z',
          changes: [
            { field: 'phone', oldValue: '+380671234567', newValue: '+380501112233' },
            { field: 'customerRepresentative', oldValue: 'Петренко Іван', newValue: null },
          ],
        }),
        makeChange(),
      ]),
    ),
  );
  return renderApp(`/applications/${app.id}`);
}

describe('ApplicationPage', () => {
  it('shows the card with formatted values and the history with readable fields', async () => {
    openCard();

    expect(await screen.findByRole('heading', { name: 'Заява 14т/26' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+380 67 123 45 67' })).toHaveAttribute(
      'href',
      'tel:+380671234567',
    );
    expect(screen.getByText('12.03.2026')).toBeInTheDocument();
    expect(screen.getByText('Побутовий')).toBeInTheDocument();

    const history = await screen.findByRole('list', { name: 'Історія змін' });
    const entries = within(history)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === history);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Змінено');
    expect(entries[0]).toHaveTextContent('Телефон: +380 67 123 45 67 → +380 50 111 22 33');
    expect(entries[0]).toHaveTextContent('Представник замовника: Петренко Іван → —');
    expect(entries[1]).toHaveTextContent('Зареєстровано');
  });

  it('offers editing and annulment to the owner, but not restoring', async () => {
    openCard(owner);

    await screen.findByRole('heading', { name: 'Заява 14т/26' });
    expect(screen.getByRole('link', { name: 'Редагувати' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Анулювати' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відновити' })).not.toBeInTheDocument();
  });

  it("offers no actions on someone else's application", async () => {
    openCard(stranger);

    await screen.findByRole('heading', { name: 'Заява 14т/26' });
    expect(screen.queryByRole('link', { name: 'Редагувати' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Анулювати' })).not.toBeInTheDocument();
  });

  it('annuls with a required reason and the current version', async () => {
    const annul = vi.fn();
    const { user } = openCard(owner);
    server.use(
      mock.post('*/api/v1/applications/:id/annul', async ({ request }) => {
        annul(await request.json());
        return HttpResponse.json(makeApplication({ status: 'ANNULLED', version: 4 }));
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Анулювати' }));
    const dialog = screen.getByRole('dialog', { name: 'Анулювати заяву 14т/26?' });
    await user.click(within(dialog).getByRole('button', { name: 'Анулювати' }));
    expect(within(dialog).getByText('Вкажіть причину анулювання')).toBeInTheDocument();
    expect(annul).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Причина анулювання'), 'Подано помилково');
    await user.click(within(dialog).getByRole('button', { name: 'Анулювати' }));

    await vi.waitFor(() =>
      expect(annul).toHaveBeenCalledWith({ reason: 'Подано помилково', version: 3 }),
    );
  });

  it('shows the annulment and lets an administrator restore it', async () => {
    const restore = vi.fn();
    const annulled = makeApplication({
      status: 'ANNULLED',
      annulment: {
        reason: 'Дубль',
        at: '2026-03-14T08:00:00.000Z',
        by: { id: admin.id, fullName: admin.fullName },
      },
    });
    const { user } = openCard(admin, annulled);
    server.use(
      mock.post('*/api/v1/applications/:id/restore', async ({ request }) => {
        restore(await request.json());
        return HttpResponse.json(makeApplication({ version: 4 }));
      }),
    );

    expect(await screen.findByText('Анульовано', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Дубль')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Редагувати' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Відновити' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Відновити заяву 14т/26?' })).getByRole('button', {
        name: 'Відновити',
      }),
    );

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith({ version: 3 }));
  });

  it('says so when the application does not exist', async () => {
    server.use(
      signedInAs(owner),
      mock.get('*/api/v1/applications/:id', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Заяву не знайдено' } },
          { status: 404 },
        ),
      ),
    );

    renderApp('/applications/missing000000000000000001');

    expect(await screen.findByRole('heading', { name: 'Заяву не знайдено' })).toBeInTheDocument();
  });
});
