// US-2 · Plan my day: one-time and repeating tasks show on the right days and stay ticked.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, MONDAY } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
  await onboard(page);
});

async function addTask(page, name, { repeatOn = [] } = {}) {
  await page.getByRole('button', { name: '＋ Add task' }).click();
  await page.locator('#task-name').fill(name);
  for (const day of repeatOn) await page.locator(`input[name="days"][value="${day}"]`).check();
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor')).toBeHidden();
}

const tasks = (page) => page.locator('[data-task]');

test('a one-time task shows only on its own date', async ({ page }) => {
  await addTask(page, 'Read 10 pages');
  await expect(page.getByLabel('Complete Read 10 pages')).toBeVisible();

  await page.locator(`[data-day="${MONDAY}"]`).click();
  await expect(page.getByLabel('Complete Read 10 pages')).toHaveCount(0);
});

test('a weekly task shows on every matching weekday', async ({ page }) => {
  await addTask(page, 'Stretch', { repeatOn: [1] }); // Mondays
  await expect(page.getByLabel('Complete Stretch')).toHaveCount(0); // not today (Sunday)

  await page.locator(`[data-day="${MONDAY}"]`).click();
  await expect(page.getByLabel('Complete Stretch')).toBeVisible();

  await page.locator('#next-week').click();
  await page.locator('[data-day="2026-12-07"]').click(); // the following Monday
  await expect(page.getByLabel('Complete Stretch')).toBeVisible();
});

test('a completed task stays completed after a reload', async ({ page }) => {
  await addTask(page, 'Call grandma');
  await page.getByLabel('Complete Call grandma').check();
  await expect(page.getByLabel('Complete Call grandma')).toBeChecked();

  await page.reload();
  await expect(page.getByLabel('Complete Call grandma')).toBeChecked();
  await expect(tasks(page)).toHaveCount(1);
});
