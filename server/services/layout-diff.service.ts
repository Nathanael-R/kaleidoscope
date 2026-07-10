import type {
  LayoutCaptureResult,
  LayoutDeviceCapture,
  LayoutElementSnapshot,
  LayoutRect,
  LayoutSourceLocation,
} from './layout-types.js';

export type LayoutDiffVerdict = 'noChange' | 'changed' | 'inconclusive';

export type LayoutChangeType = 'added' | 'removed' | 'text' | 'geometry';

export type LayoutChangeSeverity = 'low' | 'medium' | 'high';

export interface LayoutDiffOptions {
  positionThresholdPx?: number;
  sizeThresholdPx?: number;
  relativeSizeThreshold?: number;
  maxChangesPerDevice?: number;
}

export interface LayoutElementReference {
  key: string;
  selector: string;
  selectorStability: LayoutElementSnapshot['selectorStability'];
  fallbackKey: string;
  structuralPath: string;
  tagName: string;
  role: string | null;
  text: string | null;
  accessibleName: string | null;
  rect: LayoutRect;
  source: LayoutSourceLocation | null;
}

export interface LayoutChange {
  type: LayoutChangeType;
  severity: LayoutChangeSeverity;
  deviceId: string;
  deviceName: string;
  matchKey: string;
  label: string;
  selector: string | null;
  before: LayoutElementReference | null;
  after: LayoutElementReference | null;
  details: string;
  source: LayoutSourceLocation | null;
}

export interface LayoutDeviceDiff {
  device: LayoutDeviceCapture['device'];
  beforeElementCount: number;
  afterElementCount: number;
  matchedCount: number;
  changes: LayoutChange[];
  diagnostics: string[];
}

export interface LayoutDiffResult {
  verdict: LayoutDiffVerdict;
  beforeCaptureId: string | null;
  afterCaptureId: string | null;
  url: string;
  deviceCount: number;
  changedDeviceCount: number;
  changeCount: number;
  truncated: boolean;
  coverageChanged: boolean;
  devices: LayoutDeviceDiff[];
  warnings: string[];
}

type CapturedLayout = LayoutCaptureResult & {
  id?: string;
};

type MatchBucket = {
  key: string;
  elements: LayoutElementSnapshot[];
};

const DEFAULT_POSITION_THRESHOLD_PX = 4;
const DEFAULT_SIZE_THRESHOLD_PX = 4;
const DEFAULT_RELATIVE_SIZE_THRESHOLD = 0.04;
const DEFAULT_MAX_CHANGES_PER_DEVICE = 30;
const FUZZY_MATCH_MAX_SCORE = 160;

