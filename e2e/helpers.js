import { expect } from '@playwright/test';

// A fixed "today" makes every run identical: Sunday 29 November 2026, 10:00.
export const SUNDAY = '2026-11-29';
export const MONDAY = '2026-11-30';
export const NEXT_SUNDAY = '2026-12-06';

export async function freezeTime(page, iso = `${SUNDAY}T10:00:00`) {
  await page.clock.install({ time: new Date(iso) });
}

// First visit: hero → weekly schedule (an "Upper" lift on Sundays) → skip the tour.
export async function onboard(page, { liftName = 'Upper', skipTour = true } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: /Build my day/ }).click();
  await expect(page.getByRole('heading', { name: 'Your week, your way' })).toBeVisible();
  await page.locator('[data-add-activity="0"]').click();
  await page.getByLabel('Sunday activity name').fill(liftName);
  await page.getByRole('button', { name: 'Let’s go' }).click();
  const tour = page.locator('#shavit-tutorial');
  await expect(tour).toBeVisible();
  if (skipTour) {
    await tour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(tour).toBeHidden();
  }
}

export async function goTo(page, view) {
  await page.locator(`nav [data-view="${view}"]`).click();
}

// Workouts → Create plan, pasting a workout note.
export async function createPlan(page, name, note) {
  await goTo(page, 'plans');
  await page.getByRole('button', { name: '＋ Create plan' }).click();
  await page.locator('#plan-name').fill(name);
  await page.locator('.paste-plan summary').click();
  await page.locator('#plan-note').fill(note);
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor')).toBeHidden();
}

export const toast = (page) => page.locator('#toast');
