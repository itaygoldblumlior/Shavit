// The Workouts tab: Plans / History / Progress, compact plan rows.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, createPlan, goTo } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
  await onboard(page); // "Upper" on Sundays
});

test('a plan row shows its days and when it was last done', async ({ page }) => {
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6');
  const row = page.locator('[data-plan-card]', { hasText: 'Upper' });
  await expect(row).toContainText('Sun');
  await expect(row).toContainText('not done yet');

  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.locator('#finish-workout')).toBeDisabled(); // workout screen is open
  for (const box of await page.locator('input[data-done]').all()) await box.check();
  await page.locator('#finish-workout').click();
  await goTo(page, 'plans');
  await expect(row).toContainText('last: today ✓');
});

test('History lists finished workouts; Progress keeps the graphs', async ({ page }) => {
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.locator('main')).toContainText('No workouts logged yet.');

  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.locator('#finish-workout')).toBeDisabled(); // workout screen is open
  for (const box of await page.locator('input[data-done]').all()) await box.check();
  await page.locator('#finish-workout').click();
  await goTo(page, 'plans');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.locator('[data-history]')).toContainText('Upper');

  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('#graph-exercise')).toBeVisible();
});

test('search filters the plan list', async ({ page }) => {
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6');
  await createPlan(page, 'Legs', 'Squat 60x5 100x5');
  await page.locator('#plan-search').fill('squat');
  await expect(page.locator('[data-plan-card]:visible')).toHaveCount(1);
  await expect(page.locator('[data-plan-card]:visible')).toContainText('Legs');
});
