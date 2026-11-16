import { screen, within } from '@testing-library/react';
import type { EngineerDto } from '@tu-registry/shared';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { chooseSetting, renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const admin = makeUser({ role: 'ADMIN', department: 'ODESA' });

const engineer = (overrides: Partial<EngineerDto> = {}): EngineerDto => ({
  id: 'e1',
  fullName: 'Бойко Андрій',
  department: 'ODESA',
  isActive: true,
  ...overrides,
});

/** Answers GET /engineers with `rows`, filtered like the server does; records the queries. */
function engineersApi(rows: EngineerDto[]) {
  const queries: string[] = [];
  server.use(
    mock.get('*/api/v1/engineers', ({ request }) => {
      const department = new URL(request.url).searchParams.get('department');
      queries.push(department ?? '');
      return HttpResponse.json(rows.filter((row) => !department || row.department === department));
    }),
  );
  return queries;
}

describe('EngineersPage', () => {
  it('is reached from the settings menu and lists engineers of every department', async () => {
    server.use(signedInAs(admin));
    engineersApi([
      engineer(),
      engineer({ id: 'e2', fullName: 'Ткач Ярослав', department: 'RENI', isActive: false }),
    ]);
    const { user, router } = renderApp('/');
    await chooseSetting(user, 'Інженери');
    expect(router.state.location.pathname).toBe('/engineers');

    const table = await screen.findByRole('table', { name: 'Інженери' });
    const [odesa, reni] = within(table).getAllByRole('row').slice(1) as [HTMLElement, HTMLElement];
    expect(odesa).toHaveTextContent('Одеське');
    expect(reni).toHaveTextContent('Ренійське');
    expect(reni).toHaveTextContent('Неактивний');
    expect(within(reni).getByRole('button', { name: 'Активувати: Ткач Ярослав' })).toBeVisible();
  });

  it('filters by department through the URL', async () => {
    server.use(signedInAs(admin));
    const queries = engineersApi([engineer(), engineer({ id: 'e2', department: 'RENI' })]);
    const { user, router } = renderApp('/engineers');

    await screen.findByRole('table', { name: 'Інженери' });
    await user.selectOptions(screen.getByLabelText('Управління'), 'Ренійське');

    expect(router.state.location.search).toBe('?department=RENI');
    expect(await screen.findAllByRole('row')).toHaveLength(2);
    expect(queries).toContain('RENI');
  });

  it('adds an engineer to the filtered department and shows a taken name by the field', async () => {
    server.use(signedInAs(admin));
    engineersApi([]);
    const sent: unknown[] = [];
    server.use(
      mock.post('*/api/v1/engineers', async ({ request }) => {
        const body = (await request.json()) as { fullName: string };
        sent.push(body);
        if (sent.length === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'CONFLICT',
                message: 'Інженер з таким ПІБ в управлінні вже є',
                details: { fieldErrors: { fullName: ['Інженер з таким ПІБ в управлінні вже є'] } },
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(engineer({ fullName: body.fullName, department: 'RENI' }), {
          status: 201,
        });
      }),
    );
    const { user } = renderApp('/engineers?department=RENI');

    expect(await screen.findByText('Інженерів ще не додано.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Додати інженера' }));
    const dialog = screen.getByRole('dialog', { name: 'Новий інженер' });
    expect(await within(dialog).findByLabelText('Управління')).toHaveValue('RENI');
    await user.type(within(dialog).getByLabelText('ПІБ'), 'Бойко Андрій');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await within(dialog).findByText('Інженер з таким ПІБ в управлінні вже є')).toBeVisible();
    await user.type(within(dialog).getByLabelText('ПІБ'), ' Петрович');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Інженера «Бойко Андрій Петрович» додано')).toBeVisible();
    expect(sent).toEqual([
      { fullName: 'Бойко Андрій', department: 'RENI' },
      { fullName: 'Бойко Андрій Петрович', department: 'RENI' },
    ]);
  });

  it('renames without offering to change the department', async () => {
    server.use(signedInAs(admin));
    engineersApi([engineer()]);
    const sent: unknown[] = [];
    server.use(
      mock.patch('*/api/v1/engineers/e1', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(engineer({ fullName: 'Бойко Андрій Петрович' }));
      }),
    );
    const { user } = renderApp('/engineers');

    await user.click(await screen.findByRole('button', { name: 'Редагувати: Бойко Андрій' }));
    const dialog = screen.getByRole('dialog', { name: 'Редагування: Бойко Андрій' });
    expect(within(dialog).queryByLabelText('Управління')).toBeNull();
    expect(dialog).toHaveTextContent('Управління: Одеське');
    await user.type(within(dialog).getByLabelText('ПІБ'), ' Петрович');
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Інженера «Бойко Андрій Петрович» збережено')).toBeVisible();
    expect(sent).toEqual([{ fullName: 'Бойко Андрій Петрович' }]);
  });

  it('deactivates after a confirmation and shows a refusal in the dialog', async () => {
    server.use(signedInAs(admin));
    engineersApi([engineer()]);
    const sent: unknown[] = [];
    server.use(
      mock.patch('*/api/v1/engineers/e1', async ({ request }) => {
        sent.push(await request.json());
        return sent.length === 1
          ? apiError(500, 'INTERNAL', 'Сервер недоступний')
          : HttpResponse.json(engineer({ isActive: false }));
      }),
    );
    const { user } = renderApp('/engineers');

    await user.click(await screen.findByRole('button', { name: 'Деактивувати: Бойко Андрій' }));
    const dialog = screen.getByRole('dialog', { name: 'Деактивувати інженера «Бойко Андрій»?' });
    await user.click(within(dialog).getByRole('button', { name: 'Деактивувати' }));
    expect(await within(dialog).findByText('Сервер недоступний')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Деактивувати' }));

    expect(await screen.findByText('Інженера «Бойко Андрій» деактивовано')).toBeVisible();
    expect(sent).toEqual([{ isActive: false }, { isActive: false }]);
  });
});
