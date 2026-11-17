import { expect, test, type Page } from '@playwright/test';
import { openExample, showView } from './helpers';

/** Width and height of a control's hit area, including an invisible ::after around it (#214). */
function hitArea(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    const grows = after.content !== 'none' && after.position === 'absolute';
    return {
      width: Math.max(box.width, grows ? parseFloat(after.width) : 0),
      height: Math.max(box.height, grows ? parseFloat(after.height) : 0),
      visual: { width: box.width, height: box.height },
    };
  });
}

const controls = ['Previous month', 'Next month', 'Today', 'Week', 'Month', 'Save', 'Team actions'];

test.describe('touch screen', () => {
  test.use({
    locale: 'en-US',
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test('buttons have hit areas of at least 44 × 44 px', async ({ page }) => {
    await openExample(page);
    for (const name of controls) {
      const { width, height } = await hitArea(page, name);
      expect.soft(width, name).toBeGreaterThanOrEqual(44);
      expect.soft(height, name).toBeGreaterThanOrEqual(44);
    }
    // Small icon buttons keep their look: only the invisible hit area grows.
    expect((await hitArea(page, 'Team actions')).visual.width).toBeLessThan(44);

    await showView(page, 'Team');
    const chip = await hitArea(page, 'Remove Alex (Product Owner)');
    expect(chip.width).toBeGreaterThanOrEqual(44);
    expect(chip.height).toBeGreaterThanOrEqual(44);
    expect(chip.visual.width).toBeLessThan(44);

    // Wrapped role chips: a tap at the edge of a remove button's hit area still hits that button.
    const hitsOwnButton = await page
      .getByRole('button', { name: 'Remove Alex (Product Owner)', exact: true })
      .evaluate((el) => {
        const chip = el.closest('.chip')!;
        for (let i = 0; i < 8; i++) chip.after(chip.cloneNode(true));
        const box = el.getBoundingClientRect();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        return [
          [x, y + 21],
          [x, y - 21],
          [x + 21, y],
          [x - 21, y],
        ].every(([px, py]) => document.elementFromPoint(px!, py!)?.closest('button') === el);
      });
    expect(hitsOwnButton).toBe(true);
  });
});

test.describe('fine pointer', () => {
  test.use({ locale: 'en-US' });

  test('keeps the compact sizes', async ({ page }) => {
    await openExample(page);
    expect((await hitArea(page, 'Today')).height).toBeLessThan(44);
    expect((await hitArea(page, 'Team actions')).width).toBeLessThan(44);
  });
});
