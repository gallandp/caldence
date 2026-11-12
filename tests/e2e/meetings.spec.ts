import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openExample, useFileFallback, teamAction } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const panel = (page: Page) => page.getByRole('tabpanel', { name: /Meetings|Termine/ });
const row = (page: Page, name: string) => panel(page).getByRole('row').filter({ hasText: name });

async function openMeetings(page: Page) {
  await openExample(page);
  await page.getByRole('tab', { name: 'Meetings', exact: true }).click();
  await expect(panel(page).getByRole('table', { name: 'Meetings of Team Alpha' })).toBeVisible();
}

/** Opens the new-meeting form by keyboard and returns it with the name filled in. */
async function startNew(page: Page, name: string): Promise<Locator> {
  const add = panel(page).getByRole('button', { name: 'Add meeting' });
  await add.focus();
  await page.keyboard.press('Enter');
  const form = panel(page).getByRole('region', { name: 'New meeting' });
  await expect(form.getByLabel('Name', { exact: true })).toBeFocused();
  await form.getByLabel('Name', { exact: true }).fill(name);
  return form;
}

async function submitByKeyboard(page: Page, form: Locator) {
  await form.getByLabel('Name', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(form).toBeHidden();
  await expect(panel(page).getByRole('button', { name: 'Add meeting' })).toBeFocused();
}

const rules: {
  name: string;
  fill: (form: Locator) => Promise<void>;
  summary: string | RegExp;
}[] = [
  {
    name: 'M weekly',
    fill: async (f) => {
      await f.getByLabel('Weekday').selectOption({ label: 'Wednesday' });
    },
    summary: 'Weekly on Wednesday',
  },
  {
    name: 'M every n',
    fill: async (f) => {
      await f.getByLabel('Repeats').selectOption('every-n-weeks');
      await f.getByLabel('Weekday').selectOption({ label: 'Tuesday' });
      await f.getByLabel('Interval (weeks)').fill('2');
    },
    summary: 'Every 2 weeks on Tuesday',
  },
  {
    name: 'M monthly',
    fill: async (f) => {
      await f.getByLabel('Repeats').selectOption('monthly-nth-weekday');
      await f.getByLabel('Weekday').selectOption({ label: 'Friday' });
      await f.getByLabel('Occurrence').selectOption({ label: '2nd' });
    },
    summary: '2nd Friday of the month',
  },
  {
    name: 'M cadence',
    fill: async (f) => {
      await f.getByLabel('Repeats').selectOption('cadence-day');
      await f.getByLabel('Day', { exact: true }).fill('3');
    },
    summary: 'Day 3 of each sprint',
  },
  {
    name: 'M milestone',
    fill: async (f) => {
      await f.getByLabel('Repeats').selectOption('cycle-milestone');
      await f.getByLabel('Offset (days, negative = before)').fill('3');
    },
    summary: '3 days after Release (Release 1)',
  },
  {
    name: 'M once',
    fill: async (f) => {
      await f.getByLabel('Repeats').selectOption('once');
      await f.getByLabel('Date', { exact: true }).fill('2027-03-05');
    },
    summary: /Once on .*March 5, 2027/,
  },
];

test('one meeting of each rule type is created by keyboard and summarised', async ({ page }) => {
  await openMeetings(page);
  for (const r of rules) {
    const form = await startNew(page, r.name);
    await r.fill(form);
    await submitByKeyboard(page, form);
    await expect(row(page, r.name)).toContainText(r.summary);
  }
  // The default participant is the first role, always present.
  await expect(row(page, 'M weekly')).toContainText('Product Owner');
  await expect(row(page, 'M weekly')).toContainText('09:00');
  await expect(row(page, 'M weekly')).toContainText('60 min');
});

test('selected weekdays show on those days only, and none selected is refused inline', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2027-03-15T12:00:00'));
  await openMeetings(page);
  const form = await startNew(page, 'M days');
  await form.getByLabel('Repeats').selectOption('weekdays');
  const group = form.getByRole('group', { name: 'Weekdays' });
  for (const d of ['Tuesday', 'Wednesday', 'Friday']) await group.getByLabel(d).uncheck();
  await group.getByLabel('Thursday').check();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();
  await expect(row(page, 'M days')).toContainText('On Monday and Thursday');

  // March 2027: Monday the 15th and Thursday the 18th have the meeting, Tuesday the 16th not.
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  const cal = page.getByRole('tabpanel', { name: 'Calendar' });
  for (const [date, has] of [
    ['2027-03-15', true],
    ['2027-03-16', false],
    ['2027-03-18', true],
  ] as const) {
    await cal.locator(`td[data-date="${date}"]`).click();
    const details = cal.getByRole('region', { name: /March \d+, 2027/ });
    if (has) await expect(details).toContainText('M days');
    else await expect(details).not.toContainText('M days');
    // The details float over the neighbouring days; Escape closes them.
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
  }

  await page.getByRole('tab', { name: 'Meetings', exact: true }).click();
  await row(page, 'M days').getByRole('button', { name: 'Edit M days' }).click();
  const again = panel(page).getByRole('region', { name: /M days/ });
  const g2 = again.getByRole('group', { name: 'Weekdays' });
  await g2.getByLabel('Monday').uncheck();
  await g2.getByLabel('Thursday').uncheck();
  for (const d of ['Thursday', 'Monday']) await expect(g2.getByLabel(d)).not.toBeChecked();
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(g2.getByText('Required field missing: Weekdays')).toBeVisible();
  await expect(g2).toHaveAttribute('aria-describedby', /.+/);
  await expect(g2.getByLabel('Monday')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(g2.getByText('Required field missing: Weekdays')).toBeHidden();
  await expect(g2).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(g2).not.toHaveAttribute('aria-invalid', /.*/);
  await expect(again).toBeVisible();
});

test('the table shows when, the next date and the participants with their share', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
  await openMeetings(page);
  const headers = panel(page).getByRole('columnheader');
  await expect(headers).toHaveText(['Meeting', 'When', 'Next', 'Participants', 'Actions']);
  // Weekly Sync is on Tuesdays at 09:30: today (Tuesday, January 12) counts until it ends.
  const sync = row(page, 'Weekly Sync');
  await expect(sync.locator('time')).toHaveAttribute('datetime', '2027-01-12');
  await expect(sync.getByRole('rowheader')).toContainText('Scrum events');
  // The one-off kick-off on January 11 is over.
  await expect(row(page, 'Kick-off Workshop')).toContainText('None left');
  // A full share shows the role alone; a partial share adds the percentage.
  const refinement = row(page, 'Backlog Refinement').getByRole('listitem');
  await expect(refinement).toHaveText(['PO Product Owner', 'SM Scrum Master · 50%']);
});

