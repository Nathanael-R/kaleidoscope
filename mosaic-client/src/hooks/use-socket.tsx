import { useEffect, useRef, useState } from 'react';

const SSE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/events';

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

  // Store callbacks in refs to avoid reconnection on callback identity change
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onReloadRef = useRef(onReload);
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!autoConnect) return;

    const source = new EventSource(SSE_URL);
    sourceRef.current = source;

    source.addEventListener('connected', () => {
      console.log('SSE connected');
      setIsConnected(true);
      onConnectRef.current?.();
    });

    source.addEventListener('reload', (e) => {
      const data = JSON.parse(e.data);
      console.log('Reload triggered by:', data.path);
      onReloadRef.current?.();
    });

    source.onerror = () => {
      console.log('SSE disconnected');
      setIsConnected(false);
      onDisconnectRef.current?.();
    };

    return () => {
      source.close();
      setIsConnected(false);
    };
  }, [autoConnect]);

  return {
    isConnected,
  };
}
