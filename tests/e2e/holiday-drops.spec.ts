import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openWorkspaceFile, showView, useFileFallback } from './helpers';

// #341: before the export, say which meetings holidays leave out and link each date to its day.
test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** A 2-week sprint from Mon 21 Dec 2026: its Review falls on New Year's Day and Good Friday. */
function sprintFile() {
  const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
  ws.settings.locale = 'en';
  ws.settings.horizon = { from: '2026-12-21', to: '2027-04-30' };
  const team = ws.teams[0];
  team.cadence = { kind: 'sprint', lengthWeeks: 2, start: '2026-12-21' };
  const base = {
    categoryId: 'c1',
    duration: 60,
    participants: [{ roleId: 'r1', share: 1 }],
    preparation: 0,
  };
  team.events = [
    {
      ...base,
      id: 'e1',
      name: 'Sprint Planning',
      rule: { type: 'cadence-day', day: 0 },
      time: '09:30',
    },
    {
      ...base,
      id: 'e2',
      name: 'Sprint Review',
      rule: { type: 'cadence-day', day: 11 },
      time: '10:00',
    },
  ];
  return ws;
}

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });
const LINE = 'Sprint Review 01/01/2027, 03/26/2027; Sprint Planning 03/29/2027';

test('a sprint ending on a holiday shows the dropped meetings in the export', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, sprintFile());

  await showView(page, 'Import / Export');
  const exchange = panel(page, 'Import / Export');
  const drops = exchange.locator('.holiday-drops');
  await expect(drops).toContainText('Left out on public holidays (Saxony)');
  await expect(drops).toContainText(LINE);

  // A shorter period lists only its own dates.
  await exchange.getByLabel('To', { exact: true }).fill('2027-02-28');
  await expect(drops).toContainText('Sprint Review 01/01/2027');
  await expect(drops).not.toContainText('03/26/2027');
  await exchange.getByLabel('To', { exact: true }).fill('2027-04-30');

  // Each date opens that day in the Calendar.
  await drops
    .getByRole('button', { name: 'Sprint Review, 03/26/2027, show in the calendar' })
    .click();
  await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const details = panel(page, 'Calendar').getByRole('region', { name: /March 26, 2027/ });
  await expect(details).toContainText('Sprint Review');
  await expect(details).toContainText('Skipped because of a holiday');
});

test('Meetings & cadence lists the dropped meetings of the planning horizon', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, sprintFile());
  await showView(page, 'Meetings & cadence');
  const drops = panel(page, 'Meetings & cadence').locator('.holiday-drops');
  await expect(drops).toContainText(LINE);
  await drops
    .getByRole('button', { name: 'Sprint Planning, 03/29/2027, show in the calendar' })
    .click();
  const details = panel(page, 'Calendar').getByRole('region', { name: /March 29, 2027/ });
  await expect(details).toContainText('Sprint Planning');
});

test('the preset region asks to be checked in Settings', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, sprintFile());
  await showView(page, 'Settings');
  await expect(page.getByLabel('Region (holidays)')).toHaveAccessibleDescription(/Please check/);
});
