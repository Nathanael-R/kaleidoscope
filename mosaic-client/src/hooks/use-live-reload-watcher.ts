import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { kaleidoscopeFetch } from '@/lib/kaleidoscope-api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WATCHER_PATHS = ['src/**/*', 'public/**/*', '*.html', '*.css', '*.js', '*.ts', '*.tsx', '*.jsx'];

async function startWatcher(watcherId: string, eventClientId: string) {
  const response = await kaleidoscopeFetch(`${API_BASE}/api/watcher/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: watcherId,
      eventClientId,
      paths: WATCHER_PATHS,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to start file watcher');
  }
}

async function stopWatcher(watcherId: string) {
  await kaleidoscopeFetch(`${API_BASE}/api/watcher/stop/${watcherId}`, {
    method: 'DELETE',
  });
}

interface UseLiveReloadWatcherOptions {
  enabled: boolean;
  isConnected: boolean;
  clientId?: string;
}

export function useLiveReloadWatcher({ enabled, isConnected, clientId }: UseLiveReloadWatcherOptions) {
  const [watcherStarted, setWatcherStarted] = useState(false);
  const watcherId = `live-reload-${clientId}`;

  const startWatcherMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) {
        throw new Error('Client id is required to start live reload');
      }

      await startWatcher(watcherId, clientId);
    },
    onSuccess: () => {
      setWatcherStarted(true);
    },
  });

  const stopWatcherMutation = useMutation({
    mutationFn: async () => {
      await stopWatcher(watcherId);
    },
    onSettled: () => {
      setWatcherStarted(false);
    },
  });

  useEffect(() => {
    if (!enabled || !isConnected || !clientId || watcherStarted || startWatcherMutation.isPending) {
      return;
    }

    startWatcherMutation.mutate();
  }, [clientId, enabled, isConnected, startWatcherMutation, watcherStarted]);

  useEffect(() => {
    if (enabled || !watcherStarted || stopWatcherMutation.isPending) {
      return;
    }

    stopWatcherMutation.mutate();
  }, [enabled, stopWatcherMutation, watcherStarted]);

  return {
    watcherStarted,
  };
}