import { expect, test, type Page } from '@playwright/test';
import { openExample, pickUnit, showView, useFileFallback } from './helpers';
import { ALEX } from './weeks-load-expected';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-03-10T12:00:00'));
});

async function openLoad(page: Page) {
  await openExample(page);
  await showView(page, 'Meeting load');
  return page.getByRole('tabpanel', { name: 'Meeting load' });
}

/** The Calendar shows the week level at ISO week `n` with Alex in the Person filter. */
async function expectAlexWeek(page: Page, n: number) {
  const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(calendar.locator('.period')).toContainText(`Week ${n}:`);
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('person-alex');
}

test('a week in a warning opens that week in the Calendar with the person filter (#343)', async ({
  page,
}) => {
  const panel = await openLoad(page);
  const warnings = panel.getByRole('region', { name: 'Warnings', exact: true });
  const [week] = ALEX.warnings[0]!;
  const link = warnings
    .getByRole('listitem')
    .filter({ hasText: 'Alex:' })
    .getByRole('button', { name: `Show W${week} for Alex in the Calendar` });
  await link.click();
  await expectAlexWeek(page, week);
  // The Person filter stays set when the view changes back.
  await showView(page, 'Meeting load');
  await expect(
    panel.getByRole('table', { name: 'People' }).locator('tbody tr[data-person]'),
  ).toHaveCount(1);
});

test('the peak week cell links to the Calendar week, also at the team level (#343)', async ({
  page,
}) => {
  const panel = await openLoad(page);
  await pickUnit(page, 'Team Beta');
  const alex = panel.locator('tr[data-person="person-alex"]');
  await alex
    .getByRole('button', { name: `Show W${ALEX.peakWeek} for Alex in the Calendar` })
    .click();
  await expectAlexWeek(page, ALEX.peakWeek);
});

test('the drill-in lists the meetings of each team, one-offs marked (#343)', async ({ page }) => {
  const panel = await openLoad(page);
  const people = panel.getByRole('table', { name: 'People' });
  const alex = people.getByRole('button', { name: 'Alex', exact: true });
  await alex.click();
  const detail = page.locator(`#${await alex.getAttribute('aria-controls')}`);
  const alpha = detail.locator('details').filter({ hasText: 'Team Alpha' });
  // Collapsed per team: the meetings show on request.
  const meetings = alpha.locator('.meetings');
  await expect(meetings).toBeHidden();
  await alpha.locator('summary').click();
  await expect(meetings).toBeVisible();
  const kickoff = meetings.getByRole('listitem').filter({ hasText: 'Kick-off' });
  await expect(kickoff).toContainText('one-off');
  await expect(kickoff).toContainText('4.0 h');
  const recurring = meetings.getByRole('listitem').filter({ hasText: 'h/week' }).first();
  await expect(recurring).toContainText(/Weekly|Every|On |Day /);
  // Hours that include preparation say so, the same words as the cost rows (#474).
  await expect(meetings.getByRole('listitem').filter({ hasText: 'Sprint Review' })).toContainText(
    'incl. 50% preparation',
  );
  await expect(meetings.getByRole('listitem').filter({ hasText: 'Kick-off' })).not.toContainText(
    'preparation',
  );
  // The note on top names what the hours count.
  await expect(panel.locator('[data-meeting-only]')).toHaveText(
    'Meeting time only, including preparation and travel to on-site meetings. Other work does not count here.',
  );
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // The example area has no warnings: its peak weeks are the same kind of link.
  test('a peak week link works at the area level (#343)', async ({ page }) => {
    const panel = await openLoad(page);
    await pickUnit(page, 'Commerce');
    const link = panel
      .getByRole('table', { name: 'People' })
      .getByRole('button', { name: /^Show W\d+ for .+ in the Calendar$/ })
      .first();
    const [, week, person] = /^Show W(\d+) for (.+) in the Calendar$/.exec(
      (await link.getAttribute('aria-label'))!,
    )!;
    await link.click();
    const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
    await expect(calendar.locator('.period')).toContainText(`Week ${week}:`);
    const select = page.getByLabel('Person', { exact: true });
    await expect(select.locator('option:checked')).toHaveText(person!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});
