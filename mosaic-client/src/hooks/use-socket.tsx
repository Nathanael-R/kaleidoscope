import { useEffect, useRef, useState } from 'react';

const SSE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/events';

function createSocketClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `socket-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface SocketHookOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReload?: () => void;
}

export function useSocket(options: SocketHookOptions = {}) {
  const {
    autoConnect = true,
    onConnect,
    onDisconnect,
    onReload,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const clientIdRef = useRef<string | null>(null);
  if (clientIdRef.current === null) {
    clientIdRef.current = createSocketClientId();
  }
  const clientId = clientIdRef.current;

  // Store callbacks in refs to avoid reconnection on callback identity change
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onReloadRef = useRef(onReload);
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!autoConnect) return;

    const source = new EventSource(`${SSE_URL}?clientId=${encodeURIComponent(clientId)}`);
    sourceRef.current = source;

    const handleConnected = () => {
      console.log('SSE connected');
      setIsConnected(true);
      onConnectRef.current?.();
    };

    const handleReload = (e: MessageEvent) => {
      JSON.parse(e.data);
      console.log('Reload triggered');
      onReloadRef.current?.();
    };

    source.addEventListener('connected', handleConnected);
    source.addEventListener('reload', handleReload);

    source.onerror = () => {
      console.log('SSE disconnected');
      setIsConnected(false);
      onDisconnectRef.current?.();
    };

    return () => {
      source.removeEventListener('connected', handleConnected);
      source.removeEventListener('reload', handleReload);
      source.close();
      setIsConnected(false);
    };
  }, [autoConnect, clientId]);

  return {
    clientId,
    isConnected,
  };
}
