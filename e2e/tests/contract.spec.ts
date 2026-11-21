import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { addModule, apiLogin, createApplication, signIn, uniqueName } from '../support/api';

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
// A .docx is a ZIP archive; the server checks its signature.
const docx = (text: string) =>
  Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from(text)]);

test('a contract after the TU: numbered by the department, signed later, annulled', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: uniqueName('Інженер договору'), department: 'ODESA' },
    })
  ).json()) as { id: string };
  const { id } = await createApplication(page.request, headers, { department: 'ODESA' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  const customer = uniqueName('Франко Іван');
  await page.request.post(`/api/v1/applications/${id}/technical-conditions`, {
    headers,
    data: {
      tuNumber: '0078/ТУ',
      preparedDate: today,
      engineer: engineer.id,
      gasFlow: 3,
      connectionType: 'RECONSTRUCTION',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
      customer,
      address: 'м. Одеса, вул. Лесі Українки, 34',
    },
  });
  await signIn(page, ADMIN, `/applications/${id}`);

  // The page starts from the TU and the department's next number, «Р» for a reconstruction.
  await addModule(page, 'Договір');
  await expect(page.getByRole('heading', { name: 'Договір на реконструкцію' })).toBeVisible();
  const number = page.getByLabel('№ договору');
  await expect(number).toHaveValue(/^\d+-\d+-Р$/);
  const contractNumber = await number.inputValue();
  await expect(page.getByLabel('Дата договору')).toHaveValue(today);
  await expect(page.getByLabel('Замовник', { exact: true })).toHaveValue(customer);
  await page.getByLabel('Файл DOCX').setInputFiles({
    name: 'Договір.docx',
    mimeType: 'application/octet-stream',
    buffer: docx('д'),
  });
  await page.getByRole('button', { name: 'Додати договір' }).click();

  await expect(page.getByText(`Договір № ${contractNumber} додано`)).toBeVisible();
  const frame = page.getByRole('region', { name: `Договір № ${contractNumber}` });
  await expect(frame).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Завантажити документ договору' })).toBeVisible();

  // Signed later: the date, the representative and the scan.
  await frame.getByRole('link', { name: 'Редагувати' }).click();
  await page.getByLabel('Дата укладання договору').fill(today);
  await page.getByLabel('Представник замовника').fill('Франко Тарас');
  await page
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'Підписаний.pdf', mimeType: 'application/pdf', buffer: pdf('скан') });
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText(`Договір № ${contractNumber} збережено`)).toBeVisible();
  await expect(frame).toContainText('Франко Тарас');
  await expect(frame.getByRole('button', { name: 'Відкрити скан' })).toBeVisible();

  // Annulled, it stays in the card and keeps its number: the next contract follows it.
  await frame.getByRole('button', { name: 'Анулювати' }).click();
  const dialog = page.getByRole('dialog', { name: `Анулювати договір № ${contractNumber}?` });
  await dialog.getByLabel('Причина скасування').fill('Помилка в даних');
  await dialog.getByRole('button', { name: 'Анулювати договір' }).click();
  await expect(frame.getByText('Анульовано')).toBeVisible();
  await page.getByRole('link', { name: 'Додати договір' }).click();
  const [sequence, code] = contractNumber.split('-');
  await expect(page.getByLabel('№ договору')).toHaveValue(`${Number(sequence) + 1}-${code}-Р`);
});
