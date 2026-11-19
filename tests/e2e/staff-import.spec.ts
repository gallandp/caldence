import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { areaWorkspace } from './area-fixture';
import { openWorkspaceFile, useFileFallback } from './helpers';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await useFileFallback(page);
});

/** The area fixture with an invented line: specialist group Trade with line team Orvalis Ware. */
function linedWorkspace() {
  const ws = areaWorkspace() as ReturnType<typeof areaWorkspace> & Record<string, unknown>;
  ws.settings.locale = 'en';
  ws.lineUnits = [
    { id: 'g1', name: 'Trade' },
    { id: 'l1', name: 'Orvalis Ware', parentId: 'g1' },
  ];
  return ws;
}

const CSV = [
  'Personnel no.;Name;Line team;Contract FTE;Skills;Specialist group;Company',
  '4711;Lina Hartwig;Orvalis Ware;1;"Orvalis Lager; Orvalis Skript";;Velmora AG',
  '4712;Ronja Pfeil;Netze;0,5;Netzbau;Engineering;Velmora AG',
  '4713;Tilo Brand;Orvalis Kasse;1;Orvalis Konten;;Velmora AG',
].join('\n');

test('Import / Export imports line staff from a CSV with a preview and one-step undo', async ({
  page,
}) => {
  await page.goto('/');
  await openWorkspaceFile(page, linedWorkspace());
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Import / Export' });
  await panel.getByRole('button', { name: 'Import staff…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Import staff' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose file…' })).toBeFocused();
  await expect(dialog).toContainText('Afterwards the file contains personal data');

  // The template comes as a workbook with the template's columns.
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download template (.xlsx)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('staff-template.xlsx');
  const bytes = readFileSync((await file.path())!).toString('utf8');
  expect(bytes).toContain('<sheet name="Staff"');
  expect(bytes).toContain('Contract FTE');

  await dialog.locator('input[type=file]').setInputFiles({
    name: 'staff.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await expect(dialog).toContainText('3 rows read');
  await expect(dialog).toContainText('Not taken: Personnel no.');
  await expect(dialog.getByText('2 new', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 row with an error')).toBeVisible();
  await expect(dialog).toContainText('Line team “Netze” will be created');
  await expect(dialog).toContainText('Line team “Orvalis Kasse” does not exist');
  await expect(dialog.getByText('4711')).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);

  await dialog.getByRole('button', { name: 'Take over 2 people' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole('status').first()).toContainText('2 people taken over.');

  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(panel.getByRole('status').first()).toContainText('Import undone.');
  await expect(panel.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('the staff import asks who is meant when company + name are not unique', async ({ page }) => {
  const ws = linedWorkspace();
  ws.companies = [{ id: 'co1', name: 'Velmora AG' }];
  (ws.people as { id: string; name: string }[]).push(
    { id: 'p-l1', name: 'Lina Hartwig', lineUnitId: 'l1', companyId: 'co1' } as never,
    {
      id: 'p-l2',
      name: 'Lina Hartwig',
      lineUnitId: 'l1',
      companyId: 'co1',
      contractFte: 0.5,
    } as never,
  );
  await page.goto('/');
  await openWorkspaceFile(page, ws);
  await page.getByRole('tab', { name: 'Import / Export', exact: true }).click();
  await page.getByRole('button', { name: 'Import staff…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import staff' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'staff.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Name,Line team,Contract FTE,Skills,Company\nLina Hartwig,Orvalis Ware,"0,8",,Velmora AG',
    ),
  });
  await expect(dialog.getByText('1 to choose')).toBeVisible();
  const submit = dialog.getByRole('button', { name: /Take over/ });
  await expect(submit).toBeDisabled();
  await dialog
    .getByRole('combobox', { name: /Lina Hartwig/ })
    .selectOption({ label: 'Lina Hartwig · Orvalis Ware, 0.5 FTE' });
  await expect(dialog.getByText('1 updated')).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Import staff…' })).toBeFocused();
});
