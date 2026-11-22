import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/accounts';
import { apiLogin, createApplication, signIn, uniqueName } from '../support/api';

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

test('adds an invoice under the valid project: works by group, their sums and the total', async ({
  page,
}) => {
  const headers = await apiLogin(page.request, ADMIN);
  const engineer = (await (
    await page.request.post('/api/v1/engineers', {
      headers,
      data: { fullName: uniqueName('Інженер рахунку'), department: 'ODESA' },
    })
  ).json()) as { id: string };
  const { id } = await createApplication(page.request, headers, { department: 'ODESA' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  await page.request.post(`/api/v1/applications/${id}/technical-conditions`, {
    headers,
    data: {
      tuNumber: '0099/ТУ',
      preparedDate: today,
      engineer: engineer.id,
      gasFlow: 3,
      connectionType: 'NON_STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    },
  });
  await page.request.post(`/api/v1/applications/${id}/projects`, {
    headers,
    data: { approvalNumber: '86', approvalDate: today, designOrganization: 'ТОВ «Проєктбуд»' },
  });
  await signIn(page, ADMIN, `/applications/${id}`);

  await page.getByRole('button', { name: 'Додати модуль' }).click();
  await page
    .getByRole('dialog', { name: 'Додати модуль' })
    .getByRole('button', { name: 'Рахунок' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Новий рахунок' });
  // The first invoice: the first additional agreement.
  await expect(dialog.getByLabel('До додаткової угоди №')).toHaveValue('1');
  await dialog.getByLabel('№ рахунку').fill('6442/1');
  const addWork = async (title: string, name: string, amount: string) => {
    const list = dialog.getByRole('region', { name: title });
    await list.getByRole('button', { name: 'Додати роботу' }).click();
    await list
      .getByLabel(/^Робота \d+$/)
      .last()
      .fill(name);
    await list.getByLabel('Вартість, грн').last().fill(amount);
  };
  const construction = 'Будівельно-монтажні роботи та врізання';
  await addWork(construction, 'Будівельно-монтажні роботи за кошторисом', '2228653,20');
  await addWork(construction, 'Врізання', '121792,51');
  await addWork('ПВР', 'Витрати газу', '37152,36');
  await addWork('ПВР', 'Відновлення газопостачання', '188574,72');
  await expect(dialog).toContainText(/Загальна вартість\s*2\s576\s172,79 грн/);
  await dialog
    .getByRole('region', { name: 'Скан рахунку' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'Рахунок.pdf', mimeType: 'application/pdf', buffer: pdf('р') });
  await dialog
    .getByRole('region', { name: 'Підстава рахунку' })
    .getByLabel('PDF-файл скану')
    .setInputFiles({ name: 'Підстава.pdf', mimeType: 'application/pdf', buffer: pdf('п') });
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(dialog).toBeHidden();

  const frame = page
    .getByRole('tabpanel', { name: 'Рахунок' })
    .getByRole('region', { name: /^Рахунок № 6442\/1 від / });
  await expect(frame.getByRole('region', { name: 'ПВР' })).toContainText(/225\s727,08 грн/);
  await expect(frame).toContainText(/Загальна вартість приєднання\s*2\s576\s172,79 грн/);
  // Approved and invoiced today (a working day, even at the weekend for E2E): both days counted.
  await expect(frame).toContainText('1 роб. дн. (строк — 10)');
  await expect(frame.getByRole('button', { name: 'Відкрити скан рахунку' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Відкрити підставу рахунку' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Рахунок № 6442\/1/ })).toBeVisible();
});
