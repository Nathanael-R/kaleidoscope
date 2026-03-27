import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findSourceHint } from './source-mapper.service.js';
import { isInspectableLocalUrl } from '../utils/security.js';

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
  elementSource: RawElementSourceResult | null;
}

export interface InspectResolution {
  capability: 'supported' | 'partial' | 'unsupported';
  resolver: 'element-source' | 'heuristic' | 'none';
  confidence: 'exact' | 'likely' | 'none';
  selector: string | null;
  tagName: string;
  text: string | null;
  componentName: string | null;
  source: {
    filePath: string;
    lineNumber: number | null;
    columnNumber: number | null;
    code: string | null;
    kind: 'exact' | 'likely';
  } | null;
  stack: InspectStackFrame[];
  diagnostics: string[];
}

interface ResolveInspectRequest {
  url: string;
  sourceDir?: string;
  selection: InspectSelection;
}

function getDisplayPath(absolutePath: string, sourceDir?: string): string {
  if (!sourceDir) {
    return absolutePath;
  }

  const candidates = [
    path.relative(sourceDir, absolutePath),
    path.relative(path.dirname(sourceDir), absolutePath),
  ];

  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate)) {
      return candidate;
    }
  }

  return absolutePath;
}

function resolveCandidatePath(filePath: string, sourceDir?: string): string | null {
  const candidates: string[] = [];

  if (path.isAbsolute(filePath)) {
    candidates.push(path.normalize(filePath));
  }

  if (sourceDir) {
    const cleaned = filePath.replace(/^[./\\]+/, '');
    if (cleaned) {
      candidates.push(path.resolve(sourceDir, cleaned));
      candidates.push(path.resolve(path.dirname(sourceDir), cleaned));
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readCodeLine(filePath: string, lineNumber: number | null): string | null {
  if (!lineNumber || lineNumber < 1 || !existsSync(filePath)) {
    return null;
  }

  try {
    const line = readFileSync(filePath, 'utf8').split(/\r?\n/)[lineNumber - 1];
    return line ? line.trim() : null;
  } catch {
    return null;
  }
}

function normalizeExactSource(
  frame: InspectStackFrame,
  sourceDir?: string,
): InspectResolution['source'] {
  const absolutePath = resolveCandidatePath(frame.filePath, sourceDir);
  if (!absolutePath) {
    return {
      filePath: frame.filePath,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      code: null,
      kind: 'exact',
    };
  }

  return {
    filePath: path.isAbsolute(frame.filePath)
      ? getDisplayPath(absolutePath, sourceDir)
      : frame.filePath.replace(/\\/g, '/'),
    lineNumber: frame.lineNumber,
    columnNumber: frame.columnNumber,
    code: readCodeLine(absolutePath, frame.lineNumber),
    kind: 'exact',
  };
}

function getComponentName(selection: InspectSelection): string | null {
  if (selection.elementSource?.componentName) {
    return selection.elementSource.componentName;
  }

  return selection.elementSource?.stack.find((frame) => frame.componentName)?.componentName ?? null;
}

class InspectService {
  resolve({ url, sourceDir, selection }: ResolveInspectRequest): InspectResolution {
    const diagnostics: string[] = [];
    const stack = selection.elementSource?.stack ?? [];
    const componentName = getComponentName(selection);

    if (!isInspectableLocalUrl(url)) {
      diagnostics.push('Inspect mode only supports local/dev loopback targets such as localhost.');
      return {
        capability: 'unsupported',
        resolver: 'none',
        confidence: 'none',
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
          selector: selection.selector,
          tagName: selection.tagName,
          text: selection.text,
          componentName,
          source: {
            filePath: hint.file,
            lineNumber: hint.line,
            columnNumber: null,
            code: hint.code,
            kind: 'likely',
          },
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