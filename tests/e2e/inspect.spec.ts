import { test, expect } from '@playwright/test';

test.describe('Kaleidoscope Inspect Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows heuristic inspect results for a local sample site', async ({ page }) => {
    await page.getByTestId('input-url').fill('http://localhost:3000');
    await page.getByTestId('button-load-url').click();

    await expect(page.getByTestId('inspect-panel')).toBeVisible();

    await page.getByTestId('inspect-source-dir-input').fill('c:/Code/kaleidoscope/examples/sample-site');
    await page.getByTestId('inspect-toggle').click();

    await expect(page.getByTestId('inspect-toggle')).toContainText('Stop Inspecting');

    const previewFrame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(previewFrame.locator('.card').first()).toBeVisible();
    await previewFrame.locator('.card').first().click();

    const result = page.getByTestId('inspect-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Likely Source');
    await expect(page.getByTestId('inspect-source-path')).toContainText('server.js');
    await expect(result).toContainText('responsive design principles');
  });

  test('keeps inspect mode disabled for public URLs', async ({ page }) => {
    await page.getByTestId('input-url').fill('https://example.com');
    await page.getByTestId('button-load-url').click();

    await expect(page.getByTestId('inspect-panel')).toBeVisible();
    await expect(page.getByTestId('inspect-toggle')).toBeDisabled();
    await expect(page.getByText(/limited to loopback targets/i)).toBeVisible();
  });
});