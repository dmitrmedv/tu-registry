import type { ApplicationListItemDto } from '@tu-registry/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const me = makeUser({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', fullName: 'Олена Коваль' });
const colleague = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', fullName: 'Іван Петренко', isActive: true };

const row = (overrides: Partial<ApplicationListItemDto> = {}): ApplicationListItemDto => ({
  id: 'a1',
  regNumber: '15т/26-8',
  regYear: 2026,
  regSeq: 15,
  regDate: '2026-03-12',
  department: 'ODESA',
  customer: 'ТОВ «Приклад»',
  customerRepresentative: null,
  settlement: 'м. Київ',
  objectAddress: 'вул. Прикладна, 1',
  areaType: 'URBAN',
  gasificationType: 'NEW',
  objectType: 'DOMESTIC',
  objectCategory: 'RESIDENTIAL_HOUSE',
  objectCategoryOther: null,
  accountNumber: null,
  registrationMode: 'AUTO',
  status: 'ACTIVE',
  createdBy: { id: me.id, fullName: me.fullName },
  stage: 'REGISTERED',
  lastResponseDate: null,
  lastResponseNumber: null,
  tuDate: null,
  tuNumber: null,
  gasFlow: null,
  connectionType: null,
  engineerName: null,
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

const openMoreFilters = async (user: { click: (element: Element) => Promise<void> }) =>
  user.click(await screen.findByRole('button', { name: /^Ще фільтри/ }));

describe('RegistryPage', () => {
  it("shows everyone's applications by default, newest first", async () => {
    const { last } = serveRegistry([
      row(),
      row({
        id: 'a2',
        regNumber: '14т/24-8',
        registrationMode: 'MANUAL',
        customerRepresentative: 'Петренко Іван',
        objectCategory: 'OTHER',
        objectCategoryOther: 'Котельня',
        areaType: 'RURAL',
      }),
    ]);

    renderApp('/');

    const table = await screen.findByRole('table', { name: 'Реєстр заяв' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1]!).getByText('15т/26-8')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('12.03.2026')).toBeInTheDocument();
    // No documents yet: registered, empty document columns.
    expect(within(rows[1]!).getByText('Зареєстрована')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText('—')).toHaveLength(4);
    // How it was registered is on the card, not in the table.
    expect(within(rows[2]!).queryByText('вручну')).not.toBeInTheDocument();
    expect(within(rows[2]!).queryByText('Інше: Котельня')).not.toBeInTheDocument(); // hidden column
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
      'Управління↕', // the signed-in user is an admin
      'Замовник↕',
      'Населений пункт↕',
      'Адреса↕',
      'Тип обʼєкта↕',
      'Стан↕',
      'Дата відповіді↕',
      'Дата ТУ↕',
      'Номер ТУ↕',
      'Інженер↕',
    ]);
    // Area, category, representative and author are hidden until chosen in «Колонки».
    expect(within(rows[1]!).queryByText('Міська')).not.toBeInTheDocument();
    // One way back to the registry (the header title) and one "Нова заява" (on the page).
    expect(screen.getAllByRole('link', { name: /^Реєстр/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Нова заява' })).toHaveLength(1);
  });

  it('searches from one box after typing pauses and starts from page 1', async () => {
    const { last } = serveRegistry();
    const { user, router } = renderApp('/?page=3');
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Пошук' }), 'Приклад');

    await waitFor(() => expect(last().get('q')).toBe('Приклад'));
    expect(last().get('page')).toBe('1');
    expect(router.state.location.search).toBe(`?q=${encodeURIComponent('Приклад')}`);
  });

  it('sends a number or anything else as is: the server reads it either way', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Пошук' }), '15т/26-8');

    await waitFor(() => expect(last().get('q')).toBe('15т/26-8'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores filters from the URL', async () => {
    const { last } = serveRegistry();

    renderApp('/?q=ТОВ&type=NON_DOMESTIC&user=all&from=2026-01-01&to=2026-03-31');

    await screen.findByRole('table');
    expect(screen.getByRole('searchbox', { name: 'Пошук' })).toHaveValue('ТОВ');
    expect(screen.getByLabelText('Період')).toHaveValue('custom');
    expect(screen.getByLabelText('Дата з')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Тип обʼєкта')).toHaveValue('NON_DOMESTIC');
    expect(screen.getByRole('button', { name: 'Ще фільтри (1)' })).toBeInTheDocument();
    expect(last().get('objectType')).toBe('NON_DOMESTIC');
    expect(last().get('createdBy')).toBeNull();
    expect(last().get('dateFrom')).toBe('2026-01-01');
    expect(last().get('dateTo')).toBe('2026-03-31');
  });

  it('does not list my own name next to «Мої заяви»; an old link with my id shows «Мої заяви»', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp(`/?user=${me.id}`);
    await openMoreFilters(user);
    await screen.findByRole('option', { name: 'Іван Петренко' });

    const author = screen.getByLabelText('Користувач');
    const names = within(author)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(names).toEqual(['Усі користувачі', 'Мої заяви', 'Іван Петренко']);
    expect(author).toHaveValue('mine');
    expect(last().get('createdBy')).toBe(me.id);
  });

  it('filters by a colleague and by all users', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await openMoreFilters(user);
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
    const { user, router } = renderApp('/?q=Немає&sort=regNumber');

    expect(await screen.findByText('Нічого не знайдено за вказаними умовами.')).toBeInTheDocument();
    await user.click(
      within(screen.getByText('Нічого не знайдено за вказаними умовами.').parentElement!).getByRole(
        'button',
        { name: 'Скинути фільтри' },
      ),
    );

    await waitFor(() => expect(last().get('q')).toBeNull());
    expect(router.state.location.search).toBe('?sort=regNumber');
    expect(screen.getByRole('searchbox', { name: 'Пошук' })).toHaveValue('');
  });
});

describe('RegistryPage — card links and status', () => {
  it('links numbers to the card, keeping the filters, and marks annulled rows', async () => {
    serveRegistry([row(), row({ id: 'a2', regNumber: '16т/26-8', status: 'ANNULLED' })]);
    renderApp('/?q=ТОВ');

    const link = await screen.findByRole('link', { name: '15т/26-8' });
    expect(link).toHaveAttribute('href', '/applications/a1');
    const annulledRow = screen.getByRole('link', { name: '16т/26-8' }).closest('tr')!;
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

  it('filters by area and «Стан» and shows them as removable chips', async () => {
    const { last } = serveRegistry();
    const { user, router } = renderApp('/');
    await screen.findByRole('table');
    await openMoreFilters(user);

    await user.click(screen.getByRole('radio', { name: 'Сільська' }));
    await user.selectOptions(screen.getByLabelText('Стан'), 'На опрацюванні');

    await waitFor(() =>
      expect(Object.fromEntries(last())).toMatchObject({ areaType: 'RURAL', stage: 'IN_PROGRESS' }),
    );
    expect(router.state.location.search).toContain('area=RURAL');
    expect(screen.getByRole('button', { name: /^Ще фільтри \(2\)/ })).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Активні фільтри' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['Місцевість: Сільська×', 'Стан: На опрацюванні×']);

    await user.click(
      screen.getByRole('button', { name: 'Прибрати фільтр «Місцевість: Сільська»' }),
    );

    await waitFor(() => expect(last().get('areaType')).toBeNull());
    expect(
      within(screen.getByRole('group', { name: 'Місцевість' })).getByRole('radio', { name: 'Усі' }),
    ).toBeChecked();
    expect(last().get('stage')).toBe('IN_PROGRESS');
  });

  it('switches quick views, keeping the other filters', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/?type=DOMESTIC');
    await screen.findByRole('table');
    const views = screen.getByRole('group', { name: 'Швидкий вибір' });
    expect(within(views).getByRole('button', { name: 'Усі' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(views).getByRole('button', { name: 'Мої' }));
    await waitFor(() => expect(last().get('createdBy')).toBe(me.id));
    expect(within(views).getByRole('button', { name: 'Мої' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(views).getByRole('button', { name: 'Анульовані' }));
    await waitFor(() => expect(last().get('stage')).toBe('ANNULLED'));
    expect(last().get('createdBy')).toBeNull();
    expect(last().get('objectType')).toBe('DOMESTIC');
  });

  it('chooses a ready period in Kyiv time, or any dates by hand', async () => {
    // 23:30 UTC on Sunday 15 March is already Monday 16 March in Kyiv.
    vi.useFakeTimers({ now: new Date('2026-03-15T23:30:00Z'), toFake: ['Date'] });
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');
    const period = screen.getByLabelText('Період');

    await user.selectOptions(period, 'Сьогодні');
    await waitFor(() => expect(last().get('dateFrom')).toBe('2026-03-16'));
    expect(last().get('dateTo')).toBe('2026-03-16');

    await user.selectOptions(period, 'Цей тиждень');
    await waitFor(() => expect(last().get('dateFrom')).toBe('2026-03-16'));
    expect(last().get('dateTo')).toBeNull();
    expect(period).toHaveValue('week');

    await user.selectOptions(period, 'Цей рік');
    await waitFor(() => expect(last().get('dateFrom')).toBe('2026-01-01'));

    await user.selectOptions(period, 'Довільний…');
    // The dates stay open while being filled in, even if they match a ready period.
    await user.clear(screen.getByLabelText('Дата з'));
    await user.type(screen.getByLabelText('Дата з'), '2026-03-16');
    await user.type(screen.getByLabelText('Дата по'), '2026-03-16');
    await waitFor(() => expect(last().get('dateTo')).toBe('2026-03-16'));
    expect(screen.getByLabelText('Дата по')).toBeInTheDocument();

    // Clearing a date by hand keeps the inputs; «Будь-коли» or a reset closes them.
    await user.clear(screen.getByLabelText('Дата з'));
    await user.clear(screen.getByLabelText('Дата по'));
    expect(screen.getByLabelText('Дата з')).toBeInTheDocument();
    await user.selectOptions(period, 'Будь-коли');
    await waitFor(() => expect(last().get('dateFrom')).toBeNull());
    expect(screen.queryByLabelText('Дата з')).not.toBeInTheDocument();
  });

  it('sorts every column: names from А first, a second click reverses', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /^Замовник/ }));
    await waitFor(() => expect(last().get('sort')).toBe('customer'));
    expect(screen.getByRole('columnheader', { name: /^Замовник/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: /^Замовник/ }));
    await waitFor(() => expect(last().get('sort')).toBe('-customer'));

    await user.click(screen.getByRole('button', { name: /^Інженер/ }));
    await waitFor(() => expect(last().get('sort')).toBe('engineer'));
    // Dates of documents, like the registration date, start from the newest.
    await user.click(screen.getByRole('button', { name: /^Дата ТУ/ }));
    await waitFor(() => expect(last().get('sort')).toBe('-tuDate'));
    await user.click(screen.getByRole('button', { name: /^Дата відповіді/ }));
    await waitFor(() => expect(last().get('sort')).toBe('-lastResponseDate'));
  });

  it('keeps the rarer filters folded until asked', async () => {
    serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');
    const toggle = screen.getByRole('button', { name: /^Ще фільтри/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Категорія' })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Категорія' })).toBeVisible();
  });

  it('shows an admin Одеське by default and lets them pick all departments', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');

    expect(last().get('department')).toBe('ODESA');
    expect(screen.getByLabelText('Управління')).toHaveValue('ODESA');

    await user.selectOptions(screen.getByLabelText('Управління'), 'Усі управління');
    await waitFor(() => expect(last().get('department')).toBeNull());
  });

  it('gives a regular user neither the department filter nor the column', async () => {
    const { last } = serveRegistry();
    server.use(signedInAs({ ...me, role: 'USER' }));
    renderApp('/');

    const table = await screen.findByRole('table');
    expect(screen.queryByLabelText('Управління')).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /^Управління/ })).toBeNull();
    expect(last().get('department')).toBeNull();
  });

  it('filters by category', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/');
    await screen.findByRole('table');
    await openMoreFilters(user);

    await user.selectOptions(screen.getByLabelText('Категорія'), 'Виробник біогазу');

    await waitFor(() => expect(last().get('objectCategory')).toBe('BIOGAS_PRODUCER'));
  });

  it('filters by «Стан», reading old ?status=ANNULLED links as annulled', async () => {
    const { last } = serveRegistry();
    const { user } = renderApp('/?status=ANNULLED');
    await screen.findByRole('table');
    await waitFor(() => expect(last().get('stage')).toBe('ANNULLED'));
    await openMoreFilters(user);

    await user.selectOptions(screen.getByLabelText('Стан'), 'ТУ підготовлені');
    await waitFor(() => expect(last().get('stage')).toBe('TU_PREPARED'));
    expect(last().get('status')).toBeNull();
  });

  it('filters by an engineer of the documents', async () => {
    const { last } = serveRegistry();
    server.use(
      mock.get('*/api/v1/engineers', () =>
        HttpResponse.json([
          {
            id: 'cccccccccccccccccccccccc',
            fullName: 'Бойко Андрій',
            department: 'ODESA',
            isActive: true,
          },
          {
            id: 'dddddddddddddddddddddddd',
            fullName: 'Колишній Інженер',
            department: 'ODESA',
            isActive: false,
          },
        ]),
      ),
    );
    const { user } = renderApp('/');
    await screen.findByRole('table');
    await openMoreFilters(user);

    const engineer = screen.getByLabelText('Інженер');
    await waitFor(() =>
      expect(
        within(engineer).getByRole('option', { name: 'Колишній Інженер (неактивний)' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(engineer, 'Бойко Андрій');

    await waitFor(() => expect(last().get('engineer')).toBe('cccccccccccccccccccccccc'));
    expect(
      screen.getByRole('button', { name: 'Прибрати фільтр «Інженер: Бойко Андрій»' }),
    ).toBeInTheDocument();
  });

  it('shows the documents of a row in their columns', async () => {
    serveRegistry([
      row({
        stage: 'TU_PREPARED',
        lastResponseDate: '2026-03-16',
        tuDate: '2026-03-20',
        tuNumber: '0032/ТУ',
        engineerName: 'Бойко Андрій',
        gasFlow: 2.5,
      }),
      row({ id: 'a2', status: 'ANNULLED', stage: 'RESPONDED' }),
    ]);
    renderApp('/');
    const table = await screen.findByRole('table', { name: 'Реєстр заяв' });
    const header = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.replace(/[▲▼↕]/, ''));
    expect(header).toEqual([
      '№',
      'Дата реєстрації',
      'Управління',
      'Замовник',
      'Населений пункт',
      'Адреса',
      'Тип обʼєкта',
      'Стан',
      'Дата відповіді',
      'Дата ТУ',
      'Номер ТУ',
      'Інженер',
    ]);
    const [, prepared, annulled] = within(table).getAllByRole('row');
    for (const text of ['ТУ підготовлені', '16.03.2026', '20.03.2026', '0032/ТУ', 'Бойко Андрій']) {
      expect(prepared).toHaveTextContent(text);
    }
    // Annulled, whatever its documents.
    expect(annulled).toHaveTextContent('Анульована');
  });

  it('lets each user choose the columns, remembered in this browser', async () => {
    serveRegistry([row({ gasFlow: 2.5, tuNumber: '0032/ТУ' })]);
    const first = renderApp('/');
    const table = await screen.findByRole('table', { name: 'Реєстр заяв' });
    const picker = screen.getByRole('button', { name: /^Колонки/ });

    await first.user.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Як за замовчуванням' })).toBeDisabled();
    await first.user.click(screen.getByRole('checkbox', { name: 'Витрати газу, м³/год' }));
    await first.user.click(screen.getByRole('checkbox', { name: 'Номер ТУ' }));
    expect(within(table).getByRole('columnheader', { name: /^Витрати газу/ })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /^Номер ТУ/ })).toBeNull();
    expect(within(table).getByText('2,5')).toBeInTheDocument();
    await first.user.keyboard('{Escape}');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    expect(picker).toHaveFocus();

    expect(
      JSON.parse(window.localStorage.getItem(`tu-registry:registry-columns:${me.id}`) ?? '{}'),
    ).toEqual({ gasFlow: true, tuNumber: false });

    await first.user.click(picker);
    await first.user.click(screen.getByRole('button', { name: 'Як за замовчуванням' }));
    expect(within(table).queryByRole('columnheader', { name: /^Витрати газу/ })).toBeNull();
    expect(window.localStorage.getItem(`tu-registry:registry-columns:${me.id}`)).toBe('{}');
  });
});

afterEach(() => {
  vi.useRealTimers();
});
