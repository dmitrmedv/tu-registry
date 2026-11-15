import type { ApplicationDto } from '@tu-registry/shared';
import { kyivCalendarDate } from '@tu-registry/shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const employee = makeUser({
  id: 'u2',
  login: 'ivan',
  fullName: 'Іван Петренко',
  role: 'USER',
  canManageRegistration: false,
});
const registrar = { ...employee, id: 'u3', login: 'olena', canManageRegistration: true };

const created: ApplicationDto = {
  id: 'a1',
  regNumber: '15т/26',
  regYear: 2026,
  regSeq: 15,
  regDate: '2026-03-12',
  customer: 'ТОВ «Приклад»',
  customerRepresentative: 'Петренко Іван',
  phone: '+380671234567',
  email: null,
  objectAddress: 'м. Київ, вул. Прикладна, 1',
  objectType: 'DOMESTIC',
  objectCategory: 'RESIDENTIAL_HOUSE',
  objectCategoryOther: null,
  comment: null,
  registrationMode: 'AUTO',
  status: 'ACTIVE',
  createdBy: { id: employee.id, fullName: employee.fullName },
  annulment: null,
  createdAt: '2026-03-12T09:00:00.000Z',
  updatedAt: '2026-03-12T09:00:00.000Z',
  version: 1,
};

function openPage(user = employee) {
  server.use(
    signedInAs(user),
    mock.get('*/api/v1/applications/next-number', () =>
      HttpResponse.json({ regNumber: '15т/26', regYear: 2026, regSeq: 15, regDate: '2026-03-12' }),
    ),
  );
  return renderApp('/applications/new');
}

async function fillRequiredFields(user: ReturnType<typeof openPage>['user']) {
  await user.type(screen.getByLabelText('Замовник'), 'ТОВ «Приклад»');
  await user.type(screen.getByLabelText('Представник замовника (необовʼязково)'), 'Петренко Іван');
  await user.type(screen.getByLabelText('Телефон'), '(067) 123-45-67');
  await user.type(screen.getByLabelText('Адреса обʼєкта'), 'м. Київ, вул. Прикладна, 1');
  await user.selectOptions(screen.getByLabelText('Тип обʼєкта'), 'Побутовий');
  await user.click(screen.getByRole('radio', { name: 'Житловий будинок' }));
}

describe('NewApplicationPage', () => {
  it('shows today and the expected number as a non-binding hint', async () => {
    openPage();

    expect(await screen.findByText('12.03.2026')).toBeInTheDocument();
    expect(screen.getByText('15т/26')).toBeInTheDocument();
    expect(screen.getByText('Номер (орієнтовно)')).toBeInTheDocument();
  });

  it('validates required fields and the phone before sending', async () => {
    const { user } = openPage();

    await user.click(await screen.findByRole('button', { name: 'Зареєструвати заяву' }));

    expect(await screen.findByText('Замовник: обовʼязкове поле')).toBeInTheDocument();
    expect(screen.getByText('Телефон: обовʼязкове поле')).toBeInTheDocument();
    expect(screen.getByText('Оберіть тип обʼєкта')).toBeInTheDocument();
    expect(screen.getByText('Оберіть категорію обʼєкта')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Телефон'), '12345');
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));
    expect(await screen.findByText(/Невірний номер телефону/)).toBeInTheDocument();
  });

  it('registers the application and shows the number assigned by the server', async () => {
    let sentBody: unknown;
    const { user } = openPage();
    server.use(
      mock.post('*/api/v1/applications', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    await screen.findByText('15т/26');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Заяву зареєстровано: 15т/26 від 12.03.2026',
    );
    // Normalized on the client; no empty email, no date or number from the browser.
    expect(sentBody).toEqual({
      customer: 'ТОВ «Приклад»',
      customerRepresentative: 'Петренко Іван',
      phone: '+380671234567',
      objectAddress: 'м. Київ, вул. Прикладна, 1',
      objectType: 'DOMESTIC',
      objectCategory: 'RESIDENTIAL_HOUSE',
    });

    await user.click(screen.getByRole('button', { name: 'Зареєструвати ще' }));
    expect(screen.getByLabelText('Замовник')).toHaveValue('');
  });

  it('shows a server error and keeps the entered data', async () => {
    const { user } = openPage();
    server.use(
      mock.post('*/api/v1/applications', () =>
        apiError(500, 'INTERNAL_ERROR', 'Внутрішня помилка сервера'),
      ),
    );

    await screen.findByText('15т/26');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Внутрішня помилка сервера');
    expect(screen.getByLabelText('Замовник')).toHaveValue('ТОВ «Приклад»');
  });
});

