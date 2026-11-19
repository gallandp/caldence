import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AREA_CONTROLS, AREA_LABELS } from '../../src/ui/help/areas';
import {
  autosaved,
  currentUnit,
  openExample,
  openWorkspaceFile,
  pickUnit,
  showAreaPage,
  showView,
  unitNames,
  useFileFallback,
} from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

const catalogue: Record<string, string> = JSON.parse(readFileSync('src/i18n/en.json', 'utf8'));
/** A label as the UI shows it with the default level names Area/Team. */
const LEVELS: Record<string, string> = {
  levelArea: 'Area',
  levelAreaLc: 'area',
  levelTeam: 'Team',
  levelTeamLc: 'team',
  levelTeams: 'Teams',
  levelTeamsLc: 'teams',
};
const en = (key: string) => catalogue[key]!.replace(/\{(\w+)\}/g, (m, k: string) => LEVELS[k] ?? m);
const example = JSON.parse(readFileSync('src/data/examples/example.caldence.json', 'utf8'));

/** The example with only Team Alpha and Team Beta and no area. */
function twoTeams() {
  const ws = structuredClone(example);
  ws.settings.locale = 'en';
  ws.teams = ws.teams.slice(0, 2);
  ws.areas = [];
  return ws;
}

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name, exact: true });
const hint = (page: Page) =>
  page.getByRole('region', { name: 'Do your teams belong together?', exact: true });
const ready = (page: Page, name: string) =>
  page.getByRole('region', { name: `Area ${name} is ready`, exact: true });

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test('the start screen mentions areas, and the example opens with its area', async ({ page }) => {
  await page.goto('/');
  // The roles offer areas from the start (#387).
  await expect(
    page.getByRole('button', { name: 'Leading several teams' }),
  ).toHaveAccessibleDescription(
    /Platform Owner, head of area or department.*Set up a unit and its teams/,
  );
  await openExample(page);
  await expect(unitNames(page)).toContainText(['Commerce', 'Team Gamma', 'Team Delta']);
  // The example has an area, so the hint to group teams stays away.
  await expect(hint(page)).toHaveCount(0);
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await showAreaPage(page, 'Structure');
  const area = panel(page, 'Area');
  // Three groups of people: only in the area, in a team and the area, only in a team.
  await expect(area.getByText('Jordan').first()).toBeVisible();
  await expect(area.getByText('Kim').first()).toBeVisible();
  await expect(area.getByText('Robin').first()).toBeVisible();
});

