import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs to avoid reconnection on callback identity change
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onReloadRef = useRef(onReload);
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!autoConnect) return;

    // Create socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      onConnectRef.current?.();
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      onDisconnectRef.current?.();
    });

    // Reload event from file watcher
    socket.on('reload', (data: { path: string; timestamp: number }) => {
      console.log('Reload triggered by:', data.path);
      onReloadRef.current?.();
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [autoConnect]);

  const emit = (event: string, data?: any) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data);
    }
  };

  const on = (event: string, handler: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  };

  const off = (event: string, handler?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    off,
  };
}
