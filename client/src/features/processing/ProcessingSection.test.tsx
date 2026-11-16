import type { ApplicationDto, ProcessingDto, TimelineEventDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makeProcessing, makeResponse } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { apiError, makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const APP = makeApplication();

const event = (overrides: Partial<TimelineEventDto>): TimelineEventDto => ({
  type: 'RESPONSE',
  date: '2026-03-16',
  number: null,
  person: null,
  documentId: null,
  scanName: null,
  workingDays: 0,
  norm: null,
  overdueBy: 0,
  sinceDocumentsReceived: null,
  cancelled: false,
  ...overrides,
});

/** The card; `processing` answers GET …/processing; returns how many times it was asked. */
function openCard(processing: ProcessingDto, app: ApplicationDto = APP) {
  const asked = { count: 0 };
  server.use(
    signedInAs(owner),
    mock.get(`*/api/v1/applications/${app.id}`, () => HttpResponse.json(app)),
    mock.get(`*/api/v1/applications/${app.id}/processing`, () => {
      asked.count += 1;
      return HttpResponse.json(processing);
    }),
    mock.get(`*/api/v1/applications/${app.id}/history`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/responses`, () => HttpResponse.json([])),
    mock.get(`*/api/v1/applications/${app.id}/technical-conditions`, () => HttpResponse.json([])),
    mock.get('*/api/v1/engineers', () => HttpResponse.json([])),
  );
  return { ...renderApp(`/applications/${app.id}`), asked };
}

const section = () => screen.findByRole('region', { name: 'Історія опрацювання' });
const summary = async () =>
  within(await section()).findByRole('list', { name: 'Строки опрацювання' });

describe('processing in the application card', () => {
  it('shows the stage next to the number', async () => {
    openCard(makeProcessing(), makeApplication({ stage: 'RESPONDED' }));
    const heading = await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(heading.parentElement).toHaveTextContent('Відповідь надана');
  });

  it('shows «Анульовано» and no running deadlines for an annulled application', async () => {
    openCard(makeProcessing(), makeApplication({ status: 'ANNULLED', stage: 'RESPONDED' }));
    const heading = await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(heading.parentElement).toHaveTextContent('Анульовано');
    expect(heading.parentElement).not.toHaveTextContent('Відповідь надана');
    await within(await section()).findByRole('list');
    expect(screen.queryByRole('list', { name: 'Строки опрацювання' })).toBeNull();
  });

  it('shows how much time is left while documents are awaited', async () => {
    openCard(
      makeProcessing({
        deadlines: {
          tracked: true,
          response: {
            norm: 5,
            used: 3,
            remaining: 2,
            dueDate: '2026-03-19',
            overdueBy: 0,
            done: false,
          },
          tu: { norm: 10, used: 3, remaining: 7, dueDate: '2026-03-26', overdueBy: 0, done: false },
        },
      }),
    );
    const [response, tu] = within(await summary()).getAllByRole('listitem');
    expect(response).toHaveTextContent(
      'Відповідь: минуло 3 з 5 робочих днів, лишилось 2 (до 19.03.2026)',
    );
    expect(tu).toHaveTextContent('Технічні умови: минуло 3 з 10 робочих днів, лишилось 7');
  });

  it('shows documents given in time and late, and no response line when none was needed', async () => {
    openCard(
      makeProcessing({
        deadlines: {
          tracked: true,
          response: null,
          tu: {
            norm: 10,
            used: 12,
            remaining: -2,
            dueDate: '2026-03-26',
            overdueBy: 2,
            done: true,
          },
        },
      }),
    );
    const lines = within(await summary()).getAllByRole('listitem');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent(
      'Технічні умови: 12 робочих днів з 10 Строк перевищено на 2 робочі дні',
    );
  });

  it('gives no warnings for an application from before the deadlines were tracked', async () => {
    openCard(
      makeProcessing({
        deadlines: {
          tracked: false,
          response: {
            norm: 5,
            used: 400,
            remaining: -395,
            dueDate: '2025-03-10',
            overdueBy: 395,
            done: false,
          },
          tu: {
            norm: 10,
            used: 400,
            remaining: -390,
            dueDate: '2025-03-17',
            overdueBy: 390,
            done: false,
          },
        },
      }),
    );
    const list = await summary();
    expect(list).not.toHaveTextContent('Строк перевищено');
    expect(list).toHaveTextContent(
      'Строки не контролюються: заяву зареєстровано до запуску модуля опрацювання.',
    );
  });

  it('lays out the timeline as the server orders it, cancelled documents struck', async () => {
    openCard(
      makeProcessing({
        events: [
          ...makeProcessing().events,
          event({
            number: '125/01-15',
            date: '2026-03-16',
            person: 'Бойко Андрій',
            documentId: 'resp0000000000000000001',
            workingDays: 2,
            norm: 5,
          }),
          event({ number: 'помилкова', cancelled: true, workingDays: 2, norm: 5, overdueBy: 0 }),
          event({ type: 'DOCUMENTS_RECEIVED', date: '2026-03-18', workingDays: 4 }),
          event({
            type: 'TECHNICAL_CONDITIONS',
            number: '0032/ТУ',
            date: '2026-03-27',
            person: 'Бойко Андрій',
            workingDays: 11,
            norm: 10,
            overdueBy: 1,
            sinceDocumentsReceived: 7,
          }),
        ],
      }),
    );

    const items = await within(await section()).findAllByRole('listitem', {
      name: /, \d\d\.\d\d\.\d{4}$/,
    });
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Заява № 14т/26-8, 12.03.2026',
      'Відповідь № 125/01-15, 16.03.2026',
      'Відповідь № помилкова, 16.03.2026',
      'Документи надійшли, 18.03.2026',
      'Технічні умови № 0032/ТУ, 27.03.2026',
    ]);
    expect(items[0]).toHaveTextContent('Зареєстрував(ла): Олена Коваль');
    expect(items[1]).toHaveTextContent('Інженер: Бойко Андрій');
    expect(items[1]).toHaveTextContent('2 робочі дні з 5');
    expect(items[2]).toHaveTextContent('скасовано');
    expect(items[3]).toHaveTextContent('4 робочі дні від реєстрації');
    expect(items[4]).toHaveTextContent(
      '11 робочих днів з 10 (7 робочих днів від надходження документів)',
    );
    expect(items[4]).toHaveTextContent('строк перевищено на 1 робочий день');
  });

  it('opens a document scan from the timeline and reports a failure', async () => {
    const { user } = openCard(
      makeProcessing({
        events: [
          event({
            number: '125/01-15',
            documentId: 'resp0000000000000000001',
            scanName: 'Відповідь.pdf',
          }),
        ],
      }),
    );
    server.use(
      mock.get(`*/api/v1/applications/${APP.id}/responses/resp0000000000000000001/scan`, () =>
        apiError(404, 'NOT_FOUND', 'Файл скану не знайдено'),
      ),
    );

    await user.click(
      await within(await section()).findByRole('button', { name: 'Скан: Відповідь № 125/01-15' }),
    );
    expect(
      await screen.findByText('Не вдалося відкрити скан: Файл скану не знайдено'),
    ).toBeVisible();
  });

  it('refreshes the stage and the timeline after a document is added', async () => {
    const { user, asked } = openCard(makeProcessing());
    server.use(
      mock.get('*/api/v1/engineers', () =>
        HttpResponse.json([
          {
            id: 'e00000000000000000000001',
            fullName: 'Бойко Андрій',
            department: 'ODESA',
            isActive: true,
          },
        ]),
      ),
      mock.post(`*/api/v1/applications/${APP.id}/responses`, () =>
        HttpResponse.json(makeResponse(), { status: 201 }),
      ),
    );
    await section();
    const before = asked.count;

    await user.click(await screen.findByRole('button', { name: 'Додати відповідь' }));
    const dialog = screen.getByRole('dialog', { name: 'Нова відповідь' });
    await user.type(within(dialog).getByLabelText('Номер вихідного'), '125/01-15');
    await user.selectOptions(await within(dialog).findByLabelText('Інженер'), 'Бойко Андрій');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Відповідь № 125/01-15 додано')).toBeVisible();
    await expect.poll(() => asked.count).toBeGreaterThan(before);
  });
});
