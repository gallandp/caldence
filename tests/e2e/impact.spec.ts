import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openTeamView, openWorkspaceFile, pickUnit, showView, useFileFallback } from './helpers';
import { demandWorkspace } from './demand-fixture';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/**
 * The demand example with a weekly 3 h refinement for developers: 7.1 h of meetings a week, so
 * the Mindestzusage is 0.3 FTE (12 h) and 0.2 FTE (8 h) is below it.
 */
function impactWorkspace() {
  const ws = demandWorkspace();
  const delta = ws.teams.find((t: { id: string }) => t.id === 'team-delta');
  delta.events.push({
    id: 'ev-refine',
    name: 'Refinement',
    categoryId: ws.categories[0].id,
    rule: { type: 'weekly', weekday: 3 },
    time: '13:00',
    duration: 180,
    preparation: 0,
    participants: [{ roleId: 'role-dev', share: 1 }],
  });
  return ws;
}

test('effect check while staffing a person on a demand (#320)', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, impactWorkspace());
  await pickUnit(page, 'Team Delta');
  await openTeamView(page);
  const card = page.locator('[data-demand-card]');
  await card.getByRole('button', { name: 'Staff a person on Ledgerline Booking' }).click();

  const dialog = page.locator('[data-assign-dialog]');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Person').selectOption({ label: 'Alex · 0.2 FTE free' });
  await expect(dialog.getByRole('heading')).toHaveText('Alex → Team Delta');
  await expect(dialog).toContainText('Commerce · Ledgerline Booking · Demand 1.5 FTE');
  await expect(dialog).toContainText('Alex has 0.2 FTE free · demand open 0.8 FTE');

  // 0.2 FTE = 8 h, 7.1 h of them in meetings: below the Mindestzusage of 0.3 FTE.
  const fte = dialog.getByRole('spinbutton', { name: 'FTE' });
  await expect(fte).toHaveValue('0.2');
  await expect(dialog.getByRole('button', { name: '0.1 FTE more' })).toBeDisabled();
  await expect(dialog.locator('[data-impact-sentence]')).toHaveText(
    "8.0 h a week in Team Delta. 7.1 h of it in the working system's meetings. 0.9 h are left for product work.",
  );
  await expect(dialog.locator('[data-impact-state]')).toHaveAttribute('data-impact-state', 'under');
  await expect(dialog.locator('[data-impact-state]')).toContainText(
    'Below the minimum commitment: of it in Team Delta, 88% in meetings. From 0.3 FTE, Alex spends at most 60% there in meetings.',
  );
  await expect(dialog.locator('[data-impact-overall]')).toContainText('Alex overall afterwards:');

  // 0.1 FTE = 4 h does not even cover the meetings.
  await dialog.getByRole('button', { name: '0.1 FTE less' }).click();
  await expect(fte).toHaveValue('0.1');
  await expect(dialog.locator('[data-impact-state]')).toHaveAttribute(
    'data-impact-state',
    'meetingsOnly',
  );

  // The product's meetings, expandable.
  await dialog.getByText('Meetings in Team Delta (7.1 h / week)').click();
  await expect(dialog.getByRole('table')).toContainText('Refinement');
  await expect(dialog.getByRole('table')).toContainText('3.0 h');

  const axe = await new AxeBuilder({ page }).include('[data-assign-dialog]').analyze();
  expect(axe.violations).toEqual([]);

  // Assigning is always possible.
  await dialog.getByRole('button', { name: '0.1 FTE more' }).click();
  await dialog.getByRole('button', { name: 'Staff', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card.locator('[data-demand-sum]')).toHaveText('0.9 of 2.0 FTE committed');
  const alex = card.locator('[data-demand="d1"] [data-who="person-alex"]');
  await expect(alex).toContainText('Alex 0.2 FTE');
  await expect(alex.locator('[data-impact-tag]')).toHaveText(
    'below minimum commitment · 88% in meetings',
  );
  await expect(
    card.getByRole('button', { name: 'Staff a person on Ledgerline Booking' }),
  ).toBeFocused();

  // The same words on the member list and in the meeting load.
  const members = page.getByRole('list', { name: 'Members of Team Delta' });
  await expect(
    members.getByRole('listitem').filter({ hasText: 'Alex' }).locator('[data-impact-tag]'),
  ).toHaveText('below minimum commitment · of it in Team Delta: 88% in meetings');
  await showView(page, 'Meeting load');
  await page.locator('tr[data-person="person-alex"] button.who').click();
  await expect(page.locator('[data-staffed]')).toContainText(
    'Team Delta: below minimum commitment · of it in Team Delta: 88% in meetings',
  );
});

test('the Team view shows the effect check when adding a member (#320)', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, impactWorkspace());
  await pickUnit(page, 'Team Delta');
  await openTeamView(page);
  const form = page.locator('form.add-row').filter({ has: page.locator('[data-member-add]') });
  await form.locator('[data-member-add]').fill('Kim');
  await form.getByLabel('Role').selectOption({ label: 'Developer' });
  await form.getByLabel('Hrs/week in team').fill('20');
  const check = page.locator('.impact-preview');
  await expect(check.locator('[data-impact-sentence]')).toContainText(
    '20.0 h a week in Team Delta.',
  );
  await expect(check.locator('[data-impact-state]')).toHaveAttribute('data-impact-state', 'enough');
  // The overall share is the preview's line, measured like the people table.
  await expect(check.locator('[data-impact-overall]')).toHaveCount(0);
});
