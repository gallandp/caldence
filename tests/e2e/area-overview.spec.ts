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
  // With an area selected the Team entry is the area's page; the overview is its second page.
  await showView(page, 'Area');
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

  // One row of twelve week cells per team, and one for the people only in the area (#334).
  const load = overview.locator('[data-load]');
  await expect(load.locator('tbody tr')).toHaveCount(5);
  await expect(load.locator('tr[data-team="area-payments"] th')).toHaveText('Only in the area');
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

test('the average leaves out the week before the horizon and the team starts (#476)', async ({
  page,
}) => {
  // The horizon starts on a Saturday and Team Beta one week later: both 0 weeks stay out.
  await page.clock.setFixedTime(new Date('2027-01-02T10:00:00'));
  const overview = await openOverview(page, undefined, (ws) => {
    ws.settings.horizon = { ...ws.settings.horizon, from: '2027-01-02' };
    const beta = ws.teams.find((t) => t.id === 'team-beta')!;
    beta.cadence = { ...beta.cadence, start: '2027-01-11' };
  });
  const load = overview.locator('[data-load]');
  await expect(load.locator('tr[data-team="team-beta"] button[data-week="2027-01-04"]')).toHaveText(
    '0',
  );
  await expect(load.locator('tr[data-team="team-alpha"] td.avg')).toHaveText('18%');
  await expect(load.locator('tr[data-team="team-beta"] td.avg')).toHaveText('8%');
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

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the week detail heading is not hidden behind the back button at ${size.width} (#302)`, async ({
    page,
  }) => {
    const overview = await openOverview(page);
    // The file is opened at the default size: on phones Open sits in the file bar's menu.
    await page.setViewportSize(size);
    await overview.locator('tr[data-team="team-alpha"] button[data-week="2027-01-18"]').click();
    const heading = page.locator('[data-week-focus="2027-01-18"]').getByRole('heading');
    await expect(heading).toHaveText('W3 · Team Alpha');
    await expect(heading).toBeInViewport({ ratio: 1 });
    const back = page.locator('button.back:visible');
    await expect(back).toBeInViewport();
    // Once the scroll has settled, the back button ends above the heading.
    await expect(async () => {
      const b = (await back.boundingBox())!;
      const h = (await heading.boundingBox())!;
      expect(h.y).toBeGreaterThanOrEqual(b.y + b.height);
    }).toPass();
  });
}

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

test('area meetings without area hours do not outline every week (#294, #307)', async ({
  page,
}) => {
  // The unchanged fixture: area meetings invite people "from every team" who have no area hours
  // yet. Load names that once per person; the strip and the week detail judge only the total
  // (limit 60 %).
  const overview = await openOverview(page);
  const cells = overview.locator('[data-load] tbody tr[data-team^="team-"] button[data-week]');
  await expect(cells).toHaveCount(48);
  await expect(
    overview.locator('[data-load] tbody tr[data-team^="team-"] button[data-week].warn'),
  ).toHaveCount(0);
  await overview.locator('tr[data-team="team-alpha"] button[data-week="2027-01-11"]').click();
  const focus = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus.locator('tbody tr')).toHaveCount(2);
  for (const row of await focus.locator('tbody tr').all()) {
    const share = await row.getByRole('cell').nth(1).innerText();
    const percent = Number(share.match(/^(\d+)%/)![1]);
    if (percent <= 60) await expect(row).not.toContainText('over the limit');
  }
  // Warnings in Meeting load agree: nobody from a team is over the limit, and each person
  // without hours in Payments gets one hint instead of a warning per week.
  await focus.getByRole('button', { name: 'Close week' }).click();
  const warnings = page.getByRole('region', { name: 'Warnings', exact: true });
  await expect(warnings.locator('li.warning', { hasText: /^Sam: .*limit/ })).toHaveCount(0);
  const hints = warnings.locator('[data-area-hints] li');
  await expect(hints.filter({ hasText: /^Sam: / })).toHaveCount(1);
  await expect(hints.filter({ hasText: /^Sam: / })).toHaveText(
    /^Sam: invited to meetings in Payments \(up to \d+\.\d h a week\), but no hours are set there\s+·\s+Set hours$/,
  );
  await expect(
    warnings.getByText(/^These lines are not the limit, which always counts all meetings/),
  ).toBeVisible();
});

