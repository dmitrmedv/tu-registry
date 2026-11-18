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

test('widens a column by dragging its border and keeps the width after a reload', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const tag = `ширина-${Date.now().toString(36)}`;
  await createApplication(page.request, headers, { customer: `ТОВ ${tag}` });

  await page.goto(`/?q=${encodeURIComponent(tag)}`);
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  const header = table.getByRole('columnheader', { name: /^Замовник/ });
  const handle = table.getByRole('separator', { name: 'Ширина колонки «Замовник»' });
  await expect(table.getByRole('row')).toHaveCount(2);
  const before = (await header.boundingBox())!.width;

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await header.boundingBox())!.width).toBeCloseTo(before + 120, 0);
  // Dragging the border does not sort.
  await expect(header).toHaveAttribute('aria-sort', 'none');

  await page.reload();
  await expect(table.getByRole('row')).toHaveCount(2);
  expect((await header.boundingBox())!.width).toBeCloseTo(before + 120, 0);

  await handle.dblclick();
  await expect.poll(async () => (await header.boundingBox())!.width).toBeCloseTo(before, 0);
});

test('moves a column by dragging its header onto another and keeps the order', async ({ page }) => {
  const headers = await apiLogin(page.request, ADMIN);
  const tag = `порядок-${Date.now().toString(36)}`;
  await createApplication(page.request, headers, { customer: `ТОВ ${tag}` });

  await page.goto(`/?q=${encodeURIComponent(tag)}`);
  const table = page.getByRole('table', { name: 'Реєстр заяв' });
  await expect(table.getByRole('row')).toHaveCount(2);
  const titles = () =>
    table
      .getByRole('columnheader')
      .evaluateAll((ths) =>
        ths.map((th) => th.querySelector('button')?.firstChild?.textContent ?? ''),
      );
  const before = await titles();
  const customer = before.indexOf('Замовник');
  const address = before.indexOf('Адреса');
  expect(customer).toBeLessThan(address);

  await table
    .getByRole('columnheader', { name: /^Замовник/ })
    .dragTo(table.getByRole('columnheader', { name: /^Адреса/ }));

  // Moving right puts the column after the target; the cells follow.
  const after = await titles();
  expect(after.indexOf('Замовник')).toBe(address);
  expect(after.indexOf('Адреса')).toBe(address - 1);
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(address)).toHaveText(
    `ТОВ ${tag}`,
  );

  await page.reload();
  await expect(table.getByRole('row')).toHaveCount(2);
  expect(await titles()).toEqual(after);
});
