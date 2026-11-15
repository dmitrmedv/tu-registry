import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, uniqueName } from '../support/api';

test('a dialog is usable from the keyboard and returns focus when closed', async ({ page }) => {
  const headers = await apiLogin(page.request, ADMIN);
  const app = await createApplication(page.request, headers, {
    customer: uniqueName('ТОВ Клавіатура'),
    objectAddress: 'м. Київ, вул. Тестова, 3',
  });

  await page.goto(`/applications/${app.id}`);
  const annulButton = page.getByRole('button', { name: 'Анулювати' });
  await annulButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: `Анулювати заяву ${app.regNumber}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Причина анулювання')).toBeFocused();

  // Submitting without a reason keeps the dialog open and explains why.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Скасувати' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('Вкажіть причину анулювання')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(annulButton).toBeFocused();
});

test('the phone menu opens from the keyboard and announces its state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await apiLogin(page.request, ADMIN);
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Меню' });
  const journal = page.getByRole('link', { name: 'Журнал' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(journal).toBeHidden();

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await journal.click();

  await expect(page.getByRole('heading', { name: 'Журнал аудиту' })).toBeVisible();
  await expect(journal).toBeHidden(); // the menu closes after navigation
});
