import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lineWorkspace } from './line-fixture';
import { openExample, openWorkspaceFile, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.goto('/');
});

/** Picks a line unit in the switcher's "Line" group. */
async function pickLine(page: Page, name: string) {
  await page.locator('.switcher .pick').click();
  await page
    .locator('.switcher .list button.line')
    .filter({ has: page.locator('.opt-name-line', { hasText: new RegExp(`^${name}$`) }) })
    .click();
  await expect(page.locator('.switcher .pick .label')).toHaveText(name);
}

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

test('without a line the switcher has no line group', async ({ page }) => {
  await openExample(page);
  await page.locator('.switcher .pick').click();
  await expect(page.locator('.switcher .list')).toBeVisible();
  await expect(page.locator('.switcher .list .line-group')).toHaveCount(0);
});

test('a line team shows its staff, and a person opens with figures and line fields', async ({
  page,
}) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await page.locator('.switcher .pick').click();
  const group = page.locator('.switcher .list').getByText('Line', { exact: true });
  await expect(group).toBeVisible();
  await page.keyboard.press('Escape');
  await pickLine(page, 'Orvalis Ware');

  // The Team entry carries the level, and the page has the tabs Staff | Staffing.
  await showView(page, 'Line team');
  const view = panel(page, 'Line team');
  await expect(view.getByRole('heading', { level: 2 })).toHaveText('Orvalis Ware');
  await expect(view.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(view.getByRole('tab', { name: 'Staffing' })).toBeVisible();
  await expect(view.getByText('Staff by contract')).toBeVisible();
  await expect(view.locator('.tile').nth(1)).toContainText('3.8 FTE');

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
  await expect(view.locator('.tile').nth(1)).toContainText('3.3 FTE');
  await expect(rows.filter({ hasText: 'Sam' })).toContainText('overbooked');

  expect(
    (await new AxeBuilder({ page }).include('#panel-team').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
});

test('a specialist group lists its line teams and opens them', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis');
  await showView(page, 'Specialist group');
  const view = panel(page, 'Specialist group');
  await expect(view.getByRole('heading', { name: 'Units below' })).toBeVisible();
  await expect(view.locator('button.kid')).toHaveCount(2);
  await expect(view.locator('tbody tr')).toHaveCount(7);
  await view.locator('button.kid', { hasText: 'Orvalis Geld' }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Geld');
});

test('calendar, meeting load and meetings follow the line team', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');

  await showView(page, 'Calendar');
  const legend = panel(page, 'Calendar').locator('.legend');
  await expect(legend).toContainText('Team Alpha');
  await expect(legend).toContainText('Team Gamma');
  await expect(legend).not.toContainText('Team Delta');
  await expect(legend).toContainText('people of this line unit');
  // The person filter offers only the line team's people.
  const person = page.getByLabel('Person', { exact: true });
  await expect(person.locator('option')).toHaveText(['All', 'Alex', 'Sam', 'Kim', 'Lou']);

  await showView(page, 'Meeting load');
  const people = panel(page, 'Meeting load').locator('section', { hasText: 'People' }).last();
  await expect(people).toContainText('Kim');
  await expect(people).not.toContainText('Nia');

  await showView(page, 'Meetings & cadence');
  const meetings = panel(page, 'Meetings & cadence');
  await expect(meetings.getByRole('button')).toHaveCount(3);
  await meetings.getByRole('button', { name: /Team Gamma/ }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Team Gamma');
});

test('line units and skills are managed in place', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await page.getByRole('button', { name: 'Team actions' }).click();
  await page.locator('.switcher').getByRole('button', { name: 'Add line team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add line team' });
  await dialog.getByLabel('Name of the line unit').fill('Orvalis Markt');
  await dialog.getByLabel('Belongs to').selectOption({ label: 'Orvalis' });
  await dialog.getByLabel('Line manager').selectOption({ label: 'Ruth' });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.switcher .pick .label')).toHaveText('Orvalis Markt');

  await showView(page, 'Line team');
  const view = panel(page, 'Line team');
  await expect(view.getByText('Nobody in this line team yet')).toBeVisible();
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
  await showView(page, 'Line team');
  const view = panel(page, 'Line team');
  await view.getByRole('button', { name: 'Manage skills' }).click();
  const skills = page.getByRole('dialog', { name: 'Manage skills' });
  await skills.getByRole('button', { name: 'Delete skill family Orvalis' }).click();

  // The warning names the skills, the people holding them and the line unit naming the family.
  const confirm = page.getByRole('dialog', { name: 'Delete the skill family “Orvalis”?' });
  await expect(confirm).toContainText('3 skills · 4 people · Line units: 1');
  await confirm.getByRole('button', { name: 'Delete family' }).click();
  await expect(confirm).toBeHidden();
  await expect(skills).toContainText('No skill family yet');
  await skills.getByRole('button', { name: 'Done' }).click();
  await expect(view.locator('tbody')).not.toContainText('Orvalis Lager');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(view.locator('tbody')).toContainText('Orvalis Lager');
  await view.getByRole('button', { name: 'Manage skills' }).click();
  await expect(skills.getByLabel('Name of the skill family')).toHaveValue('Orvalis');
});

test('presenting hides the tabs and line staff names', async ({ page }) => {
  await openWorkspaceFile(page, lineWorkspace(), 'line.caldence.json');
  await pickLine(page, 'Orvalis Ware');
  await showView(page, 'Line team');
  await page.getByRole('button', { name: 'Present' }).click();
  const view = panel(page, 'Line team');
  await expect(view.getByRole('tab', { name: 'Staff', exact: true })).toHaveCount(0);
  await expect(view.getByRole('tab', { name: 'Staffing' })).toHaveCount(0);
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
