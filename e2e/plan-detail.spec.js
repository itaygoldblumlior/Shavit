// The plan screen: start now, add, reorder (drag / keys), swipe to remove.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, createPlan, goTo, toast } from './helpers.js';

const NOTE = 'Bench press 40x8 60x6\nRow 40x10 50x8\nCurl 10x12';
const names = (page) => page.locator('.ex-row strong').allInnerTexts();

test.beforeEach(async ({ page }) => {
  await freezeTime(page); // Sunday 29 Nov 2026
  await onboard(page); // "Upper" on Sundays
  await createPlan(page, 'Upper', NOTE);
  await page.getByRole('button', { name: 'Open Upper plan' }).click();
});

test('the plan screen lists exercises and adds a new one', async ({ page }) => {
  await expect(page.locator('.plan-hero h2')).toHaveText('Upper');
  await expect.poll(() => names(page)).toEqual(['Bench press', 'Row', 'Curl']);
  await expect(page.locator('.ex-item').first()).toContainText('40×8 · 60×6');

  await page.locator('#add-exercise').click();
  await page.locator('#new-ex-name').fill('Squat');
  await page.locator('#new-ex-sets').fill('60x5 100x5');
  await page.locator('#editor-save').click();
  await expect.poll(() => names(page)).toEqual(['Bench press', 'Row', 'Curl', 'Squat']);

  await page.locator('#add-exercise').click();
  await page.locator('#new-ex-name').fill('squat');
  await page.locator('#new-ex-sets').fill('60x5');
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor-error')).toContainText('already in this plan');
});

test('arrow keys on ≡ reorder, and the order is saved', async ({ page }) => {
  await page.getByRole('button', { name: /Reorder Bench press/ }).press('ArrowDown');
  await expect.poll(() => names(page)).toEqual(['Row', 'Bench press', 'Curl']);
  await expect(page.getByRole('button', { name: /Reorder Bench press/ })).toBeFocused();
  await page.reload();
  await goTo(page, 'plans');
  await page.getByRole('button', { name: 'Open Upper plan' }).click();
  await expect.poll(() => names(page)).toEqual(['Row', 'Bench press', 'Curl']);
});

test('dragging ≡ moves an exercise', async ({ page }) => {
  const handle = await page.locator('[data-drag="0"]').boundingBox();
  const row = await page.locator('.ex-item').first().boundingBox();
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + row.height * 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => names(page)).toEqual(['Row', 'Curl', 'Bench press']);
});

test('a long swipe left removes an exercise, with Undo', async ({ page }) => {
  const row = await page.locator('.ex-row').nth(1).boundingBox();
  const y = row.y + row.height / 2;
  await page.mouse.move(row.x + row.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(row.x + 10, y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => names(page)).toEqual(['Bench press', 'Curl']);
  await expect(toast(page)).toContainText('Removed Row.');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => names(page)).toEqual(['Bench press', 'Row', 'Curl']);
});

test('a short swipe reveals Remove', async ({ page }) => {
  const row = await page.locator('.ex-row').first().boundingBox();
  const y = row.y + row.height / 2,
    x = row.x + row.width - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.ex-item').first()).toHaveClass(/open/);
  await page.getByRole('button', { name: 'Remove Bench press' }).click();
  await expect.poll(() => names(page)).toEqual(['Row', 'Curl']);
});

test('Start now opens the workout; an unscheduled plan is added to today only', async ({
  page,
}) => {
  await page.locator('#back-plans').click();
  await createPlan(page, 'Legs', 'Squat 60x5 100x5');
  await page.getByRole('button', { name: 'Open Legs plan' }).click();
  await page.locator('#start-plan').click();
  await expect(page.locator('main')).toContainText('Legs · 29 Nov');
  await expect(page.locator('#finish-workout')).toBeVisible();

  await page.locator('#back-workout').click();
  await page.locator('#next-week').click();
  await page.locator('[data-day="2026-12-06"]').click();
  await expect(page.locator('main')).not.toContainText('Legs');
});
