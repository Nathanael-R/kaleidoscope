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

export interface InspectResult {
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