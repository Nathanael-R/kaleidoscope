import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Check, AlertCircle } from 'lucide-react';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';

interface LiveReloadToggleProps {
  onReload?: () => void;
  className?: string;
}

export default function LiveReloadToggle({ onReload, className }: LiveReloadToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [lastReload, setLastReload] = useState<Date | null>(null);

  const { isConnected } = useSocket({
    autoConnect: enabled,
    onReload: () => {
      console.log('Live reload triggered');
      setLastReload(new Date());
      onReload?.();
    },
  });

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
