import type { Browser } from 'playwright-core';
import type { DeviceConfig } from './device-catalog.js';

interface RenderedImageSize {
  width: number;
  height: number;
}

const OUTER_PADDING = 24;

function getScreenBorderRadius(device: DeviceConfig): number {
  if (device.type === 'mobile') {
    return device.frame?.shell === 'iphone' ? 40 : 32;
  }

  if (device.type === 'tablet') {
    return 24;
  }

  return 10;
}

export function getMockupFrameMetrics(device: DeviceConfig) {
  const horizontalInset = device.type === 'mobile' ? 48 : device.type === 'tablet' ? 60 : 80;
  const verticalInset = device.type === 'mobile' ? 96 : device.type === 'tablet' ? 80 : 60;
  const frameWidth = device.width + horizontalInset;
  const frameHeight = device.height + verticalInset;

  return {
    deviceWidth: device.width,
    deviceHeight: device.height,
    frameWidth,
    frameHeight,
    canvasWidth: frameWidth + OUTER_PADDING * 2,
    canvasHeight: frameHeight + OUTER_PADDING * 2,
    screenBorderRadius: getScreenBorderRadius(device),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildDeviceMockupHtml(device: DeviceConfig, screenshotDataUrl: string): string {
  const metrics = getMockupFrameMetrics(device);
  const isIphoneShell = device.type === 'mobile' && device.frame?.shell === 'iphone';
  const isAndroidShell = device.type === 'mobile' && device.frame?.shell === 'android';
  const hasDynamicIsland = device.frame?.topFeature === 'dynamic-island';
  const hasCameraHole = device.frame?.topFeature === 'camera-hole';
  const shellRadius = isIphoneShell ? 48 : device.type === 'mobile' ? 40 : device.type === 'tablet' ? 30 : 16;
  const shellPadding = device.type === 'mobile' ? (isIphoneShell ? 24 : 18) : device.type === 'tablet' ? 30 : 20;
  const shellBackground = isIphoneShell ? '#000000' : device.type === 'mobile' ? '#18181b' : device.type === 'tablet' ? '#1f2937' : '#111827';
  const homeIndicator = isIphoneShell
    ? '<div class="home-indicator iphone"></div>'
    : device.type === 'mobile'
      ? '<div class="home-indicator android"></div>'
      : '';
  const topFeature = hasDynamicIsland
    ? '<div class="top-feature dynamic-island"></div>'
    : hasCameraHole
      ? '<div class="top-feature camera-hole"></div>'
      : '';
  const monitorStand = device.type === 'desktop'
    ? '<div class="desktop-stand"><div class="desktop-neck"></div><div class="desktop-base"></div></div>'
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(device.name)} mockup</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        width: ${metrics.canvasWidth}px;
        height: ${metrics.canvasHeight}px;
        background: transparent;
        overflow: hidden;
      }

      body {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: ${OUTER_PADDING}px;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .mockup {
        position: relative;
        width: ${metrics.frameWidth}px;
        ${device.type === 'desktop' ? `min-height: ${metrics.frameHeight}px;` : `height: ${metrics.frameHeight}px;`}
      }

      .shell {
        position: relative;
        width: ${metrics.frameWidth}px;
        height: ${metrics.frameHeight}px;
        padding: ${shellPadding}px;
        border-radius: ${shellRadius}px;
        background: ${shellBackground};
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
      }

      .screen {
        position: relative;
        width: ${metrics.deviceWidth}px;
        height: ${metrics.deviceHeight}px;
        overflow: hidden;
        border-radius: ${metrics.screenBorderRadius}px;
        background: #ffffff;
      }

      .screen img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
      }

      .top-feature {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        pointer-events: none;
      }

      .top-feature.dynamic-island {
        top: 12px;
        width: 112px;
        height: 28px;
        border-radius: 999px;
        background: #000000;
      }

      .top-feature.camera-hole {
        top: 12px;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #000000;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
      }

      .home-indicator {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .home-indicator.iphone {
        bottom: 10px;
        width: 128px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
      }

      .home-indicator.android {
        bottom: 12px;
        width: 96px;
        height: 6px;
        border-radius: 999px;
        background: #3f3f46;
      }

      .desktop-stand {
        position: absolute;
        left: 50%;
        bottom: -22px;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
      }

      .desktop-neck {
        width: 20px;
        height: 24px;
        border-radius: 10px;
        background: linear-gradient(180deg, #6b7280, #374151);
      }

      .desktop-base {
        margin-top: -2px;
        width: 132px;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(180deg, #9ca3af, #4b5563);
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
      }
    </style>
  </head>
  <body>
    <div class="mockup" data-device-id="${escapeHtml(device.id)}">
      <div class="shell">
        ${topFeature}
        <div class="screen">
          <img src="${screenshotDataUrl}" alt="${escapeHtml(device.name)} screenshot" />
        </div>
        ${homeIndicator}
      </div>
      ${monitorStand}
    </div>
  </body>
</html>`;
}

export async function renderMockupScreenshot(
  browser: Browser,
  device: DeviceConfig,
  screenshotBuffer: Buffer,
  outputPath: string,
): Promise<RenderedImageSize> {
  const metrics = getMockupFrameMetrics(device);
  const renderContext = await browser.newContext({
    viewport: { width: metrics.canvasWidth, height: metrics.canvasHeight },
    deviceScaleFactor: 1,
  });

  try {
    const page = await renderContext.newPage();
    const screenshotDataUrl = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
    const html = buildDeviceMockupHtml(device, screenshotDataUrl);

    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: outputPath, omitBackground: true });

    return {
      width: metrics.canvasWidth,
      height: metrics.canvasHeight,
    };
  } finally {
    await renderContext.close();
  }
}