export const inspectBridgeScript = String.raw`(() => {
  if (window.__KALEIDOSCOPE_INSPECT_BRIDGE__) {
    return;
  }

  window.__KALEIDOSCOPE_INSPECT_BRIDGE__ = true;

  const CHANNEL = 'kaleidoscope-inspect';
  const TYPES = {
    ready: 'KALEIDOSCOPE_INSPECT_READY',
    result: 'KALEIDOSCOPE_INSPECT_RESULT',
    state: 'KALEIDOSCOPE_INSPECT_SET_STATE',
    status: 'KALEIDOSCOPE_INSPECT_STATUS',
    cancelled: 'KALEIDOSCOPE_INSPECT_CANCELLED',
  };

  const STYLE_ID = 'kaleidoscope-inspect-style';
  const HOVER_ATTR = 'data-kaleidoscope-inspect-hover';

  let enabled = false;
  let hovered = null;

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'html[data-kaleidoscope-inspecting="true"], html[data-kaleidoscope-inspecting="true"] * { cursor: crosshair !important; }',
      '[' + HOVER_ATTR + '] { outline: 2px solid #0ea5e9 !important; outline-offset: 2px !important; }',
    ].join('\n');
    document.head.appendChild(style);
  };

  const send = (type, payload) => {
    window.parent.postMessage({ source: CHANNEL, type, payload }, '*');
  };

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const clearHover = () => {
    if (hovered) {
      hovered.removeAttribute(HOVER_ATTR);
      hovered = null;
    }
  };

  const setHover = (element) => {
    if (hovered === element) {
      return;
    }

    clearHover();
    hovered = element;
    hovered.setAttribute(HOVER_ATTR, 'true');
  };

  const buildSelector = (element) => {
    if (!(element instanceof Element)) {
      return null;
    }

    if (element.id) {
      return '#' + escapeCss(element.id);
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();

      if (current.classList.length > 0) {
        part += '.' + Array.from(current.classList)
          .slice(0, 2)
          .map(escapeCss)
          .join('.');
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) {
          part += ':nth-of-type(' + String(siblings.indexOf(current) + 1) + ')';
        }
      }

      parts.unshift(part);

      if (current.id) {
        parts[0] = '#' + escapeCss(current.id);
        break;
      }

      current = parent;
    }

    return parts.join(' > ') || element.tagName.toLowerCase();
  };

  const summarizeText = (element) => {
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ');
    return text ? text.slice(0, 140) : null;
  };

  const resolveElementSource = async (element) => {
    const api = window.ElementSource;
    if (!api || typeof api.resolveElementInfo !== 'function') {
      return null;
    }

    try {
      const info = await api.resolveElementInfo(element);
      return {
        componentName: info.componentName ?? null,
        source: info.source ?? null,
        stack: Array.isArray(info.stack) ? info.stack : [],
        error: null,
      };
    } catch (error) {
      return {
        componentName: null,
        source: null,
        stack: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const updateState = (nextEnabled) => {
    enabled = Boolean(nextEnabled);
    document.documentElement.toggleAttribute('data-kaleidoscope-inspecting', enabled);

    if (!enabled) {
      clearHover();
    }

    send(TYPES.status, {
      enabled,
      exactRuntimeAvailable: Boolean(window.ElementSource && typeof window.ElementSource.resolveElementInfo === 'function'),
    });
  };

  const handlePointerMove = (event) => {
    if (!enabled) {
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!(target instanceof Element)) {
      clearHover();
      return;
    }

    setHover(target);
  };

  const handleClick = async (event) => {
    if (!enabled) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    const selector = buildSelector(target);
    const elementSource = await resolveElementSource(target);

    send(TYPES.result, {
      selector,
      tagName: target.tagName.toLowerCase(),
      text: summarizeText(target),
      title: document.title,
      pageUrl: window.location.href,
      elementSource,
    });
  };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== CHANNEL || data.type !== TYPES.state) {
      return;
    }

    updateState(Boolean(data.enabled));
  });

  window.addEventListener('keydown', (event) => {
    if (!enabled || event.key !== 'Escape') {
      return;
    }

    updateState(false);
    send(TYPES.cancelled, { enabled: false });
  }, true);

  ensureStyle();
  document.addEventListener('mousemove', handlePointerMove, true);
  document.addEventListener('click', handleClick, true);

  send(TYPES.ready, {
    exactRuntimeAvailable: Boolean(window.ElementSource && typeof window.ElementSource.resolveElementInfo === 'function'),
  });
})();`;