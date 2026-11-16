import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { chooseSetting, signIn } from '../support/api';

// A far year, so no other test's dates share it in the common database.
const YEAR = 2091;
const HOLIDAY = `${YEAR}-03-14`; // Wednesday
const SATURDAY = `${YEAR}-03-17`;

test('an admin adds a day off and a working Saturday, edits and deletes them', async ({ page }) => {
  await signIn(page, ADMIN);
  await chooseSetting(page, 'Календар');
  await expect(page.getByRole('heading', { name: 'Календар робочих днів' })).toBeVisible();

  const addDay = async (date: string, description: string) => {
    await page.getByRole('button', { name: 'Додати день' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новий день у календарі' });
    await dialog.getByLabel('Дата').fill(date);
    await dialog.getByLabel('Опис').fill(description);
    await dialog.getByRole('button', { name: 'Додати' }).click();
  };

  await addDay(HOLIDAY, 'Додатковий вихідний');
  await expect(page.getByText(`День 14.03.${YEAR}, ср додано`)).toBeVisible();
  // A date of another year switches the page to that year.
  await expect(page).toHaveURL(new RegExp(`year=${YEAR}`));
  await addDay(SATURDAY, 'Відпрацювання');

  const table = page.getByRole('table', { name: 'Календар робочих днів' });
  await expect(table.getByRole('row').nth(1)).toContainText(`14.03.${YEAR}, ср`);
  await expect(table.getByRole('row').nth(1)).toContainText('Неробочий');
  await expect(table.getByRole('row').nth(2)).toContainText(`17.03.${YEAR}, сб`);
  await expect(table.getByRole('row').nth(2)).toContainText('Робочий');

  await table.getByRole('button', { name: `Редагувати: 14.03.${YEAR}` }).click();
  const edit = page.getByRole('dialog', { name: `Редагування: 14.03.${YEAR}` });
  await edit.getByLabel('Опис').fill('День памʼяті');
  await edit.getByRole('button', { name: 'Зберегти' }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('День памʼяті');

  await table.getByRole('button', { name: `Видалити: 17.03.${YEAR}` }).click();
  await page
    .getByRole('dialog', { name: /^Видалити 17\.03/ })
    .getByRole('button', { name: 'Видалити' })
    .click();
  await expect(page.getByText(`День 17.03.${YEAR}, сб видалено з календаря`)).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);

  // The journal keeps every change.
  await chooseSetting(page, 'Журнал');
  await expect(page.getByRole('cell', { name: 'Видалено день з календаря' }).first()).toBeVisible();
});
