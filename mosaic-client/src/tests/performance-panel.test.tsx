import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PerformancePanel from '@/components/performance-panel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeAuditResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        url: 'http://localhost:3000',
        timestamp: new Date().toISOString(),
        results: [
          {
            device: { id: 'iphone-14', name: 'iPhone 14', width: 390, height: 844, type: 'mobile' },
            vitals: {
              fcp: 820, lcp: 1400, cls: 0.02, ttfb: 120,
              domContentLoaded: 950, loadTime: 1800,
              totalBytes: 512000, requestCount: 22,
            },
            issues: [],
            score: 95,
          },
          {
            device: { id: 'ipad', name: 'iPad', width: 768, height: 1024, type: 'tablet' },
            vitals: {
              fcp: 900, lcp: 3200, cls: 0.15, ttfb: 200,
              domContentLoaded: 1100, loadTime: 3500,
              totalBytes: 1800000, requestCount: 45,
            },
            issues: [
              {
                type: 'lcp',
                severity: 'warning',
                message: 'LCP is 3200ms — needs improvement. LCP element: `img.hero-banner`.',
                element: 'img.hero-banner',
                value: '3200ms',
                target: '< 2500ms',
              },
              {
                type: 'cls',
                severity: 'warning',
                message: 'CLS is 0.15 — some layout shifting detected.',
                value: '0.15',
                target: '< 0.1',
              },
            ],
            score: 65,
          },
          {
            device: { id: 'desktop', name: 'Desktop HD', width: 1920, height: 1080, type: 'desktop' },
            vitals: {
              fcp: 3200, lcp: 4500, cls: 0.3, ttfb: 2000,
              domContentLoaded: 3500, loadTime: 6000,
              totalBytes: 5500000, requestCount: 80,
            },
            issues: [
              {
                type: 'lcp',
                severity: 'critical',
                message: 'Largest Contentful Paint is 4500ms.',
                value: '4500ms',
                target: '< 2500ms',
              },
            ],
            score: 25,
          },
        ],
        ...overrides,
      }),
  };
}

describe('PerformancePanel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders device selection and audit button', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    expect(screen.getByText('iPhone 14')).toBeDefined();
    expect(screen.getByText('iPad')).toBeDefined();
    expect(screen.getByText('Desktop HD')).toBeDefined();
    expect(screen.getByRole('button', { name: /run performance audit/i })).toBeDefined();
  });

  it('shows hint when no URL', () => {
    render(<PerformancePanel currentUrl="" />);

    expect(screen.getByText('Enter a URL first to run a performance audit.')).toBeDefined();
  });

  it('has 3 default selected devices', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    // 3 devices selected by default — button should be enabled
    const btn = screen.getByTestId('run-performance-audit');
    expect(btn).not.toBeDisabled();
  });

  it('toggles device selection', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByTestId('perf-device-toggle-iphone-14'));

    // After deselecting one of 3 defaults, there should be 2
    const btn = screen.getByTestId('run-performance-audit');
    expect(btn).not.toBeDisabled();
  });

  it('selects all devices', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText('All'));

    // All 8 devices selected
    const btn = screen.getByTestId('run-performance-audit');
    expect(btn).not.toBeDisabled();
  });

  it('clears all devices and disables button', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText('None'));

    const btn = screen.getByTestId('run-performance-audit');
    expect(btn).toBeDisabled();
  });

  it('calls performance API and renders results', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [requestUrl, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe('http://localhost:5000/api/performance/audit');
    expect(requestInit).toEqual(expect.objectContaining({ method: 'POST' }));

    const headers = new Headers(requestInit.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Kaleidoscope-Client')).toBe('mosaic-client');

    // Average score banner should appear
    await waitFor(() => {
      expect(screen.getByText('Average Score')).toBeDefined();
    });

    // Device names in results
    expect(screen.getByTestId('perf-device-iphone-14')).toBeDefined();
    expect(screen.getByTestId('perf-device-ipad')).toBeDefined();
    expect(screen.getByTestId('perf-device-desktop')).toBeDefined();
  });

  it('expands device result to show vitals and issues', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      expect(screen.getByTestId('perf-device-ipad')).toBeDefined();
    });

    // Expand iPad results
    fireEvent.click(screen.getByTestId('perf-device-ipad'));

    // Should show warning issues count
    await waitFor(() => {
      expect(screen.getByText(/LCP is 3200ms/)).toBeDefined();
    });
  });

  it('shows critical badge for poor-scoring devices', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      expect(screen.getByText('1 critical')).toBeDefined();
    });
  });

  it('shows error when audit API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Chromium not available' }),
    });

    render(<PerformancePanel currentUrl="http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      expect(screen.getByText('Chromium not available')).toBeDefined();
    });
  });

  it('uses proxyUrl when available', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" proxyUrl="http://localhost:5000/proxy/abc123/http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe('http://localhost:5000/proxy/abc123/http://localhost:3000');
    });
  });

  it('sends sourceDir when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    const input = screen.getByTestId('source-dir-input');
    fireEvent.change(input, { target: { value: '/home/user/my-project/src' } });
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sourceDir).toBe('/home/user/my-project/src');
    });
  });

  it('does not send sourceDir when empty', async () => {
    mockFetch.mockResolvedValueOnce(makeAuditResponse());

    render(<PerformancePanel currentUrl="http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sourceDir).toBeUndefined();
    });
  });

  it('renders source hints when present in results', async () => {
    const responseWithHints = {
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          url: 'http://localhost:3000',
          timestamp: new Date().toISOString(),
          results: [
            {
              device: { id: 'iphone-14', name: 'iPhone 14', width: 390, height: 844, type: 'mobile' },
              vitals: {
                fcp: 900, lcp: 3200, cls: 0.15, ttfb: 200,
                domContentLoaded: 1100, loadTime: 3500,
                totalBytes: 1800000, requestCount: 45,
              },
              issues: [
                {
                  type: 'cls',
                  severity: 'warning',
                  message: 'Image `img.hero` has no explicit width/height.',
                  element: 'img.hero',
                  sourceHint: {
                    file: 'src/components/Hero.tsx',
                    line: 42,
                    code: '<img src="/hero.jpg" className="hero" />',
                    suggestion: '<img width="auto" height="auto" src="/hero.jpg" className="hero" />  /* Add explicit width and height to prevent layout shift */',
                  },
                },
              ],
              score: 65,
            },
          ],
        }),
    };

    mockFetch.mockResolvedValueOnce(responseWithHints);

    render(<PerformancePanel currentUrl="http://localhost:3000" />);
    fireEvent.click(screen.getByTestId('run-performance-audit'));

    // Wait for results
    await waitFor(() => {
      expect(screen.getByTestId('perf-device-iphone-14')).toBeDefined();
    });

    // Should show "1 fix" badge
    expect(screen.getByText('1 fix')).toBeDefined();

    // Expand to see source hint
    fireEvent.click(screen.getByTestId('perf-device-iphone-14'));

    await waitFor(() => {
      // Should render the source hint block
      expect(screen.getByTestId('source-hint')).toBeDefined();
      // Should show file:line
      expect(screen.getByText('src/components/Hero.tsx:42')).toBeDefined();
      // Should show the current code
      expect(screen.getByText(/<img src="\/hero.jpg"/)).toBeDefined();
    });
  });

  it('renders source-dir helper text', () => {
    render(<PerformancePanel currentUrl="http://localhost:3000" />);

    expect(screen.getByText('Add your project path to see exact source lines and suggested code fixes.')).toBeDefined();
  });
});
