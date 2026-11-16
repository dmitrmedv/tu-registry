import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication } from '../support/api';

test('filters and the result bar stay under the header; paging starts from the top', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const headers = await apiLogin(page.request, ADMIN);
  for (let i = 0; i < 25; i++) await createApplication(page.request, headers);

  await page.goto('/');
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  await table.getByRole('row').last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  // Right under the header, not scrolled away and not hidden behind it.
  const header = await page.getByRole('banner').boundingBox();
  const filters = await page.getByRole('region', { name: 'Фільтри' }).boundingBox();
  expect(filters!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(filters!.y).toBeLessThan(header!.y + header!.height + 20);
  await expect(page.getByRole('status').filter({ hasText: /^Знайдено: \d+$/ })).toBeInViewport();

  await page.getByRole('button', { name: 'Наступна ›' }).click();
  await expect(page.getByText(/^Сторінка 2 з \d+$/)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('sorts by any column in Ukrainian alphabetical order', async ({ page }) => {
  const headers = await apiLogin(page.request, ADMIN);
  const tag = `сорт-${Date.now().toString(36)}`;
  for (const name of ['Їжак', 'Аргон', 'Ґудзик']) {
    await createApplication(page.request, headers, { customer: `${name} ${tag}` });
  }

  await page.goto(`/?q=${encodeURIComponent(tag)}`);
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  // Rows by position; the customer is found by text (columns differ for admins and users).
  const row = (n: number) => table.getByRole('row').nth(n);

  await table.getByRole('button', { name: /^Замовник/ }).click();
  await expect(row(1)).toContainText(`Аргон ${tag}`);
  await table.getByRole('button', { name: /^Замовник/ }).click();
  await expect(row(1)).toContainText(`Їжак ${tag}`);
  await expect(row(2)).toContainText(`Ґудзик ${tag}`);
});
