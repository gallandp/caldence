import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import {
  currentUnit,
  openMenuIfNarrow,
  openWorkspaceFile,
  pickUnit,
  showView,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  // The overview starts in the current week; pin it to the first week of the example horizon.
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
});

async function openOverview(
  page: Page,
  rate?: number,
  change?: (ws: ReturnType<typeof areaWorkspace>) => void,
) {
  await page.goto('/');
  const ws = areaWorkspace();
  change?.(ws);
  ws.settings.locale = 'en';
  if (rate) (ws.settings as { hourlyRate?: number }).hourlyRate = rate;
  await openWorkspaceFile(page, ws);
  await pickUnit(page, 'Payments');
  await openMenuIfNarrow(page);
  // With an area selected the Team entry is the area's page; the overview is its second page.
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const overview = page.locator('[data-area-overview]');
  await expect(overview).toBeVisible();
  return overview;
}

test('the area overview compares cadences, shows load and the area steering', async ({ page }) => {
  const overview = await openOverview(page);
  await expect(overview.locator('.lead')).toContainText('4 teams · 8 people');
  await expect(overview.locator('.lead')).toContainText('Cadence: PI, 10 weeks');

  // Gamma's 3-week sprints and Delta's Wednesday start are out of step.
  const kpi = overview.locator('[data-kpi="cadence"]');
  await expect(kpi.locator('b')).toHaveText('2 of 4');
  await expect(kpi.locator('.tag')).toHaveText('Differ: Team Gamma and Team Delta');
  const cadence = overview.locator('[data-cadence]');
  await expect(cadence.locator('[data-team-row="team-alpha"]')).toContainText('aligned');
  await expect(cadence.locator('[data-team-row="team-gamma"]')).toContainText(
    '3-week periods do not fit into 10 weeks',
  );
  await expect(cadence.locator('[data-team-row="team-delta"]')).toContainText(
    'starts on Wednesday',
  );
  await expect(cadence.locator('.seg.area')).toHaveText([
    /^PI 1, 01\/04\/2027 to 03\/14\/2027$/,
    /^PI 2, /,
  ]);

  // One row of twelve week cells per team.
  const load = overview.locator('[data-load]');
  await expect(load.locator('tbody tr')).toHaveCount(4);
  await expect(load.locator('tr[data-team="team-alpha"] button')).toHaveCount(12);

  // Steering: area roles with hours, and area meetings with "every team" chips.
  const roles = overview.locator('[data-area-roles]');
  await expect(roles).toContainText('Ruth');
  await expect(roles).toContainText('Head of area · 32.0 h in the area');
  await expect(roles.locator('li', { hasText: 'Pia' })).toContainText('0 h · set hours');
  const forum = overview.locator('[data-meeting="ev-po-forum"]');
  await expect(forum).toContainText('Product Owner · every team (4)');
  // Ruth, Pia (area PO) and the three team POs: 5 h a week.
  await expect(forum.locator('td.num')).toHaveText('5.0');
  // Only Team Beta has developers.
  await expect(overview.locator('[data-meeting="ev-planning"] .missing')).toHaveCount(3);
  await expect(overview.locator('[data-kpi="area"] b')).toHaveText('6.5 h');
});

