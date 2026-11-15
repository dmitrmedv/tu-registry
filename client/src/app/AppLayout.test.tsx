import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { chooseSetting, renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const engineer = makeUser({
  id: 'u1',
  fullName: 'Інженеров Інженер Інженерович',
  role: 'USER',
  department: 'ROZDILNA',
});
const admin = makeUser({ id: 'a1', fullName: 'Адміністратор Системи', role: 'ADMIN' });

function open(user: typeof engineer, path = '/') {
  server.use(
    signedInAs(user),
    mock.get('*/api/v1/applications', () =>
      HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
    ),
    mock.get('*/api/v1/users/options', () => HttpResponse.json([])),
    mock.get('*/api/v1/audit', () =>
      HttpResponse.json({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } }),
    ),
  );
  return renderApp(path);
}

const settingsButton = () => screen.findByRole('button', { name: /^Налаштування/ });
const menuItems = () =>
  within(screen.getByRole('menu', { name: 'Налаштування' }))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

describe('header', () => {
  it('shows who is signed in and their department, then the registry link', async () => {
    open(engineer);

    const banner = await screen.findByRole('banner');
    expect(
      await within(banner).findByText('Інженеров Інженер Інженерович', { exact: false }),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent('Інженеров Інженер Інженерович — Користувач');
    expect(banner).toHaveTextContent('Роздільнянське управління');
    expect(within(banner).getByRole('link', { name: 'Реєстр заяв на ТУ' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('offers a user the password change and sign-out only', async () => {
    const { user } = open(engineer);

    await user.click(await settingsButton());

    expect(menuItems()).toEqual(['Змінити пароль', 'Вийти']);
  });

  it('offers an admin users and the journal too, and follows the chosen item', async () => {
    const { user, router } = open(admin);

    await user.click(await settingsButton());
    expect(menuItems()).toEqual(['Користувачі', 'Журнал', 'Змінити пароль', 'Вийти']);
    await user.click(screen.getByRole('menuitem', { name: 'Журнал' }));

    expect(router.state.location.pathname).toBe('/audit');
    // Following a link closes the menu.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('works from the keyboard and gives focus back when closed', async () => {
    const { user } = open(admin);
    const button = await settingsButton();

    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Користувачі' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Журнал' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Вийти' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Користувачі' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Вийти' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a click elsewhere', async () => {
    const { user } = open(engineer);

    await user.click(await settingsButton());
    await user.click(screen.getByRole('heading', { name: 'Реєстр заяв' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps only sign-out until a temporary password is replaced', async () => {
    const { user } = open({ ...engineer, mustChangePassword: true });

    await user.click(await settingsButton());

    expect(menuItems()).toEqual(['Вийти']);
    expect(screen.queryByRole('navigation', { name: 'Основна навігація' })).not.toBeInTheDocument();
  });

  it('signs out from the menu', async () => {
    const { user } = open(engineer);
    server.use(mock.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));

    await chooseSetting(user, 'Вийти');

    expect(await screen.findByRole('heading', { name: 'Вхід до системи' })).toBeInTheDocument();
  });
});
