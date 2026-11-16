import { screen, within } from '@testing-library/react';
import type { CalendarDayDto } from '@tu-registry/shared';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseSetting, renderApp } from '@/test/renderApp';
import { makeUser, server, signedInAs } from '@/test/server';

const admin = makeUser({ role: 'ADMIN' });

const day = (overrides: Partial<CalendarDayDto> = {}): CalendarDayDto => ({
  date: '2026-08-24',
  kind: 'NON_WORKING',
  description: 'День Незалежності',
  updatedBy: { id: admin.id, fullName: 'Адмін Тестовий' },
  updatedAt: '2026-11-10T08:00:00.000Z',
  ...overrides,
});

/** GET /calendar answers with the days of the requested year; records the years asked. */
function calendarApi(days: CalendarDayDto[]) {
  const years: string[] = [];
  server.use(
    mock.get('*/api/v1/calendar', ({ request }) => {
      const year = new URL(request.url).searchParams.get('year') ?? '';
      years.push(year);
      return HttpResponse.json(days.filter((d) => d.date.startsWith(year)));
    }),
  );
  return years;
}

describe('CalendarPage', () => {
  beforeEach(() => {
    // Only Date is faked: timers stay real for user-event and MSW.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is reached from the settings menu and shows the current year's exceptions", async () => {
    server.use(signedInAs(admin));
    const years = calendarApi([
      day(),
      day({ date: '2026-11-07', kind: 'WORKING', description: 'Відпрацювання' }),
    ]);
    const { user, router } = renderApp('/');
    await chooseSetting(user, 'Календар');
    expect(router.state.location.pathname).toBe('/calendar');

    const table = await screen.findByRole('table', { name: 'Календар робочих днів' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      '24.08.2026, пн',
      '07.11.2026, сб',
    ]);
    expect(rows[0]).toHaveTextContent('Неробочий');
    expect(rows[0]).toHaveTextContent('Адмін Тестовий');
    expect(years).toEqual(['2026']);
  });

  it('switches the year through the URL', async () => {
    server.use(signedInAs(admin));
    const years = calendarApi([day()]);
    const { user, router } = renderApp('/calendar');

    await screen.findByRole('table', { name: 'Календар робочих днів' });
    await user.selectOptions(screen.getByLabelText('Рік'), '2027');

    expect(router.state.location.search).toBe('?year=2027');
    expect(await screen.findByText('У 2027 році винятків немає.')).toBeVisible();
    expect(years).toContain('2027');
  });

  it('adds a day, suggesting the type from the weekday, and shows a refusal by the field', async () => {
    server.use(signedInAs(admin));
    calendarApi([]);
    const sent: Record<string, unknown>[] = [];
    server.use(
      mock.post('*/api/v1/calendar', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push(body);
        if (sent.length === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'CONFLICT',
                message: 'Ця дата вже є в календарі',
                details: { fieldErrors: { date: ['Ця дата вже є в календарі'] } },
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(day(body as Partial<CalendarDayDto>), { status: 201 });
      }),
    );
    const { user } = renderApp('/calendar');

    await user.click(await screen.findByRole('button', { name: 'Додати день' }));
    const dialog = screen.getByRole('dialog', { name: 'Новий день у календарі' });
    const date = within(dialog).getByLabelText('Дата');

    await user.type(date, '2026-11-07'); // Saturday
    expect(within(dialog).getByRole('radio', { name: 'Робочий' })).toBeChecked();
    expect(dialog).toHaveTextContent('сб, вихідний');
    await user.clear(date);
    await user.type(date, '2026-11-04'); // Wednesday
    expect(within(dialog).getByRole('radio', { name: 'Неробочий' })).toBeChecked();

    await user.type(within(dialog).getByLabelText('Опис'), 'Додатковий вихідний');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));
    expect(await within(dialog).findByText('Ця дата вже є в календарі')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));
    expect(await screen.findByText('День 04.11.2026, ср додано')).toBeVisible();
    expect(sent[1]).toEqual({
      date: '2026-11-04',
      kind: 'NON_WORKING',
      description: 'Додатковий вихідний',
    });
  });

  it('checks the weekday before sending: a Sunday cannot be made a day off', async () => {
    server.use(signedInAs(admin));
    calendarApi([]);
    const { user } = renderApp('/calendar');

    await user.click(await screen.findByRole('button', { name: 'Додати день' }));
    const dialog = screen.getByRole('dialog', { name: 'Новий день у календарі' });
    await user.type(within(dialog).getByLabelText('Дата'), '2026-11-08');
    await user.click(within(dialog).getByRole('radio', { name: 'Неробочий' }));
    await user.type(within(dialog).getByLabelText('Опис'), 'Неділя');
    await user.click(within(dialog).getByRole('button', { name: 'Додати' }));

    expect(await within(dialog).findByText('Субота й неділя — вихідні й так')).toBeVisible();
  });

  it('edits the description without offering to change the date, and deletes after a confirmation', async () => {
    server.use(signedInAs(admin));
    calendarApi([day()]);
    const patched: unknown[] = [];
    let deleted = false;
    server.use(
      mock.patch('*/api/v1/calendar/2026-08-24', async ({ request }) => {
        patched.push(await request.json());
        return HttpResponse.json(day({ description: 'День Незалежності України' }));
      }),
      mock.delete('*/api/v1/calendar/2026-08-24', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/calendar');

    await user.click(await screen.findByRole('button', { name: 'Редагувати: 24.08.2026' }));
    const edit = screen.getByRole('dialog', { name: 'Редагування: 24.08.2026' });
    expect(within(edit).queryByLabelText('Дата')).toBeNull();
    await user.type(within(edit).getByLabelText('Опис'), ' України');
    await user.click(within(edit).getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('День 24.08.2026, пн збережено')).toBeVisible();
    expect(patched).toEqual([{ kind: 'NON_WORKING', description: 'День Незалежності України' }]);

    await user.click(screen.getByRole('button', { name: 'Видалити: 24.08.2026' }));
    const confirm = screen.getByRole('dialog', {
      name: 'Видалити 24.08.2026, пн з календаря?',
    });
    expect(confirm).toHaveTextContent('Цей день знову стане робочим');
    await user.click(within(confirm).getByRole('button', { name: 'Видалити' }));
    expect(await screen.findByText('День 24.08.2026, пн видалено з календаря')).toBeVisible();
    expect(deleted).toBe(true);
  });
});
