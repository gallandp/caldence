import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import { openWorkspaceFile, pickUnit, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** Two areas: Payments (Alpha, Beta, own meetings) and Cards (Gamma, Delta, none of its own). */
function twoAreas() {
  const ws = areaWorkspace();
  ws.settings.locale = 'en';
  (ws.areas[0] as { teamIds: string[] }).teamIds = ['team-alpha', 'team-beta'];
  ws.areas.push({
    id: 'area-cards',
    name: 'Cards',
    teamIds: ['team-gamma', 'team-delta'],
    members: [],
    memberHours: {},
    cycles: [],
    events: [],
  });
  return ws;
}

async function openExchange(page: Page, unit: string) {
  await page.goto('/');
  await openWorkspaceFile(page, twoAreas());
  await pickUnit(page, unit);
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Import / Export' });
}

/** Saves the ZIP and returns its name and the calendar file names it holds. */
async function saveZip(page: Page, button: ReturnType<Page['getByRole']>) {
  const download = page.waitForEvent('download');
  await button.click();
  const file = await download;
  const bytes = readFileSync((await file.path())!).toString('latin1');
  const names = [...new Set(bytes.match(/caldence-[a-z0-9-]+\.ics/g))].sort();
  return { zip: file.suggestedFilename(), names };
}

test('an area in a file with two areas zips its own calendar and its teams only', async ({
  page,
}) => {
  const panel = await openExchange(page, 'Payments');
  const button = panel.getByRole('button', {
    name: 'One file each for Payments and its teams (ZIP)…',
  });
  expect(await saveZip(page, button)).toEqual({
    zip: 'caldence-payments.zip',
    names: ['caldence-payments.ics', 'caldence-team-alpha.ics', 'caldence-team-beta.ics'],
  });
});

test('an area without own meetings zips only its teams and the hint names the button', async ({
  page,
}) => {
  const panel = await openExchange(page, 'Cards');
  const label = 'One file each for Cards and its teams (ZIP)…';
  const button = panel.getByRole('button', { name: label });
  await expect(button).toHaveClass(/primary/);
  await expect(
    panel.getByText(`Cards has no meetings of its own. ${label} creates a file for each team.`),
  ).toBeVisible();
  expect(await saveZip(page, button)).toEqual({
    zip: 'caldence-cards.zip',
    names: ['caldence-team-delta.ics', 'caldence-team-gamma.ics'],
  });
});

test('with a team selected the ZIP still holds every team and area', async ({ page }) => {
  const panel = await openExchange(page, 'Team Gamma');
  const button = panel.getByRole('button', { name: 'One file per team (ZIP)…' });
  expect(await saveZip(page, button)).toEqual({
    zip: 'caldence-teams.zip',
    names: [
      'caldence-payments.ics',
      'caldence-team-alpha.ics',
      'caldence-team-beta.ics',
      'caldence-team-delta.ics',
      'caldence-team-gamma.ics',
    ],
  });
});
