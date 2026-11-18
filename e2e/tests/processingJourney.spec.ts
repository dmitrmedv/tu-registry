import { expect, type APIRequestContext, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { addModule, apiLogin, createApplication, signIn, uniqueName } from '../support/api';

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
type Deadline = { used: number; norm: number; overdueBy: number; done: boolean };
/** The part of GET …/processing these checks read. */
type Processing = {
  deadlines: { response: Deadline | null; tu: Deadline };
  events: {
    type: string;
    workingDays: number;
    overdueBy: number;
    sinceDocumentsReceived: number | null;
  }[];
};

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
    gasificationType: 'NEW',
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
  // The responses have their tab; the title shows no stage (the registry does).
  await expect(page.getByRole('tab', { name: 'Відповідь' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).not.toContainText(
    'Відповідь надана',
  );
  await addModule(page, 'Технічні умови');
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

  // The timeline in the card: a document and its date per line.
  const history = page.getByRole('region', { name: 'Історія опрацювання' });
  const events = history.getByRole('listitem', { name: /, \d\d\.\d\d\.\d{4}$/ });
  await expect(events).toHaveCount(5);
  await expect(events.nth(0)).toContainText('від 03.11.2025');
  await expect(events.nth(2)).toContainText('Документи надійшли');
  await expect(events.nth(4)).toContainText('Технічні умови № 0032/ТУ');

  // The deadlines are counted by the server (the card does not show them for now): the first
  // response counts; the working Saturday makes up for the day off.
  const processing = async () => {
    const response = await page.request.get(`/api/v1/applications/${app.id}/processing`, {
      headers: await apiLogin(page.request, ADMIN),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as Processing;
  };
  const counted = await processing();
  expect(counted.deadlines.response).toMatchObject({ used: 3, norm: 5, overdueBy: 0, done: true });
  expect(counted.deadlines.tu).toMatchObject({ used: 10, norm: 10, overdueBy: 0, done: true });
  expect(
    counted.events.map((event) => [
      event.type,
      event.workingDays,
      event.overdueBy,
      event.sinceDocumentsReceived,
    ]),
  ).toEqual([
    ['REGISTERED', 0, 0, null],
    ['RESPONSE', 3, 0, null],
    ['DOCUMENTS_RECEIVED', 5, 0, null],
    ['RESPONSE', 6, 1, null],
    ['TECHNICAL_CONDITIONS', 10, 0, 5],
  ]);

  // Without the working Saturday the same conditions take 9 working days; with it, 10 again.
  const calendarDay = await page.request.delete(`/api/v1/calendar/${WORKING_SATURDAY}`, {
    headers: await apiLogin(page.request, ADMIN),
  });
  expect(calendarDay.status()).toBe(204);
  expect((await processing()).deadlines.tu.used).toBe(9);
  await addCalendarDay(page.request, await apiLogin(page.request, ADMIN), WORKING_SATURDAY);
  expect((await processing()).deadlines.tu.used).toBe(10);

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
  await page.goto(`/applications/${app.id}?tab=response`);
  const responsesTab = page.getByRole('tabpanel', { name: 'Відповідь' });
  // The deactivated engineer stays on the responses they gave.
  await expect(responsesTab.getByRole('article').getByTitle(leaving)).toHaveCount(2);
  await responsesTab.getByRole('button', { name: 'Додати відповідь' }).click();
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
  await expect(
    page.getByRole('region', { name: 'Історія опрацювання' }).getByText('Технічні умови № 0050/ТУ'),
  ).toBeVisible();
  const processing = await page.request.get(`/api/v1/applications/${id}/processing`, {
    headers: await apiLogin(page.request, ADMIN),
  });
  const { deadlines } = (await processing.json()) as Processing;
  expect(deadlines.response).toBeNull();
  expect(deadlines.tu).toMatchObject({ used: 0, norm: 10, overdueBy: 0 });
  await expect(page.getByRole('tab', { name: 'ТУ' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Відповідь' })).toHaveCount(0);
});
