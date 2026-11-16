import type {
  ApplicationDto,
  EngineerDto,
  TechnicalConditionsDto,
  UserDto,
} from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makePdf, makeProcessing, makeTechnicalConditions } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });
const APP = makeApplication();
const TU = `*/api/v1/applications/${APP.id}/technical-conditions`;
const TU_ID = 'tu000000000000000000001';

const engineers: EngineerDto[] = [
  { id: 'e00000000000000000000001', fullName: 'Бойко Андрій', department: 'ODESA', isActive: true },
  { id: 'e00000000000000000000002', fullName: 'Ткач Ярослав', department: 'ODESA', isActive: true },
];
const cancelled = (overrides: Partial<TechnicalConditionsDto> = {}) =>
  makeTechnicalConditions({
    id: 'tu000000000000000000000',
    tuNumber: '0031/ТУ',
    version: 2,
    cancellation: {
      reason: 'Помилка в розрахунку',
      at: '2026-03-19T10:00:00.000Z',
      by: { id: owner.id, fullName: 'Олена Коваль' },
    },
    ...overrides,
  });

function openCard(
  rows: TechnicalConditionsDto[],
  user: UserDto = owner,
  app: ApplicationDto = APP,
) {
  const current = { rows };
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${app.id}`, () => HttpResponse.json(app)),
    mock.get(`*/api/v1/applications/${app.id}/processing`, () =>
      HttpResponse.json(makeProcessing()),
    ),
    mock.get(`*/api/v1/applications/${app.id}/history`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/responses`, () => HttpResponse.json([])),
    mock.get(TU, () => HttpResponse.json(current.rows)),
    mock.get('*/api/v1/engineers', () => HttpResponse.json(engineers)),
  );
  return { ...renderApp(`/applications/${app.id}`), current };
}

const section = () => screen.findByRole('region', { name: 'Технічні умови' });

