import { useMutation } from '@tanstack/react-query';
import { kaleidoscopeFetch } from '@/lib/kaleidoscope-api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface SourceHint {
  file: string;
  line: number;
  code: string;
  suggestion: string;
}

export interface WebVitals {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  ttfb: number | null;
  domContentLoaded: number | null;
  loadTime: number | null;
  totalBytes: number;
  requestCount: number;
}

export interface PerformanceIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  element?: string;
  value?: string;
  target?: string;
  sourceHint?: SourceHint;
}

export interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

export interface DevicePerformanceResult {
  device: DeviceConfig;
  vitals: WebVitals;
  issues: PerformanceIssue[];
  score: number;
}

export interface AuditResponse {
  success: boolean;
  url: string;
  timestamp: string;
  results: DevicePerformanceResult[];
}

interface PerformanceAuditInput {
  url: string;
  devices: string[];
  sourceDir?: string;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function usePerformanceAudit() {
  const auditMutation = useMutation<AuditResponse, Error, PerformanceAuditInput>({
    mutationFn: async ({ url, devices, sourceDir }) => {
      const body: Record<string, unknown> = { url, devices };
      if (sourceDir) {
        body.sourceDir = sourceDir;
      }

      const response = await kaleidoscopeFetch(`${API_BASE}/api/performance/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Performance audit failed'));
      }

      return await response.json() as AuditResponse;
    },
  });

  return {
    runPerformanceAudit: auditMutation.mutateAsync,
    resetPerformanceAudit: auditMutation.reset,
    results: auditMutation.data?.results ?? null,
    error: auditMutation.error?.message ?? null,
    isAuditing: auditMutation.isPending,
  };
}