function normalizeText(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function getElementLabel(element: LayoutElementSnapshot): string {
  const text = normalizeText(element.accessibleName) || normalizeText(element.text);
  if (text) {
    return `${element.tagName}${element.role ? `/${element.role}` : ''} "${text.slice(0, 80)}"`;
  }
  return `${element.tagName}${element.role ? `/${element.role}` : ''} ${element.selector}`;
}

function toReference(element: LayoutElementSnapshot): LayoutElementReference {
  return {
    key: element.key,
    selector: element.selector,
    selectorStability: element.selectorStability,
    fallbackKey: element.fallbackKey,
    structuralPath: element.structuralPath,
    tagName: element.tagName,
    role: element.role,
    text: element.text,
    accessibleName: element.accessibleName,
    rect: element.rect,
    source: element.source,
  };
}

function getSource(before: LayoutElementSnapshot | null, after: LayoutElementSnapshot | null): LayoutSourceLocation | null {
  return after?.source ?? before?.source ?? null;
}

function isInterestingElement(element: LayoutElementSnapshot): boolean {
  if (element.source || element.role || element.accessibleName || element.text) {
    return true;
  }

  if (element.attributes.testId || element.attributes.ariaLabel || element.attributes.name || element.attributes.href) {
    return true;
  }

  return ['main', 'header', 'footer', 'nav', 'section', 'article', 'aside', 'form', 'button', 'a', 'input'].includes(element.tagName);
}

function getStableAttributeIdentity(element: LayoutElementSnapshot): string | null {
  const attrs = element.attributes;
  const stableAttribute =
    attrs.testId ? ['testId', attrs.testId] :
      attrs.ariaLabel ? ['ariaLabel', attrs.ariaLabel] :
        attrs.name ? ['name', attrs.name] :
          attrs.href ? ['href', attrs.href] :
            null;

  if (!stableAttribute) {
    return null;
  }

  return JSON.stringify([
    element.tagName,
    element.role ?? '',
    stableAttribute[0],
    stableAttribute[1].trim().toLowerCase(),
  ]);
}

function getSourceIdentity(element: LayoutElementSnapshot): string | null {
  const source = element.source;
  if (!source?.filePath || !source.lineNumber) {
    return null;
  }

  return `${element.tagName}|${element.role ?? ''}|${source.filePath}:${source.lineNumber}`;
}

function getSemanticText(element: LayoutElementSnapshot): string {
  return normalizeText(element.accessibleName ?? element.text);
}

function getMatchKey(element: LayoutElementSnapshot): string {
  if (element.selectorStability === 'stable') {
    return `selector:${element.selector}`;
  }

  const stableAttribute = getStableAttributeIdentity(element);
  if (stableAttribute) {
    return `fallback:${stableAttribute}`;
  }

  const sourceIdentity = getSourceIdentity(element);
  if (sourceIdentity) {
    return `source:${sourceIdentity}`;
  }

  return `structure:${element.structuralPath}`;
}

function groupByMatchKey(elements: LayoutElementSnapshot[]): Map<string, MatchBucket> {
  const buckets = new Map<string, MatchBucket>();

  for (const element of elements.filter(isInterestingElement)) {
    const key = getMatchKey(element);
    const existing = buckets.get(key);
    if (existing) {
      existing.elements.push(element);
    } else {
      buckets.set(key, { key, elements: [element] });
    }
  }

  return buckets;
}

function pickAfterElement(before: LayoutElementSnapshot, candidates: LayoutElementSnapshot[]): LayoutElementSnapshot | null {
  if (candidates.length === 0) {
    return null;
  }

  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const textPenalty = normalizeText(before.accessibleName ?? before.text) === normalizeText(candidate.accessibleName ?? candidate.text)
      ? 0
      : 1000;
    const distance =
      Math.abs(before.rect.x - candidate.rect.x)
      + Math.abs(before.rect.y - candidate.rect.y)
      + Math.abs(before.rect.width - candidate.rect.width)
      + Math.abs(before.rect.height - candidate.rect.height)
      + textPenalty;

    if (distance < bestScore) {
      bestScore = distance;
      bestIndex = index;
    }
  }

  const [match] = candidates.splice(bestIndex, 1);
  return match ?? null;
}

function removeElement(elements: LayoutElementSnapshot[], element: LayoutElementSnapshot): void {
  const index = elements.indexOf(element);
  if (index >= 0) {
    elements.splice(index, 1);
  }
}

function scoreFuzzyCandidate(before: LayoutElementSnapshot, after: LayoutElementSnapshot): number {
  if (before.tagName !== after.tagName) {
    return Number.POSITIVE_INFINITY;
  }

  const beforeStableAttribute = getStableAttributeIdentity(before);
  const afterStableAttribute = getStableAttributeIdentity(after);
  if (beforeStableAttribute && afterStableAttribute && beforeStableAttribute !== afterStableAttribute) {
    return Number.POSITIVE_INFINITY;
  }

  const beforeSource = getSourceIdentity(before);
  const afterSource = getSourceIdentity(after);
  const beforeText = getSemanticText(before);
  const afterText = getSemanticText(after);
  const geometryDistance =
    Math.abs(before.rect.x - after.rect.x)
    + Math.abs(before.rect.y - after.rect.y)
    + Math.abs(before.rect.width - after.rect.width)
    + Math.abs(before.rect.height - after.rect.height);

  let score = geometryDistance;
  if (before.role !== after.role) score += 40;
  if (before.structuralPath === after.structuralPath) score -= 90;
  if (beforeStableAttribute && beforeStableAttribute === afterStableAttribute) score -= 120;
  if (beforeSource && beforeSource === afterSource) score -= 90;
  if (beforeText && beforeText === afterText) score -= 25;
  if (beforeText && afterText && beforeText !== afterText) score += 15;

  return score;
}

function pickFuzzyAfterElement(
  before: LayoutElementSnapshot,
  remainingAfterElements: LayoutElementSnapshot[],
): LayoutElementSnapshot | null {
  let bestElement: LayoutElementSnapshot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of remainingAfterElements) {
    const score = scoreFuzzyCandidate(before, candidate);
    if (score < bestScore) {
      bestElement = candidate;
      bestScore = score;
    }
  }

  if (!bestElement || bestScore > FUZZY_MATCH_MAX_SCORE) {
    return null;
  }

  return bestElement;
}

