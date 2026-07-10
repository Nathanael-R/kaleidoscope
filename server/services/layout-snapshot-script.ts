import type {
  LayoutElementSnapshot,
  LayoutSelectorKind,
  LayoutSelectorStability,
} from './layout-types.js';

export interface BrowserElementSourceResult {
  componentName?: unknown;
  source?: unknown;
  stack?: unknown;
  error?: unknown;
}

export type BrowserLayoutElementSnapshot = Omit<LayoutElementSnapshot, 'source'> & {
  rawSource: BrowserElementSourceResult | null;
};

export interface BrowserLayoutSnapshot {
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
  elementCount: number;
  truncated: boolean;
  elements: BrowserLayoutElementSnapshot[];
}

export interface BrowserLayoutSnapshotOptions {
  maxElements: number;
  resolveSource: boolean;
}

export function captureBrowserLayoutSnapshot({
  maxElements: browserMaxElements,
  resolveSource,
}: BrowserLayoutSnapshotOptions): Promise<BrowserLayoutSnapshot> {
  type SnapshotSelector = {
    selector: string;
    kind: LayoutSelectorKind;
    stability: LayoutSelectorStability;
    structuralPath: string;
  };

  const normalizeText = (value: string | null | undefined, maxLength = 140) => {
    if (!value) return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
  };

  const escapeCss = (value: string) => {
    const css = (window as Window & { CSS?: { escape?: (input: string) => string } }).CSS;
    if (css && typeof css.escape === 'function') {
      return css.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const quoteAttr = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const attrSelector = (name: string, value: string) => `[${name}="${quoteAttr(value)}"]`;
  const isGeneratedToken = (value: string) => {
    const token = value.trim();
    return (
      token.length === 0
      || /^__/.test(token)
      || /^css-[a-z0-9]+$/i.test(token)
      || /^jsx-[a-z0-9]+$/i.test(token)
      || /^sc-[a-z0-9]+$/i.test(token)
      || /[a-f0-9]{8,}/i.test(token)
      || /[:]/.test(token)
    );
  };

  const getRole = (element: Element) => {
    const explicitRole = normalizeText(element.getAttribute('role'), 80);
    if (explicitRole) return explicitRole;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'button') return 'button';
    if (tagName === 'a' && element.hasAttribute('href')) return 'link';
    if (tagName === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    if (tagName === 'textarea') return 'textbox';
    if (tagName === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tagName)) return 'heading';
    if (tagName === 'nav') return 'navigation';
    if (tagName === 'main') return 'main';
    if (tagName === 'form') return 'form';
    return null;
  };

  const getAccessibleName = (element: Element) => {
    const tagName = element.tagName.toLowerCase();
    const ariaLabel = normalizeText(element.getAttribute('aria-label'));
    if (ariaLabel) return ariaLabel;
    const title = normalizeText(element.getAttribute('title'));
    if (title) return title;
    if (tagName === 'img') {
      const alt = normalizeText(element.getAttribute('alt'));
      if (alt) return alt;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return normalizeText(element.getAttribute('placeholder'))
        ?? normalizeText(element.getAttribute('value'))
        ?? normalizeText(element.name);
    }
    return normalizeText(element.textContent);
  };

  const getStructuralPath = (element: Element) => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.tagName.toLowerCase();
      if (tagName === 'html') {
        parts.unshift('html');
        break;
      }

      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName.toLowerCase() === tagName) {
          index += 1;
        }
        sibling = sibling.previousElementSibling;
      }

      parts.unshift(`${tagName}:nth-of-type(${index})`);
      current = current.parentElement;
    }

    return parts.join(' > ');
  };

  const buildSelector = (element: Element): SnapshotSelector => {
    const tagName = element.tagName.toLowerCase();
    const structuralPath = getStructuralPath(element);
    const stableAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];

    for (const attrName of stableAttrs) {
      const value = normalizeText(element.getAttribute(attrName), 120);
      if (value && !isGeneratedToken(value)) {
        return {
          selector: attrSelector(attrName, value),
          kind: 'test-id',
          stability: 'stable',
          structuralPath,
        };
      }
    }

    if (element.id && !isGeneratedToken(element.id)) {
      return {
        selector: `#${escapeCss(element.id)}`,
        kind: 'id',
        stability: 'stable',
        structuralPath,
      };
    }

    const name = normalizeText(element.getAttribute('name'), 120);
    if (name && !isGeneratedToken(name) && ['input', 'select', 'textarea', 'button', 'form'].includes(tagName)) {
      return {
        selector: `${tagName}${attrSelector('name', name)}`,
        kind: 'attribute',
        stability: 'stable',
        structuralPath,
      };
    }

    const ariaLabel = normalizeText(element.getAttribute('aria-label'), 120);
    if (ariaLabel) {
      return {
        selector: `${tagName}${attrSelector('aria-label', ariaLabel)}`,
        kind: 'aria',
        stability: 'stable',
        structuralPath,
      };
    }

    const href = normalizeText(element.getAttribute('href'), 180);
    if (href && tagName === 'a' && !href.startsWith('javascript:')) {
      return {
        selector: `a${attrSelector('href', href)}`,
        kind: 'href',
        stability: 'stable',
        structuralPath,
      };
    }

    return {
      selector: structuralPath,
      kind: 'structural',
      stability: 'structural',
      structuralPath,
    };
  };

  const getDepth = (element: Element) => {
    let depth = 0;
    let current = element.parentElement;
    while (current) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  };

  const buildFallbackKey = (
    tagName: string,
    role: string | null,
    attrs: LayoutElementSnapshot['attributes'],
  ) => {
    const stableAttr = attrs.testId ?? attrs.ariaLabel ?? attrs.name ?? attrs.href ?? '';
    return [
      tagName,
      role ?? '',
      stableAttr.toLowerCase(),
    ].join('|');
  };

  const isSourceWorthyElement = (
    tagName: string,
    role: string | null,
    text: string | null,
    accessibleName: string | null,
    attrs: LayoutElementSnapshot['attributes'],
  ) => {
    return Boolean(
      role
      || text
      || accessibleName
      || attrs.testId
      || attrs.ariaLabel
      || attrs.name
      || attrs.href
      || ['main', 'header', 'footer', 'nav', 'section', 'article', 'aside', 'form'].includes(tagName),
    );
  };

  const resolveElementSource = async (element: Element): Promise<BrowserElementSourceResult | null> => {
    if (!resolveSource) return null;

    const api = (window as Window & {
      ElementSource?: {
        resolveElementInfo?: (target: Element) => Promise<unknown>;
      };
    }).ElementSource;

    if (!api || typeof api.resolveElementInfo !== 'function') {
      return null;
    }

    try {
      return await Promise.race([
        api.resolveElementInfo(element) as Promise<BrowserElementSourceResult>,
        new Promise<BrowserElementSourceResult>((resolve) => {
          window.setTimeout(() => {
            resolve({
              componentName: null,
              source: null,
              stack: [],
              error: 'Timed out while resolving runtime element metadata.',
            });
          }, 150);
        }),
      ]);
    } catch (error) {
      return {
        componentName: null,
        source: null,
        stack: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const candidates = Array.from(document.querySelectorAll('body *'));
  const elements: BrowserLayoutElementSnapshot[] = [];

  const capture = async () => {
    for (const element of candidates) {
      if (elements.length >= browserMaxElements) {
        break;
      }

      const tagName = element.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'template', 'svg', 'path'].includes(tagName)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        continue;
      }

      if (rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }

      const selector = buildSelector(element);
      const text = normalizeText(element.textContent);
      const accessibleName = getAccessibleName(element);
      const attrs = {
        id: normalizeText(element.id, 120),
        className: typeof element.className === 'string' ? normalizeText(element.className, 200) : null,
        testId: normalizeText(
          element.getAttribute('data-testid')
            ?? element.getAttribute('data-test')
            ?? element.getAttribute('data-cy')
            ?? element.getAttribute('data-qa'),
          120,
        ),
        ariaLabel: normalizeText(element.getAttribute('aria-label'), 120),
        name: normalizeText(element.getAttribute('name'), 120),
        href: normalizeText(element.getAttribute('href'), 180),
        type: normalizeText(element.getAttribute('type'), 80),
      };
      const role = getRole(element);

      elements.push({
        key: `${selector.selector}|${elements.length}`,
        selector: selector.selector,
        selectorKind: selector.kind,
        selectorStability: selector.stability,
        fallbackKey: buildFallbackKey(tagName, role, attrs),
        structuralPath: selector.structuralPath,
        tagName,
        role,
        text,
        accessibleName,
        attributes: attrs,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
        },
        depth: getDepth(element),
        visible: true,
        rawSource: isSourceWorthyElement(tagName, role, text, accessibleName, attrs)
          ? await resolveElementSource(element)
          : null,
      });
    }

    return {
      page: {
        title: document.title || null,
        url: window.location.href || null,
      },
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
      },
      elementCount: candidates.length,
      truncated: elements.length >= browserMaxElements && candidates.length > elements.length,
      elements,
    };
  };

  return capture();
}
