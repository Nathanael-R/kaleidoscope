import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Frame, type Locator, type Page, type TestInfo } from '@playwright/test';

const TARGET_PORT = process.env.PLAYWRIGHT_SAMPLE_SITE_PORT ?? '5174';
const TARGET_URL = `http://localhost:${TARGET_PORT}`;
const TARGET_INPUT = process.env.KALEIDOSCOPE_STORYBOARD_TARGET_INPUT ?? TARGET_PORT;
const STORYBOARD_DIR = ['test-results', 'storyboard'];

const SCENES = [
  {
    id: 'scene-1-local-shortcut',
    duration: '0-4',
    kicker: 'Scene 1 of 7',
    title: 'Paste a port, not a full URL',
    detail: 'Local Dev mode expands 5174 into a loopback URL automatically.',
  },
  {
    id: 'scene-2-load-once',
    duration: '4-8',
    kicker: 'Scene 2 of 7',
    title: 'Load the page once',
    detail: 'Kaleidoscope keeps the preview in one workspace instead of juggling browser windows.',
  },
  {
    id: 'scene-3-pin-devices',
    duration: '8-13',
    kicker: 'Scene 3 of 7',
    title: 'Compare the devices you actually care about',
    detail: 'Pin iPhone, iPad, and desktop to keep the review grounded in real targets.',
  },
  {
    id: 'scene-4-responsive-drift',
    duration: '13-17',
    kicker: 'Scene 4 of 7',
    title: 'Spot responsive drift fast',
    detail: 'The same component shifts shape immediately across breakpoints.',
  },
  {
    id: 'scene-5-capture-evidence',
    duration: '17-22',
    kicker: 'Scene 5 of 7',
    title: 'Capture evidence with device mockups',
    detail: 'Generate stakeholder-friendly assets directly from the comparison view.',
  },
  {
    id: 'scene-6-audit-performance',
    duration: '22-28',
    kicker: 'Scene 6 of 7',
    title: 'Run a quick performance pass',
    detail: 'Audit multiple viewport targets without leaving the same session.',
  },
  {
    id: 'scene-7-inspect-to-llm',
    duration: '28-36',
    kicker: 'Scene 7 of 7',
    title: 'Inspect live UI and hand it to an LLM',
    detail: 'Jump from rendered pixels to source context, then copy a repair-ready prompt.',
  },
] as const;

test.skip(!process.env.KALEIDOSCOPE_STORYBOARD, 'Manual storyboard capture only.');

type StoryboardScene = (typeof SCENES)[number];

async function ensureStoryboardDir(testInfo: TestInfo) {
  const outputDir = path.join(testInfo.config.rootDir, ...STORYBOARD_DIR);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}

async function writeStoryboardManifest(testInfo: TestInfo, outputDir: string) {
  const manifestPath = path.join(outputDir, 'storyboard-scenes.json');
  await writeFile(manifestPath, JSON.stringify(SCENES, null, 2), 'utf8');
  await testInfo.attach('storyboard-scenes', {
    path: manifestPath,
    contentType: 'application/json',
  });
}

async function captureScene(target: Page | Locator, testInfo: TestInfo, outputDir: string, sceneId: string) {
  const scenePath = path.join(outputDir, `${sceneId}.png`);
  await target.screenshot({
    path: scenePath,
    animations: 'disabled',
  });
  await testInfo.attach(sceneId, {
    path: scenePath,
    contentType: 'image/png',
  });
}

async function gotoWorkspace(page: Page, baseUrl: string) {
  await page.goto(new URL('/', baseUrl).toString());
  await page.waitForLoadState('networkidle');
}

