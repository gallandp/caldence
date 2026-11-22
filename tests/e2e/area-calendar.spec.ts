import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { currentUnit, openWorkspaceFile, pickUnit, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** The fixture's Team A with a weekly stand-up, plus Team B and the area "Unit" with a forum. */
function areaWorkspace() {
  const ws = JSON.parse(readFileSync('tests/fixtures/valid-workspace.json', 'utf8'));
  ws.settings.locale = 'en';
  const weekly = (id: string, name: string, time: string, fromTeams = false) => ({
    id,
    name,
    categoryId: 'c1',
    rule: { type: 'weekly', weekday: 3 },
    time,
    duration: 60,
    participants: [{ roleId: 'r1', share: 1, ...(fromTeams ? { fromTeams } : {}) }],
    preparation: 0,
  });
  const a = ws.teams[0];
  a.events = [weekly('standup', 'Stand-up A', '09:00')];
  ws.people.push({ id: 'p2', name: 'Bo' });
  ws.teams.push({
    ...structuredClone(a),
    id: 't2',
    name: 'Team B',
    members: [{ personId: 'p2', roleId: 'r1' }],
    memberHours: {},
    events: [weekly('review', 'Review B', '13:00')],
  });
  ws.areas = [
    {
      id: 'a1',
      name: 'Unit',
      teamIds: ['t1', 't2'],
      members: [],
      memberHours: {},
      cycles: [],
      events: [weekly('forum', 'Forum', '11:00', true)],
    },
  ];
  return ws;
}

test('with the area selected the calendar shows area and team meetings', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, areaWorkspace());
  await pickUnit(page, 'Unit');
  await showView(page, 'Calendar');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const week = page.locator('.week');
  const showFor = page.getByRole('region', { name: 'Show for' });
  const item = (name: string) => week.locator('li', { hasText: name });
  await expect(item('Stand-up A').first()).toBeVisible();
  await expect(item('Review B').first()).toBeVisible();
  // The area meeting carries the area icon and names the area.
  const forum = item('Forum').first();
  await expect(forum).toBeVisible();
  await expect(forum.locator('.area svg')).toBeVisible();
  await expect(forum.locator('.meta').first()).toContainText('Unit');

  // Narrowing to one team of the area hides the area meeting and the other team.
  await showFor.getByLabel('Team', { exact: true }).selectOption({ label: 'Team A' });
  await expect(item('Stand-up A').first()).toBeVisible();
  await expect(item('Forum')).toHaveCount(0);
  await expect(item('Review B')).toHaveCount(0);

  // A single team never shows the area meeting, and has no team filter.
  await pickUnit(page, 'Team B');
  await expect(showFor.getByLabel('Team', { exact: true })).toHaveCount(0);
  await expect(item('Review B').first()).toBeVisible();
  await expect(item('Forum')).toHaveCount(0);

  // With a person filter the area meeting they attend shows; Edit opens it in its area.
  await showFor.getByLabel('Person').selectOption({ label: 'Alex' });
  await item('Forum').first().getByRole('button', { name: 'Edit Forum' }).click();
  await expect(currentUnit(page)).toHaveText('Unit');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Forum');
});

test('in area scope the month chips carry a short team tag (#504)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto('/');
  await openWorkspaceFile(page, areaWorkspace());
  await pickUnit(page, 'Unit');
  await showView(page, 'Calendar');
  const grid = page.locator('table:has(td .chip)');
  const standup = grid.locator('.chip', { hasText: 'Stand-up A' }).first();
  await expect(standup.locator('.team')).toHaveText('A');
  await expect(grid.locator('.chip', { hasText: 'Review B' }).first().locator('.team')).toHaveText(
    'B',
  );
  // The area meeting has the area icon, no team tag.
  await expect(grid.locator('.chip', { hasText: 'Forum' }).first().locator('.team')).toHaveCount(0);

  // One team: no tags.
  await pickUnit(page, 'Team B');
  await expect(grid.locator('.chip', { hasText: 'Review B' }).first()).toBeVisible();
  await expect(grid.locator('.chip .team')).toHaveCount(0);
});
