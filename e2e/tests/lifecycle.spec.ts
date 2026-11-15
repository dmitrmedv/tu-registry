import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, chooseSetting, createApplication, uniqueName } from '../support/api';

test('edits, annuls and restores an application; the journal records it', async ({ page }) => {
  // Prepared through the API (registration has its own test); the page shares the session.
  const headers = await apiLogin(page.request, ADMIN);
  const app = await createApplication(page.request, headers, {
    customer: uniqueName('ТОВ Життєвий цикл'),
    settlement: 'м. Львів',
    objectAddress: 'вул. Тестова, 2',
    objectType: 'NON_DOMESTIC',
  });

  await page.goto(`/applications/${app.id}`);
  await expect(page.getByRole('heading', { name: `Заява ${app.regNumber}` })).toBeVisible();

  await page.getByRole('link', { name: 'Редагувати' }).click();
  await page.getByLabel('Телефон').fill('050 111 22 33');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Зміни збережено')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Історія змін' })).toContainText(
    'Телефон: +380 67 123 45 67 → +380 50 111 22 33',
  );

  await page.getByRole('button', { name: 'Анулювати' }).click();
  const annul = page.getByRole('dialog', { name: `Анулювати заяву ${app.regNumber}?` });
  await annul.getByLabel('Причина анулювання').fill('Подано помилково');
  await annul.getByRole('button', { name: 'Анулювати' }).click();
  await expect(page.getByText('Подано помилково')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Редагувати' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Відновити' }).click();
  await page
    .getByRole('dialog', { name: `Відновити заяву ${app.regNumber}?` })
    .getByRole('button', { name: 'Відновити' })
    .click();
  await expect(page.getByRole('link', { name: 'Редагувати' })).toBeVisible();

  await chooseSetting(page, 'Журнал');
  const entries = page
    .getByRole('table', { name: 'Журнал аудиту' })
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: `Заява ${app.regNumber}` }) });
  await expect(entries.filter({ hasText: 'Анульовано заяву' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'Відновлено заяву' })).toHaveCount(1);
});

test('an administrator deletes an application for good; the journal keeps its number', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const app = await createApplication(page.request, headers);

  await page.goto(`/applications/${app.id}`);
  await page.getByRole('button', { name: 'Видалити' }).click();
  const dialog = page.getByRole('dialog', { name: `Видалити заяву ${app.regNumber}?` });
  const confirm = dialog.getByRole('button', { name: 'Видалити назавжди' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(`Введіть номер ${app.regNumber} для підтвердження`).fill(app.regNumber);
  await confirm.click();

  await expect(page.getByText(`Заяву ${app.regNumber} видалено`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Реєстр заяв' })).toBeVisible();
  await expect(page.getByRole('link', { name: app.regNumber, exact: true })).toHaveCount(0);

  await page.goto(`/applications/${app.id}`);
  await expect(page.getByRole('heading', { name: 'Заяву не знайдено' })).toBeVisible();

  await page.goto('/audit?action=APPLICATION_DELETED');
  await expect(
    page.getByRole('table', { name: 'Журнал аудиту' }).getByRole('row', {
      name: new RegExp(`Заява ${app.regNumber}`),
    }),
  ).toHaveCount(1);
});
