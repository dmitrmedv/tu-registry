import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs, signedOut } from '@/test/server';

describe('App', () => {
  it('restores the session on load and renders the registry inside the layout', async () => {
    server.use(signedInAs(makeUser({ fullName: 'Олена Коваль' })));

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Реєстр заяв' })).toBeInTheDocument();
    expect(screen.getByText('Олена Коваль')).toBeInTheDocument();
  });

  it('shows the not-found page for unknown paths', async () => {
    server.use(signedOut());
    renderApp('/no-such-page');

    expect(
      await screen.findByRole('heading', { name: 'Сторінку не знайдено' }),
    ).toBeInTheDocument();
  });
});
