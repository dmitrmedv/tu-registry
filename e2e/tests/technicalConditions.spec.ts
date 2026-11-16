import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

test('technical conditions after a response: one valid set, replaced only after cancelling', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineerName = uniqueName('Інженер ТУ');
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: engineerName, department: 'ODESA' },
    })
  ).json()) as { id: string };
  const { id, regNumber } = await createApplication(page.request, headers, {
    department: 'ODESA',
  });
  // A response first, and the documents it asked for came the same day.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  const response = (await (
    await page.request.post(`/api/v1/applications/${id}/responses`, {
      headers,
      data: { outgoingNumber: '125/01-15', responseDate: today, engineer: engineer.id },
    })
  ).json()) as { id: string };
  await page.request.patch(`/api/v1/applications/${id}/responses/${response.id}`, {
    headers,
    data: { version: 1, documentsReceivedAt: today },
  });
  await signIn(page, ADMIN, `/applications/${id}`);
  const title = page.getByRole('heading', { level: 1 }).locator('..');
  // Answered, and the documents asked for came: processing goes on.
  await expect(title).toContainText('На опрацюванні');

  const section = page.getByRole('region', { name: 'Технічні умови' });
  await expect(section.getByText('Технічні умови ще не підготовлено.')).toBeVisible();
  const addTu = async (tuNumber: string, gasFlow: string) => {
    await section.getByRole('button', { name: 'Додати ТУ' }).click();
    const dialog = page.getByRole('dialog', { name: 'Нові технічні умови' });
    await dialog.getByLabel('Реєстраційний номер ТУ').fill(tuNumber);
    await dialog.getByLabel('Інженер, який розробив ТУ').selectOption({ label: engineerName });
    await dialog.getByLabel('Витрати газу, м³/год').fill(gasFlow);
    await dialog.getByRole('radio', { name: 'Нестандартне (збільшення потужності)' }).check();
    await dialog.getByRole('radio', { name: 'Середній' }).check();
    await dialog.getByRole('radio', { name: 'Надземний газопровід' }).check();
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(page.getByText(`Технічні умови № ${tuNumber} додано`)).toBeVisible();
  };

  await addTu('0032/ТУ', '12,5');
  await expect(title).toContainText('ТУ підготовлені');
  const first = section.getByRole('listitem', { name: /^Технічні умови № 0032\/ТУ/ });
  await expect(first).toContainText('12,5 м³/год');
  await expect(first).toContainText('Нестандартне (збільшення потужності)');
  await expect(first).toContainText('0 робочих днів з 10');
  // The response stays, with its documents.
  await expect(page.getByRole('region', { name: 'Відповіді' })).toContainText('Документи надійшли');
  // One valid set: no second «Додати ТУ» until this one is cancelled.
  await expect(section.getByRole('button', { name: 'Додати ТУ' })).toHaveCount(0);

  await first.getByRole('button', { name: 'Скасувати' }).click();
  const cancel = page.getByRole('dialog', { name: 'Скасувати технічні умови № 0032/ТУ?' });
  await cancel.getByLabel('Причина скасування').fill('Помилка в розрахунку');
  await cancel.getByRole('button', { name: 'Скасувати документ' }).click();
  await expect(first).toContainText('Скасовано');
  await expect(title).toContainText('На опрацюванні');

  await addTu('0033/ТУ', '13');
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await expect(section.getByRole('listitem').first()).toContainText('0033/ТУ');

  // The timeline: registration, response, documents, the cancelled TU and the valid one.
  const history = page.getByRole('region', { name: 'Історія опрацювання' });
  await expect(history.getByRole('list', { name: 'Строки опрацювання' })).toContainText(
    'Технічні умови: 0 робочих днів з 10',
  );
  const events = history.getByRole('listitem', { name: /, \d\d\.\d\d\.\d{4}$/ });
  await expect(events).toHaveCount(5);
  await expect(events.nth(0)).toContainText(`Заява № ${regNumber}`);
  await expect(events.nth(1)).toContainText('Відповідь № 125/01-15');
  await expect(events.nth(2)).toContainText('Документи надійшли');
  await expect(events.nth(3)).toContainText('скасовано');
  await expect(events.nth(4)).toContainText('Технічні умови № 0033/ТУ');

  await page.goto('/audit');
  await expect(
    page.getByRole('link', { name: `ТУ 0033/ТУ до заяви ${regNumber}` }).first(),
  ).toBeVisible();
});
