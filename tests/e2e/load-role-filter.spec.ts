import { expect, test, type Page } from '@playwright/test';
import { openExample, pickUnit, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
});

async function openLoad(page: Page) {
  await openExample(page);
  await showView(page, 'Meeting load');
  return page.getByRole('tabpanel', { name: 'Meeting load' });
}

const pickRole = (page: Page, role: string) =>
  page.getByLabel('Role', { exact: true }).selectOption({ label: role });

const rows = (panel: ReturnType<Page['getByRole']>) =>
  panel.locator('section.people tbody tr[data-person]');

test('the Role filter narrows the people table in the organisation (#473)', async ({ page }) => {
  const panel = await openLoad(page);
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await expect(rows(panel)).toHaveCount(6);
  await pickRole(page, 'Product Owner');
  await expect(panel.getByRole('table', { name: 'People · Product Owner (3)' })).toBeVisible();
  await expect(rows(panel)).toHaveCount(3);
  for (const id of ['person-alex', 'person-kim', 'person-lee'])
    await expect(panel.locator(`tr[data-person="${id}"]`)).toHaveCount(1);
  // Back to all roles: the plain caption and everyone again.
  await pickRole(page, 'All');
  await expect(panel.getByRole('table', { name: 'People', exact: true })).toBeVisible();
  await expect(rows(panel)).toHaveCount(6);
});

test('in an area, only its people in the role are listed (#473)', async ({ page }) => {
  const panel = await openLoad(page);
  await pickUnit(page, 'Commerce');
  await pickRole(page, 'Product Owner');
  await expect(panel.getByRole('table', { name: 'People · Product Owner (2)' })).toBeVisible();
  await expect(rows(panel)).toHaveCount(2);
  await expect(panel.locator('tr[data-person="person-kim"]')).toHaveCount(1);
  await expect(panel.locator('tr[data-person="person-lee"]')).toHaveCount(1);
});

test('in a team, the row keeps the full load of the person (#473)', async ({ page }) => {
  const panel = await openLoad(page);
  await pickUnit(page, 'Team Beta');
  // Sam is a Developer in Team Beta and Scrum Master in Team Alpha.
  const sam = panel.locator('tr[data-person="person-sam"]');
  const before = (await sam.textContent())!;
  await pickRole(page, 'Developer');
  await expect(panel.getByRole('table', { name: 'People · Developer (1)' })).toBeVisible();
  await expect(rows(panel)).toHaveCount(1);
  await expect(sam).toHaveText(before);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the stacked rows follow the Role filter (#473)', async ({ page }) => {
    const panel = await openLoad(page);
    await pickUnit(page, 'Commerce');
    await expect(rows(panel)).toHaveCount(4);
    await pickRole(page, 'Area Lead');
    await expect(panel.getByRole('table', { name: 'People · Area Lead (1)' })).toBeVisible();
    await expect(rows(panel)).toHaveCount(1);
    await expect(panel.locator('tr[data-person="person-jordan"]')).toBeVisible();
  });
});