describe('NewApplicationPage — object category and comment', () => {
  function captureCreate() {
    const sent: unknown[] = [];
    server.use(
      mock.post('*/api/v1/applications', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    return sent;
  }

  it('offers the categories as buttons and asks for wording only for "other"', async () => {
    const { user } = openPage();
    const sent = captureCreate();
    await screen.findByText('15т/26');
    await fillRequiredFields(user);

    const categories = screen.getByRole('group', { name: 'Категорія обʼєкта' });
    expect(
      within(categories)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')!.textContent),
    ).toEqual([
      'Земельна ділянка',
      'Житловий будинок',
      'Квартира',
      'Нежитлове приміщення',
      'Виробник біогазу',
      'Інше',
    ]);
    expect(screen.queryByLabelText('Уточніть категорію')).not.toBeInTheDocument();

    await user.click(within(categories).getByRole('radio', { name: 'Інше' }));
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));
    expect(await screen.findByText('Уточніть категорію обʼєкта')).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.type(screen.getByLabelText('Уточніть категорію'), 'Котельня');
    await user.type(screen.getByLabelText('Коментар (необовʼязково)'), 'Документи неповні');
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));

    await screen.findByText(/Заяву зареєстровано/);
    expect(sent[0]).toMatchObject({
      objectCategory: 'OTHER',
      objectCategoryOther: 'Котельня',
      comment: 'Документи неповні',
    });
  });

  it('moves the choice with arrow keys', async () => {
    const { user } = openPage();
    await screen.findByText('15т/26');

    await user.click(screen.getByRole('radio', { name: 'Квартира' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Нежитлове приміщення' })).toBeChecked();
  });
});

describe('NewApplicationPage — manual registration', () => {
  const switchName = 'Ручне встановлення дати та номера реєстрації';

  /** The check endpoint answers "free" unless a test says otherwise. */
  const numberCheck = (available = true, takenOn: string | null = null) =>
    mock.get('*/api/v1/applications/manual/check', ({ request }) => {
      const url = new URL(request.url);
      const year = url.searchParams.get('regDate')!.slice(2, 4);
      const regNumber = `${url.searchParams.get('regSeq')}т/${year}`;
      return HttpResponse.json({ regNumber, available, takenOn });
    });

  async function openManual() {
    const result = openPage(registrar);
    server.use(numberCheck());
    await result.user.click(await screen.findByRole('switch', { name: switchName }));
    return result;
  }

  function setDate(value: string) {
    fireEvent.change(screen.getByLabelText('Дата реєстрації'), { target: { value } });
  }

  it('is not offered to regular users', async () => {
    openPage(employee);

    await screen.findByText('15т/26');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('replaces the automatic preview with a date and a sequence number field', async () => {
    await openManual();

    expect(screen.getByLabelText('Дата реєстрації')).toHaveAttribute('max', kyivCalendarDate());
    expect(screen.getByLabelText('Порядковий номер')).toBeInTheDocument();
    expect(screen.getByText('Рік номера визначається за датою реєстрації.')).toBeInTheDocument();
    expect(screen.queryByText('Номер (орієнтовно)')).not.toBeInTheDocument();
  });

  it('builds the full number from the digits and the date, and says whether it is free', async () => {
    const { user } = await openManual();

    setDate('2024-05-20');
    await user.type(screen.getByLabelText('Порядковий номер'), '14');

    // The availability check runs after a short pause in typing.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Номер реєстрації: 14т/24 — вільний'),
    );
  });

  it('warns when the number is already taken in that year', async () => {
    const { user } = await openManual();
    server.use(numberCheck(false, '2024-02-02'));

    setDate('2024-05-20');
    await user.type(screen.getByLabelText('Порядковий номер'), '14');

    expect(await screen.findByText(/уже зайнятий \(заява від 02\.02\.2024\)/)).toBeInTheDocument();
  });

  it('explains that a number ahead of the automatic sequence will be skipped', async () => {
    const today = kyivCalendarDate();
    const year = Number(today.slice(0, 4));
    const { user } = await openManual();
    server.use(
      mock.get('*/api/v1/applications/next-number', () =>
        HttpResponse.json({
          regNumber: `15т/${today.slice(2, 4)}`,
          regYear: year,
          regSeq: 15,
          regDate: today,
        }),
      ),
    );

    setDate(today);
    await user.type(screen.getByLabelText('Порядковий номер'), '20');

    expect(await screen.findByText(/автоматична нумерація пропустить його/)).toBeInTheDocument();
  });

  it('accepts digits only and no future dates', async () => {
    const { user } = await openManual();
    await fillRequiredFields(user);
    const submit = () => user.click(screen.getByRole('button', { name: 'Внести заяву' }));

    setDate('2024-05-20');
    await user.type(screen.getByLabelText('Порядковий номер'), '14т/24');
    await submit();
    expect(await screen.findByText('Вкажіть порядковий номер (лише цифри)')).toBeInTheDocument();

    setDate(kyivCalendarDate(new Date(Date.now() + 36 * 60 * 60 * 1000)));
    await user.clear(screen.getByLabelText('Порядковий номер'));
    await user.type(screen.getByLabelText('Порядковий номер'), '1');
    await submit();
    expect(await screen.findByText(/не може бути пізнішою за сьогодні/)).toBeInTheDocument();
  });

  it('sends date and digits, and keeps mode and date for the next entry', async () => {
    let sentBody: unknown;
    const { user } = await openManual();
    server.use(
      mock.post('*/api/v1/applications/manual', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            ...created,
            regNumber: '14т/24',
            regYear: 2024,
            regSeq: 14,
            regDate: '2024-05-20',
            registrationMode: 'MANUAL',
          },
          { status: 201 },
        );
      }),
    );

    await fillRequiredFields(user);
    setDate('2024-05-20');
    await user.type(screen.getByLabelText('Порядковий номер'), '14');
    await user.click(screen.getByRole('button', { name: 'Внести заяву' }));

    expect(await screen.findByText(/Заяву внесено вручну/)).toHaveTextContent(
      'Заяву внесено вручну: 14т/24 від 20.05.2024',
    );
    expect(sentBody).toMatchObject({ regDate: '2024-05-20', regSeq: 14 });
    expect(sentBody).not.toHaveProperty('manual');

    await user.click(screen.getByRole('button', { name: 'Зареєструвати ще' }));
    expect(screen.getByRole('switch', { name: switchName })).toBeChecked();
    expect(screen.getByLabelText('Дата реєстрації')).toHaveValue('2024-05-20');
    expect(screen.getByLabelText('Порядковий номер')).toHaveValue('');
    expect(screen.getByLabelText('Замовник')).toHaveValue('');
  });

  it('shows a number taken at save time next to the number field', async () => {
    const { user } = await openManual();
    server.use(
      mock.post('*/api/v1/applications/manual', () =>
        apiError(409, 'REG_NUMBER_TAKEN', 'Номер 14т/24 уже зайнятий (заява від 02.02.2024)'),
      ),
    );

    await fillRequiredFields(user);
    setDate('2024-05-20');
    await user.type(screen.getByLabelText('Порядковий номер'), '14');
    await user.click(screen.getByRole('button', { name: 'Внести заяву' }));

    expect(
      await screen.findByText('Номер 14т/24 уже зайнятий (заява від 02.02.2024)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Порядковий номер')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('NewApplicationPage — unsaved draft', () => {
  const draftKey = (userId: string) => `tu-registry:draft:new-application:${userId}`;

  it('restores typed data after a page reload and offers to clear it', async () => {
    const first = openPage();
    await first.user.type(await screen.findByLabelText('Замовник'), 'ТОВ «Чернетка»');
    await first.user.type(screen.getByLabelText('Телефон'), '0671234567');

    cleanup(); // simulates the reload: the app starts again from scratch
    const { user } = openPage();

    expect(await screen.findByLabelText('Замовник')).toHaveValue('ТОВ «Чернетка»');
    expect(screen.getByLabelText('Телефон')).toHaveValue('0671234567');
    expect(screen.getByText(/Відновлено незбережені дані від/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Очистити форму' }));
    expect(screen.getByLabelText('Замовник')).toHaveValue('');
    expect(screen.queryByText(/Відновлено незбережені дані/)).not.toBeInTheDocument();
    expect(localStorage.getItem(draftKey(employee.id))).toBeNull();
  });

  it('removes the draft once the application is registered', async () => {
    const { user } = openPage();
    server.use(
      mock.post('*/api/v1/applications', () => HttpResponse.json(created, { status: 201 })),
    );

    await screen.findByText('15т/26');
    await fillRequiredFields(user);
    expect(localStorage.getItem(draftKey(employee.id))).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Зареєструвати заяву' }));

    await screen.findByText(/Заяву зареєстровано/);
    expect(localStorage.getItem(draftKey(employee.id))).toBeNull();
  });

  it('removes all drafts on logout', async () => {
    const { user } = openPage();
    server.use(mock.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));

    await user.type(await screen.findByLabelText('Замовник'), 'ТОВ «Чернетка»');
    await user.click(screen.getByRole('button', { name: 'Вийти' }));

    await screen.findByRole('heading', { name: 'Вхід до системи' });
    expect(localStorage.getItem(draftKey(employee.id))).toBeNull();
  });

  it("does not show another user's draft", async () => {
    localStorage.setItem(
      draftKey(registrar.id),
      JSON.stringify({ savedAt: new Date().toISOString(), values: { customer: 'Чуже' } }),
    );

    openPage(employee);

    expect(await screen.findByLabelText('Замовник')).toHaveValue('');
  });

  it('does not restore manual mode for a user who lost the right to use it', async () => {
    localStorage.setItem(
      draftKey(employee.id),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        values: { customer: 'ТОВ «Архів»', manual: true, regDate: '2024-05-20', regSeq: '14' },
      }),
    );

    openPage(employee);

    expect(await screen.findByLabelText('Замовник')).toHaveValue('ТОВ «Архів»');
    expect(screen.queryByLabelText('Порядковий номер')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зареєструвати заяву' })).toBeInTheDocument();
  });
});
