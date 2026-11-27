// Themes: pick a look in More; it applies at once and survives a reload.
import { test, expect } from '@playwright/test';
import { freezeTime, onboard, goTo } from './helpers.js';

test('choosing Paper journal changes the colours and is remembered', async ({ page }) => {
  await freezeTime(page);
  await onboard(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'midnight');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const midnight = await background();

  await goTo(page, 'settings');
  await page.getByRole('button', { name: /Paper journal/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'paper');
  await expect(page.getByRole('button', { name: /Paper journal/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await background()).not.toBe(midnight);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});
