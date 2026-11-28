// The streak fire next to Shavit's face.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, createPlan, goTo } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await freezeTime(page); // Sunday 29 Nov 2026, 10:00
  await onboard(page); // "Upper" on Sundays
});

test('the fire sits still until today’s workout is logged, then burns', async ({ page }) => {
  await createPlan(page, 'Upper', 'Bench press 40x8 60x6');
  await goTo(page, 'today');
  await expect(page.locator('main')).not.toContainText(' done');
  const fire = page.locator('#streak-fire');
  await expect(fire).not.toHaveClass(/lit/);
  await expect(fire).toHaveText('0');

  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.locator('#finish-workout')).toBeDisabled();
  for (const box of await page.locator('input[data-done]').all()) await box.check();
  await page.locator('#finish-workout').click();
  await expect(fire).toHaveClass(/lit/);
  await expect(fire).toHaveText('1');

  await fire.click();
  await expect(page.getByRole('tab', { name: 'Progress' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('today’s timeline opens scrolled to the current time', async ({ page }) => {
  await goTo(page, 'today');
  // 10:00 → one hour above it is 9:00, i.e. 9 × 56px.
  await expect
    .poll(() => page.locator('#timeline').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(400);
});
