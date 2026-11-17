import { readFile } from 'node:fs/promises';
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

const PDF = Buffer.from('%PDF-1.4\n% E2E response\n%%EOF\n');

test('responses: added with a scan, another to its right, cancelled, deleted; the journal links back', async ({
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

  // No response yet: no tab, the module is added through «Додати модуль».
  await expect(page.getByRole('tab', { name: 'Заява' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Відповідь' })).toHaveCount(0);
  await addModule(page, 'Відповідь');
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

  // Its tab opens; the engineer is shown by surname and initials, the full name on hover.
  await expect(page.getByRole('tab', { name: 'Відповідь' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const section = page.getByRole('tabpanel', { name: 'Відповідь' });
  const item = section.getByRole('article', { name: /^Відповідь № 125\/01-15/ });
  await expect(item.getByTitle(engineerName)).toBeVisible();
  await expect(item).toContainText(`Дата реєстрації${kyivTodayText()}`);
  // The scan opens in a new tab (the headless shell turns it into a download, a real Chrome
  // shows it): either way the tab gets the PDF.
  const [pdfTab] = await Promise.all([
    context.waitForEvent('page'),
    section.getByRole('button', { name: 'Відкрити скан' }).click(),
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

  // Another response with ＋: in its own frame, to the right of the first.
  await section.getByRole('button', { name: 'Додати відповідь' }).click();
  const next = page.getByRole('dialog', { name: 'Нова відповідь' });
  await next.getByLabel('Номер вихідного').fill('140/01-15');
  await next.getByLabel('Інженер').selectOption({ label: engineerName });
  await next.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByText('Відповідь № 140/01-15 додано')).toBeVisible();
  const second = section.getByRole('article', { name: /^Відповідь № 140\/01-15/ });
  await expect(second).toBeVisible();
  await expect(section.getByRole('button', { name: 'Документи надійшли' })).toHaveCount(0);
  const [left, right] = [await item.boundingBox(), await second.boundingBox()];
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(1);

  await item.getByRole('button', { name: 'Скасувати' }).click();
  const cancel = page.getByRole('dialog', { name: 'Скасувати відповідь № 125/01-15?' });
  await cancel.getByLabel('Причина скасування').fill('Внесено помилково');
  await cancel.getByRole('button', { name: 'Скасувати документ' }).click();
  // The cancelled response keeps its frame and place, muted, with the reason.
  await expect(item).toContainText('Скасовано');
  await expect(item).toContainText('Внесено помилково');
  await item.getByRole('button', { name: 'Відновити' }).click();
  await expect(item).not.toContainText('Скасовано');
  await expect(item.getByRole('button', { name: 'Редагувати' })).toBeVisible();

  // An admin deletes the second one for good, after confirming.
  await second.getByRole('button', { name: 'Видалити' }).click();
  await page
    .getByRole('dialog', { name: 'Видалити відповідь № 140/01-15?' })
    .getByRole('button', { name: 'Видалити' })
    .click();
  await expect(page.getByText('Відповідь № 140/01-15 видалено')).toBeVisible();
  await expect(second).toHaveCount(0);
  await expect(section.getByRole('article')).toHaveCount(1);

  await page.goto('/audit');
  const link = page
    .getByRole('link', { name: `Відповідь 125/01-15 до заяви ${regNumber}` })
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('heading', { name: `Заява ${regNumber}` })).toBeVisible();
});
