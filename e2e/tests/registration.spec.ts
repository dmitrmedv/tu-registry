import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { signIn, uniqueName } from '../support/api';

test('registers an application under the next number and finds it in the registry', async ({
  page,
}) => {
  await signIn(page, ADMIN, '/applications/new');
  const customer = uniqueName('ТОВ E2E');

  await page.getByLabel('Замовник', { exact: true }).fill(customer);
  await page.getByLabel('Телефон').fill('067 123 45 67');
  await page.getByLabel('Адреса обʼєкта').fill('м. Київ, вул. Тестова, 1');
  await page.getByLabel('Тип обʼєкта').selectOption({ label: 'Побутовий' });
  await page.getByRole('button', { name: 'Зареєструвати заяву' }).click();

  const result = page.getByText('Заяву зареєстровано:');
  await expect(result).toBeVisible();
  const regNumber = (await result.locator('strong').textContent()) ?? '';
  expect(regNumber).toMatch(/^\d+т\/\d{2}$/);

  await page.getByRole('link', { name: 'Реєстр', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Замовник' }).fill(customer);

  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  await expect(table.getByRole('row')).toHaveCount(2); // header + the new application
  await expect(table.getByRole('link', { name: regNumber })).toBeVisible();
});

test('enters a back-dated application under the number typed by hand', async ({ page }) => {
  await signIn(page, ADMIN, '/applications/new');

  await page.getByLabel('Замовник', { exact: true }).fill(uniqueName('ТОВ Архів'));
  await page.getByLabel('Телефон').fill('+380 50 111 22 33');
  await page.getByLabel('Адреса обʼєкта').fill('м. Одеса, вул. Архівна, 7');
  await page.getByLabel('Тип обʼєкта').selectOption({ label: 'Побутовий' });
  await page.getByLabel('Ручне встановлення дати та номера реєстрації').check();
  await page.getByLabel('Дата реєстрації').fill('2024-05-10');
  await page.getByLabel('Порядковий номер').fill('14');

  // Only digits are typed: «т» and the year come from the date, availability is checked live.
  await expect(page.getByText('Номер реєстрації: 14т/24 — вільний')).toBeVisible();
  await page.getByRole('button', { name: 'Внести заяву' }).click();

  await expect(page.getByText('Заяву внесено вручну: 14т/24 від 10.05.2024')).toBeVisible();
});