test('two teams without an area get a hint that groups them; dismissed it stays away', async ({
  page,
}) => {
  await page.goto('/');
  await openWorkspaceFile(page, twoTeams());
  // Not on the Calendar, where people who only read a plan land.
  await expect(hint(page)).toHaveCount(0);
  await showView(page, 'Team');
  await expect(hint(page)).toBeVisible();
  await hint(page).getByRole('button', { name: 'Hide this hint' }).click();
  await expect(hint(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Team', exact: true })).toBeFocused();
  // The same workspace after a reload (back on the Team page, where it was): still dismissed.
  await autosaved(page, '"page":"team"');
  await page.reload();
  await expect(page.getByRole('list', { name: 'Members of Team Alpha' })).toBeVisible();
  await expect(hint(page)).toHaveCount(0);
});

test('the hint opens Add area; the new area shows its "ready" card with three next steps', async ({
  page,
}) => {
  await page.goto('/');
  await openWorkspaceFile(page, twoTeams());
  await showView(page, 'Team');
  await hint(page).getByRole('button', { name: 'Group teams into one area' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add area' });
  await dialog.getByLabel('Area name').fill('Platform');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(currentUnit(page)).toHaveText('Platform');
  await expect(hint(page)).toHaveCount(0);

  // The area's page opens with the card.
  await expect(page.getByRole('tab', { name: 'Area', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const card = ready(page, 'Platform');
  await expect(card).toContainText('does not raise the meeting load in the team');
  await expect(card).toContainText('0 h in the area until you set their hours');
  await expect(card).toContainText('Settings');

  // An area without teams shows how to choose them instead of an empty tree.
  const area = panel(page, 'Area');
  await expect(area.getByText('Platform has no teams yet. Choose the teams')).toBeVisible();

  await card.getByRole('button', { name: 'Choose teams …' }).click();
  const teams = page.getByRole('dialog', { name: 'Teams in Platform' });
  await teams.getByRole('checkbox', { name: 'Team Alpha' }).check();
  await teams.getByRole('button', { name: 'Apply' }).click();
  await expect(teams).toBeHidden();
  await expect(area.getByText('Platform has no teams yet')).toHaveCount(0);

  await card.getByRole('button', { name: '+ Person' }).click();
  const add = page.getByRole('dialog', { name: 'Add a person to Platform' });
  await expect(add).toBeVisible();
  await page.keyboard.press('Escape');

  await card.getByRole('button', { name: 'Plan meetings' }).click();
  await expect(page.getByRole('tab', { name: 'Meetings & cadence', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const meetings = panel(page, 'Meetings & cadence');
  const empty = meetings.getByRole('region', { name: 'No meetings in the area yet' });
  await expect(empty).toContainText('“Every team”');
  await empty.getByRole('button', { name: 'Add the first meeting' }).click();
  await expect(empty).toHaveCount(0);
  // The card was closed by going on; it does not come back.
  await showView(page, 'Area');
  await expect(ready(page, 'Platform')).toHaveCount(0);
});

test('closing the ready card keeps the focus on the page', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceFile(page, twoTeams());
  await showView(page, 'Team');
  await hint(page).getByRole('button', { name: 'Group teams into one area' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add area' });
  await dialog.getByLabel('Area name').fill('Platform');
  await dialog.getByRole('checkbox', { name: 'Team Alpha' }).check();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const card = ready(page, 'Platform');
  // Teams were chosen in the dialog: that step is left out.
  await expect(card.getByRole('button', { name: 'Choose teams …' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Structure', exact: true })).toBeFocused();
});

/** Opens a help topic from the home page; `more` unfolds its details. */
async function openTopic(page: Page, id: string, more = false) {
  const help = panel(page, 'Help');
  if (await help.getByRole('button', { name: 'All help topics' }).isVisible())
    await help.getByRole('button', { name: 'All help topics' }).click();
  await help.locator(`[data-topic="${id}"]`).click();
  if (more) await help.getByText('Good to know', { exact: true }).click();
  return help.getByRole('article');
}

test('the areas guide names controls the area page has', async ({ page }) => {
  await openExample(page);
  await showView(page, 'Help');
  const guide = await openTopic(page, 'areas', true);
  await expect(guide.getByRole('heading', { level: 3, name: 'Group teams' })).toBeVisible();
  const text = (await guide.textContent()) ?? '';
  for (const c of AREA_CONTROLS) expect(text).toContain(en(AREA_LABELS[c.label]!));

  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await showAreaPage(page, 'Structure');
  const area = panel(page, 'Area');
  for (const c of AREA_CONTROLS)
    await expect(area.getByRole(c.role, { name: en(c.name), exact: true })).toBeVisible();
});

test('the other help topics describe areas and name controls that exist (#193)', async ({
  page,
}) => {
  await openExample(page);
  await showView(page, 'Help');
  const paragraphs: [string, string, boolean][] = [
    ['help.views.areas', 'views', false],
    ['help.calc.areas', 'calc', false],
    ['help.files.areas', 'files', true],
    ['help.ics.areas', 'calendar', true],
    ['help.keyboard.areas', 'keys', false],
  ];
  let text = '';
  for (const [key, topic, more] of paragraphs) {
    const article = await openTopic(page, topic, more);
    const shown = (await article.textContent()) ?? '';
    // Every paragraph is shown with its placeholders filled.
    expect(shown).toContain(
      en(key)
        .split(/\{\w+\}/)[0]!
        .trim(),
    );
    text += shown;
  }
  expect(text).not.toMatch(/\{level\w+\}/);
  for (const name of ['Area', 'Structure', 'Overview', 'Levels', 'What to export'])
    expect(text).toContain(name);
  // The links lead to the areas guide.
  await openTopic(page, 'views');
  await panel(page, 'Help').locator('a[href="#help-areas"]').first().click();
  await expect(
    panel(page, 'Help').getByRole('heading', { level: 3, name: 'Group teams' }),
  ).toBeFocused();

  // Controls the new paragraphs name, where they are.
  await showView(page, 'Import / Export');
  const exchange = panel(page, 'Import / Export');
  await expect(exchange.getByText(en('exchange.export.scope'), { exact: true })).toBeVisible();
  await expect(exchange.getByRole('radio', { name: 'Team', exact: true })).toBeVisible();
  await expect(
    exchange.getByRole('button', { name: en('exchange.zip.button.team'), exact: true }),
  ).toBeVisible();
  await showView(page, 'Settings');
  await expect(panel(page, 'Settings').getByText(en('settings.levels.choice'))).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`an area without teams offers "Choose teams" on its overview (#254, ${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const ws = structuredClone(example);
    ws.settings.locale = 'en';
    ws.areas[0].teamIds = [];
    await page.goto('/');
    await openWorkspaceFile(page, ws);
    await pickUnit(page, 'Commerce');
    await showView(page, 'Area');
    const area = panel(page, 'Area');
    await area.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(area.getByText('Commerce has no teams yet. Choose the teams')).toBeVisible();
    await expect(area.getByText('⋯ menu')).toHaveCount(0);
    await expect(area.getByRole('heading', { name: 'Cadence and meeting load' })).toHaveCount(0);
    await axe(page);
    if (scheme === 'light') {
      await page.setViewportSize({ width: 390, height: 844 });
      await axe(page);
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await area.getByRole('button', { name: 'Choose teams …' }).click();
    const teams = page.getByRole('dialog', { name: 'Teams in Commerce' });
    await teams.getByRole('checkbox', { name: 'Team Gamma' }).check();
    await teams.getByRole('button', { name: 'Apply' }).click();
    await expect(teams).toBeHidden();
    await expect(area.getByText('Commerce has no teams yet')).toHaveCount(0);
    // The button is gone with the empty state: focus lands on the chosen team, and the comparison
    // of cadences, hidden without teams, is back.
    // (The cost table's link, not the overlap example above it, which also names Team Gamma.)
    await expect(
      area.locator('[data-area-costs]').getByRole('button', { name: /Team Gamma/ }),
    ).toBeFocused();
    await expect(area.getByRole('heading', { name: 'Cadence and meeting load' })).toBeVisible();
  });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test(`axe passes on the hint, the ready card and the empty states (${scheme}, ${width} px)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await openWorkspaceFile(page, twoTeams());
      await page.setViewportSize({ width, height: 900 });
      await showView(page, 'Team');
      await expect(hint(page)).toBeVisible();
      await axe(page);
      await hint(page).getByRole('button', { name: 'Group teams into one area' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add area' });
      await dialog.getByLabel('Area name').fill('Platform');
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(ready(page, 'Platform')).toBeVisible();
      await axe(page);
      await ready(page, 'Platform').getByRole('button', { name: 'Plan meetings' }).click();
      await expect(page.getByRole('region', { name: 'No meetings in the area yet' })).toBeVisible();
      await axe(page);
    });
  }
}
