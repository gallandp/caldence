import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ALPHA_PAIR_DAYS, COMMERCE_CLASH_DAYS, COMMERCE_PAIRS } from './calendar-expected';
import {
  openExample,
  openWorkspaceFile,
  pickUnit,
  setLanguage,
  showView,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  // The overview starts in the current week: the first week of the example horizon.
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
  await openExample(page);
  await setLanguage(page, 'en');
});

test('the area overview counts overlapping pairs and opens the example in the calendar', async ({
  page,
}) => {
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const line = page.locator('[data-area-overview] [data-clashes]');
  await expect(line.locator('.what')).toHaveText(
    `${COMMERCE_PAIRS} overlapping meeting pairs on ${COMMERCE_CLASH_DAYS} days in the next 12 weeks`,
  );
  // One line per meeting pair, with its rhythm and people (#445).
  const pairs = line.locator('li[data-clash]');
  await expect(pairs).toHaveText([
    // Robin's Dailies in Team Gamma and Team Delta, every working day of the 12 weeks (#464).
    'Daily (Team Delta) × Daily Scrum (Team Gamma): Mon–Fri 09:15–09:30 · Robin · 59 days · e.g. 01/04/2027',
    'Sprint Planning (Team Gamma) × Replenishment (Team Delta): Mon 11:00–11:30 · Robin · 6 days · e.g. 01/04/2027',
    /^PO Forum \(Commerce\) × Sprint Review \(Team Gamma\): Wed 14:00–15:00 · Kim · 6 days · e\.g\. /,
  ]);
  await pairs
    .nth(1)
    .getByRole('button', { name: 'Show W1, 01/04/2027 for Robin in the Calendar' })
    .click();

  // The calendar shows that week for Robin, with the overlap named.
  const panel = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(panel.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.locator('[aria-live="polite"]')).toContainText('Week 1');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('person-robin');
  const monday = panel.locator('section', {
    has: page.getByRole('heading', { name: 'Monday, January 4, 2027' }),
  });
  await expect(
    monday.getByText('Overlap: Sprint Planning (Team Gamma) and Replenishment (Team Delta)'),
  ).toBeVisible();
  // One click leads back to the overview.
  await page.getByRole('button', { name: 'Commerce overview' }).click();
  await expect(line).toBeVisible();
  // A load cell then opens the team's week for everyone: the person is no longer chosen.
  await page
    .locator(
      '[data-area-overview] [data-load] tr[data-team="team-gamma"] button[data-week="2027-01-04"]',
    )
    .click();
  await expect(page.locator('[data-week-focus="2027-01-04"]')).toBeVisible();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('');
});

test('Meeting load lists one line per overlapping meeting pair', async ({ page }) => {
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  const warnings = panel.getByRole('region', { name: 'Warnings', exact: true });
  const clashes = warnings.locator('li[data-clash]');
  // Team Alpha: Alex and Sam, both also in Team Beta, share one pair: the same unit as the
  // area Overview, in the same 12 weeks (#445).
  await expect(warnings.locator('[data-clashes] .what')).toHaveText(
    `1 overlapping meeting pair on ${ALPHA_PAIR_DAYS} days in the next 12 weeks`,
  );
  await expect(clashes).toHaveText([
    `Sprint Planning (Team Alpha) × Replenishment (Team Beta): Thu 11:00–12:00 · Alex and Sam · ${ALPHA_PAIR_DAYS} days · e.g. 01/07/2027`,
  ]);
  // The example's date opens its week for that person; back returns to Meeting load (#375).
  await clashes
    .first()
    .getByRole('button', { name: 'Show W1, 01/07/2027 for Alex in the Calendar' })
    .click();
  const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(calendar.locator('[aria-live="polite"]')).toContainText('Week 1');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('person-alex');
  await page.goBack();
  await expect(panel).toBeVisible();
  await expect(clashes).toHaveCount(1);
  await setLanguage(page, 'de');
  await expect(page.locator('li[data-clash]')).toHaveText(
    `Sprint Planning (Team Alpha) × Replenishment (Team Beta): Do 11:00–12:00 · Alex · ${ALPHA_PAIR_DAYS} Tage · z. B. 07.01.2027`,
  );
});

test('the area overview and Meeting load show the same overlap figure', async ({ page }) => {
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const sentence = `${COMMERCE_PAIRS} overlapping meeting pairs on ${COMMERCE_CLASH_DAYS} days in the next 12 weeks`;
  await expect(page.locator('[data-area-overview] [data-clashes] .what')).toHaveText(sentence);
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  await expect(panel.locator('[data-clashes] .what')).toHaveText(sentence);
});

test('many pairs: the overview names three, Meeting load 50, then all', async ({ page }) => {
  // Eleven fictional syncs of Team Gamma at the same time give 55 more pairs, for five people:
  // 58 with the example's three.
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  ws.settings.locale = 'en';
  const gamma = ws.teams.find((x: { id: string }) => x.id === 'team-gamma');
  for (const [id, name] of [
    ['person-noa', 'Noa'],
    ['person-ilka', 'Ilka'],
    ['person-taro', 'Taro'],
  ]) {
    ws.people.push({ id, name });
    gamma.members.push({ personId: id, roleId: 'role-po' });
  }
  for (let i = 1; i <= 11; i++)
    gamma.events.push({
      id: `ev-sync-${i}`,
      name: `Sync ${i}`,
      categoryId: gamma.events[0].categoryId,
      rule: { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] },
      time: '08:00',
      duration: 15,
      participants: [
        { roleId: 'role-po', share: 1 },
        { roleId: 'role-sm', share: 1 },
      ],
      preparation: 0,
    });
  await openWorkspaceFile(page, ws);
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const box = page.locator('[data-area-overview] [data-clashes]');
  await expect(box.locator('.what')).toHaveText(/^58 overlapping meeting pairs on \d+ days/);
  await expect(box.locator('li[data-clash]')).toHaveCount(3);
  // The weekdays as one run, three people named and the rest counted.
  await expect(box.locator('li[data-clash]').first()).toHaveText(
    /^Sync 1 \(Team Gamma\) × Sync 2 \(Team Gamma\): Mon–Fri 08:00–08:15 · \w+, \w+, \w+, and 2 more · \d+ days · e\.g\. 01\/04\/2027$/,
  );
  await box.getByRole('button', { name: '55 more pairs: in Meeting load' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  const list = panel.locator('[data-clashes]');
  await expect(list.locator('.what')).toHaveText(/^58 overlapping meeting pairs/);
  await expect(list.locator('li[data-clash]')).toHaveCount(50);
  // The list itself is brought into view, not a week (#445).
  await expect(list).toBeInViewport();
  await expect(page.locator('[data-week-focus]')).toHaveCount(0);
  await list.getByRole('button', { name: 'Show all 58 overlapping meeting pairs' }).click();
  await expect(list.locator('li[data-clash]')).toHaveCount(58);
  await expect(list.locator('[data-all-clashes]')).toHaveCount(0);
});
