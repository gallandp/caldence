import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openWorkspaceFile, pickUnit, useFileFallback } from './helpers';
import { structureWorkspace } from './structure-fixture';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** Opens the Payments workspace and its area page (Structure). */
async function openStructure(page: Page, teams: 4 | 9 = 4) {
  await page.goto('/');
  await openWorkspaceFile(page, structureWorkspace({ teams }));
  await pickUnit(page, 'Payments');
  await page.getByRole('tab', { name: 'Area', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Area Payments' })).toBeVisible();
}

const node = (page: Page) => page.locator('.areanode');
const team = (page: Page, name: string) =>
  page.locator('.team').filter({ has: page.getByRole('heading', { name, exact: true }) });

test('the tree shows the three groups, and the composition bar filters them', async ({ page }) => {
  await openStructure(page);
  const groups = page.getByRole('group', { name: 'Highlight' });
  await expect(groups.getByRole('button')).toHaveText([
    /2\s*Only in the area/,
    /7\s*In the team and in the area/,
    /6\s*Only in the team/,
  ]);
  await expect(node(page).getByRole('button', { name: /Sabine K\./ })).toBeVisible();
  // Ivo is a Scrum Master invited to the Scrum of Scrums but has no area hours.
  await expect(node(page).getByRole('button', { name: /Ivo Q\..*0 h · set hours/ })).toBeVisible();
  await expect(team(page, 'Alpha').getByRole('button', { name: /Lea T\./ })).toContainText(
    'Area: Product Management',
  );

  const only = groups.getByRole('button', { name: /Only in the area/ });
  await only.click();
  await expect(only).toHaveAttribute('aria-pressed', 'true');
  await expect(node(page).getByRole('button', { name: /Sabine K\./ })).not.toHaveClass(/dim/);
  await expect(team(page, 'Alpha').getByRole('button', { name: /Mira D\./ })).toHaveClass(/dim/);
  await only.click();
  await expect(team(page, 'Alpha').getByRole('button', { name: /Mira D\./ })).not.toHaveClass(
    /dim/,
  );
});

test('a person highlights everywhere and opens an editable card', async ({ page }) => {
  await openStructure(page);
  const sam = node(page).getByRole('button', { name: /Sam R\./ });
  await sam.focus();
  // Focus alone highlights Sam in both teams and draws a line to each.
  await expect(page.locator('.lines path.flow')).toHaveCount(2);
  await expect(team(page, 'Gamma').getByRole('button', { name: /Hanna P\./ })).toHaveClass(/dim/);
  await page.keyboard.press('Enter');
  await expect(sam).toHaveAttribute('aria-pressed', 'true');

  const card = page.getByRole('dialog', { name: 'Sam R.' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Sam R.' })).toBeFocused();
  await expect(card.getByText('Total a week')).toBeVisible();
  await expect(card.locator('.sum')).toContainText('34 h');

  // Area hours save on change and count at once; Ctrl+Z takes them back.
  const hours = card.getByRole('spinbutton', { name: 'Hours in the area' });
  await hours.fill('6');
  await hours.press('Tab');
  await expect(card.locator('.sum')).toContainText('38 h');
  await expect(sam).toContainText('6 h');
  await card.getByRole('heading', { name: 'Sam R.' }).click();
  await page.keyboard.press('Control+z');
  await expect(card.locator('.sum')).toContainText('34 h');

  // Team hours are editable in the card too.
  const beta = card.getByRole('spinbutton', { name: 'Hours in Beta' });
  await beta.fill('20');
  await beta.press('Tab');
  await expect(card.locator('.sum')).toContainText('38 h');

  // Escape closes the card and returns focus to the person.
  await card.getByRole('heading', { name: 'Sam R.' }).focus();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(sam).toBeFocused();
});

test('"0 h · set hours" opens the card at the area hours', async ({ page }) => {
  await openStructure(page);
  await node(page)
    .getByRole('button', { name: /Ivo Q\./ })
    .click();
  const card = page.getByRole('dialog', { name: 'Ivo Q.' });
  const hours = card.getByRole('spinbutton', { name: 'Hours in the area' });
  await expect(hours).toBeFocused();
  // Only invited: the person cannot be removed here, the card says why.
  await expect(card.getByRole('button', { name: 'Remove from Payments' })).toBeDisabled();
  await expect(card.getByText(/Invited via “Scrum Master · every team”/)).toBeVisible();
  await hours.fill('3');
  await hours.press('Tab');
  await expect(node(page).getByRole('button', { name: /Ivo Q\./ })).toContainText('3 h');
});

test('adding a person who is in no team puts them only in the area', async ({ page }) => {
  await openStructure(page);
  await page.getByRole('button', { name: '+ Person' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a person to Payments' });
  await dialog.getByLabel('Person').fill('Nina Z.');
  await dialog.getByLabel('Role in the area').selectOption({ label: 'Head of area' });
  await dialog.getByLabel('Hours a week in the area').fill('8');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.zone.only').getByRole('button', { name: /Nina Z\./ })).toBeFocused();
  await expect(page.locator('.zone.only').getByRole('button', { name: /Nina Z\./ })).toContainText(
    '8 h',
  );
  await expect(
    page.getByRole('group', { name: 'Highlight' }).getByRole('button').first(),
  ).toHaveText(/3\s*Only in the area/);

  // Removing them from the area takes them out of the structure.
  await page
    .locator('.zone.only')
    .getByRole('button', { name: /Nina Z\./ })
    .click();
  await page
    .getByRole('dialog', { name: 'Nina Z.' })
    .getByRole('button', { name: 'Remove from Payments' })
    .click();
  await expect(page.locator('.zone.only').getByRole('button', { name: /Nina Z\./ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Person' })).toBeFocused();
});

test('a new role is created right in the area, from "+ Person" and from the card', async ({
  page,
}) => {
  await openStructure(page);
  await page.getByRole('button', { name: '+ Person' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a person to Payments' });
  await dialog.getByLabel('Person').fill('Nina Z.');
  await dialog.getByLabel('Role in the area').selectOption({ label: 'New role …' });
  await expect(dialog.getByLabel('New role name')).toBeFocused();
  // Without a name nothing is added, and the error sits at the role name.
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('New role name')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('New role name').fill('Area architect');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
  const nina = page.locator('.zone.only').getByRole('button', { name: /Nina Z\./ });
  await expect(nina).toContainText('Area architect');

  // The card creates one too; Escape in the name field only cancels the new role.
  await nina.click();
  const card = page.getByRole('dialog', { name: 'Nina Z.' });
  const select = card.getByLabel('Role in the area');
  await select.selectOption({ label: 'New role …' });
  const field = card.getByLabel('New role name');
  await expect(field).toBeFocused();
  await field.press('Escape');
  await expect(card).toBeVisible();
  await expect(field).toHaveCount(0);
  await expect(select).toBeFocused();
  await select.selectOption({ label: 'New role …' });
  await card.getByLabel('New role name').press('Enter');
  await expect(card.getByLabel('New role name')).toHaveAttribute('aria-invalid', 'true');
  await card.getByLabel('New role name').fill('Coach');
  await card.getByLabel('New role name').press('Enter');
  await expect(nina).toContainText('Coach');
  await expect(select.locator('option:checked')).toHaveText('Coach');

  // Both roles are in the roles list on the structure page.
  await page.getByText('Edit roles (').click();
  const roles = page.getByRole('region', { name: 'Roles' });
  await expect(roles.getByRole('textbox', { name: /Area architect/ })).toBeVisible();
  await expect(roles.getByRole('textbox', { name: /Coach/ })).toBeVisible();
});

test('a meeting chip highlights its invitees and names a team without the role', async ({
  page,
}) => {
  await openStructure(page);
  const chip = page.getByRole('button', { name: /Scrum of Scrums/ });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(team(page, 'Delta').getByText('No Scrum Master in Delta')).toBeVisible();
  await expect(team(page, 'Alpha').getByText(/No Scrum Master/)).toHaveCount(0);
  await expect(node(page).getByRole('button', { name: /Jonas M\./ })).not.toHaveClass(/dim/);
  await expect(node(page).getByRole('button', { name: /Sabine K\./ })).toHaveClass(/dim/);
  await chip.click();
  await expect(page.getByText('No Scrum Master in Delta')).toHaveCount(0);
});

test('the table lists every person with area, team and total hours', async ({ page }) => {
  await openStructure(page);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const table = page.getByRole('table', { name: 'People in Payments with their hours a week' });
  await expect(table.locator('thead').getByRole('columnheader')).toHaveText([
    'Person',
    'Payments',
    'Alpha',
    'Beta',
    'Gamma',
    'Delta',
    'Total',
  ]);
  const sam = table.getByRole('row', { name: /Sam R\./ });
  await expect(sam.getByRole('cell')).toHaveText(['2 h', '16 h', '16 h', '', '', '34 h']);
  await sam.getByRole('button', { name: /Sam R\./ }).click();
  await expect(page.getByRole('dialog', { name: 'Sam R.' })).toBeVisible();
});

test('the switch keeps one sidebar entry and shows the other page', async ({ page }) => {
  await openStructure(page);
  await expect(page.getByRole('tab', { name: 'Team', exact: true })).toHaveCount(0);
  const pages = page.getByRole('group', { name: 'Page' });
  await pages.getByRole('button', { name: 'Cadence & load' }).click();
  await expect(pages.getByRole('button', { name: 'Cadence & load' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.areanode')).toHaveCount(0);
  await pages.getByRole('button', { name: 'Structure' }).click();
  await expect(page.locator('.areanode')).toBeVisible();
});

test('many teams become a list of rows', async ({ page }) => {
  await openStructure(page, 9);
  await expect(page.locator('.tree')).toHaveClass(/list/);
  await expect(page.locator('.team')).toHaveCount(9);
});

/** Font sizes below 10 px and clipped text of all visible avatar initials (#215). */
const smallInitials = (page: Page) =>
  page.locator('.av, .avatar').evaluateAll((els) =>
    els
      .filter((el) => el.textContent?.trim() && el.getClientRects().length)
      .map((el) => ({
        text: el.textContent!.trim(),
        size: parseFloat(getComputedStyle(el).fontSize),
        clipped: el.scrollWidth > el.clientWidth,
      }))
      .filter((a) => a.size < 10 || a.clipped),
  );

test('avatar initials are at least 10 px and fit', async ({ page }) => {
  await openStructure(page, 9);
  await page.locator('.switcher .pick').click();
  await expect(page.locator('.switcher .list')).toBeVisible();
  expect(await page.locator('.switcher .list .avatar.mini').count()).toBeGreaterThan(0);
  expect(await page.locator('.tree.list .tonly .av').count()).toBeGreaterThan(0);
  expect(await smallInitials(page)).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('teams are rows, only-in-team people fold away, no sideways scroll', async ({ page }) => {
    // The Open button sits in a menu on phones: load on a wide screen, then narrow it.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await openWorkspaceFile(page, structureWorkspace());
    await pickUnit(page, 'Payments');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.menu-toggle').click();
    await page.getByRole('tab', { name: 'Area', exact: true }).click();
    await expect(page.locator('.tree')).toHaveClass(/list/);
    const alpha = team(page, 'Alpha');
    await expect(alpha.getByRole('button', { name: /Mira D\./ })).toHaveCount(0);
    const more = alpha.getByRole('button', { name: /^show\W+Alpha$/ });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(alpha.getByRole('button', { name: /Mira D\./ })).toBeVisible();
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(scroll).toBeLessThanOrEqual(0);
    expect(await smallInitials(page)).toEqual([]);
    // The card is a bottom sheet.
    await node(page)
      .getByRole('button', { name: /Alex B\./ })
      .click();
    const box = await page.getByRole('dialog', { name: 'Alex B.' }).boundingBox();
    expect(box?.width).toBeGreaterThan(380);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no axe violations in the structure, card and table (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openStructure(page);
    await page.getByRole('button', { name: /Scrum of Scrums/ }).click();
    const tree = await new AxeBuilder({ page }).include('#panel-team').analyze();
    expect(tree.violations).toEqual([]);
    await page.getByRole('button', { name: /Scrum of Scrums/ }).click();
    await node(page)
      .getByRole('button', { name: /Ivo Q\./ })
      .click();
    const card = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(card.violations).toEqual([]);
    await page
      .getByRole('dialog', { name: 'Ivo Q.' })
      .getByLabel('Role in the area')
      .selectOption({ label: 'New role …' });
    const creating = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(creating.violations).toEqual([]);
    await page.locator('dialog[open]').getByLabel('New role name').press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    const table = await new AxeBuilder({ page }).include('#panel-team').analyze();
    expect(table.violations).toEqual([]);
  });
}

test('after removing someone who is also in a team, focus finds their team tile', async ({
  page,
}) => {
  await openStructure(page);
  await node(page)
    .getByRole('button', { name: /Lea T\./ })
    .click();
  const card = page.getByRole('dialog', { name: 'Lea T.' });
  await card.getByRole('button', { name: 'Remove from Payments' }).click();
  // Lea is now only in Alpha: the tile that opened the card is gone.
  await expect(node(page).getByRole('button', { name: /Lea T\./ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(team(page, 'Alpha').getByRole('button', { name: /Lea T\./ })).toBeFocused();
});
