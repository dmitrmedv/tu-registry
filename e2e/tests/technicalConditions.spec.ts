import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import {
  addModule,
  apiLogin,
  createApplication,
  kyivTodayText,
  signIn,
  uniqueName,
} from '../support/api';

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
  /** The stage as the server derives it (the card's title no longer shows it). */
  const stage = async () =>
    (
      (await (
        await page.request.get(`/api/v1/applications/${id}`, {
          headers: await apiLogin(page.request, ADMIN),
        })
      ).json()) as { stage: string }
    ).stage;
  // Answered, and the documents asked for came: processing goes on.
  expect(await stage()).toBe('IN_PROGRESS');

  await expect(page.getByRole('tab', { name: 'ТУ' })).toHaveCount(0);
  const section = page.getByRole('tabpanel', { name: 'ТУ' });
  /** `open` opens the form: «Додати модуль» for the first set, ＋ in the tab after that. */
  const addTu = async (tuNumber: string, gasFlow: string, open: () => Promise<void>) => {
    await open();
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

  await addTu('0032/ТУ', '12,5', () => addModule(page, 'Технічні умови'));
  // The card's title shows no stage (the registry does).
  await expect(title).not.toContainText('ТУ підготовлені');
  await expect.poll(stage).toBe('TU_PREPARED');
  const first = section.getByRole('region', { name: /^Технічні умови № 0032\/ТУ/ });
  await expect(first).toContainText('Нестандартне (збільшення потужності)');
  await expect(first).toContainText('Витрати газу12,5 м³/год');
  // The customer and address of the conditions: from the application unless changed.
  await expect(first).toContainText('Адреса за ТУм. Київ, вул. Тестова, 1');
  // One valid set: no second «Додати ТУ» until this one is cancelled; no module left to add.
  await expect(section.getByRole('button', { name: 'Додати ТУ' })).toHaveCount(0);
  // Both modules are there: the dialog lists them, neither can be added again.
  await page.getByRole('button', { name: 'Додати модуль' }).click();
  const modules = page.getByRole('dialog', { name: 'Додати модуль' }).getByRole('list');
  await expect(modules.getByRole('button')).toHaveCount(2);
  for (const choice of await modules.getByRole('button').all()) await expect(choice).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The response stays in its tab, with its documents.
  await page.getByRole('tab', { name: 'Відповідь' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Відповідь' })).toContainText(
    `Документи надійшли${kyivTodayText()}`,
  );
  await page.getByRole('tab', { name: 'ТУ' }).click();

  await section.getByRole('button', { name: 'Скасувати' }).click();
  const cancel = page.getByRole('dialog', { name: 'Скасувати технічні умови № 0032/ТУ?' });
  await cancel.getByLabel('Причина скасування').fill('Помилка в розрахунку');
  await cancel.getByRole('button', { name: 'Скасувати документ' }).click();
  await expect(section).toContainText('Чинних технічних умов немає: усі скасовано.');
  await expect.poll(stage).toBe('IN_PROGRESS');

  await addTu('0033/ТУ', '13', () => section.getByRole('button', { name: 'Додати ТУ' }).click());
  await expect(section.getByRole('region', { name: /^Технічні умови № 0033\/ТУ/ })).toBeVisible();
  await section.getByText('Скасовані технічні умови (1)').click();
  await expect(section.getByRole('listitem', { name: /0032\/ТУ/ })).toContainText('Скасовано');

  // Saved conditions are edited on their own page; the scan is sent only with «Зберегти».
  await section.getByRole('link', { name: 'Редагувати' }).click();
  await expect(page.getByRole('heading', { name: /Редагування ТУ № 0033\/ТУ/ })).toBeVisible();
  await page.getByLabel('Витрати газу, м³/год').fill('14,5');
  await page.getByLabel('PDF-файл скану').setInputFiles({
    name: 'ТУ 0033.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% ТУ\n%%EOF\n'),
  });
  await expect(page.getByText('Файл буде додано після збереження.')).toBeVisible();
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Технічні умови № 0033/ТУ збережено')).toBeVisible();
  const valid = section.getByRole('region', { name: /^Технічні умови № 0033\/ТУ/ });
  await expect(valid).toContainText('Витрати газу14,5 м³/год');
  await expect(section.getByRole('button', { name: 'Відкрити скан' })).toBeVisible();

  // The timeline: registration, response, documents, the cancelled TU and the valid one.
  const history = page.getByRole('region', { name: 'Історія опрацювання' });
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
