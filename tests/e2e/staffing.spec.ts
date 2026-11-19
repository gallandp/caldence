import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { staffingWorkspace } from './line-fixture';
import { openWorkspaceFile, showView, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
  await page.goto('/');
});

async function openBoard(page: Page) {
  await openWorkspaceFile(page, staffingWorkspace(), 'staffing.caldence.json');
  await page
    .getByRole('radiogroup', { name: 'World' })
    .getByRole('radio', { name: 'Line' })
    .click();
  await page.locator('.switcher .pick').click();
  await page
    .locator('.switcher .list button.line')
    .filter({ has: page.locator('.opt-name-line', { hasText: /^Orvalis Ware$/ }) })
    .click();
  await showView(page, 'Staffing');
  return page.getByRole('tabpanel', { name: 'Staffing' });
}

const row = (board: ReturnType<Page['locator']>, key: string) =>
  board.locator(`[data-demand="${key}"]`);

test('people by free FTE, open demands of the family by platform, filters', async ({ page }) => {
  const board = await openBoard(page);
  await expect(board.getByText('Payments', { exact: true })).toBeVisible();
  // Gamma's Lager demand is partly staffed (Sam 0.2); Delta's role-only demand is no Orvalis skill.
  await expect(
    board.getByText('4 open demands of the skill family Orvalis in 1 area.'),
  ).toBeVisible();
  await expect(row(board, 'team-gamma/d1')).toContainText('0.3');
  await expect(row(board, 'team-delta/d2')).toHaveCount(0);

  // "only with free time" is on; Kim (0.8 contract, 0.5 in Gamma) has 0.3 free.
  const people = board.locator('button.person');
  await expect(board.getByText(/only with free time \(\d of 4\)/)).toBeVisible();
  await board.getByRole('button', { name: 'Orvalis Betrieb', exact: true }).click();
  await expect(people).toHaveCount(1);
  await expect(people.first()).toContainText('Kim');
  await expect(people.first()).toContainText('0.3');
  await board.getByRole('button', { name: 'all skills' }).click();

  // Product search reaches the role-only demand too.
  await board.getByLabel('Search team').fill('delta');
  await expect(row(board, 'team-delta/d2')).toBeVisible();
  await board.getByLabel('Search team').fill('');

  const axe = await new AxeBuilder({ page }).include('.board').analyze();
  expect(axe.violations).toEqual([]);
});

test('select first and drag create the same assignment; undo removes it', async ({ page }) => {
  const board = await openBoard(page);
  const kim = board.locator('button.person[data-person="person-kim"]');

  // Select first: Kim fits the Betrieb demand of Alpha, which moves up and offers "Assign Kim".
  await kim.click();
  await expect(kim).toHaveAttribute('aria-pressed', 'true');
  await expect(board.getByRole('status').filter({ hasText: '1 fits Kim.' })).toBeVisible();
  const target = row(board, 'team-alpha/d2');
  await expect(target).toHaveClass(/match/);
  await target
    .getByRole('button', { name: /^Assign Kim ?: Orvalis Betrieb in Team Alpha$/ })
    .click();
  const dialog = page.locator('[data-assign-dialog]');
  await expect(dialog.getByRole('heading')).toHaveText('Kim → Team Alpha');
  await expect(dialog.locator('input[type="number"]')).toHaveValue('0.3');
  await dialog.locator('[data-assign-save]').click();
  await expect(dialog).toHaveCount(0);
  const toast = board.locator('.toast');
  await expect(toast.getByRole('status')).toHaveText('Kim → Team Alpha: 0.3 FTE assigned.');
  await expect(target).toContainText('0.2');
  await expect(target.getByRole('img', { name: 'Assigned: Kim' })).toBeVisible();
  const afterSelect = await target.innerText();

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(toast).toContainText('Assignment undone.');
  await expect(kim).toBeFocused();
  await expect(target).toContainText('0.5');
  await expect(target.getByRole('img', { name: 'Assigned: Kim' })).toHaveCount(0);

  // Drag: the same assignment through the dialog.
  await board.getByRole('button', { name: 'Clear selection' }).click();
  await kim.dragTo(target);
  await expect(dialog.getByRole('heading')).toHaveText('Kim → Team Alpha');
  await dialog.locator('[data-assign-save]').click();
  await expect(toast).toContainText('Kim → Team Alpha: 0.3 FTE assigned.');
  expect(await target.innerText()).toBe(afterSelect);
});

test('dropping on a demand without the skill is allowed with a hint', async ({ page }) => {
  const board = await openBoard(page);
  await board
    .locator('button.person[data-person="person-kim"]')
    .dragTo(row(board, 'team-alpha/d1'));
  const dialog = page.locator('[data-assign-dialog]');
  await expect(dialog.locator('[data-assign-noskill]')).toHaveText(
    'Kim does not have the skill Orvalis Lager. Assigning is still possible.',
  );
  await expect(dialog.locator('[data-assign-save]')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Kim is already in Gamma: no dialog that would pick someone else, a hint instead.
  await board
    .locator('button.person[data-person="person-kim"]')
    .dragTo(row(board, 'team-gamma/d1'));
  await expect(dialog).toHaveCount(0);
  await expect(board.locator('.toast').getByRole('status')).toHaveText(
    'Kim is already in Team Gamma.',
  );
});

test('a fully staffed demand leaves the list', async ({ page }) => {
  const board = await openBoard(page);
  // Lou has 0.5 free, exactly Alpha's Betrieb demand: the dialog suggests all of it.
  await board.locator('button.person[data-person="person-lou"]').click();
  await row(board, 'team-alpha/d2')
    .getByRole('button', { name: /^Assign Lou ?: Orvalis Betrieb in Team Alpha$/ })
    .click();
  const dialog = page.locator('[data-assign-dialog]');
  await expect(dialog.locator('input[type="number"]')).toHaveValue('0.5');
  await dialog.locator('[data-assign-save]').click();
  await expect(board.locator('.toast')).toContainText('The demand is fully staffed.');
  await expect(row(board, 'team-alpha/d2')).toHaveCount(0);
  await expect(board.locator('.toast').getByRole('button', { name: 'Undo' })).toBeFocused();
});

test('presenting hides the staffing page', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Staffing' })).toHaveCount(0);
});

test.describe('phone', () => {
  test('people above demands, the select-first path works', async ({ page }) => {
    const board = await openBoard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const people = await board.locator('.people').boundingBox();
    const demands = await board.locator('.demands').boundingBox();
    expect(people!.y + people!.height).toBeLessThanOrEqual(demands!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await board.locator('button.person[data-person="person-kim"]').click();
    await row(board, 'team-alpha/d2')
      .getByRole('button', { name: /Assign Kim/ })
      .click();
    await expect(page.locator('[data-assign-dialog]')).toBeVisible();
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((e) => e.getBoundingClientRect().right > 391)
        .map((e) => `${e.tagName}.${e.className}`)
        .slice(0, 8),
    );
    expect(wide).toEqual([]);
  });
});
