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
  await page.getByLabel('Населений пункт').fill('м. Київ');
  await page.getByLabel('Адреса обʼєкта').fill('вул. Тестова, 1');
  await page.getByRole('radio', { name: 'Міська' }).check();
  await page.getByRole('radio', { name: 'Побутовий', exact: true }).check();
  await page.getByRole('radio', { name: 'Житловий будинок' }).check();
  await page.getByLabel('Коментар (необовʼязково)').fill('Подано особисто');
  await page.getByRole('button', { name: 'Зареєструвати заяву' }).click();

  const result = page.getByText('Заяву зареєстровано:');
  await expect(result).toBeVisible();
  const regNumber = (await result.locator('strong').textContent()) ?? '';
  expect(regNumber).toMatch(/^\d+т\/\d{2}-8$/); // the admin is in Одеське (code 8)

  await page.getByRole('link', { name: 'Реєстр заяв на ТУ' }).click();
  await page.getByRole('searchbox', { name: 'Замовник', exact: true }).fill(customer);

  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  await expect(table.getByRole('row')).toHaveCount(2); // header + the new application
  await expect(table.getByRole('link', { name: regNumber })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Житловий будинок' })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Міська' })).toBeVisible();

  // The comment is searchable too; a click anywhere on the row opens the card.
  await page.getByRole('searchbox', { name: 'Замовник', exact: true }).fill('');
  await page.getByRole('searchbox', { name: 'Коментар' }).fill('Подано особисто');
  await expect(table.getByRole('row')).toHaveCount(2);
  await table.getByRole('cell', { name: customer }).click();
  await expect(page.getByRole('heading', { name: `Заява ${regNumber}` })).toBeVisible();
});

test('enters a back-dated application under the number typed by hand', async ({ page }) => {
  await signIn(page, ADMIN, '/applications/new');

  await page.getByLabel('Замовник', { exact: true }).fill(uniqueName('ТОВ Архів'));
  await page.getByLabel('Телефон').fill('+380 50 111 22 33');
  await page.getByLabel('Населений пункт').fill('м. Одеса');
  await page.getByLabel('Адреса обʼєкта').fill('вул. Архівна, 7');
  await page.getByRole('radio', { name: 'Міська' }).check();
  await page.getByRole('radio', { name: 'Непобутовий' }).check();
  await page.getByRole('radio', { name: 'Інше' }).check();
  await page.getByLabel('Уточніть категорію').fill('Котельня');
  await page.getByLabel('Ручне встановлення дати та номера реєстрації').check();
  await page.getByLabel('Дата реєстрації').fill('2024-05-10');
  await page.getByLabel('Порядковий номер').fill('14');

  // Only digits are typed: «т» and the year come from the date, availability is checked live.
  await expect(page.getByText('Номер реєстрації: 14т/24-8 — вільний')).toBeVisible();
  await page.getByRole('button', { name: 'Внести заяву' }).click();

  await expect(page.getByText('Заяву внесено вручну: 14т/24-8 від 10.05.2024')).toBeVisible();
});
