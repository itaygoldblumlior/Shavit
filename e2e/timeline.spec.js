// Today as an hour-by-hour timeline: every task and workout sits at its time.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
  await onboard(page);
});

const slot = (page, name) => page.locator('.slot', { hasText: name });
const topOf = (locator) => locator.evaluate((el) => parseFloat(el.style.top));

test('a workout is a block at its time, and tasks sit at theirs', async ({ page }) => {
  // Onboarding gives a lift a default time of 17:30 for one hour.
  await expect(slot(page, 'Upper')).toContainText('17:30 – 18:30');

  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.locator('#task-name').fill('Coffee with Noa');
  await page.locator('#task-time').fill('08:00');
  await page.locator('#editor-save').click();
  await expect(slot(page, 'Coffee with Noa')).toContainText('08:00');

  // Earlier in the day = higher on the timeline.
  expect(await topOf(slot(page, 'Coffee with Noa'))).toBeLessThan(await topOf(slot(page, 'Upper')));
  // There is a line for "now" (10:00 in these tests), between the two.
  const now = await page.locator('.now-line').evaluate((el) => parseFloat(el.style.top));
  expect(now).toBeGreaterThan(await topOf(slot(page, 'Coffee with Noa')));
});

test('changing a workout’s time moves its block, every week', async ({ page }) => {
  await page.getByRole('button', { name: 'Time for Upper' }).click();
  await page.locator('#act-time').fill('06:30');
  await page.locator('#act-duration').fill('90');
  await page.locator('#editor-save').click();
  await expect(slot(page, 'Upper')).toContainText('06:30 – 08:00');

  await page.locator('#next-week').click();
  await page.locator('[data-day="2026-12-06"]').click();
  await expect(slot(page, 'Upper')).toContainText('06:30 – 08:00');
});

test('a task needs a time', async ({ page }) => {
  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.locator('#task-name').fill('No time');
  await page.locator('#task-time').fill('');
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(slot(page, 'No time')).toHaveCount(0);
});
