import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

const PDF = Buffer.from('%PDF-1.4\n% E2E response\n%%EOF\n');

test('responses: added with a scan, documents received, cancelled; the journal links back', async ({
  page,
  context,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineerName = uniqueName('Інженер');
  const engineer = await page.request.post('/api/v1/engineers', {
    headers,
    data: { fullName: engineerName, department: 'ODESA' },
  });
  expect(engineer.ok(), await engineer.text()).toBe(true);
  const { id, regNumber } = await createApplication(page.request, headers, { department: 'ODESA' });
  await signIn(page, ADMIN, `/applications/${id}`);

  const section = page.getByRole('region', { name: 'Відповіді' });
  await expect(section.getByText('Відповідей на заяву не надавали.')).toBeVisible();
  await section.getByRole('button', { name: 'Додати відповідь' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нова відповідь' });
  await dialog.getByLabel('Номер вихідного').fill('125/01-15');
  await dialog.getByLabel('Інженер').selectOption({ label: engineerName });
  await dialog.getByLabel('PDF-файл скану').setInputFiles({
    name: 'Відповідь.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByText('Відповідь № 125/01-15 додано')).toBeVisible();

  // Registered and answered today: no working day has passed yet.
  const item = section.getByRole('listitem', { name: /^Відповідь № 125\/01-15/ });
  await expect(item).toContainText(`Інженер: ${engineerName}`);
  await expect(item).toContainText('0 робочих днів з 5');
  // The scan opens in a new tab (the headless shell turns it into a download, a real Chrome
  // shows it): either way the tab gets the PDF.
  const [pdfTab] = await Promise.all([
    context.waitForEvent('page'),
    item.getByRole('button', { name: 'Переглянути скан' }).click(),
  ]);
  const head = await Promise.race([
    pdfTab
      .waitForEvent('download')
      .then(async (download) =>
        (await readFile((await download.path())!)).subarray(0, 5).toString('latin1'),
      ),
    expect
      .poll(() => pdfTab.url())
      .toMatch(/^blob:/)
      .then(() => '%PDF-'),
  ]);
  expect(head).toBe('%PDF-');
  await pdfTab.close();

  await item.getByRole('button', { name: 'Документи надійшли' }).click();
  await page
    .getByRole('dialog', { name: 'Документи надійшли' })
    .getByRole('button', { name: 'Зберегти' })
    .click();
  await expect(item).toContainText('Документи надійшли');

  await item.getByRole('button', { name: 'Скасувати' }).click();
  const cancel = page.getByRole('dialog', { name: 'Скасувати відповідь № 125/01-15?' });
  await cancel.getByLabel('Причина скасування').fill('Внесено помилково');
  await cancel.getByRole('button', { name: 'Скасувати документ' }).click();
  await expect(item).toContainText('Скасовано');
  await expect(item).toContainText('Внесено помилково');
  await item.getByRole('button', { name: 'Відновити' }).click();
  await expect(item).not.toContainText('Скасовано');

  await page.goto('/audit');
  const link = page
    .getByRole('link', { name: `Відповідь 125/01-15 до заяви ${regNumber}` })
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('heading', { name: `Заява ${regNumber}` })).toBeVisible();
});
