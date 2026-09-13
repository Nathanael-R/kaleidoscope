import { MCP_APPS_PROTOCOL_VERSION, McpAppMethod, isRecord, parseJsonRpcMessage, type JsonRpcId, type JsonRpcMessage } from '../shared/mcp-app-protocol.js';
import type { HarnessScenario } from './scenario.js';

function required<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Harness element is missing: ${selector}`);
  return value;
}

export function startHarness(scenario: HarnessScenario): void {
  const elements = {
    frame: required<HTMLIFrameElement>('#app-frame'), canvasFrame: required<HTMLElement>('#canvas-frame'),
    resourceInput: required<HTMLInputElement>('#resource-input'), loadButton: required<HTMLButtonElement>('#load-button'),
    reloadButton: required<HTMLButtonElement>('#reload-button'), themeSelect: required<HTMLSelectElement>('#theme-select'),
    viewportSelect: required<HTMLSelectElement>('#viewport-select'), toolsToggle: required<HTMLInputElement>('#server-tools-toggle'),
    fullscreenToggle: required<HTMLInputElement>('#fullscreen-toggle'), clearLogButton: required<HTMLButtonElement>('#clear-log-button'),
    protocolLog: required<HTMLOListElement>('#protocol-log'), sessionStatus: required<HTMLElement>('#session-status'),
    appIdentity: required<HTMLElement>('#app-identity'), canvasSize: required<HTMLElement>('#canvas-size'), lastEvent: required<HTMLElement>('#last-event'),
  };
  const query = new URLSearchParams(window.location.search);
  let theme: 'light' | 'dark' = query.get('theme') === 'dark' ? 'dark' : 'light';
  let initialized = false;

  const hostVariables = (): Record<string, string> => theme === 'dark' ? {
    '--color-background-primary': '#17191c', '--color-background-secondary': '#202327',
    '--color-background-tertiary': '#111315', '--color-text-primary': '#f3f7f8',
    '--color-text-secondary': '#9da9af', '--color-border-primary': '#373d42',
  } : {};
  const displayModes = (): string[] => elements.fullscreenToggle.checked ? ['inline', 'fullscreen'] : ['inline'];
  const label = (message: JsonRpcMessage): string => message.method ?? (message.error ? `error ${message.error.code}` : `response ${String(message.id ?? '')}`);
  const log = (direction: 'inbound' | 'outbound', message: JsonRpcMessage): void => {
    const entry = document.createElement('li'); entry.className = `protocol-entry ${direction}`; entry.title = JSON.stringify(message, null, 2);
    const marker = document.createElement('span'); marker.className = 'direction'; marker.textContent = direction === 'inbound' ? '←' : '→';
    const details = document.createElement('span'), method = document.createElement('span'), time = document.createElement('time');
    method.className = 'method'; method.textContent = label(message); time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    details.append(method, time); entry.append(marker, details); elements.protocolLog.prepend(entry);
    while (elements.protocolLog.childElementCount > 80) elements.protocolLog.lastElementChild?.remove();
    elements.lastEvent.textContent = `${direction === 'inbound' ? 'App → Host' : 'Host → App'} · ${label(message)}`;
  };
  const send = (message: JsonRpcMessage): void => { log('outbound', message); elements.frame.contentWindow?.postMessage(message, '*'); };
  const notify = (method: string, params: unknown = {}): void => send({ jsonrpc: '2.0', method, params });
  const respond = (id: JsonRpcId, result: unknown): void => send({ jsonrpc: '2.0', id, result });
  const reject = (id: JsonRpcId, code: number, message: string): void => send({ jsonrpc: '2.0', id, error: { code, message } });
  const sendHostContext = (): void => notify(McpAppMethod.hostContextChanged, {
    theme, availableDisplayModes: displayModes(), displayMode: 'inline', styles: { variables: hostVariables() },
  });

  const handle = async (message: JsonRpcMessage): Promise<void> => {
    if (message.method === McpAppMethod.initialize && message.id !== undefined) {
      const appInfo = isRecord(message.params) && isRecord(message.params.appInfo) ? message.params.appInfo : {};
      elements.appIdentity.textContent = `${typeof appInfo.name === 'string' ? appInfo.name : 'Unnamed MCP App'}${typeof appInfo.version === 'string' ? ` ${appInfo.version}` : ''}`;
      respond(message.id, {
        protocolVersion: MCP_APPS_PROTOCOL_VERSION, hostInfo: { name: 'MCP Apps Reference Harness', version: '1.0.0' },
        hostCapabilities: { ...(elements.toolsToggle.checked ? { serverTools: {} } : {}), serverResources: {}, logging: {} },
        hostContext: { theme, availableDisplayModes: displayModes(), displayMode: 'inline', styles: { variables: hostVariables() } },
      });
    } else if (message.method === McpAppMethod.initialized) {
      initialized = true; elements.sessionStatus.textContent = 'Connected'; elements.sessionStatus.className = 'status-badge is-ready';
      notify(McpAppMethod.toolInput, { arguments: scenario.initialInput });
      notify(McpAppMethod.toolResult, scenario.createInitialResult());
    } else if (message.method === McpAppMethod.callTool && message.id !== undefined) {
      if (!elements.toolsToggle.checked) { reject(message.id, -32601, 'Server tools are disabled in this harness session.'); return; }
      const params = isRecord(message.params) ? message.params : {};
      const handler = typeof params.name === 'string' ? scenario.toolHandlers.get(params.name) : undefined;
      if (!handler) { reject(message.id, -32601, `No harness adapter is registered for ${String(params.name ?? 'this tool')}.`); return; }
      elements.sessionStatus.textContent = 'Tool running';
      try {
        const result = await handler(isRecord(params.arguments) ? params.arguments : {}); respond(message.id, result);
        elements.sessionStatus.textContent = 'Connected'; elements.sessionStatus.className = 'status-badge is-ready';
      } catch (error) { reject(message.id, -32603, error instanceof Error ? error.message : 'Tool adapter failed.'); }
    } else if (message.method === McpAppMethod.readResource && message.id !== undefined) {
      const uri = isRecord(message.params) ? message.params.uri : undefined;
      if (typeof uri !== 'string') { reject(message.id, -32602, 'resources/read requires a URI.'); return; }
      try {
        const response = await fetch(uri); if (!response.ok) throw new Error(`Resource request returned ${response.status}.`);
        respond(message.id, { contents: [{ uri, mimeType: response.headers.get('content-type') ?? 'text/plain', text: await response.text() }] });
      } catch (error) { reject(message.id, -32603, error instanceof Error ? error.message : 'Resource read failed.'); }
    } else if (message.method === McpAppMethod.ping && message.id !== undefined) respond(message.id, {});
    else if (message.method === McpAppMethod.requestDisplayMode && message.id !== undefined) {
      const requested = isRecord(message.params) ? message.params.mode : undefined;
      const accepted = requested === 'fullscreen' && elements.fullscreenToggle.checked;
      respond(message.id, { mode: accepted ? 'fullscreen' : 'inline' }); if (accepted) void elements.canvasFrame.requestFullscreen?.();
    } else if (message.method === McpAppMethod.cancelled) { elements.sessionStatus.textContent = 'Request cancelled'; }
    else if (message.id !== undefined && message.method) reject(message.id, -32601, `Unsupported method: ${message.method}`);
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== elements.frame.contentWindow) return;
    const message = parseJsonRpcMessage(event.data); if (!message) return; log('inbound', message); void handle(message);
  });
  const loadResource = (): void => {
    initialized = false; const resource = elements.resourceInput.value.trim() || './results.html'; elements.resourceInput.value = resource;
    elements.sessionStatus.textContent = 'Starting'; elements.sessionStatus.className = 'status-badge'; elements.appIdentity.textContent = 'Waiting for ui/initialize';
    const url = new URL(resource, window.location.href); url.searchParams.set('harnessReload', String(Date.now())); elements.frame.src = url.href;
  };
  const applyViewport = (): void => {
    const value = elements.viewportSelect.value; elements.canvasFrame.style.width = value === 'fluid' ? '100%' : `${value}px`;
    elements.canvasSize.textContent = value === 'fluid' ? 'Fluid width' : `${value} px canvas`;
  };
  elements.resourceInput.value = query.get('app') || './results.html'; elements.themeSelect.value = theme;
  elements.toolsToggle.checked = query.get('tools') !== '0'; elements.fullscreenToggle.checked = query.get('fullscreen') !== '0';
  elements.loadButton.addEventListener('click', loadResource); elements.reloadButton.addEventListener('click', loadResource);
  elements.resourceInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadResource(); });
  elements.themeSelect.addEventListener('change', () => { theme = elements.themeSelect.value === 'dark' ? 'dark' : 'light'; if (initialized) sendHostContext(); });
  elements.viewportSelect.addEventListener('change', applyViewport); elements.clearLogButton.addEventListener('click', () => elements.protocolLog.replaceChildren());
  applyViewport(); loadResource();
}
