import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openTeamView, openWorkspaceFile, pickUnit, useFileFallback } from './helpers';
import { demandWorkspace } from './demand-fixture';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

test('product demand: request skills and roles, see the Mindestzusage (#318)', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, demandWorkspace());
  await pickUnit(page, 'Team Delta');
  await openTeamView(page);
  const card = page.locator('[data-demand-card]');
  const rows = card.getByRole('list', { name: 'Demand of Team Delta' });

  // Committed FTE and who, from the assignments.
  await expect(card.locator('[data-demand-sum]')).toHaveText('0.7 of 2.0 FTE committed');
  await expect(rows.locator('[data-demand="d1"]')).toContainText('Ledgerline Booking');
  await expect(rows.locator('[data-demand="d1"]')).toContainText('Robin 0.2 FTE, Jordan 0.5 FTE');
  await expect(rows.locator('[data-demand="d2"]')).toContainText('Scrum Master');
  await expect(rows.locator('[data-demand="d2"]')).toContainText('nobody yet');

  // Developer meetings: daily 1.25 h + (2 + 1 + 1) h ÷ 2 weeks + replenishment 0.825 h = 4.075 h
  // a week; ÷ 60 % = 6.8 h → 0.2 FTE.
  const meetings = page.locator('[data-role-meetings]');
  await expect(meetings).toContainText('As Developer in Team Delta');
  await expect(meetings.locator('[data-meeting-sum]')).toHaveText('4.1 h');
  await expect(card.locator('[data-min-commitment]')).toHaveText(
    'Minimum commitment per person: 0.2 FTE (8 h). Below it, a person in Team Delta spends more than 60% of that time in meetings.',
  );

  // The platform's skill family comes first.
  const skill = card.getByLabel('Skill', { exact: true });
  await expect(skill.locator('optgroup').first()).toHaveAttribute('label', 'Skills of Ledgerline');
  await skill.selectOption('Ledgerline Ops');
  await card.getByLabel('FTE', { exact: true }).fill('0.4');
  await card.getByRole('button', { name: 'Add demand' }).click();
  await expect(card.locator('[data-demand-sum]')).toHaveText('0.7 of 2.4 FTE committed');

  // A role-only demand asks for the role; its Mindestzusage follows that role.
  await skill.selectOption({ label: 'No skill, role only' });
  await card.getByLabel('Role', { exact: true }).selectOption({ label: 'Product Owner' });
  await expect(meetings).toContainText('As Product Owner in Team Delta');
  await card.getByLabel('FTE', { exact: true }).fill('0.5');
  await card.getByRole('button', { name: 'Add demand' }).click();
  await expect(card.locator('[data-demand-sum]')).toHaveText('0.7 of 2.9 FTE committed');

  // Edit: the role of a staffed demand moves its people along.
  await card.getByRole('button', { name: 'Edit demand Ledgerline Booking' }).click();
  await expect(card.locator('form.edit').getByLabel('Skill')).toBeFocused();
  await card.locator('form.edit').getByLabel('Role').selectOption({ label: 'Scrum Master' });
  await card.locator('form.edit').getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('button', { name: 'Edit demand Ledgerline Booking' })).toBeFocused();
  await expect(rows.locator('[data-demand="d1"]')).toContainText('as Scrum Master');
  await expect(page.getByRole('list', { name: 'Members of Team Delta' })).toContainText(
    'Scrum Master',
  );

  // "Role or skill?" explains the difference.
  await card.getByRole('button', { name: 'Role or skill?' }).click();
  await expect(card).toContainText('The role decides which meetings someone is invited to.');

  const results = await new AxeBuilder({ page })
    .include('[data-demand-card]')
    .include('[data-role-meetings]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Deleting a staffed demand asks first.
  await card.getByRole('button', { name: 'Delete demand Ledgerline Booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete demand Ledgerline Booking?' });
  await expect(dialog).toContainText('The 2 committed people then leave Team Delta.');
  await dialog.getByRole('button', { name: 'Delete demand' }).click();
  await expect(rows.locator('[data-demand="d1"]')).toHaveCount(0);
});

test('the what-if on the sprint length shows the new Mindestzusage (#318)', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, demandWorkspace());
  await pickUnit(page, 'Team Delta');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('tab', { name: /^Meetings/ }).click();
  await page.locator('#panel-meetings .cadence').getByRole('button', { name: 'What if …' }).click();
  const sheet = page.getByRole('dialog');
  // One week: 1.25 + 4 + 0.825 = 6.075 h ÷ 60 % = 10.1 h → 0.3 FTE.
  await sheet.getByLabel('Length (weeks)').fill('1');
  await expect(sheet).toContainText('Minimum commitment per person (Developer)');
  await expect(sheet).toContainText('0.2 FTE → 0.3 FTE');
});

test('the demand card fits a phone (#318)', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, demandWorkspace());
  await pickUnit(page, 'Team Delta');
  await openTeamView(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator('[data-demand-card]');
  await expect(card).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
