import { test, expect } from '@playwright/test';

async function expectNoDocumentVerticalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    };
  });

  expect(overflow.scrollHeight - overflow.clientHeight).toBeLessThanOrEqual(1);
}

test.describe('Kaleidoscope Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load home page', async ({ page }) => {
    await expect(page).toHaveTitle(/Kaleidoscope/i);
  });

  test('should avoid document-level vertical overflow on the preview workspace', async ({ page }) => {
    await expect(page.getByTestId('preview-area')).toBeVisible();
    await expectNoDocumentVerticalOverflow(page);
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
    const deviceIds = [
      'iphone-14',
      'iphone-15',
      'iphone-16',
      'iphone-17',
      'samsung-s21',
      'samsung-s24',
      'samsung-s24-ultra',
      'samsung-s25-ultra',
      'pixel-6',
      'ipad',
      'ipad-pro',
      'macbook-air',
      'desktop',
      'desktop-4k'
    ];

    for (const id of deviceIds) {
      const deviceElement = page.getByTestId(`device-${id}`);
      await expect(deviceElement).toBeVisible();
    }
  });
});

test.describe('Device Interaction', () => {
  test('should scroll the loaded site inside the device mockup', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('input-url').fill('http://localhost:3000');
    await page.getByTestId('button-load-url').click();

    const iframeElement = page.getByTestId('preview-iframe');
    await expect(iframeElement).toBeVisible();

    const frame = await (await iframeElement.elementHandle())?.contentFrame();
    if (!frame) {
      throw new Error('Expected preview iframe content frame');
    }

    await frame.waitForLoadState('domcontentloaded');

    const before = await frame.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));

    expect(before.scrollHeight).toBeGreaterThan(before.innerHeight);

    const box = await iframeElement.boundingBox();
    if (!box) {
      throw new Error('Expected preview iframe bounding box');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(300);

    const after = await frame.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before.scrollY);
  });

  test('should switch between devices', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on a device
    const iphoneButton = page.getByTestId('device-iphone-14');
    await iphoneButton.click();

    // Verify device is selected
    await expect(iphoneButton).toHaveAttribute('aria-selected', 'true');
  });

  test('should pin multiple devices', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Pin first device
    const device1 = page.locator('[data-device-id]').first();
    await device1.click();
    await page.keyboard.press('Space');

    // Pin second device
    const device2 = page.locator('[data-device-id]').nth(1);
    await device2.click();
    await page.keyboard.press('Space');

    // Toggle comparison mode
    await page.keyboard.press('c');

    // Should show comparison view
    const comparisonView = page.locator('[data-view-mode="comparison"]');
    await expect(comparisonView).toBeVisible();
  });

  test('should avoid document-level vertical overflow on the flow workspace', async ({ page }) => {
    await page.goto('/flows');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Flow Editor')).toBeVisible();
    await expectNoDocumentVerticalOverflow(page);
  });
});
