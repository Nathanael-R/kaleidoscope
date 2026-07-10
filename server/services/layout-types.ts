export type LayoutSelectorKind =
  | 'test-id'
  | 'id'
  | 'attribute'
  | 'aria'
  | 'href'
  | 'structural';

export type LayoutSelectorStability = 'stable' | 'generated' | 'structural';

export interface LayoutDeviceContext {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSourceLocation {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}

export interface LayoutElementSnapshot {
  key: string;
  selector: string;
  selectorKind: LayoutSelectorKind;
  selectorStability: LayoutSelectorStability;
  fallbackKey: string;
  structuralPath: string;
  tagName: string;
  role: string | null;
  text: string | null;
  accessibleName: string | null;
  attributes: {
    id: string | null;
    className: string | null;
    testId: string | null;
    ariaLabel: string | null;
    name: string | null;
    href: string | null;
    type: string | null;
  };
  rect: LayoutRect;
  depth: number;
  visible: boolean;
  source: LayoutSourceLocation | null;
}

export interface LayoutDeviceCapture {
  device: LayoutDeviceContext;
  page: {
    title: string | null;
    url: string | null;
  };
  viewport: {
    width: number;
    height: number;
    scrollWidth: number;
    scrollHeight: number;
  };
  elements: LayoutElementSnapshot[];
  stats: {
    elementCount: number;
    capturedCount: number;
    truncated: boolean;
  };
  diagnostics: string[];
}

export interface LayoutCaptureResult {
  url: string;
  sourceDir: string | null;
  capturedAt: string;
  durationMs: number;
  devices: LayoutDeviceCapture[];
  warnings: string[];
}

export interface StoredLayoutCapture extends LayoutCaptureResult {
  id: string;
  updatedAt: string;
}
