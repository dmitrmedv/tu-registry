import type { AuditLogDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const admin = makeUser({ role: 'ADMIN' });

const entries: AuditLogDto[] = [
  {
    id: 'e1',
    createdAt: '2026-03-12T09:00:00.000Z',
    action: 'REG_NUMBER_CHANGED',
    actor: { id: admin.id, fullName: admin.fullName, login: admin.login },
    entityType: 'Application',
    entityId: 'app00000000000000000001',
    entityLabel: '50т/26-8',
    details: { from: '1т/26-8', to: '50т/26-8' },
    ip: '127.0.0.1',
  },
  {
    id: 'e3',
    createdAt: '2026-03-12T10:00:00.000Z',
    action: 'APPLICATION_DELETED',
    actor: { id: admin.id, fullName: admin.fullName, login: admin.login },
    entityType: 'Application',
    entityId: 'app00000000000000000002',
    entityLabel: '7т/26-8',
    details: { regNumber: '7т/26-8', regDate: '2026-02-01' },
    ip: '127.0.0.1',
  },
  {
    id: 'e2',
    createdAt: '2026-03-12T08:00:00.000Z',
    action: 'LOGIN_FAILED',
    actor: null,
    entityType: null,
    entityId: null,
    entityLabel: null,
    details: { login: 'ivan', reason: 'WRONG_PASSWORD' },
    ip: '10.0.0.5',
  },
];

function openJournal() {
  const requests: URLSearchParams[] = [];
  server.use(
    signedInAs(admin),
    mock.get('*/api/v1/audit', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: entries,
        meta: { page: 1, limit: 50, total: 3, totalPages: 1 },
      });
    }),
  );
  return { ...renderApp('/audit'), requests };
}

describe('AuditPage', () => {
  it('shows readable actions, objects and details', async () => {
    openJournal();

    const table = await screen.findByRole('table', { name: 'Журнал аудиту' });
    const [, first, deleted, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('Змінено номер заяви');
    expect(within(first!).getByRole('link', { name: 'Заява 50т/26-8' })).toHaveAttribute(
      'href',
      '/applications/app00000000000000000001',
    );
    expect(first).toHaveTextContent('1т/26-8 → 50т/26-8');
    // A deleted application keeps its number but has no card to link to.
    expect(deleted).toHaveTextContent('Видалено заяву');
    expect(deleted).toHaveTextContent('Заява 7т/26-8');
    expect(deleted).toHaveTextContent('заява від 01.02.2026');
    expect(within(deleted!).queryByRole('link')).not.toBeInTheDocument();
    expect(second).toHaveTextContent('Невдалий вхід');
    expect(second).toHaveTextContent('логін «ivan», невірний пароль');
  });

  it('filters by action through the URL', async () => {
    const { user, router, requests } = openJournal();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Дія'), 'Відмовлено в доступі');

    await waitFor(() => expect(requests.at(-1)?.get('action')).toBe('ACCESS_DENIED'));
    expect(router.state.location.search).toBe('?action=ACCESS_DENIED');
  });

  it('is not available to regular users', async () => {
    server.use(signedInAs(makeUser({ role: 'USER' })));

    renderApp('/audit');

    expect(await screen.findByRole('heading', { name: 'Недостатньо прав' })).toBeInTheDocument();
  });
});
