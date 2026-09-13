import {
  MCP_APPS_PROTOCOL_VERSION,
  McpAppMethod,
  type HostCapabilities,
  type HostContext,
  type InitializeResult,
  type JsonRpcId,
  type JsonRpcMessage,
  parseInitializeResult,
  parseJsonRpcMessage,
} from '../shared/mcp-app-protocol.js';

interface MessageSource {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

interface MessageTarget {
  postMessage(message: JsonRpcMessage, targetOrigin: string): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeoutId: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export interface McpAppClientOptions {
  source: MessageSource;
  target: MessageTarget;
  expectedSource?: MessageEventSource | null;
  defaultTimeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AppInitialization {
  hostCapabilities: HostCapabilities;
  hostContext: HostContext;
}

type NotificationHandler = (params: unknown) => void;

export class McpRequestError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpRequestError';
  }
}

export class McpRequestTimeoutError extends Error {
  constructor(public readonly method: string, public readonly timeoutMs: number) {
    super(`${method} timed out after ${timeoutMs} ms.`);
    this.name = 'McpRequestTimeoutError';
  }
}

export class McpRequestCancelledError extends Error {
  constructor(message = 'The MCP request was cancelled.') {
    super(message);
    this.name = 'McpRequestCancelledError';
  }
}

export class McpAppClient {
  private nextRequestId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationHandlers = new Map<string, Set<NotificationHandler>>();
  private disposed = false;
  private teardownHandler: (() => void) | undefined;
  private readonly defaultTimeoutMs: number;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.options.expectedSource !== undefined && event.source !== this.options.expectedSource) return;
    const message = parseJsonRpcMessage(event.data);
    if (!message || this.disposed) return;
    this.handleMessage(message);
  };

  constructor(private readonly options: McpAppClientOptions) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    options.source.addEventListener('message', this.messageListener);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  async initialize(): Promise<AppInitialization> {
    const result = await this.request(McpAppMethod.initialize, {
      appInfo: { name: 'Kaleidoscope Results', version: '1.1.0' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    });
    const initialized: InitializeResult = parseInitializeResult(result);
    this.notify(McpAppMethod.initialized);
    return {
      hostCapabilities: initialized.hostCapabilities,
      hostContext: initialized.hostContext,
    };
  }

  callTool(name: string, args: Record<string, unknown>, options: RequestOptions = {}): Promise<unknown> {
    return this.request(McpAppMethod.callTool, { name, arguments: args }, options);
  }

  requestDisplayMode(mode: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request(McpAppMethod.requestDisplayMode, { mode }, options);
  }

  notify(method: string, params: unknown = {}): void {
    if (this.disposed) return;
    this.post({ jsonrpc: '2.0', method, params });
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    const handlers = this.notificationHandlers.get(method) ?? new Set<NotificationHandler>();
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.notificationHandlers.delete(method);
    };
  }

  onTeardown(handler: () => void): void {
    this.teardownHandler = handler;
  }

  request(method: string, params: unknown, options: RequestOptions = {}): Promise<unknown> {
    if (this.disposed) return Promise.reject(new McpRequestCancelledError('The MCP App client is disposed.'));
    if (options.signal?.aborted) return Promise.reject(new McpRequestCancelledError());

    const id = this.nextRequestId++;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.cancelPending(id, new McpRequestTimeoutError(method, timeoutMs), method);
      }, timeoutMs);
      const pending: PendingRequest = { resolve, reject, timeoutId, signal: options.signal };
      if (options.signal) {
        pending.abortListener = () => {
          this.cancelPending(id, new McpRequestCancelledError(), method);
        };
        options.signal.addEventListener('abort', pending.abortListener, { once: true });
      }
      this.pending.set(id, pending);
      this.post({ jsonrpc: '2.0', id, method, params });
    });
  }

  dispose(reason = 'The MCP App client was disposed.'): void {
    if (this.disposed) return;
    this.disposed = true;
    this.options.source.removeEventListener('message', this.messageListener);
    for (const [id, pending] of this.pending) {
      this.releasePending(id, pending);
      pending.reject(new McpRequestCancelledError(reason));
    }
    this.notificationHandlers.clear();
    this.teardownHandler = undefined;
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.releasePending(message.id, pending);
      if (message.error) {
        pending.reject(new McpRequestError(message.error.message, message.error.code, message.error.data));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method === McpAppMethod.teardown && message.id !== undefined) {
      this.teardownHandler?.();
      this.post({ jsonrpc: '2.0', id: message.id, result: {} });
      this.dispose('The MCP Apps host ended this view.');
      return;
    }

    if (!message.method) return;
    for (const handler of this.notificationHandlers.get(message.method) ?? []) {
      handler(message.params);
    }
  }

  private cancelPending(id: JsonRpcId, error: Error, method: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.releasePending(id, pending);
    this.notify(McpAppMethod.cancelled, { requestId: id, reason: error.message, method });
    pending.reject(error);
  }

  private releasePending(id: JsonRpcId, pending: PendingRequest): void {
    this.pending.delete(id);
    clearTimeout(pending.timeoutId);
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
  }

  private post(message: JsonRpcMessage): void {
    this.options.target.postMessage(message, '*');
  }
}
