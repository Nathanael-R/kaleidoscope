import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Check, AlertCircle } from 'lucide-react';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface LiveReloadToggleProps {
  onReload?: () => void;
  currentUrl?: string;
  className?: string;
}

export default function LiveReloadToggle({ onReload, currentUrl, className }: LiveReloadToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [lastReload, setLastReload] = useState<Date | null>(null);
  const [watcherStarted, setWatcherStarted] = useState(false);

  const { isConnected } = useSocket({
    autoConnect: enabled,
    onReload: () => {
      console.log('Live reload triggered');
      setLastReload(new Date());
      onReload?.();
    },
  });

  // Start the file watcher on the server when enabled + connected
  useEffect(() => {
    if (!enabled || !isConnected || watcherStarted) return;

    // Determine watch path from the current URL (localhost projects)
    // Default to cwd if we can't determine the path
    const startWatcher = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/watcher/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'live-reload',
            paths: ['src/**/*', 'public/**/*', '*.html', '*.css', '*.js', '*.ts', '*.tsx', '*.jsx'],
          }),
        });
        if (res.ok) {
          setWatcherStarted(true);
          console.log('File watcher started on server');
        }
      } catch (err) {
        console.error('Failed to start file watcher:', err);
      }
    };

    startWatcher();
  }, [enabled, isConnected, watcherStarted]);

  // Stop the watcher when disabled
  useEffect(() => {
    if (enabled) return;
    if (!watcherStarted) return;

    const stopWatcher = async () => {
      try {
        await fetch(`${API_BASE}/api/watcher/stop/live-reload`, { method: 'DELETE' });
        setWatcherStarted(false);
        console.log('File watcher stopped');
      } catch {
        // ignore — server may already be down
      }
    };

    stopWatcher();
  }, [enabled, watcherStarted]);

  const handleToggle = () => {
    setEnabled(!enabled);
  };

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toggle Button */}
      <Button
        onClick={handleToggle}
        variant={enabled ? 'default' : 'outline'}
        className="w-full"
        data-testid="live-reload-toggle"
      >
        {enabled ? (
          <>
            {isConnected ? (
              <Wifi className="w-4 h-4 mr-2" />
            ) : (
              <WifiOff className="w-4 h-4 mr-2" />
            )}
            Live Reload: On
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Live Reload: Off
          </>
        )}
      </Button>

      {/* Status Display */}
      {enabled && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Status:
            </span>
            <div className="flex items-center gap-1">
              {isConnected ? (
                <>
                  <Check className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-green-600 dark:text-green-400">
                    Connected
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Connecting...
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Last Reload */}
          {lastReload && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Last reload:
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {timeAgo(lastReload)}
              </span>
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isConnected
              ? 'Watching for file changes...'
              : 'Connecting to file watcher...'}
          </div>
        </div>
      )}

      {/* Help Text */}
      {!enabled && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Auto-refresh previews when files change
        </div>
      )}
    </div>
  );
}
