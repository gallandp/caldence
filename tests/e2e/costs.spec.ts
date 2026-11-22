import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openExample, pickUnit, setLanguage, showView } from './helpers';

test.use({ locale: 'en-US' });

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

async function setRate(page: Page, value: string) {
  await tab(page, 'Settings');
  const field = page.getByLabel('Hourly rate (optional)');
  await field.fill(value);
  await field.press('Enter');
}

test('costs appear only while an hourly rate is set', async ({ page }) => {
  await openExample(page);

  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
  await tab(page, 'Meeting load');
  await expect(page.locator('[data-costs]')).toHaveCount(0);

  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
  // Weekly Sync: 15 minutes, Product Owner and Scrum Master, one person each.
  const sync = page.getByRole('row', { name: /Weekly Sync/ });
  await expect(sync.locator('[data-cost]')).toContainText('€50');
  await expect(sync.locator('[data-cost]')).toContainText('Ø €50 / week');
  const card = page.locator('[data-costs]');
  await expect(card.getByRole('heading', { name: 'Costs' })).toBeVisible();
  await expect(card).toContainText('At €100 per hour and person');
  await tab(page, 'Meeting load');
  await expect(page.locator('[data-costs] [data-cost-week]')).toContainText('/ week');
  await expect(page.locator('[data-costs] [data-cost-horizon]')).toContainText(
    'in the planning horizon (2027, 52\u00a0wks)',
  );
  // Why weekly × 52 differs from the year figure (#512).
  await expect(page.locator('[data-costs] [data-cost-horizon-note]')).toContainText(
    / \/ week over 52 weeks, without holidays/,
  );

  await setRate(page, '');
  await tab(page, 'Meetings & cadence');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

test('costs show per sprint and the preparation share; flow teams per week only', async ({
  page,
}) => {
  await openExample(page);
  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  // Team Alpha: two-week sprints. Weekly Sync: €50 a week, no preparation.
  const sync = page.getByRole('row', { name: /Weekly Sync/ });
  await expect(sync.locator('[data-cost-cadence]')).toHaveText('Ø €100 / sprint');
  await expect(sync.locator('[data-cost-prep]')).toHaveCount(0);
  const planning = page.getByRole('row', { name: /Sprint Planning/ });
  await expect(planning.locator('[data-cost-prep]')).toHaveText('incl. 25% preparation');
  const card = page.locator('[data-costs]');
  // Twice the unrounded weekly cost, rounded once at the end.
  await expect(card.locator('[data-cost-week]')).toContainText('€561');
  await expect(card.locator('[data-cost-cadence]')).toHaveText('€1,123 / sprint');

  await pickUnit(page, 'Team Beta');
  await expect(page.locator('[data-cost-cadence]')).toHaveCount(0);
  await expect(page.locator('[data-costs] [data-cost-week]')).toBeVisible();

  // The Commerce area plans in 10-week PIs. PO Forum: weekly, 60 min + 10 %, one PO at €100.
  await pickUnit(page, 'Commerce');
  const forum = page.getByRole('row', { name: /PO Forum/ });
  await expect(forum.locator('[data-cost-cadence]')).toHaveText(/^Ø €[\d,]+ \/ PI$/);
  await expect(page.locator('[data-costs] [data-cost-cadence]')).toContainText('/ PI');

  await pickUnit(page, 'Team Alpha');
  await setLanguage(page, 'de');
  await expect(sync.locator('[data-cost-cadence]')).toHaveText('Ø 100 € / Sprint');
  await expect(planning.locator('[data-cost-prep]')).toHaveText('inkl. 25 % Vorbereitung');
});

test('a row leads with the cost per week, and Cost ranks as the area Overview does (#443)', async ({
  page,
}) => {
  await openExample(page);
  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  const panel = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
  const titles = () => panel.locator('tr.row .title').allTextContents();
  // Sprint Planning: €500 a meeting, every two weeks.
  const planning = panel.getByRole('row', { name: /Sprint Planning/ });
  await expect(planning.locator('[data-cost-avg]')).toHaveText('Ø €250 / week');
  await expect(planning.locator('[data-cost-each]')).toHaveText('€500 per meeting');
  await expect(planning.locator('[data-cost-cadence]')).toHaveText('Ø €500 / sprint');
  const kickoff = panel.getByRole('row', { name: /Kick-off Workshop/ });
  await expect(kickoff.locator('[data-cost-each]')).toHaveText('€800 one-off');
  await expect(kickoff.locator('[data-cost-avg]')).toHaveCount(0);
  const release = panel.getByRole('row', { name: /Release Readiness Review/ });
  await expect(release.locator('[data-cost-each]')).toHaveText('€375 per milestone');

  // Most expensive per week first; one-off and milestone meetings have no weekly average.
  await panel.getByRole('button', { name: /^Cost/ }).click();
  expect(await titles()).toEqual([
    'Sprint Planning',
    'Sprint Review',
    'Backlog Refinement',
    'Weekly Sync',
    'Stakeholder Update',
    'Kick-off Workshop',
    'Release Readiness Review',
  ]);

  // The area Overview's "Most expensive meetings" list the same order for every unit.
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await page.getByRole('group', { name: 'Page' }).getByRole('button', { name: 'Overview' }).click();
  const rows = page.locator('[data-costly] tbody tr');
  await expect(rows.first()).toBeVisible();
  const ranked = await rows.evaluateAll((trs) =>
    trs.map((tr) => ({
      name: tr.querySelector('th')!.textContent!.trim(),
      unit: tr.querySelector('td.where')!.textContent!.trim(),
    })),
  );
  const units = [...new Set(ranked.map((r) => r.unit))];
  expect(units.length).toBeGreaterThan(1);
  for (const unit of units) {
    await pickUnit(page, unit);
    await showView(page, 'Meetings & cadence');
    // The sort order may stay from the last unit; Cost starts with the most expensive.
    const th = panel.getByRole('columnheader', { name: /^Cost/ });
    if ((await th.getAttribute('aria-sort')) !== 'descending') await th.getByRole('button').click();
    await expect(th).toHaveAttribute('aria-sort', 'descending');
    const names = ranked.filter((r) => r.unit === unit).map((r) => r.name);
    expect((await titles()).filter((n) => names.includes(n))).toEqual(names);
  }
});

test('an hourly rate of 0 shows an error and is not committed', async ({ page }) => {
  await openExample(page);
  await setRate(page, '0');
  await expect(page.getByLabel('Hourly rate (optional)')).toHaveAttribute('aria-invalid', 'true');
  await tab(page, 'Meetings & cadence');
  await expect(page.locator('[data-costs]')).toHaveCount(0);
});

for (const view of ['Meetings & cadence', 'Meeting load', 'Settings']) {
  test(`axe finds no violations with costs in ${view}`, async ({ page }) => {
    await openExample(page);
    await setRate(page, '85');
    await tab(page, view);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('without a rate the cost card invites one and applies it to the file', async ({ page }) => {
  await openExample(page);
  await tab(page, 'Meetings & cadence');
  const invite = page.locator('[data-rate-invite]');
  await expect(invite).toContainText('Applies to the whole file');
  const field = invite.getByLabel('€ per hour and person');
  await field.fill('0');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(invite.getByRole('alert')).toContainText('Enter an amount above 0');
  await field.fill('1.000');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(invite.getByRole('alert')).toBeVisible();
  await field.fill('85,5');
  await invite.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-rate-invite]')).toHaveCount(0);
  await expect(page.locator('[data-costs] h3')).toBeFocused();
  await expect(page.locator('[data-costs]')).toContainText('At €86 per hour and person');
  await tab(page, 'Settings');
  await expect(page.getByLabel('Hourly rate (optional)')).toHaveValue('85.5');
});

test('an on-site meeting adds its travel time to cost and load (#309)', async ({ page }) => {
  await openExample(page);
  await setRate(page, '100');
  await tab(page, 'Meetings & cadence');
  const panel = page.getByRole('tabpanel', { name: 'Meetings & cadence' });
  const sync = panel.getByRole('row', { name: /Weekly Sync/ });
  // 15 minutes, Product Owner and Scrum Master: €50 remote.
  await expect(sync.locator('[data-cost]')).toContainText('Ø €50 / week');
  await expect(sync.locator('[data-place]')).toHaveCount(0);

  await sync.getByRole('button', { name: 'Edit Weekly Sync' }).click();
  const form = panel.getByRole('region', { name: /Weekly Sync/ });
  const place = form.getByRole('group', { name: 'Format' });
  await expect(place.getByRole('button', { name: 'Remote' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(form.getByLabel('Travel (minutes)')).toHaveCount(0);
  await place.getByRole('button', { name: 'On site' }).click();
  await expect(form.getByLabel('Travel (minutes)')).toHaveValue('30');
  // A day and more is refused at the field, which takes the focus.
  await form.getByLabel('Travel (minutes)').fill('2000');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByLabel('Travel (minutes)')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Travel (minutes)')).toBeFocused();
  await form.getByLabel('Travel (minutes)').fill('15');
  expect(await new AxeBuilder({ page }).include('form').analyze()).toHaveProperty('violations', []);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();

  // 15 + 15 minutes for two people: twice the cost.
  await expect(sync.locator('[data-place]')).toHaveText('On site · 15 min travel');
  await expect(sync.locator('[data-cost-travel]')).toHaveText('incl. 15 min travel');
  await expect(sync.locator('[data-cost]')).toContainText('Ø €100 / week');

  // Back to remote: the travel time is gone again.
  await sync.getByRole('button', { name: 'Edit Weekly Sync' }).click();
  await place.getByRole('button', { name: 'Remote' }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(sync.locator('[data-place]')).toHaveCount(0);
  await expect(sync.locator('[data-cost]')).toContainText('Ø €50 / week');
});
