import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const panel = (page: Page) => page.getByRole('tabpanel', { name: /Meetings|Termine/ });
const row = (page: Page, name: string) => panel(page).getByRole('row').filter({ hasText: name });

test('invites a person from another team by name, and their time shows in the load (#285)', async ({
  page,
}) => {
  await openExample(page);
  await showView(page, 'Meetings & cadence');
  await row(page, 'Backlog Refinement')
    .getByRole('button', { name: 'Edit Backlog Refinement' })
    .click();
  const form = panel(page).getByRole('region', { name: 'Edit Backlog Refinement' });
  const people = form.getByRole('group', { name: 'Invited by name' });
  await people.getByRole('button', { name: 'Invite person' }).click();
  // The new row takes the focus; people of the team come first.
  const pick = people.getByLabel('Person', { exact: true });
  await expect(pick).toBeFocused();
  await expect(pick.locator('optgroup').first()).toHaveAttribute('label', 'In Team Alpha');
  await pick.selectOption({ label: 'Kim' });
  await people.getByLabel('Share (0–1): Kim').fill('0.5');

  const axe = await new AxeBuilder({ page })
    .include('.eventform')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);

  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();
  await expect(row(page, 'Backlog Refinement')).toContainText('Kim (by name) · 50%');

  // Kim is in Team Gamma: her filter now holds Alpha's refinement too.
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const load = page.getByRole('tabpanel', { name: 'Meeting load' });
  await expect(load.locator('.tile', { hasText: 'Kim' })).toBeVisible();
});

test('a person who also comes through their role is told they count once', async ({ page }) => {
  await openExample(page);
  await showView(page, 'Meetings & cadence');
  await row(page, 'Backlog Refinement')
    .getByRole('button', { name: 'Edit Backlog Refinement' })
    .click();
  const form = panel(page).getByRole('region', { name: 'Edit Backlog Refinement' });
  const people = form.getByRole('group', { name: 'Invited by name' });
  await people.getByRole('button', { name: 'Invite person' }).click();
  await people.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  await expect(people).toContainText(
    'Also invited as Product Owner: counts once, with this share.',
  );

  // Listing the same person twice is refused on save.
  await people.getByRole('button', { name: 'Invite person' }).click();
  await people.getByLabel('Person', { exact: true }).last().selectOption({ label: 'Alex' });
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeVisible();
  await expect(people.getByText('This person is already listed.').first()).toBeVisible();
});
