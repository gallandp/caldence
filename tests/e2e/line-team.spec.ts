import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lineWorkspace } from './line-fixture';
import { openExample, openWorkspaceFile, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.goto('/');
});

/** Switches to a world with the segmented control at the top of the sidebar (#393). */
async function toWorld(page: Page, name: 'Products' | 'Line') {
  const world = page.getByRole('group', { name: 'World' }).getByRole('button', { name });
  await world.click();
  await expect(world).toHaveAttribute('aria-pressed', 'true');
}

/** Picks a line unit in the switcher of the line world. */
async function pickLine(page: Page, name: string) {
  if ((await page.getByRole('group', { name: 'World' }).count()) > 0) await toWorld(page, 'Line');
  await page.locator('.switcher .pick').click();
  await page
    .locator('.switcher .list button.line')
    .filter({ has: page.locator('.opt-name-line', { hasText: new RegExp(`^${name}$`) }) })
    .click();
  await expect(page.locator('.switcher .pick .label')).toHaveText(name);
}

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

test('without a line there is no world switch and no line group', async ({ page }) => {
  await openExample(page);
  await expect(page.getByRole('group', { name: 'World' })).toHaveCount(0);
  await page.locator('.switcher .pick').click();
  await expect(page.locator('.switcher .list')).toBeVisible();
  await expect(page.locator('.switcher .list .line-group')).toHaveCount(0);
});

