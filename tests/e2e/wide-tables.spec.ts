import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWorkspaceFile, pickUnit, showAreaPage, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'));
});

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
/** The example with an hourly rate: Commerce has 2 teams and 4 roles. */
function example() {
  const ws = read('src/data/examples/example.caldence.json');
  ws.settings.locale = 'en';
  ws.settings.hourlyRate = 80;
  return ws;
}
/** A Scrum, a Kanban and a SAFe team from the wizard in one "Release Train": 10 roles (#469). */
const wizard = () => read('tests/fixtures/wizard-area.caldence.json');

/** Picks a unit; the area level of the SAFe template is "Release Train", two words. */
async function pick(page: Page, name: string) {
  if (name !== 'Release Train') return pickUnit(page, name);
  await page.locator('.switcher .pick').click();
  await page
    .locator('.switcher .list')
    .getByRole('button', { name: /^Release Train ,/ })
    .click();
}

/** The cell lies inside the visible box of its scroll region, without scrolling it. */
async function expectInView(cell: Locator) {
  await expect(cell).toBeVisible();
  const [c, box] = await cell.evaluate((el) => {
    const region = el.closest('[role=region]')!;
    const r = (e: Element) => e.getBoundingClientRect().toJSON() as DOMRect;
    return [r(el), r(region)];
  });
  expect(c.left).toBeGreaterThanOrEqual(box.left - 1);
  expect(c.right).toBeLessThanOrEqual(box.right + 1);
}

const cases = [
  { file: 'example', ws: example, team: 'Team Alpha', area: 'Commerce', areaView: 'Area' },
  {
    file: 'wizard area',
    ws: wizard,
    team: 'Customer Onboarding Agile Team',
    area: 'Release Train',
    areaView: 'Release Train',
  },
];

for (const width of [1280, 1440])
  for (const c of cases)
    test(`Total and cost columns are in view at ${width} px (${c.file}, #469)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await openWorkspaceFile(page, c.ws());
      for (const unit of [c.team, c.area]) {
        await pick(page, unit);
        await showView(page, 'Meeting load');
        const base = page.getByRole('table', { name: 'Base load per week' });
        await expectInView(base.getByRole('columnheader', { name: 'Total' }));
        await expectInView(base.locator('tbody tr').first().locator('td.total'));
      }
      await showView(page, c.areaView);
      await showAreaPage(page, 'Overview');
      const costs = page.locator('[data-area-costs]');
      for (const name of ['Cost per week', 'per person invited'])
        await expectInView(costs.getByRole('columnheader', { name }));
    });

test('the area share under a cost is left out when it is €0 (#469)', async ({ page }) => {
  await page.goto('/');
  const ws = example();
  ws.areas[0].events = [];
  await openWorkspaceFile(page, ws);
  await pickUnit(page, 'Commerce');
  await showView(page, 'Area');
  await showAreaPage(page, 'Overview');
  const costs = page.locator('[data-area-costs]');
  await expect(costs.locator('[data-cost-row="team-gamma"] td.cost')).toBeVisible();
  await expect(costs.locator('[data-area-share]')).toHaveCount(0);
});
