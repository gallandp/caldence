import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import example from '../../src/data/examples/example.caldence.json' with { type: 'json' };
import { currentUnit, openExample, openWorkspaceFile, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** Picks the organisation, the top entry of the switcher's list (#313). */
async function pickOrg(page: Page) {
  await page.locator('.switcher .pick').click();
  await page.locator('.switcher .list button.org').click();
  await expect(currentUnit(page)).toHaveText(/^(Organisation|Northwind)$/);
}

/**
 * The example with an hourly rate and an organisation "Northwind": Mira leads it with 8 h, and a
 * weekly portfolio sync invites her, the area lead from every area and the PO from every team.
 */
function orgWorkspace() {
  const ws = structuredClone(example) as typeof example & Record<string, unknown>;
  ws.settings.locale = 'en';
  (ws.settings as Record<string, unknown>).hourlyRate = 100;
  ws.roles.push({ id: 'role-md', name: 'Managing director', colour: '#7e22ce' });
  ws.people.push({ id: 'person-mira', name: 'Mira' });
  ws.organisation = {
    name: 'Northwind',
    members: [{ personId: 'person-mira', roleId: 'role-md' }],
    memberHours: { 'person-mira': 8 },
    events: [
      {
        id: 'portfolio',
        name: 'Portfolio Sync',
        categoryId: 'cat-align',
        rule: { type: 'weekly', weekday: 2 },
        time: '14:00',
        duration: 60,
        participants: [
          { roleId: 'role-md', share: 1 },
          { roleId: 'role-lead', share: 1, fromAreas: true },
          { roleId: 'role-po', share: 1, fromTeams: true },
        ],
        preparation: 0,
      },
    ],
  };
  return ws;
}

test('the organisation holds its own people and plans meetings from every area or team', async ({
  page,
}) => {
  await openExample(page);
  await pickOrg(page);
  await showView(page, 'Organisation');
  const root = page.locator('.node.root');
  await expect(root.getByText('Nobody yet.')).toBeVisible();

  // A person at organisation level, with a new role and hours set on purpose.
  await root.getByRole('button', { name: '+ Person' }).click();
  const add = page.getByRole('dialog', { name: 'Add a person to the organisation' });
  await add.getByLabel('Person').fill('Mira');
  await add.getByLabel('Role in the organisation').selectOption({ label: 'New role …' });
  await add.getByLabel('New role name').fill('Managing director');
  await add.getByLabel('Hours a week in the organisation').fill('8');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  const mira = root.getByRole('button', { name: /^Mira/ });
  await expect(mira).toContainText('Managing director');
  await expect(mira).toContainText('8 h');
  await expect(root).toContainText('People in the organisation · 1');
  // The card names the unnamed organisation by its level word, its sentences say "the organisation".
  await mira.click();
  const card = page.getByRole('dialog', { name: 'Mira' });
  await expect(card.locator('.unit-name.area')).toHaveText('Organisation');
  await expect(card.getByRole('button', { name: 'Remove from the organisation' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Meetings & cadence plans the organisation like an area.
  await showView(page, 'Meetings & cadence');
  const panel = page.locator('#panel-meetings');
  await expect(panel.getByText('No meetings in the organisation yet')).toBeVisible();
  await panel.getByRole('button', { name: 'Add meeting' }).click();
  const form = panel.locator('.eventform');
  await form.getByLabel('Name', { exact: true }).fill('Portfolio Sync');
  // The area lead from every area: Jordan of Commerce.
  await form.getByLabel('Role', { exact: true }).first().selectOption({ label: 'Area Lead' });
  const who = form.getByLabel('Who: Area Lead');
  await expect(who.locator('option')).toHaveText(['Organisation', 'All areas', 'Every team']);
  await who.selectOption({ label: 'All areas' });
  await expect(form.getByText('1 person: Jordan (Commerce)')).toBeVisible();
  await expect(form.getByText('Jordan has 0 h in the organisation')).toBeVisible();
  await form.getByRole('button', { name: 'Save' }).click();
  const row = panel.getByRole('row', { name: /Portfolio Sync/ });
  await expect(row.getByText('Area Lead · all areas (1)')).toBeVisible();

  // The calendar of the organisation shows it, one team's does not.
  await showView(page, 'Calendar');
  const calendar = page.locator('#panel-calendar');
  // A new meeting repeats on Mondays.
  await calendar.getByRole('gridcell', { name: /^Monday, January 11, 2027/ }).click();
  await expect(calendar.getByText('Portfolio Sync').first()).toBeVisible();
  await page.getByLabel('Area or team').selectOption({ label: 'Team Alpha' });
  await expect(calendar.getByText('Portfolio Sync')).toHaveCount(0);
});

test('load and cost count organisation meetings for the organisation and its attendees', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, orgWorkspace(), 'org.caldence.json');
  await pickOrg(page);
  await showView(page, 'Meeting load');
  const load = page.locator('#panel-load');
  // Mira attends only the sync: 1 h of her 8 h; the others without hours there get a hint.
  await expect(load.locator('[data-area-hints]')).toContainText('Northwind');
  // "Of which here" would equal the total for the organisation (#436).
  await expect(load.getByRole('columnheader', { name: /^Share/ })).toBeVisible();
  await expect(load.getByRole('columnheader', { name: /^of which/ })).toHaveCount(0);
  await showView(page, 'Meetings & cadence');
  const panel = page.locator('#panel-meetings');
  // Mira, Jordan and the POs Alex, Kim and Lee: 5 people × 1 h × €100.
  await expect(panel.locator('[data-cost-week]')).toContainText('€500');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // "Set hours" in a hint opens the organisation's page with the person's card at the hours.
  await showView(page, 'Meeting load');
  await load
    .locator('[data-area-hints] li', { hasText: /^Jordan: / })
    .getByRole('button', { name: 'Set hours for Jordan in Northwind' })
    .click();
  const card = page.getByRole('dialog', { name: 'Jordan' });
  await expect(card.locator('[data-area-hours]')).toBeFocused();
  await card.locator('[data-area-hours]').fill('2');
  await card.locator('[data-area-hours]').press('Tab');
  await expect(page.locator('.node.root').getByRole('button', { name: /^Jordan/ })).toContainText(
    '2 h',
  );

  // The page names who attends without hours there, each a way to set them (#436).
  await page.keyboard.press('Escape');
  const invited = page.locator('[data-org-invited]');
  await expect(invited).toHaveText('Invited without hours · 3: Alex, Kim, Lee');
  await invited.getByRole('button', { name: 'Set hours for Kim in Northwind' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Kim' }).locator('[data-area-hours]'),
  ).toBeFocused();
});

test('presenting the organisation shows the what-if effect across all teams and areas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openWorkspaceFile(page, orgWorkspace(), 'org.caldence.json');
  await pickOrg(page);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('tab', { name: /^Meetings/ }).click();
  await page.getByRole('button', { name: 'What if: Portfolio Sync', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Portfolio Sync' });
  await sheet.getByLabel('Duration (minutes)').fill('30');
  await expect(sheet.locator('.effect')).toContainText('Meeting load · Northwind');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  const bar = page.getByRole('region', { name: 'What if' });
  await expect(bar).toContainText('What if · 1 change');
  await expect(bar.getByText(/^Meeting load Northwind: /)).toBeVisible();
  // Half an hour less for five people at €100.
  await expect(bar).toContainText(/Cost −€250 per week/);
});
