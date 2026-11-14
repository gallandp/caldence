import { expect, test } from '@playwright/test';

// The static intro of index.html for visitors and crawlers without JavaScript (#135).

test('without JavaScript the page describes Caldence', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Caldence' })).toBeVisible();
  await expect(page.getByText('exports them to Outlook')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Caldence auf Deutsch' })).toBeVisible();
  await context.close();
});

test('the served HTML contains the intro', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('class="static-intro"');
  expect(html).toContain('Scrum, Kanban and SAFe');
});

test('with JavaScript the app replaces the intro', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tablist').first()).toBeVisible();
  await expect(page.locator('.static-intro')).toHaveCount(0);
  await expect(page.getByRole('main')).toHaveCount(1);
});
