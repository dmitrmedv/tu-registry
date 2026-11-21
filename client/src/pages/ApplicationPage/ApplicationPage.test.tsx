import type { ApplicationDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  makeApplication,
  makeChange,
  makeProcessing,
  makeResponse,
  makeTechnicalConditions,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({
  id: 'owner000000000000000001',
  fullName: 'Олена Коваль',
  role: 'USER',
  canManageRegistration: false,
});
const stranger = makeUser({
  id: 'other000000000000000001',
  role: 'USER',
  canManageRegistration: false,
  department: 'RENI',
});
const colleague = makeUser({
  id: 'colleague000000000000001',
  role: 'USER',
  canManageRegistration: false,
});
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });

/** How many times the change history was fetched (it loads only when its dialog opens). */
let historyRequests = 0;

function openCard(
  user = owner,
  app: ApplicationDto = makeApplication(),
  { search = '', withDocuments = false } = {},
) {
  historyRequests = 0;
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${app.id}`, () => HttpResponse.json(app)),
    mock.get(`*/api/v1/applications/${app.id}/responses`, () =>
      HttpResponse.json(withDocuments ? [makeResponse()] : []),
    ),
    mock.get(`*/api/v1/applications/${app.id}/technical-conditions`, () =>
      HttpResponse.json(withDocuments ? [makeTechnicalConditions()] : []),
    ),
    mock.get(`*/api/v1/applications/${app.id}/contracts`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/projects`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/invoices`, () => HttpResponse.json([])),
    mock.get('*/api/v1/engineers', () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/processing`, () =>
      HttpResponse.json(makeProcessing()),
    ),
    mock.get(`*/api/v1/applications/${app.id}/history`, () => {
      historyRequests += 1;
      return HttpResponse.json([
        makeChange({
          id: 'c2',
          action: 'UPDATED',
          changedAt: '2026-03-13T10:00:00.000Z',
          changes: [
            { field: 'phone', oldValue: '+380671234567', newValue: '+380501112233' },
            { field: 'customerRepresentative', oldValue: 'Петренко Іван', newValue: null },
          ],
        }),
        makeChange(),
      ]);
    }),
  );
  return renderApp(`/applications/${app.id}${search}`);
}

