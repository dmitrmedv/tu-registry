import { screen } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { chooseSetting, renderApp } from '@/test/renderApp';
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

    await chooseSetting(user, 'Вийти');

    expect(await screen.findByRole('heading', { name: 'Вхід до системи' })).toBeInTheDocument();
  });

  it('after logging out, the next sign-in starts at the registry, not the last page', async () => {
    server.use(
      signedInAs(employee),
      mock.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
      mock.get('*/api/v1/applications/next-number', () =>
        HttpResponse.json({
          regNumber: '1т/26-8',
          regYear: 2026,
          regSeq: 1,
          regDate: '2026-03-12',
        }),
      ),
      mock.post('*/api/v1/auth/login', () => HttpResponse.json({ user: admin, accessToken: 't' })),
      mock.get('*/api/v1/applications', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
      ),
      mock.get('*/api/v1/users/options', () => HttpResponse.json([])),
    );
    const { user, router } = renderApp('/applications/new');
    await screen.findByRole('heading', { name: 'Нова заява' });

    await chooseSetting(user, 'Вийти');
    await user.type(await screen.findByLabelText('Логін'), 'admin');
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('heading', { name: 'Реєстр заяв' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  /** Signs `who` in on the users page, then lets the session end on the next request. */
  async function expireSessionOnTheWayToAudit(who: typeof admin, nextUser: typeof admin) {
    const emptyPage = { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } };
    server.use(
      signedInAs(who),
      mock.get('*/api/v1/users', () => HttpResponse.json([who])),
      mock.get('*/api/v1/applications', () => HttpResponse.json(emptyPage)),
      mock.get('*/api/v1/users/options', () => HttpResponse.json([])),
    );
    const rendered = renderApp('/users');
    await screen.findByRole('heading', { name: 'Користувачі' });
    // The access token is refused and refreshing fails: the session has ended on its own.
    server.use(
      signedOut(),
      mock.get('*/api/v1/audit', () => apiError(401, 'TOKEN_INVALID', 'Токен недійсний')),
      mock.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ user: nextUser, accessToken: 't' }),
      ),
    );
    await rendered.router.navigate('/audit');
    // Said by a notification; the sign-in form follows.
    expect(await screen.findByText('Сесія завершилась. Увійдіть знову.')).toBeInTheDocument();
    // Signing in again works; the journal answers now.
    server.use(mock.get('*/api/v1/audit', () => HttpResponse.json(emptyPage)));
    await rendered.user.type(await screen.findByLabelText('Логін'), nextUser.login);
    await rendered.user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await rendered.user.click(screen.getByRole('button', { name: 'Увійти' }));
    return rendered;
  }

  it('after an expired session, returns the same user to the page they were opening', async () => {
    const { router } = await expireSessionOnTheWayToAudit(admin, admin);

    expect(await screen.findByRole('heading', { name: 'Журнал аудиту' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/audit');
  });

  it('after an expired session, sends a different user to the registry', async () => {
    const otherAdmin = makeUser({ id: 'admin2', login: 'boss2', fullName: 'Інший Адміністратор' });
    const { router } = await expireSessionOnTheWayToAudit(admin, otherAdmin);

    expect(await screen.findByRole('heading', { name: 'Реєстр заяв' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('hides the users section from non-admins and blocks direct access', async () => {
    server.use(signedInAs(employee));
    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Недостатньо прав' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Користувачі' })).not.toBeInTheDocument();
  });
});
