import type { ApplicationDto } from '@tu-registry/shared';
import { screen } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const employee = makeUser({ id: 'u2', login: 'ivan', fullName: 'Іван Петренко', role: 'USER' });

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
  registrationMode: 'AUTO',
  status: 'ACTIVE',
  createdBy: { id: employee.id, fullName: employee.fullName },
  createdAt: '2026-03-12T09:00:00.000Z',
  updatedAt: '2026-03-12T09:00:00.000Z',
  version: 1,
};

function openPage() {
  server.use(
    signedInAs(employee),
    mock.get('*/api/v1/applications/next-number', () =>
      HttpResponse.json({ regNumber: '15т/26', regYear: 2026, regSeq: 15, regDate: '2026-03-12' }),
    ),
  );
  return renderApp('/applications/new');
}

async function fillRequiredFields(user: ReturnType<typeof openPage>['user']) {
  await user.type(screen.getByLabelText('Замовник'), 'ТОВ «Приклад»');
  await user.type(screen.getByLabelText('Представник замовника'), 'Петренко Іван');
  await user.type(screen.getByLabelText('Телефон'), '(067) 123-45-67');
  await user.type(screen.getByLabelText('Адреса обʼєкта'), 'м. Київ, вул. Прикладна, 1');
  await user.selectOptions(screen.getByLabelText('Тип обʼєкта'), 'Побутовий');
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
