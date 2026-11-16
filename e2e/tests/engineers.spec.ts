import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { chooseSetting, signIn, uniqueName } from '../support/api';

test('an admin adds, renames and deactivates an engineer of a department', async ({ page }) => {
  const name = uniqueName('Бойко');
  await signIn(page, ADMIN);
  await chooseSetting(page, 'Інженери');
  await expect(page.getByRole('heading', { name: 'Інженери' })).toBeVisible();

  await page.getByLabel('Управління').selectOption({ label: 'Ренійське' });
  await page.getByRole('button', { name: 'Додати інженера' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новий інженер' });
  await expect(dialog.getByLabel('Управління')).toHaveValue('RENI');
  await dialog.getByLabel('ПІБ').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByText(`Інженера «${name}» додано`)).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Ренійське');

  // The same name again in the same department is refused next to the field.
  await page.getByRole('button', { name: 'Додати інженера' }).click();
  await dialog.getByLabel('ПІБ').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog.getByText('Інженер з таким ПІБ в управлінні вже є')).toBeVisible();
  await dialog.getByRole('button', { name: 'Скасувати' }).click();

  await row.getByRole('button', { name: 'Редагувати' }).click();
  const edit = page.getByRole('dialog', { name: `Редагування: ${name}` });
  await expect(edit.getByLabel('Управління')).toHaveCount(0);
  await edit.getByLabel('ПІБ').fill(`${name} Петрович`);
  await edit.getByRole('button', { name: 'Зберегти' }).click();
  const renamed = page.getByRole('row').filter({ hasText: `${name} Петрович` });
  await expect(renamed).toBeVisible();

  await renamed.getByRole('button', { name: 'Деактивувати' }).click();
  await page
    .getByRole('dialog', { name: /^Деактивувати інженера/ })
    .getByRole('button', { name: 'Деактивувати' })
    .click();
  await expect(renamed).toContainText('Неактивний');
  await expect(renamed.getByRole('button', { name: 'Активувати' })).toBeVisible();
});