describe('ApplicationPage', () => {
  it('shows the card with formatted values and the history with readable fields', async () => {
    const { user } = openCard();

    expect(await screen.findByRole('heading', { name: 'Заява 14т/26-8' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+380 67 123 45 67' })).toHaveAttribute(
      'href',
      'tel:+380671234567',
    );
    expect(screen.getByText('12.03.2026')).toBeInTheDocument();
    expect(screen.getByText('Побутовий')).toBeInTheDocument();
    expect(screen.getByText('м. Київ')).toBeInTheDocument();
    expect(screen.getByText('вул. Прикладна, 1')).toBeInTheDocument();

    // In a dialog, and not loaded until asked for.
    expect(screen.queryByRole('list', { name: 'Історія змін' })).toBeNull();
    expect(historyRequests).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Історія змін' }));
    const dialog = screen.getByRole('dialog', { name: 'Історія змін' });
    const history = await within(dialog).findByRole('list', { name: 'Історія змін' });
    const entries = within(history)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === history);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Змінено');
    expect(entries[0]).toHaveTextContent('Телефон: +380 67 123 45 67 → +380 50 111 22 33');
    expect(entries[0]).toHaveTextContent('Представник замовника: Петренко Іван → —');
    expect(entries[1]).toHaveTextContent('Зареєстровано');
    await user.click(within(dialog).getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the changes of the documents in the history too, without file names', async () => {
    const { user } = openCard();
    const doc = (kind: 'RESPONSE' | 'TECHNICAL_CONDITIONS' | 'TU_PAYMENT', number: string) => ({
      kind,
      id: 'doc000000000000000000001',
      number,
    });
    server.use(
      mock.get('*/api/v1/applications/:id/history', () =>
        HttpResponse.json([
          makeChange({
            id: 'c5',
            action: 'UPDATED',
            document: doc('TU_PAYMENT', '126/Б'),
            changes: [
              { field: 'amount', oldValue: '2 750,00', newValue: '3 000,00' },
              { field: 'actTransferMonth', oldValue: null, newValue: '2026-11' },
              { field: 'receiptScan', oldValue: null, newValue: 'новий файл' },
            ],
          }),
          makeChange({
            id: 'c4',
            action: 'CANCELLED',
            document: doc('TECHNICAL_CONDITIONS', '0033/ТУ'),
          }),
          makeChange({
            id: 'c3',
            action: 'UPDATED',
            document: doc('TECHNICAL_CONDITIONS', '0033/ТУ'),
            changes: [
              { field: 'tuNumber', oldValue: '0032/ТУ', newValue: '0033/ТУ' },
              { field: 'gasPressure', oldValue: 'LOW', newValue: 'MEDIUM' },
            ],
          }),
          makeChange({
            id: 'c2',
            action: 'UPDATED',
            document: doc('RESPONSE', '126/01'),
            changes: [
              { field: 'outgoingNumber', oldValue: '125/01', newValue: '126/01' },
              { field: 'responseDate', oldValue: '2026-03-12', newValue: '2026-03-13' },
              { field: 'scan', oldValue: 'файл', newValue: null },
            ],
          }),
          makeChange({ id: 'c1', action: 'CREATED', document: doc('RESPONSE', '125/01') }),
          makeChange(),
        ]),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Історія змін' }));
    const history = await within(screen.getByRole('dialog', { name: 'Історія змін' })).findByRole(
      'list',
      { name: 'Історія змін' },
    );
    const entries = within(history)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === history);
    expect(entries.map((entry) => entry.querySelector('strong')!.textContent)).toEqual([
      'Рахунок за ТУ № 126/Б — змінено',
      'Технічні умови № 0033/ТУ — скасовано',
      'Технічні умови № 0033/ТУ — змінено',
      'Відповідь № 126/01 — змінено',
      'Відповідь № 125/01 — додано',
      'Зареєстровано',
    ]);
    expect(entries[0]).toHaveTextContent(/Сума: 2\s750,00 → 3\s000,00/);
    expect(entries[0]).toHaveTextContent('Здача акта: листопад 2026');
    expect(entries[0]).toHaveTextContent('Скан квитанції: додано');
    expect(entries[2]).toHaveTextContent('Номер: 0032/ТУ → 0033/ТУ');
    expect(entries[2]).toHaveTextContent('Тиск: Низький → Середній');
    expect(entries[3]).toHaveTextContent('Номер: 125/01 → 126/01');
    expect(entries[3]).toHaveTextContent('Дата: 12.03.2026 → 13.03.2026');
    expect(entries[3]).toHaveTextContent('Скан: видалено');
  });

  it('puts the application in the title, and its actions in the «Заява» tab', async () => {
    openCard(
      owner,
      makeApplication({
        scan: {
          name: 'Скан.pdf',
          size: 1000,
          uploadedAt: '2026-03-12T09:00:00.000Z',
          uploadedBy: { id: owner.id, fullName: 'Олена Коваль' },
        },
      }),
    );

    const heading = await screen.findByRole('heading', { level: 1, name: 'Заява 14т/26-8' });
    const header = heading.closest('header')!;
    expect(header).toHaveTextContent('ТОВ «Приклад»');
    expect(header).toHaveTextContent('м. Київ, вул. Прикладна, 1');
    expect(header).toHaveTextContent('Одеське');
    // Only «Додати модуль» in the title: the application's own actions are in its tab.
    expect(
      within(header)
        .queryAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Додати модуль']);
    expect(within(header).queryAllByRole('link')).toHaveLength(0);
    // No «← До реєстру» on the card: the app header leads to the registry.
    expect(screen.queryByRole('link', { name: /До реєстру/ })).toBeNull();

    const tab = screen.getByRole('tabpanel', { name: 'Заява' });
    expect(within(tab).getByRole('button', { name: 'Відкрити скан' })).toHaveAttribute(
      'title',
      'Відкрити скан: Скан.pdf',
    );
    const annul = within(tab).getByRole('button', { name: 'Анулювати' });
    // Icon only: the name is read out and shown on hover.
    expect(annul).toHaveAttribute('title', 'Анулювати');
    expect(annul).not.toHaveTextContent('Анулювати');
    expect(within(tab).getByRole('link', { name: 'Редагувати' })).toHaveAttribute(
      'href',
      '/applications/app00000000000000000001/edit',
    );
  });

  it('keeps the tab in the address, switches tabs with the arrows', async () => {
    const { user } = openCard(owner, makeApplication(), { search: '?tab=tu', withDocuments: true });

    const tu = await screen.findByRole('tab', { name: 'ТУ' });
    expect(tu).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Заява',
      'Відповідь',
      'ТУ',
    ]);
    expect(await screen.findByRole('region', { name: /^Технічні умови № 0032/ })).toBeVisible();

    await user.click(tu);
    await user.keyboard('{ArrowLeft}');
    const response = screen.getByRole('tab', { name: 'Відповідь' });
    expect(response).toHaveAttribute('aria-selected', 'true');
    expect(response).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Відповідь' })).toBeVisible();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Заява' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Редагувати' })).toBeVisible();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'ТУ' })).toHaveFocus();

    // Every module with documents is there and cannot be added again; no contract yet.
    await user.click(screen.getByRole('button', { name: 'Додати модуль' }));
    const modules = within(screen.getByRole('dialog', { name: 'Додати модуль' })).getByRole(
      'list',
      {
        name: 'Модулі',
      },
    );
    const choices = within(modules).getAllByRole('button');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Відповідьуже додано',
      'Технічні умовиуже додано',
      'Договір',
      'Проєкт',
      'Рахунок',
    ]);
    expect(choices[2]).toBeEnabled();
    for (const choice of choices.slice(0, 2)) {
      expect(choice).toBeDisabled();
      expect(choice).toHaveAccessibleDescription('уже додано');
    }
  });

  it('opens «Заява» for an unknown tab in the address', async () => {
    openCard(owner, makeApplication(), { search: '?tab=tu' });
    expect(await screen.findByRole('tab', { name: 'Заява' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'ТУ' })).toBeNull();
  });

  it('offers editing and annulment to the owner, but not restoring', async () => {
    openCard(owner);

    await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(screen.getByRole('link', { name: 'Редагувати' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Анулювати' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відновити' })).not.toBeInTheDocument();
  });

  it('offers editing and annulment to a colleague of the same department', async () => {
    openCard(colleague);

    const heading = await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(screen.getByRole('link', { name: 'Редагувати' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Анулювати' })).toBeInTheDocument();
    expect(heading.closest('header')).toHaveTextContent('Одеське управління');
  });

  it("offers no actions on another department's application", async () => {
    openCard(stranger);

    await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(screen.queryByRole('link', { name: 'Редагувати' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Анулювати' })).not.toBeInTheDocument();
  });

  it('annuls with a required reason and the current version', async () => {
    const annul = vi.fn();
    const { user } = openCard(owner);
    server.use(
      mock.post('*/api/v1/applications/:id/annul', async ({ request }) => {
        annul(await request.json());
        return HttpResponse.json(makeApplication({ status: 'ANNULLED', version: 4 }));
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Анулювати' }));
    const dialog = screen.getByRole('dialog', { name: 'Анулювати заяву 14т/26-8?' });
    await user.click(within(dialog).getByRole('button', { name: 'Анулювати' }));
    expect(within(dialog).getByText('Вкажіть причину анулювання')).toBeInTheDocument();
    expect(annul).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Причина анулювання'), 'Подано помилково');
    await user.click(within(dialog).getByRole('button', { name: 'Анулювати' }));

    await vi.waitFor(() =>
      expect(annul).toHaveBeenCalledWith({ reason: 'Подано помилково', version: 3 }),
    );
  });

  it('shows the annulment and lets an administrator restore it', async () => {
    const restore = vi.fn();
    const annulled = makeApplication({
      status: 'ANNULLED',
      annulment: {
        reason: 'Дубль',
        at: '2026-03-14T08:00:00.000Z',
        by: { id: admin.id, fullName: admin.fullName },
      },
    });
    const { user } = openCard(admin, annulled);
    server.use(
      mock.post('*/api/v1/applications/:id/restore', async ({ request }) => {
        restore(await request.json());
        return HttpResponse.json(makeApplication({ version: 4 }));
      }),
    );

    expect(await screen.findByText('Анульовано', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Дубль')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Редагувати' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Відновити' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Відновити заяву 14т/26-8?' })).getByRole(
        'button',
        {
          name: 'Відновити',
        },
      ),
    );

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith({ version: 3 }));
  });

  it('says so when the application does not exist', async () => {
    server.use(
      signedInAs(owner),
      mock.get('*/api/v1/applications/:id', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Заяву не знайдено' } },
          { status: 404 },
        ),
      ),
    );

    renderApp('/applications/missing000000000000000001');

    expect(await screen.findByRole('heading', { name: 'Заяву не знайдено' })).toBeInTheDocument();
  });

  it('shows the category with its wording and the comment', async () => {
    openCard(
      owner,
      makeApplication({
        objectCategory: 'OTHER',
        objectCategoryOther: 'Котельня',
        comment: 'Перший рядок\nДругий рядок',
      }),
    );

    expect(await screen.findByText('Інше: Котельня')).toBeInTheDocument();
    // The title has it too, as a line starting in lower case.
    expect(screen.getByText('інше: Котельня')).toBeInTheDocument();
    // Its own titled block beside the object (mock-up of 2026-11-20).
    expect(screen.getByRole('region', { name: 'Коментар' })).toHaveTextContent(
      'Перший рядок Другий рядок',
    );
  });

  it('shows no comment block when there is no comment', async () => {
    openCard(owner, makeApplication({ comment: null }));
    await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(screen.queryByRole('region', { name: 'Коментар' })).toBeNull();
    expect(screen.queryByText('Коментар')).toBeNull();
  });

  it('offers deleting to administrators only', async () => {
    openCard(owner);
    await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(screen.queryByRole('button', { name: 'Видалити' })).not.toBeInTheDocument();
  });

  it('deletes after the number is typed, then returns to the registry with a notice', async () => {
    const deleted = vi.fn();
    const cardRequests = vi.fn();
    const { user, router } = openCard(admin);
    server.use(
      mock.get('*/api/v1/applications/:id', () => {
        cardRequests();
        return HttpResponse.json(makeApplication());
      }),
      mock.delete('*/api/v1/applications/:id', ({ request, params }) => {
        deleted(params.id, new URL(request.url).searchParams.get('version'));
        return new HttpResponse(null, { status: 204 });
      }),
      mock.get('*/api/v1/applications', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
      ),
      mock.get('*/api/v1/users/options', () => HttpResponse.json([])),
    );

    await user.click(await screen.findByRole('button', { name: 'Видалити' }));
    const dialog = screen.getByRole('dialog', { name: 'Видалити заяву 14т/26-8?' });
    const confirm = within(dialog).getByRole('button', { name: 'Видалити назавжди' });
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('Введіть номер 14т/26-8 для підтвердження'),
      '14т/26-8',
    );
    await user.click(confirm);

    expect(await screen.findByText('Заяву 14т/26-8 видалено')).toBeInTheDocument();
    expect(deleted).toHaveBeenCalledWith('app00000000000000000001', '3');
    expect(router.state.location.pathname).toBe('/');
    // The deleted record is not requested again (no "not found" flash before navigating).
    expect(cardRequests).toHaveBeenCalledTimes(1);
  });
});

describe('ApplicationPage — scan', () => {
  const withScan = makeApplication({
    scan: {
      name: 'Скан заяви.pdf',
      size: 3 * 1024 * 1024,
      uploadedAt: '2026-03-12T09:00:00.000Z',
      uploadedBy: { id: owner.id, fullName: owner.fullName },
    },
  });

  it('opens the scan in a new tab from the button before «Редагувати»', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const createUrl = vi.fn(() => 'blob:scan');
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = vi.fn();
    const { user } = openCard(owner, withScan);
    server.use(
      mock.get('*/api/v1/applications/:id/scan', () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode('%PDF-1.4').buffer, {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );

    const view = await screen.findByRole('button', { name: 'Відкрити скан' });
    const edit = screen.getByRole('link', { name: 'Редагувати' });
    expect(view.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Changes to the scan are on the edit page only.
    expect(
      screen.queryByRole('region', { name: 'Скан пакета документів' }),
    ).not.toBeInTheDocument();

    await user.click(view);

    await vi.waitFor(() => expect(tab.location.href).toBe('blob:scan'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    open.mockRestore();
  });

  it('has no view button when there is no scan', async () => {
    openCard(owner);

    await screen.findByRole('link', { name: 'Редагувати' });
    expect(screen.queryByRole('button', { name: 'Відкрити скан' })).not.toBeInTheDocument();
  });

  it('says when the scan cannot be opened', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { user } = openCard(owner, withScan);
    server.use(
      mock.get('*/api/v1/applications/:id/scan', () =>
        apiError(404, 'SCAN_NOT_FOUND', 'Скан не знайдено'),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Відкрити скан' }));

    expect(
      await screen.findByText('Не вдалося відкрити скан: Скан не знайдено'),
    ).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });
});
