import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kaleidoscopeFetch } from '@/lib/kaleidoscope-api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const proxyStatusQueryKey = (sessionId: string) => ['proxy-session-status', sessionId] as const;

export interface AuthCookie {
  name: string;
  value: string;
}

export interface AuthHeader {
  name: string;
  value: string;
}

export interface ProxySession {
  id: string;
  proxyUrl: string;
  targetUrl: string;
  authFailed: boolean;
}

interface ProxyStatus {
  authFailed: boolean;
}

interface ProxySessionBase {
  id: string;
  proxyUrl: string;
  targetUrl: string;
}

interface CreateProxySessionInput {
  url: string;
  cookies: AuthCookie[];
  headers: AuthHeader[];
}

interface MockRouteInput {
  pattern: string;
  response: string;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchProxyStatus(sessionId: string): Promise<ProxyStatus> {
  const response = await kaleidoscopeFetch(`${API_URL}/api/proxy/session/${sessionId}/status`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to check proxy status'));
  }

  return await response.json() as ProxyStatus;
}

async function probeProxy(proxyUrl: string) {
  await fetch(`${proxyUrl}/`, { redirect: 'manual' });
}

export function useAuthProxy() {
  const queryClient = useQueryClient();
  const [sessionBase, setSessionBase] = useState<ProxySessionBase | null>(null);

  const statusQuery = useQuery({
    queryKey: sessionBase ? proxyStatusQueryKey(sessionBase.id) : ['proxy-session-status', 'idle'],
    queryFn: () => fetchProxyStatus(sessionBase!.id),
    enabled: !!sessionBase,
    staleTime: 5_000,
  });

  const createSessionMutation = useMutation({
    mutationFn: async ({ url, cookies, headers }: CreateProxySessionInput) => {
      const response = await kaleidoscopeFetch(`${API_URL}/api/proxy/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cookies, headers }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to create proxy session'));
      }

      const data = await response.json() as {
        session: { id: string; proxyUrl: string; targetUrl: string };
      };

      const proxyUrl = `${API_URL}${data.session.proxyUrl}`;
      await probeProxy(proxyUrl);
      const status = await fetchProxyStatus(data.session.id);

      return {
        session: {
          id: data.session.id,
          proxyUrl,
          targetUrl: data.session.targetUrl,
          authFailed: status.authFailed,
        } satisfies ProxySession,
        status,
      };
    },
    onSuccess: ({ session, status }) => {
      queryClient.setQueryData(proxyStatusQueryKey(session.id), status);
      setSessionBase({
        id: session.id,
        proxyUrl: session.proxyUrl,
        targetUrl: session.targetUrl,
      });
    },
  });

  const injectMocksMutation = useMutation({
    mutationFn: async (mockRoutes: MockRouteInput[]) => {
      if (!sessionBase) {
        throw new Error('Proxy session is required');
      }

      const mocks = mockRoutes.map((mockRoute) => {
        let parsedResponse: unknown;
        try {
          parsedResponse = JSON.parse(mockRoute.response);
        } catch {
          parsedResponse = mockRoute.response;
        }

        return {
          pattern: mockRoute.pattern,
          response: parsedResponse,
        };
      });

      const response = await kaleidoscopeFetch(`${API_URL}/api/proxy/session/${sessionBase.id}/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mocks }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to inject mock data'));
      }

      return await response.json() as { mockCount: number };
    },
  });

  const clearMocksMutation = useMutation({
    mutationFn: async () => {
      if (!sessionBase) {
        throw new Error('Proxy session is required');
      }

      const response = await kaleidoscopeFetch(`${API_URL}/api/proxy/session/${sessionBase.id}/mock`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to clear mock data'));
      }
    },
  });

  const proxySession = useMemo(() => {
    if (!sessionBase) {
      return null;
    }

    return {
      ...sessionBase,
      authFailed: statusQuery.data?.authFailed ?? false,
    } satisfies ProxySession;
  }, [sessionBase, statusQuery.data]);

  const createProxySession = async (input: CreateProxySessionInput) => {
    const result = await createSessionMutation.mutateAsync(input);
    return result.session;
  };

  const refreshProxyStatus = async () => {
    if (!sessionBase) {
      return null;
    }

    const result = await statusQuery.refetch();
    if (result.error) {
      throw result.error;
    }

    return result.data ?? null;
  };

  const injectMocks = async (mockRoutes: MockRouteInput[]) => {
    return await injectMocksMutation.mutateAsync(mockRoutes);
  };

  const clearMocks = async () => {
    await clearMocksMutation.mutateAsync();
  };

  const clearProxySession = () => {
    if (sessionBase) {
      queryClient.removeQueries({ queryKey: proxyStatusQueryKey(sessionBase.id) });
    }

    setSessionBase(null);
    createSessionMutation.reset();
    injectMocksMutation.reset();
    clearMocksMutation.reset();
  };

  return {
    proxySession,
    createProxySession,
    refreshProxyStatus,
    injectMocks,
    clearMocks,
    clearProxySession,
    isCreatingProxy: createSessionMutation.isPending,
    isCheckingStatus: statusQuery.isFetching,
    isInjectingMocks: injectMocksMutation.isPending,
  };
}
