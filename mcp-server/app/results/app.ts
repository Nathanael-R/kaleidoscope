import { ResultsController, asResultsClient } from './controller.js';
import { McpAppClient } from './mcp-app-client.js';
import { applyHostContext, getResultsElements, renderResults } from './render.js';

const elements = getResultsElements();
const client = new McpAppClient({ source: window, target: window.parent, expectedSource: window.parent });
const controller = new ResultsController({
  client: asResultsClient(client),
  render: (state) => { renderResults(elements, state); requestAnimationFrame(reportSize); },
  applyHostContext: (context) => applyHostContext(elements, context),
});
const uiLifetime = new AbortController();
const eventOptions = { signal: uiLifetime.signal };

function syncRequest(): void {
  controller.updateRequest({
    url: elements.urlInput.value.trim(), fullPage: elements.fullPageInput.checked,
    devices: [...elements.deviceOptions.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value),
  });
}

function recapture(): void {
  syncRequest();
  if (!elements.urlInput.checkValidity()) { elements.urlInput.reportValidity(); return; }
  void controller.recapture();
}

function reportSize(): void {
  controller.reportSize(window.innerWidth, document.documentElement.getBoundingClientRect().height);
}

elements.form.addEventListener('submit', (event) => { event.preventDefault(); recapture(); }, eventOptions);
elements.captureButton.addEventListener('click', recapture, eventOptions);
elements.urlInput.addEventListener('input', syncRequest, eventOptions);
elements.fullPageInput.addEventListener('change', syncRequest, eventOptions);
elements.deviceOptions.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement) controller.toggleCaptureDevice(event.target.value, event.target.checked);
}, eventOptions);
elements.tabs.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-device-id]') : null;
  if (target?.dataset.deviceId) controller.selectDevice(target.dataset.deviceId);
}, eventOptions);
elements.grid.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-device-id]') : null;
  if (target?.dataset.deviceId) { controller.selectDevice(target.dataset.deviceId); controller.setViewMode('focus'); }
}, eventOptions);
elements.refreshInterval.addEventListener('change', () => controller.setRefresh(Number(elements.refreshInterval.value)), eventOptions);
elements.focusViewButton.addEventListener('click', () => controller.setViewMode('focus'), eventOptions);
elements.gridViewButton.addEventListener('click', () => controller.setViewMode('grid'), eventOptions);
elements.fitButton.addEventListener('click', () => controller.toggleFit(), eventOptions);
elements.zoomOutButton.addEventListener('click', () => controller.zoomBy(-.25), eventOptions);
elements.zoomInButton.addEventListener('click', () => controller.zoomBy(.25), eventOptions);
elements.fullscreenButton.addEventListener('click', () => void controller.requestFullscreen(), eventOptions);

const resizeObserver = new ResizeObserver(() => requestAnimationFrame(reportSize));
resizeObserver.observe(document.body);
window.addEventListener('pagehide', () => { resizeObserver.disconnect(); uiLifetime.abort(); controller.dispose(); }, { once: true });
void controller.initialize().then(reportSize);
