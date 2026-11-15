import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, uniqueName } from '../support/api';

test.use({ viewport: { width: 375, height: 812 } });

/** Wide tables may scroll inside their own container, but never the whole page. */
async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('every page fits a 375 px phone screen', async ({ page }, testInfo) => {
  const headers = await apiLogin(page.request, ADMIN);
  const response = await page.request.post('/api/v1/applications', {
    headers,
    data: {
      customer: uniqueName('ТОВ «Дуже довга назва замовника для перевірки переносу»'),
      phone: '+380671234567',
      email: 'very.long.email.address.for.wrapping@example.com.ua',
      objectAddress: 'Київська обл., Броварський р-н, с. Велика Димерка, вул. Центральна, 125',
      objectType: 'DOMESTIC',
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { id } = (await response.json()) as { id: string };

  const pages: [string, string][] = [
    ['/', 'Реєстр заяв'],
    ['/applications/new', 'Нова заява'],
    [`/applications/${id}`, 'Заява'],
    [`/applications/${id}/edit`, 'Редагування'],
    ['/users', 'Користувачі'],
    ['/audit', 'Журнал'],
    ['/change-password', 'Зміна пароля'],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    // Measure the loaded content, not the spinner (every spinner announces itself).
    await expect(
      page.getByRole('status').filter({ hasText: /Завантаження|Визначення/ }),
    ).toHaveCount(0);
    await testInfo.attach(path, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await expectNoPageScroll(page);
  }
});
