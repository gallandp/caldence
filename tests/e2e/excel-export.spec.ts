import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import { openWorkspaceFile, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

test('Import / Export saves the structure as an Excel workbook', async ({ page }) => {
  const ws = areaWorkspace();
  ws.settings.locale = 'en';
  await page.goto('/');
  await openWorkspaceFile(page, ws);
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Import / Export' });
  await expect(panel.getByRole('heading', { name: 'Export as Excel' })).toBeVisible();

  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export Excel file (.xlsx)…' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('caldence-structure.xlsx');
  await expect(panel.getByRole('status')).toContainText('Saved caldence-structure.xlsx.');

  // Stored ZIP: the sheets' XML is readable in the raw bytes.
  const bytes = readFileSync((await file.path())!).toString('utf8');
  expect(bytes).toContain('xl/worksheets/sheet3.xml');
  expect(bytes).toContain('<sheet name="Structure"');
  expect(bytes).toContain(`<t xml:space="preserve">${ws.teams[0]!.name}</t>`);
});
