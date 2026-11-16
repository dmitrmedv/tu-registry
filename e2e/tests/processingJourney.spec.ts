import { expect, type APIRequestContext, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

/**
 * The checks of §13 of the processing module's specification, end to end (stage 17.7).
 * Fixed dates in November 2025, so the counts do not depend on the day the tests run; no other
 * test uses that month, so its calendar exceptions touch nothing else.
 *
 *   Mon 03.11 registered (by hand, back-dated)    Wed 05.11 a day off (calendar)
 *   Fri 07.11 response 1 → 3 working days of 5    Sat 08.11 a working day (calendar)
 *   Mon 10.11 documents came → 5 days              Tue 11.11 response 2 → 6 of 5, overdue by 1
 *   Mon 17.11 technical conditions → 10 of 10 (5 since the documents came)
 */
const REG_DATE = '2025-11-03';
const DAY_OFF = '2025-11-05';
const WORKING_SATURDAY = '2025-11-08';
const PDF = Buffer.from('%PDF-1.4\n% E2E journey\n%%EOF\n');

type Headers = Awaited<ReturnType<typeof apiLogin>>;

async function post(request: APIRequestContext, headers: Headers, url: string, data: unknown) {
  const response = await request.post(url, { headers, data });
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string; version: number };
}

const addCalendarDay = (request: APIRequestContext, headers: Headers, date: string) =>
  post(request, headers, '/api/v1/calendar', {
    date,
    kind: date === WORKING_SATURDAY ? 'WORKING' : 'NON_WORKING',
    description: date === WORKING_SATURDAY ? 'Відпрацювання (E2E)' : 'Вихідний (E2E)',
  });

