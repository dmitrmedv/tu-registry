import type { ContractDraftDto, ContractDto, SaveContractInput } from '@tu-registry/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  makeApplication,
  makeContract,
  makeProcessing,
  makeTechnicalConditions,
} from '@/test/fixtures';
import { addModule, renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const admin = makeUser({ id: 'admin000000000000000001', role: 'ADMIN' });
const APP = makeApplication();
const CONTRACTS = `*/api/v1/applications/${APP.id}/contracts`;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const draft: ContractDraftDto = {
  connectionType: 'NON_STANDARD',
  contractNumber: '125-8',
  contractDate: '2026-03-20',
  department: 'ODESA',
  customer: 'Франко Іван Якович',
  address: 'м. Одеса, вул. Лесі Українки, 34',
};

/** The card's endpoints; GET of the contracts answers with whatever `rows` holds then. */
function stubCard(rows: ContractDto[], user = owner) {
  const current = { rows };
  server.use(
    signedInAs(user),
    mock.get(`*/api/v1/applications/${APP.id}`, () => HttpResponse.json(APP)),
    mock.get(`*/api/v1/applications/${APP.id}/processing`, () =>
      HttpResponse.json(makeProcessing()),
    ),
    mock.get(`*/api/v1/applications/${APP.id}/history`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${APP.id}/responses`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${APP.id}/technical-conditions`, () =>
      HttpResponse.json([makeTechnicalConditions({ connectionType: 'NON_STANDARD' })]),
    ),
    mock.get(CONTRACTS, () => HttpResponse.json(current.rows)),
  );
  return current;
}

describe('the «Договір» module', () => {
  it('opens the new contract’s page from «Додати модуль», filled from the TU', async () => {
    const current = stubCard([]);
    const drafts: (string | null)[] = [];
    const saved: SaveContractInput[] = [];
    const uploads: string[] = [];
    server.use(
      mock.get(`${CONTRACTS}/draft`, ({ request }) => {
        const department = new URL(request.url).searchParams.get('department');
        drafts.push(department);
        return HttpResponse.json(
          department === 'RENI' ? { ...draft, department, contractNumber: '7-12' } : draft,
        );
      }),
      mock.post(CONTRACTS, async ({ request }) => {
        const body = (await request.json()) as SaveContractInput;
        saved.push(body);
        current.rows = [makeContract({ contractNumber: body.contractNumber })];
        return HttpResponse.json(current.rows[0], { status: 201 });
      }),
      mock.put(`${CONTRACTS}/:cid/files/:kind`, ({ params }) => {
        uploads.push(String(params.kind));
        return HttpResponse.json(current.rows[0]);
      }),
    );
    const { user, router } = renderApp(`/applications/${APP.id}`);

    await addModule(user, 'Договір');

    expect(
      await screen.findByRole('heading', { name: 'Договір на нестандартне приєднання' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/applications/${APP.id}/contracts/new`);
    expect(screen.getByLabelText('№ договору')).toHaveValue('125-8');
    expect(screen.getByLabelText('Дата договору')).toHaveValue('2026-03-20');
    expect(screen.getByLabelText('Замовник')).toHaveValue('Франко Іван Якович');
    expect(screen.getByLabelText('Адреса обʼєкта')).toHaveValue('м. Одеса, вул. Лесі Українки, 34');
    expect(screen.getByLabelText('Управління')).toHaveValue('ODESA');

    // The suggested number follows the department.
    await user.selectOptions(screen.getByLabelText('Управління'), 'RENI');
    await waitFor(() => expect(screen.getByLabelText('№ договору')).toHaveValue('7-12'));
    expect(drafts).toEqual([null, 'RENI']);

    const word = new File(['PK'], 'Договір.docx', { type: DOCX_TYPE });
    await user.upload(screen.getByLabelText('Файл DOCX'), word);
    await user.type(screen.getByLabelText('Представник замовника'), 'Франко Тарас');
    await user.click(screen.getByRole('button', { name: 'Додати договір' }));

    expect(await screen.findByText('Договір № 7-12 додано')).toBeInTheDocument();
    expect(saved).toEqual([
      expect.objectContaining({
        contractNumber: '7-12',
        department: 'RENI',
        representative: 'Франко Тарас',
        signedDate: null,
      }),
    ]);
    expect(uploads).toEqual(['document']);
    await waitFor(() => expect(router.state.location.search).toBe('?tab=contract'));
    expect(await screen.findByRole('region', { name: 'Договір № 7-12' })).toBeInTheDocument();
  });

  it('refuses a file of the wrong type in the document zone', async () => {
    stubCard([]);
    server.use(mock.get(`${CONTRACTS}/draft`, () => HttpResponse.json(draft)));
    renderApp(`/applications/${APP.id}/contracts/new`);

    const input = await screen.findByLabelText('Файл DOCX');
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'скан.pdf', { type: 'application/pdf' })] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Оберіть файл Word (.docx)');
  });

  it('says why there is no contract without valid technical conditions', async () => {
    stubCard([]);
    server.use(
      mock.get(`${CONTRACTS}/draft`, () =>
        apiError(409, 'NO_TECHNICAL_CONDITIONS', 'Спершу внесіть ТУ.'),
      ),
    );
    renderApp(`/applications/${APP.id}/contracts/new`);

    expect(await screen.findByRole('heading', { name: 'Договір недоступний' })).toBeInTheDocument();
    expect(screen.getByText('Спершу внесіть ТУ.')).toBeInTheDocument();
  });

  it('shows the contracts in the tab and annuls one with a reason', async () => {
    const current = stubCard([
      makeContract({ signedDate: '2026-03-25', representative: 'Франко Тарас' }),
    ]);
    const cancelled: unknown[] = [];
    server.use(
      mock.post(`${CONTRACTS}/:cid/cancel`, async ({ request }) => {
        cancelled.push(await request.json());
        current.rows = [
          makeContract({
            version: 2,
            cancellation: {
              reason: 'Помилка в даних',
              at: '2026-03-26T09:00:00.000Z',
              by: { id: owner.id, fullName: owner.fullName },
            },
          }),
        ];
        return HttpResponse.json(current.rows[0]);
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}?tab=contract`);

    const frame = await screen.findByRole('region', { name: 'Договір № 125-8' });
    // The valid TU's connection in the card's header (mock-up of 2026-11-20).
    expect(screen.getByText('Нестандартне приєднання')).toBeVisible();
    expect(frame).toHaveTextContent('№ 125-8 від 20.03.2026');
    expect(frame).toHaveTextContent('25.03.2026');
    expect(frame).toHaveTextContent('Франко Тарас');
    expect(within(frame).getByRole('link', { name: 'Редагувати' })).toHaveAttribute(
      'href',
      `/applications/${APP.id}/contracts/ct000000000000000000001/edit`,
    );
    expect(within(frame).queryByRole('button', { name: 'Видалити' })).toBeNull();
    expect(within(frame).getByRole('link', { name: 'Додати договір' })).toHaveAttribute(
      'href',
      `/applications/${APP.id}/contracts/new`,
    );

    await user.click(within(frame).getByRole('button', { name: 'Анулювати' }));
    const dialog = screen.getByRole('dialog', { name: 'Анулювати договір № 125-8?' });
    await user.type(within(dialog).getByLabelText('Причина скасування'), 'Помилка в даних');
    await user.click(within(dialog).getByRole('button', { name: 'Анулювати договір' }));

    expect(await screen.findByText('Договір № 125-8 анульовано')).toBeInTheDocument();
    expect(cancelled).toEqual([{ reason: 'Помилка в даних', version: 1 }]);
    const annulled = await screen.findByRole('region', { name: 'Договір № 125-8' });
    await waitFor(() => expect(annulled).toHaveTextContent('Анульовано'));
    expect(within(annulled).queryByRole('link', { name: 'Редагувати' })).toBeNull();
  });

  it('pages through the contracts in one frame, an annulled one in red', async () => {
    const annulled = makeContract({
      id: 'ct000000000000000000001',
      cancellation: {
        reason: 'Помилка в даних',
        at: '2026-03-26T09:00:00.000Z',
        by: { id: owner.id, fullName: owner.fullName },
      },
    });
    const earlier = makeContract({ id: 'ct000000000000000000002', contractNumber: '126-8' });
    const latest = makeContract({
      id: 'ct000000000000000000003',
      contractNumber: '127-8',
      contractDate: '2026-03-27',
      representative: 'Франко Тарас',
    });
    stubCard([annulled, earlier, latest]);
    const { user } = renderApp(`/applications/${APP.id}?tab=contract`);

    // The latest valid one first; the last of the list, so › is off.
    const shown = await screen.findByRole('region', { name: 'Договір № 127-8' });
    expect(shown).toHaveTextContent('Франко Тарас');
    expect(within(shown).getByRole('button', { name: 'Наступний договір' })).toBeDisabled();

    await user.click(within(shown).getByRole('button', { name: 'Попередній договір' }));
    const second = screen.getByRole('region', { name: 'Договір № 126-8' });
    expect(second).not.toHaveTextContent('Анульовано');

    await user.click(within(second).getByRole('button', { name: 'Попередній договір' }));
    const first = screen.getByRole('region', { name: 'Договір № 125-8' });
    expect(first).toHaveTextContent('Анульовано');
    expect(first).toHaveTextContent('Помилка в даних');
    expect(within(first).getByRole('button', { name: 'Попередній договір' })).toBeDisabled();
    expect(within(first).queryByRole('link', { name: 'Редагувати' })).toBeNull();
    expect(screen.queryAllByRole('region', { name: /^Договір №/ })).toHaveLength(1);
  });

  it('shows no paging for a single contract', async () => {
    stubCard([makeContract()]);
    renderApp(`/applications/${APP.id}?tab=contract`);

    const frame = await screen.findByRole('region', { name: 'Договір № 125-8' });
    expect(within(frame).queryByRole('button', { name: 'Попередній договір' })).toBeNull();
  });

  it('lets an administrator delete a contract for good', async () => {
    const current = stubCard([makeContract()], admin);
    server.use(
      mock.delete(`${CONTRACTS}/:cid`, () => {
        current.rows = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(`/applications/${APP.id}?tab=contract`);

    const frame = await screen.findByRole('region', { name: 'Договір № 125-8' });
    await user.click(within(frame).getByRole('button', { name: 'Видалити' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Видалити договір № 125-8?' })).getByRole(
        'button',
        { name: 'Видалити' },
      ),
    );

    expect(await screen.findByText('Договір № 125-8 видалено')).toBeInTheDocument();
  });

  it('edits a contract on its page: the fields, then the chosen scan', async () => {
    const current = stubCard([makeContract()]);
    const patches: unknown[] = [];
    const uploads: string[] = [];
    server.use(
      mock.patch(`${CONTRACTS}/:cid`, async ({ request }) => {
        patches.push(await request.json());
        current.rows = [makeContract({ signedDate: '2026-03-25', version: 2 })];
        return HttpResponse.json(current.rows[0]);
      }),
      mock.put(`${CONTRACTS}/:cid/files/:kind`, ({ params }) => {
        uploads.push(String(params.kind));
        return HttpResponse.json(current.rows[0]);
      }),
    );
    const { user, router } = renderApp(
      `/applications/${APP.id}/contracts/ct000000000000000000001/edit`,
    );

    expect(
      await screen.findByRole('heading', { name: 'Договір на нестандартне приєднання № 125-8' }),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Зберегти' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Дата укладання договору'), '2026-03-25');
    await user.upload(
      screen.getByLabelText('PDF-файл скану'),
      new File(['%PDF'], 'Підписаний.pdf', { type: 'application/pdf' }),
    );
    await user.click(save);

    expect(await screen.findByText('Договір № 125-8 збережено')).toBeInTheDocument();
    expect(patches).toEqual([expect.objectContaining({ signedDate: '2026-03-25', version: 1 })]);
    expect(uploads).toEqual(['scan']);
    expect(router.state.location.search).toBe('?tab=contract');
  });
});