describe('technical conditions in the application card', () => {
  it('shows the valid set in full first, cancelled ones struck below; no second «Додати»', async () => {
    openCard([cancelled(), makeTechnicalConditions({ workingDays: 12 })]);

    const items = await within(await section()).findAllByRole('listitem', {
      name: /^Технічні умови/,
    });
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Технічні умови № 0032/ТУ від 20.03.2026',
      'Технічні умови № 0031/ТУ від 20.03.2026',
    ]);
    const [valid, old] = items as [HTMLElement, HTMLElement];
    for (const text of [
      'Бойко Андрій',
      '12 робочих днів з 10',
      'строк перевищено на 2 робочі дні',
      '2,5 м³/год',
      'Стандартне',
      'Низький',
      'Підземний газопровід',
    ]) {
      expect(valid).toHaveTextContent(text);
    }
    expect(old).toHaveTextContent('Скасовано');
    expect(old).toHaveTextContent('Помилка в розрахунку');
    expect(screen.queryByRole('button', { name: 'Додати ТУ' })).toBeNull();
  });

  it('says when there are none', async () => {
    openCard([]);
    expect(
      await within(await section()).findByText('Технічні умови ще не підготовлено.'),
    ).toBeVisible();
  });

  it('adds technical conditions with a scan, the gas flow written with a comma', async () => {
    const { user, current } = openCard([cancelled()]);
    const posted: unknown[] = [];
    let uploaded: File | null = null;
    server.use(
      mock.post(TU, async ({ request }) => {
        posted.push(await request.json());
        current.rows = [cancelled(), makeTechnicalConditions()];
        return HttpResponse.json(makeTechnicalConditions(), { status: 201 });
      }),
      mock.put(`${TU}/${TU_ID}/scan`, async ({ request }) => {
        uploaded = (await request.formData()).get('scan') as File;
        return HttpResponse.json(makeTechnicalConditions());
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Додати ТУ' }));
    const dialog = screen.getByRole('dialog', { name: 'Нові технічні умови' });
    await user.type(within(dialog).getByLabelText('Реєстраційний номер ТУ'), '0032/ТУ');
    await user.clear(within(dialog).getByLabelText('Дата підготовки ТУ'));
    await user.type(within(dialog).getByLabelText('Дата підготовки ТУ'), '2026-03-20');
    await user.selectOptions(
      await within(dialog).findByLabelText('Інженер, який розробив ТУ'),
      'Бойко Андрій',
    );
    await user.type(within(dialog).getByLabelText('Витрати газу, м³/год'), '2,5');
    await user.click(within(dialog).getByRole('radio', { name: 'Стандартне' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Низький' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Підземний газопровід' }));
    await user.upload(within(dialog).getByLabelText('PDF-файл скану'), makePdf('ТУ.pdf'));
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Технічні умови № 0032/ТУ додано')).toBeVisible();
    expect(posted).toEqual([
      {
        tuNumber: '0032/ТУ',
        preparedDate: '2026-03-20',
        engineer: 'e00000000000000000000001',
        gasFlow: 2.5,
        connectionType: 'STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      },
    ]);
    expect(uploaded!.name).toBe('ТУ.pdf');
    expect(await screen.findByRole('listitem', { name: /0032\/ТУ/ })).toBeVisible();
  });

  it('checks the form before sending', async () => {
    const { user } = openCard([]);
    await user.click(await within(await section()).findByRole('button', { name: 'Додати ТУ' }));
    const dialog = screen.getByRole('dialog', { name: 'Нові технічні умови' });
    await within(dialog).findByLabelText('Інженер, який розробив ТУ');
    await user.type(within(dialog).getByLabelText('Витрати газу, м³/год'), '0,0001');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    for (const message of [
      'Вкажіть номер ТУ',
      'Не більше трьох знаків після коми',
      'Оберіть тип приєднання',
      'Оберіть тиск газу',
      'Оберіть точку приєднання',
    ]) {
      expect(await within(dialog).findByText(message)).toBeVisible();
    }
    // Its placeholder option says the same, so the message is checked on the field itself.
    expect(within(dialog).getByLabelText('Інженер, який розробив ТУ')).toHaveAccessibleDescription(
      'Оберіть інженера',
    );
  });

  it('edits only what changed', async () => {
    const patched: unknown[] = [];
    const { user } = openCard([makeTechnicalConditions()]);
    server.use(
      mock.patch(`${TU}/${TU_ID}`, async ({ request }) => {
        patched.push(await request.json());
        return HttpResponse.json(makeTechnicalConditions({ gasFlow: 3.25, gasPressure: 'MEDIUM' }));
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Редагувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Технічні умови № 0032/ТУ' });
    expect(within(dialog).getByLabelText('Витрати газу, м³/год')).toHaveValue('2,5');
    await user.clear(within(dialog).getByLabelText('Витрати газу, м³/год'));
    await user.type(within(dialog).getByLabelText('Витрати газу, м³/год'), '3,25');
    await user.click(within(dialog).getByRole('radio', { name: 'Середній' }));
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Технічні умови № 0032/ТУ збережено')).toBeVisible();
    expect(patched).toEqual([{ version: 1, gasFlow: 3.25, gasPressure: 'MEDIUM' }]);
  });

  it('cancels with a reason', async () => {
    const sent: unknown[] = [];
    const { user } = openCard([makeTechnicalConditions()]);
    server.use(
      mock.post(`${TU}/${TU_ID}/cancel`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(makeTechnicalConditions());
      }),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Скасувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Скасувати технічні умови № 0032/ТУ?' });
    await user.type(within(dialog).getByLabelText('Причина скасування'), 'Помилка в розрахунку');
    await user.click(within(dialog).getByRole('button', { name: 'Скасувати документ' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toEqual([{ reason: 'Помилка в розрахунку', version: 1 }]);
  });

  it("shows the server's refusal when an admin restores a set while another is valid", async () => {
    const { user } = openCard([cancelled(), makeTechnicalConditions()], admin);
    server.use(
      mock.post(`${TU}/tu000000000000000000000/restore`, () =>
        apiError(
          409,
          'DOCUMENT_TAKEN',
          'У заяви вже є інші чинні технічні умови: спершу скасуйте їх.',
        ),
      ),
    );

    await user.click(await within(await section()).findByRole('button', { name: 'Відновити' }));
    expect(
      await screen.findByText('У заяви вже є інші чинні технічні умови: спершу скасуйте їх.'),
    ).toBeVisible();
  });

  it('offers nothing to change on an annulled application', async () => {
    openCard([], owner, makeApplication({ status: 'ANNULLED' }));
    expect(
      await within(await section()).findByText('Технічні умови ще не підготовлено.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Додати ТУ' })).toBeNull();
  });
});
