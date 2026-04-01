export const linkedActionsBridgeScript = String.raw`(() => {
  if (window.__KALEIDOSCOPE_LINKED_ACTIONS_BRIDGE__) {
    return;
  }

  window.__KALEIDOSCOPE_LINKED_ACTIONS_BRIDGE__ = true;

  const CHANNEL = 'kaleidoscope-linked-actions';
  const TYPES = {
    ready: 'KALEIDOSCOPE_LINKED_READY',
    state: 'KALEIDOSCOPE_LINKED_SET_STATE',
    event: 'KALEIDOSCOPE_LINKED_EVENT',
    apply: 'KALEIDOSCOPE_LINKED_APPLY',
  };

  let enabled = false;
  let suppressOutgoing = false;
  let scrollFrame = null;

  const send = (type, payload) => {
    window.parent.postMessage({ source: CHANNEL, type, payload }, '*');
  };

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
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

  const withSuppressedOutgoing = (callback) => {
    suppressOutgoing = true;
    try {
      callback();
    } finally {
      window.setTimeout(() => {
        suppressOutgoing = false;
      }, 0);
    }
  };

  const getScrollProgress = () => {
    const maxLeft = Math.max(document.documentElement.scrollWidth - window.innerWidth, 0);
    const maxTop = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);

    return {
      left: window.scrollX,
      top: window.scrollY,
      progressX: maxLeft > 0 ? window.scrollX / maxLeft : 0,
      progressY: maxTop > 0 ? window.scrollY / maxTop : 0,
    };
  };

  const emitScroll = () => {
    scrollFrame = null;
    if (!enabled || suppressOutgoing) {
      return;
    }

    send(TYPES.event, {
      kind: 'scroll',
      ...getScrollProgress(),
    });
  };

  const queueScroll = () => {
    if (scrollFrame !== null) {
      return;
    }

    scrollFrame = window.requestAnimationFrame(emitScroll);
  };

  const applyScroll = (payload) => {
    const maxLeft = Math.max(document.documentElement.scrollWidth - window.innerWidth, 0);
    const maxTop = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    const nextLeft = maxLeft > 0 ? payload.progressX * maxLeft : payload.left;
    const nextTop = maxTop > 0 ? payload.progressY * maxTop : payload.top;

    withSuppressedOutgoing(() => {
      window.scrollTo({ left: nextLeft, top: nextTop, behavior: 'auto' });
    });
  };

  const applyClick = (payload) => {
    const pointX = Math.max(0, Math.min(window.innerWidth - 1, payload.xRatio * window.innerWidth));
    const pointY = Math.max(0, Math.min(window.innerHeight - 1, payload.yRatio * window.innerHeight));

    let target = null;
    if (payload.selector) {
      target = document.querySelector(payload.selector);
    }

    if (!(target instanceof Element)) {
      target = document.elementFromPoint(pointX, pointY);
    }

    if (!(target instanceof HTMLElement)) {
      return;
    }

    withSuppressedOutgoing(() => {
      target.click();
    });
  };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== CHANNEL) {
      return;
    }

    if (data.type === TYPES.state) {
      enabled = Boolean(data.enabled);
      return;
    }

    if (data.type !== TYPES.apply || !data.payload) {
      return;
    }

    if (data.payload.kind === 'scroll') {
      applyScroll(data.payload);
      return;
    }

    if (data.payload.kind === 'click') {
      applyClick(data.payload);
    }
  });

  window.addEventListener('scroll', queueScroll, { passive: true });
  document.addEventListener('click', (event) => {
    if (!enabled || suppressOutgoing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    send(TYPES.event, {
      kind: 'click',
      selector: buildSelector(target),
      xRatio: window.innerWidth > 0 ? event.clientX / window.innerWidth : 0,
      yRatio: window.innerHeight > 0 ? event.clientY / window.innerHeight : 0,
    });
  }, true);

  send(TYPES.ready, { enabled });
})();`;