import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs, signedOut } from '@/test/server';

const admin = makeUser();
const employee = makeUser({ id: 'u2', login: 'ivan', fullName: 'Іван Петренко', role: 'USER' });

describe('authentication flow', () => {
  it('sends a guest to the login page', async () => {
    server.use(signedOut());

    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Вхід до системи' })).toBeInTheDocument();
  });

  it('validates the login form before sending it', async () => {
    server.use(signedOut());
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Увійти' }));

    expect(await screen.findByText('Вкажіть логін')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть пароль')).toBeInTheDocument();
  });

  it('shows the server error for wrong credentials', async () => {
    server.use(
      signedOut(),
      mock.post('*/api/v1/auth/login', () =>
        apiError(401, 'INVALID_CREDENTIALS', 'Невірний логін або пароль'),
      ),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Логін'), 'admin');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Невірний логін або пароль');
  });

  it('returns to the requested page after login', async () => {
    let sentBody: unknown;
    server.use(
      signedOut(),
      mock.post('*/api/v1/auth/login', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ user: admin, accessToken: 'token' });
      }),
      mock.get('*/api/v1/users', () => HttpResponse.json([admin])),
    );
    const { user } = renderApp('/users');

    await user.type(await screen.findByLabelText('Логін'), ' Admin ');
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('heading', { name: 'Користувачі' })).toBeInTheDocument();
    expect(sentBody).toEqual({ login: 'admin', password: 'correct-password' });
  });

  it('forces a temporary password to be replaced before anything else', async () => {
    let sentBody: unknown;
    server.use(
      signedInAs({ ...employee, mustChangePassword: true }),
      mock.post('*/api/v1/auth/change-password', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(employee);
      }),
    );
    const { user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Зміна пароля' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Основна навігація' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Поточний пароль'), 'temporary-pass');
    await user.type(screen.getByLabelText('Новий пароль'), 'my-own-password');
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'something-else');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));
    expect(await screen.findByText('Паролі не збігаються')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Повторіть новий пароль'));
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'my-own-password');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));

    expect(await screen.findByRole('heading', { name: 'Реєстр заяв' })).toBeInTheDocument();
    // The confirmation never leaves the browser.
    expect(sentBody).toEqual({ currentPassword: 'temporary-pass', newPassword: 'my-own-password' });
  });

  it('logs out and returns to the login page', async () => {
    server.use(
      signedInAs(employee),
      mock.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('heading', { name: 'Вхід до системи' })).toBeInTheDocument();
  });

  it('hides the users section from non-admins and blocks direct access', async () => {
    server.use(signedInAs(employee));
    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Недостатньо прав' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Основна навігація' });
    expect(within(nav).queryByRole('link', { name: 'Користувачі' })).not.toBeInTheDocument();
  });
});