test('the filter narrows the rows and says when nothing matches', async ({ page }) => {
  await openMeetings(page);
  const filter = panel(page).getByRole('searchbox', { name: 'Filter meetings' });
  await filter.fill('stakeholders');
  // Category names count: both Stakeholders meetings stay, others go.
  await expect(row(page, 'Sprint Review')).toBeVisible();
  await expect(row(page, 'Stakeholder Update')).toBeVisible();
  await expect(row(page, 'Weekly Sync')).toHaveCount(0);
  await filter.fill('zzz');
  await expect(panel(page).getByRole('status')).toHaveText('No meeting matches “zzz”.');
  await filter.fill('');
  await expect(row(page, 'Weekly Sync')).toBeVisible();
  await expect(panel(page).locator('[role="status"]')).toHaveText('');
});

test('row actions are icon buttons with a visible tooltip on focus', async ({ page }) => {
  await openMeetings(page);
  const edit = panel(page).getByRole('button', { name: 'Edit Weekly Sync' });
  // Keyboard focus (focus-visible) shows the tooltip.
  await edit.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(edit).toBeFocused();
  await expect(edit).toHaveAttribute('data-tip', 'Edit');
  await expect
    .poll(() => edit.evaluate((el) => getComputedStyle(el, '::after').display))
    .toBe('block');
  expect(await edit.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"Edit"');
  // Without hover or focus the tooltip takes no room (no scroll area in the table).
  await panel(page).getByRole('button', { name: 'Add meeting' }).focus();
  await page.mouse.move(0, 0);
  expect(await edit.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
});

test('deleting a row while a form is open keeps the focus on the next row', async ({ page }) => {
  await openMeetings(page);
  await panel(page).getByRole('button', { name: 'Edit Sprint Planning' }).click();
  await panel(page).getByRole('button', { name: 'Delete Weekly Sync' }).click();
  await expect(row(page, 'Weekly Sync')).toHaveCount(0);
  // The next row's Edit is disabled while the form is open, so its Delete takes the focus.
  await expect(
    panel(page).getByRole('button', { name: 'Delete Backlog Refinement' }),
  ).toBeFocused();
});

test('switching teams clears the filter', async ({ page }) => {
  await openMeetings(page);
  await panel(page).getByRole('searchbox', { name: 'Filter meetings' }).fill('sync');
  await teamAction(page, 'Add team');
  const dialog = page.getByRole('dialog', { name: 'Add team' });
  await dialog.getByLabel('Team name').fill('Team B');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await page
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Team Alpha' });
  await expect(panel(page).getByRole('searchbox', { name: 'Filter meetings' })).toHaveValue('');
  await expect(row(page, 'Sprint Review')).toBeVisible();
});

test('the default weekdays summary is a range', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'M range');
  await form.getByLabel('Repeats').selectOption('weekdays');
  await submitByKeyboard(page, form);
  await expect(row(page, 'M range')).toContainText('On Monday to Friday');
});

