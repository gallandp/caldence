import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  openExample,
  openPeoplePool,
  openWorkspaceFile,
  pickUnit,
  setLanguage,
  showView,
  useFileFallback,
} from './helpers';
import { structureWorkspace } from './structure-fixture';
const pct = (locale: Lang, fraction: number): string =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
import {
  ALEX,
  ALEX_START_WEEK,
  CADENCE_START_WEEK,
  CATEGORY_HOURS,
  fmt,
  ROLE_HOURS,
} from './weeks-load-expected';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

type Lang = 'de' | 'en';
const tabName = {
  weeks: { de: 'Kalender', en: 'Calendar' },
  load: { de: 'Terminlast', en: 'Meeting load' },
};
const rangeName = { de: 'Zeitraum', en: 'Horizon' };

/** The weeks table is the calendar's Horizon level. */
async function showRange(page: Page, lang: Lang = 'en') {
  await showView(page, tabName.weeks[lang]);
  const panel = page.getByRole('tabpanel', { name: tabName.weeks[lang] });
  await panel.getByRole('button', { name: rangeName[lang], exact: true }).click();
  return panel;
}

/** Opens the example with the clock fixed on `today` and shows a view in the given language. */
async function openView(
  page: Page,
  view: 'weeks' | 'load',
  today = '2027-03-10',
  lang: Lang = 'en',
) {
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
  await openExample(page);
  await setLanguage(page, lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  if (view === 'weeks') return showRange(page, lang);
  await showView(page, tabName[view][lang]);
  return page.getByRole('tabpanel', { name: tabName[view][lang] });
}

const weekRow = (panel: ReturnType<Page['getByRole']>, monday: string) =>
  panel.locator(`tr[data-monday="${monday}"]`);

test('the cadence start week shows Sprint 1 and the hours of the example', async ({ page }) => {
  const panel = await openView(page, 'weeks');
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.locator('caption')).toHaveText('Weeks 01/01/2027–12/31/2027');
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('rowheader')).toHaveText(`W${CADENCE_START_WEEK.isoWeek}`);
  // Team Alpha is in scope alone, so the team name is left out.
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
  await expect(row.getByRole('cell').first()).toHaveText('01/04/2027');
  // One column per role in workspace order, then the total.
  await expect(panel.getByRole('columnheader')).toHaveText([
    'Week',
    'Monday',
    'Events',
    ...ROLE_HOURS.map((r) => r.name),
    'Total',
  ]);
  const hours = Object.values(CADENCE_START_WEEK.byRole).map((h) => fmt('en', h));
  await expect(row.getByRole('cell').nth(2)).toHaveText(hours[0]!);
  await expect(row.getByRole('cell').nth(3)).toHaveText(hours[1]!);
  await expect(row.getByRole('cell').nth(4)).toHaveText(fmt('en', CADENCE_START_WEEK.total));
  // The first row is the week of the horizon start with its holiday and school holiday.
  const first = weekRow(panel, '2026-12-28');
  await expect(first).toContainText("New Year's Day");
  await expect(first).toContainText('Christmas break');
  await expect(weekRow(panel, '2027-06-28').getByRole('cell').nth(1)).toContainText('Release');
});

test('the person filter scopes cadence and milestones to the teams of the person', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks');
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('cell').nth(1)).toContainText('Sprint 1 (Team Alpha)');
  await expect(row.getByRole('cell').nth(1)).toContainText('Period 1 (Team Beta)');
  // Alex only holds the Product Owner role.
  await expect(panel.getByRole('columnheader', { name: 'Scrum Master' })).toHaveCount(0);
  await expect(row.getByRole('cell').nth(2)).toHaveText(
    fmt('en', ALEX_START_WEEK.byRole['role-po']),
  );
  await expect(row.getByRole('cell').nth(3)).toHaveText(fmt('en', ALEX_START_WEEK.total));
  await expect(weekRow(panel, '2027-06-28').getByRole('cell').nth(1)).toContainText(
    'Release (Team Alpha)',
  );
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'All' });
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
});

