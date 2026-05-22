import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findSourceHint } from './source-mapper.service.js';
import { isInspectableLocalUrl } from '../utils/security.js';
import { isPathInside } from '../utils/path-policy.js';

export interface InspectStackFrame {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}

export interface RawElementSourceResult {
  componentName: string | null;
  source: InspectStackFrame | null;
  stack: InspectStackFrame[];
  error?: string | null;
}

export interface InspectSelection {
  selector: string | null;
  tagName: string;
  text: string | null;
  title: string | null;
  pageUrl: string | null;
  elementSource: RawElementSourceResult | null;
}

export interface InspectDeviceContext {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
}

export interface InspectSourceContext {
  startLine: number;
  endLine: number;
  focusLine: number | null;
  snippet: string;
}

export interface InspectResolution {
  capability: 'supported' | 'partial' | 'unsupported';
  resolver: 'element-source' | 'heuristic' | 'none';
  confidence: 'exact' | 'likely' | 'none';
  page: {
    title: string | null;
    url: string | null;
  };
  device: InspectDeviceContext | null;
  selector: string | null;
  tagName: string;
  text: string | null;
  componentName: string | null;
  source: {
    filePath: string;
    lineNumber: number | null;
    columnNumber: number | null;
    code: string | null;
    context: InspectSourceContext | null;
    kind: 'exact' | 'likely';
  } | null;
  stack: InspectStackFrame[];
  diagnostics: string[];
}

interface ResolveInspectRequest {
  url: string;
  sourceDir?: string;
  device?: InspectDeviceContext | null;
  selection: InspectSelection;
}

function getDisplayPath(absolutePath: string, sourceDir?: string): string {
  if (!sourceDir) {
    return path.basename(absolutePath);
  }

  const relative = path.relative(sourceDir, absolutePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, '/');
  }

  return path.basename(absolutePath);
}

