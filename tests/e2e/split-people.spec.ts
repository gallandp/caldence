import { expect, test, type Page } from '@playwright/test';
import {
  openExample,
  openPeoplePool,
  openTeamView,
  pickUnit,
  teamAction,
  useFileFallback,
} from './helpers';

// People in several teams (#274): the app asks for their hours and warns above the weekly hours.
test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Team' });

test('the setup wizard asks for the hours of a person already in another team', async ({
  page,
}) => {
  await openExample(page);
  await openTeamView(page);
  await teamAction(page, 'Plan another team');
  const dialog = page.getByRole('dialog', { name: 'Plan another team' });
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Team name').fill('Team Epsilon');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.locator('input[type="text"]').first().fill('Alex, Noa');
  // Alex has 16 h in Alpha and in Beta: 8 h are left of 40. Noa is new and is not asked.
  const hours = dialog.getByLabel('Alex is already in Team Alpha, Team Beta (32 h). Hours here:');
  await expect(hours).toHaveValue('8');
  await expect(dialog.getByText(/Noa is already/)).toHaveCount(0);
  await hours.fill('6');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await openTeamView(page);
  await expect(panel(page).getByLabel('Weekly hours of Alex in Team Epsilon')).toHaveValue('6');
});

test('I take part myself: the wizard asks for my hours too, and says when none are left', async ({
  page,
}) => {
  await openExample(page);
  await openTeamView(page);
  await teamAction(page, 'Plan another team');
  const dialog = page.getByRole('dialog', { name: 'Plan another team' });
  await dialog.getByRole('radio', { name: 'Kanban', exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('Team name').fill('Team Epsilon');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('I take part myself').check();
  await dialog.getByLabel('Your name').fill('Sam');
  // Sam has 20 h in Alpha and in Beta: nothing is left of 40.
  const hours = dialog.getByLabel('Sam is already in Team Alpha, Team Beta (40 h). Hours here:');
  await expect(hours).toHaveValue('0');
  await expect(hours).toHaveAccessibleDescription(
    'No hours left – meetings here count as over the limit.',
  );
  // A negative number stops the form (min 0) and the field gets the focus.
  await hours.fill('-2');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeVisible();
  await expect(hours).toBeFocused();
  await hours.fill('4');
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(dialog).toBeHidden();
  await openTeamView(page);
  await expect(panel(page).getByLabel('Weekly hours of Sam in Team Epsilon')).toHaveValue('4');
});

test('a number typed in the Team view wins over the hours left', async ({ page }) => {
  await openExample(page);
  await pickUnit(page, 'Team Gamma');
  await openTeamView(page);
  const team = panel(page);
  await team.getByLabel('Person', { exact: true }).fill('Alex');
  await team.getByLabel('Hrs/week in team').fill('12');
  // The hint states what is left, not what was typed.
  await expect(
    team.getByText('Alex is already in Team Alpha, Team Beta (32 h), 8 h left.'),
  ).toBeVisible();
  await team.getByRole('button', { name: 'Add member' }).click();
  await expect(team.getByLabel('Weekly hours of Alex in Team Gamma')).toHaveValue('12');
});

test('adding a person from another team fills in the hours left and flags too many', async ({
  page,
}) => {
  await openExample(page);
  await pickUnit(page, 'Team Gamma');
  await openTeamView(page);
  const team = panel(page);
  await team.getByLabel('Person', { exact: true }).fill('Alex');
  await team.getByLabel('Role', { exact: true }).selectOption({ label: 'Developer' });
  await expect(team.getByLabel('Hrs/week in team')).toHaveValue('8');
  await expect(
    team.getByText('Alex is already in Team Alpha, Team Beta (32 h), 8 h left.'),
  ).toBeVisible();
  await team.getByRole('button', { name: 'Add member' }).click();
  const gamma = team.getByLabel('Weekly hours of Alex in Team Gamma');
  await expect(gamma).toHaveValue('8');

  // 16 + 16 + 20 = 52 h, more than the 40 h of Settings.
  await gamma.fill('20');
  await gamma.press('Enter');
  await page.getByRole('tab', { name: 'Meeting load', exact: true }).click();
  const load = page.getByRole('tabpanel', { name: 'Meeting load' });
  const row = load.locator('tr[data-person]').filter({ hasText: 'Alex' });
  await expect(row.getByText('52 h – more than 40 h a week')).toBeVisible();
  // Phones show the short form; the sentence stays for screen readers.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.getByText('52 h > 40 h')).toBeVisible();
  await expect(row.getByRole('rowheader')).toContainText('52 h – more than 40 h a week');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(load.locator('tr[data-person]').filter({ hasText: 'Kim' })).not.toContainText(
    'more than',
  );
  // Gamma has no meetings for Developers.
  await row.getByRole('button', { name: 'Alex', exact: true }).click();
  await expect(
    load
      .locator('.detail li')
      .filter({ hasText: 'Team Gamma' })
      .getByText('0 h – no meetings for this role'),
  ).toBeVisible();

  // The Structure card of the area says the same.
  await pickUnit(page, 'Commerce');
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await page.locator('.team').getByRole('button', { name: /Alex/ }).first().click();
  await expect(
    page.getByRole('dialog', { name: 'Alex' }).getByText('52 h – more than 40 h a week'),
  ).toBeVisible();
});

test('the Team view flags a member with too many hours until they are lowered (#291)', async ({
  page,
}) => {
  await openExample(page);
  await openTeamView(page);
  const team = panel(page);
  await openPeoplePool(page);
  const member = team.locator('.members li').filter({ hasText: 'Alex' });
  const pooled = team
    .getByRole('listitem')
    .filter({ has: page.getByRole('textbox', { name: 'Alex' }) });
  const hours = team.getByLabel('Weekly hours of Alex in Team Alpha');
  await expect(team.getByText(/more than 40 h a week/)).toHaveCount(0);

  // 30 h here and 16 h in Team Beta: 46 h, more than the 40 h of Settings.
  await hours.fill('30');
  await hours.press('Enter');
  await expect(member.getByText('46 h – more than 40 h a week')).toBeVisible();
  await expect(hours).toHaveAccessibleDescription('46 h – more than 40 h a week');
  await expect(pooled).toContainText('Team Alpha 30 h · Team Beta 16 h · Σ 46 h');
  await expect(pooled.getByText('46 h – more than 40 h a week')).toBeVisible();

  // Back to 24 h: 40 h is not more than 40 h, so the flag goes at once.
  await hours.fill('24');
  await hours.press('Enter');
  await expect(team.getByText(/more than 40 h a week/)).toHaveCount(0);

  // Someone in this team only has no Σ part: the flag follows their only entry.
  await team.getByLabel('Person', { exact: true }).fill('Noa');
  await team.getByLabel('Hrs/week in team').fill('44');
  await team.getByRole('button', { name: 'Add member' }).click();
  const noa = team
    .getByRole('listitem')
    .filter({ has: page.getByRole('textbox', { name: 'Noa' }) });
  await expect(noa).toContainText('Team Alpha 44 h');
  await expect(noa).not.toContainText('Σ');
  await expect(noa.getByText('44 h – more than 40 h a week')).toBeVisible();
});
