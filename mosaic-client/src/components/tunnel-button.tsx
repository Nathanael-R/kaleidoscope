import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Link, Unlink, ExternalLink, Copy, Check } from 'lucide-react';
import { useTunnel } from '@/hooks/use-tunnel';
import { cn } from '@/lib/utils';

interface TunnelButtonProps {
  port: number;
  className?: string;
}

export default function TunnelButton({ port, className }: TunnelButtonProps) {
  const {
    isActive,
    tunnelUrl,
    isLoading,
    isCreating,
    isClosing,
    createError,
    createTunnel,
    closeTunnel,
  } = useTunnel(port);

  const [copied, setCopied] = useState(false);

  const handleToggle = async () => {
    if (isActive) {
      await closeTunnel(port);
    } else {
      try {
        await createTunnel({ port });
      } catch (error) {
        console.error('Failed to create tunnel:', error);
      }
    }
  };

  const handleCopy = () => {
    if (tunnelUrl) {
      navigator.clipboard.writeText(tunnelUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => {
    if (tunnelUrl) {
      window.open(tunnelUrl, '_blank');
    }
  };

  const isProcessing = isLoading || isCreating || isClosing;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Main Toggle Button */}
      <Button
        onClick={handleToggle}
        disabled={isProcessing}
        variant={isActive ? 'default' : 'outline'}
        className="w-full"
        data-testid="tunnel-toggle-button"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {isCreating ? 'Creating Tunnel...' : isClosing ? 'Closing...' : 'Loading...'}
          </>
        ) : isActive ? (
          <>
            <Link className="w-4 h-4 mr-2" />
            Tunnel Active
          </>
        ) : (
          <>
            <Unlink className="w-4 h-4 mr-2" />
            Enable Tunnel
          </>
        )}
      </Button>

      {/* Tunnel URL Display */}
      {isActive && tunnelUrl && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Public URL:
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-6 w-6 p-0"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleOpen}
                className="h-6 w-6 p-0"
                title="Open in new tab"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="text-xs font-mono bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 break-all">
            {tunnelUrl}
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Share this URL to preview your localhost on any device
          </div>
        </div>
      )}

      {/* Error Display */}
      {createError && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {createError instanceof Error ? createError.message : 'Failed to create tunnel'}
        </div>
      )}

      {/* Help Text */}
      {!isActive && !createError && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Create a public URL to share your localhost:{port}
        </div>
      )}
    </div>
  );
}
