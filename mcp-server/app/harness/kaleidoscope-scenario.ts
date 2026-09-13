import type { HarnessScenario, HarnessToolHandler } from './scenario.js';

const devices = [
  { device: 'iphone-14', width: 390, height: 844, color: '#df5d3d' },
  { device: 'ipad', width: 768, height: 1024, color: '#168b75' },
  { device: 'desktop', width: 1440, height: 900, color: '#3770b8' },
] as const;

function pageSvg(device: string, width: number, height: number, accent: string, revision: number): string {
  const desktop = width > 900;
  const cardX = desktop ? width * .61 : 24, cardY = desktop ? 146 : 370;
  const cardWidth = desktop ? width * .31 : width - 48;
  const nav = desktop ? '<text x="72" y="48" font-size="14" fill="#4b5563">Product  Pricing  Guides</text>'
    : `<path d="M${width - 48} 32h22m-22 7h22" stroke="#111827" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#fbfaf7"/><text x="24" y="50" font-family="Arial" font-weight="700" font-size="18" fill="#111827">Northstar</text>${nav}
    <line x1="24" x2="${width - 24}" y1="78" y2="78" stroke="#e5e7eb"/><text x="24" y="140" font-family="Arial" font-weight="700" font-size="${desktop ? 46 : 34}" fill="#111827">Ship better pages.</text>
    <text x="24" y="${desktop ? 194 : 186}" font-family="Arial" font-weight="700" font-size="${desktop ? 46 : 34}" fill="${accent}">At every breakpoint.</text>
    <text x="24" y="${desktop ? 245 : 237}" font-family="Arial" font-size="15" fill="#596273">Catch visual regressions before production.</text>
    <rect x="24" y="${desktop ? 282 : 278}" width="142" height="44" rx="8" fill="#111827"/><text x="48" y="${desktop ? 310 : 306}" font-family="Arial" font-size="14" fill="white">Start inspecting</text>
    <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${Math.min(310, height - cardY - 40)}" rx="16" fill="${accent}" opacity=".13"/>
    <rect x="${cardX + 18}" y="${cardY + 20}" width="${cardWidth - 36}" height="46" rx="8" fill="white"/><rect x="${cardX + 18}" y="${cardY + 83}" width="${(cardWidth - 50) * (.52 + revision * .04)}" height="11" rx="5" fill="${accent}" opacity=".8"/>
    <rect x="${cardX + 18}" y="${cardY + 108}" width="${cardWidth - 60}" height="8" rx="4" fill="#9ca3af" opacity=".55"/><text x="24" y="${height - 22}" font-family="Arial" font-size="11" fill="#6b7280">${device} · revision ${revision}</text></svg>`;
}

function encodeSvg(svg: string): string {
  return btoa(unescape(encodeURIComponent(svg)));
}

export function createKaleidoscopeScenario(): HarnessScenario {
  let revision = 0;
  const createResult = (url: string, deviceIds: string[]): unknown => {
    revision += 1;
    const selected = deviceIds.map((id) => devices.find((item) => item.device === id)).filter((item): item is typeof devices[number] => Boolean(item));
    const content: Array<Record<string, unknown>> = [];
    const inlinePreviews: Array<{ deviceId: string; contentIndex: number; resourceUri: string }> = [];
    for (const item of selected) {
      const resourceUri = `kaleidoscope://capture/${item.device}`;
      content.push({ type: 'resource_link', name: `${item.device} screenshot`, uri: resourceUri });
      inlinePreviews.push({ deviceId: item.device, contentIndex: content.length, resourceUri });
      content.push({ type: 'image', mimeType: 'image/svg+xml', data: encodeSvg(pageSvg(item.device, item.width, item.height, item.color, revision)) });
    }
    return {
      structuredContent: {
        url, count: selected.length,
        screenshots: selected.map(({ device, width, height }) => ({ deviceId: device, device, width, height, error: null })),
        inlinePreviews,
      },
      content,
    };
  };
  const defaultIds = devices.map((item) => item.device);
  let currentResult = createResult('http://localhost:3000/checkout', defaultIds);
  const handlers = new Map<string, HarnessToolHandler>();
  handlers.set('capture_screenshots', async (args) => {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const url = typeof args.url === 'string' ? args.url : 'http://localhost:3000/checkout';
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch { throw new Error('capture_screenshots requires an absolute HTTP(S) URL.'); }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('capture_screenshots requires an HTTP(S) URL.');
    if (!Array.isArray(args.devices) || args.devices.length === 0 || !args.devices.every((item) => typeof item === 'string')) {
      throw new Error('capture_screenshots requires at least one device ID.');
    }
    const requested = args.devices as string[];
    const supported = new Set(defaultIds);
    if (new Set(requested).size !== requested.length || requested.some((id) => !supported.has(id as typeof defaultIds[number]))) {
      throw new Error(`capture_screenshots devices must be unique supported IDs: ${defaultIds.join(', ')}.`);
    }
    currentResult = createResult(parsedUrl.toString(), requested);
    return currentResult;
  });
  return {
    id: 'kaleidoscope-responsive-capture',
    initialInput: { url: 'http://localhost:3000/checkout', devices: defaultIds, full_page: false },
    createInitialResult: () => currentResult,
    toolHandlers: handlers,
  };
}
