import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface TunnelInfo {
  url: string;
  provider: 'localtunnel' | 'ngrok' | 'cloudflared' | 'manual';
  port: number;
  status: 'active' | 'error' | 'closed';
  createdAt: Date;
}

export interface TunnelOptions {
  port: number;
  subdomain?: string;
  preferredProvider?: 'localtunnel' | 'ngrok' | 'cloudflared';
}

export function useTunnel(port?: number) {
  const queryClient = useQueryClient();
  const [currentPort, setCurrentPort] = useState(port);

  // Fetch tunnel info for a specific port
  const { data: tunnel, isLoading: isLoadingTunnel } = useQuery<TunnelInfo | null>({
    queryKey: ['tunnel', currentPort],
    queryFn: async () => {
      if (!currentPort) return null;

      try {
        const response = await fetch(`${API_URL}/api/tunnel/${currentPort}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to fetch tunnel');

        const data = await response.json();
        return data.tunnel;
      } catch (error) {
        console.error('Error fetching tunnel:', error);
        return null;
      }
    },
    enabled: !!currentPort,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Create tunnel mutation
  const createMutation = useMutation({
    mutationFn: async (options: TunnelOptions) => {
      const response = await fetch(`${API_URL}/api/tunnel/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create tunnel');
      }

      const data = await response.json();
      return data.tunnel as TunnelInfo;
    },
    onSuccess: (tunnel) => {
      queryClient.setQueryData(['tunnel', tunnel.port], tunnel);
      setCurrentPort(tunnel.port);
    },
  });

  // Close tunnel mutation
  const closeMutation = useMutation({
    mutationFn: async (port: number) => {
      const response = await fetch(`${API_URL}/api/tunnel/${port}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to close tunnel');
      }
    },
    onSuccess: (_, port) => {
      queryClient.setQueryData(['tunnel', port], null);
    },
  });

  // Auto-detect port and create tunnel
  const autoDetectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/tunnel/auto-detect`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-detect port');
      }

      const data = await response.json();
      return {
        tunnel: data.tunnel as TunnelInfo,
        detectedPort: data.detectedPort as number,
      };
    },
    onSuccess: ({ tunnel }) => {
      queryClient.setQueryData(['tunnel', tunnel.port], tunnel);
      setCurrentPort(tunnel.port);
    },
  });

  const createTunnel = useCallback(
    (options: TunnelOptions) => {
      return createMutation.mutateAsync(options);
    },
    [createMutation]
  );

  const closeTunnel = useCallback(
    (port: number) => {
      return closeMutation.mutateAsync(port);
    },
    [closeMutation]
  );

  const autoDetect = useCallback(() => {
    return autoDetectMutation.mutateAsync();
  }, [autoDetectMutation]);

  const isActive = tunnel?.status === 'active';
  const tunnelUrl = isActive ? tunnel.url : null;

  return {
    tunnel,
    isActive,
    tunnelUrl,
    isLoading: isLoadingTunnel,
    isCreating: createMutation.isPending,
    isClosing: closeMutation.isPending,
    isAutoDetecting: autoDetectMutation.isPending,
    createError: createMutation.error,
    closeError: closeMutation.error,
    createTunnel,
    closeTunnel,
    autoDetect,
    setPort: setCurrentPort,
  };
}
