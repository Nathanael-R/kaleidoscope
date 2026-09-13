import type { HostContext } from '../shared/mcp-app-protocol.js';
import type { ResultsState } from './state.js';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Results App element is missing: ${selector}`);
  return element;
}

export interface ResultsElements {
  loading: HTMLElement; error: HTMLElement; errorMessage: HTMLElement; results: HTMLElement;
  summary: HTMLElement; status: HTMLElement; form: HTMLFormElement; urlInput: HTMLInputElement;
  captureButton: HTMLButtonElement; captureButtonLabel: HTMLElement; fullPageInput: HTMLInputElement;
  refreshInterval: HTMLSelectElement; deviceOptions: HTMLElement; feedback: HTMLElement;
  tabs: HTMLElement; count: HTMLElement; frame: HTMLElement; image: HTMLImageElement;
  placeholder: HTMLElement; grid: HTMLElement; overlay: HTMLElement; deviceName: HTMLElement;
  deviceSize: HTMLElement; capturePosition: HTMLElement; updatedAt: HTMLElement;
  fullscreenButton: HTMLButtonElement; focusViewButton: HTMLButtonElement; gridViewButton: HTMLButtonElement;
  zoomControls: HTMLElement; zoomOutButton: HTMLButtonElement; zoomInButton: HTMLButtonElement; fitButton: HTMLButtonElement;
}

export function getResultsElements(): ResultsElements {
  const captureButton = required<HTMLButtonElement>('#capture-button');
  const captureButtonLabel = captureButton.querySelector<HTMLElement>('span');
  if (!captureButtonLabel) throw new Error('Results App capture button label is missing.');
  return {
    loading: required('#loading-state'), error: required('#error-state'), errorMessage: required('#error-message'),
    results: required('#results'), summary: required('#capture-summary'), status: required('#connection-status'),
    form: required('#capture-form'), urlInput: required('#url-input'), captureButton, captureButtonLabel,
    fullPageInput: required('#full-page-input'), refreshInterval: required('#refresh-interval'),
    deviceOptions: required('#capture-device-options'), feedback: required('#capture-feedback'), tabs: required('#device-tabs'),
    count: required('#capture-count'), frame: required('#preview-frame'), image: required('#preview-image'),
    placeholder: required('#preview-placeholder'), grid: required('#grid-previews'), overlay: required('#capture-overlay'),
    deviceName: required('#device-name'), deviceSize: required('#device-size'), capturePosition: required('#capture-position'),
    updatedAt: required('#updated-at'), fullscreenButton: required('#fullscreen-button'),
    focusViewButton: required('#focus-view-button'), gridViewButton: required('#grid-view-button'),
    zoomControls: required('#zoom-controls'), zoomOutButton: required('#zoom-out-button'),
    zoomInButton: required('#zoom-in-button'), fitButton: required('#fit-button'),
  };
}

export function toDeviceLabel(device: string): string {
  return device.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ')
    .replace(/^Iphone\b/, 'iPhone').replace(/^Ipad\b/, 'iPad').replace(/\b4k\b/i, '4K');
}

function makePreview(imageUrl: string | undefined, fallback: string): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'grid-card-preview';
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    preview.append(image);
  } else preview.textContent = fallback;
  return preview;
}

export function renderResults(elements: ResultsElements, state: ResultsState): void {
  const hasCapture = state.capture !== null;
  elements.loading.hidden = state.lifecycle !== 'initializing';
  elements.error.hidden = state.error === null;
  elements.errorMessage.textContent = state.error ?? '';
  elements.results.hidden = !hasCapture;
  elements.status.textContent = state.canCallTools ? 'Live' : 'Result';
  elements.status.classList.toggle('is-live', state.canCallTools);
  elements.captureButton.disabled = state.capturing || !state.canCallTools;
  elements.captureButtonLabel.textContent = state.capturing ? 'Capturing…' : 'Recapture';
  elements.refreshInterval.disabled = !state.canCallTools;
  elements.overlay.hidden = !state.capturing;
  elements.feedback.textContent = state.feedback || (!state.canCallTools && state.lifecycle === 'ready'
    ? 'This host displays results but does not expose server tools to the app.' : '');
  elements.feedback.classList.toggle('is-error', state.error !== null);
  if (document.activeElement !== elements.urlInput) elements.urlInput.value = state.request.url;
  elements.fullPageInput.checked = state.request.fullPage;
  elements.refreshInterval.value = String(state.refreshSeconds);
  elements.focusViewButton.setAttribute('aria-pressed', String(state.viewMode === 'focus'));
  elements.gridViewButton.setAttribute('aria-pressed', String(state.viewMode === 'grid'));
  elements.frame.hidden = state.viewMode !== 'focus';
  elements.grid.hidden = state.viewMode !== 'grid';
  elements.zoomControls.hidden = state.viewMode !== 'focus';

  const capture = state.capture;
  if (!capture) return;
  const activeIndex = Math.max(0, capture.screenshots.findIndex((entry) => entry.deviceId === state.selectedDeviceId));
  const active = capture.screenshots[activeIndex];
  elements.summary.textContent = `${capture.count} capture${capture.count === 1 ? '' : 's'} · ${capture.url}`;
  elements.count.textContent = String(capture.count);
  elements.updatedAt.textContent = state.updatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—';

  elements.tabs.replaceChildren(...capture.screenshots.map((screenshot) => {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.className = `device-tab${screenshot.error ? ' has-error' : ''}`;
    tab.dataset.deviceId = screenshot.deviceId; tab.setAttribute('role', 'tab');
    const selected = screenshot.deviceId === state.selectedDeviceId;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    const label = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = toDeviceLabel(screenshot.device);
    const size = document.createElement('span'); size.textContent = screenshot.error ? 'Capture failed' : `${screenshot.width} × ${screenshot.height}`;
    label.append(name, size); tab.append(label); return tab;
  }));

  elements.deviceOptions.replaceChildren(...state.knownDeviceIds.map((deviceId) => {
    const label = document.createElement('label'); label.className = 'device-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = deviceId;
    input.checked = state.captureDeviceIds.includes(deviceId);
    const text = document.createElement('span'); text.textContent = toDeviceLabel(deviceId);
    label.append(input, text); return label;
  }));

  elements.grid.replaceChildren(...capture.screenshots.map((screenshot) => {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'grid-card';
    card.dataset.deviceId = screenshot.deviceId; card.setAttribute('aria-label', `Focus ${toDeviceLabel(screenshot.device)} preview`);
    const footer = document.createElement('footer');
    const name = document.createElement('strong'); name.textContent = toDeviceLabel(screenshot.device);
    const size = document.createElement('span'); size.textContent = `${screenshot.width} × ${screenshot.height}`;
    footer.append(name, size); card.append(makePreview(screenshot.imageUrl, screenshot.error ?? 'Preview unavailable'), footer); return card;
  }));

  if (!active) return;
  elements.deviceName.textContent = toDeviceLabel(active.device);
  elements.deviceSize.textContent = `${active.width} × ${active.height}`;
  elements.capturePosition.textContent = `${activeIndex + 1} of ${capture.screenshots.length}`;
  if (active.imageUrl) {
    elements.image.src = active.imageUrl; elements.image.alt = `${toDeviceLabel(active.device)} screenshot of ${capture.url}`;
    elements.image.hidden = false; elements.placeholder.hidden = true;
  } else {
    elements.image.removeAttribute('src'); elements.image.hidden = true; elements.placeholder.hidden = false;
    const message = elements.placeholder.querySelector('p');
    if (message) message.textContent = active.error ?? 'The screenshot remains available through the normal tool result.';
  }
  elements.frame.classList.toggle('is-actual', !state.fitPreview);
  if (state.fitPreview) {
    elements.frame.style.removeProperty('width'); elements.image.style.removeProperty('width'); elements.fitButton.textContent = 'Fit';
  } else {
    const width = Math.max(120, Math.round(active.width * state.zoom));
    elements.frame.style.width = `${width}px`; elements.image.style.width = `${width}px`; elements.fitButton.textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

const appliedHostVariables = new Set<string>();
export function applyHostContext(elements: ResultsElements, context: HostContext): void {
  if (context.theme) {
    document.documentElement.dataset.theme = context.theme;
    document.documentElement.style.colorScheme = context.theme;
  }
  if (context.styles?.variables) {
    for (const key of appliedHostVariables) document.documentElement.style.removeProperty(key);
    appliedHostVariables.clear();
    for (const [key, value] of Object.entries(context.styles.variables)) {
      if (value !== undefined) { document.documentElement.style.setProperty(key, value); appliedHostVariables.add(key); }
    }
  }
  if (context.styles?.css?.fonts) {
    let style = document.querySelector<HTMLStyleElement>('#mcp-host-fonts');
    if (!style) { style = document.createElement('style'); style.id = 'mcp-host-fonts'; document.head.append(style); }
    style.textContent = context.styles.css.fonts;
  }
  elements.fullscreenButton.hidden = !(context.availableDisplayModes?.includes('fullscreen') ?? false) || context.displayMode === 'fullscreen';
}
