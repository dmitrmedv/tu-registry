import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
// A .docx is a ZIP archive; the server checks its signature.
const docx = (text: string) =>
  Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from(text)]);

test('enters the payment for technical conditions over time; an admin deletes it', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: uniqueName('Інженер оплати'), department: 'ODESA' },
    })
  ).json()) as { id: string };
  const { id } = await createApplication(page.request, headers, { department: 'ODESA' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  await page.request.post(`/api/v1/applications/${id}/technical-conditions`, {
    headers,
    data: {
      tuNumber: '0077/ТУ',
      preparedDate: today,
      engineer: engineer.id,
      gasFlow: 3,
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    },
  });
  await signIn(page, ADMIN, `/applications/${id}?tab=tu`);
  const payment = page.getByRole('region', { name: 'Оплата за технічні умови' });

  // The invoice first.
  await payment.getByRole('button', { name: 'Додати рахунок' }).click();
  let dialog = page.getByRole('dialog', { name: 'Інформація про рахунок' });
  await dialog.getByLabel('№ рахунку').fill('125/Б');
  await dialog.getByLabel('Сума, грн').fill('1 234,56');
  // The contract: its number is offered at once, kept with its date and the Word document.
  const contractNumber = dialog.getByLabel('№ договору');
  await expect(contractNumber).toHaveValue(/^\d+$/);
  const offered = await contractNumber.inputValue();
  await dialog.getByLabel('Дата договору').fill(today);
  await dialog
    .getByRole('region', { name: 'Договір (DOCX)' })
    .getByLabel('Файл DOCX')
    .setInputFiles({
      name: 'Договір.docx',
      mimeType: 'application/octet-stream',
      buffer: docx('д'),
    });
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Рахунок № 125/Б збережено')).toBeVisible();
  await expect(payment.getByText(/^1\s234,56 грн$/)).toBeVisible();
  await expect(payment.getByText(new RegExp(`^№ ${offered} від `))).toBeVisible();
  await expect(payment.getByRole('button', { name: 'Завантажити договір (DOCX)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Рахунок за ТУ № 125\/Б/ })).toBeVisible();

  // Then the payment with its receipt, and the act handed to accounting.
  await payment.getByRole('button', { name: 'Редагувати оплату' }).click();
  dialog = page.getByRole('dialog', { name: 'Рахунок № 125/Б' });
  await dialog.getByLabel('Дата оплати').fill(today);
  await dialog
    .getByRole('region', { name: 'Скан квитанції' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'квитанція.pdf', mimeType: 'application/pdf', buffer: pdf('к') });
  await dialog.getByLabel('Місяць здачі акта').fill(today.slice(0, 7));
  await dialog
    .getByRole('region', { name: 'Скан акта' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'акт.pdf', mimeType: 'application/pdf', buffer: pdf('а') });
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  await expect(payment.getByText(new RegExp(`^[а-яіїєґ]+ ${today.slice(0, 4)}$`))).toBeVisible();
  await expect(payment.getByRole('button', { name: 'Переглянути скан квитанції' })).toBeVisible();
  await expect(payment.getByRole('button', { name: 'Переглянути скан акта' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Акт передано в бухгалтерію/ })).toBeVisible();

  // Gone for good, after confirming.
  await payment.getByRole('button', { name: 'Видалити оплату' }).click();
  await page
    .getByRole('dialog', { name: 'Видалити оплату?' })
    .getByRole('button', { name: 'Видалити' })
    .click();
  await expect(payment.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Рахунок за ТУ/ })).toHaveCount(0);
});
