import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

test('the registry shows, sorts, filters and searches by responses and technical conditions', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineerName = uniqueName('Реєстровий Інженер');
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: engineerName, department: 'ODESA' },
    })
  ).json()) as { id: string };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  const prefix = uniqueName('ТОВ Реєстр');
  const tuNumber = uniqueName('ТУ').replace(' ', '-');

  const answered = await createApplication(page.request, headers, {
    customer: `${prefix} відповідь`,
  });
  const prepared = await createApplication(page.request, headers, {
    customer: `${prefix} ТУ`,
  });
  await createApplication(page.request, headers, { customer: `${prefix} без документів` });
  const response = await page.request.post(`/api/v1/applications/${answered.id}/responses`, {
    headers,
    data: { outgoingNumber: '125/01-15', responseDate: today, engineer: engineer.id },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const tu = await page.request.post(`/api/v1/applications/${prepared.id}/technical-conditions`, {
    headers,
    data: {
      tuNumber,
      preparedDate: today,
      engineer: engineer.id,
      gasFlow: 2.5,
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    },
  });
  expect(tu.ok(), await tu.text()).toBe(true);

  await signIn(page, ADMIN, `/?q=${encodeURIComponent(prefix)}`);
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  const rowOf = (customer: string) => table.getByRole('row').filter({ hasText: customer });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(rowOf(`${prefix} ТУ`)).toContainText('ТУ підготовлені');
  await expect(rowOf(`${prefix} ТУ`)).toContainText(tuNumber);
  await expect(rowOf(`${prefix} ТУ`)).toContainText(engineerName);
  await expect(rowOf(`${prefix} відповідь`)).toContainText('Відповідь надана');
  await expect(rowOf(`${prefix} без документів`)).toContainText('Зареєстрована');

  // Sorting by the TU date: the newest first; applications without TU at the end.
  await table.getByRole('button', { name: /^Дата ТУ/ }).click();
  await expect(page).toHaveURL(/sort=-tuDate/);
  await expect(table.getByRole('row').nth(1)).toContainText(`${prefix} ТУ`);

  // «Стан» and «Інженер» behind «Ще фільтри».
  await page.getByRole('button', { name: /^Ще фільтри/ }).click();
  await page.getByLabel('Стан', { exact: true }).selectOption({ label: 'Відповідь надана' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText(`${prefix} відповідь`);
  // Removing one filter and choosing another right after: both apply (no wait in between).
  await page.getByRole('button', { name: 'Прибрати фільтр «Стан: Відповідь надана»' }).click();
  await page.getByLabel('Інженер', { exact: true }).selectOption({ label: engineerName });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(rowOf(`${prefix} без документів`)).toHaveCount(0);

  // The search box finds the TU number alone.
  await page.goto(`/?q=${encodeURIComponent(tuNumber)}`);
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText(`${prefix} ТУ`);

  // Columns: the choice survives a reload.
  await page.getByRole('button', { name: /^Колонки/ }).click();
  await page.getByRole('checkbox', { name: 'Витрати газу, м³/год' }).check();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader', { name: /^Витрати газу/ })).toBeVisible();
  await page.reload();
  await expect(table.getByRole('columnheader', { name: /^Витрати газу/ })).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText('2,5');
  // Back to the defaults, for the other tests in this shared browser profile.
  await page.getByRole('button', { name: /^Колонки/ }).click();
  await page.getByRole('button', { name: 'Як за замовчуванням' }).click();
});