function rectDelta(before: LayoutRect, after: LayoutRect) {
  return {
    x: after.x - before.x,
    y: after.y - before.y,
    width: after.width - before.width,
    height: after.height - before.height,
  };
}

function exceedsGeometryThreshold(
  before: LayoutRect,
  after: LayoutRect,
  options: Required<Pick<LayoutDiffOptions, 'positionThresholdPx' | 'sizeThresholdPx' | 'relativeSizeThreshold'>>,
): boolean {
  const delta = rectDelta(before, after);
  const moved = Math.abs(delta.x) > options.positionThresholdPx || Math.abs(delta.y) > options.positionThresholdPx;
  const resizedPx = Math.abs(delta.width) > options.sizeThresholdPx || Math.abs(delta.height) > options.sizeThresholdPx;
  const beforeArea = Math.max(1, before.width * before.height);
  const afterArea = Math.max(1, after.width * after.height);
  const resizedRatio = Math.abs(afterArea - beforeArea) / beforeArea > options.relativeSizeThreshold;
  return moved || resizedPx || resizedRatio;
}

function geometrySeverity(before: LayoutRect, after: LayoutRect): LayoutChangeSeverity {
  const delta = rectDelta(before, after);
  const movement = Math.abs(delta.x) + Math.abs(delta.y);
  const resize = Math.abs(delta.width) + Math.abs(delta.height);

  if (movement > 80 || resize > 120) {
    return 'high';
  }

  if (movement > 24 || resize > 40) {
    return 'medium';
  }

  return 'low';
}

function describeGeometryChange(before: LayoutRect, after: LayoutRect): string {
  const delta = rectDelta(before, after);
  const parts: string[] = [];

  if (delta.x !== 0 || delta.y !== 0) {
    parts.push(`moved by ${delta.x}px x, ${delta.y}px y`);
  }

  if (delta.width !== 0 || delta.height !== 0) {
    parts.push(`resized by ${delta.width}px width, ${delta.height}px height`);
  }

  return parts.join('; ') || 'geometry changed';
}

function diffDevice(
  before: LayoutDeviceCapture,
  after: LayoutDeviceCapture,
  options: Required<LayoutDiffOptions>,
): LayoutDeviceDiff {
  const afterElements = after.elements.filter(isInterestingElement);
  const remainingAfterElements = [...afterElements];
  const afterBuckets = groupByMatchKey(afterElements);
  const changes: LayoutChange[] = [];
  let matchedCount = 0;

  for (const [matchKey, beforeBucket] of groupByMatchKey(before.elements)) {
    const afterBucket = afterBuckets.get(matchKey);

    for (const beforeElement of beforeBucket.elements) {
      let resolvedMatchKey = matchKey;
      let afterElement = afterBucket ? pickAfterElement(beforeElement, afterBucket.elements) : null;
      if (afterElement) {
        removeElement(remainingAfterElements, afterElement);
      } else {
        afterElement = pickFuzzyAfterElement(beforeElement, remainingAfterElements);
        if (afterElement) {
          removeElement(remainingAfterElements, afterElement);
          const fuzzyBucket = afterBuckets.get(getMatchKey(afterElement));
          if (fuzzyBucket) {
            removeElement(fuzzyBucket.elements, afterElement);
          }
          resolvedMatchKey = `fuzzy:${beforeElement.key}->${afterElement.key}`;
        }
      }

      if (!afterElement) {
        changes.push({
          type: 'removed',
          severity: beforeElement.role || beforeElement.text || beforeElement.source ? 'medium' : 'low',
          deviceId: before.device.id,
          deviceName: before.device.name,
          matchKey: resolvedMatchKey,
          label: getElementLabel(beforeElement),
          selector: beforeElement.selector,
          before: toReference(beforeElement),
          after: null,
          details: 'element disappeared from the captured viewport',
          source: getSource(beforeElement, null),
        });
        continue;
      }

      matchedCount += 1;
      const beforeText = normalizeText(beforeElement.accessibleName ?? beforeElement.text);
      const afterText = normalizeText(afterElement.accessibleName ?? afterElement.text);

      if (beforeText !== afterText) {
        changes.push({
          type: 'text',
          severity: 'medium',
          deviceId: before.device.id,
          deviceName: before.device.name,
          matchKey: resolvedMatchKey,
          label: getElementLabel(afterElement),
          selector: afterElement.selector,
          before: toReference(beforeElement),
          after: toReference(afterElement),
          details: `text changed from "${beforeText.slice(0, 80)}" to "${afterText.slice(0, 80)}"`,
          source: getSource(beforeElement, afterElement),
        });
      }

      if (exceedsGeometryThreshold(beforeElement.rect, afterElement.rect, options)) {
        changes.push({
          type: 'geometry',
          severity: geometrySeverity(beforeElement.rect, afterElement.rect),
          deviceId: before.device.id,
          deviceName: before.device.name,
          matchKey: resolvedMatchKey,
          label: getElementLabel(afterElement),
          selector: afterElement.selector,
          before: toReference(beforeElement),
          after: toReference(afterElement),
          details: describeGeometryChange(beforeElement.rect, afterElement.rect),
          source: getSource(beforeElement, afterElement),
        });
      }
    }
  }

  for (const afterElement of remainingAfterElements) {
    changes.push({
      type: 'added',
      severity: afterElement.role || afterElement.text || afterElement.source ? 'medium' : 'low',
      deviceId: before.device.id,
      deviceName: before.device.name,
      matchKey: getMatchKey(afterElement),
      label: getElementLabel(afterElement),
      selector: afterElement.selector,
      before: null,
      after: toReference(afterElement),
      details: 'element appeared in the captured viewport',
      source: getSource(null, afterElement),
    });
  }

  return {
    device: before.device,
    beforeElementCount: before.elements.length,
    afterElementCount: after.elements.length,
    matchedCount,
    changes: changes.slice(0, options.maxChangesPerDevice),
    diagnostics: [...before.diagnostics, ...after.diagnostics],
  };
}

