import { test, expect } from '@playwright/test';

test.describe('Kaleidoscope Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load home page', async ({ page }) => {
    await expect(page).toHaveTitle(/Kaleidoscope/i);
  });

  test('should display device frames', async ({ page }) => {
    // Check for device preview area
    const previewArea = page.locator('[data-testid="preview-area"]').first();
    await expect(previewArea).toBeVisible();
  });

  test('should accept URL input', async ({ page }) => {
    const urlInput = page.locator('input[type="url"]').first();
    await expect(urlInput).toBeVisible();

    // Enter a URL
    await urlInput.fill('https://example.com');
    await expect(urlInput).toHaveValue('https://example.com');
  });

  test('should handle localhost URLs', async ({ page }) => {
    const urlInput = page.locator('input[type="url"]').first();

    // Enter localhost URL
    await urlInput.fill('http://localhost:3000');

    // Should not show blocking error
    const errorMessage = page.locator('text=/cannot.*localhost/i');
    await expect(errorMessage).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // If error is visible, test should fail
      throw new Error('Localhost URLs should not be blocked');
    });
  });

  test('should display all device types', async ({ page }) => {
    // Check that device selector shows all devices
    const devices = [
      'iPhone 14',
      'Samsung Galaxy S21',
      'Google Pixel 6',
      'iPad',
      'iPad Pro',
      'MacBook Air',
      'Desktop HD',
      'Desktop 4K'
    ];

    for (const device of devices) {
      const deviceElement = page.locator(`text=${device}`);
      await expect(deviceElement).toBeVisible();
    }
  });
});

test.describe('Device Interaction', () => {
  test('should switch between devices', async ({ page }) => {
    await page.goto('/');

    // Click on a device
    const iphoneButton = page.locator('text=iPhone 14').first();
    await iphoneButton.click();

    // Verify device is selected
    await expect(iphoneButton).toHaveAttribute('data-selected', 'true');
  });

  test('should pin multiple devices', async ({ page }) => {
    await page.goto('/');

    // Pin first device
    const device1 = page.locator('[data-device-id]').first();
    await device1.click();
    await page.keyboard.press('Space');

    // Pin second device
    const device2 = page.locator('[data-device-id]').nth(1);
    await device2.click();
    await page.keyboard.press('Space');

    // Should show comparison view
    const comparisonView = page.locator('[data-view-mode="comparison"]');
    await expect(comparisonView).toBeVisible();
  });
});
