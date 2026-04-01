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

export interface InspectSelectionPayload {
  selector: string | null;
  tagName: string;
  text: string | null;
  title?: string;
  pageUrl?: string;
  elementSource: RawElementSourceResult | null;
}

export interface InspectDeviceContext {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
}

export interface InspectPageContext {
  title: string | null;
  url: string | null;
}

export interface InspectSourceContext {
  startLine: number;
  endLine: number;
  focusLine: number | null;
  snippet: string;
}

export interface InspectResult {
  capability: 'supported' | 'partial' | 'unsupported';
  resolver: 'element-source' | 'heuristic' | 'none';
  confidence: 'exact' | 'likely' | 'none';
  page: InspectPageContext;
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

export interface InspectExportPayload {
  page: InspectPageContext;
  device: InspectDeviceContext | null;
  element: {
    componentName: string | null;
    selector: string | null;
    tagName: string;
    text: string | null;
    capability: InspectResult['capability'];
    resolver: InspectResult['resolver'];
    confidence: InspectResult['confidence'];
  };
  source: {
    location: string | null;
    filePath: string | null;
    lineNumber: number | null;
    columnNumber: number | null;
    kind: 'exact' | 'likely' | null;
    code: string | null;
    numberedContext: string | null;
    rawContext: InspectSourceContext | null;
  };
  stack: InspectStackFrame[];
  diagnostics: string[];
}

function formatSourceLocation(result: InspectResult): string | null {
  if (!result.source) {
    return null;
  }

  const parts = [result.source.filePath];
  if (result.source.lineNumber) {
    parts.push(String(result.source.lineNumber));
  }
  if (result.source.columnNumber) {
    parts.push(String(result.source.columnNumber));
  }

  return parts.join(':');
}

function formatNumberedSnippet(context: InspectSourceContext | null): string | null {
  if (!context) {
    return null;
  }

  return context.snippet
    .split('\n')
    .map((line, index) => `${String(context.startLine + index).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

export function formatInspectSourcePath(result: InspectResult): string | null {
  return formatSourceLocation(result);
}

export function formatInspectSourceText(result: InspectResult): string | null {
  if (!result.source) {
    return null;
  }

  return formatNumberedSnippet(result.source.context) ?? result.source.code;
}

export function serializeInspectResult(result: InspectResult): InspectExportPayload {
  return {
    page: result.page,
    device: result.device,
    element: {
      componentName: result.componentName,
      selector: result.selector,
      tagName: result.tagName,
      text: result.text,
      capability: result.capability,
      resolver: result.resolver,
      confidence: result.confidence,
    },
    source: {
      location: formatSourceLocation(result),
      filePath: result.source?.filePath ?? null,
      lineNumber: result.source?.lineNumber ?? null,
      columnNumber: result.source?.columnNumber ?? null,
      kind: result.source?.kind ?? null,
      code: result.source?.code ?? null,
      numberedContext: formatInspectSourceText(result),
      rawContext: result.source?.context ?? null,
    },
    stack: result.stack,
    diagnostics: result.diagnostics,
  };
}

export function formatInspectResultAsJson(result: InspectResult): string {
  return JSON.stringify(serializeInspectResult(result), null, 2);
}

function formatStackFrameLocation(frame: InspectStackFrame): string | null {
  const parts = [frame.filePath, frame.lineNumber ?? undefined, frame.columnNumber ?? undefined]
    .filter((value) => value !== undefined && value !== null)
    .map(String);

  return parts.length > 0 ? parts.join(':') : null;
}

export function formatInspectResultForLlm(result: InspectResult, reportedProblem: string): string {
  const sourceLocation = formatSourceLocation(result);
  const stackLines = result.stack
    .map((frame) => {
      const location = formatStackFrameLocation(frame);
      if (location && location === sourceLocation) {
        return null;
      }

      return `${frame.componentName ?? frame.filePath}${location ? ` (${location})` : ''}`;
    })
    .filter((line, index, lines): line is string => Boolean(line) && lines.indexOf(line) === index)
    .slice(0, 4);

  const lines: string[] = [
    'Help diagnose and fix this UI issue.',
    '',
    '## Reported Problem',
    reportedProblem.trim(),
    '',
    '## Context',
    `- URL: ${result.page.url ?? 'Unknown'}`,
  ];

  if (result.page.title) {
    lines.push(`- Page: ${result.page.title}`);
  }

  if (result.device) {
    lines.push(
      `- Device: ${result.device.name} (${result.device.width}x${result.device.height}, ${result.device.type})`,
    );
  }

  lines.push(`- Element: ${result.componentName ?? result.tagName}`);

  if (result.selector) {
    lines.push(`- Selector: ${result.selector}`);
  }

  if (result.text) {
    lines.push(`- Visible text: ${result.text}`);
  }

  lines.push(
    `- Source match: ${result.confidence} via ${result.resolver}`,
  );

  if (sourceLocation) {
    lines.push('', '## Source', `- File: ${sourceLocation}`);

    const sourceText = formatInspectSourceText(result);
    if (sourceText) {
      lines.push('', '```tsx', sourceText, '```');
    }
  } else {
    lines.push('', '## Source', '- No source location could be resolved for this selection.');
  }

  if (stackLines.length > 0) {
    lines.push('', '## Related Stack');
    for (const frame of stackLines) {
      lines.push(`- ${frame}`);
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push('', '## Diagnostics');
    for (const diagnostic of result.diagnostics) {
      lines.push(`- ${diagnostic}`);
    }
  }

  lines.push(
    '',
    '## Request',
    'Explain the likely root cause of the reported issue and propose the smallest safe code change to fix it. If the source match looks uncertain, say so.',
  );

  return lines.join('\n');
}

const INSPECTABLE_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

export function isInspectableLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (INSPECTABLE_LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost'));
  } catch {
    return false;
  }
}