// US-3 · Log a workout, US-4 · Import a routine from a note, US-5 · See progress.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, createPlan, goTo, toast, NEXT_SUNDAY } from './helpers.js';

const NOTE = 'Bench press 40x8 60x6 60x6\nLat pulldown 80x6 120x6 120x5';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
  await onboard(page);
});

test('US-4: a pasted note becomes a plan, and the first set is a warm-up', async ({ page }) => {
  await createPlan(page, 'Upper', NOTE);
  await expect(page.locator('[data-plan-card]')).toContainText('2 exercises · 6 sets');

  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.getByLabel('Bench press set 1 type')).toHaveValue('warmup');
  await expect(page.getByLabel('Bench press set 2 type')).toHaveValue('working');
  await expect(page.getByLabel('Bench press set 2 kg')).toHaveValue('60');
  await expect(page.getByLabel('Lat pulldown set 3 reps')).toHaveValue('5');
});

test('US-4: a note with no sets is rejected with a clear message', async ({ page }) => {
  await goTo(page, 'plans');
  await page.getByRole('button', { name: '＋ Build a plan' }).click();
  await page.locator('#plan-name').fill('Mystery');
  await page.locator('.paste-plan summary').click();
  await page.locator('#plan-note').fill('Do some push-ups, maybe');
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor-error')).toContainText('one exercise per line');
  await expect(page.locator('#editor')).toBeVisible(); // nothing was saved
});

test('US-4: a text line above the first exercise is kept as its note', async ({ page }) => {
  await createPlan(page, 'Upper', 'Go heavy today\nBench press 40x8 60x6');
  await expect(page.locator('[data-plan-card]')).toContainText('1 exercise · 2 sets');
  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.locator('main')).toContainText('Go heavy today');
});

async function logEverySet(page) {
  for (const box of await page.locator('input[data-done]').all()) await box.check();
}

test('US-3 + US-5: finishing a workout saves it, starts the streak and shows last time next week', async ({
  page,
}) => {
  await createPlan(page, 'Upper', NOTE);
  await goTo(page, 'today');
  await page.getByRole('button', { name: 'Open Upper →' }).click();

  const finish = page.locator('#finish-workout');
  await expect(finish).toBeDisabled(); // can't finish before checking the sets
  await page.getByLabel('Bench press set 3 kg').fill('62.5');
  await logEverySet(page);
  await finish.click();
  await expect(toast(page)).toContainText('Workout saved');
  await expect(page.getByRole('button', { name: 'View Upper →' })).toBeVisible();

  // US-5: progress shows the logged workout and a 1-day streak.
  await goTo(page, 'progress');
  const stat = (label) => page.locator('.stats .card', { hasText: label }).locator('strong');
  await expect(stat('Workouts logged')).toHaveText('1');
  await expect(stat('Training-day streak')).toHaveText('1');

  // US-3: next Sunday, the previous result sits beside each set.
  await goTo(page, 'today');
  await page.locator('#next-week').click();
  await page.locator(`[data-day="${NEXT_SUNDAY}"]`).click();
  await page.getByRole('button', { name: 'Open Upper →' }).click();
  await expect(page.locator('main')).toContainText('62.5');
  await expect(page.getByLabel('Bench press set 3 kg')).toHaveValue('62.5'); // last result pre-filled
});
