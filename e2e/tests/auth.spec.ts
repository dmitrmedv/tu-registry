import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { chooseSetting } from '../support/api';

test('an administrator creates a user, who must replace the temporary password', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Вхід до системи' })).toBeVisible();
  await page.getByLabel('Логін').fill(ADMIN.login);
  await page.getByLabel('Пароль', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Реєстр заяв' })).toBeVisible();

  await chooseSetting(page, 'Користувачі');
  await page.getByRole('button', { name: 'Додати користувача' }).click();
  const form = page.getByRole('dialog', { name: 'Новий користувач' });
  const login = `e2e.${Date.now().toString(36)}`;
  await form.getByLabel('Логін').fill(login);
  await form.getByLabel('ПІБ').fill('Олена Коваль');
  await form.getByLabel('Управління').selectOption({ label: 'Одеське' });
  await form.getByRole('button', { name: 'Створити' }).click();

  const created = page.getByRole('dialog', { name: 'Користувача створено' });
  const temporaryPassword = (await created.getByLabel('Тимчасовий пароль').textContent())?.trim();
  expect(temporaryPassword).toBeTruthy();
  await created.getByRole('button', { name: 'Готово' }).click();
  await chooseSetting(page, 'Вийти');

  await page.getByLabel('Логін').fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(temporaryPassword!);
  await page.getByRole('button', { name: 'Увійти' }).click();

  // Until the password is changed, the rest of the application is closed.
  await expect(page.getByRole('heading', { name: 'Зміна пароля' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toHaveCount(0);

  await page.getByLabel('Поточний пароль').fill(temporaryPassword!);
  await page.getByLabel('Новий пароль', { exact: true }).fill('my-own-password-1');
  await page.getByLabel('Повторіть новий пароль').fill('my-own-password-1');
  await page.getByRole('button', { name: 'Змінити пароль' }).click();

  await expect(page.getByRole('heading', { name: 'Реєстр заяв' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Олена Коваль')).toBeVisible();
});
