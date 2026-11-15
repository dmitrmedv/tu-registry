import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const admin = makeUser();
const ivan = makeUser({ id: 'u2', login: 'ivan', fullName: 'Іван Петренко', role: 'USER' });
const petro = makeUser({
  id: 'u3',
  login: 'petro',
  fullName: 'Петро Коваль',
  role: 'USER',
  isActive: false,
});

function openUsersPage(users = [admin, ivan, petro]) {
  server.use(
    signedInAs(admin),
    mock.get('*/api/v1/users', () => HttpResponse.json(users)),
  );
  return renderApp('/users');
}

describe('UsersPage', () => {
  it('lists active users, filters by search and can reveal deactivated ones', async () => {
    const { user } = openUsersPage();

    expect(await screen.findByRole('cell', { name: 'Іван Петренко' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Петро Коваль' })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Показати деактивованих'));
    expect(screen.getByRole('cell', { name: 'Петро Коваль' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Пошук'), 'петр');
    expect(screen.getByText('Показано 2 з 3')).toBeInTheDocument();
  });

  it('creates a user and shows the temporary password once', async () => {
    let sentBody: unknown;
    const { user } = openUsersPage();
    server.use(
      mock.post('*/api/v1/users', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            user: makeUser({ id: 'u4', login: 'olena', fullName: 'Олена Коваль', role: 'USER' }),
            temporaryPassword: 'Tmp4Pass5Word6',
          },
          { status: 201 },
        );
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Додати користувача' }));
    const dialog = screen.getByRole('dialog', { name: 'Новий користувач' });
    await user.type(within(dialog).getByLabelText('Логін'), 'olena');
    await user.type(within(dialog).getByLabelText('ПІБ'), 'Олена Коваль');
    await user.click(within(dialog).getByLabelText('Уповноважений користувач'));
    await user.click(screen.getByRole('button', { name: 'Створити' }));

    const result = await screen.findByRole('dialog', { name: 'Користувача створено' });
    expect(within(result).getByLabelText('Тимчасовий пароль')).toHaveTextContent('Tmp4Pass5Word6');
    expect(sentBody).toEqual({
      login: 'olena',
      fullName: 'Олена Коваль',
      role: 'USER',
      canManageRegistration: true,
    });
  });

  it('shows a duplicate login error next to the field', async () => {
    const { user } = openUsersPage();
    server.use(
      mock.post('*/api/v1/users', () =>
        apiError(409, 'CONFLICT', 'Користувач з таким логіном уже існує'),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Додати користувача' }));
    const dialog = screen.getByRole('dialog', { name: 'Новий користувач' });
    await user.type(within(dialog).getByLabelText('Логін'), 'ivan');
    await user.type(within(dialog).getByLabelText('ПІБ'), 'Іван Дубль');
    await user.click(screen.getByRole('button', { name: 'Створити' }));

    expect(
      await within(dialog).findByText('Користувач з таким логіном уже існує'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Логін')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not offer to change the own role or status', async () => {
    const { user } = openUsersPage();

    await user.click(await screen.findByRole('button', { name: `Редагувати: ${admin.fullName}` }));

    const dialog = screen.getByRole('dialog', { name: 'Редагування: admin' });
    expect(within(dialog).getByLabelText('Роль')).toBeDisabled();
    expect(within(dialog).getByLabelText('Обліковий запис активний')).toBeDisabled();
  });

  it('asks for confirmation before deactivating and sends only the change', async () => {
    let sentBody: unknown;
    const { user } = openUsersPage();
    server.use(
      mock.patch('*/api/v1/users/u2', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ ...ivan, isActive: false });
      }),
    );

    await user.click(await screen.findByRole('button', { name: `Редагувати: ${ivan.fullName}` }));
    await user.click(screen.getByLabelText('Обліковий запис активний'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    const confirm = await screen.findByRole('dialog', { name: 'Деактивувати користувача?' });
    expect(sentBody).toBeUndefined();
    await user.click(within(confirm).getByRole('button', { name: 'Деактивувати' }));

    await vi.waitFor(() => expect(sentBody).toEqual({ isActive: false }));
  });
});
