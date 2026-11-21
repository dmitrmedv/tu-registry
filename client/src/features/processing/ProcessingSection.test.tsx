import type { ApplicationDto, ProcessingDto, TimelineEventDto } from '@tu-registry/shared';
import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeApplication, makeProcessing, makeResponse } from '@/test/fixtures';
import { addModule, renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const owner = makeUser({ id: 'owner000000000000000001', role: 'USER' });
const APP = makeApplication();

const event = (overrides: Partial<TimelineEventDto>): TimelineEventDto => ({
  type: 'RESPONSE',
  date: '2026-03-16',
  month: null,
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
    mock.get(`*/api/v1/applications/${app.id}/contracts`, () => HttpResponse.json([])),
    mock.get('*/api/v1/engineers', () => HttpResponse.json([])),
  );
  return { ...renderApp(`/applications/${app.id}`), asked };
}

const section = () => screen.findByRole('region', { name: 'Історія опрацювання' });

describe('processing in the application card', () => {
  it('shows no stage next to the number: the timeline and the tabs tell it', async () => {
    openCard(makeProcessing(), makeApplication({ stage: 'RESPONDED' }));
    const heading = await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(heading.parentElement).not.toHaveTextContent('Відповідь надана');
  });

  it('marks an annulled application next to its number', async () => {
    openCard(makeProcessing(), makeApplication({ status: 'ANNULLED', stage: 'RESPONDED' }));
    const heading = await screen.findByRole('heading', { name: 'Заява 14т/26-8' });
    expect(heading.parentElement).toHaveTextContent('Анульовано');
    expect(heading.parentElement).not.toHaveTextContent('Відповідь надана');
  });

  it('shows no deadline figures: the timeline only', async () => {
    openCard(makeProcessing());
    await within(await section()).findByRole('listitem', { name: /^Заява/ });
    expect(screen.queryByRole('list', { name: 'Строки опрацювання' })).toBeNull();
    expect(await section()).not.toHaveTextContent('робоч');
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
          event({ type: 'CONTRACT', number: '125-8', date: '2026-03-30', workingDays: 12 }),
          event({ type: 'CONTRACT_SIGNED', number: '125-8', date: '2026-04-02', workingDays: 15 }),
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
      'Договір № 125-8, 30.03.2026',
      'Договір укладено № 125-8, 02.04.2026',
    ]);
    // A document and its date per line, nothing else.
    expect(items[0]).toHaveTextContent(/^Заява № 14т\/26-8 від 12\.03\.2026$/);
    expect(items[1]).toHaveTextContent(/^Відповідь № 125\/01-15 від 16\.03\.2026$/);
    expect(items[2]).toHaveTextContent('скасовано');
    expect(items[4]).toHaveTextContent(/^Технічні умови № 0032\/ТУ від 27\.03\.2026$/);
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

    await addModule(user, 'Відповідь');
    const dialog = screen.getByRole('dialog', { name: 'Нова відповідь' });
    await user.type(within(dialog).getByLabelText('Номер вихідного'), '125/01-15');
    await user.selectOptions(await within(dialog).findByLabelText('Інженер'), 'Бойко Андрій');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Відповідь № 125/01-15 додано')).toBeVisible();
    await expect.poll(() => asked.count).toBeGreaterThan(before);
  });

  it('opens the tab of an event from its title', async () => {
    const { user } = openCard(
      makeProcessing({
        events: [
          ...makeProcessing().events,
          event({ number: '125/01-15', documentId: 'resp0000000000000000001' }),
        ],
      }),
    );
    server.use(
      mock.get(`*/api/v1/applications/${APP.id}/responses`, () =>
        HttpResponse.json([makeResponse()]),
      ),
    );

    const timeline = await section();
    await user.click(
      await within(timeline).findByRole('button', { name: 'Відповідь № 125/01-15 від 16.03.2026' }),
    );
    expect(await screen.findByRole('tab', { name: 'Відповідь' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: 'Відповідь' })).toBeVisible();

    await user.click(within(timeline).getByRole('button', { name: /^Заява № 14т\/26-8/ }));
    expect(screen.getByRole('tab', { name: 'Заява' })).toHaveAttribute('aria-selected', 'true');
  });
});