test('a load cell opens Load for that team and week', async ({ page }) => {
  const overview = await openOverview(page);
  const cell = overview.locator('tr[data-team="team-beta"] button[data-week="2027-01-11"]');
  await expect(cell).toHaveAccessibleName(/^Team Beta, W2: \d+% in meetings/);
  await cell.click();
  await expect(page.getByRole('tab', { name: 'Meeting load', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Team Beta');
  const focus = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus.getByRole('heading')).toHaveText('W2 · Team Beta');
  await expect(focus.locator('tbody tr')).toHaveCount(2);
  await focus.getByRole('button', { name: 'Close week' }).click();
  await expect(focus).toBeHidden();
});

test('the strip and the week detail judge a person on all their teams (#294)', async ({ page }) => {
  // Alex is Product Owner in Alpha and Beta (16 + 16 h), the limit is 15 %. Without area meetings
  // and area hours only the team meetings count.
  const overview = await openOverview(page, undefined, (ws) => {
    ws.settings.thresholds.maxFte = 0.15;
    const payments = ws.areas[0] as {
      members: { personId: string }[];
      memberHours: Record<string, number>;
      events: unknown[];
    };
    payments.members = payments.members.filter((m) => m.personId !== 'person-alex');
    delete payments.memberHours['person-alex'];
    payments.events = [];
  });
  const alpha = overview.locator('tr[data-team="team-alpha"]');
  // W3: 2.75 h in Alpha is 17 % of 16 h, but 4.1 h of 32 h is 13 %: not over the limit.
  const w3 = alpha.locator('button[data-week="2027-01-18"]');
  await expect(w3).toHaveAccessibleName(/^Team Alpha, W3: \d+% in meetings\. Open Meeting load$/);
  await expect(w3).not.toHaveClass(/warn/);
  // W2: 8.2 h of 32 h is 26 %: over the limit.
  const w2 = alpha.locator('button[data-week="2027-01-11"]');
  await expect(w2).toHaveAccessibleName(/at least one person over the limit \(15%\)/);
  await expect(w2).toHaveClass(/warn/);

  await w3.click();
  const focus = page.locator('[data-week-focus="2027-01-18"]');
  await expect(focus.getByRole('heading')).toHaveText('W3 · Team Alpha');
  await expect(focus.getByRole('columnheader', { name: 'of which in the team' })).toBeVisible();
  const alex = focus.locator('tr[data-person="person-alex"]');
  await expect(alex.getByRole('cell')).toHaveText(['4.1 of 32.0 h', '13%', '2.8 of 16.0 h · 17%'], {
    useInnerText: true,
  });
  await expect(alex).not.toContainText('over the limit');

  await pickUnit(page, 'Payments');
  await openMenuIfNarrow(page);
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  await w2.click();
  const focus2 = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus2.locator('tr[data-person="person-alex"]')).toContainText(
    '26%over the limit (15%)',
  );
});

test('area meetings without area hours do not outline every week (#294)', async ({ page }) => {
  // The unchanged fixture: area meetings invite people "from every team" who have no area hours
  // yet. Load warns about that; the strip and the week detail judge only the total (limit 60 %).
  const overview = await openOverview(page);
  const cells = overview.locator('[data-load] tbody button[data-week]');
  await expect(cells).toHaveCount(48);
  await expect(overview.locator('[data-load] tbody button[data-week].warn')).toHaveCount(0);
  await overview.locator('tr[data-team="team-alpha"] button[data-week="2027-01-11"]').click();
  const focus = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus.locator('tbody tr')).toHaveCount(2);
  for (const row of await focus.locator('tbody tr').all()) {
    const share = await row.getByRole('cell').nth(1).innerText();
    const percent = Number(share.match(/^(\d+)%/)![1]);
    if (percent <= 60) await expect(row).not.toContainText('over the limit');
  }
});