test('a hint about hours in the area opens the Structure page at that person (#361)', async ({
  page,
}) => {
  await openOverview(page);
  await showView(page, 'Meeting load');
  const warnings = page.getByRole('region', { name: 'Warnings', exact: true });
  await warnings
    .locator('[data-area-hints] li', { hasText: /^Sam: / })
    .getByRole('button', { name: 'Set hours for Sam in Payments' })
    .click();
  await expect(
    page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Structure' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByRole('dialog', { name: 'Sam' });
  await expect(card.getByRole('spinbutton', { name: 'Hours in the area' })).toBeFocused();
});

test('people only in the area count on the Overview, like in Meeting load (#334)', async ({
  page,
}) => {
  // Limit 12 %: Pia (only in the area, 8 h there) spends 1 h a week in the PO forum, 12.5 %.
  const overview = await openOverview(page, undefined, (ws) => {
    ws.settings.thresholds.maxFte = 0.12;
    (ws.areas[0] as { memberHours: Record<string, number> }).memberHours['person-pia'] = 8;
  });
  const row = overview.locator('[data-load] tr[data-team="area-payments"]');
  await expect(row.locator('button.warn')).toHaveCount(12);
  await expect(row.locator('button').first()).toHaveAccessibleName(
    /^Only in the area, W1: \d+% in meetings, at least one person over the limit \(12%\)/,
  );
  await expect(overview.locator('[data-kpi="warn"] b')).toHaveText('12');
  await row.locator('button[data-week="2027-01-11"]').click();
  const focus = page.locator('[data-week-focus="2027-01-11"]');
  await expect(focus.locator('tr[data-person="person-pia"]')).toContainText('over the limit (12%)');
  await focus.getByRole('button', { name: 'Close week' }).click();
  const warnings = page.getByRole('region', { name: 'Warnings', exact: true });
  await expect(
    warnings.locator('li.warning', { hasText: /^Pia: .*over the 12% limit/ }),
  ).toHaveCount(1);
  // Her 1 h of the 8 h in the area is a hint of its own, not worded as over the limit.
  await expect(warnings.locator('[data-area-hints] li')).toContainText([
    'Pia: meetings in Payments take up to 1.0 h a week, 13% of the 8 h set there',
  ]);
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

test('Meetings & cadence of an area names its own meetings and the Overview total (#472)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  const weekly = (await overview.locator('[data-kpi="cost"] b').textContent())!;
  const kpi = (await overview.locator('[data-kpi="cost"]').textContent())!;
  const horizon = /(€[\d,]+) in the planning horizon/.exec(kpi)![1];
  await showView(page, 'Meetings & cadence');
  const card = page.locator('[data-costs]');
  await expect(card.locator('h3')).toHaveText(
    'Costs of the meetings in the area, without team meetings',
  );
  const total = card.locator('[data-cost-area-total]');
  await expect(total).toContainText(
    `Total in the area with all teams: ${weekly} / week, ${horizon} in the planning horizon`,
  );
  await total.getByRole('button', { name: 'Open the overview of Payments' }).click();
  await expect(page.locator('[data-area-overview]')).toBeVisible();
  await expect(currentUnit(page)).toHaveText('Payments');
  // A team's card is unchanged.
  await pickUnit(page, 'Team Alpha');
  await showView(page, 'Meetings & cadence');
  await expect(page.locator('[data-costs] h3')).toHaveText('Costs');
  await expect(page.locator('[data-cost-area-total]')).toHaveCount(0);
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

test('a team that differs says why in its cadence cell; "Differ:" names lead there (#478)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  const row = (id: string) => overview.locator(`[data-cost-row="${id}"]`);
  await expect(row('team-gamma').locator('[data-step-reason]')).toHaveText(
    'differs: 3-week periods do not fit into 10 weeks',
  );
  await expect(row('team-delta').locator('[data-step-reason]')).toHaveText(
    'differs: starts on Wednesday',
  );
  await expect(row('team-alpha').locator('[data-step-reason]')).toHaveCount(0);

  // The names in the key figure are links to the rows.
  const tag = overview.locator('[data-kpi="cadence"] .tag');
  await tag.getByRole('button', { name: 'Team Delta: why, in the table below' }).click();
  await expect(row('team-delta')).toBeInViewport();
  await expect(row('team-delta').locator('th button')).toBeFocused();
  // The row lights up for a moment, so the room sees where the page went (#494).
  await expect(row('team-delta')).toHaveClass(/flash/);
  await expect(row('team-delta')).not.toHaveClass(/flash/, { timeout: 4000 });

  // On a phone card the reason stays, under the name.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row('team-gamma').locator('[data-step-reason]')).toBeVisible();
  await tag.getByRole('button', { name: 'Team Gamma: why, in the table below' }).click();
  await expect(row('team-gamma')).toHaveClass(/flash/);
  await expect(row('team-alpha').locator('td.extra').first()).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('presenting, a cadence row opens its what-if; a new start aligns the team (#444)', async ({
  page,
}) => {
  // Without Gamma, only Delta differs: its periods start on Wednesdays.
  const overview = await openOverview(page, undefined, (ws) => {
    (ws.areas[0] as { teamIds: string[] }).teamIds = ['team-alpha', 'team-beta', 'team-delta'];
  });
  const kpi = overview.locator('[data-kpi="cadence"]');
  await expect(kpi.locator('b')).toHaveText('2 of 3');
  // Editing the file has no what-if: the pencil is for presenting only.
  await expect(overview.locator('[data-whatif-unit]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(overview).toBeVisible();

  const open = overview.getByRole('button', { name: 'What if: Team Delta', exact: true });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Delta' });
  await expect(sheet.getByLabel('Start date')).toHaveValue('2027-01-06');
  // Without a start date there is nothing to apply.
  await sheet.getByLabel('Start date').fill('');
  await expect(sheet.getByText('Enter a valid start date.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await sheet.getByLabel('Start date').fill('2027-01-04');
  await expect(sheet).toContainText('2 → 3 of 3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();

  // Still on the Overview, now aligned; the what-if bar counts the change.
  await expect(kpi.locator('b')).toHaveText('3 of 3');
  await expect(kpi.locator('.tag')).toHaveText('All aligned');
  await expect(overview.locator('[data-team-row="team-delta"]')).toContainText('aligned');
  await expect(overview.locator('[data-cost-row="team-delta"] [data-step-reason]')).toHaveCount(0);
  const whatIf = page.getByRole('region', { name: 'What if' });
  await expect(whatIf).toContainText('What if · 1 change');
  // The bar names the change (#506).
  await expect(whatIf.locator('[data-whatif-changes]')).toHaveText(
    'Team Delta: flow period start 01/06/2027 → 01/04/2027',
  );
  await expect(whatIf.locator('[data-whatif-lost]')).toHaveCount(0);

  // The area row has its what-if too; ending the presentation discards the change.
  await expect(overview.getByRole('button', { name: 'What if: Payments' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
  await expect(kpi.locator('b')).toHaveText('2 of 3');
  await expect(overview.locator('[data-team-row="team-delta"]')).toContainText(
    'starts on Wednesday',
  );
});

test('presenting, the what-if bar names a team that falls out of step, in warning colour (#506)', async ({
  page,
}) => {
  const overview = await openOverview(page, undefined, (ws) => {
    (ws.areas[0] as { teamIds: string[] }).teamIds = ['team-alpha', 'team-beta', 'team-delta'];
  });
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await overview.getByRole('button', { name: 'What if: Team Alpha', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await sheet.getByLabel('Length (weeks)').fill('3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  const whatIf = page.getByRole('region', { name: 'What if' });
  await expect(whatIf.locator('[data-whatif-changes]')).toHaveText(
    'Team Alpha: sprint 2 → 3 weeks',
  );
  const lost = whatIf.locator('[data-whatif-lost]');
  await expect(lost).toHaveText(/^Team Alpha no longer aligned: .+/);
  const colour = (sel: string) =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s)!).color, sel);
  const warn = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--warn)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(await colour('[data-whatif-lost]')).toBe(warn);
  // Print keeps the same text.
  await page.emulateMedia({ media: 'print' });
  await expect(lost).toBeVisible();
  await expect(whatIf.locator('[data-whatif-changes]')).toHaveText(
    'Team Alpha: sprint 2 → 3 weeks',
  );
  // On a phone the bar wraps; the page does not scroll sideways.
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('presenting, "Align with …" fits a team to the area cadence in one tap (#463)', async ({
  page,
}) => {
  const overview = await openOverview(page);
  const kpi = overview.locator('[data-kpi="cadence"]');
  await expect(kpi.locator('b')).toHaveText('2 of 4');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await overview.getByRole('button', { name: 'What if: Team Gamma', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Gamma' });
  // 3-week sprints do not fit the 10-week PI: the longest that does is 2 weeks.
  await sheet.getByRole('button', { name: 'Align with Payments' }).click();
  await expect(sheet.getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(sheet.getByLabel('Start date')).toHaveValue('2027-01-04');
  await expect(sheet).toContainText('2 → 3 of 4');
  // Once the draft fits, the button is gone.
  await expect(sheet.getByRole('button', { name: 'Align with Payments' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeFocused();
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(kpi.locator('b')).toHaveText('3 of 4');
  // The area's own cadence has nothing to align with.
  await overview.getByRole('button', { name: 'What if: Payments', exact: true }).click();
  const own = page.getByRole('dialog', { name: 'Cadence · Payments' });
  await expect(own.getByLabel('Length (weeks)')).toBeVisible();
  await expect(own.getByRole('button', { name: /^Align with/ })).toHaveCount(0);
  await own.getByRole('button', { name: 'Cancel' }).click();
  // An aligned team has nothing to align.
  await overview.getByRole('button', { name: 'What if: Team Alpha', exact: true }).click();
  const alpha = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await expect(alpha.getByLabel('Length (weeks)')).toBeVisible();
  await expect(alpha.getByRole('button', { name: /^Align with/ })).toHaveCount(0);
});

test('presenting, "Align with …" takes the saved peer reference (#463)', async ({ page }) => {
  // No area cadence; Alpha and Beta share 2-week sprints, Gamma has 3 weeks.
  const overview = await openOverview(page, undefined, (ws) => {
    const area = ws.areas[0] as { teamIds: string[]; cadence?: unknown };
    delete area.cadence;
    area.teamIds = ['team-alpha', 'team-beta', 'team-gamma'];
    ws.teams[1]!.cadence = { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' };
  });
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await overview.getByRole('button', { name: 'What if: Team Gamma', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Gamma' });
  await sheet.getByRole('button', { name: 'Align with Team Alpha' }).click();
  await expect(sheet.getByLabel('Length (weeks)')).toHaveValue('2');
  await expect(sheet).toContainText('2 → 3 of 3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(overview.locator('[data-kpi="cadence"] b')).toHaveText('3 of 3');
  // The reference team itself gets no button.
  await overview.getByRole('button', { name: 'What if: Team Alpha', exact: true }).click();
  const alpha = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await expect(alpha.getByLabel('Length (weeks)')).toBeVisible();
  await expect(alpha.getByRole('button', { name: /^Align with/ })).toHaveCount(0);
});

test('presenting, a what-if on the reference team shows that team as differing (#470)', async ({
  page,
}) => {
  // No area cadence; Alpha and Beta share 2-week sprints, Gamma has 3 weeks.
  const overview = await openOverview(page, undefined, (ws) => {
    const area = ws.areas[0] as { teamIds: string[]; cadence?: unknown };
    delete area.cadence;
    area.teamIds = ['team-alpha', 'team-beta', 'team-gamma'];
    ws.teams[1]!.cadence = { kind: 'sprint', lengthWeeks: 2, start: '2027-01-04' };
  });
  const kpi = overview.locator('[data-kpi="cadence"]');
  const lead = overview.locator('.lead');
  await expect(kpi.locator('b')).toHaveText('2 of 3');
  await expect(lead).toContainText('compared with the cadence of Team Alpha, which most share');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await overview.getByRole('button', { name: 'What if: Team Alpha', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Cadence · Team Alpha' });
  await sheet.getByLabel('Length (weeks)').fill('4');
  await expect(sheet).toContainText('2 → 1 of 3');
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(sheet).toBeHidden();

  // Beta keeps the saved reference; Alpha, which changed, is the one out of step.
  await expect(kpi.locator('b')).toHaveText('1 of 3');
  await expect(kpi.locator('.tag')).toHaveText('Differ: Team Alpha and Team Gamma');
  await expect(overview.locator('[data-team-row="team-alpha"]')).toContainText(
    '4 instead of 2 weeks',
  );
  await expect(overview.locator('[data-team-row="team-beta"]')).toContainText('aligned');
  await expect(lead).toContainText('compared with the cadence of Team Alpha before the what-ifs');
});

test('when no two teams share a cadence, the lead says so (#470)', async ({ page }) => {
  const overview = await openOverview(page, undefined, (ws) => {
    delete (ws.areas[0] as { cadence?: unknown }).cadence;
  });
  await expect(overview.locator('[data-kpi="cadence"] b')).toHaveText('1 of 4');
  await expect(overview.locator('.lead')).toContainText(
    'compared with the cadence of Team Alpha, as no two teams share a cadence',
  );
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

test('on phones the most expensive meetings are cards with the cost in view (#283)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  await page.setViewportSize({ width: 390, height: 844 });
  const costly = overview.locator('[data-costly]');
  const first = costly.locator('tbody tr').first();
  await expect(first).toHaveCSS('display', 'grid');
  await expect(costly.locator('thead')).toHaveCSS('position', 'absolute');
  // Nothing scrolls sideways: not the page, not the table region.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const region = costly.getByRole('region');
  expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('td.cost')).toHaveText(/€/);
  await expect(first.locator('td.cost')).toBeInViewport({ ratio: 1 });
  await expect(first.locator('th')).toBeInViewport({ ratio: 1 });
  // The card still opens its meeting.
  const name = (await first.locator('th').textContent())!.trim();
  await first.getByRole('button').click();
  await expect(page.locator('#panel-meetings')).toBeVisible();
  await expect(page.locator('#panel-meetings [data-shown] .title')).toHaveText(name);
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
    await expect(page.locator('[data-costly] tbody tr').first()).toHaveCSS('display', 'grid');
    const result = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
    expect(result.violations).toEqual([]);
  });
}

test('an area meeting for a role nobody holds counts one person in the area tile (#360)', async ({
  page,
}) => {
  const overview = await openOverview(page, undefined, (ws) => {
    const area = ws.areas[0] as { events: object[] };
    area.events = [
      {
        ...structuredClone(area.events[0]!),
        rule: { type: 'weekly', weekday: 3 },
        participants: [{ roleId: 'role-dev', share: 1 }],
      },
    ];
  });
  const tile = overview.locator('[data-kpi="area"]');
  await expect(tile.locator('b')).not.toHaveText('0 h');
  await expect(tile).toContainText('per week, 1 person');
});

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

test('a team row and the cost card name unfilled roles, counted as one person (#264, #335)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100, devMeeting);
  const table = overview.locator('[data-area-costs]');
  await expect(table.locator('[data-cost-row="team-gamma"] [data-unfilled]')).toHaveText(
    'incl. 1 unfilled role: Developer',
  );
  await expect(table.locator('[data-cost-row="team-delta"] [data-unfilled]')).toHaveCount(0);
  // The hours count the Developer as one person too: hours × rate = cost (#335).
  const gamma = table.locator('[data-cost-row="team-gamma"] td.num');
  await expect(gamma.nth(0)).toHaveText('6.8 h');
  await expect(gamma.nth(1)).toContainText('678');
  const axe = await new AxeBuilder({ page }).include('[data-area-overview]').analyze();
  expect(axe.violations).toEqual([]);

  await table.getByRole('button', { name: 'Open Team Gamma in Meetings & cadence' }).click();
  const card = page.locator('[data-costs]');
  await expect(card.locator('[data-cost-unfilled]')).toHaveText(
    'Includes 1 unfilled role (Developer), counted as one person in the cost and the hours.',
  );
  const axe2 = await new AxeBuilder({ page }).include('[data-costs]').analyze();
  expect(axe2.violations).toEqual([]);
});

test('each team row and its cost card add what its people spend in area meetings (#336)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  const table = overview.locator('[data-area-costs]');
  // Kim (PO) attends the PO forum, 1 h, and Lou (SM) the Scrum of Scrums, 0.5 h, each week.
  const share = table.locator('[data-cost-row="team-gamma"] [data-area-share]');
  // Gamma runs 3-week sprints, so per week the line also names the sprint (#434); Delta is in flow.
  await expect(share).toHaveText('+ €150 / week, €450 / sprint in meetings in the area');
  await expect(table.locator('[data-cost-row="team-delta"] [data-area-share]')).toHaveText(
    /^\+ €[\d,]+ \/ week in meetings in the area$/,
  );
  await table.getByRole('button', { name: 'in the planning horizon (2027, 52\u00a0wks)' }).click();
  await expect(share).toHaveText(/^\+ €[\d,]+ in meetings in the area$/);

  await table.getByRole('button', { name: 'Open Team Gamma in Meetings & cadence' }).click();
  const card = page.locator('[data-costs] [data-cost-area-share]');
  await expect(card).toContainText('These figures count only the meetings of Team Gamma itself.');
  // Gamma runs 3-week sprints, so the line also names the sprint, like the card above it (#366).
  await expect(card).toContainText('+ €150 / week, €450 / sprint and €');
  await expect(card).toContainText('in meetings in the area for the people of Team Gamma.');
  // Meeting load for the team shows the same card line, per sprint too (#434).
  await showView(page, 'Meeting load');
  await expect(page.locator('[data-costs] [data-cost-area-share]')).toContainText(
    '+ €150 / week, €450 / sprint and €',
  );
  await expect(page.locator('[data-costs] [data-cost-cadence]')).toBeVisible();
});

test('a team without an area shows no area share in its cost card (#336)', async ({ page }) => {
  await openOverview(page, 100, (ws) => {
    const area = ws.areas[0] as { teamIds: string[] };
    area.teamIds = area.teamIds.filter((id) => id !== 'team-delta');
  });
  await pickUnit(page, 'Team Delta');
  await showView(page, 'Meetings & cadence');
  await expect(page.locator('[data-costs] [data-cost-week]')).toBeVisible();
  await expect(page.locator('[data-cost-area-share]')).toHaveCount(0);
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

test('the key figure tiles and the cards keep the same gap at 1440, 1280 presenting and 390 (#293)', async ({
  page,
}) => {
  const overview = await openOverview(page, 100);
  // The gaps between the overview's blocks: key figures, clash line, cost card, ...
  const gaps = () =>
    overview.evaluate((el) => {
      const blocks = ':scope > .kpis, :scope > [data-clashes], :scope > .card';
      const boxes = [...el.querySelectorAll(blocks)].map((c) => c.getBoundingClientRect());
      return boxes.slice(1).map((b, i) => Math.round(b.top - boxes[i]!.bottom));
    });
  const sameGap = async () => {
    const [kpiToCost, ...others] = await gaps();
    expect(kpiToCost).toBeGreaterThanOrEqual(16);
    for (const gap of others) expect(gap).toBe(kpiToCost);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await sameGap();
  await page.setViewportSize({ width: 390, height: 844 });
  await sameGap();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/presenting/);
  await sameGap();
});

test('printing shows the "How is this counted?" text without the summary', async ({ page }) => {
  const overview = await openOverview(page, 100);
  await page.emulateMedia({ media: 'print' });
  const how = overview.locator('[data-area-costs] details.how');
  await expect(how.locator('summary')).toBeHidden();
  await expect(how.getByText(/counts only the meetings of that unit/)).toBeVisible();
});

test('the load tile names who is over the limit instead of the average (#448)', async ({
  page,
}) => {
  // Pia attends area meetings without weekly hours anywhere: over the limit, like in Meeting load.
  const overview = await openOverview(page);
  const tag = overview.locator('[data-kpi="load"] .tag');
  await expect(tag).toHaveText('1 person over the 60% limit: Pia');
  await expect(tag).toHaveClass(/warn/);

  // Hide names in present mode hides them here too.
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('banner').getByLabel('Hide names').check();
  await expect(tag).toHaveText(/^1 person over the 60% limit: Person \d+$/);
  await page.getByRole('banner').getByRole('button', { name: 'End presentation' }).click();

  // Several: the count and the first three, highest share first.
  await openOverview(page, undefined, (ws) => {
    ws.settings.thresholds.maxFte = 0.12;
    (ws.areas[0] as { memberHours: Record<string, number> }).memberHours['person-pia'] = 8;
  });
  await expect(tag).toHaveText(/^5 people over the 12% limit: \w+, \w+, \w+ …$/);

  // Nobody over: the average again.
  await openOverview(page, undefined, (ws) => {
    (ws.areas[0] as { memberHours: Record<string, number> }).memberHours['person-pia'] = 8;
  });
  await expect(tag).toHaveText('below the 60% limit');
  await expect(tag).toHaveClass(/ok/);
});

test('a name over the limit opens Meeting load at that person, also with hidden names (#462)', async ({
  page,
}) => {
  const overview = await openOverview(page);
  const tag = overview.locator('[data-kpi="load"] .tag');
  await expect(tag).toHaveText('1 person over the 60% limit: Pia');
  await tag.getByRole('button', { name: 'Show Pia in Meeting load' }).click();
  await expect(page.getByRole('tab', { name: 'Meeting load' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(currentUnit(page)).toHaveText('Payments');
  const who = page.locator('#panel-load tr[data-person="person-pia"] button.who');
  await expect(who).toHaveAttribute('aria-expanded', 'true');
  await expect(who).toBeFocused();
  await expect(who).toBeInViewport();

  // Presenting with hidden names: the link keeps the hidden name and still opens the row.
  await page.getByRole('button', { name: 'Payments overview' }).click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('banner').getByLabel('Hide names').check();
  const hidden = overview.locator('[data-kpi="load"] .tag button');
  await expect(hidden).toHaveText(/^Person \d+$/);
  await expect(hidden).toHaveAccessibleName(/^Show Person \d+ in Meeting load$/);
  await hidden.click();
  await expect(who).toHaveAttribute('aria-expanded', 'true');
  await expect(who).toHaveText(/^Person \d+$/);
  await page.getByRole('banner').getByRole('button', { name: 'End presentation' }).click();

  // Several: each of the first three names is a button, the third opens its own row.
  await openOverview(page, undefined, (ws) => {
    ws.settings.thresholds.maxFte = 0.12;
    (ws.areas[0] as { memberHours: Record<string, number> }).memberHours['person-pia'] = 8;
  });
  const names = overview.locator('[data-kpi="load"] .tag button');
  await expect(names).toHaveCount(3);
  const third = (await names.nth(2).textContent())!;
  await names.nth(2).click();
  const row = page.locator('#panel-load tr[data-person] button.who', {
    hasText: new RegExp(`^${third}$`),
  });
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(row).toBeFocused();
});