test('the scaled example event shows its effective duration as scaled', async ({ page }) => {
  await openMeetings(page);
  await expect(row(page, 'Stakeholder Update')).toContainText('60 min (scaled)');
});

test('an invalid time is shown inline and focus moves to the field', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'Bad time');
  const time = form.getByLabel('Time (HH:MM)');
  await time.fill('25:00');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(time).toBeFocused();
  await expect(time).toHaveAttribute('aria-invalid', 'true');
  await expect(time).toHaveAttribute('aria-describedby', /.+/);
  await expect(form.getByText(/Invalid time/)).toBeVisible();
  await expect(row(page, 'Bad time')).toHaveCount(0);
  await time.fill('10:30');
  await expect(time).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'Bad time')).toContainText('10:30');
});

test('an empty name is refused and the first invalid field gets focus', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, '');
  await form.getByLabel('Time (HH:MM)').fill('99:99');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(form.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('Escape cancels, and Edit returns focus to its button', async ({ page }) => {
  await openMeetings(page);
  const edit = panel(page).getByRole('button', { name: 'Edit Weekly Sync' });
  await edit.click();
  const form = panel(page).getByRole('region', { name: 'Edit Weekly Sync' });
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Weekly Sync');
  await form.getByLabel('Name', { exact: true }).fill('Changed');
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(edit).toBeFocused();
  await expect(row(page, 'Weekly Sync')).toBeVisible();
  await edit.click();
  await panel(page)
    .getByRole('region', { name: 'Edit Weekly Sync' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(edit).toBeFocused();
});

test('a role listed twice is refused inline before saving', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'Dup roles');
  await form.getByRole('button', { name: 'Add participant' }).click();
  const roles = form.getByLabel('Role', { exact: true });
  await expect(roles).toHaveCount(2);
  await roles.nth(1).selectOption({ label: 'Product Owner' });
  await expect(roles.nth(1)).toHaveAttribute('aria-invalid', 'true');
  await expect(roles.nth(0)).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByText('This role is already listed.')).toHaveCount(2);
  // Other fields are still checked, so every problem is shown at once.
  await form.getByLabel('Time (HH:MM)').fill('25:00');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByLabel('Time (HH:MM)')).toBeFocused();
  await expect(form.getByLabel('Time (HH:MM)')).toHaveAttribute('aria-invalid', 'true');
  await expect(roles.nth(1)).toHaveAttribute('aria-invalid', 'true');
  await expect(row(page, 'Dup roles')).toHaveCount(0);
  await form.getByLabel('Time (HH:MM)').fill('09:00');
  await roles.nth(1).selectOption({ label: 'Scrum Master' });
  await expect(form.getByText('This role is already listed.')).toHaveCount(0);
  await expect(roles.nth(0)).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(row(page, 'Dup roles')).toContainText('Scrum Master');
});

test('deleting a category in use asks for a replacement', async ({ page }) => {
  await openMeetings(page);
  await panel(page).getByRole('button', { name: 'Delete Alignment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace Alignment' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Replace with').selectOption({ label: 'Stakeholders' });
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'Backlog Refinement')).toContainText('Stakeholders');
});

test('undo restores a deleted meeting', async ({ page }) => {
  await openMeetings(page);
  const undo = panel(page).getByRole('button', { name: 'Undo' });
  await expect(undo).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Delete Weekly Sync' }).click();
  await expect(row(page, 'Weekly Sync')).toHaveCount(0);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(row(page, 'Weekly Sync')).toBeVisible();
  await expect(undo).toBeDisabled();
});

test('duplicating adds a copy of the meeting', async ({ page }) => {
  await openMeetings(page);
  await panel(page).getByRole('button', { name: 'Duplicate Weekly Sync' }).click();
  await expect(row(page, 'Weekly Sync')).toHaveCount(2);
});

test('preparation of 25 % is stored as 0.25', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'Prep check');
  await form.getByLabel('Preparation (%)').fill('25');
  await submitByKeyboard(page, form);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const path = await (await download).path();
  const ws = JSON.parse(readFileSync(path, 'utf8')) as {
    teams: { events: { name: string; preparation: number }[] }[];
  };
  const saved = ws.teams[0]!.events.find((e) => e.name === 'Prep check');
  expect(saved?.preparation).toBe(0.25);
});

