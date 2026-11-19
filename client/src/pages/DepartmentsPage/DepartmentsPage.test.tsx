import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { chooseSetting, renderApp } from '@/test/renderApp';
import { apiError, departmentsList, makeUser, server, signedInAs } from '@/test/server';

const admin = makeUser({ role: 'ADMIN' });

function openDepartments(overrides: Parameters<typeof departmentsList>[0] = {}) {
  server.use(
    signedInAs(admin),
    mock.get('*/api/v1/departments', () => HttpResponse.json(departmentsList(overrides))),
  );
  return renderApp('/departments');
}

const rowOf = async (name: string) => (await screen.findByRole('cell', { name })).closest('tr')!;

describe('DepartmentsPage', () => {
  it('is reached from the settings menu and lists codes, names and counts', async () => {
    server.use(signedInAs(admin));
    const { user, router } = renderApp('/');
    await chooseSetting(user, 'Управління');
    expect(router.state.location.pathname).toBe('/departments');

    const table = await screen.findByRole('table', { name: 'Управління' });
    expect(within(table).getAllByRole('row')).toHaveLength(15); // header + 14
    const odesa = await rowOf('Одеське');
    expect(
      within(odesa)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['8', 'Одеське', '0', '0', 'Активне', expect.any(String)]);
  });

  it('adds a department with the next free code suggested', async () => {
    const sent: unknown[] = [];
    const { user } = openDepartments();
    server.use(
      mock.post('*/api/v1/departments', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(
          { id: 'new1', name: 'Тестове', code: 15, archived: false },
          { status: 201 },
        );
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Додати управління' }));
    const dialog = screen.getByRole('dialog', { name: 'Нове управління' });
    expect(within(dialog).getByLabelText('Код')).toHaveValue('15');
    expect(dialog).toHaveTextContent('наприклад 1т/26-15');
    await user.type(within(dialog).getByLabelText('Назва'), 'Тестове');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Управління «Тестове» додано')).toBeInTheDocument();
    expect(sent).toEqual([{ name: 'Тестове', code: 15 }]);
  });

  it('shows a taken code next to the field', async () => {
    const { user } = openDepartments();
    server.use(
      mock.patch('*/api/v1/departments/:id', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Цей код уже має інше управління',
              details: { fieldErrors: { code: ['Цей код уже має інше управління'] } },
            },
          },
          { status: 409 },
        ),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Редагувати: Ренійське' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('номери всіх заяв цього управління');
    await user.clear(within(dialog).getByLabelText('Код'));
    await user.type(within(dialog).getByLabelText('Код'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await within(dialog).findByText('Цей код уже має інше управління')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Код')).toHaveAttribute('aria-invalid', 'true');
  });

  it('archives after confirmation and restores; deleting only an empty department', async () => {
    const calls: string[] = [];
    const { user } = openDepartments({ RENI: { usersCount: 2, applicationsCount: 5 } });
    server.use(
      mock.post('*/api/v1/departments/:id/:verb', ({ params }) => {
        calls.push(`${params.verb} ${params.id}`);
        return HttpResponse.json({});
      }),
      mock.delete('*/api/v1/departments/:id', ({ params }) => {
        calls.push(`delete ${params.id}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const reni = await rowOf('Ренійське');
    expect(within(reni).queryByRole('button', { name: /^Видалити/ })).not.toBeInTheDocument();
    await user.click(within(reni).getByRole('button', { name: 'Архівувати: Ренійське' }));
    const confirm = screen.getByRole('dialog', { name: 'Архівувати управління «Ренійське»?' });
    expect(confirm).toHaveTextContent('Користувачі (2) і заяви (5) лишаються');
    await user.click(within(confirm).getByRole('button', { name: 'Архівувати' }));
    await screen.findByText('Управління «Ренійське» архівовано');

    const empty = await rowOf('Чорноморське');
    await user.click(within(empty).getByRole('button', { name: 'Видалити: Чорноморське' }));
    const remove = screen.getByRole('dialog', { name: 'Видалити управління «Чорноморське»?' });
    await user.click(within(remove).getByRole('button', { name: 'Видалити' }));
    await screen.findByText('Управління «Чорноморське» видалено');

    expect(calls).toEqual(['archive RENI', 'delete CHORNOMORSK']);
  });

  it('marks archived departments and offers to restore them', async () => {
    const restore = vi.fn();
    const { user } = openDepartments({ RENI: { archived: true } });
    server.use(
      mock.post('*/api/v1/departments/:id/restore', ({ params }) => {
        restore(params.id);
        return HttpResponse.json({});
      }),
    );

    const reni = await rowOf('Ренійське');
    expect(reni).toHaveTextContent('В архіві');
    await user.click(within(reni).getByRole('button', { name: 'Відновити: Ренійське' }));

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith('RENI'));
  });

  it('is not available to regular users', async () => {
    server.use(signedInAs(makeUser({ role: 'USER' })));
    renderApp('/departments');

    expect(await screen.findByRole('heading', { name: 'Недостатньо прав' })).toBeInTheDocument();
  });

  it('reports a refusal from the server', async () => {
    const { user } = openDepartments();
    server.use(
      mock.post('*/api/v1/departments/:id/archive', () =>
        apiError(500, 'INTERNAL_ERROR', 'Внутрішня помилка сервера'),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Архівувати: Ренійське' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Архівувати' }),
    );

    // A notification; the dialog stays open for another try.
    expect(await screen.findByText('Внутрішня помилка сервера')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