test('an area meeting opens in Meetings & cadence', async ({ page }) => {
  const overview = await openOverview(page);
  await overview.getByRole('button', { name: 'Open PO forum in Meetings & cadence' }).click();
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Payments');
  // The meeting is shown, not opened for editing (#277): the row is highlighted, its name focused.
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  const row = page.locator('#panel-meetings tr[data-shown]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('PO forum');
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(row).toBeInViewport();
  await expect(row.getByRole('rowheader')).toBeFocused();
  // One click back to the area overview.
  await page.getByRole('button', { name: 'Payments overview' }).click();
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  await expect(currentUnit(page)).toHaveText('Payments');
  await expect(page.getByRole('tab', { name: 'Area', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Payments overview' })).toHaveCount(0);
});

test('the back link appears after a drill-in only and leaves with the view', async ({ page }) => {
  const overview = await openOverview(page);
  await overview.locator('tr[data-team="team-beta"] button[data-week="2027-01-11"]').click();
  const back = page.locator('#panel-load').getByRole('button', { name: 'Payments overview' });
  await expect(back).toBeVisible();
  await expect(back).toHaveText(/^←\s*Payments overview$/);
  // Another view is not the drill-in's target: no back link there.
  await showView(page, 'Calendar');
  await expect(page.getByRole('button', { name: 'Payments overview' })).toHaveCount(0);
  // Leaving ends the drill-in: coming back shows no link either.
  await showView(page, 'Meeting load');
  await expect(page.getByRole('button', { name: 'Payments overview' })).toHaveCount(0);
});

test('presenting, an area without meetings opens on its overview, not an empty list', async ({
  page,
}) => {
  await openOverview(page, undefined, (ws) => {
    (ws.areas[0] as { events: unknown[] }).events = [];
  });
  await pickUnit(page, 'Team Beta');
  await showView(page, 'Meetings & cadence');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await pickUnit(page, 'Payments');
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  // Calendar and Meeting load show the area as well: they stay.
  await pickUnit(page, 'Team Beta');
  await showView(page, 'Meeting load');
  await pickUnit(page, 'Payments');
  await expect(page.getByRole('tab', { name: 'Meeting load', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The team-pick hint is a builder's hint and lives on Structure.
  await expect(page.locator('.area-teams')).toHaveCount(0);
});

test('the team-pick hint is on Structure, the cost explanation folds', async ({ page }) => {
  const overview = await openOverview(page, 100);
  await expect(page.locator('.area-teams')).toHaveCount(0);
  const how = overview.locator('[data-area-costs] details');
  await expect(how.locator('summary')).toHaveText('How is this counted?');
  await expect(how.getByText(/counts only the meetings of that unit/)).toBeHidden();
  await how.locator('summary').click();
  await expect(how.getByText(/counts only the meetings of that unit/)).toBeVisible();
  await page
    .getByRole('group', { name: 'Page' })
    .getByRole('button', { name: 'Structure' })
    .click();
  await expect(page.locator('.area-teams')).toContainText('Pick one in Payments');
});

test('phones show the area meetings as cards', async ({ page }) => {
  const overview = await openOverview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const row = overview.locator('[data-meeting="ev-po-forum"]');
  await expect(row).toHaveCSS('display', 'grid');
  await expect(overview.locator('.meetings thead')).toHaveCSS('position', 'absolute');
});

test('on phones the overview fits the screen and shows each team with its cost (#281)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  await page.setViewportSize({ width: 390, height: 844 });
  // Nothing scrolls sideways, and no key figure is cut off.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  for (const kpi of await overview.locator('.kpi').all())
    expect(await kpi.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The cost table becomes cards: team and cost stay, cadence and per person give way.
  const table = overview.locator('[data-area-costs] table');
  const gamma = table.locator('[data-cost-row="team-gamma"]');
  await expect(gamma).toHaveCSS('display', 'grid');
  await expect(table.locator('td.extra').first()).toBeHidden();
  await gamma.scrollIntoViewIfNeeded();
  await expect(gamma.locator('th')).toBeInViewport({ ratio: 1 });
  await expect(gamma.locator('td.cost')).toBeInViewport({ ratio: 1 });
  await expect(gamma.locator('td.cost')).toHaveText(/€/);
  // The tab bar stays fixed at the bottom.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bar = (await page.getByRole('navigation', { name: 'Views' }).boundingBox())!;
  expect(bar.x).toBe(0);
  expect(Math.round(bar.y + bar.height)).toBe(844);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no violations in the area overview (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openOverview(page);
    const result = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
    expect(result.violations).toEqual([]);
  });

  test(`axe finds no violations in the area overview on a phone (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openOverview(page, 100);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-cost-row="team-gamma"]')).toHaveCSS('display', 'grid');
    const result = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
    expect(result.violations).toEqual([]);
  });
}

test('without a rate the overview shows time per team and invites a rate', async ({ page }) => {
  const overview = await openOverview(page);
  const table = overview.locator('[data-area-costs]');
  await expect(table.getByRole('heading', { level: 3 })).toHaveText('Time in meetings per team');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.getByRole('columnheader', { name: 'Cost per week' })).toHaveCount(0);
  // The total share is the meeting load tile.
  const load = await overview.locator('[data-kpi="load"] b').textContent();
  await expect(table.locator('[data-cost-total]')).toContainText(`${load} Meeting load`);
  await expect(overview.locator('[data-costly]')).toHaveCount(0);
  await overview.locator('[data-rate-invite]').getByLabel('€ per hour and person').fill('100');
  await overview.locator('[data-rate-invite]').getByRole('button', { name: 'Apply' }).click();
  await expect(table.getByRole('heading', { level: 3 })).toBeFocused();
  await expect(table.getByRole('heading', { level: 3 })).toHaveText('What do our meetings cost?');
});

test('with a rate the overview shows cost per team and the most expensive meetings', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  await expect(overview.locator('[data-kpi="cost"]')).toContainText('at €100 per hour and person');
  const table = overview.locator('[data-area-costs]');
  const total = table.locator('[data-cost-total]');
  const weekly = await overview.locator('[data-kpi="cost"] b').textContent();
  await expect(total).toContainText(weekly!);
  // Every long-term cost names its period (#278): the example plans the year 2027.
  await expect(overview.locator('[data-kpi="cost"]')).toContainText(
    'in the planning horizon (2027, 52\u00a0wks)',
  );
  await table.getByRole('button', { name: 'in the planning horizon (2027, 52\u00a0wks)' }).click();
  await expect(
    table.getByRole('columnheader', { name: 'Cost in the planning horizon (2027, 52\u00a0wks)' }),
  ).toBeVisible();
  const costly = overview.locator('[data-costly]');
  await expect(costly.locator('tbody tr')).toHaveCount(5);
  // A team row opens Meetings & cadence of that team.
  await table.getByRole('button', { name: 'Open Team Gamma in Meetings & cadence' }).click();
  await expect(page.getByRole('tab', { name: 'Meetings & cadence' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Team Gamma');
});

test('a team meeting among the most expensive opens in its team', async ({ page }) => {
  const overview = await openOverview(page, 100);
  const row = overview.locator('[data-costly] tbody tr', { hasText: 'Team Delta' }).first();
  const name = (await row.locator('th').textContent())!.trim();
  await row.getByRole('button').click();
  await expect(currentUnit(page)).toHaveText('Team Delta');
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  await expect(page.locator('#panel-meetings tr[data-shown] .title')).toHaveText(name);
});

/** Team Gamma with a weekly meeting for Developers, a role nobody in Gamma holds. */
function devMeeting(ws: ReturnType<typeof areaWorkspace>) {
  const gamma = ws.teams.find((t) => t.id === 'team-gamma')!;
  gamma.events.push({
    ...structuredClone(gamma.events[0]!),
    id: 'ev-dev-sync',
    name: 'Dev sync',
    rule: { type: 'weekly', weekday: 1 } as never,
    participants: [{ roleId: 'role-dev', share: 1 }],
  });
}

test('a team row and the cost card name unfilled roles that only add cost (#264)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100, devMeeting);
  const table = overview.locator('[data-area-costs]');
  await expect(table.locator('[data-cost-row="team-gamma"] [data-unfilled]')).toHaveText(
    'incl. 1 unfilled role: Developer',
  );
  await expect(table.locator('[data-cost-row="team-delta"] [data-unfilled]')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
  expect(axe.violations).toEqual([]);

  await table.getByRole('button', { name: 'Open Team Gamma in Meetings & cadence' }).click();
  const card = page.locator('[data-costs]');
  await expect(card.locator('[data-cost-unfilled]')).toHaveText(
    'Includes 1 unfilled role (Developer), counted as one person. It adds cost but no hours.',
  );
  const axe2 = await new AxeBuilder({ page }).include('[data-costs]').analyze();
  expect(axe2.violations).toEqual([]);
});

test('the first screen holds the answers: KPI tiles at 1280×720 presenting, cost rows at 1440×900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const overview = await openOverview(page, 100);
  const row = (await overview.locator('[data-area-costs] tbody tr').first().boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(900);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/presenting/);
  for (const tile of await overview.locator('[data-kpi]').all()) {
    const box = (await tile.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(720);
  }
});

test('printing shows the "How is this counted?" text without the summary', async ({ page }) => {
  const overview = await openOverview(page, 100);
  await page.emulateMedia({ media: 'print' });
  const how = overview.locator('[data-area-costs] details.how');
  await expect(how.locator('summary')).toBeHidden();
  await expect(how.getByText(/counts only the meetings of that unit/)).toBeVisible();
});