test('a language change keeps the open draft and translates the heading', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'Keep me');
  await expect(form).toBeVisible();
  await page.getByLabel(/Language|Sprache/).selectOption('de');
  const de = panel(page).getByRole('region', { name: 'Neuer Termin' });
  await expect(de).toBeVisible();
  await expect(de.getByLabel('Name', { exact: true })).toHaveValue('Keep me');
});

test('the milestone options follow the chosen cycle', async ({ page }) => {
  await openMeetings(page);
  await page.getByRole('tab', { name: 'Members & cadence', exact: true }).click();
  const team = page.getByRole('tabpanel', { name: 'Members & cadence' });
  await team.getByLabel('New cycle name').fill('Q3');
  await team.getByRole('button', { name: 'Add cycle' }).click();
  const q3 = team.getByRole('group', { name: 'Milestones of Q3' });
  await q3.getByLabel('New milestone name').fill('Beta');
  await q3.getByLabel('New milestone date').fill('2027-09-01');
  await q3.getByRole('button', { name: 'Add milestone' }).click();
  await page.getByRole('tab', { name: 'Meetings', exact: true }).click();

  const form = await startNew(page, 'Cycle check');
  await form.getByLabel('Repeats').selectOption('cycle-milestone');
  const milestone = form.getByLabel('Milestone');
  await expect(milestone.locator('option')).toHaveText(['Release']);
  await form.getByLabel('Cycle').selectOption({ label: 'Q3' });
  await expect(milestone.locator('option')).toHaveText(['Beta']);
  await expect(milestone).toHaveValue(/.+/);
  await submitByKeyboard(page, form);
  await expect(row(page, 'Cycle check')).toContainText('On Beta (Q3)');
});

test('a cadence day is shown 1-based and stored 0-based', async ({ page }) => {
  await openMeetings(page);
  const form = await startNew(page, 'Day check');
  await form.getByLabel('Repeats').selectOption('cadence-day');
  await form.getByLabel('Day', { exact: true }).fill('3');
  await submitByKeyboard(page, form);
  await expect(row(page, 'Day check')).toContainText('Day 3 of each sprint');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as' }).click();
  const ws = JSON.parse(readFileSync((await (await download).path())!, 'utf8')) as {
    teams: { events: { name: string; rule: { day: number } }[] }[];
  };
  expect(ws.teams[0]!.events.find((e) => e.name === 'Day check')?.rule.day).toBe(2);
});

test('other rows cannot start editing while a form is open', async ({ page }) => {
  await openMeetings(page);
  await startNew(page, 'Open one');
  await expect(panel(page).getByText('Finish or cancel the open form first.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Edit Weekly Sync' })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Duplicate Weekly Sync' })).toBeDisabled();
});

test('a team without meetings explains what to do', async ({ page }) => {
  await openMeetings(page);
  await page.getByRole('tab', { name: 'Members & cadence', exact: true }).click();
  await teamAction(page, 'Add team');
  const dialog = page.getByRole('dialog', { name: 'Add team' });
  await dialog.getByLabel('Team name').fill('Team B');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('tab', { name: 'Meetings', exact: true }).click();
  await expect(panel(page).getByText('No meetings yet')).toBeVisible();
  await expect(panel(page).getByRole('table')).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Add meeting' })).toBeEnabled();
});

for (const lang of ['en', 'de'] as const) {
  test(`axe finds no violations with the form open (${lang})`, async ({ page }) => {
    await openMeetings(page);
    await page.getByLabel(/Language|Sprache/).selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await panel(page)
      .getByRole('button', { name: lang === 'en' ? 'Add meeting' : 'Termin hinzufügen' })
      .click();
    await panel(page)
      .getByLabel(
        lang === 'en'
          ? 'Scale the duration with an assumption'
          : 'Dauer mit einer Annahme skalieren',
      )
      .check();
    await expect(
      panel(page).getByRole('region', { name: lang === 'en' ? 'New meeting' : 'Neuer Termin' }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Ctrl+Z on a button inside the open meeting form keeps the draft and does not undo', async ({
  page,
}) => {
  await openMeetings(page);
  await panel(page).getByRole('button', { name: 'Delete Weekly Sync' }).click();
  await expect(row(page, 'Weekly Sync')).toHaveCount(0);
  const form = await startNew(page, 'Draft stays');
  await form.getByRole('button').last().focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Draft stays');
  await expect(panel(page).getByRole('button', { name: 'Undo' })).toBeEnabled();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Weekly Sync')).toHaveCount(0);
});
