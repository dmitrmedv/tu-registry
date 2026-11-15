import type { ApplicationListItemDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const me = makeUser({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', fullName: 'Олена Коваль' });
const colleague = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', fullName: 'Іван Петренко', isActive: true };

const row = (overrides: Partial<ApplicationListItemDto> = {}): ApplicationListItemDto => ({
  id: 'a1',
  regNumber: '15т/26',
  regYear: 2026,
  regSeq: 15,
  regDate: '2026-03-12',
  customer: 'ТОВ «Приклад»',
  customerRepresentative: null,
  settlement: 'м. Київ',
  objectAddress: 'вул. Прикладна, 1',
  cadastralNumber: null,
  objectType: 'DOMESTIC',
  objectCategory: 'RESIDENTIAL_HOUSE',
  objectCategoryOther: null,
  registrationMode: 'AUTO',
  status: 'ACTIVE',
  createdBy: { id: me.id, fullName: me.fullName },
  ...overrides,
});

/** Captures every list request; answers with the given rows and page count. */
function serveRegistry(rows: ApplicationListItemDto[] = [row()], totalPages = 1) {
  const requests: URLSearchParams[] = [];
  server.use(
    signedInAs(me),
    mock.get('*/api/v1/applications', ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return HttpResponse.json({
        data: rows,
        meta: {
          page: Number(params.get('page') ?? 1),
          limit: Number(params.get('limit') ?? 20),
          total: rows.length === 0 ? 0 : rows.length * totalPages,
          totalPages,
        },
      });
    }),
    mock.get('*/api/v1/users/options', () =>
      HttpResponse.json([{ id: me.id, fullName: me.fullName, isActive: true }, colleague]),
    ),
  );
  const last = () => requests.at(-1)!;
  return { requests, last };
}

describe('RegistryPage', () => {
  it("shows everyone's applications by default, newest first", async () => {
    const { last } = serveRegistry([
      row(),
      row({
        id: 'a2',
        regNumber: '14т/24',
        registrationMode: 'MANUAL',
        customerRepresentative: 'Петренко Іван',
        objectCategory: 'OTHER',
        objectCategoryOther: 'Котельня',
        cadastralNumber: '3220481301:01:007:0012',
      }),
    ]);

    renderApp('/');

    const table = await screen.findByRole('table', { name: 'Реєстр заяв' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1]!).getByText('15т/26')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('12.03.2026')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('—')).toBeInTheDocument(); // no representative
    expect(within(rows[1]!).getByText('Житловий будинок')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('вручну')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Інше: Котельня')).toBeInTheDocument();
    expect(last().get('createdBy')).toBeNull();
    expect(last().get('sort')).toBe('-regDate');
    expect(screen.getByRole('status')).toHaveTextContent('Знайдено: 2');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      '№↕',
      'Дата реєстрації▼',
      'Замовник',
      'Населений пункт',
      'Адреса',
      'Тип обʼєкта',
      'Категорія',
      'Представник замовника',
      'Зареєстрував',
    ]);
    expect(
      within(rows[2]!).getByText('вул. Прикладна, 1; кад. № 3220481301:01:007:0012'),
    ).toBeInTheDocument();
    // One way back to the registry (the header title) and one "Нова заява" (on the page).
    expect(screen.getAllByRole('link', { name: /^Реєстр/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Нова заява' })).toHaveLength(1);
  });

  it('applies a text filter after typing pauses and starts from page 1', async () => {
    const { last } = serveRegistry();
    const { user, router } = renderApp('/?page=3');
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('Замовник'), 'Приклад');

    await waitFor(() => expect(last().get('customer')).toBe('Приклад'));
    expect(last().get('page')).toBe('1');
    expect(router.state.location.search).toBe(`?customer=${encodeURIComponent('Приклад')}`);
  });

  it('restores filters from the URL', async () => {
    const { last } = serveRegistry();

    renderApp('/?customer=ТОВ&type=NON_DOMESTIC&user=all&from=2026-01-01&to=2026-03-31');

    await screen.findByRole('table');
    expect(screen.getByLabelText('Замовник')).toHaveValue('ТОВ');
    expect(screen.getByLabelText('Тип обʼєкта')).toHaveValue('NON_DOMESTIC');
    expect(last().get('objectType')).toBe('NON_DOMESTIC');
    expect(last().get('createdBy')).toBeNull();
    expect(last().get('dateFrom')).toBe('2026-01-01');
    expect(last().get('dateTo')).toBe('2026-03-31');
  });

  it('filters by a colleague and by all users', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('option', { name: 'Іван Петренко' });

    await user.selectOptions(screen.getByLabelText('Користувач'), 'Іван Петренко');
    await waitFor(() => expect(last().get('createdBy')).toBe(colleague.id));

    await user.selectOptions(screen.getByLabelText('Користувач'), 'Усі користувачі');
    await waitFor(() => expect(last().get('createdBy')).toBeNull());
  });

  it('toggles sorting by number and announces it', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /№/ }));
    await waitFor(() => expect(last().get('sort')).toBe('-regNumber'));
    expect(screen.getByRole('columnheader', { name: /№/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await user.click(screen.getByRole('button', { name: /№/ }));
    await waitFor(() => expect(last().get('sort')).toBe('regNumber'));
  });

  it('pages through results and changes the page size', async () => {
    const { last } = serveRegistry([row()], 3);
    const { user } = renderApp('/');
    await screen.findByText('Сторінка 1 з 3');

    expect(screen.getByRole('button', { name: '‹ Попередня' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Наступна ›' }));
    await waitFor(() => expect(last().get('page')).toBe('2'));

    await user.selectOptions(screen.getByLabelText('Рядків на сторінці'), 'по 50');
    await waitFor(() => expect(last().get('limit')).toBe('50'));
    expect(last().get('page')).toBe('1');
    // Each change of page or page size starts from the top of the list.
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
  });

  it('flags a malformed number and does not send it', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('Номер'), 'abc');

    expect(await screen.findByText('Номер: 15 або 15т/26')).toBeInTheDocument();
    expect(last().get('number')).toBeNull();
  });

  it('invites to register when I have no applications yet', async () => {
    const { last } = serveRegistry([]);
    const { user } = renderApp('/?user=mine');

    expect(await screen.findByText('Ви ще не зареєстрували жодної заяви.')).toBeInTheDocument();
    expect(last().get('createdBy')).toBe(me.id);
    await user.click(screen.getByRole('button', { name: 'Показати всі заяви' }));
    await waitFor(() => expect(last().get('createdBy')).toBeNull());
  });

  it('offers to reset filters when nothing matches, keeping the sort order', async () => {
    const { last } = serveRegistry([]);
    const { user, router } = renderApp('/?customer=Немає&sort=regNumber');

    expect(await screen.findByText('Нічого не знайдено за вказаними умовами.')).toBeInTheDocument();
    await user.click(
      within(screen.getByText('Нічого не знайдено за вказаними умовами.').parentElement!).getByRole(
        'button',
        { name: 'Скинути фільтри' },
      ),
    );

    await waitFor(() => expect(last().get('customer')).toBeNull());
    expect(router.state.location.search).toBe('?sort=regNumber');
    expect(screen.getByLabelText('Замовник')).toHaveValue('');
  });
});

describe('RegistryPage — card links and status', () => {
  it('links numbers to the card, keeping the filters, and marks annulled rows', async () => {
    serveRegistry([row(), row({ id: 'a2', regNumber: '16т/26', status: 'ANNULLED' })]);
    renderApp('/?customer=ТОВ');

    const link = await screen.findByRole('link', { name: '15т/26' });
    expect(link).toHaveAttribute('href', '/applications/a1');
    const annulledRow = screen.getByRole('link', { name: '16т/26' }).closest('tr')!;
    expect(within(annulledRow).getByText('Анульовано')).toBeInTheDocument();
  });

  it('opens the card from anywhere in the row; Ctrl+click opens a new tab', async () => {
    serveRegistry();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user, router } = renderApp('/?customer=ТОВ');
    const customerCell = await screen.findByRole('cell', { name: 'ТОВ «Приклад»' });

    await user.keyboard('{Control>}');
    await user.click(customerCell);
    await user.keyboard('{/Control}');
    expect(open).toHaveBeenCalledWith('/applications/a1', '_blank', 'noopener');
    expect(router.state.location.pathname).toBe('/');

    await user.click(customerCell);
    expect(router.state.location.pathname).toBe('/applications/a1');
    expect(router.state.location.state).toEqual({ registrySearch: '?customer=ТОВ' });
    open.mockRestore();
  });

  it('does not open the card when the click ends a text selection', async () => {
    serveRegistry();
    const { user, router } = renderApp('/');
    const customerCell = await screen.findByRole('cell', { name: 'ТОВ «Приклад»' });
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Приклад',
    } as Selection);

    await user.click(customerCell);

    expect(router.state.location.pathname).toBe('/');
    selection.mockRestore();
  });

  it('searches by settlement, and by street or cadastral number in "Адреса"', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('Населений пункт'), 'Бровари');
    await waitFor(() => expect(last().get('settlement')).toBe('Бровари'));
    expect(screen.getByLabelText('Адреса')).toHaveAttribute('placeholder', 'вулиця або кад. №');
  });

  it('filters by category', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Категорія'), 'Виробник біогазу');

    await waitFor(() => expect(last().get('objectCategory')).toBe('BIOGAS_PRODUCER'));
  });

  it('filters by status', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Статус'), 'Анульовані');

    await waitFor(() => expect(last().get('status')).toBe('ANNULLED'));
  });
});
