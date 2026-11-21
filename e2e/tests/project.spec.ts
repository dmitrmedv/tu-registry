import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

test('adds a project, then its estimate, and recalculates the estimate without the project', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineerName = uniqueName('Інженер проєкту');
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: engineerName, department: 'ODESA' },
    })
  ).json()) as { id: string };
  const { id } = await createApplication(page.request, headers, { department: 'ODESA' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  await page.request.post(`/api/v1/applications/${id}/technical-conditions`, {
    headers,
    data: {
      tuNumber: '0088/ТУ',
      preparedDate: today,
      engineer: engineer.id,
      gasFlow: 3,
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    },
  });
  await signIn(page, ADMIN, `/applications/${id}`);

  await page.getByRole('button', { name: 'Додати модуль' }).click();
  await page
    .getByRole('dialog', { name: 'Додати модуль' })
    .getByRole('button', { name: 'Проєкт' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Новий проєкт' });
  // The engineer of the technical conditions by default.
  await expect(dialog.getByLabel('Виконавець')).toHaveValue(engineer.id);
  await dialog.getByLabel('№ узгодження').fill('125/П');
  await dialog
    .getByRole('region', { name: 'Скан проєкту' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'Проєкт.pdf', mimeType: 'application/pdf', buffer: pdf('п') });
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();

  const tab = page.getByRole('tabpanel', { name: 'Проєкт' });
  const frame = tab.getByRole('region', { name: /^Проєкт № 125\/П від / });
  await expect(frame).toContainText(`Виконавець`);
  await expect(frame.getByRole('button', { name: 'Відкрити скан', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Проєкт № 125\/П/ })).toBeVisible();
  // One valid project: no second one until it is cancelled.
  await expect(frame.getByRole('button', { name: 'Додати проєкт' })).toHaveCount(0);

  // The estimate is a document of its own, beside the project (2026-11-21).
  const estimate = tab.getByRole('region', { name: /^Кошторис до проєкту № 125\/П/ });
  await estimate.getByRole('button', { name: 'Додати кошторис' }).click();
  const estimateDialog = page.getByRole('dialog', { name: 'Новий кошторис' });
  await estimateDialog.getByLabel('Дата перевірки кошторису').fill(today);
  await estimateDialog.getByLabel('Сума кошторису, грн').fill('125000,50');
  await estimateDialog
    .getByRole('region', { name: 'Скан кошторису' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'Кошторис.pdf', mimeType: 'application/pdf', buffer: pdf('к') });
  await estimateDialog
    .getByRole('region', { name: 'Файл перевірки (IMD)' })
    .getByLabel('Файл IMD')
    .setInputFiles({
      name: 'Перевірка.imd',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('IMD'),
    });
  await estimateDialog.getByRole('button', { name: 'Додати' }).click();
  await expect(estimateDialog).toBeHidden();
  await expect(estimate).toContainText(/125\s000,50 грн/);
  await expect(estimate.getByRole('button', { name: 'Переглянути скан кошторису' })).toBeVisible();
  const download = page.waitForEvent('download');
  await estimate
    .getByRole('button', { name: 'Завантажити файл перевірки кошторису (.imd)' })
    .click();
  expect((await download).suggestedFilename()).toBe('Перевірка.imd');

  // The customer paid late: the estimate is recalculated, the project stays as approved.
  await estimate.getByRole('button', { name: 'Перерахувати кошторис' }).click();
  const recalculation = page.getByRole('dialog', { name: 'Перерахований кошторис' });
  await recalculation.getByLabel('Сума кошторису, грн').fill('131000');
  await recalculation.getByRole('button', { name: 'Додати' }).click();
  await expect(recalculation).toBeHidden();
  await expect(estimate).toContainText(/131\s000,00 грн/);
  await expect(estimate).not.toContainText('Перераховано');
  await estimate.getByRole('button', { name: 'Попередній кошторис' }).click();
  await expect(estimate).toContainText('Перераховано');
  await expect(estimate).toContainText(/125\s000,50 грн/);
  await expect(
    estimate.getByRole('button', { name: 'Завантажити файл перевірки кошторису (.imd)' }),
  ).toBeVisible();
  await expect(estimate.getByRole('button', { name: 'Редагувати кошторис' })).toHaveCount(0);
  await expect(frame.getByRole('button', { name: 'Редагувати' })).toBeVisible();
});
