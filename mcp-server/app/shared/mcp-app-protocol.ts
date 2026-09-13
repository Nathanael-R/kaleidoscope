export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';

export const McpAppMethod = {
  initialize: 'ui/initialize',
  initialized: 'ui/notifications/initialized',
  toolInput: 'ui/notifications/tool-input',
  toolResult: 'ui/notifications/tool-result',
  toolCancelled: 'ui/notifications/tool-cancelled',
  hostContextChanged: 'ui/notifications/host-context-changed',
  sizeChanged: 'ui/notifications/size-changed',
  requestDisplayMode: 'ui/request-display-mode',
  teardown: 'ui/resource-teardown',
  callTool: 'tools/call',
  readResource: 'resources/read',
  cancelled: 'notifications/cancelled',
  ping: 'ping',
} as const;

export type JsonRpcId = number | string;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

export interface HostContext {
  theme?: 'light' | 'dark';
  availableDisplayModes?: string[];
  displayMode?: string;
  styles?: {
    variables?: Record<string, string | undefined>;
    css?: { fonts?: string };
  };
}

export interface HostCapabilities {
  serverTools?: { listChanged?: boolean };
  serverResources?: { listChanged?: boolean };
  logging?: Record<string, never>;
}

export interface InitializeResult {
  protocolVersion: string;
  hostCapabilities: HostCapabilities;
  hostContext: HostContext;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseJsonRpcMessage(value: unknown): JsonRpcMessage | null {
  if (!isRecord(value) || value.jsonrpc !== '2.0') return null;
  if (value.id !== undefined && typeof value.id !== 'number' && typeof value.id !== 'string') return null;
  if (value.method !== undefined && typeof value.method !== 'string') return null;
  if (value.error !== undefined) {
    if (!isRecord(value.error) || typeof value.error.code !== 'number' || typeof value.error.message !== 'string') {
      return null;
    }
  }
  return value as unknown as JsonRpcMessage;
}

export function parseInitializeResult(value: unknown): InitializeResult {
  if (!isRecord(value) || typeof value.protocolVersion !== 'string') {
    throw new Error('The MCP Apps host returned an invalid initialization result.');
  }
  const hostCapabilities = parseHostCapabilities(value.hostCapabilities);
  const hostContext = parseHostContext(value.hostContext);
  return { protocolVersion: value.protocolVersion, hostCapabilities, hostContext };
}

export function parseHostCapabilities(value: unknown): HostCapabilities {
  if (!isRecord(value)) return {};
  return {
    ...(isRecord(value.serverTools) ? { serverTools: { ...(typeof value.serverTools.listChanged === 'boolean' ? { listChanged: value.serverTools.listChanged } : {}) } } : {}),
    ...(isRecord(value.serverResources) ? { serverResources: { ...(typeof value.serverResources.listChanged === 'boolean' ? { listChanged: value.serverResources.listChanged } : {}) } } : {}),
    ...(isRecord(value.logging) ? { logging: {} } : {}),
  };
}

export function parseHostContext(value: unknown): HostContext {
  if (!isRecord(value)) return {};
  const variables = isRecord(value.styles) && isRecord(value.styles.variables)
    ? Object.fromEntries(Object.entries(value.styles.variables).filter((entry): entry is [string, string | undefined] => entry[1] === undefined || typeof entry[1] === 'string'))
    : undefined;
  const fonts = isRecord(value.styles) && isRecord(value.styles.css) && typeof value.styles.css.fonts === 'string'
    ? value.styles.css.fonts : undefined;
  return {
    ...(value.theme === 'light' || value.theme === 'dark' ? { theme: value.theme } : {}),
    ...(Array.isArray(value.availableDisplayModes) && value.availableDisplayModes.every((mode) => typeof mode === 'string')
      ? { availableDisplayModes: value.availableDisplayModes } : {}),
    ...(typeof value.displayMode === 'string' ? { displayMode: value.displayMode } : {}),
    ...(variables || fonts ? { styles: { ...(variables ? { variables } : {}), ...(fonts ? { css: { fonts } } : {}) } } : {}),
  };
}