async function mountStoryboardOverlay(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById('kaleidoscope-storyboard-overlay')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'kaleidoscope-storyboard-overlay-style';
    style.textContent = `
      #kaleidoscope-storyboard-overlay {
        position: fixed;
        top: 24px;
        left: 24px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 48px));
        pointer-events: none;
        font-family: "Segoe UI", system-ui, sans-serif;
      }

      #kaleidoscope-storyboard-overlay .storyboard-card {
        background: linear-gradient(135deg, rgba(12, 18, 28, 0.92), rgba(23, 33, 49, 0.86));
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 20px;
        padding: 18px 20px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.32);
        backdrop-filter: blur(18px);
      }

      #kaleidoscope-storyboard-overlay .storyboard-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      #kaleidoscope-storyboard-overlay .storyboard-kicker {
        color: #7dd3fc;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      #kaleidoscope-storyboard-overlay .storyboard-duration {
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 600;
      }

      #kaleidoscope-storyboard-overlay .storyboard-title {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.08;
        letter-spacing: -0.03em;
        margin: 0 0 8px;
      }

      #kaleidoscope-storyboard-overlay .storyboard-detail {
        color: #dbeafe;
        font-size: 14px;
        line-height: 1.45;
        margin: 0;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'kaleidoscope-storyboard-overlay';
    overlay.innerHTML = `
      <div class="storyboard-card">
        <div class="storyboard-meta">
          <div class="storyboard-kicker" data-field="kicker"></div>
          <div class="storyboard-duration" data-field="duration"></div>
        </div>
        <h1 class="storyboard-title" data-field="title"></h1>
        <p class="storyboard-detail" data-field="detail"></p>
      </div>
    `;
    document.body.appendChild(overlay);
  });
}

async function setStoryboardOverlay(page: Page, scene: StoryboardScene) {
  await mountStoryboardOverlay(page);
  await page.evaluate((payload) => {
    const overlay = document.getElementById('kaleidoscope-storyboard-overlay');
    if (!overlay) {
      return;
    }

    const setField = (field: string, value: string) => {
      const node = overlay.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (node) {
        node.textContent = value;
      }
    };

    setField('kicker', payload.kicker);
    setField('duration', payload.duration);
    setField('title', payload.title);
    setField('detail', payload.detail);
  }, scene);
  await page.waitForTimeout(450);
}

async function typeTargetShortcut(page: Page) {
  await page.getByTestId('url-mode-local').click();
  const urlInput = page.getByTestId('input-url');
  await urlInput.click();
  await urlInput.fill('');
  await urlInput.pressSequentially(TARGET_INPUT, { delay: 85 });
  await expect(page.getByTestId('normalized-url-preview')).toContainText(TARGET_URL);
}

async function waitForPreviewFrame(page: Page, index = 0) {
  const iframe = page.locator('[data-testid="preview-iframe"]').nth(index);
  await expect(iframe).toBeVisible({ timeout: 30_000 });

  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) {
    throw new Error(`Expected preview iframe content frame at index ${index}`);
  }

  await frame.waitForLoadState('domcontentloaded');
  await expect
    .poll(async () => frame.evaluate(() => {
      const textLength = document.body?.innerText?.trim().length ?? 0;
      const nodeCount = document.body?.querySelectorAll('*').length ?? 0;
      return textLength + nodeCount;
    }), { timeout: 30_000 })
    .toBeGreaterThan(40);

  return frame;
}

async function loadTargetSite(page: Page) {
  await page.getByTestId('button-load-url').click();
  await waitForPreviewFrame(page);
}

async function openSection(page: Page, buttonText: string, visibleTestId: string) {
  const panel = page.getByTestId(visibleTestId);
  if (await panel.isVisible().catch(() => false)) {
    return;
  }

  await page.locator('button').filter({ hasText: new RegExp(`^${buttonText}$`, 'i') }).first().click();
  await expect(panel).toBeVisible();
}

async function ensureSidebarExpanded(page: Page) {
  const expandButton = page.getByTestId('button-expand-sidebar');
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
}

async function pinComparisonDevices(page: Page, deviceIds: string[]) {
  for (const deviceId of deviceIds) {
    const deviceCard = page.getByTestId(`device-${deviceId}`);
    await deviceCard.scrollIntoViewIfNeeded();
    await deviceCard.hover();
    await page.getByTestId(`pin-${deviceId}`).click({ force: true });
  }

  await page.getByTestId('button-toggle-comparison').click();
  await expect(page.getByTestId('preview-area')).toHaveAttribute('data-view-mode', 'comparison');
  await expect(page.locator('[data-testid="preview-iframe"]')).toHaveCount(deviceIds.length);
}

async function collapseSidebar(page: Page) {
  await page.getByTestId('button-collapse-sidebar').click();
  await expect(page.getByTestId('button-expand-sidebar')).toBeVisible();
}

async function expandSidebar(page: Page) {
  const expandButton = page.getByTestId('button-expand-sidebar');
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }
}

async function previewFrames(page: Page) {
  const handles = await page.locator('[data-testid="preview-iframe"]').elementHandles();
  const frames: Frame[] = [];

  for (const handle of handles) {
    const frame = await handle.contentFrame();
    if (frame) {
      frames.push(frame);
    }
  }

  return frames;
}

async function markInspectableTarget(frame: Frame) {
  return await frame.evaluate(() => {
    const selectors = [
      'button',
      '[role="button"]',
      'a',
      '[class*="card"]',
      '[class*="panel"]',
      '[class*="hero"]',
      'section',
      'article',
      'main > *',
    ];

    const isVisibleCandidate = (element: Element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      return rect.width >= 120 && rect.height >= 44 && rect.bottom > 0 && rect.top < window.innerHeight;
    };

    document
      .querySelectorAll<HTMLElement>('[data-kaleidoscope-storyboard-target="true"]')
      .forEach((element) => element.removeAttribute('data-kaleidoscope-storyboard-target'));

    for (const selector of selectors) {
      const candidate = Array.from(document.querySelectorAll(selector)).find(isVisibleCandidate);
      if (candidate) {
        candidate.setAttribute('data-kaleidoscope-storyboard-target', 'true');
        candidate.scrollIntoView({ block: 'center', inline: 'center' });
        return true;
      }
    }

    document.body?.setAttribute('data-kaleidoscope-storyboard-target', 'true');
    return Boolean(document.body);
  });
}

async function clearPreviewHighlights(page: Page) {
  for (const frame of await previewFrames(page)) {
    await frame.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-kaleidoscope-storyboard-highlight="true"]').forEach((element) => {
        element.style.outline = '';
        element.style.outlineOffset = '';
        element.style.borderRadius = '';
        element.removeAttribute('data-kaleidoscope-storyboard-highlight');
      });
    });
  }
}

async function spotlightResponsiveArea(page: Page) {
  for (const frame of await previewFrames(page)) {
    await frame.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('main, [role="main"], section, article, [class*="hero"], [class*="card"], div')
      )
        .filter((element) => {
          const node = element as HTMLElement;
          const rect = node.getBoundingClientRect();
          return rect.width >= 220 && rect.height >= 120 && rect.bottom > 0 && rect.top < window.innerHeight * 1.5;
        })
        .slice(0, 3);

      const targets = candidates.length > 0 ? candidates : [document.body];
      targets.forEach((element, index) => {
        const target = element as HTMLElement;
        target.style.outline = index === 0 ? '3px solid #f97316' : '2px solid rgba(56, 189, 248, 0.95)';
        target.style.outlineOffset = index === 0 ? '8px' : '6px';
        target.style.borderRadius = '16px';
        target.style.transition = 'outline-color 120ms ease';
        target.setAttribute('data-kaleidoscope-storyboard-highlight', 'true');
      });

      (targets[0] as HTMLElement | undefined)?.scrollIntoView({ block: 'center', inline: 'center' });
    });
  }

  await page.waitForTimeout(900);
}

async function runScreenshotScene(page: Page) {
  await openSection(page, 'Screenshots', 'screenshot-device-section');
  await page.getByTestId('include-mockup-checkbox').check();
  await page.getByRole('button', { name: /Capture 3 Screenshots/i }).click();
  await expect(page.getByText(/3 screenshots captured/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/screenshots saved to \.\/screenshots\//i)).toBeVisible();
}

async function runPerformanceScene(page: Page) {
  await openSection(page, 'Performance', 'performance-panel');
  await page.getByTestId('run-performance-audit').click();
  await expect(page.getByText(/Average Score/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('performance-results')).toBeVisible();
  await page.getByTestId('perf-device-iphone-14').click();
}

async function runInspectScene(page: Page) {
  await openSection(page, 'Inspect', 'inspect-panel');
  await page.getByTestId('inspect-panel').scrollIntoViewIfNeeded();
  await page.getByTestId('inspect-toggle').click();
  await expect(page.getByTestId('inspect-toggle')).toContainText('Stop Inspecting');

  const frame = await waitForPreviewFrame(page);
  await markInspectableTarget(frame);

  const previewFrame = page.frameLocator('[data-testid="preview-iframe"]');
  await previewFrame.locator('[data-kaleidoscope-storyboard-target="true"]').first().click();

  await expect(page.getByTestId('inspect-result')).toBeVisible();
  await page.getByTestId('inspect-copy-llm').click();
  await page.getByTestId('inspect-issue-input').fill('The layout compresses too aggressively on smaller screens.');
  await page.waitForTimeout(350);
  await page.getByTestId('inspect-copy-llm').click();
  await expect(page.getByTestId('inspect-copy-llm')).toContainText('Copied for LLM');
}

test('captures Kaleidoscope storyboard scenes', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const resolvedBaseUrl = baseURL ?? 'http://localhost:4173';
  const outputDir = await ensureStoryboardDir(testInfo);
  await writeStoryboardManifest(testInfo, outputDir);

  const context = await browser.newContext({
    viewport: { width: 1600, height: 980 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1600, height: 980 },
    },
  });

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, 'showDirectoryPicker', {
      configurable: true,
      value: undefined,
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined,
        readText: async () => '',
      },
    });
  });

  const page = await context.newPage();

  await gotoWorkspace(page, resolvedBaseUrl);
  await setStoryboardOverlay(page, SCENES[0]);
  await typeTargetShortcut(page);
  await captureScene(page, testInfo, outputDir, SCENES[0].id);

  await setStoryboardOverlay(page, SCENES[1]);
  await loadTargetSite(page);
  await captureScene(page, testInfo, outputDir, SCENES[1].id);

  await setStoryboardOverlay(page, SCENES[2]);
  await pinComparisonDevices(page, ['iphone-14', 'ipad', 'desktop']);
  await collapseSidebar(page);
  await captureScene(page, testInfo, outputDir, SCENES[2].id);

  await setStoryboardOverlay(page, SCENES[3]);
  await spotlightResponsiveArea(page);
  await captureScene(page, testInfo, outputDir, SCENES[3].id);

  await setStoryboardOverlay(page, SCENES[4]);
  await expandSidebar(page);
  await clearPreviewHighlights(page);
  await runScreenshotScene(page);
  await captureScene(page, testInfo, outputDir, SCENES[4].id);

  await setStoryboardOverlay(page, SCENES[5]);
  await runPerformanceScene(page);
  await captureScene(page, testInfo, outputDir, SCENES[5].id);

  await setStoryboardOverlay(page, SCENES[6]);
  await clearPreviewHighlights(page);
  await ensureSidebarExpanded(page);
  await page.getByTestId('button-toggle-comparison').click();
  await expect(page.locator('[data-testid="preview-iframe"]')).toHaveCount(1);
  await runInspectScene(page);
  await captureScene(page, testInfo, outputDir, SCENES[6].id);

  const video = page.video();
  await context.close();

  if (video) {
    const videoPath = await video.path();
    await testInfo.attach('storyboard-video', {
      path: videoPath,
      contentType: 'video/webm',
    });
  }
});