function resolveCandidatePath(filePath: string, sourceDir?: string): string | null {
  const candidates: string[] = [];

  if (!sourceDir) {
    return null;
  }

  const sourceRoot = path.resolve(sourceDir);

  if (path.isAbsolute(filePath)) {
    const normalized = path.normalize(filePath);
    if (isPathInside(sourceRoot, normalized)) {
      candidates.push(normalized);
    }
  } else {
    const cleaned = filePath.replace(/^[./\\]+/, '');
    if (!cleaned.split(/[\\/]+/).includes('..')) {
      candidates.push(path.resolve(sourceRoot, cleaned));
    }
  }

  for (const candidate of candidates) {
    if (isPathInside(sourceRoot, candidate) && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function sanitizeDisplayFilePath(filePath: string): string {
  if (path.isAbsolute(filePath) || filePath.split(/[\\/]+/).includes('..')) {
    return path.basename(filePath);
  }

  return filePath.replace(/\\/g, '/');
}

function sanitizeStack(stack: InspectStackFrame[], sourceDir?: string): InspectStackFrame[] {
  return stack.map((frame) => {
    const resolvedPath = resolveCandidatePath(frame.filePath, sourceDir);
    const displayPath = resolvedPath
      ? getDisplayPath(resolvedPath, sourceDir)
      : sanitizeDisplayFilePath(frame.filePath);

    return {
      ...frame,
      filePath: displayPath,
    };
  });
}

function readSourceFile(filePath: string): string[] | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return readFileSync(filePath, 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
}

function readCodeLine(lines: string[] | null, lineNumber: number | null): string | null {
  if (!lines || !lineNumber || lineNumber < 1) {
    return null;
  }

  const line = lines[lineNumber - 1];
  return line ? line.trim() : null;
}

function readCodeContext(lines: string[] | null, lineNumber: number | null, radius = 2): InspectSourceContext | null {
  if (!lines || !lineNumber || lineNumber < 1 || lineNumber > lines.length) {
    return null;
  }

  const startLine = Math.max(1, lineNumber - radius);
  const endLine = Math.min(lines.length, lineNumber + radius);

  return {
    startLine,
    endLine,
    focusLine: lineNumber,
    snippet: lines.slice(startLine - 1, endLine).join('\n'),
  };
}

function normalizeExactSource(
  frame: InspectStackFrame,
  sourceDir?: string,
): InspectResolution['source'] {
  const absolutePath = resolveCandidatePath(frame.filePath, sourceDir);
  if (!absolutePath) {
    return {
      filePath: sanitizeDisplayFilePath(frame.filePath),
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      code: null,
      context: null,
      kind: 'exact',
    };
  }

  const lines = readSourceFile(absolutePath);

  return {
    filePath: path.isAbsolute(frame.filePath)
      ? getDisplayPath(absolutePath, sourceDir)
      : frame.filePath.replace(/\\/g, '/'),
    lineNumber: frame.lineNumber,
    columnNumber: frame.columnNumber,
    code: readCodeLine(lines, frame.lineNumber),
    context: readCodeContext(lines, frame.lineNumber),
    kind: 'exact',
  };
}

function normalizeLikelySource(
  filePath: string,
  lineNumber: number,
  fallbackCode: string,
  sourceDir?: string,
): InspectResolution['source'] {
  const absolutePath = resolveCandidatePath(filePath, sourceDir);
  const lines = absolutePath ? readSourceFile(absolutePath) : null;

  return {
    filePath: filePath.replace(/\\/g, '/'),
    lineNumber,
    columnNumber: null,
    code: readCodeLine(lines, lineNumber) ?? fallbackCode,
    context: readCodeContext(lines, lineNumber),
    kind: 'likely',
  };
}

function getComponentName(selection: InspectSelection): string | null {
  if (selection.elementSource?.componentName) {
    return selection.elementSource.componentName;
  }

  return selection.elementSource?.stack.find((frame) => frame.componentName)?.componentName ?? null;
}

class InspectService {
  resolve({ url, sourceDir, device, selection }: ResolveInspectRequest): InspectResolution {
    const diagnostics: string[] = [];
    const stack = sanitizeStack(selection.elementSource?.stack ?? [], sourceDir);
    const componentName = getComponentName(selection);
    const page = {
      title: selection.title,
      url: selection.pageUrl,
    };

    if (!isInspectableLocalUrl(url)) {
      diagnostics.push('Inspect mode only supports local/dev loopback targets such as localhost.');
      return {
        capability: 'unsupported',
        resolver: 'none',
        confidence: 'none',
        page,
        device: device ?? null,
        selector: selection.selector,
        tagName: selection.tagName,
        text: selection.text,
        componentName,
        source: null,
        stack,
        diagnostics,
      };
    }

    if (selection.elementSource?.error) {
      diagnostics.push(`element-source: ${selection.elementSource.error}`);
    }

    if (selection.elementSource?.source) {
      return {
        capability: 'supported',
        resolver: 'element-source',
        confidence: 'exact',
        page,
        device: device ?? null,
        selector: selection.selector,
        tagName: selection.tagName,
        text: selection.text,
        componentName,
        source: normalizeExactSource(selection.elementSource.source, sourceDir),
        stack,
        diagnostics,
      };
    }

    if (sourceDir && selection.selector) {
      const hint = findSourceHint(selection.selector, sourceDir);
      if (hint) {
        return {
          capability: 'supported',
          resolver: 'heuristic',
          confidence: 'likely',
          page,
          device: device ?? null,
          selector: selection.selector,
          tagName: selection.tagName,
          text: selection.text,
          componentName,
          source: normalizeLikelySource(hint.file, hint.line, hint.code, sourceDir),
          stack,
          diagnostics,
        };
      }
    }

    if (!sourceDir) {
      diagnostics.push('Add a project path to enable heuristic source matching when exact runtime metadata is unavailable.');
    }

    if (!selection.selector) {
      diagnostics.push('A stable selector could not be captured for this element.');
    }

    if (stack.length === 0) {
      diagnostics.push('No exact runtime source metadata was available for the selected element.');
    }

    return {
      capability: 'partial',
      resolver: 'none',
      confidence: 'none',
      page,
      device: device ?? null,
      selector: selection.selector,
      tagName: selection.tagName,
      text: selection.text,
      componentName,
      source: null,
      stack,
      diagnostics,
    };
  }
}

export const inspectService = new InspectService();
