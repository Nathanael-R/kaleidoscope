import { expect, test } from '@playwright/test';

const STRESS_DEVICE_IDS = [
  'iphone-14',
  'iphone-15',
  'iphone-16',
  'iphone-17',
  'samsung-s21',
  'samsung-s24',
  'samsung-s24-ultra',
  'samsung-s25-ultra',
];

const REFRESH_CYCLES = 24;
const TOGGLE_CYCLES = 6;

type MemorySample = {
  label: string;
  heapUsedMb: number;
  heapTotalMb: number;
  jsHeapUsedMb: number | null;
  nodes: number | null;
  documents: number | null;
  frames: number | null;
};

function toMb(value: number) {
  return Number((value / 1024 / 1024).toFixed(2));
}

function getMetricValue(metrics: Array<{ name: string; value: number }>, name: string) {
  const metric = metrics.find((entry) => entry.name === name);
  return metric ? Number(metric.value.toFixed(2)) : null;
}

async function pinDevice(page: import('@playwright/test').Page, deviceId: string) {
  const device = page.getByTestId(`device-${deviceId}`);
  await device.scrollIntoViewIfNeeded();
  await device.hover();
  await page.getByTestId(`pin-${deviceId}`).click({ force: true });
}

async function waitForComparisonToSettle(page: import('@playwright/test').Page, count: number) {
  await expect(page.getByTestId('preview-iframe')).toHaveCount(count, { timeout: 30000 });
  await expect(page.getByText('Loading website...')).toHaveCount(0, { timeout: 30000 });
}

async function sampleMemory(
  page: import('@playwright/test').Page,
  cdpSession: import('@playwright/test').CDPSession,
  label: string,
) {
  await page.waitForTimeout(300);
  await cdpSession.send('HeapProfiler.collectGarbage').catch(() => undefined);

  const heapUsage = await cdpSession.send('Runtime.getHeapUsage') as {
    usedSize: number;
    totalSize: number;
  };
  const performanceMetrics = await cdpSession.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };

  return {
    label,
    heapUsedMb: toMb(heapUsage.usedSize),
    heapTotalMb: toMb(heapUsage.totalSize),
    jsHeapUsedMb: (() => {
      const value = getMetricValue(performanceMetrics.metrics, 'JSHeapUsedSize');
      return value === null ? null : toMb(value);
    })(),
    nodes: getMetricValue(performanceMetrics.metrics, 'Nodes'),
    documents: getMetricValue(performanceMetrics.metrics, 'Documents'),
    frames: getMetricValue(performanceMetrics.metrics, 'Frames'),
  } satisfies MemorySample;
}

test.describe('Preview runtime stress', () => {
  test('keeps eight-device comparison stable during repeated reloads', async ({ browserName, page }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium CDP heap metrics');
    test.setTimeout(240000);

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    let crashed = false;

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('crash', () => {
      crashed = true;
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('input-url').fill('http://localhost:3000');
    await page.getByTestId('button-load-url').click();
    await expect(page.getByTestId('preview-iframe')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Loading website...')).toHaveCount(0, { timeout: 30000 });

    for (const deviceId of STRESS_DEVICE_IDS) {
      await pinDevice(page, deviceId);
    }

    await page.getByTestId('button-toggle-comparison').click();
    await expect(page.getByTestId('text-device-name')).toHaveText(`Comparing ${STRESS_DEVICE_IDS.length} Devices`);
    await waitForComparisonToSettle(page, STRESS_DEVICE_IDS.length);

    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Performance.enable');
    await cdpSession.send('Runtime.enable');
    await cdpSession.send('HeapProfiler.enable');

    const samples: MemorySample[] = [];
    samples.push(await sampleMemory(page, cdpSession, 'baseline'));

    for (let cycle = 1; cycle <= REFRESH_CYCLES; cycle += 1) {
      await page.getByTestId('button-refresh').click();
      await waitForComparisonToSettle(page, STRESS_DEVICE_IDS.length);

      if (cycle % 6 === 0 || cycle === REFRESH_CYCLES) {
        samples.push(await sampleMemory(page, cdpSession, `refresh-${cycle}`));
      }
    }

    for (let cycle = 1; cycle <= TOGGLE_CYCLES; cycle += 1) {
      await page.getByTestId('button-toggle-comparison').click();
      await expect(page.getByTestId('preview-iframe')).toHaveCount(1, { timeout: 30000 });
      await expect(page.getByText('Loading website...')).toHaveCount(0, { timeout: 30000 });

      await page.getByTestId('button-toggle-comparison').click();
      await waitForComparisonToSettle(page, STRESS_DEVICE_IDS.length);
      samples.push(await sampleMemory(page, cdpSession, `toggle-${cycle}`));
    }

    const baseline = samples[0];
    const final = samples.at(-1) ?? baseline;
    const peak = samples.reduce((highest, sample) => (sample.heapUsedMb > highest.heapUsedMb ? sample : highest), baseline);
    const nodeGrowth = baseline.nodes !== null && final.nodes !== null ? Number((final.nodes - baseline.nodes).toFixed(2)) : null;
    const retainedHeapGrowthMb = Number((final.heapUsedMb - baseline.heapUsedMb).toFixed(2));
    const retainedHeapGrowthPct = baseline.heapUsedMb > 0
      ? Number((((final.heapUsedMb - baseline.heapUsedMb) / baseline.heapUsedMb) * 100).toFixed(2))
      : 0;

    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !/favicon\.ico|Failed to load resource: the server responded with a status of 404/i.test(message),
    );

    const summary = {
      refreshCycles: REFRESH_CYCLES,
      toggleCycles: TOGGLE_CYCLES,
      baseline,
      final,
      peak,
      retainedHeapGrowthMb,
      retainedHeapGrowthPct,
      nodeGrowth,
      crashed,
      pageErrors,
      consoleErrors: unexpectedConsoleErrors,
    };

    console.log(`PREVIEW_RUNTIME_STRESS ${JSON.stringify(summary)}`);
    await testInfo.attach('preview-runtime-stress.json', {
      body: JSON.stringify({ summary, samples }, null, 2),
      contentType: 'application/json',
    });

    expect(crashed).toBe(false);
    expect(pageErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(retainedHeapGrowthMb).toBeLessThan(40);
    expect(retainedHeapGrowthPct).toBeLessThan(100);
    if (nodeGrowth !== null) {
      expect(nodeGrowth).toBeLessThan(1500);
    }
  });
});