test('events are tags, a load warning is named, and the total has a bar', async ({ page }) => {
  const panel = await openView(page, 'weeks');
  const first = weekRow(panel, '2026-12-28').getByRole('cell').nth(1);
  await expect(first.locator('.tag')).toHaveText(["New Year's Day", 'Christmas break']);
  // The kick-off workshop puts Alex above the usual load in week 2.
  const busy = weekRow(panel, '2027-01-11');
  await expect(busy.getByRole('cell').nth(1)).toContainText('Warning: Alex');
  await expect(busy.locator('.bar > span')).toHaveClass(/high/);
  // Sprint starts come back every two weeks: their peak is the usual load, not a warning.
  const sprint3 = weekRow(panel, '2027-02-01');
  await expect(sprint3.getByRole('cell').nth(1)).toContainText('Sprint 3');
  await expect(sprint3.getByRole('cell').nth(1)).not.toContainText('Warning: ');
  await expect(weekRow(panel, CADENCE_START_WEEK.monday).locator('.bar > span')).not.toHaveClass(
    /high/,
  );
});

test('the quick filters show weeks with a warning or a cadence start', async ({ page }) => {
  const panel = await openView(page, 'weeks');
  const all = await panel.locator('tbody tr').count();
  const group = panel.getByRole('group', { name: 'Show' });
  await expect(group.getByRole('button', { name: 'All weeks' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await group.getByRole('button', { name: 'With warning' }).click();
  await expect(group.getByRole('button', { name: 'With warning' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const rows = panel.locator('tbody tr');
  await expect.poll(() => rows.count()).toBeLessThan(all);
  await expect(rows.filter({ hasNotText: 'Warning: ' })).toHaveCount(0);
  expect(await rows.count()).toBeGreaterThan(0);

  await group.getByRole('button', { name: 'Cadence start' }).click();
  await expect(group.getByRole('button', { name: 'Cadence start' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(rows.filter({ hasNotText: /Sprint \d+/ })).toHaveCount(0);
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(panel.getByRole('status')).toHaveText('');

  // Nobody in Team Alpha is a Developer, so no week has a warning, and the status says so.
  await group.getByRole('button', { name: 'With warning' }).click();
  await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Developer' });
  await expect(panel.getByRole('status')).toHaveText('No week matches this choice.');
  await group.getByRole('button', { name: 'All weeks' }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(all);
});

test('the current week is marked by text and attribute, scrolled into view, focus stays', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks', '2027-09-15');
  const current = panel.locator('tr[aria-current="date"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('data-monday', '2027-09-13');
  await expect(current.getByText('This week')).toBeVisible();
  await expect(current).toBeInViewport();
  await expect(panel.getByRole('button', { name: 'Horizon', exact: true })).toBeFocused();
});

test('no row is marked when today is outside the horizon', async ({ page }) => {
  const panel = await openView(page, 'weeks', '2030-05-06');
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.locator('tr[aria-current]')).toHaveCount(0);
  await expect(panel.getByText('This week')).toHaveCount(0);
});

test('German labels and number format in the weeks table', async ({ page }) => {
  const panel = await openView(page, 'weeks', '2027-03-10', 'de');
  await expect(panel.locator('caption')).toHaveText('Wochen 01.01.2027–31.12.2027');
  const row = weekRow(panel, CADENCE_START_WEEK.monday);
  await expect(row.getByRole('rowheader')).toHaveText('KW 1');
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sprint 1');
  await expect(row.getByRole('cell').nth(4)).toHaveText(fmt('de', CADENCE_START_WEEK.total));
  await expect(weekRow(panel, '2026-12-28')).toContainText('Neujahr');
});

test('a horizon that ends before the cadence starts gives rows without cadence', async ({
  page,
}) => {
  const panel = await openView(page, 'weeks');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Horizon from').fill('2026-06-01');
  await page.getByLabel('Horizon to').fill('2026-12-31');
  await expect(page.getByLabel('Horizon to')).not.toHaveAttribute('aria-invalid', 'true');
  // The calendar keeps its Horizon level while the horizon changes.
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Horizon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.locator('caption')).toHaveText('Weeks 06/01/2026–12/31/2026');
  expect(await panel.locator('tbody tr').count()).toBeGreaterThan(20);
  await expect(panel.getByText(/Sprint|Period/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Meeting load' }).getByRole('table').first(),
  ).toBeVisible();
});

test('empty workspace explains how to start in the load view', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Meeting load']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name });
    await expect(panel.getByRole('heading', { name: 'No teams yet' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Open the example' })).toBeVisible();
    await expect(panel.getByRole('table')).toHaveCount(0);
  }
});

test('the load tables equal loadSummary of Team Alpha in the example (constants checked by a unit test)', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  const base = panel.getByRole('table', { name: 'Base load per week' });
  await expect(base.getByRole('columnheader')).toHaveText([
    'Category',
    ...ROLE_HOURS.map((r) => r.name),
    'Total',
  ]);
  for (const [id, name, roles] of CATEGORY_HOURS) {
    const row = base.locator(`tr[data-category="${id}"]`);
    await expect(row.getByRole('rowheader')).toHaveText(name);
    const cells = ROLE_HOURS.map((r) => fmt('en', roles[r.roleId] ?? 0));
    const total = fmt(
      'en',
      Object.values(roles).reduce((a, b) => a + b, 0),
    );
    await expect(row.getByRole('cell')).toHaveText([...cells, total]);
  }
  // One summary tile per role: hours, share of the person's weekly hours there, FTE of 40 h.
  const tiles = panel.getByRole('list', { name: 'Summary' });
  for (const r of ROLE_HOURS) {
    const tile = tiles.locator(`[data-role="${r.roleId}"]`);
    await expect(tile.locator('.label')).toHaveText(r.name);
    await expect(tile.locator('.hours')).toHaveText(fmt('en', r.hours));
    await expect(tile.locator('.sub')).toHaveText(
      `${pct('en', r.hours / r.weekly)} of ${r.weekly} h · ${fmt('en', r.hours / 40, 2)} FTE`,
    );
  }
  const total = ROLE_HOURS.reduce((sum, r) => sum + r.hours, 0);
  await expect(tiles.locator('[data-total] .value')).toHaveText(`${fmt('en', total)} h / week`);
  await expect(tiles.locator('[data-total] .sub')).toHaveText(
    `typical week · ${fmt('en', total / 40, 2)} FTE`,
  );
  await expect(tiles.locator('[data-unfilled]')).toHaveCount(0);
  // Switching the language reformats the numbers.
  await setLanguage(page, 'de');
  const roleDe = page
    .getByRole('tabpanel', { name: 'Terminlast' })
    .getByRole('list', { name: 'Überblick' })
    .locator('[data-role="role-po"] .hours');
  await expect(roleDe).toHaveText(fmt('de', ROLE_HOURS[0]!.hours));
  await expect(roleDe).toHaveText('3,1');
});

test('in an area every person counts: total × rate is the weekly cost (#272)', async ({ page }) => {
  await openView(page, 'load');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const rate = page.getByLabel('Hourly rate (optional)');
  await rate.fill('100');
  await rate.press('Enter');
  await pickUnit(page, 'Commerce');
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  const tiles = panel.getByRole('list', { name: 'Summary' });
  // Kim and Lee are the Product Owners of Gamma and Delta: one tile for both, Ø per person.
  await expect(tiles.locator('[data-role="role-po"] .sub')).toContainText(
    /^Ø \d+% per person · 2\speople · /,
  );
  const total = Number((await tiles.locator('[data-total] .value').textContent())!.split(' ')[0]);
  const cost = Number(
    (await panel.locator('[data-cost-week] .value').textContent())!.replace(/[^\d.]/g, ''),
  );
  // The tile rounds to 0.1 h, the cost to whole euros.
  expect(Math.abs(total * 100 - cost)).toBeLessThanOrEqual(5);
  await expect(panel.locator('[data-basis]')).toContainText('typical week');
  await expect(panel.locator('.chart .avg')).toContainText('in the planning horizon');
});

test('the Total names a role without people, counted as one person (#272)', async ({ page }) => {
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  // Team Alpha has no developer, yet its planning now invites one.
  ws.teams[0].events[0].participants.push({ roleId: 'role-dev', share: 1 });
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
  await page.goto('/');
  await openWorkspaceFile(page, ws);
  await setLanguage(page, 'en');
  await showView(page, 'Meeting load');
  const total = page.getByRole('tabpanel', { name: 'Meeting load' }).locator('[data-total]');
  await expect(total.locator('[data-unfilled]')).toHaveText(
    'incl. 1 role without people, counted as one person',
  );
});

test('the person filter limits the person table and the warnings to that person', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  const people = panel.getByRole('table', { name: 'People' });
  await expect(people.locator('tbody tr[data-person]')).toHaveCount(2);
  // One line per person: Alex and Sam (their clash lines come on top, #339).
  const all = panel
    .getByRole('region', { name: 'Warnings', exact: true })
    .locator('li:not([data-clash])');
  await expect(all).toHaveCount(2);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  await expect(people.locator('tbody tr[data-person]')).toHaveCount(1);
  const alex = people.locator('tr[data-person="person-alex"]');
  await expect(alex.getByRole('rowheader')).toHaveText('Alex');
  // Teams, hours of the weekly hours, share, free hours up to the 60 % limit, peak week.
  await expect(alex.getByRole('cell')).toHaveText([
    'Team Alpha, Team Beta',
    `${fmt('en', ALEX.average)} of ${fmt('en', 32)} h`,
    pct('en', ALEX.fte),
    `${fmt('en', 0.6 * 32 - ALEX.average)} h`,
    `W${ALEX.peakWeek} (${fmt('en', ALEX.peakHours)} h)`,
  ]);
  const items = panel
    .getByRole('region', { name: 'Warnings', exact: true })
    .locator('li:not([data-clash])');
  await expect(items).toHaveCount(1);
  const weeks = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
    ALEX.warnings.map(([week]) => `W${week}`),
  );
  const most = Math.max(...ALEX.warnings.map(([, hours]) => hours));
  await expect(items.first()).toHaveText(
    `Alex: load spike (more than 1.5 × the usual load) in ${weeks}, up to ${fmt('en', most)} h`,
  );
  // The icon is generated by CSS, so it is not part of the text.
  await expect(items.first().locator('[aria-hidden]')).toHaveCount(0);
  // The tables follow the filter: Alex only holds the Product Owner role.
  const tiles = panel.getByRole('list', { name: 'Summary' });
  await expect(tiles.locator('[data-role]')).toHaveCount(1);
  await expect(tiles.locator('[data-role="role-po"] .hours')).toHaveText(fmt('en', ALEX.roleHours));
});

test('a person in two teams has the same share, room and tag in every scope (#273)', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  await expect(panel.locator('[data-meeting-only]')).toHaveText(
    'Meeting time only. Other work does not count here.',
  );
  // Alex is Product Owner in Alpha and Beta (16 + 16 h): judged on 32 h in every scope.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Limit: share of weekly hours in meetings').fill('15');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const people = panel.getByRole('table', { name: 'People' });
  const alex = people.locator('tr[data-person="person-alex"]');
  const warnings = panel.getByRole('region', { name: 'Warnings', exact: true });
  const alexWarning = warnings.locator('li:not([data-clash])').filter({ hasText: /^Alex: / });
  await expect(alexWarning).toHaveCount(1);
  const warningText = await alexWarning.textContent();
  // The Calendar's weeks with a warning are the weeks the chart marks for Team Alpha.
  const marked = await panel.locator('.chart .bars i.high').count();
  expect(marked).toBeGreaterThan(0);
  const range = await showRange(page);
  await range
    .getByRole('group', { name: 'Show' })
    .getByRole('button', { name: 'With warning' })
    .click();
  await expect(range.locator('tbody tr')).toHaveCount(marked);
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const judged = [
    `${fmt('en', ALEX.average)} of ${fmt('en', 32)} h`,
    pct('en', ALEX.fte),
    `${fmt('en', 0.15 * 32 - ALEX.average)} h`,
  ];
  // The part in each team: Alex's meetings there of the 16 h there.
  const here: Record<string, string | RegExp> = {
    'Team Alpha': '3.1 of 16.0 h · 19%',
    'Team Beta': /^\d+\.\d of 16\.0 h · \d+%$/,
  };
  for (const team of ['Team Alpha', 'Team Beta']) {
    if (team !== 'Team Alpha') await pickUnit(page, team);
    await expect(people.getByRole('columnheader', { name: 'of which in the team' })).toBeVisible();
    await expect(
      people.getByRole('columnheader', { name: /Room before limit \(meetings\)/ }),
    ).toBeVisible();
    await expect(alex.getByRole('cell').nth(1)).toHaveText(judged[0]!);
    await expect(alex.getByRole('cell').nth(2)).toHaveText(judged[1]!);
    await expect(alex.getByRole('cell').nth(3)).toHaveText(here[team]!);
    await expect(alex.getByRole('cell').nth(4)).toHaveText(judged[2]!);
    await expect(alex.getByRole('rowheader')).not.toContainText('over the limit');
    await expect(alexWarning).toHaveText(warningText!);
  }
  // In an area the column names the area; Kim works only there, so their part is all of it.
  await pickUnit(page, 'Commerce');
  await expect(people.getByRole('columnheader', { name: 'of which in the area' })).toBeVisible();
  const kim = people.locator('tr[data-person="person-kim"]').getByRole('cell');
  const kimHours = (await kim.nth(1).textContent())!.trim();
  const kimShare = (await kim.nth(2).textContent())!.trim();
  expect(kimHours).toMatch(/ of 36\.0 h$/);
  await expect(kim.nth(3)).toHaveText(`${kimHours} · ${kimShare}`);
  // The person filter gives the same answer, without the team column and without FTE on the tiles.
  await pickUnit(page, 'Team Alpha');
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Alex' });
  await expect(people.getByRole('columnheader', { name: 'of which in the team' })).toHaveCount(0);
  await expect(alex.getByRole('cell').nth(1)).toHaveText(judged[0]!);
  await expect(alex.getByRole('cell').nth(2)).toHaveText(judged[1]!);
  await expect(alex.getByRole('cell').nth(3)).toHaveText(judged[2]!);
  await expect(alexWarning).toHaveText(warningText!);
  const tiles = panel.getByRole('list', { name: 'Summary' });
  await expect(tiles).not.toContainText('FTE');
  await expect(tiles.locator('[data-total] .sub')).toHaveText('typical week');
});

test('the chart summarises the hours per week and marks weeks with a warning', async ({ page }) => {
  const panel = await openView(page, 'load');
  const chart = panel.getByRole('img', { name: /^Bar chart of the hours per week/ });
  await expect(chart).toHaveAttribute(
    'aria-label',
    /average \d+\.\d h, highest W\d+ with \d+\.\d h, \d+ weeks with a warning\.$/,
  );
  // One bar per week of the horizon; Alex's warning weeks are highlighted.
  await expect(chart.locator('.bars i')).toHaveCount(53);
  expect(await chart.locator('.bars i.high').count()).toBeGreaterThanOrEqual(ALEX.warnings.length);
  await expect(
    panel.getByRole('list', { name: 'Summary' }).locator('[data-peak] .value'),
  ).toHaveText(/^W\d+$/);
});

test('a person without meetings shows no peak week', async ({ page }) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await openPeoplePool(page);
  const people = page.getByRole('region', { name: 'People', exact: true });
  await people.getByLabel('New person name').fill('Noa');
  await people.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  // Noa is in no team yet: the person filter shows them.
  await page.locator('.context').getByLabel('Person').selectOption({ label: 'Noa' });
  const cells = panel.locator('tr[data-person]').filter({ hasText: 'Noa' }).getByRole('cell');
  // No team yet: the 40 h a week of the people list, no share and no peak.
  await expect(cells).toHaveText([
    '–',
    `${fmt('en', 0)} of ${fmt('en', 40)} h`,
    pct('en', 0),
    `${fmt('en', 24)} h`,
    '–',
  ]);
});

test('weeks above the FTE limit are listed as text', async ({ page }) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Limit: share of weekly hours in meetings').fill('10');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const section = panel.getByRole('region', { name: 'Warnings', exact: true });
  // One line per person; many weeks are summed up as a span.
  await expect(section.locator('li:not([data-clash])')).toHaveCount(2);
  await expect(
    section
      .locator('li:not([data-clash])')
      .filter({ hasText: /^Alex: / })
      .getByText(/over the 10% limit in \d+ weeks from W\d+ to W\d+, up to \d+\.\d h$/),
  ).toBeVisible();
  await expect(section.getByText(/^Sam: .*over the 10% limit/)).toBeVisible();
  await expect(section.getByText(/more than 10% of their weekly hours in meetings/)).toBeVisible();
});

test('without warnings the list says so', async ({ page }) => {
  // Without Team Beta's meetings and the one-off review, nobody in Team Alpha has a clash (#339).
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  type Unit = { id: string; events: { name: string }[] };
  const team = (id: string) => (ws.teams as Unit[]).find((t) => t.id === id)!;
  team('team-beta').events = [];
  const alpha = team('team-alpha');
  alpha.events = alpha.events.filter((e) => e.name !== 'Release Readiness Review');
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
  await page.goto('/');
  await openWorkspaceFile(page, ws);
  await setLanguage(page, 'en');
  await showView(page, 'Meeting load');
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Load spike from (× usual load)').fill('10');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const section = panel.getByRole('region', { name: 'Warnings', exact: true });
  await expect(section.getByText('No warnings')).toBeVisible();
  await expect(section.getByRole('listitem')).toHaveCount(0);
});

for (const view of ['weeks', 'load'] as const) {
  test(`no horizontal page scroll at 375 px (${view})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const panel = await openView(page, view);
    await expect(panel.getByRole('table').first()).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);
    // The scrollable table container is a focusable region.
    const region = panel.locator('[role="region"][tabindex]').first();
    await expect(region).toHaveAttribute('tabindex', '0');
    if (view === 'weeks')
      expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
}

for (const lang of ['de', 'en'] as const) {
  for (const view of ['weeks', 'load'] as const) {
    test(`axe finds no violations in the ${view} view (${lang})`, async ({ page }) => {
      const panel = await openView(page, view, '2027-03-10', lang);
      await expect(panel.getByRole('table').first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

// #238: a fresh Scrum team from the wizard squeezes the category column enough that,
// before the fix, the dot stood alone and "(4,8 h)" broke. One line = the text box
// is no taller than about one line box.
for (const lang of ['de', 'en'] as const) {
  for (const width of [390, 1440]) {
    test(`load tables keep dot + category and the peak week on one line (${lang}, ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date('2027-03-17T12:00:00'));
      await page.goto('/');
      await page.getByRole('button', { name: 'Plan new', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Plan new' });
      await dialog.getByRole('radio', { name: 'Scrum', exact: true }).check();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByLabel('I take part myself').check();
      await dialog.getByLabel('Your name').fill('Kim');
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Create team' }).click();
      await expect(dialog).toBeHidden();
      await setLanguage(page, lang);
      await showView(page, tabName.load[lang]);
      const panel = page.getByRole('tabpanel', { name: tabName.load[lang] });
      const lines = (selector: string) =>
        panel.locator(selector).evaluateAll((els) =>
          els.map((n) => {
            const range = document.createRange();
            range.selectNodeContents(n);
            const lh = parseFloat(getComputedStyle(n).lineHeight);
            return `${n.textContent?.trim()}: ${range.getBoundingClientRect().height < lh * 1.5 ? 1 : 2}`;
          }),
        );
      await expect(panel.locator('tr[data-category] th').first()).toBeVisible();
      const cats = await lines('tr[data-category] th');
      expect(cats).toEqual(cats.map((c) => c.replace(/\d$/, '1')));
      await expect(panel.locator('tr[data-person] td:last-child').first()).toBeVisible();
      const peaks = await lines('tr[data-person] td:last-child');
      expect(peaks).toEqual(peaks.map((c) => c.replace(/\d$/, '1')));
    });
  }
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`the average label stays visible when every week has the same load (${size.name})`, async ({
    page,
  }) => {
    // The Payments area only has weekly meetings; without holidays every week has the same load,
    // so the average line sits at the very top of the chart.
    const ws = structureWorkspace();
    ws.settings.skipHolidays = false;
    await page.clock.setFixedTime(new Date('2026-03-10T12:00:00'));
    // The Open button sits in a menu on phones: load on a wide screen, then narrow it.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await openWorkspaceFile(page, ws);
    await pickUnit(page, 'Payments');
    await page.setViewportSize({ width: size.width, height: size.height });
    await showView(page, 'Meeting load');
    const chart = page
      .getByRole('tabpanel', { name: 'Meeting load' })
      .getByRole('img', { name: /^Bar chart of the hours per week/ });
    // Average and peak are the same.
    await expect(chart).toHaveAttribute(
      'aria-label',
      /average (\d+\.\d) h, highest W\d+ with \1 h/,
    );
    const box = await chart.boundingBox();
    const label = chart.locator('.avg span');
    await expect(label).toBeVisible();
    const text = await label.boundingBox();
    expect(text!.y).toBeGreaterThanOrEqual(box!.y);
  });
}

test('the people list sorts by share or free hours and explains a person on click', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  const people = panel.getByRole('table', { name: 'People' });
  const share = people.getByRole('columnheader', { name: /Share in meetings/ });
  const free = people.getByRole('columnheader', { name: /Room before limit/ });
  // Highest share first by default.
  await expect(share).toHaveAttribute('aria-sort', 'descending');
  await expect(free).not.toHaveAttribute('aria-sort');
  await free.getByRole('button').click();
  await expect(free).toHaveAttribute('aria-sort', 'descending');
  await expect(share).not.toHaveAttribute('aria-sort');
  // The free column found by its header, so a column more or less cannot fool the check.
  const column = await people
    .locator('thead th')
    .evaluateAll((ths) => ths.findIndex((th) => th.textContent!.includes('Room before limit')));
  const freeHours = await people
    .locator('tr[data-person]')
    .evaluateAll(
      (rows, i) => rows.map((r) => parseFloat(r.children[i]!.textContent!.replace(',', '.'))),
      column,
    );
  expect(freeHours.length).toBeGreaterThan(1);
  expect(freeHours.every((n) => Number.isFinite(n))).toBe(true);
  expect(freeHours).toEqual([...freeHours].sort((a, b) => b - a));

  // A click on a name shows where the time comes from, a second click hides it.
  const alex = people.getByRole('button', { name: 'Alex', exact: true });
  await expect(alex).toHaveAttribute('aria-expanded', 'false');
  await alex.click();
  await expect(alex).toHaveAttribute('aria-expanded', 'true');
  const detail = page.locator(`#${await alex.getAttribute('aria-controls')}`);
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('listitem').first()).toContainText('Team Alpha');
  await expect(detail.getByRole('listitem').first()).toContainText('h in meetings');
  await alex.click();
  await expect(detail).toBeHidden();
});

test('the people list flags who is over the limit and leaves them no free hours', async ({
  page,
}) => {
  const panel = await openView(page, 'load');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Limit: share of weekly hours in meetings').fill('10');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const alex = panel
    .getByRole('table', { name: 'People' })
    .locator('tr[data-person="person-alex"]');
  await expect(alex.getByRole('rowheader')).toContainText('over the limit');
  await expect(alex.getByRole('cell').nth(4)).toHaveText(`${fmt('en', 0)} h`);
});

test('a person only in the area without area hours has 0 h, not the default (#265)', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
  await page.goto('/');
  const ws = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));
  ws.settings.locale = 'en';
  // Jordan leads the area and is in no team; without an hours entry they have 0 h there.
  delete ws.areas[0].memberHours['person-jordan'];
  await openWorkspaceFile(page, ws);
  await showView(page, 'Meeting load');
  // With a person chosen, all their teams and areas count together.
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Jordan' });
  const panel = page.getByRole('tabpanel', { name: 'Meeting load' });
  const jordan = panel
    .getByRole('table', { name: 'People' })
    .locator('tr[data-person="person-jordan"]');
  await expect(jordan).toContainText('only in the area');
  await expect(jordan).toContainText(/of 0(\.0)? h/);
  await expect(jordan).toContainText('no hours');
  await expect(jordan).not.toContainText('40');
  await jordan.getByRole('button', { name: 'Jordan', exact: true }).click();
  const detail = panel.locator('[data-set-hours]');
  await expect(detail).toHaveText(
    'No weekly hours in the area yet, so these meetings are always over the limit. Set the hours under Area → Structure.',
  );
  const axe = await new AxeBuilder({ page }).include('[data-person="person-jordan"]').analyze();
  expect(axe.violations).toEqual([]);
});