export function diffLayoutCaptures(
  before: CapturedLayout,
  after: CapturedLayout,
  options: LayoutDiffOptions = {},
): LayoutDiffResult {
  const normalizedOptions: Required<LayoutDiffOptions> = {
    positionThresholdPx: options.positionThresholdPx ?? DEFAULT_POSITION_THRESHOLD_PX,
    sizeThresholdPx: options.sizeThresholdPx ?? DEFAULT_SIZE_THRESHOLD_PX,
    relativeSizeThreshold: options.relativeSizeThreshold ?? DEFAULT_RELATIVE_SIZE_THRESHOLD,
    maxChangesPerDevice: options.maxChangesPerDevice ?? DEFAULT_MAX_CHANGES_PER_DEVICE,
  };
  const afterDevices = new Map(after.devices.map(deviceCapture => [deviceCapture.device.id, deviceCapture]));
  const devices: LayoutDeviceDiff[] = [];
  const warnings = [...before.warnings, ...after.warnings];
  let coverageChanged = false;

  for (const beforeDevice of before.devices) {
    const afterDevice = afterDevices.get(beforeDevice.device.id);
    if (!afterDevice) {
      coverageChanged = true;
      warnings.push(`Device missing from after capture: ${beforeDevice.device.id}`);
      continue;
    }

    devices.push(diffDevice(beforeDevice, afterDevice, normalizedOptions));
  }

  for (const afterDevice of after.devices) {
    if (!before.devices.some(beforeDevice => beforeDevice.device.id === afterDevice.device.id)) {
      coverageChanged = true;
      warnings.push(`New device only present in after capture: ${afterDevice.device.id}`);
    }
  }

  const changeCount = devices.reduce((total, device) => total + device.changes.length, 0);
  const changedDeviceCount = devices.filter(device => device.changes.length > 0).length;
  const truncated = before.devices.some(device => device.stats.truncated) || after.devices.some(device => device.stats.truncated);
  const hasDiagnostics = devices.some(device => device.diagnostics.length > 0);
  const verdict: LayoutDiffVerdict = changeCount > 0
    ? 'changed'
    : (truncated || hasDiagnostics || coverageChanged || warnings.length > 0 || devices.length === 0 ? 'inconclusive' : 'noChange');

  return {
    verdict,
    beforeCaptureId: before.id ?? null,
    afterCaptureId: after.id ?? null,
    url: after.url || before.url,
    deviceCount: devices.length,
    changedDeviceCount,
    changeCount,
    truncated,
    coverageChanged,
    devices,
    warnings,
  };
}
