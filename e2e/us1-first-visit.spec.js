// US-1 · First visit: a new user gets a short tutorial so they know where things are.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, goTo } from './helpers.js';

test.beforeEach(async ({ page }) => freezeTime(page));

test('a new visitor sees the welcome page, sets a schedule and gets the 5-step tour', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your day\./ })).toBeVisible();
  await expect(page.getByText('No signup. Your records stay on your device.')).toBeVisible();

  await onboard(page, { skipTour: false });
  const tour = page.locator('#shavit-tutorial');
  await expect(tour).toContainText('1 / 5');
  for (let step = 2; step <= 5; step++) {
    await tour.getByRole('button', { name: /Next/ }).click();
    await expect(tour).toContainText(`${step} / 5`);
  }
  await tour.getByRole('button', { name: /Next|Done|Finish|Let/ }).click();
  await expect(tour).toBeHidden();

  // The planner opens on today.
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Sunday 29 November')).toBeVisible();
});

test('the tour shows only once, and can be replayed from More', async ({ page }) => {
  await onboard(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.locator('#shavit-tutorial')).toHaveCount(0);

  await goTo(page, 'settings');
  await page.getByRole('button', { name: 'Show me the basics' }).click();
  await expect(page.locator('#shavit-tutorial')).toContainText('1 / 5');
});
