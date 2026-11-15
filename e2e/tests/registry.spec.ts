import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication } from '../support/api';

test('the filters stay under the header while the list scrolls to its end', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const headers = await apiLogin(page.request, ADMIN);
  for (let i = 0; i < 25; i++) await createApplication(page.request, headers);

  await page.goto('/?limit=50');
  const filters = page.getByRole('region', { name: 'Фільтри' });
  await expect(page.getByRole('table', { name: 'Реєстр заяв' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Рядків на сторінці' }).scrollIntoViewIfNeeded();

  const header = await page.getByRole('banner').boundingBox();
  const box = await filters.boundingBox();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  // Right under the header, not scrolled away and not hidden behind it.
  expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(box!.y).toBeLessThan(header!.y + header!.height + 20);
  await expect(filters.getByLabel('Замовник')).toBeInViewport();
});
