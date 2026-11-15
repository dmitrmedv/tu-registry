import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, uniqueName } from '../support/api';

test('a user sees and numbers only their department; the admin sees all', async ({
  page,
  browser,
}) => {
  // The admin (Одеське) registers one application; a new Ренійське user is created.
  const headers = await apiLogin(page.request, ADMIN);
  const odesaCustomer = uniqueName('ТОВ Одеса');
  const odesaApp = await createApplication(page.request, headers, { customer: odesaCustomer });
  const login = `reni.${Date.now().toString(36)}`;
  const created = await page.request.post('/api/v1/users', {
    headers,
    data: { login, fullName: 'Ренійський Працівник', department: 'RENI' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { temporaryPassword } = (await created.json()) as { temporaryPassword: string };

  // The Ренійське user, in a browser of their own.
  const reniContext = await browser.newContext();
  const reniPage = await reniContext.newPage();
  const reniCredentials = { login, password: temporaryPassword };
  const reniHeaders = await apiLogin(reniPage.request, reniCredentials);
  const changed = await reniPage.request.post('/api/v1/auth/change-password', {
    headers: reniHeaders,
    data: { currentPassword: temporaryPassword, newPassword: 'reni-password-12' },
  });
  expect(changed.ok(), await changed.text()).toBe(true);
  await apiLogin(reniPage.request, { login, password: 'reni-password-12' });

  const reniCustomer = uniqueName('ТОВ Рені');
  await reniPage.goto('/applications/new');
  await reniPage.getByLabel('Замовник', { exact: true }).fill(reniCustomer);
  await reniPage.getByLabel('Телефон').fill('067 123 45 67');
  await reniPage.getByLabel('Населений пункт').fill('м. Рені');
  await reniPage.getByLabel('Адреса обʼєкта').fill('вул. Дунайська, 1');
  await reniPage.getByRole('radio', { name: 'Міська' }).check();
  await reniPage.getByRole('radio', { name: 'Побутовий', exact: true }).check();
  await reniPage.getByRole('radio', { name: 'Квартира' }).check();
  await reniPage.getByRole('button', { name: 'Зареєструвати заяву' }).click();
  await expect(reniPage.getByText('Заяву зареєстровано:')).toContainText(/\d+т\/\d{2}-11 /);

  // The user's registry: their department only, no department filter.
  await reniPage.getByRole('link', { name: 'Реєстр заяв на ТУ' }).click();
  const reniTable = reniPage.getByRole('table', { name: 'Реєстр заяв' });
  await expect(reniTable.getByRole('cell', { name: reniCustomer })).toBeVisible();
  await expect(reniTable.getByRole('cell', { name: odesaCustomer })).toHaveCount(0);
  await expect(reniPage.getByLabel('Управління')).toHaveCount(0);
  await reniPage.goto(`/applications/${odesaApp.id}`);
  await expect(reniPage.getByRole('heading', { name: 'Заяву не знайдено' })).toBeVisible();
  await reniContext.close();

  // The admin: Одеське by default, every department on request.
  await page.goto('/');
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  await expect(table.getByRole('cell', { name: odesaCustomer })).toBeVisible();
  await expect(table.getByRole('cell', { name: reniCustomer })).toHaveCount(0);
  await page.getByLabel('Управління').selectOption({ label: 'Усі управління' });
  await expect(table.getByRole('cell', { name: reniCustomer })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Ренійське' }).first()).toBeVisible();
});
