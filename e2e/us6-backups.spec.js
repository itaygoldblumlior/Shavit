// US-6 · Keep my data safe: export a backup, import it into an empty browser.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freezeTime, onboard, createPlan, goTo, toast } from './helpers.js';

test('a backup moves plans and tasks into a brand-new browser', async ({ page, browser }) => {
  await freezeTime(page);
  await onboard(page);
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6 60x6');
  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Add a task or event' }).click();
  await page.locator('#add-kind-task').click();
  await page.locator('#task-name').fill('Read 10 pages');
  await page.locator('#editor-save').click();

  await goTo(page, 'settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^shavit-helper-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await download.path();
  expect(JSON.parse(await readFile(backupPath, 'utf8')).templates[0].name).toBe('Upper');

  // A second, completely empty browser profile: a new phone or laptop.
  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await freezeTime(page2);
  await onboard(page2, { liftName: 'Lower' });
  await goTo(page2, 'settings');
  await page2.locator('#import-backup').setInputFiles(backupPath);
  await expect(page2.locator('#editor')).toContainText('1 workout plans');
  await page2.locator('#import-mode').selectOption('replace');
  await page2.locator('#editor-save').click();
  await expect(page2.locator('#editor')).toBeHidden();

  await goTo(page2, 'plans');
  await expect(page2.locator('[data-plan-card]')).toContainText('Upper');
  await goTo(page2, 'today');
  await expect(page2.getByLabel('Complete Read 10 pages')).toBeVisible();
  await fresh.close();
});

test('a broken backup file is rejected and leaves existing data alone', async ({ page }) => {
  await freezeTime(page);
  await onboard(page);
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6 60x6');
  await goTo(page, 'settings');
  const before = await toast(page).textContent();
  await page.locator('#import-backup').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"this is": not json'),
  });
  await expect(toast(page)).not.toHaveText(before ?? ''); // an error message appears
  await expect(page.locator('#editor')).toBeHidden();
  await goTo(page, 'plans');
  await expect(page.locator('[data-plan-card]')).toContainText('Upper');
});
