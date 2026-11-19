import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lineWorkspace, staffingWorkspace } from './line-fixture';
import {
  autosaved,
  openExample,
  openWorkspaceFile,
  pickUnit,
  showView,
  teamAction,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.goto('/');
});

/** Switches to a world with the segmented control at the top of the sidebar (#393). */
async function toWorld(page: Page, name: 'Products' | 'Line') {
  const world = page.getByRole('radiogroup', { name: 'World' }).getByRole('radio', { name });
  await world.click();
  await expect(world).toHaveAttribute('aria-checked', 'true');
}

/** Picks a line unit in the switcher of the line world. */
async function pickLine(page: Page, name: string) {
  if ((await page.getByRole('radiogroup', { name: 'World' }).count()) > 0)
    await toWorld(page, 'Line');
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
  await expect(page.getByRole('radiogroup', { name: 'World' })).toHaveCount(0);
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
  const worlds = page.getByRole('radiogroup', { name: 'World' });
  await expect(worlds.getByRole('radio', { name: 'Products' })).toHaveAttribute(
    'aria-checked',
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
  const tree = root.getByRole('list', { name: 'Line tree of Velmora Holding' });
  await expect(tree).toContainText('Organisation · 3 units below');
  await expect(tree.locator('button[data-line-node]')).toHaveCount(3);
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
  await worlds.getByRole('radio', { name: 'Line' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(worlds.getByRole('radio', { name: 'Products' })).toBeFocused();
  await expect(worlds.getByRole('radio', { name: 'Products' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('deleting a top unit stays in the line; a reload comes back to the line root', async ({
  page,
}) => {
  const ws = lineWorkspace();
  ws.organisation = { name: 'Velmora Holding' };
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  await pickLine(page, 'Orvalis');
  await teamAction(page, 'Delete from the line');
  await page
    .getByRole('dialog', { name: /^Delete / })
    .getByRole('button', { name: 'Delete from the line' })
    .click();
  // Its units move up; the line world stays, on the line's root.
  await expect(page.locator('.switcher .pick .label')).toHaveText('Velmora Holding');
  await expect(
    page.getByRole('radiogroup', { name: 'World' }).getByRole('radio', { name: 'Line' }),
  ).toHaveAttribute('aria-checked', 'true');

  await showView(page, 'Staff');
  await autosaved(page, '@line:@organisation');
  await page.reload();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Velmora Holding');
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a line team shows its staff, and a person opens with figures and line fields', async ({
  page,
}) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');

  // The overview entry carries the level; staff is a page of its own.
  await showView(page, 'Overview');
  const overview = panel(page, 'Overview');
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
  await showView(page, 'Overview');
  await expect(overview.locator('.tile').nth(1)).toContainText('3.3 FTE');
});

test('a specialist group shows its line tree at every depth and opens a unit (#390)', async ({
  page,
}) => {
  const ws = lineWorkspace();
  (ws.lineUnits as { id: string; name: string; parentId?: string }[]).push({
    id: 'lu4',
    name: 'Orvalis Kasse',
    parentId: 'lu3',
  });
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  await pickLine(page, 'Orvalis');
  await showView(page, 'Overview');
  const view = panel(page, 'Overview');
  await expect(view.getByRole('heading', { name: 'Structure' })).toBeVisible();
  const tree = view.getByRole('list', { name: 'Line tree of Orvalis' });
  await expect(tree).toContainText('Specialist group · 3 units below · Led by Ruth');
  await expect(tree).toContainText('7 people');
  await expect(tree.locator('button[data-line-node]')).toHaveCount(3);
  // Orvalis Geld has a unit of its own now: a group, with Orvalis Kasse nested below it.
  const geld = tree.locator('[data-line-node="lu3"]');
  await expect(geld).toContainText('Specialist group');
  await expect(geld).toContainText('3 people');
  await expect(tree.locator('.kids [data-line-node="lu4"]')).toContainText('Line team');
  await showView(page, 'Staff');
  await expect(panel(page, 'Staff').locator('tbody tr')).toHaveCount(7);
  await showView(page, 'Overview');
  await tree.locator('[data-line-node="lu4"]').click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Kasse');
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
  await showView(page, 'Overview');
  const products = panel(page, 'Overview').locator('.line-products');
  await expect(products.getByRole('button')).toHaveCount(3);
  await products.getByRole('button', { name: /Team Gamma/ }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Team Gamma');
  await expect(
    page.getByRole('radiogroup', { name: 'World' }).getByRole('radio', { name: 'Products' }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('a person is added directly at the line root, e.g. the managing director', async ({
  page,
}) => {
  const ws = lineWorkspace();
  ws.lineName = 'Velmora GmbH';
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  await toWorld(page, 'Line');
  await expect(page.locator('.switcher .pick .label')).toHaveText('Velmora GmbH');
  await showView(page, 'Staff');
  const view = panel(page, 'Staff');
  await view.getByRole('button', { name: '+ Person' }).click();
  const add = page.getByRole('dialog', { name: 'Add a person to Velmora GmbH' });
  await add.getByLabel('Name of the person').fill('Hanne Brix');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(add).toBeHidden();
  const row = view.locator('tbody tr').filter({ hasText: 'Hanne Brix' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td.unit')).toHaveText('Velmora GmbH');
});

test('people at the line root stay when the last line unit is deleted (#420)', async ({ page }) => {
  const ws = lineWorkspace();
  ws.lineName = 'Velmora GmbH';
  ws.lineUnits = ws.lineUnits!.filter((u) => u.id === 'lu1');
  for (const p of ws.people) if (p.lineUnitId !== undefined) p.lineUnitId = 'lu1';
  ws.people.push({ id: 'person-hanne', name: 'Hanne Brix', lineUnitId: '@organisation' });
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  await pickLine(page, 'Orvalis');
  await teamAction(page, 'Delete from the line');
  await page
    .getByRole('dialog', { name: /^Delete / })
    .getByRole('button', { name: 'Delete from the line' })
    .click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Velmora GmbH');
  await showView(page, 'Staff');
  await expect(
    panel(page, 'Staff').locator('tbody tr').filter({ hasText: 'Hanne Brix' }),
  ).toHaveCount(1);
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

  await showView(page, 'Overview');
  await expect(panel(page, 'Overview').getByText('Nobody in this line team yet')).toBeVisible();
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
  const view = panel(page, 'Overview');
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
  await page
    .getByRole('radiogroup', { name: 'Welt' })
    .getByRole('radio', { name: 'Linie' })
    .click();
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

test('cross links lead between the worlds and back (#397)', async ({ page }) => {
  const ws = staffingWorkspace();
  ws.organisation = { name: 'Velmora Holding' };
  await openWorkspaceFile(page, ws, 'line.caldence.json');
  const label = page.locator('.switcher .pick .label');
  const back = page.getByRole('button', { name: /^‹?\s*Back to / });

  // A product's members carry their line unit; the chip opens it in the line, with a way back.
  await pickUnit(page, 'Team Alpha');
  await page.locator('#tab-team').click();
  const members = page.getByRole('list', { name: /Members of Team Alpha/ });
  await members.getByRole('button', { name: 'Open Orvalis Ware in the line' }).first().click();
  await expect(label).toHaveText('Orvalis Ware');
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await back.click();
  await expect(label).toHaveText('Team Alpha');
  await expect(
    page.getByRole('radiogroup', { name: 'World' }).getByRole('radio', { name: 'Products' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(back).toHaveCount(0);

  // The line's staff link their commitments into the products; any other step drops the way back.
  await pickLine(page, 'Orvalis Ware');
  await showView(page, 'Staff');
  await panel(page, 'Staff')
    .getByRole('row', { name: /Sam/ })
    .getByRole('button', { name: /^Open Team Gamma/ })
    .click();
  await expect(label).toHaveText('Team Gamma');
  await expect(back).toHaveText(/Back to Orvalis Ware/);
  await showView(page, 'Calendar');
  await expect(back).toHaveCount(0);

  // Meeting load names each person's line unit in the products, their products in the line.
  await showView(page, 'Meeting load');
  const people = panel(page, 'Meeting load');
  await expect(
    people.getByRole('row', { name: /Kim/ }).getByRole('button', { name: /in the line$/ }),
  ).toHaveCount(1);

  // The organisation's staffing map: where each product's people come from, and the matrix.
  await pickUnit(page, 'Velmora Holding');
  await page.locator('#tab-team').click();
  const map = page.locator('[data-staffing-map]');
  const platform = map.locator('button.toggle', { hasText: 'Payments' });
  if ((await platform.getAttribute('aria-expanded')) === 'false') await platform.click();
  await expect(map.locator('[data-product="team-delta"] [data-from-line]')).toHaveText(
    'From the line: Orvalis Geld',
  );
  // The organisation page lists each platform's line units and leads to the matrix.
  const supply = page.locator('#panel-team [data-from-line="area-payments"]');
  await expect(supply.getByRole('button', { name: 'Open Orvalis Ware in the line' })).toBeVisible();
  await expect(supply.getByRole('button', { name: 'Open Orvalis Geld in the line' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the matrix for Velmora Holding' }).click();
  await expect(page.getByRole('tab', { name: 'Matrix', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Presenting keeps line names out: no line chips on a product's members.
  await pickUnit(page, 'Team Alpha');
  await page.locator('#tab-team').click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('#panel-team [data-unit-chip]')).toHaveCount(0);
});

test('own line levels: add one in Settings and put a unit on it (#408)', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await showView(page, 'Settings');
  const levels = page.getByRole('region', { name: 'Levels of the line' });
  await expect(levels.getByRole('listitem')).toHaveCount(3);
  // The levels in use cannot be removed; the company level has no units yet.
  await expect(levels.getByRole('button', { name: 'Remove Specialist group' })).toBeDisabled();
  await expect(levels.getByRole('button', { name: 'Remove Company' })).toBeEnabled();
  await expect(levels.getByRole('listitem').nth(1)).toContainText('1 unit');

  // A fourth level, moved between specialist group and line team, renamed "Squad".
  await levels.getByRole('button', { name: 'Add level' }).click();
  await expect(levels.getByRole('listitem')).toHaveCount(4);
  const fresh = levels.getByLabel('Name of line level 4');
  await expect(fresh).toBeFocused();
  await fresh.fill('Squad');
  await fresh.press('Enter');
  await fresh.blur();
  await levels.getByRole('button', { name: 'Move Squad up' }).click();
  await expect(levels.getByLabel('Name of line level 3')).toHaveValue('Squad');
  await expect(levels.getByLabel('Name of line level 4')).toHaveAttribute(
    'placeholder',
    'Line team',
  );
  expect((await new AxeBuilder({ page }).include('.line-levels').analyze()).violations).toEqual([]);

  // A new unit on the new level sits between the group and its line teams.
  await toWorld(page, 'Line');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Add line unit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add line unit' });
  await dialog.getByLabel('Name of the line unit').fill('Squad Nord');
  await dialog.getByLabel('Belongs to').selectOption({ label: 'Orvalis' });
  await dialog.getByLabel('Level', { exact: true }).selectOption({ label: 'Squad' });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.switcher .pick')).toContainText('Squad');

  await pickLine(page, 'Orvalis Ware');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Edit …' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Orvalis Ware' });
  await edit.getByLabel('Belongs to').selectOption({ label: '\u00a0\u00a0\u00a0Squad Nord' });
  await edit.getByRole('button', { name: 'Apply' }).click();
  await expect(edit).toBeHidden();
  await expect(page.locator('.switcher .pick')).toContainText('Line team');
});