test('the two worlds each keep their own units, pages and selection (#393, #394, #395)', async ({
  page,
}) => {
  const ws = lineWorkspace();
  ws.organisation = { name: 'Velmora Holding' };
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  const worlds = page.getByRole('group', { name: 'World' });
  await expect(worlds.getByRole('button', { name: 'Products' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The product world lists products only.
  await page.locator('.switcher .pick').click();
  await expect(page.locator('.switcher .list')).toContainText('Team Alpha');
  await expect(page.locator('.switcher .list .line-group')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await showView(page, 'Meeting load');

  // The line world opens on the whole line, with the line's own pages.
  await toWorld(page, 'Line');
  await expect(page.locator('.switcher .pick .label')).toHaveText('Velmora Holding');
  for (const name of ['Overview', 'Staff', 'Staffing', 'Meeting load'])
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  for (const name of ['Calendar', 'Meetings & cadence', 'Templates'])
    await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(0);
  await showView(page, 'Overview');
  const root = panel(page, 'Overview');
  await expect(root.getByRole('heading', { level: 2 })).toHaveText('Velmora Holding');
  await expect(root.locator('button.kid')).toHaveCount(1);
  await expect(root.locator('.tile').nth(1)).toContainText('7 people');

  // The line world's list holds the line tree only.
  await page.locator('.switcher .pick').click();
  await expect(page.locator('.switcher .list .line-group')).toBeVisible();
  await expect(page.locator('.switcher .list')).not.toContainText('Team Alpha');
  await page.keyboard.press('Escape');
  await pickLine(page, 'Orvalis Geld');
  await showView(page, 'Staff');

  // Back and forth: each world returns to its selection and its page.
  await toWorld(page, 'Products');
  await expect(page.getByRole('tab', { name: 'Meeting load', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await toWorld(page, 'Line');
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Geld');
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel(page, 'Staff').locator('.eyebrow .world.line')).toHaveText('Line');

  // Arrow keys move between the two worlds.
  await worlds.getByRole('button', { name: 'Line' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(worlds.getByRole('button', { name: 'Products' })).toBeFocused();
  await expect(worlds.getByRole('button', { name: 'Products' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a line team shows its staff, and a person opens with figures and line fields', async ({
  page,
}) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');

  // The overview entry carries the level; staff is a page of its own.
  await showView(page, 'Line team');
  const overview = panel(page, 'Line team');
  await expect(overview.getByRole('heading', { level: 2 })).toHaveText('Orvalis Ware');
  await expect(overview.getByText('Staff by contract')).toBeVisible();
  await expect(overview.locator('.tile').nth(1)).toContainText('3.8 FTE');

  await showView(page, 'Staff');
  const view = panel(page, 'Staff');

  const rows = view.locator('tbody tr:not(.detail)');
  await expect(rows).toHaveCount(4);
  await expect(view.getByText('4 of 4')).toBeVisible();

  // Search by skill, filter by company.
  await view.getByLabel('Search person or skill').fill('handel');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Sam');
  await view.getByLabel('Search person or skill').fill('');
  await view.getByLabel('Company').selectOption({ label: 'Velmora Digital GmbH' });
  await expect(rows).toHaveCount(2);
  await view.getByLabel('Company').selectOption({ label: 'All' });

  // Sam: per team FTE = hours, meetings and the time after them; and the one limit status.
  await view.getByRole('button', { name: 'Details of Sam' }).click();
  const detail = view.locator('tr.detail');
  await expect(detail).toContainText('Team Alpha');
  await expect(detail).toContainText('0.5 FTE = 20.0 h');
  await expect(detail).toContainText('after meetings');
  await expect(detail).toContainText('in Team Alpha:');
  await expect(detail).toContainText('under the limit of 60%');

  // A skill added in the row is saved on the person.
  await detail.getByLabel('Skills').selectOption({ label: 'Orvalis Betrieb' });
  await expect(rows.filter({ hasText: 'Sam' })).toContainText('Orvalis Betrieb');
  await detail.getByLabel('Contract (FTE)').fill('0.5');
  await detail.getByLabel('Contract (FTE)').press('Enter');
  await expect(rows.filter({ hasText: 'Sam' })).toContainText('overbooked');

  expect(
    (await new AxeBuilder({ page }).include('#panel-people').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
  await showView(page, 'Line team');
  await expect(overview.locator('.tile').nth(1)).toContainText('3.3 FTE');
});

test('a specialist group lists its line teams and opens them', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis');
  await showView(page, 'Overview');
  const view = panel(page, 'Overview');
  await expect(view.getByRole('heading', { name: 'Units below' })).toBeVisible();
  await expect(view.locator('button.kid')).toHaveCount(2);
  await showView(page, 'Staff');
  await expect(panel(page, 'Staff').locator('tbody tr')).toHaveCount(7);
  await showView(page, 'Overview');
  await view.locator('button.kid', { hasText: 'Orvalis Geld' }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Geld');
});

test('meeting load follows the line team, and its products lead into the product world', async ({
  page,
}) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');

  await showView(page, 'Meeting load');
  const people = panel(page, 'Meeting load').locator('section', { hasText: 'People' }).last();
  await expect(people).toContainText('Kim');
  await expect(people).not.toContainText('Nia');

  // Meetings belong to products: the overview lists them and a click switches worlds.
  await showView(page, 'Line team');
  const products = panel(page, 'Line team').locator('.line-products');
  await expect(products.getByRole('button')).toHaveCount(3);
  await products.getByRole('button', { name: /Team Gamma/ }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Team Gamma');
  await expect(
    page.getByRole('group', { name: 'World' }).getByRole('button', { name: 'Products' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('line units and skills are managed in place', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await toWorld(page, 'Line');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Add line unit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add line unit' });
  await dialog.getByLabel('Name of the line unit').fill('Orvalis Markt');
  await dialog.getByLabel('Belongs to').selectOption({ label: 'Orvalis' });
  await dialog.getByLabel('Line manager').selectOption({ label: 'Ruth' });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Markt');

  await showView(page, 'Line team');
  await expect(panel(page, 'Line team').getByText('Nobody in this line team yet')).toBeVisible();
  await showView(page, 'Staff');
  const view = panel(page, 'Staff');
  await view.getByRole('button', { name: '+ Person' }).click();
  const add = page.getByRole('dialog', { name: 'Add a person to Orvalis Markt' });
  await add.getByLabel('Name of the person').fill('Tilda');
  await add.getByLabel('Contract (FTE)').fill('0.6');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(view.locator('tbody tr')).toContainText(['Tilda']);

  // Skills: add one and see who uses it before deleting.
  await view.getByRole('button', { name: 'Manage skills' }).click();
  const skills = page.getByRole('dialog', { name: 'Manage skills' });
  await skills.getByLabel('New skill', { exact: true }).fill('Orvalis Markt');
  await skills.getByRole('button', { name: 'Add skill' }).click();
  await expect(skills.getByLabel('Name of Orvalis Markt')).toBeVisible();
  await skills.getByRole('button', { name: 'Delete Orvalis Lager' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Orvalis Lager?' });
  await expect(confirm).toContainText('2 people');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(skills.getByLabel('Name of Orvalis Lager')).toHaveCount(0);
  await skills.getByRole('button', { name: 'Done' }).click();
});

test('a skill family is deleted after a warning and comes back with Ctrl+Z (#389)', async ({
  page,
}) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');
  await showView(page, 'Staff');
  const view = panel(page, 'Staff');
  await view.getByRole('button', { name: 'Manage skills' }).click();
  const skills = page.getByRole('dialog', { name: 'Manage skills' });
  await skills.getByRole('button', { name: 'Delete skill family Orvalis' }).click();

  // The warning names the skills, the people holding them and the line unit naming the family.
  const confirm = page.getByRole('dialog', { name: 'Delete the skill family “Orvalis”?' });
  await expect(confirm).toContainText('3 skills · 4 people · Line units: 1');
  await confirm.getByRole('button', { name: 'Delete family' }).click();
  await expect(confirm).toBeHidden();
  await expect(skills).toContainText('No skill family yet');
  await expect(skills.getByLabel('New skill family')).toBeFocused();
  await skills.getByRole('button', { name: 'Done' }).click();
  await expect(view.locator('tbody')).not.toContainText('Orvalis Lager');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(view.locator('tbody')).toContainText('Orvalis Lager');
  await view.getByRole('button', { name: 'Manage skills' }).click();
  await expect(skills.getByLabel('Name of the skill family')).toHaveValue('Orvalis');
});

test('presenting hides the staff pages and line staff names', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');
  await showView(page, 'Staff');
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Staffing' })).toHaveCount(0);
  const view = panel(page, 'Line team');
  await expect(view).toBeVisible();
  await expect(view.locator('table')).toHaveCount(0);
  await expect(view).not.toContainText('Led by');
  await expect(view).not.toContainText('Alex');
});

test('a deep line tree in the sidebar keeps the words of long names whole', async ({ page }) => {
  // Invented German names, three levels deep, whose longest words fit their level whole in the
  // sidebar of a 1440 px window. Hyphenation is off, so browsers with and without a German
  // dictionary render the same.
  const ws = lineWorkspace();
  ws.settings.locale = 'de';
  ws.lineUnits = [
    { id: 'lu1', name: 'Velmora Werke GmbH' },
    { id: 'lu2', name: 'Fachgruppe Wartungsplanung', parentId: 'lu1' },
    { id: 'lu3', name: 'Fachgruppe Lieferanten & Einkaufssteuerung', parentId: 'lu1' },
    { id: 'lu4', name: 'Team Ersatzteilversorgung', parentId: 'lu3' },
  ];
  ws.people = ws.people.map((p) => ({ ...p, lineUnitId: undefined }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  await page.getByRole('group', { name: 'Welt' }).getByRole('button', { name: 'Linie' }).click();
  await page.locator('.switcher .pick').click();
  const names = page.locator('.switcher .list .opt-name-line');
  await expect(names).toHaveCount(4);
  await names.evaluateAll((els) => els.forEach((el) => (el.style.hyphens = 'manual')));

  // The rendered lines of each name, read character by character.
  const shown = await names.evaluateAll((els) =>
    els.map((el) => {
      const text = el.firstChild as Text;
      const range = document.createRange();
      const rows: string[] = [];
      let row = '';
      let top = -Infinity;
      for (let i = 0; i < text.length; i++) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.top > top + 2 && row) {
          rows.push(row.trim());
          row = '';
        }
        top = Math.max(top, r.top);
        row += text.data[i];
      }
      rows.push(row.trim());
      return { name: text.data, rows };
    }),
  );
  // Every line ends between two words: no "Fachgru" / "ppe".
  for (const { name, rows } of shown) expect(rows.join(' ')).toBe(name);
});

test('a company is chosen as level and gives its people their company (#399)', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await toWorld(page, 'Line');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Add line unit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add line unit' });
  await dialog.getByLabel('Name of the line unit').fill('Nordwerk GmbH');
  await dialog.getByLabel('Level', { exact: true }).selectOption({ label: 'Company' });
  await expect(dialog.getByLabel('Belongs to')).toBeDisabled();
  await expect(dialog).toContainText('People below get “Nordwerk GmbH” as their company');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Nordwerk GmbH');
  await expect(page.locator('.switcher .pick')).toContainText('Company');
  await expect(page.locator('.eyebrow').filter({ visible: true })).toContainText('Company');

  // The specialist group moves below the company and stays a specialist group.
  await pickLine(page, 'Orvalis');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Edit …' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Orvalis' });
  await expect(edit.getByLabel('Level', { exact: true })).toHaveValue('group');
  await edit.getByLabel('Belongs to').selectOption({ label: 'Nordwerk GmbH' });
  await edit.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.switcher .pick')).toContainText('Specialist group');
});
