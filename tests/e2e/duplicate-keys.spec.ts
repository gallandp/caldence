import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Workspace } from '../../src/core/model';
import { openWorkspaceFile, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const example = (): Workspace =>
  JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8')) as Workspace;

test('two cycles with the same milestone name, id and day render in calendar and weeks', async ({
  page,
}) => {
  const ws = example();
  ws.settings.locale = 'en';
  const team = ws.teams[0]!;
  team.cycles = [
    { id: 'cy1', name: 'A', milestones: [{ id: 'm1', name: 'Review', date: '2027-01-13' }] },
    { id: 'cy2', name: 'B', milestones: [{ id: 'm1', name: 'Review', date: '2027-01-13' }] },
  ];
  team.events = team.events.filter((e) => e.rule.type !== 'cycle-milestone');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-01-11T12:00:00'));
  await page.goto('/');
  await openWorkspaceFile(page, ws);

  const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(calendar.locator('td[data-date="2027-01-13"] .milestone')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Weeks', exact: true }).click();
  const weeks = page.getByRole('tabpanel', { name: 'Weeks' });
  await expect(weeks.locator('.tag.milestone', { hasText: 'Review' })).toHaveCount(2);
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(calendar.locator('td[data-date="2027-01-13"] .milestone')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a file with a duplicate team member pair is rejected on open', async ({ page }) => {
  const ws = example();
  const team = ws.teams[0]!;
  team.members.push({ ...team.members[0]! });
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'dup.caldence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ws)),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Duplicate ID' })).toBeVisible();
});
