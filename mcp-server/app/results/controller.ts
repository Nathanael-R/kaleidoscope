import { McpAppMethod, isRecord, parseHostContext, type HostContext } from '../shared/mcp-app-protocol.js';
import { parseCaptureToolResult } from './capture-result.js';
import type { AppInitialization, McpAppClient, RequestOptions } from './mcp-app-client.js';
import { createInitialState, reduceResultsState, type CaptureRequest, type ResultsAction, type ResultsState, type ViewMode } from './state.js';

export interface ResultsClient {
  initialize(): Promise<AppInitialization>;
  callTool(name: string, args: Record<string, unknown>, options?: RequestOptions): Promise<unknown>;
  requestDisplayMode(mode: string, options?: RequestOptions): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  onNotification(method: string, handler: (params: unknown) => void): () => void;
  onTeardown(handler: () => void): void;
  dispose(reason?: string): void;
}

export interface ResultsControllerOptions {
  client: ResultsClient;
  render(state: ResultsState): void;
  applyHostContext(context: HostContext): void;
  now?: () => Date;
  requestTimeoutMs?: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The host rejected the capture request.';
}

function parseToolInput(value: unknown): Partial<CaptureRequest> {
  if (!isRecord(value) || !isRecord(value.arguments)) return {};
  const args = value.arguments;
  return {
    ...(typeof args.url === 'string' ? { url: args.url } : {}),
    ...(typeof args.full_page === 'boolean' ? { fullPage: args.full_page } : {}),
    ...(Array.isArray(args.devices) && args.devices.every((item) => typeof item === 'string') ? { devices: args.devices } : {}),
  };
}

export class ResultsController {
  private state = createInitialState();
  private readonly unsubscribers: Array<() => void> = [];
  private requestAbort: AbortController | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastReportedSize = '';

  constructor(private readonly options: ResultsControllerOptions) {
    const client = options.client;
    this.unsubscribers.push(
      client.onNotification(McpAppMethod.toolInput, (params) => this.dispatch({ type: 'toolInput', request: parseToolInput(params) })),
      client.onNotification(McpAppMethod.toolResult, (params) => this.acceptToolResult(params, 'host')),
      client.onNotification(McpAppMethod.toolCancelled, () => this.dispatch({ type: 'captureFailed', message: 'The screenshot capture was cancelled.' })),
      client.onNotification(McpAppMethod.hostContextChanged, (params) => {
        options.applyHostContext(parseHostContext(params));
      }),
    );
    client.onTeardown(() => this.dispose(false));
    this.render();
  }

  get snapshot(): ResultsState { return this.state; }

  async initialize(): Promise<void> {
    try {
      const initialized = await this.options.client.initialize();
      if (this.state.lifecycle === 'disposed') return;
      this.options.applyHostContext(initialized.hostContext);
      this.dispatch({ type: 'initialized', canCallTools: Boolean(initialized.hostCapabilities.serverTools) });
    } catch (error) {
      if (this.state.lifecycle !== 'disposed') this.dispatch({ type: 'initializationFailed', message: messageOf(error) });
    }
  }

  updateRequest(request: Partial<CaptureRequest>): void { this.dispatch({ type: 'toolInput', request }); }
  selectDevice(deviceId: string): void { this.dispatch({ type: 'selectDevice', deviceId }); }
  toggleCaptureDevice(deviceId: string, checked: boolean): void { this.dispatch({ type: 'toggleCaptureDevice', deviceId, checked }); }
  setViewMode(mode: ViewMode): void { this.dispatch({ type: 'setViewMode', mode }); }
  toggleFit(): void { this.dispatch({ type: 'toggleFit' }); }
  zoomBy(amount: number): void { this.dispatch({ type: 'zoomBy', amount }); }

  setRefresh(seconds: number): void {
    this.dispatch({ type: 'setRefresh', seconds });
    this.scheduleRefresh();
  }

  async requestFullscreen(): Promise<void> {
    try {
      const result = await this.options.client.requestDisplayMode('fullscreen');
      if (isRecord(result) && typeof result.mode === 'string') this.options.applyHostContext({ displayMode: result.mode });
    } catch { /* A host may decline fullscreen without affecting the result. */ }
  }

  async recapture(source: 'manual' | 'auto' = 'manual'): Promise<boolean> {
    if (this.state.lifecycle !== 'ready' || !this.state.canCallTools || this.state.capturing) return false;
    const request = this.state.request;
    if (!request.url || request.devices.length === 0) {
      this.dispatch({ type: 'captureFailed', message: request.devices.length === 0 ? 'Select at least one capture device.' : 'Enter a valid page URL.' });
      return false;
    }
    this.clearRefresh();
    const generation = ++this.generation;
    this.requestAbort = new AbortController();
    this.dispatch({ type: 'captureStarted' });
    try {
      const result = await this.options.client.callTool('capture_screenshots', {
        url: request.url, devices: request.devices, full_page: request.fullPage,
      }, { signal: this.requestAbort.signal, timeoutMs: this.options.requestTimeoutMs ?? 30_000 });
      if (generation !== this.generation) return false;
      this.acceptToolResult(result, source);
      return this.state.error === null;
    } catch (error) {
      if (generation === this.generation) {
        this.dispatch({ type: 'captureFailed', message: messageOf(error) });
      }
      return false;
    } finally {
      if (generation === this.generation) this.requestAbort = null;
      this.scheduleRefresh();
    }
  }

  reportSize(width: number, height: number): void {
    const rounded = { width: Math.ceil(width), height: Math.ceil(height) };
    const key = `${rounded.width}x${rounded.height}`;
    if (key === this.lastReportedSize) return;
    this.lastReportedSize = key;
    this.options.client.notify(McpAppMethod.sizeChanged, rounded);
  }

  dispose(disposeClient = true): void {
    if (this.state.lifecycle === 'disposed') return;
    ++this.generation;
    this.requestAbort?.abort(); this.requestAbort = null;
    this.clearRefresh();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.dispatch({ type: 'disposed' });
    if (disposeClient) this.options.client.dispose();
  }

  private acceptToolResult(value: unknown, source: 'manual' | 'auto' | 'host'): void {
    try {
      this.dispatch({ type: 'captureSucceeded', capture: parseCaptureToolResult(value), source, now: (this.options.now ?? (() => new Date()))() });
    } catch (error) {
      this.dispatch({ type: 'captureFailed', message: messageOf(error) });
    }
  }

  private dispatch(action: ResultsAction): void {
    this.state = reduceResultsState(this.state, action);
    this.render();
  }

  private render(): void { this.options.render(this.state); }
  private clearRefresh(): void { if (this.refreshTimer) clearTimeout(this.refreshTimer); this.refreshTimer = null; }
  private scheduleRefresh(): void {
    this.clearRefresh();
    if (!this.state.refreshSeconds || !this.state.canCallTools || this.state.lifecycle !== 'ready') return;
    this.refreshTimer = setTimeout(() => void this.recapture('auto'), this.state.refreshSeconds * 1000);
  }
}

export function asResultsClient(client: McpAppClient): ResultsClient { return client; }