test('a back-dated application through responses to technical conditions, by the calendar', async ({
  page,
  browser,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  for (const date of [DAY_OFF, WORKING_SATURDAY]) await addCalendarDay(page.request, headers, date);
  const leaving = uniqueName('Інженер Звільнений');
  const staying = uniqueName('Інженер Чинний');
  // The first answers and is deactivated later; the second prepares the TU (chosen by name).
  const first = await post(page.request, headers, '/api/v1/engineers', {
    fullName: leaving,
    department: 'ODESA',
  });
  await post(page.request, headers, '/api/v1/engineers', {
    fullName: staying,
    department: 'ODESA',
  });
  const customer = uniqueName('ТОВ Наскрізна');
  const app = await post(page.request, headers, '/api/v1/applications/manual', {
    customer,
    phone: '+380671234567',
    settlement: 'м. Київ',
    areaType: 'URBAN',
    objectAddress: 'вул. Календарна, 3',
    objectType: 'DOMESTIC',
    objectCategory: 'APARTMENT',
    regDate: REG_DATE,
    regSeq: String(5000 + Math.floor(Math.random() * 4000)),
  });
  const responses = `/api/v1/applications/${app.id}/responses`;
  const answerNumber = uniqueName('125/01').replace(' ', '-');
  const answer = await post(page.request, headers, responses, {
    outgoingNumber: answerNumber,
    responseDate: '2025-11-07',
    engineer: first.id,
  });
  const scan = await page.request.put(`${responses}/${answer.id}/scan`, {
    headers,
    multipart: { scan: { name: 'Відповідь.pdf', mimeType: 'application/pdf', buffer: PDF } },
  });
  expect(scan.ok(), await scan.text()).toBe(true);
  const received = await page.request.patch(`${responses}/${answer.id}`, {
    headers,
    data: { version: 1, documentsReceivedAt: '2025-11-10' },
  });
  expect(received.ok(), await received.text()).toBe(true);
  await post(page.request, headers, responses, {
    outgoingNumber: `${answerNumber}-2`,
    responseDate: '2025-11-11',
    engineer: first.id,
  });

  // Technical conditions through the card.
  await signIn(page, ADMIN, `/applications/${app.id}`);
  const title = page.getByRole('heading', { level: 1 }).locator('..');
  await expect(title).toContainText('Відповідь надана');
  const tuSection = page.getByRole('region', { name: 'Технічні умови' });
  await tuSection.getByRole('button', { name: 'Додати ТУ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нові технічні умови' });
  await dialog.getByLabel('Реєстраційний номер ТУ').fill('0032/ТУ');
  await dialog.getByLabel('Дата підготовки ТУ').fill('2025-11-17');
  await dialog.getByLabel('Інженер, який розробив ТУ').selectOption({ label: staying });
  await dialog.getByLabel('Витрати газу, м³/год').fill('2,5');
  await dialog.getByRole('radio', { name: 'Стандартне', exact: true }).check();
  await dialog.getByRole('radio', { name: 'Низький' }).check();
  await dialog.getByRole('radio', { name: 'Підземний газопровід' }).check();
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByText('Технічні умови № 0032/ТУ додано')).toBeVisible();
  await expect(title).toContainText('ТУ підготовлені');

  // Deadlines: the first response counts; the working Saturday makes up for the day off.
  const history = page.getByRole('region', { name: 'Історія опрацювання' });
  const deadlines = history.getByRole('list', { name: 'Строки опрацювання' });
  await expect(deadlines).toContainText('Відповідь: 3 робочі дні з 5 вчасно');
  await expect(deadlines).toContainText('Технічні умови: 10 робочих днів з 10 вчасно');
  const events = history.getByRole('listitem', { name: /, \d\d\.\d\d\.\d{4}$/ });
  await expect(events).toHaveCount(5);
  await expect(events.nth(0)).toContainText('Зареєстрував(ла)');
  await expect(events.nth(1)).toContainText('3 робочі дні з 5');
  await expect(events.nth(2)).toContainText('Документи надійшли');
  await expect(events.nth(2)).toContainText('5 робочих днів від реєстрації');
  await expect(events.nth(3)).toContainText('6 робочих днів з 5');
  await expect(events.nth(3)).toContainText('строк перевищено на 1 робочий день');
  await expect(events.nth(4)).toContainText(
    '10 робочих днів з 10 (5 робочих днів від надходження документів)',
  );

  // Without the working Saturday the same conditions take 9 working days; with it, 10 again.
  const calendarDay = await page.request.delete(`/api/v1/calendar/${WORKING_SATURDAY}`, {
    headers: await apiLogin(page.request, ADMIN),
  });
  expect(calendarDay.status()).toBe(204);
  await page.reload();
  await expect(deadlines).toContainText('Технічні умови: 9 робочих днів з 10');
  await addCalendarDay(page.request, await apiLogin(page.request, ADMIN), WORKING_SATURDAY);
  await page.reload();
  await expect(deadlines).toContainText('Технічні умови: 10 робочих днів з 10');

  // The registry: the stage and the TU; the search finds the response number.
  await page.goto(`/?q=${encodeURIComponent(`${answerNumber}-2`)}`);
  const row = page.getByRole('table', { name: 'Реєстр заяв' }).getByRole('row').nth(1);
  await expect(row).toContainText(customer);
  await expect(row).toContainText('ТУ підготовлені');
  await expect(row).toContainText('17.11.2025');
  await expect(row).toContainText('0032/ТУ');

  // Deactivating an engineer keeps their name in history and removes them from new choices.
  await page.goto('/engineers?department=ODESA');
  await page
    .getByRole('row')
    .filter({ hasText: leaving })
    .getByRole('button', { name: 'Деактивувати' })
    .click();
  await page
    .getByRole('dialog', { name: /^Деактивувати інженера/ })
    .getByRole('button', { name: 'Деактивувати' })
    .click();
  await expect(page.getByRole('row').filter({ hasText: leaving })).toContainText('Неактивний');
  await page.goto(`/applications/${app.id}`);
  await expect(events.nth(1)).toContainText(`Інженер: ${leaving}`);
  await page
    .getByRole('region', { name: 'Відповіді' })
    .getByRole('button', { name: 'Додати відповідь' })
    .click();
  const engineers = page.getByRole('dialog', { name: 'Нова відповідь' }).getByLabel('Інженер');
  await expect(engineers.getByRole('option', { name: staying })).toHaveCount(1);
  await expect(engineers.getByRole('option', { name: leaving })).toHaveCount(0);
  await expect(engineers.getByRole('option', { name: `${leaving} (неактивний)` })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Another department sees nothing of it: not the card, its processing, documents or files.
  const adminHeaders = await apiLogin(page.request, ADMIN);
  const login = `reni.${Date.now().toString(36)}`;
  const created = await page.request.post('/api/v1/users', {
    headers: adminHeaders,
    data: { login, fullName: 'Ренійський Перевіряльник', department: 'RENI' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };
  const reni = await browser.newContext();
  const reniHeaders = await apiLogin(reni.request, { login, password: temporaryPassword });
  await reni.request.post('/api/v1/auth/change-password', {
    headers: reniHeaders,
    data: { currentPassword: temporaryPassword, newPassword: 'reni-password-12' },
  });
  const otherHeaders = await apiLogin(reni.request, { login, password: 'reni-password-12' });
  const technicalConditions = `/api/v1/applications/${app.id}/technical-conditions`;
  for (const url of [
    `/api/v1/applications/${app.id}`,
    `/api/v1/applications/${app.id}/processing`,
    responses,
    `${responses}/${answer.id}/scan`,
    technicalConditions,
  ]) {
    expect((await reni.request.get(url, { headers: otherHeaders })).status(), url).toBe(404);
  }
  const search = await reni.request.get('/api/v1/applications', {
    headers: otherHeaders,
    params: { q: answerNumber },
  });
  expect(((await search.json()) as { meta: { total: number } }).meta.total).toBe(0);
  await reni.close();
});

test('technical conditions without any response: no response was due', async ({ page }) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineer = await post(page.request, headers, '/api/v1/engineers', {
    fullName: uniqueName('Інженер Без Відповіді'),
    department: 'ODESA',
  });
  const { id } = await createApplication(page.request, headers);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  await post(page.request, headers, `/api/v1/applications/${id}/technical-conditions`, {
    tuNumber: '0050/ТУ',
    preparedDate: today,
    engineer: engineer.id,
    gasFlow: 1,
    connectionType: 'STANDARD',
    gasPressure: 'LOW',
    connectionPoint: 'UNDERGROUND',
  });

  await signIn(page, ADMIN, `/applications/${id}`);
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText(
    'ТУ підготовлені',
  );
  const deadlines = page.getByRole('list', { name: 'Строки опрацювання' });
  await expect(deadlines.getByRole('listitem')).toHaveCount(1);
  await expect(deadlines).toContainText('Технічні умови: 0 робочих днів з 10 вчасно');
  await expect(page.getByRole('region', { name: 'Відповіді' })).toContainText(
    'Відповідей на заяву не надавали.',
  );
});
